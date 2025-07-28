# パラメータサジェスト機能実装方針書

**Project**: STB Diff Viewer Parameter Suggestion Enhancement  
**Priority**: 🚀 High Priority (即座に実装)  
**Target**: 基本的なドロップダウンサジェスト + XSD列挙値の活用  
**Created**: 2025年1月  

## 概要

STBパラメータ編集時に固定値リストを持つ属性について、ドロップダウン形式のサジェスト機能を実装する。XSDスキーマから列挙値を抽出し、ユーザーフレンドリーな編集UIを提供する。

## 実装目標

### 主要目標
- ✅ XSDスキーマからの列挙値自動抽出
- ✅ ドロップダウン + フリーテキスト併用UI
- ✅ 既存編集機能との完全統合
- ✅ リアルタイムバリデーション連携

### 期待効果
- 入力ミス削減 90%以上
- 入力速度向上 3-5倍
- STBスキーマ準拠性向上

## アーキテクチャ設計

### コンポーネント構成

```
js/ui/parameterEditor.js          # 新規: モーダル編集UI
js/core/suggestionEngine.js       # 新規: サジェスト管理
js/parser/xsdSchemaParser.js       # 拡張: 列挙値抽出強化
js/viewer/ui/elementInfoDisplay.js # 修正: 統合
```

### データフロー

```
1. 編集ボタンクリック
   ↓
2. XSDスキーマから列挙値抽出
   ↓
3. ParameterEditor表示
   ↓
4. ユーザー選択/入力
   ↓
5. バリデーション
   ↓
6. 値更新・UI反映
```

## 実装ステップ

### Step 1: 基盤整備
**担当ファイル**: `js/core/suggestionEngine.js`

```javascript
// サジェストエンジンの実装
export class SuggestionEngine {
  static getSuggestions(elementType, attributeName, context = {})
  static getEnumerationSuggestions(elementType, attributeName)
  static sortSuggestionsByRelevance(suggestions, currentValue)
}
```

**実装内容**:
- XSDスキーマからの列挙値抽出
- 文脈に応じたソーティング
- キャッシュ機能

### Step 2: UI コンポーネント
**担当ファイル**: `js/ui/parameterEditor.js`

```javascript
// パラメータ編集モーダルの実装
export class ParameterEditor {
  static async show(config)
  static createDropdownUI(suggestions)
  static createMixedUI(suggestions, allowFreeText)
  static validateInput(value, validationRules)
}
```

**実装内容**:
- モーダルダイアログUI
- ドロップダウン + テキスト入力
- リアルタイムバリデーション
- アクセシビリティ対応

### Step 3: XSD機能拡張
**担当ファイル**: `js/parser/xsdSchemaParser.js`

**拡張機能**:
- `getAttributeTypeInfo()` - 属性型情報の詳細取得
- `hasEnumerationValues()` - 列挙値存在チェック
- `getAttributeConstraints()` - 制約情報取得

### Step 4: 統合とテスト
**担当ファイル**: `js/viewer/ui/elementInfoDisplay.js`

**修正内容**:
- `editAttributeValue()` 関数の全面刷新
- ParameterEditorとの統合
- 編集履歴管理の強化

## 技術仕様

### サポート対象属性

**Phase 1 対象**:
- `kind` (ON_GIRDER, ON_BEAM, ON_COLUMN等)
- `type` (RC, S, SRC等)
- `strength_concrete` (標準強度値)
- `joint_id_start`, `joint_id_end` (接合ID)

**データ取得方法**:
```javascript
// XSDスキーマから自動抽出
const suggestions = await SuggestionEngine.getSuggestions(
  'StbColumn', 'kind', { currentValue: 'ON_GIRDER' }
);
// → ['ON_GIRDER', 'ON_BEAM', 'ON_COLUMN', 'ON_POST', 'ON_GRID', ...]
```

### UI仕様

**ドロップダウンモード**:
- 列挙値が10個以下 → 完全ドロップダウン
- 必須属性 → ドロップダウンのみ

**混合モード**:
- 列挙値が11個以上 → ドロップダウン + フリーテキスト
- 任意属性 → フリーテキスト可能

**バリデーション**:
- リアルタイム入力チェック
- XSDスキーマ準拠性検証
- エラー時の代替案提示

### パフォーマンス要件

- 初回表示: 200ms以内
- サジェスト表示: 50ms以内  
- バリデーション: 10ms以内
- メモリ使用量: +5MB以下

## 実装順序

### Week 1: コア機能
1. **Day 1-2**: SuggestionEngine実装
2. **Day 3-4**: XSDスキーマ機能拡張
3. **Day 5**: 基本テスト・デバッグ

### Week 2: UI・統合
1. **Day 1-3**: ParameterEditor実装
2. **Day 4**: 既存機能との統合
3. **Day 5**: 統合テスト・最適化

## 品質保証

### テスト戦略
- **単体テスト**: 各コンポーネント個別
- **統合テスト**: エンドツーエンド動作
- **ユーザビリティテスト**: 実際の編集シナリオ
- **パフォーマンステスト**: レスポンス時間計測

### 成功基準
- [ ] 列挙値属性の90%以上でサジェスト動作
- [ ] 編集時間が従来の1/3以下に短縮
- [ ] バリデーションエラー率80%削減
- [ ] 既存機能への影響なし

## リスク管理

### 想定リスク
1. **XSDスキーマ解析失敗** → フォールバック機能
2. **UI表示性能劣化** → 遅延読み込み実装
3. **既存機能への影響** → 段階的移行

### 対策
- 既存のprompt()を並行維持
- 機能フラグによる段階的リリース
- パフォーマンス監視・アラート

## 将来拡張

### Phase 2 機能 (中優先度)
- オートコンプリート機能
- 使用履歴ベースのサジェスト
- 断面名の自動補完

### Phase 3 機能 (低優先度)  
- 学習機能による最適化
- 構造関連のインテリジェント提案
- バッチ編集機能

## 参考資料

- [STB-Bridge 2.0.2 仕様書](https://www.building-smart.or.jp/)
- [XSD Schema 1.1 Specification](https://www.w3.org/XML/Schema)
- [現在の実装: elementInfoDisplay.js](../js/viewer/ui/elementInfoDisplay.js)
- [XSDパーサー: xsdSchemaParser.js](../js/parser/xsdSchemaParser.js)

---

**Implementation Status**: 🚧 In Progress  
**Last Updated**: 2025年1月  
**Next Review**: 実装完了後