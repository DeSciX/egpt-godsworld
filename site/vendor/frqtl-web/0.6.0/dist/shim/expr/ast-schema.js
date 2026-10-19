/* Copyright 2023-2026 by Essam Abadir */

/**
 * ast-schema.js — Expression AST WIRE CONTRACT for FRQTL op-programs.
 *
 * This module is the cross-engine authority for op-program AST node shapes,
 * operator vocabularies, and evaluation conventions.  It is read-contract-shaped
 * (like lib/shim/frame-data SECTION_KEYS) — it exports node SHAPES and vocab
 * LISTS; it does NOT contain any parsing or evaluation logic.
 *
 * Architecture: lib/shim/expr/ (this file) ← imported by lib/frqtl/objects/
 *   sugar (JS-side parser → ast-schema shapes)
 *   and by the dual-native evaluators in the JS reference and Rust engines.
 * Arrow-legality: lib/frqtl/objects imports lib/shim (downward — legal).
 *
 * Gate-2 binding (slice 3):
 *   • Rust NEVER parses — AST-only payload; this schema is the data shape.
 *   • NODE_KINDS and vocab lists are the conformance iteration surface
 *     (binding item 3 — conformance iterates these lists).
 *   • Integer-first evaluation convention is documented here (binding item 4).
 *   • Named refs compile to integer handles JS-side (binding item 5) — this
 *     schema defines the Ref shape ({handle:number, prop:string}).
 *
 * HOW TO READ THIS FILE
 * ─────────────────────
 * An ExprAST is one of:
 *
 *   Lit    { kind:'Lit',  value: number }
 *          A numeric literal. Floating-point JSON number; rounded to integer
 *          by integer-first eval where the target property is integer-domain.
 *
 *   Ref    { kind:'Ref',  handle: number, prop: string }
 *          Read handle.prop at eval time. handle is an integer index into the
 *          scope's object table (compiled JS-side — NOT a string name).
 *          Special handles: HANDLE_FRAME / HANDLE_SELF / HANDLE_UNIVERSE (below).
 *
 *   Bin    { kind:'Bin',  op: BIN_OP, a: ExprAST, b: ExprAST }
 *          Binary arithmetic. INTEGER-FIRST: '/' is integer division (truncate
 *          toward zero). Result of '/' is Math.trunc(a/b) in JS, a/b as i64
 *          truncated in Rust.  Never produces a float in integer-domain props.
 *
 *   Cmp    { kind:'Cmp',  op: CMP_OP, a: ExprAST, b: ExprAST }
 *          Comparison. Returns 1 (true) or 0 (false) — integer, not boolean.
 *          Required for Cond tests and guard expressions.
 *
 *   Cond   { kind:'Cond', test: ExprAST, then: ExprAST, else: ExprAST }
 *          Conditional: if test != 0 then 'then' else 'else'.
 *          test is truthy when non-zero (follows from Cmp returning 0/1).
 *
 *   Fn     { kind:'Fn',   name: FN_NAME, args: ExprAST[] }
 *          Built-in function. min/max accept two args; floor accepts one.
 *          INTEGER-FIRST: floor(x) is already integer in integer-domain
 *          contexts; on float-domain props it applies Math.floor / Rust floor.
 *
 *   StrLit { kind:'StrLit', value: string }
 *          A string literal — valid ONLY as the `to` value of a `set` op
 *          whose target is `<handle>.data.<key>` (a string-map write).
 *          MUST throw (JS) / panic (Rust) if used as a child of Bin, Cmp,
 *          Fn, or Cond.test — eval_expr stays numeric-pure (INTEGER-FIRST
 *          rule; Gate-2 item 2). The op-apply layer
 *          (_runOpProgram / apply_set_op) detects StrLit before calling
 *          eval_expr and routes it to the string-map writer.
 *
 * OP-PROGRAM SHAPE
 * ─────────────────
 *   { on: TRIGGER, ops: [ { set: '<handle>.<prop>', to: ExprAST }, ... ] }
 *
 *   TRIGGER:
 *     'collision' — ops run per colliding frame (scope: frame, self, universe)
 *     'tick'      — ops run per LO per tick (scope: self, named refs, universe)
 *
 *   set target format: '<integer-handle>.<prop-name>'
 *     The JS sugar compiles readable names ('frame', 'self', 'emitterA', …)
 *     to integer handles before the AST crosses the boundary. Rust parses
 *     '<number>.<string>' — no string-name registry on the Rust side.
 *
 * EVALUATION SCOPE
 * ─────────────────
 *   on:'collision':
 *     HANDLE_FRAME     (0) — the colliding frame  (Frame properties)
 *     HANDLE_SELF      (1) — this LO / emitter     (LO/emitter properties)
 *     HANDLE_UNIVERSE  (2) — universe read-only    (tick, activeQuanta)
 *
 *   on:'tick':
 *     HANDLE_SELF      (1) — this LO/emitter
 *     HANDLE_UNIVERSE  (2) — universe
 *     3, 4, 5, …       — named refs (other registered objects by handle)
 *
 * INTEGER-FIRST EVALUATION CONVENTION (binding item 4)
 * ──────────────────────────────────────────────────────
 *   All arithmetic operates on the raw numeric values from the scope.
 *   '/' is INTEGER DIVISION: Math.trunc(a / b) in JS; (a as i64) / (b as i64)
 *       in Rust.  Division by zero → 0 (not an error; matches discrete physics).
 *   '==' / '<' / '>' return 1 (true) or 0 (false) — integer.
 *   'floor' on an already-integer value is a no-op (included for completeness).
 *   NO silent float result is written into an integer-domain property (x, y, vx,
 *   vy, mass, count, etc.).  The 'set' op applies Math.round() / Rust f64.round()
 *   before writing integer-domain props identified in the Frame / LO tables.
 *
 * ADVERSARIAL CASES (conformance must cover these — binding item 4):
 *   Bin('/', Lit(7), Lit(2))   → 3   (truncate, not round or floor)
 *   Bin('/', Lit(-7), Lit(2))  → -3  (truncate toward zero, not floor: -4)
 *   Fn('floor', [Lit(7.9)])    → 7   (floor, not truncate: same for positives,
 *                                     differs for negatives: floor(-7.9)=-8 ≠ trunc(-7.9)=-7)
 *   Cmp('==', Lit(1), Lit(1))  → 1
 *   Cmp('==', Lit(1), Lit(2))  → 0
 *   Cmp('<', Lit(3), Lit(5))   → 1
 *   Cmp('>', Lit(5), Lit(3))   → 1
 *   nested Cond(Cmp…, Lit, Lit)
 */



