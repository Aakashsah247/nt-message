import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';

@Module({
  imports: [
    /*
     * Loads variables from the root .env file.
     *
     * Because the API runs from apps/api:
     * ../../.env points to nt-message/.env
     */
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),

    /*
     * Provides PrismaService and the database health endpoint.
     */
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
