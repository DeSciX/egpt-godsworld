I opened all eight sampled frames (frame-00, 07, 14, 21, 28, 35, 42, 49) of SEE — ticks 14637–14887.

**What the footage shows.** A dark 3D stage seen from a rolled, raking camera. Across the middle stand three big dull-red slabs, seen in perspective with their tops and near faces visible — the three segments of the slit wall — and between them two bright blue slots standing out as thin, taller-looking blue panels: the two tunnel channels. The whole volume is peppered with small yellow dots. They are sparser on the left of the slab row and markedly denser in the band immediately beyond the two blue slots, where they form a loose fan that thins out toward the far edge of the stage; a few dots lie right out at the far corner. Two large translucent dark-grey quadrilaterals frame the scene, one above and one below — the two z-clip planes declared in the scene's code.

Lying across the lower part of the frame, in front of and below the slab row, is a flat rectangular strip rendered as a coarse grid of coloured cells — mostly blue and green with a run of yellow, orange and red cells concentrated toward its left-of-centre. That is the detector plate: its `transparent-probe` hit map, drawn as 12-px bins. There is also a small bright red/orange patch low down at the left blue slot. Across the eight frames the geometry does not move at all — slabs, slots, plate and camera are fixed — and only the yellow dot field shuffles: dots appear, drift rightward through and past the slots, and the dense fan beyond the slits flickers and refills frame to frame. The coloured hit map changes very little over the 5.1 s; its red/orange core stays put, with one or two cells changing shade.

**Against my PREDICTION.** Matched: the plate is there, standing across the beam downstream of the slit wall; yellow particles stream from the left, through the two slots, and on past; nothing moves but the particles; the camera holds still; and there are no sharp bands — the map reads as a broad concentration with scattered hot cells, exactly the "not readable in 250 ticks" my prediction and the memory record expected.

Where I was wrong, and I should say it plainly: I described the plate as "green and upright". On the clip it reads as a flat, near-horizontal coloured strip, and its colour is the hit map's blue→red scale, not the part's green. Two reasons I can give from text, not from the picture: the camera carries roll 90, so the world's axes do not sit on screen the way I assumed, and the plate's declared colour is only its body — what dominates is the accumulated bin map. Also, the map is already well filled: the Record clock is at tick ~14.6k, so this is a long-accumulated pattern, not a fresh one. I could not pick out the far sink as a distinct object in these frames, so I will not claim I saw it.

**Next: the one change.** The plan's single change, as a centre: the plate goes from centre [325, 200, 0] to centre **[365, 200, 0]** — +40 px along the beam in x, y and z untouched, so its rect becomes [355, 0, -77, 20, 400, 154] and the leg from the slit wall's back face (x 160) goes 155 → 195 px. The depth span stays -77..77, so nothing changes about how the clip planes cut it. Timing: 150 ticks of travel + 150 ticks of settle, a frame every 5 ticks at 10 fps = 60 frames = 6.0 s, inside the window, and the settle lets the clip film the plate accumulating after it lands.

PREDICTION: the result returns `dragged: "screen"`, `from.center [325, 200, 0]` → `to.center [365, 200, 0]`, rect [355, 0, -77, 20, 400, 154], zHeld false (I am supplying z explicitly as 0, its current depth centre). On the clip the coloured hit-map strip slides bodily away from the slab row along the beam — a visible 40 px shift, about a fifth of the slab-to-plate gap — keeping the same orientation, the same depth and the same transverse position, while the yellow dot field in the widening gap between the slots and the plate gets longer. It stops well short of the far edge, and in the settle the map keeps taking hits. I do NOT expect sharp fringes to resolve in 6 s; at most the hot core may look a little broader or shifted after the move.

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
  "note": "The one change: the detector plate moves 40 px farther along the beam, centre [325,200,0] -> [365,200,0], so its leg from the slit wall's back face goes 155 -> 195 px. y and depth unchanged. Describe exactly what you see: does the plate slide along the beam, does the gap between the slits and the plate lengthen, and does anything change in the pattern on its face?"
}
```
