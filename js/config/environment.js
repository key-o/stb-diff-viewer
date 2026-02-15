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

/**
 * 指定された機能が有効かどうかを確認
 * @param {string} featureName - 機能名（例: 'ifcConversion', 'devTools'）
 * @returns {boolean} 機能が有効な場合true
 */
export function isFeatureEnabled(featureName) {
  const config = getEnvironmentConfig();
  return config.features?.[featureName] ?? false;
}

/**
 * 環境情報をコンソールに表示（開発用）
 */
export function displayEnvironmentInfo() {
  const config = getEnvironmentConfig();
  console.group('🌍 環境設定情報');
  console.log('環境:', config.environment);
  console.log('API URL:', config.stb2ifc?.apiBaseUrl);
  console.log('デバッグモード:', config.stb2ifc?.debug);
  console.log('有効な機能:', config.features);
  console.groupEnd();
}
