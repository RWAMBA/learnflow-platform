# Exact dark public colour replacement

## Implementation
- Replace only the `.public-site` semantic colour values with the ten mandatory reference colours.
- Map existing public roles for backgrounds, surfaces, recessed/hover states, borders, text, muted text, actions, hover, and focus to those exact values.
- Keep accessible semantic error, warning, success, and information colours on the dark surfaces.
- Remove superseded ivory, white, sage, and warm-accent public values without changing global authenticated-interface tokens.
- Scan public components and routes for conflicting hard-coded colours and correct only colour usage where necessary.

## Verification
- Confirm exact token values and absence of superseded public palette values.
- Run typecheck, lint, the complete test suite, and existing public responsive checks.
- Inspect every public route at 360px and 1440px, including navigation, forms, states, and footer.
- Capture the homepage, a content page, the footer, and an authenticated page; verify no visible authenticated-interface change.
- Confirm all 33 CMS records remain unchanged drafts and nothing is published or deployed.

## Technical details
- Continue using the existing Tailwind semantic mappings in `src/styles.css`; no layout, typography, behavior, route, auth, database, or CMS changes.
- Use exact hex-backed CSS variables for the mandatory public values so source verification is unambiguous.
