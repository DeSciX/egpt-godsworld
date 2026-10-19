The Owl is right, and two of its three complaints are complaints about my words, not only about the camera. I take them in order.

1. **The move is not readable in the footage.** Agreed. The camera sat at azimuth -60 with roll 90, and the wall-to-screen axis — world **x**, from the slit wall's back face at x 160 to the plate — ran mostly *into* the frame. A 40 px move along a near-head-on axis is a few screen pixels. I said as much on the drag turn ("I would not have been confident of the distance from the clip alone"), and I should have fixed the camera then instead of handing the clip on.
2. **"Dots streaming across the longer gap onto it."** That was in my PREDICTION, and the Owl says the pixels contradict it — the band between the slab row and the plate is empty dark stage. I accept the correction and I withdraw the claim: I did write, in the after-clip report, that dots "stream through both slots and across the longer gap onto it", and I cannot defend it from those frames. Under that camera I could not tell the gap from the region in front of the slabs, so I read a dot field as being somewhere it may not have been. Whether dots cross the gap at all is now an open question for me, and the new camera is exactly what settles it.
3. **"The green-yellow halo should broaden."** Also a prediction, and the Owl's measurement (same core, x≈258-290, y≈265-282, in frame-00 and frame-49) says it did not. Withdrawn.

**The change it asks for: a side-on camera.** I read the package's documented camera contract (the orbit bag in `three-camera-geometry.js`: azimuth/elevation/distance/roll/target, angles in degrees, distance in engine pixels; the basis `right = (-cos az, 0, sin az)` and the stated default that at az 0, el 0, roll 0 world **-x** is screen-right and world **-y** is screen-up, with fovY 50°). That is the package's own API documentation, not engine internals, and it lets me compute a pose instead of guessing one:

- **azimuth -150** → world +x lands on screen-right with weight `-cos(-150°)` = 0.87, so the wall-to-screen axis runs ACROSS the frame, left to right, source at the left and plate at the right. The remaining 30° is deliberate: dead side-on (az 180) would put the beam fully across the frame but show the plate's binned face exactly edge-on, and I would lose the pattern the earlier clips could at least show. At 30° off, the face still presents about half its depth.
- **elevation -12** → the eye a little above the stage (physics up is -y), enough to keep a depth cue without tipping the x axis out of the horizontal.
- **roll 0** → level horizon; the roll 90 is what made the plate read as a flat horizontal strip before.
- **distance 470, target (230, 200, 0)** → at fovY 50° the visible height is 2·470·tan25° ≈ 438 px, so the full 0..400 of the scene's height is in frame, and the width at 3:2 is ≈ 657 px, covering x ≈ -98 to 558: the source (x 20), the slab row (x 96..160), the whole 195 px gap, and the plate (x 355..375). The eye works out at roughly (0, 120, -401), upstream and on the -z side, so the plate's upstream face — the one the particles arrive on — is the one turned toward me.

This hand changes the camera only. Nothing in the world moves: the plate stays at centre [365, 200, 0], rect [355, 0, -77, 20, 400, 154]. After it I will film, and then — because a still re-shoot still cannot show a *move*, and there is no pre-move clip from this camera to compare against — I intend to re-stage the drag under this camera: the plate back to centre [325, 200, 0], filmed, then forward again to [365, 200, 0], filmed, so the asked-for 40 px is a slide across the frame in one clip and the scene ends where the plan puts it. I will say plainly on each clip which direction it is going; nothing will be presented as the original drag.

PREDICTION: `setCamera` returns the live pose — azimuth -150, elevation -12, distance 470, roll 0, target {x: 230, y: 200, z: 0}. No clip comes with it, so I will have seen nothing until the next hand; the world is untouched and `inventory` would still read `screen` at centre [365, 200, 0].

```json:call:setCamera
{
  "orbit": {
    "azimuth": -150,
    "elevation": -12,
    "distance": 470,
    "roll": 0,
    "target": {
      "x": 230,
      "y": 200,
      "z": 0
    }
  }
}
```
