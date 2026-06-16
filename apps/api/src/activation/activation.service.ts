import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";

import { ConfigService } from "@nestjs/config";
import {
  createHmac,
  randomInt,
} from "node:crypto";

import { PrismaService } from "../database/prisma.service";
import {
  EmployeeStatus,
  OtpPurpose,
} from "../generated/prisma/client";

import { MailService } from "../mail/mail.service";
import { RequestActivationOtpDto } from "./dto/request-activation-otp.dto";

export interface RequestOtpResult {
  message: string;
  expiresInSeconds: number;
}


@Injectable()
export class ActivationService {
  private readonly otpHashSecret: string;
  private readonly otpTtlMinutes: number;
  private readonly resendCooldownSeconds: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    configService: ConfigService,
  ) {
    this.otpHashSecret =
      configService.getOrThrow<string>(
        "OTP_HASH_SECRET",
      );

    this.otpTtlMinutes =
      this.readPositiveInteger(
        configService,
        "OTP_TTL_MINUTES",
      );

    this.resendCooldownSeconds =
      this.readPositiveInteger(
        configService,
        "OTP_RESEND_COOLDOWN_SECONDS",
      );

    this.maxAttempts =
      this.readPositiveInteger(
        configService,
        "OTP_MAX_ATTEMPTS",
      );
  }

  async requestOtp(
    dto: RequestActivationOtpDto,
  ): Promise<RequestOtpResult> {
    const empId =
      dto.empId.trim().toUpperCase();

    const phoneNumber =
      dto.phoneNumber.trim();

    const officialEmail =
      dto.officialEmail
        .trim()
        .toLowerCase();

    const employee =
      await this.prisma.employee.findFirst({
        where: {
          empId,
          phoneNumber,
          officialEmail,
        },

        select: {
          id: true,
          empName: true,
          officialEmail: true,
          status: true,
          isActivated: true,
        },
      });

    /*
     * Use a generic response when employee details
     * do not match, preventing employee enumeration.
     */
    if (!employee) {
      return this.createGenericResponse();
    }

    if (
      employee.status ===
      EmployeeStatus.INACTIVE
    ) {
      throw new ForbiddenException(
        "This employee record is inactive.",
      );
    }

    if (employee.isActivated) {
      throw new ConflictException(
        "This account is already activated.",
      );
    }

    const cooldownStart =
      new Date(
        Date.now() -
          this.resendCooldownSeconds *
            1000,
      );

    const recentOtp =
      await this.prisma.otpVerification
        .findFirst({
          where: {
            employeeId: employee.id,
            purpose:
              OtpPurpose.ACCOUNT_ACTIVATION,
            consumedAt: null,
            createdAt: {
              gte: cooldownStart,
            },
          },

          select: {
            id: true,
          },
        });

    if (recentOtp) {
      throw new HttpException(
        `Wait ${this.resendCooldownSeconds} seconds before requesting another code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otp = randomInt(
      0,
      1_000_000,
    )
      .toString()
      .padStart(6, "0");

    const otpHash = this.hashOtp(
      employee.id,
      otp,
    );

    const now = new Date();

    const expiresAt =
      new Date(
        Date.now() +
          this.otpTtlMinutes *
            60 *
            1000,
      );

    const [, otpRecord] =
      await this.prisma.$transaction([
        // Invalidate previous unused activation codes.
        this.prisma.otpVerification
          .updateMany({
            where: {
              employeeId: employee.id,
              purpose:
                OtpPurpose.ACCOUNT_ACTIVATION,
              consumedAt: null,
            },

            data: {
              consumedAt: now,
            },
          }),

        this.prisma.otpVerification.create({
          data: {
            employeeId: employee.id,
            purpose:
              OtpPurpose.ACCOUNT_ACTIVATION,
            otpHash,
            maxAttempts:
              this.maxAttempts,
            expiresAt,
          },

          select: {
            id: true,
          },
        }),
      ]);

    try {
      await this.mailService
        .sendActivationOtp({
          to: employee.officialEmail,
          employeeName:
            employee.empName,
          otp,
          expiresInMinutes:
            this.otpTtlMinutes,
        });
    } catch (error) {
      // An unsent OTP must not remain usable.
      await this.prisma.otpVerification
        .update({
          where: {
            id: otpRecord.id,
          },

          data: {
            consumedAt: new Date(),
          },
        });

      throw error;
    }

    return this.createGenericResponse();
  }

  private hashOtp(
    employeeId: string,
    otp: string,
  ): string {
    return createHmac(
      "sha256",
      this.otpHashSecret,
    )
      .update(`${employeeId}:${otp}`)
      .digest("hex");
  }

  private createGenericResponse():
    RequestOtpResult {
    return {
      message:
        "If the employee details are valid, an OTP has been sent to the official email address.",

      expiresInSeconds:
        this.otpTtlMinutes * 60,
    };
  }

  private readPositiveInteger(
    configService: ConfigService,
    variableName: string,
  ): number {
    const value = Number(
      configService.getOrThrow<string>(
        variableName,
      ),
    );

    if (
      !Number.isInteger(value) ||
      value <= 0
    ) {
      throw new Error(
        `${variableName} must be a positive integer.`,
      );
    }

    return value;
  }
}
export class ActivationModule {}