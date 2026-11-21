/* Copyright 2023-2026 by Essam Abadir */

/**
 * fork.js — THE fork transform: a part file's text becomes the text of its renamed copy, `parts/<To>.js`.
 *
 *   forkPartText(text, { from, to, libPath, files }) → { text, imports }
 *     text     the source part file's exact bytes, as text
 *     from     the class name the file registers (its kind name)
 *     to       the new class name (the fork's kind name)
 *     libPath  where the source lives: a package lib-identity path ('frqtl/parts/Wall.js') or, for a fork of a
 *              fork, the project path of the held file ('parts/MyWall.js')
 *     files    the project's files by path ({} when none) — a fork never overwrites one
 *   imports    [{ from, to }] — each import specifier of the source and the specifier the copy writes
 *
 * The text is parsed once (parts-writer.js parseModule: the vendored acorn's one importer). The copy differs from the source
 * in exactly three kinds of range, and every other byte (comments, docstrings, the schema, every string) is the
 * source's byte:
 *   1. THE CLASS BINDING. `to` replaces the module-scope binding `from`: its declaration's id and every reference
 *      that resolves to it (`registerKind(Wall, …)`, `Wall.prototype…`, `instanceof Wall`, `export { Wall }`). A
 *      same-named binding in an inner scope, a property key and a string are untouched.
 *   2. THE PALETTE NAME. The registerKind row's `palette.displayName` string becomes `to`, so a palette lists the
 *      fork by its own name. Every other property of the row is the source's byte.
 *   3. THE IMPORTS. A package part's relative import is rewritten to the package specifier naming the SAME file
 *      (specifiers.js specifierOfLibPath — a part file under frqtl/parts/ → the parts prefix row; frqtl/objects/
 *      kinds.js → @descix/frqtl-web/kinds when every imported name is in KINDS_EXPORTS; anything else its own
 *      row). A fork of a fork keeps its relative imports (they name project files beside it) and its package
 *      specifiers as they are. A fork never copies a non-part module: a second copy of a registry or a schema
 *      would split one fact.
 *
 * REFUSED (throws, naming the part): `to` is not an identifier or is a reserved word; `to` equals `from`; `to` is
 * already a registered kind, or `parts/<to>.js` is already a project file; `from` is a kind FORK_REFUSED names
 * (with its reason); the file declares no module-scope `from`; a relative import with no row (naming the import).
 *
 *   FORK_REFUSED   { <kind>: reason } — the kinds no fork copies, each with the census reason (fork.test.mjs
 *                  G-CENSUS derives the set from the part files and holds it equal to this table)
 */

import { kindOf } from '../../frqtl/objects/kinds.js';
import { KINDS_EXPORTS } from '../../frqtl/objects/kinds-entry.js';
import { specifierOfLibPath } from './specifiers.js';
import { isIdentifierName, parseModule } from './parts-writer.js';

/** The kinds a fork refuses, each with why (the census: a scope row, or the class name used as a string). */
export const FORK_REFUSED = Object.freeze({
    LargeObject: 'LargeObject is a scope row (schema/scopes.js SCOPE_DESCRIPTORS) and passes \'LargeObject\' as the engine ' +
        'scope name to universe.updateObjectProperty — a copy would be a second scope row',
    PointSource: 'PointSource numbers its default name with declaredCount(ctx.runner, \'PointSource\') — a copy would ' +
        'number itself in its parent\'s sequence (the class name used as a string)'
});

/** The lib-identity path of the parts directory, and the kinds registry a part imports. */
const PARTS_DIR = 'frqtl/parts/';
const KINDS_LIB = 'frqtl/objects/kinds.js';

function _fail(msg) {
    throw new Error('[fork] ' + msg + ' (FAIL-LOUD.)');
}

/** The children of an AST node (every key holding a node or an array of nodes). */
function _children(n) {
    const out = [];
    for (const k of Object.keys(n)) {
        if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') { continue; }
        const v = n[k];
        if (Array.isArray(v)) { for (const c of v) { if (c && typeof c.type === 'string') { out.push(c); } } }
        else if (v && typeof v.type === 'string') { out.push(v); }
    }
    return out;
}

