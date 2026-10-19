I opened all eight sampled frames (frame-00, 07, 14, 21, 28, 35, 42, 49) of SEE — ticks 35049–35299.

**What the footage shows.** The same raking, rolled view. Three dull-red slabs across the middle — the slit wall's three segments — with the two blue tunnel slots standing between them, the two translucent dark z-clip planes above and below, and yellow dots streaming from the left, crowding through the two slots and fanning out densely beyond them, thinning toward the far edge of the stage.

The detector plate lies across the lower part of the frame as a flat strip of coarse coloured bins, and it stands where the drag left it: clear of the slab row, with a band of plain dark stage visible between the slabs' lower edges and the strip, and the plate's own thin bright green-yellow edge line showing along its lower-right flank — the same two marks by which I read the move on the drag clip, now steady. Nothing in the geometry moves across the 51 frames: slabs, slots, plate and camera are fixed, and only the yellow dot field shuffles and refills.

The hit map has recovered from the cool state the drag clip ended in. It now reads as a blue field along the strip's length carrying a broad green-yellow body left of centre with a compact red/orange core inside it, and a second, weaker green-yellow patch to the right of centre with a few orange cells in it; the far ends stay blue. Between frame-00 and frame-49 the map is essentially steady — a handful of cells change shade, nothing more. There are no sharp, countable bands.

**Against my PREDICTION.** Matched: the geometry is still; the plate stands stationary at the place the drag put it, with dark stage between it and the slab row; dots stream through both slots and across the longer gap onto it; the map keeps taking hits and its green-yellow halo around the core is visibly broader than at the end of the drag clip; and no sharp fringes resolve in 5.1 s. One thing I did not predict and should name: alongside the broadened main lobe there is a second, weaker warm patch to the right of centre, which was not there at the end of the drag clip. I am reporting it as what the picture shows; I am not claiming it is a fringe, and I will not state fringe spacing from a 250-tick clip — the memory record's reading is that this pattern is unreadable at ~1500 ticks and clear only by ~7200. Whether the lobes are wider apart than before the move is exactly the question this clip cannot settle, and I say so rather than assert the plan's expectation.

**The build, against the plan.** One scene, one change, every step filmed:
- `dse-tunnel-rebuild` in mode `3d` was already on the stage; no `loadScene` was needed.
- `inventory` — read through the body CLI. Confirmed 3D, 600 × 400 × 600, camera az -60 / el -18 / roll 90, `viewer.toward = +z`, and that `screen` is a `parts`-block part with authority `rect`.
- `see` — baseline, ticks 14637–14887, 51 frames, 5.1 s, plate at centre [325, 200, 0].
- `dragTo` — the plan's single change, filmed: `from.center [325, 200, 0]` → `to.center [365, 200, 0]`, rect [315, 0, -77, 20, 400, 154] → [355, 0, -77, 20, 400, 154], 150 ticks + 150 settle, 61 frames, 6.1 s. +40 px along the beam only; y and depth untouched, the plate's z span still -77..77. The leg from the slit wall's back face (x 160) went 155 → 195 px.
- `see` — after, ticks 35049–35299, 51 frames, 5.1 s. This is the clip I hand back.

No hand was refused, and no part or key was out of reach: the only code-declared parts here are `zClipNear` and `zClipFar`, which the plan never touched. A later `inventory` confirms the final state: `screen` centre [365, 200, 0], rect [355, 0, -77, 20, 400, 154].

I am not the judge of whether this answers Tony's outline — the Owl is, against the outline and against the predictions I wrote down before each hand. What I can say is what the clips show: the plate moved 40 px farther along the beam, it is still square across the beam at the same depth, the particles still reach it through both slots, and its pattern is re-forming at the longer leg without yet resolving into readable bands.

```json:done
{}
```
