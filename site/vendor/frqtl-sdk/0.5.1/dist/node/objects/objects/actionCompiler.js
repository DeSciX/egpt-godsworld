/* Copyright 2023-2026 by Essam Abadir */

/**
 * actionCompiler.js — the op-program compiler. TWO entry points, one output.
 *
 * This is the ONE place that lowers a declared collision behaviour into the op-program AST
 * (lib/shim/expr/ast-schema.js). The engine has NO behaviour vocabulary: it evaluates the
 * program's trigger, applies `set` ops, and provides the min/max/floor/random/intersects
 * primitives. Everything a wall "does" is decided here, at compile time.
 *
 *   compileWallV2(spec)                — the V2 vocabulary (collisionBehavior +
 *                                        bounceDirection + hooks). Walls speak ONLY this.
 *   compileActions(actions, …)         — the V1 CollisionActions[] + collision_type path,
 *                                        still live for the non-Wall parts (Box, Bullet,
 *                                        Tube, CircuitGate/Probe, SlitScreen's slits).
 *
 * ## Call order (both paths)
 *
 * The compiler runs BEFORE registration, not after: `LargeObject.js::LargeObject` compiles,
 * puts the program INTO the spec, and only then calls `universe.registerLargeObject(spec)`.
 * (The V2 Wall path registers with an empty spec and pushes its program immediately after,
 * via updateObjectProperty(handle,'LargeObject','program', …) — the AST must cross the WASM
 * boundary as a JSON string, so it cannot ride the spec object itself.)
 *
 * ## There is no native dispatch, so nothing may be left uncompiled
 *
 * `universe.rs::process_large_object_collisions` has no action or collision_type dispatch,
 * and `egpt_wasm::LargeObjectJsSpec` has no `actions` field — serde drops the key. An action
 * this compiler does not lower therefore vanishes at the wire with no error: a typo, a LOG,
 * or a BLOCK with no eject face produced a wall that silently did nothing. So `compileActions`
 * THROWS on anything it cannot compile, naming the action and its replacement.
 *
 * ## Action → op-program map
 *
 * | Action       | Op-program form                                    | Notes                            |
 * |--------------|----------------------------------------------------|----------------------------------|
 * | ABSORB       | set 0.is_alive = 0                                 | kills the colliding frame        |
 * | COUNT        | set 1.count = 1.count + 1                          | increments the LO hit counter    |
 * | MARK/DETECT  | Tagger.tagOps(loName)                              | the MARK part (tagger.js)        |
 * | BLOCK        | set 0.left/top = eject expr (named dir OR closest) | mirrored from OvenBox §10.3      |
 * | BOUNCE       | eject + velocity flip (named dir OR closest)       | same as OvenBox L4               |
 *
 * ## 'closest' eject (Cond-tree)
 *
 * 'closest' picks the nearest face of the LO to the frame's top-left corner:
 *   dL = |LO.left  - frame.left|,   dR = |LO.right  - frame.left|
 *   dT = |LO.top   - frame.top |,   dB = |LO.bottom - frame.top |
 *   minD = min(dL, dR, dT, dB); priority L > R > T > B on ties (mirrors native _eject).
 *
 * abs(x) is expressed as Fn('max', [x, Bin('-', Lit(0), x)]).
 * The pick is a nested Cond tree:
 *   isHorizMin = (min(dL,dR) < min(dT,dB))  → pick left or right face
 *   within horiz: isLeft = (dL <= dR)         → eject to left or right
 *   within vert:  isTop  = (dT <= dB)         → eject to top or bottom
 * Two set ops: one for frame.left (used when horiz wins), one for frame.top (vert wins).
 *
 * ## Actions that are NOT compilable (each throws)
 *
 * | Action              | Why, and what to use instead                                   |
 * |---------------------|----------------------------------------------------------------|
 * | LOG                 | no logging op exists; read TickData.objects[handle].frames     |
 * | RECOLOR             | the engine owns no colour; use the v2 `recolor` hook (a tag)   |
 * | BLOCK/BOUNCE, no eject face | pass `reposition`, or use compileWallV2                 |
 * | anything unrecognised | a typo — it would be dropped at the wire                     |
 *
 * ## No-double-execution guarantee
 *
 * Structural: the op-program is the ONLY execution path. Every action either becomes an op
 * here or throws here, so there is no second place a behaviour could also run from.
 *
 * ## Arrow legality
 *
 * lib/frqtl/objects/ → lib/shim/expr/ is a legal downward arrow.
 * AstSchema is resolved lazily (browser: window.AstSchema; Node: require at load).
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention — see Wall.js, LargeObject.js
//    and 24 more siblings). Every declaration below is PRIVATE to this file; the ONLY
//    thing that reaches the shared browser global scope is the explicit window.<NS>
//    assignment at the bottom. Classic <script> tags share ONE global lexical scope,
//    so an unwrapped top-level 'function _label(...)' here would silently OVERWRITE a
//    same-named helper in a sibling script (and vice-versa) — a collision that is
//    invisible to 'node --test' by construction, because Node gives each file its own
//    module scope. Enforced by lib/shim/engine/test/classic-script-scope.test.mjs.
(function () {

// ── AstSchema resolution (mirrors OvenBox's lazy-resolve pattern) ──────────────

var _AstSchemaMod = null;
var _SlabFaceMod = null;
var _TaggerMod = null;

if (typeof module !== 'undefined' && module.exports) {
    var _path = require('path');
    _AstSchemaMod = require(_path.resolve(__dirname, '../../../shim/expr/ast-schema.js'));
    // SlabFace — the SOLE face/OBB/convention authority (../geometry/SlabFace.js).
    // _buildReflectOps reads reflectBaseDeg from here so the reflection LAW and the engine
    // OBB region come from ONE derivation (circulation §1; no second hand-authored convention).
    _SlabFaceMod = require(_path.resolve(__dirname, '../geometry/SlabFace.js'));
    // Tagger — the MARK part (tagger.js). It owns the tag-op SHAPE
    // (`set 0.data.<key> = StrLit(value)`); this compiler FERRIES it at all three tag
    // sites (V1 MARK/DETECT, v2 `mark`, v2 `recolor`) rather than re-spelling the op.
    _TaggerMod = require(_path.resolve(__dirname, './tagger.js'));
}

function _getAstSchema() {
    if (_AstSchemaMod) return _AstSchemaMod;
    if (typeof window !== 'undefined' && window.AstSchema) return window.AstSchema;
    throw new Error(
        '[actionCompiler] AstSchema not available. ' +
        'In the browser, ensure ast-schema.js is loaded before new LargeObject().'
    );
}

function _getSlabFace() {
    if (_SlabFaceMod) return _SlabFaceMod;
    if (typeof window !== 'undefined' && window.SlabFace) return window.SlabFace;
    throw new Error(
        '[actionCompiler] SlabFace not available. ' +
        'In the browser, ensure SlabFace.js is loaded before new Wall()/compileWallV2 ' +
        '(it loads right after Rectangle.js in the game-layer manifest).'
    );
}

function _getTagger() {
    if (_TaggerMod) return _TaggerMod;
    if (typeof window !== 'undefined' && window.Tagger) return window.Tagger;
    throw new Error(
        '[actionCompiler] Tagger not available. ' +
        'In the browser, ensure tagger.js is loaded before actionCompiler.js ' +
        '(it loads right after SlabFace.js in the game-layer manifest).'
    );
}

// ── Trigger expr builder (G2b) ──────────────────────────────────────────────────

/**
 * Build the trigger expression for an op-program (G2b).
 *
 * For overlap-only actions (ABSORB/COUNT/MARK/BLOCK/BOUNCE/RANDOM/MOMENTUM):
 *   trigger = Fn('intersects', [Lit(HANDLE_FRAME), Lit(HANDLE_SELF)])
 *
 * For WALL (directional eject, where frames may have slipped past the face):
 *   trigger = Cond(Fn('intersects',...), Lit(1), past_edge_cmp)
 *   where past_edge_cmp tests whether the frame has passed through the face
 *   this tick (replacing is_frame_past_wall in the engine).
 *
 * The past-edge test is derived from `reposition` (the wall exit direction):
 *   'left'   → frame_right < lo_left   = Cmp('<', Ref(0,'right'), Ref(1,'left'))
 *   'right'  → frame_left > lo_right   = Cmp('>', Ref(0,'left'),  Ref(1,'right'))
 *   'top'    → frame_bottom < lo_top   = Cmp('<', Ref(0,'bottom'),Ref(1,'top'))
 *   'bottom' → frame_top > lo_bottom   = Cmp('>', Ref(0,'top'),   Ref(1,'bottom'))
 *   (no direction / 'closest') → intersects-only (no past-edge)
 *
 * Returns the trigger ExprAST.
 *
 * @param {string|null}  reposition    - Eject direction ('left'|'right'|'top'|'bottom'|'closest'|null)
 * @param {boolean}      withPastEdge  - true for WALL (test past-edge too); false for all others
 * @param {number}       HF            - HANDLE_FRAME (0)
 * @param {number}       HS            - HANDLE_SELF  (1)
 * @param {Function}     Lit
 * @param {Function}     Ref
 * @param {Function}     Cmp
 * @param {Function}     Cond
 * @param {Function}     Fn
 * @returns {ExprAST}
 */
function _buildTriggerExpr(reposition, withPastEdge, HF, HS, Lit, Ref, Cmp, Cond, Fn) {
    var intersectsExpr = Fn('intersects', [Lit(HF), Lit(HS)]);
    if (!withPastEdge) {
        return intersectsExpr;
    }
    // WALL: trigger = intersects OR past_edge_cmp
    // Expressed as: Cond(intersectsExpr, Lit(1), past_edge_cmp)
    // This is 1 when overlapping, otherwise falls through to past_edge_cmp (1 or 0).
    //
    // Past-edge semantics: the wall EJECTS in the `reposition` direction, so the wall
    // itself is on the OPPOSITE side.  A frame that slips THROUGH the wall exits the
    // box on the wall's exterior face.  Mirror of G2 is_frame_past_wall() keyed on the
    // LO name prefix (LEFT/RIGHT/TOP/BOTTOM → which exterior face to test):
    //
    //   reposition='left'   → wall is the RIGHT wall (ejects inward-left).
    //                         Past: frame slipped right-of-wall → frame.left > wall.right
    //   reposition='right'  → wall is the LEFT wall (ejects inward-right).
    //                         Past: frame slipped left-of-wall  → frame.right < wall.left
    //   reposition='top'    → wall is the BOTTOM wall (ejects inward-up).
    //                         Past: frame slipped below-wall    → frame.top > wall.bottom
    //   reposition='bottom' → wall is the TOP wall (ejects inward-down).
    //                         Past: frame slipped above-wall    → frame.bottom < wall.top
    var pastEdge;
    if (reposition === 'left') {
        // RIGHT wall — frame slipped to the right of the wall exterior
        pastEdge = Cmp('>', Ref(HF, 'left'), Ref(HS, 'right'));
    } else if (reposition === 'right') {
        // LEFT wall — frame slipped to the left of the wall exterior
        pastEdge = Cmp('<', Ref(HF, 'right'), Ref(HS, 'left'));
    } else if (reposition === 'top') {
        // BOTTOM wall — frame slipped below the wall exterior
        pastEdge = Cmp('>', Ref(HF, 'top'), Ref(HS, 'bottom'));
    } else if (reposition === 'bottom') {
        // TOP wall — frame slipped above the wall exterior
        pastEdge = Cmp('<', Ref(HF, 'bottom'), Ref(HS, 'top'));
    } else {
        // 'closest' or unknown: no directional past-edge test — intersects only.
        return intersectsExpr;
    }
    // trigger = if intersects then 1 else pastEdge
    return Cond(intersectsExpr, Lit(1), pastEdge);
}

/**
 * Attach a program-level trigger to an op-program (G2b — program-level trigger design).
 *
 * Sets program.trigger = trigger so the Rust engine evaluates the trigger ONCE before
 * running any ops. If trigger evaluates to 0 (false), ALL ops are skipped.
 *
 * This replaces the old per-op Cond wrapping approach, which caused a critical bug:
 * when the eject op (op 1) ran and updated scope.left, the bounce op's (op 2) trigger
 * re-evaluated Fn('intersects') using the post-eject position, returning false and
 * silently skipping the velocity flip.
 *
 * The ops are NOT wrapped; they remain unconditional expressions. The trigger gates
 * the entire program atomically.
 *
 * @param {{ on: string, ops: Array }} program  — the program to annotate in place
 * @param {ExprAST}  trigger                    — the trigger ExprAST (from _buildTriggerExpr)
 * @returns {{ on: string, ops: Array, trigger: ExprAST }}  the annotated program
 */
function _applyProgramTrigger(program, trigger) {
    program.trigger = trigger;
    return program;
}

// ── X/Y-only intersects trigger — RETIRED (FRQTL-MAINT, #61, 2026-07-01) ────────────
//
// A manual x/y-only overlap trigger (`_buildXYIntersectsTrigger`) used to exist here for
// thin end-cap walls (Tube's LEFT/RIGHT breech/muzzle), working around a real engine
// wire-contract gap: every LargeObject's z-slab was hardcoded to `[0, own-x-width]`
// (`egpt_wasm/src/lib.rs` `LargeObjectJsSpec::into_spec()`), so a thin end-cap's z-slab
// (`[0, wallThickness]`) never caught a z-drifted frame via the native 3D `Fn('intersects')`
// test. That gap is now CLOSED: the LO wire contract accepts an explicit 6-element
// `[left, top, z, width, height, depth]` rect (`rect_to_z_capable_rectangle`,
// `egpt_wasm/src/lib.rs`, landed commit `1c349ab`) — a wall built with a real z/d that
// spans the tube's z cross-section makes the native 3D `intersects` trigger correct again,
// so every wall (including end-caps and the new NEAR/FAR faces) now uses the SAME
// standard per-face-LO construction + trigger as TOP/BOTTOM (see Tube.js). The manual
// workaround is deleted, not kept alongside (DRY — superseded code is removed).

// ── Eject op builders (extracted from OvenBox.makeEjectProgram — shared authority) ─

/**
 * Build the L3 eject op (reposition) for a named wall direction.
 * For 'closest', returns TWO ops (for frame.left and frame.top) that implement
 * the nearest-face pick as a nested Cond tree.
 * Returns an array of AST ops, or null when direction is unknown.
 *
 * Eject formulas (bit-identical to native lo._eject, proven EP22-EP25):
 *   'left'   → set frame.left = self.left - frame.w - 1
 *   'right'  → set frame.left = self.right + 1
 *   'top'    → set frame.top  = self.top   - frame.h - 1
 *   'bottom' → set frame.top  = self.bottom + 1
 *
 * 'closest' nearest-face Cond tree:
 *   abs(x) = max(x, 0-x)
 *   dL = abs(LO.left  - frame.left),  dR = abs(LO.right  - frame.left)
 *   dT = abs(LO.top   - frame.top),   dB = abs(LO.bottom - frame.top)
 *   isHoriz = min(dL,dR) < min(dT,dB)  → horizontal face is closer than vertical
 *   within horiz: isLeft = dL <= dR    → eject left or right
 *   within vert:  isTop  = dT <= dB    → eject top or bottom
 *   Two set ops: frame.left (horiz wins), frame.top (vert wins).
 *   Priority matches native (L > R > T > B on ties): '<' prefers horiz, NOT '<='.
 *
 * @param {string} reposition - 'left'|'right'|'top'|'bottom'|'near'|'far'|'closest'
 * @param {number} HANDLE_FRAME
 * @param {number} HANDLE_SELF
 * @param {Function} Lit
 * @param {Function} Ref
 * @param {Function} Bin
 * @param {Function} Cmp
 * @param {Function} Cond
 * @param {Function} Fn
 * @returns {Array<object>|null}  Array of ops (1 for named dir, 2 for 'closest'), or null
 */
