/* Copyright 2023-2026 by Essam Abadir */

/**
 * boot-failure.js — THE one boot-failure overlay painter.
 *
 *   paintBootFailure(axis, msg)   paint a FAIL-LOUD overlay for a boot axis ('engine' | 'renderer')
 *   setBootOverlayHost(el)        scope later overlays into `el` (the boot's `overlayHost`)
 *
 * A leaf: the boot module (boot.js) and any runner that discovers a boot fault after the boot
 * (FrqtlApp's empty-display-slot diagnosis) paint through this ONE painter.
 */

const AXIS_STYLE = {
    engine:   { id: 'egpt-engine-error',   marker: 'data-egpt-engine-error',   bg: '#1a0000', fg: '#ff6b6b', border: '#b6161c' },
    renderer: { id: 'egpt-renderer-error', marker: 'data-egpt-renderer-error', bg: '#000a1a', fg: '#6b9eff', border: '#1640b6' }
};
let _overlayHost = null;

/** The element the next overlays paint into (null = the full viewport) — set by the boot from its opts. */
export function setBootOverlayHost(el) { _overlayHost = el || null; }

/**
 * THE boot-failure overlay: scoped into the boot's overlay host when one was given, else the full
 * viewport. One overlay per axis (a second failure on the same axis does not stack). Console-loud too.
 *
 * @param {'engine'|'renderer'} axis  'engine' covers every non-renderer boot failure (engine, game layer, sketch)
 * @param {string} msg
 */
export function paintBootFailure(axis, msg) {
    const st = AXIS_STYLE[axis];
    if (!st) { throw new Error('[boot] paintBootFailure: axis must be engine | renderer (got ' + JSON.stringify(axis) + ')'); }
    if (typeof console !== 'undefined' && console.error) { console.error(msg); }
    function paint() {
        if (_overlayHost) {
            if (_overlayHost.querySelector && _overlayHost.querySelector('[' + st.marker + ']')) { return; }
            const b = document.createElement('div');
            b.setAttribute(st.marker, '1');
            b.setAttribute('data-egpt-boot-error', '1');
            b.style.cssText = 'position:absolute;inset:0;z-index:9998;background:' + st.bg + ';color:' + st.fg + ';' +
                'font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:14px;white-space:pre-wrap;overflow:auto;' +
                'border:2px solid ' + st.border + ';';
            b.textContent = msg;
            const cs = getComputedStyle(_overlayHost);
            if (!cs || cs.position === 'static') { _overlayHost.style.position = 'relative'; }
            _overlayHost.appendChild(b);
            return;
        }
        if (document.getElementById(st.id)) { return; }
        const b = document.createElement('div');
        b.id = st.id;
        b.setAttribute('data-egpt-boot-error', '1');
        b.style.cssText = 'position:fixed;inset:0;z-index:99999;background:' + st.bg + ';color:' + st.fg + ';' +
            'font:13px/1.55 ui-monospace,Menlo,Consolas,monospace;padding:22px;white-space:pre-wrap;overflow:auto;' +
            'border:2px solid ' + st.border + ';';
        b.textContent = msg;
        (document.body || document.documentElement).appendChild(b);
    }
    if (document.body) { paint(); } else { addEventListener('DOMContentLoaded', paint); }
}

