# Memory: 3D Collisions Lab — card

load: GYM scene id `collision-matrix-3d` · 3D · source site/vendor/frqtl-sdk/0.5.1/dist/scenes/collision-matrix-3d.js

tile: Balls in a box. Contact, momentum, settling. The same engine that makes light makes mechanics; no second physics.

What you are seeing: Balls in a box, in seven lanes coloured red to violet by density. Each pair flies together and collides: the hard ones bounce cleanly, the soft ones press into each other before parting. Contact, momentum, settling. This is a "Collisions Lab" because it is up to you to find the capacity-and-fill relationships that produce the desired elastic vs inelastic collisions at your desired scale.

Why it is impossible the usual way: In a game engine, collisions come from a separate physics engine, such as NVIDIA PhysX, solving rigid-body equations beside the renderer that draws the light. Two systems, two sets of rules.

How FRQTL gets it: The same engine that makes the light in the other scenes makes these collisions: pairs of the same frames at seven densities. No second physics, no equations.

Tile still (tick 200): Pairs of shiny balls, red, orange, yellow, green and violet, meeting in mid-air against black.

Rung 3D Collisions Lab (Impossible things): Seven head-on lanes of equal-mass voxel pairs at seven depths, from feather-light to rigid. Density sets how hard the bodies are; contact is identical on every axis. The same engine that makes light makes mechanics.