function _patternNames(p, out) {
    if (!p) { return out; }
    if (p.type === 'Identifier') { out.push(p.name); }
    else if (p.type === 'ObjectPattern') { for (const q of p.properties) { _patternNames(q.type === 'RestElement' ? q.argument : q.value, out); } }
    else if (p.type === 'ArrayPattern') { for (const e of p.elements) { _patternNames(e, out); } }
    else if (p.type === 'RestElement') { _patternNames(p.argument, out); }
    else if (p.type === 'AssignmentPattern') { _patternNames(p.left, out); }
    return out;
}

const _FUNCTION = { FunctionDeclaration: 1, FunctionExpression: 1, ArrowFunctionExpression: 1 };

/** `var` names declared in a function body (not crossing a nested function). */
function _varNames(n, out) {
    for (const c of _children(n)) {
        if (_FUNCTION[c.type]) { continue; }
        if (c.type === 'VariableDeclaration' && c.kind === 'var') {
            for (const d of c.declarations) { _patternNames(d.id, out); }
        }
        _varNames(c, out);
    }
    return out;
}

/** Block-scoped names declared directly in a statement list (let/const/class/function). */
function _lexicalNames(body, out) {
    for (const s of body) {
        const d = (s.type === 'ExportNamedDeclaration' || s.type === 'ExportDefaultDeclaration') ? s.declaration : s;
        if (!d) { continue; }
        if (d.type === 'VariableDeclaration' && d.kind !== 'var') { for (const x of d.declarations) { _patternNames(x.id, out); } }
        else if ((d.type === 'ClassDeclaration' || d.type === 'FunctionDeclaration') && d.id) { out.push(d.id.name); }
    }
    return out;
}

/** The names a node introduces into the scope it opens (null when it opens none). */
function _scopeNames(n, isModule) {
    if (_FUNCTION[n.type]) {
        const names = [];
        for (const p of n.params) { _patternNames(p, names); }
        if (n.type === 'FunctionExpression' && n.id) { names.push(n.id.name); }
        if (n.body.type === 'BlockStatement') { _varNames(n.body, names); _lexicalNames(n.body.body, names); }
        return names;
    }
    if (n.type === 'BlockStatement' || n.type === 'StaticBlock') { return isModule ? null : _lexicalNames(n.body, []); }
    if (n.type === 'SwitchStatement') { return _lexicalNames(n.cases.flatMap(function (c) { return c.consequent; }), []); }
    if (n.type === 'ForStatement' || n.type === 'ForInStatement' || n.type === 'ForOfStatement') {
        const init = n.type === 'ForStatement' ? n.init : n.left;
        if (!init || init.type !== 'VariableDeclaration' || init.kind === 'var') { return []; }
        return init.declarations.reduce(function (acc, d) { return _patternNames(d.id, acc); }, []);
    }
    if (n.type === 'CatchClause') { return n.param ? _patternNames(n.param, []) : []; }
    if (n.type === 'ClassExpression' && n.id) { return [n.id.name]; }
    return null;
}

/**
 * Every Identifier node that resolves to the MODULE-scope binding `name` (declarations and references).
 * Positions that are not references (non-computed property keys and member properties, labels, an import's
 * imported name, an export's exported name when it differs from the local) are skipped.
 */
