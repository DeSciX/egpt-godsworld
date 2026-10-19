/* Copyright 2023-2026 by Essam Abadir */

/**
 * ExperimentMetrics — Lightweight live metrics display component.
 *
 * Renders a table of Metric | Current | Expected values into a container
 * element, and updates values in-place without re-rendering the DOM.
 *
 * Pure vanilla JS. No dependencies.
 *
 * Usage:
 *   const metrics = new ExperimentMetrics('metrics-container', [
 *     { name: 'Active Quanta', expected: null },
 *     { name: 'Observed λ', expected: '12.0 px', unit: 'px', format: v => v.toFixed(1) },
 *   ]);
 *   // In draw loop:
 *   metrics.update({ 'Active Quanta': 47, 'Observed λ': 12.3 });
 */

    /**
     * @param {string} containerId - ID of the DOM element to render into
     * @param {Array<Object>} metricDefinitions - Array of metric descriptors:
     *   { name, expected, unit, format }
     *   - name: string — display name and lookup key in update()
     *   - expected: string|null — expected value string, or null for "—"
     *   - unit: string (optional) — suffix appended to current value
     *   - format: function (optional) — receives raw value, returns display string
     */
    function ExperimentMetrics(containerId, metricDefinitions) {
        this.defs = metricDefinitions || [];
        this._cells = {}; // name → <td> element for current value

        var container = document.getElementById(containerId);
        if (!container) {
            console.warn('ExperimentMetrics: container #' + containerId + ' not found');
            return;
        }

        this._build(container);
    }

    /**
     * Build the metrics table DOM inside the container.
     * @param {HTMLElement} container
     */
    ExperimentMetrics.prototype._build = function (container) {
        container.className = 'experiment-metrics';

        var table = document.createElement('table');
        table.className = 'metric-table';

        // Header row
        var thead = document.createElement('thead');
        var headerRow = document.createElement('tr');
        ['Metric', 'Current', 'Expected'].forEach(function (text) {
            var th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body rows — one per metric definition
        var tbody = document.createElement('tbody');
        var self = this;

        this.defs.forEach(function (def) {
            var tr = document.createElement('tr');

            var tdName = document.createElement('td');
            tdName.textContent = def.name;

            var tdCurrent = document.createElement('td');
            tdCurrent.className = 'metric-current';
            tdCurrent.textContent = '—';

            var tdExpected = document.createElement('td');
            tdExpected.className = 'metric-expected';
            tdExpected.textContent = def.expected != null ? String(def.expected) : '—';

            tr.appendChild(tdName);
            tr.appendChild(tdCurrent);
            tr.appendChild(tdExpected);
            tbody.appendChild(tr);

            // Store reference for fast updates
            self._cells[def.name] = tdCurrent;
        });

        table.appendChild(tbody);
        container.appendChild(table);
    };

    /**
     * Update metric values in-place. Called from the experiment's draw loop.
     *
     * @param {Object} values - Map of metric name → raw value
     */
    ExperimentMetrics.prototype.update = function (values) {
        for (var i = 0; i < this.defs.length; i++) {
            var def = this.defs[i];
            var cell = this._cells[def.name];
            if (!cell) continue;

            var raw = values[def.name];
            if (raw === undefined || raw === null) {
                cell.textContent = '—';
                continue;
            }

            var display;
            if (typeof def.format === 'function') {
                display = def.format(raw);
            } else if (typeof raw === 'number') {
                display = raw.toFixed(2);
            } else {
                display = String(raw);
            }

            if (def.unit) {
                display = display + ' ' + def.unit;
            }

            cell.textContent = display;
        }
    };

    // ── Export ───────────────────────────────────────────────────────────

    export { ExperimentMetrics };

