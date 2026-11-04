# Handover design sheet

Written 4 November 2026. No screen is styled outside `src/tokens.css`; this page says where every token came from.

## Sources

| Source | URL | Date | Notes |
|---|---|---|---|
| Nous live site, read in a browser | https://www.nous.co | 4 Nov 2026 | Palette, type, shape and wordmark below. |
| Nous wordmark SVG | https://cdn.prod.website-files.com/61150f08e088dd4b962d7961/6ad0da9d718c8228eb2b3c5f_nous-nous-logo.svg | 4 Nov 2026 | Saved unchanged as `src/assets/wordmark.svg` (255 × 62). |
| Nous job board theme colour `#473BCE` | Welcome to the Jungle company page | 4 Nov 2026 | Superseded. It is the job board's colour, not the site's. Not used. |

Rows marked **derived** are not on nous.co; they are built from the site values for states the site does not show (dark theme, dense console).

## Palette (light)

The site is warm and neutral. Primary actions are off-black, not violet.

| Token | Value | Source |
|---|---|---|
| `--brand` | `#1C1917` | nous.co: text and primary action (off-black). White text on it: 17.5:1. |
| `--brand-hover` | `#2E2925` | nous.co: primary hover. |
| `--on-brand` | `#FFFFFF` | nous.co: primary button text. |
| `--text` | `#1C1917` | nous.co: body text. |
| `--text-muted` | `#4A423C` | nous.co: secondary text. Used for all small secondary text in the console (9.8:1). |
| `--text-faint` | `#797C83` | nous.co: muted. **Deviation:** 4.2:1 on white, below 4.5:1, so it is used only for non-text detail (dividers, chart ticks, disabled glyphs), never for readable text. |
| `--border-strong` | `#A8A29D` | nous.co: light grey. |
| `--border` | `#E1DCD5` | nous.co: border. |
| `--bg`, `--surface` | `#FFFFFF` | nous.co: page white. Explicit `body` background. |
| `--surface-warm`, `--brand-tint` | `#F3EEE8` | nous.co: warm surface. Panels and headers. |
| `--bg-subtle` | `#F8F5F2` | nous.co: warm surface. |
| `--row-hover` | `#F8F3EF` | nous.co: warm surface. |
| (unused) | `#F2ECE7` | nous.co: warm surface. Recorded, not needed yet. |
| `--glow` | `#FCB747` | nous.co: brand yellow "glow". Selection bar accent. |
| `--glow-tint` | `#FDD696` | nous.co: glow tint. |
| `--glow-surface`, `--row-selected` | `#FEEED3` | nous.co: glow tint. Selected row background (text 15.3:1). |
| `--focus-ring` | `#1C1917` | Derived: off-black, 2px outline, 2px offset. Yellow on white is under 3:1, so it is not the light focus ring. |

Other site colours, recorded but not used for decisions: red `#F76D52`, orange `#F4904D`, blue `#7AB2CE` (surface `#F2F8FC`), green `#11AE38` (tints `#D1E8E0`, surface `#F2F6F2`), dark `#131313`.

## Palette (dark, derived)

nous.co has no dark theme, so these are derived from the site's own values.

| Token | Value | Source |
|---|---|---|
| `--bg` | `#131313` | nous.co dark. |
| `--surface` | `#1C1917` | nous.co off-black, used as a surface. |
| `--surface-raised`, `--surface-warm` | `#26211D` | Derived, between off-black and hover. |
| `--border` | `#2E2925` | nous.co hover colour, used as a border. |
| `--border-strong` | `#4A423C` | nous.co secondary text, used as a border. |
| `--text` | `#F8F5F2` | nous.co warm surface, used as text (17.1:1). |
| `--text-muted` | `#A8A29D` | nous.co light grey, used as text (6.9:1 on surface). |
| `--brand` / `--on-brand` | `#F8F5F2` / `#1C1917` | Derived: the primary button inverts (16.1:1). |
| `--row-selected` | `#3A2F22` | Derived: glow mixed into off-black. |
| `--focus-ring` | `#FCB747` | nous.co glow (10.6:1 on `#131313`). |

## Wordmark

`src/assets/wordmark.svg`, unchanged from the source above, sits small and top-left in the console header, owned by the header. Its fill is `#1C1917`; in the dark theme the header inverts it with a CSS filter, and the file stays unchanged.

## Type

