I opened all eight sampled frames of the clip (frame-00, 07, 14, 21, 28, 35, 42, 49 of 51, ticks 21965–22215), in order. This is my first sighting of this world in this thread.

WHAT THE FOOTAGE SHOWS. The view is side-on, exactly as I hoped: everything is seen edge-on, as flat slabs standing upright, and the line of the experiment runs horizontally across the frame. From one side to the other: a thin white-outlined empty panel at the far edge; then a green plate standing on edge, its broad face turned toward me and painted as a heat map — a blue-green field with vertical stripes and two or three hot red-orange patches stacked near its middle height; then a black gap sparsely sprinkled with small yellow dots; then three dark-red slabs, one tall at the top, a short one in the middle, one tall at the bottom, with two bright blue channels in the gaps between them; then a dense cloud of yellow dots, much thicker than anywhere else, crowding against the last thin white-outlined panel at the opposite edge. Across all eight frames the slabs, the plate and the painted pattern on the plate hold perfectly still — only the yellow dots change, shifting and twinkling, thick on the far side of the slit slabs and thin on the plate's side. The red-orange hot patches on the plate's face stay in the same place throughout.

WHETHER IT MATCHED MY PREDICTION. Half of it matched, and the half that did not is worth fixing before I drag.

- Matched: side-on. The beam line runs horizontally across the frame, the slabs are edge-on, the source quanta, the slit wall and the plate are all in frame, and there is a clear dark gap between the slit wall and the plate's painted face — the gap whose widening is the point of this plan. The plate is at rest, as I said it would be.
- Did NOT match: the left-right sense is mirrored from what I predicted. I said the source would be at the left and the plate to the right. It is the other way round: the dense source cloud is at the RIGHT and the green plate is at the LEFT, with the red slit wall right of centre. That tells me plainly that azimuth 0 put the camera on the far side of the z axis from where I assumed, so world +x reads to the LEFT on screen. The thin outlined panel at the right edge is then the start_wall at x 0..10 and the one at the left edge the far_sink at x 590..600 — the ordering in the frames is consistent with that all the way across.

WHY I AM SPENDING ONE MORE HAND ON THE CAMERA. If I drove the drag from this pose it would be an honest clip — the plate would move away from the slit wall and the gap would widen — but the plate would travel LEFT across the frame, while the prediction this round is judged against says "the plate slides steadily to the right by 40 pixels". I would rather the footage show what the prediction says than explain away a mirror image afterwards. So I flip the camera to the opposite side: azimuth 180, same elevation 0, same roll 0, same target [210, 200, 0] and distance 520. That should mirror the view left-for-right and put world +x to the right: source at the left, slit wall left of centre, plate to its right, and the drag then reads as a slide to the right.

This flip moves only my eye, not the world: nothing in the scene changes, no part moves, and the drag I am building toward is unaffected in z (the plate stays at z centre 0 either way), so which z face comes nearer does not bear on this plan. I will film one framing clip after this to confirm the mirror before the final drag, and I will not guess at the result of this hand in the meantime.

PREDICTION: setCamera returns the live pose as {azimuth: 180, elevation: 0, distance: 520, roll: 0, target: {x: 210, y: 200, z: 0}} and films nothing. The view behind it should be the same side-on arrangement I just watched, mirrored left-for-right: the dense yellow source cloud at the LEFT edge, the three dark-red slabs with their two blue slit channels left of centre, the black gap, and the green heat-map plate with its red-orange hot patches standing to the RIGHT of the slit wall, with clear black space to the plate's right for it to travel into. Nothing should move but the quanta; the plate stays at centre [325, 200, 0].

```json:call:setCamera
{
  "orbit": {
    "azimuth": 180,
    "elevation": 0,
    "roll": 0,
    "distance": 520,
    "target": {
      "x": 210,
      "y": 200,
      "z": 0
    }
  }
}
```
