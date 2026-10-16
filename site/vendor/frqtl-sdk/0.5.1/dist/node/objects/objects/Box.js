/* Copyright 2023-2026 by Essam Abadir */

/**
 * Box — Engine-agnostic rectangular enclosure made of 4 LargeObject walls.
 * Creates a rectangular enclosure with configurable wall thickness, collision type,
 * and an optional slit (gap) on any one wall. Used by OvenBox (blackbody) and
 * SlitScreen (double-slit) as the physical boundary primitive.
 *
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 */

(function () {

    // ── Imports ─────────────────────────────────────────────────────────

    var LargeObject, CollisionTypes, CollisionActions;

    if (typeof module !== 'undefined' && module.exports) {
        LargeObject = require('./LargeObject').LargeObject;
        CollisionTypes = require('../constants/CollisionTypes').CollisionTypes;
        CollisionActions = require('../constants/CollisionActions').CollisionActions;
    } else {
        LargeObject = window.LargeObject;
        CollisionTypes = window.CollisionTypes;
        CollisionActions = window.CollisionActions;
    }

    // ── Box ─────────────────────────────────────────────────────────────

    /**
     * Rectangular enclosure made of 4 LargeObject walls.
     *
     * Walls are positioned so their outer edges align with the **outer** rect
     * (`left - wallThickness`, `top - wallThickness`, …). The caller supplies the
     * inner rect; walls extend outward. A slit on one wall is implemented as two
     * LargeObject segments (top and bottom) leaving a gap of `slit.height` pixels
     * in the center.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM).
     * @param {Object} options - Configuration.
     * @param {number} options.left - Inner box left X (physics pixels).
     * @param {number} options.top - Inner box top Y (physics pixels).
     * @param {number} options.width - Inner box width (physics pixels).
     * @param {number} options.height - Inner box height (physics pixels).
     * @param {number} [options.wallThickness=10] - Wall thickness in pixels. Walls
     *   grow outward from the inner rect by this amount.
     * @param {string} [options.collisionType='BOUNCE'] - Collision type applied to
     *   all walls (a `CollisionTypes` constant).
     * @param {Array<string>} [options.actions=[]] - Collision actions applied to all
     *   walls (array of `CollisionActions` constants, e.g. `[BOUNCE, ABSORB]`).
     * @param {Array<number>} [options.color=[120,120,120]] - Wall color `[r,g,b]`.
     * @param {Object} [options.slit] - Optional slit configuration.
     * @param {string} options.slit.wall - Which wall carries the slit:
     *   `'right'` | `'left'` | `'top'` | `'bottom'`.
     * @param {number} options.slit.height - Slit opening height (pixels).
     *
     * @deprecated V1 sugar, kept for byte-identical scenes (blackbody's OvenBox). V2 direction: four Wall{ collisionBehavior:'block' | 'bounce' } slabs (needs an opt-in fixed-axis flip to reproduce this wall program).
     */
    function Box(universe, options) {
        options = options || {};

        this.universe = universe;
        this._schemaKind = 'Box';

        var left = options.left;
        var top = options.top;
        var w = options.width;
        var h = options.height;
        var wt = options.wallThickness || 10;
        var ct = options.collisionType || CollisionTypes.BOUNCE;
        var actions = options.actions || [];
        var color = options.color || [120, 120, 120];
        var slit = options.slit || null;

        // Outer rect (walls extend outward from inner box)
        var outerLeft = left - wt;
        var outerTop = top - wt;
        var outerW = w + 2 * wt;
        var outerH = h + 2 * wt;

        this.walls = [];
        this.innerRect = { left: left, top: top, w: w, h: h };
        this.outerRect = { left: outerLeft, top: outerTop, w: outerW, h: outerH };
        this.wallThickness = wt;

        // Top wall
        this.walls.push(new LargeObject(
            universe,
            [outerLeft, outerTop, outerW, wt],
            ct, actions, 'TOP', 'bottom', null, 1, color
        ));

        // Bottom wall
        this.walls.push(new LargeObject(
            universe,
            [outerLeft, outerTop + outerH - wt, outerW, wt],
            ct, actions, 'BOTTOM', 'top', null, 1, color
        ));

        // Left wall
        if (slit && slit.wall === 'left') {
            this._createSlittedWall(universe, 'left', outerLeft, outerTop, outerH, wt, slit.height, ct, actions, color);
        } else {
            this.walls.push(new LargeObject(
                universe,
                [outerLeft, outerTop, wt, outerH],
                ct, actions, 'LEFT', 'right', null, 1, color
            ));
        }

        // Right wall
        if (slit && slit.wall === 'right') {
            this._createSlittedWall(universe, 'right', outerLeft + outerW - wt, outerTop, outerH, wt, slit.height, ct, actions, color);
        } else {
            this.walls.push(new LargeObject(
                universe,
                [outerLeft + outerW - wt, outerTop, wt, outerH],
                ct, actions, 'RIGHT', 'left', null, 1, color
            ));
        }

        // THE ONE UP-LINK on every wall LO this Box composed (a drawn wall resolves to the Box).
        for (var _wi = 0; _wi < this.walls.length; _wi++) {
            this.walls[_wi]._owner = this;   // THE ONE UP-LINK: the Box composed each wall LO
        }
    }

    /**
     * Create a wall with a slit (gap) in the middle.
     * @private
     */
    Box.prototype._createSlittedWall = function (universe, side, wallX, outerTop, outerH, wt, slitHeight, ct, actions, color) {
        var topSegH = (outerH - slitHeight) / 2;
        var reposition = (side === 'left') ? 'right' : 'left';
        var labelSuffix = side.toUpperCase();

        // Top segment
        this.walls.push(new LargeObject(
            universe,
            [wallX, outerTop, wt, topSegH],
            ct, actions, labelSuffix + '_T', reposition, null, 1, color
        ));

        // Bottom segment
        this.walls.push(new LargeObject(
            universe,
            [wallX, outerTop + outerH - topSegH - 1, wt, topSegH],
            ct, actions, labelSuffix + '_B', reposition, null, 1, color
        ));
    };

    /**
     * Set collision type on all walls.
     * @param {string} ct - CollisionTypes value
     */
    Box.prototype.setCollisionType = function (ct) {
        for (var i = 0; i < this.walls.length; i++) {
            this.walls[i].setCollisionType(ct);
        }
    };

    /**
     * Enable/disable all walls.
     * @param {boolean} active
     */
    Box.prototype.setActive = function (active) {
        for (var i = 0; i < this.walls.length; i++) {
            this.walls[i].setActive(active);
        }
    };

    /**
     * Full teardown of what this Box composed: every wall LO leaves the world (dispose IS the
     * removal). Idempotent (LargeObject.dispose guards itself).
     */
    Box.prototype.dispose = function () {
        for (var i = 0; i < this.walls.length; i++) { this.walls[i].dispose(); }
    };

    // ── Export ───────────────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { Box };
    } else {
        window.Box = Box;
    }

})();
