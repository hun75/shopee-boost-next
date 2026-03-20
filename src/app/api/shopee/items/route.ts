import { NextRequest, NextResponse } from 'next/server';
import * as shopee from '@/lib/shopee';
import * as db from '@/lib/db';

// GET /api/shopee/items?country=TW — 상품 목록 조회 (캐시에서)
// POST /api/shopee/items?country=TW — 상품 동기화 (토큰 리프레시 → API 호출 → 캐시 저장)
export async function GET(req: NextRequest) {
  const country = req.nextUrl.searchParams.get('country');
  if (!country) return NextResponse.json({ error: 'country required' }, { status: 400 });

  try {
    const data = await db.getCountryData(country);
    // 안전장치: 등록 상품 0개인데 활성이면 자동 비활성화
    if (data.isActive && data.boostedItems.length === 0) {
      await db.setBoostActive(country, false);
      data.isActive = false;
    }
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

    // ── Shop-level 토큰 검증 (국가별 shop_id + access_token) ──
    const shopId = tokens[country]?.shop_id || shopee.SHOPS[country];
    if (!shopId) {
      return NextResponse.json({ error: `${country}: shop_id가 없습니다. 먼저 인증해주세요.` }, { status: 401 });
    }

    const refreshToken = tokens[country]?.refresh_token || tokens._main_account?.refresh_token;
    if (!refreshToken) {
      return NextResponse.json({ error: `${country}: 인증이 필요합니다. 먼저 Shopee 로그인해주세요.` }, { status: 401 });
    }

    // ── 토큰 리프레시 (shop_id 기반 — cron과 동일한 방식) ──
    let accessToken: string;
    try {
      const refreshed = await shopee.refreshAccessToken(refreshToken, shopId);
      accessToken = refreshed.access_token;

      // 리프레시된 토큰을 DB에 저장
      tokens[country] = {
        ...tokens[country],
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        shop_id: shopId,
        updated_at: new Date().toISOString(),
      };
      await db.saveTokens(tokens);
      // 리프레시 성공 → 재인증 필요 상태 해제
      await db.setAuthRequired(country, false);
    } catch (refreshErr: any) {
      // 리프레시 실패 → 재인증 필요 표시
      const countryName = shopee.COUNTRY_NAMES[country] || country;
      await db.setAuthRequired(country, true, `${countryName} 토큰이 만료되었습니다. 다시 샵 연동을 진행해 주세요.`);
      return NextResponse.json({
        error: `${country} 토큰 리프레시 실패: ${refreshErr.message?.slice(0, 80)}. 재인증이 필요합니다.`
      }, { status: 401 });
    }

    // ── 상품 목록 조회 (리프레시된 Shop-level 토큰 사용) ──
    const items = await shopee.getShopItems(country, accessToken);
    await db.saveProductsCache(country, items);
    return NextResponse.json({ success: true, count: items.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
