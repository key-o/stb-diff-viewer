/**
 * @fileoverview STB extension property parser shared by import and export paths.
 * @module common-stb/stbExtensions
 */

const stbExtCache = new WeakMap();

/**
 * StbExtensionsからSS7拡張プロパティを読み込む。
 *
 * @param {Document} doc XML ドキュメント
 * @param {string} objectName 対象オブジェクト名 (e.g. 'StbNode', 'StbGirder')
 * @returns {Map<string, Object>} id → { key: value, ... } マップ
 */
export function parseStbExtensions(doc, objectName) {
  if (!doc) return new Map();

  if (!stbExtCache.has(doc)) {
    const allExtMap = new Map();
    const extObjects = doc.getElementsByTagName('StbExtObject');
    for (let i = 0; i < extObjects.length; i++) {
      const extObj = extObjects[i];
      const objName = extObj.getAttribute('object_name');
      const idObj = extObj.getAttribute('id_object');
      if (!objName || !idObj) continue;

      const props = {};
      const propEls = extObj.getElementsByTagName('StbExtProperty');
      for (let j = 0; j < propEls.length; j++) {
        const key = propEls[j].getAttribute('key');
        const value = propEls[j].getAttribute('value');
        if (key) props[key] = value || '';
      }

      if (!allExtMap.has(objName)) allExtMap.set(objName, new Map());
      allExtMap.get(objName).set(idObj, props);
    }
    stbExtCache.set(doc, allExtMap);
  }

  const cached = stbExtCache.get(doc);
  return cached.get(objectName) || new Map();
}
