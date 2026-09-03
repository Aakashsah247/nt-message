import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  getNepalPhoneLookupVariants,
  normalizeEmployeeId,
  normalizeEmployeeName,
  normalizeNepalPhoneNumber,
  normalizeOfficialEmailForLookup,
  sanitizeOfficialEmail,
} from '../common/normalization/account-identity-normalization';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRequestStatus,
  AccountRole,
  IdentityCorrectionField,
  OtpPurpose,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { CorrectEmployeeIdentityDto } from './dto/correct-employee-identity.dto';

interface IdentityCorrectionMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

interface IdentityChange {
  field: IdentityCorrectionField;
  oldValue: string;
  newValue: string;
}

@Injectable()
export class EmployeeIdentityCorrectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  private assertSuperAdmin(user: AuthenticatedUser): void {
    if (user.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can correct protected employee identity information.',
      );
    }
  }

  private normalizeReason(rawReason: string): string {
    const reason = rawReason.trim().replace(/\s+/g, ' ');

    if (reason.length < 3) {
      throw new BadRequestException(
        'Identity-correction reason must contain at least 3 characters.',
      );
    }

    if (reason.length > 500) {
      throw new BadRequestException(
        'Identity-correction reason cannot exceed 500 characters.',
      );
    }

    return reason;
  }

  async correctIdentity(
    user: AuthenticatedUser,
    employeeId: string,
    dto: CorrectEmployeeIdentityDto,
    metadata: IdentityCorrectionMetadata,
  ) {
    this.assertSuperAdmin(user);

    const reason = this.normalizeReason(dto.reason);
    const operationId = randomUUID();
    const correctedAt = new Date();
    const ipAddress = metadata.ipAddress?.slice(0, 45) || null;
    const userAgent = metadata.userAgent?.slice(0, 500) || null;

    const requestedEmpId =
      dto.empId !== undefined ? normalizeEmployeeId(dto.empId) : undefined;
    const requestedEmpName =
      dto.empName !== undefined ? normalizeEmployeeName(dto.empName) : undefined;
    const requestedPhoneNumber =
      dto.phoneNumber !== undefined
        ? normalizeNepalPhoneNumber(dto.phoneNumber)
        : undefined;
    const requestedOfficialEmail =
      dto.officialEmail !== undefined
        ? sanitizeOfficialEmail(dto.officialEmail)
        : undefined;

    if (requestedEmpName !== undefined && requestedEmpName.length < 2) {
      throw new BadRequestException(
        'Employee name must contain at least 2 characters.',
      );
    }

    if (
      requestedEmpId === undefined &&
      requestedEmpName === undefined &&
      requestedPhoneNumber === undefined &&
      requestedOfficialEmail === undefined
    ) {
      throw new BadRequestException(
        'Provide at least one protected identity field to correct.',
      );
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      const employee = await transaction.employee.findUnique({
        where: {
          id: employeeId,
        },
        select: {
          id: true,
          empId: true,
          empName: true,
          phoneNumber: true,
          officialEmail: true,
          designation: true,
          divisionId: true,
          departmentId: true,
          isActivated: true,
          account: {
            select: {
              id: true,
              username: true,
              role: true,
              isEnabled: true,
            },
          },
        },
      });

      if (!employee) {
        throw new NotFoundException('Employee was not found.');
      }

      if (employee.account?.role === AccountRole.SUPER_ADMIN) {
        throw new ForbiddenException(
          'The Super Admin identity cannot be changed through the employee correction workflow.',
        );
      }

      if (!employee.isActivated || !employee.account) {
        throw new ConflictException(
          'Protected identity correction is available only after the employee account is activated.',
        );
      }

      const changes: IdentityChange[] = [];

      if (requestedEmpName !== undefined && requestedEmpName !== employee.empName) {
        changes.push({
          field: IdentityCorrectionField.OFFICIAL_NAME,
          oldValue: employee.empName,
          newValue: requestedEmpName,
        });
      }

      if (requestedEmpId !== undefined && requestedEmpId !== employee.empId) {
        changes.push({
          field: IdentityCorrectionField.EMPLOYEE_ID,
          oldValue: employee.empId,
          newValue: requestedEmpId,
        });
      }

      if (
        requestedPhoneNumber !== undefined &&
        requestedPhoneNumber !== normalizeNepalPhoneNumber(employee.phoneNumber)
      ) {
        changes.push({
          field: IdentityCorrectionField.PHONE_NUMBER,
          oldValue: employee.phoneNumber,
          newValue: requestedPhoneNumber,
        });
      }

      if (
        requestedOfficialEmail !== undefined &&
        normalizeOfficialEmailForLookup(requestedOfficialEmail) !==
          normalizeOfficialEmailForLookup(employee.officialEmail)
      ) {
        changes.push({
          field: IdentityCorrectionField.OFFICIAL_EMAIL,
          oldValue: employee.officialEmail,
          newValue: requestedOfficialEmail,
        });
      }

      if (changes.length === 0) {
        throw new ConflictException(
          'The supplied protected identity information does not change the current employee record.',
        );
      }

      const empIdChange = changes.find(
        (change) => change.field === IdentityCorrectionField.EMPLOYEE_ID,
      );
      const emailChange = changes.find(
        (change) => change.field === IdentityCorrectionField.OFFICIAL_EMAIL,
      );
      const phoneChange = changes.find(
        (change) => change.field === IdentityCorrectionField.PHONE_NUMBER,
      );

      const duplicateEmployeeConditions: Prisma.EmployeeWhereInput[] = [];

      if (empIdChange) {
        duplicateEmployeeConditions.push({
          empId: empIdChange.newValue,
        });
      }

      if (emailChange) {
        duplicateEmployeeConditions.push({
          officialEmail: {
            equals: normalizeOfficialEmailForLookup(emailChange.newValue),
            mode: 'insensitive',
          },
        });
      }

      if (phoneChange) {
        duplicateEmployeeConditions.push({
          phoneNumber: {
            in: getNepalPhoneLookupVariants(phoneChange.newValue),
          },
        });
      }

      if (duplicateEmployeeConditions.length > 0) {
        const duplicateEmployee = await transaction.employee.findFirst({
          where: {
            id: {
              not: employee.id,
            },
            OR: duplicateEmployeeConditions,
          },
          select: {
            empId: true,
            officialEmail: true,
            phoneNumber: true,
          },
        });

        if (duplicateEmployee) {
          if (empIdChange && duplicateEmployee.empId === empIdChange.newValue) {
            throw new ConflictException(
              'An employee with this employee ID already exists.',
            );
          }

          if (
            emailChange &&
            normalizeOfficialEmailForLookup(duplicateEmployee.officialEmail) ===
              normalizeOfficialEmailForLookup(emailChange.newValue)
          ) {
            throw new ConflictException(
              'An employee with this official email already exists.',
            );
          }

          throw new ConflictException(
            'An employee with this phone number already exists.',
          );
        }

        const duplicateRequestConditions: Prisma.AccountRequestWhereInput[] = [];

        if (empIdChange) {
          duplicateRequestConditions.push({
            empId: empIdChange.newValue,
          });
        }

        if (emailChange) {
          duplicateRequestConditions.push({
            officialEmail: {
              equals: normalizeOfficialEmailForLookup(emailChange.newValue),
              mode: 'insensitive',
            },
          });
        }

        if (phoneChange) {
          duplicateRequestConditions.push({
            phoneNumber: {
              in: getNepalPhoneLookupVariants(phoneChange.newValue),
            },
          });
        }

        const duplicateRequest = await transaction.accountRequest.findFirst({
          where: {
            status: {
              not: AccountRequestStatus.REJECTED,
            },
            OR: duplicateRequestConditions,
            AND: [
              {
                OR: [
                  { employeeId: null },
                  {
                    employeeId: {
                      not: employee.id,
                    },
                  },
                ],
              },
            ],
          },
          select: {
            id: true,
          },
        });

        if (duplicateRequest) {
          throw new ConflictException(
            'An active account request already uses the corrected employee ID, official email, or phone number.',
          );
        }
      }

      const accountUsernameTracksEmployeeId =
        employee.account.username?.toLowerCase() === employee.empId.toLowerCase();
      let accountUsernameUpdated = false;

      if (empIdChange && accountUsernameTracksEmployeeId) {
        const targetUsername = empIdChange.newValue.toLowerCase();
        const duplicateUsername = await transaction.account.findFirst({
          where: {
            id: {
              not: employee.account.id,
            },
            username: {
              equals: targetUsername,
              mode: 'insensitive',
            },
          },
          select: {
            id: true,
          },
        });

        if (duplicateUsername) {
          throw new ConflictException(
            'The corrected employee ID conflicts with an existing account identifier.',
          );
        }

        await transaction.account.update({
          where: {
            id: employee.account.id,
          },
          data: {
            username: targetUsername,
          },
        });

        accountUsernameUpdated = true;
      }

      const updateData: Prisma.EmployeeUpdateInput = {};

      changes.forEach((change) => {
        switch (change.field) {
          case IdentityCorrectionField.OFFICIAL_NAME:
            updateData.empName = change.newValue;
            break;
          case IdentityCorrectionField.EMPLOYEE_ID:
            updateData.empId = change.newValue;
            break;
          case IdentityCorrectionField.OFFICIAL_EMAIL:
            updateData.officialEmail = change.newValue;
            break;
          case IdentityCorrectionField.PHONE_NUMBER:
            updateData.phoneNumber = change.newValue;
            break;
        }
      });

      const updatedEmployee = await transaction.employee.update({
        where: {
          id: employee.id,
        },
        data: updateData,
        select: {
          id: true,
          empId: true,
          empName: true,
          phoneNumber: true,
          officialEmail: true,
          designation: true,
          divisionId: true,
          departmentId: true,
          status: true,
          employmentStatus: true,
          isActivated: true,
          updatedAt: true,
          account: {
            select: {
              id: true,
              username: true,
              role: true,
              isEnabled: true,
            },
          },
        },
      });

      const securityCriticalChange = Boolean(empIdChange || emailChange);
      let revokedSessions = 0;
      let invalidatedRecoveryChallenges = 0;
      let invalidatedRecoveryOtps = 0;

      if (securityCriticalChange) {
        const sessionResult = await transaction.authSession.updateMany({
          where: {
            accountId: employee.account.id,
            revokedAt: null,
          },
          data: {
            revokedAt: correctedAt,
          },
        });
        revokedSessions = sessionResult.count;

        const recoveryChallengeResult =
          await transaction.passwordResetChallenge.updateMany({
            where: {
              accountId: employee.account.id,
              consumedAt: null,
            },
            data: {
              consumedAt: correctedAt,
            },
          });
        invalidatedRecoveryChallenges = recoveryChallengeResult.count;

        const recoveryOtpResult = await transaction.otpVerification.updateMany({
          where: {
            employeeId: employee.id,
            purpose: OtpPurpose.PASSWORD_RESET,
            consumedAt: null,
          },
          data: {
            consumedAt: correctedAt,
          },
        });
        invalidatedRecoveryOtps = recoveryOtpResult.count;
      }

      const commonAuditMetadata = {
        accountId: employee.account.id,
        securityCriticalChange,
        sessionsRevoked: revokedSessions,
        recoveryChallengesInvalidated: invalidatedRecoveryChallenges,
        recoveryOtpsInvalidated: invalidatedRecoveryOtps,
        accountUsernameUpdated,
        emailNotificationRequired: Boolean(emailChange),
        phoneSecurityReverificationRequired: false,
      } satisfies Prisma.InputJsonObject;

      await transaction.identityCorrectionAudit.createMany({
        data: changes.map((change) => ({
          operationId,
          employeeId: employee.id,
          actorAccountId: user.accountId,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          reason,
          ipAddress,
          userAgent,
          metadata: commonAuditMetadata,
        })),
      });

      return {
        employee: updatedEmployee,
        changes,
        emailChanged: Boolean(emailChange),
        revokedSessions,
        invalidatedRecoveryChallenges,
        invalidatedRecoveryOtps,
        accountUsernameUpdated,
      };
    });

    let notificationSent: boolean | null = null;

    if (result.emailChanged) {
      try {
        await this.mailService.sendIdentityCorrectionNotification({
          to: result.employee.officialEmail,
          displayName: result.employee.empName,
          correctedFields: result.changes.map((change) => change.field),
          correctedAt,
          sessionsRevoked: result.revokedSessions,
        });
        notificationSent = true;
      } catch {
        // The correction is authoritative after commit; mail failure must not
        // restore the old identity or reactivate revoked sessions.
        notificationSent = false;
      }
    }

    return {
      message: 'Protected employee identity corrected successfully.',
      operationId,
      employee: result.employee,
      correctedFields: result.changes.map((change) => change.field),
      security: {
        revokedSessions: result.revokedSessions,
        invalidatedRecoveryChallenges: result.invalidatedRecoveryChallenges,
        invalidatedRecoveryOtps: result.invalidatedRecoveryOtps,
        accountUsernameUpdated: result.accountUsernameUpdated,
        notificationSent,
      },
    };
  }

  async getCorrectionHistory(user: AuthenticatedUser, employeeId: string) {
    this.assertSuperAdmin(user);

    const employee = await this.prisma.employee.findUnique({
      where: {
        id: employeeId,
      },
      select: {
        id: true,
        empId: true,
        empName: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee was not found.');
    }

    const data = await this.prisma.identityCorrectionAudit.findMany({
      where: {
        employeeId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        operationId: true,
        field: true,
        oldValue: true,
        newValue: true,
        reason: true,
        ipAddress: true,
        userAgent: true,
        metadata: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            username: true,
            role: true,
            employee: {
              select: {
                empId: true,
                empName: true,
              },
            },
          },
        },
      },
    });

    return {
      employee,
      data,
    };
  }
}
