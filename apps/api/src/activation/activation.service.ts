import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import * as argon2 from "argon2";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { PrismaService } from "../database/prisma.service";

import {
  AccountRole,
  EmployeeStatus,
  OtpPurpose,
} from "../generated/prisma/client";

import { MailService } from "../mail/mail.service";
import { RequestActivationOtpDto } from "./dto/request-activation-otp.dto";
import { VerifyActivationOtpDto } from "./dto/verify-activation-otp.dto";
import { CompleteActivationDto } from "./dto/complete-activation.dto";

export interface RequestOtpResult {
  message: string;
  expiresInSeconds: number;
}
export interface VerifyOtpResult {
  message: string;
  activationToken: string;
  expiresInSeconds: number;

  employee: {
    id: string;
    empId: string;
    empName: string;
    officialEmail: string;
  };
}

export interface CompleteActivationResult {
  message: string;

  employee: {
    id: string;
    empId: string;
    empName: string;
    officialEmail: string;
    isActivated: boolean;
  };

  account: {
    id: string;
    username: string | null;
    role: AccountRole;
    isEnabled: boolean;
  };
}

interface ActivationTokenPayload {
  sub: string;
  otpVerificationId: string;
  type: "account_activation";
  jti?: string;
  iat?: number;
  exp?: number;
}

type CompletionOutcome =
  | {
      status: "invalid";
    }
  | {
      status: "inactive";
    }
  | {
      status: "activated";
    }
  | {
      status: "username_conflict";
    }
  | {
      status: "completed";

      employee: {
        id: string;
        empId: string;
        empName: string;
        officialEmail: string;
        isActivated: boolean;
      };

      account: {
        id: string;
        username: string | null;
        role: AccountRole;
        isEnabled: boolean;
      };
    };

type VerificationOutcome =
  | {
      status: "invalid";
    }
  | {
      status: "inactive";
    }
  | {
      status: "activated";
    }
  | {
      status: "verified";
      otpVerificationId: string;

      employee: {
        id: string;
        empId: string;
        empName: string;
        officialEmail: string;
      };
    };

@Injectable()
export class ActivationService {
  private readonly otpHashSecret: string;
  private readonly otpTtlMinutes: number;
  private readonly resendCooldownSeconds: number;
  private readonly maxAttempts: number;

  private readonly activationTokenSecret: string;
  private readonly activationTokenTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
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

    this.activationTokenSecret =
      configService.getOrThrow<string>(
        "ACTIVATION_TOKEN_SECRET",
      );

    this.activationTokenTtlSeconds =
      this.readPositiveInteger(
        configService,
        "ACTIVATION_TOKEN_TTL_SECONDS",
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
          this.resendCooldownSeconds * 1000,
      );

