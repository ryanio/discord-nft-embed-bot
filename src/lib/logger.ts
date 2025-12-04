import { inspect } from "node:util";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_ENV = process.env.LOG_LEVEL;

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const resolveMinLevel = (): LogLevel => {
  if (LOG_LEVEL_ENV === "debug") {
    return "debug";
  }
  if (LOG_LEVEL_ENV === "warn") {
    return "warn";
  }
  if (LOG_LEVEL_ENV === "error") {
    return "error";
  }
  return "info";
};

const minLevel: LogLevel = resolveMinLevel();

const shouldLog = (level: LogLevel): boolean =>
  levelPriority[level] >= levelPriority[minLevel];

/**
 * Check if debug logging is enabled
 */
export const isDebugEnabled = (): boolean => minLevel === "debug";

/**
 * Serialize a value for logging
 */
const serialize = (arg: unknown): string => {
  if (typeof arg === "string") {
    return arg;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return inspect(arg, { depth: 3, breakLength: 120 });
  }
};

const formatMessage = (
  level: LogLevel,
  prefix: string,
  parts: unknown[]
): string => {
  const time = new Date().toISOString();
  const text = parts.map(serialize).join(" ");
  const prefixParts = prefix.split(":").map((p) => `[${p}]`);
  return `${time} [${level.toUpperCase()}] ${prefixParts.join(" ")} ${text}\n`;
};

const write = (level: LogLevel, prefix: string, parts: unknown[]) => {
  if (!shouldLog(level)) {
    return;
  }
  const message = formatMessage(level, prefix, parts);
  if (level === "error" || level === "warn") {
    process.stderr.write(message);
  } else {
    process.stdout.write(message);
  }
};

/** Default logger prefix */
const DEFAULT_PREFIX = "Embed";

/**
 * Main logger instance
 */
export const logger = {
  debug: (...parts: unknown[]) => write("debug", DEFAULT_PREFIX, parts),
  info: (...parts: unknown[]) => write("info", DEFAULT_PREFIX, parts),
  warn: (...parts: unknown[]) => write("warn", DEFAULT_PREFIX, parts),
  error: (...parts: unknown[]) => write("error", DEFAULT_PREFIX, parts),
};

/**
 * Create a prefixed logger for a specific module
 */
export const createLogger = (prefix: string) => {
  const fullPrefix = `${DEFAULT_PREFIX}:${prefix}`;
  return {
    debug: (...parts: unknown[]) => write("debug", fullPrefix, parts),
    info: (...parts: unknown[]) => write("info", fullPrefix, parts),
    warn: (...parts: unknown[]) => write("warn", fullPrefix, parts),
    error: (...parts: unknown[]) => write("error", fullPrefix, parts),
  };
};

export type { LogLevel };
