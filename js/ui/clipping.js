/**
 * @fileoverview クリッピング平面管理モジュール
 *
 * このモジュールは3Dクリッピング平面操作を管理します：
 * - 階ベースのクリッピング平面適用
 * - 軸ベースのクリッピング平面適用
 * - クリッピング平面のクリアとリセット
 * - クリッピング平面座標計算
 *
 * より良い整理のため、大きなui.jsモジュールから分割されました。
 */

import * as THREE from 'three';
import { getCurrentStories, getCurrentAxesData } from './state.js';

import { clearClippingPlanes, applyClipPlanes } from '../viewer/index.js';

// Current clipping state
let currentClippingState = {
  type: null, // 'story', 'xAxis', 'yAxis'
  id: null,
  range: null,
  bounds: null
};

// Camera state for restoration
let previousCameraState = {
  position: null,
  target: null,
  saved: false
};


/**
 * Apply story-based clipping plane
 * @param {string} storyId - Story ID to clip to (optional)
 * @param {number} customRange - Custom range in mm (optional)
 */
export function applyStoryClip(storyId = null, customRange = null) {
  if (!storyId || storyId === 'all') {
    console.log('Clearing story clipping (showing all stories)');
    clearCurrentClipping();
    return;
  }

  const stories = getCurrentStories();
  const selectedStory = stories.find((story) => story.id === storyId);

  if (!selectedStory) {
    console.warn(`Story with ID ${storyId} not found`);
    return;
  }

  // Use custom range or default
  const range = customRange || 1000; // Default 1m
  console.log(
    `Applying story clipping for: ${selectedStory.name} (height: ${selectedStory.height}mm, range: ±${range}mm)`
  );

  // Calculate clipping bounds for the story with custom range
  const storyBounds = calculateStoryBoundsWithRange(
    selectedStory,
    stories,
    range
  );

  if (storyBounds) {
    const clippingPlanes = createStoryClippingPlanes(storyBounds);

    if (applyClipPlanes && clippingPlanes.length > 0) {
      applyClipPlanes(clippingPlanes);

      // Update current clipping state
      currentClippingState = {
        type: 'story',
        id: storyId,
        range: range,
        bounds: storyBounds
      };

      console.log(`Applied ${clippingPlanes.length} story clipping planes`);
      showClippingControls('story');
    }
  }
}

/**
 * Apply axis-based clipping plane
 * @param {string} axisType - "X" or "Y"
 * @param {string} axisId - Axis ID to clip to (optional)
 * @param {number} customRange - Custom range in mm (optional)
 */
