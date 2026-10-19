THIS IS: an outline

Tony — the scene you want is already on the stage: "Double Slit (Tunnel, symmetric)", `dse-tunnel-rebuild`, loaded in its 3d mode, a 600 x 400 x 600 world. So nothing needs loading; one part moves.

How I read your words, so you can correct me after you have watched it: "farther from the slit wall" I take as farther along the beam, +40 px in x, away from the slits — not farther in depth. The slit wall's back face is at x 160 and the plate's front face is at x 315, so the leg from wall to plate is 155 px today; +40 makes it 195. The plate's centre goes from [325, 200, 0] to [365, 200, 0]: y stays on the beam axis, z stays 0, so the plate keeps its whole z -77..77 span inside the two invisible z-collimators and still sits well short of the far sink at x 590.

The parts, and the anchor. The anchor is the slit wall — the three red barrier segments and the two blue tunnels at x 96..160 — because that 155 px leg is measured from its back face and everything in this sketch is placed off it. Against that anchor: the source at [20, 200, 0] (unmoved), the start wall at the left edge (unmoved), slit1_channel at centre y 149 and slit2_channel at centre y 251 (unmoved), the far sink at x 590 (unmoved), and the one part that moves, `screen` — the GraphingDetectorWall that paints its own hit map on its own face — from centre [325, 200, 0] to [365, 200, 0].

Why that number matters, and where I am drawing it from. The sketch in `dse-tunnel-rebuild-build.md` does not pick 155 freely: it derives the leg from the ring ladder, D = sqrt(r₂² − halfSep²) with r₂ = 163.2 px and halfSep = 51, so that ring m = 2 of *both* slits crosses the axis exactly at the plate and the centre is doubly reinforced. Move the plate out to 195 and the axis point sits at radius sqrt(195² + 51²) ≈ 202 px from each slit exit — past ring 2 (163) and short of ring 3 (226). So this is a real counterfactual, not a cosmetic nudge: it takes the centre of the plate off a named ring. That is arithmetic from the sketch's own formula, not something I have watched.

The loop I am asking the Builder for: read inventory for the plate's live rect, film the scene as it stands, then drag the plate — one part, one axis, over ticks, inside a recording, so you watch it travel — and film it again long enough for the heat map to accumulate. One change only; nothing else in the scene is touched.

A caution on what the clip can show. `dse-tunnel-rebuild-seen.md` records that in the earlier clips the bands were not readable by 1502 ticks and were clear on the tile still at 7200. So I expect the after-clip to show dots arriving and the plate's map beginning to fill, and I would not promise crisp bands inside one clip. If the map reads as faint, the honest next step is a second, later clip of the same plate, not a second change.

```json:plan
{"scene": "dse-tunnel-rebuild",
 "registryMode": "3d",
 "changes": [{"object": "screen", "param": "center", "value": [365, 200, 0], "why": "the detector plate 40 px farther along the beam: leg from the slit wall's back face (x 160) goes 155 -> 195 px, y and z centre unchanged"}],
 "hands": ["inventory", "see", "dragTo", "see"],
 "prediction": "Before: the green plate stands upright across the beam with its face about 155 px past the slit wall, yellow dots streaming from the source, through the two slots, onto and past it. During the drag: the whole plate slides visibly away from the slit wall along the beam, staying on the beam axis and at the same depth, and the dot field in front of it lengthens as the gap widens; it lands with its face about 195 px from the wall and about 215 px short of the far sink. After: dots keep arriving on the plate's face and its hit map starts to fill again; where structure shows, I expect the lobes spread wider apart than before, because fringe spacing grows with the leg, and the central lobe less dominant, since the plate's midline is no longer on ring 2 of both slits. I do not expect sharp bands within one 5-10 s clip - the record says they were unreadable at 1502 ticks and clear only by 7200."}
```
