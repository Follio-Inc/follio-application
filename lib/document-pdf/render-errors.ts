import { AppError, Errors, isAppError } from '@/lib/errors';

export function toPdfRenderAppError(error: unknown): AppError {
  if (isAppError(error)) return error;

  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';

  if (name === 'TimeoutError' || /timeout/i.test(message)) {
    return Errors.externalService(
      'PDF renderer',
      'This resume took too long to generate. Please try again.'
    );
  }

  if (/Protocol error|Target closed|crash|ENOSPC|out of memory/i.test(message)) {
    return Errors.externalService('PDF renderer', 'Could not generate this PDF. Please try again.');
  }

  return Errors.externalService('PDF renderer', 'Could not generate this PDF. Please try again.');
}
