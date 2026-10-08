export type AppErrorKind =
  | 'configuration'
  | 'network'
  | 'timeout'
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not-found'
  | 'conflict'
  | 'server'
  | 'cancelled'
  | 'unknown';

export interface AppErrorOptions {
  kind: AppErrorKind;
  message: string;
  status?: number;
  code?: string;
  detail?: string;
  traceId?: string;
  retryable?: boolean;
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly detail: string | undefined;
  readonly traceId: string | undefined;
  readonly retryable: boolean;
  readonly fieldErrors: Readonly<Record<string, readonly string[]>> | undefined;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.detail = options.detail;
    this.traceId = options.traceId;
    this.retryable = options.retryable ?? false;
    this.fieldErrors = options.fieldErrors;
  }
}
