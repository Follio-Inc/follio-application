/**
 * Error Handling Utilities
 *
 * Provides consistent error handling patterns across the application.
 * Includes custom error classes, error response helpers, and type guards.
 *
 * Usage:
 *   import { AppError, handleApiError, isAppError } from '@/lib/errors';
 *
 *   // Throw custom errors
 *   throw new AppError('User not found', 'NOT_FOUND', 404);
 *
 *   // Handle in API routes
 *   try { ... } catch (error) { return handleApiError(error); }
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logger } from './logger';

/**
 * Error codes for consistent error identification
 */
export const ErrorCode = {
  // Client Errors (4xx)
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',

  // Server Errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Custom application error class
 */
export class AppError extends Error {
  public readonly code: ErrorCodeType;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCodeType = ErrorCode.INTERNAL_ERROR,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Predefined error factories
 */
export const Errors = {
  badRequest: (message: string, details?: Record<string, unknown>) =>
    new AppError(message, ErrorCode.BAD_REQUEST, 400, details),

  unauthorized: (message = 'Authentication required') =>
    new AppError(message, ErrorCode.UNAUTHORIZED, 401),

  forbidden: (message = 'Access denied') => new AppError(message, ErrorCode.FORBIDDEN, 403),

  notFound: (resource = 'Resource') => new AppError(`${resource} not found`, ErrorCode.NOT_FOUND, 404),

  conflict: (message: string, details?: Record<string, unknown>) =>
    new AppError(message, ErrorCode.CONFLICT, 409, details),

  validation: (message: string, details?: Record<string, unknown>) =>
    new AppError(message, ErrorCode.VALIDATION_ERROR, 400, details),

  rateLimited: (message = 'Too many requests') =>
    new AppError(message, ErrorCode.RATE_LIMITED, 429),

  internal: (message = 'An unexpected error occurred') =>
    new AppError(message, ErrorCode.INTERNAL_ERROR, 500),

  database: (message = 'Database operation failed') =>
    new AppError(message, ErrorCode.DATABASE_ERROR, 500),

  externalService: (service: string, message?: string) =>
    new AppError(
      message || `Failed to communicate with ${service}`,
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      502
    ),
};

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard to check if an error is a Zod validation error
 */
export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

/**
 * Format Zod validation errors into a readable format
 */
export function formatZodErrors(error: ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(issue.message);
  }

  return errors;
}

/**
 * API Error Response type
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  statusCode: number,
  details?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
    },
    { status: statusCode }
  );
}

/**
 * Handle errors in API routes
 * Converts various error types to standardized API responses
 */
export function handleApiError(
  error: unknown,
  context?: { path?: string; method?: string; requestId?: string }
): NextResponse<ApiErrorResponse> {
  // Log the error
  logger.error('API Error', error, {
    source: 'api',
    ...context,
  });

  // Handle AppError
  if (isAppError(error)) {
    return createErrorResponse(error.code, error.message, error.statusCode, error.details);
  }

  // Handle Zod validation errors
  if (isZodError(error)) {
    return createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Validation failed', 400, {
      errors: formatZodErrors(error),
    });
  }

  // Handle Prisma errors
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaError = error as { code: string; message: string };

    // Common Prisma error codes
    switch (prismaError.code) {
      case 'P2002': // Unique constraint violation
        return createErrorResponse(ErrorCode.CONFLICT, 'A record with this value already exists', 409);
      case 'P2025': // Record not found
        return createErrorResponse(ErrorCode.NOT_FOUND, 'Record not found', 404);
      case 'P2003': // Foreign key constraint failed
        return createErrorResponse(ErrorCode.BAD_REQUEST, 'Related record not found', 400);
      default:
        // Log unknown Prisma errors but return generic message
        logger.error('Unknown Prisma error', error, { prismaCode: prismaError.code });
    }
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    // Don't expose error messages in production
    const message =
      process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message;

    return createErrorResponse(ErrorCode.INTERNAL_ERROR, message, 500);
  }

  // Handle unknown errors
  return createErrorResponse(
    ErrorCode.INTERNAL_ERROR,
    'An unexpected error occurred',
    500
  );
}

/**
 * Wrap an async function with error handling
 * Useful for API route handlers
 */
export function withErrorHandler<T>(
  handler: () => Promise<T>,
  context?: { path?: string; method?: string }
): Promise<T | NextResponse<ApiErrorResponse>> {
  return handler().catch((error) => handleApiError(error, context));
}

/**
 * Assert a condition and throw if false
 */
export function assert(condition: unknown, message: string, code?: ErrorCodeType): asserts condition {
  if (!condition) {
    throw new AppError(message, code || ErrorCode.BAD_REQUEST, code === ErrorCode.NOT_FOUND ? 404 : 400);
  }
}

/**
 * Assert that a value is not null/undefined
 */
export function assertExists<T>(
  value: T | null | undefined,
  resource = 'Resource'
): asserts value is T {
  if (value === null || value === undefined) {
    throw Errors.notFound(resource);
  }
}
