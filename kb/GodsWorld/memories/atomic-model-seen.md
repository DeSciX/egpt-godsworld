# Memory: Atomic model — seen

No recording watched yet. The FRAQTL tester's recording of this scene was refused at open (a world-size mismatch in its rig, 600x600 here against its 600x400 default), so there is no clip in memories/atomic-model/ to cite. The only picture in that folder is the published tile still tile.png (tick 600), and Maxi's eyes are video; this memory waits for the clip.

Objects (600x600 world, from the sketch): atom frame 64x64 centred on (300,300), rect [268,268,64,64]; proton frame 8x8 inside it, rect [296,296,8,8], holding 48 one-pixel quarks; one electron, a one-pixel negative leaf, starting at (316,284), upper right inside the atom; the camera framed on the atom at 1.5x its width.

What it teaches (card, unverified by eye here): quarks pack into a proton and stay bound, an electron keeps its place; each parent pulls its children one step toward its centre every tick; no force equation, no quantum numbers.

PATHS to fly when the clip arrives (2D moves: pan relative to the atom rect left/top, zoom = visible height in px):
A "the whole atom": pan (atom.left+32, atom.top+32), zoom 96.
B "the proton": pan (proton.left+4, proton.top+4), zoom 24; do the quarks stay inside?
C "the electron": pan to the electron's start in the sketch, (316,284), zoom 40, and follow it for 600 ticks.
DRAGS: none. No drag in this sketch: every object here is built with `new`, not declared with exp.addObject, so inventory lists nothing and no hand can move it.
