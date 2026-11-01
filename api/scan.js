// Vercel Serverless Function: erkennt Pokémon-Karten auf einem Foto mit Claude (Anthropic API).
// Benötigte Umgebungsvariablen in Vercel:
//   ANTHROPIC_API_KEY  – API-Schlüssel von console.anthropic.com
//   SCAN_PASSWORD      – Passwort, damit nicht jeder Besucher deine API-Kosten verursacht
// Optional:
//   ANTHROPIC_MODEL    – Modell-ID (Standard: claude-sonnet-5-5)

const PROMPT = `Auf dem Foto sind deutsche Pokémon-Sammelkarten (oft mehrere, evtl. gedreht oder in Sammelhüllen).
Erkenne JEDE vollständig oder überwiegend sichtbare Karte. Lies die Angaben exakt so, wie sie auf der Karte gedruckt sind:
- "name": Kartenname (bei Pokémon inkl. Zusätzen wie "ex", "V", "VMAX"; bei Trainerkarten der Titel)
- "nummer": Kartennummer unten auf der Karte, z. B. "123/131", "TG05/TG30" oder "SVP 046"
- "setcode": Erweiterungskürzel unten links, falls lesbar (z. B. "PAR", "SVI", "PRE"), sonst ""
- "typ": "pokemon", "trainer" oder "energie"
- "sicher": true, wenn Name und Nummer gut lesbar sind, sonst false
Antworte NUR mit JSON in dieser Form, ohne weiteren Text:
{"karten":[{"name":"...","nummer":"...","setcode":"...","typ":"...","sicher":true}]}`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ fehler: 'Nur POST erlaubt.' });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  const pw = process.env.SCAN_PASSWORD;
  if (!key || !pw) {
    return res.status(500).json({ fehler: 'Scan ist nicht eingerichtet: ANTHROPIC_API_KEY und SCAN_PASSWORD in Vercel setzen.' });
  }
  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  if (body.passwort !== pw) {
    return res.status(401).json({ fehler: 'Falsches Passwort.' });
  }
  const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(body.mediaType) ? body.mediaType : 'image/jpeg';
  if (!body.bild || typeof body.bild !== 'string' || body.bild.length > 4_000_000) {
    return res.status(400).json({ fehler: 'Kein oder zu großes Bild.' });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: body.bild } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ fehler: 'Anthropic-API: ' + ((data.error && data.error.message) || r.status) });
    }
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const parsed = extractJson(text);
    if (!parsed || !Array.isArray(parsed.karten)) {
      return res.status(502).json({ fehler: 'Antwort konnte nicht gelesen werden.', roh: text.slice(0, 500) });
    }
    return res.status(200).json({ karten: parsed.karten.slice(0, 60) });
  } catch (e) {
    return res.status(500).json({ fehler: 'Fehler bei der Erkennung: ' + e.message });
  }
};

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
function extractJson(t) {
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  return safeJson(t.slice(a, b + 1));
}
