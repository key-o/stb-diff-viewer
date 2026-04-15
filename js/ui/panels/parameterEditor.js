/**
 * @fileoverview パラメータ編集モーダル
 *
 * STB要素の属性値を編集するためのモーダルUIコンポーネント:
 * - ドロップダウン選択機能
 * - フリーテキスト入力機能
 * - リアルタイムバリデーション
 * - アクセシビリティ対応
 * - XSDスキーマ連携
 */

import { validationController } from '../../app/controllers/validationController.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ui:panels:parameterEditor');

/**
 * パラメータ編集モーダルクラス
 */
export class ParameterEditor {
  constructor() {
    this.modal = null;
    this.currentConfig = null;
    this.resolvePromise = null;
    this.rejectPromise = null;
  }

  /**
   * パラメータ編集モーダルを表示
   * @param {Object} config - 編集設定
   * @param {string} config.attributeName - 属性名
   * @param {string} config.currentValue - 現在の値
   * @param {Array<string|Object>} config.suggestions - サジェスト候補
   * @param {string} config.elementType - 要素タイプ
   * @param {string} config.elementId - 要素ID
   * @param {boolean} config.allowFreeText - フリーテキスト入力許可
   * @param {boolean} config.required - 必須属性かどうか
   * @returns {Promise<string|null>} 編集後の値、またはキャンセル時はnull
   */
  static async show(config) {
    const editor = new ParameterEditor();
    return editor.show(config);
  }

  /**
   * モーダル表示の実装
   * @param {Object} config - 編集設定
   * @returns {Promise<string|null>} 編集結果
   */
  async show(config) {
    this.currentConfig = config;

    return new Promise((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;

      try {
        this.createModal();
        this.showModal();
        this.setupEventListeners();
        this.focusInitialElement();
      } catch (error) {
        log.error('Error showing parameter editor:', error);
        reject(error);
      }
    });
  }

  /**
   * モーダルDOM要素を作成
   */
  createModal() {
    const { attributeName, currentValue, suggestions, allowFreeText, required } =
      this.currentConfig;
    const normalizedSuggestions = this.normalizeSuggestionList(suggestions);

    // モーダル背景
    this.modal = document.createElement('div');
    this.modal.className = 'parameter-editor-overlay';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-labelledby', 'param-editor-title');

    // モーダルコンテナー
    const container = document.createElement('div');
    container.className = 'parameter-editor-container';

    // ヘッダー
    const header = document.createElement('div');
    header.className = 'parameter-editor-header';
    header.innerHTML = `
      <h3 id="param-editor-title" class="parameter-editor-title">
        属性の編集: ${attributeName}
        ${required ? '<span class="required-indicator" title="必須">*</span>' : ''}
      </h3>
      <button type="button" class="parameter-editor-close" aria-label="閉じる">×</button>
    `;

    // メインコンテンツ
    const content = document.createElement('div');
    content.className = 'parameter-editor-content';

    // 入力セクション
    const inputSection = this.createInputSection(
      normalizedSuggestions,
      currentValue,
      allowFreeText,
    );
    content.appendChild(inputSection);

    // バリデーションメッセージエリア
    const validationArea = document.createElement('div');
    validationArea.className = 'parameter-editor-validation';
    validationArea.setAttribute('role', 'alert');
    validationArea.setAttribute('aria-live', 'polite');
    content.appendChild(validationArea);

    // サジェスト情報
    if (normalizedSuggestions.length > 0) {
      const suggestInfo = document.createElement('div');
      suggestInfo.className = 'parameter-editor-info';
      suggestInfo.innerHTML = `
        <small>📋 ${normalizedSuggestions.length}個の候補値があります</small>
      `;
      content.appendChild(suggestInfo);
    }

    // ボタンエリア
    const buttonArea = document.createElement('div');
    buttonArea.className = 'parameter-editor-buttons';
    buttonArea.innerHTML = `
      <button type="button" class="parameter-editor-cancel">キャンセル</button>
      <button type="button" class="parameter-editor-ok" disabled>OK</button>
    `;

    container.appendChild(header);
    container.appendChild(content);
    container.appendChild(buttonArea);
    this.modal.appendChild(container);

    document.body.appendChild(this.modal);
  }

