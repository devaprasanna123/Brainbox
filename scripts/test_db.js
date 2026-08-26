const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function test() {
  const columns = ['id', 'type', 'name', 'email', 'createdAt', 'created_at', 'workspaceId', 'workspace_id'];
  for (const col of columns) {
    console.log(`Checking column: ${col}...`);
    const { error } = await supabase
      .from('Credential')
      .select(col)
      .limit(1);

    if (error) {
      console.log(`❌ Column "${col}" error: ${error.message}`);
    } else {
      console.log(`✅ Column "${col}" exists.`);
    }
  }
}

test();
