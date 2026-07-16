import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
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

@Controller('activation')
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
  @HttpCode(HttpStatus.OK)
  verifyOtp(
    @Body()
    dto: VerifyActivationOtpDto,
  ): Promise<VerifyOtpResult> {
    return this.activationService.verifyOtp(dto);
  }

  @Post('complete')
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