export function applyAxisClip(axisType, axisId = null, customRange = null) {
  console.log(`=== AXIS CLIPPING DEBUG ===`);
  console.log(
    `applyAxisClip called with: axisType=${axisType}, axisId=${axisId}, customRange=${customRange}`
  );

  // First, check what's in the dropdown selector
  const selectorId = axisType === 'X' ? 'xAxisSelector' : 'yAxisSelector';
  const selector = document.getElementById(selectorId);
  if (selector) {
    console.log(
      `${axisType}-axis selector found with ${selector.options.length} options:`
    );
    Array.from(selector.options).forEach((option, index) => {
      console.log(
        `  Option ${index}: value="${option.value}", text="${option.textContent}"`
      );
    });
    console.log(`Currently selected: "${selector.value}"`);
  } else {
    console.warn(`${axisType}-axis selector not found in DOM`);
  }

  if (!axisId || axisId === 'all') {
    console.log(`Clearing ${axisType}-axis clipping`);
    clearCurrentClipping();
    return;
  }

  const axesData = getCurrentAxesData();
  console.log(`Current axes data from state:`, axesData);
  console.log(
    `X-axes count: ${axesData.xAxes.length}, Y-axes count: ${axesData.yAxes.length}`
  );

  const axes = axisType === 'X' ? axesData.xAxes : axesData.yAxes;
  console.log(`${axisType}-axes array from state:`, axes);

  const selectedAxis = axes.find((axis) => axis.id === axisId);
  console.log(`Selected axis for ID ${axisId}:`, selectedAxis);

  if (!selectedAxis) {
    console.warn(
      `${axisType}-axis with ID ${axisId} not found in axes array:`,
      axes
    );

    // Check if axes data is empty
    if (axes.length === 0) {
      alert(
        `${axisType}軸データが読み込まれていません。STBファイルに軸情報が含まれているか確認してください。`
      );
    } else {
      alert(`選択された${axisType}軸（ID: ${axisId}）が見つかりません。`);
    }
    return;
  }

  // Use custom range or default
  const range = customRange || 2000; // Default 2m for axes
  console.log(
    `Applying ${axisType}-axis clipping for: ${selectedAxis.name} (distance: ${selectedAxis.distance}mm, range: ±${range}mm)`
  );

  // Calculate clipping bounds for the axis with custom range
  const axisBounds = calculateAxisBoundsWithRange(
    selectedAxis,
    axisType,
    axes,
    range
  );
  console.log(`Calculated axis bounds:`, axisBounds);

  if (axisBounds) {
    const clippingPlanes = createAxisClippingPlanes(axisBounds, axisType);
    console.log(
      `Created ${clippingPlanes.length} clipping planes:`,
      clippingPlanes
    );

    if (applyClipPlanes && clippingPlanes.length > 0) {
      applyClipPlanes(clippingPlanes);

      // Update current clipping state
      currentClippingState = {
        type: axisType.toLowerCase() + 'Axis',
        id: axisId,
        range: range,
        bounds: axisBounds
      };

      console.log(
        `Applied ${clippingPlanes.length} ${axisType}-axis clipping planes`
      );
      showClippingControls(axisType.toLowerCase() + 'Axis');
    } else {
      console.error(
        `Failed to apply clipping planes. applyClipPlanes function available: ${!!applyClipPlanes}`
      );
    }
  } else {
    console.error(`Failed to calculate axis bounds for ${axisType}-axis`);
  }
  console.log(`=== END AXIS CLIPPING DEBUG ===`);
}

/**
 * Calculate bounds for story clipping
 * @param {Object} selectedStory - Selected story data
 * @param {Array} allStories - All story data for context
 * @returns {Object|null} Story bounds or null
 */
function calculateStoryBounds(selectedStory, allStories) {
  try {
    const storyHeight = selectedStory.height;

    // Find adjacent stories to determine bounds
    const sortedStories = [...allStories].sort((a, b) => a.height - b.height);
    const currentIndex = sortedStories.findIndex(
      (story) => story.id === selectedStory.id
    );

    let lowerBound, upperBound;

    if (currentIndex > 0) {
      // Use height of story below as lower bound
      lowerBound = sortedStories[currentIndex - 1].height;
    } else {
      // First story - use some offset below current height
      lowerBound = storyHeight - 3000; // 3m below
    }

    if (currentIndex < sortedStories.length - 1) {
      // Use height of story above as upper bound
      upperBound = sortedStories[currentIndex + 1].height;
    } else {
      // Last story - use some offset above current height
      upperBound = storyHeight + 3000; // 3m above
    }

    return {
      type: 'story',
      storyId: selectedStory.id,
      storyName: selectedStory.name,
      height: storyHeight,
      lowerBound,
      upperBound
    };
  } catch (error) {
    console.error('Error calculating story bounds:', error);
    return null;
  }
}

/**
 * Calculate bounds for axis clipping
 * @param {Object} selectedAxis - Selected axis data
 * @param {string} axisType - "X" or "Y"
 * @param {Array} allAxes - All axes of this type for context
 * @returns {Object|null} Axis bounds or null
 */
function calculateAxisBounds(selectedAxis, axisType, allAxes) {
  try {
    const axisDistance = selectedAxis.distance;

    // Find adjacent axes to determine bounds
    const sortedAxes = [...allAxes].sort((a, b) => a.distance - b.distance);
    const currentIndex = sortedAxes.findIndex(
      (axis) => axis.id === selectedAxis.id
    );

    let lowerBound, upperBound;

    if (currentIndex > 0) {
      // Use distance of previous axis as lower bound
      const prevDistance = sortedAxes[currentIndex - 1].distance;
      lowerBound = (prevDistance + axisDistance) / 2;
    } else {
      // First axis - use some offset
      lowerBound = axisDistance - 1000; // 1m before
    }

    if (currentIndex < sortedAxes.length - 1) {
      // Use distance of next axis as upper bound
      const nextDistance = sortedAxes[currentIndex + 1].distance;
      upperBound = (axisDistance + nextDistance) / 2;
    } else {
      // Last axis - use some offset
      upperBound = axisDistance + 1000; // 1m after
    }

    return {
      type: 'axis',
      axisType,
      axisId: selectedAxis.id,
      axisName: selectedAxis.name,
      distance: axisDistance,
      lowerBound,
      upperBound
    };
  } catch (error) {
    console.error('Error calculating axis bounds:', error);
    return null;
  }
}