// ── Node kind names ────────────────────────────────────────────────────────────

/**
 * NODE_KINDS — the complete, ordered list of expression AST node kinds.
 *
 * Conformance iterates this list to assert coverage (binding item 3):
 *   every kind must have at least one representative scenario in
 *   expr_program_scenarios.js.
 *
 * THIS LIST IS CLOSED AT 7 — do NOT add structural op kinds here.
 * Structural op kinds live in OP_KINDS (below). The two lists are orthogonal.
 *
 * NOTE on StrLit (item 7): StrLit is ONLY valid as the `to` value of a `set`
 * op targeting `<handle>.data.<key>` (a string-map write). Using StrLit as a
 * child of Bin, Cmp, Fn, or Cond.test MUST throw/panic — eval_expr is
 * numeric-pure (INTEGER-FIRST rule, Gate-2 item 2).
 *
 * @type {string[]}
 */
var NODE_KINDS = Object.freeze([
    'Lit',    // numeric literal
    'Ref',    // property read via handle
    'Bin',    // binary arithmetic
    'Cmp',    // comparison → 0/1
    'Cond',   // conditional
    'Fn',     // built-in function
    'StrLit'  // string literal — ONLY valid as `to` in data.<key> set ops
]);

/**
 * OP_KINDS — the complete, ordered list of op-program STATEMENT kinds.
 *
 * These are the kinds of ops that can appear in program.ops[].
 * They are DISTINCT from the value-grammar node kinds in NODE_KINDS.
 *
 * §2e (2026-06-24): OP_KINDS is closed at ['set'].
 *   addFrames / subtractFrames / addDimension were NEVER implemented as op-kinds
 *   in the Rust engine (OpProgram = ops: Vec<SetOp>; SetOp = {set, to}).  Their
 *   structural analogs are engine METHODS, not op-program statements:
 *     - Frame injection  → emitters / makeLeafFrame / createFrameFromRect / insert
 *     - Frame removal    → set 0.is_alive=0 + dead-parent GC
 *     - Dimension alloc  → universe.addDimension(n) / add_dimension engine method
 *
 * Gate-2 binding (§10.8 B3):
 *   • B3.2 — 'collect' is NOT a 2nd op.  It compiles to:
 *     { kind:'set', set:'1.count', to: Bin('+', Ref(HANDLE_SELF,'count'), Lit(1)) }
 *     i.e. a plain 'set' op on the LO's 'count' property.  No special sink.
 *
 * Op shapes:
 *   set — { kind:'set', set:'<handle>.<prop>', to: ExprAST }
 *
 * Conformance iterates this list (binding item 3):
 *   every kind must have at least one scenario in control_loop_scenarios.js.
 *
 * @type {string[]}
 */
