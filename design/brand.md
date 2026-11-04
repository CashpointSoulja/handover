# Handover design sheet

Written 4 November 2026. No screen is styled outside `src/tokens.css`; this page says where every token came from.

## Source status

| Source | URL | Result on 4 Nov 2026 |
|---|---|---|
| Nous home page | https://nous.co/ | Not reachable from the build environment (network policy refused the host). Live CSS custom properties, computed colours, fonts and the wordmark could not be pulled. |
| Nous help pages | https://nousforyourhouse.notion.site/How-Nous-works-18fe4fd0813680e8a5aafec66ff6c7fd | Not reachable from the build environment. |
| Nous job board | https://app.welcometothejungle.com/companies/nous | Not reachable from the build environment. Theme colour `#473BCE` taken from the build brief, which records it from this page. |

Because the live site could not be fetched, the brief's fallback applies: `#473BCE` is the primary colour, and every other brand value is **derived** from it. Re-run the extraction from a machine that can reach nous.co and replace the derived rows.

## Brand

| Token | Light | Dark | Source |
|---|---|---|---|
| `--brand` | `#473BCE` | `#5F54DB` | Light: job board theme colour (via brief). Dark: derived, lifted 8% lightness so white text keeps 5.6:1. |
| `--brand-hover` | `#3A2FB0` | `#6F65E3` | Derived: 15% darker / 8% lighter. |
| `--brand-text` | `#473BCE` | `#A49DF5` | Light: primary. Dark: derived tint for text on dark surfaces (7.2:1). |
| `--brand-tint` | `#F1F0FC` | `#221F3D` | Derived: primary at 7% over the page background. Selection rows. |
| `--brand-tint-strong` | `#E3E1F9` | `#2D2950` | Derived: primary at 14%. |
| `--focus-ring` | `#473BCE` | `#A49DF5` | Derived from primary. 2px outline, 2px offset. |

Violet is used only for primary actions, selection and focus. It is never a decision colour.

## Wordmark

The header carries the Nous wordmark, small and top-left. The SVG could not be pulled from nous.co (see Source status). Until it is, the header sets the word `nous` in lowercase, 800 weight, `--brand`. To use the real file, save it as `src/assets/nous-wordmark.svg`; the header picks it up at build time with no code change.

## Surfaces and text

| Token | Light | Dark | Source |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#121118` | Derived. Explicit `body` background in both themes. |
| `--bg-subtle` | `#F6F6F9` | `#17161E` | Derived: neutral with a violet cast. |
| `--surface` | `#FFFFFF` | `#1B1A23` | Derived. |
| `--text` | `#16152B` | `#ECECF3` | Derived: near-black with a violet cast. 17.9:1 / 16.0:1. |
| `--text-muted` | `#5E5D72` | `#A3A2B5` | Derived. 6.4:1 / 6.9:1. Sample-data line and secondary labels. |
| `--border` | `#E4E4EB` | `#2E2D3A` | Derived. 1px borders, no shadows. |
| `--border-strong` | `#CFCFD9` | `#43425A` | Derived. Inputs and table heads. |

## Type

| Token | Value | Source |
|---|---|---|
| `--font-sans` | Inter, then `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` | Substitution. Nous's font could not be identified from here. Inter is a Google Font, loaded from Google Fonts, never self-hosted. Swap if the live site shows a different family. |
| `--font-mono` | JetBrains Mono, then `ui-monospace, 'SF Mono', Menlo, Consolas, monospace` | Google Font. Descriptors, rule ids, case ids. |
| `--font-wa` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif` | System stack, as WhatsApp Web uses. |
| Base size | 13px console; 14.2px chat bubbles | Brief: dense ops console. |
| Radii | 4 / 6 / 10px, pill 999px | Derived. Buttons 6px, cards 10px. |
| Button shape | 6px radius, 28px high, 600 weight | Derived; replace with nous.co computed values when reachable. |
| Rows | 30px, tabular numbers | Brief: 28 to 32px. |

## Decision colours

Fixed semantic set, independent of the brand. Always paired with the text label, never colour alone. All pairs pass 4.5:1 in both themes; `design/contrast.test.ts` checks them on every test run.

| Decision | Light fg / bg | Dark fg / bg |
|---|---|---|
| CANCEL (red) | `#B42318` / `#FEF3F2` (6.1:1) | `#FDA29B` / `#3A1512` (8.4:1) |
| FLAG (amber) | `#93370D` / `#FFFAEB` (7.2:1) | `#FEC84B` / `#33230B` (9.8:1) |
| ASK (blue) | `#175CD3` / `#EFF8FF` (5.6:1) | `#84CAFF` / `#0F2742` (8.6:1) |
| HUMAN (slate) | `#364152` / `#EEF2F6` (9.2:1) | `#CDD5DF` / `#28303C` (9.0:1) |
| LEAVE (grey) | `#5D6679` / `#F5F5F6` (5.3:1) | `#B3B8C2` / `#24252A` (7.7:1) |

## WhatsApp pane

Starting values from the brief. They could not be checked against WhatsApp Web from the build environment; verify in light and dark before release.

| Token | Light | Dark | Note |
|---|---|---|---|
| `--wa-chat-bg` | `#EFEAE2` | `#0B141A` | Brief starting value. |
| `--wa-out` | `#D9FDD3` | `#005C4B` | Brief starting value. |
| `--wa-in` | `#FFFFFF` | `#202C33` | Brief starting value. |
| `--wa-text` | `#111B21` | `#E9EDEF` | Brief starting value (light); dark is WhatsApp's light text. |
| `--wa-meta-in` | `#667781` | `#8696A0` | Brief starting value. 4.7:1. |
| `--wa-meta-out` | `#56656E` | `#C2D6D1` | Deviation: `#667781` on `#D9FDD3` is 4.2:1, so darkened to reach 5.4:1. Dark lightened for the same reason. |
| `--wa-tick` | `#53BDEB` | `#53BDEB` | Brief starting value. Icon, not text. |
| `--wa-button-text` | `#0270A1` | `#53BDEB` | Reply buttons below the bubble. Max 3, max 20 characters. |

Bubbles have tails, 11px timestamps inside the bubble and reply buttons below it. The faint background pattern is drawn in CSS for this project; WhatsApp's own asset is not used.

**Contact name.** The chat header shows **Nous**, not Nora; Nora is described as an internal name. Avatar: a plain violet circle with a lowercase "n". No verified badge, no logo image.

## Console

Dense internal ops view: 13px base, 30px rows, tabular numbers, monospace for descriptors, rule ids and case ids, 1px borders rather than shadows. Console labels may say "Nora", since this is an internal view. The sample-data line appears once, in the console header, in `--text-muted`. The footer line appears once, at the bottom of every screen.

## Voice

1. Short sentences. One idea each. Say what happened, then what happens next.
2. UK spelling and UK money: £9.99, £150; drop the pence when they do not matter (£95 a year).
3. Warm and plain, like a capable friend who sorted the bills. No fintech jargon: "payment", not "transaction"; "stop", not "terminate".
4. Members are mostly working parents with no spare time. Ask one question at a time, and make every answer a tap.
5. Never pressure. If we are not sure, we ask; if they said keep it, we leave it.

## Open questions

- **Member-facing name.** Is the assistant shown to members as "Nous" or "Nora"? Unconfirmed; the pane uses "Nous".
- **Live palette and font.** Not pulled (see Source status). Every derived row above should be replaced from nous.co's computed styles.
- **Wordmark file.** Not pulled; text stand-in until `src/assets/nous-wordmark.svg` exists.
- **WhatsApp values.** Unverified against WhatsApp Web in this build.
