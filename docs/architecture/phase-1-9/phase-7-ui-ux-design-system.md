# Platform — Phase 7: UI/UX Design System

**Scope:** Typography, color palette, icons, components, design tokens, responsive behavior, accessibility, light mode, dark mode.
**Status:** Draft — pending approval before Phase 8 (Security, Performance, Infrastructure Architecture).
**Builds on:** Phases 1–6 — approved. All prior decisions are authoritative except the revisions in Section 0.

---

## 0. Carry-Forward Revisions from Phase 6

| # | Phase 6 Item | Phase 7 Status | Impact |
|---|---|---|---|
| 1 | Service-role client reserved for the one identified invitation-expiry job | Broadened per approval: "trusted background jobs, scheduled tasks, administrative maintenance, and other explicitly privileged operations" | Carried forward as guidance for Phase 8; no effect on this document. |
| 2 | Vercel Middleware + Upstash Redis approved for rate limiting | Confirmed, with an explicit requirement to stay modular/swappable without redesigning the API layer | Carried forward as guidance for Phase 8; no effect on this document. |
| — | New: UI/UX Design System phase begins | Addressed in Section 1 | Resolves a framing tension — see below. |

## 1. Framing: Design System Now, Brand Identity Later

Phase 2 deferred branding, naming, visual identity, and domain selection to a separate future project. Phase 7 is nonetheless named in the master prompt as the phase that produces typography, color palette, icons, and design tokens. This document resolves that by treating Phase 7 as **design system infrastructure**, not the final brand:

- Every visual decision below is expressed as a **token** (a named variable), following shadcn/ui's own CSS custom-property convention, not a hardcoded value baked into components.
- The specific palette and typeface chosen here are a coherent, production-usable working direction — original, not imitating any platform researched in Phase 1 — but they are understood to be **replaceable at the token level** once the deferred branding project concludes. Swapping in a final brand palette later means changing token *values*, not restructuring components.
- This mirrors how the master prompt already treats AI ("prepare the architecture, don't implement it yet") and applied it to branding in Phase 2 ("prepare the architecture for future branding") — Phase 7 is that preparation.

## 2. Design Tokens — Color

Defined as shadcn/ui CSS variables (HSL), so the token set drops directly into the specified stack with no adaptation.

**Light mode**
```css
:root {
  --background: 0 0% 100%;
  --foreground: 160 15% 12%;
  --card: 0 0% 100%;
  --card-foreground: 160 15% 12%;
  --popover: 0 0% 100%;
  --popover-foreground: 160 15% 12%;
  --primary: 158 64% 24%;         /* deep forest green */
  --primary-foreground: 0 0% 100%;
  --secondary: 42 87% 55%;        /* warm amber */
  --secondary-foreground: 160 15% 12%;
  --muted: 160 10% 95%;
  --muted-foreground: 160 8% 40%;
  --accent: 158 40% 92%;
  --accent-foreground: 158 64% 20%;
  --destructive: 0 72% 45%;
  --destructive-foreground: 0 0% 100%;
  --success: 142 60% 35%;
  --warning: 38 90% 50%;
  --info: 200 70% 45%;
  --border: 160 10% 88%;
  --input: 160 10% 88%;
  --ring: 158 64% 32%;
  --radius: 0.5rem;
}
```

**Dark mode**
```css
.dark {
  --background: 160 15% 8%;
  --foreground: 160 5% 95%;
  --card: 160 14% 11%;
  --card-foreground: 160 5% 95%;
  --popover: 160 14% 11%;
  --popover-foreground: 160 5% 95%;
  --primary: 158 55% 45%;
  --primary-foreground: 160 15% 8%;
  --secondary: 42 70% 55%;
  --secondary-foreground: 160 15% 8%;
  --muted: 160 10% 18%;
  --muted-foreground: 160 8% 65%;
  --accent: 158 25% 20%;
  --accent-foreground: 158 55% 85%;
  --destructive: 0 62% 45%;
  --destructive-foreground: 0 0% 100%;
  --success: 142 50% 45%;
  --warning: 38 80% 55%;
  --info: 200 60% 55%;
  --border: 160 10% 22%;
  --input: 160 10% 22%;
  --ring: 158 55% 45%;
}
```

