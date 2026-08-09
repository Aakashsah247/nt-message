import { MessageRequestReason } from '../generated/prisma/enums';
import { requiresMessageRequestApproval } from './message-request-policy';

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('requiresMessageRequestApproval', () => {
  it('preserves direct-contact decisions from the existing policy', () => {
    expect(requiresMessageRequestApproval(null, true)).toBe(false);
    expect(requiresMessageRequestApproval(null, false)).toBe(false);
  });

  it('requires approval when the existing rule applies and the recipient opted in', () => {
    expect(
      requiresMessageRequestApproval(
        MessageRequestReason.CROSS_DEPARTMENT,
        true,
      ),
    ).toBe(true);
  });

  it('allows direct first contact when the recipient waives message requests', () => {
    expect(
      requiresMessageRequestApproval(
        MessageRequestReason.PROTECTED_RECIPIENT,
        false,
      ),
    ).toBe(false);
  });
});
