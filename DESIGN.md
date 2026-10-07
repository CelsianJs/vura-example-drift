# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-10-07
- Primary surfaces: private seeded workspace, server activity, public build teaching route.
- Evidence: audited What Drift README, src/styles.css, data fixtures and workflow components; parent-approved backend scope.

## Brand

Preserve Drift's lilac/peach paper palette, soft board cards, generous planner rhythm and calm editorial headings. Trust comes from honest server status and failure states, not invented production infrastructure. Avoid unrelated redesign or generic backend admin chrome.

## Product goals

Make the existing workflow a real server-backed reference. Success is confirmed server mutation, scoped audit, repeatable failures and visible durability limitations. Non-goals: user accounts, live infrastructure, multi-user invitation system, uploads and payments.

## Personas and jobs

Framework adopters and coding agents learn how to build isolated stateful apps; demo visitors safely mutate only their own synthetic workspace. Desktop and touch users can perform the same bounded changes.

## Information architecture

Workspace and Activity anchors on the client page; /build for static teaching; API routes stay invisible to normal navigation. Storage/session status precedes editing controls. Empty state never pretends a browser seed is authoritative.

## Design principles

Preserve recognizable product language. Server confirmation precedes UI state claims. Errors retain context and explain whether data was saved. Tradeoff: a bounded backend slice preserves the strongest workflow rather than cloning unrelated legacy screens.

## Visual language

Baseline CSS variables/palette/type/spacing are copied unchanged into public/styles.css; appended backend controls are the extension seam. Paper panels, rounded controls and lilac/plum hierarchy remain primary. No external font/image/network dependencies or new icon library. Honor existing reduced-motion CSS.

## Components

Reuse brand/header/navigation, status ribbon, workflow selects, card metadata and move buttons, activity list and original fixtures. App.jsx owns server-backed interaction; styles.css owns visuals. Loading, failure, conflict and deletion are explicit states.

## Accessibility

Semantic headings/landmarks; skip link; labeled native selects; keyboard buttons; live status and alert errors; minimum 44px interactive controls inherited from baseline. No drag-only action. Verify visible focus, contrast and mobile clipping.

## Responsive behavior

320px minimum; desktop four-column board; Drift becomes two then one column. Header wraps rather than hiding primary actions. Touch uses buttons/selects, not hover-only controls.

## Interaction states

Loading disables conflicting writes. Empty shows no private workspace. Storage failures return 503 and no success fallback. Version conflicts refresh the snapshot and retain an actionable error. Success means the server accepted and persisted the mutation. Reconnect status identifies SSE recovery; disconnected data is not called live.

## Content voice

Concrete, truthful, compact. Always label fixtures synthetic. 'Private workspace' is anonymous session isolation, not an account. 'Live sync' is same-workspace synchronization, not multi-user membership.

## Implementation constraints

What 0.13.10, Vura 0.8.3, Celsian 0.6.5; no React or new design system. Client signals track server snapshots. No localStorage persistence or fabricated database success. Browser/HTTP tests and desktop/mobile screenshots are expected.

## Open questions

- Hosted database/role approval and final runtime origin are operator-owned prerequisites.
- Original starter visual work is concurrent; selectively sync public/styles.css and App.jsx after verification without overwriting backend security.

