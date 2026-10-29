---
name: audit-my-layout
description: >-
  Measures a live web page for visual consistency — equal spacing between
  siblings, shared alignment edges, same-size cards/buttons/inputs, margin and
  padding on the design-system scale, content staying inside the container,
  same-role text with the same font-size/weight/line-height — at 1440, 1024,
  768 and 390px. Every number comes from getBoundingClientRect and
  getComputedStyle, never from eyeballing a screenshot. Outputs a per-viewport
  severity table (High ≥4px, Medium 2–3px or off-scale, Low 1px), screenshots
  of problem areas, the likely CSS cause and fix for each High issue, and a
  list of what was checked and found consistent. Use when asked to QA, audit,
  or check a page for misalignment, uneven gaps, inconsistent card sizes,
  off-grid spacing, horizontal scroll or responsive layout drift, or when the
  user mentions audit-my-layout or /audit-my-layout.
license: MIT
argument-hint: "<url> [scope selector] [--scale 4,8,16,24,32,48] [--container 1200]"
---

# Audit My Layout

Measure, don't guess. A screenshot shows a 2px gap difference to nobody; the DOM
reports it exactly. This skill collects geometry for every visible element in
scope, groups siblings, and reports deviations from the group's own majority and
from the declared design system.

## Inputs (ask only for what is missing and cannot be defaulted)

| Input | Default |
|---|---|
| URL | required |
| Scope | whole page (`body`); or a selector such as `.product-grid` |
| Viewports | 1440, 1024, 768, 390 |
| Spacing scale | none → the scale check is skipped and reported as skipped |
| Container max-width | none → container check covers viewport overflow only |
| Grid (columns/gutter) | none → report gutters found, do not judge them |

## Rules

- Every reported number must come from the DOM. If you cannot measure it, say so.
- Do not click links, submit forms, or log in. Scrolling and resizing only.
- Anything not measurable (canvas, iframe, video, cross-origin content, shadow
  roots) is listed under **Not measured**, never silently skipped.
- Group by siblings, not by whole page: a hero and a footer are not supposed to
  be the same height.

## Procedure

### 1. Run the collector (preferred: the bundled runner)

```bash
node scripts/audit.mjs <url> --scope ".product-grid" \
  --scale 4,8,16,24,32,48 --container 1200 --out ./layout-audit
```

It resizes per viewport, scrolls through once to trigger lazy content, waits for
`document.fonts.ready`, images and network idle, runs `scripts/measure.js`,
screenshots the page and each High issue, and writes `report.json` plus the
markdown tables. Needs Playwright (`PLAYWRIGHT_PATH=<folder>` if it is not
resolvable; `--chrome <path>` or `CHROME_PATH` if its bundled browser is missing;
it falls back to installed Chrome).

### 2. Or drive a browser tool yourself (Chrome / built-in browser MCP)

For each viewport: resize, wait for layout to settle, scroll through the page
once and back to top, then set `window.__LAYOUT_AUDIT_CONFIG = {scope, scale,
containerMax, tolerance:1}` and evaluate the contents of `scripts/measure.js`.
It returns compact JSON (issues capped at 60 per type with a `truncated` count).
Take a screenshot of each High issue area.

### 3. Verify before reporting

For each High issue, re-measure the one element and its siblings with a small
`getBoundingClientRect` call and read the matched CSS (`getComputedStyle`, plus
the rule that sets it) to name the real cause. Discard a finding that does not
reproduce.

## What the collector checks

| Check | Method | Flag when |
|---|---|---|
| Spacing | gaps between consecutive siblings, horizontal within a row, vertical between rows (≥4 rows) | gap ≠ group's most common gap by >1px |
| Alignment | row: top, center or bottom edge must be shared; column: left edge of same-type stacked siblings | spread ≥1px |
| Sizing | same tag+class siblings: width across the set, height within a row | differs ≥1px |
| Scale | margin, padding, row/column gap in px | not on the supplied scale (auto-centring margins ignored) |
| Container | `scrollWidth` vs viewport; elements outside viewport not clipped by an overflow ancestor; direct content wider than `--container` | any |
| Typography | role = tag + parent component class | minority font-size, weight or line-height |

Severity: **High** ≥4px or breaks layout (horizontal scroll, outside viewport);
**Medium** 2–3px, off-scale, or weight mismatch; **Low** 1px.

Known limits (state them in the report when relevant): a group with only two
gaps and no majority is not judged for spacing (caught by the scale check
instead); transforms and sub-pixel rounding can produce ±0.5px noise, hence the
1px tolerance; hidden, zero-size and `position:fixed` elements are excluded.

## Output

For each viewport, a table:

| Severity | Issue type | Selector | Expected | Actual | Difference |
|---|---|---|---|---|---|

Then:

1. **Patterns**: collapse repeats ("the 3rd card in every row is 2px taller
   because its title wraps to two lines"). Read across viewports: an issue that
   appears only at ≤768 points at a breakpoint rule.
2. **Likely CSS cause and fix** for every High issue — name the property
   (e.g. `flex` basis without `min-width:0`, fixed `width` inside a fluid
   parent, `margin-top:37px` instead of a token, image without `max-width:100%`).
3. **Consistent**: list each check that ran and found nothing, with counts from
   `stats` (groups, gaps, edges, size groups, text roles), so the reader knows
   it was covered.
4. **Not measured / skipped**: unmeasurable elements, and any check skipped for
   lack of input (no scale, no container max).
5. Screenshot paths for every High issue.

## Files

- `scripts/measure.js` — in-page collector, browser-agnostic, returns JSON.
- `scripts/audit.mjs` — Playwright runner over all viewports with screenshots.
- `assets/fixture.html` — page with seeded defects; run the audit on it to
  confirm the tool still detects off-scale margin, font-size drift, and overflow.
