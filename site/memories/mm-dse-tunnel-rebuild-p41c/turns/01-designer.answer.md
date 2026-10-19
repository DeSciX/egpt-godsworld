THIS IS: an outline

Tony, I will keep the 3D double slit that is on your screen (the scene of dse-tunnel-rebuild-card.md, and the look I remember in dse-tunnel-rebuild-seen.md) and change one thing: the detector screen moves farther from the slits. Its anchor is its own rect: it spans x 315..335 today, so its centre goes from x 325 to x 410 (spanning x 400..420), with y and its z slab unchanged. The Builder drags it there while filming, so the one clip shows the bands on the screen before, during and after the move: farther from the two slits the bands should spread wider apart.

```json:plan
{"scene": "dse-tunnel-rebuild",
 "registryMode": "3d",
 "changes": [{"object": "screen", "param": "center", "value": [410, 200, 0], "why": "the screen moves from x 315..335 to x 400..420, farther from the slits"}],
 "hands": ["dragTo"],
 "prediction": "The yellow beam leaves the source at the left and passes the two blue slit channels; the green screen plate slides away from the slits to x 400..420 while the hits keep painting banded stripes on its face, and by the end of the clip the stripes are painted at the screen's new place."}
```
