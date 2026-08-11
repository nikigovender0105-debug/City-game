/* ==========================================================
   config.js – Spielkonstanten & Gebäudekatalog
   ========================================================== */

const CONFIG = {
  MAP_W: 46,
  MAP_H: 74,
  TILE: 26,             // Basis-Pixelgröße einer Kachel
  MIN_ZOOM: 0.55,
  MAX_ZOOM: 2.6,
  START_MONEY: 25000,
  DAY_MS: 900,          // Realzeit pro Spieltag bei Geschwindigkeit 1x
  DAYS_PER_MONTH: 30,

  // Preise für Betriebsmittel (€ pro Einheit und Monat)
  PRICE_POWER: 2.4,
  PRICE_WATER: 1.8,

  // Durchschnittliches Monatseinkommen eines Einwohners (Bemessungsgrundlage)
  INCOME_PER_CITIZEN: 145,
  // Umsatz-Bemessungsgrundlage je Gewerbe-Punkt
  REVENUE_PER_COMMERCE: 1.15,

  DEMOLISH_REFUND: 0.35, // Anteil der Baukosten, den man beim Abriss zurückbekommt
};

/* ---------- Terrain ---------- */
const T = { GRASS:0, WATER:1, TREE:2, SAND:3, ROCK:4 };

const TERRAIN_COLORS = {
  [T.GRASS]: '#4a7c46',
  [T.WATER]: '#2c6ea8',
  [T.TREE]:  '#33612f',
  [T.SAND]:  '#c2ab74',
  [T.ROCK]:  '#6e6b63',
};

/* ---------- Kategorien des Baumenüs ---------- */
const CATEGORIES = [
  { id:'infra',  name:'Wege & Netz', icon:'🛣️' },
  { id:'res',    name:'Wohnen',      icon:'🏠' },
  { id:'power',  name:'Strom',       icon:'⚡' },
  { id:'water',  name:'Wasser',      icon:'💧' },
  { id:'edu',    name:'Bildung',     icon:'🎓' },
  { id:'health', name:'Gesundheit',  icon:'🏥' },
  { id:'safety', name:'Sicherheit',  icon:'🚓' },
  { id:'fun',    name:'Freizeit',    icon:'🎡' },
  { id:'transit',name:'ÖPNV',        icon:'🚌' },
  { id:'shop',   name:'Gewerbe',     icon:'🛒' },
  { id:'park',   name:'Parken',      icon:'🅿️' },
  { id:'deco',   name:'Deko',        icon:'⛲' },
];

