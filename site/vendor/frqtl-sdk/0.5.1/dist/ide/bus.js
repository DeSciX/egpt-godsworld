/* Copyright 2023-2026 by Essam Abadir */

/**
 * Bus — the single shared event bus for all Common IDE components.
 *
 * Named ESM export. A missing import of this module is a hard FAIL-LOUD load
 * error (no silent window.CommonBus fallback).
 *
 * Plain synchronous pub/sub; no async, no queuing.
 *
 * ── Canonical event catalogue (frozen) ─────────────────────────────────────
 *
 *  run:request          { source: 'frqtl'|'math', code: string, fileId: string, sourceUrl?: string }
 *  run:result           { source: 'frqtl'|'math', ok: boolean, error?: string }
 *  console:write        { level: 'info'|'warn'|'error'|'pass'|'fail', text: string }
 *  console:clear        {}
 *  render:frame         { universe?: object, tickData?: object }
 *  engine:tick          { tick: number, metrics: object }
 *  engine:error         { message: string }
 *  pane:show/hide/focus/resize/layout
 *
 * ── kind enum (frozen) ──────────────────────────────────────────────────────
 *  'frqtl'  physics JS code  |  'math'  EGPT Math SDK JS code
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   import { Bus } from 'lib/shim';
 *   Bus.on('console:write', function(payload) { ... });
 *   Bus.emit('console:write', { level: 'info', text: 'hello' });
 *   Bus.off('console:write', handler);
 */

'use strict';

var _listeners = Object.create(null); // event → Array<fn>

export const Bus = {
    on: function (event, fn) {
        if (!_listeners[event]) { _listeners[event] = []; }
        _listeners[event].push(fn);
    },
    off: function (event, fn) {
        if (!_listeners[event]) { return; }
        _listeners[event] = _listeners[event].filter(function (f) { return f !== fn; });
    },
    emit: function (event, payload) {
        var fns = _listeners[event];
        if (!fns || !fns.length) { return; }
        var snap = fns.slice();
        for (var i = 0; i < snap.length; i++) {
            try {
                snap[i](payload);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[Bus] handler error on "' + event + '":', e);
                }
            }
        }
    },
    once: function (event, fn) {
        var bus = this;
        var wrapper = function (payload) {
            bus.off(event, wrapper);
            fn(payload);
        };
        this.on(event, wrapper);
    }
};
