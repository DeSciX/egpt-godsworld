/* Copyright 2023-2026 by Essam Abadir */

/**
 * EgptFractal — JS-only fractal oscillator object.
 *
 * Creates a 3-level frame hierarchy: observer > oscillator > quantum.
 * The quantum does a random walk inside the oscillator frame while compress()
 * pulls it toward the oscillator center, creating a stable oscillation.
 * The oscillator itself moves inside the observer frame, and the perceived
 * motion from the observer's rest frame produces an emergent wave pattern.
 *
 * IMPORTANT: This object uses devsdk-specific APIs (Frame.makeLeafFrame,
 * dimension.addFrame, dimension.createFrameFromRect) and is NOT portable
 * to the WASM engine. Mark experiments using this as `portable: false`.
 */

import { Rectangle } from '../../parts/Rectangle.js';
import { engine } from '../../compat/engine.js';
import { registerKind } from '../kinds.js';

    // Frame and Charge are ENGINE values: read through engine() when a fractal is built,
    // never at module evaluation (importing this file boots nothing).

    // ── EgptFractal ─────────────────────────────────────────────────────

    /**
     * @param {Object} universe - The JS engine universe instance (NOT WASM)
     * @param {Object} canvasRect - Rectangle defining the canvas bounds
     */
    function EgptFractal(universe, canvasRect) {
        this.universe = universe;
        this._schemaKind = 'EgptFractal';
        this.canvas_rect = canvasRect;

        var framedelta = 3;

        this.quantum_dimension_number = 2;

        // Observer dimension: highest power-of-2 exponent that fits canvas
        var minSide = Math.min(canvasRect.w, canvasRect.h);
        var observer_dimension_number = Math.floor(Math.log2(minSide));

        // Init universe: frameGenMode:'groundUp' (the default); brownianMotion will be set in setupFractal.
        // Brownian is left OFF here (the engine default for groundUp) so the observer
        // exerts no brownian pull until setupFractal turns it on.
        // noEscape:true confines the quantum to the oscillator (and the oscillator to the
        // observer) so the fractal sustains a stable oscillation instead of leaking its
        // quantum. Without it the quantum escapes the oscillator frame (~tick 55) and the
        // hierarchy collapses to the bare observer — not an oscillator. (Lost when the shim
        // contracts were cleaned up; restored 2026-06-23 with the §2a derived-mass fix.)
        this.universe.init(this.quantum_dimension_number, { wavelengthScale: 1, noEscape: true });

        // Create three dimension layers
        this.quantum_dimension = this.universe.addDimension(this.quantum_dimension_number);
        this.oscillator_dimension = this.universe.addDimension(this.quantum_dimension_number + framedelta);
        this.observer_dimension = this.universe.addDimension(observer_dimension_number);

        this.quanta = [];
        this.oscillator = null;
        this.observer_frame = null;
    }

    /**
     * Build the 3-level frame hierarchy and configure the universe.
     * Returns an empty array (no large objects).
     */
    EgptFractal.prototype.setupFractal = function () {
        // Observer rect at canvas origin
        var observer_rect = new Rectangle(
            this.canvas_rect.x, this.canvas_rect.y,
            this.observer_dimension.mb_w, this.observer_dimension.mb_h,
            null, true
        );

        // Oscillator offset from observer center
        var oscOffsetX = observer_rect.x - this.observer_dimension.mb_w / 4;
        var oscOffsetY = observer_rect.y;
        var oscillator_rect = new Rectangle(
            oscOffsetX, oscOffsetY,
            this.oscillator_dimension.mb_w, this.oscillator_dimension.mb_h,
            null, true
        );

        // Quantum positioned on the lower Y axis of the oscillator
        var pOffsetX = oscillator_rect.x;
        var pOffsetY = oscillator_rect.y + this.oscillator_dimension.mb_h / 4;
        var quantumRect = new Rectangle(
            pOffsetX, pOffsetY,
            this.quantum_dimension.mb_w, this.quantum_dimension.mb_h,
            null, true
        );

        var eng = engine();
        var quantumFrame = eng.Frame.makeLeafFrame(
            quantumRect.left, quantumRect.top,
            this.quantum_dimension_number, 1, 0, 0, false,
            eng.Charge.POSITIVE, this.canvas_rect
        );
        quantumFrame.name = "quantum";
        this.quanta.push(quantumFrame);

        // Add quantum to quantum dimension
        for (var i = 0; i < this.quanta.length; i++) {
            this.quantum_dimension.addFrame(this.quanta[i]);
        }

        // The oscillator + observer render as OUTLINE boxes (the quantum renders filled). This is a
        // pure user-space render choice carried in the frame's generic string_map ('render.outline'),
        // NOT a typed engine flag — so both engines transport it identically (the engine never
        // interprets it). The renderer deserializes string_map['render.outline'].
        var OUTLINE_HINT = { 'render.outline': 'true' };

        // Create oscillator frame containing the quantum
        this.oscillator = this.oscillator_dimension.createFrameFromRect(
            oscillator_rect, this.quanta, 0, 0, true, false, OUTLINE_HINT
        );
        this.oscillator.name = "oscillator";

        // Create observer frame containing the oscillator
        this.observer_frame = this.observer_dimension.createFrameFromRect(
            observer_rect, [this.oscillator], 0, 0, true, true, OUTLINE_HINT
        );
        this.observer_frame.name = "observer";

        // Configure universe
        this.universe.leafQuantaWidth = this.quantum_dimension.mb_w;
        this.universe.brownianMotion = true;

        return [];
    };

    // ── The kind (objects/kinds.js): descriptor, construction defaults ──────────

    /**
     * EgptFractal — JS-only 3-level recursive frame hierarchy oscillator.
     * Constructor: EgptFractal(universe, canvasRect)
     * NOT portable to WASM; experiments must mark portable:false.
     */
    var EgptFractalDescriptor = {
        description: 'A 3-level recursive frame hierarchy that produces emergent wave oscillation. ' +
            'Creates observer > oscillator > quantum dimension layers. The quantum does a random walk ' +
            'inside the oscillator frame; compress() pulls it toward the oscillator center, creating ' +
            'stable oscillation. The oscillator moves inside the observer frame, producing an emergent ' +
            'wave pattern in the observer\'s rest frame. Demonstrates the Frame Axiom at three scales. ' +
            'JS-only: uses Frame.makeLeafFrame and dimension APIs not yet implemented in WASM.',
        fields: [
            {
                name: 'quantum_dimension_number',
                type: 'readonly',
                engineVisible: true,
                description: 'Exponent for the quantum dimension scale (read-only; derived from canvasRect at construction).'
            }
        ]
    };

    registerKind(EgptFractal, {
        from: import.meta.url,
        descriptor: EgptFractalDescriptor
    });

    // ── Export ───────────────────────────────────────────────────────────

    export { EgptFractal };

