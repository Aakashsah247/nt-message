import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import {
  ActivationService,
  type RequestOtpResult,
  type VerifyOtpResult,
} from "./activation.service";
import { RequestActivationOtpDto } from "./dto/request-activation-otp.dto";
import { VerifyActivationOtpDto } from "./dto/verify-activation-otp.dto";

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
  ): Promise<RequestOtpResult> {
    return this.activationService
      .requestOtp(dto);
  }

  @Post("verify-otp")
  @HttpCode(HttpStatus.OK)
  verifyOtp(
    @Body()
    dto: VerifyActivationOtpDto,
  ): Promise<VerifyOtpResult> {
    return this.activationService
      .verifyOtp(dto);
  }
}