/* ==========================================================
   render.js – Zeichnen von Karte, Gebäuden und Vorschau
   ========================================================== */

const Render = (() => {

  let canvas, ctx, dpr = 1;
  let vw = 0, vh = 0;                 // CSS-Pixel des Sichtbereichs

  const cam = { x:0, y:0, zoom:1 };   // x/y = Weltkoordinate in der Bildmitte

  const opts = { grid:true, overlay:false };

  let shade = null;                   // kleine Farbvariation je Kachel
  let ghost = null;                   // { type, x, y, ok } Bauvorschau
  let selected = null;                // markiertes Gebäude

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
      const h = Math.sin(i * 12.9898) * 43758.5453;
      shade[i] = (h - Math.floor(h)) * 0.16 - 0.08;
    }
  }

  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = canvas.parentElement.getBoundingClientRect();
    vw = r.width; vh = r.height;
    canvas.width  = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clampCam();
  }

  /* ---------------------------------------------------------
     Kamera
     --------------------------------------------------------- */
  function tileSize(){ return CONFIG.TILE * cam.zoom; }

  function centerOn(tx, ty){
    const ts = tileSize();
    cam.x = tx * ts;
    cam.y = ty * ts;
    clampCam();
  }

  function clampCam(){
    const ts = tileSize();
    const worldW = Game.W * ts, worldH = Game.H * ts;
    const marginX = Math.min(vw * 0.4, worldW);
    const marginY = Math.min(vh * 0.4, worldH);
    cam.x = Math.max(-marginX, Math.min(worldW + marginX, cam.x));
    cam.y = Math.max(-marginY, Math.min(worldH + marginY, cam.y));
  }

  function screenToTile(sx, sy){
    const ts = tileSize();
    const wx = cam.x + (sx - vw / 2);
    const wy = cam.y + (sy - vh / 2);
    return [Math.floor(wx / ts), Math.floor(wy / ts)];
  }

  function tileToScreen(tx, ty){
    const ts = tileSize();
    return [tx * ts - cam.x + vw / 2, ty * ts - cam.y + vh / 2];
  }

  function pan(dx, dy){ cam.x -= dx; cam.y -= dy; clampCam(); }

  function zoomAt(sx, sy, factor){
    const before = screenToTileF(sx, sy);
    cam.zoom = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, cam.zoom * factor));
    const after = screenToTileF(sx, sy);
    const ts = tileSize();
    cam.x += (before[0] - after[0]) * ts;
    cam.y += (before[1] - after[1]) * ts;
    clampCam();
  }

  function screenToTileF(sx, sy){
    const ts = tileSize();
    return [(cam.x + (sx - vw / 2)) / ts, (cam.y + (sy - vh / 2)) / ts];
  }

  /* ---------------------------------------------------------
     Farbhilfen
     --------------------------------------------------------- */
  function shadeColor(hex, amt){
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r * (1 + amt))));
    g = Math.max(0, Math.min(255, Math.round(g * (1 + amt))));
    b = Math.max(0, Math.min(255, Math.round(b * (1 + amt))));
    return `rgb(${r},${g},${b})`;
  }

  function roundRect(x, y, w, h, r){
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* ---------------------------------------------------------
     Hauptzeichnung
     --------------------------------------------------------- */
  function draw(){
    const st = Game.state;
    const ts = tileSize();

    ctx.fillStyle = '#131a15';
    ctx.fillRect(0, 0, vw, vh);

    // Sichtbarer Kachelbereich
    const x0 = Math.max(0, Math.floor((cam.x - vw / 2) / ts));
    const y0 = Math.max(0, Math.floor((cam.y - vh / 2) / ts));
    const x1 = Math.min(Game.W - 1, Math.ceil((cam.x + vw / 2) / ts));
    const y1 = Math.min(Game.H - 1, Math.ceil((cam.y + vh / 2) / ts));

    const ox = -cam.x + vw / 2;
    const oy = -cam.y + vh / 2;

    /* --- Terrain --- */
    for(let ty = y0; ty <= y1; ty++){
      for(let tx = x0; tx <= x1; tx++){
        const i = ty * Game.W + tx;
        const t = st.tiles[i];
        ctx.fillStyle = shadeColor(TERRAIN_COLORS[t], shade[i]);
        ctx.fillRect(Math.floor(tx * ts + ox), Math.floor(ty * ts + oy),
                     Math.ceil(ts) + 1, Math.ceil(ts) + 1);
      }
    }

    /* --- Bäume/Felsen als kleine Symbole --- */
    if(ts > 13){
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(ts * 0.62)}px system-ui, sans-serif`;
      for(let ty = y0; ty <= y1; ty++){
        for(let tx = x0; tx <= x1; tx++){
          const i = ty * Game.W + tx;
          const t = st.tiles[i];
          if(t !== T.TREE && t !== T.ROCK) continue;
          if(st.occ[i] !== -1) continue;
          ctx.globalAlpha = 0.9;
          ctx.fillText(t === T.TREE ? '🌲' : '🪨',
                       tx * ts + ox + ts / 2, ty * ts + oy + ts / 2 + 1);
          ctx.globalAlpha = 1;
        }
      }
    }

    /* --- Raster --- */
    if(opts.grid && ts > 11){
      ctx.strokeStyle = 'rgba(0,0,0,.13)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(let tx = x0; tx <= x1 + 1; tx++){
        const px = Math.floor(tx * ts + ox) + 0.5;
        ctx.moveTo(px, y0 * ts + oy); ctx.lineTo(px, (y1 + 1) * ts + oy);
      }
      for(let ty = y0; ty <= y1 + 1; ty++){
        const py = Math.floor(ty * ts + oy) + 0.5;
        ctx.moveTo(x0 * ts + ox, py); ctx.lineTo((x1 + 1) * ts + ox, py);
      }
      ctx.stroke();
    }

    /* --- Gebäude --- */
    drawBuildings(x0, y0, x1, y1, ts, ox, oy);

    /* --- Bauvorschau --- */
    if(ghost) drawGhost(ts, ox, oy);

    /* --- Auswahlrahmen --- */
    if(selected && Game.state.buildings[selected.id] === selected){
      const [sx, sy] = [selected.x * ts + ox, selected.y * ts + oy];
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(sx + 1, sy + 1, selected.w * ts - 2, selected.h * ts - 2);
      ctx.setLineDash([]);
    }
  }

  function drawBuildings(x0, y0, x1, y1, ts, ox, oy){
    const list = Game.state.buildings;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for(let k = 0; k < list.length; k++){
      const b = list[k];
      if(!b) continue;
      if(b.x > x1 || b.y > y1 || b.x + b.w <= x0 || b.y + b.h <= y0) continue;

      const d = BUILDINGS[b.type];
      const px = b.x * ts + ox, py = b.y * ts + oy;
      const pw = b.w * ts, ph = b.h * ts;

      if(d.net === 'road'){ drawRoad(b, px, py, ts); continue; }
      if(d.net === 'cable'){ drawCable(b, px, py, ts); continue; }

      // Gebäudekörper – leicht eingerückt, damit der Untergrund durchscheint
      const pad = Math.max(1, ts * 0.09);
      const bx = px + pad, by = py + pad;
      const bw = pw - pad * 2, bh = ph - pad * 2;
      const rad = Math.max(2, ts * 0.14);

      ctx.fillStyle = 'rgba(0,0,0,.28)';
      roundRect(bx + pad * 0.5, by + pad * 0.7, bw, bh, rad);
      ctx.fill();

      ctx.fillStyle = d.color || '#8a8a8a';
      roundRect(bx, by, bw, bh, rad);
      ctx.fill();

      // Dachkante als Lichtkante
      ctx.fillStyle = 'rgba(255,255,255,.13)';
      roundRect(bx, by, bw, Math.max(1.5, bh * 0.22), rad);
      ctx.fill();

      // Symbol
      if(ts > 11){
        const fs = Math.min(bw, bh) * 0.6;
        ctx.font = `${Math.round(fs)}px system-ui, "Apple Color Emoji", sans-serif`;
        ctx.fillText(d.icon, px + pw / 2, py + ph / 2);
      }

      // Versorgungs-Ansicht
      if(opts.overlay){
        let tint = null;
        if(b.powerIsolated || b.waterIsolated) tint = 'rgba(255,140,40,.5)';
        else if(!b.roadOK) tint = 'rgba(255,70,70,.45)';
        else if(!b.powered) tint = 'rgba(255,210,60,.45)';
        else if(!b.watered) tint = 'rgba(70,150,255,.45)';
        if(tint){
          ctx.fillStyle = tint;
          roundRect(bx, by, bw, bh, rad);
          ctx.fill();
        }
      }

      // Statuszeichen
      const isolated = b.powerIsolated || b.waterIsolated;
      if((!b.active || isolated) && ts > 12){
        const badge = isolated ? '🔌' : !b.roadOK ? '🚫' : (!b.powered ? '⚡' : '💧');
        const bs = Math.max(9, Math.min(16, ts * 0.4));
        ctx.font = `${Math.round(bs)}px system-ui, "Apple Color Emoji", sans-serif`;
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.beginPath();
        ctx.arc(px + pw - bs * 0.45, py + bs * 0.45, bs * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(badge, px + pw - bs * 0.45, py + bs * 0.5);
      }
    }
  }

  /* Straße mit Anschlüssen an die Nachbarn */
  function drawRoad(b, px, py, ts){
    const d = BUILDINGS[b.type];
    ctx.fillStyle = d.color;
    ctx.fillRect(px, py, ts + 0.5, ts + 0.5);

    if(ts < 10) return;
    const cx = px + ts / 2, cy = py + ts / 2;
    const n = Game.isRoadTile(b.x, b.y - 1);
    const s = Game.isRoadTile(b.x, b.y + 1);
    const w = Game.isRoadTile(b.x - 1, b.y);
    const e = Game.isRoadTile(b.x + 1, b.y);

    ctx.strokeStyle = 'rgba(235,235,235,.55)';
    ctx.lineWidth = Math.max(1, ts * 0.055);
    ctx.setLineDash([ts * 0.18, ts * 0.14]);
    ctx.beginPath();
    if(n || s){ ctx.moveTo(cx, py); ctx.lineTo(cx, py + ts); }
    if(w || e){ ctx.moveTo(px, cy); ctx.lineTo(px + ts, cy); }
    if(!n && !s && !w && !e){ ctx.moveTo(px + ts * 0.3, cy); ctx.lineTo(px + ts * 0.7, cy); }
    ctx.stroke();
    ctx.setLineDash([]);

    // Randmarkierung
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);
  }

  /* Stromkabel: Masten mit Leitung */
  function drawCable(b, px, py, ts){
    ctx.fillStyle = 'rgba(60,70,60,.35)';
    ctx.fillRect(px, py, ts + 0.5, ts + 0.5);
    if(ts < 8) return;

    const cx = px + ts / 2, cy = py + ts / 2;
    ctx.strokeStyle = '#d8c98a';
    ctx.lineWidth = Math.max(1.2, ts * 0.09);
    ctx.beginPath();
    let any = false;
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for(const [dx,dy] of dirs){
      if(Game.isPowerTile(b.x + dx, b.y + dy)){
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + dx * ts / 2, cy + dy * ts / 2);
        any = true;
      }
    }
    if(!any){ ctx.moveTo(cx - ts * 0.2, cy); ctx.lineTo(cx + ts * 0.2, cy); }
    ctx.stroke();

    ctx.fillStyle = '#6d5f3a';
    const r = Math.max(1.5, ts * 0.14);
    ctx.fillRect(cx - r / 2, cy - r, r, r * 2);
  }

  /* Bauvorschau */
  function drawGhost(ts, ox, oy){
    const d = BUILDINGS[ghost.type];
    if(!d) return;
    const [w,h] = d.size;
    const px = ghost.x * ts + ox, py = ghost.y * ts + oy;

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = d.color || '#999';
    roundRect(px + 1, py + 1, w * ts - 2, h * ts - 2, Math.max(2, ts * 0.16));
    ctx.fill();
    if(ts > 11 && d.icon){
      ctx.globalAlpha = 0.85;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(Math.min(w,h) * ts * 0.5)}px system-ui, "Apple Color Emoji", sans-serif`;
      ctx.fillText(d.icon, px + w * ts / 2, py + h * ts / 2);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = ghost.ok ? '#5dff9a' : '#ff5d5d';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(px + 1, py + 1, w * ts - 2, h * ts - 2);
  }

  /* ---------------------------------------------------------
     Öffentliche Schnittstelle
     --------------------------------------------------------- */
  return {
    init, draw, resize,
    cam, opts,
    tileSize, screenToTile, tileToScreen, pan, zoomAt, centerOn,
    setGhost: g => { ghost = g; },
    getGhost: () => ghost,
    setSelected: s => { selected = s; },
    getSelected: () => selected,
    rebuildShade: buildShade,
  };
})();
