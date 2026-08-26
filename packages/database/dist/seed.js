"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables from the monorepo root
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), "../../.env") });
async function seed() {
    console.log("🌱 Starting Database Seeding via Supabase...");
    const email = "demo@brainbox.ai";
    const password = "password123";
    // 1. Create or Find Demo User in Supabase Auth
    const { data: usersData, error: listError } = await index_1.supabaseAdmin.auth.admin.listUsers();
    if (listError) {
        console.error("❌ Error listing auth users:", listError.message);
        process.exit(1);
    }
    let user = usersData.users.find((u) => u.email === email);
    if (!user) {
        console.log(`👤 Creating Demo User in Supabase Auth: ${email}`);
        const { data: newUser, error: createError } = await index_1.supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name: "Demo User" },
        });
        if (createError) {
            console.error("❌ Error creating demo user:", createError.message);
            process.exit(1);
        }
        user = newUser.user;
    }
    else {
        console.log(`👤 Demo User already exists: ${user.email} (ID: ${user.id})`);
    }
    // 2. Ensure public."User" row exists (trigger should have run, but let's make sure)
    const { data: publicUser, error: publicUserError } = await index_1.supabaseAdmin.from("User")
        .upsert({ id: user.id, email: user.email, name: "Demo User" })
        .select()
        .single();
    if (publicUserError) {
        console.error("❌ Error upserting public User:", publicUserError.message);
        process.exit(1);
    }
    // 3. Create or Link Demo Workspace
    const { data: existingWu, error: wuCheckError } = await index_1.supabaseAdmin.from("WorkspaceUser")
        .select("workspaceId")
        .eq("userId", user.id)
        .limit(1)
        .maybeSingle();
    if (wuCheckError) {
        console.error("❌ Error checking WorkspaceUser link:", wuCheckError.message);
        process.exit(1);
    }
    let workspaceId = existingWu?.workspaceId;
    if (!workspaceId) {
        console.log("💼 Creating Personal Workspace...");
        const { data: ws, error: wsError } = await index_1.supabaseAdmin.from("Workspace")
            .insert({ name: "Personal Workspace" })
            .select()
            .single();
        if (wsError) {
            console.error("❌ Error creating workspace:", wsError.message);
            process.exit(1);
        }
        workspaceId = ws.id;
        // Link User and Workspace
        const { error: wuError } = await index_1.supabaseAdmin.from("WorkspaceUser")
            .insert({ workspaceId, userId: user.id, role: "OWNER" });
        if (wuError) {
            console.error("❌ Error creating WorkspaceUser link:", wuError.message);
            process.exit(1);
        }
        // Create default preferences
        const { error: prefError } = await index_1.supabaseAdmin.from("UserPreference")
            .insert({
            workspaceId,
            theme: "system",
            timezone: "Asia/Kolkata",
            voiceInput: true,
            voiceAutoSend: false,
            voiceResponse: false,
        });
        if (prefError) {
            console.error("❌ Error creating preferences:", prefError.message);
            process.exit(1);
        }
    }
    else {
        console.log(`💼 Workspace already exists: ${workspaceId}`);
    }
    // 4. Seed Templates
    const { data: existingTemplates, error: tCheckError } = await index_1.supabaseAdmin.from("Template").select("id, title");
    if (tCheckError) {
        console.error("❌ Error checking templates:", tCheckError.message);
        process.exit(1);
    }
    if (!existingTemplates || existingTemplates.length === 0) {
        console.log("📄 Seeding templates...");
        const templates = [
            {
                title: "Daily Gmail Summary",
                description: "Search for important unread emails every morning, summarize them with AI, and send you the briefing.",
                nodes: [
                    {
                        id: "node_trigger",
                        type: "trigger.schedule",
                        label: "Schedule",
                        position: { x: 100, y: 100 },
                        data: { cron: "0 8 * * 1-5" },
                    },
                    {
                        id: "node_search",
                        type: "action.gmail.search",
                        label: "Search Gmail",
                        position: { x: 350, y: 100 },
                        data: { query: "is:unread category:primary" },
                    },
                    {
                        id: "node_ai",
                        type: "action.ai.summary",
                        label: "AI Summarizer",
                        position: { x: 600, y: 100 },
                        data: { prompt: "Summarize these emails with key action items." },
                    },
                    {
                        id: "node_send",
                        type: "action.gmail.send",
                        label: "Send Email",
                        position: { x: 850, y: 100 },
                        data: { to: "self", subject: "Daily Gmail Summary" },
                    },
                ],
                edges: [
                    { id: "e1", source: "node_trigger", target: "node_search" },
                    { id: "e2", source: "node_search", target: "node_ai" },
                    { id: "e3", source: "node_ai", target: "node_send" },
                ],
            },
            {
                title: "Calendar Reminder",
                description: "Triggered by chat or timer, creates a calendar event and sends notification.",
                nodes: [
                    {
                        id: "node_trigger",
                        type: "trigger.manual",
                        label: "Manual Trigger",
                        position: { x: 100, y: 100 },
                        data: {},
                    },
                    {
                        id: "node_calendar",
                        type: "action.calendar.create",
                        label: "Create Event",
                        position: { x: 350, y: 100 },
                        data: { title: "Submit Project", durationMinutes: 30 },
                    },
                    {
                        id: "node_notify",
                        type: "action.telegram.send",
                        label: "Telegram Notification",
                        position: { x: 600, y: 100 },
                        data: { message: "Calendar event 'Submit Project' created successfully!" },
                    },
                ],
                edges: [
                    { id: "e1", source: "node_trigger", target: "node_calendar" },
                    { id: "e2", source: "node_calendar", target: "node_notify" },
                ],
            },
            {
                title: "Meeting Assistant",
                description: "Scan upcoming calendar events, gather document details, and draft follow-up briefs.",
                nodes: [
                    {
                        id: "node_trigger",
                        type: "trigger.schedule",
                        label: "Every Evening",
                        position: { x: 100, y: 100 },
                        data: { cron: "0 18 * * *" },
                    },
                    {
                        id: "node_list_cal",
                        type: "action.calendar.list",
                        label: "List Meetings",
                        position: { x: 350, y: 100 },
                        data: { timeRange: "tomorrow" },
                    },
                    {
                        id: "node_ai_prep",
                        type: "action.ai.gateway",
                        label: "Generate Agenda Briefs",
                        position: { x: 600, y: 100 },
                        data: { prompt: "Prepare meeting briefs for these events." },
                    },
                    {
                        id: "node_draft_gmail",
                        type: "action.gmail.draft",
                        label: "Draft Brief Email",
                        position: { x: 850, y: 100 },
                        data: { subject: "Preparation for Tomorrow's Meetings" },
                    },
                ],
                edges: [
                    { id: "e1", source: "node_trigger", target: "node_list_cal" },
                    { id: "e2", source: "node_list_cal", target: "node_ai_prep" },
                    { id: "e3", source: "node_ai_prep", target: "node_draft_gmail" },
                ],
            },
        ];
        const { error: tError } = await index_1.supabaseAdmin.from("Template").insert(templates);
        if (tError) {
            console.error("❌ Error seeding templates:", tError.message);
            process.exit(1);
        }
        console.log("✅ Templates seeded successfully.");
    }
    else {
        console.log("📄 Templates already exist. Skipping template seeding.");
    }
    console.log("✅ Database seeding completed successfully!");
}
seed().catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map