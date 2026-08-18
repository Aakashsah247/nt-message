declare module 'web-push' {
  export interface PushSubscription {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }

  export interface SendResult {
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }

  export interface SendOptions {
    TTL?: number;
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
    topic?: string;
    vapidDetails?: {
      subject: string;
      publicKey: string;
      privateKey: string;
    };
  }

  export interface WebPushError extends Error {
    statusCode?: number;
    body?: string;
  }

  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer | null,
    options?: SendOptions,
  ): Promise<SendResult>;
}
