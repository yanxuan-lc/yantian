# yantian

Yantian (衍天), the third-party YaoGuang extension `@yanxuan.lc/yantian`: BaZi, Qi Men, astrology,
compatibility and timing-selection tools with their widgets. This directory is a single-package
project and its own git repository; sibling extensions under `yaoguang-extensions/` are managed
separately.

## Commands

- Run make from the repository root; `make` lists targets.
- Finish every code change with `make check` (lint, typecheck, test, build).
- `make pack` writes tarballs to `dist-pack/` for local installation.
- Install dependencies with `make deps`; the lockfile is authoritative.

## Contract

- Plugins import only `@eum-agent/plugin` and `@eum-agent/plugin/web`. Until the next YaoGuang
  release the contract links to `../../yaoguang/packages/core/plugin` through `pnpm-workspace.yaml`
  overrides; `zod` resolves to the contract's copy.
- Tools return `{ data, execution, isError, widgets? }` with `outputSchema` and `formatModel`;
  long model text goes through `textDocument` (src/tool-result.ts).
- Widget data schemas are strict, JSON-only zod objects without defaults or transforms, shared by
  backend and browser. Keep each snapshot under 200 KiB.
- The browser module is one Vite library build (`ui/ui.js`) with React specifiers external.

## Calculation rules

- Parity first: ports of the reference Python skills keep golden fixtures generated from the
  reference (`scripts/golden_*.py`). Rule corrections are applied to a temporary copy of the
  reference through the fixture script's documented substitution list, so fixtures still compare
  every field. Never hand-edit fixtures.
- Calendar: `lunar-typescript`. Ephemeris: `astronomy-engine`. Year/month pillars and solar terms
  follow the absolute instant (Beijing time); day/hour pillars follow true solar time.
- Browser code imports only pure modules (no `lunar-typescript`); keep `ganzhi.ts`, `shensha.ts`,
  `relations.ts`, `flow-model.ts` and `wheel.ts` pure.
- Every behaviour change starts with a failing test that asserts the traditional result on a
  concrete input.

## UI

- Style classes are prefixed per renderer (`yt-`, `yt-qm-`, `yt-as-`, `yt-sy-`, `yt-bc-`,
  `yt-tm-`); colours come from host tokens or `--yt-*` variables; element hues use `light-dark()`.
- Use container queries for narrow cards (down to 200 px); verify light, dark and narrow widths
  with real-browser screenshots before finishing.
- Astrology symbols are SVG paths in `src/ui/astro-glyphs.ts`, regenerated with
  `scripts/extract_glyphs.py`; never use Unicode astrology characters.
- Copy lives in per-renderer catalogues with matching `zh-CN` and `en-US` keys.

## Writing

- Code, identifiers, comments and this file are English; README and commit bodies are Chinese.