  /**
   * 入力セクションを作成
   * @param {Array<Object>} suggestions - サジェスト候補
   * @param {string} currentValue - 現在の値
   * @param {boolean} allowFreeText - フリーテキスト許可
   * @returns {HTMLElement} 入力セクション要素
   */
  createInputSection(suggestions, currentValue, allowFreeText) {
    const section = document.createElement('div');
    section.className = 'parameter-editor-input-section';

    const hasEnumeration = suggestions.length > 0;
    const useDropdownOnly = hasEnumeration && suggestions.length <= 10 && !allowFreeText;
    const useMixedMode = hasEnumeration && (suggestions.length > 10 || allowFreeText);

    if (useDropdownOnly) {
      // ドロップダウンのみモード
      section.appendChild(this.createDropdownInput(suggestions, currentValue));
    } else if (useMixedMode) {
      // 混合モード（ドロップダウン + フリーテキスト）
      section.appendChild(this.createMixedInput(suggestions, currentValue));
    } else {
      // フリーテキストのみモード
      section.appendChild(this.createTextInput(currentValue));
    }

    return section;
  }

  /**
   * サジェストエントリを正規化
   * @param {Array<string|Object>} suggestions
   * @returns {Array<Object>}
   */
  normalizeSuggestionList(suggestions = []) {
    return suggestions
      .map((entry) => this.normalizeSuggestionEntry(entry))
      .filter((entry) => entry !== null);
  }

  normalizeSuggestionEntry(entry) {
    if (!entry) {
      return null;
    }

    if (typeof entry === 'string') {
      const value = entry.trim();
      if (!value) return null;
      return { value, label: entry };
    }

    if (typeof entry === 'object') {
      const value = (entry.value ?? '').toString().trim();
      if (!value) return null;
      const label = (entry.label ?? value).toString();
      return {
        value,
        label,
        meta: entry.meta || {},
        source: entry.source || 'unknown',
      };
    }

    return null;
  }

