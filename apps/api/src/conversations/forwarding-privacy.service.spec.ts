import type { PrismaService } from '../database/prisma.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService forwarded-message privacy', () => {
  const service = new ConversationsService(
    {} as PrismaService,
    {} as never,
    {} as never,
  );

  const presentation = service as unknown as {
    getForwardedMessagePresentation: (payload: unknown) => unknown;
    getPublicMessagePayload: (payload: unknown) => unknown;
  };

  it('exposes only the forwarded state to conversation recipients', () => {
    const result = presentation.getForwardedMessagePresentation({
      forwardedFrom: {
        sourceMessageId: 'message-source',
        sourceConversationId: 'private-source',
        originalSenderAccountId: 'account-source',
        originalSenderDisplayName: 'Private Sender',
        originalSentAt: '2026-07-30T12:00:00.000Z',
        originalTextContent: 'Private source text',
      },
    });

    expect(result).toEqual({ isForwarded: true });
    expect(result).not.toHaveProperty('sourceConversationId');
    expect(result).not.toHaveProperty('originalSenderAccountId');
    expect(result).not.toHaveProperty('originalSenderDisplayName');
    expect(result).not.toHaveProperty('originalTextContent');
  });


  it('removes private forward provenance from the public message payload', () => {
    const result = presentation.getPublicMessagePayload({
      attachmentCount: 1,
      forwardedFrom: {
        sourceMessageId: 'message-source',
        sourceConversationId: 'private-source',
        originalSenderAccountId: 'account-source',
        originalSenderDisplayName: 'Private Sender',
        originalSentAt: '2026-07-30T12:00:00.000Z',
        originalTextContent: 'Private source text',
      },
    });

    expect(result).toEqual({ attachmentCount: 1 });
  });

  it('returns no forwarded state for malformed provenance', () => {
    expect(
      presentation.getForwardedMessagePresentation({
        forwardedFrom: { sourceMessageId: 'message-source' },
      }),
    ).toBeNull();
  });
});
