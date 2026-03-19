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

    if (tokenData.access_token) {
      const existingTokens = await db.loadTokens();
      existingTokens._main_account = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        shop_id: shopId,
        main_account_id: mainAccountId,
        expire_in: tokenData.expire_in,
        updated_at: new Date().toISOString(),
      };

      // 국가 매핑
      if (shopId) {
        const country = shopee.getCountryForShopId(shopId);
        if (country) {
          existingTokens[country] = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            shop_id: shopId,
          };
        }
      }

      // 메인 계정이면 모든 국가에 동일 토큰 저장
      if (mainAccountId) {
        for (const c of shopee.COUNTRIES) {
          existingTokens[c] = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            main_account_id: mainAccountId,
          };
        }
      }

      await db.saveTokens(existingTokens);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'no_token' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
