# STB-DiffCheckerデータ流用によるスキーマチェック高精度化提案書

## 概要

NS-NS/STB-DiffCheckerの設定データとロジックを流用して、現在のSTB Diff Viewerのスキーマチェック機能を高精度化する可能性を検討し、実装計画を文書化します。

## 1. 現状分析

### 1.1 STB-DiffCheckerの特徴

STB-DiffCheckerは日建設計×日本設計が共同開発したST-Bridge比較ツールで、以下の高度な機能を持ちます：

#### 重要度分類システム
- **高（High）**: 確定すべき共通情報（両ファイルで出力可能）
- **中（Medium）**: 確定すべき情報（片方のファイルのみ保持）
- **低（Low）**: 未確定情報
- **対象なし（Not Applicable）**: ID属性など比較不要な識別子

#### 許容差管理
- 座標比較における数値許容差設定
- 基準点とオフセット値の許容差管理
- プロジェクト段階に応じた柔軟な許容差調整

#### 高精度比較アルゴリズム
- StbNode: 節点座標の精密比較
- StbMember: 部材節点座標の許容差考慮比較
- StbSection: 部材符号と階による論理比較（ID/GUID非依存）

### 1.2 現在のSTB Diff Viewerの機能

#### XSDスキーマパーサー（`js/parser/xsdSchemaParser.js`）
- **基本機能**: XSD定義からの属性情報抽出
- **型検証**: xs:string、xs:double、xs:boolean等の基本型検証
- **必須属性チェック**: required/optional属性の判定
- **列挙値検証**: カスタム型の列挙値チェック

#### 現在の制限事項
- 重要度による優先順位付けなし
- 許容差設定の柔軟性不足
- プロジェクト段階考慮なし
- 業界固有の検証ルール不足

## 2. 統合可能性評価

### 2.1 技術的適合性

#### アーキテクチャ互換性
- **両ツール共通**: ST-Bridge v2.0.1対応
- **データ形式**: XML/STBファイル処理
- **統合点**: XSDスキーマ + 設定データによる拡張検証

#### 実装形態
```javascript
// 現在の基本検証
validateAttributeValue(elementType, attributeName, value)

// 拡張予定: 重要度・許容差考慮検証
validateAttributeValueEnhanced(elementType, attributeName, value, importanceLevel, tolerance, projectStage)
```

### 2.2 データ統合アプローチ

#### Phase 1: 設定データ構造の設計
```javascript
const enhancedValidationConfig = {
  importance: {
    "StbColumn.id": "none",           // ID属性は比較対象外
    "StbColumn.name": "high",         // 柱名称は高重要度
    "StbColumn.X": "high",            // 座標は高重要度
    "StbColumn.rotate": "medium",     // 回転角は中重要度
    "StbColumn.kind_structure": "low" // 構造種別は低重要度
  },
  tolerance: {
    coordinate: 0.1,      // 座標許容差（mm）
    rotation: 0.001,      // 回転角許容差（rad）
    dimension: 0.5        // 寸法許容差（mm）
  },
  projectStages: {
    "schematic": { coordinate: 10.0, dimension: 5.0 },
    "detailed": { coordinate: 1.0, dimension: 1.0 },
    "construction": { coordinate: 0.1, dimension: 0.1 }
  }
};
```

#### Phase 2: 検証ロジック拡張
```javascript
class EnhancedSTBValidator {
  constructor(config) {
    this.importanceConfig = config.importance;
    this.toleranceConfig = config.tolerance;
    this.projectStage = config.currentStage || 'detailed';
  }

  validateElement(elementType, attributes, comparisonContext = null) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      importance: this.getElementImportance(elementType)
    };

    // 基本XSD検証
    const basicValidation = validateElement(elementType, attributes);
    
    // 重要度による検証レベル調整
    const enhancedValidation = this.applyImportanceRules(
      elementType, 
      attributes, 
      basicValidation
    );

    // 許容差考慮検証（比較時）
    if (comparisonContext) {
      const toleranceValidation = this.applyToleranceRules(
        elementType,
        attributes,
        comparisonContext
      );
      return this.mergeValidationResults([
        basicValidation,
        enhancedValidation,
        toleranceValidation
      ]);
    }

    return this.mergeValidationResults([basicValidation, enhancedValidation]);
  }
}
```

## 3. 実装計画

### 3.1 Phase 1: 基盤整備（2-3週間）

#### 設定データ構造の設計・実装
- **ファイル**: `js/parser/enhancedValidationConfig.js`
- **内容**: 重要度・許容差設定のJSON定義
- **目標**: STB-DiffCheckerのルールを移植

#### 拡張バリデーターの開発
- **ファイル**: `js/parser/enhancedSTBValidator.js`
- **機能**: 
  - 重要度別検証レベル
  - 許容差考慮比較
  - プロジェクト段階別設定

### 3.2 Phase 2: コア機能統合（3-4週間）

