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

      // 8개국 전체의 재인증 필요 경고(auth_required) 플래그 초기화
      await Promise.all(
        shopee.COUNTRIES.map(c => db.setAuthRequired(c, false))
      );

      // 각 상점별 토큰 개별 발급 시도 (실패해도 기본 토큰 유지)
      for (const country of shopee.COUNTRIES) {
        const countryShopId = shopee.SHOPS[country];
        if (countryShopId && tokenData.refresh_token) {
          try {
            const refreshed = await shopee.refreshAccessToken(tokenData.refresh_token, countryShopId);
            if (refreshed?.access_token) {
              existingTokens[country] = {
                access_token: refreshed.access_token,
                refresh_token: refreshed.refresh_token,
                shop_id: countryShopId,
                updated_at: new Date().toISOString(),
              };
            }
          } catch {
            // 개별 리프레시 실패 시 메인 토큰 복사본 유지
          }
        }
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
        await db.setAuthRequired(country, false);
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
