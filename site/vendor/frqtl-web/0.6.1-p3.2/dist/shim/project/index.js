/* Copyright 2023-2026 by Essam Abadir */

/**
 * project/index.js — the `./project` entry of BOTH packages: the specifier table, the link site and the
 * project identity, re-exported from their owners (this file owns nothing).
 *
 *   FRQTL_WEB_SPECIFIERS, libPathOf, importMapFor,
 *   pageImportMapFor, FRQTL_WEB_HOST_SPECIFIERS      specifiers.js (the host rows: a host page reads the
 *                                                    dist root from its own map through them)
 *   linkProject, sketchProject, SKETCH_ENTRY         link.js
 *   projectIdentity                                  identity.js
 *   MANIFEST_FILE, MANIFEST_KEYS, normalizeManifest,
 *   parseManifest, serializeManifest, manifestFor    manifest.js (THE owner of frqtl.json)
 *   RECORD_FILES, RECORD_KEYS, CHANGE_KEYS, OPS, BY,
 *   CLIP_SECONDS, CLIP_NAME, clipName, jsonText,
 *   rowFaults, recordFolderFaults, applyRows         record-format.js (THE owner of the Record folder's shape and
 *                                                    of its change rows' shape and meaning: rowFaults checks one row,
 *                                                    applyRows applies them to a block)
 *
 * The entry stands alone: it loads the parts roster (every published kind registers on import, objects/kinds.js),
 * so applyRows can spell a 6-number rect by its kind's descriptor with nothing else imported. The roster is imported
 * HERE, by the package door, and never by record-format.js: a scene page reaches record-format statically
 * (RecipeContext → Record.js) and loads the roster only in its boot's modules phase, where a failed part is reported.
 *
 * PROJECT_EXPORTS is this entry's export list; a conformance test holds the module's exports equal to
 * it, and the package gate holds it equal across @descix/frqtl-web and @descix/frqtl-node.
 */

export const PROJECT_EXPORTS = Object.freeze(['FRQTL_WEB_SPECIFIERS', 'libPathOf', 'importMapFor', 'pageImportMapFor',
    'FRQTL_WEB_HOST_SPECIFIERS',
    'linkProject', 'sketchProject', 'SKETCH_ENTRY', 'projectIdentity',
    'MANIFEST_FILE', 'MANIFEST_KEYS', 'normalizeManifest', 'parseManifest', 'serializeManifest', 'manifestFor',
    'RECORD_FILES', 'RECORD_KEYS', 'CHANGE_KEYS', 'OPS', 'BY', 'CLIP_SECONDS', 'CLIP_NAME', 'clipName', 'jsonText',
    'rowFaults', 'recordFolderFaults', 'applyRows']);

// The parts roster (see above): a side-effect import, so ./project stands alone.
import '../../frqtl/parts/index.js';

export { FRQTL_WEB_SPECIFIERS, libPathOf, importMapFor, pageImportMapFor, FRQTL_WEB_HOST_SPECIFIERS } from './specifiers.js';
export { linkProject, sketchProject, SKETCH_ENTRY } from './link.js';
export { projectIdentity } from './identity.js';
export { MANIFEST_FILE, MANIFEST_KEYS, normalizeManifest, parseManifest, serializeManifest, manifestFor } from './manifest.js';
export { RECORD_FILES, RECORD_KEYS, CHANGE_KEYS, OPS, BY, CLIP_SECONDS, CLIP_NAME, clipName, jsonText,
    rowFaults, recordFolderFaults, applyRows } from './record-format.js';
