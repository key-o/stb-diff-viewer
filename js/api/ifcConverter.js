/**
 * @fileoverview IFC変換API連携モジュール
 *
 * JavaScriptからPythonのIFC変換機能を呼び出すためのAPIクライアント
 * 環境設定に基づいてAPIエンドポイントを動的に決定
 */

import { getEnvironmentConfig } from "../config/environment.js";

export class IFCConverter {
  constructor(apiBaseUrl = null) {
    this.apiBaseUrl = apiBaseUrl; // nullの場合は環境設定から取得
    this.isServerRunning = false;
    this.corsProxyUrl = "https://cors-anywhere.herokuapp.com/"; // フォールバック
    this.config = null;

    // 環境設定の初期化
    this.initializeConfig();
  }

  /**
   * 環境設定の初期化
   */
  async initializeConfig() {
    try {
      this.config = await getEnvironmentConfig();

      // APIベースURLが指定されていない場合は環境設定から取得
      if (!this.apiBaseUrl) {
        this.apiBaseUrl = this.config.stb2ifc.apiBaseUrl;
      }

      // CORS プロキシURLも環境設定から取得
      if (this.config.corsProxy?.proxyUrl) {
        this.corsProxyUrl = this.config.corsProxy.proxyUrl;
      }

      console.log(`🔧 IFCConverter initialized with API: ${this.apiBaseUrl}`);
    } catch (error) {
      console.warn("環境設定の読み込みに失敗、デフォルト設定を使用:", error);
      // フォールバック
      this.apiBaseUrl =
        this.apiBaseUrl || "https://stb2ifc-api-e23mdd6kwq-an.a.run.app";
    }
  }

  /**
   * CORS プロキシを使用したAPIベースURLを取得
   */
  getApiUrlWithProxy() {
    return `${this.corsProxyUrl}${this.apiBaseUrl}`;
  }

  /**
   * CORS問題の検出
   */
  isCorsError(error) {
    return (
      error.message &&
      (error.message.includes("CORS") ||
        error.message.includes("Access-Control-Allow-Origin") ||
        error.message.includes("ERR_FAILED"))
    );
  }

  /**
   * CORS警告を表示
   */
  showCorsWarning() {
    const corsWarning = document.getElementById("cors-warning");
    if (corsWarning) {
      corsWarning.style.display = "block";
    }
  }

  /**
   * CORS警告を非表示
   */
  hideCorsWarning() {
    const corsWarning = document.getElementById("cors-warning");
    if (corsWarning) {
      corsWarning.style.display = "none";
    }
  }

  /**
   * サーバーの生存確認（CORS回避版も試行）
   */
  async checkServerHealth() {
    // 直接接続を試行
    try {
      const response = await fetch(`${this.apiBaseUrl}/health`, {
        method: "GET",
        mode: "cors",
        headers: {
          Accept: "application/json",
        },
      });
      this.isServerRunning = response.ok;
      return this.isServerRunning;
    } catch (error) {
      console.warn("直接接続でのAPIサーバーヘルスチェック失敗:", error.message);

      // CORS問題の場合は、プロキシ経由を提案
      if (this.isCorsError(error)) {
        console.info("CORS問題を検出しました。代替手段を検討してください。");
        this.showCorsWarning(); // CORS警告を表示
      }

      this.isServerRunning = false;
      return false;
    }
  }

