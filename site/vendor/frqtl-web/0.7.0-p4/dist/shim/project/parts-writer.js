/* Copyright 2023-2026 by Essam Abadir */

/**
 * parts-writer.js — THE text patcher of a sketch's `export const parts = {…}` literal.
 *
 *   patchParts(text, edits[, { entry }]) → { text, changes, refused }
 *
 * The sketch is parsed once (acorn, vendored: lib/frqtl/assets/vendor/acorn.mjs) into a syntax tree with
 * source ranges. Only the ranges an edit touches are replaced; every other byte of the file — untouched
 * entries, untouched properties, expressions, spreads, comments, the author's code — is the input's byte.
 *
 *   edits[i] = { op: 'set',    name, props }          within entry `name`'s props object, replace ONLY the
 *                                                     value text of each named property; a property the
 *                                                     literal lacks is appended last in that entry
 *            | { op: 'add',    name, Kind, module, props }   a new entry as the LAST key, plus at most one
 *                                                     import line for Kind (after the last import statement;
 *                                                     `module` from parts-module.js moduleOfKind)
 *            | { op: 'remove', name }                 the entry's property node, its comma included
 *            | { op: 'kind',   name, Kind, module }   within entry `name`, replace ONLY its Kind identifier's text, plus
 *                                                     at most one import line for Kind (the add's line, after the last
 *                                                     import); the entry's old import line is the author's and stays,
 *                                                     even when nothing uses it now (a fork: exp.fork)
 *
 *   changes[i] = { op, name, key?, from?, to, literalized? }   from/to are source TEXT; `literalized: true`
 *                when the old value was an expression (its text is `from`), now its literal value
 *   refused[i] = { op, name, key?, reason }           every edit not applied, with why. Never silent.
 *
 * REFUSED (named, into `refused`): a sketch with no `export const parts = { … }` object literal (every edit);
 * a touched entry whose value is not `[Identifier, { … }]`; a touched name the literal does not hold as a
 * plain key while it carries a spread or a computed key (the name may come from either); an added Kind whose
 * identifier is already bound in the file to something else; an added Kind with `module === null`; a value
 * the serializer cannot write (a function, NaN/Infinity, undefined, a class instance), naming its key.
 *
 *   entryKeys(text, name) → string[]    the plain prop keys entry `name` spells (how an entry spells a value)
 *   entryLiteral(text, name, key) → { literal, value?, length? }   what a key declares when it is a literal
 *                                       (read-back); an array expression's element count otherwise (none when
 *                                       an element is a spread)
 *
 *   serializeValue(value, key) → text   THE one value serializer: numbers, strings (single-quoted),
 *                                       booleans, null, arrays inline, plain objects. Anything else THROWS
 *                                       naming the key.
 */

import { parse } from '../../frqtl/assets/vendor/acorn.mjs';
import { importSpecifierOf } from './parts-module.js';

/**
 * parseModule(text) → the acorn syntax tree of an ES module (latest syntax, source ranges) — the vendored parser's
 * ONE entry point in the tree; every other reader of a project file's syntax (fork.js) parses through it.
 */
export function parseModule(text) {
    return parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
}

/** The export the writer patches. */
export const PARTS_EXPORT = 'parts';

const _IDENT = /^[A-Za-z_$][\w$]*$/;
const _RESERVED = new Set(('break case catch class const continue debugger default delete do else export extends ' +
    'false finally for function if import in instanceof new null return super switch this throw true try typeof ' +
    'var void while with yield let static enum await implements package protected interface private public').split(' '));

/**
 * isIdentifierName(s) → true when `s` can name a binding (an identifier that is not a reserved word) — the one
 * test the writer and the fork transform share.
 */
export function isIdentifierName(s) {
    return typeof s === 'string' && _IDENT.test(s) && !_RESERVED.has(s);
}

function _keyText(k) {
    return (_IDENT.test(k) && !_RESERVED.has(k)) ? k : _quote(k);
}

function _quote(s) {
    return '\'' + s.replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/\n/g, '\\n').replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + '\'';
}

/**
 * @param {*} v
 * @param {string} key — named in a refusal
 * @returns {string}
 */
