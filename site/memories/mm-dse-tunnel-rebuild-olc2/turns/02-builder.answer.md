The plan's scene is already on the stage — `dse-tunnel-rebuild`, mode `3d`, renderer three, a 600 x 400 x 600 world — so no `loadScene` is needed. I read the live state with the body CLI (`inventory`) to be sure: tick 11127, dimensions 3, `toward: "+z"`, and `screen` (GraphingDetectorWall) at centre [325, 200, 0], rect [315, 0, -77, 20, 400, 154].

THE ONE CHANGE, converted once, here: the plan wants the plate's near face at x 355. The plate is 20 wide, so its CENTRE goes to **[365, 200, 0]** — 40 pixels along +x, y and z untouched, so it stays square to the beam. That is the single `dragTo` target and I will not restate it any other way.

WHY THE CAMERA FIRST. The live pose is azimuth -60°, elevation -18°, roll 90°, target [177.5, 200, 0]. My memory of the last run of this scene at that pose (`kb/GodsWorld/memories/mm-dse-tunnel-rebuild-p41c-seen.md`, a RECORD — not my own sighting) says the camera there looks down the experiment from the source end with the barrier plates at the top and the plate below, and that a plate moving +x read as the plate *shrinking and receding*, with the Owl noting the x could not be read off the pixels at all. A 40-pixel slide — the whole point of this plan — would be nearly invisible that way. The plan's prediction asks for a side-on view with the beam running across the screen, so I set the camera to look along the z axis with no roll, which should put +x across the frame and the beam horizontal.

The pose I am asking for: azimuth 0°, elevation 0°, roll 0° (the beam horizontal rather than running down the frame), target [210, 200, 0] — between the source at x 20 and the plate's travel, so the source, the slit wall at x 96..160 and the plate at both its old and new place all stay in frame — and distance 520, close to the 546 the scene opened with.

I have not seen this world in this thread yet: no clip has come through my eyes here. This hand returns only a pose, no footage, so after it I will film one short `see` to check the framing before I drive the drag, and the drag's own clip — which carries the before-state and the move — will be the last clip of the round.

PREDICTION: setCamera returns the live pose as {azimuth: 0, elevation: 0, distance: 520, roll: 0, target: {x: 210, y: 200, z: 0}} (no footage from this hand); the view behind it should now be side-on, looking along z at the x–y plane, with the beam running left-to-right across the frame, and the next `see` should show the source at the left, the red barrier wall with its two blue slit channels left of centre, and the green plate standing to their right.

```json:call:setCamera
{
  "orbit": {
    "azimuth": 0,
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
