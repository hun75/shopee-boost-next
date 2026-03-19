import { NextRequest, NextResponse } from 'next/server';
import * as shopee from '@/lib/shopee';
import * as db from '@/lib/db';

// Vercel Cron: 4시간마다 자동 리부스트
// vercel.json: { "crons": [{ "path": "/api/cron/reboost", "schedule": "0 */4 * * *" }] }

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 60_000; // 1분 간격 재시도

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function boostWithRetry(country: string, accessToken: string, itemIds: string[]): Promise<any> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await shopee.boostItems(country, accessToken, itemIds);
      if (!result.success && attempt < MAX_RETRIES) {
        await db.addLog(country, '', 'auto_boost', 'retry', `시도 ${attempt}/${MAX_RETRIES} 실패, 재시도...`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return result;
    } catch (e: any) {
      lastError = e;
      if (attempt < MAX_RETRIES) {
        await db.addLog(country, '', 'auto_boost', 'retry', `시도 ${attempt}/${MAX_RETRIES} 오류: ${e.message?.slice(0, 30)}, ${RETRY_DELAY_MS / 1000}초 후 재시도`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  throw lastError || new Error('Max retries exceeded');
}

export async function GET(req: NextRequest) {
  // Vercel cron 인증 (선택)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, string> = {};

  try {
    const tokens = await db.loadTokens();
    const mainToken = tokens._main_account;

    if (!mainToken?.access_token) {
      // 토큰 만료 시 리프레시 시도
      if (mainToken?.refresh_token) {
        try {
          const refreshed = await shopee.refreshAccessToken(
            mainToken.refresh_token,
            mainToken.shop_id,
          );
          if (refreshed?.access_token) {
            const existingTokens = await db.loadTokens();
            existingTokens._main_account = {
              ...existingTokens._main_account,
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token || mainToken.refresh_token,
              updated_at: new Date().toISOString(),
            };
            // 모든 국가 토큰도 갱신
            for (const c of shopee.COUNTRIES) {
              if (existingTokens[c]) {
                existingTokens[c].access_token = refreshed.access_token;
                if (refreshed.refresh_token) existingTokens[c].refresh_token = refreshed.refresh_token;
              }
            }
            await db.saveTokens(existingTokens);
            // 갱신된 토큰으로 계속 진행
          } else {
            return NextResponse.json({ error: '토큰 리프레시 실패', results: {} });
          }
        } catch {
          return NextResponse.json({ error: '토큰 리프레시 오류', results: {} });
        }
      } else {
        return NextResponse.json({ error: '토큰 없음', results: {} });
      }
    }

    // 최신 토큰 다시 로드
    const freshTokens = await db.loadTokens();
    const token = freshTokens._main_account?.access_token;
    if (!token) return NextResponse.json({ error: '토큰 없음', results: {} });

    for (const country of shopee.COUNTRIES) {
      try {
        const isActive = await db.getBoostActive(country);
        if (!isActive) {
          results[country] = 'skipped (inactive)';
          continue;
        }

        const items = await db.getItemsByCountry(country);
        if (items.length === 0) {
          // 아이템 없으면 자동 비활성화
          await db.setBoostActive(country, false);
          results[country] = 'auto-stopped (no items)';
          continue;
        }

        // 쿨타임 체크
        const lastStr = await db.getLastBoostTime(country);
        if (lastStr) {
          const lastDt = new Date(lastStr);
          const elapsed = (Date.now() - lastDt.getTime()) / 1000 / 3600;
          if (elapsed < shopee.COOLDOWN_HOURS) {
            results[country] = `skipped (${elapsed.toFixed(1)}h < ${shopee.COOLDOWN_HOURS}h)`;
            continue;
          }
        }

        const itemIds = items.map((it: any) => it.item_id);
        const result = await boostWithRetry(country, token, itemIds);
        const now = new Date().toISOString();

        await db.updateLastBoostTime(country, now);
        for (const iid of result.boosted || itemIds) {
          await db.updateItemStatus(country, iid, 'Active', now);
        }

        await db.addLog(country, itemIds.slice(0, 3).join(','), 'auto_boost',
          result.success ? 'success' : 'partial',
          `자동 부스트: ${result.boosted?.length || 0}/${itemIds.length}건 성공`
        );

        results[country] = `boosted ${result.boosted?.length || 0}/${itemIds.length}`;
      } catch (e: any) {
        results[country] = `error after ${MAX_RETRIES} retries: ${e.message}`;
        await db.addLog(country, '', 'auto_boost', 'fail', `${MAX_RETRIES}회 재시도 후 실패: ${e.message?.slice(0, 50)}`);
      }
    }

    return NextResponse.json({ success: true, results, timestamp: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
