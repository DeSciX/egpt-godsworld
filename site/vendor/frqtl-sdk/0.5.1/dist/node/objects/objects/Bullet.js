/* Copyright 2023-2026 by Essam Abadir */

/**
 * Bullet — Engine-agnostic moving projectile sugar.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * A small `LargeObject` that advances horizontally each tick via
 * `universe.updateObjectProperty(handle, 'LargeObject', 'rect', [...])`.
 * The tick function is pushed onto `universe.experimentTickFunctions` so the
 * Bullet self-drives: no external per-tick call needed.
 *
 * @param {Object} universe - Engine universe instance (JS or WASM compat shim),
 *   already init'd (init() is called by the enclosing setup factory, not here).
 * @param {Object} [opts] - Configuration overrides.
 * @param {number} [opts.x]    - Left edge of the bullet rect (pixels). Default: 0.
 * @param {number} [opts.y]    - Top edge of the bullet rect (pixels). Default: canvas centre.
 * @param {number} [opts.w=8]  - Bullet rect width (pixels). Units: pixels.
 * @param {number} [opts.h=8]  - Bullet rect height (pixels). Units: pixels.
 * @param {number} [opts.speed=2] - Horizontal advance per tick (pixels/tick). Positive = rightward.
 *   Keeps within [−1,+1] per-axis speed limit PER MECHANISM — the bullet itself is not a
 *   quantum, so this limit does not apply here. OBSERVED: speed 2 makes the wake
 *   dense enough to trigger aggregation into bigger frames. speed 1 makes a wispy trail.
 * @param {string} [opts.collisionType='BOUNCE'] - CollisionTypes value for quanta that
 *   intersect the bullet. BOUNCE = deflect quanta (generates the most billowing wake).
 *   NONE = ghost (visual-only, no physics). WALL = stops quanta dead (hard shadow).
 * @param {Array}  [opts.color=[40,40,40]] - RGB color for the bullet LO rect (renderer).
 * @param {string} [opts.name='bullet'] - LargeObject name tag.
 *
 * @property {Object} lo     - The underlying LargeObject instance.
 * @property {*}      handle - The engine handle for the LargeObject (opaque).
 * @property {number} vx     - Current horizontal speed (px/tick).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * The moving exclude region (BOUNCE) compresses quanta in front and deflects
 * them to the sides, identical to the static `block 2` shadow in the
 * Wave-Interference experiment. **The billowing wake is free physics** — no
 * explicit wake/smoke code.
 *
 * When the enclosing setup factory also enables `universe.withInterQuantumCollisions`
 * and registers extra dimensions (the Blackbody aggregation mechanic), the compressed
 * quanta behind the bullet parent up the voxel-size ladder into bigger frames. The
 * renderer (three-provider.js) sizes each puff by `frame.rect.w`, so the emergent
 * frame-size variation produces the smoke-billow effect: faster bullet → more compression
 * → more collisions → bigger frames → more prominent puffs.
 *
 * The bullet wraps the canvas if `opts.wrap` is true (default: false — the bullet
 * exits at the right edge and the tick function becomes a no-op when out of bounds).
 * Set `opts.loop` to restart from the left when the bullet exits the right edge.
 */

