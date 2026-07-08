/**
 * @fileoverview STB GUID ユーティリティ
 *
 * ST-Bridge スキーマの guid 型（`[0-9a-f]{32}`：ハイフン無し・小文字 32 桁の16進）に
 * 準拠した GUID の生成・検証・正規化を提供する。
 *
 * @module common-stb/utils/guidUtil
 */

/** STB guid 型の書式（小文字16進32桁、ハイフン無し）。 */
export const STB_GUID_RE = /^[0-9a-f]{32}$/;

/**
 * STB 書式（`[0-9a-f]{32}`）の GUID を新規生成する。
 *
 * 可能なら crypto.randomUUID() を用い、ハイフンを除去して小文字32桁に整形する。
 * 利用できない環境では crypto.getRandomValues / Math.random でフォールバックする。
 * @returns {string} 32桁の小文字16進GUID
 */
export function generateStbGuid() {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID().replace(/-/g, '').toLowerCase();
  }

  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * 値が STB guid 書式（`[0-9a-f]{32}`）かどうかを判定する。
 * @param {string} value
 * @returns {boolean}
 */
export function isValidStbGuid(value) {
  return typeof value === 'string' && STB_GUID_RE.test(value);
}

/**
 * GUID らしき値を STB 書式へ正規化する（ハイフン除去・小文字化）。
 * 正規化後に書式へ合致しない場合は null を返す。
 * @param {string} value
 * @returns {string|null} 正規化済み GUID、または不正な場合は null
 */
export function normalizeStbGuid(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().replace(/-/g, '').toLowerCase();
  return STB_GUID_RE.test(candidate) ? candidate : null;
}
