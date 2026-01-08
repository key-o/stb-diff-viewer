/**
 * ButtonManager - ボタンの統一管理クラス
 *
 * このクラスは、アプリケーション内のボタン生成とスタイルを統一的に管理します。
 *
 * 主な機能:
 * - ボタンの種類別のスタイル定義
 * - ボタンの動的生成
 * - イベントハンドラの登録
 * - アクセシビリティ対応
 *
 * 使用例:
 * ```javascript
 * const manager = new ButtonManager();
 *
 * // ボタンの作成
 * const button = manager.createButton({
 *   type: 'primary',
 *   text: '比較実行',
 *   icon: '🔍',
 *   onClick: () => console.log('Clicked!'),
 *   ariaLabel: '比較を実行'
 * });
 *
 * // ボタンを登録して管理
 * manager.registerButton('compare-btn', button);
 * ```
 */
export class ButtonManager {
  constructor() {
    this.buttons = new Map();
    this.buttonTypes = this.defineButtonTypes();
  }

  /**
   * ボタンタイプとそのスタイル定義
   * @returns {Object} ボタンタイプの定義
   */
  defineButtonTypes() {
    return {
      // プライマリボタン (主要アクション)
      primary: {
        className: 'btn btn-primary',
        style: {
          backgroundColor: '#007bff',
          color: '#ffffff',
          border: '1px solid #007bff',
          padding: '8px 16px',
          borderRadius: '4px',
          fontSize: '0.9em',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
        hoverStyle: {
          backgroundColor: '#0056b3',
          borderColor: '#0056b3',
        },
      },

      // セカンダリボタン (二次的アクション)
      secondary: {
        className: 'btn btn-secondary',
        style: {
          backgroundColor: '#6c757d',
          color: '#ffffff',
          border: '1px solid #6c757d',
          padding: '8px 16px',
          borderRadius: '4px',
          fontSize: '0.9em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
        hoverStyle: {
          backgroundColor: '#5a6268',
          borderColor: '#545b62',
        },
      },

      // トグルボタン
      toggle: {
        className: 'btn btn-toggle',
        style: {
          backgroundColor: '#f8f9fa',
          color: '#495057',
          border: '1px solid #dee2e6',
          padding: '6px 12px',
          borderRadius: '4px',
          fontSize: '0.85em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
        activeStyle: {
          backgroundColor: '#007bff',
          color: '#ffffff',
          borderColor: '#007bff',
        },
        hoverStyle: {
          backgroundColor: '#e9ecef',
          borderColor: '#adb5bd',
        },
      },

      // 閉じるボタン
      close: {
        className: 'btn btn-close float-window-btn',
        style: {
          backgroundColor: 'transparent',
          color: '#6c757d',
          border: 'none',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '1.2em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          lineHeight: '1',
        },
        hoverStyle: {
          backgroundColor: '#e9ecef',
          color: '#495057',
        },
      },

      // 適用ボタン
      apply: {
        className: 'btn btn-apply',
        style: {
          backgroundColor: '#28a745',
          color: '#ffffff',
          border: '1px solid #28a745',
          padding: '6px 12px',
          borderRadius: '4px',
          fontSize: '0.85em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
        hoverStyle: {
          backgroundColor: '#218838',
          borderColor: '#1e7e34',
        },
      },

      // クリアボタン
      clear: {
        className: 'btn btn-clear',
        style: {
          backgroundColor: '#dc3545',
          color: '#ffffff',
          border: '1px solid #dc3545',
          padding: '6px 12px',
          borderRadius: '4px',
          fontSize: '0.85em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
        hoverStyle: {
          backgroundColor: '#c82333',
          borderColor: '#bd2130',
        },
      },

      // ビュー切り替えボタン
      view: {
        className: 'btn btn-view',
        style: {
          backgroundColor: '#f8f9fa',
          color: '#495057',
          border: '1px solid #dee2e6',
          padding: '6px 10px',
          borderRadius: '4px',
          fontSize: '0.8em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          minWidth: '60px',
        },
        activeStyle: {
          backgroundColor: '#007bff',
          color: '#ffffff',
          borderColor: '#007bff',
        },
        hoverStyle: {
          backgroundColor: '#e9ecef',
          borderColor: '#adb5bd',
        },
      },

      // 小さいボタン
      small: {
        className: 'btn btn-sm',
        style: {
          backgroundColor: '#f8f9fa',
          color: '#6c757d',
          border: '1px solid #dee2e6',
          padding: '4px 8px',
          borderRadius: '3px',
          fontSize: '0.75em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
        hoverStyle: {
          backgroundColor: '#e9ecef',
          borderColor: '#adb5bd',
        },
      },

      // カスタムファイルボタン
      customFile: {
        className: 'btn custom-file-btn',
        style: {
          backgroundColor: '#ffffff',
          color: '#212529',
          border: '1px solid #ccc',
          padding: '6px 12px',
          borderRadius: '4px',
          fontSize: '0.85em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
        hoverStyle: {
          backgroundColor: '#f1f3f5',
          borderColor: '#adb5bd',
        },
      },

      // リセットボタン
      reset: {
        className: 'btn btn-reset',
        style: {
          backgroundColor: '#ffc107',
          color: '#212529',
          border: '1px solid #ffc107',
          padding: '6px 12px',
          borderRadius: '4px',
          fontSize: '0.85em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        },
        hoverStyle: {
          backgroundColor: '#e0a800',
          borderColor: '#d39e00',
        },
      },
    };
  }

  /**
   * ボタンを作成する
   * @param {Object} config - ボタンの設定
   * @param {string} config.type - ボタンタイプ ('primary', 'secondary', 'toggle', など)
   * @param {string} [config.text] - ボタンテキスト
   * @param {string} [config.icon] - アイコン (絵文字またはクラス名)
   * @param {Function} [config.onClick] - クリックイベントハンドラ
   * @param {string} [config.ariaLabel] - アクセシビリティ用ラベル
   * @param {string} [config.title] - ツールチップテキスト
   * @param {boolean} [config.disabled] - 無効化状態
   * @param {Object} [config.customStyle] - カスタムスタイル
   * @param {string} [config.id] - ボタンのID
   * @param {Object} [config.dataset] - data-*属性
   * @returns {HTMLButtonElement} 作成されたボタン要素
   */
  createButton(config) {
    const {
      type = 'primary',
      text = '',
      icon = '',
      onClick = null,
      ariaLabel = '',
      title = '',
      disabled = false,
      customStyle = {},
      id = '',
      dataset = {},
    } = config;

    // ボタンタイプの定義を取得
    const buttonType = this.buttonTypes[type] || this.buttonTypes.primary;

    // ボタン要素を作成
    const button = document.createElement('button');
    button.type = 'button';
    button.className = buttonType.className;

    // IDを設定
    if (id) {
      button.id = id;
    }

    // スタイルを適用
    Object.assign(button.style, buttonType.style, customStyle);

    // テキストとアイコンを設定
    if (icon && text) {
      button.innerHTML = `${icon} ${text}`;
    } else if (icon) {
      button.innerHTML = icon;
    } else if (text) {
      button.textContent = text;
    }

    // アクセシビリティ属性を設定
    if (ariaLabel) {
      button.setAttribute('aria-label', ariaLabel);
    }
    if (title) {
      button.title = title;
    }

    // data-*属性を設定
    Object.entries(dataset).forEach(([key, value]) => {
      button.dataset[key] = value;
    });

    // 無効化状態を設定
    if (disabled) {
      button.disabled = true;
      button.style.opacity = '0.6';
      button.style.cursor = 'not-allowed';
    }

    // ホバー効果を追加
    if (buttonType.hoverStyle && !disabled) {
      button.addEventListener('mouseenter', () => {
        Object.assign(button.style, buttonType.hoverStyle);
      });
      button.addEventListener('mouseleave', () => {
        Object.assign(button.style, buttonType.style, customStyle);
      });
    }

    // クリックイベントを登録
    if (onClick) {
      button.addEventListener('click', onClick);
    }

    return button;
  }

  /**
   * トグルボタンを作成する (アクティブ/非アクティブの切り替え可能)
   * @param {Object} config - ボタンの設定
   * @param {boolean} [config.active] - 初期アクティブ状態
   * @param {Function} [config.onToggle] - トグル時のコールバック
   * @returns {HTMLButtonElement} 作成されたトグルボタン
   */
  createToggleButton(config) {
    const { active = false, onToggle = null, ...restConfig } = config;

    const button = this.createButton({
      ...restConfig,
      type: 'toggle',
      onClick: null, // 後で設定
    });

    // アクティブ状態を管理
    let isActive = active;
    const buttonType = this.buttonTypes.toggle;

    const updateState = () => {
      if (isActive) {
        Object.assign(button.style, buttonType.activeStyle);
        button.setAttribute('aria-pressed', 'true');
      } else {
        Object.assign(button.style, buttonType.style);
        button.setAttribute('aria-pressed', 'false');
      }
    };

    // 初期状態を設定
    updateState();

    // トグル機能を追加
    button.addEventListener('click', () => {
      isActive = !isActive;
      updateState();
      if (onToggle) {
        onToggle(isActive);
      }
    });

    // getActive メソッドを追加
    button.getActive = () => isActive;
    button.setActive = (state) => {
      isActive = state;
      updateState();
    };

    return button;
  }

  /**
   * ボタングループを作成する
   * @param {Object} config - グループの設定
   * @param {Array<Object>} config.buttons - ボタンの設定配列
   * @param {string} [config.layout] - レイアウト ('horizontal' または 'vertical')
   * @param {string} [config.gap] - ボタン間の間隔
   * @returns {HTMLDivElement} ボタングループのコンテナー
   */
  createButtonGroup(config) {
    const { buttons = [], layout = 'horizontal', gap = '8px' } = config;

    const container = document.createElement('div');
    container.className = 'button-group';
    container.style.display = 'flex';
    container.style.flexDirection = layout === 'vertical' ? 'column' : 'row';
    container.style.gap = gap;
    container.style.alignItems = 'center';

    buttons.forEach((buttonConfig) => {
      const button = this.createButton(buttonConfig);
      container.appendChild(button);
    });

    return container;
  }

  /**
   * ボタンを登録して管理する
   * @param {string} buttonId - ボタンの識別ID
   * @param {HTMLButtonElement} button - ボタン要素
   * @param {Object} [metadata] - ボタンのメタデータ
   */
  registerButton(buttonId, button, metadata = {}) {
    this.buttons.set(buttonId, {
      element: button,
      metadata: {
        createdAt: new Date(),
        ...metadata,
      },
    });
  }

  /**
   * 登録されたボタンを取得する
   * @param {string} buttonId - ボタンの識別ID
   * @returns {HTMLButtonElement|null} ボタン要素
   */
  getButton(buttonId) {
    const buttonInfo = this.buttons.get(buttonId);
    return buttonInfo ? buttonInfo.element : null;
  }

  /**
   * ボタンの登録を解除する
   * @param {string} buttonId - ボタンの識別ID
   */
  unregisterButton(buttonId) {
    this.buttons.delete(buttonId);
  }

  /**
   * ボタンの有効/無効を切り替える
   * @param {string} buttonId - ボタンの識別ID
   * @param {boolean} enabled - 有効化するかどうか
   */
  setButtonEnabled(buttonId, enabled) {
    const button = this.getButton(buttonId);
    if (button) {
      button.disabled = !enabled;
      button.style.opacity = enabled ? '1' : '0.6';
      button.style.cursor = enabled ? 'pointer' : 'not-allowed';
    }
  }

  /**
   * ボタンのテキストを更新する
   * @param {string} buttonId - ボタンの識別ID
   * @param {string} text - 新しいテキスト
   * @param {string} [icon] - 新しいアイコン
   */
  updateButtonText(buttonId, text, icon = null) {
    const button = this.getButton(buttonId);
    if (button) {
      if (icon) {
        button.innerHTML = `${icon} ${text}`;
      } else {
        button.textContent = text;
      }
    }
  }

  /**
   * 全てのボタンを取得する
   * @returns {Map} 全てのボタンのマップ
   */
  getAllButtons() {
    return this.buttons;
  }

  /**
   * ボタンタイプのスタイルをカスタマイズする
   * @param {string} type - ボタンタイプ
   * @param {Object} styleOverrides - 上書きするスタイル
   */
  customizeButtonType(type, styleOverrides) {
    if (this.buttonTypes[type]) {
      Object.assign(this.buttonTypes[type].style, styleOverrides);
    }
  }
}

// シングルトンインスタンスをエクスポート
export const buttonManager = new ButtonManager();
