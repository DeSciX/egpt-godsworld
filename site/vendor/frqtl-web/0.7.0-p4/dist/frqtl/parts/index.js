/* Copyright 2023-2026 by Essam Abadir */

/**
 * parts/index.js — THE parts barrel (@descix/frqtl-web/parts): one export per file in this
 * directory, named by the file. The directory IS the roster — a part joins by being a file here,
 * and the barrel lists exactly the directory (lib/frqtl/parts/test/barrel-equals-directory.test.mjs).
 *
 * Importing it registers every published kind in this realm (each part module registers its own
 * kind with objects/kinds.js when it evaluates).
 */

export { CameraControls } from './CameraControls.js';
export { CameraPath } from './CameraPath.js';
export { CollisionActions } from './CollisionActions.js';
export { CollisionTypes } from './CollisionTypes.js';
export { DetectorWall } from './DetectorWall.js';
export { FrqtlControlOverlay } from './FrqtlControlOverlay.js';
export { FrqtlControlsPanel } from './FrqtlControlsPanel.js';
export { FrqtlVision } from './FrqtlVision.js';
export { GraphingDetectorWall } from './GraphingDetectorWall.js';
export { LargeObject } from './LargeObject.js';
export { LightColor } from './LightColor.js';
export { LiveChart } from './LiveChart.js';
export { LogicGate } from './LogicGate.js';
export { OvenBox } from './OvenBox.js';
export { PointSource } from './PointSource.js';
export { Rectangle } from './Rectangle.js';
export { SlitLightSource } from './SlitLightSource.js';
export { SlitScreen } from './SlitScreen.js';
export { SphereEmitter } from './SphereEmitter.js';
export { Trace } from './Trace.js';
export { Tunnel } from './Tunnel.js';
export { Wall } from './Wall.js';
