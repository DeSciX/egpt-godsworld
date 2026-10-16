# `lib/shim/expr/` — Expression-AST wire & evaluation contract

This directory is the **cross-engine authority** for FRQTL op-program expressions:
the node shapes, the operator/function vocabularies, the reserved scope handles,
and the integer-first evaluation convention. The single source file is
[`ast-schema.js`](ast-schema.js) — a read-contract module that exports node
**shapes** and vocab **lists** only; it contains no parsing or evaluation logic
(`ast-schema.js:8-9`).

The contract is realized by the **Rust evaluator** (FRQTL is WASM-only). The
archived JS reference engine carried a parallel evaluator, retained as historical
provenance:

| Engine | Evaluator | Op-apply | Parses? |
|---|---|---|---|
| Rust / WASM (live) | `eval_expr(ast, &scope)` — `lib/frqtl/crates/egpt_engine/src/expr.rs:157` | `apply_set_op` path (caller of `eval_expr`) | **Never** — Rust only `serde`-deserializes the AST JSON (`expr.rs:8`, `:13-14`) |
| JS reference (archived) | `evalExpr(ast, scope)` — `internal/archive/frqtl-js-reference/EGPTfrqtl.js:2161` | `_runOpProgram(program, scope, opts)` — `EGPTfrqtl.js:2288` | Yes — the JS sugar/shim parses readable source → AST once (`lib/shim/expr`) |

A programmer implementing or extending either evaluator can rely on everything
below as the precise wire/eval contract.

---

## 1. Node kinds (`NODE_KINDS`)

`NODE_KINDS` is the complete, ordered, **closed** list of value-grammar node
kinds (`ast-schema.js:133-141`). Verified from the live module:

```
["Lit", "Ref", "Bin", "Cmp", "Cond", "Fn", "StrLit"]
```

The list is closed at 7 (`ast-schema.js:123`). Structural op-statement kinds are
**orthogonal** and live in `OP_KINDS` (§5) — do not add them here. The Rust enum
mirrors these exact discriminants via `#[serde(tag = "kind")]` (`expr.rs:32-85`).

Each node's exact data shape (and its optional JS constructor in `ast-schema.js`):

### `Lit` — numeric literal
- Shape: `{ kind:'Lit', value: number }` (`ast-schema.js:248-250`; Rust `value: f64`, `expr.rs:36-38`).
- Eval: returns `value` unchanged (`EGPTfrqtl.js:2167`; `expr.rs:159`).
- JSON number; rounded to integer only at the *write* boundary for integer-domain props (§4).

### `Ref` — property read via handle
- Shape: `{ kind:'Ref', handle: number, prop: string }` (`ast-schema.js:258-260`; Rust `handle: u32, prop: String`, `expr.rs:40-43`).
- `handle` is an **integer** scope index, never a string name (§3).
- Eval: reads `scope[handle][prop]` (§3 details the resolution / defaulting).

### `Bin` — binary arithmetic
- Shape: `{ kind:'Bin', op: BIN_OP, a: ExprAST, b: ExprAST }` (`ast-schema.js:270-272`; Rust boxes `a`/`b`, `expr.rs:47-53`).
- `op ∈ BIN_OPS` (§2). Eval recurses on both operands first (`EGPTfrqtl.js:2208-2209`; `expr.rs:166-167`).

### `Cmp` — comparison → 1/0
- Shape: `{ kind:'Cmp', op: CMP_OP, a: ExprAST, b: ExprAST }` (`ast-schema.js:282-284`; `expr.rs:56-62`).
- `op ∈ CMP_OPS` (§2). Returns the **integer** `1` (true) or `0` (false), never a boolean.

### `Cond` — conditional
- Shape: `{ kind:'Cond', test: ExprAST, then: ExprAST, else: ExprAST }` (`ast-schema.js:293-295`).
- Rust field names: `then`/`else` are JSON keys renamed to `then_branch`/`else_branch` (`expr.rs:64-70`).
- Eval: `test != 0 ? then : else` — truthy means non-zero (`EGPTfrqtl.js:2236-2239`; `expr.rs:200-207`).

### `Fn` — built-in function
- Shape: `{ kind:'Fn', name: FN_NAME, args: ExprAST[] }` (`ast-schema.js:304-306`; `expr.rs:72-75`).
- `name ∈ FN_NAMES` (§2). `min`/`max` take 2 args; `floor` takes 1 (`EGPTfrqtl.js:2244-2249`; `expr.rs:210-225`).

