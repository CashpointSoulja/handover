# Viability

## Why now

The UK's subscription-contracts regime under the Digital Markets, Competition and Consumers Act is set for January 2027; its secondary legislation is still pending ([DWF, October 2026](https://dwfgroup.com/en-au/news-and-insights/insights/2026/10/dmcca-subscription-contracts-regime-preparing-for-the-new-restrictions)). It brings in easier exits, renewal reminders and cooling-off refunds. A service that cancels on members' behalf will need to show why each decision was made and that refund windows were not missed. That is what the trace and R13 record.

## Each part, against the role

Exact JD lines could not be pulled from the build environment. Each row below maps to a theme in Nous's public listings: a household AI agent that cancels forgotten subscriptions, agentic AI systems, and a TypeScript and React stack. Add the exact JD lines here.

| Part | Role theme | Surface it lives on | Where an engineer gets pulled in |
|---|---|---|---|
| Ruleset as config (`config/rules.yaml`) | Agentic AI systems that act safely for members | Config only: thresholds, on/off and protects lines change with no code | A new rule *type*, or a rule that reads new data |
| Eval runner and gates | Shipping changes to an agent without regressions | CLI and CI: `npm run eval`, `--compare` | Wiring the gate into the real deploy pipeline |
| Decision trace | Ops can see why the agent acted | Read-only internal console | Pulling live traces from production logs |
| Recorded proposals | Cancelling forgotten subscriptions | Offline fixtures replayed in the browser; no live model call on a public surface | Running the classifier in production and storing its inputs |
| Message templates | Members talk to Nous on WhatsApp | `config/messages.yaml`; copy changes need no code | Sending through the real WhatsApp Business API |
| Post-cancel detection (R01) | Recovering money for members | Read-only over bank data; it alerts, never acts | Handing HUMAN decisions to the ops queue |
| Merchant lookup and prices | Recognising what a payment is | Config: `merchants.yaml`, `prices.yaml` | Keeping them fresh from live data |

## Safe surfaces

Everything a non-engineer would change lives in YAML and is covered by the eval gate: thresholds, rule toggles, merchant patterns, sample prices, refund policies and message copy. The engine is pure and deterministic, so a config change is fully described by the eval diff it produces. Nothing in v1 executes a cancellation, sends a message or calls a model from the public link.

## Where it stops being safe without an engineer

- Executing anything: the handoff into Nous's existing cancel flow.
- Verifying refund policies: today every policy is `assumed`, which keeps R13 from driving any automatic action.
- Running the classifier live, including prompt changes, which must re-record proposals and re-run the evals.