var OP_KINDS = Object.freeze([
    'set'   // property write: routes through setFrameProperty / setObjectProperty
]);

// ── Operator vocabularies ──────────────────────────────────────────────────────

/**
 * BIN_OPS — binary arithmetic operators.
 * '/' is INTEGER DIVISION (truncate toward zero) — see convention above.
 *
 * Conformance must cover all four.
 * @type {string[]}
 */
var BIN_OPS = Object.freeze(['+', '-', '*', '/']);

/**
 * CMP_OPS — comparison operators.  All return 1 or 0.
 * Conformance must cover all three.
 * @type {string[]}
 */
var CMP_OPS = Object.freeze(['<', '>', '==']);

/**
 * FN_NAMES — built-in function names.
 * min/max: 2 args. floor: 1 arg. random: 0 args.
 * Conformance must cover all four.
 *
 * NOTE on 'random' (G2, 2026-06-24):
 *   Fn('random', []) draws one value from the engine's single Mulberry32 stream.
 *   It is a SIDE-EFFECTING draw — each eval call advances the RNG by one step.
 *   JS eval: closes over the engine's _rng() function (already in scope in
 *     _runOpProgram).
 *   Rust eval: eval_expr receives &mut rng so the draw advances the shared stream.
 *   Draw order: the ops array is evaluated left-to-right (op 0 before op 1 etc.)
 *   and each Fn('random',[]) in a `to` expression is evaluated in tree order
 *   (left child before right child for Bin/Fn). This is deterministic.
 *   RNG discipline: velocity set-ops MUST appear LAST in the op-program ops array
 *   (after any ABSORB/COUNT/MARK/BLOCK ops) so that random() draws land at the
 *   same point in the global RNG sequence as the native RANDOM_* dispatch did
 *   (which ran AFTER action dispatch in the collision loop).
 *
 * NOTE on 'intersects' (G2b, 2026-06-25):
 *   Fn('intersects', [Lit(h0), Lit(h1)]) is a NATIVE GEOMETRY CALL — not numeric
 *   arithmetic. It calls the native Rectangle::intersects primitive on the
 *   scope-resolved rects for handle h0 and h1 (reading left/right/top/bottom from
 *   the scope bag for each handle). Returns 1 (true) or 0 (false).
 *
 *   In practice args are always [Lit(HANDLE_FRAME), Lit(HANDLE_SELF)] (frame vs LO).
 *   Compiled exclusively by actionCompiler._buildTriggerExpr — do NOT construct
 *   manually.
 *
 *   This is the canonical overlap test for op-programs (replaces the native
 *   overlaps/past_wall gate that was deleted from process_large_object_collisions in
 *   G2b). The JS reference engine is FROZEN — intersects is a WASM-canonical
 *   addition only (JS reference keeps the old native gate).
 *
 *   Draw discipline: intersects draws ZERO RNG values (deterministic geometry).
 * @type {string[]}
 */
var FN_NAMES = Object.freeze(['min', 'max', 'floor', 'random', 'intersects']);

// ── Trigger vocabulary ─────────────────────────────────────────────────────────

/**
 * TRIGGERS — valid values for program.on.
 * @type {string[]}
 */
var TRIGGERS = Object.freeze(['collision', 'tick']);

// ── Reserved scope handles ─────────────────────────────────────────────────────