  /**
   * ドロップダウン入力を作成
   * @param {Array<Object>} suggestions - 候補値
   * @param {string} currentValue - 現在の値
   * @returns {HTMLElement} ドロップダウン要素
   */
  createDropdownInput(suggestions, currentValue) {
    const container = document.createElement('div');
    container.className = 'input-container dropdown-only';

    const label = document.createElement('label');
    label.textContent = '値を選択:';
    label.setAttribute('for', 'param-dropdown');

    const select = document.createElement('select');
    select.id = 'param-dropdown';
    select.className = 'parameter-dropdown';
    select.setAttribute('aria-describedby', 'dropdown-help');

    // 空の選択肢（未選択状態）
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- 選択してください --';
    select.appendChild(emptyOption);

    // 候補値をオプションとして追加
    suggestions.forEach((suggestion) => {
      const entry = this.normalizeSuggestionEntry(suggestion);
      if (!entry) return;
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label || entry.value;
      if (entry.meta) {
        option.title = Object.values(entry.meta)
          .filter((val) => !!val)
          .join(' / ');
      }
      if (entry.value === currentValue) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    const help = document.createElement('small');
    help.id = 'dropdown-help';
    help.className = 'input-help';
    help.textContent = '候補から選択してください';

    container.appendChild(label);
    container.appendChild(select);
    container.appendChild(help);

    return container;
  }

  /**
   * 混合入力（ドロップダウン + テキスト）を作成
   * @param {Array<Object>} suggestions - 候補値
   * @param {string} currentValue - 現在の値
   * @returns {HTMLElement} 混合入力要素
   */
  createMixedInput(suggestions, currentValue) {
    const container = document.createElement('div');
    container.className = 'input-container mixed-mode';

    // ドロップダウン部分
    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'dropdown-section';

    const dropdownLabel = document.createElement('label');
    dropdownLabel.textContent = '候補から選択:';
    dropdownLabel.setAttribute('for', 'param-dropdown');

    const select = document.createElement('select');
    select.id = 'param-dropdown';
    select.className = 'parameter-dropdown';

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- 候補から選択 --';
    select.appendChild(emptyOption);

    suggestions.forEach((suggestion) => {
      const entry = this.normalizeSuggestionEntry(suggestion);
      if (!entry) return;
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label || entry.value;
      if (entry.meta) {
        option.title = Object.values(entry.meta)
          .filter((val) => !!val)
          .join(' / ');
      }
      select.appendChild(option);
    });

    dropdownContainer.appendChild(dropdownLabel);
    dropdownContainer.appendChild(select);

    // または区切り
    const separator = document.createElement('div');
    separator.className = 'input-separator';
    separator.textContent = 'または';

    // テキスト入力部分
    const textContainer = document.createElement('div');
    textContainer.className = 'text-section';

    const textLabel = document.createElement('label');
    textLabel.textContent = '直接入力:';
    textLabel.setAttribute('for', 'param-text');

    const textInput = document.createElement('input');
    textInput.id = 'param-text';
    textInput.type = 'text';
    textInput.className = 'parameter-text-input';
    textInput.value = currentValue || '';
    textInput.setAttribute('aria-describedby', 'text-help');

    const textHelp = document.createElement('small');
    textHelp.id = 'text-help';
    textHelp.className = 'input-help';
    textHelp.textContent = '任意の値を入力できます';

    if (currentValue) {
      const hasMatch = suggestions.some((entry) => {
        const normalized = this.normalizeSuggestionEntry(entry);
        return normalized && normalized.value === currentValue;
      });
      if (hasMatch) {
        select.value = currentValue;
        textInput.value = currentValue;
      }
    }

    textContainer.appendChild(textLabel);
    textContainer.appendChild(textInput);
    textContainer.appendChild(textHelp);

    container.appendChild(dropdownContainer);
    container.appendChild(separator);
    container.appendChild(textContainer);

    return container;
  }

  /**
   * フリーテキスト入力を作成
   * @param {string} currentValue - 現在の値
   * @returns {HTMLElement} テキスト入力要素
   */
  createTextInput(currentValue) {
    const container = document.createElement('div');
    container.className = 'input-container text-only';

    const label = document.createElement('label');
    label.textContent = '値を入力:';
    label.setAttribute('for', 'param-text');

    const input = document.createElement('input');
    input.id = 'param-text';
    input.type = 'text';
    input.className = 'parameter-text-input';
    input.value = currentValue || '';
    input.setAttribute('aria-describedby', 'text-help');

    const help = document.createElement('small');
    help.id = 'text-help';
    help.className = 'input-help';
    help.textContent = '任意の値を入力してください';

    container.appendChild(label);
    container.appendChild(input);
    container.appendChild(help);

    return container;
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // 閉じるボタン
    const closeBtn = this.modal.querySelector('.parameter-editor-close');
    closeBtn.addEventListener('click', () => this.cancel());

    // キャンセルボタン
    const cancelBtn = this.modal.querySelector('.parameter-editor-cancel');
    cancelBtn.addEventListener('click', () => this.cancel());

    // OKボタン
    const okBtn = this.modal.querySelector('.parameter-editor-ok');
    okBtn.addEventListener('click', () => this.confirm());

    // ドロップダウン変更
    const dropdown = this.modal.querySelector('.parameter-dropdown');
    if (dropdown) {
      dropdown.addEventListener('change', (e) => this.handleDropdownChange(e));
    }

    // テキスト入力変更
    const textInput = this.modal.querySelector('.parameter-text-input');
    if (textInput) {
      textInput.addEventListener('input', (e) => this.handleTextInputChange(e));
      textInput.addEventListener('keydown', (e) => this.handleKeydown(e));
    }

    // ESCキーでキャンセル
    document.addEventListener('keydown', this.handleGlobalKeydown.bind(this));

    // モーダル背景クリックでキャンセル
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.cancel();
      }
    });

