import { NextRequest, NextResponse } from 'next/server';
import * as shopee from '@/lib/shopee';
import * as db from '@/lib/db';

// GET /api/shopee/boost?action=allItems — 전체 부스트 아이템 조회
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');
  if (action === 'allItems') {
    const items = await db.getAllItems();
    return NextResponse.json(items);
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// POST /api/shopee/boost — 부스트 시작/정지/등록/해제
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, country, itemId, itemName, itemIds } = body;

    switch (action) {
      case 'start': {
        // ── Shop-level 토큰 검증 + 리프레시 (국가별 shop_id 기반) ──
        const tokens = await db.loadTokens();
        const shopId = tokens[country]?.shop_id || shopee.SHOPS[country];
        if (!shopId) {
          return NextResponse.json({ error: `${country}: shop_id가 없습니다. 먼저 인증해주세요.` }, { status: 401 });
        }

        const refreshToken = tokens[country]?.refresh_token || tokens._main_account?.refresh_token;
        if (!refreshToken) {
          return NextResponse.json({ error: `${country}: 인증이 필요합니다. 대시보드에서 Shopee 인증을 진행해주세요.` }, { status: 401 });
        }

        // ── 토큰 리프레시 (cron과 동일한 방식) ──
        let accessToken: string;
        try {
          const refreshed = await shopee.refreshAccessToken(refreshToken, shopId);
          accessToken = refreshed.access_token;

          tokens[country] = {
            ...tokens[country],
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            shop_id: shopId,
            updated_at: new Date().toISOString(),
          };
          await db.saveTokens(tokens);
          await db.setAuthRequired(country, false);
        } catch (refreshErr: any) {
          const countryName = shopee.COUNTRY_NAMES[country] || country;
          await db.setAuthRequired(country, true, `${countryName} 토큰이 만료되었습니다. 다시 샵 연동을 진행해 주세요.`);
          return NextResponse.json({
            error: `${country} 토큰 리프레시 실패: ${refreshErr.message?.slice(0, 80)}. 재인증이 필요합니다.`
          }, { status: 401 });
        }

        const ids = itemIds || [];
        if (ids.length === 0) {
          return NextResponse.json({ error: '부스트할 상품이 없습니다' }, { status: 400 });
        }

        const result = await shopee.boostItems(country, accessToken, ids);
        const now = new Date().toISOString();
        const boostedCount = result.boosted?.length || 0;
        const alreadyBoosted = result.raw_error === 'product.error_busi';

        await db.setBoostActive(country, true);
        await db.updateLastBoostTime(country, now);

        if (boostedCount > 0) {
          for (const iid of result.boosted) {
            await db.updateItemStatus(country, iid, 'Active', now);
          }
          await db.addLog(country, ids.slice(0, 3).join(','), 'manual_boost', 'success', `부스트 시작: ${boostedCount}/${ids.length}건 성공`);
        } else if (alreadyBoosted) {
          for (const iid of ids) {
            await db.updateItemStatus(country, iid, 'Active', now);
          }
          await db.addLog(country, ids.slice(0, 3).join(','), 'manual_boost', 'success', `이미 부스트 활성 중 (${ids.length}건)`);
        } else {
          await db.addLog(country, ids.slice(0, 3).join(','), 'manual_boost', 'fail',
            `부스트 실패: ${result.raw_error || result.message || 'unknown'}`);
        }

        return NextResponse.json({ success: true, result });
      }

      case 'stop': {
        // 부스트 정지
        const items = await db.getItemsByCountry(country);
        await db.setBoostActive(country, false);
        for (const it of items) {
          await db.updateItemStatus(country, it.item_id, 'Waiting');
        }
        await db.addLog(country, '', 'stop_boost', 'success', '부스트 정지');
        return NextResponse.json({ success: true });
      }

      case 'register': {
        // 부스트 등록 (대기)
        await db.addItem(country, itemId, itemName, 'Waiting');
        await db.addLog(country, itemId, 'queue', 'success', `등록: ${itemName?.slice(0, 20)}`);
        return NextResponse.json({ success: true });
      }

      case 'unregister': {
        // 부스트 해제
        await db.removeItem(country, itemId);
        await db.addLog(country, itemId, 'unboost', 'success', `해제: ${itemName?.slice(0, 20)}`);
        // 등록 상품이 0개면 부스트 사이클 자동 중지
        const remainingItems = await db.getItemsByCountry(country);
        if (remainingItems.length === 0) {
          await db.setBoostActive(country, false);
          await db.addLog(country, '', 'auto_stop', 'success', '등록 상품 0개 → 자동 정지');
        }
        return NextResponse.json({ success: true });
      }

      case 'replace': {
        // 교체
        const { oldItemId } = body;
        await db.replaceBoostItem(country, oldItemId, itemId, itemName);
        await db.addLog(country, itemId, 'replace', 'success', `교체 완료`);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
