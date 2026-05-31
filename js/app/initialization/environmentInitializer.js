import { createLogger } from '../../utils/logger.js';
import { getEnvironmentConfig, displayEnvironmentInfo } from '../../config/environment.js';

const log = createLogger('app:initialization:environmentInitializer');

/**
 * 環境設定を初期化し、必要に応じて開発ツール表示やロガー設定を反映する。
 */
export async function initializeEnvironment() {
  try {
    window.envConfig = await getEnvironmentConfig();

    if (window.envConfig.features?.devTools) {
      const devToolsEl = document.getElementById('dev-tools');
      if (devToolsEl) {
        devToolsEl.style.display = 'block';
      }
      await displayEnvironmentInfo();
    }

    try {
      window.AppLogger?.setLevel &&
        window.AppLogger.setLevel(
          window.envConfig?.logging?.level || window.envConfig?.logLevel || 'warn',
        );
    } catch (e) {
      // AppLogger の初期化タイミング差異を許容する
    }

    log.info(`環境設定を初期化しました: ${window.envConfig.environment}`);
    return window.envConfig;
  } catch (error) {
    console.error('環境設定初期化エラー:', error);
    window.envConfig = {
      environment: 'production',
      logging: {
        level: 'warn',
        console: true,
      },
      features: { devTools: false },
    };
    return window.envConfig;
  }
}

export { getEnvironmentConfig };
