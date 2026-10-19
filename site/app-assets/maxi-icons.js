/* Copyright 2023-2026 by Essam Abadir */

/**
 * maxi-icons.js — the lab header's icons, from the PUBLISHED Material icons package the DeSciX app SDK depends on.
 *
 * The ONE owner of: which upstream icon file draws which header role (ICON_FILES), how an upstream icon file is
 * read (iconShape), loading them against the pin (loadIcons) and painting a header button (iconButton).
 *
 * The files are vendored byte-exact under ../vendor/mui-icons/<version>/ and listed with their sha256 in
 * ../vendor/mui-icons/PINNED.json (scripts/test/mui-icons.test.mjs holds the copy to the pin and the pin to the
 * published tarball). Each upstream file is a React module wrapping ONE SVG element (a path or a circle in a
 * 24x24 viewBox). No React runs here: the element is read off the file's text by its exact shape and drawn as an
 * inline <svg> whose fill is currentColor, so the button's own colour (the pressed cyan, the recording red)
 * paints the icon. A file of any other shape is refused by name.
 *
 * The button's words stay in its <span class="label"> (shown on wide screens, hidden on phones by app.html's
 * mobile @media block) and in its aria-label, so the button is named the same whether or not the label shows.
 */

/** Header role → the upstream file (relative to the vendored version directory) that draws it. */
export const ICON_FILES = Object.freeze({
    play: 'esm/PlayArrow.js',
    pause: 'esm/Pause.js',
    restart: 'esm/RestartAlt.js',
    hand: 'esm/PanTool.js',
    record: 'esm/FiberManualRecord.js',
    stop: 'esm/Stop.js',
    code: 'esm/Code.js',
    info: 'esm/Info.js',
    fullscreen: 'esm/Fullscreen.js',
    fullscreenExit: 'esm/FullscreenExit.js'
});

/** The vendored package directory, relative to this module. */
export const VENDOR_DIR = '../vendor/mui-icons/';

/** The SVG elements and attributes an upstream icon may carry here; anything else is refused by name. */
const ELEMENT_ATTRS = Object.freeze({ path: Object.freeze(['d']), circle: Object.freeze(['cx', 'cy', 'r']) });

/** An upstream esm icon file, exactly: one createSvgIcon call around one _jsx element. */
const SHAPE = /^"use client";\n\nimport createSvgIcon from "\.\/utils\/createSvgIcon\.js";\nimport \{ jsx as _jsx \} from "react\/jsx-runtime";\nexport default createSvgIcon\(\/\*#__PURE__\*\/_jsx\("([a-z]+)", \{\n((?:  [a-z]+: "[^"\n]*",?\n)+)\}\), '([A-Za-z0-9]+)'\);$/;

/**
 * Reads an upstream icon file's text: {name, tag, attrs}. THROWS naming the file when the text is not one
 * createSvgIcon(_jsx(<path|circle>, {…}), '<Name>') whose Name is the file's own base name.
 */
export function iconShape(text, file) {
    const m = SHAPE.exec(text);
    if (!m) { throw new Error('[maxi-icons] ' + file + ' is not one createSvgIcon(_jsx(<element>, {…}), \'<Name>\') call: the upstream file changed shape, so its icon cannot be read here.'); }
    const [, tag, body, name] = m;
    const base = file.split('/').pop().replace(/\.js$/, '');
    if (name !== base) { throw new Error('[maxi-icons] ' + file + ' names its icon ' + JSON.stringify(name) + ', not its file name ' + JSON.stringify(base) + '.'); }
    const allowed = ELEMENT_ATTRS[tag];
    if (!allowed) { throw new Error('[maxi-icons] ' + file + ' draws a <' + tag + '>; the header draws only ' + Object.keys(ELEMENT_ATTRS).join(' / ') + '.'); }
    const attrs = {};
    for (const line of body.split('\n').filter(Boolean)) {
        const a = /^  ([a-z]+): "([^"]*)",?$/.exec(line);
        if (!a || !allowed.includes(a[1])) { throw new Error('[maxi-icons] ' + file + ': <' + tag + '> carries ' + JSON.stringify(line.trim()) + '; allowed: ' + allowed.join(', ') + '.'); }
        attrs[a[1]] = a[2];
    }
    for (const k of allowed) { if (!(k in attrs)) { throw new Error('[maxi-icons] ' + file + ': <' + tag + '> lacks ' + k + '.'); } }
    return Object.freeze({ name, tag, attrs: Object.freeze(attrs) });
}

