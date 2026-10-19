Builder, turn 1 of my thread. Nothing has come through my eyes yet in this thread, so I am unsighted on this scene: everything below is text, from the stage line and from the reading hand I just ran myself.

I ran `inventory` through the body CLI (a reading hand, no clip). It agrees with the stage line, and it tells me the one thing I need before I touch anything:

- scene `dse-tunnel-rebuild`, mode `3d`, renderer three, dimensions 3, canvas 600 x 400 x 600, Record clock at tick 9501.
- camera: azimuth -60, elevation -18, roll 90, distance 546, target (177.5, 200, 0); `viewer.toward` = **+z**, away = -z.
- `screen` (GraphingDetectorWall) is a part of the sketch's `parts` block — authority `rect`, rect [315, 0, -77, 20, 400, 154], centre **[325, 200, 0]**. So it is movable by hand, and its entry is `{rect:[315,0,20,400], z:-77, depth:154, preset:'transparent-probe', binPx:12}`.
- `wall1`/`wall2`/`wall3` and the two tunnels all span x 96..160, so the slit wall's back face is x 160. The plate's near face is x 315 → the leg is 155 px, exactly as the plan says.

The plan's one change, converted to a centre now, before I act: the plate's new centre is **[365, 200, 0]** — +40 px in x, y and z untouched. Its rect would become [355, 0, -77, 20, 400, 154], near face x 355, so the leg from the slit wall's back face goes 155 → 195 px, and the gap to the far sink's near face (x 590) falls from 255 to 235 px (the plan's "about 215 px short" is measured to the sink's centre at x 595 minus the plate's far face 375 = 220; either way the plate stays well clear of the sink). Depth is unchanged: the plate's z span stays -77..77, flat on the beam's depth band, and z is held at 0 in the drag.

Since I have already taken the inventory reading myself, the plan's remaining hands are `see` (baseline), `dragTo` (the one change, filmed), `see` (after). This hand is the baseline: the default 250 ticks at a frame every 5 ticks, 51 frames at 10 fps = 5.1 s, inside the 5–10 s window. I change nothing with it.

PREDICTION: a 5.1-second clip of the scene as it stands — the green detector plate standing upright across the beam at x 315..335 (its face about 155 px past the slit wall), the three dark slit-wall segments at x 96..160 with the two gaps between them, and yellow particles streaming from the source at the left, through the two slots, striking the plate and continuing past it toward the far sink. Nothing moves but the particles; the camera holds still at azimuth -60, elevation -18. Any pattern on the plate's face should look like a coarse dot field or broad lobes, not sharp bands, in 250 ticks.

```json:call:see
{
  "note": "Baseline before the change: double slit 3D, detector plate centre [325, 200, 0], face 155 px past the slit wall's back face (x 160). I am about to drag the plate 40 px farther along the beam to centre [365, 200, 0]. Describe exactly what you see.",
  "everyTicks": 5,
  "stopAt": {
    "ticks": 250
  },
  "fps": 10
}
```
