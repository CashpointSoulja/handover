# Roadmap: v2

v1 decides and explains. v2 connects those decisions to things that act, and learns from what members say.

1. **Hand decisions to Nous's existing cancel flow.** CANCEL and member-confirmed FLAG decisions go out as jobs with their attachments: `cancel_method: provider_notice` gives notice instead of stopping the direct debit; `cancel_via` cancels through the parent bill; `refund_request` and `deadline` open a refund claim. The trace becomes the audit record for each job.
2. **A policy-verification pipeline.** Each entry in `config/policies.yaml` gets a source URL, a verified-on date and a re-check schedule. Only `verified` policies can let R13 attach without a cap. A policy whose page changes drops back to `assumed` until it is checked again.
3. **An ops queue for HUMAN.** Post-cancel charges (R01) and model escalations land in a queue with the trace attached, the refund amount and an SLA. Resolution, such as a refund received, is written back so R01 does not fire again.
4. **Learning from member replies.** Every reply-button tap is a labelled example: "It's Disney+" confirms an aggregator mapping; "Keep it" after a FLAG is a false-positive signal. These feed merchant patterns, prices and new eval cases, never the rules directly. A rule change still has to pass the eval gate.
5. **A stalled-switch watchdog.** Energy and broadband switches run for weeks. A watchdog spots a switch with no progress, a double-billing overlap or a missed final bill, and raises it as HUMAN with the evidence.

**Rule candidates from the v1 evals:** "already cancelled → LEAVE", and "no member signal of disuse → cap FLAG". They close the six cases where only the proposal prevents a false cancel (see [PRD](prd.md)).
