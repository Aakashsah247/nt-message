import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { ActivationInvitationsService } from '../activation-invitations/activation-invitations.service';
import { GetActivationInvitationDto } from '../activation-invitations/dto/get-activation-invitation.dto';

import {
  ActivationService,
  type CompleteActivationResult,
  type RequestOtpResult,
  type VerifyOtpResult,
} from './activation.service';
import { CompleteActivationDto } from './dto/complete-activation.dto';
import { RequestActivationOtpDto } from './dto/request-activation-otp.dto';
import { VerifyActivationOtpDto } from './dto/verify-activation-otp.dto';
import { RateLimit } from '../security/rate-limit.decorator';
import { RateLimitGuard } from '../security/rate-limit.guard';

@Controller('activation')
@UseGuards(RateLimitGuard)
export class ActivationController {
  constructor(
    private readonly activationService: ActivationService,
    private readonly activationInvitationsService: ActivationInvitationsService,
  ) {}

  @Get('invitation')
  getInvitationPreview(@Query() dto: GetActivationInvitationDto) {
    return this.activationInvitationsService.getInvitationPreview(dto.token);
  }

  @Post('request-otp')
  @RateLimit({
    scope: 'activation-otp-request',
    limit: 5,
    windowMs: 10 * 60_000,
    keys: ['ip', 'identity'],
  })
  @HttpCode(HttpStatus.OK)
  requestOtp(
    @Body()
    dto: RequestActivationOtpDto,

    @Req()
    request: Request,
  ): Promise<RequestOtpResult> {
    return this.activationService.requestOtp(dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }

  @Post('verify-otp')
  @RateLimit({
    scope: 'activation-otp-verify',
    limit: 10,
    windowMs: 10 * 60_000,
    keys: ['ip', 'identity'],
  })
  @HttpCode(HttpStatus.OK)
  verifyOtp(
    @Body()
    dto: VerifyActivationOtpDto,
  ): Promise<VerifyOtpResult> {
    return this.activationService.verifyOtp(dto);
  }

  @Post('complete')
  @RateLimit({
    scope: 'activation-complete',
    limit: 5,
    windowMs: 15 * 60_000,
    keys: ['ip', 'identity'],
  })
  @HttpCode(HttpStatus.CREATED)
  completeActivation(
    @Body()
    dto: CompleteActivationDto,

    @Req()
    request: Request,
  ): Promise<CompleteActivationResult> {
    return this.activationService.completeActivation(dto, {
      ipAddress: request.ip ?? request.socket.remoteAddress ?? null,

      userAgent: request.get('user-agent') ?? null,
    });
  }
}
