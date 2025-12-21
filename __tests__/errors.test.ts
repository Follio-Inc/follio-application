import {
    AppError,
    ErrorCode,
    Errors,
    assert,
    assertExists,
    formatZodErrors,
    handleApiError,
    isAppError,
    isZodError,
} from '@/lib/errors';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Mock the logger
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Error Utilities', () => {
  describe('AppError', () => {
    it('should create an error with default values', () => {
      const error = new AppError('Something went wrong');
      
      expect(error.message).toBe('Something went wrong');
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    it('should create an error with custom values', () => {
      const error = new AppError('Not found', ErrorCode.NOT_FOUND, 404, { id: '123' });
      
      expect(error.message).toBe('Not found');
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.details).toEqual({ id: '123' });
    });

    it('should be an instance of Error', () => {
      const error = new AppError('Test');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof AppError).toBe(true);
    });
  });

  describe('Error Factories', () => {
    it('should create bad request error', () => {
      const error = Errors.badRequest('Invalid input');
      expect(error.code).toBe(ErrorCode.BAD_REQUEST);
      expect(error.statusCode).toBe(400);
    });

    it('should create unauthorized error', () => {
      const error = Errors.unauthorized();
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.statusCode).toBe(401);
    });

    it('should create forbidden error', () => {
      const error = Errors.forbidden();
      expect(error.code).toBe(ErrorCode.FORBIDDEN);
      expect(error.statusCode).toBe(403);
    });

    it('should create not found error', () => {
      const error = Errors.notFound('User');
      expect(error.message).toBe('User not found');
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.statusCode).toBe(404);
    });

    it('should create conflict error', () => {
      const error = Errors.conflict('Email already exists');
      expect(error.code).toBe(ErrorCode.CONFLICT);
      expect(error.statusCode).toBe(409);
    });

    it('should create validation error', () => {
      const error = Errors.validation('Invalid email format');
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.statusCode).toBe(400);
    });

    it('should create rate limited error', () => {
      const error = Errors.rateLimited();
      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.statusCode).toBe(429);
    });

    it('should create internal error', () => {
      const error = Errors.internal();
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
    });

    it('should create database error', () => {
      const error = Errors.database();
      expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(error.statusCode).toBe(500);
    });

    it('should create external service error', () => {
      const error = Errors.externalService('GitHub');
      expect(error.message).toContain('GitHub');
      expect(error.code).toBe(ErrorCode.EXTERNAL_SERVICE_ERROR);
      expect(error.statusCode).toBe(502);
    });
  });

  describe('Type Guards', () => {
    it('should identify AppError', () => {
      expect(isAppError(new AppError('Test'))).toBe(true);
      expect(isAppError(new Error('Test'))).toBe(false);
      expect(isAppError('string')).toBe(false);
      expect(isAppError(null)).toBe(false);
    });

    it('should identify ZodError', () => {
      const schema = z.object({ name: z.string() });
      
      try {
        schema.parse({ name: 123 });
      } catch (error) {
        expect(isZodError(error)).toBe(true);
      }
      
      expect(isZodError(new Error('Test'))).toBe(false);
    });
  });

  describe('formatZodErrors', () => {
    it('should format Zod errors correctly', () => {
      const schema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
      });

      try {
        schema.parse({ name: '', email: 'invalid' });
      } catch (error) {
        if (isZodError(error)) {
          const formatted = formatZodErrors(error);
          expect(formatted).toHaveProperty('name');
          expect(formatted).toHaveProperty('email');
        }
      }
    });

    it('should handle nested paths', () => {
      const schema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      });

      try {
        schema.parse({ user: { email: 'invalid' } });
      } catch (error) {
        if (isZodError(error)) {
          const formatted = formatZodErrors(error);
          expect(formatted).toHaveProperty('user.email');
        }
      }
    });
  });

  describe('handleApiError', () => {
    it('should handle AppError', async () => {
      const error = Errors.notFound('User');
      const response = handleApiError(error);
      
      expect(response.status).toBe(404);
      
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should handle ZodError', async () => {
      const schema = z.object({ name: z.string() });
      
      try {
        schema.parse({ name: 123 });
      } catch (error) {
        const response = handleApiError(error);
        expect(response.status).toBe(400);
        
        const body = await response.json();
        expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      }
    });

    it('should handle Prisma unique constraint error', async () => {
      const error = { code: 'P2002', message: 'Unique constraint failed' };
      const response = handleApiError(error);
      
      expect(response.status).toBe(409);
    });

    it('should handle Prisma not found error', async () => {
      const error = { code: 'P2025', message: 'Record not found' };
      const response = handleApiError(error);
      
      expect(response.status).toBe(404);
    });

    it('should handle generic Error', async () => {
      const error = new Error('Something went wrong');
      const response = handleApiError(error);
      
      expect(response.status).toBe(500);
    });

    it('should handle unknown errors', async () => {
      const response = handleApiError('string error');
      
      expect(response.status).toBe(500);
      
      const body = await response.json();
      expect(body.success).toBe(false);
    });
  });

  describe('assert', () => {
    it('should not throw when condition is true', () => {
      expect(() => assert(true, 'Should not throw')).not.toThrow();
    });

    it('should throw AppError when condition is false', () => {
      expect(() => assert(false, 'Condition failed')).toThrow(AppError);
    });

    it('should throw with custom error code', () => {
      try {
        assert(false, 'Not found', ErrorCode.NOT_FOUND);
      } catch (error) {
        expect(isAppError(error)).toBe(true);
        if (isAppError(error)) {
          expect(error.code).toBe(ErrorCode.NOT_FOUND);
          expect(error.statusCode).toBe(404);
        }
      }
    });
  });

  describe('assertExists', () => {
    it('should not throw when value exists', () => {
      expect(() => assertExists('value')).not.toThrow();
      expect(() => assertExists(0)).not.toThrow();
      expect(() => assertExists(false)).not.toThrow();
    });

    it('should throw when value is null', () => {
      expect(() => assertExists(null, 'User')).toThrow(AppError);
    });

    it('should throw when value is undefined', () => {
      expect(() => assertExists(undefined, 'User')).toThrow(AppError);
    });

    it('should include resource name in error message', () => {
      try {
        assertExists(null, 'User');
      } catch (error) {
        expect(isAppError(error)).toBe(true);
        if (isAppError(error)) {
          expect(error.message).toContain('User');
        }
      }
    });
  });
});
