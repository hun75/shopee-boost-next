import { NextRequest, NextResponse } from 'next/server';
import * as shopee from '@/lib/shopee';
import * as db from '@/lib/db';

// Vercel Cron: 4시간마다 자동 리부스트
// vercel.json: { "crons": [{ "path": "/api/cron/reboost", "schedule": "0 */4 * * *" }] }

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3_000; // 3초 간격 재시도 (Vercel 서버리스 타임아웃 방지)

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

  const results: Record<string, any> = {};
  const debug: Record<string, any> = {};
  const force = req.nextUrl.searchParams.get('force') === '1';

  try {
    const tokens = await db.loadTokens();
    const mainToken = tokens._main_account;

    if (!mainToken?.refresh_token) {
      return NextResponse.json({ error: '리프레시 토큰 없음. 대시보드에서 재인증 필요.', results: {} });
    }

    // ─── 1단계: 메인 계정 토큰 리프레시 (1회) ───
    // main_account_id가 있으면 merchant 전용 엔드포인트 사용
    // 없으면 첫 번째 shop_id로 shop 레벨 리프레시
    let accessToken: string;
    try {
      const refreshOpts = mainToken.main_account_id
        ? { merchantId: mainToken.main_account_id }
        : { shopId: mainToken.shop_id || shopee.SHOPS['TW'] };

      const refreshed = await shopee.refreshAccessToken(mainToken.refresh_token, refreshOpts);
      accessToken = refreshed.access_token;

      debug.refresh_endpoint = mainToken.main_account_id ? 'merchant' : 'shop';
      debug.refresh_status = 'SUCCESS';
      debug.token_preview = accessToken?.slice(0, 15) + '...';

      // 갱신된 토큰 DB 저장
      const updatedTokens = await db.loadTokens();
      updatedTokens._main_account = {
        ...updatedTokens._main_account,
        access_token: accessToken,
        refresh_token: refreshed.refresh_token || mainToken.refresh_token,
        updated_at: new Date().toISOString(),
      };
      // 모든 국가 토큰도 동일하게 갱신
      for (const c of shopee.COUNTRIES) {
        if (updatedTokens[c]) {
          updatedTokens[c].access_token = accessToken;
        }
      }
      await db.saveTokens(updatedTokens);
      await db.addLog('SYSTEM', '', 'token_refresh', 'success', '토큰 리프레시 성공');

    } catch (refreshErr: any) {
      debug.refresh_status = 'ERROR';
      debug.refresh_error = refreshErr.message;
      await db.addLog('SYSTEM', '', 'token_refresh', 'fail', `토큰 리프레시 실패: ${refreshErr.message?.slice(0, 80)}`);
      return NextResponse.json({
        error: `토큰 리프레시 실패: ${refreshErr.message}`,
        debug,
        timestamp: new Date().toISOString(),
      });
    }

    // ─── 2단계: 각 나라별 부스트 (동일 토큰 사용) ───
    for (const country of shopee.COUNTRIES) {
      try {
        const isActive = await db.getBoostActive(country);
        if (!isActive) {
          results[country] = 'skipped (inactive)';
          continue;
        }

        const items = await db.getItemsByCountry(country);
        if (items.length === 0) {
          await db.setBoostActive(country, false);
          results[country] = 'auto-stopped (no items)';
          continue;
        }

        // 쿨타임 체크
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

        // 부스트 실행 (메인 계정 토큰으로 모든 나라 접근)
        const itemIds = items.map((it: any) => it.item_id);
        const result = await boostWithRetry(country, accessToken, itemIds);
        const now = new Date().toISOString();
        const boostedCount = result.boosted?.length || 0;

        if (boostedCount > 0) {
          await db.updateLastBoostTime(country, now);
          for (const iid of result.boosted) {
            await db.updateItemStatus(country, iid, 'Active', now);
          }
        }

        await db.addLog(country, itemIds.slice(0, 3).join(','), 'auto_boost',
          boostedCount > 0 ? 'success' : 'fail',
          `자동 부스트: ${boostedCount}/${itemIds.length}건 성공 | ${result.message || ''}`
        );

        results[country] = boostedCount > 0
          ? `boosted ${boostedCount}/${itemIds.length}`
          : `FAILED 0/${itemIds.length}: ${result.raw_error || result.message || 'unknown'}`;
      } catch (e: any) {
        results[country] = `error: ${e.message?.slice(0, 60)}`;
        await db.addLog(country, '', 'auto_boost', 'fail', `실패: ${e.message?.slice(0, 50)}`);
      }
    }

    return NextResponse.json({ success: true, results, debug, timestamp: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
