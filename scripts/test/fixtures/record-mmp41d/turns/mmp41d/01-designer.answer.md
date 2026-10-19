THIS IS: an outline

Tony, I start from the 1A mirror memory (cl1a-mirror-build): a laser along y 200 into an orange bounce wall at 45 degrees, which sends the beam straight up. First we look at it as it is. Then I open the same mirror as a sketch of our own, so the change is ours to keep, turn the mirror's declared angle from 45 to 30 so the beam leaves up and back toward the laser, film it, and slide the mirror back along the beam to centre x 300.

```json:plan
{"scene": "cl1a-mirror",
 "registryMode": null,
 "changes": [{"object": "mirror", "param": "orientationDeg", "value": 30, "why": "the outline asks for the mirror at 30 degrees; at 45 the beam leaves straight up"},
             {"object": "mirror", "param": "center", "value": [300, 200], "why": "slide the mirror back along the beam toward the laser"}],
 "hands": ["see", "openSketch", "setDeclared", "see", "dragTo"],
 "prediction": "first the beam rises straight up from the 45 degree mirror; in our sketch at 30 degrees it leaves orange, up and to the left; as the mirror slides left the hit point and the reflected column move left with it"}
```
