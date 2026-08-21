-- Migration: remove_message_lists
-- Drops message list tables introduced earlier. This is destructive: review before applying.

DROP TABLE IF EXISTS "message_list_members" CASCADE;
DROP TABLE IF EXISTS "message_lists" CASCADE;
