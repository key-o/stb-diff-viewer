/**
 * @fileoverview STEP (ISO-10303-21) ファイル生成基盤
 * IFCファイルの基本フォーマットを提供
 */

/**
 * STEP形式のファイルを生成するクラス
 */
export class StepWriter {
  constructor() {
    this._entities = new Map();
    this._nextId = 1;
  }

  /**
   * 新しいエンティティIDを取得
   * @returns {number} エンティティID
   */
  getNextId() {
    return this._nextId++;
  }

  /**
   * エンティティを登録
   * @param {number} id - エンティティID
   * @param {string} typeName - IFCエンティティタイプ名
   * @param {Array} attributes - 属性配列
   * @returns {number} 登録したID
   */
  addEntity(id, typeName, attributes) {
    this._entities.set(id, { typeName, attributes });
    return id;
  }

  /**
   * エンティティを作成して登録（IDは自動割当）
   * @param {string} typeName - IFCエンティティタイプ名
   * @param {Array} attributes - 属性配列
   * @returns {number} 割り当てられたID
   */
  createEntity(typeName, attributes) {
    const id = this.getNextId();
    return this.addEntity(id, typeName, attributes);
  }

  /**
   * STEP文字列をエスケープ
   * @param {string} str - 元の文字列
   * @returns {string} エスケープされた文字列
   */
  static escapeString(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "''");
  }

  /**
   * 値をSTEP形式に変換
   * @param {*} value - 変換する値
   * @returns {string} STEP形式の文字列
   */
  static formatValue(value) {
    if (value === null || value === undefined) {
      return '$';
    }
    if (value === '*') {
      return '*';
    }
    if (typeof value === 'string') {
      // エンティティ参照 (#123)
      if (value.startsWith('#')) {
        return value;
      }
      // 列挙型 (.ENUM.)
      if (value.startsWith('.') && value.endsWith('.')) {
        return value;
      }
      // 通常の文字列
      return `'${StepWriter.escapeString(value)}'`;
    }
    if (typeof value === 'number') {
      // 整数か浮動小数点かを判定
      if (Number.isInteger(value)) {
        return String(value);
      }
      // 浮動小数点は指数表記を避ける
      return value.toFixed(10).replace(/\.?0+$/, '');
    }
    if (typeof value === 'boolean') {
      return value ? '.T.' : '.F.';
    }
    if (Array.isArray(value)) {
      const formatted = value.map(v => StepWriter.formatValue(v));
      return `(${formatted.join(',')})`;
    }
    if (typeof value === 'object' && value._type) {
      // 型付き値 (例: IfcLabel, IfcLengthMeasure)
      return `${value._type}(${StepWriter.formatValue(value.value)})`;
    }
    return String(value);
  }

  /**
   * IFCヘッダーを生成
   * @param {Object} options - ヘッダーオプション
   * @returns {string} ヘッダー文字列
   */
  generateHeader(options = {}) {
    const {
      description = 'STB to IFC Export',
      implementationLevel = '2;1',
      fileName = 'export.ifc',
      timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0],
      author = 'StbDiffViewer',
      organization = '',
      preprocessorVersion = 'StbDiffViewer IFC Exporter 1.0',
      originatingSystem = 'StbDiffViewer',
      authorization = '',
      schemaIdentifier = 'IFC4'
    } = options;

    return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('${description}'),'${implementationLevel}');
FILE_NAME('${fileName}','${timestamp}',('${author}'),('${organization}'),'${preprocessorVersion}','${originatingSystem}','${authorization}');
FILE_SCHEMA(('${schemaIdentifier}'));
ENDSEC;
`;
  }

  /**
   * DATAセクションを生成
   * @returns {string} DATAセクション文字列
   */
  generateData() {
    const lines = ['DATA;'];

    // エンティティをID順にソート
    const sortedEntries = Array.from(this._entities.entries())
      .sort((a, b) => a[0] - b[0]);

    for (const [id, entity] of sortedEntries) {
      const attrs = entity.attributes.map(a => StepWriter.formatValue(a)).join(',');
      lines.push(`#${id}=${entity.typeName}(${attrs});`);
    }

    lines.push('ENDSEC;');
    return lines.join('\n');
  }

  /**
   * 完全なSTEPファイルを生成
   * @param {Object} headerOptions - ヘッダーオプション
   * @returns {string} STEPファイル内容
   */
  generate(headerOptions = {}) {
    return this.generateHeader(headerOptions) + '\n' + this.generateData() + '\nEND-ISO-10303-21;\n';
  }

  /**
   * エンティティ数を取得
   * @returns {number} エンティティ数
   */
  get entityCount() {
    return this._entities.size;
  }

  /**
   * 登録済みエンティティを取得
   * @param {number} id - エンティティID
   * @returns {Object|undefined} エンティティ情報
   */
  getEntity(id) {
    return this._entities.get(id);
  }
}

/**
 * GUID生成（IFC用の22文字Base64エンコード）
 * @returns {string} IFC準拠のGUID
 */
export function generateIfcGuid() {
  // RFC4122 UUID v4を生成
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });

  // UUIDからハイフンを除去してBase64エンコード
  const hex = uuid.replace(/-/g, '');
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }

  // IFC用Base64変換テーブル（標準Base64とは異なる）
  const base64Chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i] || 0;
    const b2 = bytes[i + 1] || 0;
    const b3 = bytes[i + 2] || 0;

    result += base64Chars[(b1 >> 2) & 0x3F];
    result += base64Chars[((b1 << 4) | (b2 >> 4)) & 0x3F];
    result += base64Chars[((b2 << 2) | (b3 >> 6)) & 0x3F];
    result += base64Chars[b3 & 0x3F];
  }

  return result.substring(0, 22);
}
