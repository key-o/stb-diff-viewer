/**
 * @fileoverview Stage 1: ブラウザ用IFCモデルリーダー
 *
 * Node.js版 IfcModelReader のブラウザ対応版。
 * ArrayBuffer を直接受け取り、web-ifc WASM をCDN/ローカルから読み込む。
 *
 * @module IfcBrowserModelReader
 */

import * as WebIFC from 'web-ifc';
import { detectLengthUnit } from './util/UnitConverter.js';

export class IfcBrowserModelReader {
  constructor() {
    this.api = new WebIFC.IfcAPI();
    this.modelID = null;
    this.schema = 'IFC4';
    this.unitFactor = 1000;
  }

  /**
   * web-ifc を初期化（ブラウザ用）
   * @param {string} [wasmPath='./wasm/'] - WASMファイルの配信パス
   */
  async init(wasmPath = './wasm/') {
    this.api.SetWasmPath(wasmPath, false);
    await this.api.Init();
  }

  /**
   * ArrayBuffer からIFCモデルを読み込む
   * @param {ArrayBuffer} arrayBuffer - IFCファイルデータ
   * @returns {{ api: Object, modelID: number, schema: string, unitFactor: number }}
   */
  async load(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    this.modelID = this.api.OpenModel(data);

    this.schema = this._detectSchema();
    this.unitFactor = detectLengthUnit(this.api, this.modelID);

    return {
      api: this.api,
      modelID: this.modelID,
      schema: this.schema,
      unitFactor: this.unitFactor,
    };
  }

  /**
   * IFCスキーマバージョンを検出
   * @returns {string}
   */
  _detectSchema() {
    try {
      const header = this.api.GetHeaderLine(this.modelID, WebIFC.FILE_SCHEMA);
      if (header) {
        if (Array.isArray(header)) return header[0] || 'IFC4';
        if (header.arguments?.[0]) {
          const schema = header.arguments[0];
          if (Array.isArray(schema)) {
            const first = schema[0];
            return first?.value ?? first ?? 'IFC4';
          }
          return schema?.value ?? schema;
        }
        if (typeof header === 'string') return header;
      }
    } catch {
      // ignore
    }
    return 'IFC4';
  }

  /**
   * リソース解放
   */
  close() {
    if (this.modelID !== null) {
      this.api.CloseModel(this.modelID);
      this.modelID = null;
    }
  }
}
