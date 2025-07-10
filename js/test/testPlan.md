# STB Diff Viewer テスト計画書

## 概要

STB Diff Viewerの品質保証と継続的改善のための包括的テスト計画を定義します。

## テスト戦略

### 1. テストレベル分類

| レベル | 目的 | 範囲 | 実行頻度 |
|--------|------|------|----------|
| **単体テスト** | 個別関数・クラスの動作検証 | 関数・メソッド単位 | コード変更時 |
| **統合テスト** | モジュール間連携の検証 | モジュール間インターフェース | リリース前 |
| **E2Eテスト** | ユーザーワークフローの検証 | アプリケーション全体 | 週次 |
| **パフォーマンステスト** | 性能・メモリ使用量の検証 | 重要処理のボトルネック | 月次 |
| **回帰テスト** | 既知バグの再発防止 | 過去の不具合箇所 | リリース前 |

### 2. テスト優先度

| 優先度 | 対象機能 | 説明 |
|--------|----------|------|
| **P0 (Critical)** | ファイル読み込み、モデル比較、3D表示 | 基本機能の動作 |
| **P1 (High)** | 要素選択、情報表示、UI制御 | 主要ユーザー操作 |
| **P2 (Medium)** | エクスポート、表示設定、ラベル制御 | 付加機能 |
| **P3 (Low)** | 編集機能、デバッグ機能 | 開発者向け機能 |

## 機能別テスト詳細

### 3.1 モデル読み込み・比較機能 (P0)

#### 3.1.1 ファイル読み込みテスト

```javascript
// テストケース例
const fileLoadingTests = [
  {
    name: 'Valid STB file loading',
    input: 'valid_stb_file.stb',
    expected: 'success',
    priority: 'P0'
  },
  {
    name: 'Invalid XML format handling',
    input: 'invalid_xml.stb',
    expected: 'error_with_message',
    priority: 'P0'
  },
  {
    name: 'Large file processing',
    input: 'large_model_10mb.stb', 
    expected: 'success_within_30s',
    priority: 'P1'
  }
];
```

#### 3.1.2 モデル比較テスト

| テストシナリオ | 入力 | 期待結果 | 優先度 |
|----------------|------|----------|--------|
| 同一モデル比較 | ModelA = ModelB | 全要素が一致として表示 | P0 |
| 部分差分比較 | 一部要素が異なるモデル | 差分が正確に検出・表示 | P0 |
| 要素数違い比較 | 要素数が大幅に異なるモデル | onlyA/onlyBが正確に分類 | P1 |
| 空モデル比較 | 空のSTBファイル | エラーハンドリング | P1 |

#### 3.1.3 XML解析テスト

```javascript
const xmlParsingTests = [
  // 名前空間処理
  {
    scenario: 'Namespace handling',
    input: 'stb_with_multiple_namespaces.xml',
    verify: 'correct_element_extraction'
  },
  
  // エンコーディング処理
  {
    scenario: 'Encoding detection',
    input: 'stb_shift_jis.xml',
    verify: 'japanese_characters_display_correctly'
  },
  
  // スキーマ準拠性
  {
    scenario: 'Schema compliance',
    input: 'stb_v2.0.2_compliant.xml',
    verify: 'all_elements_parsed_correctly'
  }
];
```

### 3.2 3D表示・レンダリング機能 (P0)

#### 3.2.1 基本レンダリングテスト

| 機能 | テスト項目 | 検証方法 | 優先度 |
|------|------------|----------|--------|
| 初期化 | Three.jsシーン作成 | レンダラー初期化確認 | P0 |
| カメラ制御 | マウス操作応答 | OrbitControls動作確認 | P0 |
| 要素描画 | 全要素タイプ表示 | 各要素の3Dメッシュ生成確認 | P0 |
| マテリアル | 色分け表示 | common/onlyA/onlyBの色分け | P1 |

#### 3.2.2 ジオメトリ生成テスト

