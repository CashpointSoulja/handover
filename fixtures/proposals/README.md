# Recorded proposals

One file per recurring payment, and one per reply branch:
`<household>/<payment>.json` and `<household>/<payment>@<branch>.json`.

Every file here comes from a real model run of the classifier prompt. Each carries:

| Field | Meaning |
|---|---|
| `model` | The model label: the id the endpoint reports for live runs, or the label passed to `eval:import`. Never guessed. |
| `run_at` | Live runs: when the model answered. Chat-recorded: when the answers were imported. |
| `prompt_version`, `input_hash` | The prompt version and a hash of the exact input the model saw. The engine only uses a proposal whose hash matches the current input; anything else shows as stale. |
| `source` | `live-api` (`npm run eval:live`) or `chat-recorded` (`npm run eval:export`, then `npm run eval:import`). |

**Chat-recorded** proposals are the classifier prompt run in a chat, with several requests per message, and the answers imported unchanged. They are not live API runs, and scores built on them are eval scores on this case set, not production accuracy.

Never write or edit a proposal by hand.

## Recording without an API key

1. `npm run eval:export -- --pass 1` writes `/tmp/proposal-requests-pass1.md`: the system prompt once, then batches of requests, each a `KEY` line and the exact user prompt.
2. Send the system prompt, then each batch as one message. Save the replies (each a `KEY` line, then the JSON object) to a file.
3. `npm run eval:import -- <file> --model "<model label>"`. Malformed answers, unknown or duplicate keys, and answers whose input changed since export are rejected and the command exits non-zero. Add `--dry-run` to check a file without writing.
4. Repeat with `--pass 2` for reply branches. Pass 2 needs pass 1 imported first, because which branches exist depends on the base decisions.
