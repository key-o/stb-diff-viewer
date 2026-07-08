/**
 * Type13: v2.1.0→v2.1.1 で必要な追加修正 (schema compliance fixups)
 *
 * これらの変換は v2.0.2→v2.1.0 の変換ルール (type8/11/12) では対応していなかった
 * XSD 検証エラーを修正します。
 *
 * 対象:
 *   1. StbSecBarPile_RC_TopBottom/Same: 属性リネーム (circumference_1st 系)
 *   2. StbSecBarFoundation_RC_Continuous: pos 値リネーム + 必須属性補完
 *   3. StbSecLipC: type=SINGLE → type削除, BACKTOBACK/FACETOFACE → StbSecLip2C にリネーム
 *   4. StbSecBaseProduct_S → StbSecBaseProduct にリネーム + product_company 削除
 *   5. StbSecBaseConventionalAnchorBolts: 必須属性を AnchorBolt から昇格
 *   6. StbSecPilePrecast_*: product_company/product_code 削除
 *   7. StbGirder.isFoundation: 空文字列を削除
 *   8. StbSecPile_RC.strength_concrete: v2.1.1 では不可なので削除
 *   9. StbSecBaseConventionalPlate: B_X/B_Y/t = 0 → 最小値補正
 *  10. StbSecBarArrangementFoundation_RC: depth_cover=0 補正、空 pos/D 補完
 */

import logger from '../utils/converter-logger.js';
import { getStbRoot, renameKey } from '../utils/xml-helper.js';
import { STB_TAG_NAMES } from '../../../constants/elementTypes.js';

// ----------------------------------------------------------------
// 1. StbSecBarPile_RC_TopBottom attribute rename
// ----------------------------------------------------------------
const PILE_BAR_ATTR_RENAME = {
  D_main_circumference_1st: 'D_main',
  N_main_circumference_1st: 'N_main',
  D_main_circumference_2nd: 'D_2nd_main',
  N_main_circumference_2nd: 'N_2nd_main',
  D_main_core: 'D_core',
  N_main_core: 'N_core',
  strength_main_circumference_1st: 'strength_main',
  strength_main_circumference_2nd: 'strength_2nd_main',
  D_band: 'D_band', // same
  strength_band: 'strength_band', // same
  pitch_band: 'pitch_band', // same
};

function fixBarPileRcTopBottom(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  const pileRc = sections['StbSecPile_RC'] || [];
  pileRc.forEach((pile) => {
    const conv = pile['StbSecPile_RC_Conventional']?.[0];
    const barArr =
      conv?.['StbSecBarArrangementPile_RC_Conventional']?.[0] ??
      pile['StbSecBarArrangementPile_RC']?.[0];
    if (!barArr) return;

    // Handle both TopBottom and Same elements (same v2.0.2 attribute names)
    for (const elemName of ['StbSecBarPile_RC_TopBottom', 'StbSecBarPile_RC_Same']) {
      const elems = barArr[elemName] || [];
      elems.forEach((el) => {
        const attrs = el['$'];
        if (!attrs) return;
        for (const [oldName, newName] of Object.entries(PILE_BAR_ATTR_RENAME)) {
          if (oldName === newName) continue;
          if (Object.prototype.hasOwnProperty.call(attrs, oldName)) {
            attrs[newName] = attrs[oldName];
            delete attrs[oldName];
            count++;
          }
        }
        // Remove empty-string attributes (SS7 data quality)
        for (const k of Object.keys(attrs)) {
          if (attrs[k] === '') {
            delete attrs[k];
            count++;
          }
        }
        // Ensure required attributes have defaults
        if (!attrs.D_main || attrs.D_main === '') attrs.D_main = 'D19';
        if (!attrs.N_main || attrs.N_main === '0') attrs.N_main = '6';
        if (!attrs.D_band) attrs.D_band = 'D10';
        if (!attrs.pitch_band || attrs.pitch_band === '0' || attrs.pitch_band === '0.0')
          attrs.pitch_band = '150';
      });
    }
  });

  if (count > 0) logger.info(`Fixed ${count} StbSecBarPile_RC_* attribute issues`);
}

