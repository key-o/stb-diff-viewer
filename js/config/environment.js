/**
 * @fileoverview 環境設定管理モジュール
 *
 * 開発環境・本番環境・ステージング環境での設定を統一管理
 * 統合設定ファイル（../../config/api-endpoints.json）を使用
 */

// 統合設定の読み込み
let globalConfig = null;

async function loadGlobalConfig() {
  if (globalConfig) return globalConfig;

  try {
    const response = await fetch("../../config/api-endpoints.json");
    if (!response.ok) {
      throw new Error(`設定ファイル読み込み失敗: ${response.status}`);
    }
    globalConfig = await response.json();
    return globalConfig;
  } catch (error) {
    console.warn(
      "統合設定ファイルの読み込みに失敗、フォールバック設定を使用:",
      error
    );
    // フォールバック設定
    return {
      environments: {
        development: {
          stb2ifc_api: "http://localhost:5001",
          cors_enabled: true,
          debug: true,
        },
        production: {
          stb2ifc_api: "https://stb2ifc-api-e23mdd6kwq-an.a.run.app",
          cors_enabled: false,
          debug: false,
        },
      },
      fallback: {
        cors_proxy: "https://cors-anywhere.herokuapp.com/",
        timeout: 30000,
        retry_attempts: 3,
      },
      features: {
        ifc_conversion: true,
        schema_validation: true,
        importance_rating: true,
      },
    };
  }
}

// 環境検出
function detectEnvironment() {
  const hostname = window.location.hostname;
  const search = window.location.search;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "development";
  } else if (search.includes("env=staging")) {
    return "staging";
  } else {
    return "production";
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
      devTools: environment === "development",
    },
    logging: {
      level: envConfig.debug ? "debug" : "warn",
      console: envConfig.debug,
    },
    corsProxy: {
      proxyUrl: config.fallback.cors_proxy,
      retryAttempts: config.fallback.retry_attempts,
      retryDelay: 1000,
    },
  };
}

// 現在の環境設定を取得（非同期）
export async function getEnvironmentConfig() {
  const env = detectEnvironment();
  const config = await loadGlobalConfig();

  return {
    environment: env,
    ...transformConfigForBrowser(config, env),
  };
}

// API エンドポイント取得（非同期）
export async function getApiEndpoint(service = "stb2ifc") {
  const config = await getEnvironmentConfig();
  if (service === "stb2ifc") {
    return config.stb2ifc.apiBaseUrl;
  }
  throw new Error(`Unknown service: ${service}`);
}

// 機能フラグチェック（非同期）
export async function isFeatureEnabled(feature) {
  const config = await getEnvironmentConfig();
  return config.features[feature] || false;
}

// デバッグモード判定（非同期）
export async function isDebugMode() {
  const config = await getEnvironmentConfig();
  return config.stb2ifc.debug;
}

// ログレベル取得（非同期）
export async function getLogLevel() {
  const config = await getEnvironmentConfig();
  return config.logging.level;
}

// 環境情報表示（開発用）
export async function displayEnvironmentInfo() {
  const config = await getEnvironmentConfig();
  if (config.stb2ifc.debug) {
    console.group("🌍 Environment Configuration");
    console.log("Environment:", config.environment);
    console.log("STB2IFC API:", config.stb2ifc.apiBaseUrl);
    console.log("Features:", config.features);
    console.log("Debug Mode:", config.stb2ifc.debug);
    console.log("Config Source: ../../config/api-endpoints.json");
    console.groupEnd();
  }
}

// 設定のオーバーライド（テスト用・非同期）
export async function overrideConfig(overrides) {
  const config = await getEnvironmentConfig();
  if (config.stb2ifc.debug) {
    // グローバル設定を一時的に上書き
    Object.assign(globalConfig.environments[config.environment], overrides);
    console.warn("⚠️ Configuration overridden:", overrides);
  }
}

// 同期版のフォールバック関数（後方互換性のため）
export function getEnvironmentConfigSync() {
  console.warn(
    "getEnvironmentConfigSync は非推奨です。getEnvironmentConfig() を使用してください。"
  );

  const env = detectEnvironment();
  // フォールバック設定を返す
  return {
    environment: env,
    stb2ifc: {
      apiBaseUrl:
        env === "development"
          ? "http://localhost:5001"
          : "https://stb2ifc-api-e23mdd6kwq-an.a.run.app",
      corsEnabled: env === "development",
      debug: env === "development",
      timeout: 30000,
    },
    features: {
      ifcConversion: true,
      schemaValidation: true,
      importanceRating: true,
      devTools: env === "development",
    },
  };
}