(function () {

    // ── Imports (Node.js) or globals (browser) ──────────────────────────────

    var LargeObject, CollisionTypes;

    if (typeof module !== 'undefined' && module.exports) {
        LargeObject    = require('./LargeObject').LargeObject;
        CollisionTypes = require('../constants/CollisionTypes').CollisionTypes;
    } else {
        LargeObject    = window.LargeObject;
        CollisionTypes = window.CollisionTypes;
    }

    // ObjectSchema (the world-rect normalizer's one public surface), resolved at CALL time:
    // schema/index.js loads after the object scripts in the game-layer roster.
    function _schema() {
        var s = (typeof module !== 'undefined' && module.exports)
            ? require('../schema/index.js').ObjectSchema
            : window.ObjectSchema;
        if (!s || typeof s.worldRect !== 'function') {
            throw new Error('[Bullet] ObjectSchema.worldRect is not loaded — load ' +
                'objects/schema/valueNormalizer.js + objects/schema/index.js (stack-boot.js roster).');
        }
        return s;
    }

    // ── Bullet ──────────────────────────────────────────────────────────────

    /**
     * Create a moving projectile and register its advance tick function.
     *
     * @param {Object} universe - Already-init'd universe (JS or WASM).
     * @param {Object} [opts]   - See module-level JSDoc above.
     */
    function Bullet(universe, opts) {
        opts = opts || {};

        // The world rect the co-init call wrote (EGPTUniverse.create({rect})) — the ONE size.
        var world = _schema().worldRect(universe.universe_rect, 'Bullet universe.universe_rect');
        var cw = world.w;
        var ch = world.h;

        var bw   = opts.w    !== undefined ? opts.w    : 8;
        var bh   = opts.h    !== undefined ? opts.h    : 8;
        var bx   = opts.x    !== undefined ? opts.x    : 0;
        var by   = opts.y    !== undefined ? opts.y    : Math.floor(ch / 2) - Math.floor(bh / 2);
        var vx   = opts.speed         !== undefined ? opts.speed         : 2;
        var ct   = opts.collisionType !== undefined ? opts.collisionType : CollisionTypes.BOUNCE;
        var col  = opts.color         !== undefined ? opts.color         : [40, 40, 40];
        var name = opts.name          !== undefined ? opts.name          : 'bullet';
        var loop = opts.loop !== undefined ? !!opts.loop : true;
        // Eject mode for the BOUNCE op-program. 2D default 'closest' (4 faces); a 3D scene
        // (activeAxes.z) passes 'closest3d' so quanta can be pushed out the near/far z faces too.
        var repo = opts.reposition !== undefined ? opts.reposition : 'closest';

        // Mutable state — advanced by the tick function below.
        // rect is [left, top, w, h] (is_centered=false convention, same as LargeObject).
        var _left = bx;
        var _top  = by;

        this.lo = new LargeObject(
            universe,
            [_left, _top, bw, bh],
            CollisionTypes.NONE, ['BOUNCE'],
            name, repo, null, 1,
            col
        );
        // ── Render shape (renderer-only hints; physics is unaffected) ──────────────
        // shape:'box' → the provider wraps the LO with a 3D BoxGeometry (a solid cube of
        // w×h×depth) instead of a flat plane, so the projectile reads as a real 3D object
        // from every angle. A box has volume, so it does NOT billboard. Any other shape
        // (default: a flat plane) billboards to face the camera (a disc coming AT the viewer).
        this.lo.shape = (opts.shape !== undefined) ? opts.shape : 'box';
        this.lo.depth = (opts.depth !== undefined) ? opts.depth : bw;   // cube z-extent
        if (this.lo.shape === 'box') {
            this.lo.billboard = false;                                   // a cube doesn't billboard
        } else {
            this.lo.billboard = (opts.billboard !== undefined) ? !!opts.billboard : true;
        }
        this.handle = this.lo.handle;
        this.vx     = vx;

        var self = this;

        /**
         * Advance the bullet one tick.
         * Registered on universe.experimentTickFunctions so this runs as Phase A
         * injection for the next tick.
         *
         * When the bullet exits the right edge (left > cw) and opts.loop is true,
         * it wraps back to the left edge so the demo runs continuously.
         * When loop is false the rect is left at the exit position — the LO
         * still exists but no longer intersects any quanta.
         */
        this.tick = function () {
            _left += self.vx;
            if (_left > cw) {
                if (loop) {
                    _left = -bw;   // re-enter from left
                } else {
                    return;        // off-screen — stop advancing
                }
            }
            // Mutate the JS LargeObject wrapper's rect so the RENDERER moves the bullet —
            // it reads the world census entry's .rect each frame. `universe.updateObjectProperty`
            // does NOT touch the JS wrapper (only FrqtlApp.updateObjectProperty does —
            // see wasm-engine.js:513-516 + FrqtlApp.js:422); the bullet tick-fn only
            // has `universe`, so we mirror that wrapper-mutate here (Rectangle .left/.top setters).
            self.lo.rect.left = _left;
            self.lo.rect.top  = _top;
            // Move the engine-side collision region too, so the compression wake follows the bullet.
            universe.updateObjectProperty(
                self.handle, 'LargeObject', 'rect',
                [_left, _top, bw, bh]
            );
        };

        universe.experimentTickFunctions.push(this.tick);
    }

    // ── Export ───────────────────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { Bullet: Bullet };
    } else {
        window.Bullet = Bullet;
    }

})();
