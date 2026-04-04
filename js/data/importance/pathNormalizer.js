/**
 * @fileoverview 重要度パス正規化モジュール
 *
 * ST-Bridge要素のXPathを正規化し、スキップ判定を行うユーティリティ。
 * Layer 1（data）に配置。
 *
 * @module data/importance/pathNormalizer
 */

import {
  MODEL_CONTAINER_PATHS,
  COLLECTION_ID_ATTR_PATTERN,
  MODEL_CONTAINER_ATTR_PATTERN,
  MODEL_PREFIXED_ROOT_NAMES,
  MEMBER_COLLECTION_NAMES,
  AXIS_COLLECTION_NAMES,
  SINGULAR_ELEMENT_PARENT_MAP,
} from '../../constants/importanceConstants.js';

/**
 * 重要度パスを正規化する
 *
 * ST-Bridgeスキーマのパス表記揺れ（短縮形・旧形式・大小文字違い）を
 * 正規形に統一する。
 *
 * @param {string} rawPath - 正規化前のXPathパス
 * @returns {string|null} 正規化されたパス（無効な場合はnull）
 */
export function normalizeImportancePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  let path = rawPath.trim();
  if (!path) return null;

  path = path.replace(/\/Stbposts\b/g, '/StbPosts').replace(/\/Stbpost\b/g, '/StbPost');
  path = path.replace(/^\/\/ST_BRIDGE\/ST_BRIDGE\b/, '//ST_BRIDGE');
  path = path.replace(
    /^\/\/ST_BRIDGE\/StbMode\/(StbNodes|StbAxes|StbStories|StbMembers|StbSections|StbJoints|StbConnections|StbWeld)\b/,
    '//ST_BRIDGE/StbModel/$1',
  );

  for (const name of MODEL_PREFIXED_ROOT_NAMES) {
    path = path.replace(
      new RegExp(`^//ST_BRIDGE/(?:StbModel/)?${name}\\b`),
      `//ST_BRIDGE/StbModel/${name}`,
    );
  }

  for (const name of MEMBER_COLLECTION_NAMES) {
    path = path.replace(
      new RegExp(`^//ST_BRIDGE/(?:StbModel/)?${name}\\b`),
      `//ST_BRIDGE/StbModel/StbMembers/${name}`,
    );
  }

  for (const name of AXIS_COLLECTION_NAMES) {
    path = path.replace(
      new RegExp(`^//ST_BRIDGE/(?:StbModel/)?${name}\\b`),
      `//ST_BRIDGE/StbModel/StbAxes/${name}`,
    );
  }

  for (const [name, parent] of Object.entries(SINGULAR_ELEMENT_PARENT_MAP)) {
    path = path.replace(
      new RegExp(`^//ST_BRIDGE/(?:StbModel/)?${name}\\b`),
      `//ST_BRIDGE/StbModel/${parent}/${name}`,
    );
  }

  path = path.replace(
    /^\/\/ST_BRIDGE\/(?:StbModel\/)?StbSec(?!tions\b)/,
    '//ST_BRIDGE/StbModel/StbSections/StbSec',
  );
  path = path.replace(
    /^\/\/ST_BRIDGE\/(?:StbModel\/)?StbJoint(?!s\b)/,
    '//ST_BRIDGE/StbModel/StbJoints/StbJoint',
  );
  path = path.replace(
    /^\/\/ST_BRIDGE\/StbModel\/StbAxes\/StbParallelAxis\b/,
    '//ST_BRIDGE/StbModel/StbAxes/StbParallelAxes/StbParallelAxis',
  );
  path = path.replace(
    /^\/\/ST_BRIDGE\/StbModel\/StbAxes\/StbArcAxis\b/,
    '//ST_BRIDGE/StbModel/StbAxes/StbArcAxes/StbArcAxis',
  );
  path = path.replace(
    /^\/\/ST_BRIDGE\/StbModel\/StbAxes\/StbRadialAxis\b/,
    '//ST_BRIDGE/StbModel/StbAxes/StbRadialAxes/StbRadialAxis',
  );
  path = path.replace('/StbModel/StbSections/StbSections', '/StbModel/StbSections');
  path = path.replace('/StbModel/StbModel/', '/StbModel/');

  return path;
}

/**
 * 重要度パスをスキップすべきか判定する
 *
 * モデルコンテナパスやコレクションIDなど、重要度設定の対象外となる
 * パスを判定する。
 *
 * @param {string} path - 正規化済みXPathパス
 * @returns {boolean} スキップすべき場合true
 */
export function shouldSkipImportancePath(path) {
  if (!path) return true;
  if (MODEL_CONTAINER_PATHS.has(path)) return true;
  if (COLLECTION_ID_ATTR_PATTERN.test(path)) return true;
  if (MODEL_CONTAINER_ATTR_PATTERN.test(path)) return true;
  return false;
}
