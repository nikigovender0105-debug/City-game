/* ==========================================================
   terrain.js – Kartengenerierung (Fluss, Seen, Wälder)
   ========================================================== */

/* Kleiner deterministischer Zufallsgenerator (Mulberry32) */
function makeRng(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Geglättetes Wertrauschen auf einem Gitter */
function valueNoise(w, h, scale, rng){
  const gw = Math.ceil(w / scale) + 2;
  const gh = Math.ceil(h / scale) + 2;
  const g = new Float32Array(gw * gh);
  for(let i = 0; i < g.length; i++) g[i] = rng();

  const out = new Float32Array(w * h);
  const smooth = t => t * t * (3 - 2 * t);

  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      const fx = x / scale, fy = y / scale;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      const v00 = g[y0 * gw + x0];
      const v10 = g[y0 * gw + x0 + 1];
      const v01 = g[(y0 + 1) * gw + x0];
      const v11 = g[(y0 + 1) * gw + x0 + 1];
      const a = v00 + (v10 - v00) * tx;
      const b = v01 + (v11 - v01) * tx;
      out[y * w + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/* Erzeugt das Terrain-Array der Karte */
function generateTerrain(w, h, seed){
  const rng = makeRng(seed);
  const tiles = new Uint8Array(w * h).fill(T.GRASS);

  const n1 = valueNoise(w, h, 9, rng);   // Wald
  const n2 = valueNoise(w, h, 14, rng);  // Seen
  const n3 = valueNoise(w, h, 5, rng);   // Feinstruktur

  // --- Fluss: schlängelt sich von oben nach unten ---
  let rx = w * (0.25 + rng() * 0.5);
  let drift = (rng() - 0.5) * 0.6;
  const riverW = 2 + Math.floor(rng() * 2);
  for(let y = 0; y < h; y++){
    drift += (rng() - 0.5) * 0.35;
    drift = Math.max(-0.85, Math.min(0.85, drift));
    rx += drift;
    rx = Math.max(4, Math.min(w - 5, rx));
    const half = riverW / 2 + Math.sin(y * 0.17) * 0.8;
    for(let x = Math.floor(rx - half); x <= Math.ceil(rx + half); x++){
      if(x >= 0 && x < w) tiles[y * w + x] = T.WATER;
    }
  }

  // --- Seen aus dem Rauschen ---
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      const i = y * w + x;
      if(tiles[i] === T.WATER) continue;
      if(n2[i] > 0.78 && n3[i] > 0.4) tiles[i] = T.WATER;
    }
  }

  // --- Ufersand ---
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      const i = y * w + x;
      if(tiles[i] !== T.GRASS) continue;
      let nearWater = false;
      for(let dy = -1; dy <= 1 && !nearWater; dy++){
        for(let dx = -1; dx <= 1; dx++){
          const nx = x + dx, ny = y + dy;
          if(nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if(tiles[ny * w + nx] === T.WATER){ nearWater = true; break; }
        }
      }
      if(nearWater) tiles[i] = T.SAND;
    }
  }

  // --- Wald & Felsen ---
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      const i = y * w + x;
      if(tiles[i] !== T.GRASS) continue;
      if(n1[i] > 0.68 && n3[i] > 0.35) tiles[i] = T.TREE;
      else if(n1[i] < 0.13 && n2[i] < 0.3) tiles[i] = T.ROCK;
    }
  }

  // --- Startfläche in der Mitte freiräumen ---
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  let best = null, bestScore = -1;
  // Suche einen möglichst flachen 9x9-Bereich nahe der Mitte
  for(let y = 6; y < h - 10; y += 2){
    for(let x = 6; x < w - 10; x += 2){
      let score = 0;
      for(let dy = 0; dy < 9; dy++){
        for(let dx = 0; dx < 9; dx++){
          const t = tiles[(y + dy) * w + (x + dx)];
          if(t === T.GRASS) score += 2;
          else if(t === T.TREE) score += 1;
          else if(t === T.WATER) score -= 4;
        }
      }
      const dist = Math.abs(x + 4 - cx) + Math.abs(y + 4 - cy);
      score -= dist * 0.6;
      if(score > bestScore){ bestScore = score; best = [x, y]; }
    }
  }
  if(best){
    for(let dy = 0; dy < 9; dy++){
      for(let dx = 0; dx < 9; dx++){
        const i = (best[1] + dy) * w + (best[0] + dx);
        if(tiles[i] === T.TREE || tiles[i] === T.ROCK) tiles[i] = T.GRASS;
      }
    }
  }

  return { tiles, start: best ? [best[0] + 4, best[1] + 4] : [cx, cy] };
}
