/**
 * @fileoverview Label visibility management module
 *
 * This module manages label visibility and display:
 * - Label visibility calculations based on UI state
 * - Performance-optimized label updates
 * - Batched label visibility operations
 * - Label filtering and selection
 *
 * Split from the large ui.js module for better organization.
 */

import { getAllLabels } from "./state.js";
import { 
  getCurrentStorySelection, 
  getCurrentXAxisSelection, 
  getCurrentYAxisSelection 
} from "./selectors.js";
import { elementGroups } from "../viewer/index.js";

// Performance optimization: batch label updates
let labelUpdateScheduled = false;
const pendingLabelUpdates = new Set();

/**
 * Update visibility of all labels based on current UI state
 */
export function updateAllLabelVisibility() {
  const allLabels = getAllLabels();
  
  if (allLabels.length === 0) {
    console.log("No labels to update");
    return;
  }

  console.log(`Updating visibility for ${allLabels.length} labels...`);
  
  // Get current selector values
  const selectedStoryId = getCurrentStorySelection();
  const selectedXAxisId = getCurrentXAxisSelection();
  const selectedYAxisId = getCurrentYAxisSelection();

  let visibleCount = 0;
  let hiddenCount = 0;

  // Process each label
  for (const label of allLabels) {
    const shouldBeVisible = calculateLabelVisibility(
      label, 
      selectedStoryId, 
      selectedXAxisId, 
      selectedYAxisId
    );

    if (label.visible !== shouldBeVisible) {
      label.visible = shouldBeVisible;
      
      if (shouldBeVisible) {
        visibleCount++;
      } else {
        hiddenCount++;
      }
    }
  }

  console.log(`Label visibility updated: ${visibleCount} visible, ${hiddenCount} hidden`);
}

/**
 * Calculate whether a label should be visible based on current selections
 * @param {THREE.Object3D} label - Label object to check
 * @param {string} selectedStoryId - Currently selected story ID
 * @param {string} selectedXAxisId - Currently selected X-axis ID
 * @param {string} selectedYAxisId - Currently selected Y-axis ID
 * @returns {boolean} Whether label should be visible
 */
function calculateLabelVisibility(label, selectedStoryId, selectedXAxisId, selectedYAxisId) {
  if (!label || !label.userData) {
    return false;
  }

  const userData = label.userData;
  
  // Check label toggle checkbox state for this element type
  if (userData.elementType) {
    const labelCheckbox = document.getElementById(`toggleLabel-${userData.elementType}`);
    if (labelCheckbox && !labelCheckbox.checked) {
      return false;
    }
  }
  
  // Check story visibility
  if (selectedStoryId !== "all") {
    if (userData.storyId && userData.storyId !== selectedStoryId) {
      return false;
    }
  }

  // Check X-axis visibility
  if (selectedXAxisId !== "all") {
    if (userData.xAxisId && userData.xAxisId !== selectedXAxisId) {
      return false;
    }
  }

  // Check Y-axis visibility
  if (selectedYAxisId !== "all") {
    if (userData.yAxisId && userData.yAxisId !== selectedYAxisId) {
      return false;
    }
  }

  // Check element type visibility (if parent group is hidden, hide label)
  if (userData.elementType) {
    const parentGroup = getElementGroupForType(userData.elementType);
    if (parentGroup && !parentGroup.visible) {
      return false;
    }
  }

  return true;
}

/**
 * Get element group for a given element type
 * @param {string} elementType - Element type
 * @returns {THREE.Group|null} Element group or null
 */
function getElementGroupForType(elementType) {
  return elementGroups[elementType] || null;
}

/**
 * Request a batched label visibility update (performance optimization)
 * @param {Array<THREE.Object3D>} labelsToUpdate - Specific labels to update (optional)
 */
export function requestLabelVisibilityUpdate(labelsToUpdate = null) {
  if (labelsToUpdate) {
    labelsToUpdate.forEach(label => pendingLabelUpdates.add(label));
  }

  if (!labelUpdateScheduled) {
    labelUpdateScheduled = true;
    requestAnimationFrame(() => {
      processBatchedLabelUpdates();
      labelUpdateScheduled = false;
    });
  }
}

/**
 * Process batched label updates for performance
 */