// ----------------------------------------------------------------
// 2. StbSecBarFoundation_RC_Continuous pos rename + required attrs
// ----------------------------------------------------------------
const FOUNDATION_POS_RENAME = {
  MAIN_TOP: 'MAIN_BASE_TOP',
  MAIN_BOTTOM: 'MAIN_BASE_BOTTOM',
};

function fixBarFoundationContinuous(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  const foundations = sections['StbSecFoundation_RC'] || [];
  foundations.forEach((foundation) => {
    const barArr = foundation['StbSecBarArrangementFoundation_RC']?.[0];
    if (!barArr) return;

    const continuous = barArr['StbSecBarFoundation_RC_Continuous'] || [];
    continuous.forEach((el) => {
      const attrs = el['$'];
      if (!attrs) return;

      // Rename pos values
      if (attrs.pos && FOUNDATION_POS_RENAME[attrs.pos]) {
        attrs.pos = FOUNDATION_POS_RENAME[attrs.pos];
        count++;
      }
      // Remove empty or invalid pos (SS7 data can have pos="")
      if (attrs.pos === '' || attrs.pos === undefined) {
        attrs.pos = 'MAIN_BASE_TOP';
        count++;
      }

      // Remove empty-string D (required)
      if (attrs.D === '' || attrs.D === undefined) {
        attrs.D = 'D10';
        count++;
      }

      // Fill required N and pitch if missing or zero
      if (!attrs.N || attrs.N === '0') {
        attrs.N = '5';
        count++;
      }
      if (!attrs.pitch || attrs.pitch === '0' || attrs.pitch === '0.0') {
        attrs.pitch = '200';
        count++;
      }
    });

    // Fix depth_cover_bottom=0 on parent (stb:length minExclusive)
    const parentAttrs = barArr['$'] || {};
    for (const k of ['depth_cover_top', 'depth_cover_bottom', 'depth_cover_side']) {
      const v = parseFloat(parentAttrs[k]);
      if (!isNaN(v) && v <= 0) {
        parentAttrs[k] = '40';
        count++;
      }
    }
    barArr['$'] = parentAttrs;
  });

  if (count > 0) logger.info(`Fixed ${count} StbSecBarFoundation_RC_Continuous issues`);
}

// ----------------------------------------------------------------
// 3. StbSecLipC: type handling
// ----------------------------------------------------------------
function fixLipCSections(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  const steelSections = sections['StbSecSteel'];
  if (!steelSections) return;

  let count = 0;

  steelSections.forEach((steelSection) => {
    const lipCs = steelSection['StbSecLipC'];
    if (!lipCs) return;

    const lip2cList = steelSection['StbSecLip2C'] || [];

    const keptLipCs = [];
    lipCs.forEach((el) => {
      const attrs = el['$'] || {};
      const type = attrs.type;

      if (!type || type === 'SINGLE') {
        // Remove type attr, keep as StbSecLipC
        const newAttrs = { ...attrs };
        delete newAttrs.type;
        el['$'] = newAttrs;
        keptLipCs.push(el);
        if (type) count++;
      } else {
        // BACKTOBACK or FACETOFACE → StbSecLip2C
        lip2cList.push(el);
        count++;
      }
    });

    steelSection['StbSecLipC'] = keptLipCs.length > 0 ? keptLipCs : undefined;
    if (keptLipCs.length === 0) delete steelSection['StbSecLipC'];
    if (lip2cList.length > 0) steelSection['StbSecLip2C'] = lip2cList;
  });

  if (count > 0) logger.info(`Fixed ${count} StbSecLipC type attribute issues`);
}