function _buildEjectOps(reposition, HANDLE_FRAME, HANDLE_SELF, Lit, Ref, Bin, Cmp, Cond, Fn) {
    if (reposition === 'left') {
        return [{ set: HANDLE_FRAME + '.left',
                  to: Bin('-', Bin('-', Ref(HANDLE_SELF, 'left'), Ref(HANDLE_FRAME, 'w')), Lit(1)) }];
    } else if (reposition === 'right') {
        return [{ set: HANDLE_FRAME + '.left',
                  to: Bin('+', Ref(HANDLE_SELF, 'right'), Lit(1)) }];
    } else if (reposition === 'top') {
        return [{ set: HANDLE_FRAME + '.top',
                  to: Bin('-', Bin('-', Ref(HANDLE_SELF, 'top'), Ref(HANDLE_FRAME, 'h')), Lit(1)) }];
    } else if (reposition === 'bottom') {
        return [{ set: HANDLE_FRAME + '.top',
                  to: Bin('+', Ref(HANDLE_SELF, 'bottom'), Lit(1)) }];
    } else if (reposition === 'near') {
        // FRQTL-MAINT (2026-07-01, #61): the z NEAR|FAR named-direction case — unblocked
        // by the landed 6-element rect ([left,top,z,w,h,d]) wire contract, which makes
        // `self.near`/`self.far` (the LO's OWN z-slab) meaningful for the first time (was
        // always the origin-pinned [0,w] before — see the RETIRED section above). Formula
        // mirrors 'left'/'right'/'top'/'bottom' exactly, one axis over: push the frame just
        // outside this wall's OWN near face (−z side) — used by a wall positioned at the
        // FAR side of the interior, ejecting intruders back toward −z. Reuses the same
        // shape as the 'closest3d' ejectNear3 formula below (self.near - frame.w/2 - 1).
        return [{ set: HANDLE_FRAME + '.z',
                  to: Bin('-', Bin('-', Ref(HANDLE_SELF, 'near'), Bin('*', Ref(HANDLE_FRAME, 'w'), Lit(0.5))), Lit(1)) }];
    } else if (reposition === 'far') {
        // Mirror of 'near': push the frame just outside this wall's OWN far face (+z side)
        // — used by a wall positioned at the NEAR side of the interior, ejecting intruders
        // back toward +z. Reuses the 'closest3d' ejectFar3 formula shape.
        return [{ set: HANDLE_FRAME + '.z',
                  to: Bin('+', Bin('+', Ref(HANDLE_SELF, 'far'), Bin('*', Ref(HANDLE_FRAME, 'w'), Lit(0.5))), Lit(1)) }];
    } else if (reposition === 'closest') {
        // Helper: abs(expr) = max(expr, 0 - expr)
        function Abs(e) { return Fn('max', [e, Bin('-', Lit(0), e)]); }
        // Distances: |LO.face - frame.corner|
        // Each used twice → no side-effects so safe to duplicate in AST.
        var dL = Abs(Bin('-', Ref(HANDLE_SELF, 'left'),   Ref(HANDLE_FRAME, 'left')));
        var dR = Abs(Bin('-', Ref(HANDLE_SELF, 'right'),  Ref(HANDLE_FRAME, 'left')));
        var dT = Abs(Bin('-', Ref(HANDLE_SELF, 'top'),    Ref(HANDLE_FRAME, 'top')));
        var dB = Abs(Bin('-', Ref(HANDLE_SELF, 'bottom'), Ref(HANDLE_FRAME, 'top')));
        // Duplicate refs for the second copy (AST is immutable, sharing is safe but
        // clarity-best-practice is separate literals for each occurrence).
        var dL2 = Abs(Bin('-', Ref(HANDLE_SELF, 'left'),   Ref(HANDLE_FRAME, 'left')));
        var dR2 = Abs(Bin('-', Ref(HANDLE_SELF, 'right'),  Ref(HANDLE_FRAME, 'left')));
        var dT2 = Abs(Bin('-', Ref(HANDLE_SELF, 'top'),    Ref(HANDLE_FRAME, 'top')));
        var dB2 = Abs(Bin('-', Ref(HANDLE_SELF, 'bottom'), Ref(HANDLE_FRAME, 'top')));
        var dL3 = Abs(Bin('-', Ref(HANDLE_SELF, 'left'),   Ref(HANDLE_FRAME, 'left')));
        var dR3 = Abs(Bin('-', Ref(HANDLE_SELF, 'right'),  Ref(HANDLE_FRAME, 'left')));
        var dT3 = Abs(Bin('-', Ref(HANDLE_SELF, 'top'),    Ref(HANDLE_FRAME, 'top')));
        var dB3 = Abs(Bin('-', Ref(HANDLE_SELF, 'bottom'), Ref(HANDLE_FRAME, 'top')));

        // Eject positions
        var ejectLeft   = Bin('-', Bin('-', Ref(HANDLE_SELF, 'left'),   Ref(HANDLE_FRAME, 'w')), Lit(1));
        var ejectRight  = Bin('+', Ref(HANDLE_SELF, 'right'), Lit(1));
        var ejectTop    = Bin('-', Bin('-', Ref(HANDLE_SELF, 'top'),    Ref(HANDLE_FRAME, 'h')), Lit(1));
        var ejectBottom = Bin('+', Ref(HANDLE_SELF, 'bottom'), Lit(1));

        // isHoriz: min(dL,dR) < min(dT,dB) → horizontal face is strictly closer
        // Priority: horiz < vert → L/R wins on tie with T/B (matches native if-else order L>R>T>B
        // because native sets newLeft first (overrides newTop), then only changes newTop if
        // neither L nor R won; using strict '<' gives horiz priority over vert on exact tie).
        var minHoriz = Fn('min', [dL, dR]);
        var minVert  = Fn('min', [dT, dB]);
        var isHoriz  = Cmp('<', minHoriz, minVert);

        // isLeft (given horiz): dL <= dR ↔ NOT dR < dL ↔ Cmp('<',dR,dL)==0
        // Use: Cond(isHoriz, Cond(isLeft, ejectLeft, ejectRight), keep)
        // isLeft = dL <= dR = NOT (dR < dL) = Cmp('<',dR2,dL2) gives 0 if dL<=dR
        // We want isLeft=1 when dL<=dR, so invert: Cond(Cmp('<',dR2,dL2), ejectRight, ejectLeft)
        // (if dR<dL → right is closer → ejectRight; else dL<=dR → left is closer → ejectLeft)
        var horizEject = Cond(Cmp('<', dR2, dL2), ejectRight, ejectLeft);

        // op1: set frame.left = if isHoriz → horizEject else → frame.left (no-op)
        var leftOp = {
            set: HANDLE_FRAME + '.left',
            to: Cond(isHoriz, horizEject, Ref(HANDLE_FRAME, 'left'))
        };

        // isTop (given vert): dT <= dB → Cond(Cmp('<',dB3,dT3), ejectBottom, ejectTop)
        var vertEject = Cond(Cmp('<', dB3, dT3), ejectBottom, ejectTop);

        // op2: set frame.top = if isHoriz → frame.top (no-op) else → vertEject
        // NOT isHoriz = Cond(isHoriz2, Lit(0), Lit(1)) = invert
        // But we don't have logical NOT directly. Use Cond(isHoriz, keepTop, vertEject).
        var minHoriz2 = Fn('min', [dL3, dR3]);
        var minVert2  = Fn('min', [dT3, dB3]);
        var isHoriz2  = Cmp('<', minHoriz2, minVert2);
        var topOp = {
            set: HANDLE_FRAME + '.top',
            to: Cond(isHoriz2, Ref(HANDLE_FRAME, 'top'), vertEject)
        };

        return [leftOp, topOp];

    } else if (reposition === 'closest3d') {
        // 3D 'closest' — the 6-face generalization (adds near/far z faces). Used by 3D sugar
        // (e.g. the Bullet) once the z substrate is exposed in the op scope bag (z/near/far).
        // 2D-PARITY note: kept SEPARATE from 'closest' (2-face) so existing 2D scenes are
        // byte-identical; 3D objects OPT IN via reposition:'closest3d'. Safe because the
        // collision trigger (intersects) is now 3D — only frames inside the LO's z-slab fire,
        // so a z-eject can never teleport a far-z frame.
        //
        // WASM-ONLY PATH (architect Gate-2): the canonical Rust/WASM engine exposes z/near/far
        // in the op scope bag; the FROZEN JS reference (EGPTfrqtl.js evalExpr) is 2D-only —
        // z/near/far read 0 there — so closest3d is exercised against WASM only. Conformance
        // C19 (lib/frqtl/conformance/collide_scenarios.js — a WASM-only oracle) covers it; do NOT
        // add closest3d to the JS-cross-checked suites (action_compiler_scenarios) without first
        // mirroring z/near/far into the JS-ref scope bag (which the frozen-fixture rule forbids).
        // NIT-2 (architect, non-blocking, next substantive edit): factor the four x/y eject-position
        // expressions (ejectLeft/Right/Top/Bottom) shared with the 'closest' branch above into one
        // helper; closest3d then adds only near/far + the 3-axis priority. Deferred to avoid
        // touching the green 'closest' path at closure.
        function Abs3(e) { return Fn('max', [e, Bin('-', Lit(0), e)]); }
        // Distance factories (fresh AST per use; sharing is safe but fresh matches house style).
        // Reference corner: frame.left/top/near vs the LO's six faces.
        function dL() { return Abs3(Bin('-', Ref(HANDLE_SELF, 'left'),   Ref(HANDLE_FRAME, 'left'))); }
        function dR() { return Abs3(Bin('-', Ref(HANDLE_SELF, 'right'),  Ref(HANDLE_FRAME, 'left'))); }
        function dT() { return Abs3(Bin('-', Ref(HANDLE_SELF, 'top'),    Ref(HANDLE_FRAME, 'top'))); }
        function dB() { return Abs3(Bin('-', Ref(HANDLE_SELF, 'bottom'), Ref(HANDLE_FRAME, 'top'))); }
        function dN() { return Abs3(Bin('-', Ref(HANDLE_SELF, 'near'),   Ref(HANDLE_FRAME, 'near'))); }
        function dF() { return Abs3(Bin('-', Ref(HANDLE_SELF, 'far'),    Ref(HANDLE_FRAME, 'near'))); }
        function minH() { return Fn('min', [dL(), dR()]); }
        function minV() { return Fn('min', [dT(), dB()]); }
        function minZ() { return Fn('min', [dN(), dF()]); }

        // Eject targets. x/y write the EDGE (left/top — writable, adjusts center); z writes the
        // CENTER (z is the writable center accessor), so the z formulas use w/2 (depth == w).
        var ejectLeft3   = Bin('-', Bin('-', Ref(HANDLE_SELF, 'left'),   Ref(HANDLE_FRAME, 'w')), Lit(1));
        var ejectRight3  = Bin('+', Ref(HANDLE_SELF, 'right'), Lit(1));
        var ejectTop3    = Bin('-', Bin('-', Ref(HANDLE_SELF, 'top'),    Ref(HANDLE_FRAME, 'h')), Lit(1));
        var ejectBottom3 = Bin('+', Ref(HANDLE_SELF, 'bottom'), Lit(1));
        // near: place frame fully in front of the near face → z = LO.near - frame.w/2 - 1
        var ejectNear3   = Bin('-', Bin('-', Ref(HANDLE_SELF, 'near'), Bin('*', Ref(HANDLE_FRAME, 'w'), Lit(0.5))), Lit(1));
        // far: place frame fully beyond the far face → z = LO.far + frame.w/2 + 1
        var ejectFar3    = Bin('+', Bin('+', Ref(HANDLE_SELF, 'far'),  Bin('*', Ref(HANDLE_FRAME, 'w'), Lit(0.5))), Lit(1));

        // Within-axis pick (closer face wins; '<' only, so test the strict side).
        var horizEject3 = Cond(Cmp('<', dR(), dL()), ejectRight3,  ejectLeft3);
        var vertEject3  = Cond(Cmp('<', dB(), dT()), ejectBottom3, ejectTop3);
        var zEject3     = Cond(Cmp('<', dF(), dN()), ejectFar3,    ejectNear3);

        // Axis selection, priority x > y > z (ties to the earlier axis). No '<=' op, so encode
        // "minH wins ties" as: x loses ONLY if minV or minZ is STRICTLY smaller than minH.
        //   isH  = NOT(minV < minH) AND NOT(minZ < minH)
        //   isV  = NOT isH AND NOT(minZ < minV)
        //   isZ  = NOT isH AND     (minZ < minV)
        function isH() {
            return Cond(Cmp('<', minV(), minH()), Lit(0),
                   Cond(Cmp('<', minZ(), minH()), Lit(0), Lit(1)));
        }
        // "V wins, given not H" = NOT(minZ < minV)
        function vGivenNotH() { return Cond(Cmp('<', minZ(), minV()), Lit(0), Lit(1)); }

        var leftOp3 = {
            set: HANDLE_FRAME + '.left',
            to: Cond(isH(), horizEject3, Ref(HANDLE_FRAME, 'left'))
        };
        var topOp3 = {
            set: HANDLE_FRAME + '.top',
            to: Cond(Cond(isH(), Lit(0), vGivenNotH()), vertEject3, Ref(HANDLE_FRAME, 'top'))
        };
        var zOp3 = {
            set: HANDLE_FRAME + '.z',
            to: Cond(Cond(isH(), Lit(0), Cond(vGivenNotH(), Lit(0), Lit(1))), zEject3, Ref(HANDLE_FRAME, 'z'))
        };
        return [leftOp3, topOp3, zOp3];
    }
    return null; // unknown direction
}

/**
 * Build the L4 velocity-flip op for a named wall direction.
 * Returns a single AST op object, or null when wallName has no directional prefix.
 *
 * Velocity-flip formula (bit-identical to native BOUNCE):
 *   LEFT|RIGHT  → set frame.vx = 0 - frame.vx
 *   TOP|BOTTOM  → set frame.vy = 0 - frame.vy
 *   NEAR|FAR    → set frame.vz = 0 - frame.vz   (FRQTL-MAINT 2026-07-01, #61 — unblocked
 *                 by the landed z/depth wire contract; mirrors LEFT/RIGHT/TOP/BOTTOM
 *                 one axis over)
 *
 * @param {string} loName - LO name string (e.g. 'TOP', 'LEFT_T', 'wall1')
 * @param {number} HANDLE_FRAME
 * @param {Function} Lit
 * @param {Function} Ref
 * @param {Function} Bin
 * @returns {object|null}
 */
function _buildVelocityFlipOp(loName, HANDLE_FRAME, Lit, Ref, Bin) {
    var wallDir = loName ? loName.split('_')[0] : '';
    if (wallDir === 'LEFT' || wallDir === 'RIGHT') {
        return { set: HANDLE_FRAME + '.vx',
                 to: Bin('-', Lit(0), Ref(HANDLE_FRAME, 'vx')) };
    } else if (wallDir === 'TOP' || wallDir === 'BOTTOM') {
        return { set: HANDLE_FRAME + '.vy',
                 to: Bin('-', Lit(0), Ref(HANDLE_FRAME, 'vy')) };
    } else if (wallDir === 'NEAR' || wallDir === 'FAR') {
        return { set: HANDLE_FRAME + '.vz',
                 to: Bin('-', Lit(0), Ref(HANDLE_FRAME, 'vz')) };
    }
    return null;
}

