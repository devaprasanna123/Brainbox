export declare function createBrowserClient(): import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare function createServerClient(token?: string): import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare function createAdminClient(): import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare const supabaseClient: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare const supabaseAdmin: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export type SupabaseClientType = typeof supabaseClient;
export type SupabaseAdminType = typeof supabaseAdmin;
