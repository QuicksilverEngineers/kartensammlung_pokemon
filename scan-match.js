// Gleicht OCR-Text (Tesseract) mit der Kartenliste ab.
// Läuft im Browser (window.ScanMatch) und in Node (module.exports) für Tests.
(function (root) {
  'use strict';
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
  const words = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter(Boolean);

  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  const tri = s => { const t = new Set(); for (let i = 0; i + 3 <= s.length; i++) t.add(s.slice(i, i + 3)); return t; };

  // Ähnlichkeit eines Kartennamens mit einer OCR-Zeile (0..1)
  function nameSim(nameN, lineN, lineTri) {
    if (lineN.includes(nameN)) return 1;
    const nt = tri(nameN); let hit = 0; nt.forEach(t => { if (lineTri.has(t)) hit++; });
    if (!nt.size || hit / nt.size < 0.45) return 0;
    const L = nameN.length, max = Math.floor(L * 0.25); let best = max + 1;
    for (let w = L - max; w <= L + max; w++) {
      if (w < 1) continue;
      for (let i = 0; i + w <= lineN.length; i++) {
        const d = lev(nameN, lineN.slice(i, i + w), Math.min(max, best - 1));
        if (d < best) best = d;
        if (best === 0) return 1;
      }
      if (lineN.length < w) { const d = lev(nameN, lineN, max); if (d < best) best = d; }
    }
    return best > max ? 0 : 1 - best / L;
  }

  function parseNr(s) {
    s = String(s || '').toUpperCase();
    let m = s.match(/([A-Z]*)\s*0*(\d+)\s*[A-Z]?\s*\/\s*([A-Z]*)\s*0*(\d+)/);
    if (m) return { pre: m[1], num: +m[2], total: +m[4] };
    m = s.match(/([A-Z]*)\s*0*(\d+)/);
    return m ? { pre: m[1], num: +m[2], total: null } : null;
  }

  // Index einmalig aufbauen
  function buildIndex(D) {
    const byName = new Map();
    const nrs = D.cards.map(c => parseNr(c[4]));
    D.cards.forEach((c, i) => {
      const n = norm(c[1]);
      if (n.length < 3) return;
      if (!byName.has(n)) byName.set(n, { name: c[1], n, w: words(c[1]), cards: [] });
      byName.get(n).cards.push(i);
    });
    return { byName: [...byName.values()], nrs, D };
  }

  // opts.mode: 'one' = Einzelkarte, 'nine' = Ordnerseite (bis 9 Karten)
  function analyze(text, IX, opts) {
    const D = IX.D, one = opts && opts.mode === 'one';
    const minCover = one ? 0.5 : 0.7, maxItems = one ? 1 : 9;
    const lines = String(text || '').split(/\n+/).map(l => l.trim()).filter(l => l.length >= 3);
    // 1) Kartennummern wie 123/131, TG05/TG30, 093/131
    const nums = [];
    const re = /([A-Z]{0,3})\s?0*(\d{1,3})\s?\/\s?([A-Z]{0,3})\s?0*(\d{2,4})/g;
    let m;
    while ((m = re.exec(String(text || '').toUpperCase()))) {
      let total = m[4];
      if (total.length === 4) total = total.slice(0, 3);
      const num = +m[2], t = +total;
      if (num > 0 && t >= 10 && t <= 400) nums.push({ pre: m[1], num, total: t, raw: m[0].trim(), used: false });
    }
    const totals = new Set(nums.map(x => x.total));
    const nrEq = (i, x) => { const c = IX.nrs[i]; return c && c.num === x.num && c.total === x.total; };

    // 2) Namen finden
    const found = new Map();
    for (const line of lines) {
      const ln = norm(line); if (ln.length < 3) continue;
      const lt = tri(ln), lw = new Set(words(line));
      for (const e of IX.byName) {
        let sim;
        if (e.n.length <= 5) sim = (e.w.length && e.w.every(w => lw.has(w))) ? 0.85 : 0; // kurze Namen nur als ganzes Wort, geringeres Gewicht
        else sim = nameSim(e.n, ln, lt);
        // Kartentitel stehen allein in ihrer Zeile: Name muss den Großteil der Zeile ausmachen (filtert Fließtext)
        if (sim >= 0.8 && e.n.length / ln.length >= minCover) {
          const prev = found.get(e.n);
          if (!prev || prev.sim < sim) found.set(e.n, { e, sim, line });
        }
      }
    }
    // Teilnamen verwerfen, wenn ein längerer Name dieselbe Zeile erklärt (z. B. "Pikachu" in "Pikachu ex")
    const hits = [...found.values()].filter(h => ![...found.values()].some(o => o !== h && o.line === h.line && o.e.n.length > h.e.n.length && o.e.n.includes(h.e.n)));

    const sortNew = (a, b) => D.sets[D.cards[b][2]][2].localeCompare(D.sets[D.cards[a][2]][2]);
    const items = [];
    for (const h of hits) {
      const cands = h.e.cards.slice();
      const exact = [];
      nums.forEach(x => { cands.forEach(i => { if (nrEq(i, x)) { exact.push(i); x.used = true; } }); });
      if (exact.length) {
        [...new Set(exact)].forEach(i => items.push({ how: 'Name + Nummer', text: h.line, cand: [i, ...cands.filter(j => j !== i).sort(sortNew)], sicher: true }));
        continue;
      }
      const sameSet = cands.filter(i => totals.has(IX.nrs[i] && IX.nrs[i].total));
      const ordered = [...sameSet.sort(sortNew), ...cands.filter(i => !sameSet.includes(i)).sort(sortNew)];
      items.push({ how: sameSet.length === 1 ? 'Name + Setgröße' : 'Name', text: h.line, cand: ordered, sicher: sameSet.length === 1 || cands.length === 1, sim: h.sim });
    }
    // 3) Nummern ohne erkannten Namen
    for (const x of nums) {
      if (x.used) continue;
      const cands = [];
      IX.nrs.forEach((c, i) => { if (c && c.num === x.num && c.total === x.total) cands.push(i); });
      if (cands.length && cands.length <= 8) items.push({ how: 'Nummer', text: x.raw, cand: cands.sort(sortNew), sicher: one && cands.length === 1 });
    }
    // Nach Verlässlichkeit sortieren und auf die erwartete Kartenanzahl begrenzen
    const rank = { 'Name + Nummer': 3, 'Name + Setgröße': 2, 'Name': 1, 'Nummer': 0 };
    items.forEach((it, k) => { it.score = rank[it.how] + (it.sim || 0) * 0.5 + (it.how === 'Nummer' ? (it.cand.length === 1 ? 1.5 : 0.5) : 0); it.k = k; });
    const top = items.slice().sort((a, b) => b.score - a.score || a.k - b.k).slice(0, maxItems);
    if (one && top[0]) top[0].sicher = top[0].score >= 1.4;
    return { items: top.sort((a, b) => a.k - b.k), lines: lines.length, numbers: nums.length };
  }

  const api = { analyze, buildIndex, norm, parseNr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ScanMatch = api;
})(typeof window !== 'undefined' ? window : globalThis);
