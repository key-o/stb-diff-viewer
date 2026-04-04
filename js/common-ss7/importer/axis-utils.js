/**
 * axis-utils.js
 * SS7 軸名の分類と軸文字列解析の共通ユーティリティ
 *
 * ported from MatrixCalc for StbDiffViewer
 */

import { getSection, sectionToObjects } from './ss7CsvParser.js';
import { AXIS_KEYS, getValue } from './key-mappings.js';

const AXIS_SPLIT_PATTERN = /\s*[-−－ー‐]\s*/;
const axisSystemCache = new WeakMap();

function normalizeAxisName(name) {
  return String(name || '')
    .trim()
    .toUpperCase();
}

function getAxisTokenFamily(name) {
  const normalized = normalizeAxisName(name);
  if (!normalized) return 'other';
  if (/^X\d+[A-Z]*$/i.test(normalized)) return 'x-prefixed';
  if (/^Y\d+[A-Z]*$/i.test(normalized)) return 'y-prefixed';
  if (/^\d+[A-Z]*$/i.test(normalized)) return 'numeric';
  if (/^[A-Z]+$/.test(normalized)) return 'alpha';
  return 'other';
}

function collectAxisNames(sections) {
  const axisSection = getSection(sections, '軸名');
  if (!axisSection) {
    return [];
  }

  return sectionToObjects(axisSection)
    .map((row) => normalizeAxisName(getValue(row, AXIS_KEYS.name)))
    .filter(Boolean);
}

function buildAxisSystem(axisNames) {
  const uniqueAxisNames = [...new Set(axisNames.map(normalizeAxisName).filter(Boolean))];
  const explicitX = uniqueAxisNames.filter((name) => getAxisTokenFamily(name) === 'x-prefixed');
  const explicitY = uniqueAxisNames.filter((name) => getAxisTokenFamily(name) === 'y-prefixed');

  if (explicitX.length > 0 || explicitY.length > 0) {
    return {
      mode: 'prefixed',
      xAxisNames: explicitX,
      yAxisNames: explicitY,
      xAxisSet: new Set(explicitX),
      yAxisSet: new Set(explicitY),
      familyToAxis: new Map([
        ['x-prefixed', 'X'],
        ['y-prefixed', 'Y'],
      ]),
    };
  }

  const orderedFamilies = [];
  for (const name of uniqueAxisNames) {
    const family = getAxisTokenFamily(name);
    if ((family === 'alpha' || family === 'numeric') && !orderedFamilies.includes(family)) {
      orderedFamilies.push(family);
    }
  }

  const familyToAxis = new Map();
  if (orderedFamilies.length >= 2) {
    familyToAxis.set(orderedFamilies[0], 'Y');
    familyToAxis.set(orderedFamilies[1], 'X');
  } else {
    familyToAxis.set('alpha', 'Y');
    familyToAxis.set('numeric', 'X');
  }

  const xAxisNames = uniqueAxisNames.filter(
    (name) => familyToAxis.get(getAxisTokenFamily(name)) === 'X',
  );
  const yAxisNames = uniqueAxisNames.filter(
    (name) => familyToAxis.get(getAxisTokenFamily(name)) === 'Y',
  );

  return {
    mode: 'mixed',
    xAxisNames,
    yAxisNames,
    xAxisSet: new Set(xAxisNames),
    yAxisSet: new Set(yAxisNames),
    familyToAxis,
  };
}

export function inferAxisSystem(sections) {
  if (axisSystemCache.has(sections)) {
    return axisSystemCache.get(sections);
  }

  const axisSystem = buildAxisSystem(collectAxisNames(sections));
  axisSystemCache.set(sections, axisSystem);
  return axisSystem;
}

export function classifyAxisName(name, axisSystem = null) {
  const normalized = normalizeAxisName(name);
  if (!normalized) return null;

  const family = getAxisTokenFamily(normalized);
  if (family === 'x-prefixed') return 'X';
  if (family === 'y-prefixed') return 'Y';

  if (axisSystem) {
    if (axisSystem.xAxisSet?.has(normalized)) return 'X';
    if (axisSystem.yAxisSet?.has(normalized)) return 'Y';
    const mappedAxis = axisSystem.familyToAxis?.get(family);
    if (mappedAxis) return mappedAxis;
  }

  if (family === 'numeric') return 'X';
  if (family === 'alpha') return 'Y';
  return null;
}

export function splitAxisTokens(str, expectedCount = null) {
  const tokens = String(str || '')
    .split(AXIS_SPLIT_PATTERN)
    .map((token) => normalizeAxisName(token))
    .filter(Boolean);

  if (expectedCount !== null && tokens.length !== expectedCount) {
    return null;
  }

  return tokens;
}

export function parseAxisIntersectionString(str, axisSystem = null) {
  const tokens = splitAxisTokens(str, 2);
  if (!tokens) return null;

  const [first, second] = tokens;
  const firstAxis = classifyAxisName(first, axisSystem);
  const secondAxis = classifyAxisName(second, axisSystem);

  if (!firstAxis || !secondAxis || firstAxis === secondAxis) {
    return null;
  }

  return firstAxis === 'X' ? { xAxis: first, yAxis: second } : { xAxis: second, yAxis: first };
}

export function parseFrameAxisString(str, axisSystem = null) {
  const tokens = splitAxisTokens(str, 3);
  if (!tokens) return null;

  const [frame, startAxis, endAxis] = tokens;
  const frameAxis = classifyAxisName(frame, axisSystem);
  const startAxisType = classifyAxisName(startAxis, axisSystem);
  const endAxisType = classifyAxisName(endAxis, axisSystem);

  if (!frameAxis || !startAxisType || !endAxisType) {
    return null;
  }
  if (startAxisType !== endAxisType || startAxisType === frameAxis) {
    return null;
  }

  return {
    frame,
    frameAxis,
    startAxis,
    endAxis,
    direction: frameAxis === 'X' ? 'Y' : 'X',
  };
}

export function parse4AxisGridRange(str, axisSystem = null) {
  const tokens = splitAxisTokens(str, 4);
  if (!tokens) return null;

  const xAxes = [];
  const yAxes = [];

  for (const token of tokens) {
    const axisType = classifyAxisName(token, axisSystem);
    if (axisType === 'X') {
      xAxes.push(token);
    } else if (axisType === 'Y') {
      yAxes.push(token);
    } else {
      return null;
    }
  }

  if (xAxes.length !== 2 || yAxes.length !== 2) {
    return null;
  }

  return {
    yStart: yAxes[0],
    yEnd: yAxes[1],
    xStart: xAxes[0],
    xEnd: xAxes[1],
  };
}

export function isFrameAxisX(frame, frameAxis = null) {
  if (frameAxis === 'X' || frameAxis === 'Y') {
    return frameAxis === 'X';
  }
  return classifyAxisName(frame) === 'X';
}
