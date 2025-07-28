# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリのコードを扱う際のガイダンスを提供します。

## 開発コマンド

これはビルドプロセスがないクライアントサイドのWebアプリケーションです。開発するには：

```bash
# アプリケーションをローカルで配信（任意のローカルサーバーを使用）
python -m http.server 8000
# または
npx serve .

# ブラウザで http://localhost:8000 を開く
```

package.json、ビルドシステム、テストフレームワークは存在しません。アプリケーションはES6モジュールとCDNインポートを使用してブラウザ上で直接実行されます。

## アーキテクチャ概要

### コア構造

これは **STB (ST-Bridge) Diff Viewer** - STB/XML形式の3D建築モデルを比較するWebアプリケーションです。バニラJavaScriptとThree.jsで構築され、ES6モジュールを使用しています。

**エントリーポイント**: `js/main.js` - 全モジュールを統合し、初期化を処理
**モデルパイプライン**: ファイルアップロード → XML解析 → 要素比較 → 3Dレンダリング → UI更新

### 主要モジュール

#### 1. モデル読み込み・管理（`js/modelLoader.js`）

- **重要な関数**: `compareModels()`（95-369行）- モデル比較パイプライン全体を処理する275行の関数
- STBファイル読み込み、解析、比較ロジック、3Dレンダリングを管理
- ファイル入力から視覚的出力までのフローを制御

#### 2. 3Dビューワーシステム（`js/viewer/`）

**アーキテクチャ**: 責任の明確な分離を持つモジュラーThree.jsラッパー

- `core/core.js`: シーン、カメラ、レンダラー、コントロールの初期化（建築用mm単位最適化）
- `rendering/`: 要素描画（`elements.js`）と材料管理（`materials.js`）
- `geometry/`: 建築要素用の形状生成（`ShapeFactory.js`、`*Generator.js`）
- `ui/`: ラベル（`labels.js`）、レイアウトヘルパー（`layout.js`）、要素情報表示
- `utils/utils.js`: シーン管理、クリッピング平面、カメラフィッティング

#### 3. モデル比較（`js/comparator.js`）

- モデルAとモデルB間の要素ごとの比較
- 要素を `common`、`onlyA`、`onlyB` に分類
- サポート対象: ノード、柱、梁、小梁、ブレース、スラブ、壁

#### 4. XML処理（`js/parser/`）

- `stbXmlParser.js`: 名前空間処理を含むコアSTB形式解析
- `xsdSchemaParser.js`: スキーマ検証と属性抽出
- 日本の建築モデリング標準を処理

#### 5. UI・インタラクション

- `js/ui.js`: 複数の責任を管理する594行のファイル（リファクタリングが必要）
- `js/interaction.js`: 3Dオブジェクトの選択とインタラクション
- `js/viewModes.js`: ビューモード切り替え（比較モード、可視性）
- `js/colorModes.js`: 異なる要素状態の色分け

### データフロー

```
STBファイル → XMLパーサー → 要素抽出器 → 比較器 → 3Dレンダラー → UI更新
           ↓
    検証 ← スキーマパーサー
```

### 主要なアーキテクチャパターン

- **モジュール統合**: `main.js`がインポート/エクスポートを通じて全モジュールを調整
- **3Dオブジェクトグループ**: 効率的なレンダリングのため要素をタイプ別に`elementGroups`で整理
- **材料戦略**: `common`、`onlyA`、`onlyB`状態に対する異なる材料
- **名前空間処理**: STB XMLは建築データの特定の名前空間を使用

### 重要な実装詳細

- **スケール**: 全座標はミリメートル単位（建築標準）
- **要素サポート**: ノード、柱、梁、小梁、ブレース、スラブ、壁、軸、階
- **比較キー**: 幾何学的/構造的プロパティによる要素マッチング
- **3D最適化**: パフォーマンス向上のためのグループ、材料共有、クリッピング平面

### 完了したリファクタリングタスク

