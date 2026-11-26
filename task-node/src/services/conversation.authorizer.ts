import type { ConversationId, UserId } from '../types/ids.js';

/**
 * Boundary for "may this user access this conversation?". Laravel owns conversation
 * membership; Node never keeps its own copy. The production implementation is plugged in
 * once the Laravel contract is agreed (see README, "Laravel integration requirements").
 */
export interface ConversationAuthorizer {
  readonly name: string;
  canAccess(userId: UserId, conversationId: ConversationId): Promise<boolean>;
}

/** Secure default until the Laravel membership check exists: every join is refused. */
export class DenyAllConversationAuthorizer implements ConversationAuthorizer {
  readonly name = 'deny-all';

  async canAccess(): Promise<boolean> {
    return false;
  }
}

/**
 * Local-development only: lets any authenticated user join any conversation so the chat
 * flow can be exercised without Laravel. Config validation forbids it in production.
 */
export class AllowAllDevConversationAuthorizer implements ConversationAuthorizer {
  readonly name = 'allow-all-dev';

  async canAccess(): Promise<boolean> {
    return true;
  }
}
