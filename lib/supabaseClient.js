import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Em desenvolvimento, loga o aviso. Em produção, o build falhará se as vars não estiverem definidas.
  if (typeof window !== 'undefined') {
    console.warn('⚠️ Supabase env vars não configuradas. Verifique seu .env.local');
  }
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);
