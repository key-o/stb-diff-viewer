/**
 * @fileoverview Clipping plane management module
 *
 * This module manages 3D clipping plane operations:
 * - Story-based clipping plane application
 * - Axis-based clipping plane application
 * - Clipping plane clearing and reset
 * - Clipping plane coordinate calculations
 *
 * Split from the large ui.js module for better organization.
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import { getCurrentStories, getCurrentAxesData } from "./state.js";

import { clearClippingPlanes, applyClipPlanes } from "../viewer/index.js";

/**
 * Apply story-based clipping plane
 * @param {string} storyId - Story ID to clip to (optional)
 */
export function applyStoryClip(storyId = null) {
  if (!storyId || storyId === "all") {
    console.log("Clearing story clipping (showing all stories)");
    if (clearClippingPlanes) {
      clearClippingPlanes();
    }
    return;
  }

  const stories = getCurrentStories();
  const selectedStory = stories.find(story => story.id === storyId);
  
  if (!selectedStory) {
    console.warn(`Story with ID ${storyId} not found`);
    return;
  }

  console.log(`Applying story clipping for: ${selectedStory.name} (height: ${selectedStory.height}mm)`);

  // Calculate clipping bounds for the story
  const storyBounds = calculateStoryBounds(selectedStory, stories);
  
  if (storyBounds) {
    const clippingPlanes = createStoryClippingPlanes(storyBounds);
    
    if (applyClipPlanes && clippingPlanes.length > 0) {
      applyClipPlanes(clippingPlanes);
      console.log(`Applied ${clippingPlanes.length} story clipping planes`);
    }
  }
}

/**
 * Apply axis-based clipping plane
 * @param {string} axisType - "X" or "Y"
 * @param {string} axisId - Axis ID to clip to (optional)
 */
export function applyAxisClip(axisType, axisId = null) {
  if (!axisId || axisId === "all") {
    console.log(`Clearing ${axisType}-axis clipping`);
    if (clearClippingPlanes) {
      clearClippingPlanes();
    }
    return;
  }

  const axesData = getCurrentAxesData();
  const axes = axisType === "X" ? axesData.xAxes : axesData.yAxes;
  const selectedAxis = axes.find(axis => axis.id === axisId);
  
  if (!selectedAxis) {
    console.warn(`${axisType}-axis with ID ${axisId} not found`);
    return;
  }

  console.log(`Applying ${axisType}-axis clipping for: ${selectedAxis.name} (distance: ${selectedAxis.distance}mm)`);

  // Calculate clipping bounds for the axis
  const axisBounds = calculateAxisBounds(selectedAxis, axisType, axes);
  
  if (axisBounds) {
    const clippingPlanes = createAxisClippingPlanes(axisBounds, axisType);
    
    if (applyClipPlanes && clippingPlanes.length > 0) {
      applyClipPlanes(clippingPlanes);
      console.log(`Applied ${clippingPlanes.length} ${axisType}-axis clipping planes`);
    }
  }
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
    const currentIndex = sortedStories.findIndex(story => story.id === selectedStory.id);
    
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
    console.error("Error calculating story bounds:", error);
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
    const currentIndex = sortedAxes.findIndex(axis => axis.id === selectedAxis.id);
    
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
    console.error("Error calculating axis bounds:", error);
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
      -storyBounds.lowerBound     // Distance (negative because plane equation)
    );
    planes.push(lowerPlane);
    
    // Upper clipping plane (normal pointing down)
    const upperPlane = new THREE.Plane(
      new THREE.Vector3(0, 0, -1), // Normal pointing down (negative Z)
      storyBounds.upperBound      // Distance
    );
    planes.push(upperPlane);
    
    console.log(`Created story clipping planes: Z between ${storyBounds.lowerBound} and ${storyBounds.upperBound}`);
    
  } catch (error) {
    console.error("Error creating story clipping planes:", error);
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
    if (axisType === "X") {
      // X-axis clipping (perpendicular to X-axis)
      
      // Lower clipping plane (normal pointing in positive X)
      const lowerPlane = new THREE.Plane(
        new THREE.Vector3(1, 0, 0),  // Normal pointing in positive X
        -axisBounds.lowerBound       // Distance
      );
      planes.push(lowerPlane);
      
      // Upper clipping plane (normal pointing in negative X)
      const upperPlane = new THREE.Plane(
        new THREE.Vector3(-1, 0, 0), // Normal pointing in negative X
        axisBounds.upperBound        // Distance
      );
      planes.push(upperPlane);
      
      console.log(`Created X-axis clipping planes: X between ${axisBounds.lowerBound} and ${axisBounds.upperBound}`);
      
    } else if (axisType === "Y") {
      // Y-axis clipping (perpendicular to Y-axis)
      
      // Lower clipping plane (normal pointing in positive Y)
      const lowerPlane = new THREE.Plane(
        new THREE.Vector3(0, 1, 0),  // Normal pointing in positive Y
        -axisBounds.lowerBound       // Distance
      );
      planes.push(lowerPlane);
      
      // Upper clipping plane (normal pointing in negative Y)
      const upperPlane = new THREE.Plane(
        new THREE.Vector3(0, -1, 0), // Normal pointing in negative Y
        axisBounds.upperBound        // Distance
      );
      planes.push(upperPlane);
      
      console.log(`Created Y-axis clipping planes: Y between ${axisBounds.lowerBound} and ${axisBounds.upperBound}`);
    }
    
  } catch (error) {
    console.error("Error creating axis clipping planes:", error);
  }
  
  return planes;
}

/**
 * Clear all clipping planes
 */
export function clearAllClippingPlanes() {
  console.log("Clearing all clipping planes");
  
  if (clearClippingPlanes) {
    clearClippingPlanes();
  } else {
    console.warn("clearClippingPlanes function not available");
  }
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
    console.warn("Invalid clipping planes provided");
    return;
  }
  
  console.log(`Applying ${planes.length} custom clipping planes`);
  
  if (applyClipPlanes) {
    applyClipPlanes(planes);
  } else {
    console.warn("applyClipPlanes function not available");
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
  planes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -min.x));   // Left
  planes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), max.x));   // Right
  planes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -min.y));   // Bottom
  planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), max.y));   // Top
  planes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), -min.z));   // Near
  planes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), max.z));   // Far
  
  return planes;
}