import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const unavailableError = () => new Error(
  "Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to enable authentication and file storage.",
);

const unavailableSupabase = {
  auth: {
    signOut: async () => ({ error: null }),
    getSession: async () => ({ data: { session: null }, error: unavailableError() }),
    signInWithIdToken: async () => ({ data: { session: null }, error: unavailableError() }),
  },
  storage: {
    from: () => ({
      upload: async () => ({ data: null, error: unavailableError() }),
      createSignedUrl: async () => ({ data: { signedUrl: "" }, error: unavailableError() }),
    }),
  },
} as unknown as SupabaseClient;

export const supabase = (url && publishableKey
  ? createClient(url, publishableKey)
  : unavailableSupabase) as SupabaseClient;
export const SUPABASE_STORAGE_BUCKET = "edui-presentations";