/**
 * Create clipping planes for story bounds
 * @param {Object} storyBounds - Story bounds data
 * @returns {Array<THREE.Plane>} Array of clipping planes
 */
function createStoryClippingPlanes(storyBounds) {
  const planes = [];

  try {
    // Lower clipping plane (normal pointing up)
    const lowerPlane = new THREE.Plane(
      new THREE.Vector3(0, 0, 1), // Normal pointing up (positive Z)
      -storyBounds.lowerBound // Distance (negative because plane equation)
    );
    planes.push(lowerPlane);

    // Upper clipping plane (normal pointing down)
    const upperPlane = new THREE.Plane(
      new THREE.Vector3(0, 0, -1), // Normal pointing down (negative Z)
      storyBounds.upperBound // Distance
    );
    planes.push(upperPlane);

    console.log(
      `Created story clipping planes: Z between ${storyBounds.lowerBound} and ${storyBounds.upperBound}`
    );
  } catch (error) {
    console.error('Error creating story clipping planes:', error);
  }

  return planes;
}

/**
 * Create clipping planes for axis bounds
 * @param {Object} axisBounds - Axis bounds data
 * @param {string} axisType - "X" or "Y"
 * @returns {Array<THREE.Plane>} Array of clipping planes
 */
function createAxisClippingPlanes(axisBounds, axisType) {
  const planes = [];

  try {
    if (axisType === 'X') {
      // X-axis clipping (perpendicular to X-axis)

      // Lower clipping plane (normal pointing in positive X)
      const lowerPlane = new THREE.Plane(
        new THREE.Vector3(1, 0, 0), // Normal pointing in positive X
        -axisBounds.lowerBound // Distance
      );
      planes.push(lowerPlane);

      // Upper clipping plane (normal pointing in negative X)
      const upperPlane = new THREE.Plane(
        new THREE.Vector3(-1, 0, 0), // Normal pointing in negative X
        axisBounds.upperBound // Distance
      );
      planes.push(upperPlane);

      console.log(
        `Created X-axis clipping planes: X between ${axisBounds.lowerBound} and ${axisBounds.upperBound}`
      );
    } else if (axisType === 'Y') {
      // Y-axis clipping (perpendicular to Y-axis)

      // Lower clipping plane (normal pointing in positive Y)
      const lowerPlane = new THREE.Plane(
        new THREE.Vector3(0, 1, 0), // Normal pointing in positive Y
        -axisBounds.lowerBound // Distance
      );
      planes.push(lowerPlane);

      // Upper clipping plane (normal pointing in negative Y)
      const upperPlane = new THREE.Plane(
        new THREE.Vector3(0, -1, 0), // Normal pointing in negative Y
        axisBounds.upperBound // Distance
      );
      planes.push(upperPlane);

      console.log(
        `Created Y-axis clipping planes: Y between ${axisBounds.lowerBound} and ${axisBounds.upperBound}`
      );
    }
  } catch (error) {
    console.error('Error creating axis clipping planes:', error);
  }

  return planes;
}

/**
 * Clear all clipping planes
 */
export function clearAllClippingPlanes() {
  console.log('Clearing all clipping planes');
  clearCurrentClipping();
}

/**
 * Get current clipping plane information
 * @returns {Object} Clipping plane status
 */
export function getClippingStatus() {
  // This would need to query the actual clipping state from the renderer
  // For now, return a placeholder
  return {
    hasActiveClipping: false, // Would check actual state
    planeCount: 0,
    type: null, // 'story', 'axis', or 'custom'
    bounds: null
  };
}

/**
 * Apply custom clipping planes
 * @param {Array<THREE.Plane>} planes - Custom clipping planes
 */
