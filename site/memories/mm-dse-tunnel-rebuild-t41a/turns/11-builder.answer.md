I opened all eight sampled frames (frame-00, 08, 16, 24, 32, 40, 48, 56) of DRAG screen — ticks 55709–56009.

**The result first.** `dragged: "screen"`, `from.center [325, 200, 0]` → `to.center [365, 200, 0]`, rect [315, 0, -77, 20, 400, 154] → [355, 0, -77, 20, 400, 154], zHeld false, 150 ticks of travel + 150 of settle, 61 frames, 6.1 s. That is the plan's change, and the plate ends at the plan's position.

**What the footage shows.** The side-on view: the start wall edge-on at the far left; the dense source-side dot cloud; the slit wall as three red blocks with bright blue channel bands and two open slots between them; a dark band; the detector panel with its coloured bin map; the far sink as a dark outlined panel at the right.

The plate travels, and this time it travels the way the outline asked. In frame-00 the panel sits close to the slab row with only a narrow dark band between them. Through frames 08, 16, 24 it walks steadily **right**, away from the slab row; by frames 40–56 it has stopped, and the dark band between the blocks and the panel is distinctly wider — I read it on screen as opening from roughly 40 px to roughly 65 px, with the panel's left edge moving about 25 px right. The panel also becomes slightly smaller in frame as it goes, as a thing receding from the eye does; the eye on this pose sits upstream, near x 0. The gap toward the far sink on the right narrows by the same amount. Everything else is fixed: start wall, blocks, channels, far sink, horizon.

**Dots cross the widened band in every frame.** They are sparser than the source-side cloud, scattered the whole way across, and still arriving at the panel's face at the end of the clip when the band is at its widest.

The map: the two warm cores at mid-height are there at the start and still there at the end, and over the second half of the clip they read a little smaller and a little less saturated to me, with more of the cyan-green field around them — the gentle reverse of the intensifying I watched on the inbound drag. The two dark blue columns persist throughout. I am reporting appearance, not cause: I have not tested whether that is the longer leg thinning the arrivals, the bins re-filling, or the colour scale moving, and a 6 s clip of a move cannot separate them.

**Against my PREDICTION.** Matched, and this time including the number: direction right and away from the slab row; the band widening; about 25 screen pixels of travel, which is what I predicted after calibrating on the previous clip rather than from my first arithmetic; the panel shrinking as it recedes; dots still crossing; the fixed slab row and far sink as references; the from/to in the result; and no countable fringes in 6 s. I also said I would watch the map rather than assert it stays put — and what I saw was a modest cooling, which I would not have predicted correctly had I committed to one.

**The build as it now stands, against the plan and against the Owl's one change.**
- Scene `dse-tunnel-rebuild`, mode `3d`, untouched; no part added, removed, resized or re-declared.
- The plan's one change is in place and filmed: `screen` from centre [325, 200, 0] to [365, 200, 0], the leg from the slit wall's back face (x 160) 155 → 195 px, y and depth untouched (z span still -77..77).
- The Owl's one change is in place: camera azimuth -150, elevation -12, roll 0, distance 470, target (230, 200, 0), so the wall-to-screen axis runs across the frame. A fresh `inventory` reading confirms both: `screen` centre [365, 200, 0], rect [355, 0, -77, 20, 400, 154]; camera as set; `viewer.toward` now `-z`, consistent with the eye sitting on the -z side as I derived.
- The re-staging is on the record and labelled: to produce a before-and-after under one camera I dragged the plate back to [325, 200, 0] (filmed, turn 10) and then forward again to [365, 200, 0] (filmed, this turn). Nothing is presented as the original drag, and the scene ends where the plan puts it.
- No hand was refused. The only parts out of reach are `zClipNear` and `zClipFar`, declared in the scene's code; the plan never asked for them.

**What I got wrong along the way, kept in the record rather than tidied away:** the first camera made the asked-for move unreadable and I handed that clip on anyway; I claimed dots crossing the gap from footage that could not show it; I claimed a halo broadening that the pixels did not support; I offered a scale ruler that this camera's obliquity invalidates; and my first screen-displacement estimate was 35 px against an actual ~25.

The judgement is the Owl's, not mine. What the last clip shows is the plate moving 40 px farther from the slit wall, across the frame, with the gap widening, particles crossing it, and the pattern on its face still forming.

```json:done
{}
```