- ✅ `modelLoader.js`: 巨大な`compareModels`関数（292行）を5つの焦点を絞ったモジュールに分割：
  - `fileValidation.js`: ファイル検証とパラメータチェック
  - `modelProcessing.js`: STBドキュメント処理と解析
  - `elementComparison.js`: 要素比較ロジック
  - `renderingOrchestrator.js`: 3Dレンダリング調整
  - `visualizationFinalizer.js`: UI更新とカメラポジショニング

- ✅ `ui.js`: 620行のモジュールを焦点を絞ったコンポーネントに分割：
  - `ui/state.js`: グローバル状態管理
  - `ui/selectors.js`: 階/軸セレクター管理
  - `ui/labelManager.js`: ラベル可視性管理
  - `ui/events.js`: イベントリスナーセットアップと処理
  - `ui/clipping.js`: クリッピング平面操作

- ✅ `ShapeFactory.js`: メソッドの重複を60%削減：
  - 共通の検証とパラメータ解析メソッドを追加
  - ジオメトリ作成ロジックをプライベートメソッドに抽出
  - 形状作成にテンプレートメソッドパターンを実装

- ✅ `MeshPositioner.js`: 共通のメッシュポジショニングロジックを抽出
- ✅ グローバル状態管理: 構造化された状態管理システムを実装
  - `js/core/globalState.js`: 中央集権的アプリケーション状態管理
  - パスベースAPIによる型安全な状態アクセス
  - 状態変更通知システム
  - レガシー互換性を維持

### 新しいアーキテクチャ改善

#### コアインフラストラクチャ

- `js/core/globalState.js`: リスナーシステムを持つ中央集権状態管理
- `js/core/performanceMonitor.js`: リアルタイムパフォーマンス追跡と最適化
- モジュール全体での構造化されたエラーハンドリングとログ記録

#### 保守性の向上

- JSDoc標準による関数レベルのドキュメント
- 記述的動詞を用いたcamelCaseによる一貫した命名規則
- 簡単なテストと拡張を可能にするモジュラーアーキテクチャ

#### 開発者ツール（2025年1月）

- `js/devtools.js`: 開発時専用ユーティリティ
  - STBサンプルデータ自動生成
  - 要素選択テストの自動実行
  - パフォーマンス測定機能
  - デバッグ情報表示
  - ブラウザコンソールから `window.devtools.*` で利用可能

### IFC互換性強化

#### 新しいIFCプロファイルシステム

- `js/viewer/geometry/IFCProfileFactory.js`: IFC4/IFC4.3標準に従ったIFC準拠プロファイル作成
- `js/viewer/geometry/MeshPositioner.js`: コード重複を排除する統一メッシュポジショニングユーティリティ
- IFCプロファイルタイプのサポート: IfcIShapeProfileDef、IfcRectangleProfileDef、IfcCircleProfileDef等
- 任意パスに沿ったIFCスタイル押し出し（線形および曲線）
- STB形式とIFCプロファイル標準間のブリッジ

#### IFC統合の使用パターン

```javascript
// STBをIFCプロファイルに変換
const ifcProfile = IFCProfileFactory.createProfileFromSTB(stbSteelShape, 'H');
const profileShape = IFCProfileFactory.createGeometryFromProfile(ifcProfile, 'center');
const geometry = IFCExtrusionEngine.extrudeLinear(profileShape, length, direction);

// 統一ユーティリティを使用してポジショニング
MeshPositioner.positionLinearElement(mesh, startNode, endNode, geometry, {
  elementType: 'column',
  coordinateSystem: 'architectural'
});
```

#### 移行戦略

1. **フェーズ1**: ポジショニング重複を排除するため`MeshPositioner`を統合
2. **フェーズ2**: 既存のSTBプロファイルと並行してIFCプロファイルサポートを追加
3. **フェーズ3**: 曲線パスと複雑なプロファイルによる完全なIFC押し出しサポート

### ファイル読み込みプロセス

STBファイルはファイル入力経由で読み込まれ、XMLとして解析され、スキーマに対して検証された後、3Dジオメトリに処理されます。アプリは自動的に文字エンコーディングを検出し、STBと汎用XML形式の両方をサポートします。

### 開発とテスト