```javascript
const geometryTests = [
  // 柱形状生成
  {
    elementType: 'Column',
    section: 'RC_400x400',
    expected: 'box_geometry_with_correct_dimensions'
  },
  
  // 梁形状生成  
  {
    elementType: 'Girder',
    section: 'S_H400x200x8x13',
    expected: 'h_shaped_extrusion'
  },
  
  // スラブ形状生成
  {
    elementType: 'Slab',
    nodes: ['N1', 'N2', 'N3', 'N4'],
    expected: 'planar_polygon_with_thickness'
  }
];
```

#### 3.2.3 パフォーマンステスト

```javascript
const performanceTests = [
  {
    name: 'Large model rendering',
    modelSize: '1000+ elements',
    metrics: ['fps', 'memory_usage', 'initialization_time'],
    thresholds: {
      fps: '>= 30',
      memory: '<= 500MB', 
      init_time: '<= 10s'
    }
  }
];
```

### 3.3 UI・インタラクション機能 (P1)

#### 3.3.1 要素選択テスト

| 操作 | 期待結果 | テスト方法 | 優先度 |
|------|----------|------------|--------|
| 要素クリック | 要素情報パネル表示 | 自動クリック＋DOM確認 | P1 |
| 情報パネル内容 | 正確な属性値表示 | XMLデータと照合 | P1 |
| 複数要素選択 | A/B比較表示 | 比較表形式確認 | P1 |

#### 3.3.2 表示制御テスト

```javascript
const displayControlTests = [
  // 表示/非表示切り替え
  {
    control: 'Element visibility toggle',
    actions: ['toggle_column', 'toggle_girder', 'toggle_all'],
    verify: 'scene_object_visibility_state'
  },
  
  // 表示モード切り替え
  {
    control: 'View mode switching',
    modes: ['solid', 'wireframe', 'line'],
    verify: 'material_and_geometry_changes'
  },
  
  // ラベル制御
  {
    control: 'Label display',
    elements: ['Node', 'Column', 'Girder'],
    verify: 'label_visibility_and_positioning'
  }
];
```

#### 3.3.3 色付けモードテスト

| モード | 説明 | 検証項目 | 優先度 |
|--------|------|----------|--------|
| DIFF | 差分による色分け | common/onlyA/onlyB色表示 | P1 |
| STORY | 階による色分け | 階ごとの色分けパターン | P2 |
| MATERIAL | 材料による色分け | RC/S/SRC別色表示 | P2 |

### 3.4 データエクスポート機能 (P2)

#### 3.4.1 STBエクスポートテスト

```javascript
const exportTests = [
  {
    scenario: 'Modified STB export',
    modifications: ['change_column_section', 'add_element'],
    verify: ['valid_xml_output', 'modifications_reflected', 'schema_compliance']
  },
  
  {
    scenario: 'Comparison result export', 
    export_type: 'comparison_report',
    verify: ['diff_summary', 'element_lists', 'statistics']
  }
];
```

### 3.5 エラーハンドリング・バリデーション (P1)

#### 3.5.1 異常系テスト

| エラーケース | 入力 | 期待動作 | 優先度 |
|--------------|------|----------|--------|
| 不正XMLファイル | 破損したSTBファイル | エラーメッセージ表示 | P1 |
| ネットワークエラー | XSDスキーマ読み込み失敗 | フォールバックモード | P2 |
| メモリ不足 | 超大型モデル読み込み | 適切なエラー処理 | P2 |
| ブラウザ非対応 | 古いブラウザでの実行 | 互換性警告表示 | P3 |

## テスト自動化

### 4.1 自動テスト実行

```bash
# 全テスト実行
npm run test

# カテゴリ別実行
npm run test:unit
npm run test:integration  
npm run test:e2e
npm run test:performance
npm run test:regression

# 継続的実行
npm run test:watch
```

### 4.2 ブラウザ内実行

