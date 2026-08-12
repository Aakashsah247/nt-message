import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { ListsService } from './lists.service';
import { CreateListDto } from './dto/create-list.dto';
import { AddMemberDto } from './dto/add-member.dto';

@Controller('lists')
@UseGuards(AccessTokenGuard)
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<any> {
    const data = await this.listsService.listForUser(user);
    return { data };
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateListDto): Promise<any> {
    const data = await this.listsService.create(user, dto.name);
    return { data };
  }

  @Delete(':listId')
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('listId') listId: string): Promise<any> {
    return this.listsService.delete(user, listId);
  }

  @Post(':listId/members')
  async addMember(@CurrentUser() user: AuthenticatedUser, @Param('listId') listId: string, @Body() dto: AddMemberDto): Promise<any> {
    const data = await this.listsService.addMember(user, listId, dto.member);
    return { data };
  }

  @Delete(':listId/members/:memberIndex')
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listId') listId: string,
    @Param('memberIndex') memberIndex: string,
  ): Promise<any> {
    const idx = Number(memberIndex);
    const data = await this.listsService.removeMember(user, listId, idx);
    return { data };
  }
}
