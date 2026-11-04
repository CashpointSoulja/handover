# Five whys: a shared family plan gets cancelled

**The failure.** A mum in Auto mode opens WhatsApp to "We've cancelled Spotify (£19.99 a month)". That evening her teenager's playlists are gone, and her partner's account has dropped to the free tier. She asks how to undo it and switches the household to Manual.

1. **Why was it cancelled?** The model proposed CANCEL with high confidence: one Spotify payment, nothing in chat about it, and a cheaper individual tier exists.
2. **Why did a confident proposal go straight to the cancel button?** Confidence was the only check. In Auto mode, anything above the threshold was actioned.
3. **Why was confidence the only check?** Everything we knew about the household had to be in the prompt for the model to weigh it. Nothing said "£19.99 is the family price", so nothing outside the model could act on it.
4. **Why was that knowledge only in the prompt?** Pricing tiers, member replies, modes and contracts were treated as context for the model to read, not as facts with authority of their own.
5. **Why did they have no authority of their own?** Because nothing between the model and the action could only say "less". The model's output was the decision.

**Root cause.** No layer bounds the LLM's authority. The model can propose, but there is no deterministic step that knows which facts make an action unsafe, can lower the decision without being argued out of it, and records who decided.

**Fix in Handover.** R07 caps any payment whose price matches a family or duo tier, or that the member said is shared, at ASK: "Who else uses this?" The trace shows "Handed to rules at R07", and the eval set has a shared-plans category whose must-never is CANCEL. The same pattern covers the other ways a wanted service gets cut: bundles (R08), duplicates (R11), minimum terms (R09) and Manual mode (R04).