export function applyCustomClippingPlanes(planes) {
  if (!Array.isArray(planes) || planes.length === 0) {
    console.warn('Invalid clipping planes provided');
    return;
  }

  console.log(`Applying ${planes.length} custom clipping planes`);

  if (applyClipPlanes) {
    applyClipPlanes(planes);
  } else {
    console.warn('applyClipPlanes function not available');
  }
}

/**
 * Create a clipping plane from point and normal
 * @param {THREE.Vector3} point - Point on the plane
 * @param {THREE.Vector3} normal - Normal vector of the plane
 * @returns {THREE.Plane} Clipping plane
 */
export function createClippingPlaneFromPointAndNormal(point, normal) {
  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint(normal.normalize(), point);
  return plane;
}

/**
 * Create a box clipping region
 * @param {THREE.Box3} box - Bounding box to clip to
 * @returns {Array<THREE.Plane>} Array of 6 clipping planes
 */
export function createBoxClippingPlanes(box) {
  const planes = [];
  const min = box.min;
  const max = box.max;

  // 6 planes for a box (one for each face)
  planes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -min.x)); // Left
  planes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), max.x)); // Right
  planes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -min.y)); // Bottom
  planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), max.y)); // Top
  planes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), -min.z)); // Near
  planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), max.z)); // Far

  return planes;
}

// === NEW FUNCTIONS FOR RANGE-ADJUSTABLE CLIPPING ===

/**
 * Calculate story bounds with custom range
 * @param {Object} selectedStory - Selected story data
 * @param {Array} allStories - All story data
 * @param {number} range - Range in mm
 * @returns {Object|null} Story bounds
 */
function calculateStoryBoundsWithRange(selectedStory, allStories, range) {
  try {
    const storyHeight = selectedStory.height;

    return {
      type: 'story',
      storyId: selectedStory.id,
      storyName: selectedStory.name,
      height: storyHeight,
      lowerBound: storyHeight - range,
      upperBound: storyHeight + range
    };
  } catch (error) {
    console.error('Error calculating story bounds with range:', error);
    return null;
  }
}

/**
 * Calculate axis bounds with custom range
 * @param {Object} selectedAxis - Selected axis data
 * @param {string} axisType - "X" or "Y"
 * @param {Array} allAxes - All axes
 * @param {number} range - Range in mm
 * @returns {Object|null} Axis bounds
 */
function calculateAxisBoundsWithRange(selectedAxis, axisType, allAxes, range) {
  try {
    const axisDistance = selectedAxis.distance;

    return {
      type: 'axis',
      axisType,
      axisId: selectedAxis.id,
      axisName: selectedAxis.name,
      distance: axisDistance,
      lowerBound: axisDistance - range,
      upperBound: axisDistance + range
    };
  } catch (error) {
    console.error('Error calculating axis bounds with range:', error);
    return null;
  }
}

/**
 * Show clipping range controls for the specified type
 * @param {string} type - 'story', 'xAxis', or 'yAxis'
 */
function showClippingControls(type) {
  // Hide all controls first
  const controlIds = [
    'storyClipControls',
    'xAxisClipControls',
    'yAxisClipControls'
  ];
  controlIds.forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.classList.add('hidden');
  });

  // Show the relevant control
  const controlId = type + 'ClipControls';
  const controlElement = document.getElementById(controlId);
  if (controlElement) {
    controlElement.classList.remove('hidden');

    // Mark the group as active
    const groupElement = controlElement.closest('.clipping-group');
    if (groupElement) {
      groupElement.classList.add('active', 'clipping-active');
    }
  }
}

/**
 * Hide all clipping range controls
 */
function hideAllClippingControls() {
  const controlIds = [
    'storyClipControls',
    'xAxisClipControls',
    'yAxisClipControls'
  ];
  controlIds.forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.classList.add('hidden');
  });

  // Remove active states
  const groups = document.querySelectorAll('.clipping-group');
  groups.forEach((group) => {
    group.classList.remove('active', 'clipping-active');
  });
}

/**
 * Clear current clipping and reset UI
 */
