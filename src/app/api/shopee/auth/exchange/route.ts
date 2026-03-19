import { NextRequest, NextResponse } from 'next/server';
import * as shopee from '@/lib/shopee';
import * as db from '@/lib/db';

// GET /api/shopee/auth/exchange?code=xxx&shop_id=xxx&main_account_id=xxx
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const shopId = parseInt(req.nextUrl.searchParams.get('shop_id') || '0') || undefined;
  const mainAccountId = parseInt(req.nextUrl.searchParams.get('main_account_id') || '0') || undefined;

  if (!code) {
    return NextResponse.json({ error: 'code 파라미터 없음' }, { status: 400 });
  }

  try {
    const tokenData = await shopee.exchangeCodeForToken(code, shopId, mainAccountId);

    if (tokenData.error) {
      return NextResponse.json({ error: tokenData.error, message: tokenData.message });
    }

    if (!tokenData.access_token) {
      return NextResponse.json({ error: 'no_token' });
    }

    const existingTokens = await db.loadTokens();

    // 메인 계정 인증 시: 모든 국가에 동일 토큰 + 각 국가의 실제 shop_id 저장
    if (mainAccountId) {
      existingTokens._main_account = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expire_in: tokenData.expire_in,
        updated_at: new Date().toISOString(),
      };

      for (const country of shopee.COUNTRIES) {
        const countryShopId = shopee.SHOPS[country];
        existingTokens[country] = {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          shop_id: countryShopId,
        };
      }
    }
    // 개별 shop 인증 시: 해당 국가만 저장
    else if (shopId) {
      const country = shopee.getCountryForShopId(shopId);
      if (country) {
        existingTokens[country] = {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          shop_id: shopId,
        };
      }
      existingTokens._main_account = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expire_in: tokenData.expire_in,
        updated_at: new Date().toISOString(),
      };
    }

    await db.saveTokens(existingTokens);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
