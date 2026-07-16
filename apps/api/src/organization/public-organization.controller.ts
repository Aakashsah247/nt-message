import { Controller, Get } from '@nestjs/common';

import { OrganizationService } from './organization.service';

@Controller('public/organization')
export class PublicOrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('divisions')
  listDivisions() {
    return this.organizationService.listPublicDivisions();
  }

  @Get('departments')
  listDepartments() {
    return this.organizationService.listPublicDepartments();
  }
}