// ── Z-containment workaround — RETIRED (FRQTL-MAINT, #61, 2026-07-01) ───────────────
//
// `_buildZContainmentOps` used to build a manual combined vz-reflect/z-clamp program on
// ONE full-footprint LO (literal JS-computed z bounds, never `self.near`/`self.far`),
// working around the same origin-pinned z-slab gap described above (every LO's z was
// hardcoded to 0.0, depth to its own x-width — `egpt_wasm/src/lib.rs`
// `LargeObjectJsSpec::into_spec()`, pre-commit `1c349ab`). That gap is closed: the wire
// contract now accepts an explicit 6-element `[left, top, z, width, height, depth]` rect
// (`rect_to_z_capable_rectangle`), so a real NEAR wall LO and a real FAR wall LO — each
// positioned at their own z-slab exactly like TOP/BOTTOM are positioned in y — now work
// through the SAME standard per-face-LO construction (`new LargeObject(...)` auto-compile
// via `collisionType`+`reposition`) as every other face, using the `'near'`/`'far'` cases
// added to `_buildEjectOps`/`_buildVelocityFlipOp` above. Tube.js builds these two extra
// faces directly; the manual workaround is deleted, not kept alongside (DRY).

// ── Collision LEXICON v2 builders (Collision Lab, CEO lexicon v2) ────────────────
//
// These are ADDITIVE, pure op-program builders for the v2 wall vocabulary
// (behavior nothing|block|bounce|absorb|destroy; bounceDirection reflect|random;
// hooks mark|count). They compose the SAME closed NODE_KINDS the rest of this
// file uses — ZERO engine change (theorist v2 advisory, all RUN-verified pkg-node).
// The existing compileActions() path is UNTOUCHED (byte-identity preserved); v2
// callers (Wall.js via resolveWallSpec) go through compileWallV2() below.
//
// AST logic helpers — the closed vocab has '<','>','==' (no '<=','>=') and no
// boolean AND/OR, so these are the canonical encodings used throughout:
//   LE(a,b) = a<=b        = NOT(a>b)   = Cond(Cmp('>',a,b), 0, 1)
//   GE(a,b) = a>=b        = NOT(a<b)   = Cond(Cmp('<',a,b), 0, 1)
//   OR(x,y) (x,y ∈ {0,1}) = Cond(x, 1, y)
//   AND(x,y)              = Cond(x, y, 0)
//   NOT(x)                = Cond(x, 0, 1)

/**
 * B2 — incidence-aware single-LO Reflect (CEO P1, RATIFIED). Replaces the W1
 * name-prefix flip (`_buildVelocityFlipOp` keyed on the LO NAME) with a Cond tree
 * over the frame's PREVIOUS position: the axis whose move carried the frame INTO
 * the wall this tick is the one whose velocity is inverted — the physical
 * axis-of-incidence, on ONE monolithic wall (no per-face LO decomposition needed).
 *
 * prev_x/prev_y are CENTER coords already in the frame scope bag (universe.rs:2262,
 * read today by MOMENTUM_BASED at :670); w/h are the frame extents; left/right/top/
 * bottom are the frame's CURRENT edges; self.left/right/top/bottom are the wall faces.
 *
 * wasOutsideX = the frame's x-extent did NOT overlap the wall's x-span LAST tick
 *   (fully left: prev_x + w/2 <= self.left ; fully right: prev_x - w/2 >= self.right).
 * Corner tie-break (both axes newly-overlap in one ±2-stack tick) = DEEPER-PENETRATION
 *   axis (larger current overlap), BOTH on exact tie:
 *     penX = min(frame.right, self.right) - max(frame.left, self.left)
 *     penY = min(frame.bottom, self.bottom) - max(frame.top, self.top)
 *     flipX ⇔ wasOutsideX AND (NOT wasOutsideY OR penX >= penY)
 *     flipY ⇔ wasOutsideY AND (NOT wasOutsideX OR penY >= penX)   (>= gives both-on-tie)
 *
 * Composes with an eject (the caller prepends `_buildEjectOps('closest')`) — Reflect
 * ALWAYS fuses with eject (a flip-without-reposition re-triggers next tick = in-wall
 * jitter; round-1 §3). Returns ONLY the two flip ops (eject is the caller's).
 *
 * @returns {Array<object>} [flipVxOp, flipVyOp]
 */
function _buildIncidenceReflectOps(HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn) {
    function NOT(x)   { return Cond(x, Lit(0), Lit(1)); }
    function OR(x, y) { return Cond(x, Lit(1), y); }
    function AND(x, y){ return Cond(x, y, Lit(0)); }
    function LE(a, b) { return Cond(Cmp('>', a, b), Lit(0), Lit(1)); }
    function GE(a, b) { return Cond(Cmp('<', a, b), Lit(0), Lit(1)); }
    function halfW()  { return Bin('*', Ref(HF, 'w'), Lit(0.5)); }
    function halfH()  { return Bin('*', Ref(HF, 'h'), Lit(0.5)); }
    // prev extents (center ± half): fresh AST per use (immutable, no side effects).
    function prevRight() { return Bin('+', Ref(HF, 'prev_x'), halfW()); }
    function prevLeft()  { return Bin('-', Ref(HF, 'prev_x'), halfW()); }
    function prevBottom(){ return Bin('+', Ref(HF, 'prev_y'), halfH()); }
    function prevTop()   { return Bin('-', Ref(HF, 'prev_y'), halfH()); }
    function wasOutsideX() { return OR(LE(prevRight(),  Ref(HS, 'left')), GE(prevLeft(), Ref(HS, 'right'))); }
    function wasOutsideY() { return OR(LE(prevBottom(), Ref(HS, 'top')),  GE(prevTop(),  Ref(HS, 'bottom'))); }
    // current-tick overlap depth per axis (deeper = larger).
    function penX() {
        return Bin('-', Fn('min', [Ref(HF, 'right'),  Ref(HS, 'right')]),
                        Fn('max', [Ref(HF, 'left'),   Ref(HS, 'left')]));
    }
    function penY() {
        return Bin('-', Fn('min', [Ref(HF, 'bottom'), Ref(HS, 'bottom')]),
                        Fn('max', [Ref(HF, 'top'),    Ref(HS, 'top')]));
    }
    var flipXcond = AND(wasOutsideX(), OR(NOT(wasOutsideY()), GE(penX(), penY())));
    var flipYcond = AND(wasOutsideY(), OR(NOT(wasOutsideX()), GE(penY(), penX())));
    return [
        { set: HF + '.vx', to: Cond(flipXcond, Bin('-', Lit(0), Ref(HF, 'vx')), Ref(HF, 'vx')) },
        { set: HF + '.vy', to: Cond(flipYcond, Bin('-', Lit(0), Ref(HF, 'vy')), Ref(HF, 'vy')) }
    ];
}

/**
 * Z1 — 3D incidence-aware Reflect (CEO UX-pass 2026-07-24; theorist Q2 PROVEN as the
 * op-data generalization on top of the landed prev_z scope-bag key — C26). The exact
 * 3-axis lift of `_buildIncidenceReflectOps`: adds the z-axis (near/far faces), flipping
 * whichever of the SIX faces' axis carried the frame INTO the wall's z-slab this tick.
 *
 * prev_z is a CENTER coord in the frame scope bag (universe.rs, WASM-only — the frozen
 * JS fixture has NO prev_* family, so this whole builder is WASM-only, declared alongside
 * the closest3d/C19 precedent). Frames are cubes ⇒ the z half-extent is w/2 (depth==w,
 * matching the `near = z − w/2` derivation), exactly as prev_x uses w/2 in 2D.
 *
 *   wasOutsideZ = the frame's z-extent did NOT overlap the wall's z-slab LAST tick
 *     (fully near: prev_z + w/2 <= self.near ; fully far: prev_z − w/2 >= self.far).
 *   penZ        = min(frame.far, self.far) − max(frame.near, self.near)  (current overlap depth)
 *
 * 3-AXIS deeper-penetration tie-break (generalizes the ratified 2-axis rule): flip axis A
 * iff A was outside AND A's penetration ≥ EVERY OTHER axis that was ALSO outside (an axis
 * that was already inside does not compete). `>=` gives both-on-exact-tie, exactly as the
 * 2D rule does. Composes with `_buildEjectOps('closest3d')` prepended by the caller (a
 * z-flip without a z-eject re-triggers next tick = in-wall jitter, same as the 2D rule).
 *
 * @returns {Array<object>} [flipVxOp, flipVyOp, flipVzOp]
 */
function _buildIncidenceReflectOps3D(HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn) {
    function NOT(x)   { return Cond(x, Lit(0), Lit(1)); }
    function OR(x, y) { return Cond(x, Lit(1), y); }
    function AND(x, y){ return Cond(x, y, Lit(0)); }
    function LE(a, b) { return Cond(Cmp('>', a, b), Lit(0), Lit(1)); }
    function GE(a, b) { return Cond(Cmp('<', a, b), Lit(0), Lit(1)); }
    function halfW()  { return Bin('*', Ref(HF, 'w'), Lit(0.5)); }
    function halfH()  { return Bin('*', Ref(HF, 'h'), Lit(0.5)); }
    // z half-extent: frames are cubes, depth == w (the near=z−w/2 derivation), so w/2.
    function halfD()  { return Bin('*', Ref(HF, 'w'), Lit(0.5)); }
    function prevRight() { return Bin('+', Ref(HF, 'prev_x'), halfW()); }
    function prevLeft()  { return Bin('-', Ref(HF, 'prev_x'), halfW()); }
    function prevBottom(){ return Bin('+', Ref(HF, 'prev_y'), halfH()); }
    function prevTop()   { return Bin('-', Ref(HF, 'prev_y'), halfH()); }
    function prevFar()   { return Bin('+', Ref(HF, 'prev_z'), halfD()); }
    function prevNear()  { return Bin('-', Ref(HF, 'prev_z'), halfD()); }
    function wasOutsideX() { return OR(LE(prevRight(),  Ref(HS, 'left')), GE(prevLeft(), Ref(HS, 'right'))); }
    function wasOutsideY() { return OR(LE(prevBottom(), Ref(HS, 'top')),  GE(prevTop(),  Ref(HS, 'bottom'))); }
    function wasOutsideZ() { return OR(LE(prevFar(),    Ref(HS, 'near')), GE(prevNear(), Ref(HS, 'far'))); }
    function penX() {
        return Bin('-', Fn('min', [Ref(HF, 'right'),  Ref(HS, 'right')]),
                        Fn('max', [Ref(HF, 'left'),   Ref(HS, 'left')]));
    }
    function penY() {
        return Bin('-', Fn('min', [Ref(HF, 'bottom'), Ref(HS, 'bottom')]),
                        Fn('max', [Ref(HF, 'top'),    Ref(HS, 'top')]));
    }
    function penZ() {
        return Bin('-', Fn('min', [Ref(HF, 'far'),    Ref(HS, 'far')]),
                        Fn('max', [Ref(HF, 'near'),   Ref(HS, 'near')]));
    }
    // flipA ⇔ wasOutsideA AND (NOT wasOutsideB OR penA>=penB) AND (NOT wasOutsideC OR penA>=penC)
    var flipXcond = AND(wasOutsideX(),
        AND(OR(NOT(wasOutsideY()), GE(penX(), penY())), OR(NOT(wasOutsideZ()), GE(penX(), penZ()))));
    var flipYcond = AND(wasOutsideY(),
        AND(OR(NOT(wasOutsideX()), GE(penY(), penX())), OR(NOT(wasOutsideZ()), GE(penY(), penZ()))));
    var flipZcond = AND(wasOutsideZ(),
        AND(OR(NOT(wasOutsideX()), GE(penZ(), penX())), OR(NOT(wasOutsideY()), GE(penZ(), penY()))));
    return [
        { set: HF + '.vx', to: Cond(flipXcond, Bin('-', Lit(0), Ref(HF, 'vx')), Ref(HF, 'vx')) },
        { set: HF + '.vy', to: Cond(flipYcond, Bin('-', Lit(0), Ref(HF, 'vy')), Ref(HF, 'vy')) },
        { set: HF + '.vz', to: Cond(flipZcond, Bin('-', Lit(0), Ref(HF, 'vz')), Ref(HF, 'vz')) }
    ];
}

/**
 * R1 — ARBITRARY-ANGLE mirror reflection (CEO UX-pass ruling, theorist P3b PROVEN
 * EXACT). A mirror is a REFLECTION of the velocity about a mirror LINE at angle α
 * (the mirror SURFACE angle from horizontal, = the wall's `orientationDeg`):
 *
 *     R(α) = [ cos2α   sin2α ]      reflected(+x) = (cos2α, sin2α)
 *            [ sin2α  −cos2α ]      ⇒ slope = tan(2α)  (standard optics: a mirror
 *                                     surface at α deflects the beam by 2α).
 *
 * This is incidence-INDEPENDENT (a fixed linear map — physically correct for a
 * genuine tilted mirror plane, so NO Cond-tree on the velocity part). Trig is legal
 * HOST-side at compile time (the SAME pattern the constrained-cone endpoints already
 * bake). Two-op sequential form (op2 reads the NEW vx written by op1, exploiting the
 * write-propagation into the scope bag — theorist v2 P3):
 *   op1: vx' = c2·vx + s2·vy                (reads both OLD values)
 *   op2: vy' = (s2/c2)·vx' − (1/c2)·vy_old  ≡ s2·vx_old − c2·vy_old   (exact)
 * Requires c2 = cos2α ≠ 0 (the α ≡ 45° mod 90° singularity routes to the exact swap
 * builder below). @returns {Array<object>} [vxOp, vyOp]
 */
function _buildAngledReflectOps(HF, alphaDeg, Lit, Ref, Bin) {
    var a  = alphaDeg * Math.PI / 180;
    var c2 = Math.cos(2 * a), s2 = Math.sin(2 * a);
    return [
        { set: HF + '.vx', to: Bin('+', Bin('*', Lit(c2), Ref(HF, 'vx')),
                                        Bin('*', Lit(s2), Ref(HF, 'vy'))) },
        { set: HF + '.vy', to: Bin('-', Bin('*', Lit(s2 / c2), Ref(HF, 'vx')),
                                        Bin('*', Lit(1 / c2), Ref(HF, 'vy'))) }
    ];
}

/**
 * R1 — the α ≡ 45° mod 90° diagonal mirror, EXACT (theorist P1/P2 PROVEN). At these
 * orientations cos2α = 0, so R(α) = [0, s2; s2, 0] with s2 = ±1 — the 2-op form above
 * divides by zero. The exact realization is the 3-op add/subtract SWAP (a naive
 * `vx=vy; vy=vx` is WRONG — the second op reads the already-overwritten vx; theorist
 * v2 P3), then a negate for the s2 = −1 branch:
 *   α ≡ 45° mod 180° (s2=+1): pure swap        vx' = vy,  vy' = vx      (+x → +y)
 *   α ≡ 135° mod 180° (s2=−1): swap + negate    vx' = −vy, vy' = −vx     (+x → −y)
 * @returns {Array<object>} [.. 3 swap ops (+2 negate ops when s2<0) ..]
 */
function _buildSwapReflectOps(HF, alphaDeg, Lit, Ref, Bin) {
    var s2 = Math.round(Math.sin(2 * alphaDeg * Math.PI / 180)); // +1 or −1
    var ops = [
        { set: HF + '.vx', to: Bin('+', Ref(HF, 'vx'), Ref(HF, 'vy')) },  // vx ← vx+vy
        { set: HF + '.vy', to: Bin('-', Ref(HF, 'vx'), Ref(HF, 'vy')) },  // vy ← (vx+vy)−vy = old vx
        { set: HF + '.vx', to: Bin('-', Ref(HF, 'vx'), Ref(HF, 'vy')) }   // vx ← (vx+vy)−old vx = old vy
    ];
    if (s2 < 0) {
        ops.push({ set: HF + '.vx', to: Bin('-', Lit(0), Ref(HF, 'vx')) });
        ops.push({ set: HF + '.vy', to: Bin('-', Lit(0), Ref(HF, 'vy')) });
    }
    return ops;
}