    // 初期バリデーション
    this.validateCurrentInput();
  }

  /**
   * ドロップダウン変更時の処理
   * @param {Event} event - 変更イベント
   */
  handleDropdownChange(event) {
    const selectedValue = event.target.value;

    // 混合モードの場合、テキストフィールドにも反映
    const textInput = this.modal.querySelector('.parameter-text-input');
    if (textInput && selectedValue) {
      textInput.value = selectedValue;
      this.handleTextInputChange({ target: textInput });
    } else {
      this.validateCurrentInput();
    }
  }

  /**
   * テキスト入力変更時の処理
   * @param {Event} event - 入力イベント
   */
  handleTextInputChange(event) {
    const currentValue = event.target.value;

    // 混合モードの場合、ドロップダウンの選択もクリア
    const dropdown = this.modal.querySelector('.parameter-dropdown');
    if (dropdown) {
      const matchingOption = Array.from(dropdown.options).find((opt) => opt.value === currentValue);
      dropdown.value = matchingOption ? currentValue : '';
    }

    this.validateCurrentInput();
  }

  /**
   * キーボード操作処理
   * @param {KeyboardEvent} event - キーボードイベント
   */
  handleKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const okBtn = this.modal.querySelector('.parameter-editor-ok');
      if (!okBtn.disabled) {
        this.confirm();
      }
    }
  }

  /**
   * グローバルキーボード処理
   * @param {KeyboardEvent} event - キーボードイベント
   */
  handleGlobalKeydown(event) {
    if (event.key === 'Escape') {
      this.cancel();
    }
  }

  /**
   * 現在の入力値をバリデーション
   */
  validateCurrentInput() {
    const currentValue = this.getCurrentValue();
    const validationArea = this.modal.querySelector('.parameter-editor-validation');
    const okBtn = this.modal.querySelector('.parameter-editor-ok');

    let isValid = true;
    let isBlocking = true;
    let message = '';

    // 必須チェック
    if (this.currentConfig.required && (!currentValue || currentValue.trim() === '')) {
      isValid = false;
      isBlocking = true;
      message = '⚠️ この属性は必須です';
    }
    // XSDバリデーション
    else if (validationController.isSchemaReady() && currentValue && currentValue.trim() !== '') {
      const { elementType, attributeName } = this.currentConfig;
      const tagName = elementType === 'Node' ? 'StbNode' : `Stb${elementType}`;
      const validation = validationController.validateAttribute(
        tagName,
        attributeName,
        currentValue,
      );

      if (!validation.valid) {
        isValid = false;
        // blocking: false の場合（スキーマ未定義など）はOKを有効のまま警告のみ表示
        isBlocking = validation.blocking !== false;
        message = `⚠️ ${validation.error}`;

        if (validation.suggestions && validation.suggestions.length > 0) {
          message += `<br><small>💡 推奨値: ${validation.suggestions
            .slice(0, 3)
            .join(', ')}</small>`;
        }
      }
    }

    // UI更新
    validationArea.innerHTML = message;
    validationArea.className = `parameter-editor-validation ${isValid ? 'valid' : isBlocking ? 'invalid' : 'warning'}`;
    okBtn.disabled = isBlocking && !isValid;

    return isValid;
  }

  /**
   * 現在の入力値を取得
   * @returns {string} 現在の値
   */
  getCurrentValue() {
    const textInput = this.modal.querySelector('.parameter-text-input');
    const dropdown = this.modal.querySelector('.parameter-dropdown');

    if (textInput) {
      return textInput.value.trim();
    } else if (dropdown) {
      return dropdown.value;
    }

    return '';
  }

  /**
   * モーダルを表示
   */
  showModal() {
    this.modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // 背景のスクロールを無効化

    // アニメーション用のクラスを追加
    requestAnimationFrame(() => {
      this.modal.classList.add('show');
    });
  }

  /**
   * 初期フォーカス設定
   */
  focusInitialElement() {
    // 適切な要素にフォーカスを設定
    const textInput = this.modal.querySelector('.parameter-text-input');
    const dropdown = this.modal.querySelector('.parameter-dropdown');

    if (textInput) {
      textInput.focus();
      // テキストが既にある場合は選択
      if (textInput.value) {
        textInput.select();
      }
    } else if (dropdown) {
      dropdown.focus();
    }
  }

  /**
   * 確定処理
   */
  confirm() {
    const okBtn = this.modal.querySelector('.parameter-editor-ok');
    if (okBtn && okBtn.disabled) {
      return;
    }

    const value = this.getCurrentValue();
    this.closeModal();
    this.resolvePromise(value);
  }

  /**
   * キャンセル処理
   */
  cancel() {
    this.closeModal();
    this.resolvePromise(null);
  }

  /**
   * モーダルを閉じる
   */
  closeModal() {
    if (this.modal) {
      this.modal.classList.remove('show');
      document.body.style.overflow = ''; // スクロール復元

      // アニメーション完了後に削除
      setTimeout(() => {
        if (this.modal && this.modal.parentNode) {
          this.modal.parentNode.removeChild(this.modal);
        }
        this.modal = null;
      }, 300);
    }

    // グローバルイベントリスナーを削除
    document.removeEventListener('keydown', this.handleGlobalKeydown.bind(this));
  }
}

// デフォルトエクスポート
export default ParameterEditor;
