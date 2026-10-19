`setCamera` returned exactly the pose I predicted — azimuth -150, elevation -12, distance 470, roll 0, target (230, 200, 0) — and it carried no clip, so I have still seen nothing from this viewpoint. The world is untouched: `screen` is where the drag left it, centre [365, 200, 0], rect [355, 0, -77, 20, 400, 154].

This hand is the Owl's literal ask: the same still geometry, re-shot from the side-on camera, nothing moved. Defaults — 250 ticks, a frame every 5, 10 fps = 51 frames = 5.1 s.

**The scale marker the last clip lacked.** The Owl noted there was no ruler in frame. There is one here, and it is part of the scene: the slab row is 64 px thick along the beam (x 96..160). So, measured in slab-thicknesses along the frame's horizontal, the gap from the wall's back face to the plate's near face should read as **195 px ≈ 3.0 slab thicknesses**; before the drag it was 155 px ≈ 2.4. That is the comparison the next clips are for, and it can be checked off the pixels without trusting my arithmetic.

PREDICTION: a 5.1-second clip with the beam axis running ACROSS the frame, left to right. At the far left, the source near x 20, mid-height. At about a sixth of the frame's width, the slab row seen nearly face-on: three red blocks stacked vertically with two gaps between them — the tunnel channels at y 123.5..174.5 and y 225.5..276.5, which should read as two bright blue slots roughly a quarter and three-quarters of the way down. Then a long dark gap, about three times the slab row's own width. Then the plate as a tall slab standing across the beam at x 355..375, spanning the full height of the scene, its binned face turned toward me at about 30° and showing the blue/green/orange map. The far sink should be off-frame to the right. Horizon level (roll 0), slight look down from above (elevation -12). Across the 51 frames the geometry does not move; only particles do.

The one thing I genuinely do not know, and the reason this camera matters: **whether dots cross the gap.** My expectation is that they do — the plate's map accumulates hits, and hits need arrivals — so I predict a visible population of yellow dots in the dark band between the slots and the plate, thinner than the crowd on the source side. But the Owl read the previous frames as showing that band empty, with dots only on the source side, inside the channels and as a blob at each channel mouth. If this clip shows the gap empty, my expectation is wrong and I will say so plainly; that would be the more interesting result, and it would mean the plate's map is being fed by something I have not understood.

```json:call:see
{
  "note": "Side-on re-shoot, nothing moved: camera azimuth -150, elevation -12, roll 0, distance 470, target (230,200,0), so the wall-to-screen axis runs ACROSS the frame, source at left, plate at right. The plate stands at centre [365,200,0]; the gap from the slit wall's back face (x 160) to the plate's near face (x 355) is 195 px, about 3x the slab row's own 64 px thickness - use the slab row as the ruler. Describe exactly what you see, and in particular: are there particles in the gap between the slit wall and the plate, or is that band empty?",
  "everyTicks": 5,
  "stopAt": {
    "ticks": 250
  },
  "fps": 10
}
```