// ----------------------------------------------------------------
// 4. StbSecBaseProduct_S → StbSecBaseProduct
// ----------------------------------------------------------------
function fixBaseProductS(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;
  const colTypes = ['StbSecColumn_S', 'StbSecColumn_SRC', 'StbSecColumn_CFT'];

  colTypes.forEach((colType) => {
    const cols = sections[colType] || [];
    cols.forEach((col) => {
      if (col['StbSecBaseProduct_S']) {
        col['StbSecBaseProduct_S'].forEach((el) => {
          const attrs = el['$'] || {};
          // Remove product_company (not in v2.1.1)
          delete attrs.product_company;
          // Add release_time default if missing
          if (!attrs.release_time) attrs.release_time = '';
          el['$'] = attrs;
        });
        renameKey(col, 'StbSecBaseProduct_S', 'StbSecBaseProduct');
        count++;
      }
    });
  });

  if (count > 0) logger.info(`Renamed ${count} StbSecBaseProduct_S to StbSecBaseProduct`);
}

// ----------------------------------------------------------------
// 5. StbSecBaseConventionalAnchorBolts: populate required attributes
//    v2.0.2 stored all on AnchorBolt; v2.1.1 requires them on AnchorBolts (parent)
// ----------------------------------------------------------------
function fixBaseConventionalAnchorBolts(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  // v2.1.1 AnchorBolts allows only these attributes
  const BOLTS_ALLOWED = new Set([
    'kind_bolt',
    'name_bolt',
    'L',
    'strength_bolt',
    'type_bolt',
    'R1',
    'R2',
    'Lt',
    'S1',
    'S2',
    'L1',
    'L2',
    'type_flame',
  ]);
  // v2.0.2 → v2.1.1 rename on AnchorBolts
  const BOLTS_RENAME = { length_bolt: 'L', arrangement_bolt: 'type_bolt' };
  const ARRANGEMENT_MAP = { STD: 'I', CUT: 'HOLEIN' };

  const colTypes = ['StbSecColumn_S', 'StbSecColumn_SRC', 'StbSecColumn_CFT'];
  colTypes.forEach((colType) => {
    const cols = sections[colType] || [];
    cols.forEach((col) => {
      const baseConv = col['StbSecBaseConventional']?.[0];
      if (!baseConv) return;

      const boltsList = baseConv['StbSecBaseConventionalAnchorBolts'] || [];
      boltsList.forEach((bolts) => {
        const boltsAttrs = bolts['$'] || {};

        // Rename v2.0.2 attribute names
        for (const [oldName, newName] of Object.entries(BOLTS_RENAME)) {
          if (Object.prototype.hasOwnProperty.call(boltsAttrs, oldName)) {
            let val = boltsAttrs[oldName];
            if (oldName === 'arrangement_bolt') val = ARRANGEMENT_MAP[val] ?? 'I';
            boltsAttrs[newName] = val;
            delete boltsAttrs[oldName];
            count++;
          }
        }

        // Remove attributes not allowed on AnchorBolts in v2.1.1
        for (const attr of Object.keys(boltsAttrs)) {
          if (!BOLTS_ALLOWED.has(attr)) {
            delete boltsAttrs[attr];
            count++;
          }
        }

        // Ensure required bolts attributes have defaults
        if (!boltsAttrs.kind_bolt) boltsAttrs.kind_bolt = 'STD';
        if (!boltsAttrs.name_bolt) boltsAttrs.name_bolt = 'M20';
        if (!boltsAttrs.L) boltsAttrs.L = '600';
        if (!boltsAttrs.strength_bolt) boltsAttrs.strength_bolt = 'SS400';
        if (!boltsAttrs.type_bolt) boltsAttrs.type_bolt = 'I';

        bolts['$'] = boltsAttrs;

        // Clean up AnchorBolt children: only keep id_order, offset_X, offset_Y
        const boltEls = bolts['StbSecBaseConventionalAnchorBolt'] || [];
        const BOLT_KEEP = new Set(['id_order', 'offset_X', 'offset_Y']);
        boltEls.forEach((bolt, idx) => {
          const attrs = bolt['$'] || {};
          if (!attrs.id_order) attrs.id_order = String(idx + 1);
          const cleaned = {};
          for (const k of Object.keys(attrs)) {
            if (BOLT_KEEP.has(k)) cleaned[k] = attrs[k];
          }
          bolt['$'] = cleaned;
        });
      });
    });
  });

  if (count > 0) logger.info(`Fixed ${count} StbSecBaseConventionalAnchorBolts attribute issues`);
}