#### 本番環境
- 本番配布では `js/test/` フォルダは除外済み（2025年1月削除）
- テスト機能は `js/devtools.js` に統合

#### 開発環境での使用
```javascript
// ブラウザコンソールでの開発ツール使用例
devtools.quickTest()              // クイック機能テスト
devtools.generateMinimalSTBSample() // テスト用STBデータ生成
devtools.startPerformanceMonitoring() // パフォーマンス測定開始
devtools.printDebugInfo()         // デバッグ情報表示
```

## 命名規則

### 関数名

**パターン**: 記述的動作動詞を用いた`camelCase`

**使用する動詞**:

- `create*()` - 新しいオブジェクト/インスタンスを作成
- `build*()` - 複雑なデータ構造を構築
- `parse*()` - データを他の形式に解析
- `extract*()` - より大きなデータセットから特定のデータを抽出
- `generate*()` - ジオメトリ、メッシュ、または計算データを生成
- `render*()` - 視覚的要素をレンダリング
- `draw*()` - 特定の3Dオブジェクトを描画
- `update*()` - 既存の状態/UIを更新
- `apply*()` - 変換や設定を適用
- `setup*()` - システムやリスナーを初期化
- `init*()` - 単一コンポーネントを初期化
- `process*()` - アルゴリズムを通じてデータを処理
- `handle*()` - イベントやユーザーインタラクションを処理
- `validate*()` - データや状態を検証
- `calculate*()` - 計算を実行
- `find*()` - 特定のアイテムを検索
- `filter*()` - コレクションをフィルタリング
- `compare*()` - データ構造を比較

**避けるべき**:

- `manage*()`、`handle*()`などの文脈なしの汎用動詞
- より明確な完全な単語がある場合の`proc*()`、`calc*()`、`init*()`などの省略形

**例**:

```javascript
// 良い例
function parseStbElements(xmlDocument) { }
function generateColumnMesh(columnData) { }
function calculateElementBounds(elements) { }
function processElementSelection(selectedObject) { }

// 避けるべき例
function handleStuff(data) { }
function processData(input) { }
function doComparison(a, b) { }
```

### クラス名

**パターン**: 記述的名詞を用いた`PascalCase`

**許容可能な接尾辞**:

- `*Factory` - オブジェクト/インスタンスを作成（適切な場合）
- `*Builder` - 複雑なオブジェクトを段階的に構築
- `*Parser` - データ形式を解析
- `*Generator` - 特定タイプのコンテンツを生成
- `*Renderer` - 視覚的コンテンツをレンダリング
- `*Validator` - データを検証
- `*Calculator` - 計算を実行

**避けるべき**:

- `*Manager` - 管理対象を具体的に指定する
- `*Handler` - 処理対象を具体的に指定する
- `*Helper` - 提供する支援を具体的に指定する
- `*Utility` - ユーティリティ機能を具体的に指定する

**例**:

```javascript
// 良い例
class SteelShapeFactory { }
class StbXmlParser { }
class ElementBoundsCalculator { }
class ModelComparisonRenderer { }

// 避けるべき例
class DataManager { }
class EventHandler { }
class StbHelper { }
class ModelUtility { }
```

### 変数名

**パターン**: 記述的名詞を用いた`camelCase`

**モデルデータ**:

- `modelADocument`, `modelBDocument` （`docA`, `docB`ではなく）
- `elementA`, `elementB` （`elA`, `elB`ではなく）
- `nodeIdentifiers` （`nodeIds`ではなく）

**コレクション**:

- `elementCollection` （曖昧な場合の`elements`ではなく）
- `nodeMap` （マップ構造であることを明示）
- `comparisonResults` （`results`ではなく）

**3Dオブジェクト**:

- `columnMesh`, `beamMesh` （要素タイプを指定）
- `materialInstance` （`mat`ではなく）
- `geometryBuffer` （`geom`ではなく）

**定数**:

```javascript
// SCREAMING_SNAKE_CASEを使用
const SUPPORTED_ELEMENT_TYPES = ['column', 'beam', 'brace'];
const MODEL_COMPARISON_STATES = {
    COMMON: 'common',
    ONLY_A: 'onlyA', 
    ONLY_B: 'onlyB'
};
```