export function serializeValue(v, key) {
    if (v === null) { return 'null'; }
    const t = typeof v;
    if (t === 'number') {
        if (!Number.isFinite(v)) { throw new Error('"' + key + '" is ' + String(v) + ' — the writer writes finite numbers only.'); }
        return Object.is(v, -0) ? '0' : String(v);
    }
    if (t === 'string') { return _quote(v); }
    if (t === 'boolean') { return v ? 'true' : 'false'; }
    if (Array.isArray(v)) {
        return '[' + v.map(function (x, i) { return serializeValue(x, key + '[' + i + ']'); }).join(', ') + ']';
    }
    if (t === 'object') {
        const proto = Object.getPrototypeOf(v);
        if (proto !== Object.prototype && proto !== null) {
            throw new Error('"' + key + '" is a ' + ((v.constructor && v.constructor.name) || 'class') +
                ' instance — the writer writes numbers, strings, booleans, null, arrays and plain objects.');
        }
        const ks = Object.keys(v);
        if (!ks.length) { return '{}'; }
        return '{ ' + ks.map(function (k) { return _keyText(k) + ': ' + serializeValue(v[k], key + '.' + k); }).join(', ') + ' }';
    }
    throw new Error('"' + key + '" is ' + (t === 'undefined' ? 'undefined' : 'a ' + t) +
        ' — the writer writes numbers, strings, booleans, null, arrays and plain objects.');
}

/** A node whose text IS its value: a literal (not a regex), a negated number, or arrays/objects of those. */
function _isLiteral(n) {
    if (!n) { return false; }
    if (n.type === 'Literal') { return !n.regex && typeof n.value !== 'bigint'; }
    if (n.type === 'UnaryExpression' && n.operator === '-') { return n.argument.type === 'Literal' && typeof n.argument.value === 'number'; }
    if (n.type === 'ArrayExpression') { return n.elements.every(function (e) { return e && _isLiteral(e); }); }
    if (n.type === 'ObjectExpression') {
        return n.properties.every(function (p) {
            return p.type === 'Property' && !p.computed && p.kind === 'init' && !p.method && !p.shorthand && _isLiteral(p.value);
        });
    }
    return false;
}

/** The plain (non-computed) key of a Property node, else null. */
function _plainKey(p) {
    if (p.type !== 'Property' || p.computed) { return null; }
    if (p.key.type === 'Identifier') { return p.key.name; }
    if (p.key.type === 'Literal' && (typeof p.key.value === 'string' || typeof p.key.value === 'number')) { return String(p.key.value); }
    return null;
}

/** The `parts` ObjectExpression: `export const parts = { … }`, else null. */
function _partsLiteral(ast) {
    for (const s of ast.body) {
        if (s.type !== 'ExportNamedDeclaration' || !s.declaration || s.declaration.type !== 'VariableDeclaration') { continue; }
        for (const d of s.declaration.declarations) {
            if (d.id.type === 'Identifier' && d.id.name === PARTS_EXPORT) {
                return (d.init && d.init.type === 'ObjectExpression') ? d.init : null;
            }
        }
    }
    return null;
}

