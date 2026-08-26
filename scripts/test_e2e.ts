import dotenv from "dotenv";
import path from "path";
// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { supabaseAdmin } from "../packages/database/src/index";
import { hashPassword, generateToken } from "../packages/auth/src/index";
import { getLLMProvider } from "../packages/ai/src/index";
import { WorkflowExecutor } from "../packages/workflow-engine/src/index";

const TEST_EMAIL = `e2e_test_${Math.random().toString(36).substring(7)}@brainbox.ai`;
const TEST_PASSWORD = "password123";

async function runE2ETests() {
  console.log("🏁 Starting E2E Integration and Persistence Tests...\n");

  try {
    // --- 1. Database & Authentication Setup ---
    console.log("1️⃣ Setting up E2E Test User...");

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "E2E Test User" },
    });
    if (authError) throw authError;

    const user = authData.user;

    // Trigger handle_new_user should automatically create User in public."User",
    // but we can upsert to be safe
    const { data: publicUser, error: uError } = await supabaseAdmin.from("User")
      .upsert({ id: user.id, email: user.email, name: "E2E Test User" })
      .select()
      .single();
    if (uError) throw uError;

    // Create Workspace
    const { data: workspace, error: wsError } = await supabaseAdmin.from("Workspace")
      .insert({ name: "E2E Test Workspace" })
      .select()
      .single();
    if (wsError) throw wsError;

    // Link user to workspace
    const { error: wuError } = await supabaseAdmin.from("WorkspaceUser")
      .insert({
        workspaceId: workspace.id,
        userId: user.id,
        role: "OWNER",
      });
    if (wuError) throw wuError;

    // Generate valid Auth Token
    const token = generateToken({
      userId: user.id,
      email: user.email || "",
      workspaceId: workspace.id,
    });
    console.log(`✓ User registered: ${TEST_EMAIL}`);
    console.log(`✓ Token generated successfully.`);

    // --- 2. Create Conversation ---
    console.log("\n2️⃣ Creating Persistent Conversation...");
    const { data: conversation, error: convError } = await supabaseAdmin.from("Conversation")
      .insert({
        workspaceId: workspace.id,
        title: "E2E Automation Session",
      })
      .select()
      .single();
    if (convError) throw convError;
    console.log(`✓ Conversation created: "${conversation.title}" (ID: ${conversation.id})`);

    // --- 3. Chat & LLM Tool Planning ---
    console.log("\n3️⃣ Simulating Chat Prompt (representing voice transcription)...");
    const userPrompt = "Tomorrow at 10 AM remind me to submit the hackathon project and send an email to Arun Kumar saying the deadline is tomorrow.";
    
    // Save User message
    const { data: userMessage, error: uMsgError } = await supabaseAdmin.from("Message")
      .insert({
        conversationId: conversation.id,
        role: "USER",
        content: userPrompt,
        type: "TEXT",
      })
      .select()
      .single();
    if (uMsgError) throw uMsgError;

    // Run AI Provider
    const provider = getLLMProvider();
    const aiResponse = await provider.chat({
      recentMessages: [{ role: "user", content: userPrompt }],
      timezone: "Asia/Kolkata",
    });

    console.log(`✓ AI Response: "${aiResponse.content.substring(0, 70)}..."`);
    console.log(`✓ AI planned ${aiResponse.toolCalls?.length || 0} tool calls.`);

    // Save AI response in DB
    const { data: assistantMessage, error: aMsgError } = await supabaseAdmin.from("Message")
      .insert({
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: aiResponse.content,
        type: "TEXT",
        metadata: {
          toolCalls: aiResponse.toolCalls,
        },
      })
      .select()
      .single();
    if (aMsgError) throw aMsgError;

    // --- 4. Create Workflow from Chat ---
    console.log("\n4️⃣ Generating Workflow from AI Plan...");
    // Create nodes & edges matching the E2E requirement
    const { data: workflow, error: wfError } = await supabaseAdmin.from("Workflow")
      .insert({
        workspaceId: workspace.id,
        title: "E2E Submissions Flow",
        description: "Auto-generated workflow from E2E prompt",
        status: "DRAFT",
        conversationId: conversation.id,
      })
      .select()
      .single();
    if (wfError) throw wfError;

    const nodes = [
      {
        id: "node_trigger",
        type: "trigger.manual",
        label: "Manual Trigger",
        position: { x: 100, y: 100 },
        data: {},
      },
      {
        id: "node_approval",
        type: "action.approval",
        label: "Approval Needed",
        position: { x: 300, y: 100 },
        data: { actionType: "gmail.send", to: "arun.kumar@example.com" },
      },
      {
        id: "node_send_email",
        type: "action.gmail.send",
        label: "Send Gmail",
        position: { x: 500, y: 100 },
        data: { to: "arun.kumar@example.com", subject: "Project Deadline", body: "Deadline is tomorrow!" },
      },
    ];

    const edges = [
      { id: "e1", source: "node_trigger", target: "node_approval" },
      { id: "e2", source: "node_approval", target: "node_send_email" },
    ];

    const { error: verError } = await supabaseAdmin.from("WorkflowVersion")
      .insert({
        workflowId: workflow.id,
        version: 1,
        nodes,
        edges,
      });
    if (verError) throw verError;

    console.log(`✓ Workflow created: "${workflow.title}" linked to Conversation ID: ${workflow.conversationId}`);

    // --- 5. Executing Workflow & Halting on Approval ---
    console.log("\n5️⃣ Launching Workflow Execution (Manual Trigger)...");
    const { data: execution, error: execError } = await supabaseAdmin.from("Execution")
      .insert({
        workflowId: workflow.id,
        status: "RUNNING",
        triggerType: "manual",
        startedAt: new Date().toISOString(),
      })
      .select()
      .single();
    if (execError) throw execError;

    const executor = new WorkflowExecutor(workspace.id, execution.id);
    
    // Run execution - it should pause on the node_approval step and mark it as WAITING
    await executor.executeWorkflow(nodes, edges, "node_trigger");

    // Fetch the updated execution status
    const { data: updatedExec, error: getExecError } = await supabaseAdmin.from("Execution")
      .select("*, steps:ExecutionStep(*)")
      .eq("id", execution.id)
      .limit(1)
      .maybeSingle();

    if (getExecError) throw getExecError;

    console.log(`✓ Execution status: ${updatedExec?.status}`);
    const stepsList = updatedExec?.steps || [];
    const approvalStep = stepsList.find((s: any) => s.nodeId === "node_approval");
    console.log(`✓ Approval Node status: ${approvalStep?.status} (Expected: WAITING)`);

    if (approvalStep?.status !== "WAITING") {
      throw new Error(`Expected Approval node to halt with status WAITING, but got: ${approvalStep?.status}`);
    }

    // Check that an approval entry exists in DB
    const { data: approvalLog, error: appError } = await supabaseAdmin.from("Approval")
      .select("*")
      .eq("executionId", execution.id)
      .limit(1)
      .maybeSingle();

    if (appError) throw appError;
    console.log(`✓ Approval log registered in DB. Status: ${approvalLog?.status}`);

    // --- 6. Resuming Execution after Approval ---
    console.log("\n6️⃣ Approving Step and Resuming Execution...");
    const { error: appUpdateError } = await supabaseAdmin.from("Approval")
      .update({ status: "APPROVED", respondedAt: new Date().toISOString() })
      .eq("id", approvalLog!.id);
    if (appUpdateError) throw appUpdateError;

    const { error: stepUpdateError } = await supabaseAdmin.from("ExecutionStep")
      .update({ status: "SUCCESS", finishedAt: new Date().toISOString() })
      .eq("id", approvalStep.id);
    if (stepUpdateError) throw stepUpdateError;

    // Resume execution from the approval node
    await executor.resumeWorkflow(nodes, edges, "node_approval", { approved: true });

    // Verify finished execution
    const { data: finishedExec, error: finishedError } = await supabaseAdmin.from("Execution")
      .select("*, steps:ExecutionStep(*)")
      .eq("id", execution.id)
      .limit(1)
      .maybeSingle();

    if (finishedError) throw finishedError;

    console.log(`✓ Finished Execution status: ${finishedExec?.status} (Expected: SUCCESS)`);
    if (finishedExec?.status !== "SUCCESS") {
      throw new Error(`Expected execution to succeed, but got: ${finishedExec?.status}`);
    }

    // --- 7. Persistence / Page Reload verification ---
    console.log("\n7️⃣ Verifying Data Persistence (Simulating Browser Reload)...");
    const { data: reloadedConversation, error: reloadError } = await supabaseAdmin.from("Conversation")
      .select("*, messages:Message(*)")
      .eq("id", conversation.id)
      .limit(1)
      .maybeSingle();

    if (reloadError) throw reloadError;

    const reloadedMessages = reloadedConversation?.messages || [];
    console.log(`✓ Total messages reloaded from database: ${reloadedMessages.length}`);
    if (!reloadedConversation || reloadedMessages.length !== 2) {
      throw new Error(`Persistence failure: expected 2 messages but found: ${reloadedMessages.length}`);
    }

    const reloadedAssistantMsg = reloadedMessages.find((m: any) => m.role === "ASSISTANT");
    console.log(`✓ Assistant response persists in DB: "${reloadedAssistantMsg?.content.substring(0, 50)}..."`);
    console.log("✓ Persistence check passed!");

    // --- Clean Up ---
    console.log("\n🧹 Cleaning up E2E database records...");
    await supabaseAdmin.from("Workspace").delete().eq("id", workspace.id);
    await supabaseAdmin.auth.admin.deleteUser(user.id);
    console.log("✓ Cleanup finished.");

    console.log("\n🎉 ALL E2E INTEGRATION & PERSISTENCE TESTS PASSED SUCCESSFULLY! 🎉\n");
    process.exit(0);
  } catch (err: any) {
    console.error("\n❌ E2E Integration Test FAILED: ", err.message);
    process.exit(1);
  }
}

runE2ETests();
