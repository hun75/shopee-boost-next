import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';

// 서버 사이드: Service Role Key(SUPABASE_KEY) 우선 적용하여 RLS 우회
// 클라이언트: NEXT_PUBLIC_SUPABASE_KEY (익명키) 적용 (단, RLS가 활성화되어 있어 접근 거부됨)
const supabaseKey = typeof window === 'undefined' 
  ? (process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY || '')
  : (process.env.NEXT_PUBLIC_SUPABASE_KEY || '');

export const supabase = createClient(supabaseUrl, supabaseKey);