async function clearCurrentClipping() {
  console.log('Clearing current clipping state and UI');

  // Restore camera view if saved
  await restorePreviousCameraView();

  if (clearClippingPlanes) {
    clearClippingPlanes();
  } else {
    console.warn('clearClippingPlanes function not available');
  }

  currentClippingState = {
    type: null,
    id: null,
    range: null,
    bounds: null
  };

  hideAllClippingControls();

  // Reset selector values to "all"
  const storySelector = document.getElementById('storySelector');
  const xAxisSelector = document.getElementById('xAxisSelector');
  const yAxisSelector = document.getElementById('yAxisSelector');

  if (storySelector && storySelector.value !== 'all') {
    storySelector.value = 'all';
  }
  if (xAxisSelector && xAxisSelector.value !== 'all') {
    xAxisSelector.value = 'all';
  }
  if (yAxisSelector && yAxisSelector.value !== 'all') {
    yAxisSelector.value = 'all';
  }

  // Request render update with multiple fallback methods
  if (typeof window.requestRender === 'function') {
    window.requestRender();
  } else if (typeof window.scheduleRender === 'function') {
    window.scheduleRender();
  } else {
    // Direct render fallback
    try {
      const { scene, camera, renderer, controls } = await import(
        '../viewer/index.js'
      );
      if (renderer && scene && camera) {
        if (controls) controls.update();
        renderer.render(scene, camera);
        console.log('Direct render executed for clipping clear');
      }
    } catch (error) {
      console.warn('Could not perform direct render:', error);
    }
  }
}

/**
 * Update clipping range for current active clipping
 * @param {number} newRange - New range in mm
 */
export function updateClippingRange(newRange) {
  if (!currentClippingState.type || !currentClippingState.id) {
    console.warn('No active clipping to update');
    return;
  }

  const { type, id } = currentClippingState;

  switch (type) {
    case 'story':
      applyStoryClip(id, newRange);
      break;
    case 'xAxis':
      applyAxisClip('X', id, newRange);
      break;
    case 'yAxis':
      applyAxisClip('Y', id, newRange);
      break;
  }
}

/**
 * Get current clipping state
 * @returns {Object} Current clipping state
 */
export function getCurrentClippingState() {
  return { ...currentClippingState };
}

/**
 * Restore camera to previous view (public export)
 * @returns {Promise<void>}
 */
export async function restoreCameraView() {
  await restorePreviousCameraView();
}

// === CAMERA ADJUSTMENT FUNCTIONS ===

/**
 * Save current camera state for later restoration
 * @param {THREE.Camera} camera - Camera to save state from
 * @param {OrbitControls} controls - Controls to save target from
 */
function saveCameraState(camera, controls) {
  if (camera && controls) {
    previousCameraState = {
      position: camera.position.clone(),
      target: controls.target.clone(),
      saved: true
    };
    console.log('Camera state saved:', {
      position: previousCameraState.position,
      target: previousCameraState.target
    });
  }
}

/**
 * Restore previously saved camera state
 * @param {THREE.Camera} camera - Camera to restore state to
 * @param {OrbitControls} controls - Controls to restore target to
 * @param {boolean} animate - Whether to animate the transition
 */
function restoreCameraState(camera, controls, animate = true) {
  if (!previousCameraState.saved || !camera || !controls) {
    console.warn(
      'Cannot restore camera state: no saved state or missing camera/controls'
    );
    return;
  }

  if (animate) {
    animateCameraTo(camera, controls, {
      position: previousCameraState.position,
      target: previousCameraState.target
    });
  } else {
    camera.position.copy(previousCameraState.position);
    controls.target.copy(previousCameraState.target);
    controls.update();
  }

  console.log('Camera state restored');
}

/**
 * Set optimal camera view for clipping type
 * @param {string} clippingType - Type of clipping ('story', 'xAxis', 'yAxis')
 * @param {Object} clippingBounds - Bounds of the clipping area
 * @param {THREE.Camera} camera - Camera to adjust
 * @param {OrbitControls} controls - Camera controls
 */
function setOptimalClippingView(
  clippingType,
  clippingBounds,
  camera,
  controls
) {
  if (!camera || !controls || !clippingBounds) {
    console.warn(
      'Cannot set optimal view: missing camera, controls, or bounds'
    );
    return;
  }

  // Save current state before changing
  saveCameraState(camera, controls);

  const { position, target, up } = calculateOptimalCameraPosition(
    clippingType,
    clippingBounds
  );

  // Animate to new position
  animateCameraTo(camera, controls, { position, target, up });
}