// ----------------------------------------------------------------
// 6. StbSecPilePrecast_* : remove product_company / product_code
// ----------------------------------------------------------------
const PRECAST_PILE_TYPES = [
  'StbSecPilePrecast_PHC',
  'StbSecPilePrecast_ST',
  'StbSecPilePrecast_SC',
  'StbSecPilePrecast_PRC',
  'StbSecPilePrecast_CPRC',
  'StbSecPilePrecastNodular_PHC',
  'StbSecPilePrecastNodular_PRC',
  'StbSecPilePrecastNodular_CPRC',
];

function fixPrecastPileAttrs(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;

  const precastPiles = sections['StbSecPilePrecast'] || [];
  precastPiles.forEach((pile) => {
    const conv = pile['StbSecPilePrecastConventional']?.[0];
    const figurePrecast = conv?.['StbSecFigurePilePrecast']?.[0] ?? conv;
    if (!figurePrecast) return;

    PRECAST_PILE_TYPES.forEach((typeName) => {
      const elements = figurePrecast[typeName] || [];
      elements.forEach((el) => {
        const attrs = el['$'];
        if (!attrs) return;
        if (attrs.product_company !== undefined) {
          delete attrs.product_company;
          count++;
        }
        if (attrs.product_code !== undefined) {
          delete attrs.product_code;
          count++;
        }
      });
    });
  });

  if (count > 0)
    logger.info(`Removed ${count} invalid product_company/product_code from precast pile elements`);
}

// ----------------------------------------------------------------
// 7. StbGirder/StbBeam 等: isFoundation="" → "false" (required boolean)
//    その他の空文字列 optional boolean 属性は削除
// ----------------------------------------------------------------
function fixEmptyBooleanAttrs(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const members = rootData?.['StbModel']?.[0]?.['StbMembers']?.[0];
  if (!members) return;

  let count = 0;
  // isFoundation is required on StbGirder; others are optional (can be removed if empty)
  const REQUIRED_BOOL_DEFAULT = { isFoundation: 'false' };
  const OPTIONAL_BOOL_ATTRS = ['isOffset', 'isHingeStart', 'isHingeEnd', 'isCanti'];
  const MEMBER_TYPES = [
    [STB_TAG_NAMES.GIRDERS, STB_TAG_NAMES.GIRDER],
    [STB_TAG_NAMES.BEAMS, STB_TAG_NAMES.BEAM],
    [STB_TAG_NAMES.COLUMNS, STB_TAG_NAMES.COLUMN],
    [STB_TAG_NAMES.POSTS, STB_TAG_NAMES.POST],
    [STB_TAG_NAMES.BRACES, STB_TAG_NAMES.BRACE],
    [STB_TAG_NAMES.SLABS, STB_TAG_NAMES.SLAB],
    [STB_TAG_NAMES.WALLS, STB_TAG_NAMES.WALL],
  ];

  MEMBER_TYPES.forEach(([coll, elem]) => {
    const elements = members[coll]?.[0]?.[elem] || [];
    elements.forEach((el) => {
      const attrs = el['$'];
      if (!attrs) return;
      // Required booleans: replace empty string with default value
      for (const [attr, def] of Object.entries(REQUIRED_BOOL_DEFAULT)) {
        if (attrs[attr] === '') {
          attrs[attr] = def;
          count++;
        }
      }
      // Optional booleans: remove if empty
      OPTIONAL_BOOL_ATTRS.forEach((attr) => {
        if (attrs[attr] === '') {
          delete attrs[attr];
          count++;
        }
      });
    });
  });

  if (count > 0) logger.info(`Fixed ${count} empty boolean attributes`);
}

