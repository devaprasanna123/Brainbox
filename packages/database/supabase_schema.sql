-- Supabase Schema Migration
-- Brain Box AI Automations Database Layout

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Enums
CREATE TYPE public."UserRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');
CREATE TYPE public."MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');
CREATE TYPE public."MessageType" AS ENUM ('TEXT', 'VOICE', 'IMAGE', 'FILE', 'TOOL_CALL', 'TOOL_RESULT', 'WORKFLOW', 'APPROVAL', 'SYSTEM', 'ERROR');
CREATE TYPE public."WorkflowStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DRAFT');
CREATE TYPE public."ExecutionStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'WAITING', 'CANCELLED');

-- 2. Create User/Profile Table
CREATE TABLE public."User" (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 3. Create Workspace Table
CREATE TABLE public."Workspace" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 4. Create WorkspaceUser Mapping Table
CREATE TABLE public."WorkspaceUser" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL REFERENCES public."Workspace"(id) ON DELETE CASCADE,
    "userId" TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
    role public."UserRole" NOT NULL DEFAULT 'OWNER',
    UNIQUE("workspaceId", "userId")
);

-- 5. Create Session Table (Optional, for token tracking)
CREATE TABLE public."Session" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 6. Create Conversation Table
CREATE TABLE public."Conversation" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL REFERENCES public."Workspace"(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Chat',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "archivedAt" TIMESTAMP WITH TIME ZONE,
    pinned BOOLEAN NOT NULL DEFAULT FALSE
);

-- 7. Create Message Table
CREATE TABLE public."Message" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL REFERENCES public."Conversation"(id) ON DELETE CASCADE,
    role public."MessageRole" NOT NULL,
    type public."MessageType" NOT NULL DEFAULT 'TEXT',
    content TEXT NOT NULL,
    metadata JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 8. Create MessageAttachment Table
CREATE TABLE public."MessageAttachment" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "messageId" UUID NOT NULL REFERENCES public."Message"(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    size INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 9. Create ConversationSummary Table
CREATE TABLE public."ConversationSummary" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL REFERENCES public."Conversation"(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 10. Create Memory Table
CREATE TABLE public."Memory" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL REFERENCES public."Workspace"(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    importance FLOAT NOT NULL DEFAULT 0.5,
    "sourceConversationId" UUID REFERENCES public."Conversation"(id) ON DELETE SET NULL,
    "lastAccessedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE("workspaceId", type, key)
);

-- Migration: Add new columns to existing Memory table (run if schema already applied)
-- ALTER TABLE public."Memory" ADD COLUMN IF NOT EXISTS importance FLOAT NOT NULL DEFAULT 0.5;
-- ALTER TABLE public."Memory" ADD COLUMN IF NOT EXISTS "sourceConversationId" UUID REFERENCES public."Conversation"(id) ON DELETE SET NULL;
-- ALTER TABLE public."Memory" ADD COLUMN IF NOT EXISTS "lastAccessedAt" TIMESTAMP WITH TIME ZONE;

-- 11. Create UserPreference Table
CREATE TABLE public."UserPreference" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspaceId" UUID UNIQUE NOT NULL REFERENCES public."Workspace"(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'system',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    "voiceInput" BOOLEAN NOT NULL DEFAULT TRUE,
    "voiceAutoSend" BOOLEAN NOT NULL DEFAULT FALSE,
    "voiceResponse" BOOLEAN NOT NULL DEFAULT FALSE
);

-- 12. Create Credential Table (Encrypted)
CREATE TABLE public."Credential" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL REFERENCES public."Workspace"(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 13. Create Workflow Table
CREATE TABLE public."Workflow" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL REFERENCES public."Workspace"(id) ON DELETE CASCADE,
    "conversationId" UUID REFERENCES public."Conversation"(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status public."WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    version INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "credentialId" UUID REFERENCES public."Credential"(id) ON DELETE SET NULL
);

-- 14. Create WorkflowVersion Table
CREATE TABLE public."WorkflowVersion" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workflowId" UUID NOT NULL REFERENCES public."Workflow"(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    nodes JSONB NOT NULL,
    edges JSONB NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE("workflowId", version)
);

-- 15. Create Execution Table
CREATE TABLE public."Execution" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workflowId" UUID NOT NULL REFERENCES public."Workflow"(id) ON DELETE CASCADE,
    status public."ExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "triggerType" TEXT NOT NULL,
    "triggerData" JSONB,
    "startedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "finishedAt" TIMESTAMP WITH TIME ZONE,
    "durationMs" INTEGER
);

