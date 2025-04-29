# STB Diff Viewer

## 概要

STB Diff Viewer は、STB および XML 形式で保存された 3D モデルを比較するために設計された Web アプリケーションです。2 つのモデル間の違いと類似点を視覚化し、モデル比較のためのユーザーフレンドリーなインターフェースを提供します。

## プロジェクト構成

```Folder
stb-diff-viewer/
├── js/                      # (旧 modules)
│   ├── main.js              # アプリケーションエントリーポイント
│   ├── ui.js                # UI関連
│   ├── comparator.js        # 比較ロジック
│   ├── parser/              # STB/XML パース関連
│   │   ├── stbXmlParser.js      # (旧 stbParser.js) 基本XMLパース、基本情報抽出
│   │   └── stbStructureReader.js# (旧 stbReader.js) 詳細構造データ抽出
│   └── viewer/              # Three.js ビューア関連
│       ├── index.js         # (旧 viewer.js) ビューアモジュールの集約・エクスポート
│       ├── core.js          # (旧 viewer-core.js) コア要素 (シーン、カメラ等)
│       ├── elements.js      # (旧 viewer-elements.js) 要素描画
│       ├── labels.js        # (旧 viewer-labels.js) ラベル管理
│       ├── layout.js        # (旧 viewer-layout.js) 通り芯・階描画
│       ├── materials.js     # (旧 viewer-materials.js) マテリアル定義
│       ├── utils.js         # (旧 viewer-utils.js) ビューアユーティリティ
│       ├── geometryGenerator.js # (旧 viewer-geometryGenerator.js) 3Dジオメトリ生成
│       └── elementInfoDisplay.js# (旧 viewer-elementInfoDisplay.js) 要素情報表示
├── index.html
├── style.css
└── README.md
```

## セットアップ手順

1. **リポジトリのクローン**

    ```bash
    git clone https://github.com/key-o/stb-diff-viewer/
    cd stb-diff-viewer
    ```

2. **プロジェクトを開く**
    Web ブラウザで `index.html` を開いてアプリケーションを実行します。

3. **ファイルアップロード**
    ファイル入力フィールドを使用して、比較する 2 つのモデル (STB または XML 形式) をアップロードします。

## 利用ガイドライン

- チェックボックスを使用して比較したい要素を選択します。
- 「モデルを表示/比較」ボタンを使用して比較を開始します。
- 提供されているドロップダウンとボタンを使用して、階クリッピングや軸クリッピングを調整します。
- 凡例パネルを切り替えて、モデルの違いの色分けを表示します。

## コントリビューション

貢献を歓迎します！機能強化やバグ修正については、プルリクエストを送信するか、Issue をオープンしてください。

## ライセンス

このプロジェクトは MIT ライセンスの下でライセンスされています。詳細については、LICENSE ファイルを参照してください。