// ----------------------------------------------------------------
// 11. StbJointArrangement.distance = 0 → 最小値補正
// ----------------------------------------------------------------
function fixJointArrangementDistance(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;

  // Walk all JointArrangements
  function walkJoints(node) {
    if (!node || typeof node !== 'object') return 0;
    let count = 0;
    if (node['StbJointArrangement']) {
      node['StbJointArrangement'].forEach((ja) => {
        const attrs = ja['$'];
        if (!attrs) return;
        const v = parseFloat(attrs.distance);
        if (!isNaN(v) && v <= 0) {
          attrs.distance = '1';
          count++;
        }
      });
    }
    for (const k of Object.keys(node)) {
      if (k === '$') continue;
      const child = node[k];
      if (Array.isArray(child))
        child.forEach((c) => {
          count += walkJoints(c);
        });
      else if (child && typeof child === 'object') count += walkJoints(child);
    }
    return count;
  }

  const count = walkJoints(stbRoot);
  if (count > 0) logger.info(`Fixed ${count} StbJointArrangement.distance zero values`);
}

// ----------------------------------------------------------------
// 8. StbSecPile_RC: strength_concrete 削除 (v2.1.1 では不可)
// ----------------------------------------------------------------
function fixPileRcAttrs(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;
  const pileRc = sections['StbSecPile_RC'] || [];
  pileRc.forEach((pile) => {
    const attrs = pile['$'];
    if (attrs && attrs.strength_concrete !== undefined) {
      delete attrs.strength_concrete;
      count++;
    }
  });

  if (count > 0) logger.info(`Removed ${count} StbSecPile_RC.strength_concrete attributes`);
}

// ----------------------------------------------------------------
// 9. StbSecBaseConventionalPlate: B_X/B_Y/t = 0 → 最小値
// ----------------------------------------------------------------
function fixBaseConventionalPlate(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;
  const LENGTH_ATTRS = ['B_X', 'B_Y', 't', 'D_bolthole'];
  const colTypes = ['StbSecColumn_S', 'StbSecColumn_SRC', 'StbSecColumn_CFT'];

  colTypes.forEach((colType) => {
    (sections[colType] || []).forEach((col) => {
      const baseConv = col['StbSecBaseConventional']?.[0];
      if (!baseConv) return;
      (baseConv['StbSecBaseConventionalPlate'] || []).forEach((plate) => {
        const attrs = plate['$'];
        if (!attrs) return;
        LENGTH_ATTRS.forEach((attr) => {
          const v = parseFloat(attrs[attr]);
          if (!isNaN(v) && v <= 0) {
            attrs[attr] = '1';
            count++;
          }
        });
      });
    });
  });

  if (count > 0) logger.info(`Fixed ${count} zero length values in StbSecBaseConventionalPlate`);
}

// ----------------------------------------------------------------
// 10. StbSecBarArrangementFoundation_RC: minOccurs=2 を保証
// ----------------------------------------------------------------
function fixBarArrangementFoundationEmpty(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;
  // XSD requires minOccurs="2" for any child type of BarArrangementFoundation_RC
  const CHILD_TYPES = [
    'StbSecBarFoundation_RC_Rect',
    'StbSecBarFoundation_RC_Triangle',
    'StbSecBarFoundation_RC_ThreeWay',
    'StbSecBarFoundation_RC_Continuous',
  ];

  (sections['StbSecFoundation_RC'] || []).forEach((foundation) => {
    (foundation['StbSecBarArrangementFoundation_RC'] || []).forEach((barArr) => {
      for (const childType of CHILD_TYPES) {
        const elems = barArr[childType];
        if (!elems || elems.length === 0) continue;

        // If fewer than 2, duplicate the last element to meet minOccurs=2
        while (elems.length < 2) {
          const clone = JSON.parse(JSON.stringify(elems[elems.length - 1]));
          elems.push(clone);
          count++;
        }
        barArr[childType] = elems;
        break; // xs:choice: only one type
      }
    });
  });

  if (count > 0) logger.info(`Duplicated ${count} foundation bar elements to meet minOccurs=2`);
}