### `StrLit` — string literal (the terminal special case)
- Shape: `{ kind:'StrLit', value: string }` (`ast-schema.js:320-322`; Rust `value: String`, `expr.rs:82-84`).
- **`StrLit` is NOT a numeric node.** The numeric evaluators are numeric-pure:
  if `evalExpr` / `eval_expr` ever reaches a `StrLit`, it **FAILs LOUD** —
  `TypeError` in JS (`EGPTfrqtl.js:2255-2266`), `panic!` in Rust
  (`expr.rs:230-244`), with symmetric messages.
- A `StrLit` is **legal only** as the `to` value of a `set` op whose target is
  `<handle>.data.<key>` (a string-map write). It is intercepted in the op-apply
  layer **before** the numeric evaluator is called (§6). It is **illegal** as a
  child of `Bin`, `Cmp`, `Fn`, or `Cond.test` — placing it there reaches the
  numeric evaluator and triggers the fail-loud.

---

## 2. Operator & function vocabularies

Verified from the live module:

| Export | Source | Values |
|---|---|---|
| `BIN_OPS` | `ast-schema.js:183` | `["+", "-", "*", "/"]` |
| `CMP_OPS` | `ast-schema.js:190` | `["<", ">", "=="]` |
| `FN_NAMES` | `ast-schema.js:229` | `["min", "max", "floor", "random", "intersects"]` |
| `TRIGGERS` | `ast-schema.js:237` | `["collision", "tick"]` |

(`random` draws one value from the engine's single Mulberry32 stream; `intersects(h0,h1)` calls the
native `Rectangle::intersects` geometry primitive — both are **WASM-canonical** additions: the frozen
JS reference's `evalExpr` implements only `min`/`max`/`floor` and keeps its old native gate. See
`ast-schema.js:193-228`.)

An unknown `op` (Bin/Cmp) or `name` (Fn) is fail-loud in **both** engines —
`TypeError` in JS (`EGPTfrqtl.js:2219, 2231, 2251`), `panic!` in Rust
(`expr.rs:184, 196, 226`).

---

## 3. Handle resolution & evaluation scope

Named object references compile to **integer handles JS-side** before the AST
crosses any boundary. The Rust side parses only `<number>.<string>` — there is no
string-name registry in Rust (`ast-schema.js:73-76`; `expr.rs:13-14`).

Reserved scope handles (`ast-schema.js:220, 227, 234`; verified live = `0`, `1`, `2`):

| Constant | Value | Bag |
|---|---|---|
| `HANDLE_FRAME` | `0` | the colliding frame (`on:'collision'` only) — Frame properties |
| `HANDLE_SELF` | `1` | this LO / emitter — LO descriptor / emitter properties |
| `HANDLE_UNIVERSE` | `2` | universe read-only — e.g. `tick`, `activeQuanta` |
| `3, 4, 5, …` | — | named refs (other registered objects, `on:'tick'`) |

Scope contents per trigger (`ast-schema.js:79-87`):
- `on:'collision'` — `0` frame, `1` self, `2` universe.
- `on:'tick'` — `1` self, `2` universe, `3+` named refs.

**`Ref` read semantics (JS, `EGPTfrqtl.js:2169-2204`):**
1. Missing handle (`undefined`/`null` bag) → `TypeError` fail-loud (`:2171-2172`).
2. Direct property `bag[prop]` if present (covers `vx, vy, mass, count, active, …`).
3. Else, if the bag has a `rect`, map rect-derived geometry — `x, y, left, top,
   right, bottom, w, h`, plus LO aliases `cx`/`cy` (= rect center) and the
   frame-only computed `fullness` (`mass/capacity`, or `0` when `capacity<=0`)
   (`:2183-2199`).
4. Any other prop (or no `rect`) → **`0`** (`:2198, 2201`).
5. The result is coerced numeric: a number passes through; anything else becomes
   `1`/`0` by truthiness (`:2204`).

**`Ref` read semantics (Rust, `expr.rs:127-133, 161-163`):** `Scope::read`
returns the bag's `f64` for `prop`, or `0.0` if the handle or prop is absent. The
Rust scope is a pre-flattened `HashMap<u32, HashMap<String, f64>>` — the engine's
`frame_to_scope_bag` / `lo_to_scope_bag` pre-flatten the same rect-derived
geometry the JS `Ref` resolves on the fly, so both engines read identical
property names. (Rust read does **not** fail-loud on a missing handle; it returns
`0.0` — the JS-side compile of handles is what guarantees a valid handle reaches
the engine.)

`Scope::write` (`expr.rs:136-141`) exists so an op can read back a value it set
earlier in the same program (e.g. `self.count`).

---

## 4. Integer-first evaluation convention

The evaluators operate on the raw numeric values from scope. The convention
(`ast-schema.js:89-98`) is verified in both engines:

