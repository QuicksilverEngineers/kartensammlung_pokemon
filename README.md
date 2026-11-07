# Pokémon-Kartensammlung (Web-Version)

Statische Website – kein Build-Schritt nötig.

## Auf Vercel veröffentlichen
**Variante A – per Browser:** vercel.com → „Add New… → Project“ → diesen Ordner als Git-Repository importieren (z. B. vorher auf GitHub hochladen). Framework Preset: „Other“, kein Build Command, Output Directory leer lassen.

**Variante B – per Kommandozeile:** `npm i -g vercel`, dann in diesem Ordner `vercel` (Vorschau) bzw. `vercel --prod` ausführen.

## Hinweise
- Einträge (Ja/Nein, Anzahl) werden im Browser gespeichert (localStorage). Über „Sicherung herunterladen/laden“ lassen sie sich auf andere Geräte übertragen.
- Kartenbilder kommen von assets.tcgdex.net, Pokémon-Bilder von den PokéAPI-Sprites auf GitHub.
- Lokal testen: `npx serve .` (index.html nicht direkt als Datei öffnen, sonst lädt data.json nicht).


## Karten per Foto scannen (Tab „Karten scannen“)
Kostenlos und ohne Server: Die Texterkennung (Tesseract.js) läuft im Browser, das Foto verlässt das Gerät nicht.
Beim ersten Scan werden einmalig ca. 10 MB Erkennungsdaten von cdn.jsdelivr.net geladen.
Modus „1 Karte“ für Einzelkarten, „Ordnerseite“ für bis zu 9 Karten. Die Zuordnung (`scan-match.js`) nutzt Kartenname und Kartennummer.

## Neue Karten und Erweiterungen übernehmen
GitHub → **Actions** → **„Kartendaten aktualisieren“** → **Run workflow**.
Die Action lädt die neueste [tcgdex-Kartendatenbank](https://github.com/tcgdex/cards-database), übernimmt alle Pokémon- und Trainerkarten mit deutschem Namen (inkl. Bilder und Cardmarket-Links), aktualisiert die Preise und committet das Ergebnis; Vercel veröffentlicht danach automatisch. Die Zusammenfassung des Laufs zeigt neue Erweiterungen und Karten.
Gespeicherte Sammlungen bleiben erhalten (Karten werden über „Set-ID/Kartennummer“ zugeordnet).
Hinweis: Neue Sets erscheinen in tcgdex meist einige Tage nach dem Verkaufsstart.
