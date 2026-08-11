#!/usr/bin/env node
/* ==========================================================
   build-single.js – erzeugt stadtbauer.html
   ----------------------------------------------------------
   Bettet css/style.css und alle js/*.js in index.html ein, so
   dass eine einzige Datei entsteht, die man ohne Server und
   ohne Nebendateien öffnen kann.

   Aufruf:  node build-single.js
   ========================================================== */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');

// Stylesheet einbetten
html = html.replace(
  '<link rel="stylesheet" href="css/style.css">',
  '<style>\n' + read('css/style.css') + '\n</style>'
);

// Skripte in der im HTML angegebenen Reihenfolge einbetten
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  '<script>\n/* ===== ' + src + ' ===== */\n' + read(src) + '\n</script>'
);

html = html.replace(
  '<title>Stadtbauer – Mobile City Builder</title>',
  '<title>Stadtbauer – Mobile City Builder</title>\n' +
  '<!-- Einzeldatei-Version, erzeugt von build-single.js. Nicht von Hand bearbeiten. -->'
);

// Kontrolle: es darf nichts mehr nachgeladen werden
const external = [...html.matchAll(/(?:src|href)="(?!data:)([^"]+)"/g)].map(m => m[1]);
if(external.length){
  console.error('Fehler: es werden noch externe Dateien geladen:', external);
  process.exit(1);
}

const out = path.join(root, 'stadtbauer.html');
fs.writeFileSync(out, html);
console.log('stadtbauer.html geschrieben (' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB)');
