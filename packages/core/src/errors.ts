export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
  }
}
export function safeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  // Never copy provider, validation or database error messages: they can contain input.
  return new AppError("INTERNAL_ERROR", 500);
}
