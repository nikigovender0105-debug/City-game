/* ==========================================================
   ui.js – HUD, Baumenü, Steuern, Statistik, Dialoge
   ========================================================== */

const UI = (() => {

  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  let activeCat = 'infra';
  let openPanel = null;

  /* ---------------------------------------------------------
     Formatierung
     --------------------------------------------------------- */
  const nf = new Intl.NumberFormat('de-DE');
  const fmt = n => nf.format(Math.round(n));
  function money(n){
    const a = Math.abs(n);
    if(a >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + ' Mio €';
    if(a >= 1e4) return fmt(n) + ' €';
    return fmt(n) + ' €';
  }
  const pct = n => Math.round(n * 100) + '%';

  /* ---------------------------------------------------------
     Initialisierung
     --------------------------------------------------------- */
  function init(){
    buildCategoryTabs();
    buildGrid();
    wireNav();
    wireTax();
    wireMenu();
    wireDialog();
    wireInputCallbacks();
    updateHUD();
  }

  /* ---------------- Navigation & Sheets ---------------- */
  function wireNav(){
    $$('#bottombar .nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.dataset.tool === 'bulldoze'){
          const cur = Input.getMode();
          if(cur.mode === 'bulldoze') setTool(null);
          else setBulldoze();
          return;
        }
        togglePanel(btn.dataset.panel);
      });
    });

    $$('.sheet-close').forEach(b => b.addEventListener('click', () => closePanel()));
    $('#scrim').addEventListener('click', () => closePanel());

    $('#toolCancel').addEventListener('click', () => setTool(null));

    $$('#speedCtl .spd').forEach(b => {
      b.addEventListener('click', () => {
        Game.state.speed = parseInt(b.dataset.speed, 10);
        $$('#speedCtl .spd').forEach(x => x.classList.toggle('active', x === b));
      });
    });
  }

  function togglePanel(name){
    if(openPanel === name){ closePanel(); return; }
    closePanel();
    const el = $('#panel-' + name);
    if(!el) return;
    el.classList.add('open');
    $('#scrim').classList.add('on');
    openPanel = name;
    $$('#bottombar .nav-btn').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
    if(name === 'stats') renderStats();
    if(name === 'tax')  renderBudget();
    if(name === 'build') buildGrid();
  }

  function closePanel(){
    $$('.sheet').forEach(s => s.classList.remove('open'));
    $('#scrim').classList.remove('on');
    openPanel = null;
    $$('#bottombar .nav-btn').forEach(b => {
      if(b.dataset.panel) b.classList.remove('active');
    });
  }

  /* ---------------- Baumenü ---------------- */
  function buildCategoryTabs(){
    const box = $('#catTabs');
    box.innerHTML = '';
    CATEGORIES.forEach(c => {
      const el = document.createElement('button');
      el.className = 'cat' + (c.id === activeCat ? ' active' : '');
      el.innerHTML = `<span>${c.icon}</span>${c.name}`;
      el.addEventListener('click', () => {
        activeCat = c.id;
        $$('#catTabs .cat').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        buildGrid();
      });
      box.appendChild(el);
    });
  }

  function buildGrid(){
    const box = $('#buildGrid');
    box.innerHTML = '';
    const money0 = Game.state.money;

    BUILD_ORDER.filter(k => BUILDINGS[k].cat === activeCat).forEach(key => {
      const d = BUILDINGS[key];
      const card = document.createElement('button');
      const afford = money0 >= d.cost;
      card.className = 'bcard' + (afford ? '' : ' disabled');

      const bits = [];
      if(d.size[0] > 1 || d.size[1] > 1) bits.push(`${d.size[0]}×${d.size[1]}`);
      if(d.residents) bits.push(`👪${d.residents}`);
      if(d.powerGen)  bits.push(`⚡+${d.powerGen}`);
      else if(d.power) bits.push(`⚡${d.power}`);
      if(d.waterGen)  bits.push(`💧+${d.waterGen}`);
      else if(d.water) bits.push(`💧${d.water}`);

      card.innerHTML =
        `<span class="bi">${d.icon}</span>` +
        `<span class="bn">${d.name}</span>` +
        `<span class="bc">${fmt(d.cost)} €</span>` +
        `<span class="bs">${bits.join(' · ')}</span>`;

      card.addEventListener('click', () => {
        setTool(key);
        closePanel();
      });
      box.appendChild(card);
    });
  }

  /* ---------------- Werkzeug ---------------- */
  function setTool(type){
    if(!type){
      Input.setMode('none');
      $('#toolbar').classList.add('hidden');
      $$('#bottombar .nav-btn').forEach(b => { if(b.dataset.tool) b.classList.remove('active'); });
      hideHint();
      return;
    }
    const d = BUILDINGS[type];
    Input.setMode('build', type);
    $('#toolbar').classList.remove('hidden');
    $('#toolIcon').textContent = d.icon;
    $('#toolName').textContent = d.name;

    const meta = [`${fmt(d.cost)} €`];
    if(d.upkeep) meta.push(`${fmt(d.upkeep)} €/Mon`);
    if(d.powerGen) meta.push(`⚡+${d.powerGen}`); else if(d.power) meta.push(`⚡${d.power}`);
    if(d.waterGen) meta.push(`💧+${d.waterGen}`); else if(d.water) meta.push(`💧${d.water}`);
    if(d.needsWater) meta.push('ans Wasser bauen');
    $('#toolMeta').textContent = meta.join(' · ');

    $$('#bottombar .nav-btn').forEach(b => { if(b.dataset.tool) b.classList.remove('active'); });
    showHint(d.drag ? 'Ziehen zum Bauen · 2 Finger = Karte bewegen' : 'Antippen zum Bauen');
  }

  function setBulldoze(){
    Input.setMode('bulldoze');
    $('#toolbar').classList.remove('hidden');
    $('#toolIcon').textContent = '🚜';
    $('#toolName').textContent = 'Abrissbirne';
    $('#toolMeta').textContent = `Erstattung ${Math.round(CONFIG.DEMOLISH_REFUND * 100)} % der Baukosten`;
    $$('#bottombar .nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === 'bulldoze'));
    closePanel();
    showHint('Gebäude antippen zum Abreißen');
  }

  /* ---------------- Hinweisblase ---------------- */
  let hintTimer = null;
  function showHint(text){
    const el = $('#hintBubble');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  }
  function hideHint(){ $('#hintBubble').classList.add('hidden'); }

  /* ---------------- Meldungen ---------------- */
  function toast(text, kind){
    const box = $('#ticker');
    const el = document.createElement('div');
    el.className = 'msg ' + (kind || '');
    el.textContent = text;
    box.appendChild(el);
    while(box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => {
      el.style.transition = 'opacity .4s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 420);
    }, 3600);
  }

  /* ---------------- Eingabe-Rückrufe ---------------- */
  let lastFail = 0;
  function wireInputCallbacks(){
    Input.cb.onPlaced = () => { updateHUD(); };
    Input.cb.onFail = reason => {
      const now = performance.now();
      if(now - lastFail < 1200) return;
      lastFail = now;
      toast('⚠️ ' + reason, 'warn');
    };
    Input.cb.onDemolish = res => {
      if(res.name) toast(`🚜 ${res.name} abgerissen (+${fmt(res.refund)} €)`, 'info');
      updateHUD();
    };
    Input.cb.onTap = b => { if(b) showInfo(b); else closeInfo(); };
  }

  /* ---------------- Kopfleiste ---------------- */
  function updateHUD(){
    const st = Game.state, s = st.stats;

    const mEl = $('#statMoney');
    mEl.querySelector('.val').textContent = money(st.money);
    mEl.classList.toggle('broke', st.money < 0);

    $('#statPop').querySelector('.val').textContent = fmt(st.pop);

    const mo = Math.round(st.morale);
    const moV = $('#statMorale').querySelector('.val');
    moV.textContent = mo + '%';
    moV.className = 'val' + (mo < 30 ? ' bad' : mo < 50 ? ' warn' : '');
    $('#statMorale').querySelector('.ic').textContent =
      mo >= 70 ? '😀' : mo >= 50 ? '🙂' : mo >= 30 ? '😐' : '😠';

    // Anzeige immer "verfügbar/benötigt" – wie in der Stadtübersicht
    const pV = $('#statPower').querySelector('.val');
    pV.textContent = `${fmt(s.power.supply)}/${fmt(s.power.demand)}`;
    pV.className = 'val' + (s.power.demand > s.power.supply ? ' bad' : '');

    const wV = $('#statWater').querySelector('.val');
    wV.textContent = `${fmt(s.water.supply)}/${fmt(s.water.demand)}`;
    wV.className = 'val' + (s.water.demand > s.water.supply ? ' bad' : '');

    $('#dateLabel').textContent = Game.dateLabel();
    const bal = $('#balanceLabel');
    const b = s.balance;
    bal.textContent = (b >= 0 ? '+' : '') + money(b) + '/Mon';
    bal.className = b >= 0 ? 'pos' : 'neg';

    if(openPanel === 'tax') renderBudget();
    if(openPanel === 'stats') renderStats();
  }

  /* ---------------- Steuern ---------------- */
  function wireTax(){
    const r = $('#taxRes'), c = $('#taxCom');
    r.value = Game.state.taxRes;
    c.value = Game.state.taxCom;

    const upd = () => {
      Game.state.taxRes = parseInt(r.value, 10);
      Game.state.taxCom = parseInt(c.value, 10);
      $('#taxResVal').textContent = r.value + '%';
      $('#taxComVal').textContent = c.value + '%';
      $('#taxResHint').textContent = taxHint(parseInt(r.value, 10));
      $('#taxComHint').textContent = comHint(parseInt(c.value, 10));
      renderBudget();
    };
    r.addEventListener('input', upd);
    c.addEventListener('input', upd);
    upd();
  }

  function taxHint(t){
    if(t === 0) return 'Keine Steuern – die Einwohner lieben dich, die Kasse leidet.';
    if(t <= 7)  return 'Niedrig – zieht viele Neubürger an.';
    if(t <= 12) return 'Normal – wird von den Einwohnern akzeptiert.';
    if(t <= 20) return 'Hoch – die Moral sinkt spürbar.';
    if(t <= 30) return 'Sehr hoch – Einwohner ziehen weg und zahlen unwilliger.';
    return 'Wucher! Die Stadt wird sich leeren.';
  }
  function comHint(t){
    if(t <= 8)  return 'Unternehmensfreundlich, aber wenig Einnahmen.';
    if(t <= 16) return 'Ausgewogen.';
    if(t <= 25) return 'Hoch – belastet die Stimmung leicht.';
    return 'Sehr hoch – Gewerbe wird unattraktiv.';
  }

  function renderBudget(){
    const s = Game.state.stats;
    const row = (label, val, cls) =>
      `<tr><td>${label}</td><td class="${cls}">${val >= 0 ? '+' : ''}${money(val)}</td></tr>`;

    $('#budgetTable').innerHTML =
      row('Wohnsteuer', s.income.res, 'g') +
      row('Gewerbesteuer', s.income.com, 'g') +
      row('Unterhalt', -s.expense.upkeep, 'r') +
      row('Stromkosten', -s.expense.power, 'r') +
      row('Wasserkosten', -s.expense.water, 'r') +
      `<tr class="total"><td>Monatsbilanz</td><td class="${s.balance >= 0 ? 'g' : 'r'}">` +
      `${s.balance >= 0 ? '+' : ''}${money(s.balance)}</td></tr>`;
  }

  /* ---------------- Statistik ---------------- */
  function bar(label, have, need, unit){
    const ratio = need <= 0 ? 1 : Math.min(1, have / need);
    const good = unit === 'pct' ? 0.7 : 0.9;
    const cls = ratio >= good ? 'ok' : ratio >= 0.5 ? 'warn' : 'bad';
    const txt = unit === 'pct'
      ? pct(ratio)
      : `${fmt(have)} / ${fmt(need)}`;
    return `<div class="bar ${cls}"><i style="width:${(ratio * 100).toFixed(1)}%"></i>` +
           `<span><b>${label}</b><b>${txt}</b></span></div>`;
  }

  function renderStats(){
    const st = Game.state, s = st.stats;
    const pop = Math.max(1, st.pop);

    let html = '';

    html += '<div class="stat-block"><h5>Bevölkerung</h5>';
    html += `<div class="kv"><span>Einwohner</span><b>${fmt(st.pop)}</b></div>`;
    html += `<div class="kv"><span>Wohnplätze</span><b>${fmt(s.capacity)}</b></div>`;
    html += `<div class="kv"><span>Auslastung</span><b>${s.capacity ? pct(st.pop / s.capacity) : '–'}</b></div>`;
    html += `<div class="kv"><span>Gebäude</span><b>${fmt(s.buildingCount)}</b></div>`;
    html += '</div>';

    html += '<div class="stat-block"><h5>Stimmung</h5>';
    html += bar('Moral', st.morale, 100, 'pct');
    html += `<div class="kv"><span>Kriminalität</span><b>${s.crime.toFixed(1)} / 1000 Einw.</b></div>`;
    html += `<div class="kv"><span>Beschäftigung</span><b>${pct(s.employment)}</b></div>`;
    html += `<div class="kv"><span>Verschmutzung</span><b>${fmt(s.pollution)}</b></div>`;
    html += `<div class="kv"><span>Schönheit</span><b>${fmt(s.beauty)}</b></div>`;
    html += '</div>';

    html += '<div class="stat-block"><h5>Versorgung</h5>';
    html += bar('⚡ Strom', s.power.supply, s.power.demand);
    html += bar('💧 Wasser', s.water.supply, s.water.demand);
    if(s.power.stranded > 0)
      html += `<div class="kv"><span>⚡ nicht angeschlossen</span><b class="r">${fmt(s.power.stranded)}</b></div>`;
    if(s.water.stranded > 0)
      html += `<div class="kv"><span>💧 nicht angeschlossen</span><b class="r">${fmt(s.water.stranded)}</b></div>`;
    html += '</div>';

    html += '<div class="stat-block"><h5>Dienstleistungen</h5>';
    html += bar('🎓 Bildung', s.edu, pop * 0.30);
    html += bar('🏥 Gesundheit', s.health, pop);
    html += bar('🚓 Polizei', s.police, pop);
    html += bar('🚒 Feuerwehr', s.fire, pop);
    html += bar('🎡 Freizeit', s.leisure, pop * 0.40);
    html += bar('🚌 ÖPNV', s.transit, pop * 0.55);
    html += bar('🛒 Gewerbe', s.commerce, pop * 0.55);
    html += bar('🅿️ Parkplätze', s.parking, pop * 0.30);
    html += bar('🔒 Haftplätze', s.jail, pop * 0.03);
    html += '</div>';

    html += '<div class="stat-block"><h5>Haushalt</h5>';
    html += `<div class="kv"><span>Einnahmen</span><b class="g">+${money(s.income.total)}</b></div>`;
    html += `<div class="kv"><span>Ausgaben</span><b class="r">-${money(s.expense.total)}</b></div>`;
    html += `<div class="kv"><span>Bilanz</span><b class="${s.balance >= 0 ? 'g' : 'r'}">${money(s.balance)}</b></div>`;
    html += '</div>';

    $('#statsBody').innerHTML = html;
  }

  /* ---------------- Gebäude-Info ---------------- */
  let infoBuilding = null;

  function wireDialog(){
    $('#infoClose').addEventListener('click', closeInfo);
    $('#infoDemolish').addEventListener('click', () => {
      if(!infoBuilding) return;
      const res = Game.demolishAt(infoBuilding.x, infoBuilding.y);
      if(res.ok) toast(`🚜 ${res.name} abgerissen (+${fmt(res.refund)} €)`, 'info');
      Render.setSelected(null);
      closeInfo();
      updateHUD();
    });
  }

  function showInfo(b){
    const d = BUILDINGS[b.type];
    infoBuilding = b;
    $('#infoTitle').textContent = `${d.icon} ${d.name}`;

    const rows = [];
    if(d.desc) rows.push(`<p style="color:#93a0b8;margin:0 0 10px">${d.desc}</p>`);

    const status = b.active
      ? '<b class="g">In Betrieb</b>'
      : !b.roadOK ? '<b class="r">Kein Straßenanschluss</b>'
      : !b.powered ? '<b class="r">Kein Strom</b>'
      : '<b class="r">Kein Wasser</b>';
    rows.push(`<div class="kv"><span>Status</span>${status}</div>`);

    if(d.residents) rows.push(`<div class="kv"><span>Bewohner</span><b>${fmt(b.residents)} / ${fmt(d.residents)}</b></div>`);
    if(d.minMorale) rows.push(`<div class="kv"><span>Benötigte Moral</span><b>${d.minMorale}%</b></div>`);
    if(d.powerGen) rows.push(`<div class="kv"><span>Stromerzeugung</span><b class="g">+${d.powerGen}</b></div>`);
    if(d.power)    rows.push(`<div class="kv"><span>Stromverbrauch</span><b>${d.power}</b></div>`);
    if(d.waterGen) rows.push(`<div class="kv"><span>Wassererzeugung</span><b class="g">+${d.waterGen}</b></div>`);
    if(d.water)    rows.push(`<div class="kv"><span>Wasserverbrauch</span><b>${d.water}</b></div>`);
    if(d.edu)      rows.push(`<div class="kv"><span>Schulplätze</span><b>${fmt(d.edu)}</b></div>`);
    if(d.health)   rows.push(`<div class="kv"><span>Behandlungsplätze</span><b>${fmt(d.health)}</b></div>`);
    if(d.police)   rows.push(`<div class="kv"><span>Polizei-Abdeckung</span><b>${fmt(d.police)}</b></div>`);
    if(d.fire)     rows.push(`<div class="kv"><span>Brandschutz</span><b>${fmt(d.fire)}</b></div>`);
    if(d.jail)     rows.push(`<div class="kv"><span>Haftplätze</span><b>${fmt(d.jail)}</b></div>`);
    if(d.leisure)  rows.push(`<div class="kv"><span>Freizeitwert</span><b>${fmt(d.leisure)}</b></div>`);
    if(d.transit)  rows.push(`<div class="kv"><span>ÖPNV-Kapazität</span><b>${fmt(d.transit)}</b></div>`);
    if(d.parking)  rows.push(`<div class="kv"><span>Stellplätze</span><b>${fmt(d.parking)}</b></div>`);
    if(d.commerce) rows.push(`<div class="kv"><span>Gewerbeleistung</span><b>${fmt(d.commerce)}</b></div>`);
    if(d.jobs)     rows.push(`<div class="kv"><span>Arbeitsplätze</span><b>${fmt(d.jobs)}</b></div>`);
    if(d.beauty)   rows.push(`<div class="kv"><span>Schönheit</span><b class="${d.beauty > 0 ? 'g' : 'r'}">${d.beauty}</b></div>`);
    if(d.pollution)rows.push(`<div class="kv"><span>Verschmutzung</span><b class="r">${d.pollution}</b></div>`);
    if(d.upkeep)   rows.push(`<div class="kv"><span>Unterhalt</span><b class="r">${money(d.upkeep)}/Mon</b></div>`);

    $('#infoBody').innerHTML = rows.join('');
    $('#infoDialog').classList.remove('hidden');
  }

  function closeInfo(){
    infoBuilding = null;
    $('#infoDialog').classList.add('hidden');
    Render.setSelected(null);
  }

  /* ---------------- Menü ---------------- */
  function wireMenu(){
    $('#btnSave').addEventListener('click', () => {
      const ok = Game.save();
      toast(ok ? '💾 Stadt gespeichert.' : '⚠️ Speichern fehlgeschlagen.', ok ? 'good' : 'bad');
    });

    $('#btnLoad').addEventListener('click', () => {
      if(!Game.hasSave()){ toast('Kein Spielstand gefunden.', 'warn'); return; }
      if(Game.load()){
        Render.rebuildShade();
        Render.centerOn(Game.state.start[0], Game.state.start[1]);
        syncControls();
        updateHUD();
        closePanel();
        toast('📂 Spielstand geladen.', 'good');
      }else toast('⚠️ Laden fehlgeschlagen.', 'bad');
    });

    $('#btnNew').addEventListener('click', () => {
      if(!confirm('Neue Stadt starten? Der aktuelle Fortschritt geht verloren (außer du hast gespeichert).')) return;
      Game.newGame();
      Render.rebuildShade();
      Render.centerOn(Game.state.start[0], Game.state.start[1]);
      setTool(null);
      syncControls();
      updateHUD();
      closePanel();
      toast('🌱 Neue Stadt gegründet. Viel Erfolg!', 'good');
    });

    $('#optGrid').addEventListener('change', e => { Render.opts.grid = e.target.checked; });
    $('#optOverlay').addEventListener('change', e => { Render.opts.overlay = e.target.checked; });
  }

  function syncControls(){
    $('#taxRes').value = Game.state.taxRes;
    $('#taxCom').value = Game.state.taxCom;
    $('#taxResVal').textContent = Game.state.taxRes + '%';
    $('#taxComVal').textContent = Game.state.taxCom + '%';
  }

  return { init, updateHUD, toast, showHint, setTool, syncControls, closeInfo };
})();
