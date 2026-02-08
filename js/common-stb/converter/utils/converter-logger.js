/**
 * Logger Utility for STB Version Converter
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class Logger {
  constructor() {
    this.level = LOG_LEVELS.INFO;
    this.warnings = [];
    this.errors = [];
  }

  setLevel(level) {
    this.level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
  }

  debug(...args) {
    if (this.level <= LOG_LEVELS.DEBUG) {
    }
  }

  info(...args) {
    if (this.level <= LOG_LEVELS.INFO) {
    }
  }

  warn(...args) {
    const message = args.join(' ');
    this.warnings.push(message);
    if (this.level <= LOG_LEVELS.WARN) {
      console.warn('[WARN]', ...args);
    }
  }

  error(...args) {
    const message = args.join(' ');
    this.errors.push(message);
    if (this.level <= LOG_LEVELS.ERROR) {
      console.error('[ERROR]', ...args);
    }
  }

  getWarnings() {
    return [...this.warnings];
  }

  getErrors() {
    return [...this.errors];
  }

  clear() {
    this.warnings = [];
    this.errors = [];
  }

  getSummary() {
    return {
      warnings: this.warnings.length,
      errors: this.errors.length,
      warningMessages: this.getWarnings(),
      errorMessages: this.getErrors(),
    };
  }
}

// Singleton instance
const logger = new Logger();

export default logger;
export { Logger, LOG_LEVELS };
