import { ConsoleLogger } from '@nestjs/common';

import { redactSensitiveValue } from './secret-redaction';

export class SecretRedactingLogger extends ConsoleLogger {
  override log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(
      redactSensitiveValue(message),
      ...optionalParams.map((value) => redactSensitiveValue(value)),
    );
  }

  override error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(
      redactSensitiveValue(message),
      ...optionalParams.map((value) => redactSensitiveValue(value)),
    );
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(
      redactSensitiveValue(message),
      ...optionalParams.map((value) => redactSensitiveValue(value)),
    );
  }

  override debug(message: unknown, ...optionalParams: unknown[]): void {
    super.debug(
      redactSensitiveValue(message),
      ...optionalParams.map((value) => redactSensitiveValue(value)),
    );
  }

  override verbose(message: unknown, ...optionalParams: unknown[]): void {
    super.verbose(
      redactSensitiveValue(message),
      ...optionalParams.map((value) => redactSensitiveValue(value)),
    );
  }

  override fatal(message: unknown, ...optionalParams: unknown[]): void {
    super.fatal(
      redactSensitiveValue(message),
      ...optionalParams.map((value) => redactSensitiveValue(value)),
    );
  }
}
