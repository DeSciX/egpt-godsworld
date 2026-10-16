# Memory: 1C · Counting Wall — card

load: GYM scene id `cl1c-counting-wall` · 2D · source site/vendor/frqtl-sdk/0.5.1/dist/scenes/counting-wall.js

group: Collision Lab

A detector screen — the Detector Screen preset (destroy + count) tallies every arrival by position. A LIVE in-scene chart (a first-class LiveChart object placed beside the detector) plots the running y→count histogram as the sim runs — the chart reads wall.getCollisionHistogram between ticks and accumulates on-screen. This is the basis for the double-slit fringe readout. The chart panel is a plain render-only object: drag it, resize it, or point it at any counting wall.
