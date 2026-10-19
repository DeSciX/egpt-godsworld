/* Copyright 2023-2026 by Essam Abadir */

/**
 * v1-replacements.js — the V1 → V2 port map: every removed V1 kind names its V2 composition, so an
 * unknown-kind throw TELLS the author what to build instead of leaving them to guess. A LEAF (no
 * imports): ObjectFactory reads it for its unknown-kind refusals, SlitLightSource for its own, and
 * the sketch rule (lib/frqtl/scenes/test/_sketch-rule.mjs) reads the names from here.
 */

export const V1_REPLACEMENTS = Object.freeze({
    DetectorWall:    "Wall{ collisionBehavior:'destroy', hooks:['count'] }  (preset 'detector-screen')",
    SlitScreen:      "Wall{ collisionBehavior:'destroy' } slabs + Tunnel{ mode:'directed', exitCollapse }",
    DSEWall:         "Wall{ collisionBehavior:'destroy' } slabs + one Tunnel{ mode:'directed' } per passage",
    SlitLightSource: "SphereEmitter{ preset:'laser' }",
    QuantumEmitter:  "SphereEmitter",
    PointSource:     "SphereEmitter{ preset:'drum' | 'spherical' }",
    DirectedTunnel:  "Tunnel{ mode:'directed' }",
    LightSource:     "SphereEmitter{ preset:'hemisphere' | 'laser' } + Tunnel",
    Tube:            "Tunnel (with Wall end caps)",
    ChamberEmitter:  "SphereEmitter + Tunnel (with Wall end caps)",
    Gun:             "Tunnel + SphereEmitter, composed at the sketch level",
    Bullet:          "Wall{ collisionBehavior:'bounce' } moved by a sketch tick-fn through setRect",
    Box:             "four Wall{ collisionBehavior:'block' } slabs",
    OvenBox:         "Wall{ collisionBehavior:'absorb' } + SphereEmitter{ emissionCap, gateCounter }",
    CircuitGate:     "LogicGate (the stock V2 gate: Wall{'destroy',['count']} input ammeters + Tunnel{'mirror'} channel + SphereEmitter rail + Wall{'destroy'} shunt valve)",
    CircuitProbe:    "Wall preset 'transparent-probe'",
    LeafField:       "(archived — no V2 successor)",
    EgptFractal:     "(archived — no V2 successor)"
});
