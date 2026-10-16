# Memory: 3D Collisions Lab — seen

RECORD, not Maxi's own sighting: written 2026-10-14 by the GODSWORLD seat's author (Claude) from the clip memories/collision-matrix-3d/clip.mp4 (3D, ticks 2–795, seed 42), read as early/mid/settled.png there, plus the published tile still tile.png (tick 200, GYM pose azimuth 45, elevation −30). Maxi has not watched it yet.
looked: seat godsworld-seat-author on 3 stills of memories/collision-matrix-3d/clip.mp4 — its account is this file's "Seen, clip:" line, written from early.png, mid.png and settled.png (RECORD line above; commit 2e6d486)
Caveat: the clip uses the default camera, not the GYM pose.

Objects (700x700x700 world, seven lanes): in each lane two 64 px bodies, A at rect [222, y−32, 64, 64] moving +x and B at [414, y−32, 64, 64] moving −x, at lane centres (y,z) = (175,−175), (175,0), (175,175), (350,−175), (350,0), (350,175), (525,−175); density rises lane by lane, coloured red → orange → yellow → green → violet. Lit spheres.

Seen, clip: early.png (~80) the pairs seen nearly end-on, each pair's two balls close together: red at top, green mid, violet low; mid.png (~400) every pair has met and parted, the balls now sit well apart left and right of their lane centres; settled.png (795) about sixteen balls scattered across the middle of the frame, the softer colours drifting more than the red ones. tile.png (GYM pose): pairs of shiny balls meeting in mid-air.

What it teaches (card): balls in a box, contact, momentum, settling; the hard ones bounce cleanly, the soft ones press into each other before parting; same engine as the light, no second physics. Finding which density gives which bounce is the lab.

PATHS (pixels, relative to the lane-4 body A rect left/top, lane centre (350,0); z as said):
A "side view of one lane": target (A.left+32+96, A.top+32, 0), azimuth 90, elevation 0, distance 400; predict the two meet at about tick 64 (the facing edges start 192 − 64 = 128 px apart and each body closes 1 px a tick: 64 ticks; 96 is the centre offset, not the travel), then watch.
B "head-on": target the same point, azimuth 0, elevation 0, distance 500: the pair along the line of sight.
C "the GYM view": target the world centre (350,350,0), azimuth 45, elevation −30, distance 900.
