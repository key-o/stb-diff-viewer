# STB読み込み共通カーネル（stb-import-kernel）

ST-Bridge（STB）XMLの読み込み・解析・抽出を行う**アプリケーション非依存の共通サブプロジェクト**。
StbDiffViewer（SDV）と MatrixCalc（MC）で共有することを目的とする。
詳細な統一計画は `docs/plans/stb-import-unification.md` を参照。

## 設計原則

1. **自己完結**: このディレクトリ外のモジュールを import しない
   （アプリ固有の設定・ロガーは DI で注入する）
2. **アプリ非依存**: ブラウザ／Node.js のどちらでも動作する
   （DOMParser 互換の Document を受け取る前提）
3. **レイヤー上の位置づけ**: 外部ライブラリ相当（Layer 0 の constants/config より
   さらに下位）。アプリのどのレイヤーからも import 可能で、逆方向は禁止

## ディレクトリ構成

```
import/
├── index.js                 # 公開API（バレル）
├── config/
│   ├── kernelConfig.js      # DI受け口（setSectionConfig / setLoggerFactory）
│   └── sectionConfig.js     # デフォルトの断面抽出設定（SECTION_CONFIG）
├── constants/
│   ├── stbTagNames.js       # STBタグ名定数（STB_TAG_NAMES）
│   ├── sectionTypes.js      # 断面タイプ定数（SECTION_TYPE）
│   ├── attributeKeys.js     # 属性キー定義（寸法正規化用 SSOT）
│   └── importTypes.js       # インポーター共通型（SOURCE_TYPES等）
├── loader/
│   └── stbXmlLoader.js      # ファイル/URL読込（エンコーディング自動判別）
├── parser/
│   ├── stbXmlParser.js      # パーサー統合バレル
│   ├── stbParserCore.js     # コア（parseElements/buildNodeMap/parseStories/parseAxes）
│   ├── stbExtensions.js     # StbExtensions（SS7原典属性）読込
│   ├── stbSteelSectionParser.js
│   ├── stbLinearElementParser.js
│   ├── stbFoundationElementParser.js
│   ├── stbPanelElementParser.js
│   ├── jsonSchemaLoader.js / xsdSchemaParser.js / xsdSchemaQueryApi.js / xsdTypeResolver.js
│   └── utils/
│       ├── stbVersionDetection.js  # バージョン検出（2.0.2 / 2.1.0 / 2.1.1）
│       └── versionDetector.js
├── extractor/
│   ├── sectionExtractor.js  # 統一断面抽出エンジン（extractAllSections）
│   ├── dimensionExtractors.js / steelFigureExtractors.js
│   ├── barArrangementExtractors.js  # RC配筋抽出（追加API・未配線）
│   ├── SectionShapeProcessor.js / StbCalDataExtractor.js / defaultSectionExtractor.js
│   └── utils/coordinateRangeCalculator.js
├── section/
│   └── sectionTypeUtil.js   # 断面タイプ判定ユーティリティ
├── repair/
│   └── stbRepairEngine.js   # STB修復エンジン（オプトイン。setValidatorFunctions でDI）
└── data/
    ├── dimensionNormalizer.js        # 寸法データ正規化（属性マップベース）
    └── steelDimensionNormalizers.js  # 鋼材寸法のテーブル駆動正規化（shapeName系）
```

## 依存性注入（DI）

アプリ側のセットアップモジュールで注入する（MatrixCalc の `stb-parser-setup.js` と同じ思想）。

```javascript
import { setSectionConfig, setLoggerFactory } from './common-stb/import/index.js';

// ロガー注入（namespace を受け取りロガーを返すファクトリ）
setLoggerFactory(createLogger);

// 断面抽出設定の上書き（省略時はカーネル同梱の sectionConfig.js を使用）
setSectionConfig(MY_SECTION_CONFIG);
```

- SDV側セットアップ: `js/app/initialization/stbKernelSetup.js`（main.js が副作用 import）
- 未注入時のデフォルト: ロガーは console ベース（warn/error のみ）、
  断面設定はカーネル同梱の `config/sectionConfig.js`

## MatrixCalc への展開（統一計画フェーズ3）

MC 側は `common/stb/parser/` をこのカーネルで置き換える。
`parseAxes` の戻り値形状・`extractAllSections` の結果キーの差異に注意
（`docs/plans/stb-import-unification.md` の互換性リスク表を参照）。
