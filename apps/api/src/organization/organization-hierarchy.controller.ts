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

import { CreateOfficeDto } from './dto/create-office.dto';
import { CreateOrgUnitDto } from './dto/create-org-unit.dto';
import { CreateOrgUnitTypeDto } from './dto/create-org-unit-type.dto';
import { MoveOrgUnitDto } from './dto/move-org-unit.dto';
import { SetOrgUnitStatusDto } from './dto/set-org-unit-status.dto';
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto';
import { UpdateOrgUnitTypeDto } from './dto/update-org-unit-type.dto';
import { OrganizationHierarchyService } from './organization-hierarchy.service';

@Controller('organization')
@UseGuards(AccessTokenGuard)
export class OrganizationHierarchyController {
  constructor(
    private readonly hierarchyService: OrganizationHierarchyService,
  ) {}

  @Post('offices')
  createOffice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOfficeDto,
  ) {
    return this.hierarchyService.createOffice(user, dto);
  }

  @Get('offices')
  listOffices(@CurrentUser() user: AuthenticatedUser) {
    return this.hierarchyService.listOffices(user);
  }

  @Get('offices/:officeId')
  getOffice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
  ) {
    return this.hierarchyService.getOffice(user, officeId);
  }

  @Get('offices/:officeId/tree')
  getTree(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
  ) {
    return this.hierarchyService.getTree(user, officeId);
  }

  @Post('offices/:officeId/unit-types')
  createUnitType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Body() dto: CreateOrgUnitTypeDto,
  ) {
    return this.hierarchyService.createUnitType(
      user,
      officeId,
      dto,
    );
  }

  @Patch('offices/:officeId/unit-types/:typeId')
  updateUnitType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('typeId', new ParseUUIDPipe({ version: '4' }))
    typeId: string,
    @Body() dto: UpdateOrgUnitTypeDto,
  ) {
    return this.hierarchyService.updateUnitType(
      user,
      officeId,
      typeId,
      dto,
    );
  }

  @Post('offices/:officeId/units')
  createOrgUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Body() dto: CreateOrgUnitDto,
  ) {
    return this.hierarchyService.createOrgUnit(
      user,
      officeId,
      dto,
    );
  }

  @Patch('offices/:officeId/units/:unitId')
  updateOrgUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('unitId', new ParseUUIDPipe({ version: '4' }))
    unitId: string,
    @Body() dto: UpdateOrgUnitDto,
  ) {
    return this.hierarchyService.updateOrgUnit(
      user,
      officeId,
      unitId,
      dto,
    );
  }

  @Patch('offices/:officeId/units/:unitId/move')
  moveOrgUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('unitId', new ParseUUIDPipe({ version: '4' }))
    unitId: string,
    @Body() dto: MoveOrgUnitDto,
  ) {
    return this.hierarchyService.moveOrgUnit(
      user,
      officeId,
      unitId,
      dto,
    );
  }

  @Patch('offices/:officeId/units/:unitId/status')
  setOrgUnitStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' }))
    officeId: string,
    @Param('unitId', new ParseUUIDPipe({ version: '4' }))
    unitId: string,
    @Body() dto: SetOrgUnitStatusDto,
  ) {
    return this.hierarchyService.setOrgUnitStatus(
      user,
      officeId,
      unitId,
      dto,
    );
  }
}
