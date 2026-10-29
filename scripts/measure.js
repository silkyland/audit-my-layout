/* audit-my-layout: in-page measurement. Paste into a browser JS tool or run via page.evaluate.
 * Config (optional) is read from window.__LAYOUT_AUDIT_CONFIG:
 *   { scope: "body", scale: [4,8,16,24,32,48], containerMax: 1200, tolerance: 1, cap: 60 }
 * Returns plain JSON. Every number comes from getBoundingClientRect / getComputedStyle. */
(() => {
  const cfg = Object.assign(
    { scope: 'body', scale: null, containerMax: null, tolerance: 1, cap: 60 },
    window.__LAYOUT_AUDIT_CONFIG || {}
  );
  const root = document.querySelector(cfg.scope) || document.body;
  const vw = document.documentElement.clientWidth;
  const r1 = (n) => Math.round(n * 10) / 10;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'BR', 'TEMPLATE', 'SOURCE', 'TRACK']);
  const unmeasurable = [];

  const sev = (d) => (d >= 4 ? 'High' : d >= 2 ? 'Medium' : 'Low');
  const cs = new WeakMap();
  const style = (el) => cs.get(el) || (cs.set(el, getComputedStyle(el)), cs.get(el));
  const mode = (arr) => {
    const m = new Map();
    arr.forEach((v) => m.set(v, (m.get(v) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  };
  const sel = (el) => {
    const parts = [];
    for (let n = el, i = 0; n && n.nodeType === 1 && n !== document.documentElement && i < 4; n = n.parentElement, i++) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + '#' + CSS.escape(n.id)); break; }
      const cls = [...n.classList].slice(0, 2).map((c) => '.' + CSS.escape(c)).join('');
      s += cls;
      if (!cls && n.parentElement) s += `:nth-child(${[...n.parentElement.children].indexOf(n) + 1})`;
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const sig = (el) => el.tagName.toLowerCase() + '.' + [...el.classList].sort().join('.');

  // ---- collect visible, in-flow elements in scope
  const all = [root, ...root.querySelectorAll('*')];
  const visible = [];
  for (const el of all) {
    if (SKIP.has(el.tagName)) continue;
    if (['IFRAME', 'CANVAS', 'VIDEO', 'OBJECT', 'EMBED'].includes(el.tagName)) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) unmeasurable.push({ selector: sel(el), reason: el.tagName.toLowerCase() + ' contents not measurable' });
    }
    if (el.shadowRoot) unmeasurable.push({ selector: sel(el), reason: 'shadow root (children not traversed)' });
    const s = style(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.display === 'contents') continue;
    if (s.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    visible.push(el);
  }
  const vset = new Set(visible);
  const rect = (el) => el.getBoundingClientRect();
  const out = { spacing: [], alignment: [], sizing: [], scale: [], container: [], typography: [] };
  const stats = { elements: visible.length, groups: 0, gapsChecked: 0, edgesChecked: 0, sizeGroups: 0, scaleValues: 0, textRoles: 0 };
  const push = (k, o) => out[k].push(o);

  // ---- sibling groups
  const parents = new Map();
  for (const el of visible) {
    const p = el.parentElement;
    if (!p || !vset.has(p) && p !== root) continue;
    const pos = style(el).position;
    if (pos === 'absolute') continue;
    if (!parents.has(p)) parents.set(p, []);
    parents.get(p).push(el);
  }
  const tol = cfg.tolerance;
  for (const [p, kids] of parents) {
    if (kids.length < 2) continue;
    stats.groups++;
    const items = kids.map((el) => ({ el, r: rect(el) })).sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
    // rows by vertical overlap
    const rows = [];
    for (const it of items) {
      const row = rows.find((rw) => it.r.top < rw.bottom - 1 && it.r.bottom > rw.top + 1);
      if (row) { row.items.push(it); row.top = Math.min(row.top, it.r.top); row.bottom = Math.max(row.bottom, it.r.bottom); }
      else rows.push({ items: [it], top: it.r.top, bottom: it.r.bottom });
    }
    rows.forEach((rw) => rw.items.sort((a, b) => a.r.left - b.r.left));
    const pSel = sel(p);

    // horizontal gaps within rows
    const hg = [];
    rows.forEach((rw) => rw.items.slice(1).forEach((it, i) => hg.push({ it, gap: it.r.left - rw.items[i].r.right })));
    if (hg.length >= 2) {
      const m = mode(hg.map((g) => Math.round(g.gap)));
      stats.gapsChecked += hg.length;
      if (hg.filter((g) => Math.abs(g.gap - m) <= tol).length >= 2) hg.forEach((g) => { const d = Math.abs(g.gap - m); if (d > tol) push('spacing', { sev: sev(d), selector: sel(g.it.el), group: pSel, axis: 'horizontal', expected: m, actual: r1(g.gap), diff: r1(d) }); });
    }
    // vertical gaps between rows
    if (rows.length >= 4) {
      const vg = rows.slice(1).map((rw, i) => ({ rw, gap: rw.top - rows[i].bottom }));
      const m = mode(vg.map((g) => Math.round(g.gap)));
      stats.gapsChecked += vg.length;
      if (vg.filter((g) => Math.abs(g.gap - m) <= tol).length >= 2) vg.forEach((g) => { const d = Math.abs(g.gap - m); if (d > tol) push('spacing', { sev: sev(d), selector: sel(g.rw.items[0].el), group: pSel, axis: 'vertical', expected: m, actual: r1(g.gap), diff: r1(d) }); });
    }

    // alignment within a row: top / center / bottom edges (one of them should be shared)
    rows.forEach((rw) => {
      if (rw.items.length < 2) return;
      const spread = (f) => Math.max(...rw.items.map(f)) - Math.min(...rw.items.map(f));
      const t = spread((i) => i.r.top), c = spread((i) => (i.r.top + i.r.bottom) / 2), b = spread((i) => i.r.bottom);
      stats.edgesChecked += 3;
      const best = Math.min(t, c, b);
      if (best >= tol) push('alignment', { sev: sev(best), selector: sel(rw.items[0].el), group: pSel, edge: 'row top/center/bottom', expected: 0, actual: r1(best), diff: r1(best) });
    });
    // alignment within a column: left edge of same-signature stacked children
    if (rows.length >= 2) {
      const bySig = new Map();
      rows.forEach((rw) => rw.items.forEach((it) => { const k = sig(it.el); (bySig.get(k) || bySig.set(k, []).get(k)).push(it); }));
      for (const [, list] of bySig) {
        if (list.length < 2) continue;
        const firsts = list.filter((it) => rows.some((rw) => rw.items[0] === it));
        if (firsts.length < 2) continue;
        stats.edgesChecked += 1;
        const lefts = firsts.map((i) => i.r.left); const m = mode(lefts.map(Math.round));
        firsts.forEach((it) => { const d = Math.abs(it.r.left - m); if (d >= tol) push('alignment', { sev: sev(d), selector: sel(it.el), group: pSel, edge: 'left', expected: m, actual: r1(it.r.left), diff: r1(d) }); });
      }
    }

    // sizing: same signature, non-inline
    const bySig = new Map();
    items.forEach((it) => { if (style(it.el).display.startsWith('inline') && style(it.el).display !== 'inline-block' && style(it.el).display !== 'inline-flex') return; const k = sig(it.el); (bySig.get(k) || bySig.set(k, []).get(k)).push(it); });
    for (const [, list] of bySig) {
      if (list.length < 2) continue;
      stats.sizeGroups++;
      // width: whole sibling set; height: only items sharing a row (stacked blocks may legitimately differ)
      const check = (set, dim) => {
        if (set.length < 2) return;
        const m = mode(set.map((i) => Math.round(i.r[dim])));
        if (set.filter((i) => Math.abs(i.r[dim] - m) < tol).length < 2) return;
        set.forEach((it) => { const d = Math.abs(it.r[dim] - m); if (d >= tol) push('sizing', { sev: sev(d), selector: sel(it.el), group: pSel, dim, expected: m, actual: r1(it.r[dim]), diff: r1(d) }); });
      };
      check(list, 'width');
      rows.forEach((rw) => check(list.filter((i) => rw.items.includes(i)), 'height'));
    }
  }

  // ---- scale (margin/padding/gap off the expected scale)
  if (cfg.scale && cfg.scale.length) {
    const sc = new Set(cfg.scale);
    const props = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'rowGap', 'columnGap'];
    const seen = new Map();
    for (const el of visible) {
      const s = style(el);
      for (const p of props) {
        const v = s[p]; if (!v || v === 'normal' || v === 'auto' || !v.endsWith('px')) continue;
        const n = parseFloat(v); if (!n) continue;
        if ((p === 'marginLeft' || p === 'marginRight') && s.marginLeft === s.marginRight && el.parentElement) {
          const er = rect(el), pr = rect(el.parentElement); // auto-centering margin: element centred in parent
          if (Math.abs((er.left + er.right) / 2 - (pr.left + pr.right) / 2) < 1 && er.width < pr.width - 1) continue;
        }
        stats.scaleValues++;
        if (sc.has(Math.round(n))) continue;
        const nearest = [...sc].sort((a, b) => Math.abs(a - n) - Math.abs(b - n))[0];
        const key = sig(el) + '|' + p + '|' + n;
        if (!seen.has(key)) seen.set(key, { sev: 'Medium', selector: sel(el), prop: p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), expected: 'one of ' + cfg.scale.join('/') + ' (nearest ' + nearest + ')', actual: r1(n), diff: r1(Math.abs(n - nearest)), count: 0 });
        seen.get(key).count++;
      }
    }
    out.scale = [...seen.values()].sort((a, b) => b.count - a.count);
  }

  // ---- container / overflow
  const docW = document.documentElement.scrollWidth;
  if (docW > vw) push('container', { sev: 'High', selector: 'html', kind: 'horizontal scroll', expected: vw, actual: docW, diff: docW - vw });
  for (const el of visible) {
    const r = rect(el);
    if (r.right > vw + 1 || r.left < -1) {
      let anc = el.parentElement, clipped = false;
      while (anc && anc !== document.documentElement) { const o = style(anc).overflowX; if (o !== 'visible') { clipped = true; break; } anc = anc.parentElement; }
      if (!clipped) push('container', { sev: sev(Math.max(r.right - vw, -r.left)), selector: sel(el), kind: 'outside viewport', expected: `0..${vw}`, actual: `${r1(r.left)}..${r1(r.right)}`, diff: r1(Math.max(r.right - vw, -r.left)) });
    }
  }
  if (cfg.containerMax) {
    const wide = visible.filter((el) => el !== root && ['MAIN', 'SECTION', 'HEADER', 'FOOTER', 'ARTICLE', 'DIV'].includes(el.tagName) && (el.parentElement === document.body || el.parentElement === root));
    wide.forEach((el) => {
      const s = style(el), r = rect(el);
      const cw = r.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      if (cw > cfg.containerMax + 1 && r.width < vw - 1) push('container', { sev: sev(cw - cfg.containerMax), selector: sel(el), kind: 'wider than container max', expected: cfg.containerMax, actual: r1(cw), diff: r1(cw - cfg.containerMax) });
    });
  }

  // ---- typography: same role (signature) should share size/weight/line-height
  const roles = new Map();
  for (const el of visible) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (!el.classList.length && !/^H[1-6]$|^BUTTON$|^A$|^LABEL$|^LI$|^P$/.test(el.tagName)) continue;
    const pc = el.parentElement && el.parentElement.classList[0];
    const k = el.tagName.toLowerCase() + (pc ? ' in .' + pc : ''); // role = tag + parent component class
    (roles.get(k) || roles.set(k, []).get(k)).push(el);
  }
  for (const [k, list] of roles) {
    if (list.length < 2) continue;
    stats.textRoles++;
    for (const [prop, label] of [['fontSize', 'font-size'], ['fontWeight', 'font-weight'], ['lineHeight', 'line-height']]) {
      const vals = list.map((el) => style(el)[prop]);
      const m = new Map(); vals.forEach((v) => m.set(v, (m.get(v) || 0) + 1));
      if (m.size < 2) continue;
      const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
      list.forEach((el, i) => {
        if (vals[i] === top) return;
        const d = prop === 'fontWeight' ? Math.abs(vals[i] - top) / 100 : Math.abs(parseFloat(vals[i]) - parseFloat(top));
        if (isNaN(d)) { push('typography', { sev: 'Low', selector: sel(el), role: k, prop: label, expected: top, actual: vals[i], diff: 'n/a' }); return; }
        if (prop === 'fontWeight' || d >= tol) push('typography', { sev: prop === 'fontWeight' ? 'Medium' : sev(d), selector: sel(el), role: k, prop: label, expected: top, actual: vals[i], diff: r1(d) });
      });
    }
  }

  const capped = {}, truncated = {};
  const order = { High: 0, Medium: 1, Low: 2 };
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => order[a.sev] - order[b.sev] || (b.diff || 0) - (a.diff || 0));
    truncated[k] = Math.max(0, out[k].length - cfg.cap);
    capped[k] = out[k].slice(0, cfg.cap);
  }
  return { viewport: { width: vw, height: innerHeight, dpr: devicePixelRatio }, scope: cfg.scope, config: { scale: cfg.scale, containerMax: cfg.containerMax, tolerance: tol }, stats, counts: Object.fromEntries(Object.keys(out).map((k) => [k, out[k].length])), truncated, issues: capped, unmeasurable };
})();
