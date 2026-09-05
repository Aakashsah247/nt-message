import { ForbiddenException } from '@nestjs/common';

import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

describe('OrganizationController legacy hierarchy write lock', () => {
  const organizationService = {
    createDivision: jest.fn(),
    listDivisions: jest.fn(),
    getDivisionById: jest.fn(),
    updateDivision: jest.fn(),
    deleteDivision: jest.fn(),
    createDepartment: jest.fn(),
    listDepartments: jest.fn(),
    getDepartmentById: jest.fn(),
    updateDepartment: jest.fn(),
    deleteDepartment: jest.fn(),
  } as unknown as OrganizationService;

  const controller = new OrganizationController(organizationService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps legacy Division and Department reads available', () => {
    (organizationService.listDivisions as jest.Mock).mockReturnValue({
      data: [],
    });
    (organizationService.listDepartments as jest.Mock).mockReturnValue({
      data: [],
    });

    expect(controller.listDivisions()).toEqual({ data: [] });
    expect(controller.listDepartments()).toEqual({ data: [] });
    expect(organizationService.listDivisions).toHaveBeenCalledTimes(1);
    expect(organizationService.listDepartments).toHaveBeenCalledTimes(1);
  });

  it('blocks every legacy hierarchy write route before it reaches the legacy service', () => {
    const blockedWrites = [
      () => controller.createDivision(),
      () => controller.updateDivision(),
      () => controller.deleteDivision(),
      () => controller.createDepartment(),
      () => controller.updateDepartment(),
      () => controller.deleteDepartment(),
    ];

    for (const write of blockedWrites) {
      expect(write).toThrow(ForbiddenException);
    }

    expect(organizationService.createDivision).not.toHaveBeenCalled();
    expect(organizationService.updateDivision).not.toHaveBeenCalled();
    expect(organizationService.deleteDivision).not.toHaveBeenCalled();
    expect(organizationService.createDepartment).not.toHaveBeenCalled();
    expect(organizationService.updateDepartment).not.toHaveBeenCalled();
    expect(organizationService.deleteDepartment).not.toHaveBeenCalled();
  });
});
