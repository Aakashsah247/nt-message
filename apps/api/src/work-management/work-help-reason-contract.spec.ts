import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('classic Work help reason contract', () => {
  const lifecycle = readFileSync(
    join(__dirname, 'work-lifecycle.service.ts'),
    'utf8',
  );
  const dto = readFileSync(
    join(__dirname, 'dto/request-work-help.dto.ts'),
    'utf8',
  );
  const schema = readFileSync(
    join(__dirname, '../../prisma/schema.prisma'),
    'utf8',
  );

  it('adds FAP maintenance and structured STB/CPE/Drop Fiber material selection', () => {
    expect(schema).toContain('FAP_MAINTENANCE');
    expect(schema).toContain('enum WorkHelpMaterialType');
    expect(schema).toContain('DROP_FIBER');
    expect(dto).toContain('materialType?: WorkHelpMaterialType');
    expect(lifecycle).toContain('Choose STB, CPE or Drop Fiber');
  });

  it('keeps historical safety rows readable but rejects new safety help requests', () => {
    expect(schema).toContain('SAFETY_CONCERN');
    expect(lifecycle).toContain(
      'Safety problem is no longer an available Need Help reason.',
    );
  });
});