| Rule | JS | Rust |
|---|---|---|
| `+`, `-`, `*` | native (`EGPTfrqtl.js:2211-2213`) | native f64 (`expr.rs:169-171`) |
| `/` — **integer division, truncate toward zero** | `Math.trunc(a/b)` (`:2217`) | `(a as i64 / b as i64) as f64` (`expr.rs:177-179`) |
| `/` by zero → **`0`** (not an error) | `if (b===0) return 0` (`:2216`) | `if bv == 0.0 { 0.0 }` (`expr.rs:174`) |
| `Cmp` → integer `1`/`0` | `:2227-2229` | `1.0`/`0.0` (`expr.rs:193-195`) |
| `floor` — true floor (not trunc) | `Math.floor(x)` (`:2249`) | `a.floor()` (`expr.rs:224`) |
| `min`/`max` | `Math.min`/`Math.max` (`:2245-2247`) | `a.min(b)`/`a.max(b)` (`expr.rs:214, 219`) |

**`/` truncate ≠ `floor` for negatives** — this is the load-bearing divergence
the conformance suite pins:

```
Bin('/', Lit(7),  Lit(2))  → 3    (trunc, not 3.5)
Bin('/', Lit(-7), Lit(2))  → -3   (toward zero, NOT floor(-3.5) = -4)
Fn('floor', [Lit(-7.9)])   → -8   (floor, NOT trunc(-7.9) = -7)
```

(Source comments `ast-schema.js:102-104`; Rust unit tests `expr.rs:293-350`.)

Floats are **not** silently written into integer-domain properties. The numeric
result is produced as above; the **`set` op** rounds (`Math.round` / Rust
`f64.round()`) before writing an integer-domain prop, per the Frame / LO property
tables (`ast-schema.js:96-98`). Example: the writable LO `count` write truncates
to integer (`EGPTfrqtl.js:1520`).

---

## 5. Op-program shape & op kinds (`OP_KINDS`)

An op-program is `{ on: TRIGGER, ops: ExprStatement[] }` (`ast-schema.js:64-66`;
Rust `OpProgram { on: String, ops: Vec<SetOp> }`, `expr.rs:101-105`).

`OP_KINDS` — the ordered, **closed** list of op-statement kinds, orthogonal to
`NODE_KINDS` (`ast-schema.js:172`). §2e (2026-06-24): collapsed to `['set']`.

```
["set"]
```

Op statement shapes:

| Op | Shape | Routing |
|---|---|---|
| `set` | `{ kind:'set', set:'<handle>.<prop>', to: ExprAST }` | property write — `setFrameProperty` (handle 0) / `setObjectProperty` (others) |

**Structural operations use engine methods, not op-kinds:**
- Frame injection → emitters / `makeLeafFrame` / `createFrameFromRect` / `insert`
- Frame removal → `set 0.is_alive=0` + dead-parent GC
- Dimension allocation → `universe.addDimension(n)` / `add_dimension` engine method

`set` target format is `'<integer-handle>.<prop>'`. JS parses it with
`indexOf('.')` then `parseInt` — a missing `.` or non-integer handle is fail-loud
(`EGPTfrqtl.js:2294-2303`). Rust parses it identically via `parse_set_target`,
splitting on the **first** `.` so dotted props like `data.detector_name` keep the
remainder intact (`expr.rs:250-262`; Rust test `:422-428`).

---

## 6. The `set` apply path & the StrLit terminal

`_runOpProgram` (JS, `EGPTfrqtl.js:2288-2354`) runs `ops` in order. For each op:

1. Parse `set` target into `(handle, prop)` (fail-loud on bad format).
2. **StrLit intercept (before any numeric eval)** — if `op.to.kind === 'StrLit'`
   (`:2309-2330`):
   - `handle` must be `0` (frame), else `TypeError` (`:2310-2314`).
   - `opts.frameId` is required (`:2316-2317`).
   - `prop` must be `data.<key>`, else `TypeError` (`:2320-2324`).
   - The string is written into the frame's `data.string_map[key]` via
     `_setFrameStringMapKey` (`:2325-2328`, `:2367-2375`); the op `continue`s —
     `evalExpr` is never called on a `StrLit`.
3. Otherwise evaluate `op.to` numerically (`:2332`) and route the value:
   - `handle === 0` → `setFrameProperty(opts.frameId, prop, value)` (requires
     `opts.frameId`, `:2334-2340`).
   - `handle >= 1` → `_setObjectProperty_lo(bag._loHandle, prop, value)`, which
     delegates to the **schema-validated** `updateObjectProperty` — unknown /
     readonly / non-schema props throw (THROW-OR-APPLY, never silent;
     `:2342-2353`, `:2393-2399`). A bag with no `_loHandle` (universe / non-LO) is
     read-only and throws (`:2350-2351`).

