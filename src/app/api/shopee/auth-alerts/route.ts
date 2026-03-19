import { NextResponse } from 'next/server';
import * as db from '@/lib/db';

// GET /api/shopee/auth-alerts — 재인증 필요한 국가 목록 조회
export async function GET() {
  try {
    const alerts = await db.getAllAuthRequired();
    return NextResponse.json(alerts);
  } catch (e: any) {
    return NextResponse.json({}, { status: 500 });
  }
}
