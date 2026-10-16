# Memory: A pool — card

load: GYM scene id `r5-fountain-pool` · 2D · source site/vendor/frqtl-sdk/0.5.1/dist/scenes/self-interference.js

tile: One source. Rings. Interference as the geometry of random walks, not a wave.

What you are seeing: One source, and rings of ripples spread out across the water, glinting like light on a pool.

Why it is impossible the usual way: A ray is a straight line with no wave in it, so ray tracing cannot make interference rings at any cost, and solving the waves directly runs into the costs in the intro.

How FRQTL gets it: One sphere emitter - classical mechanics that looks like water, from the same light object, the sphere emitter that made the sun in the previous scene. Every particle zig-zags as it travels, so its path is itself a wave; the rings are the geometry of those wavy random walks crossing. The water is the same light field shown through a different renderer. No equations.

Tile still (tick 300): A dark teal surface scattered with white glints like light on water, with a faint ring around a dark dot at its centre.

Rung 5 · Fountain Pool (Light Lab): The SAME self-interference field, worn as water — particles hidden and the water shader on. The light field and the water field are the same emergent wave, a different lens (the fractal aha).