-- 16. Create ExecutionStep Table
CREATE TABLE public."ExecutionStep" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "executionId" UUID NOT NULL REFERENCES public."Execution"(id) ON DELETE CASCADE,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    status public."ExecutionStatus" NOT NULL,
    input JSONB,
    output JSONB,
    error TEXT,
    "startedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "finishedAt" TIMESTAMP WITH TIME ZONE
);

-- 17. Create Approval Table
CREATE TABLE public."Approval" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workflowId" UUID NOT NULL REFERENCES public."Workflow"(id) ON DELETE CASCADE,
    "executionId" UUID NOT NULL REFERENCES public."Execution"(id) ON DELETE CASCADE,
    "nodeId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    details JSONB NOT NULL,
    status TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "respondedAt" TIMESTAMP WITH TIME ZONE
);

-- 18. Create Schedule Table
CREATE TABLE public."Schedule" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workflowId" UUID NOT NULL REFERENCES public."Workflow"(id) ON DELETE CASCADE,
    cron TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    "nextRun" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 19. Create Notification Table
CREATE TABLE public."Notification" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 20. Create Template Table (Global/Public)
CREATE TABLE public."Template" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    nodes JSONB NOT NULL,
    edges JSONB NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 21. Create AuditLog Table
CREATE TABLE public."AuditLog" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspaceId" UUID NOT NULL REFERENCES public."Workspace"(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    details JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);


-- ==========================================
-- Triggers for Automation
-- ==========================================

