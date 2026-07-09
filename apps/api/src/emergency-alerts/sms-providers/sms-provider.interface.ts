export type SmsProviderSendStatus = 'SENT' | 'FAILED';

export interface SmsProviderSendInput {
  to: string;
  message: string;
}

export interface SmsProviderSendResult {
  status: SmsProviderSendStatus;
  providerMessageId: string | null;
  error: string | null;
}

export interface SmsProvider {
  readonly providerName: string;

  send(input: SmsProviderSendInput): Promise<SmsProviderSendResult>;
}

export const SMS_PROVIDER = 'SMS_PROVIDER';
