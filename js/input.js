/* ==========================================================
   input.js – Touch-, Maus- und Gestensteuerung
   ========================================================== */

const Input = (() => {

  let canvas;
  const pointers = new Map();

  let mode = 'none';        // 'none' | 'build' | 'bulldoze'
  let tool = null;          // Gebäudetyp im Baumodus

  let dragging = false;     // Karte wird geschoben
  let painting = false;     // Straße/Kabel wird gezogen
  let lastPaint = null;
  let strokeTiles = [];     // in diesem Zug gesetzte Kacheln
  let multiTouch = false;   // seit dem Aufsetzen war mehr als ein Finger im Spiel
  let moved = 0;
  let downTime = 0;
  let pinchDist = 0;
  let pinchMid = null;

  const TAP_SLOP = 9;       // Pixel, bis eine Berührung als Ziehen gilt

  /* Rückrufe, die die UI setzt */
  const cb = { onTap:null, onPlaced:null, onFail:null, onDemolish:null };

  function init(cv){
    canvas = cv;
    canvas.addEventListener('pointerdown', onDown, { passive:false });
    canvas.addEventListener('pointermove', onMove, { passive:false });
    canvas.addEventListener('pointerup', onUp, { passive:false });
    canvas.addEventListener('pointercancel', onUp, { passive:false });
    canvas.addEventListener('pointerleave', onUp, { passive:false });
    canvas.addEventListener('wheel', onWheel, { passive:false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  function localPos(e){
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  /* Anker: bei mehrfeldrigen Gebäuden liegt der Finger in der Mitte */
  function anchor(type, tx, ty){
    const d = BUILDINGS[type];
    if(!d) return [tx, ty];
    return [tx - Math.floor((d.size[0] - 1) / 2), ty - Math.floor((d.size[1] - 1) / 2)];
  }

  function isDragTool(){
    return mode === 'build' && tool && BUILDINGS[tool] && BUILDINGS[tool].drag;
  }

  /* ---------------------------------------------------------
     Pointer-Ereignisse
     --------------------------------------------------------- */
  function onDown(e){
    e.preventDefault();
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    const [x,y] = localPos(e);
    pointers.set(e.pointerId, { x, y, sx:x, sy:y });

    if(pointers.size === 2){
      // Zwei Finger: Zoomen/Schieben. Was der erste Finger eben gesetzt hat,
      // war nicht gewollt – rückgängig machen.
      if(painting && strokeTiles.length <= 2 && performance.now() - downTime < 300){
        for(const [tx,ty] of strokeTiles) Game.cancelPlace(tx, ty);
      }
      strokeTiles = [];
      multiTouch = true;
      dragging = false; painting = false;
      const p = [...pointers.values()];
      pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      pinchMid = [(p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2];
      return;
    }
    if(pointers.size > 2) return;

    moved = 0;
    downTime = performance.now();

    if(isDragTool()){
      painting = true;
      lastPaint = null;
      strokeTiles = [];
      paintAt(x, y);
    }else{
      dragging = true;
    }
    updateGhost(x, y);
  }

  function onMove(e){
    const p = pointers.get(e.pointerId);
    if(!p) {
      if(mode === 'build' && pointers.size === 0){
        const [mx,my] = localPos(e);
        updateGhost(mx, my);         // Maus-Vorschau am Desktop
      }
      return;
    }
    e.preventDefault();
    const [x,y] = localPos(e);
    const dx = x - p.x, dy = y - p.y;
    p.x = x; p.y = y;
    moved += Math.hypot(dx, dy);

    if(pointers.size === 2){
      const q = [...pointers.values()];
      const dist = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y);
      const mid = [(q[0].x + q[1].x) / 2, (q[0].y + q[1].y) / 2];
      if(pinchDist > 0){
        Render.zoomAt(mid[0], mid[1], dist / pinchDist);
      }
      if(pinchMid){
        Render.pan(mid[0] - pinchMid[0], mid[1] - pinchMid[1]);
      }
      pinchDist = dist; pinchMid = mid;
      return;
    }

    if(painting){
      paintAt(x, y);
      updateGhost(x, y);
    }else if(dragging && moved > TAP_SLOP){
      Render.pan(dx, dy);
      updateGhost(x, y);
    }else{
      updateGhost(x, y);
    }
  }

  function onUp(e){
    const p = pointers.get(e.pointerId);
    if(!p) return;
    pointers.delete(e.pointerId);

    if(pointers.size >= 1){
      // Der verbleibende Finger startet keine neue Aktion
      pinchDist = 0; pinchMid = null;
      dragging = false; painting = false;
      return;
    }

    const wasTap = moved <= TAP_SLOP && (performance.now() - downTime) < 700;
    const wasPainting = painting;
    dragging = false; painting = false;
    pinchDist = 0; pinchMid = null;

    if(wasTap && !wasPainting && !multiTouch){
      handleTap(p.x, p.y);
    }
    multiTouch = false;
    strokeTiles = [];
    lastPaint = null;
  }

  function onWheel(e){
    e.preventDefault();
    const [x,y] = localPos(e);
    Render.zoomAt(x, y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    updateGhost(x, y);
  }

  /* ---------------------------------------------------------
     Aktionen
     --------------------------------------------------------- */
  function handleTap(sx, sy){
    const [tx, ty] = Render.screenToTile(sx, sy);
    if(!Game.inBounds(tx, ty)) return;

    if(mode === 'build' && tool){
      const [ax, ay] = anchor(tool, tx, ty);
      const res = Game.place(tool, ax, ay);
      if(res.ok) cb.onPlaced && cb.onPlaced(tool, res.cost);
      else cb.onFail && cb.onFail(res.reason);
      updateGhost(sx, sy);
      return;
    }

    if(mode === 'bulldoze'){
      const res = Game.demolishAt(tx, ty);
      if(res.ok) cb.onDemolish && cb.onDemolish(res);
      else if(res.reason) cb.onFail && cb.onFail(res.reason);
      return;
    }

    // Ansichtsmodus: Gebäude auswählen
    const b = Game.buildingAt(tx, ty);
    Render.setSelected(b || null);
    cb.onTap && cb.onTap(b, tx, ty);
  }

  /* Straßen/Kabel/Bäume beim Ziehen setzen (mit Linieninterpolation) */
  function paintAt(sx, sy){
    const [tx, ty] = Render.screenToTile(sx, sy);
    if(!Game.inBounds(tx, ty)) return;

    if(lastPaint && (lastPaint[0] !== tx || lastPaint[1] !== ty)){
      lineTiles(lastPaint[0], lastPaint[1], tx, ty, (x, y) => tryPaint(x, y));
    }else if(!lastPaint){
      tryPaint(tx, ty);
    }
    lastPaint = [tx, ty];
  }

  function tryPaint(tx, ty){
    const [ax, ay] = anchor(tool, tx, ty);
    const res = Game.place(tool, ax, ay);
    if(res.ok){
      strokeTiles.push([ax, ay]);
      cb.onPlaced && cb.onPlaced(tool, res.cost, true);
    }else if(res.reason === 'Nicht genug Geld'){
      cb.onFail && cb.onFail(res.reason);
    }
  }

  /* Bresenham über Kacheln */
  function lineTiles(x0, y0, x1, y1, fn){
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let guard = 0;
    for(;;){
      fn(x0, y0);
      if((x0 === x1 && y0 === y1) || ++guard > 400) break;
      const e2 = 2 * err;
      if(e2 >= dy){ err += dy; x0 += sx; }
      if(e2 <= dx){ err += dx; y0 += sy; }
    }
  }

  /* ---------------------------------------------------------
     Bauvorschau
     --------------------------------------------------------- */
  function updateGhost(sx, sy){
    if(mode !== 'build' || !tool){ Render.setGhost(null); return; }
    const [tx, ty] = Render.screenToTile(sx, sy);
    const [ax, ay] = anchor(tool, tx, ty);
    Render.setGhost({ type: tool, x: ax, y: ay, ok: Game.fits(tool, ax, ay, false) });
  }

  /* ---------------------------------------------------------
     Modus
     --------------------------------------------------------- */
  function setMode(m, t){
    mode = m;
    tool = t || null;
    if(m !== 'build') Render.setGhost(null);
    if(m !== 'none') Render.setSelected(null);
  }
  function getMode(){ return { mode, tool }; }

  return { init, setMode, getMode, cb };
})();
