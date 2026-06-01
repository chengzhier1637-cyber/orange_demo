type LogLevel = 'info' | 'warn' | 'error';
type LogMeta = Record<string, unknown>;

const SECRET_KEY_PATTERN = /(apiKey|token|secret|password|authorization)/i;
const CONTENT_KEY_PATTERN = /^(content|rawText|resumeText)$/i;

export function sanitizeLogMeta(meta: LogMeta): LogMeta {
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [sanitizeKey(key), sanitizeValue(key, value)]),
  );
}

export function createLogEntry(level: LogLevel, event: string, meta: LogMeta = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    meta: sanitizeLogMeta(meta),
  };
}

export const logger = {
  info(event: string, meta?: LogMeta) {
    console.info(JSON.stringify(createLogEntry('info', event, meta)));
  },
  warn(event: string, meta?: LogMeta) {
    console.warn(JSON.stringify(createLogEntry('warn', event, meta)));
  },
  error(event: string, meta?: LogMeta) {
    console.error(JSON.stringify(createLogEntry('error', event, meta)));
  },
};

function sanitizeKey(key: string) {
  return CONTENT_KEY_PATTERN.test(key) ? `${key}Length` : key;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) {
    return '[redacted]';
  }

  if (CONTENT_KEY_PATTERN.test(key)) {
    return typeof value === 'string' ? value.length : 0;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item));
  }

  if (value && typeof value === 'object') {
    return sanitizeLogMeta(value as LogMeta);
  }

  return value;
}
