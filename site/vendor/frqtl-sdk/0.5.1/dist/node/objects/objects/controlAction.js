/* Copyright 2023-2026 by Essam Abadir */

/**
 * controlAction.js — OBJECTS-SIDE execution for an `action` control descriptor
 * (presentation pass Item 2, CEO-ratified E-P2a/E-P2b). The sibling of
 * `controlBind.js`, same home, same FAIL-LOUD style.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `resolveAction(action, ctx)` → `{ run() }`.
 *
 * Arrow ruling (mirrors the ratified bind split EXACTLY): `lib/shim/controls`
 * owns the NAME VOCABULARY (`ControlsSchema.ACTIONS` — the data shape);
 * EXECUTION — mapping a name to a live `FrqtlApp` method and calling it
 * — is OBJECTS-SIDE and lives here, beside the panel/overlay/sync sugar that
 * consumes it. Because of this split NO experiment page re-implements pause /
 * resume / restart plumbing: a page DECLARES `{kind:'action', action:'restart'}`
 * and every host (the page's own button, the panel, the canvas overlay) runs the
 * same one implementation.
 *
 *   ctx: { runner }  — the live FrqtlApp. Required.
 *
 * Every ACTIONS member maps to a method that exists on FrqtlApp:
 *
 *   pause   → runner.stop()      resume  → runner.start()
 *   toggle  → runner.toggle()    restart → runner.restart()
 *
 * FAIL-LOUD on an unknown action name, a missing runner, or a runner lacking the
 * mapped method — never a silent no-op (a dead button is exactly the bug class
 * this layer exists to prevent).
 *
 * ── Layer 2: physics behaviour ──────────────────────────────────────────────
 *
 * ZERO physics. These are RUN-LOOP verbs (start/stop the RAF loop, or replay the
 * scene the runner retained — a setup factory or a sketch build, `retainSceneReplay`). None of them touches a frame, a property accessor or
 * the engine RNG, so none can move a canonical-bench golden.
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

var _ControlsSchemaNode = (typeof module !== 'undefined' && module.exports)
    ? require('../../../shim/controls/index.js') : null;

/**
 * Resolve the control-descriptor schema (the ACTIONS vocabulary owner). Named
 * FAIL-LOUD guard — the same idiom controlBind.js/frqtl-controls-panel.js use;
 * never a relative ES import across the /frqtl ↔ /lib/shim mount boundary.
 */
function _getControlsSchema() {
    if (_ControlsSchemaNode) { return _ControlsSchemaNode; }
    if (typeof window !== 'undefined' && window.ControlsSchema) { return window.ControlsSchema; }
    throw new Error('[controlAction] window.ControlsSchema not available. Ensure ' +
        'lib/shim/controls/index.js is loaded before this file (stack-boot.js ENGINE array).');
}

/**
 * ACTION_METHODS — the ONE action-name → runner-method map. Keyed by the SAME
 * names `ControlsSchema.ACTIONS` blesses; a conformance test iterates ACTIONS and
 * asserts every member has a row here (drift is a test failure, never a runtime
 * surprise).
 */
var ACTION_METHODS = Object.freeze({
    pause:   'stop',
    resume:  'start',
    toggle:  'toggle',
    restart: 'restart'
});

/**
 * resolveAction(action, ctx) → { run() }.
 *
 * @param {string} action — a member of ControlsSchema.ACTIONS.
 * @param {{runner:object}} ctx
 * @returns {{run: () => *}}
 * @throws {Error} FAIL-LOUD — unknown action, missing ctx.runner, or a runner
 *   without the mapped method.
 */
function resolveAction(action, ctx) {
    var ACTIONS = _getControlsSchema().ACTIONS;
    if (ACTIONS.indexOf(action) === -1) {
        throw new Error('[controlAction] unknown action "' + String(action) + '" — must be one of [' +
            ACTIONS.join(', ') + '] (the closed vocabulary owned by lib/shim/controls). (FAIL-LOUD.)');
    }
    var method = ACTION_METHODS[action];
    var runner = ctx && ctx.runner;
    if (!runner) {
        throw new Error('[controlAction] resolveAction("' + action + '") requires ctx.runner (the live ' +
            'FrqtlApp). (FAIL-LOUD — never a silently dead button.)');
    }
    if (typeof runner[method] !== 'function') {
        throw new Error('[controlAction] resolveAction("' + action + '"): the runner has no "' + method +
            '" method — the action vocabulary and the runner surface have drifted. (FAIL-LOUD.)');
    }
    return {
        run: function () { return runner[method](); }
    };
}

// ── Export ────────────────────────────────────────────────────────────────────

var ControlAction = { resolveAction: resolveAction, ACTION_METHODS: ACTION_METHODS };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ControlAction;
} else if (typeof window !== 'undefined') {
    window.ControlAction = ControlAction;
}

})();
