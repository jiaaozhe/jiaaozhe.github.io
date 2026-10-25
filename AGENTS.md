# Agent Guide

## Working Principles

- Think from first principles. Start from real requirements, code facts, and verification results; if the goal is unclear, discuss it with the user first.
- Treat code, not documentation, as the source of truth. Unless the user explicitly says otherwise, do not read ordinary Markdown just to understand the implementation.
- Before making code changes, read the relevant code and the most recent constraints, and follow the nearest AGENTS.md in the directory tree.
- Keep changes focused. Do not slip in unrelated refactors along the way.

## Project Map

- `_config.yml`: Jekyll configuration, collections, defaults, and build exclusions.
- `_data/`: YAML data used by pages and dashboards.
- `_layouts/`: Jekyll page templates for the site shell and collection detail pages.
- `_plugins/`: Build extensions; site indexes are generated after all content is rendered.
- `assets/`: Published CSS and JavaScript.
- `content/`: Source collections for posts, photos, publications, uses, and fragments.
- `pages/`: Fixed pages; indexed collection definitions live in `_data/sections.yml`.
- `scripts/`: Build/data maintenance scripts used by automation; not published.
- `.github/`: GitHub Actions workflows.
- `DESIGN.md`: Design direction and visual system notes.
