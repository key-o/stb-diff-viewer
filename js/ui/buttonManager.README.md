# ButtonManager - ボタン統一管理システム

## 概要

ButtonManagerは、アプリケーション内のボタン生成とスタイルを統一的に管理するためのクラスです。
FloatingWindowManagerと同様の設計パターンを採用し、一貫性のあるUI/UXを提供します。

## ボタンの種類とルール

### 1. プライマリボタン (primary)
- **用途**: 主要なアクション（比較実行、保存など）
- **色**: 青色 (#007bff)
- **使用例**: 比較ボタン、確定ボタン

### 2. セカンダリボタン (secondary)
- **用途**: 二次的なアクション
- **色**: グレー (#6c757d)
- **使用例**: キャンセルボタン

### 3. トグルボタン (toggle)
- **用途**: オン/オフの切り替え
- **色**: 通常時はライトグレー、アクティブ時は青色
- **使用例**: 表示/非表示の切り替え

### 4. 閉じるボタン (close)
- **用途**: ウィンドウやパネルを閉じる
- **色**: 透明背景
- **アイコン**: ×
- **使用例**: フローティングウィンドウの閉じるボタン

### 5. 適用ボタン (apply)
- **用途**: 設定の適用
- **色**: 緑色 (#28a745)
- **使用例**: クリッピング適用ボタン

### 6. クリアボタン (clear)
- **用途**: リセット、削除
- **色**: 赤色 (#dc3545)
- **使用例**: クリッピング解除ボタン

### 7. ビュー切り替えボタン (view)
- **用途**: カメラビューの切り替え
- **色**: ライトグレー、アクティブ時は青色
- **使用例**: 正面、側面、上面ビューボタン

### 8. 小さいボタン (small)
- **用途**: スペースが限られた場所での操作
- **サイズ**: 通常より小さい
- **使用例**: 色リセットボタン

### 9. カスタムファイルボタン (customFile)
- **用途**: ファイル選択
- **色**: 青色
- **使用例**: STBファイル選択ボタン

### 10. リセットボタン (reset)
- **用途**: デフォルト値への復元
- **色**: 黄色 (#ffc107)
- **使用例**: デフォルト色に戻すボタン

## 使用方法

### 基本的な使い方

```javascript
import { buttonManager } from './ui/buttonManager.js';

// シンプルなボタンを作成
const button = buttonManager.createButton({
  type: 'primary',
  text: '比較実行',
  icon: '🔍',
  onClick: () => console.log('Clicked!'),
  ariaLabel: '比較を実行',
  title: 'モデルAとBを比較します'
});

// DOMに追加
document.getElementById('container').appendChild(button);

// ボタンを登録して管理
buttonManager.registerButton('compare-btn', button);
```

### トグルボタンの作成

```javascript
const toggleButton = buttonManager.createToggleButton({
  text: '表示',
  active: false,
  onToggle: (isActive) => {
    console.log('Toggle state:', isActive);
  },
  ariaLabel: 'パネル表示の切り替え'
});

// アクティブ状態を取得
console.log(toggleButton.getActive());

// アクティブ状態を設定
toggleButton.setActive(true);
```

### ボタングループの作成

```javascript
const buttonGroup = buttonManager.createButtonGroup({
  layout: 'horizontal', // または 'vertical'
  gap: '8px',
  buttons: [
    {
      type: 'view',
      text: '正面',
      dataset: { view: 'front' },
      onClick: () => setView('front')
    },
    {
      type: 'view',
      text: '側面',
      dataset: { view: 'side' },
      onClick: () => setView('side')
    },
    {
      type: 'view',
      text: '上面',
      dataset: { view: 'top' },
      onClick: () => setView('top')
    }
  ]
});

document.getElementById('view-controls').appendChild(buttonGroup);
```

### ボタンの管理

```javascript
// ボタンを取得
const button = buttonManager.getButton('compare-btn');

// ボタンの有効/無効を切り替え
buttonManager.setButtonEnabled('compare-btn', false);

// ボタンのテキストを更新
buttonManager.updateButtonText('compare-btn', '実行中...', '⏳');

// ボタンの登録を解除
buttonManager.unregisterButton('compare-btn');
```

## カスタマイズ

### カスタムスタイルの適用

```javascript
const customButton = buttonManager.createButton({
  type: 'primary',
  text: 'カスタム',
  customStyle: {
    backgroundColor: '#ff6b6b',
    borderRadius: '20px',
    fontSize: '1em'
  }
});
```

### ボタンタイプのカスタマイズ

```javascript
// グローバルにプライマリボタンのスタイルを変更
buttonManager.customizeButtonType('primary', {
  backgroundColor: '#0062cc',
  fontSize: '1em'
});
```

## ベストプラクティス

### 1. 一貫性のある使用
同じ目的のボタンには同じタイプを使用してください。
```javascript
// Good: 全ての適用ボタンで統一
const applyClipButton = buttonManager.createButton({ type: 'apply', text: '適用' });
const applyFilterButton = buttonManager.createButton({ type: 'apply', text: '適用' });

// Bad: 同じ目的で異なるタイプ
const applyClipButton = buttonManager.createButton({ type: 'apply', text: '適用' });
const applyFilterButton = buttonManager.createButton({ type: 'primary', text: '適用' });
```

### 2. アクセシビリティの確保
必ずaria-labelとtitleを設定してください。
```javascript
buttonManager.createButton({
  type: 'close',
  icon: '×',
  ariaLabel: 'パネルを閉じる',
  title: 'このパネルを閉じます'
});
```

### 3. 適切なアイコンの使用
アイコンを使用する場合は、絵文字または適切なアイコンフォントを使用してください。
```javascript
// 絵文字を使用
buttonManager.createButton({
  type: 'primary',
  icon: '🔍',
  text: '検索'
});
```

### 4. イベントハンドラの登録
イベントハンドラは createButton の onClick パラメータで指定してください。
```javascript
// Good
buttonManager.createButton({
  type: 'primary',
  text: '実行',
  onClick: () => executeAction()
});

// Bad (後からaddEventListenerを使用)
const button = buttonManager.createButton({ type: 'primary', text: '実行' });
button.addEventListener('click', () => executeAction());
```

## 既存コードからの移行例

### Before (既存のHTML)
```html
<button id="compareButton" class="btn-primary compare-button">
  比較実行
</button>
```

### After (ButtonManager使用)
```javascript
const compareButton = buttonManager.createButton({
  type: 'primary',
  text: '比較実行',
  id: 'compareButton',
  onClick: handleCompare,
  ariaLabel: 'モデルAとBを比較',
  title: 'モデルAとBの構造比較を実行します'
});

document.getElementById('button-container').appendChild(compareButton);
buttonManager.registerButton('compare', compareButton);
```

## まとめ

ButtonManagerを使用することで:
- ✅ 一貫性のあるボタンスタイル
- ✅ 簡単なボタン管理
- ✅ アクセシビリティの向上
- ✅ メンテナンス性の向上

が実現できます。
