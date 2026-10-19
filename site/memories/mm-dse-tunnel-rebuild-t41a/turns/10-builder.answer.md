I opened all eight sampled frames (frame-00, 08, 16, 24, 32, 40, 48, 56) of DRAG screen — ticks 47698–47998.

**The result first.** `dragged: "screen"`, `from.center [365, 200, 0]` → `to.center [325, 200, 0]`, rect [355, 0, -77, 20, 400, 154] → [315, 0, -77, 20, 400, 154]. The re-staging step went where I sent it: the plate is back at its pre-move place, 40 px closer to the slit wall.

**What the footage shows.** Same side-on view: start wall edge-on at the far left, the dense source-side dot cloud, the three red blocks with their blue-banded channels, the dark band, the detector panel, the far sink at the right.

This time the plate visibly travels. In frame-00 the panel's left edge sits a clear dark band away from the slab row; across frames 08, 16, 24 it walks steadily **left**, toward the slab row, and by frames 40–56 it has stopped with that band distinctly narrower — I read the gap on screen as closing from roughly 65 px to roughly 40 px, and the panel's own left edge moving about 25 px left. The panel also grows a little larger in the frame as it goes, which is what a perspective camera does when a thing comes nearer the eye: the eye sits upstream at about x 0, so moving the plate from x 365 to x 325 brings it closer. Everything else holds still — bar, blocks, channels, far sink, horizon — and dots keep crossing the band throughout, including in the narrowed band at the end.

The map on the panel also changes over the clip: at frame-00 it is a cyan-green field with two warm patches at mid-height; by frames 32–56 the warm region is larger and hotter, two solid red cores with an orange surround and more yellow around them, and the dark blue columns are still there. I report that as what the pixels do; I am not going to tell you whether it is the plate catching a denser part of the beam at the shorter leg, the map re-binning, or the colour scale moving — I have not tested which, and one clip of a move cannot separate them.

**Against my PREDICTION.** Matched: the direction (left, toward the slab row), the narrowing band, the panel keeping its height, slant and depth, the fixed far sink and slab row as references, dots still crossing throughout, and the from/to in the result. Missed on size: I predicted about 35 screen pixels of travel and I read about 25. I will not pretend that is a hit — the shortfall is in the right direction for a perspective camera (the plate moves toward the eye, so its screen displacement is not the simple cos 30° × 40 px I computed from the target plane), but I predicted a number and the picture gave a smaller one. I also said I did not expect the map's pattern to reorganise in 6 s, and the warm cores did visibly intensify; so that part of the prediction was wrong too.

**Next, and last: the plan's actual change, filmed from this camera.** The plate forward from [325, 200, 0] to [365, 200, 0] — 40 px farther from the slit wall, y and depth untouched, the leg from the wall's back face (x 160) going 155 → 195 px. This is the clip I hand back, and it is the same change as the original drag, re-filmed from a camera that can show it; it is not a new correction and not a second variable.

PREDICTION: the result returns `from.center [325, 200, 0]` → `to.center [365, 200, 0]`, rect [315, 0, -77, 20, 400, 154] → [355, 0, -77, 20, 400, 154]. On the clip the panel slides RIGHT across the frame, away from the slab row, by about the 25 screen pixels this clip just measured in the other direction, and the dark band between the slabs and the panel widens correspondingly — the reverse of what I have just watched, against the same fixed slab row and far sink. The panel shrinks slightly as it recedes from the eye. Dots keep crossing the widened band. Given what this clip showed, I will not predict the map stays put: the warm cores may cool or spread as the plate takes up its longer leg, and I am watching for that rather than asserting it. No countable fringes in 6 s.

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
  "note": "THE PLAN'S CHANGE, filmed from the side-on camera: the plate moves 40 px FARTHER from the slit wall, centre [325,200,0] -> [365,200,0], so the gap from the wall's back face (x 160) to the plate's near face goes 155 px -> 195 px. y and depth unchanged. Describe exactly what you see: which way does the plate move across the frame, does the dark band between the slit wall and the plate widen, do particles cross that band, and what does the pattern on the plate's face do?"
}
```
