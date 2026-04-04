/**
 * standard-materials.js - 標準使用材料パーサー
 *
 * 責務: SS7 CSV の「標準使用材料」セクションから
 *       鉄筋径・材料・かぶり厚のデフォルト値を抽出
 */

/**
 * 標準使用材料セクションをパースしてデフォルト値を返す
 * @param {Map} sections - parseSs7Csv の結果
 * @returns {{
 *   column: {mainDiameter: string, shearDiameter: string, cover: number},
 *   beam: {mainDiameter: string, shearDiameter: string, topCover: number, bottomCover: number},
 *   foundationBeam: {mainDiameter: string, shearDiameter: string, topCover: number, bottomCover: number},
 *   getMaterial: function(string): string
 * }}
 */
export function parseStandardMaterials(sections) {
  const defaults = {
    column: { mainDiameter: 'D25', shearDiameter: 'D13', cover: 40 },
    beam: { mainDiameter: 'D25', shearDiameter: 'D13', topCover: 40, bottomCover: 40 },
    foundationBeam: { mainDiameter: 'D25', shearDiameter: 'D13', topCover: 50, bottomCover: 50 },
    getMaterial: (_diameter) => 'SD345',
  };

  // 異形鉄筋の種別テーブル (径の範囲 → 材料)
  const matTable = sections.get('標準使用材料:コンクリート・鉄筋:異形鉄筋の種別');
  const materialRanges = [];
  if (matTable?.data) {
    for (const row of matTable.data) {
      const fromMatch = String(row[0] || '').match(/\d+/);
      const toMatch = String(row[2] || '').match(/\d+/);
      const material = row[3];
      if (fromMatch && toMatch && material) {
        materialRanges.push({
          from: parseInt(fromMatch[0], 10),
          to: parseInt(toMatch[0], 10),
          material,
        });
      }
    }
  }
  if (materialRanges.length > 0) {
    defaults.getMaterial = (diameter) => {
      const numMatch = String(diameter || '').match(/\d+/);
      if (!numMatch) return 'SD345';
      const num = parseInt(numMatch[0], 10);
      for (const range of materialRanges) {
        if (num >= range.from && num <= range.to) return range.material;
      }
      return 'SD345';
    };
  }

  // 部材ごとの鉄筋径 (柱・大梁X/Y の主筋・せん断筋)
  const matSec = sections.get('標準使用材料:コンクリート・鉄筋');
  if (matSec?.data) {
    let currentMember = '';
    for (const row of matSec.data) {
      if (row[1]) currentMember = row[1];
      const rebarType = row[2];
      const diameter = row[4];
      if (!diameter) continue;
      if (rebarType === '主筋') {
        if (currentMember === '柱') defaults.column.mainDiameter = diameter;
        else if (currentMember === '大梁X' || currentMember === '大梁Y')
          defaults.beam.mainDiameter = diameter;
      } else if (rebarType === 'せん断筋') {
        if (currentMember === '柱') defaults.column.shearDiameter = diameter;
        else if (currentMember === '大梁X' || currentMember === '大梁Y')
          defaults.beam.shearDiameter = diameter;
      }
    }
  }

  // かぶり厚 (柱・大梁・基礎梁)
  // 柱: row[2]='かぶり', value=row[5]
  // 梁: row[3]='かぶり', value=row[5]
  const posSec = sections.get('標準使用材料:鉄筋位置');
  if (posSec?.data) {
    let currentMember = '';
    for (const row of posSec.data) {
      if (row[1]) currentMember = row[1];
      const isCover = row[2] === 'かぶり' || row[3] === 'かぶり';
      if (isCover && row[5]) {
        const cover = parseFloat(row[5]);
        if (isNaN(cover)) continue;
        if (currentMember === '柱') {
          defaults.column.cover = cover;
        } else if (currentMember === '大梁X' || currentMember === '大梁Y') {
          defaults.beam.topCover = cover;
          defaults.beam.bottomCover = cover;
        } else if (currentMember === '基礎梁X' || currentMember === '基礎梁Y') {
          defaults.foundationBeam.topCover = cover;
          defaults.foundationBeam.bottomCover = cover;
        }
      }
    }
  }

  return defaults;
}
