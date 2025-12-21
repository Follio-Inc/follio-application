/**
 * Structured Logging Utility
 *
 * Provides consistent, structured logging across the application.
 * Supports different log levels, contexts, and metadata.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('User logged in', { userId: '123' });
 *   logger.error('Failed to fetch data', { error, endpoint: '/api/users' });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** Unique request/trace ID for correlation */
  requestId?: string;
  /** User ID if authenticated */
  userId?: string;
  /** The component/module/service generating the log */
  source?: string;
  /** HTTP method if applicable */
  method?: string;
  /** URL path if applicable */
  path?: string;
  /** HTTP status code if applicable */
  statusCode?: number;
  /** Duration in milliseconds */
  duration?: number;
  /** Any additional metadata */
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private minLevel: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || (this.isDevelopment ? 'debug' : 'info');
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private formatError(error: unknown): LogEntry['error'] | undefined {
    if (!error) return undefined;

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined,
      };
    }

    return {
      name: 'UnknownError',
      message: String(error),
    };
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = context;
    }

    if (error) {
      entry.error = this.formatError(error);
    }

    return entry;
  }

  private output(entry: LogEntry): void {
    if (this.isDevelopment) {
      // Pretty print in development
      const color = {
        debug: '\x1b[36m', // cyan
        info: '\x1b[32m', // green
        warn: '\x1b[33m', // yellow
        error: '\x1b[31m', // red
      };
      const reset = '\x1b[0m';

      const prefix = `${color[entry.level]}[${entry.level.toUpperCase()}]${reset}`;
      const timestamp = `\x1b[90m${entry.timestamp}\x1b[0m`;

      console.log(`${timestamp} ${prefix} ${entry.message}`);

      if (entry.context && Object.keys(entry.context).length > 0) {
        console.log('  Context:', JSON.stringify(entry.context, null, 2));
      }

      if (entry.error) {
        console.log('  Error:', entry.error.message);
        if (entry.error.stack) {
          console.log('  Stack:', entry.error.stack);
        }
      }
    } else {
      // JSON output in production for log aggregation tools
      console.log(JSON.stringify(entry));
    }
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog('debug')) return;
    this.output(this.createLogEntry('debug', message, context));
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    this.output(this.createLogEntry('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog('warn')) return;
    this.output(this.createLogEntry('warn', message, context));
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    if (!this.shouldLog('error')) return;
    this.output(this.createLogEntry('error', message, context, error));
  }

  /**
   * Create a child logger with preset context
   * Useful for adding request-specific context to all logs
   */
  child(defaultContext: LogContext): ChildLogger {
    return new ChildLogger(this, defaultContext);
  }

  /**
   * Log API request/response
   */
  api(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    context?: LogContext
  ): void {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const message = `${method} ${path} ${statusCode} ${duration}ms`;

    this.output(
      this.createLogEntry(level, message, {
        ...context,
        method,
        path,
        statusCode,
        duration,
      })
    );
  }
}

class ChildLogger {
  constructor(
    private parent: Logger,
    private defaultContext: LogContext
  ) {}

  private mergeContext(context?: LogContext): LogContext {
    return { ...this.defaultContext, ...context };
  }

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    this.parent.error(message, error, this.mergeContext(context));
  }
}

// Singleton instance
export const logger = new Logger();

// Helper to generate unique request IDs
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}