-- Automatically create User profile when auth.users is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public."User" (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==========================================
-- Helper Functions for Row Level Security
-- ==========================================

-- Check if user is a member of the workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(workspace_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public."WorkspaceUser"
    WHERE "workspaceId" = workspace_id AND "userId" = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has access to workflow
CREATE OR REPLACE FUNCTION public.is_workflow_member(workflow_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public."Workflow" w
    JOIN public."WorkspaceUser" wu ON wu."workspaceId" = w."workspaceId"
    WHERE w.id = workflow_id AND wu."userId" = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has access to conversation
CREATE OR REPLACE FUNCTION public.is_conversation_member(conversation_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public."Conversation" c
    JOIN public."WorkspaceUser" wu ON wu."workspaceId" = c."workspaceId"
    WHERE c.id = conversation_id AND wu."userId" = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has access to execution
CREATE OR REPLACE FUNCTION public.is_execution_member(execution_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public."Execution" e
    JOIN public."Workflow" w ON w.id = e."workflowId"
    JOIN public."WorkspaceUser" wu ON wu."workspaceId" = w."workspaceId"
    WHERE e.id = execution_id AND wu."userId" = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- Enable RLS & Apply Policies
-- ==========================================

-- User
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow users to manage own profile" ON public."User"
  FOR ALL TO authenticated USING (id = auth.uid());

-- Workspace
ALTER TABLE public."Workspace" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to Workspace" ON public."Workspace"
  FOR ALL TO authenticated USING (public.is_workspace_member(id));

-- WorkspaceUser
ALTER TABLE public."WorkspaceUser" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to WorkspaceUser" ON public."WorkspaceUser"
  FOR ALL TO authenticated USING ("userId" = auth.uid());

-- Session
ALTER TABLE public."Session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow users access to own Session" ON public."Session"
  FOR ALL TO authenticated USING ("userId" = auth.uid());

-- Conversation
ALTER TABLE public."Conversation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to Conversation" ON public."Conversation"
  FOR ALL TO authenticated USING (public.is_workspace_member("workspaceId"));

-- Message
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to Message" ON public."Message"
  FOR ALL TO authenticated USING (public.is_conversation_member("conversationId"));

-- MessageAttachment
ALTER TABLE public."MessageAttachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to MessageAttachment" ON public."MessageAttachment"
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public."Message" m
      WHERE m.id = "messageId" AND public.is_conversation_member(m."conversationId")
    )
  );

-- ConversationSummary
ALTER TABLE public."ConversationSummary" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to ConversationSummary" ON public."ConversationSummary"
  FOR ALL TO authenticated USING (public.is_conversation_member("conversationId"));

-- Memory
ALTER TABLE public."Memory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to Memory" ON public."Memory"
  FOR ALL TO authenticated USING (public.is_workspace_member("workspaceId"));

-- UserPreference
ALTER TABLE public."UserPreference" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to UserPreference" ON public."UserPreference"
  FOR ALL TO authenticated USING (public.is_workspace_member("workspaceId"));

-- Credential
ALTER TABLE public."Credential" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to Credential" ON public."Credential"
  FOR ALL TO authenticated USING (public.is_workspace_member("workspaceId"));

-- Workflow
ALTER TABLE public."Workflow" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to Workflow" ON public."Workflow"
  FOR ALL TO authenticated USING (public.is_workspace_member("workspaceId"));

-- WorkflowVersion
ALTER TABLE public."WorkflowVersion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to WorkflowVersion" ON public."WorkflowVersion"
  FOR ALL TO authenticated USING (public.is_workflow_member("workflowId"));

-- Execution
ALTER TABLE public."Execution" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to Execution" ON public."Execution"
  FOR ALL TO authenticated USING (public.is_workflow_member("workflowId"));

-- ExecutionStep
ALTER TABLE public."ExecutionStep" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to ExecutionStep" ON public."ExecutionStep"
  FOR ALL TO authenticated USING (public.is_execution_member("executionId"));

-- Approval
ALTER TABLE public."Approval" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to Approval" ON public."Approval"
  FOR ALL TO authenticated USING (public.is_workflow_member("workflowId"));

-- Schedule
ALTER TABLE public."Schedule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to Schedule" ON public."Schedule"
  FOR ALL TO authenticated USING (public.is_workflow_member("workflowId"));

-- Notification
ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow user access to Notification" ON public."Notification"
  FOR ALL TO authenticated USING ("userId" = auth.uid());

-- Template (Global read, no write)
ALTER TABLE public."Template" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users read Template" ON public."Template"
  FOR SELECT TO authenticated USING (true);

-- AuditLog
ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow members access to AuditLog" ON public."AuditLog"
  FOR ALL TO authenticated USING (public.is_workspace_member("workspaceId"));

-- ==========================================
-- Performance & Query Indexes
-- ==========================================
CREATE INDEX IF NOT EXISTS "idx_workspaceuser_userid" ON public."WorkspaceUser" ("userId");
CREATE INDEX IF NOT EXISTS "idx_conversation_workspace_updated" ON public."Conversation" ("workspaceId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_message_conversation_created" ON public."Message" ("conversationId", "createdAt" ASC);
CREATE INDEX IF NOT EXISTS "idx_memory_workspace_updated" ON public."Memory" ("workspaceId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_credential_workspace_type" ON public."Credential" ("workspaceId", "type");
CREATE INDEX IF NOT EXISTS "idx_workflow_workspace_updated" ON public."Workflow" ("workspaceId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_execution_workflow_started" ON public."Execution" ("workflowId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_executionstep_execution_started" ON public."ExecutionStep" ("executionId", "startedAt" ASC);

