import { SetMetadata } from '@nestjs/common';
import { AccountClass } from '../../generated/prisma/client';

export const ACCOUNT_CLASSES_KEY = 'required_account_classes';

export const AccountClasses = (...accountClasses: AccountClass[]) =>
  SetMetadata(ACCOUNT_CLASSES_KEY, accountClasses);
