-- Phase 12 P12-G: generalize first-contact messaging scope without deleting legacy enum values.
ALTER TYPE "MessageRequestReason" ADD VALUE IF NOT EXISTS 'OUTSIDE_ORG_SCOPE';
