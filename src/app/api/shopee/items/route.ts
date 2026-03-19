import { NextRequest, NextResponse } from 'next/server';
import * as shopee from '@/lib/shopee';
import * as db from '@/lib/db';

// GET /api/shopee/items?country=TW — 상품 목록 조회 (캐시에서)
// POST /api/shopee/items?country=TW — 상품 동기화 (API 호출 → 캐시 저장)
export async function GET(req: NextRequest) {
  const country = req.nextUrl.searchParams.get('country');
  if (!country) return NextResponse.json({ error: 'country required' }, { status: 400 });

  try {
    const data = await db.getCountryData(country);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const country = req.nextUrl.searchParams.get('country');
  if (!country) return NextResponse.json({ error: 'country required' }, { status: 400 });

  try {
    const tokens = await db.loadTokens();
    const mainToken = tokens._main_account;
    if (!mainToken?.access_token) {
      return NextResponse.json({ error: '인증이 필요합니다. 먼저 로그인해주세요.' }, { status: 401 });
    }

    const items = await shopee.getShopItems(country, mainToken.access_token);
    await db.saveProductsCache(country, items);
    return NextResponse.json({ success: true, count: items.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
