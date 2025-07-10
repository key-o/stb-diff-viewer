/**
 * @fileoverview Rendering orchestration module
 *
 * This module handles 3D rendering orchestration for model comparison:
 * - Element rendering coordination
 * - Label creation and management
 * - Material assignment
 * - Bounds calculation and camera fitting
 *
 * Extracted from the massive compareModels() function for better maintainability.
 */

import * as THREE from "https://cdn.skypack.dev/three@0.128.0/build/three.module.js";
import {
  materials,
  elementGroups,
  drawNodes,
  drawLineElements,
  drawPolyElements,
  drawAxes,
  drawStories,
} from "../viewer/index.js";

/**
 * Orchestrate rendering of all compared elements
 * @param {Map} comparisonResults - Results from element comparison
 * @param {THREE.Box3} modelBounds - Model bounds for rendering
 * @param {Object} globalData - Global data (stories, axes, etc.)
 * @returns {Object} Rendering result
 */
export function orchestrateElementRendering(comparisonResults, modelBounds, globalData) {
  console.log("=== Starting Element Rendering ===");

  const renderingResults = {
    nodeLabels: [],
    renderedElements: new Map(),
    errors: []
  };

  // Process each element type for rendering
  for (const [elementType, comparisonResult] of comparisonResults.entries()) {
    try {
      const elementRenderResult = renderElementType(
        elementType,
        comparisonResult,
        modelBounds,
        globalData
      );

      renderingResults.renderedElements.set(elementType, elementRenderResult);
      
      // Collect node labels
      if (elementRenderResult.labels) {
        renderingResults.nodeLabels.push(...elementRenderResult.labels);
      }

      console.log(`${elementType} rendering complete:`, {
        meshesCreated: elementRenderResult.meshCount,
        labelsCreated: elementRenderResult.labels?.length || 0
      });

    } catch (error) {
      console.error(`Error rendering ${elementType}:`, error);
      renderingResults.errors.push({
        elementType,
        error: error.message
      });
    }
  }

  // Render auxiliary elements (axes and stories)
  try {
    renderAuxiliaryElements(globalData, renderingResults, modelBounds);
  } catch (error) {
    console.error("Error rendering auxiliary elements:", error);
    renderingResults.errors.push({
      elementType: 'auxiliary',
      error: error.message
    });
  }

  console.log("=== Element Rendering Complete ===");
  console.log("Total labels created:", renderingResults.nodeLabels.length);

  return renderingResults;
}

/**
 * Render a specific element type
 * @param {string} elementType - Type of element to render
 * @param {Object} comparisonResult - Comparison result for this element type
 * @param {THREE.Box3} modelBounds - Model bounds
 * @param {Object} globalData - Global data
 * @returns {Object} Rendering result for this element type
 */
function renderElementType(elementType, comparisonResult, modelBounds, globalData) {
  const group = elementGroups[elementType];
  if (!group) {
    throw new Error(`Element group not found for type: ${elementType}`);
  }

  // Set group visibility based on selection
  group.visible = comparisonResult.isSelected;

  const result = {
    meshCount: 0,
    labels: [],
    groupVisible: group.visible
  };

  // Skip rendering if error occurred during comparison
  if (comparisonResult.error) {
    console.warn(`Skipping rendering for ${elementType} due to comparison error`);
    return result;
  }

  // Always create labels, even if element is not selected for display
  const createLabels = true;

  // Render based on element type
  switch (elementType) {
    case "Node":
      result.labels = drawNodes(
        comparisonResult,
        materials,
        group,
        createLabels,
        modelBounds
      );
      break;

    case "Column":
    case "Girder":
    case "Beam":
    case "Brace":
      result.labels = drawLineElements(
        comparisonResult,
        materials,
        group,
        elementType,
        createLabels,
        modelBounds
      );
      break;

    case "Slab":
    case "Wall":
      result.labels = drawPolyElements(
        comparisonResult,
        materials,
        group,
        createLabels,
        modelBounds
      );
      break;

    default:
      console.warn(`Unknown element type for rendering: ${elementType}`);
  }

  // Count meshes in group
  result.meshCount = countMeshesInGroup(group);

  return result;
}