### モジュール/ファイル名

**パターン**: 記述的でドメイン固有の用語を用いた`camelCase`

**良い例**:

- `stbXmlParser.js` - STB XML解析
- `columnGenerator.js` - 柱ジオメトリ生成
- `elementInfoDisplay.js` - 要素情報表示
- `modelComparison.js` - モデル比較ロジック

**避けるべき**:

- `utils.js` - 汎用的すぎる、ユーティリティドメインを指定する
- `helpers.js` - 曖昧すぎる、提供する支援を指定する
- `common.js` - 汎用的すぎる、共通機能を指定する

### 関数パラメータ

**明示的にする**:

```javascript
// 良い例
function compareElements(elementA, elementB, comparisonOptions) { }
function generateMesh(elementData, materialProperties, scaleFactors) { }

// 避けるべき例
function compareElements(a, b, opts) { }
function generateMesh(data, props, scale) { }
```

### イベントハンドラー

**パターン**: 特定のアクションを含む`handle*()`または`on*()`

```javascript
// 良い例
function handleElementSelection(selectedObject) { }
function onViewportResize(dimensions) { }
function handleModelFileUpload(fileData) { }

// 避けるべき例
function handleClick(event) { }
function onEvent(data) { }
function handleStuff(input) { }
```

### 建築ドメイン用語

**正確な用語を使用**:

- `structuralElement` （曖昧な場合の`element`ではなく）
- `buildingModel` （曖昧な場合の`model`ではなく）
- `geometricProperties` （`props`ではなく）
- `materialProperties` （プロパティを指す場合の`materials`ではなく）
- `dimensionalData` （データ構造を指す場合の`dimensions`ではなく）

### エラー防止

**これらのパターンを避ける**:

- ループカウンター以外の一文字変数
- 意味を失う省略形（`doc` → `document`）
- 文脈のない汎用用語（`data`, `info`, `result`）
- 誤解を招く名前（実際にレンダリングしない`renderElements`）
- 同一モジュール内での一貫性のない命名

### IFCジオメトリ生成原則

#### プロファイル連続性（Profile Continuity）

IFC準拠のジオメトリ生成では、構造要素間の連続性を重視します：

```javascript
// 柱と梁の接続部でのプロファイル連続性
function createContinuousConnection(columnElement, beamElement, connectionNode) {
  const columnProfile = extractProfile(columnElement);
  const beamProfile = extractProfile(beamElement);
  
  // 同一プロファイルの場合は滑らかな接続を作成
  if (profilesMatch(columnProfile, beamProfile)) {
    return createSmoothTransition(columnProfile, connectionNode);
  }
  
  // 異なるプロファイルの場合は適切な移行部を作成
  return createProfileTransition(columnProfile, beamProfile, connectionNode);
}
```

#### ジオメトリ生成の効率化原則

##### プロファイル再利用パターン

```javascript
// プロファイル形状をキャッシュして再利用
class ProfileCache {
  static getOrCreate(profileKey, createFunction) {
    if (!this.cache.has(profileKey)) {
      this.cache.set(profileKey, createFunction());
    }
    return this.cache.get(profileKey);
  }
}

// 使用例
const hProfile = ProfileCache.getOrCreate('H-200x100x5x7', () => 
  createHShapeProfile(200, 100, 5, 7)
);
```

##### 押し出しパス最適化

```javascript
// IFC準拠の線形押し出し（最も効率的）
function createLinearExtrusion(profile, startPoint, endPoint) {
  const direction = endPoint.clone().sub(startPoint).normalize();
  const length = startPoint.distanceTo(endPoint);
  return extrudeProfileLinear(profile, direction, length);
}

// 曲線押し出し（必要な場合のみ）
function createCurvedExtrusion(profile, curvePath) {
  // 曲線の複雑度を評価し、必要に応じて線形セグメントに分割
  const segments = optimizeCurvePath(curvePath);
  return extrudeProfileAlongPath(profile, segments);
}
```

