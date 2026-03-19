import { NextRequest, NextResponse } from 'next/server';

// POST /api/auth/login — 관리자 로그인
export async function POST(req: NextRequest) {
  try {
    const { id, password } = await req.json();
    const adminId = process.env.ADMIN_ID || 'admin';
    const adminPw = process.env.ADMIN_PASSWORD || 'admin123';

    if (id === adminId && password === adminPw) {
      // 간단한 세션 토큰 생성
      const token = Buffer.from(`${adminId}:${Date.now()}`).toString('base64');
      
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
      const adminId = process.env.ADMIN_ID || 'admin';
      if (decoded.startsWith(adminId + ':')) {
        return NextResponse.json({ authenticated: true });
      }
    } catch {}
  }
  return NextResponse.json({ authenticated: false });
}
