import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import {
  ActivationService,
} from "./activation.service";
import { RequestActivationOtpDto } from "./dto/request-activation-otp.dto";

@Controller("activation")
export class ActivationController {
  constructor(
    private readonly activationService:
      ActivationService,
  ) {}

  @Post("request-otp")
  @HttpCode(HttpStatus.OK)
  requestOtp(
    @Body()
    dto: RequestActivationOtpDto,
  ) {
    return this.activationService
      .requestOtp(dto);
  }
}