#### コード簡潔性の原則

##### 関数型アプローチの活用

```javascript
// 配列操作による簡潔な要素処理
const processElements = (elements) => elements
  .filter(element => element.isVisible)
  .map(element => createGeometry(element))
  .filter(geometry => geometry.isValid)
  .forEach(geometry => scene.add(geometry));

// メソッドチェーンによる設定
const material = new MaterialBuilder()
  .setColor(0x888888)
  .setOpacity(0.8)
  .enableWireframe()
  .build();
```

##### 設定オブジェクトパターン

```javascript
// 複雑な設定を1つのオブジェクトで管理
function createStructuralElement(elementData, options = {}) {
  const config = {
    generateNormals: true,
    enableUVMapping: false,
    optimizeGeometry: true,
    profileAccuracy: 'standard',
    connectionType: 'smooth',
    ...options
  };
  
  return new StructuralElementBuilder(elementData, config).build();
}
```

##### Template Method Pattern の活用

```javascript
// 共通処理を抽象化し、差分のみを実装
class GeometryGenerator {
  generate(elementData) {
    const profile = this.createProfile(elementData);
    const path = this.createPath(elementData);
    const geometry = this.extrudeProfile(profile, path);
    return this.finalizeGeometry(geometry);
  }
  
  // サブクラスで実装
  createProfile(elementData) { throw new Error('Must implement'); }
  createPath(elementData) { throw new Error('Must implement'); }
  
  // 共通実装
  extrudeProfile(profile, path) { /* 共通ロジック */ }
  finalizeGeometry(geometry) { /* 共通後処理 */ }
}
```

### パフォーマンス最適化原則

#### ジオメトリ結合（Geometry Merging）

```javascript
// 同一材料の要素を結合してドローコール数を削減
function mergeGeometriesByMaterial(elements) {
  const geometryGroups = new Map();
  
  elements.forEach(element => {
    const materialKey = element.material.id;
    if (!geometryGroups.has(materialKey)) {
      geometryGroups.set(materialKey, []);
    }
    geometryGroups.get(materialKey).push(element.geometry);
  });
  
  return Array.from(geometryGroups.entries()).map(([materialId, geometries]) => ({
    material: getMaterialById(materialId),
    geometry: mergeGeometries(geometries)
  }));
}
```

#### LOD（Level of Detail）システム

```javascript
// 距離に応じてジオメトリの詳細度を調整
class LODGeometryGenerator {
  generate(elementData, cameraDistance) {
    const lodLevel = this.calculateLOD(cameraDistance);
    
    switch(lodLevel) {
      case 'high':   return this.generateDetailedGeometry(elementData);
      case 'medium': return this.generateStandardGeometry(elementData);
      case 'low':    return this.generateSimplifiedGeometry(elementData);
      default:       return this.generateBoundingBox(elementData);
    }
  }
  
  calculateLOD(distance) {
    if (distance < 50) return 'high';
    if (distance < 200) return 'medium';
    if (distance < 500) return 'low';
    return 'minimal';
  }
}
```

#### IFC準拠の具体的実装パターン

##### 要素間接続の自動処理

```javascript
// 柱と梁の接続における滑らかな連結処理
class StructuralConnectionManager {
  static createConnection(elementA, elementB, connectionNode) {
    const profileA = this.normalizeProfile(elementA.profile);
    const profileB = this.normalizeProfile(elementB.profile);
    
    // プロファイルが同一または互換性がある場合
    if (this.areProfilesCompatible(profileA, profileB)) {
      return this.createSmoothConnection(profileA, profileB, connectionNode);
    }
    
    // 異なるプロファイルの場合は過渡部を作成
    return this.createTransitionConnection(profileA, profileB, connectionNode);
  }
  
  static createSmoothConnection(profileA, profileB, node) {
    // IFC準拠の連続的な形状変化
    const transitionLength = Math.min(profileA.height, profileB.height) * 0.5;
    return new SmoothProfileTransition(profileA, profileB, transitionLength);
  }
}
```

##### 効率的なプロファイル形状生成

