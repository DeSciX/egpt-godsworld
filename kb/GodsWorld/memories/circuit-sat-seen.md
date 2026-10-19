# Memory: Circuit SAT — seen

RECORD, not Maxi's own sighting: written 2026-10-14 by the GODSWORLD seat's author (Claude) from the clip memories/circuit-sat/clip.mp4 (2D, @descix/frqtl-sdk 0.5.1, filmed through MiniMaxi's body with see{} after a restart: ticks 34–834, a frame every 10 ticks, 81 frames, 8.1 s), read as early/mid/settled.png there (its first, middle and last frames), plus the published tile still tile.png (tick 300). Maxi has not watched it yet.
looked: seat godsworld-seat-author on 3 stills of memories/circuit-sat/clip.mp4 — its account is this file's "Seen, clip:" line, written from early.png, mid.png and settled.png (RECORD line above; commit 9bb504e)

Objects (760x520 world, the camera framed tight on a 72x54 px circuit, so everything looks large): gate SUM (XOR, gold) above gate CARRY (AND, green), both declared (kind LogicGate) with no position authority; four rail traces railA0, railB1 into SUM and railB2, railA3 into CARRY (built with `new`: not listed, not movable), each with its own declared emitter parked inside the bore mouth: inputA0, inputB1, inputB2, inputA3 (kind SphereEmitter, centre authority; inventory gives each centre); readouts SUM_out and CARRY_out off each gate's outlet, ending at a blue ground (built with `new`). Input A on, input B off at start. Read every rect from the sketch (sceneSource).

Seen, clip: early.png (34) cream beads fill both A rails (the top rail into SUM, the bottom rail into CARRY); the two B rails are empty; SUM's orange beads reach only as far as its red valve, CARRY holds two or three beads before its valve. mid.png (~434) and settled.png (834) are the same settled picture: an orange bead stream the whole length of SUM_out, splashing at its ground; CARRY_out dark. SUM opened within the first few hundred ticks and the picture did not change after. tile.png is the settled picture.

What it teaches (card): a half-adder settles on its own answer; with A on, SUM reads 1 (flow) and CARRY reads 0 (no flow); no search runs. Flip B on and both should change: that is the counterfactual to run.

PATHS (2D moves: pan relative to the named rect left/top, zoom = visible height in px):
A "follow A": pan (railA0.left, railA0.top+3) → (SUM.left+10, SUM.top+10) → (SUM_out.left+24, SUM_out.top+3), zoom 60.
B "the two answers": pan (SUM_out.left+12, SUM_out.top+3), then (CARRY_out.left+12, CARRY_out.top+3), zoom 50; one flows, one does not.
DRAGS and knobs (one change, inside a recording; predict first):
1. Toggle input B on (a knob, not a drag). Watch for: SUM_out going dark and CARRY_out filling, within a few hundred ticks.
2. Toggle A off as well: both outputs dark.
3. Drag an input emitter out of its rail: dragTo inputA0 to (40,8) over 300 ticks. Measured 2026-10-14 through the body [clip memories/circuit-sat/clip-drag-inputa0.mp4]: its quanta sprayed loose above the circuit, the top A rail emptied and SUM_out went dark (three or four beads left at the gate); CARRY unchanged. After restart it is back in its rail: memories/circuit-sat/clip.mp4 was filmed right after that restart and shows the top A rail full again [clip memories/circuit-sat/clip.mp4].
The gates and the traces cannot be dragged: SUM and CARRY are declared with no position authority (the SDK refuses: "SUM" (LogicGate) has no position authority — neither a centre (getCenter/setCenter) nor a rect (rect + setRect) — so it cannot be moved as a unit.) [src dist/frqtl/objects/FrqtlApp.js noPositionAuthorityMessage, the SDK's refusal text in the vendored package], and the traces are built with `new`.