| Token | Value | Source |
|---|---|---|
| `--font-display` | DM Sans 500, then Inter, system sans | nous.co uses **Goodsans** (licensed), weight 500, h1 about 69px, section headings 48/54. **Substitution:** DM Sans from Google Fonts, the closest freely licensed geometric grotesk. Goodsans is not self-hosted. |
| `--font-sans` | Inter, then Open Sans, then `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` | nous.co uses **Nous2026Inter** (a custom Inter build) for UI and Open Sans for body. **Substitution:** stock Inter and Open Sans from Google Fonts. The custom build is not self-hosted. |
| `--font-mono` | JetBrains Mono, then `ui-monospace, 'SF Mono', Menlo, Consolas, monospace` | Not on nous.co. Descriptors, rule ids, case ids. |
| `--font-wa` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif` | WhatsApp Web system stack. |
| Sizes | nous.co body 16 to 18px / 26px, labels 14px | **Deviation:** the console is a dense internal ops view, so its base is 13px (labels 12px, ids 12px mono). The member-facing chat uses 14.2px. |

## Shape and spacing

| Token | Value | Source |
|---|---|---|
| `--radius-pill` | 999px | nous.co: pill buttons. All console buttons, badges and tabs are pills. |
| Control height | nous.co: 56px, 24px padding | **Deviation:** console controls are 28px high with 12px padding, for density. Shape and colours follow the site. |
| `--radius-md`, `--radius-lg` | 8px, 16px | Derived: cards and panels. |
| `--space-2/4/5/6/7` | 8 / 16 / 24 / 32 / 80px | nous.co spacing scale. `--space-1` (4px) and `--space-3` (12px) are derived half-steps for the dense console. |
| `--content-max` | 1312px | nous.co content max-width. Used for the Evals and Rules tabs. |
| `--row-h` | 30px | Brief: 28 to 32px rows, tabular numbers. |

## Decision colours

A fixed semantic set, independent of the brand and of the site's own red, orange, blue and green. They are always paired with the text label, never colour alone. Every pair passes 4.5:1 in both themes; `design/contrast.test.ts` checks them on every test run.

| Decision | Light fg / bg | Dark fg / bg |
|---|---|---|
| CANCEL (red) | `#B42318` / `#FEF3F2` (6.1:1) | `#FDA29B` / `#3A1512` (8.4:1) |
| FLAG (amber) | `#93370D` / `#FFFAEB` (7.2:1) | `#FEC84B` / `#33230B` (9.8:1) |
| ASK (blue) | `#175CD3` / `#EFF8FF` (5.6:1) | `#84CAFF` / `#0F2742` (8.6:1) |
| HUMAN (slate) | `#364152` / `#EEF2F6` (9.2:1) | `#CDD5DF` / `#28303C` (9.0:1) |
| LEAVE (grey) | `#5D6679` / `#F5F5F6` (5.3:1) | `#B3B8C2` / `#24252A` (7.7:1) |

## WhatsApp pane

Faithful to WhatsApp, not to Nous. Starting values from the brief; check them against WhatsApp Web in light and dark before release.

| Token | Light | Dark | Note |
|---|---|---|---|
| `--wa-chat-bg` | `#EFEAE2` | `#0B141A` | Brief starting value. |
| `--wa-out` | `#D9FDD3` | `#005C4B` | Brief starting value. |
| `--wa-in` | `#FFFFFF` | `#202C33` | Brief starting value. |
| `--wa-text` | `#111B21` | `#E9EDEF` | Brief starting value. |
| `--wa-meta-in` | `#667781` | `#8696A0` | Brief starting value (4.7:1). |
| `--wa-meta-out` | `#56656E` | `#C2D6D1` | **Deviation:** `#667781` on `#D9FDD3` is 4.2:1, so darkened to 5.4:1; dark lightened for the same reason. |
| `--wa-tick` | `#53BDEB` | `#53BDEB` | Brief starting value. Icon only. |
| `--wa-button-text` | `#0270A1` | `#53BDEB` | Reply buttons below the bubble: max 3, max 20 characters. |
| `--wa-avatar-bg` | `#1C1917` | `#1C1917` | Off-black circle with a lowercase "n" in white. |

Bubbles have tails, 11px timestamps inside the bubble and reply buttons below it. The faint background pattern is drawn in CSS for this project; WhatsApp's asset is not used.

**Contact name.** The chat header shows **Nous**, not Nora, which is described as an internal name. No verified badge and no logo image in the chat.

## Console

Dense internal ops view: 13px base, 30px rows, tabular numbers, monospace for descriptors, rule ids and case ids, 1px borders rather than shadows. Off-black is used only for primary actions; glow yellow marks selection; neither is ever a decision colour. Console labels may say "Nora", since this is an internal view. The sample-data line appears once, in the console header, in `--text-muted`. The footer line appears once, at the bottom of every screen.

## Voice

1. Short sentences. One idea each. Say what happened, then what happens next.
2. UK spelling and UK money: £9.99 for a charge, £120 a year for a total; pence only when they matter.
3. Warm and plain, like a capable friend who sorted the bills. No fintech jargon: "payment", not "transaction"; "stop", not "terminate".
4. Members are mostly working parents with no spare time. Ask one question at a time, and make every answer a tap.
5. Never pressure. If we are not sure, we ask; if they said keep it, we leave it.

## Open questions

- **Member-facing name.** Is the assistant shown to members as "Nous" or "Nora"? Unconfirmed; the pane uses "Nous".
- **WhatsApp values.** Not yet checked against WhatsApp Web in this build.
- **Dark theme.** nous.co has none; the dark values above are derived and unreviewed.
