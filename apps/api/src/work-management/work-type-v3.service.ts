import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import { WorkTypeVersionStatus } from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';

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
