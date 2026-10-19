The footage shows the pale beam running right along y 200 into the 45 degree orange slab at x about 370 and an orange column rising straight up from the hit point, from the first frame to the last: it matched my prediction. Now I open the same mirror as our own sketch, its parts declared as data.
PREDICTION: our sketch boots with the same laser and the mirror at 45 degrees; the stage lists source and mirror as its parts.

```json:call:openSketch
{
  "source": "import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';\n\n// The 1A mirror as our own sketch: a laser along y 200 into a bounce wall; turn the mirror to steer the beam.\nconst W = 600, H = 400;\nconst cy = Math.round(H / 2);\n\nexport const parts = {\n  source: [SphereEmitter, {\n    preset: 'particle-walk', is2D: true, center: [72, cy],\n    orientationDeg: 0, chargeMode: 'positive', fundamentalDimension: 2, wavelength: 1,\n    fundamentalWaveLength: 4, burstSize: 2, emitEveryTicks: 1\n  }],\n  mirror: [Wall, {\n    rect: [360, 80, 20, 240],\n    collisionBehavior: 'bounce', bounceDirection: 'reflect',\n    orientationDeg: 45, color: [255, 120, 0], hooks: ['recolor']\n  }],\n};\n\nexport default function buildExperiment(exp) {\n  exp.createCanvas(W, H, SphereEmitter.worldCfg(parts.source[1]));\n  exp.declare(parts);\n}\n"
}
```
