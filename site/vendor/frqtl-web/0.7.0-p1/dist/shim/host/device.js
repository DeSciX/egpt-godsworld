/* Copyright 2023-2026 by Essam Abadir */

/**
 * device.js — the ONE rule for "this document is open on a phone".
 *
 *   MOBILE_DEVICE_QUERY   the media query: a coarse primary pointer (a finger, not a mouse) on a viewport no wider
 *                         than the widest phone held in landscape (932 CSS px, the iPhone Pro Max). A tablet in
 *                         portrait is narrower than that and counts as a phone; a touch laptop has a fine pointer
 *                         and does not.
 *   isMobileDevice(win)   win.matchMedia(MOBILE_DEVICE_QUERY).matches — evaluated in the window that LAYS OUT the
 *                         page (an app framed by the DeSciX shell measures its own frame). A window without
 *                         matchMedia THROWS: every browser has it, so its absence is a caller passing the wrong object.
 *
 * Its three consumers ask it once each, at load:
 *   - the host-view call site (lib/features/ide/studio/host-view-entry.js) asks the shell for NoChrome on a phone, CodeSite
 *     elsewhere;
 *   - STUDIO (lib/features/ide/AuthorView.jsx) opens with its side panels collapsed on a phone and puts its Hand tool
 *     between the camera joysticks (the phone toolbar Move | Hand | Look), and words its mirror "try it" for that
 *     surface (lib/features/ide/studio-try-it.js);
 *   - FraqtlIde (lib/features/ide/index.jsx) opens the STUDIO tab card with the controls of that surface
 *     (presets.js presetExplainerFor).
 * The static build compiles it into both: the stable host-view entry is bundled as its own self-contained module
 * (apps/ide/vite.config.js frqtl-host-view-entry), the IDE's rollup graph carries its own copy of the same source.
 *
 * Host-neutral ESM with no imports.
 */

/** A phone: a coarse primary pointer on a viewport no wider than a phone in landscape. */
export const MOBILE_DEVICE_QUERY = '(pointer: coarse) and (max-width: 932px)';

/**
 * @param {{matchMedia: function(string): {matches: boolean}}} win  the window the page is laid out in
 * @returns {boolean}
 * @throws {TypeError} a window without matchMedia
 */
export function isMobileDevice(win) {
    if (!win || typeof win.matchMedia !== 'function') {
        throw new TypeError('[device] isMobileDevice(win) needs the window the page is laid out in (a matchMedia ' +
            'function); got ' + (win === null ? 'null' : typeof win) + '. (FAIL-LOUD.)');
    }
    return win.matchMedia(MOBILE_DEVICE_QUERY).matches === true;
}
