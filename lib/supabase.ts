import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

// These are publishable browser credentials (never service-role credentials).
// Environment values can override them on native Next.js/Vercel builds; the
// fallback keeps the Sites/Vinext client bundle connected after remote builds.
const defaultSupabaseUrl = "https://eczwnfqyafwbbjrsbokj.supabase.co";
const defaultSupabasePublishableKey = "sb_publishable_3nusGH9AzwmMb5Bz8TcxsA_CiXL9Mvn";

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || defaultSupabaseUrl;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    defaultSupabasePublishableKey;

  if (!url || !publishableKey) return null;

  if (!browserClient) {
    browserClient = createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || defaultSupabaseUrl) &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        defaultSupabasePublishableKey),
  );
}
