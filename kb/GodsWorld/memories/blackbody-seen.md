# Memory: Blackbody — seen

RECORD, not Maxi's own sighting: written 2026-10-14 by the GODSWORLD seat's author (Claude) from the clip memories/blackbody/clip.mp4 (2D, @descix/frqtl-sdk 0.5.1, filmed through MiniMaxi's body with see{} after a restart: ticks 27–927, a frame every 10 ticks, 91 frames, 9.1 s), read as early/mid/settled.png there (its first, middle and last frames), plus the published tile still tile.png (tick 600). Maxi has not watched it yet.
looked: seat godsworld-seat-author on 3 stills of memories/blackbody/clip.mp4 — its account is this file's "Seen, clip:" line, written from early.png, mid.png and settled.png (RECORD line above; commit 9bb504e)

Objects (600x400; inventory lists the two the sketch declares): the oven (kind OvenBox, no position authority), a grey-walled box 200x133 centred on (300,200): outer rect ≈[200,133,200,133], walls 10 thick, cavity ≈[210,143,180,113], a 60 px slit in its right wall at mid-height; a thermostat holding about 1500 quanta inside; radiation_sink (kind LargeObject, rect authority) [570,0,30,400] at the right edge (black, invisible against the background).

Seen, clip: early.png (27) red blobs lining the inside of all four walls, the middle of the box still empty, a few specks at the slit; mid.png (~477) the box filled with red blobs and yellow specks, a wide fan of specks spraying right from the slit across the right half of the frame; settled.png (927) blobs throughout the box and heaviest along the floor, specks spread over the right half, a few red blobs out beyond the slit. tile.png (tick 600) matches mid: blobs inside, a stream out of the opening.

What it teaches (card): a hot box glows, light spills through a slit; colliding particles merge into larger frames and a frame's fullness sets its colour, so what leaks is a spectrum of sizes. The red blobs are the merged frames; the specks are single quanta.

PATHS (2D moves: pan relative to the oven cavity rect left/top, zoom = visible height in px):
A "the slit": pan (cavity.left+180, cavity.top+56), zoom 120; what passes out.
B "inside, along the floor": pan (cavity.left+20, cavity.top+100) → (cavity.left+160, cavity.top+100), zoom 90; the clumps on the bottom wall.
C "to the sink": pan (cavity.left+200, cavity.top+56) → (cavity.left+360, cavity.top+56), zoom 200; how far the spill spreads.
DRAGS (one change, inside a recording; predict first):
1. radiation_sink, the only object here that moves: dragTo radiation_sink to [480,200] over 300 ticks (from rect [570,0,30,400] to [465,0,30,400]). Measured 2026-10-14 through the body [clip memories/blackbody/clip-drag-sink.mp4]: before, the spill of specks reached the right edge region near x 560; after, it stopped near x 460. Watch for: the spill ending at the sink's new left edge.
The oven cannot be dragged: it is declared but has no position authority, and the SDK refuses: "oven" (OvenBox) has no position authority — neither a centre (getCenter/setCenter) nor a rect (rect + setRect) — so it cannot be moved as a unit. [src dist/js/game/FrqtlApp.js noPositionAuthorityMessage, the SDK's refusal text in the vendored package] To move the cavity, change its rect in the sketch.
KNOBS (one change, inside a recording; predict first):
1. A knob, not a drag: raise the temperature from 1500 to 4000. Watch for: more and bigger red blobs, a thicker spill.
