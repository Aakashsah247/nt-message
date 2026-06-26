import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

export class MessagingSocketAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly configService: ConfigService,
  ) {
    super(app);
  }

  createIOServer(
    port: number,
    options?: ServerOptions,
  ): Server {
    const webOrigin =
      this.configService.get<string>('WEB_ORIGIN') ??
      'http://localhost:5173';

    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: webOrigin,
        credentials: true,
        methods: ['GET', 'POST'],
      },
    }) as Server;
  }
}
