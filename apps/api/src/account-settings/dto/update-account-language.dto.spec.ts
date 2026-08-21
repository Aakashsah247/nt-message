import { validateSync } from 'class-validator';

import { UpdateAccountLanguageDto } from './update-account-language.dto';

function buildDto(interfaceLanguage: string): UpdateAccountLanguageDto {
  return Object.assign(new UpdateAccountLanguageDto(), {
    interfaceLanguage,
  });
}

describe('UpdateAccountLanguageDto', () => {
  it.each(['en', 'ne'])('accepts supported language %s', (language) => {
    expect(validateSync(buildDto(language))).toHaveLength(0);
  });

  it.each(['', 'np', 'english', 'EN'])('rejects unsupported language %s', (language) => {
    expect(
      validateSync(buildDto(language)).some(
        (error) => error.property === 'interfaceLanguage',
      ),
    ).toBe(true);
  });
});
