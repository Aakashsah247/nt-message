import { BadRequestException } from '@nestjs/common';

import {
  assertTrustedMessagingPushEndpoint,
  resolveAllowedPushHostSuffixes,
} from './messaging-push-endpoint.policy';

describe('messaging push endpoint policy', () => {
  const allowed = resolveAllowedPushHostSuffixes(undefined);

  it.each([
    'https://127.0.0.1/push',
    'https://10.0.0.1/push',
    'https://localhost/push',
    'https://example.com/push',
    'http://fcm.googleapis.com/push',
    'https://fcm.googleapis.com:8443/push',
  ])('rejects untrusted endpoint %s', (endpoint) => {
    expect(() => assertTrustedMessagingPushEndpoint(endpoint, allowed)).toThrow(
      BadRequestException,
    );
  });

  it.each([
    'https://fcm.googleapis.com/fcm/send/example',
    'https://updates.push.services.mozilla.com/wpush/v2/example',
    'https://web.push.apple.com/example',
    'https://wns2-bl2p.notify.windows.com/w/?token=example',
  ])('accepts known browser push service endpoint %s', (endpoint) => {
    expect(() =>
      assertTrustedMessagingPushEndpoint(endpoint, allowed),
    ).not.toThrow();
  });

  it('supports an explicit deployment allow-list without allowing sibling domains', () => {
    const configured = resolveAllowedPushHostSuffixes(
      'push.example.ntc, custom.push.example',
    );

    expect(() =>
      assertTrustedMessagingPushEndpoint(
        'https://region.push.example.ntc/subscription',
        configured,
      ),
    ).not.toThrow();

    expect(() =>
      assertTrustedMessagingPushEndpoint(
        'https://notpush.example.ntc/subscription',
        configured,
      ),
    ).toThrow(BadRequestException);
  });
});
