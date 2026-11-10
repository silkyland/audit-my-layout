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

## The skill family

| Skill | Moment |
|-------|--------|
| [know-my-repo](https://github.com/silkyland/know-my-repo) | Day one: onboard onto a repo with zero knowledge |
| [deep-plan](https://github.com/silkyland/deep-plan) | Plan the next feature/refactor — evidence-gated, 8 phases |
| [deep-plan-ingest](https://github.com/silkyland/deep-plan) | Distill an implemented plan into living knowledge files |
| [scaffold-my-plan](https://github.com/silkyland/scaffold-my-plan) | Turn a plan's first milestone into a running first slice |
| [clean-slate](https://github.com/silkyland/clean-slate) | Reset rotten knowledge files — backup-gated |
| [transform-my-repo](https://github.com/silkyland/transform-my-repo) | Change the architecture: migration feasibility + strategy |
| [reproduce-my-bug](https://github.com/silkyland/reproduce-my-bug) | Prove the bug before anyone fixes it |
| **audit-my-layout** | Measure a live page's visual consistency, viewport by viewport |
| [ground-my-ui](https://github.com/silkyland/ground-my-ui) | Prove the UI's contracts before anyone redesigns |
| [ground-my-shopware](https://github.com/silkyland/ground-my-shopware) | Shopware 6 admin/storefront UI grounded in installed vendor source |
| [seed-ah](https://github.com/silkyland/seed-ah) | A world of ONE company that reads like it has been in use for a year |
| [love-me-love-my-docs](https://github.com/silkyland/love-me-love-my-docs) | A user manual that regenerates itself |

Shared law: **no claim without evidence** — every skill in the family is
gated on citations, verification, and honest degraded modes.

## License

MIT
