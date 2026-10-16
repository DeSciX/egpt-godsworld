# Memory: A sun — seen

RECORD, not Maxi's own sighting: written 2026-10-14 by the GODSWORLD seat's author (Claude) from the clip memories/r8-sun/clip.mp4 (3D, ticks 2–602, seed 42), read as early/mid/settled.png in that folder, plus the published tile still tile.png (tick 300, the GYM look). Maxi has not watched it yet.
looked: seat godsworld-seat-author on 3 stills of memories/r8-sun/clip.mp4 — its account is this file's "Seen, clip:" line, written from early.png, mid.png and settled.png (RECORD line above; commit 2e6d486)
Caveat: the clip carries only the renderer, not the sun's render rows, so it shows a plain particle cloud: NO glow, NO god rays. tile.png has them.

Objects (600x400x600 world): one SphereEmitter, spherical, at the world's centre, about (300,200,0); read its exact centre from inventory. Nothing else.

Seen, clip: early.png (~tick 60) a dense warm-yellow ball about 60 px across at the centre; mid.png (~300) the ball has grown into a cloud roughly 250x170 px; settled.png (602) a cloud about 340x240 px, densest at the centre with a dark dot there, thinning outward, sparse specks beyond. It grows outward at a steady rate: about 1 px per tick on the fastest edge.
Seen, tile.png (tick 300, GYM look): a white-hot core with a golden halo and fine rays fanning out in every direction across a dim grainy space.

What it teaches (card): one sphere emitter, shining every way; the rays are rendered from particle density, and the engine does not know whether it is a star, a candle flame or an atom. The same part at a different scale is the pool (r5-fountain-pool).

PATHS (pixels, relative to the emitter centre (cx,cy); z 0 unless said):
A "orbit the sun": target (cx, cy, 0), azimuth 0 → 120 → 240 → 360, elevation 20, distance 500.
B "dive to the core": target (cx, cy, 0), distance 900 → 300 → 120, azimuth fixed; watch the dark dot become the core.
C "the GYM's own view": target (cx, cy, 0), azimuth 33, elevation 45, distance 2874 (the registry's pose for this rung).