/**
 * Calculate optimal camera position for clipping type
 * @param {string} clippingType - Type of clipping
 * @param {Object} bounds - Clipping bounds
 * @returns {Object} Camera position, target, and up vector
 */
async function calculateOptimalCameraPosition(clippingType, bounds) {
  // Get model center from the viewer
  const modelCenter = new THREE.Vector3(0, 0, 0);
  try {
    const { getModelBounds } = await import('../viewer/index.js');
    if (getModelBounds) {
      const modelBounds = getModelBounds();
      if (modelBounds) {
        modelBounds.getCenter(modelCenter);
        console.log('Using model center:', modelCenter);
      }
    }
  } catch (error) {
    console.warn('Could not get model bounds, using origin:', error);
  }

  const distance = 15000; // 15m away from the clipping plane
  let position, target, up;

  switch (clippingType) {
    case 'story':
      // Top-down view for story clipping (平面図)
      target = new THREE.Vector3(
        modelCenter.x,
        modelCenter.y,
        bounds.height || modelCenter.z
      );
      position = new THREE.Vector3(
        modelCenter.x,
        modelCenter.y,
        (bounds.height || modelCenter.z) + distance
      );
      up = new THREE.Vector3(0, 1, 0); // Y is up in plan view
      break;

    case 'xAxis':
      // Side view looking along X-axis (YZ平面図)
      target = new THREE.Vector3(
        bounds.distance || modelCenter.x,
        modelCenter.y,
        modelCenter.z
      );
      position = new THREE.Vector3(
        (bounds.distance || modelCenter.x) + distance,
        modelCenter.y,
        modelCenter.z
      );
      up = new THREE.Vector3(0, 0, 1); // Z is up in elevation view
      break;

    case 'yAxis':
      // Side view looking along Y-axis (XZ平面図)
      target = new THREE.Vector3(
        modelCenter.x,
        bounds.distance || modelCenter.y,
        modelCenter.z
      );
      position = new THREE.Vector3(
        modelCenter.x,
        (bounds.distance || modelCenter.y) + distance,
        modelCenter.z
      );
      up = new THREE.Vector3(0, 0, 1); // Z is up in elevation view
      break;

    default:
      console.warn('Unknown clipping type:', clippingType);
      return null;
  }

  return { position, target, up };
}

/**
 * Set camera for clipping mode with fallback handling
 * @param {string} clippingType - Type of clipping
 * @param {Object} bounds - Clipping bounds
 */
async function setCameraForClipping(clippingType, bounds) {
  try {
    const { camera, controls } = await import('../viewer/index.js');
    if (camera && controls) {
      const cameraSettings = await calculateOptimalCameraPosition(
        clippingType,
        bounds
      );
      if (cameraSettings) {
        // Save current state before changing
        saveCameraState(camera, controls);

        // Animate to new position
        animateCameraTo(camera, controls, cameraSettings);
      }
    } else {
      console.warn(
        'Camera or controls not available for optimal view adjustment'
      );
    }
  } catch (error) {
    console.warn('Could not set optimal camera view:', error);
  }
}

/**
 * Restore previous camera view with fallback handling
 */
async function restorePreviousCameraView() {
  try {
    const { camera, controls } = await import('../viewer/index.js');
    if (camera && controls) {
      restoreCameraState(camera, controls);
    } else {
      console.warn('Camera or controls not available for view restoration');
    }
  } catch (error) {
    console.warn('Could not restore camera view:', error);
  }
}

/**
 * Animate camera to new position smoothly
 * @param {THREE.Camera} camera - Camera to animate
 * @param {OrbitControls} controls - Camera controls
 * @param {Object} target - Target camera state {position, target, up}
 */
function animateCameraTo(camera, controls, target) {
  const duration = 1000; // 1 second animation
  const startTime = Date.now();

  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const startUp = camera.up.clone();

  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Smooth easing function
    const easeProgress = 1 - Math.pow(1 - progress, 3);

    // Interpolate position
    camera.position.lerpVectors(startPosition, target.position, easeProgress);

    // Interpolate target
    controls.target.lerpVectors(startTarget, target.target, easeProgress);

    // Interpolate up vector if provided
    if (target.up) {
      camera.up.lerpVectors(startUp, target.up, easeProgress);
    }

    controls.update();

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      console.log('Camera animation completed');
    }
  }

  animate();
}
