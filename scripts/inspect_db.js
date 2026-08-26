const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function inspect() {
  console.log("Checking Supabase tables...");
  
  const tables = ['User', 'Workspace', 'WorkspaceUser', 'Memory', 'Conversation', 'Message', 'Credential', 'Workflow', 'Execution'];
  for (const table of tables) {
    try {
      const { data, error, count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`❌ Table "${table}" error: ${error.message}`);
      } else {
        console.log(`✅ Table "${table}" exists. Row count: ${count}`);
      }
    } catch (e) {
      console.log(`❌ Table "${table}" exception: ${e.message}`);
    }
  }
}

inspect();