/** Module-top bindings: name → { kind: 'import', source, imported } | { kind: 'decl' }. */
function _topBindings(ast) {
    const out = new Map();
    for (const s of ast.body) {
        if (s.type === 'ImportDeclaration') {
            for (const sp of s.specifiers) {
                out.set(sp.local.name, { kind: 'import', source: s.source.value,
                    imported: sp.type === 'ImportSpecifier' ? (sp.imported.name || sp.imported.value) : null });
            }
            continue;
        }
        const decl = (s.type === 'ExportNamedDeclaration' || s.type === 'ExportDefaultDeclaration') ? s.declaration : s;
        if (!decl) { continue; }
        if (decl.type === 'VariableDeclaration') {
            for (const d of decl.declarations) { _patternNames(d.id).forEach(function (n) { out.set(n, { kind: 'decl' }); }); }
        } else if ((decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') && decl.id) {
            out.set(decl.id.name, { kind: 'decl' });
        }
    }
    return out;
}

function _patternNames(p) {
    if (!p) { return []; }
    if (p.type === 'Identifier') { return [p.name]; }
    if (p.type === 'ObjectPattern') { return p.properties.flatMap(function (q) { return _patternNames(q.type === 'RestElement' ? q.argument : q.value); }); }
    if (p.type === 'ArrayPattern') { return p.elements.flatMap(_patternNames); }
    if (p.type === 'RestElement') { return _patternNames(p.argument); }
    if (p.type === 'AssignmentPattern') { return _patternNames(p.left); }
    return [];
}

/** The whitespace that starts the line holding offset `at`. */
function _indentAt(text, at) {
    const ls = text.lastIndexOf('\n', at - 1) + 1;
    const m = /^[ \t]*/.exec(text.slice(ls));
    return m[0];
}

/** Is `obj` (an ObjectExpression) written across lines? */
function _multiline(text, obj) {
    return text.slice(obj.start, obj.end).indexOf('\n') !== -1;
}

/**
 * The insertion that appends `prop` (a `key: value` text) as the LAST property of ObjectExpression `obj`.
 * Matches the literal's own layout: one line → `, k: v` / `{ k: v }`; multi-line → a new line at the last
 * property's indent, keeping a trailing comma the literal already writes.
 */
function _appendProperty(text, obj, prop) {
    const close = obj.end - 1;   // the '}'
    const last = obj.properties[obj.properties.length - 1];
    if (!last) {
        const inner = text.slice(obj.start + 1, close);
        if (inner.indexOf('\n') !== -1) {
            const ind = _indentAt(text, close);
            return { start: obj.start + 1, end: close, text: '\n' + ind + '  ' + prop + ',\n' + ind };
        }
        return { start: obj.start + 1, end: close, text: ' ' + prop + ' ' };
    }
    const between = text.slice(last.end, close);
    const comma = between.indexOf(',');
    if (_multiline(text, obj)) {
        const ind = _indentAt(text, last.start);
        if (comma !== -1) { return { start: last.end + comma + 1, end: last.end + comma + 1, text: '\n' + ind + prop + ',' }; }
        return { start: last.end, end: last.end, text: ',\n' + ind + prop };
    }
    if (comma !== -1) { return { start: last.end + comma + 1, end: last.end + comma + 1, text: ' ' + prop + ',' }; }
    return { start: last.end, end: last.end, text: ', ' + prop };
}

/** The removal of Property `p` from ObjectExpression `obj`, its comma (and, when it owns whole lines, those lines) included. */
function _removeProperty(text, obj, p) {
    const i = obj.properties.indexOf(p);
    const next = obj.properties[i + 1];
    const stop = next ? next.start : obj.end - 1;
    const after = text.slice(p.end, stop);
    const comma = after.indexOf(',');
    let start = p.start;
    let end = comma !== -1 ? p.end + comma + 1 : p.end;
    if (comma === -1 && i > 0) {
        // the last property with no trailing comma: the comma before it goes
        const prev = obj.properties[i - 1];
        const pc = text.slice(prev.end, p.start).indexOf(',');
        if (pc !== -1) { start = prev.end + pc; }
    }
    // An entry that owns its lines (only whitespace before it on its first line, only whitespace after its
    // comma on its last) leaves no blank line behind.
    const ls = text.lastIndexOf('\n', start - 1) + 1;
    const le = text.indexOf('\n', end);
    if (/^[ \t]*$/.test(text.slice(ls, start)) && le !== -1 && /^[ \t]*$/.test(text.slice(end, le))) {
        start = ls; end = le + 1;
    }
    return { start: start, end: end, text: '' };
}

/**
 * @param {string} text — the sketch file's text
 * @param {object[]} edits — see the file header
 * @param {{entry?: string}} [opts] — the sketch's project path (default 'sketch.js'), for a fork's relative import
 * @returns {{text: string, changes: object[], refused: object[]}}
 */
export function patchParts(text, edits, opts) {
    const entry = (opts && opts.entry) || 'sketch.js';
    if (typeof text !== 'string') {
        throw new TypeError('[parts-writer] patchParts(text, edits): text is the sketch file (got ' + typeof text + '). (FAIL-LOUD.)');
    }
    if (!Array.isArray(edits)) {
        throw new TypeError('[parts-writer] patchParts(text, edits): edits is an array of { op: set | add | remove | kind }. (FAIL-LOUD.)');
    }
    const changes = [];
    const refused = [];
    if (!edits.length) { return { text: text, changes: changes, refused: refused }; }
    function refuse(e, reason, key) {
        const r = { op: e.op, name: e.name, reason: reason };
        if (key !== undefined) { r.key = key; }
        refused.push(r);
    }
    let ast;
    try { ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' }); }
    catch (err) {
        edits.forEach(function (e) { refuse(e, 'the sketch does not parse (' + err.message + ') — fix it, then Run.'); });
        return { text: text, changes: changes, refused: refused };
    }
    const parts = _partsLiteral(ast);
    if (!parts) {
        edits.forEach(function (e) {
            refuse(e, 'this sketch has no `export const ' + PARTS_EXPORT + ' = { … }` object literal — the writer writes ' +
                'only into that literal; declare the parts there (exp.declare(' + PARTS_EXPORT + ')) to make them editable.');
        });
        return { text: text, changes: changes, refused: refused };
    }
    const byName = new Map();
    let opaque = false;   // a spread or a computed key: a name may come from it
    for (const p of parts.properties) {
        const k = _plainKey(p);
        if (k === null) { opaque = true; continue; }
        byName.set(k, p);   // a duplicated key: the last one wins, as in the language
    }
    const bindings = _topBindings(ast);
    const patches = [];
    const importLines = [];   // { Kind, line }
    const entryOf = function (e) {
        const p = byName.get(e.name);
        if (!p) {
            refuse(e, opaque
                ? 'no plain key "' + e.name + '" in the parts literal, which carries a spread or a computed key — a name that ' +
                  'comes from either is not writable here; write the entry as a plain key.'
                : 'the parts literal has no entry "' + e.name + '".');
            return null;
        }
        return p;
    };
    const adds = [];
    for (const e of edits) {
        if (!e || typeof e !== 'object' || typeof e.name !== 'string' || !e.name) {
            throw new TypeError('[parts-writer] an edit is { op, name, … } with a non-empty name (got ' + JSON.stringify(e) + '). (FAIL-LOUD.)');
        }
        if (e.op === 'set') {
            const p = entryOf(e);
            if (!p) { continue; }
            const v = p.value;
            if (v.type !== 'ArrayExpression' || v.elements.length !== 2 || !v.elements[0] || v.elements[0].type !== 'Identifier' ||
                !v.elements[1] || v.elements[1].type !== 'ObjectExpression') {
                refuse(e, 'the entry "' + e.name + '" is not written as [Kind, { …props }] — the writer patches only that form.');
                continue;
            }
            const obj = v.elements[1];
            const own = new Map();
            for (const q of obj.properties) { const k = _plainKey(q); if (k !== null) { own.set(k, q); } }
            const appended = [];
            for (const key of Object.keys(e.props || {})) {
                let lit;
                try { lit = serializeValue(e.props[key], key); }
                catch (err) { refuse(e, err.message, key); continue; }
                const q = own.get(key);
                if (q && !q.shorthand) {
                    const old = text.slice(q.value.start, q.value.end);
                    if (old === lit) { continue; }
                    patches.push({ start: q.value.start, end: q.value.end, text: lit });
                    const c = { op: 'set', name: e.name, key: key, from: old, to: lit };
                    if (!_isLiteral(q.value)) { c.literalized = true; }
                    changes.push(c);
                } else if (q && q.shorthand) {
                    patches.push({ start: q.start, end: q.end, text: _keyText(key) + ': ' + lit });
                    changes.push({ op: 'set', name: e.name, key: key, from: key, to: lit, literalized: true });
                } else {
                    appended.push(_keyText(key) + ': ' + lit);
                    changes.push({ op: 'set', name: e.name, key: key, from: null, to: lit });
                }
            }
            if (appended.length) {
                const ins = _appendProperty(text, obj, appended.join(_multiline(text, obj) ? ',\n' + _indentAt(text, (obj.properties[obj.properties.length - 1] || obj).start) : ', '));
                patches.push(ins);
            }
        } else if (e.op === 'kind') {
            const p = entryOf(e);
            if (!p) { continue; }
            const v = p.value;
            if (v.type !== 'ArrayExpression' || v.elements.length !== 2 || !v.elements[0] || v.elements[0].type !== 'Identifier') {
                refuse(e, 'the entry "' + e.name + '" is not written as [Kind, { …props }] — the writer patches only that form.');
                continue;
            }
            if (typeof e.Kind !== 'string' || !_IDENT.test(e.Kind)) {
                throw new TypeError('[parts-writer] kind: Kind is the new kind\'s class name (got ' + JSON.stringify(e.Kind) + '). (FAIL-LOUD.)');
            }
            if (e.module === null || e.module === undefined) {
                refuse(e, 'the kind ' + e.Kind + ' has no importable module, so a sketch cannot import it.');
                continue;
            }
            const spec = importSpecifierOf(e.module, entry);
            const b = bindings.get(e.Kind);
            if (b && !(b.kind === 'import' && b.source === spec && b.imported === e.Kind)) {
                refuse(e, 'the identifier ' + e.Kind + ' is already bound in this sketch to ' +
                    (b.kind === 'import' ? '"' + (b.imported || '*') + '" from \'' + b.source + '\'' : 'its own declaration') +
                    ' — the writer cannot import the kind ' + e.Kind + ' under that name.');
                continue;
            }
            const id = v.elements[0];
            if (id.name === e.Kind) { continue; }
            patches.push({ start: id.start, end: id.end, text: e.Kind });
            const line = 'import { ' + e.Kind + ' } from ' + _quote(spec) + ';';
            if (!b && !importLines.some(function (l) { return l.Kind === e.Kind; })) {
                importLines.push({ Kind: e.Kind, line: line });
            }
            changes.push({ op: 'kind', name: e.name, from: id.name, to: e.Kind, import: (!b ? line : null) });
        } else if (e.op === 'remove') {
            const p = entryOf(e);
            if (!p) { continue; }
            patches.push(_removeProperty(text, parts, p));
            changes.push({ op: 'remove', name: e.name, from: text.slice(p.start, p.end), to: null });
        } else if (e.op === 'add') {
            if (byName.has(e.name) || adds.some(function (a) { return a.name === e.name; })) {
                refuse(e, 'the parts literal already has an entry "' + e.name + '" — a declared name is one key.');
                continue;
            }
            if (typeof e.Kind !== 'string' || !_IDENT.test(e.Kind)) {
                throw new TypeError('[parts-writer] add: Kind is the kind\'s class name (got ' + JSON.stringify(e.Kind) + '). (FAIL-LOUD.)');
            }
            if (e.module === null || e.module === undefined) {
                refuse(e, 'the kind ' + e.Kind + ' has no importable module (an internal kind, not a part of ' +
                    '@descix/frqtl-web/parts nor a project file), so a sketch cannot import it — declare it in code.');
                continue;
            }
            const spec = importSpecifierOf(e.module, entry);
            const b = bindings.get(e.Kind);
            if (b && !(b.kind === 'import' && b.source === spec && b.imported === e.Kind)) {
                refuse(e, 'the identifier ' + e.Kind + ' is already bound in this sketch to ' +
                    (b.kind === 'import' ? '"' + (b.imported || '*') + '" from \'' + b.source + '\'' : 'its own declaration') +
                    ' — the writer cannot import the kind ' + e.Kind + ' under that name.');
                continue;
            }
            let lit;
            try { lit = serializeValue(e.props || {}, e.name); }
            catch (err) { refuse(e, err.message); continue; }
            if (!b && !importLines.some(function (l) { return l.Kind === e.Kind; })) {
                importLines.push({ Kind: e.Kind, line: 'import { ' + e.Kind + ' } from ' + _quote(spec) + ';' });
            }
            adds.push({ name: e.name, text: _keyText(e.name) + ': [' + e.Kind + ', ' + lit + ']' });
            changes.push({ op: 'add', name: e.name, from: null, to: _keyText(e.name) + ': [' + e.Kind + ', ' + lit + ']',
                import: (!b ? 'import { ' + e.Kind + ' } from ' + _quote(spec) + ';' : null) });
        } else {
            throw new TypeError('[parts-writer] unknown edit op ' + JSON.stringify(e.op) + ' — set | add | remove | kind. (FAIL-LOUD.)');
        }
    }
    if (adds.length) {
        const joined = adds.map(function (a) { return a.text; });
        if (_multiline(text, parts) || parts.properties.length === 0) {
            if (parts.properties.length === 0) {
                const ind = _indentAt(text, parts.start);
                patches.push({ start: parts.start + 1, end: parts.end - 1,
                    text: '\n' + joined.map(function (t) { return ind + '  ' + t + ','; }).join('\n') + '\n' + ind });
            } else {
                const ind = _indentAt(text, parts.properties[parts.properties.length - 1].start);
                const last = parts.properties[parts.properties.length - 1];
                const comma = text.slice(last.end, parts.end - 1).indexOf(',');
                if (comma !== -1) {
                    patches.push({ start: last.end + comma + 1, end: last.end + comma + 1,
                        text: joined.map(function (t) { return '\n' + ind + t + ','; }).join('') });
                } else {
                    patches.push({ start: last.end, end: last.end, text: joined.map(function (t) { return ',\n' + ind + t; }).join('') });
                }
            }
        } else {
            patches.push(_appendProperty(text, parts, joined.join(', ')));
        }
    }
    if (importLines.length) {
        const imports = ast.body.filter(function (s) { return s.type === 'ImportDeclaration'; });
        let at;
        if (imports.length) {
            const lastImp = imports[imports.length - 1];
            const nl = text.indexOf('\n', lastImp.end);
            at = nl === -1 ? text.length : nl + 1;
            const block = importLines.map(function (l) { return l.line + '\n'; }).join('');
            patches.push({ start: at, end: at, text: nl === -1 ? '\n' + block : block });
        } else {
            const first = ast.body[0];
            at = first ? text.lastIndexOf('\n', first.start - 1) + 1 : text.length;
            patches.push({ start: at, end: at, text: importLines.map(function (l) { return l.line + '\n'; }).join('') + '\n' });
        }
    }
    patches.sort(function (a, b) { return b.start - a.start || b.end - a.end; });
    for (let i = 1; i < patches.length; i++) {
        if (patches[i].end > patches[i - 1].start) {
            throw new Error('[parts-writer] two edits touch overlapping text — one edit per property. (FAIL-LOUD.)');
        }
    }
    let out = text;
    for (const p of patches) { out = out.slice(0, p.start) + p.text + out.slice(p.end); }
    return { text: out, changes: changes, refused: refused };
}

/** The props ObjectExpression of entry `name` in the parsed `parts` literal; THROWS naming what is missing. */
function _entryProps(text, name, who) {
    const ast = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
    const parts = _partsLiteral(ast);
    if (!parts) {
        throw new Error('[parts-writer] ' + who + ': the sketch has no `export const ' + PARTS_EXPORT + ' = { … }` object literal. (FAIL-LOUD.)');
    }
    let p = null;
    for (const q of parts.properties) { if (_plainKey(q) === name) { p = q; } }
    const v = p && p.value;
    if (!v || v.type !== 'ArrayExpression' || v.elements.length !== 2 || !v.elements[1] || v.elements[1].type !== 'ObjectExpression') {
        throw new Error('[parts-writer] ' + who + ': the parts literal has no entry "' + name + '" written as [Kind, { …props }]. (FAIL-LOUD.)');
    }
    return v.elements[1];
}

function _literalValue(n) {
    if (n.type === 'Literal') { return n.value; }
    if (n.type === 'UnaryExpression') { return -n.argument.value; }
    if (n.type === 'ArrayExpression') { return n.elements.map(_literalValue); }
    const o = {};
    for (const p of n.properties) { o[_plainKey(p)] = _literalValue(p.value); }
    return o;
}

/**
 * entryKeys(text, name) → string[] — the plain prop keys entry `name` spells in the parsed `parts` literal, in
 * source order (a spread or a computed key is not a plain key). The writer asks it how an entry spells a value
 * (e.g. `rect` alone, or `rect` beside `z` / `depth`), never a regex over the text. THROWS on no such entry.
 */
export function entryKeys(text, name) {
    const out = [];
    for (const q of _entryProps(text, name, 'entryKeys').properties) { const k = _plainKey(q); if (k !== null) { out.push(k); } }
    return out;
}

/**
 * entryLiteral(text, name, key) → { literal: true, value } | { literal: false, length? } — what entry `name`'s
 * `key` declares when its value is a literal (the read-back after a write: the text a patch produced, parsed
 * again). A non-literal ARRAY expression answers its element count as `length` (the arity it spells); any
 * other expression answers no length. THROWS on no such entry or no such key.
 */
export function entryLiteral(text, name, key) {
    for (const q of _entryProps(text, name, 'entryLiteral').properties) {
        if (_plainKey(q) !== key) { continue; }
        if (_isLiteral(q.value)) { return { literal: true, value: _literalValue(q.value) }; }
        // An array expression still spells its arity (`center: [srcX, cy]` is two numbers) — unless an element is a
        // spread (`center: [...c]`), which spells no arity: the caller applies the live one.
        const arr = q.value.type === 'ArrayExpression';
        if (arr && !q.value.elements.some(function (x) { return x && x.type === 'SpreadElement'; })) {
            return { literal: false, length: q.value.elements.length };
        }
        return { literal: false };
    }
    throw new Error('[parts-writer] entryLiteral: the entry "' + name + '" spells no key "' + key + '". (FAIL-LOUD.)');
}