/**
 * R1/Z1 — build the ORIENTATION-AWARE reflection ops for a mirror at `orientationDeg`.
 * The ONE dispatch authority (compileWallV2's reflect branch calls this):
 *   • orientation ≡ 0 mod 90 (0/90/180/270) → the proven axis-aligned incidence-flip
 *     tree (a BOX reflector handling BOTH faces). Orientation 0 is BYTE-IDENTICAL to
 *     the pre-rotation program (SU1) — the incidence tree ignores orientation entirely.
 *     When `is3D` (a wall with a real z-slab), the 3-axis lift (`_buildIncidenceReflectOps3D`)
 *     handles the near/far faces too — 2D≡3D, the same law with a third axis (WASM-only,
 *     rides prev_z / C26).
 *   • orientation ≡ 45 mod 90 (45/135/225/315) → the exact swap / swap+negate ops.
 *   • any other α → the 2-op host-baked-trig fixed-plane reflection.
 *
 * 3D ORIENTATION SCOPE (CEO ruling — keep to what the advisory PROVED): a non-cardinal
 * `orientationDeg` is orientation about the Z-AXIS (rotation in the xy-plane) — the 2D
 * swap/angled law LIFTED to a slab, with vz passing straight through (the beam's z-component
 * is untouched). This is the proven, exact case. FULL 3D orientation (a SECOND tilt angle —
 * e.g. an (x,z)-plane periscope that swaps vx↔vz) is a FLAGGED FOLLOW-UP, not implemented
 * here (it needs a second angle param + the (x,z)/(y,z) swap patterns; no math is invented).
 * @returns {Array<object>}
 */
function _buildReflectOps(orientationDeg, HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn, is3D) {
    var o = (typeof orientationDeg === 'number' && isFinite(orientationDeg)) ? orientationDeg : 0;
    var onorm = ((o % 360) + 360) % 360;
    var EPS = 1e-9;
    var mod90 = onorm % 90;
    // DRY — the cardinal gate AND the drawn-face reflection base come from the ONE
    // SlabFace authority (circulation §1). SlabFace normalizes orientationDeg the SAME way
    // (`((o%360)+360)%360`) and returns reflectBaseDeg = (90 + onorm) % 360, so this repoint
    // is BYTE-IDENTICAL to the previous inline `alphaScreen = (90 + onorm) % 360` + the
    // inline cardinal check. (w/h are not passed here — the reflection base does not depend
    // on slab aspect; the OBB region is built separately from SlabFace in Wall.compileWallV2.)
    var slab = _getSlabFace().resolveSlabFace({ orientationDeg: onorm });
    if (slab.isCardinal) {
        // 0/90/180/270 → axis-aligned box: the proven incidence tree (byte-identical at 0).
        // A 3D wall reflects off all six faces (the z-axis lift); a 2D wall stays 2-axis.
        // ORIENTATION-INDEPENDENT → the drawn-face base below does NOT touch this case
        // (bench + cardinal-reflect byte-identity preserved).
        return is3D
            ? _buildIncidenceReflectOps3D(HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn)
            : _buildIncidenceReflectOps(HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn);
    }
    // DRAWN-FACE REFLECTION (CEO 2026-07-25, Living Log 3d510a0a — supersedes the FIX-3
    // screenα=−orientationDeg guess). The mirror's reflecting surface is the LONG face of the
    // slab the renderer actually draws. The Wall mirror is a TALL slab (h > w): its long face
    // is VERTICAL at orientation 0, so a +x beam bounces straight back (−x) — EXACTLY what the
    // cardinal incidence tree already does at orientation 0. p5 draws that slab rotated by
    // +orientationDeg (rect(-w/2,-h/2,w,h) with h>w; local y-axis long face), so the drawn face
    // LINE sits at (90 + orientationDeg) in the engine's (y-DOWN) velocity coordinates. The
    // exact reflection about the drawn face is therefore R(90 + orientationDeg) — reflect about
    // the line the user SEES and calibrates against.
    //
    // Why the −orientationDeg guess was wrong (proven, scratchpad/reflect_matrix.cjs): 90+o and
    // −o are congruent mod 180 ONLY at o ≡ 45 (mod 90), so R(−o) coincided with the drawn face
    // at 45/135/225/315 (and, via the separate incidence tree, at cardinals) but reflected a +x
    // beam to the OPPOSITE horizontal side at every OTHER angle (30/37/60/120/150…). That off-
    // face deflection at non-45 tilt is the "reflection isn't correct all the time" the CEO saw
    // when ROTATING the mirror. This change is BYTE-IDENTICAL at cardinals (untouched incidence
    // tree) and at 45/135/225/315 (90+o ≡ −o mod 180 ⇒ same swap ops), and corrects every
    // arbitrary angle for the tall mirror. NOTE (flagged, not fixed here): a WIDE mirror slab
    // (w > h, e.g. 1D mirrorB) has a HORIZONTAL long face (base 0, not 90); an aspect-blind law
    // cannot honor both bases — a wide mirror at a non-45 angle needs the aspect passed in, or
    // the experiment retuned to a tall slab. See the deliverable's residual section.
    var alphaScreen = slab.reflectBaseDeg; // (90 + onorm) % 360 — from the ONE SlabFace authority.
    if (Math.abs(mod90 - 45) < EPS) {
        // 45/135/225/315 → exact swap (cos2α = 0 singularity of the 2-op form). For a 3D
        // wall this is z-axis orientation — an xy-plane swap; vz passes through unchanged.
        return _buildSwapReflectOps(HF, alphaScreen, Lit, Ref, Bin);
    }
    // arbitrary α → fixed tilted-plane reflection, exact velocity map (xy-plane; z-axis
    // orientation for a 3D wall — vz untouched).
    return _buildAngledReflectOps(HF, alphaScreen, Lit, Ref, Bin);
}

/**
 * R1-GUARD — the ONE-SIDED FACE-CROSSING GUARD for a TILTED reflect mirror (theorist
 * red-team §2, MEASURED single-reflection optics; CEO 2026-07-25 drawn-face ruling).
 *
 * ## Why this exists (the tilted-reflect LEAK-THROUGH the AABB trigger caused)
 *
 * The cardinal incidence tree (`_buildIncidenceReflectOps`) is GUARDED by a `wasOutside`
 * prev-coord Cond, so it flips a leaf's velocity exactly ONCE per AABB entry. The tilted
 * swap/angled maps (`_buildSwapReflectOps`/`_buildAngledReflectOps`) had NO such guard: the
 * program trigger was plain AABB `intersects`, so the fixed-plane reflection — an INVOLUTION
 * R(α)∘R(α)=identity — re-fired on EVERY overlap tick. The velocity OSCILLATED while the leaf
 * sat in the padded collision zone; when its corner crossed the wall midline the `'closest'`
 * eject flipped to the FAR face and pushed it THROUGH. The leak scaled with leaf size (bench
 * Dim 2/3) and worsened at 135° / thin slabs (isolation report: 78/3600 at Dim 2, 135°).
 *
 * ## The guard (fires the reflect ONCE per genuine SURFACE crossing)
 *
 * The mirror's reflecting surfaces are the two long FACES of the drawn slab — the lines at
 * signed normal distance ±hw (half the slab thickness) from the LO center `C=(cx,cy)` along
 * the unit face normal `n`, BOTH taken VERBATIM from the ONE SlabFace authority
 * (`resolveSlabFace(...).obb.normal` / `.obb.hw` — the SAME geometry the reflect law + the
 * engine OBB region share; NEVER a second inline cos/sin). The signed side value is
 *
 *     s(P) = n · (P − C)          // signed normal distance from the slab mid-line
 *
 * The program fires iff (AABB broad-phase) AND the leaf crossed a SURFACE this tick while
 * APPROACHING it:
 *     front:  s(prev) < −hw  AND  s(now) > −hw  AND  v·n > 0
 *     back :  s(prev) > +hw  AND  s(now) < +hw  AND  v·n < 0
 * Firing at the SURFACE (not the mid-line) means a beam reflects the moment it touches the
 * face the user SEES — and, fused with the same-tick face-normal exit eject below, a
 * reflected leaf is placed back OUTSIDE the slab in the SAME tick, so no post-tick snapshot
 * ever renders a reflected particle INSIDE the slab (CEO visual ruling, 2026-07-25: reflect
 * must reposition outside the collided edge in the same tick — particles seen rendering
 * inside the LO then walking through were the bug). The approach term (v·n sign) is what
 * kills the rattle the theorist MEASURED for a naive two-sided crossing test: after the
 * reflection v·n flips and the eject holds the leaf outside its incident surface, so neither
 * jitter re-crossings nor the reflected step satisfy the guard again. Handling BOTH surfaces
 * makes the wall a scene-agnostic two-faced mirror (a generic Wall never knows the beam's
 * approach side); a ±2-stacked jump that clears BOTH surfaces in one tick still satisfies
 * the entry condition (s(now) is past −hw when it is past +hw too) and is caught. n and hw
 * are pure functions of the wall spec, so a live re-aim re-bakes this via the setV2Prop
 * recompile. Zero RNG draws.
 *
 * ## Z-FACES extension (3D tilted slab — opt-in, `withZFaces`)
 *
 * A 3D tilted slab (z-axis orientationDeg = rotation in the xy-plane; the z-slab is
 * UNROTATED) has two more reflecting surfaces: its near/far z-faces — axis-aligned planes
 * at `self.near`/`self.far`, exactly the planes the cardinal incidence-3D tree already
 * bounces (C27). The xy-only guard let a leaf entering THROUGH a z-face (xy already inside
 * the slab footprint, so no xy surface crossing ever happens) march straight through the
 * mirror with zero response — measured pkg-node: 135°/Dim-2 z-entry beam, velocity never
 * changed, 140 in-slab render snapshots, maxZ 198 past a far face at 60 (the 3D leak class).
 * With `withZFaces` the trigger ALSO fires on a genuine z-PLANE crossing while approaching:
 *     zFront: prev_z < near AND z >= near AND vz > 0
 *     zBack : prev_z > far  AND z <= far  AND vz < 0
 * (center-coord form, the exact z-lift of front/back above; `near`/`far` are the LIVE
 * engine-recentered slab z-band — the broad-phase superset rect widens only x/y, so these
 * self refs stay the TRUE z-faces). The NOW side is INCLUSIVE (>= via the canonical
 * NOT(<) Cond encoding) because z steps are INTEGER pixels and the z-faces sit on integer
 * planes — a 1px step lands EXACTLY ON the plane (prev=near−1 → now=near), so a strict
 * two-sided test never sees the crossing (measured: the z-entry beam marched through with
 * the strict form). Inclusive-now still fires exactly once: the next tick's prev is ON the
 * plane, failing the strict prev-side test. Omitted/falsy ⇒ byte-identical 2D trigger (SU1).
 * `withZFaces` ALSO relaxes the xy approach terms to inclusive (v·n >= 0 / <= 0) so a
 * zero-xy-momentum leaf wander-crossing the drawn surface is positionally excluded (see
 * the inline comment at the approach terms — no rattle risk, 2D byte-identical).
 *
 * @param {{x:number,y:number}} n  unit DRAWN-face normal (SlabFace obb.normal — baked Lit).
 * @param {number} hw  TRUE slab half-thickness (SlabFace obb.hw); 0 when the slab width is
 *   unknown (degenerates to the mid-line crossing form — still leak-free, weaker visually).
 * @param {boolean} [withZFaces] opt-in z-face crossing branches (3D tilted slab). Default
 *   omitted → byte-identical 2D trigger.
 * @returns {ExprAST} the guarded program trigger.
 */
function _buildTiltedReflectGuardTrigger(n, hw, HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn, withZFaces) {
    function AND(x, y) { return Cond(x, y, Lit(0)); }
    function OR(x, y)  { return Cond(x, Lit(1), y); }
    // s(P) = n·(P − C) for (xProp,yProp) ∈ {(prev_x,prev_y),(x,y)} — C = LO center (cx,cy).
    function S(xp, yp) {
        return Bin('+', Bin('*', Lit(n.x), Bin('-', Ref(HF, xp), Ref(HS, 'cx'))),
                        Bin('*', Lit(n.y), Bin('-', Ref(HF, yp), Ref(HS, 'cy'))));
    }
    var vDotN = Bin('+', Bin('*', Lit(n.x), Ref(HF, 'vx')), Bin('*', Lit(n.y), Ref(HF, 'vy')));
    // Approach terms. 2D: strict (v·n > 0 / < 0) — byte-identical. 3D (`withZFaces`): the
    // INCLUSIVE forms (>= / <= via the canonical NOT-encodings) so a ZERO-xy-momentum leaf
    // (a pure-z beam inside the z-band whose TRANSVERSE WAVE wanders its center across the
    // drawn surface — the wave moves the leaf with v·n exactly 0) still fires: the eject
    // holds it outside the slab body (positional exclusion — what a solid does) while the
    // reflect law maps its (0,0) xy velocity to (0,0), a no-op. No rattle risk: there is no
    // xy velocity to oscillate, and leaves WITH momentum keep the exact 2D semantics (the
    // inclusive form only admits v·n == 0). Measured: without this, ~half a pure-z beam's
    // leaves were swept-culled at their z-plane crossing tick (center outside ±hw for one
    // tick), then wander-entered the slab body and rendered inside it.
    var frontApproach = withZFaces
        ? Cond(Cmp('<', vDotN, Lit(0)), Lit(0), Lit(1))   // v·n >= 0
        : Cmp('>', vDotN, Lit(0));
    var backApproach = withZFaces
        ? Cond(Cmp('>', vDotN, Lit(0)), Lit(0), Lit(1))   // v·n <= 0
        : Cmp('<', vDotN, Lit(0));
    var frontCross = AND(Cmp('<', S('prev_x', 'prev_y'), Lit(-hw)),
                     AND(Cmp('>', S('x', 'y'), Lit(-hw)),
                         frontApproach));
    var backCross  = AND(Cmp('>', S('prev_x', 'prev_y'), Lit(hw)),
                     AND(Cmp('<', S('x', 'y'), Lit(hw)),
                         backApproach));
    var crossExpr = OR(frontCross, backCross);
    if (withZFaces) {
        // GE/LE via the canonical NOT-encodings (closed vocab has no '<='/'>='):
        // inclusive NOW side — integer z steps land exactly ON the integer z-plane.
        function GE(a, b) { return Cond(Cmp('<', a, b), Lit(0), Lit(1)); }
        function LE(a, b) { return Cond(Cmp('>', a, b), Lit(0), Lit(1)); }
        var zFront = AND(Cmp('<', Ref(HF, 'prev_z'), Ref(HS, 'near')),
                     AND(GE(Ref(HF, 'z'), Ref(HS, 'near')),
                         Cmp('>', Ref(HF, 'vz'), Lit(0))));
        var zBack  = AND(Cmp('>', Ref(HF, 'prev_z'), Ref(HS, 'far')),
                     AND(LE(Ref(HF, 'z'), Ref(HS, 'far')),
                         Cmp('<', Ref(HF, 'vz'), Lit(0))));
        crossExpr = OR(crossExpr, OR(zFront, zBack));
    }
    return Cond(Fn('intersects', [Lit(HF), Lit(HS)]),
             crossExpr,
             Lit(0));
}

