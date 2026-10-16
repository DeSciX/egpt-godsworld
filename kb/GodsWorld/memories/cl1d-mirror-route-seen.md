# Memory: Infinite mirror — seen

RECORD, not Maxi's own sighting: written 2026-10-14 by the GODSWORLD seat's author (Claude) from the clips memories/cl1d-mirror-route/clip.mp4 (2D, ticks 2–1202, the one to start with) and memories/cl1d-mirror-route/clip-3d.mp4 (3D), read as early/mid/settled(-3d).png, plus the published tile still tile.png (tick 1200, GYM table-top camera with god rays). Maxi has not watched them yet.
looked: seat godsworld-seat-author on 3 stills of memories/cl1d-mirror-route/clip.mp4 — its account is this file's "Seen, 2D clip:" line, written from early.png, mid.png and settled.png (RECORD line above; commit 2e6d486)
looked: seat godsworld-seat-author on 3 stills of memories/cl1d-mirror-route/clip-3d.mp4 — its account is this file's "Seen, 3D clip:" line, written from early-3d.png, mid-3d.png and settled-3d.png (RECORD line above; commit 2e6d486)
Caveat: the clips carry only the renderer; the 3D clip has no god rays and no table-top pose.

Objects (600x400; 3D adds z −73..+73 to each mirror): ten Walls m1..m10, each 10x73 px, bounce/reflect, recolouring what it reflects, at the vertices of a decagon of radius 150 round (300,200), in hit order: m1 centre ≈(447,231) red, m2 (225,330) orange, m3 (200,89) yellow, m4 (437,139) lime, m5 (316,349) green, m6 (153,169) teal, m7 (375,70) blue, m8 (400,311) indigo, m9 (163,261) violet, m10 (284,51) magenta. Emitter centre ≈(315,86), 47 px past m10 on the m10→m1 leg, a 2 px line, 8 per tick, capped at 6400 alive; an invisible counter "population" spans the canvas.

Seen, 2D clip: early.png (~120) a thin yellow dotted beam from (315,86) heading down-right to m1; settled.png (1202) streams along the chords, yellow near m10→m1, orange, green, red after later mirrors, the ring full; some particles leak out past m1 to the right and at lower left.
Seen, 3D clip: early-3d.png the ten slabs small in perspective with the beam just leaving m10; settled-3d.png yellow/orange/green streams along the interior chords, a leak at the left.
Seen, tile.png: a dense gold/orange/green band circling a dark empty centre, faint rays fanning out between the mirrors.

What it teaches (card): ten mirrors, light walks the loop, reflected and recoloured mirror to mirror, no bounce limit, no Fresnel equations. Not card text, the recorder's reading of the clip: some quanta leaked out past m1 and at lower left, so the loop is not perfectly closed (how many per lap was not observed).

PATHS (2D moves: pan to a point in pixels relative to each mirror's rect left/top, zoom = visible height in px):
A "one lap": pan (m_k.left+5, m_k.top+36) for k = 1..10 in that order, zoom 250, then back to m1.
B "overhead": pan to the ring centre, midway between m1 and m6 centres, zoom 450; the whole ring.
C "the leak": pan (m1.left+5, m1.top+36), zoom 200; count what escapes past m1.
D "3D, later": orbit the ring centre, elevation 80, distance 450; and the GYM tile's table-top pose.
DRAGS (2D first; one object, over ticks, inside a recording; predict first):
1. Drag m1 from its rect 20 px outward (away from the ring centre) over 60 ticks. Watch for: the beam reflected by m1 missing m2 and leaving the ring, so the colours after orange stop appearing and the population falls.
2. Drag it back over 60 ticks: does the loop close again, and how many laps before every colour is back?
