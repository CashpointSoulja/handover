# Viability

## Why now

The UK's subscription-contracts regime under the Digital Markets, Competition and Consumers Act is set for January 2027; its secondary legislation is still pending ([DWF, October 2026](https://dwfgroup.com/en-au/news-and-insights/insights/2026/10/dmcca-subscription-contracts-regime-preparing-for-the-new-restrictions)). It brings in easier exits, renewal reminders and cooling-off refunds. A service that cancels on members' behalf will need to show why each decision was made and that refund windows were not missed. That is what the trace and R13 record.

## Each part, against the role

Lines quoted from the Nous Product Builder posting ([Ashby](https://jobs.ashbyhq.com/nous/1f7dee70-3fc1-441a-b868-f27454ecf9d6), fetched 4 Nov 2026).

| Part | JD line it answers | Surface it lives on | Where an engineer gets pulled in |
|---|---|---|---|
| Detection and the 14-rule gate | "Dig into the data behind our subscription product, spot the patterns, and build the logic that decides what's worth cancelling or flagging." | Config: `rules.yaml`, `merchants.yaml`, `prices.yaml` | A new rule *type*, or a rule that reads new data |
| Eval set, runner and gates | "build and run the evals that tell us whether she's getting better" | CLI and CI: `npm run eval`, `--compare` | Wiring the gate into the real deploy pipeline |
| Post-cancel charges (R01) and HUMAN | "tighten the recovery flows for when things go wrong" | Read-only over bank data; it alerts, never acts | Handing HUMAN decisions to the ops queue |
| Rules, templates and thresholds as YAML | "Ship on the safe surfaces: prompts, agent behaviour, configuration, workflows, data pipelines, internal tools. Know where the edge is, and pull in an engineer before you cross it." | Config only; every change is scored by the eval gate | Anything that executes, sends or calls a model live |
| WhatsApp pane and chat signals | "Read the conversations, watch where the product delights people or falls over, and let that drive what you build next." | `chat.json` signals and `messages.yaml` copy | Sending through the real WhatsApp Business API |
| Decision trace and attribution | "A feature isn't done when you've shipped it, it's done when it's working for members." | Read-only internal console | Pulling live traces from production logs |
| Cancelling for real (v2) | "Then work out how we cancel them automatically. Real money back in people's pockets." | Not in v1: v1 decides and explains | The handoff into Nous's existing cancel flow |

The posting's surface for the agent: "Find where she struggles in real conversations, improve how she handles them, build and run the evals that tell us whether she's getting better, and tighten the recovery flows for when things go wrong." Handover is one concrete slice of that: the place where the agent's judgement is bounded, measured and recovered.

## Safe surfaces

Everything a non-engineer would change lives in YAML and is covered by the eval gate: thresholds, rule toggles, merchant patterns, sample prices, refund policies and message copy. The engine is pure and deterministic, so a config change is fully described by the eval diff it produces. Nothing in v1 executes a cancellation, sends a message or calls a model from the public link.

## Where it stops being safe without an engineer

- Executing anything: the handoff into Nous's existing cancel flow.
- Verifying refund policies: today every policy is `assumed`, which keeps R13 from driving any automatic action.
- Running the classifier live, including prompt changes, which must re-record proposals and re-run the evals.
