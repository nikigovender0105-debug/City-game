/* ==========================================================
   main.js – Start und Hauptschleife
   ========================================================== */

(function(){

  let last = 0;
  let acc = 0;          // aufgelaufene Realzeit für Spieltage
  let hudAcc = 0;
  let autosaveDay = 0;

  function boot(){
    // Spielstand laden, sonst neue Stadt
    if(Game.hasSave()){
      Game.newGame();          // Terrain-Grundgerüst anlegen
      if(!Game.load()) Game.newGame();
    }else{
      Game.newGame();
    }

    const canvas = document.getElementById('game');
    Render.init(canvas);
    Input.init(canvas);
    UI.init();
    UI.syncControls();
    Game.collect();
    Game.updateSupply();
    UI.updateHUD();

    if(!Game.hasSave()){
      UI.toast('🏙️ Willkommen! Baue Straßen, Häuser und ein Kraftwerk.', 'good');
      setTimeout(() => UI.toast('💡 Tipp: Jedes Gebäude braucht eine angrenzende Straße.', 'info'), 2600);
    }

    // Verhindert versehentliches Scrollen/Zoomen der Seite auf Mobilgeräten
    document.addEventListener('touchmove', e => {
      if(e.target.closest('.sheet-body, .build-grid, .cat-tabs')) return;
      e.preventDefault();
    }, { passive:false });
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('dblclick', e => e.preventDefault(), { passive:false });

    requestAnimationFrame(loop);
  }

  function loop(now){
    if(!last) last = now;
    let dt = now - last;
    last = now;
    if(dt > 250) dt = 250;         // nach Pausen nicht aufholen

    const speed = Game.state.speed;
    if(speed > 0){
      acc += dt * speed;
      const step = CONFIG.DAY_MS;
      let guard = 0;
      while(acc >= step && guard++ < 12){
        acc -= step;
        Game.tickDay();
      }
      for(const ev of Game.drainEvents()) UI.toast(ev.text, ev.kind);
    }

    hudAcc += dt;
    if(hudAcc > 220){
      hudAcc = 0;
      UI.updateHUD();
    }

    // Alle drei Spieljahre automatisch sichern
    if(Game.state.day - autosaveDay >= CONFIG.DAYS_PER_MONTH * 36){
      autosaveDay = Game.state.day;
      Game.save();
    }

    Render.draw();
    requestAnimationFrame(loop);
  }

  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
