-- ================================================================
-- Brain Box AI — Memory Table Migration
-- Run this in Supabase SQL Editor if your Memory table was created
-- before August 2026 and is missing the new columns.
-- ================================================================

-- Add importance column (0.0 = low importance, 1.0 = critical)
ALTER TABLE public."Memory"
  ADD COLUMN IF NOT EXISTS importance FLOAT NOT NULL DEFAULT 0.5;

-- Add source conversation reference (nullable)
ALTER TABLE public."Memory"
  ADD COLUMN IF NOT EXISTS "sourceConversationId" UUID
  REFERENCES public."Conversation"(id) ON DELETE SET NULL;

-- Add last accessed timestamp for LRU eviction in future
ALTER TABLE public."Memory"
  ADD COLUMN IF NOT EXISTS "lastAccessedAt" TIMESTAMP WITH TIME ZONE;

-- Create index on workspaceId + type for faster memory queries
CREATE INDEX IF NOT EXISTS "Memory_workspaceId_type_idx"
  ON public."Memory"("workspaceId", type);

-- Create index on importance for relevance-ordered queries
CREATE INDEX IF NOT EXISTS "Memory_importance_idx"
  ON public."Memory"(importance DESC);
