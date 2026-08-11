# 🏙️ Stadtbauer

Ein Städtebau-Spiel im Stil von *Cities: Skylines*, gebaut fürs Handy im **Hochformat**.
Läuft komplett im Browser – kein Server, kein Build-Schritt, keine Abhängigkeiten.

## Starten

`index.html` im Browser öffnen. Auf dem Handy: Seite öffnen → „Zum Home-Bildschirm hinzufügen“,
dann läuft es im Vollbild wie eine App.

Lokal mit Server (empfohlen, damit `localStorage` sicher funktioniert):

```bash
npx http-server . -p 8080
# dann http://localhost:8080 öffnen
```

## Steuerung

| Geste | Wirkung |
|---|---|
| Einen Finger ziehen | Karte verschieben |
| Zwei Finger | Zoomen und verschieben |
| Antippen | Bauen bzw. Gebäude-Infos anzeigen |
| Ziehen (bei Straße, Kabel, Brücke, Baum) | Reihe durchgehend bauen |
| „Abriss“ + antippen | Gebäude abreißen (35 % Erstattung) |

Setzt du beim Ziehen einen zweiten Finger auf, wird die eben gebaute Kachel automatisch
zurückgenommen – so kostet ein versehentlicher Zoom nichts.

## Spielprinzip

### Geld
Einnahmen kommen aus **Wohnsteuer** und **Gewerbesteuer**, beide im Steuer-Menü frei
einstellbar (0–40 %). Ausgaben sind Unterhalt der Gebäude sowie Strom- und Wasserkosten
nach tatsächlichem Verbrauch. Abgerechnet wird nur, was auch läuft – ein Haus ohne Strom
steht auf keiner Rechnung.

### Moral
Die Stimmung der Einwohner (0–100 %) ist der zentrale Regelkreis:

**steigt durch** Schulen · Krankenhäuser · Polizei · Feuerwehr · Freizeit · ÖPNV ·
Einkaufsmöglichkeiten · Parkplätze · schöne Gebäude · Arbeitsplätze

**sinkt durch** hohe Steuern · Kriminalität · Umweltverschmutzung ·
fehlenden Strom/Wasser · leere Stadtkasse

Die Moral bestimmt zwei Dinge:

1. **Wie viele Leute einziehen** – bei schlechter Stimmung bleiben Wohnungen leer,
   und Hochhäuser füllen sich erst ab etwa 55 % Moral.
2. **Wie willig Steuern gezahlt werden** – unzufriedene Bürger zahlen deutlich weniger,
   als der Steuersatz eigentlich hergibt.

Deshalb bringen sehr hohe Steuern am Ende *weniger* Geld: Die Bürger ziehen weg und
die Zahlungsmoral bricht ein. Der wirtschaftliche Sweet Spot liegt in einer gut
ausgebauten Stadt bei etwa 15–20 %; darüber kippt sie.

### Straßen, Strom und Wasser
* **Jedes Gebäude braucht eine angrenzende Straße.** Ohne Anschluss steht es still (🚫).
* **Strom** fließt durch Straßen, Brücken und Stromkabel. Kraftwerke selbst brauchen
  keine Straße – ein Kabel genügt.
* **Wasser** läuft durch Rohre unter den **Straßen** – Kabel transportieren kein Wasser.
* **Wasserpumpen und Wasserkraftwerke** müssen ans Wasser grenzen (Fluss, See oder
  selbst gebauter Baggersee).
* Bei Knappheit werden zuerst Wasser- und Stromwerke versorgt, dann Gesundheit,
  Sicherheit, Bildung, ÖPNV, Gewerbe und zuletzt Wohnhäuser.
* Ein Kraftwerk in einem Netzabschnitt ohne Abnehmer wird als **nicht angeschlossen**
  (🔌) markiert und zählt nicht zur verfügbaren Leistung.

Der Fluss teilt die Karte – ohne **Brücken** entstehen getrennte Versorgungsnetze.
Das ist der häufigste Grund dafür, dass ein halbes Stadtviertel dunkel bleibt.

### Kriminalität
Wächst mit sinkender Moral und mit der Einwohnerzahl, sinkt durch Polizeiwachen,
Gefängnisse und Bildung. Hohe Kriminalität drückt wiederum die Moral.

## Gebäude

| Kategorie | Gebäude |
|---|---|
| **Wege & Netz** | Straße, Stromkabel, Brücke |
| **Wohnen** | Familienhaus, Reihenhaus, Wohnblock, Hochhaus |
| **Strom** | Windkraftwerk, Solarkraftwerk, Kohlekraftwerk, Wasserkraftwerk |
| **Wasser** | Wasserpumpe, Wasserturm, Kläranlage |
| **Bildung** | Kindergarten, Grundschule, Gymnasium, Universität, Bibliothek |
| **Gesundheit** | Arztpraxis, Krankenhaus, Apotheke |
| **Sicherheit** | Polizeiwache, Feuerwache, Gefängnis |
| **Freizeit** | Spielplatz, Schwimmbad (klein/groß), Baggersee, Sportplatz, Stadtpark, Kino |
| **ÖPNV** | Bushaltestelle, Busdepot, Tramhaltestelle, Bahnhof |
| **Gewerbe** | Supermarkt, Kaufhaus, Bank, Bürogebäude, Wochenmarkt |
| **Parken** | Parkplatz, Parkhaus |
| **Deko** | Brunnen, Statue, Blumenbeet, Baum, Stadtplatz |

## Tipps für den Start

1. Straßen ziehen, ein **Windkraftwerk** und eine **Wasserpumpe** ans Wasser setzen.
2. Erst dann Wohnhäuser – jedes an eine Straße.
3. Sobald die Stadt wächst: Grundschule, Feuerwache, Supermarkt. Das hebt die Moral
   und damit die Steuereinnahmen deutlich mehr, als ein höherer Steuersatz es könnte.
4. Die **Versorgungs-Ansicht** im Menü zeigt farbig, woran es hakt.
5. Rot in der Monatsbilanz? Meist stehen zu viele Kraftwerke herum oder ein Viertel
   hängt am falschen Netz.

## Speichern
Über *Menü → Speichern* im `localStorage` des Browsers, zusätzlich alle drei Spieljahre
automatisch. Beim Start wird ein vorhandener Spielstand geladen.

## Projektstruktur

```
index.html          Aufbau der Oberfläche
css/style.css       Mobiles Layout, Bottom-Sheets, Bedienelemente
js/config.js        Spielkonstanten und Gebäudekatalog
js/terrain.js       Kartengenerierung (Fluss, Seen, Wälder)
js/game.js          Zustand, Bauen, Versorgungsnetze, Simulation
js/render.js        Canvas-Zeichnung und Kamera
js/input.js         Touch-, Maus- und Gestensteuerung
js/ui.js            HUD, Menüs, Statistik, Dialoge
js/main.js          Start und Hauptschleife
```

Alle Werte für Balance und neue Gebäude stehen in `js/config.js` – dort lässt sich das
Spiel ohne Eingriff in die Logik erweitern.
