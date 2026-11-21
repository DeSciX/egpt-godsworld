/* Copyright 2023-2026 by Essam Abadir */

/**
 * validate-descriptor.js — THE descriptor-shape validator (schema/'s own), applied to every row the
 * schema serves: each scope row (schema/scopes.js) and each kind a part registers
 * (objects/kinds.js registerKind).
 *
 *   validateDescriptor(name, descriptor) → descriptor   THROWS on a malformed descriptor
 *
 * Two load-time drift guards, each against its ONE owner in lib/shim/field-descriptor:
 *   - every field's `type` is a member of FIELD_TYPES (the shared field-SHAPE vocabulary);
 *   - a declared `ux:{}` block survives normalizeUx (the STUDIO presentation vocabulary).
 * A descriptor with NO ux block is untouched (today's behavior).
 */

import * as FieldDescriptorSchema from '../../../shim/field-descriptor/index.js';

/**
 * @param {string} name — the row's name (a kind's class name, or a scope row's key)
 * @param {object} descriptor — { description, fields: [...], ux? }
 * @returns {object} the same descriptor
 */
export function validateDescriptor(name, descriptor) {
    if (!descriptor || typeof descriptor !== 'object' || !Array.isArray(descriptor.fields)) {
        throw new TypeError('[lib/frqtl/objects/schema] descriptor "' + name + '" must be an object with a ' +
            'fields array (and a description). (FAIL-LOUD.)');
    }
    var fieldTypeSet = FieldDescriptorSchema.FIELD_TYPES;
    var fields = descriptor.fields;
    for (var fi = 0; fi < fields.length; fi++) {
        var ft = fields[fi].type;
        if (fieldTypeSet.indexOf(ft) === -1) {
            throw new Error('[lib/frqtl/objects/schema] descriptor "' + name + '" field "' +
                fields[fi].name + '" has type "' + ft + '" — not a member of ' +
                'lib/shim/field-descriptor\'s FIELD_TYPES ([' + fieldTypeSet.join(', ') + ']). ' +
                '(FAIL-LOUD — the field-type vocabulary is shared; add the type at the ONE ' +
                'owner, lib/shim/field-descriptor/index.js, never here.)');
        }
    }
    if (descriptor.ux !== undefined) {
        try {
            FieldDescriptorSchema.normalizeUx(descriptor.ux);
        } catch (uxErr) {
            throw new Error('[lib/frqtl/objects/schema] descriptor "' + name +
                '" has an invalid ux block: ' + uxErr.message);
        }
    }
    return descriptor;
}