/**
 * R1-GUARD eject — the PREV-ANCHORED FACE-NORMAL EXIT (the ONE eject story for a tilted
 * reflect; CEO same-tick-exteriority ruling, 2026-07-25). Places the leaf's WHOLE BODY just
 * outside the slab on its INCIDENT side, in the SAME tick as the velocity flip:
 *
 *     P' = P_prev + (T − s(P_prev)) · n,     T = −sign(v·n) · (hw + w/2 + 1)
 *
 * i.e. anchor at the pre-move position (already on the incident side of the surface — the
 * guard requires it) and push along the face normal to clearance |s| = hw + w/2 + 1: half
 * slab thickness + half leaf width + 1px. The incident side is −sign(v·n) because the eject
 * ops run BEFORE the reflect ops, while v is still the INCOMING velocity. This supersedes
 * BOTH earlier stories: the plain prev-restore (theorist §2) only guaranteed the leaf was on
 * the incident side of the MID-LINE — a restored leaf could still sit up to hw INSIDE the
 * slab body and render there while walking out (the CEO saw exactly that); and the AABB
 * 'closest' eject scattered or far-face-ejected (the original leak). Exit clearance holds for
 * the swap (45/135) AND arbitrary-angle paths identically — the ops are angle-generic data.
 *
 * ## Why there is NO op cross-coupling (no scratch register, no division)
 *
 * Both ops read ONLY `prev_x`/`prev_y`/`vx`/`vy` — refs that NEITHER op writes (and the
 * reflect ops, which run after, touch only vx/vy). So op1 (set x) and op2 (set y) evaluate
 * the IDENTICAL displacement Δ = T − s(P_prev) and land exactly at P_prev + Δ·n; s(P') = T
 * by construction. Compare the withdrawn OBB-normal eject (ae55c414), which computed s from
 * the CURRENT x/y and needed a vz-scratch to survive its own eviction of x — a trick that
 * breaks on a 3D wall where vz is real momentum. prev-anchoring dissolves the problem.
 * WASM-only (prev_* scope family), like the cardinal incidence tree. z passes straight
 * through (rotation is xy-plane; exteriority in xy IS exteriority of the z-extruded slab).
 *
 * ## `anchorPrevSide` (3D tilted variant — opt-in)
 *
 * The incident-side sign has two equivalent derivations WHEN the xy guard branch fired:
 * −sign(v·n) (v incoming — the 2D form) ≡ sign(s(P_prev)) (the side the leaf came from —
 * the guard requires |s(prev)| > hw). The 3D program gates its ops per-op on PREV-ONLY
 * class flags (see `_tilted3DGates`), and in the rare corner where the trigger fired via a
 * z-face crossing while prev was ALSO outside an xy surface, v·n's sign is not tied to the
 * xy incident side — so the 3D variant anchors the side on sign(s(P_prev)) instead:
 * prev-only, always the genuine incident side, byte-identical displacement whenever the xy
 * guard branch fired. Omitted/falsy ⇒ the 2D −sign(v·n) form, byte-identical (SU1).
 *
 * @param {{x:number,y:number}} n  unit face normal (SlabFace obb.normal — baked Lit).
 * @param {number} hw  TRUE slab half-thickness (SlabFace obb.hw; 0 fallback → exits to
 *   1 + w/2 past the mid-line — still outside the reflecting line by a full margin).
 * @param {boolean} [anchorPrevSide] opt-in prev-side incident anchor (3D tilted variant).
 * @returns {Array<object>} [setXOp, setYOp]
 */
function _buildFaceExitEjectOps(n, hw, HF, HS, Lit, Ref, Bin, Cmp, Cond, anchorPrevSide) {
    function S(xp, yp) {
        return Bin('+', Bin('*', Lit(n.x), Bin('-', Ref(HF, xp), Ref(HS, 'cx'))),
                        Bin('*', Lit(n.y), Bin('-', Ref(HF, yp), Ref(HS, 'cy'))));
    }
    var vDotN = Bin('+', Bin('*', Lit(n.x), Ref(HF, 'vx')), Bin('*', Lit(n.y), Ref(HF, 'vy')));
    // T = ±(hw + w/2 + 1): the clearance on the INCIDENT side. Side sign: −sign(v·n) (2D
    // form, v is incoming here) or sign(s(P_prev)) (prev-anchored 3D form — see docstring).
    var clearance = Bin('+', Lit(hw + 1), Bin('*', Ref(HF, 'w'), Lit(0.5)));
    var side = anchorPrevSide
        ? Cond(Cmp('<', S('prev_x', 'prev_y'), Lit(0)), Lit(-1), Lit(1))
        : Cond(Cmp('<', vDotN, Lit(0)), Lit(1), Lit(-1));
    var T = Bin('*', side, clearance);
    // Δ = T − s(P_prev): identical in both ops (prev refs are never written by any op).
    function delta() { return Bin('-', T, S('prev_x', 'prev_y')); }
    return [
        { set: HF + '.x', to: Bin('+', Ref(HF, 'prev_x'), Bin('*', delta(), Lit(n.x))) },
        { set: HF + '.y', to: Bin('+', Ref(HF, 'prev_y'), Bin('*', delta(), Lit(n.y))) }
    ];
}

/**
 * R1-3D — PREV-ONLY response-class gates for the 3D tilted-reflect program (the z-face
 * completion of the guarded tilted reflect; measured 3D z-entry leak class, 2026-07-25).
 *
 * ## Why per-op gating is SAFE here (vs a program-wide trigger)
 *
 * The retired G2b per-op Cond wrapping broke because its gate re-read values the program's
 * OWN ops mutate (the eject moved x/y, so the gate re-evaluated false mid-program — the
 * bounce-skip bug). These gates are immune BY CONSTRUCTION: they read ONLY `prev_x/prev_y/
 * prev_z` (never written by any op) and `self.cx/cy/near/far` (LO geometry, never written
 * by a frame op) — so every op in the sequence evaluates the IDENTICAL gate value no matter
 * what earlier ops wrote. This is the same no-cross-coupling discipline the prev-anchored
 * eject already uses.
 *
 * ## The two classes (a tilted 3D slab has TWO kinds of reflecting surface)
 *
 *   xprev()  — prev was outside an xy DRAWN surface (|s(prev)| > hw): the xy face response
 *              runs (face-exit eject + the 2θ reflect law); z passes through.
 *   zclass() — NOT xprev AND prev was outside the z-band (prev_z beyond near/far): the
 *              z-face response runs (z exit eject + vz flip — the SAME near/far bounce the
 *              cardinal incidence-3D tree gives an axis-aligned slab, C27); xy passes
 *              through. Given the guard trigger fired, `zclass` ⟺ the z-branch fired
 *              (an xy branch requires |s(prev)| > hw = xprev). xy has priority on the
 *              corner case (prev outside BOTH — mirror-face-dominant, the drawn face wins).
 *
 * Layer 2 — physics: ZERO new physics (SU1) — this is op-program DATA selecting which of
 * the two proven bounce laws (2θ drawn-face / z-plane flip) answers a given crossing.
 * @returns {{xprev:Function, zclass:Function}} fresh-AST gate factories.
 */
function _tilted3DGates(n, hw, HF, HS, Lit, Ref, Bin, Cmp, Cond) {
    function S_prev() {
        return Bin('+', Bin('*', Lit(n.x), Bin('-', Ref(HF, 'prev_x'), Ref(HS, 'cx'))),
                        Bin('*', Lit(n.y), Bin('-', Ref(HF, 'prev_y'), Ref(HS, 'cy'))));
    }
    function xprev() { // |s(prev)| > hw  (OR via Cond)
        return Cond(Cmp('<', S_prev(), Lit(-hw)), Lit(1), Cmp('>', S_prev(), Lit(hw)));
    }
    function zOutPrev() {
        return Cond(Cmp('<', Ref(HF, 'prev_z'), Ref(HS, 'near')), Lit(1),
                    Cmp('>', Ref(HF, 'prev_z'), Ref(HS, 'far')));
    }
    function zclass() { // NOT xprev AND zOutPrev
        return Cond(xprev(), Lit(0), zOutPrev());
    }
    return { xprev: xprev, zclass: zclass };
}

/**
 * R1-3D — the z-face EXIT eject for a 3D tilted slab: place the leaf's whole body just
 * outside the z-face it entered through, in the SAME tick as the vz flip (the CEO
 * same-tick-exteriority ruling, z-lifted):
 *     z' = cz + sign(prev_z − cz) · (hz + w/2 + 1)
 * with cz/hz derived LIVE from `self.near`/`self.far` (the engine-recentered z-band —
 * the broad-phase superset rect widens only x/y, so near/far are the TRUE z-faces) and
 * w/2 the frame's z half-extent (cube convention, same as closest3d). prev-anchored side
 * (prev_z is on the incident side by the guard's z branch), no scratch, no division.
 * @returns {object} the single set-z op (ungated — caller gates on `zclass`).
 */
function _buildZFaceExitEjectOp(HF, HS, Lit, Ref, Bin, Cmp, Cond) {
    function cz() { return Bin('*', Bin('+', Ref(HS, 'near'), Ref(HS, 'far')), Lit(0.5)); }
    function hz() { return Bin('*', Bin('-', Ref(HS, 'far'), Ref(HS, 'near')), Lit(0.5)); }
    var clearance = Bin('+', Bin('+', hz(), Bin('*', Ref(HF, 'w'), Lit(0.5))), Lit(1));
    var side = Cond(Cmp('<', Ref(HF, 'prev_z'), cz()), Lit(-1), Lit(1));
    return { set: HF + '.z', to: Bin('+', cz(), Bin('*', side, clearance)) };
}

/**
 * R1-3D — gate a list of ops on a prev-only class flag: each op's `to` becomes
 * Cond(gate, to, keep-current-value). Gate factories MUST read only never-op-written refs
 * (see `_tilted3DGates` — the G2b immunity argument). Only used for simple scalar props
 * (x/y/z/vx/vy/vz — `op.set` is HF + '.<prop>').
 * @returns {Array<object>} the gated ops (fresh objects; inputs not mutated).
 */
function _gateOps(ops, gateFactory, HF, Ref, Cond) {
    return ops.map(function (op) {
        var prop = op.set.slice((HF + '.').length);
        return { set: op.set, to: Cond(gateFactory(), op.to, Ref(HF, prop)) };
    });
}

// ── PITCHED (two-axis) mirror builders — CEO ruling 2026-07-26 (Living Log ce4fb0c9) ──
//
// A PITCHED plate (pitchDeg ≠ 0 about its own long axis) reflects by the TRUE 3-space law
// R = I − 2nnᵀ about the plate normal n (SlabFace plate3.n — the ONE authority). This
// supersedes the vz-passes-through z-axis contract FOR PITCHED PLATES ONLY: pitch 0 keeps
// every existing program byte-identical (the pitched branch is opt-in). A pitched plate has
// NO engine ObbRegion (z-theta-only contract): the broad phase is the plate's 3D AABB rect
// and the guard trigger below IS the narrow phase (face-plane crossing + extent).

/**
 * R2AX — the 3-space reflection ops about unit normal n: v' = v − 2(v·n)n, host-baked.
 *
 * ## Sequential-write realization (no scratch, no runtime division)
 * Each op writes ONE velocity component, so later ops see earlier writes. Let D = n·v_old.
 * After writing component a: n·v_now = D(1−2na²) ⇒ D = k1·(n·v_now), k1 = 1/(1−2na²)
 * (k1 HOST-baked — the same baked-reciprocal pattern as `_buildAngledReflectOps`). After b:
 * D = k2·(n·v_now), k2 = 1/(1−2na²−2nb²) = −1/(1−2nc²). So:
 *   op-a: va' = va − 2na·(n·v)
 *   op-b: vb' = vb − (2nb·k1)·(n·v)     — n·v read AFTER op-a
 *   op-c: vc' = vc − (2nc·k2)·(n·v)     — n·v read AFTER op-a,b
 * Pivot order (a,b,c) is chosen HOST-side: a = the smallest-|n| component (na² ≤ 1/3 < 1/2
 * always), c = the remaining component with c² farthest from 1/2 — valid unless TWO
 * components have square exactly 1/2 (⇒ the third is 0): the DIAGONAL class, realized
 * exactly by the proven add/sub SWAP pattern instead (v_p' = −σpσq·v_q, v_q' = −σpσq·v_p,
 * σ = component signs). Zero RNG; exact f64; deterministic across engines (same op order).
 *
 * Layer 2 — physics: standard mirror optics in 3-space — the velocity component along the
 * plate normal inverts, the tangential components are untouched. At pitch 0 this equals the
 * 2D law with vz through (not used there — routing keeps pitch-0 byte-identical).
 * @param {{x:number,y:number,z:number}} n unit plate normal (SlabFace plate3.n).
 * @returns {Array<object>} 3 ops (generic) or 3-5 ops (diagonal swap class).
 */
function _buildPitchedReflectOps(n, HF, Lit, Ref, Bin) {
    var comps = [{ k: 'vx', c: n.x }, { k: 'vy', c: n.y }, { k: 'vz', c: n.z }];
    var EPS = 1e-9;
    var halfIdx = [];
    for (var i = 0; i < 3; i++) { if (Math.abs(comps[i].c * comps[i].c - 0.5) < EPS) { halfIdx.push(i); } }
    function nDotV() {
        return Bin('+', Bin('+', Bin('*', Lit(n.x), Ref(HF, 'vx')), Bin('*', Lit(n.y), Ref(HF, 'vy'))),
                        Bin('*', Lit(n.z), Ref(HF, 'vz')));
    }
    if (halfIdx.length === 2) {
        // DIAGONAL class: n = (±√½, ±√½) on axes p,q; third 0. Exact swap (+negate when
        // σpσq > 0) via the proven 3-op add/sub pattern (never `p=q; q=p`).
        var pk = comps[halfIdx[0]].k, qk = comps[halfIdx[1]].k;
        var s = Math.sign(comps[halfIdx[0]].c) * Math.sign(comps[halfIdx[1]].c);
        var ops = [
            { set: HF + '.' + pk, to: Bin('+', Ref(HF, pk), Ref(HF, qk)) },
            { set: HF + '.' + qk, to: Bin('-', Ref(HF, pk), Ref(HF, qk)) },
            { set: HF + '.' + pk, to: Bin('-', Ref(HF, pk), Ref(HF, qk)) }
        ];
        if (s > 0) {
            ops.push({ set: HF + '.' + pk, to: Bin('-', Lit(0), Ref(HF, pk)) });
            ops.push({ set: HF + '.' + qk, to: Bin('-', Lit(0), Ref(HF, qk)) });
        }
        return ops;
    }
    // Generic elimination order: a = min |n_c|; c = remaining with |c²−1/2| max; b = other.
    var order = [0, 1, 2].sort(function (x, y) { return Math.abs(comps[x].c) - Math.abs(comps[y].c); });
    var aI = order[0];
    var rest = [order[1], order[2]].sort(function (x, y) {
        return Math.abs(comps[y].c * comps[y].c - 0.5) - Math.abs(comps[x].c * comps[x].c - 0.5);
    });
    var cI = rest[0], bI = rest[1];
    var na = comps[aI].c, nb = comps[bI].c, nc = comps[cI].c;
    var k1 = 1 / (1 - 2 * na * na);
    var k2 = 1 / (1 - 2 * na * na - 2 * nb * nb);
    return [
        { set: HF + '.' + comps[aI].k, to: Bin('-', Ref(HF, comps[aI].k), Bin('*', Lit(2 * na), nDotV())) },
        { set: HF + '.' + comps[bI].k, to: Bin('-', Ref(HF, comps[bI].k), Bin('*', Lit(2 * nb * k1), nDotV())) },
        { set: HF + '.' + comps[cI].k, to: Bin('-', Ref(HF, comps[cI].k), Bin('*', Lit(2 * nc * k2), nDotV())) }
    ];
}

