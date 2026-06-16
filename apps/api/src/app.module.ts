import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { ActivationModule } from "./activation/activation.module";

/*
 * These imports connect the main application
 * with the authentication, database, and employee modules.
 */
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./database/prisma.module";
import { EmployeesModule } from "./employees/employees.module";

@Module({
  imports: [
    /*
     * Loads environment variables from the root .env file.
     */
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        "../../.env",
        ".env",
      ],
    }),

    //Makes Prisma database access available.
    PrismaModule,

    //Provides login, JWT, guards, and session management.
    AuthModule,

    // Provides employee create and list APIs.
    EmployeesModule,
    ActivationModule,
  ],

  controllers: [
    AppController,
  ],

  providers: [
    AppService,
  ],
})
export class AppModule {}