# EventWow Agent Instructions

These instructions apply to all AI-assisted development in this repository.

## Core principle

Do not design EventWow page-by-page. Build from the approved EventWow v2 design system in `docs/DESIGN_SYSTEM_V2.md`.

Codex is an implementer of the design system, not an independent visual designer.

## Frontend rules

1. Read `docs/DESIGN_SYSTEM_V2.md` before making frontend changes.
2. Reuse existing approved components before creating new ones.
3. If a genuinely new reusable visual pattern is required, implement it as a shared component and add it to `/design-system` before using it widely.
4. Do not add arbitrary hex colours inside page components.
5. Do not add arbitrary Tailwind spacing, radius or shadow values unless unavoidable and documented in the change.
6. Do not introduce gradients unless explicitly present in the v2 design system.
7. Do not use large decorative cards where a table, list or plain section would be clearer.
8. Do not create bespoke page headers. Use the shared `PageHeader` pattern.
9. Customer, supplier, venue and admin workspaces must share the same `AppShell` geometry.
10. Do not build role-specific shells that visually drift from the core workspace shell.
11. Use EventWow orange for primary actions. Secondary colours are functional accents only.
12. Prefer typography and whitespace for hierarchy before adding borders, backgrounds, pills or badges.
13. Use status badges only for genuine status information.
14. Use one icon library consistently. Prefer Lucide if/when added; do not mix icon visual languages.
15. Public marketplace pages should feel bright, broad-events-led and photography-rich, not wedding-only.
16. Logged-in workspace pages should be clean, aligned and information-dense, not decorative.
17. Never invent platform metrics, ratings, review counts, response times, verified counts or other social proof.
18. Never expose test supplier/venue/customer data on public pages intentionally.

## Migration rules

The v2 UI migration is a visual/system migration first.

- Preserve current routes unless a task explicitly changes routing.
- Preserve Supabase schema and business logic unless a task explicitly changes them.
- Preserve working authentication and permissions.
- Do not migrate Vite/React to another application framework as part of the v2 visual migration.
- Refactor presentation into shared components before duplicating styling across pages.
- Prefer small reviewable migration steps over a single repository-wide rewrite.

## Verification

For every migrated screen:

- verify desktop and mobile layouts
- verify loading state where relevant
- verify empty state where relevant
- verify error state where relevant
- verify primary actions remain functional
- verify role permissions have not changed
- verify visual alignment with `/design-system`

## When instructions conflict

Business correctness and user data safety come first. Preserve working behaviour and report any conflict between existing behaviour and the v2 design-system migration rather than silently changing business logic.