/**
 * R2AX — the 3-space one-sided guard trigger for a PITCHED plate: the n-dot form of the
 * measured 2D cure, with the plate EXTENT as the narrow phase (a pitched plate has no
 * engine region — the AABB broad phase is a superset; this trigger culls it to the plate).
 *   s(P) = n·(P − C),  C = (self.cx, self.cy, (self.near+self.far)/2)
 *   front: s(prev) < −hw AND s(now) >= −hw AND v·n >= 0
 *   back : s(prev) >  hw AND s(now) <=  hw AND v·n <= 0
 *   extent(now): |u·(P−C)| < hh  AND  |v·(P−C)| < hz
 * Inclusive now-side + inclusive approach per the 3D lattice/zero-momentum findings (the
 * pitch=±90 face is z-lattice-aligned; a zero-normal-momentum wander-cross is positionally
 * excluded). All refs are prev_*, self props, and current pos — the trigger evaluates ONCE
 * before any op runs, so current-pos reads are safe here.
 * @returns {ExprAST}
 */
function _buildPitchedGuardTrigger(plate, HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn) {
    var n = plate.n, u = plate.u, v = plate.v;
    var hw = plate.hw, hh = plate.hh, hz = plate.hz;
    function AND(x, y) { return Cond(x, y, Lit(0)); }
    function OR(x, y)  { return Cond(x, Lit(1), y); }
    function GE(a, b)  { return Cond(Cmp('<', a, b), Lit(0), Lit(1)); }
    function LE(a, b)  { return Cond(Cmp('>', a, b), Lit(0), Lit(1)); }
    function Abs(e)    { return Fn('max', [e, Bin('-', Lit(0), e)]); }
    function CZ() { return Bin('*', Bin('+', Ref(HS, 'near'), Ref(HS, 'far')), Lit(0.5)); }
    function DOT(a, xp, yp, zp) {
        return Bin('+', Bin('+',
            Bin('*', Lit(a.x), Bin('-', Ref(HF, xp), Ref(HS, 'cx'))),
            Bin('*', Lit(a.y), Bin('-', Ref(HF, yp), Ref(HS, 'cy')))),
            Bin('*', Lit(a.z), Bin('-', Ref(HF, zp), CZ())));
    }
    var vDotN = Bin('+', Bin('+', Bin('*', Lit(n.x), Ref(HF, 'vx')), Bin('*', Lit(n.y), Ref(HF, 'vy'))),
                     Bin('*', Lit(n.z), Ref(HF, 'vz')));
    var front = AND(Cmp('<', DOT(n, 'prev_x', 'prev_y', 'prev_z'), Lit(-hw)),
                AND(GE(DOT(n, 'x', 'y', 'z'), Lit(-hw)),
                    GE(vDotN, Lit(0))));
    var back  = AND(Cmp('>', DOT(n, 'prev_x', 'prev_y', 'prev_z'), Lit(hw)),
                AND(LE(DOT(n, 'x', 'y', 'z'), Lit(hw)),
                    LE(vDotN, Lit(0))));
    var extent = AND(Cmp('<', Abs(DOT(u, 'x', 'y', 'z')), Lit(hh)),
                     Cmp('<', Abs(DOT(v, 'x', 'y', 'z')), Lit(hz)));
    return Cond(Fn('intersects', [Lit(HF), Lit(HS)]),
             AND(extent, OR(front, back)),
             Lit(0));
}

/**
 * R2AX — the prev-anchored 3-space face exit for a PITCHED plate (same-tick exteriority):
 *   P' = P_prev + (T − s(P_prev))·n,   T = sign(s(P_prev))·(hw + w/2 + 1)
 * The exact n-dot lift of `_buildFaceExitEjectOps` with the prev-side anchor. All three ops
 * read ONLY prev_* refs, self props, and w — refs no op writes — so they compute the same displacement
 * (no scratch, no division; the established discipline). Ungated: the pitched program has
 * ONE response class (the plate normal IS the reflection axis — no separate z-face).
 * @returns {Array<object>} [setXOp, setYOp, setZOp]
 */
function _buildPitchedExitEjectOps(plate, HF, HS, Lit, Ref, Bin, Cmp, Cond) {
    var n = plate.n, hw = plate.hw;
    function CZ() { return Bin('*', Bin('+', Ref(HS, 'near'), Ref(HS, 'far')), Lit(0.5)); }
    function SPrev() {
        return Bin('+', Bin('+',
            Bin('*', Lit(n.x), Bin('-', Ref(HF, 'prev_x'), Ref(HS, 'cx'))),
            Bin('*', Lit(n.y), Bin('-', Ref(HF, 'prev_y'), Ref(HS, 'cy')))),
            Bin('*', Lit(n.z), Bin('-', Ref(HF, 'prev_z'), CZ())));
    }
    var clearance = Bin('+', Lit(hw + 1), Bin('*', Ref(HF, 'w'), Lit(0.5)));
    function T() { return Bin('*', Cond(Cmp('<', SPrev(), Lit(0)), Lit(-1), Lit(1)), clearance); }
    function delta() { return Bin('-', T(), SPrev()); }
    return [
        { set: HF + '.x', to: Bin('+', Ref(HF, 'prev_x'), Bin('*', delta(), Lit(n.x))) },
        { set: HF + '.y', to: Bin('+', Ref(HF, 'prev_y'), Bin('*', delta(), Lit(n.y))) },
        { set: HF + '.z', to: Bin('+', Ref(HF, 'prev_z'), Bin('*', delta(), Lit(n.z))) }
    ];
}

/**
 * B3 — omni direction-only Random (CEO round-2 (a)): redraw the exit direction
 * uniformly over the square, DIRECTION ONLY, NO decoherence. This is also the
 * round-1 half-plane fix (the legacy RANDOM_XY drew vx ∈ [0,1) = forward hemisphere).
 * Uniform-over-square (not angle-uniform — ops cannot loop ⇒ no in-tick rejection);
 * that is the pure-data reality (angle-uniform would need a host tick-fn). 2 RNG draws.
 * @returns {Array<object>} [vxOp, vyOp]
 */
function _buildOmniRandomOps(HF, Lit, Bin, Fn) {
    return [
        { set: HF + '.vx', to: Bin('-', Bin('*', Fn('random', []), Lit(2)), Lit(1)) },
        { set: HF + '.vy', to: Bin('-', Bin('*', Fn('random', []), Lit(2)), Lit(1)) }
    ];
}

/**
 * B3 — angle-CONSTRAINED Random (CEO round-2 (b)): redraw the exit direction over a
 * cone bounded by two endpoint direction vectors A=(ax,ay), B=(bx,by), computed
 * HOST-SIDE from the wall's INITIAL orientation + [minDeg,maxDeg] and BAKED as Lits
 * (immune to later spin by construction — a re-aim must recompile). Uses the theorist
 * single-draw scratch-prop trick (proven P3, 60/60 exact on the consistency law):
 * every Fn('random') is a fresh draw, so store ONE t in a scratch prop (frame.vx),
 * read it in BOTH lerps. op2 (vy) reads t BEFORE op3 (vx) overwrites it. 1 RNG draw.
 *   vy = ay + (by-ay)*t ;  vx = ax + (bx-ax)*t
 * Chord-lerp is t-uniform, not angle-uniform (bias grows with cone width — negligible
 * for narrow "laser" cones); constrain sugar to <180° (near-antipodal endpoints pass
 * near the zero vector). @returns {Array<object>} [storeT, vyOp, vxOp]
 */
function _buildConstrainedRandomOps(HF, ax, ay, bx, by, Lit, Ref, Bin, Fn) {
    return [
        // scratch: store t = random() in frame.vx (overwritten by op3 below).
        { set: HF + '.vx', to: Fn('random', []) },
        // vy = ay + (by-ay)*t   (reads t from vx BEFORE it is overwritten)
        { set: HF + '.vy', to: Bin('+', Lit(ay), Bin('*', Bin('-', Lit(by), Lit(ay)), Ref(HF, 'vx'))) },
        // vx = ax + (bx-ax)*t   (overwrites the scratch t with the real vx LAST)
        { set: HF + '.vx', to: Bin('+', Lit(ax), Bin('*', Bin('-', Lit(bx), Lit(ax)), Ref(HF, 'vx'))) }
    ];
}

/**
 * B3 — decoherence as an INDEPENDENT toggle (CEO round-2 (c)): the phase reset
 * (`local_time=0`, offset-decoherence) + charge redraw (sign-decoherence, bench Q1)
 * that the legacy RANDOM_XY bundled in — here SEPARABLE, stackable onto any behavior.
 * Proven separable (theorist P1/P2). 1 RNG draw (charge). @returns {Array<object>}
 */
function _buildDecoherenceOps(HF, Lit, Cmp, Cond, Fn) {
    return [
        { set: HF + '.local_time', to: Lit(0) },
        { set: HF + '.charge', to: Cond(Cmp('<', Fn('random', []), Lit(0.5)), Lit(0), Lit(1)) }
    ];
}

// ── ABSORB v2 tally — WITHDRAWN (theorist round-3, CEO 384ef5ee) ─────────────────
// The v1 `count`-as-virtual-mass tally op was the duplicative parallel LO-prop surface
// the CEO's mass-surface ruling rejected. ABSORB v2 now accumulates into the LO's REAL
// backing-frame mass via the existing frame accessors (the "LO extends Frame" composition;
// under MANDATORY BACKING the LO's backing frame is created at registration and READ via
// getLargeObjectFrameId) — see `absorbRadiation.js`. The compileWallV2 absorb branch
// emits ONLY the kill op (+collect_collided); the host tick-fn does the real-mass tally +
// radiation. No op-writable LO mass ledger anywhere.

// ── Main compiler ──────────────────────────────────────────────────────────────

/**
 * Compile a CollisionActions array (and optional collisionType) to an op-program
 * and a reduced actions list.
 *
 * G2: collisionType is now COMPILED, not informational. When non-NONE, velocity
 * ops are appended LAST to the ops array (after all action ops) to preserve the
 * global RNG draw order:
 *   - action ops (ABSORB, COUNT, MARK, BLOCK, BOUNCE) draw 0 RNG values each
 *   - RANDOM_X draws 1, RANDOM_Y draws 2, RANDOM_XY draws 3 (matching the
 *     native dispatch_collision_type draw order: velocity first, then reset() charge)
 *   - MOMENTUM_BASED and WALL draw 0 RNG values
 *
 * ## RNG discipline (from EGPTfrqtl.js native dispatch, MUST MATCH):
 *
 *   RANDOM_X:   1 draw  — vx = _rng()*2-1, vy = 1 (no charge draw)
 *   RANDOM_Y:   2 draws — vy = _rng()*2-1, then reset() draws _rng() for charge
 *   RANDOM_XY:  3 draws — vx = _rng(), vy = _rng()*2-1, then reset() draws _rng()
 *   MOMENTUM_BASED: 0 draws — restores pre-move position via prev_x/prev_y
 *   WALL:       0 draws — directional eject (same formulas as BLOCK)
 *   BOUNCE:     0 draws — handled by BOUNCE action above; collisionType=BOUNCE
 *                         is a no-op here (action already compiled)
 *   NONE:       0 draws — nothing emitted
 *
 * ## charge draw (reset(), EGPTfrqtl.js:2564)
 *   `_rng() < 0.5 ? Charge.POSITIVE : Charge.NEGATIVE`
 *   AST: Cond(Cmp('<', Fn('random',[]), Lit(0.5)), Lit(0), Lit(1))
 *   (0 = POSITIVE, 1 = NEGATIVE in both JS and Rust)
 *
 * ## Sugar migration (G2):
 *   Sugar objects (SlitScreen, Box, CircuitGate, LogicGate) pass their
 *   CollisionType to this function AND pass CollisionTypes.NONE to the LO spec,
 *   so the engine receives no native collision_type and all velocity comes from
 *   the compiled op-program.
 *
 * @param {string[]} actions      - CollisionActions array (SCREAMING_SNAKE).
 * @param {string}   loName       - LO name (used for MARK/DETECT detector_name and velocity-flip direction).
 * @param {string}   reposition   - Eject direction: 'left'|'right'|'top'|'bottom'|'closest'.
 * @param {string}   [collisionType] - G2: CollisionType to compile. When non-NONE, velocity
 *                                   ops are appended last. Pass CollisionTypes.NONE when
 *                                   collisionType is already handled by an action (e.g. BOUNCE).
 *
 * @returns {{ program: {on:'collision', ops:Array, trigger:Object}|null }}
 *   program — the compiled op-program to attach to the LO (null when nothing compiled).
 *
 * @throws on ANY action this compiler does not lower to an op. There is nowhere else for an
 *   action to go: the engine has no action dispatch and `LargeObjectJsSpec` has no `actions`
 *   field, so an uncompiled action is silently discarded at the wire. The error names the
 *   action and its V2 replacement.
 */
/**
 * FAIL LOUD for an action this compiler cannot lower to an op.
 *
 * There is no fallback path to leave it on: the engine has no action dispatch and the
 * registration spec has no `actions` field, so an uncompiled action is dropped silently at
 * the WASM boundary and the caller gets a wall that does nothing, with no error anywhere.
 *
 * @param {string} action - the offending action, as the caller spelled it.
 * @param {string} why    - the reason AND the replacement to reach for.
 */
function _uncompilable(action, why) {
    throw new Error('[actionCompiler] cannot compile CollisionAction ' +
        JSON.stringify(action) + ': ' + why + '. Nothing is left uncompiled — the engine has ' +
        'no action dispatch, so an op-program is the only way a behaviour can run.');
}