    const recentOtp =
      await this.prisma.otpVerification.findFirst({
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

    const otpHash =
      this.hashOtp(
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
        this.prisma.otpVerification.updateMany({
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
      await this.mailService.sendActivationOtp({
        to: employee.officialEmail,
        employeeName: employee.empName,
        otp,
        expiresInMinutes:
          this.otpTtlMinutes,
      });
    } catch (error) {
      // Unsent OTP must not remain valid.
      await this.prisma.otpVerification.update({
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

  async verifyOtp(
    dto: VerifyActivationOtpDto,
  ): Promise<VerifyOtpResult> {
    const empId =
      dto.empId.trim().toUpperCase();

    const phoneNumber =
      dto.phoneNumber.trim();

    const officialEmail =
      dto.officialEmail
        .trim()
        .toLowerCase();

    const otp = dto.otp.trim();
    const now = new Date();

    const outcome: VerificationOutcome =
      await this.prisma.$transaction(
        async (transaction) => {
          const employee =
            await transaction.employee.findFirst({
              where: {
                empId,
                phoneNumber,
                officialEmail,
              },

              select: {
                id: true,
                empId: true,
                empName: true,
                officialEmail: true,
                status: true,
                isActivated: true,
              },
            });

          if (!employee) {
            return {
              status: "invalid",
            };
          }

          if (
            employee.status ===
            EmployeeStatus.INACTIVE
          ) {
            return {
              status: "inactive",
            };
          }

          if (employee.isActivated) {
            return {
              status: "activated",
            };
          }

          const otpRecord =
            await transaction.otpVerification
              .findFirst({
                where: {
                  employeeId: employee.id,
                  purpose:
                    OtpPurpose.ACCOUNT_ACTIVATION,
                  consumedAt: null,
                },

                orderBy: {
                  createdAt: "desc",
                },
              });

          if (!otpRecord) {
            return {
              status: "invalid",
            };
          }

          const otpCannotBeUsed =
            otpRecord.expiresAt <= now ||
            otpRecord.attemptCount >=
              otpRecord.maxAttempts;

          if (otpCannotBeUsed) {
            await transaction.otpVerification
              .updateMany({
                where: {
                  id: otpRecord.id,
                  consumedAt: null,
                },

                data: {
                  consumedAt: now,
                },
              });

            return {
              status: "invalid",
            };
          }

          const incomingHash =
            this.hashOtp(
              employee.id,
              otp,
            );

          const otpMatches =
            this.hashesMatch(
              otpRecord.otpHash,
              incomingHash,
            );

          if (!otpMatches) {
            const nextAttempt =
              otpRecord.attemptCount + 1;

            await transaction.otpVerification
              .updateMany({
                where: {
                  id: otpRecord.id,
                  consumedAt: null,
                },

                data: {
                  attemptCount: {
                    increment: 1,
                  },

                  ...(nextAttempt >=
                  otpRecord.maxAttempts
                    ? {
                        consumedAt: now,
                      }
                    : {}),
                },
              });

            return {
              status: "invalid",
            };
          }

          // Consume the OTP only once.
          const consumeResult =
            await transaction.otpVerification
              .updateMany({
                where: {
                  id: otpRecord.id,
                  consumedAt: null,

                  expiresAt: {
                    gt: now,
                  },

                  attemptCount: {
                    lt: otpRecord.maxAttempts,
                  },
                },

                data: {
                  consumedAt: now,
                },
              });

          if (consumeResult.count !== 1) {
            return {
              status: "invalid",
            };
          }

          return {
            status: "verified",
            otpVerificationId:
              otpRecord.id,

            employee: {
              id: employee.id,
              empId: employee.empId,
              empName: employee.empName,
              officialEmail:
                employee.officialEmail,
            },
          };
        },
      );

    if (outcome.status === "inactive") {
      throw new ForbiddenException(
        "This employee record is inactive.",
      );
    }

    if (outcome.status === "activated") {
      throw new ConflictException(
        "This account is already activated.",
      );
    }

    if (outcome.status === "invalid") {
      throw new UnauthorizedException(
        "The activation code is invalid or expired.",
      );
    }

    const activationToken =
      await this.jwtService.signAsync(
        {
          sub: outcome.employee.id,
          otpVerificationId:
            outcome.otpVerificationId,
          type: "account_activation",
          jti: randomUUID(),
        },

        {
          secret:
            this.activationTokenSecret,

          expiresIn:
            this.activationTokenTtlSeconds,
        },
      );

    return {
      message:
        "OTP verified successfully.",
      activationToken,
      expiresInSeconds:
        this.activationTokenTtlSeconds,
      employee: outcome.employee,
    };
  }

  async completeActivation(
  dto: CompleteActivationDto,
): Promise<CompleteActivationResult> {
  if (
    dto.password !==
    dto.confirmPassword
  ) {
    throw new BadRequestException(
      "Password confirmation does not match.",
    );
  }

  const payload =
    await this.verifyActivationToken(
      dto.activationToken,
    );

  // Hash before opening the database transaction.
  const passwordHash =
    await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

  const now = new Date();

  const outcome: CompletionOutcome =
    await this.prisma.$transaction(
      async (transaction) => {
        const employee =
          await transaction.employee.findUnique({
            where: {
              id: payload.sub,
            },

            select: {
              id: true,
              empId: true,
              empName: true,
              officialEmail: true,
              status: true,
              isActivated: true,

              account: {
                select: {
                  id: true,
                },
              },
            },
          });

        if (!employee) {
          return {
            status: "invalid",
          };
        }

        if (
          employee.status ===
          EmployeeStatus.INACTIVE
        ) {
          return {
            status: "inactive",
          };
        }

        if (
          employee.isActivated ||
          employee.account
        ) {
          return {
            status: "activated",
          };
        }

        const otpVerification =
          await transaction.otpVerification
            .findFirst({
              where: {
                id:
                  payload.otpVerificationId,

                employeeId:
                  employee.id,

                purpose:
                  OtpPurpose
                    .ACCOUNT_ACTIVATION,

                consumedAt: {
                  not: null,
                },
              },

              select: {
                id: true,
              },
            });

        if (!otpVerification) {
          return {
            status: "invalid",
          };
        }

        const username =
          employee.empId.toLowerCase();

        const existingUsername =
          await transaction.account.findUnique({
            where: {
              username,
            },

            select: {
              id: true,
            },
          });

        if (existingUsername) {
          return {
            status: "username_conflict",
          };
        }

        // Only one activation request can claim the employee.
        const activationClaim =
          await transaction.employee.updateMany({
            where: {
              id: employee.id,
              isActivated: false,
              status:
                EmployeeStatus.ACTIVE,
            },

            data: {
              isActivated: true,
            },
          });

        if (
          activationClaim.count !== 1
        ) {
          return {
            status: "activated",
          };
        }

        const account =
          await transaction.account.create({
            data: {
              employeeId:
                employee.id,

              username,

              role:
                AccountRole.EMPLOYEE,

              passwordHash,

              isEnabled: true,

              passwordChangedAt:
                now,
            },

            select: {
              id: true,
              username: true,
              role: true,
              isEnabled: true,
            },
          });

        // Invalidate other unused activation OTPs.
        await transaction.otpVerification
          .updateMany({
            where: {
              employeeId:
                employee.id,

              purpose:
                OtpPurpose
                  .ACCOUNT_ACTIVATION,

              consumedAt: null,
            },

            data: {
              consumedAt: now,
            },
          });

        return {
          status: "completed",

          employee: {
            id: employee.id,
            empId: employee.empId,
            empName:
              employee.empName,
            officialEmail:
              employee.officialEmail,
            isActivated: true,
          },

          account,
        };
      },
    );

  if (outcome.status === "invalid") {
    throw new UnauthorizedException(
      "The activation token is invalid or expired.",
    );
  }

  if (outcome.status === "inactive") {
    throw new ForbiddenException(
      "This employee record is inactive.",
    );
  }

  if (outcome.status === "activated") {
    throw new ConflictException(
      "This account is already activated.",
    );
  }

  if (
    outcome.status ===
    "username_conflict"
  ) {
    throw new ConflictException(
      "An account with this username already exists.",
    );
  }

  return {
    message:
      "Employee account activated successfully.",

    employee:
      outcome.employee,

    account:
      outcome.account,
  };
}

private async verifyActivationToken(
  activationToken: string,
): Promise<ActivationTokenPayload> {
  try {
    const payload =
      await this.jwtService
        .verifyAsync<ActivationTokenPayload>(
          activationToken,
          {
            secret:
              this.activationTokenSecret,

            algorithms: [
              "HS256",
            ],
          },
        );

    if (
      payload.type !==
        "account_activation" ||
      !payload.sub ||
      !payload.otpVerificationId
    ) {
      throw new Error(
        "Invalid activation payload.",
      );
    }

    return payload;
  } catch {
    throw new UnauthorizedException(
      "The activation token is invalid or expired.",
    );
  }
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

  private hashesMatch(
    storedHash: string,
    incomingHash: string,
  ): boolean {
    const storedBuffer =
      Buffer.from(storedHash, "hex");

    const incomingBuffer =
      Buffer.from(incomingHash, "hex");

    if (
      storedBuffer.length !==
      incomingBuffer.length
    ) {
      return false;
    }

    return timingSafeEqual(
      storedBuffer,
      incomingBuffer,
    );
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