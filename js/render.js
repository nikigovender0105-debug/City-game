/* ==========================================================
   render.js – Isometrische 3D-Darstellung

   Projektion: klassische 2:1-Isometrie. Die Kamera blickt schräg
   von oben auf die Stadt, so dass von jedem Körper das Dach und
   genau zwei Seitenwände sichtbar sind – die zur +x-Achse (rechts
   im Bild) und die zur +y-Achse (links im Bild).

       Bildschirm-X = (tx - ty) * TILE_W/2
       Bildschirm-Y = (tx + ty) * TILE_H/2 - Höhe

   Eine Kachel (tx,ty) belegt das Einheitsquadrat
   [tx, tx+1] x [ty, ty+1]. Seine vier Ecken heißen:
       N = (tx,   ty  )   oben
       E = (tx+1, ty  )   rechts
       S = (tx+1, ty+1)   unten
       W = (tx,   ty+1)   links
   ========================================================== */

const Render = (() => {

  let canvas, ctx, dpr = 1;
  let vw = 0, vh = 0;                 // CSS-Pixel des Sichtbereichs

  /* Zeichenauflösung
     Die Darstellung ist füllratengebunden: die Zahl der Bildpunkte
     bestimmt die Bildrate, nicht die Zahl der Zeichenbefehle. Auf
     Geräten mit hoher Pixeldichte wird deshalb gedrosselt und bei
     Bedarf zusätzlich automatisch nachgeregelt. Die Bedienoberfläche
     bleibt davon unberührt, sie ist gewöhnliches HTML. */
  const MAX_PX = 2.0;                 // Obergrenze für den Zeichenmaßstab
  let devicePR = 1;
  let quality = 1;                    // 0,5 bis 1,0 – wird selbst geregelt
  let drawMs = 0, drawN = 0;
  let pendingScale = false;           // Umstellung erst zu Beginn des nächsten Bildes

  /* Kamera: tx/ty ist die Kachelkoordinate in der Bildmitte.
     Bewusst in Kacheln und nicht in Bildschirmpixeln – sonst würde jede
     Zoomänderung den Blickpunkt mitverschieben. */
  const cam = { tx:0, ty:0, zoom:1 };

  const opts = { grid:true, overlay:false };

  let shade = null;                   // Farbvariation je Kachel
  let ghost = null;                   // Bauvorschau
  let selected = null;

  /* Pro Bild berechnete Maße */
  let hw = 24, hh = 12, sz = 13;      // halbe Kachelbreite/-höhe, Stockwerkhöhe
  let spinT = 0;                      // Drehwinkel der Rotoren

  /* ---------------------------------------------------------
     Initialisierung
     --------------------------------------------------------- */
  function init(cv){
    canvas = cv;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    buildShade();
    centerOn(Game.state.start[0], Game.state.start[1]);
  }

  function buildShade(){
    const n = Game.W * Game.H;
    shade = new Float32Array(n);
    for(let i = 0; i < n; i++){
      const h = Math.sin(i * 12.9898 + 7.233) * 43758.5453;
      shade[i] = (h - Math.floor(h)) * 0.14 - 0.07;
    }
  }

  function resize(){
    devicePR = window.devicePixelRatio || 1;
    const r = canvas.parentElement.getBoundingClientRect();
    vw = r.width; vh = r.height;
    applyScale();
    clampCam();
  }

  function applyScale(){
    dpr = Math.max(0.75, Math.min(devicePR, MAX_PX) * quality);
    canvas.width  = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    glyphCache.clear();
    badgeCache.clear();
    metrics();
  }

  /* Nachregelung: dauert das Zeichnen zu lang, sinkt die Auflösung;
     ist Luft nach oben, steigt sie wieder. */
  /* Gemessen wird der Abstand zwischen zwei Bildern, nicht die Dauer des
     Zeichenaufrufs: der Browser schiebt die eigentliche Rasterung hinter
     den Aufruf, weshalb eine Messung dort viel zu kurz ausfällt. */
  const FRAME_OK = 17.5;              // flüssig, wenn der Abstand darunter liegt
  const FRAME_SLOW = 21;              // darüber wird nachgeregelt
  let lastFrame = 0, goodRuns = 0;

  function autoQuality(){
    const now = performance.now();
    const gap = now - lastFrame;
    lastFrame = now;
    if(gap <= 0 || gap > 100) return;   // Pausen und Sprünge übergehen

    drawMs += gap; drawN++;
    if(drawN < 40) return;
    const avg = drawMs / drawN;
    drawMs = 0; drawN = 0;

    if(avg > FRAME_SLOW && quality > 0.5){
      // Der Aufwand wächst mit dem Quadrat des Maßstabs – die Wurzel aus
      // dem Verhältnis trifft das Ziel in einem Schritt.
      quality = Math.max(0.5, quality * Math.max(0.55, Math.sqrt(FRAME_OK / avg)));
      pendingScale = true;
      goodRuns = 0;
    }else if(avg < FRAME_OK){
      // Nur nach längerer Ruhe wieder anheben, sonst pendelt die Regelung
      if(++goodRuns >= 10 && quality < 1){
        quality = Math.min(1, quality * 1.12);
        pendingScale = true;
        goodRuns = 0;
      }
    }else goodRuns = 0;
  }

  function metrics(){
    hw = CONFIG.TILE_W * cam.zoom / 2;
    hh = CONFIG.TILE_H * cam.zoom / 2;
    sz = CONFIG.STOREY * cam.zoom;
  }

  /* ---------------------------------------------------------
     Projektion
     --------------------------------------------------------- */
  /* Kachelkoordinate + Höhe (in Stockwerken) -> Bildschirmpunkt */
  function P(tx, ty, storeys){
    const dx = tx - cam.tx, dy = ty - cam.ty;
    return [
      (dx - dy) * hw + vw / 2,
      (dx + dy) * hh + vh / 2 - (storeys || 0) * sz
    ];
  }

  /* Bildschirmpunkt -> Kachelkoordinate auf der Bodenebene */
  function screenToTileF(sx, sy){
    const wx = sx - vw / 2, wy = sy - vh / 2;
    return [ cam.tx + (wx / hw + wy / hh) / 2,
             cam.ty + (wy / hh - wx / hw) / 2 ];
  }
  function screenToTile(sx, sy){
    const t = screenToTileF(sx, sy);
    return [Math.floor(t[0]), Math.floor(t[1])];
  }
  /* Mittelpunkt einer Kachel auf dem Boden */
  function tileToScreen(tx, ty){ return P(tx + 0.5, ty + 0.5, 0); }

  /* ---------------------------------------------------------
     Kamera
     --------------------------------------------------------- */
  function centerOn(tx, ty){
    cam.tx = tx; cam.ty = ty;
    clampCam();
  }

  function clampCam(){
    const m = 6;   // wie weit man über den Rand hinausschauen darf
    cam.tx = Math.max(-m, Math.min(Game.W + m, cam.tx));
    cam.ty = Math.max(-m, Math.min(Game.H + m, cam.ty));
  }

  /* Bildschirmverschiebung in Kachelverschiebung umrechnen */
  function pan(dx, dy){
    cam.tx -= (dx / hw + dy / hh) / 2;
    cam.ty -= (dy / hh - dx / hw) / 2;
    clampCam();
  }

  function zoomAt(sx, sy, factor){
    const before = screenToTileF(sx, sy);
    cam.zoom = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, cam.zoom * factor));
    metrics();
    const after = screenToTileF(sx, sy);
    cam.tx += before[0] - after[0];
    cam.ty += before[1] - after[1];
    clampCam();
  }

  /* Zoom setzen, ohne den Blickpunkt zu verlieren */
  function setZoom(z){
    cam.zoom = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, z));
    metrics();
  }

  /* ---------------------------------------------------------
     Farben
     --------------------------------------------------------- */
  const colCache = new Map();

  /* Liefert wieder Hex zurück, damit sich Tönungen verschachteln lassen –
     tint(tint(c, a), b) muss funktionieren, sonst entstehen ungültige
     Farbwerte und die Fläche behält stillschweigend die vorige Farbe. */
  function tint(col, amt){
    const key = col + '|' + amt;
    const hit = colCache.get(key);
    if(hit) return hit;

    let r, g, b;
    if(col.charCodeAt(0) === 35){            // '#rrggbb'
      const n = parseInt(col.slice(1), 16);
      r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    }else{                                    // 'rgb(r,g,b)'
      const m = col.match(/(\d+)\D+(\d+)\D+(\d+)/);
      if(m){ r = +m[1]; g = +m[2]; b = +m[3]; }
      else { r = g = b = 128; }
    }

    if(amt >= 0){
      r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
    }else{
      r *= (1 + amt); g *= (1 + amt); b *= (1 + amt);
    }
    const h = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    const c = '#' + h(r) + h(g) + h(b);
    colCache.set(key, c);
    return c;
  }

  /* Licht kommt von links oben: linke Wand hell, rechte Wand dunkel */
  const FACE_TOP   =  0.20;
  const FACE_LEFT  = -0.10;
  const FACE_RIGHT = -0.34;

  /* ---------------------------------------------------------
     Glyph-Zwischenspeicher

     Emoji sind Farbgrafiken; sie bei jedem Bild neu zu rastern kostet
     ein Vielfaches einer gefüllten Fläche. Jedes Zeichen wird deshalb
     einmal je Größenstufe in eine kleine Hilfsfläche gezeichnet und
     danach nur noch kopiert.
     --------------------------------------------------------- */
  const glyphCache = new Map();

  function glyph(ch, px){
    const size = Math.max(8, Math.round(px / 4) * 4);      // Größenstufen à 4 px
    const key = ch + '|' + size;
    let g = glyphCache.get(key);
    if(g) return g;

    const pad = Math.ceil(size * 0.25);
    const dim = size + pad * 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(dim * dpr);
    const c2 = cv.getContext('2d');
    c2.scale(dpr, dpr);
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    c2.fillStyle = '#f2f5fa';
    c2.font = `${size}px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    c2.fillText(ch, dim / 2, dim / 2);

    g = { cv, dim };
    if(glyphCache.size > 400) glyphCache.clear();
    glyphCache.set(key, g);
    return g;
  }

  function drawGlyph(ch, px, cx, cy, alpha){
    const g = glyph(ch, px);
    if(alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(g.cv, cx - g.dim / 2, cy - g.dim / 2, g.dim, g.dim);
    if(alpha !== undefined) ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------
     Zeichen-Grundbausteine
     --------------------------------------------------------- */
  function poly(pts, color, seam){
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for(let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if(seam){                       // schließt Haarrisse zwischen Flächen
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /* Raute in einen vorhandenen Pfad legen – erlaubt das Bündeln vieler
     Kacheln in einen einzigen Füllvorgang. Aneinandergrenzende Rauten im
     selben Pfad verschmelzen, dadurch entstehen auch keine Haarrisse. */
  function addDiamond(path, x0, y0, x1, y1, z){
    const a = P(x0,y0,z), b = P(x1,y0,z), c = P(x1,y1,z), d = P(x0,y1,z);
    path.moveTo(a[0], a[1]);
    path.lineTo(b[0], b[1]);
    path.lineTo(c[0], c[1]);
    path.lineTo(d[0], d[1]);
    path.closePath();
  }

  function addQuad(path, p0, p1, p2, p3){
    path.moveTo(p0[0], p0[1]);
    path.lineTo(p1[0], p1[1]);
    path.lineTo(p2[0], p2[1]);
    path.lineTo(p3[0], p3[1]);
    path.closePath();
  }

  /* Waagerechte Raute (Boden, Dach, Deckel) */
  function diamond(x0, y0, x1, y1, z, color, seam){
    poly([P(x0,y0,z), P(x1,y0,z), P(x1,y1,z), P(x0,y1,z)], color, seam);
  }

  /* Quader zwischen zwei Höhen. Gezeichnet werden nur die beiden
     sichtbaren Wände und das Dach. */
  function box(x0, y0, x1, y1, zBot, zTop, base, roofColor){
    const Et = P(x1,y0,zTop), St = P(x1,y1,zTop), Wt = P(x0,y1,zTop), Nt = P(x0,y0,zTop);
    const Eb = P(x1,y0,zBot), Sb = P(x1,y1,zBot), Wb = P(x0,y1,zBot);

    poly([Et, St, Sb, Eb], tint(base, FACE_RIGHT), true);   // Wand zur +x-Seite
    poly([Wt, St, Sb, Wb], tint(base, FACE_LEFT),  true);   // Wand zur +y-Seite
    poly([Nt, Et, St, Wt], roofColor || tint(base, FACE_TOP), true);
  }

  /* Satteldach über der Grundfläche */
  function gableRoof(x0, y0, x1, y1, zTop, ridge, color){
    const wide = (x1 - x0) >= (y1 - y0);
    const light = tint(color, 0.12), dark = tint(color, -0.22);
    if(wide){
      const ym = (y0 + y1) / 2, zr = zTop + ridge;
      // hintere Schräge (von oben sichtbar), dann vordere, dann Giebel
      poly([P(x0,y0,zTop), P(x1,y0,zTop), P(x1,ym,zr), P(x0,ym,zr)], light, true);
      poly([P(x0,y1,zTop), P(x1,y1,zTop), P(x1,ym,zr), P(x0,ym,zr)], dark, true);
      poly([P(x1,y0,zTop), P(x1,y1,zTop), P(x1,ym,zr)], tint(color, -0.34), true);
    }else{
      const xm = (x0 + x1) / 2, zr = zTop + ridge;
      poly([P(x0,y0,zTop), P(x0,y1,zTop), P(xm,y1,zr), P(xm,y0,zr)], light, true);
      poly([P(x1,y0,zTop), P(x1,y1,zTop), P(xm,y1,zr), P(xm,y0,zr)], dark, true);
      poly([P(x0,y1,zTop), P(x1,y1,zTop), P(xm,y1,zr)], tint(color, -0.34), true);
    }
  }

  /* Stehender Zylinder, genähert über die Silhouette */
  function cylinder(cx, cy, r, zBot, zTop, base){
    const top = P(cx, cy, zTop), bot = P(cx, cy, zBot);
    const rx = r * hw * 2, ry = r * hh * 2;

    // Mantel
    const g = ctx.createLinearGradient(top[0] - rx, 0, top[0] + rx, 0);
    g.addColorStop(0,   tint(base, -0.06));
    g.addColorStop(0.45,tint(base,  0.06));
    g.addColorStop(1,   tint(base, -0.38));
    ctx.beginPath();
    ctx.moveTo(top[0] - rx, top[1]);
    ctx.lineTo(top[0] - rx, bot[1]);
    ctx.ellipse(bot[0], bot[1], rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(top[0] + rx, top[1]);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();

    // Deckel
    ctx.beginPath();
    ctx.ellipse(top[0], top[1], rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = tint(base, FACE_TOP);
    ctx.fill();
  }

  /* Kegel (Baumkrone) */
  function cone(cx, cy, r, zBot, zTop, base){
    const apex = P(cx, cy, zTop), b = P(cx, cy, zBot);
    const rx = r * hw * 2, ry = r * hh * 2;
    ctx.beginPath();
    ctx.ellipse(b[0], b[1], rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = tint(base, -0.24);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(b[0] - rx, b[1]);
    ctx.lineTo(apex[0], apex[1]);
    ctx.lineTo(b[0] + rx, b[1]);
    ctx.closePath();
    ctx.fillStyle = tint(base, -0.28);
    ctx.fill();
    ctx.beginPath();                    // beleuchtete linke Hälfte
    ctx.moveTo(b[0] - rx, b[1]);
    ctx.lineTo(apex[0], apex[1]);
    ctx.lineTo(b[0], b[1] + ry * 0.7);
    ctx.closePath();
    ctx.fillStyle = tint(base, 0.10);
    ctx.fill();
  }

  /* ---------------------------------------------------------
     Hauptzeichnung
     --------------------------------------------------------- */
  function draw(){
    // Eine Größenänderung leert den Zeichenpuffer. Sie muss deshalb hier
    // stehen und nicht in der Regelung selbst – sonst bliebe genau ein
    // Bild lang der leere Hintergrund sichtbar.
    if(pendingScale){ pendingScale = false; applyScale(); }

    metrics();
    const st = Game.state;
    spinT = (performance.now() / 1000) * 1.6 * (st.speed > 0 ? 1 : 0.15);

    ctx.fillStyle = '#0d1116';
    ctx.fillRect(0, 0, vw, vh);

    // Sichtbarer Kachelbereich: Bildschirmecken zurückrechnen
    const c = [screenToTileF(0,0), screenToTileF(vw,0),
               screenToTileF(0,vh), screenToTileF(vw,vh)];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for(const [a,b] of c){
      if(a < x0) x0 = a; if(a > x1) x1 = a;
      if(b < y0) y0 = b; if(b > y1) y1 = b;
    }
    // Zuschlag für hohe Bauten, die von weiter unten ins Bild ragen
    const tall = Math.ceil((12 * sz) / (2 * hh)) + 2;
    x0 = Math.max(0, Math.floor(x0) - 1);
    y0 = Math.max(0, Math.floor(y0) - 1);
    x1 = Math.min(Game.W - 1, Math.ceil(x1) + tall);
    y1 = Math.min(Game.H - 1, Math.ceil(y1) + tall);

    drawGround(st, x0, y0, x1, y1);
    drawObjects(st, x0, y0, x1, y1);
    if(ghost) drawGhost();
    drawSelection();

    autoQuality();
  }

  /* ---------------- Bodenebene ---------------- */
  function drawGround(st, x0, y0, x1, y1){
    const flats = [];                 // Straßen, Brücken und Wasserflächen
    const batch = new Map();          // Farbe -> Pfad
    const gridPath = (opts.grid && hh > 6) ? new Path2D() : null;
    const wavePath = (hh > 7) ? new Path2D() : null;

    const path = col => {
      let pp = batch.get(col);
      if(!pp){ pp = new Path2D(); batch.set(col, pp); }
      return pp;
    };

    for(let ty = y0; ty <= y1; ty++){
      for(let tx = x0; tx <= x1; tx++){
        const i = ty * Game.W + tx;
        const p = P(tx, ty, 0);
        if(p[0] < -hw * 2 || p[0] > vw + hw * 2 || p[1] < -hh * 2 || p[1] > vh + hh * 4) continue;

        const t = st.tiles[i];
        const bi = st.occ[i];
        const b  = bi >= 0 ? st.buildings[bi] : null;

        // Farbstufen grob quantisieren, damit möglichst viele Kacheln
        // im selben Pfad landen
        const baseCol = (t === T.TREE) ? TERRAIN_COLORS[T.GRASS] : TERRAIN_COLORS[t];
        addDiamond(path(tint(baseCol, Math.round(shade[i] * 24) / 24)), tx, ty, tx + 1, ty + 1, 0);

        if(t === T.WATER && wavePath && ((tx * 7 + ty * 3) % 5 === 0)){
          const w = P(tx + 0.5, ty + 0.5, 0);
          wavePath.moveTo(w[0] - hw * 0.35, w[1]);
          wavePath.lineTo(w[0], w[1] - hh * 0.22);
          wavePath.lineTo(w[0] + hw * 0.35, w[1]);
        }

        if(gridPath && t !== T.WATER && !b)
          addDiamond(gridPath, tx, ty, tx + 1, ty + 1, 0);

        if(b && b.x === tx && b.y === ty){
          const sh = modelOf(b.type).shape;
          if(sh === 'road' || sh === 'water') flats.push(b);
        }
      }
    }

    for(const [col, pp] of batch){ ctx.fillStyle = col; ctx.fill(pp); }

    if(gridPath){
      ctx.strokeStyle = 'rgba(0,0,0,.10)';
      ctx.lineWidth = 1;
      ctx.stroke(gridPath);
    }
    if(wavePath){
      ctx.strokeStyle = 'rgba(255,255,255,.13)';
      ctx.lineWidth = Math.max(1, hh * 0.13);
      ctx.stroke(wavePath);
    }

    // Fahrbahnflächen ebenfalls gebündelt, Markierungen in einem Zug
    if(flats.length){
      const surf = new Map();
      const marks = new Path2D();
      const bridges = [];
      for(const b of flats){
        const mdl = modelOf(b.type);
        if(mdl.shape === 'water'){ drawWaterPatch(b); continue; }
        if(mdl.bridge){ bridges.push(b); continue; }
        const col = tint(BUILDINGS[b.type].color, 0.02);
        let pp = surf.get(col);
        if(!pp){ pp = new Path2D(); surf.set(col, pp); }
        addDiamond(pp, b.x, b.y, b.x + 1, b.y + 1, 0.015);
        if(hh >= 6) roadMarks(marks, b, 0.015);
      }
      for(const [col, pp] of surf){ ctx.fillStyle = col; ctx.fill(pp); }
      for(const b of bridges) drawRoad(b, modelOf(b.type));

      if(hh >= 6){
        ctx.strokeStyle = 'rgba(240,240,240,.5)';
        ctx.lineWidth = Math.max(1, hh * 0.11);
        ctx.setLineDash([hh * 0.5, hh * 0.4]);
        ctx.stroke(marks);
        ctx.setLineDash([]);
      }
    }
  }

  /* Mittelstriche einer Fahrbahn in einen Sammelpfad legen */
  function roadMarks(path, b, z){
    const tx = b.x, ty = b.y;
    const n = Game.isRoadTile(tx, ty - 1), s2 = Game.isRoadTile(tx, ty + 1);
    const w = Game.isRoadTile(tx - 1, ty), e = Game.isRoadTile(tx + 1, ty);
    if(n || s2){
      const a = P(tx + 0.5, ty, z), c = P(tx + 0.5, ty + 1, z);
      path.moveTo(a[0], a[1]); path.lineTo(c[0], c[1]);
    }
    if(w || e){
      const a = P(tx, ty + 0.5, z), c = P(tx + 1, ty + 0.5, z);
      path.moveTo(a[0], a[1]); path.lineTo(c[0], c[1]);
    }
    if(!n && !s2 && !w && !e){
      const a = P(tx + 0.3, ty + 0.5, z), c = P(tx + 0.7, ty + 0.5, z);
      path.moveTo(a[0], a[1]); path.lineTo(c[0], c[1]);
    }
  }

  /* Fahrbahn mit Anschlüssen und Mittelstrich */
  function drawRoad(b, mdl){
    const d = BUILDINGS[b.type];
    const z = mdl.bridge ? 0.06 : 0.015;
    const tx = b.x, ty = b.y;

    if(mdl.bridge){
      // Brückenkörper mit sichtbarer Unterkante
      box(tx + 0.04, ty + 0.04, tx + 0.96, ty + 0.96, -0.12, z, '#6b7280');
    }else{
      diamond(tx, ty, tx + 1, ty + 1, z, tint(d.color, 0.02), true);
    }

    if(hh < 6) return;
    const n = Game.isRoadTile(tx, ty - 1), s = Game.isRoadTile(tx, ty + 1);
    const w = Game.isRoadTile(tx - 1, ty), e = Game.isRoadTile(tx + 1, ty);

    ctx.strokeStyle = 'rgba(240,240,240,.5)';
    ctx.lineWidth = Math.max(1, hh * 0.11);
    ctx.setLineDash([hh * 0.5, hh * 0.4]);
    ctx.beginPath();
    if(n || s){
      const a = P(tx + 0.5, ty, z), bb = P(tx + 0.5, ty + 1, z);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(bb[0], bb[1]);
    }
    if(w || e){
      const a = P(tx, ty + 0.5, z), bb = P(tx + 1, ty + 0.5, z);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(bb[0], bb[1]);
    }
    if(!n && !s && !w && !e){
      const a = P(tx + 0.3, ty + 0.5, z), bb = P(tx + 0.7, ty + 0.5, z);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(bb[0], bb[1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    if(mdl.bridge && hh > 8){        // Geländer
      ctx.strokeStyle = 'rgba(225,230,240,.75)';
      ctx.lineWidth = Math.max(1, hh * 0.09);
      for(const yy of [0.06, 0.94]){
        const a = P(tx + 0.06, ty + yy, z + 0.14), bb = P(tx + 0.94, ty + yy, z + 0.14);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(bb[0], bb[1]); ctx.stroke();
      }
    }
  }

  function drawWaterPatch(b){
    diamond(b.x, b.y, b.x + b.w, b.y + b.h, -0.06, '#2a6ba5', true);
    diamond(b.x + 0.1, b.y + 0.1, b.x + b.w - 0.1, b.y + b.h - 0.1, -0.05, '#3a86c4', true);
  }

  /* ---------------- Aufbauten ---------------- */
  function drawObjects(st, x0, y0, x1, y1){
    const items = [];

    // Bäume und Felsen auf freien Kacheln
    for(let ty = y0; ty <= y1; ty++){
      for(let tx = x0; tx <= x1; tx++){
        const i = ty * Game.W + tx;
        if(st.occ[i] !== -1) continue;
        const t = st.tiles[i];
        if(t !== T.TREE && t !== T.ROCK) continue;
        items.push({ d: tx + ty + 2, nat: t, x: tx, y: ty });
      }
    }

    // Gebäude, die in den Sichtbereich ragen
    for(const b of st.buildings){
      if(!b) continue;
      if(b.x > x1 || b.y > y1 || b.x + b.w <= x0 || b.y + b.h <= y0) continue;
      const mdl = modelOf(b.type);
      if(mdl.shape === 'road' || mdl.shape === 'water') continue;
      items.push({ d: b.x + b.w + b.y + b.h, b, mdl });
    }

    // Maleralgorithmus: von hinten nach vorn
    items.sort((a, b2) => a.d - b2.d);

    for(const it of items){
      if(it.nat !== undefined){
        if(it.nat === T.TREE) natureTree(it.x, it.y);
        else natureRock(it.x, it.y);
      }else{
        drawBuilding(it.b, it.mdl);
      }
    }
  }

  function natureTree(tx, ty){
    const cx = tx + 0.5, cy = ty + 0.5;
    box(cx - 0.07, cy - 0.07, cx + 0.07, cy + 0.07, 0, 0.35, '#6b4a2c');
    cone(cx, cy, 0.30, 0.28, 1.55, '#3f7a34');
  }

  function natureRock(tx, ty){
    const cx = tx + 0.5, cy = ty + 0.5;
    box(cx - 0.24, cy - 0.24, cx + 0.24, cy + 0.24, 0, 0.35, '#78756c');
    box(cx - 0.14, cy - 0.14, cx + 0.16, cy + 0.16, 0.33, 0.6, '#8a877d');
  }

  /* ---------------- Gebäudekörper ---------------- */
  function drawBuilding(b, mdl){
    const d = BUILDINGS[b.type];
    const ins = mdl.inset !== undefined ? mdl.inset : 0.12;
    const x0 = b.x + ins, y0 = b.y + ins;
    const x1 = b.x + b.w - ins, y1 = b.y + b.h - ins;
    const h = mdl.h || 1.5;
    const base = d.color || '#8a8a8a';

    switch(mdl.shape){
      case 'gable':
        box(x0, y0, x1, y1, 0, h, base);
        gableRoof(x0 - 0.04, y0 - 0.04, x1 + 0.04, y1 + 0.04, h,
                  Math.min(0.75, 0.30 + Math.min(b.w, b.h) * 0.16),
                  mdl.roofC || tint(base, -0.32));
        windows(b, x0, y0, x1, y1, h, base);
        break;

      case 'tower': {
        box(x0, y0, x1, y1, 0, h, base);
        const k = 0.10;
        box(x0 + k, y0 + k, x1 - k, y1 - k, h, h + 0.45, tint(base, -0.12));
        windows(b, x0, y0, x1, y1, h, base);
        break;
      }

      case 'slab':
        box(x0, y0, x1, y1, 0, h, base);
        break;

      case 'wind': {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        box(cx - 0.20, cy - 0.20, cx + 0.20, cy + 0.20, 0, 0.18, '#c9ced6');
        cylinder(cx, cy, 0.075, 0.1, h, '#e7ebf1');
        const hub = P(cx, cy, h);
        const R = Math.max(6, hw * 0.85);
        // Jedes Rad dreht mit eigener Phase, sonst wirkt der Park wie ein Standbild
        const spin = spinT * (0.55 + ((b.x * 7 + b.y * 3) % 5) * 0.09)
                   + (b.x * 1.7 + b.y * 2.3);
        ctx.strokeStyle = '#f2f5f9';
        ctx.lineWidth = Math.max(1.6, hw * 0.075);
        ctx.lineCap = 'round';
        for(let k = 0; k < 3; k++){
          const a = spin + k * (Math.PI * 2 / 3);
          ctx.beginPath();
          ctx.moveTo(hub[0], hub[1]);
          ctx.lineTo(hub[0] + Math.cos(a) * R, hub[1] + Math.sin(a) * R * 0.92);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.arc(hub[0], hub[1], Math.max(2, hw * 0.09), 0, Math.PI * 2);
        ctx.fillStyle = '#aab2bd'; ctx.fill();
        break;
      }

      case 'solar': {
        diamond(b.x + 0.05, b.y + 0.05, b.x + b.w - 0.05, b.y + b.h - 0.05, 0.02, '#4b4f57', true);
        const rows = Math.max(1, Math.round(b.h * 1.6));
        for(let r = 0; r < rows; r++){
          const yy = b.y + 0.18 + r * ((b.h - 0.3) / rows);
          const yb = yy + (b.h - 0.3) / rows * 0.55;
          // geneigtes Paneel: hinten hoch, vorn tief
          poly([P(b.x + 0.12, yy, 0.62), P(b.x + b.w - 0.12, yy, 0.62),
                P(b.x + b.w - 0.12, yb, 0.16), P(b.x + 0.12, yb, 0.16)],
               '#2c4a8c', true);
          poly([P(b.x + 0.12, yb, 0.16), P(b.x + b.w - 0.12, yb, 0.16),
                P(b.x + b.w - 0.12, yb, 0), P(b.x + 0.12, yb, 0)],
               '#7c828d', true);
        }
        break;
      }

      case 'chimney': {
        box(x0, y0, x1, y1, 0, h, base);
        const cx = b.x + b.w * 0.30, cy = b.y + b.h * 0.32;
        cylinder(cx, cy, 0.16, h - 0.2, h + 2.6, '#8d8981');
        cylinder(cx + 0.75, cy + 0.2, 0.14, h - 0.2, h + 2.1, '#8d8981');
        // Rauchwolken
        ctx.fillStyle = 'rgba(210,214,220,.42)';
        for(let k = 0; k < 3; k++){
          const p = P(cx, cy - k * 0.28, h + 2.7 + k * 0.55);
          ctx.beginPath();
          ctx.ellipse(p[0], p[1], hw * (0.22 + k * 0.09), hh * (0.3 + k * 0.12), 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'tank': {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        for(const [ox, oy] of [[-0.26,-0.26],[0.26,-0.26],[-0.26,0.26],[0.26,0.26]])
          box(cx + ox - 0.05, cy + oy - 0.05, cx + ox + 0.05, cy + oy + 0.05, 0, h - 1.1, '#9aa4b0');
        cylinder(cx, cy, 0.40, h - 1.2, h, base);
        cone(cx, cy, 0.40, h, h + 0.7, tint(base, -0.1));
        break;
      }

      case 'tanks': {
        const r = Math.min(b.w, b.h) * 0.24;
        for(let i = 0; i < 2; i++){
          for(let j = 0; j < 2; j++){
            const cx = b.x + b.w * (0.28 + i * 0.44);
            const cy = b.y + b.h * (0.30 + j * 0.42);
            cylinder(cx, cy, r, 0, h, '#8b9a90');
            const p = P(cx, cy, h);
            ctx.beginPath();
            ctx.ellipse(p[0], p[1], r * hw * 1.5, r * hh * 1.5, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#4e7f9c'; ctx.fill();
          }
        }
        break;
      }

      case 'dam': {
        box(b.x + 0.05, b.y + 0.05, b.x + b.w - 0.05, b.y + b.h * 0.55, 0, h, '#7d8894');
        box(b.x + 0.05, b.y + b.h * 0.55, b.x + b.w - 0.05, b.y + b.h - 0.05, 0, h * 0.5, base);
        for(let k = 0; k < 3; k++){
          const cx = b.x + 0.55 + k * ((b.w - 1.1) / 2);
          box(cx - 0.16, b.y + b.h * 0.58, cx + 0.16, b.y + b.h - 0.12, h * 0.5, h * 0.5 + 0.35, '#5f9ec4');
        }
        break;
      }

      case 'pool': {
        box(b.x + 0.06, b.y + 0.06, b.x + b.w - 0.06, b.y + b.h - 0.06, 0, h, '#dfe4ea');
        diamond(b.x + 0.24, b.y + 0.24, b.x + b.w - 0.24, b.y + b.h - 0.24, h - 0.18, '#3fa8d8', true);
        if(hh > 7){
          ctx.strokeStyle = 'rgba(255,255,255,.45)';
          ctx.lineWidth = Math.max(1, hh * 0.09);
          for(let k = 1; k < Math.max(2, b.w); k++){
            const a = P(b.x + 0.24 + k * ((b.w - 0.48) / Math.max(2, b.w)), b.y + 0.3, h - 0.17);
            const c2 = P(b.x + 0.24 + k * ((b.w - 0.48) / Math.max(2, b.w)), b.y + b.h - 0.3, h - 0.17);
            ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c2[0], c2[1]); ctx.stroke();
          }
        }
        break;
      }

      case 'field': {
        box(b.x + 0.05, b.y + 0.05, b.x + b.w - 0.05, b.y + b.h - 0.05, 0, h, mdl.ground || base);
        if(mdl.lines && hh > 7){
          ctx.strokeStyle = 'rgba(255,255,255,.5)';
          ctx.lineWidth = Math.max(1, hh * 0.08);
          const r = [P(b.x+0.2,b.y+0.2,h), P(b.x+b.w-0.2,b.y+0.2,h),
                     P(b.x+b.w-0.2,b.y+b.h-0.2,h), P(b.x+0.2,b.y+b.h-0.2,h)];
          ctx.beginPath();
          ctx.moveTo(r[0][0],r[0][1]);
          for(let i=1;i<4;i++) ctx.lineTo(r[i][0],r[i][1]);
          ctx.closePath(); ctx.stroke();
        }
        if(b.type === 'spielplatz' && hh > 7){
          const cx = b.x + b.w/2, cy = b.y + b.h/2;
          box(cx-0.30, cy-0.06, cx-0.22, cy+0.06, h, h+0.75, '#c05a3e');   // Rutsche
          poly([P(cx-0.26,cy,h+0.75), P(cx+0.32,cy+0.16,h+0.05),
                P(cx+0.32,cy-0.02,h+0.05), P(cx-0.26,cy-0.14,h+0.75)], '#e0a24a', true);
        }
        break;
      }

      case 'park': {
        box(b.x + 0.05, b.y + 0.05, b.x + b.w - 0.05, b.y + b.h - 0.05, 0, h, '#4c8c44');
        // Wege
        poly([P(b.x+0.05, b.y+b.h/2-0.14, h+0.01), P(b.x+b.w-0.05, b.y+b.h/2-0.14, h+0.01),
              P(b.x+b.w-0.05, b.y+b.h/2+0.14, h+0.01), P(b.x+0.05, b.y+b.h/2+0.14, h+0.01)],
             '#b6a281', true);
        const spots = [[0.3,0.28],[0.75,0.3],[0.28,0.76],[0.72,0.74]];
        for(const [fx, fy] of spots){
          const cx = b.x + b.w * fx, cy = b.y + b.h * fy;
          box(cx-0.05, cy-0.05, cx+0.05, cy+0.05, h, h+0.28, '#6b4a2c');
          cone(cx, cy, 0.22, h+0.22, h+1.25, '#3f7a34');
        }
        break;
      }

      case 'lot': {
        box(b.x + 0.05, b.y + 0.05, b.x + b.w - 0.05, b.y + b.h - 0.05, 0, h, '#55575c');
        if(hh > 7){
          const cols = ['#c05a4e','#4e7fc0','#d0c05a','#8a8f97'];
          let k = 0;
          for(let i = 0; i < b.w; i++){
            for(let j = 0; j < b.h; j++){
              const cx = b.x + i + 0.5, cy = b.y + j + 0.5;
              box(cx-0.26, cy-0.16, cx+0.26, cy+0.16, h, h+0.30, cols[(k++) % 4]);
            }
          }
        }
        break;
      }

      case 'shelter': {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        diamond(b.x+0.1, b.y+0.1, b.x+b.w-0.1, b.y+b.h-0.1, 0.02, '#9aa0aa', true);
        for(const [ox, oy] of [[-0.3,-0.22],[0.3,-0.22],[-0.3,0.22],[0.3,0.22]])
          box(cx+ox-0.04, cy+oy-0.04, cx+ox+0.04, cy+oy+0.04, 0, h, '#6d747f');
        box(cx-0.40, cy-0.30, cx+0.40, cy+0.30, h, h+0.14, base);
        break;
      }

      case 'stalls': {
        for(let i = 0; i < b.w; i++){
          for(let j = 0; j < b.h; j++){
            const cx = b.x + i + 0.5, cy = b.y + j + 0.5;
            box(cx-0.32, cy-0.26, cx+0.32, cy+0.26, 0, h - 0.35, '#c3b48a');
            gableRoof(cx-0.40, cy-0.34, cx+0.40, cy+0.34, h-0.35, 0.3,
                      (i + j) % 2 ? '#c0503f' : base);
          }
        }
        break;
      }

      case 'fountain': {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        cylinder(cx, cy, 0.36, 0, 0.28, '#b9bfc7');
        const p = P(cx, cy, 0.26);
        ctx.beginPath();
        ctx.ellipse(p[0], p[1], 0.30 * hw * 2, 0.30 * hh * 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#4fa3d1'; ctx.fill();
        cylinder(cx, cy, 0.09, 0.26, h, '#cdd3da');
        ctx.strokeStyle = 'rgba(140,200,235,.8)';
        ctx.lineWidth = Math.max(1, hw * 0.06);
        const top = P(cx, cy, h + 0.35);
        for(const s of [-1, 1]){
          ctx.beginPath();
          ctx.moveTo(top[0], top[1]);
          ctx.quadraticCurveTo(top[0] + s * hw * 0.3, top[1] - hh * 0.5,
                               top[0] + s * hw * 0.55, top[1] + hh * 0.45);
          ctx.stroke();
        }
        break;
      }

      case 'statue': {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        box(cx-0.34, cy-0.34, cx+0.34, cy+0.34, 0, 0.22, '#8e9299');
        box(cx-0.22, cy-0.22, cx+0.22, cy+0.22, 0.22, 0.75, '#a5a9ae');
        box(cx-0.10, cy-0.10, cx+0.10, cy+0.10, 0.75, h, base);
        cylinder(cx, cy, 0.09, h, h + 0.30, tint(base, 0.12));
        break;
      }

      case 'cable': {
        const cx = b.x + 0.5, cy = b.y + 0.5;
        box(cx-0.05, cy-0.05, cx+0.05, cy+0.05, 0, mdl.h, '#7d6a3f');
        const top = P(cx, cy, mdl.h);
        const arm = P(cx, cy, mdl.h - 0.35);
        ctx.strokeStyle = '#8a7647';
        ctx.lineWidth = Math.max(1.2, hw * 0.05);
        ctx.beginPath();
        ctx.moveTo(arm[0] - hw * 0.22, arm[1]); ctx.lineTo(arm[0] + hw * 0.22, arm[1]);
        ctx.stroke();
        // Leitungen zu den Nachbarn
        ctx.strokeStyle = 'rgba(30,32,36,.85)';
        ctx.lineWidth = Math.max(1, hw * 0.035);
        for(const [dx, dy] of [[1,0],[0,1],[-1,0],[0,-1]]){
          if(!Game.isPowerTile(b.x + dx, b.y + dy)) continue;
          const q = P(cx + dx, cy + dy, mdl.h - 0.35);
          ctx.beginPath();
          ctx.moveTo(top[0], top[1] + sz * 0.35);
          ctx.quadraticCurveTo((top[0] + q[0]) / 2, (top[1] + q[1]) / 2 + hh * 0.55, q[0], q[1]);
          ctx.stroke();
        }
        break;
      }

      default:   // 'box'
        box(x0, y0, x1, y1, 0, h, base);
        if(mdl.floors) floorBands(x0, y0, x1, y1, h, base);
        else windows(b, x0, y0, x1, y1, h, base);
        break;
    }

    roofIcon(b, mdl, d);
    statusBadge(b, mdl);
  }

  /* Fensterreihen auf den beiden sichtbaren Wänden.
     Alle hellen bzw. dunklen Fenster eines Hauses landen in je einem Pfad –
     bei einem Hochhaus sind das zwei Füllvorgänge statt fünfzig. */
  function windows(b, x0, y0, x1, y1, h, base){
    if(hh < 9 || h < 0.8) return;
    const floors = Math.max(1, Math.round(h / 1.05));
    const litP = new Path2D(), darkP = new Path2D();

    for(let f = 0; f < floors; f++){
      const zc = (f + 0.55) * (h / floors);
      const hz = Math.min(0.28, h / floors * 0.3);

      const nx = Math.max(1, Math.round((y1 - y0) * 2));
      for(let k = 0; k < nx; k++){
        const t0 = y0 + (k + 0.28) * ((y1 - y0) / nx);
        const t1 = y0 + (k + 0.72) * ((y1 - y0) / nx);
        addQuad((k + f) % 3 === 0 ? litP : darkP,
                P(x1,t0,zc+hz), P(x1,t1,zc+hz), P(x1,t1,zc-hz), P(x1,t0,zc-hz));
      }

      const ny = Math.max(1, Math.round((x1 - x0) * 2));
      for(let k = 0; k < ny; k++){
        const t0 = x0 + (k + 0.28) * ((x1 - x0) / ny);
        const t1 = x0 + (k + 0.72) * ((x1 - x0) / ny);
        addQuad((k + f) % 4 === 0 ? litP : darkP,
                P(t0,y1,zc+hz), P(t1,y1,zc+hz), P(t1,y1,zc-hz), P(t0,y1,zc-hz));
      }
    }

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = tint(base, -0.5); ctx.fill(darkP);
    ctx.fillStyle = '#ffd98a';        ctx.fill(litP);
    ctx.globalAlpha = 1;
  }

  /* Waagerechte Bänder – für Parkhäuser */
  function floorBands(x0, y0, x1, y1, h, base){
    if(hh < 8) return;
    const n = Math.max(2, Math.round(h / 0.7));
    const p = new Path2D();
    for(let f = 1; f < n; f++){
      const z = f * (h / n);
      addQuad(p, P(x1,y0,z), P(x1,y1,z), P(x1,y1,z-0.1), P(x1,y0,z-0.1));
      addQuad(p, P(x0,y1,z), P(x1,y1,z), P(x1,y1,z-0.1), P(x0,y1,z-0.1));
    }
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = tint(base, -0.48);
    ctx.fill(p);
    ctx.globalAlpha = 1;
  }

  /* Kleines Sinnbild auf dem Dach – hilft beim Wiedererkennen */
  const NO_ICON = {
    tree:1, cable:1, road:1, water:1, wind:1, statue:1, fountain:1,
    solar:1, tank:1, tanks:1, dam:1, park:1, field:1, lot:1
  };
  function roofIcon(b, mdl, d){
    if(NO_ICON[mdl.shape]) return;
    const size = Math.min(b.w, b.h) * hw * 0.62;
    if(size < 9) return;
    const p = P(b.x + b.w / 2, b.y + b.h / 2, (mdl.h || 1.5) + 0.30);
    drawGlyph(d.icon, Math.min(size, 27), p[0], p[1], 0.94);
  }

  /* Warnzeichen über nicht arbeitenden Gebäuden */
  function statusBadge(b, mdl){
    const isolated = b.powerIsolated || b.waterIsolated;
    if(b.active && !isolated) {
      if(!opts.overlay) return;
    }
    // Abzeichen an die rechte obere Ecke, damit es das Dachsymbol frei lässt
    const p = P(b.x + b.w * 0.86, b.y + b.h * 0.14, (mdl.h || 1.5) + 0.55);
    const r = Math.max(6, Math.min(10, hw * 0.24));

    if(opts.overlay){
      // Grundfläche einfärben
      let tintC = null;
      if(isolated) tintC = 'rgba(255,150,40,.5)';
      else if(!b.roadOK) tintC = 'rgba(255,70,70,.5)';
      else if(!b.powered) tintC = 'rgba(255,215,60,.5)';
      else if(!b.watered) tintC = 'rgba(70,160,255,.5)';
      else tintC = 'rgba(80,230,140,.28)';
      diamond(b.x + 0.05, b.y + 0.05, b.x + b.w - 0.05, b.y + b.h - 0.05,
              (mdl.h || 1.5) + 0.02, tintC, true);
      if(b.active && !isolated) return;
    }

    if(hw < 13 && !opts.overlay) return;    // beim Herauszoomen weglassen

    const kind = isolated ? 'iso' : !b.roadOK ? 'road' : !b.powered ? 'pow' : 'wat';
    const badge = badgeSprite(kind, r);
    ctx.drawImage(badge, p[0] - badge.__d / 2, p[1] - badge.__d / 2, badge.__d, badge.__d);
  }

  /* Abzeichen als fertiges Bildchen – Kreis, Rand und Zeichen in einem */
  const badgeCache = new Map();
  const BADGE = {
    iso:  { ch:'🔌', col:'#ff9a28' },
    road: { ch:'🚫', col:'#ff6b6b' },
    pow:  { ch:'⚡', col:'#ffc95c' },
    wat:  { ch:'💧', col:'#6ab0ff' },
  };

  function badgeSprite(kind, r){
    const rr = Math.round(r);
    const key = kind + '|' + rr;
    let cv = badgeCache.get(key);
    if(cv) return cv;

    const d = rr * 2 + 4;
    cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(d * dpr);
    const c2 = cv.getContext('2d');
    c2.scale(dpr, dpr);
    c2.beginPath();
    c2.arc(d/2, d/2, rr, 0, Math.PI * 2);
    c2.fillStyle = 'rgba(14,17,23,.88)';
    c2.fill();
    c2.strokeStyle = BADGE[kind].col;
    c2.lineWidth = 1.6;
    c2.stroke();
    c2.fillStyle = '#ffffff';
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    c2.font = `${Math.round(rr * 1.15)}px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    c2.fillText(BADGE[kind].ch, d/2, d/2 + rr * 0.08);

    cv.__d = d;
    badgeCache.set(key, cv);
    return cv;
  }

  /* ---------------- Vorschau & Auswahl ---------------- */
  function drawGhost(){
    const d = BUILDINGS[ghost.type];
    if(!d) return;
    const mdl = modelOf(ghost.type);
    const [w, h] = d.size;
    const g = { x: ghost.x, y: ghost.y, w, h,
                type: ghost.type, active:true, roadOK:true, powered:true, watered:true };

    // Grundriss markieren
    diamond(g.x, g.y, g.x + w, g.y + h, 0.05,
            ghost.ok ? 'rgba(90,255,150,.30)' : 'rgba(255,90,90,.32)', true);

    ctx.globalAlpha = 0.62;
    drawBuilding(g, mdl);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = ghost.ok ? '#5dff9a' : '#ff5d5d';
    ctx.lineWidth = 2;
    const pts = [P(g.x,g.y,0.06), P(g.x+w,g.y,0.06), P(g.x+w,g.y+h,0.06), P(g.x,g.y+h,0.06)];
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for(let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.stroke();
  }

  function drawSelection(){
    if(!selected || Game.state.buildings[selected.id] !== selected) return;
    const s = selected;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    const pts = [P(s.x,s.y,0.08), P(s.x+s.w,s.y,0.08),
                 P(s.x+s.w,s.y+s.h,0.08), P(s.x,s.y+s.h,0.08)];
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for(let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ---------------------------------------------------------
     Treffererkennung
     Ein hoher Turm verdeckt die Kacheln hinter sich. Wer auf den
     Turm tippt, meint den Turm – nicht den Boden dahinter. Deshalb
     werden die Körper von vorn nach hinten gegen ihre Silhouette
     geprüft.
     --------------------------------------------------------- */
  function inPoly(px, py, pts){
    let inside = false;
    for(let i = 0, j = pts.length - 1; i < pts.length; j = i++){
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if(((yi > py) !== (yj > py)) &&
         (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function pickBuilding(sx, sy){
    const list = Game.state.buildings;
    const cand = [];
    for(const b of list){
      if(!b) continue;
      cand.push(b);
    }
    // von vorn nach hinten prüfen
    cand.sort((a, b) => (b.x + b.w + b.y + b.h) - (a.x + a.w + a.y + a.h));

    for(const b of cand){
      const mdl = modelOf(b.type);
      const h = (mdl.shape === 'road' || mdl.shape === 'water') ? 0.05 : (mdl.h || 1.5);
      const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
      const top = [P(x0,y0,h), P(x1,y0,h), P(x1,y1,h), P(x0,y1,h)];
      if(inPoly(sx, sy, top)) return b;
      if(h > 0.1){
        const right = [P(x1,y0,h), P(x1,y1,h), P(x1,y1,0), P(x1,y0,0)];
        if(inPoly(sx, sy, right)) return b;
        const left = [P(x0,y1,h), P(x1,y1,h), P(x1,y1,0), P(x0,y1,0)];
        if(inPoly(sx, sy, left)) return b;
      }
    }
    return null;
  }

  /* ---------------------------------------------------------
     Öffentliche Schnittstelle
     --------------------------------------------------------- */
  return {
    init, draw, resize,
    cam, opts,
    screenToTile, screenToTileF, tileToScreen,
    pan, zoomAt, setZoom, centerOn, pickBuilding,
    tileSize: () => hw * 2,
    setGhost: g => { ghost = g; },
    getGhost: () => ghost,
    setSelected: s => { selected = s; },
    getSelected: () => selected,
    rebuildShade: buildShade,
  };
})();
