import type { ErrorCode } from '@lemuria/shared';

/**
 * The only error type routes should throw. Everything else that escapes a
 * handler is treated as an unexpected fault, logged with its stack, and
 * reported to the client as a bare INTERNAL_ERROR (spec §34).
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  /** Set false for faults worth paging on; true for ordinary business rejections. */
  readonly expected: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    options: { details?: unknown; expected?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = options.details;
    this.expected = options.expected ?? true;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError('VALIDATION_ERROR', message, 400, { details });

export const unauthenticated = (message = 'Sign in to continue') =>
  new AppError('UNAUTHENTICATED', message, 401);

export const forbidden = (message = 'You do not have access to this action') =>
  new AppError('FORBIDDEN', message, 403);

export const notFound = (what = 'Record') => new AppError('NOT_FOUND', `${what} not found`, 404);

export const conflict = (message: string, details?: unknown) =>
  new AppError('CONFLICT', message, 409, { details });

export const duplicateDetected = (message: string, details: unknown) =>
  new AppError('DUPLICATE_DETECTED', message, 409, { details });

export const invalidTransition = (message: string, details?: unknown) =>
  new AppError('INVALID_STATE_TRANSITION', message, 422, { details });

export const aiReviewRequired = (message = 'This content must be approved before it is sent') =>
  new AppError('AI_REVIEW_REQUIRED', message, 422);

export const dependencyFailure = (message: string, cause?: unknown) =>
  new AppError('DEPENDENCY_FAILURE', message, 502, { expected: false, cause });

export const internal = (message = 'Something went wrong', cause?: unknown) =>
  new AppError('INTERNAL_ERROR', message, 500, { expected: false, cause });

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
