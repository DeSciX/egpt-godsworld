`setCamera` took the flip without a refusal: the live pose is azimuth 180, elevation 0, distance 520, roll 0, target [210, 200, 0] — the same eye height, the same framing, the same target as the pose I just filmed from, turned to the opposite side of the z axis. The hand films nothing, so I have no footage of this new pose yet and will not describe it until I do.

One framing clip, then the drag. I am filming this because the last framing clip earned its cost: it caught the view running mirrored to what I assumed, which is exactly the kind of thing that would have spoiled the closing clip. The same reasoning applies now — I asserted that azimuth 180 mirrors the view, and that is a claim about the world's behaviour I have not watched yet. One 5.1-second clip settles it.

What I am checking, in order: (1) is the source cloud now at the LEFT and the green plate at the RIGHT — world +x running to the right across the frame; (2) is the view still side-on, slabs edge-on, the beam line horizontal; (3) is there clear black space to the RIGHT of the plate for 40 pixels of travel; (4) is the plate still at rest with its painted bands, at centre [325, 200, 0].

If all four hold, my next and last hand is the `dragTo` driving the plate's centre to [365, 200, 0] over 150 ticks with 150 ticks of settle — a 6.0-second clip that carries its own before-state, the slide, and the plate at rest at its new place. If the view comes back wrong in some way I have not anticipated, I will fix the pose once more rather than drag into a bad frame, and I will say plainly what was wrong.

PREDICTION: a 5.1-second clip, 51 frames, a frame every 5 ticks, of the scene at rest at the mirrored pose. I expect the same side-on arrangement I watched last time, reversed left-for-right: at the LEFT edge a thin white-outlined panel (the start_wall at x 0..10) with the dense yellow source cloud crowded against it; then the three dark-red slabs — tall at top, short in the middle, tall at bottom — with the two bright blue slit channels between them, left of centre; then a black gap with sparse yellow dots; then the green heat-map plate standing on edge with its broad painted face toward me, blue-green with vertical stripes and the red-orange hot patches stacked near its middle height; then black space and the far_sink's outlined panel at the RIGHT edge. Nothing should move except the yellow dots, thick on the source side of the slit wall and thin beyond it; the plate and the painted pattern on it should hold still through all 51 frames.

```json:call:see
{
  "everyTicks": 5,
  "stopAt": {
    "ticks": 250
  },
  "fps": 10,
  "note": "Framing check after flipping the camera to azimuth 180: is the source cloud now at the LEFT, the red slit wall left of centre, and the green heat-map plate to its RIGHT with clear black space to the plate's right for a 40-pixel slide?"
}
```
