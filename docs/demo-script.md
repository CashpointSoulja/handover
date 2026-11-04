# Demo script: 90 seconds

Vertical-friendly: record the console at 375 to 430px wide using the Queue, Trace, Chat, Evals and Rules tabs, or desktop cropped to one column at a time. One idea per shot, large cursor, no music under the voice.

Shots 3, 4 and 6 need recorded proposals (`npm run eval:live`). Until those exist, those screens show "Pending".

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00–0:08 | Trace, H1 £9.99 APPLE.COM/BILL | Open the live link. It lands here. | "An AI can find your subscriptions. The hard part is not cancelling the ones you want." |
| 0:08–0:22 | Trace | Point at the charges, then the normalised service: aggregator. Scroll to the proposal card. | "Here's a £9.99 Apple charge. Apple bills for hundreds of apps, so the line on the statement doesn't say which one." |
| 0:22–0:35 | Trace | Hover R05: the charges light up. Stop on "Handed to rules at R05". | "The model proposes. Then fourteen plain rules check it, and they can only make it more careful. This one says: we don't know which app, so we ask." |
| 0:35–0:50 | Chat | Show the question. Tap "It's Disney+". The decision changes live. | "The member gets one question on WhatsApp, with a tap to answer. Once they tell us it's Disney+, the decision moves on." |
| 0:50–1:02 | Trace, H5 Disney+ | Open from the queue. Hover R01: the 14 Oct charge and the "Cancelled disney today" message light up. | "And if something we cancelled charges again, it goes straight to a person, with a refund request and an urgent flag." |
| 1:02–1:15 | Rules | Turn off R05. Cut to the Evals headline: false cancels turns red. Turn it back on: green. | "Every rule is a switch. Turn one off and every household and every eval re-runs. The gate is simple: false cancels must be zero." |
| 1:15–1:25 | Evals | Pan the headline strip, then the category filter. Point at "Held-out". | "Forty test cases across eight ways this goes wrong, plus ten held-out cases written after the rules were frozen." |
| 1:25–1:30 | Footer | Hold on the console. | "The LLM proposes. The rules decide. Nothing gets cancelled that a member would want back." |

Last frame: the console with the footer visible. No end card.
