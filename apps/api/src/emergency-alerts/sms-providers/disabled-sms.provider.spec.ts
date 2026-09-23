import { DisabledSmsProvider } from './disabled-sms.provider';

describe('DisabledSmsProvider', () => {
  it('fails closed instead of reporting a synthetic production SMS success', async () => {
    const provider = new DisabledSmsProvider();

    await expect(
      provider.send({ to: '+9779841000000', message: 'Emergency test' }),
    ).resolves.toEqual({
      status: 'FAILED',
      providerMessageId: null,
      error:
        'Real SMS delivery is not configured for this production deployment.',
    });
  });
});
