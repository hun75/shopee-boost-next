import { NextRequest, NextResponse } from 'next/server';
import * as shopee from '@/lib/shopee';
import * as db from '@/lib/db';

// Vercel Cron: 4시간마다 자동 리부스트
// vercel.json: { "crons": [{ "path": "/api/cron/reboost", "schedule": "0 */4 * * *" }] }

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
      return NextResponse.json({ error: '토큰 없음', results: {} });
    }

    for (const country of shopee.COUNTRIES) {
      try {
        const isActive = await db.getBoostActive(country);
        if (!isActive) {
          results[country] = 'skipped (inactive)';
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

        const items = await db.getItemsByCountry(country);
        if (items.length === 0) {
          results[country] = 'skipped (no items)';
          continue;
        }

        const itemIds = items.map((it: any) => it.item_id);
        const result = await shopee.boostItems(country, mainToken.access_token, itemIds);
        const now = new Date().toISOString();

        await db.updateLastBoostTime(country, now);
        for (const iid of result.boosted || itemIds) {
          await db.updateItemStatus(country, iid, 'Active', now);
        }

        await db.addLog(country, itemIds.slice(0, 3).join(','), 'auto_boost',
          result.success ? 'success' : 'fail',
          `자동 부스트: ${result.boosted?.length || 0}건 성공`
        );

        results[country] = `boosted ${result.boosted?.length || 0} items`;
      } catch (e: any) {
        results[country] = `error: ${e.message}`;
        await db.addLog(country, '', 'auto_boost', 'fail', `오류: ${e.message?.slice(0, 50)}`);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
