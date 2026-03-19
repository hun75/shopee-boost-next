import { NextRequest, NextResponse } from 'next/server';

// POST /api/auth/logout — 로그아웃
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set('admin_session', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // 즉시 만료
  });
  return res;
}