function processBatchedLabelUpdates() {
  if (pendingLabelUpdates.size > 0) {
    const labelsToUpdate = Array.from(pendingLabelUpdates);
    pendingLabelUpdates.clear();
    
    console.log(`Processing batched update for ${labelsToUpdate.length} labels`);
    updateSpecificLabels(labelsToUpdate);
  } else {
    updateAllLabelVisibility();
  }
}

/**
 * Update visibility for specific labels only
 * @param {Array<THREE.Object3D>} labels - Labels to update
 */
function updateSpecificLabels(labels) {
  const selectedStoryId = getCurrentStorySelection();
  const selectedXAxisId = getCurrentXAxisSelection();
  const selectedYAxisId = getCurrentYAxisSelection();

  let updatedCount = 0;

  for (const label of labels) {
    const shouldBeVisible = calculateLabelVisibility(
      label, 
      selectedStoryId, 
      selectedXAxisId, 
      selectedYAxisId
    );

    if (label.visible !== shouldBeVisible) {
      label.visible = shouldBeVisible;
      updatedCount++;
    }
  }

  console.log(`Updated ${updatedCount} specific labels`);
}

/**
 * Show all labels
 */
export function showAllLabels() {
  const allLabels = getAllLabels();
  let changedCount = 0;

  for (const label of allLabels) {
    if (!label.visible) {
      label.visible = true;
      changedCount++;
    }
  }

  console.log(`Showed ${changedCount} labels`);
}

/**
 * Hide all labels
 */
export function hideAllLabels() {
  const allLabels = getAllLabels();
  let changedCount = 0;

  for (const label of allLabels) {
    if (label.visible) {
      label.visible = false;
      changedCount++;
    }
  }

  console.log(`Hidden ${changedCount} labels`);
}

/**
 * Filter labels by element type
 * @param {string} elementType - Element type to filter by
 * @returns {Array<THREE.Object3D>} Filtered labels
 */
export function filterLabelsByElementType(elementType) {
  const allLabels = getAllLabels();
  return allLabels.filter(label => 
    label.userData && label.userData.elementType === elementType
  );
}

/**
 * Filter labels by story
 * @param {string} storyId - Story ID to filter by
 * @returns {Array<THREE.Object3D>} Filtered labels
 */
export function filterLabelsByStory(storyId) {
  const allLabels = getAllLabels();
  return allLabels.filter(label => 
    label.userData && label.userData.storyId === storyId
  );
}

/**
 * Get label visibility statistics
 * @returns {Object} Label visibility statistics
 */
export function getLabelVisibilityStatistics() {
  const allLabels = getAllLabels();
  const stats = {
    total: allLabels.length,
    visible: 0,
    hidden: 0,
    byElementType: {},
    byStory: {}
  };

  for (const label of allLabels) {
    if (label.visible) {
      stats.visible++;
    } else {
      stats.hidden++;
    }

    // Count by element type
    const elementType = label.userData?.elementType || 'unknown';
    if (!stats.byElementType[elementType]) {
      stats.byElementType[elementType] = { visible: 0, hidden: 0 };
    }
    
    if (label.visible) {
      stats.byElementType[elementType].visible++;
    } else {
      stats.byElementType[elementType].hidden++;
    }

    // Count by story
    const storyId = label.userData?.storyId || 'unknown';
    if (!stats.byStory[storyId]) {
      stats.byStory[storyId] = { visible: 0, hidden: 0 };
    }
    
    if (label.visible) {
      stats.byStory[storyId].visible++;
    } else {
      stats.byStory[storyId].hidden++;
    }
  }

  return stats;
}

/**
 * Optimize label performance by culling distant labels
 * @param {THREE.Camera} camera - Camera for distance calculation
 * @param {number} maxDistance - Maximum distance to show labels
 */
export function optimizeLabelsByDistance(camera, maxDistance = 10000) {
  const allLabels = getAllLabels();
  let culledCount = 0;

  for (const label of allLabels) {
    const distance = camera.position.distanceTo(label.position);
    const shouldBeVisible = distance <= maxDistance;
    
    if (label.userData) {
      label.userData.culledByDistance = !shouldBeVisible;
    }
    
    if (label.visible && !shouldBeVisible) {
      label.visible = false;
      culledCount++;
    }
  }

  if (culledCount > 0) {
    console.log(`Culled ${culledCount} labels by distance (>${maxDistance}mm)`);
  }
}