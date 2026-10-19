/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-host-view.js — the ONE place this site asks the DeSciX shell for a view, and the ONE owner of the mobile rule.
 *
 * The declarer is the package's: `declareHostView` from `@descix/frqtl-web/host-view` (through the page's import map).
 * It reads the shell's published `view.MODES` before any `view.set`, never decides on set's throw, and records what it
 * met on `<html data-descix-view>` (+ `data-descix-view-detail`): requested:<mode>, fallback:<mode>, unoffered:<mode>,
 * or a contract-violated edge (view-no-modes, set-threw, …). This file holds only the POLICY:
 *   - a phone (PHONE_QUERY: the DEVICE, never the frame) asks for NoChrome: the shell hides its top bar, padding and chat
 *     (the Powch panel stays mounted, so DeSciX.powch.login() still opens it), with CodeSite as the declared second choice;
 *   - anything else asks for CodeSite (the whole frame). The declarer refuses a fallback equal to the mode, so this ask
 *     names none.
 * The view is declared ONCE, at boot on the device rule, when this module is first evaluated: index.html loads it, and maxi-lab.js imports it (one
 * module instance per page), so the lab's own full-screen door comes after it. The outcome is logged once under
 * HOST_VIEW_LOG; a shell that breaks its view contract is a console.error naming the shell.
 */

import { declareHostView } from '@descix/frqtl-web/host-view';

/** The two thresholds, in CSS px: the ONE spelling of the numbers both rules below are built from. */
export const BREAKPOINTS = Object.freeze({ width: 720, height: 600 });

/**
 * The LAYOUT rule, about the FRAME (the space the page has): a narrow viewport (portrait phones, narrow windows), OR a touch
 * screen that is short (a phone in landscape, 844x390, is wider than BREAKPOINTS.width but only ~390 tall; a tablet in landscape is 768+
 * tall and keeps the desktop layout, and a short desktop window has a fine pointer). app.html's mobile @media block carries
 * this exact query (scripts/test/host-view.test.mjs holds the two equal and refuses any other spelling).
 */
export const MOBILE_QUERY = `(max-width: ${BREAKPOINTS.width}px), (pointer: coarse) and (max-height: ${BREAKPOINTS.height}px)`;

/**
 * The CHROME rule, about the DEVICE: a coarse pointer on a small screen (portrait or landscape). Never the frame: at boot the
 * frame is still the shell's default SplitView width (a 960 px desktop window frames the page at 684 px), so a frame rule
 * would strip a desktop's chrome. The device-* features read the screen inside the shell's frame (measured: they agree with
 * screen.width/height). An iPad (coarse, 768x1024 either way round) is not a phone: CodeSite.
 */
export const PHONE_QUERY = `(pointer: coarse) and (max-device-width: ${BREAKPOINTS.width}px), (pointer: coarse) and (max-device-height: ${BREAKPOINTS.height}px)`;

/** The fixed console prefix of the one outcome line. */
export const HOST_VIEW_LOG = '[maxi-host-view]';

/** The view this site asks for: NoChrome on a phone (PHONE_QUERY) with CodeSite declared as the second choice, else CodeSite. */
export function hostViewAsk(phone) {
    return phone ? { mode: 'NoChrome', fallback: 'CodeSite' } : { mode: 'CodeSite' };
}

/**
 * Declare the view for `win` (a window), log the outcome once on `out` (a console), and return the declarer's outcome
 * {row, record, detail?}. A contract-violated row (the shell published a view surface that broke its own shape:
 * view-no-modes, set-threw, …) is out.error naming the shell; every other row is out.info.
 */
export async function declareSiteHostView(win, out) {
    const phone = win.matchMedia(PHONE_QUERY).matches;
    const outcome = await declareHostView(Object.assign({ sdk: win.DeSciX, root: win.document.documentElement }, hostViewAsk(phone)));
    const line = HOST_VIEW_LOG + ' ' + outcome.record + (outcome.detail ? ' — ' + outcome.detail : '');
    if (outcome.row === 'contract-violated') {
        out.error(line + ' — the DeSciX shell broke its view contract (its published view surface); the page keeps the view the shell gave it.');
    } else {
        out.info(line);
    }
    return outcome;
}

/** The page's one declaration: a Promise of the outcome (maxi-lab.js shows its record in the status line). */
export const hostView = declareSiteHostView(window, console);