**Semantic mapping to the data model** — colors are not decorative-only; they map directly onto Phase 5's actual vocabularies, so the same token always means the same thing everywhere in the product:

| Data value (Phase 5) | Token |
|---|---|
| `progress_records.mastery_level = 'emerging'` | `--muted-foreground` (neutral — just starting) |
| `mastery_level = 'developing'` | `--warning` |
| `mastery_level = 'proficient'` | `--primary` |
| `mastery_level = 'advanced'` | `--secondary` (achievement highlight) |
| Relationship/Assignment `status = 'active' / 'submitted' / 'graded'` | `--success` |
| `status = 'pending_invitation' / 'not_started' / 'in_progress'` | `--info` or `--muted-foreground` |
| `status = 'overdue'` | `--destructive` |
| `status = 'suspended' / 'declined' / 'expired' / 'ended'` | `--muted-foreground`, de-emphasized |

## 3. Typography

**Typeface:** Inter (variable font) — open license (SIL OFL), wide language coverage, strong legibility at both small (dense dashboards) and large (young-reader lesson content) sizes. Fallback stack: `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.

| Style | Size | Weight | Line height | Use |
|---|---|---|---|---|
| Display | 2.5rem / 40px | 700 | 1.15 | Marketing/landing only — never inside the app shell |
| H1 | 2rem / 32px | 700 | 1.2 | Page titles |
| H2 | 1.5rem / 24px | 600 | 1.3 | Section headers |
| H3 | 1.25rem / 20px | 600 | 1.4 | Card/widget titles |
| H4 | 1.125rem / 18px | 600 | 1.4 | Sub-section labels |
| Body Large | 1.125rem / 18px | 400 | 1.6 | Default for Student-facing lesson content |
| Body | 1rem / 16px | 400 | 1.6 | Default UI text |
| Body Small | 0.875rem / 14px | 400 | 1.5 | Secondary/meta text |
| Caption | 0.75rem / 12px | 500 | 1.4 | Labels, timestamps |

Lesson content for Pre-Primary/Primary grade bands should default to Body Large or larger — an authoring guideline carried into content tooling, not fully specified here.

## 4. Iconography

**Lucide** (`lucide-react`) — MIT licensed, already available in the platform's own tooling, and shadcn/ui's own convention. Consistent 24×24 grid, 1.5–2px stroke.

| Context | Size |
|---|---|
| Inline with text | 16px |
| Default UI (buttons, nav) | 20px |
| Empty states / illustrative | 24px+ |

## 5. Spacing, Radius, Elevation

Adopts Tailwind's default scales directly rather than inventing parallel ones, since Tailwind is the specified stack:

- **Spacing:** Tailwind's default 4px-based scale (`1`=4px, `2`=8px, `4`=16px, `6`=24px, `8`=32px, `12`=48px, `16`=64px).
- **Radius:** `--radius: 0.5rem` (8px) as the base; small/large variants derived via `calc(var(--radius) - Npx)`, per shadcn convention.
- **Elevation:** Tailwind's default `shadow-sm` / `shadow` / `shadow-md` / `shadow-lg` utilities.

## 6. Components

Maps Phase 4's Widget catalog and Dashboard Shell onto specific shadcn/ui primitives — closing the loop from conceptual design to buildable components.

| Platform component | Built from shadcn/ui primitives |
|---|---|
| Dashboard Shell | Custom layout + `Sheet` (mobile nav) + `Avatar`/`DropdownMenu` (profile) |
| Role Context Switcher | `DropdownMenu` or `Select`; rendered only when a user holds more than one active User Role |
| Widget card (W-1…W-12) | `Card` + `CardHeader` + `CardContent` |
| Linked-Student Card (W-1) | `Card` + `Avatar` + `Progress` + `Badge` (unread count) |
| Progress Summary (W-4) | `Progress`, colored via the mastery-level semantic tokens (Section 2) |
| Roster List (W-5) | `Table` or `Card` list + `Input` (filter) |
| Grading Queue (W-6) | `Table` + `Badge` status indicators, including the Overdue indicator (Phase 4 Decision 4) |
| Messages (W-7) | `ScrollArea` + message-bubble components built on `Card` |
| Forms (invite, create assignment, etc.) | shadcn `Form` (react-hook-form + zod), matching Phase 6's validation strategy |
| Relationship/Assignment status | `Badge`, colored per the Section 2 semantic mapping |
| Notifications | `Popover` + `Badge` (unread count) |

## 7. Responsive Behavior

Tailwind's default breakpoints: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px.

- Below `md`: the persistent sidebar (Phase 3, Section 5) collapses into a slide-out `Sheet`; primary actions get bottom-anchored placement, consistent with the mobile-first usage pattern identified in Phase 1's competitive research.
- Widget grid: single column below `md`, two columns at `md`, up to three or four columns at `lg+` for widget-dense portals (Organization Administrator, Super Administrator); Student and Parent dashboards stay simpler even at desktop widths, since they carry fewer widgets by design (Phase 4, Section 2).
- Role Context Switcher: full label + icon at `md+`; icon/avatar-only below `md`.

## 8. Accessibility

- WCAG 2.2 AA is the baseline platform-wide; **AAA contrast is targeted specifically for Student-facing lesson content and any UI serving Pre-Primary/Primary grade bands**, given the young-learner audience.
- All interactive targets at least 44×44px (WCAG 2.2 target-size guidance) — important given the mobile-first, sometimes shared-device context from Phase 1/3.
- Full keyboard navigability; visible focus rings using the `--ring` token, never removed without a replacement indicator.
- Role Context Switcher changes are announced via an `aria-live` region, since switching context changes what the rest of the page means.
- `prefers-reduced-motion` is respected for all transitions and animations.
- Semantic HTML first — real landmark elements, real `<button>`/`<a>` — before ARIA is used to patch non-semantic markup.
- Status is always conveyed by icon + text + color together, never color alone.

## 9. Light Mode & Dark Mode

Both are first-class from the token level (Section 2), not a dark-mode filter applied after the fact.

- Default follows the OS/browser `prefers-color-scheme`.
- A per-user override should persist across devices, which needs a small `profiles` column (`theme_preference`) not yet added to the Phase 5 schema — flagged below, not yet made.

---

## Phase 7 Review

### Architectural Decisions Made
1. Phase 7 delivers design system infrastructure (tokens, scales, component mapping) using shadcn/ui's native token convention — not the final brand identity, which remains deferred per Phase 2. Rebranding later is a token-value change, not a restructure.
2. Color tokens follow shadcn/ui's standard variable set for both light and dark mode, integrating with the specified stack with no adaptation needed.
3. Semantic status tokens map directly onto Phase 5's actual `mastery_level` and status vocabularies, rather than existing independently of the data model.
4. Typography, spacing, radius, shadow, and breakpoint scales adopt Tailwind's/shadcn's own defaults wherever they already fit.
5. Iconography is Lucide, matching shadcn/ui's convention and the icon library already available in the platform's tooling.
6. The component-mapping table (Section 6) translates Phase 4's Widget catalog into specific, buildable shadcn/ui primitives.

### Assumptions
1. Body text defaults to 18px rather than the more typical 16px dense-SaaS default, treated as the UI-wide default given the young-learner audience, not just a lesson-content-only override.
2. Theme preference should persist per-user across devices via a database column, not browser-local storage alone.
3. AAA contrast applies specifically to Student-facing and Pre-Primary/Primary UI; AA is the baseline elsewhere.

### Risks
1. **Token-only rebranding is optimistic in practice:** it holds only if every component references a token rather than a hardcoded value; this needs enforcement (e.g., a lint rule) at implementation time, not just a documented intention.
2. **Contrast values are stated by design intent, not verified:** the HSL pairs in Section 2 are chosen to be AA/AAA-plausible but should be run through an actual contrast checker once implemented, not assumed correct from the values alone.
3. **No brand identity yet:** the palette and typeface here are a working direction, not a final brand decision — expect this section, not just a product name, to be revisited when the deferred branding project happens.

### Questions Requiring Approval
1. Confirm the deep-green/amber color direction (Section 2), or provide a different direction.
2. Confirm Inter as the typeface, or specify a preference.
3. Confirm adding a `theme_preference` column to `profiles` (a small Phase 5 addition) for cross-device dark/light persistence.
4. Confirm AAA contrast specifically for Student-facing and Pre-Primary/Primary UI, versus AA platform-wide uniformly.
5. Approve Phase 7 to proceed to Phase 8 (Security, Performance, Infrastructure Architecture).
