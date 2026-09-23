-- Part 2 Work Type builder: support the finalized Team-or-Individual execution model.
ALTER TYPE "WorkStageAssignmentMode" ADD VALUE IF NOT EXISTS 'TEAM_OR_USER';
