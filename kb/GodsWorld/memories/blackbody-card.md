# Memory: Blackbody — card

load: GYM scene id `blackbody` · 2D · source site/vendor/frqtl-sdk/0.5.1/dist/scenes/blackbody.js

tile: Particles in a box. The Planck curve appears; no quanta assumed.

What you are seeing: A hot box of jostling particles glows red, and light spills out through a slit in its side. The Planck curve appears; no energy quanta are assumed.

Why it is impossible the usual way: Classical physics, the Rayleigh–Jeans law, predicts infinite energy at high frequencies, the "ultraviolet catastrophe". There is no settled traditional way to compute the plasma physics behind Planck's 1900 law from first principles.

How FRQTL gets it: A box, a thermostat that keeps it hot, and an absorbing wall that catches whatever escapes. Colliding particles merge into larger frames, and how full a frame is sets its colour. Independent cellular automata, no equations.

Tile still (tick 600): A grey box packed with glowing red blobs and tiny yellow dots, with dots and a few red blobs streaming out of an opening on its right side.

Rung Blackbody Radiation (Impossible things): A cavity of absorbing walls held at a target number of quanta by its own thermostat. Leaves collide and merge into parent frames; a frame's fullness is its frequency, so what leaks out of the slit is a spectrum of frame sizes. The Planck-like curve emerges from collisions — no energy quanta assumed.
