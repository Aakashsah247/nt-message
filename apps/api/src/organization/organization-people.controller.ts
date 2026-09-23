import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';

import { AssignOfficeHeadDto } from './dto/assign-office-head.dto';
import { CreateOfficeHeadAccountDto } from './dto/create-office-head-account.dto';
import { AssignOrgLeadershipDto } from './dto/assign-org-leadership.dto';
import { AssignOrgMembershipDto } from './dto/assign-org-membership.dto';
import { EndOrgLeadershipDto } from './dto/end-org-leadership.dto';
import { EndOrgMembershipDto } from './dto/end-org-membership.dto';
import { ReplaceOfficeHeadDto } from './dto/replace-office-head.dto';
import { TransferPrimaryMembershipDto } from './dto/transfer-primary-membership.dto';
import { OrganizationPeopleService } from './organization-people.service';

@Controller('organization/offices/:officeId')
@UseGuards(AccessTokenGuard)
export class OrganizationPeopleController {
  constructor(
    private readonly organizationPeopleService: OrganizationPeopleService,
  ) {}

  @Get('people')
  listOfficePeople(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
  ) {
    return this.organizationPeopleService.listOfficePeople(user, officeId);
  }

  @Get('people/actions')
  getOfficePeopleActions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
  ) {
    return this.organizationPeopleService.getPeopleActionContext(
      user,
      officeId,
      null,
    );
  }

  @Get('units/:orgUnitId/people/actions')
  getOrgUnitPeopleActions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('orgUnitId', new ParseUUIDPipe({ version: '4' }))
    orgUnitId: string,
  ) {
    return this.organizationPeopleService.getPeopleActionContext(
      user,
      officeId,
      orgUnitId,
    );
  }

  @Get('employees/:employeeId/memberships')
  listEmployeeMemberships(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('employeeId', new ParseUUIDPipe({ version: '4' }))
    employeeId: string,
  ) {
    return this.organizationPeopleService.listEmployeeMemberships(
      user,
      officeId,
      employeeId,
    );
  }

  @Post('memberships')
  assignMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Body() dto: AssignOrgMembershipDto,
  ) {
    return this.organizationPeopleService.assignMembership(user, officeId, dto);
  }

  @Post('memberships/transfer-primary')
  transferPrimaryMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Body() dto: TransferPrimaryMembershipDto,
  ) {
    return this.organizationPeopleService.transferPrimaryMembership(
      user,
      officeId,
      dto,
    );
  }

  @Patch('memberships/:membershipId/end')
  endMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' }))
    membershipId: string,
    @Body() dto: EndOrgMembershipDto,
  ) {
    return this.organizationPeopleService.endMembership(
      user,
      officeId,
      membershipId,
      dto,
    );
  }

  @Get('leadership')
  listLeadership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
  ) {
    return this.organizationPeopleService.listLeadership(user, officeId);
  }

  @Post('leadership/office-head/account')
  createOfficeHeadAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Body() dto: CreateOfficeHeadAccountDto,
  ) {
    return this.organizationPeopleService.createOfficeHeadAccount(
      user,
      officeId,
      dto,
    );
  }

  @Post('leadership/office-head')
  assignOfficeHead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Body() dto: AssignOfficeHeadDto,
  ) {
    return this.organizationPeopleService.assignOfficeHead(user, officeId, dto);
  }

  @Patch('leadership/office-head/replace')
  replaceOfficeHead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Body() dto: ReplaceOfficeHeadDto,
  ) {
    return this.organizationPeopleService.replaceOfficeHead(
      user,
      officeId,
      dto,
    );
  }

  @Post('leadership')
  assignLeadership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Body() dto: AssignOrgLeadershipDto,
  ) {
    return this.organizationPeopleService.assignLeadership(user, officeId, dto);
  }

  @Patch('leadership/:assignmentId/end')
  endLeadership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('assignmentId', new ParseUUIDPipe({ version: '4' }))
    assignmentId: string,
    @Body() dto: EndOrgLeadershipDto,
  ) {
    return this.organizationPeopleService.endLeadership(
      user,
      officeId,
      assignmentId,
      dto,
    );
  }
}