```javascript
// 標準プロファイルの効率的な生成
class StandardProfileLibrary {
  // H形鋼プロファイル（日本工業規格準拠）
  static createHProfile(height, width, webThickness, flangeThickness) {
    const key = `H-${height}x${width}x${webThickness}x${flangeThickness}`;
    
    return ProfileCache.getOrCreate(key, () => {
      const shape = new THREE.Shape();
      
      // 外形を描画（時計回り）
      shape.moveTo(-width/2, -height/2);
      shape.lineTo(width/2, -height/2);
      shape.lineTo(width/2, -height/2 + flangeThickness);
      shape.lineTo(webThickness/2, -height/2 + flangeThickness);
      shape.lineTo(webThickness/2, height/2 - flangeThickness);
      shape.lineTo(width/2, height/2 - flangeThickness);
      shape.lineTo(width/2, height/2);
      shape.lineTo(-width/2, height/2);
      shape.lineTo(-width/2, height/2 - flangeThickness);
      shape.lineTo(-webThickness/2, height/2 - flangeThickness);
      shape.lineTo(-webThickness/2, -height/2 + flangeThickness);
      shape.lineTo(-width/2, -height/2 + flangeThickness);
      shape.lineTo(-width/2, -height/2);
      
      return shape;
    });
  }
  
  // 矩形プロファイル（柱・梁共通）
  static createRectProfile(width, height) {
    const key = `RECT-${width}x${height}`;
    
    return ProfileCache.getOrCreate(key, () => {
      const shape = new THREE.Shape();
      shape.moveTo(-width/2, -height/2);
      shape.lineTo(width/2, -height/2);
      shape.lineTo(width/2, height/2);
      shape.lineTo(-width/2, height/2);
      shape.lineTo(-width/2, -height/2);
      return shape;
    });
  }
}
```

##### 最小コードでの要素生成

```javascript
// 1つの関数で多様な構造要素を生成
function createStructuralElement(type, startNode, endNode, profileData) {
  const elementConfig = {
    column: () => ({
      profile: StandardProfileLibrary.createHProfile(...profileData),
      axis: new THREE.Vector3(0, 1, 0), // Y軸方向
      positioning: 'center'
    }),
    beam: () => ({
      profile: StandardProfileLibrary.createHProfile(...profileData),
      axis: endNode.clone().sub(startNode).normalize(),
      positioning: 'center'
    }),
    brace: () => ({
      profile: StandardProfileLibrary.createRectProfile(...profileData),
      axis: endNode.clone().sub(startNode).normalize(),
      positioning: 'center'
    })
  };
  
  const config = elementConfig[type]();
  const length = startNode.distanceTo(endNode);
  
  // 統一された押し出し処理
  const geometry = new THREE.ExtrudeGeometry(config.profile, {
    depth: length,
    bevelEnabled: false
  });
  
  // IFC準拠のポジショニング
  return MeshPositioner.positionLinearElement(
    new THREE.Mesh(geometry), 
    startNode, 
    endNode, 
    config
  );
}
```

##### デバッグ・可視化支援

```javascript
// 開発時の視覚的デバッグ支援
class GeometryDebugHelper {
  static showProfileOutline(profile, position, color = 0xff0000) {
    const points = profile.getPoints();
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color });
    const line = new THREE.Line(geometry, material);
    line.position.copy(position);
    return line;
  }
  
  static showExtrusionPath(startNode, endNode, color = 0x00ff00) {
    const geometry = new THREE.BufferGeometry().setFromPoints([startNode, endNode]);
    const material = new THREE.LineBasicMaterial({ color });
    return new THREE.Line(geometry, material);
  }
  
  // プロファイルの寸法表示
  static addDimensionLabels(profile, position) {
    const bounds = profile.getBoundingBox();
    const width = bounds.max.x - bounds.min.x;
    const height = bounds.max.y - bounds.min.y;
    
    return {
      width: this.createDimensionLabel(`${width.toFixed(0)}mm`, position),
      height: this.createDimensionLabel(`${height.toFixed(0)}mm`, position)
    };
  }
}
```