/**
 * Render auxiliary elements (axes and stories)
 * @param {Object} globalData - Global data containing stories and axes
 * @param {Object} renderingResults - Rendering results to update
 * @param {THREE.Box3} modelBounds - Model bounds for rendering
 */
function renderAuxiliaryElements(globalData, renderingResults, modelBounds) {
  const { stories, axesData } = globalData;

  // Render axes
  if (axesData && (axesData.xAxes.length > 0 || axesData.yAxes.length > 0)) {
    try {
      const axisLabels = drawAxes(axesData, elementGroups["Axis"], modelBounds, true);
      renderingResults.nodeLabels.push(...axisLabels);
      console.log(`Rendered axes: X=${axesData.xAxes.length}, Y=${axesData.yAxes.length}`);
    } catch (error) {
      console.error("Error rendering axes:", error);
    }
  }

  // Render stories
  if (stories && stories.length > 0) {
    try {
      const storyLabels = drawStories(stories, elementGroups["Story"], modelBounds, true);
      renderingResults.nodeLabels.push(...storyLabels);
      console.log(`Rendered ${stories.length} stories`);
    } catch (error) {
      console.error("Error rendering stories:", error);
    }
  }
}

/**
 * Count meshes in a Three.js group
 * @param {THREE.Group} group - Group to count meshes in
 * @returns {number} Number of meshes
 */
function countMeshesInGroup(group) {
  let count = 0;
  
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      count++;
    }
  });

  return count;
}

/**
 * Calculate and update model bounds based on rendered elements
 * @param {Map} renderedElements - Map of rendered elements
 * @param {Map} nodeMapA - Node map for model A
 * @param {Map} nodeMapB - Node map for model B
 * @returns {THREE.Box3} Updated model bounds
 */
export function calculateRenderingBounds(renderedElements, nodeMapA, nodeMapB) {
  const bounds = new THREE.Box3();

  // Add all node positions
  for (const node of nodeMapA.values()) {
    bounds.expandByPoint(new THREE.Vector3(node.x, node.y, node.z));
  }

  for (const node of nodeMapB.values()) {
    bounds.expandByPoint(new THREE.Vector3(node.x, node.y, node.z));
  }

  // Add bounds from rendered geometry
  for (const [elementType, group] of Object.entries(elementGroups)) {
    if (group && group.children.length > 0) {
      const groupBox = new THREE.Box3().setFromObject(group);
      if (!groupBox.isEmpty()) {
        bounds.union(groupBox);
      }
    }
  }

  // Ensure bounds are not empty
  if (bounds.isEmpty()) {
    bounds.expandByPoint(new THREE.Vector3(-1000, -1000, -1000));
    bounds.expandByPoint(new THREE.Vector3(1000, 1000, 1000));
    console.warn("Empty bounds detected, using default bounds");
  }

  return bounds;
}

/**
 * Get rendering statistics
 * @param {Object} renderingResults - Results from rendering
 * @returns {Object} Rendering statistics
 */
export function getRenderingStatistics(renderingResults) {
  // Safely handle undefined renderingResults
  if (!renderingResults) {
    return {
      totalMeshes: 0,
      totalLabels: 0,
      elementTypes: {},
      errors: 0,
      errorDetails: []
    };
  }

  const stats = {
    totalMeshes: 0,
    totalLabels: (renderingResults.nodeLabels || []).length,
    elementTypes: {},
    errors: (renderingResults.errors || []).length,
    errorDetails: renderingResults.errors || []
  };

  // Safely iterate over rendered elements
  if (renderingResults.renderedElements) {
    for (const [elementType, result] of renderingResults.renderedElements.entries()) {
      stats.elementTypes[elementType] = {
        meshCount: result?.meshCount || 0,
        labelCount: result?.labels?.length || 0,
        isVisible: !!result?.groupVisible,
        hasError: !!result?.error
      };

      stats.totalMeshes += result?.meshCount || 0;
    }
  }

  return stats;
}