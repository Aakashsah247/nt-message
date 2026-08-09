import type { MessageRequestReason } from '../generated/prisma/enums';

export function requiresMessageRequestApproval(
  requestReason: MessageRequestReason | null,
  recipientRequiresMessageRequests: boolean,
): boolean {
  /*
   * Existing hierarchy and cross-scope rules still decide whether a request
   * would normally be required. The recipient preference only waives that
   * approval step; it never bypasses blocking, eligibility or canonical-chat
   * checks performed by ConversationsService.
   */
  return requestReason !== null && recipientRequiresMessageRequests;
}
