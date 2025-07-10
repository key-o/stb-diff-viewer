# コード品質向上のためのコメント標準

## 現在のコメント状況

### 良好な点 ✅

- ファイルレベルドキュメント（@fileoverview）が適切に記述されている
- JSDoc形式の関数ドキュメントが多くの箇所で実装済み
- パラメータと戻り値の型情報が明記されている
- リファクタリング済みモジュールで包括的なドキュメントが整備されている

### 改善推奨項目 📋

#### 1. インラインコメントの追加

```javascript
// 推奨パターン：複雑な計算ロジックの説明
const normalizedDistance = distance / modelBounds.maxDimension; // モデル全体のサイズで正規化
const lodLevel = normalizedDistance < 0.1 ? 'high' : 'medium';  // 距離に基づくLOD判定

// 推奨パターン：アルゴリズムのステップ説明
// 1. 外形輪郭の作成（時計回り）
shape.moveTo(-width/2, height/2);
// 2. 内部中空部の追加（反時計回りで穴として定義）
const hole = new THREE.Path();
```

#### 2. 技術的負債の明記

```javascript
// TODO: 大量要素処理時のパフォーマンス最適化が必要
// FIXME: メモリリークの可能性があるため再検証が必要
// XXX: 暫定的な実装、将来的にはより効率的なアルゴリズムに変更
```

#### 3. 複雑な条件分岐の説明

```javascript
// STB仕様に基づく断面タイプ判定
// - StbSecColumn_S: 鉄骨柱
// - StbSecColumn_RC: RC柱  
// - StbSecColumn_SRC: SRC柱
if (sectionType === "StbSecColumn_S") {
  // 鉄骨断面の処理
} else if (sectionType === "StbSecColumn_RC") {
  // RC断面の処理
}
```

#### 4. 建築専門用語の説明

```javascript
/**
 * IFC準拠のプロファイル押し出し処理
 * 
 * 建築用語説明:
 * - プロファイル: 構造部材の断面形状
 * - 押し出し: 2D断面を3D軸方向に延長する操作
 * - 通り芯: 建物の基準となる軸線
 */
```

#### 5. エラーハンドリングの説明

```javascript
try {
  const geometry = createGeometry(elementData);
} catch (error) {
  // 不正な断面データの場合は警告ログを出力し、
  // デフォルト形状（矩形）で代替処理を継続
  console.warn(`Invalid section data for element ${elementData.id}:`, error);
  return createDefaultRectangleGeometry();
}
```

## 実装優先度

### 高優先度 🔴

1. **geometryGenerator.js** - 複雑な3D形状生成ロジック
2. **stbXmlParser.js** - XML解析の複雑な条件分岐
3. **comparator.js** - 要素比較アルゴリズム

### 中優先度 🟡

1. **ui/ modules** - イベント処理ロジック
2. **colorModes.js** - 色付けアルゴリズム
3. **interaction.js** - マウス操作処理

### 低優先度 🟢

1. **utils/** - 基本的なユーティリティ関数
2. **materials.js** - 材料定義
3. **constants.js** - 定数定義

## 推奨ツール

### 自動化ツール

- **ESLint**: `eslint-plugin-jsdoc` でJSDocの品質チェック
- **JSDoc**: 自動ドキュメント生成
- **TypeScript**: 型情報によるセルフドキュメンティング

### VS Code拡張機能

- **Document This**: JSDocコメントの自動生成
- **Better Comments**: TODO/FIXME等のハイライト
- **Code Spell Checker**: コメント内のスペルチェック

## 継続的改善

### 週次レビュー

- 新規追加されたコメントの品質確認
- TODO/FIXMEの進捗追跡
- ドキュメントと実装の整合性確認

### コードレビュー項目

- [ ] 複雑なロジックにインラインコメント追加
- [ ] 公開関数にJSDocコメント記述
- [ ] 技術的負債の明記
- [ ] 建築専門用語の説明追加
