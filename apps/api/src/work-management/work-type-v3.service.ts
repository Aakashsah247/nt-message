import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { WorkTypeVersionStatus } from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import type { CreateWorkTypeDraftDto } from './dto/create-work-type-draft.dto';
import type { UpdateWorkTypeDraftDto } from './dto/update-work-type-draft.dto';

const VERSION_SUMMARY_SELECT = {
  id: true,
  workTypeDefinitionId: true,
  version: true,
  status: true,
  name: true,
  description: true,
  changeReason: true,
  createdByAccountId: true,
  publishedByAccountId: true,
  retiredByAccountId: true,
  publishedAt: true,
  retiredAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class WorkTypeV3Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
  ) {}

  private async getOffice(officeId: string) {
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    if (!office) {
      throw new NotFoundException('Office was not found.');
    }

    return office;
  }

  private async lockWorkTypeDefinition(
    tx: Prisma.TransactionClient,
    officeId: string,
    workTypeDefinitionId: string,
  ): Promise<void> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "work_type_definitions"
      WHERE "id" = CAST(${workTypeDefinitionId} AS uuid)
        AND "office_id" = CAST(${officeId} AS uuid)
      FOR UPDATE
    `;

    if (locked.length === 0) {
      throw new NotFoundException(
        'Work type was not found in this office.',
      );
    }
  }

  private async requireDraft(
    tx: Prisma.TransactionClient,
    workTypeDefinitionId: string,
    versionId: string,
  ) {
    const version = await tx.workTypeVersion.findFirst({
      where: {
        id: versionId,
        workTypeDefinitionId,
      },
      select: VERSION_SUMMARY_SELECT,
    });

    if (!version) {
      throw new NotFoundException('Work type version was not found.');
    }

    if (version.status !== WorkTypeVersionStatus.DRAFT) {
      throw new BadRequestException(
        'Only a draft work type version can be changed.',
      );
    }

    return version;
  }

  async getActionContext(
    user: AuthenticatedUser,
    officeId: string,
  ) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_VIEW,
      officeId,
      null,
    );

    const [draft, publish] = await Promise.all([
      this.authorization.can(
        user,
        CAPABILITIES.WORK_TYPE_DRAFT,
        officeId,
        null,
      ),
      this.authorization.can(
        user,
        CAPABILITIES.WORK_TYPE_PUBLISH,
        officeId,
        null,
      ),
    ]);

    return {
      office,
      availableActions: {
        view: true,
        draft,
        publish,
      },
    };
  }

  async list(
    user: AuthenticatedUser,
    officeId: string,
  ) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_VIEW,
      officeId,
      null,
    );

    const definitions = await this.prisma.workTypeDefinition.findMany({
      where: { officeId },
      orderBy: [
        { sortOrder: 'asc' },
        { code: 'asc' },
      ],
      select: {
        id: true,
        officeId: true,
        code: true,
        legacyWorkItemType: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (definitions.length === 0) {
      return {
        office,
        data: [],
      };
    }

    const versions = await this.prisma.workTypeVersion.findMany({
      where: {
        workTypeDefinitionId: {
          in: definitions.map((definition) => definition.id),
        },
        status: {
          in: [
            WorkTypeVersionStatus.DRAFT,
            WorkTypeVersionStatus.PUBLISHED,
          ],
        },
      },
      orderBy: [
        { workTypeDefinitionId: 'asc' },
        { version: 'desc' },
      ],
      select: {
        id: true,
        workTypeDefinitionId: true,
        version: true,
        status: true,
        name: true,
        description: true,
        changeReason: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const currentByDefinition = new Map<
      string,
      {
        draft: (typeof versions)[number] | null;
        published: (typeof versions)[number] | null;
      }
    >();

    for (const version of versions) {
      const current = currentByDefinition.get(
        version.workTypeDefinitionId,
      ) ?? {
        draft: null,
        published: null,
      };

      if (
        version.status === WorkTypeVersionStatus.DRAFT &&
        current.draft === null
      ) {
        current.draft = version;
      }

      if (
        version.status === WorkTypeVersionStatus.PUBLISHED &&
        current.published === null
      ) {
        current.published = version;
      }

      currentByDefinition.set(
        version.workTypeDefinitionId,
        current,
      );
    }

    return {
      office,
      data: definitions.map((definition) => ({
        ...definition,
        currentPublishedVersion:
          currentByDefinition.get(definition.id)?.published ?? null,
        currentDraftVersion:
          currentByDefinition.get(definition.id)?.draft ?? null,
      })),
    };
  }

  async createDraft(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
    dto: CreateWorkTypeDraftDto,
  ) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_DRAFT,
      officeId,
      null,
    );

    const draft = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkTypeDefinition(
        tx,
        officeId,
        workTypeDefinitionId,
      );

      const existingDraft = await tx.workTypeVersion.findFirst({
        where: {
          workTypeDefinitionId,
          status: WorkTypeVersionStatus.DRAFT,
        },
        select: {
          id: true,
          version: true,
        },
      });

      if (existingDraft) {
        throw new ConflictException(
          'This work type already has an open draft.',
        );
      }

      const published = await tx.workTypeVersion.findFirst({
        where: {
          workTypeDefinitionId,
          status: WorkTypeVersionStatus.PUBLISHED,
        },
        orderBy: {
          version: 'desc',
        },
        select: {
          name: true,
          description: true,
        },
      });

      if (!published) {
        throw new BadRequestException(
          'A published work type version is required before creating a new draft.',
        );
      }

      const latestVersion = await tx.workTypeVersion.findFirst({
        where: {
          workTypeDefinitionId,
        },
        orderBy: {
          version: 'desc',
        },
        select: {
          version: true,
        },
      });

      return tx.workTypeVersion.create({
        data: {
          workTypeDefinitionId,
          version: (latestVersion?.version ?? 0) + 1,
          status: WorkTypeVersionStatus.DRAFT,
          name: published.name,
          description: published.description,
          changeReason: dto.changeReason ?? null,
          createdByAccountId: user.accountId,
        },
        select: VERSION_SUMMARY_SELECT,
      });
    });

    return {
      office,
      draft,
    };
  }

  async updateDraft(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
    versionId: string,
    dto: UpdateWorkTypeDraftDto,
  ) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_DRAFT,
      officeId,
      null,
    );

    const data: {
      name?: string;
      description?: string | null;
      changeReason?: string | null;
    } = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    if (dto.changeReason !== undefined) {
      data.changeReason = dto.changeReason;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Provide at least one draft field to update.',
      );
    }

    const draft = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkTypeDefinition(
        tx,
        officeId,
        workTypeDefinitionId,
      );

      await this.requireDraft(
        tx,
        workTypeDefinitionId,
        versionId,
      );

      return tx.workTypeVersion.update({
        where: {
          id: versionId,
        },
        data,
        select: VERSION_SUMMARY_SELECT,
      });
    });

    return {
      office,
      draft,
    };
  }

  async discardDraft(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
    versionId: string,
  ) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_DRAFT,
      officeId,
      null,
    );

    const discarded = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkTypeDefinition(
        tx,
        officeId,
        workTypeDefinitionId,
      );

      const draft = await this.requireDraft(
        tx,
        workTypeDefinitionId,
        versionId,
      );

      await tx.workTypeVersion.delete({
        where: {
          id: versionId,
        },
      });

      return {
        id: draft.id,
        version: draft.version,
      };
    });

    return {
      office,
      discardedDraft: discarded,
    };
  }

  async publishDraft(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
    versionId: string,
  ) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_PUBLISH,
      officeId,
      null,
    );

    const publishedVersion = await this.prisma.$transaction(
      async (tx) => {
        await this.lockWorkTypeDefinition(
          tx,
          officeId,
          workTypeDefinitionId,
        );

        await this.requireDraft(
          tx,
          workTypeDefinitionId,
          versionId,
        );

        const currentPublished =
          await tx.workTypeVersion.findMany({
            where: {
              workTypeDefinitionId,
              status: WorkTypeVersionStatus.PUBLISHED,
            },
            orderBy: {
              version: 'desc',
            },
            select: {
              id: true,
            },
          });

        if (currentPublished.length > 1) {
          throw new ConflictException(
            'This work type has more than one published version and must be reconciled before publishing.',
          );
        }

        const now = new Date();

        if (currentPublished[0]) {
          await tx.workTypeVersion.update({
            where: {
              id: currentPublished[0].id,
            },
            data: {
              status: WorkTypeVersionStatus.RETIRED,
              retiredByAccountId: user.accountId,
              retiredAt: now,
            },
          });
        }

        return tx.workTypeVersion.update({
          where: {
            id: versionId,
          },
          data: {
            status: WorkTypeVersionStatus.PUBLISHED,
            publishedByAccountId: user.accountId,
            publishedAt: now,
            retiredByAccountId: null,
            retiredAt: null,
          },
          select: VERSION_SUMMARY_SELECT,
        });
      },
    );

    return {
      office,
      publishedVersion,
    };
  }

  async getById(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
  ) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_VIEW,
      officeId,
      null,
    );

    const definition = await this.prisma.workTypeDefinition.findFirst({
      where: {
        id: workTypeDefinitionId,
        officeId,
      },
      select: {
        id: true,
        officeId: true,
        code: true,
        legacyWorkItemType: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        versions: {
          orderBy: {
            version: 'desc',
          },
          select: {
            id: true,
            version: true,
            status: true,
            name: true,
            description: true,
            changeReason: true,
            createdByAccountId: true,
            publishedByAccountId: true,
            retiredByAccountId: true,
            publishedAt: true,
            retiredAt: true,
            createdAt: true,
            updatedAt: true,
            createdBy: {
              select: {
                id: true,
                username: true,
              },
            },
            publishedBy: {
              select: {
                id: true,
                username: true,
              },
            },
            retiredBy: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!definition) {
      throw new NotFoundException('Work type was not found in this office.');
    }

    return {
      office,
      workType: definition,
    };
  }
}
