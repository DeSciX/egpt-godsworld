/* Copyright 2023-2026 by Essam Abadir */

/**
 * Rectangle — Spatial rectangle with auto-computed edges.
 *
 * Supports two construction modes:
 * - Centered (isCentered=true): x,y is the CENTER; left/top/right/bottom auto-computed
 * - Non-centered (isCentered=false): x,y is TOP-LEFT; center auto-computed
 *
 * All edge properties (left, top, right, bottom, x, y) are linked via
 * getters/setters — changing any one updates the others consistently.
 *
 * The SOLE Rectangle authority: the WASM provider wrapper (compat/providers/wasm-engine.js) and
 * every part import it.
 */


    function Rectangle(x, y, w, h, data, isCentered) {
        if (isCentered === undefined) isCentered = true;
        this.is_centered = isCentered;
        this.data = data || null;
        this.w = w;
        this.h = h;

        if (isCentered) {
            // x,y is the center
            this._x = x;
            this._y = y;
            this._left = x - w / 2;
            this._right = x + w / 2;
            this._top = y - h / 2;
            this._bottom = y + h / 2;
        } else {
            // x,y is the top-left corner
            this._x = x + w / 2;
            this._y = y + h / 2;
            this._left = x;
            this._right = x + w;
            this._top = y;
            this._bottom = y + h;
        }
        this.r = w / 2;
    }

    // ── Linked property accessors ────────────────────────────────────────

    Object.defineProperty(Rectangle.prototype, 'x', {
        get: function () { return this._x; },
        set: function (val) {
            this._x = val;
            this._left = val - this.w / 2;
            this._right = val + this.w / 2;
        }
    });

    Object.defineProperty(Rectangle.prototype, 'y', {
        get: function () { return this._y; },
        set: function (val) {
            this._y = val;
            this._top = val - this.h / 2;
            this._bottom = val + this.h / 2;
        }
    });

    Object.defineProperty(Rectangle.prototype, 'left', {
        get: function () { return this._left; },
        set: function (val) {
            this._left = val;
            this._x = val + this.w / 2;
            this._right = val + this.w;
        }
    });

    Object.defineProperty(Rectangle.prototype, 'right', {
        get: function () { return this._right; },
        set: function (val) {
            this._right = val;
            this._x = val - this.w / 2;
            this._left = val - this.w;
        }
    });

    Object.defineProperty(Rectangle.prototype, 'top', {
        get: function () { return this._top; },
        set: function (val) {
            this._top = val;
            this._y = val + this.h / 2;
            this._bottom = val + this.h;
        }
    });

    Object.defineProperty(Rectangle.prototype, 'bottom', {
        get: function () { return this._bottom; },
        set: function (val) {
            this._bottom = val;
            this._y = val - this.h / 2;
            this._top = val - this.h;
        }
    });

    Object.defineProperty(Rectangle.prototype, 'area', {
        get: function () { return this.w * this.h; }
    });

    // ── Spatial queries ──────────────────────────────────────────────────

    Rectangle.prototype.contains = function (other) {
        return (this.left <= other.left && this.right >= other.right &&
                this.top <= other.top && this.bottom >= other.bottom);
    };

    Rectangle.prototype.intersects = function (other) {
        return (this.left <= other.right && this.right >= other.left &&
                this.top <= other.bottom && this.bottom >= other.top);
    };

    Rectangle.prototype.overlaps = function (other) {
        if (!this.intersects(other)) return null;
        var oLeft = Math.max(this.left, other.left);
        var oRight = Math.min(this.right, other.right);
        var oTop = Math.max(this.top, other.top);
        var oBottom = Math.min(this.bottom, other.bottom);
        return new Rectangle(oLeft, oTop, oRight - oLeft, oBottom - oTop, null, false);
    };

    // ── Ejection (reposition other rect out of this rect) ────────────────

    Rectangle.prototype.eject = function (other, toSide, contain) {
        if (!this.overlaps(other)) return;

        var newLeft = other.left;
        var newTop = other.top;

        switch (toSide) {
            case 'top':
                newTop = this.top - other.h - 1;
                break;
            case 'bottom':
                newTop = this.bottom + 1;
                break;
            case 'left':
                newLeft = this.left - other.w - 1;
                break;
            case 'right':
                newLeft = this.right + 1;
                break;
            default:
                // Closest side
                var dLeft = Math.abs(this.left - other.left);
                var dRight = Math.abs(this.right - other.left);
                var dTop = Math.abs(this.top - other.top);
                var dBottom = Math.abs(this.bottom - other.top);
                var minD = Math.min(dLeft, dRight, dTop, dBottom);
                if (minD === dLeft) {
                    newLeft = contain ? this.left + 1 : this.left - other.w - 1;
                } else if (minD === dRight) {
                    newLeft = contain ? this.right - other.w - 1 : this.right + 1;
                } else if (minD === dTop) {
                    newTop = contain ? this.top + 1 : this.top - other.h - 1;
                } else {
                    newTop = contain ? this.bottom - other.h - 1 : this.bottom + 1;
                }
        }
        other.top = newTop;
        other.left = newLeft;
    };

    // ── Distance helpers ─────────────────────────────────────────────────

    Rectangle.prototype.xDistanceFrom = function (point) {
        return (this.left <= point.rect.x && point.rect.x <= this.right)
            ? 0
            : Math.min(Math.abs(point.rect.x - this.left), Math.abs(point.rect.x - this.right));
    };

    Rectangle.prototype.yDistanceFrom = function (point) {
        return (this.top <= point.rect.y && point.rect.y <= this.bottom)
            ? 0
            : Math.min(Math.abs(point.rect.y - this.top), Math.abs(point.rect.y - this.bottom));
    };

    Rectangle.prototype.sqDistanceFrom = function (point) {
        var dx = this.xDistanceFrom(point);
        var dy = this.yDistanceFrom(point);
        return dx * dx + dy * dy;
    };

    Rectangle.prototype.distanceFrom = function (point) {
        return Math.sqrt(this.sqDistanceFrom(point));
    };

    Rectangle.prototype.toString = function () {
        return 'Rectangle(x: ' + this._x + ', y: ' + this._y +
               ', w: ' + this.w + ', h: ' + this.h +
               ', left: ' + this._left + ', right: ' + this._right +
               ', top: ' + this._top + ', bottom: ' + this._bottom +
               ', is_centered: ' + this.is_centered + ')';
    };

export { Rectangle };
