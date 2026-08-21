import { IsIn } from 'class-validator';

export const INTERFACE_LANGUAGES = ['en', 'ne'] as const;
export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];

export class UpdateAccountLanguageDto {
  @IsIn(INTERFACE_LANGUAGES)
  interfaceLanguage!: InterfaceLanguage;
}
