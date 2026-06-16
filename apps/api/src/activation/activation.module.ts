import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { ActivationController } from "./activation.controller";
import { ActivationService } from "./activation.service";

@Module({
  imports: [MailModule],
  controllers: [
    ActivationController,
  ],
  providers: [
    ActivationService,
  ],
})
export class ActivationModule {}
