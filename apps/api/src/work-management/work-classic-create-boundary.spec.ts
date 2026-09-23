import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('classic Work create boundary', () => {
  it('keeps the old Mobile and Telephone validation rules behind dynamic Work Type fields', () => {
    expect(source).toContain("validatedFieldMap.get('CUSTOMER_CONTACT_TYPE')");
    expect(source).toContain(
      "validatedFieldMap.get('CUSTOMER_CONTACT_NUMBER')",
    );
    expect(source).toContain('!/^\\d{10}$/.test(contactNumber)');
    expect(source).toContain("'Mobile number must contain exactly 10 digits.'");
    expect(source).toContain("contactNumber.replace(/\\D/g, '').length");
    expect(source).toContain('!/^[0-9][0-9 -]*[0-9]$/.test(contactNumber)');
    expect(source).toContain(
      "'Telephone number may contain only digits, spaces and hyphens.'",
    );
    expect(source).toContain('telephoneDigits < 6 || telephoneDigits > 12');
    expect(source).toContain(
      "'Telephone number must contain between 6 and 12 digits.'",
    );
  });

  it('keeps Create Work registered-date visibility aligned with the exact published version', () => {
    const start = source.indexOf('async getCreateContext');
    const end = source.indexOf('async create(', start);
    const createContextSource =
      start >= 0 && end > start ? source.slice(start, end) : '';

    expect(createContextSource).toMatch(
      /field\.code === 'REGISTERED_AT'\s*&&\s*isWorkFieldCollectedAtCreation\(field\)/,
    );
    expect(createContextSource).toContain(
      'registeredAtEnabled: Boolean(registeredAtDefinition)',
    );
  });

  const source = readFileSync(
    join(process.cwd(), 'src', 'work-management', 'work-items.service.ts'),
    'utf8',
  );

  it('keeps REGISTERED_AT as the dedicated Work timestamp instead of validating it twice as a configurable field', () => {
    expect(source).toContain("field.code !== 'REGISTERED_AT'");
    expect(source).toContain('isWorkFieldCollectedAtCreation(field)');
    expect(source).toContain(
      `'Registered date and time is required for this Work Type.'`,
    );
    expect(source).toContain(
      `'Registered date and time is not collected by this Work Type version.'`,
    );
  });

  it('keeps operational schedule validation aligned with the create UI', () => {
    expect(source).toContain(
      `'Registered date and time cannot be in the future.'`,
    );
    expect(source).toContain(
      `'Planned start cannot be earlier than the registered date and time.'`,
    );
    expect(source).toContain(
      `'Due time must be later than the planned start time.'`,
    );
  });

  it('accepts a Sales Member from the selected Sales OrgUnit subtree', () => {
    expect(source).toContain('ancestorOrgUnitId: dto.salesOrgUnitId');
    expect(source).toContain('descendantOrgUnitId: salesMemberOrgUnitId');
    expect(source).toContain(
      `'The Sales Member must belong to the selected Sales OrgUnit or one of its child units.'`,
    );
  });

  it('keeps Main executor, Responsible Reviewer, Sales Member and Supporting Staff separated', () => {
    expect(source).toContain('const mainExecutorAccountIds = new Set<string>');
    expect(source).toContain('mainExecutorAccountIds.has(reviewer.id)');
    expect(source).toContain('salesMember.id === reviewer.id');
    expect(source).toContain('...mainExecutorAccountIds');
    expect(source).toContain('reviewer.id');
    expect(source).toContain(
      `'Supporting Staff must be different from the Main executor, Responsible Reviewer and Sales Member.'`,
    );
  });

  it('removes performing team members and the administrative assignee from reviewer choices', () => {
    expect(source).toContain(
      'reviewer.eligibleOwnerOrgUnitIds.includes(team.orgUnitId)',
    );
    expect(source).toContain('!memberAccountIds.includes(reviewer.accountId)');
    expect(source).toContain(
      '(reviewer) => reviewer.accountId !== candidate.accountId',
    );
    expect(source).toContain(
      '!team.memberAccountIds.includes(actor.accountId) ||',
    );
    expect(source).toContain('team.reviewerCandidates.length > 0');
    expect(source).toContain('mainExecutorAccountIds.has(reviewer.id)');
    expect(source).toContain(
      'The Responsible Reviewer cannot also perform this Work as the Main Assignee or Main Team member.',
    );
  });

  it('defaults review ownership to the creating V3 Head and validates only explicit reviewer delegation', () => {
    expect(source).toContain(
      'requestedAccountId || requestedAccountId === creatorAccountId',
    );
    expect(source).toContain('return { id: creatorAccountId };');
    expect(source).toContain('dto.responsibleReviewerAccountId');
    expect(source).toContain(
      `'Individual Administrative Work is reviewed by the Head who created the Work.'`,
    );
  });
  it('uses the published Work Type field definitions without recreating canonical defaults', () => {
    expect(source).not.toContain('reconcileFixedRuntimeFields');
    expect(source).not.toContain('CLASSIC_RUNTIME_INTAKE_FIELD_CODES');
    expect(source).toContain('version.fields.filter(');
    expect(source).toContain('isWorkFieldCollectedAtCreation(field)');
  });

  it('accepts a Primary Execution OrgUnit anywhere in the Office and scopes the Main Team to that subtree', () => {
    expect(source).toContain('id: dto.primaryExecutionOrgUnitId');
    expect(source).toContain('officeId,');
    expect(source).toContain('ancestorOrgUnitId: primaryExecutionOrgUnit.id');
    expect(source).toContain('descendantOrgUnitId: mainTeam.orgUnitId');
    expect(source).toContain(
      'primaryOwnerOrgUnitId: primaryExecutionOrgUnit.id',
    );
    expect(source).toContain(
      `'Choose a Main Team from the selected Primary Execution OrgUnit or one of its child units.'`,
    );
  });

  it('lets any current Main Team member start shared team-owned Work', () => {
    expect(source).toContain('startsAt: { lte: now }');
    expect(source).toContain(
      'Only a current Main Team member can start this Work.',
    );
    expect(source).toContain('current.status === WorkItemStatus.ASSIGNED');
    expect(source).toContain('? WorkItemStatus.IN_PROGRESS');
    expect(source).toContain('sharedMainTeam: true');
    expect(source).toContain('startedByAccountId: actor.accountId');
  });

  it('returns current Operational Team membership for the restored My Work people panel', () => {
    expect(source).toContain('members: {');
    expect(source).toContain('where: { endsAt: null }');
    expect(source).toContain('leadAssignments: {');
    expect(source).toContain('take: 1');
  });

  it('rejects a stale Create Work form instead of silently switching to a newer published version', () => {
    expect(source).toContain(
      'workTypeDefinitionId: version.workTypeDefinition.id',
    );
    expect(source).toContain('status: WorkTypeVersionStatus.PUBLISHED');
    expect(source).toContain("orderBy: { version: 'desc' }");
    expect(source).toContain('currentPublishedVersion?.id !== version.id');
    expect(source).toContain(
      `'This Work Type changed after this form was opened. Refresh Create Work and review the latest published version before submitting.'`,
    );
  });

  it('keeps Allow Other service values in dynamic fields without sending custom text to the legacy Prisma enum', () => {
    expect(source).toContain(
      "const configuredServiceTypes = listField('SERVICE_TYPES')",
    );
    expect(source).toMatch(
      /Object\.values\(WorkServiceType\)\.includes\(\s*serviceType as WorkServiceType,?\s*\)/,
    );
    expect(source).toContain('legacyServiceTypeSet.add(WorkServiceType.OTHER)');
    expect(source).toContain("customServiceTypes.join(', ')");
    expect(source).toContain('serviceTypes: legacyServiceTypes');
    expect(source).toContain('otherServiceText: legacyOtherServiceText');
    expect(source).not.toContain(
      "serviceTypes: listField('SERVICE_TYPES') as WorkServiceType[]",
    );
  });
});
