import { NextRequest, NextResponse } from 'next/server';
import * as shopee from '@/lib/shopee';
import * as db from '@/lib/db';

// Vercel Cron: 4시간마다 자동 리부스트
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3_000;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function boostWithRetry(country: string, accessToken: string, itemIds: string[]): Promise<any> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await shopee.boostItems(country, accessToken, itemIds);
      if (!result.success && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return result;
    } catch (e: any) {
      lastError = e;
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError || new Error('Max retries exceeded');
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, string> = {};
  const force = req.nextUrl.searchParams.get('force') === '1';

  try {
    const tokens = await db.loadTokens();

    for (const country of shopee.COUNTRIES) {
      try {
        // ── 활성 여부 확인 ──
        const isActive = await db.getBoostActive(country);
        if (!isActive) {
          results[country] = 'skipped (inactive)';
          continue;
        }

        // ── 아이템 확인 ──
        const items = await db.getItemsByCountry(country);
        if (items.length === 0) {
          await db.setBoostActive(country, false);
          results[country] = 'auto-stopped (no items)';
          continue;
        }

        // ── 쿨타임 체크 ──
        if (!force) {
          const lastStr = await db.getLastBoostTime(country);
          if (lastStr) {
            const elapsed = (Date.now() - new Date(lastStr).getTime()) / 1000 / 3600;
            if (elapsed < shopee.COOLDOWN_HOURS) {
              results[country] = `skipped (${elapsed.toFixed(1)}h < ${shopee.COOLDOWN_HOURS}h)`;
              continue;
            }
          }
        }

        // ── shop_id 방어 검증 ──
        const shopId = tokens[country]?.shop_id || shopee.SHOPS[country];
        if (!shopId) {
          results[country] = 'ERROR: DB에 해당 국가의 shop_id가 없습니다';
          await db.addLog(country, '', 'auto_boost', 'fail', 'shop_id 없음');
          continue;
        }

        // ── refresh_token 방어 검증 ──
        const refreshToken = tokens[country]?.refresh_token || tokens._main_account?.refresh_token;
        if (!refreshToken) {
          results[country] = 'ERROR: refresh_token 없음. 재인증 필요';
          await db.addLog(country, '', 'auto_boost', 'fail', 'refresh_token 없음');
          continue;
        }

        // ── 토큰 리프레시 (shop_id 기반) ──
        let accessToken: string;
        try {
          const refreshed = await shopee.refreshAccessToken(refreshToken, shopId);
          accessToken = refreshed.access_token;

          // 이 국가의 새 토큰을 DB에 저장
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
          results[country] = `REFRESH_FAIL: ${refreshErr.message?.slice(0, 80)}`;
          await db.addLog(country, '', 'token_refresh', 'fail', `리프레시 실패: ${refreshErr.message?.slice(0, 50)}`);
          // 리프레시 실패 → 해당 국가 재인증 필요 표시
          const countryName = shopee.COUNTRY_NAMES[country] || country;
          await db.setAuthRequired(country, true, `${countryName} 토큰이 만료되었습니다. 다시 샵 연동을 진행해 주세요.`);
          continue;
        }

        // ── 부스트 실행 ──
        const itemIds = items.map((it: any) => it.item_id);
        const result = await boostWithRetry(country, accessToken, itemIds);
        const now = new Date().toISOString();
        const boostedCount = result.boosted?.length || 0;

        // "이미 부스트 중" 에러는 성공으로 간주 (쿨타임 갱신)
        const alreadyBoosted = result.raw_error === 'product.error_busi';

        if (boostedCount > 0 || alreadyBoosted) {
          await db.updateLastBoostTime(country, now);
          if (boostedCount > 0) {
            for (const iid of result.boosted) {
              await db.updateItemStatus(country, iid, 'Active', now);
            }
          }
        }
        // 진짜 실패한 상품만 Error 상태로 변경 (이미 부스트 중은 제외)
        if (!alreadyBoosted && result.failed?.length > 0) {
          for (const iid of result.failed) {
            await db.updateItemStatus(country, iid, 'Error', now);
          }
        }

        if (alreadyBoosted) {
          await db.addLog(country, itemIds.slice(0, 3).join(','), 'auto_boost', 'info',
            `쿨타임 중 — 부스트 슬롯 사용 중 (${itemIds.length}건, 4시간 후 자동 재시도)`);
          results[country] = `already boosted (${itemIds.length} items active)`;
        } else {
          await db.addLog(country, itemIds.slice(0, 3).join(','), 'auto_boost',
            boostedCount > 0 ? 'success' : 'fail',
            `자동 부스트: ${boostedCount}/${itemIds.length}건 | ${result.message || ''}`
          );
          results[country] = boostedCount > 0
            ? `boosted ${boostedCount}/${itemIds.length}`
            : `FAILED 0/${itemIds.length}: ${result.raw_error || result.message || 'unknown'}`;
        }
      } catch (e: any) {
        results[country] = `error: ${e.message?.slice(0, 60)}`;
        await db.addLog(country, '', 'auto_boost', 'fail', `실패: ${e.message?.slice(0, 50)}`);
      }
    }

    return NextResponse.json({ success: true, results, timestamp: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