function compileActions(actions, loName, reposition, collisionType) {
    var ast = _getAstSchema();
    var Lit          = ast.Lit;
    var Ref          = ast.Ref;
    var Bin          = ast.Bin;
    var Cmp          = ast.Cmp;
    var Cond         = ast.Cond;
    var Fn           = ast.Fn;
    // NOTE: no local StrLit binding — every string write in this compiler is a TAG, and
    // the tag-op shape is owned by tagger.js (_getTagger().tagOps). Re-binding StrLit here
    // would invite a fourth hand-spelled `0.data.<key>` op.
    var HANDLE_FRAME = ast.HANDLE_FRAME; // 0
    var HANDLE_SELF  = ast.HANDLE_SELF;  // 1

    var ops = [];
    // G2b: track whether WALL velocity is being compiled (needs past-edge trigger).
    var isWall = false;

    // Phase 1 — compile actions (0-draw each; order matches native dispatch_collision_actions).
    var actionsList = actions || [];
    for (var i = 0; i < actionsList.length; i++) {
        var action = actionsList[i];

        if (action === 'ABSORB') {
            // ABSORB → set 0.is_alive = 0 (kills the colliding frame).
            // The engine's native ABSORB calls p.kill() which sets is_alive=false.
            // Op-program: set frame.is_alive = 0 (0 → false via !!value in setFrameProperty).
            ops.push({ set: HANDLE_FRAME + '.is_alive', to: Lit(0) });

        } else if (action === 'COUNT') {
            // COUNT → set 1.count = 1.count + 1 (LO hit counter, same as OvenBox counter).
            // Mirrors the OvenBox oven-counter program (§2.1, slice 3).
            ops.push({ set: HANDLE_SELF + '.count',
                       to: Bin('+', Ref(HANDLE_SELF, 'count'), Lit(1)) });

        } else if (action === 'MARK' || action === 'DETECT') {
            // MARK/DETECT → a Tagger stamping the LO name under the canonical provenance
            // key: `set 0.data.detector_name = StrLit(loName)`. The op SHAPE is owned by
            // tagger.js (the MARK part) and FERRIED here — this compiler no longer spells
            // the '0.data.' path or the key name. The op-apply layer (_runOpProgram /
            // run_op_program_with_frame) intercepts StrLit before calling eval_expr and
            // routes it to the string_map write path; DetectorWall reads it back through
            // the SAME part (Tagger.readTag). No in-engine string comparison needed.
            var markName = loName || '';
            ops = ops.concat(_getTagger().tagOps(markName));   // bare string ⇒ {detector_name: markName}

        } else if (action === 'BLOCK') {
            // BLOCK → eject to nearest face (supports 'closest' via Cond-tree since StrLit landed).
            // Native: if pastWall → _eject(force=true); else → rect.eject(overlap).
            // Op-program: equivalent to _eject (force=true path, §10.3 formula).
            // 'closest': two Cond set ops (frame.left + frame.top) pick nearest face at runtime.
            if (!reposition) { _uncompilable(action, 'it needs an eject face: pass a reposition ' +
                'of left|right|top|bottom|near|far|closest, or build the wall with V2 ' +
                "compileWallV2({behavior:'block', reposition})"); }
            var blockEjectOps = _buildEjectOps(reposition, HANDLE_FRAME, HANDLE_SELF, Lit, Ref, Bin, Cmp, Cond, Fn);
            if (!blockEjectOps) { _uncompilable(action, 'reposition "' + reposition + '" is not an ' +
                'eject face (left|right|top|bottom|near|far|closest|closest3d)'); }
            for (var bi = 0; bi < blockEjectOps.length; bi++) ops.push(blockEjectOps[bi]);

        } else if (action === 'BOUNCE') {
            // BOUNCE action → eject + velocity flip (named dir OR 'closest').
            // Same as OvenBox L4 (EP27-EP28). 'closest' Cond-tree now supported.
            if (!reposition) { _uncompilable(action, 'it needs an eject face: pass a reposition ' +
                'of left|right|top|bottom|near|far|closest, or build the wall with V2 ' +
                "compileWallV2({behavior:'bounce', bounceDirection:'reflect', reposition})"); }
            var bounceEjectOps = _buildEjectOps(reposition, HANDLE_FRAME, HANDLE_SELF, Lit, Ref, Bin, Cmp, Cond, Fn);
            var flipOp2 = _buildVelocityFlipOp(loName || '', HANDLE_FRAME, Lit, Ref, Bin);
            if (!bounceEjectOps && !flipOp2) { _uncompilable(action, 'neither reposition "' +
                reposition + '" nor the LO name "' + (loName || '') + '" names a face to bounce off'); }
            if (bounceEjectOps) {
                for (var bj = 0; bj < bounceEjectOps.length; bj++) ops.push(bounceEjectOps[bj]);
            }
            if (flipOp2) ops.push(flipOp2);

        } else if (action === 'LOG') {
            _uncompilable(action, 'there is no logging op and no native dispatch to fall back ' +
                'to; read the collided frames from TickData.objects[handle].frames instead ' +
                "(compileWallV2({behavior:'nothing', hooks:['count']}) collects them)");

        } else if (action === 'RECOLOR') {
            _uncompilable(action, 'the engine owns no colour; stamp render.color as a tag ' +
                "instead — compileWallV2({..., hooks:['recolor'], color:[r,g,b]})");

        } else if (action === 'KILL') {
            // KILL: was a Rust-only divergence, deleted from canonical action set.
            // Collapse to ABSORB's op (kill the frame) for backward compat.
            ops.push({ set: HANDLE_FRAME + '.is_alive', to: Lit(0) });

        } else {
            _uncompilable(action, 'it is not a CollisionAction this compiler knows ' +
                '(ABSORB|COUNT|MARK|DETECT|BLOCK|BOUNCE|KILL) — check the spelling, or use ' +
                'the V2 wall vocabulary via compileWallV2({behavior, bounceDirection, hooks})');
        }
    }

    // Phase 2 — G2: compile velocity ops from collisionType (APPENDED LAST to preserve
    // global RNG draw order: all 0-draw ops first, then RNG draws at the end, matching
    // the native dispatch_collision_type which ran AFTER dispatch_collision_actions).
    var ct = collisionType || 'NONE';

    if (ct === 'RANDOM_X') {
        // RANDOM_X: 1 RNG draw — vx = _rng()*2-1, vy = 1 (no charge reset).
        // Native (EGPTfrqtl.js:1155-1165): vx = _rng()*2-1; vy = 1;
        ops.push({ set: HANDLE_FRAME + '.vx',
                   to: Bin('-', Bin('*', Fn('random', []), Lit(2)), Lit(1)) });
        ops.push({ set: HANDLE_FRAME + '.vy',
                   to: Lit(1) });

    } else if (ct === 'RANDOM_Y') {
        // RANDOM_Y: 2 RNG draws — vy = _rng()*2-1, then reset() draws charge.
        // Native (EGPTfrqtl.js:1167-1175): vy = _rng()*2-1; vx = 1; reset() → charge draw.
        // reset() also clears local_time=0 (wave-phase reset — G2 mirrors this with a 0-draw op).
        ops.push({ set: HANDLE_FRAME + '.vy',
                   to: Bin('-', Bin('*', Fn('random', []), Lit(2)), Lit(1)) });
        ops.push({ set: HANDLE_FRAME + '.vx',
                   to: Lit(1) });
        // Reset wave phase (reset() side-effect — no RNG draw).
        ops.push({ set: HANDLE_FRAME + '.local_time', to: Lit(0) });
        // charge draw: _rng() < 0.5 ? Charge.POSITIVE : Charge.NEGATIVE (0 or 1)
        ops.push({ set: HANDLE_FRAME + '.charge',
                   to: Cond(Cmp('<', Fn('random', []), Lit(0.5)), Lit(0), Lit(1)) });

    } else if (ct === 'RANDOM_XY') {
        // RANDOM_XY: 3 RNG draws — vx = _rng(), vy = _rng()*2-1, then reset() draws charge.
        // Native (EGPTfrqtl.js:1155-1170): vx = _rng(); vy = _rng()*2-1; reset() → charge.
        // reset() also clears local_time=0 (wave-phase reset — G2 mirrors this with a 0-draw op).
        ops.push({ set: HANDLE_FRAME + '.vx',
                   to: Fn('random', []) });
        ops.push({ set: HANDLE_FRAME + '.vy',
                   to: Bin('-', Bin('*', Fn('random', []), Lit(2)), Lit(1)) });
        // Reset wave phase (reset() side-effect — no RNG draw).
        ops.push({ set: HANDLE_FRAME + '.local_time', to: Lit(0) });
        // charge draw: _rng() < 0.5 ? Charge.POSITIVE : Charge.NEGATIVE (0 or 1)
        ops.push({ set: HANDLE_FRAME + '.charge',
                   to: Cond(Cmp('<', Fn('random', []), Lit(0.5)), Lit(0), Lit(1)) });

    } else if (ct === 'MOMENTUM_BASED') {
        // MOMENTUM_BASED: 0 RNG draws — restores pre-move position (move_undo equivalent).
        // Native: p.move_undo() → p.x = p.prev_x, p.y = p.prev_y.
        // G2: prev_x/prev_y are exposed in the frame scope bag (frame_to_scope_bag).
        ops.push({ set: HANDLE_FRAME + '.x',
                   to: Ref(HANDLE_FRAME, 'prev_x') });
        ops.push({ set: HANDLE_FRAME + '.y',
                   to: Ref(HANDLE_FRAME, 'prev_y') });

    } else if (ct === 'WALL') {
        // WALL: 0 RNG draws — directional eject only (no velocity flip).
        // Same eject formulas as BLOCK; the wall direction is the LO name prefix.
        // Native: _eject(p.rect, reposition, false, pastWall) → positional eject only.
        // G2b: WALL needs past-edge trigger (frames can slip through).
        if (reposition) {
            var wallEjectOps = _buildEjectOps(reposition, HANDLE_FRAME, HANDLE_SELF, Lit, Ref, Bin, Cmp, Cond, Fn);
            if (wallEjectOps) {
                for (var wi = 0; wi < wallEjectOps.length; wi++) ops.push(wallEjectOps[wi]);
                isWall = true; // trigger needs past-edge test
            }
        }

    } else if (ct === 'BOUNCE') {
        // BOUNCE collision_type: only compile if no BOUNCE action was already compiled.
        // Sugar objects (Box) use BOUNCE actions; collision_type=BOUNCE was redundant.
        // After migration, Box passes NONE here — but if somehow both arrive, skip
        // to avoid double eject+flip.
        var hasBounceAction = actionsList.indexOf('BOUNCE') >= 0;
        if (!hasBounceAction && reposition) {
            var ctBounceEjectOps = _buildEjectOps(reposition, HANDLE_FRAME, HANDLE_SELF, Lit, Ref, Bin, Cmp, Cond, Fn);
            var ctFlipOp = _buildVelocityFlipOp(loName || '', HANDLE_FRAME, Lit, Ref, Bin);
            if (ctBounceEjectOps) {
                for (var bk = 0; bk < ctBounceEjectOps.length; bk++) ops.push(ctBounceEjectOps[bk]);
            }
            if (ctFlipOp) ops.push(ctFlipOp);
        }

    }
    // NONE: nothing appended.

    // G2b: attach a program-level trigger so the Rust engine evaluates it ONCE before
    // running any ops. If trigger == 0 (false), ALL ops are skipped atomically.
    //
    // This replaces the old per-op Cond wrapping approach. The old approach re-evaluated
    // Fn('intersects') for EACH op, but after the eject op (op 1) updated scope.left,
    // the bounce op's (op 2) intersects check used the post-eject position, returning false
    // and silently skipping the velocity flip — a critical bug (G2b per-op Cond bug).
    //
    // WALL uses the extended trigger (intersects OR past_edge).
    // All other action types use the overlap-only trigger.
    var program = ops.length > 0
        ? { on: 'collision', ops: ops }
        : null;

    if (program !== null) {
        var trigger = _buildTriggerExpr(
            reposition || null,
            isWall,
            HANDLE_FRAME, HANDLE_SELF,
            Lit, Ref, Cmp, Cond, Fn
        );
        _applyProgramTrigger(program, trigger);
    }

    return { program: program };
}

/**
 * Compile the Collision LEXICON v2 wall spec → an op-program (the SINGLE compiler
 * authority for the v2 vocabulary; the W1 compileActions() path is untouched).
 *
 * @param {Object} spec
 *   @param {string} spec.behavior          - nothing | block | bounce | absorb | destroy
 *   @param {string} [spec.bounceDirection] - reflect | random (when behavior==bounce)
 *   @param {Array<number>} [spec.angleConstraint] - [minDeg,maxDeg] offsets around the
 *       wall's INITIAL orientation (random only). Omitted/full ⇒ omni.
 *   @param {number} [spec.orientationDeg=0]- the wall's INITIAL orientation (baked; a
 *       later spin must recompile, per CEO — the cone endpoints are compile-time Lits).
 *   @param {boolean}[spec.decoherence=false]- append the phase/charge reset (random only).
 *   @param {Array<string>}[spec.hooks]     - ['mark','count'] (composable with any behavior).
 *   @param {string} [spec.markTag]         - the user string MARK stamps (default '').
 *   @param {number} [spec.capacity=64]     - ABSORB mass ceiling + 1/capacity radiation.
 *   @param {number} [spec.emissivity]      - ABSORB radiating efficiency, a fullness fraction
 *       in (0,1] applied to the emitted leaf. Omitted ⇒ absorbRadiation's default (0.5).
 *   @param {number[]}[spec.color]          - the wall's drawn [r,g,b(,a)] — the ONE authority
 *       the `recolor` hook derives its render.color tag from (never a parallel color field).
 *   @param {string} [spec.reposition='closest'] - eject face for bounce.
 * @returns {{ program:Object|null, collectCollided:boolean,
 *             radiation:{capacity:number, emissivity?:number}|null }}
 */
// _rgbaCsv([r,g,b(,a)]) → 'r,g,b,a' (the render.color CSV the providers read). Clamps to
// ints in [0,255]; default alpha 255. Returns null for a missing/malformed color so the
// recolor hook is a no-op rather than stamping garbage. This mirrors the exact 4-element
// CSV shape colored emitter frames already ride (makeLeafFrame → rgba.join(',')).
function _rgbaCsv(color) {
    if (!Array.isArray(color) || color.length < 3) { return null; }
    function _b(n) { n = Math.round(Number(n)); return isNaN(n) ? null : Math.max(0, Math.min(255, n)); }
    var r = _b(color[0]), g = _b(color[1]), b = _b(color[2]);
    if (r === null || g === null || b === null) { return null; }
    var a = (color.length >= 4) ? _b(color[3]) : 255;
    if (a === null) { a = 255; }
    return r + ',' + g + ',' + b + ',' + a;
}

