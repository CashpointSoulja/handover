# PRD: Handover

## Problem

An AI agent can already find subscriptions and act on them. The risk is not missing a saving; it is cancelling something a member wanted: a child's music plan, the copy of Microsoft 365 they actually use, a gym contract that keeps billing after the direct debit stops. One wrong cancel costs more trust than a dozen missed savings. Today nothing sits between the model's guess and the cancel button that can say "not without asking".

## Member outcome

Members get the savings without the scares. Anything we are unsure about becomes a question with tap-to-answer replies. Anything already cancelled but still charging reaches a person the same day. A member in Manual mode is never auto-cancelled.

## v1 scope

| In v1 | Out of v1 (see [roadmap](roadmap-v2.md)) |
|---|---|
| Recurring-payment detection on Open Banking-shaped transactions | Executing cancellations, browser agents, Apple code handling |
| LLM proposal step, recorded from a real run and replayed in the browser | A live LLM call from the public link |
| Deterministic ruleset as config, toggleable in the UI | Rule authoring UI |
| Decision trace per recurring payment | Email or receipt parsing |
| WhatsApp member pane showing the message each decision produces | Real WhatsApp sending |
| 40-case eval runner in the browser and the CLI, plus a 10-case held-out set | Learned recurrence models |
| Post-cancel charge detection as a recovery flow | Long-running switch workflows (energy, broadband) |

v1 decides and explains. It never executes a cancellation.

## Decision model

Decisions, from most to least autonomous: **CANCEL** (Auto mode only, confirmation after the fact), **FLAG** (recommend; the member confirms), **ASK** (one question, up to 3 reply buttons), **HUMAN** (ops follows up), **LEAVE** (nothing sent).

1. **Propose.** For each recurring payment the recorded proposal gives service, category, isSubscription, proposedAction, confidence and a one-sentence rationale. The model never sees the member's mode, the rules or refund policies.
2. **Gate.** The 14 rules in `config/rules.yaml` run in order. A **terminal** rule sets the decision and stops. A **cap** rule sets the most autonomous decision still allowed. An **attach** rule adds a side action (refund_request, priority: urgent, deadline, cancel_via, duplicate_of, price_rise).
3. **Decide.** The final decision is the proposal lowered to the strictest cap (CANCEL > FLAG > ASK > HUMAN). No rule and no proposal can raise it. `decidedBy` is `llm` when no cap bound it, otherwise the first rule that set the binding cap. That is the handover line the trace draws.
4. **Message.** A UK-English template is picked by decision and binding rule, then shown in the WhatsApp pane. Tapping a reply re-runs the engine with that answer.

Two guarantees sit outside the toggles: R04 (Manual mode) is locked on, and the gate turns any CANCEL in Manual mode into FLAG. A proposal recorded against different input is treated as stale and never used.

## Open questions

- **Recorded proposals.** All proposals are chat-recorded: the classifier prompt was run in a chat (base proposals, then reply branches) and the answers imported unchanged with `eval:import`. They are not live API runs, and every score on them is an eval score on this case set, not production accuracy. See [test results](test-results.md).
- **What the recorded run showed** (all from [test results](test-results.md)):
  - No false cancels on the 40 cases or the held-out set. The model proposed CANCEL only where the member had said a service was unused.
  - On the base data the model never proposed FLAG; it asked or left things instead, so FLAG does not appear in the household decision counts. It proposed FLAG only in reply branches where the member does not recognise a charge. The brief's "every decision type at least twice" is not met on the base data.
  - Its confidence clusters below 0.80, so R06 fires in every household and takes attribution from more specific rules (R12, R11, R08).
  - Because caps lower but never raise, a LEAVE proposal stays LEAVE even where a rule would have asked: shared plans, refund windows, bundles and identified aggregator charges fail on decision, not on safety.
  - With these proposals, switching off any single rule produces no false cancel (the one-rule-off table). Which rule protects what is shown by the synthetic stress test, which is not model output.
- **Six unguarded cases.** In the synthetic stress test, a proposer that always says CANCEL is stopped everywhere except six cases: an identified Apple charge, an annual plan outside its refund window, a renewal whose policy is treated as verified, a trial 12 days out, a trial that has already converted, and a service already cancelled with a final bill. In those, only the proposal stands between the member and a false cancel; R06 covers them only if the proposal is unsure. Candidate v2 rules: "already cancelled → LEAVE" and "no member signal of disuse → cap FLAG".
- **Refund policies.** Every entry in `config/policies.yaml` is `assumed`. Nothing can be verified until each has a source URL and a date.
- **Member-facing name.** The pane shows "Nous". The agent's member-facing name is unconfirmed.
- **R06 threshold.** 0.80 may be too strict for this model's calibration; changing it is a rules change and needs a new frozen version and a re-run.
