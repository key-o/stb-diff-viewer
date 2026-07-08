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
   * @param {Object} [config.schema] - スキーマ属性定義（type / fixed / constraints）。
   *   入力コントロール（列挙ドロップダウン・数値入力・固定値）の決定に用いる
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

    // 識別子（guid / id）など「一意な新規値を入力・生成する」用途は、専用入力
    // （直接入力＋自動生成ボタン）を最優先で用いる。既存値サジェストによる
    // ドロップダウン固定を避けるための特別扱い。呼び出し元が config.generate を
    // 与えることで有効化される。
    if (typeof this.currentConfig.generate === 'function') {
      section.appendChild(this.createIdentityInput(currentValue));
      return section;
    }

    // スキーマ定義がある場合は、それに従って入力コントロールを決定する（最優先）
    const schemaMode = this.resolveSchemaInputMode();

    if (schemaMode.mode === 'fixed') {
      // 固定値（const）: 読み取り専用表示
      section.appendChild(this.createFixedInput(schemaMode.value));
    } else if (schemaMode.mode === 'enum') {
      // 列挙値・boolean: スキーマ定義値のみの厳格なドロップダウン
      section.appendChild(this.createEnumSelect(schemaMode.options, currentValue));
    } else if (schemaMode.mode === 'number') {
      // 数値: min/max/step 付きの数値入力（候補は datalist で補助）
      section.appendChild(this.createNumberInput(schemaMode, currentValue, suggestions));
    } else {
      // スキーマ非定義: サジェスト候補に基づく従来のモード選択
      const hasEnumeration = suggestions.length > 0;
      const useDropdownOnly = hasEnumeration && suggestions.length <= 10 && !allowFreeText;
      const useMixedMode = hasEnumeration && (suggestions.length > 10 || allowFreeText);

      if (useDropdownOnly) {
        section.appendChild(this.createDropdownInput(suggestions, currentValue));
      } else if (useMixedMode) {
        section.appendChild(this.createMixedInput(suggestions, currentValue));
      } else {
        section.appendChild(this.createTextInput(currentValue));
      }
    }

    return section;
  }

  /**
   * スキーマ定義から入力コントロールの種別を判定する
   * @returns {{mode: 'fixed'|'enum'|'number'|null, value?: string, options?: string[],
   *   isInteger?: boolean, min?: number|null, max?: number|null,
   *   minExclusive?: number|null, maxExclusive?: number|null}}
   */
  resolveSchemaInputMode() {
    const schema = this.currentConfig.schema;
    if (!schema) return { mode: null };

    // const（固定値）
    if (schema.fixed !== null && schema.fixed !== undefined) {
      return { mode: 'fixed', value: String(schema.fixed) };
    }

    const constraints = schema.constraints || {};
    const enumerations = Array.isArray(constraints.enumerations) ? constraints.enumerations : [];

    // 列挙値
    if (enumerations.length > 0) {
      return { mode: 'enum', options: enumerations.map(String) };
    }

    // boolean は true / false の2択
    if (schema.type === 'boolean') {
      return { mode: 'enum', options: ['true', 'false'] };
    }

    // 数値（min/max 制約を反映）
    if (schema.type === 'number' || schema.type === 'integer') {
      return {
        mode: 'number',
        isInteger: schema.type === 'integer',
        min: constraints.minInclusive ?? null,
        max: constraints.maxInclusive ?? null,
        minExclusive: constraints.minExclusive ?? null,
        maxExclusive: constraints.maxExclusive ?? null,
      };
    }

    return { mode: null };
  }

  /**
   * 固定値（const）の読み取り専用入力を作成
   * @param {string} fixedValue - スキーマで固定された値
   * @returns {HTMLElement}
   */
  createFixedInput(fixedValue) {
    const container = document.createElement('div');
    container.className = 'input-container fixed-only';

    const label = document.createElement('label');
    label.textContent = '値（固定）:';
    label.setAttribute('for', 'param-text');

    const input = document.createElement('input');
    input.id = 'param-text';
    input.type = 'text';
    input.className = 'parameter-text-input';
    input.value = fixedValue;
    input.readOnly = true;

    const help = document.createElement('small');
    help.className = 'input-help';
    help.textContent = 'この属性の値はスキーマで固定されています';

    container.appendChild(label);
    container.appendChild(input);
    container.appendChild(help);

    return container;
  }

  /**
   * 列挙値（enum / boolean）の厳格なドロップダウンを作成
   *
   * スキーマで許可された値のみを選択肢にする。現在値がスキーマ外の場合は
   * 区別できるオプションとして先頭に追加し、選択状態を保持する。
   * @param {string[]} options - スキーマで許可された値
   * @param {string} currentValue - 現在の値
   * @returns {HTMLElement}
   */
  createEnumSelect(options, currentValue) {
    const container = document.createElement('div');
    container.className = 'input-container dropdown-only';

    const label = document.createElement('label');
    label.textContent = '値を選択:';
    label.setAttribute('for', 'param-dropdown');

    const select = document.createElement('select');
    select.id = 'param-dropdown';
    select.className = 'parameter-dropdown';

    // 空の選択肢（未選択状態）
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- 選択してください --';
    select.appendChild(emptyOption);

    // 現在値がスキーマ定義外の場合は、区別できる形で先頭付近に追加
    if (currentValue && !options.includes(currentValue)) {
      const invalidOption = document.createElement('option');
      invalidOption.value = currentValue;
      invalidOption.textContent = `${currentValue}（スキーマ外）`;
      invalidOption.selected = true;
      select.appendChild(invalidOption);
    }

    options.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      if (value === currentValue) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    const help = document.createElement('small');
    help.className = 'input-help';
    help.textContent = 'スキーマで定義された値から選択してください';

    container.appendChild(label);
    container.appendChild(select);
    container.appendChild(help);

    return container;
  }

  /**
   * 数値（number / integer）入力を作成
   *
   * min / max / step を HTML 属性として設定し、サジェスト候補は datalist で補助する。
   * @param {Object} schemaMode - resolveSchemaInputMode の結果
   * @param {string} currentValue - 現在の値
   * @param {Array<Object>} suggestions - サジェスト候補
   * @returns {HTMLElement}
   */
  createNumberInput(schemaMode, currentValue, suggestions) {
    const container = document.createElement('div');
    container.className = 'input-container number-only';

    const label = document.createElement('label');
    label.textContent = '値を入力:';
    label.setAttribute('for', 'param-text');

    const input = document.createElement('input');
    input.id = 'param-text';
    input.type = 'number';
    // 既存のイベント配線・値取得が .parameter-text-input を前提とするため両クラスを付与
    input.className = 'parameter-text-input parameter-number-input';
    input.value = currentValue || '';
    input.step = schemaMode.isInteger ? '1' : 'any';

    // min / max を反映（exclusive は HTML 属性では厳密に表現できないためバリデーションで担保）
    const min = schemaMode.min ?? schemaMode.minExclusive;
    const max = schemaMode.max ?? schemaMode.maxExclusive;
    if (min !== null && min !== undefined) input.min = String(min);
    if (max !== null && max !== undefined) input.max = String(max);

    // 既存モデル値などの候補を datalist で補助
    const numericSuggestions = (suggestions || [])
      .map((entry) => this.normalizeSuggestionEntry(entry))
      .filter((entry) => entry && entry.value !== '' && !isNaN(Number(entry.value)));

    if (numericSuggestions.length > 0) {
      const listId = 'param-number-list';
      input.setAttribute('list', listId);
      const datalist = document.createElement('datalist');
      datalist.id = listId;
      numericSuggestions.forEach((entry) => {
        const option = document.createElement('option');
        option.value = entry.value;
        datalist.appendChild(option);
      });
      container.appendChild(datalist);
    }

    const help = document.createElement('small');
    help.className = 'input-help';
    help.textContent = this.buildNumberHelpText(schemaMode);

    container.appendChild(label);
    container.appendChild(input);
    container.appendChild(help);

    return container;
  }

  /**
   * 数値入力の制約ヒント文を生成
   * @param {Object} schemaMode - resolveSchemaInputMode の結果
   * @returns {string}
   */
  buildNumberHelpText(schemaMode) {
    const parts = [schemaMode.isInteger ? '整数を入力してください' : '数値を入力してください'];

    if (schemaMode.min !== null && schemaMode.min !== undefined)
      parts.push(`${schemaMode.min} 以上`);
    if (schemaMode.minExclusive !== null && schemaMode.minExclusive !== undefined)
      parts.push(`${schemaMode.minExclusive} より大きい`);
    if (schemaMode.max !== null && schemaMode.max !== undefined)
      parts.push(`${schemaMode.max} 以下`);
    if (schemaMode.maxExclusive !== null && schemaMode.maxExclusive !== undefined)
      parts.push(`${schemaMode.maxExclusive} 未満`);

    return parts.join(' / ');
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
   * 識別子（guid / id 等）専用入力（直接入力 ＋ 自動生成ボタン）を作成
   *
   * 既存値サジェストに依存せず、常にテキスト直接入力を許可する。
   * 「自動生成」ボタンは config.generate() の戻り値を入力欄へ反映する。
   * ボタン文言は config.generateLabel、補助文は config.inputHelp で差し替え可能。
   * @param {string} currentValue - 現在の値
   * @returns {HTMLElement}
   */
  createIdentityInput(currentValue) {
    const container = document.createElement('div');
    container.className = 'input-container text-only identity-input';

    const label = document.createElement('label');
    label.textContent = '値を入力:';
    label.setAttribute('for', 'param-text');

    const inputRow = document.createElement('div');
    inputRow.className = 'identity-input-row';

    const input = document.createElement('input');
    input.id = 'param-text';
    input.type = 'text';
    input.className = 'parameter-text-input';
    input.value = currentValue || '';
    input.setAttribute('aria-describedby', 'text-help');

    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.className = 'parameter-editor-generate-btn';
    generateBtn.textContent = this.currentConfig.generateLabel || '🔄 自動生成';

    inputRow.appendChild(input);
    inputRow.appendChild(generateBtn);

    const help = document.createElement('small');
    help.id = 'text-help';
    help.className = 'input-help';
    help.textContent = this.currentConfig.inputHelp || '値を直接入力するか、自動生成してください';

    container.appendChild(label);
    container.appendChild(inputRow);
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

    // 識別子（guid / id 等）の自動生成ボタン
    const generateBtn = this.modal.querySelector('.parameter-editor-generate-btn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this.handleIdentityGenerate());
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
      if (this.currentConfig.onPreview && selectedValue) {
        this.currentConfig.onPreview(selectedValue);
      }
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

    // プレビューコールバック（デバウンスは呼び出し元で管理）
    if (this.currentConfig.onPreview && currentValue) {
      this.currentConfig.onPreview(currentValue);
    }
  }

  /**
   * 識別子の自動生成ボタン処理
   *
   * config.generate() の値をテキスト入力へ反映し、バリデーション・プレビューを更新する。
   */
  handleIdentityGenerate() {
    const textInput = this.modal.querySelector('.parameter-text-input');
    if (!textInput || typeof this.currentConfig.generate !== 'function') return;
    textInput.value = this.currentConfig.generate();
    this.handleTextInputChange({ target: textInput });
    textInput.focus();
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

    // 追加バリデーション（呼び出し元が与える文脈依存チェック。id の一意性など）。
    // XSD で問題が無い場合のみ評価し、メッセージが返れば編集を確定不可（blocking）にする。
    if (isValid && typeof this.currentConfig.extraValidate === 'function' && currentValue) {
      const extraMessage = this.currentConfig.extraValidate(currentValue);
      if (extraMessage) {
        isValid = false;
        isBlocking = true;
        message = `⚠️ ${extraMessage}`;
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
