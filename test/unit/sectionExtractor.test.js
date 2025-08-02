/**
 * @fileoverview 統一断面抽出エンジンのテスト
 * 
 * 新実装の核心機能を検証し、既存システムとの完全一致を確認します。
 */

import { extractAllSections } from '../../js/parser/sectionExtractor.js';

/**
 * テスト用のモックXMLドキュメントを作成
 * @returns {Document} モックXMLドキュメント
 */
function createMockXMLDocument() {
  const xmlString = `
    <StbModel>
      <StbSections>
        <StbSecColumn_S id="1" name="C1">
          <StbSecSteelFigureColumn_S>
            <StbSecColumn_S_Straight shape="H-400x200x8x13"/>
          </StbSecSteelFigureColumn_S>
        </StbSecColumn_S>
        <StbSecBeam_S id="2" name="G6">
          <StbSecSteelFigureBeam_S>
            <StbSecBeam_S_Straight shape="H-200x80x7.5x11"/>
          </StbSecSteelFigureBeam_S>
        </StbSecBeam_S>
        <StbSecBrace_S id="3" name="B1">
          <StbSecSteelFigureBrace_S>
            <StbSecBrace_S_Straight shape="H-100x50x5x7"/>
          </StbSecSteelFigureBrace_S>
        </StbSecBrace_S>
      </StbSections>
    </StbModel>
  `;
  return new DOMParser().parseFromString(xmlString, 'text/xml');
}

/**
 * 空のXMLドキュメントを作成
 * @returns {Document} 空のXMLドキュメント
 */
function createEmptyXMLDocument() {
  const xmlString = '<StbModel></StbModel>';
  return new DOMParser().parseFromString(xmlString, 'text/xml');
}

describe('SectionExtractor', () => {
  describe('extractAllSections', () => {
    test('正常なXMLドキュメントで全要素タイプの抽出が動作する', () => {
      const mockDocument = createMockXMLDocument();
      const result = extractAllSections(mockDocument);
      
      // 戻り値構造の検証
      expect(result).toHaveProperty('columnSections');
      expect(result).toHaveProperty('beamSections');
      expect(result).toHaveProperty('braceSections');
      
      // Map構造の検証
      expect(result.columnSections).toBeInstanceOf(Map);
      expect(result.beamSections).toBeInstanceOf(Map);
      expect(result.braceSections).toBeInstanceOf(Map);
      
      // 抽出数の検証
      expect(result.columnSections.size).toBe(1);
      expect(result.beamSections.size).toBe(1);
      expect(result.braceSections.size).toBe(1);
    });

    test('断面データの正確な抽出', () => {
      const mockDocument = createMockXMLDocument();
      const result = extractAllSections(mockDocument);
      
      // Column断面の検証
      const columnSection = result.columnSections.get('1');
      expect(columnSection).toEqual({
        id: '1',
        name: 'C1',
        sectionType: 'StbSecColumn_S',
        shapeName: 'H-400x200x8x13'
      });
      
      // Beam断面の検証
      const beamSection = result.beamSections.get('2');
      expect(beamSection).toEqual({
        id: '2',
        name: 'G6',
        sectionType: 'StbSecBeam_S',
        shapeName: 'H-200x80x7.5x11'
      });
      
      // Brace断面の検証
      const braceSection = result.braceSections.get('3');
      expect(braceSection).toEqual({
        id: '3',
        name: 'B1',
        sectionType: 'StbSecBrace_S',
        shapeName: 'H-100x50x5x7'
      });
    });

    test('空ドキュメントで例外が発生しない', () => {
      const emptyDoc = createEmptyXMLDocument();
      expect(() => extractAllSections(emptyDoc)).not.toThrow();
      
      const result = extractAllSections(emptyDoc);
      expect(result.columnSections).toBeInstanceOf(Map);
      expect(result.columnSections.size).toBe(0);
      expect(result.beamSections.size).toBe(0);
      expect(result.braceSections.size).toBe(0);
    });

    test('nullドキュメントでも安全に動作する', () => {
      expect(() => extractAllSections(null)).not.toThrow();
      
      const result = extractAllSections(null);
      expect(result.columnSections).toBeInstanceOf(Map);
      expect(result.columnSections.size).toBe(0);
    });

    test('name属性が欠損している場合の処理', () => {
      const xmlWithoutName = `
        <StbModel>
          <StbSections>
            <StbSecColumn_S id="1">
              <StbSecSteelFigureColumn_S>
                <StbSecColumn_S_Straight shape="H-400x200x8x13"/>
              </StbSecSteelFigureColumn_S>
            </StbSecColumn_S>
          </StbSections>
        </StbModel>
      `;
      const docWithoutName = new DOMParser().parseFromString(xmlWithoutName, 'text/xml');
      const result = extractAllSections(docWithoutName);
      
      const section = result.columnSections.get('1');
      expect(section.name).toBeNull();
      expect(section.id).toBe('1');
      expect(section.shapeName).toBe('H-400x200x8x13');
    });

    test('id属性欠損要素は除外される', () => {
      const xmlWithMissingId = `
        <StbModel>
          <StbSections>
            <StbSecColumn_S name="C1">
              <StbSecSteelFigureColumn_S>
                <StbSecColumn_S_Straight shape="H-400x200x8x13"/>
              </StbSecSteelFigureColumn_S>
            </StbSecColumn_S>
          </StbSections>
        </StbModel>
      `;
      const docWithMissingId = new DOMParser().parseFromString(xmlWithMissingId, 'text/xml');
      const result = extractAllSections(docWithMissingId);
      
      // id欠損要素は除外される
      expect(result.columnSections.size).toBe(0);
    });
  });
});

// ブラウザ環境での手動テスト用エクスポート
if (typeof window !== 'undefined') {
  window.testSectionExtractor = {
    createMockXMLDocument,
    extractAllSections
  };
}