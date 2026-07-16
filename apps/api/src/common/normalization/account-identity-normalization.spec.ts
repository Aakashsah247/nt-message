import { BadRequestException } from '@nestjs/common';

import {
  getNepalPhoneLookupVariants,
  maskNepalPhoneNumber,
  normalizeAccountIdentity,
  normalizeEmployeeId,
  normalizeEmployeeName,
  normalizeNepalPhoneNumber,
  normalizeOfficialEmailForLookup,
  sanitizeOfficialEmail,
} from './account-identity-normalization';

describe('account identity normalization', () => {
  describe('normalizeEmployeeName', () => {
    it('trims and collapses repeated whitespace', () => {
      expect(normalizeEmployeeName('  Aakash   Shah  ')).toBe('Aakash Shah');
    });

    it('normalizes canonically equivalent Unicode text', () => {
      expect(normalizeEmployeeName('  Aaka\u0301sh   Sah  ')).toBe(
        'Aakásh Sah',
      );
    });
  });

  describe('normalizeEmployeeId', () => {
    it('trims and converts letters to uppercase', () => {
      expect(normalizeEmployeeId('  ntc-1001  ')).toBe('NTC-1001');
    });
  });

  describe('official email handling', () => {
    it('preserves approved casing after trimming for display and delivery', () => {
      expect(sanitizeOfficialEmail(' aakashSAH123@gmail.com ')).toBe(
        'aakashSAH123@gmail.com',
      );
    });

    it('creates a lowercase comparison key without changing the stored address', () => {
      expect(
        normalizeOfficialEmailForLookup(' AakashSAH123@GMAIL.COM '),
      ).toBe(
        'aakashsah123@gmail.com',
      );
    });
  });

  describe('normalizeNepalPhoneNumber', () => {
    it.each([
      '9801234567',
      '9779801234567',
      '+9779801234567',
    ])('normalizes %s to the canonical Nepal format', (value: string) => {
      expect(normalizeNepalPhoneNumber(value)).toBe('+9779801234567');
    });

    it.each([
      '',
      '009779801234567',
      '+977 980-123-4567',
      '+977 (980) 123-4567',
      '+911234567890',
      '980123456',
      '98012345678',
      '+97798ABC34567',
    ])('rejects unsupported input %s', (value: string) => {
      expect(() => normalizeNepalPhoneNumber(value)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('getNepalPhoneLookupVariants', () => {
    it('returns canonical and approved legacy-equivalent values', () => {
      expect(getNepalPhoneLookupVariants('+9779801234567')).toEqual([
        '+9779801234567',
        '9801234567',
        '9779801234567',
      ]);
    });
  });

  describe('normalizeAccountIdentity', () => {
    it('prepares canonical storage and lookup values once', () => {
      expect(
        normalizeAccountIdentity({
          empId: ' ntc-1001 ',
          empName: '  Aaka\u0301sh   Sah ',
          phoneNumber: '9801234567',
          officialEmail: ' AakashSAH123@GMAIL.COM ',
        }),
      ).toEqual({
        empId: 'NTC-1001',
        empName: 'Aakásh Sah',
        phoneNumber: '+9779801234567',
        phoneLookupValues: [
          '+9779801234567',
          '9801234567',
          '9779801234567',
        ],
        officialEmail: 'AakashSAH123@GMAIL.COM',
        officialEmailLookup: 'aakashsah123@gmail.com',
      });
    });
  });

  describe('maskNepalPhoneNumber', () => {
    it('keeps only the country/prefix and final two digits visible', () => {
      expect(maskNepalPhoneNumber('9801234567')).toBe('+97798******67');
    });
  });
});
