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
Die Erkennung läuft über die Vercel-Funktion `api/scan.js`, die das Foto an Claude (Anthropic API) schickt.
Einrichtung in Vercel → Project → Settings → Environment Variables:

| Variable | Wert |
|---|---|
| `ANTHROPIC_API_KEY` | API-Schlüssel von console.anthropic.com (kostenpflichtig, wenige Cent pro Foto) |
| `SCAN_PASSWORD` | frei gewähltes Passwort – schützt davor, dass Fremde über deine Seite API-Kosten verursachen |
| `ANTHROPIC_MODEL` | optional, Standard `claude-sonnet-5-5` |

Danach neu deployen. Auf der Seite das Passwort einmal eingeben (wird im Browser gemerkt), Foto wählen, „Karten erkennen“, Vorschläge prüfen, „Ausgewählte hinzufügen“.
