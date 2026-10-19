I opened all eight sampled frames of this clip (frame-00, 07, 14, 21, 28, 35, 42, 49 of 51, ticks 36286–36536), in order.

WHAT THE FOOTAGE SHOWS. The mirror worked, and the view is the one the plan asks for. Reading the frame from left to right: a thin white-outlined empty panel standing at the far left; immediately to its right a dense cloud of small yellow dots, thickest in a knot at mid-height; then the three dark-red slabs, a tall one from the top, a short one across the middle, a tall one down to the bottom, with two bright blue channels in the two gaps between them, their open mouths facing me; then a wide stretch of black scattered with sparse yellow dots, far fewer than on the source side; then the green plate standing on edge, right of centre, its broad face turned toward me and painted as a heat map — a blue-green field with a bright vertical column of yellow and orange cells at its middle height, flanked by darker blue-green stripes; then more black space, and a last thin white-outlined panel at the right edge of the frame.

Across all eight frames the slabs, the channels and the plate hold still, and the painted pattern on the plate's face does not shift: the yellow-orange column stays in the same place at the same height. The only motion is the yellow dots, twinkling, heavy on the source side of the slit wall and thin beyond it.

WHETHER IT MATCHED MY PREDICTION. It matched on every point I listed. (1) The source cloud is now at the LEFT and the green plate at the RIGHT — world +x reads to the right across the frame, which is the sense the plan's prediction is written in. (2) The view is still side-on: slabs edge-on, the beam line horizontal. (3) There is clear black space to the RIGHT of the plate, between its face and the outlined panel at the right edge — room for 40 pixels of travel with margin to spare. (4) The plate is at rest with its bands painted, nothing moving but the quanta. The arrangement is the one I watched before, reversed left-for-right, exactly as I said it would be.

So the camera work is done, and the next hand is the one change of the round.

THE CHANGE. I drag `screen` — the green heat-map plate — from its centre [325, 200, 0] to centre **[365, 200, 0]**: 40 pixels along +x, which in this view is 40 pixels to the right, with y and z untouched so the plate stays square to the beam. Its rect goes from [315, 0, -77, 20, 400, 154] to [355, 0, -77, 20, 400, 154], so the near face moves from x 315 to x 355 and the leg from the slit wall's back face at x 160 grows from 155 to 195 pixels. That is the plan's one change, and nothing else moves.

The timing: 150 ticks of travel, then 150 ticks of settle, a frame every 5 ticks at 10 fps — 60 frames, 6.0 seconds, inside the 5–10 s window. The settle matters: it keeps the camera filming after the plate arrives, so the last second of the clip shows the plate at rest at its new place with the hits still painting on it, rather than cutting at the moment it stops.

This clip is the one the Owl judges, and it carries its own before-state — the first frames show the plate where it has been all along.

PREDICTION: the hand returns from centre [325, 200, 0] (rect [315, 0, -77, 20, 400, 154]) to centre [365, 200, 0] (rect [355, 0, -77, 20, 400, 154]), 60 frames, 6.0 seconds. In the footage I expect the side-on view to hold steady — source cloud at the left, the three red slabs with their two blue slit channels left of centre — while the green plate slides steadily to the RIGHT across the frame, keeping its height and its edge-on attitude (no shrinking and no turning, since it stays at z 0 and only x changes), and comes to rest about a second before the end. I expect the black gap between the back of the slit wall and the plate's near face to visibly widen as it goes, and the sparse yellow dots to go on arriving at the face throughout, with the painted heat map — the bright yellow-orange column at mid-height — travelling with the plate and still painted there in the last frames.

```json:call:dragTo
{
  "name": "screen",
  "to": [
    365,
    200,
    0
  ],
  "ticks": 150,
  "settle": 150,
  "everyTicks": 5,
  "fps": 10,
  "note": "The one change: the detector plate slides 40 pixels along +x (to the right in this view), from centre [325, 200, 0] to [365, 200, 0], widening the gap from the slit wall's back face from 155 to 195 pixels. Does the plate travel square-on and keep its painted bands, and does the gap visibly widen?"
}
```
