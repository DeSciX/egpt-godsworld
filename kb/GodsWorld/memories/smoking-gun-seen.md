# Memory: Smoking Gun — seen

No recording watched yet: there is no clip in memories/smoking-gun/, and the memory waits for one. In @descix/frqtl-web 0.6.1-p3.1 this is a walk-through rung (the Smoking Gun group in the lab's scene picker), not one of the nine GYM tiles. Its registry row is id 'smoking-gun', source scenes/smoking-gun.js [src dist/shim/registry/walkthrough.js]; the sketch declares the muzzle SphereEmitter as its parts entry muzzle (exp.declare(parts)) and the Wall "bullet" by exp.addObject [src].

Objects (600x600x600 world, from the sketch): a SphereEmitter muzzle at the centre (300,300,0) firing a 1x10 slit along +X, 20 quanta a tick, winding down from tick 180 to zero at tick 600; a declared Wall "bullet", a 10 px reflecting cube that the sketch steps +1 px every second tick toward the far wall; a painted gun body (built with `new`, not declared, no collision).
