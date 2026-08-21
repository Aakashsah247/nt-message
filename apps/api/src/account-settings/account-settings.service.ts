import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { UpdateAccountLanguageDto } from './dto/update-account-language.dto';

@Injectable()
export class AccountSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLanguage(accountId: string) {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { interfaceLanguage: true },
    });

    return account;
  }

  async updateLanguage(
    accountId: string,
    dto: UpdateAccountLanguageDto,
  ) {
    /*
     * Language is an account-level presentation preference. It never rewrites
     * messages, work descriptions, employee identity or other stored content.
     */
    return this.prisma.account.update({
      where: { id: accountId },
      data: { interfaceLanguage: dto.interfaceLanguage },
      select: { interfaceLanguage: true },
    });
  }
}
