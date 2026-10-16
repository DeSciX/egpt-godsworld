# Memory: Double slit — seen

RECORD, not Maxi's own sighting: written 2026-10-14 by the GODSWORLD seat's author (Claude) from the clips memories/dse-tunnel-rebuild/clip.mp4 (2D, ticks 2–1502, the one to start with) and memories/dse-tunnel-rebuild/clip-3d.mp4 (3D), read as the stills early/mid/settled(-3d).png in that folder, plus the published tile still tile.png (tick 7200, the GYM camera). Maxi has not watched them yet.
looked: seat godsworld-seat-author on 3 stills of memories/dse-tunnel-rebuild/clip.mp4 — its account is this file's "Seen, 2D clip:" line, written from early.png, mid.png and settled.png (RECORD line above; commit 2e6d486)
looked: seat godsworld-seat-author on 3 stills of memories/dse-tunnel-rebuild/clip-3d.mp4 — its account is this file's "Seen, 3D clip:" line, written from early-3d.png, mid-3d.png and settled-3d.png (RECORD line above; commit 2e6d486)
Caveat: the clips carry only the renderer; the GYM colour scheme and the GYM camera pose were not applied, so they look plainer than the tile.

Objects (600x400 world, 3D adds z −77..+77 to every plate): emitter centre (20,200) shooting forward (+x); start_wall rect [0,0,10,400]; red barrier wall1 [96,0,64,122], wall2 [96,174,64,50], wall3 [96,276,64,123]; slit1_channel and slit2_channel, blue-lined tunnels at x 96–160, apertures y≈133–164 and 235–266; screen [315,0,20,400] (green; a GraphingDetectorWall in 3D); far_sink [590,0,10,400].

Seen, 3D clip (its default camera looks back along the beam, so the emitter side is on the right): early-3d.png (~tick 150) a yellow cloud at the emitter side, a few dots through the two slots; mid-3d.png (~750) sparse dots between the barrier and the green plate and beyond it; settled-3d.png (1502) the same, a little denser, no bands readable on the plate at this camera. tile.png (tick 7200, GYM pose): the heat-map plate under the slits glows yellow-green along a central band, the pattern the card promises.
Seen, 2D clip: early.png the spray at (20,200) hitting the barrier; settled.png dots on both sides, through both slots, past the screen, no banding visible in the particle field by 1502.

What it teaches (card): one particle at a time through two slits, and bands build on the plate; no amplitudes added. By 1502 ticks the bands are not yet visible; by 7200 they are.

PATHS (2D moves: pan to a point in pixels relative to the named rect's left/top, zoom = visible height in px):
A "down the barrel": pan (slit1_channel.left+32, slit1_channel.top+15), then (screen.left+10, screen.top+200), zoom 150.
B "the plate face": pan (screen.left+10, screen.top+200), zoom 200; compare at 1500 and 7200 ticks.
C "3D, later": orbit the plate, target (screen.left+10, screen.top+200, 0), azimuth −60 → 60, distance 350; and the GYM tile's own pose.
DRAGS (2D first; one object, over ticks, inside a recording; predict first):
1. Drag wall3 from its rect up by 50 px over 60 ticks, so it covers slit 2 (y 235–266). Watch for: the lower slot going dark, the picture beyond the screen becoming one slit's; and the 50 px strip wall3 uncovered at the bottom lighting up — a drag closes one gap and opens another.
2. Drag the screen right by 100 px over 60 ticks: do the dots cross it in the same places, or does the pattern move with the plate?