The Rust side mirrors this: `eval_expr` is numeric-pure and panics on `StrLit`
(`expr.rs:230-244`); the op-apply layer intercepts `StrLit` before calling
`eval_expr` (`expr.rs:30-31`). Both engines therefore agree that a `StrLit`
reaching the numeric evaluator is a contract violation, not a coercion.

---

## 7. Crossing to WASM — the JSON-string route

The JS sugar/shim parses source → AST exactly **once**; Rust never parses, it deserializes. The
op-program AST crosses to WASM as a **JSON string**, not as a `JsValue` object map
(`lib/frqtl/compat/providers/wasm-engine.js:384-402`):

- `serde_wasm_bindgen` v0.6 cannot deserialize an internally-tagged enum
  (`#[serde(tag="kind")]`) from a `JsValue` object map — it cannot resolve the
  `"kind"` discriminant during tagged-enum dispatch (`wasm-engine.js:385-391`).
- So `registerLargeObject` **strips** `program` from the spec, registers the LO
  **without** it, then attaches it via
  `set_large_object_program_json(handle, JSON.stringify(programPayload))`
  (`wasm-engine.js:392-400`). `serde_json` on a JSON **string** handles the
  tagged enum correctly — this is required for `StrLit` and works for all node
  kinds (`wasm-engine.js:391`).
- Replacing/attaching a program later (e.g. eject programs on walls) takes the
  same JSON-string route via `set_large_object_program_json`
  (`wasm-engine.js:556-564`).

On the Rust side these JSON strings deserialize into `OpProgram` / `SetOp` /
`ExprAST` directly (`expr.rs:91-105`; round-trip tests `:398-420`).

---

## 8. Conformance — the bit-identity gate

The expression contract is locked by
[`lib/frqtl/conformance/expr_program_scenarios.js`](../../frqtl/conformance/expr_program_scenarios.js),
which **imports `ast-schema.js` and iterates its vocab lists**
(`expr_program_scenarios.js:79-80`, `:87-88`, `:109`). It is table-driven and
covers round-trip evaluation, the negative/fail-loud cases, and JS↔WASM throw
parity. Highlights, verified in the file:

- Coverage gate **EP16** asserts every `NODE_KINDS`, `BIN_OPS`, `CMP_OPS`, and
  `FN_NAMES` member has at least one scenario (`:1213-1240`) — extending any
  vocab list without a scenario fails the gate.
- **EP8** pins `floor(negative) ≠ trunc` (`:342-356`); the Bin-`/` cases pin
  trunc-toward-zero with the `trunc(-3.5)=-3` vs `floor(-3.5)=-4` distinguisher
  (`:258`).
- **EP17–EP20** assert unknown-LO-prop throws on JS, on WASM, with JS↔WASM
  throw-parity, and that a `doTick()` op-program with an unknown prop throws
  rather than silently writing (`:578-666` and the EP20 header `:29`).
- `StrLit` (`NODE_KINDS` #7) is exercised in the EP31–EP32 scenarios
  (`:109`, `:1217`).

There is **no tolerance band** — scenarios assert per-frame state, RNG-call
count, and recording bit-identity between the JS reference and the Rust/WASM
engine. For the run procedure (which WASM target to build — `pkg-node` via
`wasm-pack … --target nodejs`), see
[`lib/frqtl/conformance/README.md`](../../frqtl/conformance/README.md) §Run.

---

## 9. Extending the evaluator — checklist

1. Add the kind to `NODE_KINDS` (value grammar) **or** `OP_KINDS` (statement) in
   `ast-schema.js` — they are orthogonal; pick the right list.
2. Add the JSON shape (+ optional JS constructor) and document its eval rule in
   the `ast-schema.js` header.
3. Implement it in **both** `evalExpr` (`EGPTfrqtl.js`) and `eval_expr`
   (`expr.rs`) identically — integer-first (`/` trunc toward zero, div-by-zero
   → 0, `Cmp` → 1/0), fail-loud on unknown ops/kinds, never a silent fallback.
4. Keep the numeric evaluator numeric-pure: any non-numeric terminal (like
   `StrLit`) must be intercepted in the op-apply layer and must fail-loud if it
   reaches the evaluator.
5. Confirm the WASM JSON-string route still deserializes the new shape
   (tagged-enum via `serde_json` on a string, not `JsValue`).
6. Add a conformance scenario in `expr_program_scenarios.js` (the EP16 gate will
   otherwise fail) — include the adversarial / negative case.
