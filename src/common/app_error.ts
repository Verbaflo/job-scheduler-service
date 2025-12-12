export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'LOCK_NOT_ACQUIRED'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL'
  | 'HTTP_ERROR'
  | 'APPLICATION_ERROR';

export class AppError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(args: {
    message: string;
    status?: number;
    code?: ErrorCode;
    details?: Record<string, unknown>;
    isOperational?: boolean;
  }) {
    super(args.message);
    this.name = this.constructor.name;
    this.status = args.status ?? 500;
    this.code = args.code ?? 'INTERNAL';
    this.details = args.details;
    this.isOperational = args.isOperational ?? true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
