/* ==========================================================
   game.js – Spielzustand, Bauen, Versorgungsnetze, Simulation
   ========================================================== */

const Game = (() => {

  const W = CONFIG.MAP_W, H = CONFIG.MAP_H, N = W * H;

  /* Priorität bei Strom-/Wasserknappheit (höher = wird zuerst versorgt) */
  const PRIORITY = {
    water:100, power:98, health:90, safety:86, edu:80,
    transit:70, shop:62, res:52, fun:40, park:32, deco:22, infra:10
  };

  const MONTH_NAMES = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

  /* ---------------------------------------------------------
     Zustand
     --------------------------------------------------------- */
  const state = {
    seed: 1,
    tiles: null,        // Uint8Array – Terrain
    occ: null,          // Int32Array – Index in buildings[] oder -1
    buildings: [],      // Einträge können null sein (abgerissen)
    money: CONFIG.START_MONEY,
    day: 0,
    taxRes: 10,
    taxCom: 12,
    pop: 0,
    morale: 55,
    speed: 1,
    start: [0,0],
    stats: emptyStats(),
    history: { pop:[], morale:[], money:[] },
    log: [],
  };

  function emptyStats(){
    return {
      pop:0, capacity:0, morale:55,
      power:{supply:0, demand:0, used:0, stranded:0, total:0},
      water:{supply:0, demand:0, used:0, stranded:0, total:0},
      edu:0, health:0, police:0, fire:0, jail:0,
      leisure:0, transit:0, parking:0, commerce:0,
      beauty:0, pollution:0, jobs:0,
      crime:0, employment:0,
      unsupplied:0,
      income:{res:0, com:0, total:0},
      expense:{upkeep:0, power:0, water:0, total:0},
      balance:0,
      buildingCount:0,
    };
  }

  /* ---------------------------------------------------------
     Hilfsfunktionen
     --------------------------------------------------------- */
  const idx = (x,y) => y * W + x;
  const inBounds = (x,y) => x >= 0 && y >= 0 && x < W && y < H;

  function terrainAt(x,y){ return inBounds(x,y) ? state.tiles[idx(x,y)] : T.ROCK; }
  function buildingAt(x,y){
    if(!inBounds(x,y)) return null;
    const i = state.occ[idx(x,y)];
    return i >= 0 ? state.buildings[i] : null;
  }
  function isWaterTile(x,y){ return inBounds(x,y) && state.tiles[idx(x,y)] === T.WATER; }

  function forEachTile(b, fn){
    for(let y = b.y; y < b.y + b.h; y++)
      for(let x = b.x; x < b.x + b.w; x++)
        fn(x, y, idx(x,y));
  }

  /* Ist die Kachel Teil eines Straßen-Elements? */
  function isRoadTile(x,y){
    const b = buildingAt(x,y);
    return !!(b && BUILDINGS[b.type].net === 'road');
  }
  /* Leitet die Kachel Strom? (Straße, Brücke oder Kabel) */
  function isPowerTile(x,y){
    const b = buildingAt(x,y);
    if(!b) return false;
    const d = BUILDINGS[b.type];
    return d.net === 'road' || d.net === 'cable';
  }

  /* ---------------------------------------------------------
     Neue Stadt
     --------------------------------------------------------- */
  function newGame(seed){
    state.seed = seed || (Date.now() % 1000000);
    const gen = generateTerrain(W, H, state.seed);
    state.tiles = gen.tiles;
    state.start = gen.start;
    state.occ = new Int32Array(N).fill(-1);
    state.buildings = [];
    state.money = CONFIG.START_MONEY;
    state.day = 0;
    state.taxRes = 10;
    state.taxCom = 12;
    state.pop = 0;
    state.morale = 55;
    state.stats = emptyStats();
    state.history = { pop:[], morale:[], money:[] };
    state.log = [];

    // Startstraße als Orientierung
    const [sx, sy] = state.start;
    for(let x = sx - 4; x <= sx + 4; x++) forcePlace('road', x, sy);
    for(let y = sy - 4; y <= sy + 4; y++) forcePlace('road', sx, y);

    updateSupply();
    return state;
  }

  /* Platzieren ohne Kostenprüfung (für Startaufbau/Laden) */
  function forcePlace(type, x, y){
    const d = BUILDINGS[type];
    if(!d) return false;
    const [w,h] = d.size;
    if(!fits(type, x, y, true)) return false;
    return doPlace(type, x, y, w, h);
  }

  /* ---------------------------------------------------------
     Platzierungsprüfung
     --------------------------------------------------------- */
  function fits(type, x, y, ignoreCost){
    const d = BUILDINGS[type];
    if(!d) return false;
    const [w,h] = d.size;
    if(x < 0 || y < 0 || x + w > W || y + h > H) return false;

    for(let ty = y; ty < y + h; ty++){
      for(let tx = x; tx < x + w; tx++){
        const i = idx(tx,ty);
        if(state.occ[i] !== -1) return false;
        const t = state.tiles[i];
        if(d.onWater){
          if(t !== T.WATER) return false;      // Brücke nur auf Wasser
        }else{
          if(t === T.WATER) return false;      // sonst kein Bauen im Wasser
        }
      }
    }

    // Muss ans Wasser grenzen (Pumpe, Wasserkraft)
    if(d.needsWater && !touchesWater(x, y, w, h)) return false;

    if(!ignoreCost && state.money < priceOf(type, x, y)) return false;
    return true;
  }

  function touchesWater(x, y, w, h){
    for(let tx = x; tx < x + w; tx++){
      if(isWaterTile(tx, y - 1) || isWaterTile(tx, y + h)) return true;
    }
    for(let ty = y; ty < y + h; ty++){
      if(isWaterTile(x - 1, ty) || isWaterTile(x + w, ty)) return true;
    }
    return false;
  }

  /* Grundstückskosten inkl. Rodung von Wald/Fels */
  function priceOf(type, x, y){
    const d = BUILDINGS[type];
    let cost = d.cost;
    const [w,h] = d.size;
    for(let ty = y; ty < y + h; ty++){
      for(let tx = x; tx < x + w; tx++){
        if(!inBounds(tx,ty)) continue;
        const t = state.tiles[idx(tx,ty)];
        if(t === T.TREE) cost += 6;
        else if(t === T.ROCK) cost += 14;
      }
    }
    return Math.round(cost);
  }

  /* Warum geht es nicht? (Text für den Spieler) */
  function placementError(type, x, y){
    const d = BUILDINGS[type];
    if(!d) return 'Unbekanntes Gebäude';
    const [w,h] = d.size;
    if(x < 0 || y < 0 || x + w > W || y + h > H) return 'Außerhalb der Karte';

    for(let ty = y; ty < y + h; ty++){
      for(let tx = x; tx < x + w; tx++){
        const i = idx(tx,ty);
        if(state.occ[i] !== -1) return 'Platz ist schon belegt';
        const t = state.tiles[i];
        if(d.onWater && t !== T.WATER) return 'Brücken nur auf Wasser bauen';
        if(!d.onWater && t === T.WATER) return 'Nicht im Wasser bauen – nimm eine Brücke';
      }
    }
    if(d.needsWater && !touchesWater(x,y,w,h)) return `${d.name} muss ans Wasser grenzen`;
    if(state.money < priceOf(type,x,y)) return 'Nicht genug Geld';
    return 'Hier nicht möglich';
  }

  /* ---------------------------------------------------------
     Bauen & Abreißen
     --------------------------------------------------------- */
  function doPlace(type, x, y, w, h){
    const d = BUILDINGS[type];
    const b = {
      type, x, y, w, h,
      built: state.day,
      roadOK:false, powered:false, watered:false, active:false,
      residents:0,
      prevTerrain:null,
    };

    // Baggersee gräbt Wasser aus – Terrain merken für den Abriss
    if(d.makesWater){
      b.prevTerrain = [];
      forEachTile(b, (tx,ty,i) => {
        b.prevTerrain.push(state.tiles[i]);
        state.tiles[i] = T.WATER;
      });
    }else{
      // Bauplatz roden
      forEachTile(b, (tx,ty,i) => {
        if(state.tiles[i] === T.TREE || state.tiles[i] === T.ROCK) state.tiles[i] = T.GRASS;
      });
    }

    const id = state.buildings.push(b) - 1;
    b.id = id;
    forEachTile(b, (tx,ty,i) => { state.occ[i] = id; });
    return true;
  }

  function place(type, x, y){
    if(!fits(type, x, y, false)){
      return { ok:false, reason: placementError(type, x, y) };
    }
    const cost = priceOf(type, x, y);
    const d = BUILDINGS[type];
    state.money -= cost;
    doPlace(type, x, y, d.size[0], d.size[1]);
    updateSupply();
    return { ok:true, cost };
  }

  /* Rücknahme einer gerade gesetzten Kachel (z. B. weil der Spieler
     eigentlich zoomen wollte) – mit voller Kostenerstattung. */
  function cancelPlace(x, y){
    if(!inBounds(x,y)) return false;
    const bi = state.occ[idx(x,y)];
    if(bi < 0) return false;
    const b = state.buildings[bi];
    const d = BUILDINGS[b.type];
    if(d.makesWater && b.prevTerrain){
      let k = 0;
      forEachTile(b, (tx,ty,ii) => { state.tiles[ii] = b.prevTerrain[k++]; });
    }
    forEachTile(b, (tx,ty,ii) => { state.occ[ii] = -1; });
    state.buildings[bi] = null;
    state.money += d.cost;
    updateSupply();
    return true;
  }

  function demolishAt(x, y){
    if(!inBounds(x,y)) return { ok:false };
    const i = idx(x,y);
    const bi = state.occ[i];

    if(bi < 0){
      // Freie Kachel: Wald/Fels roden
      const t = state.tiles[i];
      if(t === T.TREE || t === T.ROCK){
        const cost = t === T.TREE ? 6 : 14;
        if(state.money < cost) return { ok:false, reason:'Nicht genug Geld' };
        state.money -= cost;
        state.tiles[i] = T.GRASS;
        return { ok:true, cleared:true };
      }
      return { ok:false };
    }

    const b = state.buildings[bi];
    const d = BUILDINGS[b.type];
    const refund = Math.round(d.cost * CONFIG.DEMOLISH_REFUND);

    if(d.makesWater && b.prevTerrain){
      let k = 0;
      forEachTile(b, (tx,ty,ii) => { state.tiles[ii] = b.prevTerrain[k++]; });
    }
    forEachTile(b, (tx,ty,ii) => { state.occ[ii] = -1; });
    state.buildings[bi] = null;
    state.money += refund;
    updateSupply();
    return { ok:true, refund, name:d.name };
  }

  /* ---------------------------------------------------------
     Versorgungsnetze (Union-Find über belegte Kacheln)
     --------------------------------------------------------- */
  let ufP = null, ufW = null;

  function makeUF(){
    const p = new Int32Array(N);
    for(let i = 0; i < N; i++) p[i] = -1;   // -1 = nicht im Netz
    return p;
  }
  function find(p, i){
    let r = i;
    while(p[r] !== r) r = p[r];
    while(p[i] !== r){ const nx = p[i]; p[i] = r; i = nx; }
    return r;
  }
  function union(p, a, b){
    const ra = find(p,a), rb = find(p,b);
    if(ra !== rb) p[ra] = rb;
  }

  function buildNetworks(){
    ufP = makeUF();
    ufW = makeUF();

    // Alle belegten Kacheln sind Knoten.
    // Strom: Straßen, Brücken, Kabel und Gebäude leiten Strom weiter.
    // Wasser: nur Straßen/Brücken (Rohre darunter) und Gebäude.
    for(let i = 0; i < N; i++){
      const bi = state.occ[i];
      if(bi < 0) continue;
      const d = BUILDINGS[state.buildings[bi].type];
      ufP[i] = i;
      if(d.net !== 'cable') ufW[i] = i;
    }

    for(let y = 0; y < H; y++){
      for(let x = 0; x < W; x++){
        const i = idx(x,y);
        if(ufP[i] < 0 && ufW[i] < 0) continue;
        if(x + 1 < W){
          const j = i + 1;
          if(ufP[i] >= 0 && ufP[j] >= 0) union(ufP, i, j);
          if(ufW[i] >= 0 && ufW[j] >= 0) union(ufW, i, j);
        }
        if(y + 1 < H){
          const j = i + W;
          if(ufP[i] >= 0 && ufP[j] >= 0) union(ufP, i, j);
          if(ufW[i] >= 0 && ufW[j] >= 0) union(ufW, i, j);
        }
      }
    }
  }

  /* Straßenanschluss: mindestens eine angrenzende Straßenkachel */
  function computeRoadOK(b){
    const d = BUILDINGS[b.type];
    if(d.net) return true;                 // Straßen/Kabel brauchen nichts
    if(d.needsRoad === false) return true;
    for(let tx = b.x; tx < b.x + b.w; tx++){
      if(isRoadTile(tx, b.y - 1) || isRoadTile(tx, b.y + b.h)) return true;
    }
    for(let ty = b.y; ty < b.y + b.h; ty++){
      if(isRoadTile(b.x - 1, ty) || isRoadTile(b.x + b.w, ty)) return true;
    }
    return false;
  }

  function rootOf(uf, b){
    const i = idx(b.x, b.y);
    return uf[i] >= 0 ? find(uf, i) : -1;
  }

  /* Verteilt eine Ressource innerhalb jeder Netzkomponente */
  function allocate(uf, genKey, useKey, flagKey, producerOK){
    const supply = new Map();
    const consumers = new Map();
    let totalSupply = 0, totalDemand = 0, totalUsed = 0;

    for(const b of state.buildings){
      if(!b) continue;
      const d = BUILDINGS[b.type];
      const root = rootOf(uf, b);

      const gen = d[genKey] || 0;
      if(gen > 0 && b.roadOK && producerOK(b, d) && root >= 0){
        supply.set(root, (supply.get(root) || 0) + gen);
        totalSupply += gen;
      }

      const use = d[useKey] || 0;
      if(use > 0){
        b[flagKey] = false;
        if(b.roadOK && root >= 0){
          totalDemand += use;   // nicht angeschlossene Gebäude verbrauchen nichts
          if(!consumers.has(root)) consumers.set(root, []);
          consumers.get(root).push(b);
        }
      }else{
        b[flagKey] = true;   // kein Bedarf = immer versorgt
      }
    }

    // Erzeugung in Netzabschnitten ohne Abnehmer ist nutzlos ("gestrandet").
    // Sie darf nicht als verfügbare Leistung gemeldet werden, sonst sucht der
    // Spieler den Fehler an der falschen Stelle.
    let connected = 0, stranded = 0;
    for(const [root, amount] of supply){
      if(consumers.has(root)) connected += amount;
      else stranded += amount;
    }
    for(const b of state.buildings){
      if(!b) continue;
      const d = BUILDINGS[b.type];
      if(!(d[genKey] > 0)) continue;
      const root = rootOf(uf, b);
      b[flagKey === 'powered' ? 'powerIsolated' : 'waterIsolated'] =
        b.roadOK && root >= 0 && !consumers.has(root);
    }

    for(const [root, list] of consumers){
      let left = supply.get(root) || 0;
      list.sort((a,b2) =>
        (PRIORITY[BUILDINGS[b2.type].cat] || 0) - (PRIORITY[BUILDINGS[a.type].cat] || 0)
      );
      for(const b of list){
        const use = BUILDINGS[b.type][useKey] || 0;
        if(left >= use){ left -= use; b[flagKey] = true; totalUsed += use; }
        else b[flagKey] = false;
      }
    }

    return {
      supply: connected, stranded,
      total: totalSupply, demand: totalDemand, used: totalUsed
    };
  }

  /* Vollständige Neuberechnung von Strom, Wasser und Anschluss */
  function updateSupply(){
    buildNetworks();

    for(const b of state.buildings){
      if(!b) continue;
      b.roadOK = computeRoadOK(b);
      b.powered = true;
      b.watered = true;
    }

    let power = null, water = null;
    // Zwei Durchläufe: Kraftwerke brauchen Wasser, Pumpen brauchen Strom
    for(let pass = 0; pass < 2; pass++){
      power = allocate(ufP, 'powerGen', 'power', 'powered',
        (b, d) => !d.water || b.watered);
      water = allocate(ufW, 'waterGen', 'water', 'watered',
        (b, d) => !d.power || b.powered);
    }

    // Abgerechnet wird nur, was tatsächlich läuft. Ein Haus ohne Strom
    // verbraucht auch kein Wasser und taucht nicht auf der Rechnung auf.
    let powerBilled = 0, waterBilled = 0;
    for(const b of state.buildings){
      if(!b) continue;
      b.active = b.roadOK && b.powered && b.watered;
      if(b.active){
        const d = BUILDINGS[b.type];
        powerBilled += d.power || 0;
        waterBilled += d.water || 0;
      }
    }
    power.used = powerBilled;
    water.used = waterBilled;

    state.stats.power = power;
    state.stats.water = water;
  }

  /* ---------------------------------------------------------
     Kennzahlen der Stadt
     --------------------------------------------------------- */
  function collect(){
    const s = state.stats;
    s.capacity = 0; s.edu = 0; s.health = 0; s.police = 0; s.fire = 0;
    s.jail = 0; s.leisure = 0; s.transit = 0; s.parking = 0;
    s.commerce = 0; s.beauty = 0; s.pollution = 0; s.jobs = 0;
    s.buildingCount = 0;
    let upkeep = 0, blockedRes = 0, totalRes = 0;

    for(const b of state.buildings){
      if(!b) continue;
      const d = BUILDINGS[b.type];
      s.buildingCount++;
      upkeep += d.upkeep || 0;
      s.pollution += d.pollution || 0;

      if(d.residents){
        totalRes += d.residents;
        if(b.active) s.capacity += d.residents * moraleOccupancy(d);
        // Nur fehlende Versorgung zählt als Missstand – zu niedrige Moral
        // für ein Hochhaus darf die Moral nicht zusätzlich drücken.
        if(!b.active) blockedRes += d.residents;
      }
      if(!b.active) continue;

      s.edu      += d.edu      || 0;
      s.health   += d.health   || 0;
      s.police   += d.police   || 0;
      s.fire     += d.fire     || 0;
      s.jail     += d.jail     || 0;
      s.leisure  += d.leisure  || 0;
      s.transit  += d.transit  || 0;
      s.parking  += d.parking  || 0;
      s.commerce += d.commerce || 0;
      s.beauty   += d.beauty   || 0;
      s.jobs     += d.jobs     || 0;
    }

    s.expense.upkeep = upkeep;
    s.unsupplied = totalRes > 0 ? blockedRes / totalRes : 0;
    return s;
  }

  const cov = (have, need) => need <= 0 ? 1 : Math.min(1, have / need);

  /* Verdichtete Bauten füllen sich erst bei guter Stimmung – gleitend,
     damit die Stadt bei knapper Moral nicht schlagartig kippt. */
  function moraleOccupancy(d){
    if(!d.minMorale) return 1;
    const lo = d.minMorale - 20;
    return Math.max(0, Math.min(1, (state.morale - lo) / 20));
  }

  function computeMoraleTarget(){
    const s = state.stats;
    const pop = Math.max(1, state.pop);

    const cEdu     = cov(s.edu,     pop * 0.30);
    const cHealth  = cov(s.health,  pop);
    const cPolice  = cov(s.police,  pop);
    const cFire    = cov(s.fire,    pop);
    const cLeisure = cov(s.leisure, pop * 0.40);
    const cTransit = cov(s.transit, pop * 0.55);
    const cShop    = cov(s.commerce,pop * 0.55);
    const cPark    = cov(s.parking, pop * 0.30);

    let m = 42;
    m += 12 * cEdu;
    m += 10 * cHealth;
    m +=  5 * cPolice;
    m +=  5 * cFire;
    m += 11 * cLeisure;
    m +=  6 * cTransit;
    m +=  7 * cShop;
    m +=  4 * cPark;

    // Schönheit der Stadt
    m += Math.min(6, s.beauty / Math.max(120, pop * 0.9));

    // Steuern: 10 % gelten als "normal".
    // Über 10 % wächst der Unmut überproportional – irgendwann kippt die Stadt.
    const t = state.taxRes;
    m -= t > 10 ? Math.pow(t - 10, 1.45) * 0.75 : (t - 10) * 0.5;
    m -= Math.max(0, state.taxCom - 14) * 0.4;

    // Kriminalität
    m -= Math.min(22, s.crime * 0.16);

    // Umweltverschmutzung
    m -= Math.min(14, s.pollution / Math.max(6, pop / 90));

    // Nicht versorgte Wohnhäuser
    m -= s.unsupplied * 30;

    // Arbeitsplätze (35 % pendeln aus der Stadt heraus)
    const workforce = pop * 0.5;
    const employment = cov(s.jobs + pop * 0.35, workforce);
    s.employment = employment;
    m += 9 * employment - 5;

    // Leere Stadtkasse
    if(state.money < 0) m -= 12;

    return Math.max(0, Math.min(100, m));
  }

  function computeCrime(){
    const s = state.stats;
    const pop = state.pop;
    if(pop < 1){ s.crime = 0; return; }
    // Grundkriminalität pro 1000 Einwohner
    let crime = 26 * (1 + (55 - state.morale) / 70);
    crime *= 1 - 0.72 * cov(s.police, pop);
    crime *= 1 - 0.22 * cov(s.jail, pop * 0.03);
    crime *= 1 - 0.10 * cov(s.edu, pop * 0.30);
    s.crime = Math.max(0, crime);
  }

  function computeFinance(){
    const s = state.stats;
    // Steuerzahlungsmoral: unzufriedene Bürger zahlen deutlich unwilliger
    const willingness = 0.30 + Math.pow(state.morale / 100, 1.2) * 0.85;
    const bankBonus = 1 + Math.min(0.09, countActive('bank') * 0.03);

    s.income.res = state.pop * CONFIG.INCOME_PER_CITIZEN * (state.taxRes / 100)
                   * willingness * bankBonus;
    s.income.com = s.commerce * CONFIG.REVENUE_PER_COMMERCE * (state.taxCom / 100)
                   * (0.6 + state.morale / 200) * bankBonus;
    s.income.total = s.income.res + s.income.com;

    s.expense.power = s.power.used * CONFIG.PRICE_POWER;
    s.expense.water = s.water.used * CONFIG.PRICE_WATER;
    s.expense.total = s.expense.upkeep + s.expense.power + s.expense.water;

    s.balance = s.income.total - s.expense.total;
  }

  function countActive(type){
    let n = 0;
    for(const b of state.buildings) if(b && b.type === type && b.active) n++;
    return n;
  }

  /* ---------------------------------------------------------
     Ein Spieltag
     --------------------------------------------------------- */
  const events = [];
  function emit(text, kind){ events.push({ text, kind: kind || 'info' }); }
  function drainEvents(){ const e = events.slice(); events.length = 0; return e; }

  function tickDay(){
    state.day++;

    collect();
    computeCrime();

    const target = computeMoraleTarget();
    state.morale += (target - state.morale) * 0.09;
    state.morale = Math.max(0, Math.min(100, state.morale));
    state.stats.morale = state.morale;

    // Zuzug / Wegzug
    const attract = Math.min(1, 0.12 + (state.morale / 100) * 1.05);
    const popTarget = state.stats.capacity * attract;
    const delta = (popTarget - state.pop) * (popTarget > state.pop ? 0.055 : 0.09);
    state.pop = Math.max(0, state.pop + delta);
    state.stats.pop = Math.floor(state.pop);

    computeFinance();
    state.money += state.stats.balance / CONFIG.DAYS_PER_MONTH;

    distributeResidents();
    checkAlerts();

    if(state.day % 5 === 0){
      state.history.pop.push(Math.floor(state.pop));
      state.history.morale.push(Math.round(state.morale));
      state.history.money.push(Math.round(state.money));
      const cap = 240;
      for(const k of ['pop','morale','money'])
        if(state.history[k].length > cap) state.history[k].shift();
    }
  }

  /* Einwohner auf die Wohnhäuser verteilen (nur für die Anzeige) */
  function distributeResidents(){
    const cap = state.stats.capacity;
    const ratio = cap > 0 ? Math.min(1, state.pop / cap) : 0;
    for(const b of state.buildings){
      if(!b) continue;
      const d = BUILDINGS[b.type];
      if(!d.residents) continue;
      b.residents = b.active
        ? Math.round(d.residents * moraleOccupancy(d) * ratio)
        : 0;
    }
  }

  /* Warnmeldungen */
  const alertState = { power:false, water:false, money:false, road:false,
                       morale:false, jail:false, stranded:false };

  function checkAlerts(){
    const s = state.stats;

    const stranded = s.power.stranded + s.water.stranded;
    if(stranded > 0 && !alertState.stranded){
      emit('🔌 Ein Kraftwerk/Wasserwerk hängt an keinem Netz – mit Stromkabel oder Straße verbinden.', 'warn');
      alertState.stranded = true;
    } else if(stranded === 0) alertState.stranded = false;

    const powerShort = s.power.demand > s.power.supply + 0.001;
    if(powerShort && !alertState.power){
      emit('⚡ Stromausfall! Der Bedarf übersteigt die Erzeugung.', 'bad');
      alertState.power = true;
    } else if(!powerShort) alertState.power = false;

    const waterShort = s.water.demand > s.water.supply + 0.001;
    if(waterShort && !alertState.water){
      emit('💧 Wassermangel! Baue Pumpen oder einen Wasserturm.', 'bad');
      alertState.water = true;
    } else if(!waterShort) alertState.water = false;

    if(state.money < 0 && !alertState.money){
      emit('💸 Die Stadtkasse ist im Minus!', 'bad');
      alertState.money = true;
    } else if(state.money >= 0) alertState.money = false;

    let unconnected = 0;
    for(const b of state.buildings) if(b && !b.roadOK) unconnected++;
    if(unconnected > 0 && !alertState.road){
      emit(`🛣️ ${unconnected} Gebäude ohne Straßenanschluss.`, 'warn');
      alertState.road = true;
    } else if(unconnected === 0) alertState.road = false;

    if(state.morale < 30 && !alertState.morale){
      emit('😠 Die Einwohner sind unzufrieden – sie ziehen weg.', 'warn');
      alertState.morale = true;
    } else if(state.morale > 40) alertState.morale = false;

    if(s.crime > 45 && !alertState.jail){
      emit('🚨 Hohe Kriminalität! Mehr Polizei nötig.', 'warn');
      alertState.jail = true;
    } else if(s.crime < 30) alertState.jail = false;
  }

  /* ---------------------------------------------------------
     Datum
     --------------------------------------------------------- */
  function dateLabel(){
    const months = Math.floor(state.day / CONFIG.DAYS_PER_MONTH);
    const y = Math.floor(months / 12) + 1;
    const m = months % 12;
    return `${MONTH_NAMES[m]} ${String(y).padStart(4,'0')}`;
  }

  /* ---------------------------------------------------------
     Speichern / Laden
     --------------------------------------------------------- */
  const SAVE_KEY = 'stadtbauer.save.v1';

  function save(){
    const data = {
      v: 1,
      seed: state.seed,
      tiles: Array.from(state.tiles),
      buildings: state.buildings.filter(Boolean).map(b => ({
        t: b.type, x: b.x, y: b.y, pt: b.prevTerrain
      })),
      money: state.money,
      day: state.day,
      taxRes: state.taxRes,
      taxCom: state.taxCom,
      pop: state.pop,
      morale: state.morale,
      start: state.start,
    };
    try{
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    }catch(e){
      return false;
    }
  }

  function hasSave(){
    try{ return !!localStorage.getItem(SAVE_KEY); }catch(e){ return false; }
  }

  function load(){
    let data;
    try{ data = JSON.parse(localStorage.getItem(SAVE_KEY)); }catch(e){ return false; }
    if(!data || !data.tiles) return false;

    state.seed = data.seed;
    state.tiles = Uint8Array.from(data.tiles);
    state.occ = new Int32Array(N).fill(-1);
    state.buildings = [];
    state.start = data.start || [Math.floor(W/2), Math.floor(H/2)];

    for(const sb of data.buildings){
      const d = BUILDINGS[sb.t];
      if(!d) continue;
      // Terrain steht bereits richtig in der Datei – direkt eintragen
      const b = {
        type: sb.t, x: sb.x, y: sb.y, w: d.size[0], h: d.size[1],
        built: 0, roadOK:false, powered:false, watered:false, active:false,
        residents:0, prevTerrain: sb.pt || null,
      };
      const id = state.buildings.push(b) - 1;
      b.id = id;
      forEachTile(b, (tx,ty,i) => { state.occ[i] = id; });
    }

    state.money = data.money;
    state.day = data.day;
    state.taxRes = data.taxRes;
    state.taxCom = data.taxCom;
    state.pop = data.pop;
    state.morale = data.morale;
    state.stats = emptyStats();
    state.history = { pop:[], morale:[], money:[] };

    updateSupply();
    collect();
    computeCrime();
    computeFinance();
    return true;
  }

  /* ---------------------------------------------------------
     Öffentliche Schnittstelle
     --------------------------------------------------------- */
  return {
    state, W, H,
    idx, inBounds, terrainAt, buildingAt, isWaterTile, isRoadTile, isPowerTile,
    forEachTile,
    newGame, place, fits, priceOf, placementError, demolishAt, cancelPlace,
    updateSupply, tickDay, dateLabel,
    collect, countActive,
    drainEvents, emit,
    save, load, hasSave,
  };
})();