/**
 * Loads every ICON_FILES role against the pin. `fetchText(rel)` answers the text of a path relative to the vendored
 * package directory (PINNED.json, <version>/<file>). Resolves {version, shapes: {role: iconShape}}; THROWS naming
 * the role when the pin does not list its file, or the file does not read.
 */
export async function loadIcons(fetchText, files = ICON_FILES) {
    const pin = JSON.parse(await fetchText('PINNED.json'));
    if (!pin || typeof pin.version !== 'string' || !pin.files || typeof pin.files !== 'object') {
        throw new Error('[maxi-icons] the vendored PINNED.json has no version or files list.');
    }
    const roles = Object.entries(files);
    for (const [role, file] of roles) {
        if (!Object.prototype.hasOwnProperty.call(pin.files, file)) {
            throw new Error('[maxi-icons] the icon for "' + role + '" is ' + file + ', which the pin (vendor/mui-icons/PINNED.json, ' + pin.name + '@' + pin.version + ') does not list.');
        }
    }
    // all at once: the header waits on one round trip, not one per icon
    const texts = await Promise.all(roles.map(([, file]) => fetchText(pin.version + '/' + file)));
    const shapes = {};
    roles.forEach(([role, file], i) => { shapes[role] = iconShape(texts[i], file); });
    return Object.freeze({ version: pin.version, shapes: Object.freeze(shapes) });
}

/** The page's icons: loadIcons over this module's own URL. */
export function loadPageIcons() {
    const base = new URL(VENDOR_DIR, import.meta.url);
    return loadIcons(async function (rel) {
        const url = new URL(rel, base);
        const res = await fetch(url);
        if (!res.ok) { throw new Error('[maxi-icons] ' + url.href + ' answered HTTP ' + res.status + ': the vendored icons are not beside the page.'); }
        return res.text();
    });
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Paints `button` with the role's icon and its words: the icon goes first, `words` into its <span class="label">
 * and its aria-label. `words` omitted keeps the label's own text (the page's words). Repaints only what changed,
 * so a status tick never rebuilds the icon. THROWS by name when the role is unknown or the button has no label.
 */
export function iconButton(button, icons, role, words) {
    const shape = icons && icons.shapes && icons.shapes[role];
    if (!shape) { throw new Error('[maxi-icons] no icon for "' + role + '" (roles: ' + Object.keys(ICON_FILES).join(', ') + ').'); }
    const label = button.querySelector(':scope > .label');
    if (!label) { throw new Error('[maxi-icons] #' + button.id + ' has no <span class="label"> to carry its words.'); }
    if (button.dataset.icon !== role) {
        const doc = button.ownerDocument;
        const svg = doc.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const el = doc.createElementNS(SVG_NS, shape.tag);
        for (const [k, v] of Object.entries(shape.attrs)) { el.setAttribute(k, v); }
        svg.appendChild(el);
        const old = button.querySelector(':scope > svg.icon');
        if (old) { old.replaceWith(svg); } else { button.insertBefore(svg, button.firstChild); }
        button.dataset.icon = role;
    }
    const text = words === undefined ? label.textContent : words;
    if (label.textContent !== text) { label.textContent = text; }
    if (button.getAttribute('aria-label') !== text) { button.setAttribute('aria-label', text); }
}