// ----------------------------------------------------------------
// 12. StbFoundationColumn: optional id_section_* = '0' は参照なしの意味なので削除
//     (xs:positiveInteger violation)
// ----------------------------------------------------------------
const FOUNDATION_COLUMN_OPTIONAL_ID_ATTRS = ['id_section_WR', 'id_section_FD'];

function fixFoundationColumnZeroIds(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const cols =
    rootData?.['StbModel']?.[0]?.['StbMembers']?.[0]?.['StbFoundationColumns']?.[0]?.[
      'StbFoundationColumn'
    ];
  if (!Array.isArray(cols)) return;

  let count = 0;
  cols.forEach((col) => {
    const attrs = col['$'];
    if (!attrs) return;
    FOUNDATION_COLUMN_OPTIONAL_ID_ATTRS.forEach((attr) => {
      if (attrs[attr] === '0') {
        delete attrs[attr];
        count++;
      }
    });
  });
  if (count > 0) logger.info(`Removed ${count} StbFoundationColumn id_section_*="0" attributes`);
}

// ----------------------------------------------------------------
// 13. 不正な guid の正規化/削除
//     スキーマの guid 型は [0-9a-f]{32}。ハイフン付きUUIDや大文字は正規化し、
//     それでも合わない値は削除する（guid は全バージョンで optional）。
// ----------------------------------------------------------------
const GUID_RE = /^[0-9a-f]{32}$/;

export function fixInvalidGuids(stbRoot) {
  let normalized = 0;
  let removed = 0;

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const attrs = node['$'];
    if (attrs && attrs.guid !== undefined) {
      const candidate = String(attrs.guid).replace(/-/g, '').toLowerCase();
      if (GUID_RE.test(candidate)) {
        if (candidate !== attrs.guid) {
          attrs.guid = candidate;
          normalized++;
        }
      } else {
        delete attrs.guid;
        removed++;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === '$' || key === '_') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object') walk(child);
    }
  };
  walk(stbRoot);

  if (normalized > 0 || removed > 0) {
    logger.warn(`guid fixup: ${normalized} normalized, ${removed} removed (invalid format)`);
  }
}

// ----------------------------------------------------------------
// 14. StbMembers / StbSections の子要素を XSD の xs:sequence 順に並べ替え
//     (変換で後から追加された要素が末尾に付くと順序違反になる)
// ----------------------------------------------------------------
const MEMBERS_ORDER_21X = [
  'StbColumns',
  'StbPosts',
  'StbGirders',
  'StbBeams',
  'StbBraces',
  'StbSlabs',
  'StbWalls',
  'StbIsolatingDevices',
  'StbDampingDevices',
  'StbFrameDampingDevices',
  'StbFootings',
  'StbStripFootings',
  'StbPiles',
  'StbFoundationColumns',
  'StbParapets',
  'StbOpenArrangements',
  'StbPenetrationArrangements',
  'StbJointArrangements',
  'StbPanelZoneArrangements',
  'StbConnectionArrangements',
];

const SECTIONS_ORDER_21X = [
  'StbSecColumn_RC',
  'StbSecColumn_S',
  'StbSecColumn_SRC',
  'StbSecColumn_CFT',
  'StbSecBeam_RC',
  'StbSecBeam_S',
  'StbSecBeam_SRC',
  'StbSecBrace_S',
  'StbSecSlab_RC',
  'StbSecSlabDeck',
  'StbSecSlabPrecast',
  'StbSecSlabLoad',
  'StbSecWall_RC',
  'StbSecWallLoad',
  'StbSecIsolatingDevice',
  'StbSecDampingDevice',
  'StbSecFoundation_RC',
  'StbSecPile_RC',
  'StbSecPile_S',
  'StbSecPilePrecast',
  'StbSecParapet_RC',
  'StbSecOpen_RC',
  'StbSecPenetration_S',
  'StbSecPanelZone',
  'StbSecSteel',
  'StbSecUndefined',
];

