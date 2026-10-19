import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';

// The 1A mirror as our own sketch: a laser along y 200 into a bounce wall; turn the mirror to steer the beam.
const W = 600, H = 400;
const cy = Math.round(H / 2);

export const parts = {
  source: [SphereEmitter, {
    preset: 'particle-walk', is2D: true, center: [72, cy],
    orientationDeg: 0, chargeMode: 'positive', fundamentalDimension: 2, wavelength: 1,
    fundamentalWaveLength: 4, burstSize: 2, emitEveryTicks: 1
  }],
  mirror: [Wall, {
    rect: [290, 80, 20, 240],
    collisionBehavior: 'bounce', bounceDirection: 'reflect',
    orientationDeg: 30, color: [255, 120, 0], hooks: ['recolor']
  }],
};

export default function buildExperiment(exp) {
  exp.createCanvas(W, H, SphereEmitter.worldCfg(parts.source[1]));
  exp.declare(parts);
}
