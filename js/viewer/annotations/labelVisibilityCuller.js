/**
 * @fileoverview Camera-frustum based visibility culling for label sprites.
 *
 * UI visibility is stored separately as `labelBaseVisible`. This culler only
 * applies camera visibility and maximum visible label limits.
 */

import * as THREE from 'three';

const ALWAYS_VISIBLE_LABEL_TYPES = new Set(['Axis', 'Story']);

export const DEFAULT_LABEL_CULLING_OPTIONS = {
  enabled: true,
  margin: 1.1,
  maxVisibleLabels: 800,
};

/**
 * @typedef {Object} LabelCullingStats
 * @property {number} total
 * @property {number} baseHidden
 * @property {number} alwaysVisible
 * @property {number} candidates
 * @property {number} visible
 * @property {number} outside
 * @property {number} limitHidden
 */

export class LabelVisibilityCuller {
  constructor(options = {}) {
    this.options = {
      ...DEFAULT_LABEL_CULLING_OPTIONS,
      ...options,
    };
    this._projScreenMatrix = new THREE.Matrix4();
    this._projectedPosition = new THREE.Vector3();
    this._worldPosition = new THREE.Vector3();
    this._lastStats = this._createEmptyStats();
  }

  setOptions(options = {}) {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  setEnabled(enabled) {
    this.options.enabled = !!enabled;
  }

  getStats() {
    return { ...this._lastStats };
  }

  /**
   * Apply label visibility culling for the current camera.
   * @param {Array<THREE.Object3D>} labels
   * @param {THREE.Camera} camera
   * @returns {LabelCullingStats}
   */
  cullLabels(labels, camera) {
    if (!Array.isArray(labels) || labels.length === 0 || !camera) {
      this._lastStats = this._createEmptyStats();
      return this.getStats();
    }

    camera.updateMatrixWorld();
    camera.updateProjectionMatrix?.();
    this._projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

    const stats = this._createEmptyStats();
    stats.total = labels.length;

    const candidates = [];
    const margin = Math.max(1, this.options.margin);
    const maxVisibleLabels = Math.max(0, this.options.maxVisibleLabels);

    for (const label of labels) {
      if (!label?.userData) continue;

      const baseVisible = label.userData.labelBaseVisible ?? label.visible === true;
      label.userData.labelBaseVisible = baseVisible;

      if (!baseVisible) {
        label.visible = false;
        stats.baseHidden++;
        continue;
      }

      if (!this.options.enabled || ALWAYS_VISIBLE_LABEL_TYPES.has(label.userData.elementType)) {
        label.visible = true;
        stats.alwaysVisible++;
        stats.visible++;
        continue;
      }

      this._getLabelWorldPosition(label);
      this._projectedPosition.copy(this._worldPosition).applyMatrix4(this._projScreenMatrix);

      if (!this._isProjectedPositionVisible(this._projectedPosition, margin)) {
        label.visible = false;
        stats.outside++;
        continue;
      }

      label.visible = false;
      stats.candidates++;
      candidates.push({
        label,
        distanceSq: this._worldPosition.distanceToSquared(camera.position),
      });
    }

    candidates.sort((a, b) => a.distanceSq - b.distanceSq);

    const visibleCandidateCount = Math.min(candidates.length, maxVisibleLabels);
    for (let i = 0; i < visibleCandidateCount; i++) {
      candidates[i].label.visible = true;
    }

    stats.visible += visibleCandidateCount;
    stats.limitHidden = Math.max(0, candidates.length - visibleCandidateCount);
    this._lastStats = stats;
    return this.getStats();
  }

  _getLabelWorldPosition(label) {
    label.updateWorldMatrix?.(true, false);
    if (typeof label.getWorldPosition === 'function') {
      label.getWorldPosition(this._worldPosition);
    } else if (label.position) {
      this._worldPosition.copy(label.position);
    } else if (label.userData.originalPosition) {
      this._worldPosition.copy(label.userData.originalPosition);
    } else {
      this._worldPosition.set(0, 0, 0);
    }
  }

  _isProjectedPositionVisible(projectedPosition, margin) {
    return (
      Number.isFinite(projectedPosition.x) &&
      Number.isFinite(projectedPosition.y) &&
      Number.isFinite(projectedPosition.z) &&
      projectedPosition.x >= -margin &&
      projectedPosition.x <= margin &&
      projectedPosition.y >= -margin &&
      projectedPosition.y <= margin &&
      projectedPosition.z >= -1 &&
      projectedPosition.z <= 1
    );
  }

  _createEmptyStats() {
    return {
      total: 0,
      baseHidden: 0,
      alwaysVisible: 0,
      candidates: 0,
      visible: 0,
      outside: 0,
      limitHidden: 0,
    };
  }
}

const labelVisibilityCuller = new LabelVisibilityCuller();

export function getLabelVisibilityCuller() {
  return labelVisibilityCuller;
}