function compileWallV2(spec) {
    var ast = _getAstSchema();
    // No StrLit binding — the mark/recolor hooks are Taggers (tagger.js owns the op shape).
    var Lit = ast.Lit, Ref = ast.Ref, Bin = ast.Bin, Cmp = ast.Cmp, Cond = ast.Cond,
        Fn = ast.Fn, HF = ast.HANDLE_FRAME, HS = ast.HANDLE_SELF;

    spec = spec || {};
    var behavior   = spec.behavior || 'nothing';
    var reposition = spec.reposition || 'closest';
    // Z1 — a 3D wall (a real z-slab, is3D) ejects on all SIX faces and reflects on all
    // three axes. Auto-promote the DEFAULT 'closest' eject to the 6-face 'closest3d' so a
    // frame entering via the near/far face is z-ejected (else in-wall z jitter); an explicit
    // reposition is honored verbatim. 2D walls (is3D falsy) are entirely unchanged (SU1).
    var is3D = (spec.is3D === true);
    if (is3D && reposition === 'closest') { reposition = 'closest3d'; }
    var hooks      = Array.isArray(spec.hooks) ? spec.hooks : [];
    var collectCollided = false;
    var radiation = null;
    var ops = [];

    // ── Motion / life response (the ONE behavior axis) ───────────────────────
    // TILTED REFLECT GUARD (theorist §2 + CEO same-tick-exteriority ruling, 2026-07-25): a
    // NON-cardinal REFLECT mirror is fired ONCE per genuine drawn-SURFACE crossing (the guard
    // trigger, applied below) and ejects by the PREV-ANCHORED FACE-NORMAL EXIT — the ONE
    // coherent eject story that replaces BOTH the interim OBB-normal eject (ae55c414) and the
    // theorist's plain prev-restore. Cardinal / random-bounce / non-reflect walls keep the
    // AABB 'closest' eject + plain-intersects trigger — BYTE-IDENTICAL (SU1). The guard normal
    // is CONSUMED from the ONE SlabFace authority (obb.normal = the −1-eigenvector the reflect
    // law flips, engine y-down frame) — never a second inline sin/cos convention. Applies to
    // BOTH 2D and 3D (a non-cardinal orientation is rotation in the xy-plane; z passes
    // through — 2D≡3D). slabW/slabH ride along so the resolved obb is fully formed; the guard
    // itself reads only obb.normal (the slab EXTENT is enforced by the engine's swept-OBB
    // region, which culls candidates outside the rotated slab before the trigger runs).
    var _reflectSlab = (behavior === 'bounce' && spec.bounceDirection !== 'random')
        ? _getSlabFace().resolveSlabFace({ orientationDeg: spec.orientationDeg,
                                           w: spec.slabW, h: spec.slabH,
                                           pitchDeg: spec.pitchDeg, d: spec.slabD }) : null;
    // R2AX — a PITCHED plate (two-axis mirror, CEO ruling 2026-07-26) takes the true
    // 3-space reflection path (R = I − 2nnᵀ about SlabFace plate3.n + the n-dot guard +
    // the prev-anchored 3-space exit). pitch 0/absent never sets `pitched` — every
    // existing program stays byte-identical.
    var pitchedReflect = !!(_reflectSlab && _reflectSlab.pitched);
    if (pitchedReflect && !is3D) {
        throw new Error('[actionCompiler] pitchDeg requires a 3D wall (a real z/depth) — ' +
            'a 2D wall has no z axis to pitch into.');
    }
    var tiltedReflect = !!(_reflectSlab && !_reflectSlab.isCardinal && !pitchedReflect);
    if (behavior === 'bounce') {
        if (pitchedReflect) {
            // ONE response class: face exit along n (prev-anchored, same-tick exteriority)
            // then the 3-space reflection about n. The guard trigger (below) is the narrow
            // phase (plane crossing + plate extent); the engine gets NO region (broad phase
            // = the plate's 3D AABB rect, emitted by the Wall sugar).
            ops = ops.concat(_buildPitchedExitEjectOps(_reflectSlab.plate3, HF, HS, Lit, Ref, Bin, Cmp, Cond));
            ops = ops.concat(_buildPitchedReflectOps(_reflectSlab.plate3.n, HF, Lit, Ref, Bin));
        } else if (tiltedReflect) {
            // GUARDED tilted reflect: the face-normal EXIT eject FIRST (it reads the INCOMING
            // velocity to pick the incident side), then the reflection law (position and
            // velocity are independent writes). The whole program fires only when the guard
            // trigger (below) confirms a surface crossing, so the involution runs exactly once
            // per hit AND the leaf's rendered position is outside the slab the SAME tick — no
            // oscillation, no far-face eject, no leak-through, no in-slab rendering.
            var _ghw = (_reflectSlab.obb && isFinite(_reflectSlab.obb.hw)) ? _reflectSlab.obb.hw : 0;
            if (is3D) {
                // 3D TILTED slab — the z-face COMPLETION (measured 3D z-entry leak class,
                // 2026-07-25): the slab has TWO kinds of reflecting surface — the rotated xy
                // DRAWN faces (the 2θ law) and the UNROTATED near/far z-faces (the C27 z-plane
                // flip). One program handles both: every op is gated on a PREV-ONLY class flag
                // (`_tilted3DGates` — immune to the retired G2b re-evaluation bug because the
                // gates read only prev_*/self.* refs no op writes). Order matters only for the
                // documented sequential-swap reads; the gates are constant across the sequence.
                //   xy class: prev-side-anchored face exit + the swap/angled reflect (vz through)
                //   z  class: z-face exit + vz flip (xy untouched)
                var _g3 = _tilted3DGates(_reflectSlab.obb.normal, _ghw, HF, HS, Lit, Ref, Bin, Cmp, Cond);
                var _ejXY = _buildFaceExitEjectOps(_reflectSlab.obb.normal, _ghw, HF, HS, Lit, Ref, Bin, Cmp, Cond, true);
                ops = ops.concat(_gateOps(_ejXY, _g3.xprev, HF, Ref, Cond));
                ops = ops.concat(_gateOps([_buildZFaceExitEjectOp(HF, HS, Lit, Ref, Bin, Cmp, Cond)], _g3.zclass, HF, Ref, Cond));
                ops = ops.concat(_gateOps(_buildReflectOps(spec.orientationDeg, HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn, is3D), _g3.xprev, HF, Ref, Cond));
                ops = ops.concat(_gateOps([{ set: HF + '.vz', to: Bin('-', Lit(0), Ref(HF, 'vz')) }], _g3.zclass, HF, Ref, Cond));
            } else {
                ops = ops.concat(_buildFaceExitEjectOps(_reflectSlab.obb.normal, _ghw, HF, HS, Lit, Ref, Bin, Cmp, Cond));
                ops = ops.concat(_buildReflectOps(spec.orientationDeg, HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn, is3D));
            }
        } else {
            // Cardinal / random-bounce: AABB eject (penetration-stop) THEN the direction op —
            // BYTE-IDENTICAL to the pre-guard program (SU1).
            var ejectOps = _buildEjectOps(reposition, HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn) || [];
            for (var e = 0; e < ejectOps.length; e++) { ops.push(ejectOps[e]); }
            if (spec.bounceDirection === 'random') {
                var ac = spec.angleConstraint;
                if (Array.isArray(ac) && ac.length === 2 && isFinite(ac[0]) && isFinite(ac[1]) &&
                    (Math.abs(ac[1] - ac[0]) < 360)) {
                    // Cone endpoints baked HOST-SIDE from the INITIAL orientation (trig legal here).
                    var o = (typeof spec.orientationDeg === 'number') ? spec.orientationDeg : 0;
                    var a0 = (o + ac[0]) * Math.PI / 180, a1 = (o + ac[1]) * Math.PI / 180;
                    ops = ops.concat(_buildConstrainedRandomOps(
                        HF, Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1), Lit, Ref, Bin, Fn));
                } else {
                    ops = ops.concat(_buildOmniRandomOps(HF, Lit, Bin, Fn));
                }
                if (spec.decoherence === true) {
                    ops = ops.concat(_buildDecoherenceOps(HF, Lit, Cmp, Cond, Fn));
                }
            } else {
                // reflect (cardinal): the proven incidence box tree (byte-identical at 0 — SU1);
                // fused with the AABB eject above. A live orientation edit re-bakes via setV2Prop.
                ops = ops.concat(_buildReflectOps(spec.orientationDeg, HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn, is3D));
            }
        }
    } else if (behavior === 'block') {
        // BLOCK — the particle is STOPPED at the surface. ONE response, composed entirely
        // from the SHARED eject authority (`_buildEjectOps`): reposition the frame to the
        // CLOSEST position OUTSIDE the wall, velocity UNTOUCHED. That is literally the
        // `bounce` op-set minus the reflect ops, and byte-identical to the op-set the
        // legacy `CollisionActions.BLOCK` compiled — so porting a legacy `block` caller
        // moves ZERO physics.
        //
        // WHY "closest outside" and NOT "revert the last move" (the CEO gave both options;
        // measured head-to-head on the canonical WASM engine, wall x∈[200,220]):
        //   - approaching leaf (x=150, vx=+1): the two are equivalent in outcome — the leaf
        //     stops dead at the face and stays (eject parks at x=198.5, revert at x=199) for
        //     every remaining tick, velocity kept at +1. Either satisfies "block".
        //   - leaf whose PREVIOUS position was ALSO inside (spawned/tunnelled in at x=210):
        //     eject-to-closest is outside in ONE tick (0/30 ticks inside); revert-last-move
        //     restores it to a position that is itself inside, so the guard re-fires forever
        //     and the leaf is PINNED INSIDE THE WALL (30/30 ticks inside). Revert has no
        //     exteriority guarantee; eject does, from any state. That decides it.
        // The composition also inherits `reposition`'s 3D promotion for free: an is3D wall
        // already auto-promotes 'closest' → 'closest3d' above, so a z-slab block wall ejects
        // on all six faces (2D≡3D, no block-specific 3D code).
        //
        // TILT: like `bounce/random`, a non-cardinal block wall uses the AABB 'closest'
        // eject (the prev-anchored face-normal exit is a REFLECT-only construction — it
        // reads the incoming velocity to pick the incident side, which a velocity-preserving
        // stop has no use for). A tilted block wall therefore stops the particle at the
        // bounding-box face, not the drawn face.
        var blockEjectOps = _buildEjectOps(reposition, HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn) || [];
        for (var bq = 0; bq < blockEjectOps.length; bq++) { ops.push(blockEjectOps[bq]); }
    } else if (behavior === 'absorb') {
        // Track A (CEO mass-surface ruling 384ef5ee): the collision op just KILLS; the host
        // radiation tick-fn (absorbRadiation.js) tallies the collected killed masses into the
        // LO's REAL BACKING-FRAME mass (via the existing frame accessors) and radiates per the
        // conservation contract. The v1 count-as-virtual-mass tally op is WITHDRAWN (theorist
        // round-3 — it was exactly the duplicative parallel surface the CEO flagged).
        var cap = (typeof spec.capacity === 'number' && spec.capacity > 0) ? spec.capacity : 64;
        ops.push({ set: HF + '.is_alive', to: Lit(0) });
        collectCollided = true;          // buffer killed frames' masses for the host tally
        // EMISSIVITY rides the radiation bag beside the clock capacity: it is the wall's
        // radiating efficiency as a FULLNESS fraction of the emitted leaf, so it sets what the
        // re-emitted quantum IS (its speed and its wavelength together). Omitted ⇒ the sugar's
        // own default (absorbRadiation.DEFAULT_EMISSIVITY); this compiler does not mirror the
        // default, it just declines to state one.
        radiation = { capacity: cap };
        if (spec.emissivity !== undefined && spec.emissivity !== null) {
            radiation.emissivity = spec.emissivity;
        }
    } else if (behavior === 'destroy') {
        ops.push({ set: HF + '.is_alive', to: Lit(0) });
    }
    // 'nothing' → no motion/life op (pass-through).

    // ── Hooks (composable with ANY behavior) ─────────────────────────────────
    if (hooks.indexOf('mark') !== -1) {
        // The `mark` hook IS a Tagger: the user string under the canonical provenance key.
        // Shape owned by tagger.js, ferried here (`''` is a legal tag value — a mark hook
        // with no markTag has always stamped the empty string; the part preserves that).
        ops = ops.concat(_getTagger().tagOps(spec.markTag || ''));
    }
    if (hooks.indexOf('count') !== -1) {
        ops.push({ set: HS + '.count', to: Bin('+', Ref(HS, 'count'), Lit(1)) });
        collectCollided = true;          // buffer frames for the between-tick stats reader
    }
    // recolor — a RENDER-INTENT hook (MARK's sibling): stamp the wall's OWN drawn color
    // into the collided frame's opaque string_map under 'render.color' (CSV 'r,g,b,a').
    // The engine carries the string_map key VERBATIM and interprets nothing (I1 — the
    // engine has no color); the renderer providers already read string_map['render.color']
    // (highest-priority render intent), so a colliding beam RE-COLORS to this wall's color
    // with ZERO renderer change. The color is derived at compile time from the ONE authority
    // — the wall's `color` property (spec.color) — never a parallel color field. StrLit is
    // the same string-map write path MARK uses; strKey = prop.slice(5) keeps the dotted
    // 'render.color' key intact.
    if (hooks.indexOf('recolor') !== -1) {
        var _csv = _rgbaCsv(spec.color);
        // recolor is MARK's sibling and therefore the SAME part with a different key:
        // a Tagger whose key ('render.color') happens to be one the renderer reads. The
        // dotted key survives the tag path whole (strKey = prop.slice(5)).
        if (_csv) { ops = ops.concat(_getTagger().tagOps({ 'render.color': _csv })); }
    }

    var program = ops.length > 0 ? { on: 'collision', ops: ops } : null;
    if (program !== null) {
        if (pitchedReflect) {
            // R2AX — the pitched guard IS the narrow phase (plane crossing + extent along
            // the plate's u/v axes; no engine region for a pitched plate).
            _applyProgramTrigger(program, _buildPitchedGuardTrigger(
                _reflectSlab.plate3, HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn));
        } else if (tiltedReflect) {
            // GUARDED tilted reflect: fire the reflection ONCE per drawn-SURFACE crossing
            // (surface-crossing + approach guard — theorist §2 upgraded to the ±hw surfaces
            // per the CEO same-tick-exteriority ruling). The crossing NORMAL is `obb.normal`
            // and the half-thickness `obb.hw`, BOTH from the ONE SlabFace authority: the
            // normal is the axis R(reflectBaseDeg) actually FLIPS (its −1-eigenvector,
            // engine y-down frame) — the SAME derivation the reflect law, the renderer's
            // drawn face, and the engine OBB region share (circulation §1: never a second
            // inline sin/cos convention; the guard logic is invariant under n → −n because
            // it handles both surfaces symmetrically). The finite slab EXTENT along the
            // face line is enforced by the engine's swept-OBB narrow-phase, which culls
            // candidates outside the rotated slab BEFORE this trigger runs.
            var _ghw2 = (_reflectSlab.obb && isFinite(_reflectSlab.obb.hw)) ? _reflectSlab.obb.hw : 0;
            // `withZFaces = is3D`: a 3D tilted slab's trigger ALSO fires on a genuine z-face
            // crossing (the z-entry leak completion); 2D stays byte-identical (SU1).
            _applyProgramTrigger(program, _buildTiltedReflectGuardTrigger(
                _reflectSlab.obb.normal, _ghw2, HF, HS, Lit, Ref, Bin, Cmp, Cond, Fn, is3D));
        } else {
            // Overlap-only trigger (frame is inside the wall when any v2 op fires) — SU1.
            _applyProgramTrigger(program, _buildTriggerExpr(reposition, false, HF, HS, Lit, Ref, Cmp, Cond, Fn));
        }
    }
    return { program: program, collectCollided: collectCollided, radiation: radiation };
}

// ── Export ─────────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        compileActions:        compileActions,
        compileWallV2:         compileWallV2,
        // Collision LEXICON v2 builders (theorist-proven; consumed by compileWallV2
        // and driven RAW by the bench LO-bites — the SINGLE authority for these shapes).
        buildIncidenceReflectOps:  _buildIncidenceReflectOps,
        buildIncidenceReflectOps3D:_buildIncidenceReflectOps3D,
        buildAngledReflectOps:     _buildAngledReflectOps,
        buildSwapReflectOps:       _buildSwapReflectOps,
        buildReflectOps:           _buildReflectOps,
        buildTiltedReflectGuardTrigger: _buildTiltedReflectGuardTrigger,
        buildFaceExitEjectOps:     _buildFaceExitEjectOps,
        buildOmniRandomOps:        _buildOmniRandomOps,
        buildConstrainedRandomOps: _buildConstrainedRandomOps,
        buildDecoherenceOps:       _buildDecoherenceOps,
        buildTriggerExpr:      _buildTriggerExpr,
        applyProgramTrigger:   _applyProgramTrigger,
        // Q-L1-4 DRY extraction: shared eject/flip builders — the SINGLE authority for
        // these formulas. OvenBox.js consumes these instead of hand-mirroring
        // the Bin/Ref AST (their private makeEjectProgram is retired to a thin
        // call-through). FRQTL-MAINT (2026-07-01, #61): now includes 'near'/'far' —
        // Tube.js's NEAR/FAR walls consume the SAME builders as TOP/BOTTOM/LEFT/RIGHT
        // (the manual buildZContainmentOps/buildXYIntersectsTrigger workaround they used
        // to need is retired — see the RETIRED comment blocks above).
        buildEjectOps:         _buildEjectOps,
        buildVelocityFlipOp:   _buildVelocityFlipOp,
    };
} else {
    window.compileActions      = compileActions;
    window.compileWallV2       = compileWallV2;
    window.buildIncidenceReflectOps  = _buildIncidenceReflectOps;
    window.buildIncidenceReflectOps3D = _buildIncidenceReflectOps3D;
    window.buildAngledReflectOps     = _buildAngledReflectOps;
    window.buildSwapReflectOps       = _buildSwapReflectOps;
    window.buildReflectOps           = _buildReflectOps;
    window.buildTiltedReflectGuardTrigger = _buildTiltedReflectGuardTrigger;
    window.buildFaceExitEjectOps     = _buildFaceExitEjectOps;
    window.buildOmniRandomOps        = _buildOmniRandomOps;
    window.buildConstrainedRandomOps = _buildConstrainedRandomOps;
    window.buildDecoherenceOps       = _buildDecoherenceOps;
    window.buildTriggerExpr    = _buildTriggerExpr;
    window.applyProgramTrigger = _applyProgramTrigger;
    window.buildEjectOps       = _buildEjectOps;
    window.buildVelocityFlipOp = _buildVelocityFlipOp;
}

})();
