import type { ConversationAuthorizer } from '../../services/conversation.authorizer.js';
import type { ConversationId, UserId } from '../../types/ids.js';
import type { Logger } from '../../utils/logger.js';
import { LaravelUnavailableError, type LaravelClient } from './laravel.client.js';

/**
 * Asks Laravel whether a user belongs to a conversation.
 *
 * Contract: GET {membershipPath}
 *   200 → member, unless the body says otherwise: `isMember` or `member` set to false,
 *         at the top level or under `data` (Laravel sends `{ "data": { "isMember": true } }`)
 *   403 / 404 → not a member
 *   anything else, timeouts, network errors → throws; ChatService then denies access (fail closed)
 */
export class LaravelConversationAuthorizer implements ConversationAuthorizer {
  readonly name = 'laravel';

  constructor(
    private readonly client: LaravelClient,
    private readonly membershipPath: string,
    private readonly logger: Logger
  ) {}

  async canAccess(userId: UserId, conversationId: ConversationId): Promise<boolean> {
    const response = await this.client.get(this.membershipPath, { conversationId, userId });

    if (response.status === 200) {
      return readMemberFlag(response.body) !== false;
    }
    if (response.status === 403 || response.status === 404) {
      return false;
    }

    this.logger.warn(
      {
        event: 'laravel_membership_unexpected_status',
        status: response.status,
        conversationId,
        userId,
      },
      'laravel_membership_unexpected_status'
    );
    throw new LaravelUnavailableError(`Unexpected membership status ${response.status}`);
  }
}

function readMemberFlag(body: unknown): boolean | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  const source =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : record;
  for (const key of ['isMember', 'member']) {
    if (typeof source[key] === 'boolean') return source[key];
  }
  return undefined;
}
