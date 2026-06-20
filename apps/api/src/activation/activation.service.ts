import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

import {
  AccountRequestActionType,
  AccountRequestStatus,
  AccountRole,
  EmployeeStatus,
  OtpPurpose,
} from '../generated/prisma/client';

import { MailService } from '../mail/mail.service';
import { RequestActivationOtpDto } from './dto/request-activation-otp.dto';
import { VerifyActivationOtpDto } from './dto/verify-activation-otp.dto';
import { CompleteActivationDto } from './dto/complete-activation.dto';

export interface RequestOtpResult {
  message: string;
  expiresInSeconds: number;
}

interface ActivationAuditMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

type OtpPreparationOutcome =
  | {
      status: 'invalid';
    }
  | {
      status: 'inactive';
    }
  | {
      status: 'activated';
    }
  | {
      status: 'cooldown';
    }
  | {
      status: 'prepared';
      otpRecordId: string;
      otp: string;

      employee: {
        empName: string;
        officialEmail: string;
      };
    };
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

  accountRequest: {
    id: string;
    requestedRole: AccountRole;
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
  accountRequestId: string;
  requestedRole: AccountRole;
  type: 'account_activation';
  jti?: string;
  iat?: number;
  exp?: number;
}

type CompletionOutcome =
  | {
      status: 'invalid';
    }
  | {
      status: 'inactive';
    }
  | {
      status: 'activated';
    }
  | {
      status: 'username_conflict';
    }
  | {
      status: 'completed';

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
      status: 'invalid';
    }
  | {
      status: 'inactive';
    }
  | {
      status: 'activated';
    }
  | {
      status: 'verified';
      otpVerificationId: string;

      employee: {
        id: string;
        empId: string;
        empName: string;
        officialEmail: string;
      };

      accountRequest: {
        id: string;
        requestedRole: AccountRole;
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
    this.otpHashSecret = configService.getOrThrow<string>('OTP_HASH_SECRET');

    this.otpTtlMinutes = this.readPositiveInteger(
      configService,
      'OTP_TTL_MINUTES',
    );

    this.resendCooldownSeconds = this.readPositiveInteger(
      configService,
      'OTP_RESEND_COOLDOWN_SECONDS',
    );

    this.maxAttempts = this.readPositiveInteger(
      configService,
      'OTP_MAX_ATTEMPTS',
    );

    this.activationTokenSecret = configService.getOrThrow<string>(
      'ACTIVATION_TOKEN_SECRET',
    );

    this.activationTokenTtlSeconds = this.readPositiveInteger(
      configService,
      'ACTIVATION_TOKEN_TTL_SECONDS',
    );
  }

  async requestOtp(
    dto: RequestActivationOtpDto,
    metadata: ActivationAuditMetadata,
  ): Promise<RequestOtpResult> {
    const empName = dto.empName.trim().replace(/\s+/g, ' ');

    const empId = dto.empId.trim().toUpperCase();

    const phoneNumber = dto.phoneNumber.trim();

    const officialEmail = dto.officialEmail.trim().toLowerCase();

    const departmentId = dto.departmentId.trim();

    const now = new Date();

    const cooldownStart = new Date(
      now.getTime() - this.resendCooldownSeconds * 1000,
    );

    const expiresAt = new Date(now.getTime() + this.otpTtlMinutes * 60 * 1000);

    const ipAddress = metadata.ipAddress?.slice(0, 45) ?? null;

    const userAgent = metadata.userAgent?.slice(0, 500) ?? null;

    const preparation: OtpPreparationOutcome = await this.prisma.$transaction(
      async (transaction) => {
        const employee = await transaction.employee.findFirst({
          where: {
            empId,
            phoneNumber,
            officialEmail,
            departmentId,

            empName: {
              equals: empName,
              mode: 'insensitive',
            },
          },

          select: {
            id: true,
            empName: true,
            officialEmail: true,
            divisionId: true,
            departmentId: true,
            status: true,
            isActivated: true,
          },
        });

        if (!employee) {
          return {
            status: 'invalid',
          };
        }

        if (employee.status === EmployeeStatus.INACTIVE) {
          return {
            status: 'inactive',
          };
        }

        if (employee.isActivated) {
          return {
            status: 'activated',
          };
        }

        const accountRequest = await transaction.accountRequest.findFirst({
          where: {
            employeeId: employee.id,

            empId,
            phoneNumber,
            officialEmail,

            empName: {
              equals: empName,
              mode: 'insensitive',
            },

            divisionId: employee.divisionId,

            departmentId: employee.departmentId,

            status: {
              in: [
                AccountRequestStatus.APPROVED,

                AccountRequestStatus.ACTIVATION_PENDING,
              ],
            },
          },

          orderBy: [
            {
              revisionNumber: 'desc',
            },
            {
              createdAt: 'desc',
            },
          ],

          select: {
            id: true,
            status: true,
            requestedRole: true,
            employeeId: true,
            divisionId: true,
            departmentId: true,
          },
        });

        if (!accountRequest) {
          return {
            status: 'invalid',
          };
        }

        const recentOtp = await transaction.otpVerification.findFirst({
          where: {
            employeeId: employee.id,

            purpose: OtpPurpose.ACCOUNT_ACTIVATION,

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
          return {
            status: 'cooldown',
          };
        }

        const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');

        const otpHash = this.hashOtp(employee.id, otp);

        await transaction.otpVerification.updateMany({
          where: {
            employeeId: employee.id,

            purpose: OtpPurpose.ACCOUNT_ACTIVATION,

            consumedAt: null,
          },

          data: {
            consumedAt: now,
          },
        });

        const otpRecord = await transaction.otpVerification.create({
          data: {
            employeeId: employee.id,

            purpose: OtpPurpose.ACCOUNT_ACTIVATION,

            otpHash,

            maxAttempts: this.maxAttempts,

            expiresAt,
          },

          select: {
            id: true,
          },
        });

        if (accountRequest.status === AccountRequestStatus.APPROVED) {
          const activationClaim = await transaction.accountRequest.updateMany({
            where: {
              id: accountRequest.id,

              status: AccountRequestStatus.APPROVED,
            },

            data: {
              status: AccountRequestStatus.ACTIVATION_PENDING,
            },
          });

          if (activationClaim.count !== 1) {
            return {
              status: 'invalid',
            };
          }

          await transaction.accountRequestAction.create({
            data: {
              accountRequestId: accountRequest.id,

              actorAccountId: null,

              action: AccountRequestActionType.ACTIVATION_STARTED,

              ipAddress,
              userAgent,

              metadata: {
                source: 'EMPLOYEE_ACCOUNT_ACTIVATION',

                employeeId: employee.id,

                requestedRole: accountRequest.requestedRole,

                departmentId: accountRequest.departmentId,

                otpVerificationId: otpRecord.id,
              },
            },
          });
        }

        return {
          status: 'prepared',
          otpRecordId: otpRecord.id,
          otp,

          employee: {
            empName: employee.empName,

            officialEmail: employee.officialEmail,
          },
        };
      },
    );

    if (preparation.status === 'inactive') {
      throw new ForbiddenException('This employee record is inactive.');
    }

    if (preparation.status === 'activated') {
      throw new ConflictException('This account is already activated.');
    }

    if (preparation.status === 'cooldown') {
      throw new HttpException(
        `Wait ${this.resendCooldownSeconds} seconds before requesting another code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (preparation.status === 'invalid') {
      return this.createGenericResponse();
    }

    try {
      await this.mailService.sendActivationOtp({
        to: preparation.employee.officialEmail,

        employeeName: preparation.employee.empName,

        otp: preparation.otp,

        expiresInMinutes: this.otpTtlMinutes,
      });
    } catch (error) {
      /*
       * An OTP that was not successfully
       * delivered must not remain usable.
       */
      await this.prisma.otpVerification.updateMany({
        where: {
          id: preparation.otpRecordId,

          consumedAt: null,
        },

        data: {
          consumedAt: new Date(),
        },
      });

      throw error;
    }

    return this.createGenericResponse();
  }

  async verifyOtp(dto: VerifyActivationOtpDto): Promise<VerifyOtpResult> {
    const empName = dto.empName.trim().replace(/\s+/g, ' ');

    const empId = dto.empId.trim().toUpperCase();

    const phoneNumber = dto.phoneNumber.trim();

    const officialEmail = dto.officialEmail.trim().toLowerCase();

    const departmentId = dto.departmentId.trim();

    const otp = dto.otp.trim();

    const now = new Date();

    const outcome: VerificationOutcome = await this.prisma.$transaction(
      async (transaction) => {
        const employee = await transaction.employee.findFirst({
          where: {
            empId,
            phoneNumber,
            officialEmail,
            departmentId,

            empName: {
              equals: empName,
              mode: 'insensitive',
            },
          },

          select: {
            id: true,
            empId: true,
            empName: true,
            officialEmail: true,
            divisionId: true,
            departmentId: true,
            status: true,
            isActivated: true,
          },
        });

        if (!employee) {
          return {
            status: 'invalid',
          };
        }

        if (employee.status === EmployeeStatus.INACTIVE) {
          return {
            status: 'inactive',
          };
        }

        if (employee.isActivated) {
          return {
            status: 'activated',
          };
        }

        const accountRequest = await transaction.accountRequest.findFirst({
          where: {
            employeeId: employee.id,

            empId,
            phoneNumber,
            officialEmail,

            empName: {
              equals: empName,
              mode: 'insensitive',
            },

            divisionId: employee.divisionId,

            departmentId: employee.departmentId,

            status: AccountRequestStatus.ACTIVATION_PENDING,
          },

          orderBy: [
            {
              revisionNumber: 'desc',
            },
            {
              createdAt: 'desc',
            },
          ],

          select: {
            id: true,
            requestedRole: true,
          },
        });

        if (
          !accountRequest ||
          accountRequest.requestedRole === AccountRole.SUPER_ADMIN
        ) {
          return {
            status: 'invalid',
          };
        }

        const otpRecord = await transaction.otpVerification.findFirst({
          where: {
            employeeId: employee.id,

            purpose: OtpPurpose.ACCOUNT_ACTIVATION,

            consumedAt: null,
          },

          orderBy: {
            createdAt: 'desc',
          },
        });

        if (!otpRecord) {
          return {
            status: 'invalid',
          };
        }

        const otpCannotBeUsed =
          otpRecord.expiresAt <= now ||
          otpRecord.attemptCount >= otpRecord.maxAttempts;

        if (otpCannotBeUsed) {
          await transaction.otpVerification.updateMany({
            where: {
              id: otpRecord.id,

              consumedAt: null,
            },

            data: {
              consumedAt: now,
            },
          });

          return {
            status: 'invalid',
          };
        }

        const incomingHash = this.hashOtp(employee.id, otp);

        const otpMatches = this.hashesMatch(otpRecord.otpHash, incomingHash);

        if (!otpMatches) {
          const nextAttempt = otpRecord.attemptCount + 1;

          await transaction.otpVerification.updateMany({
            where: {
              id: otpRecord.id,

              consumedAt: null,
            },

            data: {
              attemptCount: {
                increment: 1,
              },

              ...(nextAttempt >= otpRecord.maxAttempts
                ? {
                    consumedAt: now,
                  }
                : {}),
            },
          });

          return {
            status: 'invalid',
          };
        }

        /*
         * Consume the OTP atomically so that
         * it cannot be verified more than once.
         */
        const consumeResult = await transaction.otpVerification.updateMany({
          where: {
            id: otpRecord.id,

            employeeId: employee.id,

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
            status: 'invalid',
          };
        }

        return {
          status: 'verified',

          otpVerificationId: otpRecord.id,

          employee: {
            id: employee.id,

            empId: employee.empId,

            empName: employee.empName,

            officialEmail: employee.officialEmail,
          },

          accountRequest: {
            id: accountRequest.id,

            requestedRole: accountRequest.requestedRole,
          },
        };
      },
    );

    if (outcome.status === 'inactive') {
      throw new ForbiddenException('This employee record is inactive.');
    }

    if (outcome.status === 'activated') {
      throw new ConflictException('This account is already activated.');
    }

    if (outcome.status === 'invalid') {
      throw new UnauthorizedException(
        'The activation code is invalid or expired.',
      );
    }

    const activationToken = await this.jwtService.signAsync(
      {
        sub: outcome.employee.id,

        otpVerificationId: outcome.otpVerificationId,

        accountRequestId: outcome.accountRequest.id,

        requestedRole: outcome.accountRequest.requestedRole,

        type: 'account_activation',

        jti: randomUUID(),
      },

      {
        secret: this.activationTokenSecret,

        expiresIn: this.activationTokenTtlSeconds,
      },
    );

    return {
      message: 'OTP verified successfully.',

      activationToken,

      expiresInSeconds: this.activationTokenTtlSeconds,

      employee: outcome.employee,

      accountRequest: outcome.accountRequest,
    };
  }

  async completeActivation(
    dto: CompleteActivationDto,
    metadata: ActivationAuditMetadata,
  ): Promise<CompleteActivationResult> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match.');
    }

    const payload = await this.verifyActivationToken(dto.activationToken);

    /*
     * Password hashing is intentionally completed
     * before opening the database transaction.
     */
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const now = new Date();

    const ipAddress = metadata.ipAddress?.slice(0, 45) ?? null;

    const userAgent = metadata.userAgent?.slice(0, 500) ?? null;

    const outcome: CompletionOutcome = await this.prisma.$transaction(
      async (transaction) => {
        const employee = await transaction.employee.findUnique({
          where: {
            id: payload.sub,
          },

          select: {
            id: true,
            empId: true,
            empName: true,
            phoneNumber: true,
            officialEmail: true,
            divisionId: true,
            departmentId: true,
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
            status: 'invalid',
          };
        }

        if (employee.status === EmployeeStatus.INACTIVE) {
          return {
            status: 'inactive',
          };
        }

        if (employee.isActivated || employee.account) {
          return {
            status: 'activated',
          };
        }

        const accountRequest = await transaction.accountRequest.findFirst({
          where: {
            id: payload.accountRequestId,

            employeeId: employee.id,

            empId: employee.empId,

            phoneNumber: employee.phoneNumber,

            officialEmail: employee.officialEmail,

            empName: {
              equals: employee.empName,

              mode: 'insensitive',
            },

            divisionId: employee.divisionId,

            departmentId: employee.departmentId,

            requestedRole: payload.requestedRole,

            status: AccountRequestStatus.ACTIVATION_PENDING,
          },

          select: {
            id: true,
            requestedRole: true,
            status: true,
            divisionId: true,
            departmentId: true,
          },
        });

        if (
          !accountRequest ||
          accountRequest.requestedRole === AccountRole.SUPER_ADMIN
        ) {
          return {
            status: 'invalid',
          };
        }

        const otpVerification = await transaction.otpVerification.findFirst({
          where: {
            id: payload.otpVerificationId,

            employeeId: employee.id,

            purpose: OtpPurpose.ACCOUNT_ACTIVATION,

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
            status: 'invalid',
          };
        }

        const username = employee.empId.toLowerCase();

        const existingUsername = await transaction.account.findUnique({
          where: {
            username,
          },

          select: {
            id: true,
          },
        });

        if (existingUsername) {
          return {
            status: 'username_conflict',
          };
        }

        /*
         * Claim the approved request first.
         * Throwing on a race condition causes
         * the complete transaction to roll back.
         */
        const requestClaim = await transaction.accountRequest.updateMany({
          where: {
            id: accountRequest.id,

            employeeId: employee.id,

            requestedRole: payload.requestedRole,

            status: AccountRequestStatus.ACTIVATION_PENDING,
          },

          data: {
            status: AccountRequestStatus.ACTIVATED,
          },
        });

        if (requestClaim.count !== 1) {
          throw new ConflictException(
            'This activation request has already been completed or is no longer valid.',
          );
        }

        /*
         * Claim the employee identity.
         * A failed claim rolls back the request
         * status change above.
         */
        const employeeClaim = await transaction.employee.updateMany({
          where: {
            id: employee.id,

            isActivated: false,

            status: EmployeeStatus.ACTIVE,
          },

          data: {
            isActivated: true,
          },
        });

        if (employeeClaim.count !== 1) {
          throw new ConflictException('This account is already activated.');
        }

        const account = await transaction.account.create({
          data: {
            employeeId: employee.id,

            username,

            role: accountRequest.requestedRole,

            passwordHash,

            isEnabled: true,

            passwordChangedAt: now,
          },

          select: {
            id: true,
            username: true,
            role: true,
            isEnabled: true,
          },
        });

        await transaction.accountRequestAction.create({
          data: {
            accountRequestId: accountRequest.id,

            actorAccountId: account.id,

            action: AccountRequestActionType.ACTIVATED,

            ipAddress,
            userAgent,

            metadata: {
              source: 'EMPLOYEE_ACCOUNT_ACTIVATION',

              employeeId: employee.id,

              accountId: account.id,

              requestedRole: accountRequest.requestedRole,

              otpVerificationId: otpVerification.id,

              divisionId: accountRequest.divisionId,

              departmentId: accountRequest.departmentId,
            },
          },
        });

        /*
         * Invalidate any other unused activation
         * codes after successful completion.
         */
        await transaction.otpVerification.updateMany({
          where: {
            employeeId: employee.id,

            purpose: OtpPurpose.ACCOUNT_ACTIVATION,

            consumedAt: null,
          },

          data: {
            consumedAt: now,
          },
        });

        return {
          status: 'completed',

          employee: {
            id: employee.id,

            empId: employee.empId,

            empName: employee.empName,

            officialEmail: employee.officialEmail,

            isActivated: true,
          },

          account,
        };
      },
    );

    if (outcome.status === 'invalid') {
      throw new UnauthorizedException(
        'The activation token is invalid or expired.',
      );
    }

    if (outcome.status === 'inactive') {
      throw new ForbiddenException('This employee record is inactive.');
    }

    if (outcome.status === 'activated') {
      throw new ConflictException('This account is already activated.');
    }

    if (outcome.status === 'username_conflict') {
      throw new ConflictException(
        'An account with this username already exists.',
      );
    }

    return {
      message: 'Employee account activated successfully.',

      employee: outcome.employee,

      account: outcome.account,
    };
  }

  private async verifyActivationToken(
    activationToken: string,
  ): Promise<ActivationTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<ActivationTokenPayload>(
        activationToken,
        {
          secret: this.activationTokenSecret,

          algorithms: ['HS256'],
        },
      );

      const allowedRoles: AccountRole[] = [
        AccountRole.SENIOR_MANAGEMENT,

        AccountRole.TEAM_MANAGER,

        AccountRole.EMPLOYEE,
      ];

      if (
        payload.type !== 'account_activation' ||
        !payload.sub ||
        !payload.otpVerificationId ||
        !payload.accountRequestId ||
        !allowedRoles.includes(payload.requestedRole)
      ) {
        throw new Error('Invalid activation payload.');
      }

      return payload;
    } catch {
      throw new UnauthorizedException(
        'The activation token is invalid or expired.',
      );
    }
  }

  private hashOtp(employeeId: string, otp: string): string {
    return createHmac('sha256', this.otpHashSecret)
      .update(`${employeeId}:${otp}`)
      .digest('hex');
  }

  private hashesMatch(storedHash: string, incomingHash: string): boolean {
    const storedBuffer = Buffer.from(storedHash, 'hex');

    const incomingBuffer = Buffer.from(incomingHash, 'hex');

    if (storedBuffer.length !== incomingBuffer.length) {
      return false;
    }

    return timingSafeEqual(storedBuffer, incomingBuffer);
  }

  private createGenericResponse(): RequestOtpResult {
    return {
      message:
        'If the employee details are valid, an OTP has been sent to the official email address.',

      expiresInSeconds: this.otpTtlMinutes * 60,
    };
  }

  private readPositiveInteger(
    configService: ConfigService,
    variableName: string,
  ): number {
    const value = Number(configService.getOrThrow<string>(variableName));

    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${variableName} must be a positive integer.`);
    }

    return value;
  }
}
