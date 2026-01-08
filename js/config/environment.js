/**
 * @fileoverview 環境設定管理モジュール
 *
 * 開発環境・本番環境・ステージング環境での設定を統一管理
 */

// 設定（直接定義）
const globalConfig = {
  environments: {
    development: {
      stb2ifc_api: 'http://localhost:5001',
      cors_enabled: true,
      debug: true,
    },
    production: {
      stb2ifc_api: 'https://stb2ifc-api-e23mdd6kwq-an.a.run.app',
      cors_enabled: false,
      debug: false,
    },
    staging: {
      stb2ifc_api: 'https://stb2ifc-api-e23mdd6kwq-an.a.run.app',
      cors_enabled: false,
      debug: true,
    },
  },
  fallback: {
    cors_proxy: 'https://cors-anywhere.herokuapp.com/',
    timeout: 30000,
    retry_attempts: 3,
  },
  features: {
    ifc_conversion: true,
    schema_validation: true,
    importance_rating: true,
  },
};

// 環境検出
function detectEnvironment() {
  const hostname = window.location.hostname;
  const search = window.location.search;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'development';
  } else if (search.includes('env=staging')) {
    return 'staging';
  } else {
    return 'production';
  }
}

// 統合設定をブラウザ用に変換
function transformConfigForBrowser(config, environment) {
  const envConfig = config.environments[environment];
  if (!envConfig) {
    throw new Error(`環境設定が見つかりません: ${environment}`);
  }

  return {
    stb2ifc: {
      apiBaseUrl: envConfig.stb2ifc_api,
      corsEnabled: envConfig.cors_enabled,
      debug: envConfig.debug,
      timeout: config.fallback.timeout,
    },
    features: {
      ifcConversion: config.features.ifc_conversion,
      schemaValidation: config.features.schema_validation,
      importanceRating: config.features.importance_rating,
      devTools: environment === 'development',
    },
    logging: {
      level: envConfig.debug ? 'debug' : 'warn',
      console: envConfig.debug,
    },
    corsProxy: {
      proxyUrl: config.fallback.cors_proxy,
      retryAttempts: config.fallback.retry_attempts,
      retryDelay: 1000,
    },
  };
}

// 現在の環境設定を取得
export function getEnvironmentConfig() {
  const env = detectEnvironment();

  return {
    environment: env,
    ...transformConfigForBrowser(globalConfig, env),
  };
}

// API エンドポイント取得
export function getApiEndpoint(service = 'stb2ifc') {
  const config = getEnvironmentConfig();
  if (service === 'stb2ifc') {
    return config.stb2ifc.apiBaseUrl;
  }
  throw new Error(`Unknown service: ${service}`);
}

// 機能フラグチェック
export function isFeatureEnabled(feature) {
  const config = getEnvironmentConfig();
  return config.features[feature] || false;
}

// デバッグモード判定
export function isDebugMode() {
  const config = getEnvironmentConfig();
  return config.stb2ifc.debug;
}

// ログレベル取得
export function getLogLevel() {
  const config = getEnvironmentConfig();
  return config.logging.level;
}

// 環境情報表示（開発用）
export function displayEnvironmentInfo() {
  const config = getEnvironmentConfig();
  if (config.stb2ifc.debug) {
  }
}

// 設定のオーバーライド（テスト用）
export function overrideConfig(overrides) {
  const config = getEnvironmentConfig();
  if (config.stb2ifc.debug) {
    // グローバル設定を一時的に上書き
    Object.assign(globalConfig.environments[config.environment], overrides);
    console.warn('⚠️ Configuration overridden:', overrides);
  }
}

// 同期版のエイリアス（後方互換性のため）
export function getEnvironmentConfigSync() {
  // 現在は全て同期なので、そのまま呼び出す
  return getEnvironmentConfig();
}
