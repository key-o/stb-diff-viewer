/**
 * ESLint設定 - STB Diff Viewer
 * 
 * コードの統一化とバグ防止のためのルール設定
 */

module.exports = {
  env: {
    browser: true,
    es2022: true,
    node: false
  },
  
  extends: [
    'eslint:recommended'
  ],
  
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  
  globals: {
    // Three.js (CDN経由)
    THREE: 'readonly',
    
    // ブラウザAPI
    console: 'readonly',
    window: 'writable',
    document: 'readonly',
    localStorage: 'readonly',
    
    // File API
    File: 'readonly',
    FileReader: 'readonly',
    Blob: 'readonly',
    DataTransfer: 'readonly',
    
    // DOM API
    DOMParser: 'readonly',
    ResizeObserver: 'readonly'
  },
  
  rules: {
    // ==========================================
    // コード品質ルール
    // ==========================================
    
    // 変数・関数名の統一
    'camelcase': ['error', { 
      properties: 'always',
      ignoreDestructuring: false,
      ignoreImports: false,
      ignoreGlobals: false,
      allow: [
        // STB XMLの属性名（snake_case）を許可
        'id_node_start', 'id_node_end', 'id_section',
        'kind_struct', 'strength_concrete'
      ]
    }],
    
    // 定数は大文字スネークケース
    'prefer-const': 'error',
    'no-var': 'error',
    
    // ==========================================
    // コーディングスタイル統一
    // ==========================================
    
    // インデント: スペース2個
    'indent': ['error', 2, {
      SwitchCase: 1,
      VariableDeclarator: 1,
      outerIIFEBody: 1,
      MemberExpression: 1,
      FunctionDeclaration: { parameters: 1, body: 1 },
      FunctionExpression: { parameters: 1, body: 1 },
      CallExpression: { arguments: 1 },
      ArrayExpression: 1,
      ObjectExpression: 1,
      ImportDeclaration: 1,
      flatTernaryExpressions: false,
      ignoreComments: false
    }],
    
    // 文字列リテラル: シングルクォート優先
    'quotes': ['error', 'single', {
      avoidEscape: true,
      allowTemplateLiterals: true
    }],
    
    // セミコロン: 必須
    'semi': ['error', 'always'],
    
    // 括弧スタイル
    'brace-style': ['error', '1tbs', { allowSingleLine: true }],
    
    // スペース設定
    'space-before-blocks': 'error',
    'space-before-function-paren': ['error', {
      anonymous: 'always',
      named: 'never',
      asyncArrow: 'always'
    }],
    'space-in-parens': ['error', 'never'],
    'space-infix-ops': 'error',
    'comma-spacing': ['error', { before: false, after: true }],
    'key-spacing': ['error', { beforeColon: false, afterColon: true }],
    
    // 改行設定
    'eol-last': ['error', 'always'],
    'no-trailing-spaces': 'error',
    'comma-dangle': ['error', 'never'],
    
    // ==========================================
    // エラーハンドリング統一
    // ==========================================
    
    // console使用の制限（開発時は許可）
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    
    // エラーハンドリング必須
    'no-empty': ['error', { allowEmptyCatch: false }],
    'prefer-promise-reject-errors': 'error',
    
    // try-catchでのエラー変数命名
    'id-match': ['error', '^[a-z]+([A-Z][a-z]*)*$', {
      properties: false,
      onlyDeclarations: false,
      ignoreDestructuring: false
    }],
    
    // ==========================================
    // バグ防止ルール
    // ==========================================
    
    // 未定義変数の使用禁止
    'no-undef': 'error',
    'no-unused-vars': ['error', {
      vars: 'all',
      args: 'after-used',
      ignoreRestSiblings: false,
      argsIgnorePattern: '^_' // _で始まる引数は未使用OK
    }],
    
    // 危険な構文の禁止
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    
    // 比較演算子
    'eqeqeq': ['error', 'always', { null: 'ignore' }],
    'no-eq-null': 'off', // eqeqeqで制御
    
    // 配列・オブジェクトの操作
    'no-array-constructor': 'error',
    'no-new-object': 'error',
    'prefer-object-spread': 'error',
    'prefer-spread': 'error',
    
    // 関数定義
    'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
    'prefer-arrow-callback': ['error', { allowNamedFunctions: false }],
    
    // ==========================================
    // Three.js 固有ルール
    // ==========================================
    
    // Three.jsオブジェクトの命名規則
    'new-cap': ['error', {
      newIsCap: true,
      capIsNew: false,
      properties: false
    }],
    
    // ==========================================
    // STB固有ルール
    // ==========================================
    
    // XML要素名の大文字小文字（カスタムルール風に記述）
    'id-blacklist': ['error', 
      'stbnode', 'stbcolumn', 'stbgirder', 'stbbeam', // 小文字のSTB要素名を禁止
      'doc', 'elem', 'attr' // 略語を禁止
    ]
  },
  
  // ==========================================
  // ファイル固有の設定
  // ==========================================
  
  overrides: [
    {
      // テストファイル用設定
      files: ['**/*.test.js', '**/test/*.js'],
      env: {
        jest: true
      },
      rules: {
        'no-console': 'off', // テスト時はconsole.log許可
        'prefer-const': 'off', // テスト用の変数操作を許可
        'camelcase': ['error', {
          allow: ['test_', 'mock_'] // テスト用プレフィックス許可
        }]
      }
    },
    
    {
      // 設定ファイル用
      files: ['*.config.js', '.eslintrc.js'],
      env: {
        node: true
      },
      rules: {
        'no-console': 'off'
      }
    },
    
    {
      // レガシーファイル（段階的移行用）
      files: ['js/ui.js', 'js/modelLoader.js'],
      rules: {
        'camelcase': 'warn', // エラーではなく警告
        'func-style': 'warn',
        'prefer-const': 'warn'
      }
    }
  ],
  
  // ==========================================
  // カスタム設定
  // ==========================================
  
  settings: {
    // プロジェクト固有の設定
    'stb-diff-viewer': {
      version: '1.0.0',
      modulePattern: '^(core|viewer|parser|ui|test)/',
      elementTypes: [
        'Node', 'Column', 'Girder', 'Beam', 'Brace', 
        'Slab', 'Wall', 'Axis', 'Story'
      ]
    }
  }
};