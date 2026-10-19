# Owl — turn 12 (thread mmt41a-owl-r2)

All 8 frames opened, in order: frame-00, 08, 16, 24, 32, 40, 48, 56. Every claim below is read off those
pixels. I did not plan and did not build this; I judge the footage against the outline and the prediction only.

## ACCOUNT — what the pixels show

**The parts in the block, left to right.** A thin vertical white wireframe strip at the far left (x≈40–80),
full frame height. A stack of three red slabs with pale-blue caps (the slit wall) at x≈150–285, with two
gaps between the caps — the upper gap at y≈150–165, the lower at y≈250–265. A tall panel with a cyan/green
rim carrying a heatmap face, starting at x≈325. A far dark wireframe panel with an almost empty black face
at x≈465–585. A dense cloud of small yellow dots fills the space between the left strip and the slab row,
with sparser dots to the right of the slabs.

**contact.** The dot cloud first meets the slit wall on its left face, in the **middle third** of the wall's
height — the dots funnel at the two slit gaps between the blue caps, and the blue caps themselves are
peppered with dots where the cloud lands on them (clearest on the middle and lower caps, frames 08–56).
The next part reached is the heatmap panel's left face: the two red/orange cores sit at y≈175–200 on a panel
spanning y≈8–368, i.e. the **middle third** vertically, straddling the panel's horizontal **middle** (x≈355
and x≈382 in frame-00, drifting right with the panel). The far dark wireframe panel is reached only by a few
isolated specks; its face is otherwise black in all 8 frames.

**after.** After the slits the dots go **straight on to the right**, across the dark gap toward the heatmap
panel — I count dots at x≈290–330 in every frame, including frame-56. Nothing turns back toward the source;
no upward or downward deflection is visible at the slits.

**passes.** **Yes, some passes the panel.** Faint specks sit in the gap beyond the heatmap panel and on the
far dark sink face — e.g. around (520, 95) and (480, 150) in frame-00, (475, 160) in frame-16, (540, 280) and
(475, 300) in frames 48 and 56. Dots also pass **above and below** the slab stack instead of through the
slits (cloud extends past y≈20 and y≈390 on the left side).

**The motion in the clip.** The heatmap panel's near (left) edge reads ≈325 (f-00), 328 (f-08), 335 (f-16),
340 (f-24), 345 (f-32), 348 (f-40), 350 (f-48), 352 (f-56); its far edge ≈418 → ≈440 over the same frames.
So the panel drifts **right, away from the slab row, by ~25–28 screen pixels**, monotonically. The dark gap
between the slab row's right edge (≈285, unmoving) and the panel's left edge widens from ≈40 px to ≈67 px.
The gap between the panel and the far dark sink narrows from ≈47 px to ≈28 px. The slab row and the far
sink hold their positions within my reading precision (±3 px); the left strip is fixed. The panel's apparent
face width narrows slightly, ≈93 px → ≈88 px, while its height is unchanged (≈8 to ≈366 throughout).

**The map.** The two red cores persist at the same mid-height in all 8 frames; they neither vanish nor
migrate. The central navy band reads somewhat darker and broader from frame-24 on. The face shows a broad
dark central band with cyan/green flanks and the two warm cores — **no countable fringe train** in the clip.

## Judging the OUTLINE, part by part

- *the 3D double slit* — present: source cloud, a slit wall with **two** gaps, a detector panel carrying the
  map, and the far sink. ✔
- *the detector screen moved farther from the slit wall* — present and it is the **only** thing that moves:
  the heatmap panel travels right, away from the slabs, and the widening dark band (40→67 px) is the
  separation growing. ✔
- *by 40 pixels* — I cannot read world units off pixels; what the pixels show is a move of the right
  **sense** (away from the wall) and of a screen size (~25 px) consistent with a 40-unit world step under
  this perspective. Nothing in the frames contradicts it. ✔
- Nothing else in the outline is asked and nothing extra moves — the slit wall, the left strip and the far
  sink are fixed. ✔

## Judging the PREDICTION, item by item

- "panel slides RIGHT across the frame, away from the slab row, by about 25 screen pixels" — **matches**:
  ~25–28 px, monotonic, measured edge by edge.
- "the dark band between the slabs and the panel widens correspondingly" — **matches**: ≈40 → ≈67 px.
- "against the same fixed slab row and far sink" — **matches**: both hold position.
- "the panel shrinks slightly as it recedes" — **weakly supported**: face width narrows ≈5 px, height
  unchanged. Not contradicted, but it is at the edge of what I can resolve, so I do not confirm it strongly.
- "dots keep crossing the widened band" — **matches**: dots at x≈290–330 in every frame, frame-56 included.
- "the warm cores may cool or spread… I am watching for that rather than asserting it" — hedged, so nothing
  to contradict; the pixels show the cores **holding** at the same mid-height through frame-56.
- "no countable fringes in 6 s" — **matches**: a broad dark band and two cores, no countable fringes.

No account item disagrees with the outline: no wrong third, no wrong direction, no part the outline has the
stream meet that it instead sails past. The one thing the beam does do beyond the outline — a few specks
reaching the far sink — is the sink doing its job, not a missing part. **Approve.**

```json:verdict
{"seen": {"contact": "slit wall (red slabs with blue caps) left face, middle third — the dots funnel at the two slit gaps (y≈150-165 and y≈250-265) and speckle the blue caps; next part reached is the heatmap detector panel's left face, middle third vertically (cores at y≈175-200 of a panel spanning y≈8-368) and across its horizontal middle (x≈355 and x≈382 in frame-00); the far dark wireframe sink is reached by a few specks only", "after": "straight on to the right through both slits and across the dark gap to the panel (dots at x≈290-330 in all 8 frames); no deflection up or down at the slits, nothing back toward the source", "passes": "yes — a few specks go past the heatmap panel into the gap beyond it and onto the far dark sink face, e.g. (520,95) and (480,150) in frame-00, (475,160) in frame-16, (540,280) in frame-48; dots also pass above and below the slab stack instead of through the slits", "motion": "the heatmap panel alone moves: near edge 325→352, far edge 418→440, i.e. ~25-28 px right, away from the slab row; gap slabs→panel 40→67 px, gap panel→far sink 47→28 px; slab row, left strip and far sink fixed within ±3 px; panel face width 93→88 px, height unchanged; two red cores hold at the same mid-height, no countable fringes"}, "verdict": "approve", "reasons": ["the detector panel is the ONLY part that moves, and it moves right — away from the fixed slit wall — by ~25-28 screen px, which is the outline's 'screen moved farther from the slit wall'", "the dark band between slabs and panel widens 40→67 px and the panel-to-sink gap narrows 47→28 px, so the separation really grew rather than the camera panning", "slab row, far sink and the left strip hold position within ±3 px across all 8 frames, as the prediction said", "dots keep crossing the widened band in every frame including frame-56, at x≈290-330", "the map shows a broad dark central band and two persistent warm cores at the middle third — no countable fringe train, as predicted", "the panel's slight shrink is only ~5 px of face width with unchanged height: at the edge of resolution, consistent but not strongly confirmed"], "change": null}
```
