import { NextRequest, NextResponse } from 'next/server';
import * as shopee from '@/lib/shopee';
import * as db from '@/lib/db';

// GET /api/shopee/auth/callback?code=xxx&shop_id=xxx — OAuth 콜백
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const shopId = parseInt(req.nextUrl.searchParams.get('shop_id') || '0');

  if (!code || !shopId) {
    return NextResponse.redirect(new URL('/?error=invalid_callback', req.url));
  }

  try {
    const tokenData = await shopee.exchangeCodeForToken(code, shopId);

    if (tokenData.error) {
      return NextResponse.redirect(new URL(`/?error=${tokenData.error}`, req.url));
    }

    if (tokenData.access_token) {
      // 메인 계정 토큰 저장
      const existingTokens = await db.loadTokens();
      existingTokens._main_account = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        shop_id: shopId,
        expire_in: tokenData.expire_in,
        updated_at: new Date().toISOString(),
      };

      // 국가 매핑
      const country = shopee.getCountryForShopId(shopId);
      if (country) {
        existingTokens[country] = {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          shop_id: shopId,
        };
      }

      await db.saveTokens(existingTokens);
      return NextResponse.redirect(new URL('/?auth=success', req.url));
    }

    return NextResponse.redirect(new URL('/?error=no_token', req.url));
  } catch (e: any) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(e.message)}`, req.url));
  }
}
