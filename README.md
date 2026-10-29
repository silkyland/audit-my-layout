# audit-my-layout

An agent skill that audits a live web page for visual consistency: equal spacing,
shared alignment edges, same-size siblings, on-scale margins/padding, container
overflow and typography drift, at 1440 / 1024 / 768 / 390px. Every number comes
from `getBoundingClientRect` and `getComputedStyle`.

## Install

```bash
npx skills add silkyland/audit-my-layout
```

## Use

Ask your agent: "audit the layout of https://example.com at all viewports", or run
the bundled runner directly:

```bash
node scripts/audit.mjs https://example.com --scale 4,8,16,24,32,48 --container 1200
```

Requires Node and Playwright. See [SKILL.md](SKILL.md) for the full procedure and
output format. `assets/fixture.html` is a page with seeded defects for checking
the tool itself.

## License

MIT
