import { NextRequest, NextResponse } from 'next/server';
import * as shopee from '@/lib/shopee';
import * as db from '@/lib/db';

// GET /api/shopee/auth — 인증 URL 생성
export async function GET(req: NextRequest) {
  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectUrl = `${protocol}://${host}/api/shopee/auth/callback`;
  const authUrl = shopee.generateAuthUrl(redirectUrl);
  return NextResponse.json({ authUrl });
}

// GET /api/shopee/auth/status — 인증 상태 확인
export async function POST() {
  try {
    const tokens = await db.loadTokens();
    const mainToken = tokens._main_account;
    const hasAuth = !!mainToken?.access_token;

    const countryStatus: Record<string, boolean> = {};
    for (const c of shopee.COUNTRIES) {
      countryStatus[c] = !!tokens[c]?.access_token;
    }

    return NextResponse.json({ authenticated: hasAuth, countries: countryStatus });
  } catch {
    return NextResponse.json({ authenticated: false, countries: {} });
  }
}
