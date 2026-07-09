import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type {
  SmsProvider,
  SmsProviderSendInput,
  SmsProviderSendResult,
} from './sms-provider.interface';

@Injectable()
export class MockSmsProvider implements SmsProvider {
  readonly providerName = 'MockSmsProvider';

  private readonly logger = new Logger(MockSmsProvider.name);

  async send(input: SmsProviderSendInput): Promise<SmsProviderSendResult> {
    // Mock provider keeps local development safe while preserving real SMS flow.
    this.logger.log(`Mock SMS sent to ${this.maskPhone(input.to)}`);

    return {
      status: 'SENT',
      providerMessageId: `mock-${randomUUID()}`,
      error: null,
    };
  }

  private maskPhone(phoneNumber: string): string {
    return phoneNumber.length <= 6
      ? 'hidden'
      : `${phoneNumber.slice(0, 4)}******${phoneNumber.slice(-2)}`;
  }
}
