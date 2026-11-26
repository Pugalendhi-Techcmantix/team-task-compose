import { z } from 'zod';

/**
 * Identifier format shared with Laravel (users, conversations, tasks).
 * Laravel's default auto-increment keys are positive integers. If Laravel switches to
 * UUIDs/ULIDs, this is the single place to change.
 */
export const entityIdSchema = z
  .number({ invalid_type_error: 'must be a number', required_error: 'is required' })
  .int('must be an integer')
  .positive('must be positive')
  .max(Number.MAX_SAFE_INTEGER, 'is too large');

/** Accepts numeric strings too: JWT `sub` claims are strings by spec ("25"). */
export const entityIdFromClaimSchema = z.union([
  entityIdSchema,
  z
    .string()
    .regex(/^[1-9][0-9]{0,15}$/, 'must be a positive integer')
    .transform(Number)
    .pipe(entityIdSchema),
]);

export type UserId = number;
export type ConversationId = number;
export type TaskId = number;