  /**
   * STBファイルを直接IFCに変換（効率化版）
   * @param {File} stbFile - STBファイルオブジェクト
   * @param {Object} options - 変換オプション
   * @returns {Promise<Blob>} IFCファイルのBlob
   */
  async convertSTBFileToIFC(stbFile, options = {}) {
    if (!(await this.checkServerHealth())) {
      throw new Error(
        "IFC変換APIサーバーが利用できません。インターネット接続を確認してください。"
      );
    }

    // FormDataを使用してSTBファイルを直接送信
    const formData = new FormData();
    formData.append("stb_file", stbFile);

    // オプションも必要に応じて追加
    if (Object.keys(options).length > 0) {
      formData.append("options", JSON.stringify(options));
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/convert/stb-to-ifc`, {
        method: "POST",
        mode: "cors",
        body: formData, // multipart/form-data として送信
      });

      if (!response.ok) {
        let errorMsg;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || response.statusText;
        } catch {
          errorMsg = response.statusText;
        }
        throw new Error(`STBファイル変換エラー: ${errorMsg}`);
      }

      // IFCファイルをBlobとして取得
      const ifcBlob = await response.blob();
      return ifcBlob;
    } catch (error) {
      console.error("STBファイル変換エラー:", error);
      throw error;
    }
  }

  /**
   * JSONデータをIFCに変換（従来互換性維持）
   * @param {Object} stbData - STBデータのJSONオブジェクト
   * @param {Object} options - 変換オプション
   * @returns {Promise<Blob>} IFCファイルのBlob
   */
  async convertToIFC(stbData, options = {}) {
    if (!(await this.checkServerHealth())) {
      throw new Error(
        "IFC変換APIサーバーが利用できません。インターネット接続を確認してください。"
      );
    }

    const payload = {
      stb_data: stbData,
      options: {
        output_format: "ifc",
        include_geometry: options.includeGeometry ?? true,
        include_materials: options.includeMaterials ?? true,
        units: options.units ?? "mm",
        ...options,
      },
    };

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/convert/stb-to-ifc/json`,
        {
          method: "POST",
          mode: "cors",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `変換エラー: ${errorData.error || response.statusText}`
        );
      }

      // IFCファイルをBlobとして取得
      const ifcBlob = await response.blob();
      return ifcBlob;
    } catch (error) {
      console.error("IFC変換エラー:", error);
      throw error;
    }
  }

  /**
   * 変換可能性をチェック
   * @param {Object} stbData - チェック対象のSTBデータ
   * @returns {Promise<Object>} 変換可能性の結果
   */
  async validateForConversion(stbData) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/validate/stb-data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stb_data: stbData }),
      });

      return await response.json();
    } catch (error) {
      console.error("検証エラー:", error);
      throw error;
    }
  }

  /**
   * 変換進捗を取得（バックグラウンド変換用）
   * @param {string} taskId - タスクID
   * @returns {Promise<Object>} 進捗情報
   */
  async getConversionProgress(taskId) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/progress/${taskId}`);
      return await response.json();
    } catch (error) {
      console.error("進捗取得エラー:", error);
      throw error;
    }
  }
}

// UIヘルパー関数
export class IFCConverterUI {
  constructor(converter) {
    this.converter = converter;
    this.setupUI();
  }

  setupUI() {
    this.createConvertButton();
    this.createProgressIndicator();
  }

  createConvertButton() {
    // 既存のUIにIFC変換ボタンを追加
    const otherSettingsSection = document.querySelector("#other-settings");
    if (otherSettingsSection) {
      const convertButton = document.createElement("button");
      convertButton.id = "convertToIFCBtn";
      convertButton.className = "btn btn-primary";
      convertButton.innerHTML = "🏗️ IFCファイルに変換";
      convertButton.onclick = () => this.handleConvertClick();

      otherSettingsSection.appendChild(convertButton);
    }
  }

  createProgressIndicator() {
    const progressDiv = document.createElement("div");
    progressDiv.id = "ifc-conversion-progress";
    progressDiv.style.display = "none";
    progressDiv.innerHTML = `
      <div class="conversion-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%"></div>
        </div>
        <div class="progress-text">変換準備中...</div>
      </div>
    `;

    document.getElementById("overlay").appendChild(progressDiv);
  }

  async handleConvertClick() {
    try {
      // 元のSTBファイルが利用可能かチェック
      const originalFile = this.getOriginalSTBFile();

      if (originalFile) {
        // STBファイル直接変換（効率的）
        console.log("STBファイル直接変換を開始:", originalFile.name);
        await this.handleDirectSTBConversion(originalFile);
      } else {
        // フォールバック: 表示データからJSON変換
        console.log("表示データからJSON変換を開始");
        await this.handleJSONBasedConversion();
      }
    } catch (error) {
      this.showProgress(false);

      // CORS問題の特別処理
      if (error.message && error.message.includes("CORS")) {
        this.converter.showCorsWarning(); // CORS警告を表示
        alert(
          `CORS設定エラー:\n\nGoogle Cloud RunのAPIサーバーでCORS設定に問題があります。\n\n代替案:\n1. ローカルプロキシサーバーの使用\n2. サーバー管理者にCORS設定の修正を依頼\n\n詳細: ${error.message}`
        );
      } else {
        alert(`IFC変換エラー:\n${error.message}`);
      }

      console.error("IFC変換エラー:", error);
    }
  }

  async handleDirectSTBConversion(stbFile) {
    this.showProgress(true);
    this.updateProgress(0, "STBファイル直接変換開始...");

    // サーバー状態確認
    const serverOk = await this.converter.checkServerHealth();
    if (!serverOk) {
      throw new Error(
        "IFC変換APIサーバーが利用できません。\n\nインターネット接続を確認してから再度お試しください。"
      );
    }

    this.updateProgress(25, "STBファイル送信中...");

    // STBファイル直接変換
    const ifcBlob = await this.converter.convertSTBFileToIFC(stbFile, {
      include_geometry: true,
      include_materials: true,
      units: "mm",
    });

    this.updateProgress(100, "変換完了");

    // ファイルダウンロード
    this.downloadIFCFile(
      ifcBlob,
      `${stbFile.name.replace(".stb", "")}_converted.ifc`
    );

    setTimeout(() => this.showProgress(false), 1000);
  }

  async handleJSONBasedConversion() {
    // 現在表示されているモデルデータを取得
    const modelData = this.getCurrentModelData();

    if (!modelData) {
      alert(
        "変換するモデルデータがありません。まずSTBファイルを読み込んでください。"
      );
      return;
    }

    console.log("取得したモデルデータ:", modelData);

    this.showProgress(true);
    this.updateProgress(0, "JSON変換開始...");

    // サーバー状態確認
    const serverOk = await this.converter.checkServerHealth();
    if (!serverOk) {
      throw new Error(
        "IFC変換APIサーバーが利用できません。\n\nインターネット接続を確認してから再度お試しください。"
      );
    }

    this.updateProgress(25, "JSON送信中...");

    // IFC変換実行（従来方式）
    const ifcBlob = await this.converter.convertToIFC(modelData, {
      includeGeometry: true,
      includeMaterials: true,
      units: "mm",
    });

    this.updateProgress(100, "変換完了");

    // ファイルダウンロード
    this.downloadIFCFile(ifcBlob, "converted_model.ifc");

    setTimeout(() => this.showProgress(false), 1000);
  }

  getOriginalSTBFile() {
    // グローバル状態から元のSTBファイルを取得
    if (window.globalState && window.globalState.get) {
      const originalFileA = window.globalState.get("files.originalFileA");
      const originalFileB = window.globalState.get("files.originalFileB");

      // どちらか利用可能なファイルを返す（Aを優先）
      if (originalFileA) {
        console.log("元のSTBファイルA を使用:", originalFileA.name);
        return originalFileA;
      } else if (originalFileB) {
        console.log("元のSTBファイルB を使用:", originalFileB.name);
        return originalFileB;
      }
    }

    // フォールバック: windowオブジェクトから取得
    if (window.originalSTBFiles) {
      if (window.originalSTBFiles.fileA) {
        console.log(
          "フォールバック: 元のSTBファイルA を使用:",
          window.originalSTBFiles.fileA.name
        );
        return window.originalSTBFiles.fileA;
      } else if (window.originalSTBFiles.fileB) {
        console.log(
          "フォールバック: 元のSTBファイルB を使用:",
          window.originalSTBFiles.fileB.name
        );
        return window.originalSTBFiles.fileB;
      }
    }

    console.log("元のSTBファイルが見つかりません");
    return null;
  }

  getCurrentModelData() {
    // グローバル状態から現在のモデルデータを取得
    if (window.globalState && window.globalState.get) {
      const documentA = window.globalState.get("models.documentA");
      const documentB = window.globalState.get("models.documentB");
      const nodeMapA = window.globalState.get("models.nodeMapA");
      const nodeMapB = window.globalState.get("models.nodeMapB");
      const stories = window.globalState.get("models.stories");
      const axesData = window.globalState.get("models.axesData");

      console.log("グローバル状態から取得:", {
        hasDocumentA: !!documentA,
        hasDocumentB: !!documentB,
        storiesCount: stories?.length || 0,
        nodeMapASize: nodeMapA?.size || 0,
        nodeMapBSize: nodeMapB?.size || 0,
      });

      // XML文書からSTBデータを抽出
      let stbDataA = null;
      let stbDataB = null;

      if (documentA) {
        stbDataA = this.extractStbDataFromDocument(documentA, nodeMapA, "A");
      }

      if (documentB) {
        stbDataB = this.extractStbDataFromDocument(documentB, nodeMapB, "B");
      }

      // 両方ある場合は統合、片方だけの場合はそれを返す
      if (stbDataA && stbDataB) {
        return this.mergeModels(stbDataA, stbDataB, stories, axesData);
      } else if (stbDataA) {
        return this.enrichWithMetadata(stbDataA, stories, axesData, "A");
      } else if (stbDataB) {
        return this.enrichWithMetadata(stbDataB, stories, axesData, "B");
      }
    }

    console.log("グローバル状態またはモデルデータが見つかりません");
    return null;
  }

  extractStbDataFromDocument(document, nodeMap, modelId) {
    if (!document) return null;

    try {
      // 基本的なSTBデータ構造を抽出
      const projectName =
        document.querySelector("StbCommon project_name")?.textContent ||
        document.querySelector("StbCommon ProjectName")?.textContent ||
        `Model ${modelId}`;

      // 節点データを抽出
      const nodes = [];
      const nodeElements = document.querySelectorAll("StbNode");
      nodeElements.forEach((node) => {
        nodes.push({
          id: node.getAttribute("id") || "",
          x: parseFloat(node.getAttribute("X") || 0),
          y: parseFloat(node.getAttribute("Y") || 0),
          z: parseFloat(node.getAttribute("Z") || 0),
        });
      });

      // 構造要素を抽出
      const elements = {
        columns: this.extractElements(document, "StbColumn"),
        girders: this.extractElements(document, "StbGirder"),
        beams: this.extractElements(document, "StbBeam"),
        braces: this.extractElements(document, "StbBrace"),
        slabs: this.extractElements(document, "StbSlab"),
        walls: this.extractElements(document, "StbWall"),
      };

      // 軸データを抽出
      const axes = [];
      const axisElements = document.querySelectorAll("StbAxis");
      axisElements.forEach((axis) => {
        axes.push({
          id: axis.getAttribute("id") || "",
          name: axis.getAttribute("name") || "",
          x: parseFloat(axis.getAttribute("X") || 0),
          y: parseFloat(axis.getAttribute("Y") || 0),
          z: parseFloat(axis.getAttribute("Z") || 0),
        });
      });

      // 階データを抽出
      const storyElements = document.querySelectorAll("StbStory");
      const storyData = [];
      storyElements.forEach((story) => {
        storyData.push({
          id: story.getAttribute("id") || "",
          name: story.getAttribute("name") || "",
          height: parseFloat(story.getAttribute("height") || 0),
        });
      });

      console.log(`STBデータ抽出完了 (Model ${modelId}):`, {
        project_name: projectName,
        nodes: nodes.length,
        columns: elements.columns.length,
        girders: elements.girders.length,
        beams: elements.beams.length,
        axes: axes.length,
        stories: storyData.length,
      });

      return {
        project_name: projectName,
        model_id: modelId,
        nodes: nodes,
        ...elements,
        axes: axes,
        stories: storyData,
      };
    } catch (error) {
      console.error(`STBデータ抽出エラー (Model ${modelId}):`, error);
      return null;
    }
  }

  extractElements(document, elementType) {
    const elements = [];
    const elementNodes = document.querySelectorAll(elementType);

    elementNodes.forEach((element) => {
      const attributes = {};

      // 全ての属性を取得
      for (const attr of element.attributes) {
        attributes[attr.name] = attr.value;
      }

      elements.push(attributes);
    });

    return elements;
  }

  enrichWithMetadata(stbData, stories, axesData, modelId) {
    return {
      ...stbData,
      metadata: {
        source: `model_${modelId}`,
        extraction_time: new Date().toISOString(),
        global_stories: stories || [],
        global_axes: axesData || { xAxes: [], yAxes: [] },
      },
    };
  }

  mergeModels(modelA, modelB, stories, axesData) {
    // 2つのモデルを統合するロジック
    return {
      project_name: `${modelA.project_name || "ModelA"} + ${
        modelB.project_name || "ModelB"
      }`,
      model_id: "merged",

      // 節点データを統合（重複除去）
      nodes: this.mergeNodeArrays(modelA.nodes || [], modelB.nodes || []),

      // 構造要素を統合
      columns: [...(modelA.columns || []), ...(modelB.columns || [])],
      girders: [...(modelA.girders || []), ...(modelB.girders || [])],
      beams: [...(modelA.beams || []), ...(modelB.beams || [])],
      braces: [...(modelA.braces || []), ...(modelB.braces || [])],
      slabs: [...(modelA.slabs || []), ...(modelB.slabs || [])],
      walls: [...(modelA.walls || []), ...(modelB.walls || [])],

      // 軸と階のデータを統合
      axes: this.mergeAxisArrays(modelA.axes || [], modelB.axes || []),
      stories: this.mergeStoryArrays(
        modelA.stories || [],
        modelB.stories || []
      ),

      metadata: {
        source: "merged",
        original_models: [modelA.model_id, modelB.model_id],
        merge_time: new Date().toISOString(),
        global_stories: stories || [],
        global_axes: axesData || { xAxes: [], yAxes: [] },
      },
    };
  }

  mergeNodeArrays(nodesA, nodesB) {
    const nodeMap = new Map();

    // ノードAを追加
    nodesA.forEach((node) => {
      const key = `${node.x}_${node.y}_${node.z}`;
      nodeMap.set(key, node);
    });

    // ノードBを追加（重複は上書きしない）
    nodesB.forEach((node) => {
      const key = `${node.x}_${node.y}_${node.z}`;
      if (!nodeMap.has(key)) {
        nodeMap.set(key, node);
      }
    });

    return Array.from(nodeMap.values());
  }

  mergeAxisArrays(axesA, axesB) {
    const axisMap = new Map();

    axesA.forEach((axis) => {
      axisMap.set(axis.id, axis);
    });

    axesB.forEach((axis) => {
      if (!axisMap.has(axis.id)) {
        axisMap.set(axis.id, axis);
      }
    });

    return Array.from(axisMap.values());
  }

  mergeStoryArrays(storiesA, storiesB) {
    const storyMap = new Map();

    storiesA.forEach((story) => {
      storyMap.set(story.height, story);
    });

    storiesB.forEach((story) => {
      if (!storyMap.has(story.height)) {
        storyMap.set(story.height, story);
      }
    });

    return Array.from(storyMap.values()).sort((a, b) => a.height - b.height);
  }

  showProgress(show) {
    const progressDiv = document.getElementById("ifc-conversion-progress");
    if (progressDiv) {
      progressDiv.style.display = show ? "block" : "none";
    }
  }

  updateProgress(percentage, text) {
    const progressFill = document.querySelector(".progress-fill");
    const progressText = document.querySelector(".progress-text");

    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
    }
    if (progressText) {
      progressText.textContent = text;
    }
  }

  downloadIFCFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// スタイル追加
const style = document.createElement("style");
style.textContent = `
  .conversion-progress {
    padding: 15px;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #dee2e6;
    margin: 10px 0;
  }
  
  .progress-bar {
    width: 100%;
    height: 20px;
    background-color: #e9ecef;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #007bff, #0056b3);
    transition: width 0.3s ease;
    border-radius: 10px;
  }
  
  .progress-text {
    text-align: center;
    font-size: 0.9em;
    color: #495057;
    font-weight: 500;
  }
  
  #convertToIFCBtn {
    background: #28a745;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 5px;
    cursor: pointer;
    font-weight: bold;
    margin: 5px 0;
    width: 100%;
  }
  
  #convertToIFCBtn:hover {
    background: #218838;
  }
  
  #convertToIFCBtn:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }
`;
document.head.appendChild(style);
