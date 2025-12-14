/**
 * 軽量ロガー
 * - レベル: silent < error < warn < info < debug < trace
 * - 名前空間フィルタ: localStorage / URL パラメータで制御
 *   - ?log=debug&ns=*
 *   - localStorage.setItem('stbviewer.log.level','info')
 *   - localStorage.setItem('stbviewer.log.namespaces','*, -noisy:*')
 */

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };

function readConfig() {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlLevel = params.get('log') || params.get('logLevel');
    const urlNs = params.get('ns') || params.get('namespaces');

    const lsLevel = localStorage.getItem('stbviewer.log.level');
    const lsNs = localStorage.getItem('stbviewer.log.namespaces');

    const level = (urlLevel || lsLevel || 'warn').toLowerCase();
    const namespaces = (urlNs || lsNs || '*')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return { level, namespaces };
  } catch (e) {
    return { level: 'warn', namespaces: ['*'] };
  }
}

const CONFIG = readConfig();
const HISTORY_LIMIT = 500;
const HISTORY = [];

function patternToRegex(pat) {
  // 'viewer:*' → /^viewer:.*$/ ; '*' → /^.*$/
  const negated = pat.startsWith('-');
  const raw = negated ? pat.slice(1) : pat;
  const esc = raw.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return { negated, regex: new RegExp('^' + esc + '$') };
}

let nsRules = CONFIG.namespaces.map(patternToRegex);

function isEnabled(ns) {
  // デフォルトは無効にし、最後にマッチしたルールを採用
  let enabled = false;
  for (const rule of nsRules) {
    if (rule.regex.test(ns)) {
      enabled = !rule.negated;
    }
  }
  return enabled;
}

function levelAllows(levelName, wanted) {
  const cur = LEVELS[CONFIG.level] ?? LEVELS.warn;
  const w = LEVELS[wanted] ?? LEVELS.warn;
  return w <= cur;
}

const onceKeys = new Set();

function pushHistory(entry) {
  HISTORY.push(entry);
  if (HISTORY.length > HISTORY_LIMIT) HISTORY.shift();
}

function baseLog(kind, ns, args) {
  try {
    pushHistory({ ts: Date.now(), level: kind, ns, args: Array.from(args) });
  } catch (_) {}
  // 実コンソールへ
  const prefix = `[${new Date().toISOString()}][${ns}]`;
  // eslint-disable-next-line no-console
  (console[kind] || console.log).apply(console, [prefix, ...args]);
}

export function createLogger(namespace) {
  function shouldLog(kind) {
    return isEnabled(namespace) && levelAllows(CONFIG.level, kind);
  }

  return {
    error: (...args) => shouldLog('error') && baseLog('error', namespace, args),
    warn: (...args) => shouldLog('warn') && baseLog('warn', namespace, args),
    info: (...args) => shouldLog('info') && baseLog('info', namespace, args),
    debug: (...args) => shouldLog('debug') && baseLog('debug', namespace, args),
    trace: (...args) => shouldLog('trace') && baseLog('trace', namespace, args),
    once: (key, ...args) => {
      if (!onceKeys.has(namespace + ':' + key) && shouldLog('info')) {
        onceKeys.add(namespace + ':' + key);
        baseLog('info', namespace, args);
      }
    }
  };
}

export const Logger = {
  setLevel(level) {
    CONFIG.level = (level || '').toString().toLowerCase();
    localStorage.setItem('stbviewer.log.level', CONFIG.level);
  },
  enable(patterns) {
    const arr = Array.isArray(patterns)
      ? patterns
      : (patterns || '*').split(',');
    CONFIG.namespaces = arr.map((s) => s.trim()).filter(Boolean);
    nsRules = CONFIG.namespaces.map(patternToRegex);
    localStorage.setItem(
      'stbviewer.log.namespaces',
      CONFIG.namespaces.join(',')
    );
  },
  getLevel() {
    return CONFIG.level;
  },
  getNamespaces() {
    return CONFIG.namespaces.slice();
  },
  getHistory() {
    return HISTORY.slice();
  },
  clearHistory() {
    HISTORY.length = 0;
  }
};

// デバッグ用にグローバル公開
if (typeof window !== 'undefined') {
  window.AppLogger = Logger;
}
