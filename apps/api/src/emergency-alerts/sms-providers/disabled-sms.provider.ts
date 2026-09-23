import { Injectable } from '@nestjs/common';

import type {
  SmsProvider,
  SmsProviderSendInput,
  SmsProviderSendResult,
} from './sms-provider.interface';

@Injectable()
export class DisabledSmsProvider implements SmsProvider {
  readonly providerName = 'SmsDeliveryDisabled';

  send(input: SmsProviderSendInput): Promise<SmsProviderSendResult> {
    void input;

    return Promise.resolve({
      status: 'FAILED',
      providerMessageId: null,
      error:
        'Real SMS delivery is not configured for this production deployment.',
    });
  }
}
