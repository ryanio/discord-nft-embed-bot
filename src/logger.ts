type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_ENV = process.env.LOG_LEVEL;
const DEBUG_ENV = process.env.DEBUG;

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const resolveMinLevel = (): LogLevel => {
  if (LOG_LEVEL_ENV === 'debug' || DEBUG_ENV === 'true') {
    return 'debug';
  }
  if (LOG_LEVEL_ENV === 'warn') {
    return 'warn';
  }
  if (LOG_LEVEL_ENV === 'error') {
    return 'error';
  }
  return 'info';
};

const minLevel: LogLevel = resolveMinLevel();

const shouldLog = (level: LogLevel) =>
  levelPriority[level] >= levelPriority[minLevel];

const formatMessage = (level: LogLevel, parts: unknown[]): string => {
  const time = new Date().toISOString();
  const text = parts
    .map((p) => {
      if (typeof p === 'string') {
        return p;
      }
      try {
        return JSON.stringify(p);
      } catch (_e) {
        return String(p);
      }
    })
    .join(' ');
  return `[${time}] [${level.toUpperCase()}] ${text}\n`;
};

const write = (level: LogLevel, parts: unknown[]) => {
  if (!shouldLog(level)) {
    return;
  }
  const message = formatMessage(level, parts);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(message);
  } else {
    process.stdout.write(message);
  }
};

export const logger = {
  debug: (...parts: unknown[]) => write('debug', parts),
  info: (...parts: unknown[]) => write('info', parts),
  warn: (...parts: unknown[]) => write('warn', parts),
  error: (...parts: unknown[]) => write('error', parts),
};

export type { LogLevel };