/**
 * Reorder a container's child element keys to match the canonical xs:sequence order.
 * Keys not in the canonical list (e.g. '$') keep their position.
 * @param {object} container
 * @param {string[]} canonicalOrder
 * @returns {number} 1 if reordered, 0 if already in order
 */
function reorderChildren(container, canonicalOrder) {
  if (!container) return 0;
  const present = canonicalOrder.filter((k) => container[k] !== undefined);
  const current = Object.keys(container).filter((k) => present.includes(k));
  if (current.every((k, i) => k === present[i])) return 0;

  const saved = {};
  present.forEach((k) => {
    saved[k] = container[k];
    delete container[k];
  });
  present.forEach((k) => {
    container[k] = saved[k];
  });
  return 1;
}

export function applyCanonicalChildOrder(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const model = rootData?.['StbModel']?.[0];
  if (!model) return;

  let count = 0;
  count += reorderChildren(model['StbMembers']?.[0], MEMBERS_ORDER_21X);
  count += reorderChildren(model['StbSections']?.[0], SECTIONS_ORDER_21X);
  if (count > 0) {
    logger.info(`Reordered ${count} container(s) to canonical v2.1.x child order`);
  }
}

// ----------------------------------------------------------------
// Reverse fixups: undo 211 compliance changes for 202 output
// ----------------------------------------------------------------

/**
 * Remove duplicate BarFoundationContinuous elements that were added to satisfy
 * v2.1.1 minOccurs=2. In v2.0.2 a single element per arrangement is valid.
 * @param {object} stbRoot
 */
export function reverseBarFoundationDuplicates(stbRoot) {
  const root = getStbRoot(stbRoot);
  if (!root) return;
  const rootData = Array.isArray(root) ? root[0] : root;
  const sections = rootData?.['StbModel']?.[0]?.['StbSections']?.[0];
  if (!sections) return;

  let count = 0;
  const CHILD_TYPES = [
    'StbSecBarFoundation_RC_Rect',
    'StbSecBarFoundation_RC_Triangle',
    'StbSecBarFoundation_RC_ThreeWay',
    'StbSecBarFoundation_RC_Continuous',
  ];

  (sections['StbSecFoundation_RC'] || []).forEach((foundation) => {
    (foundation['StbSecBarArrangementFoundation_RC'] || []).forEach((barArr) => {
      for (const childType of CHILD_TYPES) {
        const elems = barArr[childType];
        if (!elems || elems.length < 2) continue;

        // De-duplicate: keep only elements with unique attribute signatures
        const seen = new Set();
        const unique = elems.filter((el) => {
          const sig = JSON.stringify(el['$'] || {});
          if (seen.has(sig)) {
            count++;
            return false;
          }
          seen.add(sig);
          return true;
        });
        if (unique.length !== elems.length) barArr[childType] = unique;
      }
    });
  });

  if (count > 0) logger.info(`Removed ${count} duplicate foundation bar elements (reverse fixup)`);
}

// ----------------------------------------------------------------
// Export
// ----------------------------------------------------------------
export function applySchemaComplianceFixups(stbRoot) {
  fixBarPileRcTopBottom(stbRoot);
  fixBarFoundationContinuous(stbRoot);
  fixBarArrangementFoundationEmpty(stbRoot);
  fixLipCSections(stbRoot);
  fixBaseProductS(stbRoot);
  fixBaseConventionalAnchorBolts(stbRoot);
  fixBaseConventionalPlate(stbRoot);
  fixPrecastPileAttrs(stbRoot);
  fixEmptyBooleanAttrs(stbRoot);
  fixPileRcAttrs(stbRoot);
  fixJointArrangementDistance(stbRoot);
  fixFoundationColumnZeroIds(stbRoot);
  fixInvalidGuids(stbRoot);
  applyCanonicalChildOrder(stbRoot);
}
