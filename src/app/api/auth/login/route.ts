import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Supabase에서 관리자 비밀번호 조회 (없으면 환경변수 사용)
async function getAdminCredentials(): Promise<{ id: string; password: string }> {
  try {
    const { data } = await supabase.from('auth_tokens').select('token_data').eq('key', 'admin_credentials').single();
    if (data?.token_data?.password) {
      return { id: data.token_data.id || process.env.ADMIN_ID || 'admin', password: data.token_data.password };
    }
  } catch {}
  // Supabase에 없으면 환경변수 사용 (초기 상태)
  return { id: process.env.ADMIN_ID || 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' };
}

// POST /api/auth/login — 관리자 로그인
export async function POST(req: NextRequest) {
  try {
    const { id, password } = await req.json();
    const admin = await getAdminCredentials();

    if (id === admin.id && password === admin.password) {
      const token = Buffer.from(`${admin.id}:${Date.now()}`).toString('base64');
      
      const res = NextResponse.json({ success: true });
      res.cookies.set('admin_session', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7일
      });
      return res;
    }

    return NextResponse.json({ error: '아이디 또는 비밀번호가 틀립니다.' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: '로그인 실패' }, { status: 500 });
  }
}

// GET /api/auth/login — 세션 확인
export async function GET(req: NextRequest) {
  const session = req.cookies.get('admin_session')?.value;
  if (session) {
    try {
      const decoded = Buffer.from(session, 'base64').toString();
      const admin = await getAdminCredentials();
      if (decoded.startsWith(admin.id + ':')) {
        return NextResponse.json({ authenticated: true });
      }
    } catch {}
  }
  return NextResponse.json({ authenticated: false });
}
