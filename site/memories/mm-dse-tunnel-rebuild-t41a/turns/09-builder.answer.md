I opened all eight sampled frames (frame-00, 07, 14, 21, 28, 35, 42, 49) of SEE — ticks 33944–34194.

**What the footage shows.** The beam axis now runs across the frame, left to right, as intended.

- At the far left, a thin white-outlined vertical bar standing edge-on — the start wall at x 0..10.
- Between it and the slab row, a dense cloud of yellow dots, thickest around mid-height and fading toward the top and bottom of the frame: the source side.
- Left of centre, the slit wall as three red blocks stacked vertically, each with a bright blue band along its upper face, and two clear openings between them — the two tunnel channels, at about a third and two thirds of the way down the frame. The blue bands make the channels easy to find.
- **To the right of the slab row, a dark band with yellow dots scattered across it in every one of the eight frames** — sparser than the source-side cloud, maybe a tenth of its density, spread through the whole band and reaching as far as the plate.
- Right of centre, the detector plate as a large upright panel turned toward me, carrying a coloured bin map: a cyan-and-green field with two narrow dark-blue columns running top to bottom at roughly a third and two thirds of its width, a pale green strip down its right-hand edge, and two warm orange/red patches near mid-height, sitting side by side horizontally rather than one above the other.
- At the far right, a dark panel with a white outline, flat and almost featureless — the far sink at x 590.

Across the 51 frames nothing in the geometry moves: the bar, the three blocks, the channels, the panel and the far sink hold still, the horizon is level, and only the dot field shuffles.

**Against my PREDICTION.** Matched: the beam axis across the frame with the source side at the left and the plate at the right; the three red blocks with two visible channels between them; the plate presenting its binned face instead of an edge; level horizon; geometry still; and — the question I said this camera was for — **dots do cross the gap**. They are there, plainly, in all eight frames. My expectation was right and, more importantly, the Owl's reading of the earlier clip is now explained rather than merely contradicted: under the old camera that band projected into the frame as a ~10–20 px strip, so dots in it could not be told from dots in front of the slabs. I am not saying the Owl mis-measured the old pixels; I am saying this camera resolves what that one could not.

Missed: I predicted the far sink would be off-frame to the right — it is in frame. And the ruler I proposed does not work as I stated it. I said to read the gap as "about 3× the slab row's own width", but on screen each red block's apparent width is its 64 px thickness along the beam *plus* its 154 px depth face, which this 30°-off camera also shows; the block looks far wider than 64 px. The honest in-frame ruler is the block's thickness read along its top edge, not its silhouette. I will not quote a gap measured in block-widths, and I withdraw that instruction.

One thing I will describe but not interpret: the frame's vertical is world y — the axis the two slits are separated along — and the horizontal across the plate's face is world z, its depth. So the map's dark columns run along y and vary with z, and the two warm patches are separated along z at the same height. That is what the pixels show. I do not know why the structure sits that way round, I have not tested it, and I am not going to dress a guess up as a reading.

**Next.** The still re-shoot cannot show a *move*, and there is no pre-move clip from this camera to set beside it. So I will re-stage the drag here, in two filmed steps, each labelled by direction. This hand is the first: the plate back to its pre-move centre [325, 200, 0]. It goes the *wrong* way along the beam on purpose, to put the scene where it stood before the plan's change; the next hand drags it forward again to [365, 200, 0], which is the plan's position and the clip I will hand back. Nothing here will be presented as the original drag.

PREDICTION: the result returns `dragged: "screen"`, `from.center [365, 200, 0]` → `to.center [325, 200, 0]`, rect [355, 0, -77, 20, 400, 154] → [315, 0, -77, 20, 400, 154]. On the clip the panel slides LEFT across the frame, toward the slab row, by about 35 screen pixels at this pose (40 world px along x, which lands on screen-right with weight cos 30° ≈ 0.87) — roughly a third of the panel's own apparent width, and readable against the fixed far sink at the right edge and the fixed slab row at the left. The dark band between the slabs and the panel narrows as it goes, from 195 px to 155 px of world. The panel keeps its height, its slant and its depth; the dots keep crossing the band throughout. I do not expect the map's pattern to reorganise within the 6 s.

```json:call:dragTo
{
  "name": "screen",
  "to": [
    325,
    200,
    0
  ],
  "ticks": 150,
  "settle": 150,
  "everyTicks": 5,
  "fps": 10,
  "note": "RE-STAGING, step 1 of 2, filmed from the new side-on camera: the plate goes BACK to its pre-move centre [325,200,0], i.e. 40 px CLOSER to the slit wall, narrowing the gap from 195 px to 155 px. This is not the plan's change - it is me putting the scene back so the plan's change can be filmed from a camera that can show it. Describe exactly what you see: which way does the plate move across the frame, and does the dark band between the slit wall and the plate get wider or narrower?"
}
```