function _moduleBindingIds(ast, name) {
    const hits = [];
    function visit(n, shadowed, parent, key) {
        if (n.type === 'Identifier') {
            if (n.name !== name || shadowed) { return; }
            if (parent) {
                if (parent.type === 'MemberExpression' && key === 'property' && !parent.computed) { return; }
                if ((parent.type === 'Property' || parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') &&
                    key === 'key' && !parent.computed && !parent.shorthand) { return; }
                if ((parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && key === 'label') { return; }
                // An import's imported name and an export's exported name are names, not references: the local
                // is the binding (acorn hands the SAME node to both keys of a shorthand specifier).
                if (parent.type === 'ImportSpecifier' && key === 'imported') { return; }
                if (parent.type === 'ExportSpecifier' && key === 'exported') { return; }
            }
            hits.push(n);
            return;
        }
        const names = n === ast ? null : _scopeNames(n, false);
        const sh = shadowed || !!(names && names.indexOf(name) !== -1);
        for (const k of Object.keys(n)) {
            if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') { continue; }
            const v = n[k];
            if (Array.isArray(v)) { for (const c of v) { if (c && typeof c.type === 'string') { visit(c, _childShadow(n, k, c, sh, shadowed), n, k); } } }
            else if (v && typeof v.type === 'string') { visit(v, _childShadow(n, k, v, sh, shadowed), n, k); }
        }
    }
    // A function DECLARATION's id belongs to the enclosing scope, not the one the function opens.
    function _childShadow(n, k, c, sh, outer) {
        if (n.type === 'FunctionDeclaration' && k === 'id') { return outer; }
        return sh;
    }
    visit(ast, false, null, null);
    return hits;
}

/** The module-top binding of `name`: its declaration node, or null. */
function _topDeclaration(ast, name) {
    for (const s of ast.body) {
        const d = (s.type === 'ExportNamedDeclaration' || s.type === 'ExportDefaultDeclaration') ? s.declaration : s;
        if (!d) { continue; }
        if ((d.type === 'ClassDeclaration' || d.type === 'FunctionDeclaration') && d.id && d.id.name === name) { return d; }
        if (d.type === 'VariableDeclaration' && d.declarations.some(function (x) { return _patternNames(x.id, []).indexOf(name) !== -1; })) { return d; }
    }
    return null;
}

/** The `palette.displayName` string Literal of the module's `registerKind(<from>, { … })` row, or null. */
function _paletteName(ast, from) {
    let found = null;
    (function visit(n) {
        if (found) { return; }
        if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'registerKind' &&
            n.arguments[0] && n.arguments[0].type === 'Identifier' && n.arguments[0].name === from &&
            n.arguments[1] && n.arguments[1].type === 'ObjectExpression') {
            const pal = n.arguments[1].properties.find(function (p) { return p.type === 'Property' && !p.computed && p.key.name === 'palette'; });
            if (pal && pal.value.type === 'ObjectExpression') {
                const dn = pal.value.properties.find(function (p) { return p.type === 'Property' && !p.computed && p.key.name === 'displayName'; });
                if (dn && dn.value.type === 'Literal' && typeof dn.value.value === 'string') { found = dn.value; }
            }
            return;
        }
        for (const c of _children(n)) { visit(c); }
    })(ast);
    return found;
}

/** The lib-identity (or project) path a relative specifier names from `fromPath`. */
function _resolve(fromPath, spec) {
    const segs = fromPath.split('/');
    segs.pop();
    for (const s of spec.split('/')) {
        if (s === '.' || s === '') { continue; }
        if (s === '..') { segs.pop(); } else { segs.push(s); }
    }
    return segs.join('/');
}

function _quoteLike(original, value) {
    const q = original[0] === '"' ? '"' : '\'';
    return q + value.replace(/\\/g, '\\\\').split(q).join('\\' + q) + q;
}

/**
 * @param {string} text — the source part file
 * @param {{from: string, to: string, libPath: string, files: Object<string, string>}} opts
 * @returns {{text: string, imports: Array<{from: string, to: string}>}}
 */
export function forkPartText(text, opts) {
    if (typeof text !== 'string' || !text) { _fail('forkPartText(text, opts): text is the part file (got ' + typeof text + ').'); }
    const o = opts || {};
    const from = o.from, to = o.to, libPath = o.libPath, files = o.files;
    if (typeof from !== 'string' || !from) { _fail('forkPartText: `from` is the class name the part registers.'); }
    if (typeof libPath !== 'string' || !libPath) { _fail('forkPartText(' + from + '): `libPath` names the source file.'); }
    if (!files || typeof files !== 'object') { _fail('forkPartText(' + from + '): `files` is the project\'s file map ({} when none).'); }
    if (typeof to !== 'string' || !isIdentifierName(to)) {
        _fail('forkPartText(' + from + '): the new class name ' + JSON.stringify(to) + ' is not an identifier (or is a reserved word) ' +
            '— the class name IS the kind name.');
    }
    if (to === from) { _fail('forkPartText(' + from + '): the new class name equals the part\'s own — a fork is a NEW kind; name it.'); }
    if (kindOf(to)) {
        _fail('forkPartText(' + from + '): "' + to + '" is already a registered kind (' + kindOf(to).from + ') — one name has one owner; ' +
            'choose another name.');
    }
    const target = 'parts/' + to + '.js';
    if (Object.prototype.hasOwnProperty.call(files, target)) {
        _fail('forkPartText(' + from + '): ' + target + ' is already a project file — a fork never overwrites one.');
    }
    if (Object.prototype.hasOwnProperty.call(FORK_REFUSED, from)) {
        _fail('forkPartText(' + from + '): ' + from + ' is not forkable — ' + FORK_REFUSED[from] + '.');
    }
    const pkg = libPath.indexOf(PARTS_DIR) === 0;
    let ast;
    try { ast = parseModule(text); }
    catch (err) { _fail('forkPartText(' + from + '): ' + libPath + ' does not parse (' + err.message + ').'); }
    if (!_topDeclaration(ast, from)) {
        _fail('forkPartText(' + from + '): ' + libPath + ' declares no module-scope ' + from + ' — the file a kind\'s `from` names declares its class.');
    }

    const patches = [];
    const imports = [];
    for (const s of ast.body) {
        const src = (s.type === 'ImportDeclaration' || ((s.type === 'ExportNamedDeclaration' || s.type === 'ExportAllDeclaration') && s.source))
            ? s.source : null;
        if (!src) { continue; }
        const spec = src.value;
        if (!(spec.startsWith('./') || spec.startsWith('../'))) { imports.push({ from: spec, to: spec }); continue; }
        if (!pkg) { imports.push({ from: spec, to: spec }); continue; }   // a fork of a fork: project files beside it
        const lp = _resolve(libPath, spec);
        let out;
        if (lp === KINDS_LIB) {
            const names = (s.specifiers || []).map(function (x) {
                return x.type === 'ImportSpecifier' ? (x.imported.name || x.imported.value) : '*';
            });
            const outside = names.filter(function (n) { return KINDS_EXPORTS.indexOf(n) === -1; });
            if (outside.length) {
                _fail('forkPartText(' + from + '): ' + libPath + ' imports ' + outside.join(', ') + ' from "' + spec + '" — the kinds ' +
                    'door (@descix/frqtl-web/kinds) publishes ' + KINDS_EXPORTS.join(', ') + ' only.');
            }
            out = specifierOfLibPath('frqtl/objects/kinds-entry.js');
        } else {
            out = specifierOfLibPath(lp);
        }
        if (!out) {
            _fail('forkPartText(' + from + '): ' + libPath + ' imports "' + spec + '" (' + lp + '), which no specifier row names — a ' +
                'fork imports every non-part module from the package (lib/shim/project/specifiers.js); it never copies one.');
        }
        patches.push({ start: src.start, end: src.end, text: _quoteLike(text.slice(src.start, src.end), out) });
        imports.push({ from: spec, to: out });
    }
    for (const id of _moduleBindingIds(ast, from)) { patches.push({ start: id.start, end: id.end, text: to }); }
    const dn = _paletteName(ast, from);
    if (dn) { patches.push({ start: dn.start, end: dn.end, text: _quoteLike(text.slice(dn.start, dn.end), to) }); }

    patches.sort(function (a, b) { return b.start - a.start; });
    for (let i = 1; i < patches.length; i++) {
        if (patches[i].end > patches[i - 1].start) { _fail('forkPartText(' + from + '): overlapping rewrites — a bug in the transform.'); }
    }
    let out = text;
    for (const p of patches) { out = out.slice(0, p.start) + p.text + out.slice(p.end); }
    return { text: out, imports: imports };
}
