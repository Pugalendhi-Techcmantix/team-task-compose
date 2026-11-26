import type { z } from 'zod';
import { AppError, ErrorCode, toErrorDetails } from './errors.js';

/** Validates untrusted input, throwing INVALID_PAYLOAD with client-safe details. */
export function parsePayload<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(ErrorCode.INVALID_PAYLOAD, undefined, toErrorDetails(result.error.issues));
  }
  return result.data;
}