```javascript
// ブラウザコンソールから実行
window.testSuite.run()                    // 全テスト
window.testSuite.runUnit()               // 単体テスト
window.testSuite.runIntegration()        // 統合テスト
window.testSuite.runE2E()               // E2Eテスト
window.testSuite.runPerformance()       // パフォーマンステスト
window.testSuite.runRegression()        // 回帰テスト

// サンプルデータテスト
window.stbSamples.testAll()             // 全サンプルファイルテスト
window.stbSamples.testGirder()          // 大梁問題テスト
window.stbSamples.quick()               // クイックテスト
```

## テストデータ管理

### 5.1 サンプルファイル

| ファイル名 | 用途 | 要素数 | 特徴 |
|------------|------|--------|------|
| `RC+S_testmodel_3.stb` | 基本機能テスト | 中規模 | RC+S混合構造 |
| `RCサンプルv202_20250618.stb` | RC構造テスト | 小規模 | RC専用 |
| `Sサンプルv202_20250618.stb` | S構造テスト | 小規模 | S専用 |
| `S梁全パターン_SS7.stb` | 梁形状テスト | 梁特化 | 全梁パターン |
| `minimal_test.stb` | 最小テスト | 最小 | 基本要素のみ |

### 5.2 テストデータ生成

```javascript
// 動的テストデータ生成
const testDataGenerator = {
  generateMinimalSTB: () => { /* 最小STBデータ */ },
  generateLargeModel: (elementCount) => { /* 大型モデル */ },
  generateErrorCase: (errorType) => { /* エラーケース */ }
};
```

## 品質メトリクス

### 6.1 テストカバレッジ目標

| 機能カテゴリ | 目標カバレッジ | 現在値 | 期限 |
|--------------|----------------|--------|------|
| コア機能 (P0) | 95% | - | Phase 1 |
| 主要UI (P1) | 85% | - | Phase 2 |
| 付加機能 (P2) | 70% | - | Phase 3 |
| 開発者機能 (P3) | 50% | - | Phase 4 |

### 6.2 パフォーマンス目標

| メトリクス | 目標値 | 計測方法 |
|------------|--------|----------|
| 初期化時間 | < 3秒 | performance.now() |
| モデル読み込み時間 | < 10秒 (中規模) | ファイル選択→表示完了 |
| フレームレート | >= 30 FPS | requestAnimationFrame計測 |
| メモリ使用量 | < 500MB | performance.memory |

### 6.3 品質ゲート

リリース前に満たすべき条件：

1. **P0テスト**: 100%パス
2. **P1テスト**: 95%以上パス  
3. **回帰テスト**: 100%パス
4. **パフォーマンステスト**: 全項目が目標値内
5. **手動テスト**: 主要ワークフローの確認

## テスト実施スケジュール

### Phase 1: 基盤テスト整備 (Week 1-2)
- [ ] 単体テストフレームワーク構築
- [ ] サンプルデータ整備
- [ ] P0機能のテストケース作成・実行

### Phase 2: 統合テスト実装 (Week 3-4)  
- [ ] モジュール間連携テスト
- [ ] UIインタラクションテスト
- [ ] P1機能のテストカバレッジ向上

### Phase 3: E2E・パフォーマンステスト (Week 5-6)
- [ ] ユーザーワークフローの自動化
- [ ] パフォーマンス計測・最適化
- [ ] P2機能のテスト実装

### Phase 4: 継続的品質改善 (Week 7+)
- [ ] CI/CDパイプライン構築
- [ ] 回帰テストの自動実行
- [ ] 品質メトリクス監視

## 成功基準

プロジェクト成功の指標：

1. **機能品質**: 全P0・P1機能が安定動作
2. **性能品質**: 目標パフォーマンス指標の達成
3. **保守性**: 新機能追加時のテスト容易性
4. **開発効率**: バグ検出・修正サイクルの短縮
5. **ユーザー満足度**: 実際の使用場面での動作安定性

この包括的テスト計画により、STB Diff Viewerの品質と信頼性を確保し、継続的な改善サイクルを確立します。