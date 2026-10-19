`setCamera` returned the pose I asked for, unchanged and unrefused: azimuth 0, elevation 0, distance 520, roll 0, target [210, 200, 0]. That hand films nothing, so I have still seen no footage of this world in this thread — I am not going to say anything about how it looks until a clip comes through my eyes.

So the next hand is the framing clip. This is the one `see` of the round: I need to know, before I drive the drag, that the view is side-on — that x runs across the frame rather than down it — because the whole plan rests on a 40-pixel slide being visible as a slide. If this clip shows the beam running vertically, or the plate out of frame, I fix the pose once and film again; if it reads side-on, the next and final act is the `dragTo`, whose own clip carries the before-state and the move for the Owl.

Defaults give the clip I want: a frame every 5 ticks, 250 ticks of world, 51 frames at 10 fps — 5.1 seconds, inside the 5–10 s window.

What I will be checking in the frames, in this order: (1) is the beam horizontal — source at the left, plate at the right; (2) is the whole travel in frame — the plate's near face at x 315 now and x 355 after, with room to spare at the right; (3) can I see the gap between the slit wall's back face at x 160 and the plate's near face, since that gap widening from 155 to 195 pixels is what the plan asks to be shown.

PREDICTION: a 5.1-second clip, 51 frames, of the scene at rest at this new pose, looking along z at the x–y plane. I expect the beam to run left-to-right across the frame: the source as yellow quanta at the left near x 20, the red barrier wall left of centre as three plates with two blue slit channels between them, and the green heat-map plate standing to the right of them with painted cells already on its face (the world is at tick ~11000, so hits have been accumulating a long time). I expect a dark gap between the back of the slit wall and the plate's near face, and the plate's rect [315, 0, -77, 20, 400, 154] seen edge-on as a narrow vertical slab since I am looking straight down its z axis. Nothing should move except the quanta; the plate is at rest at centre [325, 200, 0] until I drag it.

```json:call:see
{
  "everyTicks": 5,
  "stopAt": {
    "ticks": 250
  },
  "fps": 10,
  "note": "Framing check before the drag: side-on view along z, beam across the frame. Is the source at the left, the red slit wall with its two blue channels left of centre, and the green plate to their right with room to its right for a 40-pixel slide?"
}
```