#### 既存パーサーとの統合
```javascript
// js/parser/stbXmlParser.js への拡張
import { EnhancedSTBValidator } from './enhancedSTBValidator.js';
import { loadValidationConfig } from './enhancedValidationConfig.js';

export async function parseElementsEnhanced(xmlDoc, validationLevel = 'standard') {
  const config = await loadValidationConfig();
  const validator = new EnhancedSTBValidator(config);
  
  // 既存のparseElements処理 + 拡張検証
  const elements = parseElements(xmlDoc);
  
  return elements.map(element => ({
    ...element,
    validation: validator.validateElement(element.type, element.attributes),
    importance: validator.getElementImportance(element.type)
  }));
}
```

#### UI拡張
- **要素情報表示**: 重要度・検証レベル表示
- **比較結果**: 許容差内/許容差外の色分け表示
- **設定パネル**: プロジェクト段階・許容差設定UI

### 3.3 Phase 3: 高度機能実装（2-3週間）

#### STB-DiffChecker互換比較ロジック
```javascript
// js/comparator.js の拡張
export function compareElementsEnhanced(elementA, elementB, config) {
  const validator = new EnhancedSTBValidator(config);
  
  // 基本比較
  const basicComparison = compareElements(elementA, elementB);
  
  // 重要度別比較
  const importanceLevel = validator.getElementImportance(elementA.type);
  if (importanceLevel === 'none') {
    return { ...basicComparison, comparisonType: 'skipped', reason: 'not_applicable' };
  }
  
  // 許容差比較
  const toleranceComparison = validator.compareWithTolerance(
    elementA, 
    elementB, 
    config.tolerance
  );
  
  return {
    ...basicComparison,
    enhancedResult: toleranceComparison,
    importance: importanceLevel,
    withinTolerance: toleranceComparison.withinTolerance
  };
}
```

#### 設定ファイル外部化
```javascript
// config/validation-rules.json
{
  "version": "1.0",
  "basedOn": "STB-DiffChecker",
  "importance": {
    "StbNode": {
      "id": "none",
      "X": "high",
      "Y": "high", 
      "Z": "high"
    },
    "StbColumn": {
      "id": "none",
      "name": "high",
      "id_node_bottom": "high",
      "id_node_top": "high",
      "rotate": "medium",
      "kind_structure": "low"
    }
  },
  "tolerance": {
    "coordinate": 0.1,
    "rotation": 0.001,
    "dimension": 0.5
  },
  "projectStages": {
    "schematic": { "coordinate": 10.0 },
    "detailed": { "coordinate": 1.0 },
    "construction": { "coordinate": 0.1 }
  }
}
```

## 4. 期待される効果

### 4.1 検証精度の向上
- **重要度別検証**: プロジェクト段階に応じた適切な検証レベル
- **許容差管理**: 実用的な数値比較（完全一致不要）
- **業界標準準拠**: 日本の建築業界で実証済みのルール適用

### 4.2 ユーザビリティ向上
- **段階的検証**: 設計初期段階では緩い検証、詳細設計では厳密検証
- **視覚化改善**: 重要度・許容差による色分け表示
- **エラー分類**: 致命的エラー vs 警告の明確な分離

### 4.3 実用性向上
- **プロジェクト管理**: 段階別品質管理の実現
- **互換性**: STB-DiffCheckerユーザーとの設定互換
- **カスタマイズ性**: プロジェクト固有のルール設定可能

## 5. 技術的課題と対策

### 5.1 パフォーマンス影響
- **課題**: 検証処理の複雑化による処理速度低下
- **対策**: 
  - 重要度による検証レベルの最適化
  - WebWorkerによる非同期処理
  - キャッシュ機能の強化

### 5.2 設定管理の複雑化
- **課題**: 多様な設定項目による管理複雑性
- **対策**:
  - デフォルト設定の提供
  - 設定テンプレートの事前定義
  - UI上での簡単設定モード

### 5.3 既存機能との整合性
- **課題**: 既存のスキーマチェック機能との統合
- **対策**:
  - 段階的移行（従来機能は残存）
  - 設定による機能切り替え
  - 十分なテストカバレッジ

## 6. 結論

STB-DiffCheckerの設定データとロジックの流用は**高い実現可能性**があり、以下の理由で推奨されます：

### 6.1 技術的優位性
- 実証済みの業界標準ルール
- ST-Bridge仕様への完全準拠
- 段階的実装による低リスク

### 6.2 実用的価値
- プロジェクト段階に応じた柔軟な検証
- 日本の建築業界慣行への適合
- 既存ツールとの互換性

### 6.3 投資対効果
- **開発期間**: 7-10週間（段階的実装）
- **技術的リスク**: 低（既存実装の参照可能）
- **ユーザー価値**: 高（実用的な検証機能）

この提案により、STB Diff Viewerは単なるモデル比較ツールから、**プロフェッショナル級のST-Bridge品質管理システム**へと進化できます。

## 7. 次のステップ

1. **Phase 1開始**: 設定データ構造の詳細設計
2. **STB-DiffCheckerソース解析**: 具体的なルール抽出
3. **プロトタイプ開発**: 重要度分類機能の実装検証
4. **ユーザーフィードバック**: 業界関係者からの要求仕様確認

---

**文書作成日**: 2025-01-26  
**対象システム**: STB Diff Viewer  
**参照**: NS-NS/STB-DiffChecker  
**ステータス**: 提案・検討段階