THIS IS: an outline

Tony — the scene you want is already on the stage: the 3D double slit, `dse-tunnel-rebuild` in its `3d` mode. So nothing needs building from scratch; this is a one-parameter variant of a sketch I know, and the parameter is the detector leg.

How I read your words, so you can correct me after you have watched it: "the slit wall" is the red barrier plate with the two blue slit channels in it, which spans x 96..160 — its back face, the side the quanta leave from, is at x 160. The screen stands with its near face at x 315, so the leg from the wall's back to the plate is 155 pixels today. "Moved 40 pixels farther" I read as +40 in x: the near face goes to 355, the plate's centre from [325, 200, 0] to [365, 200, 0], and the leg becomes 195 pixels. Nothing moves in y or z, so the plate stays square to the beam.

That 155 is not an arbitrary figure, and it is the reason this is worth watching. `dse-tunnel-rebuild-build.md` derives the leg from the ring ladder with no free parameters: each slit exit is a phase-locked point source laying rings at r = (λ/4)·√((2m+1)²+1), and D = √(r₂² − halfSep²) = √(163.2² − 51²) = 155 puts ring m = 2 of *both* slits on the axis exactly at the plate, so the centre of the pattern is doubly reinforced. Pull the plate out to 195 and the midline is no longer sitting on that intersection. I do not know what that does to the bands — it is a prediction I can only settle by looking, and it is exactly the kind of one-thing change `dse-tunnel-rebuild-seen.md` lists as drag 2 ("drag the screen right: does the pattern move with the plate?").

One more reading, about the camera. `mm-dse-tunnel-rebuild-p41c-seen.md` is a record of this same move at 85 pixels, and it carries a lesson: filmed on the oblique default pose, which looks down the experiment from the source end, the plate moving away mostly read as the plate *shrinking*, and both watchers had to say the x could not be read off the pixels. Forty pixels on that pose would be worse. So the Builder frames it side-on first — azimuth 90, elevation 0, the x axis running across the screen with the slit wall on one side and the plate on the other — and then drags. On that view the move is a plain lateral slide and the widening dark gap between the wall's back face and the plate is the thing to watch.

The Builder's order is therefore: frame it side-on, then drag the screen from centre [325, 200, 0] to [365, 200, 0] over ticks inside the recording, so the move itself is on the footage and the Owl sees the before-state and the after-state in one clip. No `see` after the drag — that would hide the very change the round is about.

Memories I drew on: `dse-tunnel-rebuild-build.md` (the sketch, the plate's parts entry, the ring-ladder leg), `dse-tunnel-rebuild-seen.md` (the objects' rects and the screen-drag counterfactual), `mm-dse-tunnel-rebuild-p41c-seen.md` (the same move at 85 px, and why the oblique camera hid it).

```json:plan
{"scene": "dse-tunnel-rebuild",
 "registryMode": "3d",
 "changes": [{"object": "screen", "param": "center", "value": [365, 200, 0], "why": "the plate's near face goes from x 315 to x 355, so the leg from the slit wall's back face at x 160 grows from 155 to 195 pixels — 40 pixels farther from the slit wall, square to the beam in y and z"}],
 "hands": ["setCamera", "dragTo"],
 "prediction": "A side-on view with the beam running across the screen: the yellow quanta leave the source, the red barrier plate stands with its two blue slit channels, and the green heat-map plate stands to its right with painted cells on its face. Over the clip the plate slides steadily to the right by 40 pixels, keeping its size and its square-on attitude, and the dark gap between the back of the slit wall and the plate's near face visibly widens; the hits keep painting on the face as it travels, and in the last frames the banded pattern is painted at the plate's new place, with the plate at rest there."}
```