/*  Gebäudefelder
    ------------------------------------------------------------------
    cat        Kategorie-ID
    cost       Baukosten (€)
    upkeep     Unterhalt (€/Monat)
    size       [Breite, Höhe] in Kacheln
    power      Strombedarf (Einheiten) – negativ wäre Erzeugung, dafür 'powerGen'
    powerGen   Stromerzeugung
    water      Wasserbedarf
    waterGen   Wassererzeugung
    residents  Wohnplätze
    jobs       Arbeitsplätze
    commerce   Gewerbe-Punkte (Basis der Gewerbesteuer)
    edu        Schulplätze
    health     Behandlungsplätze
    police     Polizei-Abdeckung (Einwohner)
    fire       Feuerwehr-Abdeckung (Einwohner)
    jail       Gefängnisplätze
    leisure    Freizeitpunkte
    transit    ÖPNV-Kapazität (Einwohner)
    parking    Parkplätze
    beauty     Schönheit / Attraktivität
    pollution  Umweltverschmutzung
    needsRoad  Straßenanschluss nötig (Standard: true)
    needsWater Muss ans Wasser grenzen
    onWater    Darf/Muss auf Wasser gebaut werden
    net        'road' | 'cable'  (Netzwerkelement statt Gebäude)
*/
const BUILDINGS = {

  /* ---------------- Wege & Netz ---------------- */
  road: {
    name:'Straße', cat:'infra', icon:'🛣️', cost:14, upkeep:0.6,
    size:[1,1], net:'road', color:'#565f70', drag:true,
    desc:'Grundlage von allem. Leitet Verkehr, Strom und (unterirdisch) Wasser.'
  },
  cable: {
    name:'Stromkabel', cat:'infra', icon:'🔌', cost:9, upkeep:0.3,
    size:[1,1], net:'cable', color:'#8a7a4e', drag:true,
    desc:'Überbrückt Strecken ohne Straße. Leitet nur Strom, keinen Verkehr.'
  },
  bridge: {
    name:'Brücke', cat:'infra', icon:'🌉', cost:120, upkeep:2,
    size:[1,1], net:'road', color:'#7d8595', drag:true, onWater:true,
    desc:'Straße über Wasser. Nur auf Wasserkacheln baubar.'
  },

  /* ---------------- Wohnen ---------------- */
  familienhaus: {
    name:'Familienhaus', cat:'res', icon:'🏠', cost:150, upkeep:1,
    size:[1,1], residents:6, power:3, water:4, color:'#c98f5e',
    desc:'Kleines Einfamilienhaus für bis zu 6 Bewohner.'
  },
  reihenhaus: {
    name:'Reihenhaus', cat:'res', icon:'🏘️', cost:420, upkeep:3,
    size:[2,1], residents:20, power:9, water:12, color:'#b8794f',
    desc:'Verdichtetes Wohnen – gutes Verhältnis von Fläche zu Bewohnern.'
  },
  wohnblock: {
    name:'Wohnblock', cat:'res', icon:'🏢', cost:1100, upkeep:9,
    size:[2,2], residents:64, power:26, water:34, color:'#a8724f',
    desc:'Mehrfamilienhaus mit 64 Wohnplätzen.'
  },
  hochhaus: {
    name:'Hochhaus', cat:'res', icon:'🏙️', cost:3200, upkeep:26,
    size:[2,2], residents:190, power:78, water:96, color:'#8e6a55',
    minMorale:55,
    desc:'Wolkenkratzer. Zieht nur bei guter Stadtmoral (ab 55%) Bewohner an.'
  },

  /* ---------------- Strom ---------------- */
  windkraftwerk: {
    name:'Windkraftwerk', cat:'power', icon:'🌬️', cost:900, upkeep:26,
    size:[1,1], powerGen:60, needsRoad:false, color:'#d7dde8',
    desc:'Sauber und günstig, aber wenig Leistung. Braucht keine Straße – Anschluss per Stromkabel genügt.'
  },
  solarkraftwerk: {
    name:'Solarkraftwerk', cat:'power', icon:'☀️', cost:2200, upkeep:34,
    size:[2,2], powerGen:150, needsRoad:false, color:'#3b4a6b',
    desc:'Saubere Energie auf großer Fläche. Anschluss per Stromkabel genügt.'
  },
  kohlekraftwerk: {
    name:'Kohlekraftwerk', cat:'power', icon:'🏭', cost:3600, upkeep:130,
    size:[3,3], powerGen:800, water:40, pollution:70, needsRoad:false, color:'#4d4a48',
    desc:'Viel Leistung, aber starke Verschmutzung. Braucht Kühlwasser – also einen Straßenanschluss für die Wasserleitung.'
  },
  wasserkraftwerk: {
    name:'Wasserkraftwerk', cat:'power', icon:'🌊', cost:5200, upkeep:95,
    size:[3,2], powerGen:520, needsWater:true, needsRoad:false, color:'#3e6f8e',
    desc:'Starke, saubere Energie. Muss direkt ans Wasser grenzen; Anschluss per Stromkabel genügt.'
  },

  /* ---------------- Wasser ---------------- */
  wasserpumpe: {
    name:'Wasserpumpe', cat:'water', icon:'⛽', cost:700, upkeep:18,
    size:[2,2], waterGen:220, power:14, needsWater:true, color:'#4f8fb3',
    desc:'Fördert Wasser aus See oder Fluss. Muss ans Wasser grenzen.'
  },
  wasserturm: {
    name:'Wasserturm', cat:'water', icon:'🗼', cost:1500, upkeep:30,
    size:[2,2], waterGen:420, power:30, color:'#6aa3c4',
    desc:'Große Wasserversorgung, unabhängig von Gewässern – dafür stromhungrig.'
  },
  klaeranlage: {
    name:'Kläranlage', cat:'water', icon:'♻️', cost:2400, upkeep:60,
    size:[3,2], waterGen:600, power:55, pollution:15, color:'#5d7a6a',
    desc:'Bereitet Abwasser auf – die effizienteste Wasserquelle für Großstädte.'
  },

  /* ---------------- Bildung ---------------- */
  kindergarten: {
    name:'Kindergarten', cat:'edu', icon:'🧸', cost:600, upkeep:22,
    size:[2,1], edu:180, power:8, water:9, leisure:40, color:'#d8a03c',
    desc:'Frühe Betreuung – hebt Moral bei jungen Familien.'
  },
  grundschule: {
    name:'Grundschule', cat:'edu', icon:'🏫', cost:1400, upkeep:52,
    size:[3,2], edu:520, power:22, water:26, color:'#c98b3a',
    desc:'Bildung für die Kleinsten. 520 Schulplätze.'
  },
  gymnasium: {
    name:'Gymnasium', cat:'edu', icon:'🎓', cost:2900, upkeep:105,
    size:[3,3], edu:1100, power:44, water:50, color:'#b57c33',
    desc:'Weiterführende Schule mit 1100 Plätzen.'
  },
  universitaet: {
    name:'Universität', cat:'edu', icon:'🏛️', cost:7500, upkeep:240,
    size:[4,4], edu:2600, power:110, water:120, commerce:150, color:'#a06f2f',
    desc:'Hochschule – starker Moralbonus und zusätzliche Wirtschaftskraft.'
  },
  bibliothek: {
    name:'Bibliothek', cat:'edu', icon:'📚', cost:1200, upkeep:38,
    size:[2,2], edu:300, leisure:120, power:16, water:12, color:'#8f6b3d',
    desc:'Bildung und Freizeit in einem.'
  },

  /* ---------------- Gesundheit ---------------- */
  arztpraxis: {
    name:'Arztpraxis', cat:'health', icon:'🩺', cost:700, upkeep:28,
    size:[1,1], health:260, power:9, water:8, color:'#d76a72',
    desc:'Kleine Grundversorgung für 260 Einwohner.'
  },
  krankenhaus: {
    name:'Krankenhaus', cat:'health', icon:'🏥', cost:4500, upkeep:190,
    size:[3,3], health:2200, power:120, water:130, color:'#c8555f',
    desc:'Große Klinik. Deckt bis zu 2200 Einwohner ab.'
  },
  apotheke: {
    name:'Apotheke', cat:'health', icon:'💊', cost:450, upkeep:14,
    size:[1,1], health:120, commerce:40, power:6, water:4, color:'#d98189',
    desc:'Ergänzt die medizinische Versorgung und bringt etwas Gewerbesteuer.'
  },

  /* ---------------- Sicherheit ---------------- */
  polizeiwache: {
    name:'Polizeiwache', cat:'safety', icon:'🚓', cost:1600, upkeep:70,
    size:[2,2], police:1400, power:28, water:22, color:'#3f5f9e',
    desc:'Senkt die Kriminalität für bis zu 1400 Einwohner.'
  },
  feuerwehr: {
    name:'Feuerwache', cat:'safety', icon:'🚒', cost:1700, upkeep:72,
    size:[2,2], fire:1600, power:28, water:30, color:'#b04630',
    desc:'Schützt vor Bränden. Ohne Feuerwehr sinkt die Moral spürbar.'
  },
  gefaengnis: {
    name:'Gefängnis', cat:'safety', icon:'🔒', cost:4200, upkeep:180,
    size:[3,3], jail:900, power:70, water:80, beauty:-60, color:'#5a5f6b',
    desc:'Nimmt Straftäter auf. Hässlich – senkt die Attraktivität der Umgebung.'
  },

  /* ---------------- Freizeit ---------------- */
  spielplatz: {
    name:'Spielplatz', cat:'fun', icon:'🛝', cost:280, upkeep:8,
    size:[2,2], leisure:150, beauty:40, water:6, color:'#5fae5a',
    desc:'Günstige Freizeitfläche für Familien.'
  },
  schwimmbad_klein: {
    name:'Schwimmbad (klein)', cat:'fun', icon:'🏊', cost:1300, upkeep:48,
    size:[2,2], leisure:420, power:26, water:70, color:'#3f9ec4',
    desc:'Kleines Freibad – beliebt und wasserintensiv.'
  },
  schwimmbad_gross: {
    name:'Schwimmbad (groß)', cat:'fun', icon:'🤽', cost:3800, upkeep:135,
    size:[4,3], leisure:1300, power:75, water:200, color:'#348bb0',
    desc:'Großes Erlebnisbad mit hoher Freizeitwirkung.'
  },
  baggersee: {
    name:'Baggersee', cat:'fun', icon:'🏖️', cost:900, upkeep:12,
    size:[3,3], leisure:520, beauty:150, makesWater:true, needsRoad:false,
    color:'#2c6ea8',
    desc:'Ausgehobener See. Zählt als Gewässer für Pumpen und Wasserkraft.'
  },
  sportplatz: {
    name:'Sportplatz', cat:'fun', icon:'⚽', cost:800, upkeep:24,
    size:[3,2], leisure:380, power:12, water:30, color:'#4e9a4a',
    desc:'Vereinssport für die Nachbarschaft.'
  },
  stadtpark: {
    name:'Stadtpark', cat:'fun', icon:'🌳', cost:600, upkeep:16,
    size:[3,3], leisure:300, beauty:260, water:20, color:'#3f7d3b',
    desc:'Grüne Lunge – viel Schönheit, etwas Freizeit.'
  },
  kino: {
    name:'Kino', cat:'fun', icon:'🎬', cost:1800, upkeep:55,
    size:[2,2], leisure:600, commerce:220, power:40, water:14, color:'#7b4b93',
    desc:'Unterhaltung mit Gewerbesteuer-Einnahmen.'
  },

  /* ---------------- ÖPNV ---------------- */
  bushaltestelle: {
    name:'Bushaltestelle', cat:'transit', icon:'🚏', cost:220, upkeep:14,
    size:[1,1], transit:320, power:2, color:'#3f7f8f',
    desc:'Günstiger Nahverkehr für 320 Einwohner.'
  },
  busdepot: {
    name:'Busdepot', cat:'transit', icon:'🚌', cost:1400, upkeep:60,
    size:[3,2], transit:1400, power:26, water:20, jobs:60, color:'#357487',
    desc:'Erhöht die Reichweite des Busnetzes deutlich.'
  },
  tramhaltestelle: {
    name:'Tramhaltestelle', cat:'transit', icon:'🚊', cost:700, upkeep:30,
    size:[2,1], transit:900, power:14, color:'#2f8a9c',
    desc:'Straßenbahn – leistungsfähiger als der Bus.'
  },
  bahnhof: {
    name:'Bahnhof', cat:'transit', icon:'🚉', cost:4000, upkeep:170,
    size:[4,3], transit:4200, power:90, water:60, commerce:300, jobs:120,
    color:'#2b6b7d',
    desc:'Zuganbindung. Sehr hohe ÖPNV-Kapazität und Wirtschaftsimpuls.'
  },

  /* ---------------- Gewerbe ---------------- */
  supermarkt: {
    name:'Supermarkt', cat:'shop', icon:'🛒', cost:1200, upkeep:38,
    size:[3,2], commerce:520, jobs:60, power:44, water:26, color:'#3f8f6d',
    desc:'Nahversorgung. Hebt die Moral und bringt Gewerbesteuer.'
  },
  kaufhaus: {
    name:'Kaufhaus', cat:'shop', icon:'🏬', cost:4200, upkeep:150,
    size:[4,3], commerce:1900, jobs:220, power:150, water:80, color:'#357f7f',
    desc:'Großes Warenhaus – der stärkste Gewerbesteuerzahler.'
  },
  bank: {
    name:'Bank', cat:'shop', icon:'🏦', cost:3000, upkeep:95,
    size:[2,2], commerce:1100, jobs:120, power:70, water:26, color:'#5c7f9e',
    desc:'Finanzsektor. Erhöht zusätzlich die Steuerzahlungsmoral leicht.'
  },
  buero: {
    name:'Bürogebäude', cat:'shop', icon:'🏢', cost:2400, upkeep:80,
    size:[2,2], commerce:900, jobs:180, power:80, water:34, color:'#4a6f8c',
    desc:'Arbeitsplätze für gebildete Einwohner.'
  },
  markt: {
    name:'Wochenmarkt', cat:'shop', icon:'🥕', cost:400, upkeep:12,
    size:[2,2], commerce:190, jobs:24, leisure:80, water:8, color:'#8a9a3f',
    desc:'Kleiner Markt – günstig, beliebt, ohne Stromanschluss.'
  },

  /* ---------------- Parken ---------------- */
  parkplatz: {
    name:'Parkplatz', cat:'park', icon:'🅿️', cost:120, upkeep:4,
    size:[2,2], parking:160, beauty:-20, color:'#57585c',
    desc:'Billige Stellfläche. Wenig schön, aber nötig.'
  },
  parkhaus: {
    name:'Parkhaus', cat:'park', icon:'🚗', cost:1500, upkeep:45,
    size:[2,2], parking:900, power:22, beauty:-30, commerce:80, color:'#65666b',
    desc:'Viele Stellplätze auf kleiner Fläche.'
  },

  /* ---------------- Deko ---------------- */
  brunnen: {
    name:'Brunnen', cat:'deco', icon:'⛲', cost:180, upkeep:5,
    size:[1,1], beauty:110, water:8, needsRoad:false, color:'#7fa8c4',
    desc:'Klassische Stadtdekoration.'
  },
  statue: {
    name:'Statue', cat:'deco', icon:'🗿', cost:320, upkeep:6,
    size:[1,1], beauty:150, needsRoad:false, color:'#9a9a94',
    desc:'Denkmal – rein dekorativ, aber wirkungsvoll.'
  },
  blumenbeet: {
    name:'Blumenbeet', cat:'deco', icon:'🌷', cost:60, upkeep:2,
    size:[1,1], beauty:55, water:3, needsRoad:false, color:'#b95f8f',
    desc:'Kleine Verschönerung für jede Ecke.'
  },
  baumallee: {
    name:'Baum', cat:'deco', icon:'🌲', cost:40, upkeep:1,
    size:[1,1], beauty:45, needsRoad:false, drag:true, color:'#2f6b32',
    desc:'Bäume pflanzen – zieh die Reihe einfach mit dem Finger.'
  },
  plaza: {
    name:'Stadtplatz', cat:'deco', icon:'🟫', cost:220, upkeep:6,
    size:[2,2], beauty:160, leisure:70, needsRoad:false, color:'#a08b6a',
    desc:'Gepflasterter Platz zum Verweilen.'
  },
};

/* Reihenfolge im Baumenü festhalten */
const BUILD_ORDER = Object.keys(BUILDINGS);

/* Hilfsfunktion: Gebäudedefinition inkl. Standardwerten holen */
function def(type){
  const b = BUILDINGS[type];
  if(!b) return null;
  return b;
}
function bVal(type, key){
  const b = BUILDINGS[type];
  return (b && b[key]) || 0;
}
function needsRoad(type){
  const b = BUILDINGS[type];
  if(!b) return false;
  if(b.net) return false;                 // Straßen/Kabel selbst nicht
  return b.needsRoad !== false;
}
