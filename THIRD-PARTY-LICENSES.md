# THIRD-PARTY LICENSES

このファイルは `stb-diff-viewer` フォルダ内で実行時に読み込まれる（公開される）サードパーティライブラリの一覧と、そのライセンス情報を示します。

- Three.js (r160)
  - ライセンス: MIT
  - リポジトリ: https://github.com/mrdoob/three.js/
  - npm: https://www.npmjs.com/package/three

- camera-controls (v3.1.0)
  - ライセンス: MIT
  - CDN: https://unpkg.com/camera-controls@3.1.0/
  - npm: https://www.npmjs.com/package/camera-controls

- dxf-parser (v1.1.2)
  - ライセンス: MIT
  - CDN: https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/
  - npm: https://www.npmjs.com/package/dxf-parser

注意:
- この一覧は `stb-diff-viewer` フォルダのランタイム依存に限定しており、開発にのみ使用する devDependencies（例: `playwright`, `jsdom` 等）は含めていません。devDependencies を含めた完全なライセンス一覧が必要な場合は、リポジトリルートで `npm install` を行った後、`npx license-checker` 等を利用して生成してください。

自動生成コマンド例（ローカル環境）:

```bash
npm install
npx license-checker --production --json > third-party-licenses.json
```

- ライセンス原文や NOTICE が必要な場合は、上記の npm / リポジトリリンクからライセンス原文を取得して同梱してください。

## ライセンス原文

以下のライブラリはすべて MIT ライセンスの下で公開されています。配布物に同梱する場合は、必ず MIT ライセンス本文（下記）を添付してください。


### ライセンス全文（MIT）

以下は、`stb-diff-viewer` ランタイムライブラリのライセンス（MIT）の全文です。個別ライブラリの著作権表記はそれぞれに従い、配布時は本節と該当ライブラリの著作権表記を同梱してください。

--------------------------------------------------------------------
MIT License

Copyright (c) [ライブラリ著作権者]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

--------------------------------------------------------------------

個別ライセンス原文および正確な著作権表示は以下を参照してください。

- **Three.js** (r160) - https://github.com/mrdoob/three.js/blob/master/LICENSE
  - 著作権表記（リファレンス）: Copyright (c) 2010-2025 three.js authors

- **camera-controls** (v3.1.0) - https://github.com/yomotsu/camera-controls/blob/master/LICENSE
  - 著作権表記（リファレンス）: Copyright (c) 2017 Yomotsu

- **dxf-parser** (v1.1.2) - https://github.com/gdsestimating/dxf-parser/blob/master/LICENSE
  - 著作権表記（リファレンス）: Copyright (c) Ben Zuill-Smith / GDS Storefront Estimating

注意: ここで示す著作権表記は公開リポジトリのLICENSEによる参考表記です。正確な著作権年度や名前はリポジトリの LICENSE 原文を参照して下さい。

もし、配布物に `camera-controls` のようなライブラリを CDN から参照せず同梱する場合は、パッケージが提供する `LICENSE` や `NOTICE` を個別に同梱して下さい。
