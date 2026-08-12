import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ListsService {
  constructor(private prisma: PrismaService) {}

  async listForUser(user: AuthenticatedUser) {
    return this.prisma.messageList.findMany({
      where: { ownerAccountId: user.accountId },
      include: { members: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(user: AuthenticatedUser, name: string) {
    return this.prisma.messageList.create({
      data: { ownerAccountId: user.accountId, name },
      include: { members: true },
    });
  }

  async delete(user: AuthenticatedUser, id: string) {
    const res = await this.prisma.messageList.deleteMany({ where: { id, ownerAccountId: user.accountId } });
    return { deleted: res.count > 0 };
  }

  async addMember(user: AuthenticatedUser, id: string, member: string) {
    // member is a display name; accountId resolution not implemented here
    await this.prisma.messageListMember.create({ data: { listId: id, displayName: member } });
    return this.prisma.messageList.findUnique({ where: { id }, include: { members: { orderBy: { createdAt: 'asc' } } } });
  }

  async removeMember(user: AuthenticatedUser, id: string, memberIndex: number) {
    const members = await this.prisma.messageListMember.findMany({ where: { listId: id }, orderBy: { createdAt: 'asc' } });
    const target = members[memberIndex];
    if (!target) throw new Error('Not found');
    await this.prisma.messageListMember.delete({ where: { id: target.id } });
    return this.prisma.messageList.findUnique({ where: { id }, include: { members: { orderBy: { createdAt: 'asc' } } } });
  }
}
