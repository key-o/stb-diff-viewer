# 🚀 STB Diff Viewer デプロイメントガイド

## 📋 環境別ファイル構成

### 🏭 **本番環境 (Production)**

#### **含めるファイル:**
```
index.html                    # メインアプリケーション（テスト機能なし）
js/                          # 全JavaScriptモジュール
├── main.js                  # エントリーポイント
├── viewer/                  # 3D表示機能
├── parser/                  # XML解析機能
├── ui/                      # UI制御機能
├── core/                    # コア機能
└── exporter/               # エクスポート機能
style/                       # CSS
sampleStb/                   # サンプルファイル（任意）
schemas/                     # XSDスキーマ
```

#### **除外するファイル:**
```
❌ test.html                 # テスト専用ページ
❌ js/test/                  # テストモジュール
❌ debug_*.html              # デバッグページ
❌ run_tests.js              # Node.js テストスクリプト
❌ .eslintrc.js              # 開発用設定
```

#### **本番用index.html修正:**
```html
<!-- 開発者向けリンクを削除 -->
<!-- 
<div id="dev-tools">
  <a href="test.html">🧪 Tests</a>
</div>
-->
```

### 🔧 **開発環境 (Development)**

#### **含める全ファイル:**
```
index.html                   # メインアプリケーション
test.html                    # テスト専用ページ ⭐
js/                         # 全モジュール
├── test/                   # テストモジュール ⭐
│   ├── comprehensiveTestSuite.js
│   ├── testRunner.js
│   └── sampleDataLoader.js
├── utils/                  # ユーティリティ
│   └── codeStandards.js    # 標準化ツール ⭐
.eslintrc.js                # ESLint設定 ⭐
run_tests.js                # Node.js テスト ⭐
```

### 🧪 **テスト環境 (Testing)**

#### **テスト専用構成:**
```
test.html                   # テスト専用インターフェース
js/test/                    # 全テストモジュール
js/                         # メインアプリケーション（テスト対象）
```

## 🎯 使用方法

### **本番環境 (エンドユーザー向け)**
```bash
# シンプルなHTTPサーバーで起動
python -m http.server 8000
# または
npx serve .

# アクセス
http://localhost:8000
```

### **開発環境 (開発者向け)**
```bash
# 開発サーバー起動
python -m http.server 8000

# メインアプリケーション
http://localhost:8000

# テスト環境
http://localhost:8000/test.html

# 自動テスト実行
http://localhost:8000/test.html?auto=true
```

### **品質保証/テスト環境**
```bash
# Node.js環境でのテスト実行
node run_tests.js

# ブラウザでのテスト実行
http://localhost:8000/test.html

# ESLintコード品質チェック
npx eslint js/ --fix
```

## 📊 各環境の特徴

### 🏭 **本番環境の特徴**
- **軽量**: テスト機能を含まない最小構成
- **高速**: 必要最小限のファイル読み込み
- **セキュア**: デバッグ機能やテスト機能を露出しない
- **ユーザーフレンドリー**: シンプルで直感的なUI

### 🔧 **開発環境の特徴**
- **包括的**: 全ての開発ツールが利用可能
- **効率的**: 即座にテスト実行とデバッグが可能
- **品質保証**: ESLint、テストスイート完備
- **開発者フレンドリー**: 豊富なデバッグ情報

### 🧪 **テスト環境の特徴**
- **専門特化**: テスト実行に最適化されたUI
- **詳細分析**: 包括的なテスト結果とメトリクス
- **自動化**: ワンクリック・自動実行対応
- **CI/CD対応**: 継続的インテグレーション準備完了

## 🔧 デプロイメント手順

### **Step 1: 本番用ファイル準備**
```bash
# 本番用ディレクトリ作成
mkdir stb-diff-viewer-production
cd stb-diff-viewer-production

# 必要ファイルをコピー
cp ../index.html .
cp -r ../js ./js
cp -r ../style ./style
cp -r ../schemas ./schemas
cp -r ../sampleStb ./sampleStb  # オプション

# テスト関連ファイルを除外
rm -rf js/test
rm -rf js/utils/codeStandards.js  # オプション
```

### **Step 2: 本番用index.html修正**
```html
<!-- 開発者向けリンクを削除または条件付きで表示 -->
<!-- 
<div id="dev-tools" style="display: none;">
  <a href="test.html">🧪 Tests</a>
</div>
-->
```

### **Step 3: 本番環境テスト**
```bash
# 本番用ファイルでテスト
cd stb-diff-viewer-production
python -m http.server 8001

# 機能確認
# - ファイル読み込み
# - モデル比較
# - 3D表示
# - 要素選択
# - エクスポート
```

## 📈 品質管理

### **継続的品質管理**
```bash
# 開発時の品質チェック
npm run lint                # コード品質
npm run test               # 機能テスト
npm run test:performance   # パフォーマンステスト

# デプロイ前チェック
npm run test:production    # 本番環境テスト
npm run bundle:analyze     # バンドルサイズ分析
```

### **テスト自動化**
```javascript
// CI/CDパイプライン例
{
  "scripts": {
    "test": "node run_tests.js",
    "test:browser": "open test.html?auto=true",
    "lint": "eslint js/ --fix",
    "deploy:check": "npm run test && npm run lint"
  }
}
```

## 🎉 まとめ

**✅ 完璧な分離を実現:**

1. **本番環境**: クリーンで高速な本格アプリケーション
2. **開発環境**: 豊富なツールと包括的テスト機能
3. **テスト環境**: 専門的なテストインターフェース

**✅ 最適な開発体験:**
- 本番: `index.html` - ユーザー向け最適化
- 開発: `index.html` + `test.html` - 開発者向け機能
- テスト: `test.html` - テスト専門環境

この構成により、**業界標準のベストプラクティス**に従った適切な環境分離を実現しています。