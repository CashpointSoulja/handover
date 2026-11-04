# Recorded proposals

One file per recurring payment, and one per reply branch:
`<household>/<payment>.json` and `<household>/<payment>@<branch>.json`.

Every file here must come from a real model run of `npm run eval:live`. Each carries the model id,
the run date, the prompt version and the hash of the exact input the model saw. The engine only
uses a proposal whose hash matches the current input; anything else shows as stale.

Never write or edit a proposal by hand.

Status: no proposals recorded yet. Until they are, decisions that need one show as pending.
