import { generateRequestId } from '@/lib/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We need to test the logger with a fresh instance
describe('Logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Logger: any;

  beforeEach(async () => {
    // Reset modules to get a fresh logger instance
    vi.resetModules();
    // Override LOG_LEVEL for these tests
    process.env.LOG_LEVEL = 'debug';
    process.env.NODE_ENV = 'development';

    const loggerModule = await import('@/lib/logger');
    Logger = loggerModule.logger;

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.env.LOG_LEVEL = 'error';
    process.env.NODE_ENV = 'test';
  });

  describe('log levels', () => {
    it('should log info messages', () => {
      Logger.info('Test info message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
      Logger.warn('Test warning message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log error messages', () => {
      Logger.error('Test error message', new Error('Test error'));
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log debug messages', () => {
      Logger.debug('Test debug message');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('context', () => {
    it('should include context in logs', () => {
      Logger.info('Test with context', { userId: '123', source: 'test' });
      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('Test with context');
    });

    it('should handle request IDs', () => {
      Logger.info('Request log', { requestId: 'req_123' });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('child logger', () => {
    it('should create a child logger with default context', () => {
      const child = Logger.child({ requestId: 'req_abc', userId: 'user_123' });
      child.info('Child log message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should merge context in child logger', () => {
      const child = Logger.child({ requestId: 'req_abc' });
      child.info('Merged context', { source: 'additional' });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('API logging', () => {
    it('should log API requests', () => {
      Logger.api('GET', '/api/users', 200, 150);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log failed API requests as errors', () => {
      Logger.api('POST', '/api/users', 500, 200);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log client errors as warnings', () => {
      Logger.api('GET', '/api/users/123', 404, 50);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('error formatting', () => {
    it('should format Error objects', () => {
      const error = new Error('Test error');
      Logger.error('Error occurred', error);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle non-Error objects', () => {
      Logger.error('Error occurred', 'string error');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle null/undefined errors', () => {
      Logger.error('Error occurred', null);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});

describe('generateRequestId', () => {
  it('should generate unique request IDs', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    
    expect(id1).not.toBe(id2);
  });

  it('should start with req_ prefix', () => {
    const id = generateRequestId();
    expect(id.startsWith('req_')).toBe(true);
  });

  it('should have reasonable length', () => {
    const id = generateRequestId();
    expect(id.length).toBeGreaterThan(10);
    expect(id.length).toBeLessThan(30);
  });
});
