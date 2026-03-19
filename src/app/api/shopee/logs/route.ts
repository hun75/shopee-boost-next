import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db';

// GET /api/shopee/logs?country=TW — 로그 조회
export async function GET(req: NextRequest) {
  const country = req.nextUrl.searchParams.get('country');
  if (!country) return NextResponse.json({ error: 'country required' }, { status: 400 });

  const logs = await db.getLogs(country, 15);
  return NextResponse.json(logs);
}