/**
 * HANDLE_FRAME — scope handle for the colliding frame in on:'collision' programs.
 * Reads Frame properties (§2.3 table: x, y, vx, vy, mass, …).
 * @type {number}
 */
var HANDLE_FRAME = 0;

/**
 * HANDLE_SELF — scope handle for the owning LO/emitter.
 * Reads LO descriptor properties (rect, count, …) or emitter properties.
 * @type {number}
 */
var HANDLE_SELF = 1;

/**
 * HANDLE_UNIVERSE — scope handle for universe read-only state.
 * Properties: 'tick' (u64), 'activeQuanta' (usize).
 * @type {number}
 */
var HANDLE_UNIVERSE = 2;

// ── Node shape helpers (JS-side construction) ──────────────────────────────────
//
// These are OPTIONAL helpers for constructing AST nodes from JS sugar.
// The shapes they produce are the canonical wire format — Rust deserializes
// the same JSON structure.  Using these helpers is not required; you may
// construct the object literal directly.

/**
 * Lit(n) — numeric literal node.
 * @param {number} value
 * @returns {{ kind:'Lit', value:number }}
 */
function Lit(value) {
    return { kind: 'Lit', value: value };
}

/**
 * Ref(handle, prop) — property read node.
 * @param {number} handle  — integer scope handle (HANDLE_FRAME / HANDLE_SELF / HANDLE_UNIVERSE / …)
 * @param {string} prop    — property name
 * @returns {{ kind:'Ref', handle:number, prop:string }}
 */
function Ref(handle, prop) {
    return { kind: 'Ref', handle: handle, prop: prop };
}

/**
 * Bin(op, a, b) — binary arithmetic node.
 * op must be a member of BIN_OPS.
 * @param {string} op
 * @param {*} a — ExprAST
 * @param {*} b — ExprAST
 * @returns {{ kind:'Bin', op:string, a:*, b:* }}
 */
function Bin(op, a, b) {
    return { kind: 'Bin', op: op, a: a, b: b };
}

/**
 * Cmp(op, a, b) — comparison node.  Returns 1 or 0.
 * op must be a member of CMP_OPS.
 * @param {string} op
 * @param {*} a — ExprAST
 * @param {*} b — ExprAST
 * @returns {{ kind:'Cmp', op:string, a:*, b:* }}
 */
function Cmp(op, a, b) {
    return { kind: 'Cmp', op: op, a: a, b: b };
}

/**
 * Cond(test, then_, else_) — conditional node.
 * @param {*} test  — ExprAST; truthy when non-zero
 * @param {*} then_ — ExprAST; result when test != 0
 * @param {*} else_ — ExprAST; result when test == 0
 * @returns {{ kind:'Cond', test:*, then:*, else:* }}
 */
function Cond(test, then_, else_) {
    return { kind: 'Cond', test: test, then: then_, else: else_ };
}

/**
 * Fn(name, args) — built-in function node.
 * name must be a member of FN_NAMES.
 * @param {string} name
 * @param {Array<*>} args — ExprAST[]
 * @returns {{ kind:'Fn', name:string, args:Array }}
 */
function Fn(name, args) {
    return { kind: 'Fn', name: name, args: args };
}

/**
 * StrLit(value) — string literal node (NODE_KINDS item 7).
 *
 * ONLY valid as the `to` value of a `set` op whose target is
 * `<handle>.data.<key>` (a string-map write into the frame bubble).
 *
 * ILLEGAL as a child of Bin / Cmp / Fn / Cond.test — eval_expr is
 * numeric-pure. The op-apply layer detects StrLit before calling eval_expr.
 *
 * @param {string} value
 * @returns {{ kind:'StrLit', value:string }}
 */
function StrLit(value) {
    return { kind: 'StrLit', value: value };
}

// ── Exports ────────────────────────────────────────────────────────────────────

export {
    NODE_KINDS,
    OP_KINDS,
    BIN_OPS,
    CMP_OPS,
    FN_NAMES,
    TRIGGERS,
    HANDLE_FRAME,
    HANDLE_SELF,
    HANDLE_UNIVERSE,
    Lit,
    Ref,
    Bin,
    Cmp,
    Cond,
    Fn,
    StrLit
};
