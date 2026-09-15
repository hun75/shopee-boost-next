import { NextRequest, NextResponse } from 'next/server';
import * as shopee from '@/lib/shopee';
import * as db from '@/lib/db';

// ═══════════════════════════════════════════════════════════════
// 쇼피 자동 부스트 — 초고속 병렬 폴링 스케줄러 (타임아웃 방지 & 자가 치유)
// ═══════════════════════════════════════════════════════════════
//
// [핵심 개선 사항]
// 1. 8개국 Promise.allSettled 완전 병렬 처리 (전체 실행 2~3초로 단축, 타임아웃 박멸)
// 2. 이미 부스트 중(product.error_busi) 발생 시 last_boost_at 시각 절대 덮어쓰지 않고 보존
// 3. 자가 치유(Self-Healing): 상품 등록이 되어 있으면 is_active가 꺼져 있어도 자동 복구
// 4. 토큰 만료 감지 시 Resend 관리자 이메일 1회 자동 통보
// ═══════════════════════════════════════════════════════════════

const COOLDOWN_SECONDS = shopee.COOLDOWN_HOURS * 3600; // 14,400초 = 4시간
const ADMIN_EMAIL = 'use0509@gmail.com';

/**
 * 쿨타임(4시간 = 14,400초)이 완전히 경과했는지 엄격하게 확인합니다.
 * @returns true면 부스트 가능, false면 아직 쿨타임 중
 */
function isCooldownExpired(lastBoostIso: string): { expired: boolean; elapsedSec: number; remainSec: number } {
  const lastBoostMs = new Date(lastBoostIso).getTime();
  const nowMs = Date.now();
  const elapsedSec = Math.floor((nowMs - lastBoostMs) / 1000);
  const remainSec = COOLDOWN_SECONDS - elapsedSec;

  return {
    expired: elapsedSec >= COOLDOWN_SECONDS,
    elapsedSec,
    remainSec: Math.max(0, remainSec),
  };
}

/**
 * 토큰 만료 시 관리자 이메일 발송 (새로 만료된 최초 1회만 발송하여 이메일 폭탄 방지)
 */
async function sendAuthAlertEmail(countryName: string, reason: string) {
  try {
    if (!process.env.RESEND_API_KEY) return;
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Shopee Agent <onboarding@resend.dev>',
      to: ADMIN_EMAIL,
      subject: `[Shopee Boost] ⚠️ ${countryName} 쇼피 인증 토큰 만료 알림`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; line-height: 1.6; color: #333;">
          <h2 style="color: #d9534f;">⚠️ Shopee 토큰 만료 알림</h2>
          <p><strong>${countryName}</strong> 상점의 쇼피 인증 토큰(Refresh Token)이 만료되었거나 연동이 끊어졌습니다.</p>
          <p style="background: #f8f9fa; padding: 10px; border-radius: 4px;">오류 원인: <code>${reason}</code></p>
          <p>자동 부스트를 다시 활성화하려면 쇼피 부스트 대시보드에 접속하여 <strong>[Shopee 연동]</strong> 버튼을 눌러 로그인을 완료해 주세요.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #888; font-size: 12px;">Shopee Auto Boost Agent System</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Failed to send auth alert email:', err);
  }
}

/**
 * 개별 국가 처리 함수 (독립 병렬 실행)
 */
async function processCountry(country: string, tokens: Record<string, any>, force: boolean): Promise<string> {
  // ── 1. 등록된 아이템 확인 및 자가 치유(Self-Healing) ──
  const items = await db.getItemsByCountry(country);
  if (items.length === 0) {
    const wasActive = await db.getBoostActive(country);
    if (wasActive) {
      await db.setBoostActive(country, false);
      await db.addLog(country, '', '🛑 자동 정지', 'success', '등록 상품 0개라 자동 정지');
    }
    return 'auto-stopped (no items)';
  }

  // 등록 상품이 1개 이상인데 is_active가 꺼져 있다면 자동으로 자가 치유
  const isCurrentlyActive = await db.getBoostActive(country);
  if (!isCurrentlyActive) {
    await db.setBoostActive(country, true);
    await db.addLog(country, '', '🔄 자동 복구', 'success', `${items.length}개 상품 등록 감지 → 부스트 사이클 자동 복구`);
  }

  // ── 2. 쿨타임 엄격 체크 (초 단위) ──
  if (!force) {
    const lastStr = await db.getLastBoostTime(country);
    if (lastStr) {
      const { expired, elapsedSec, remainSec } = isCooldownExpired(lastStr);
      if (!expired) {
        const remainMin = Math.ceil(remainSec / 60);
        const elapsedH = (elapsedSec / 3600).toFixed(2);
        return `waiting (${elapsedH}h elapsed, ${remainMin}min remaining)`;
      }
    }
  }

  // ── 3. shop_id 방어 검증 ──
  const shopId = tokens[country]?.shop_id || shopee.SHOPS[country];
  if (!shopId) {
    await db.addLog(country, '', '❌ 인증 오류', 'fail', 'shop_id가 없습니다. 재인증 필요');
    return 'ERROR: shop_id 없음';
  }

  // ── 4. refresh_token 방어 검증 ──
  const refreshToken = tokens[country]?.refresh_token || tokens._main_account?.refresh_token;
  if (!refreshToken) {
    await db.addLog(country, '', '❌ 인증 오류', 'fail', '인증 토큰이 없습니다. 재인증 필요');
    return 'ERROR: refresh_token 없음';
  }

  // ── 5. 토큰 리프레시 ──
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
    const currentAuth = await db.getAuthRequired(country);
    if (!currentAuth.required) {
      await sendAuthAlertEmail(countryName, refreshErr.message?.slice(0, 100) || '리프레시 토큰 만료');
    }
    await db.setAuthRequired(country, true, `${countryName} 토큰이 만료되었습니다. 다시 샵 연동을 진행해 주세요.`);
    await db.addLog(country, '', '🔑 토큰 만료', 'fail', `토큰 리프레시 실패 — ${refreshErr.message?.slice(0, 50)}`);
    return `REFRESH_FAIL: ${refreshErr.message?.slice(0, 80)}`;
  }

  // ── 6. 부스트 API 실행 ──
  const itemIds = items.map((it: any) => it.item_id);
  const result = await shopee.boostItems(country, accessToken, itemIds);

  const realTimestamp = new Date().toISOString();
  const boostedCount = result.boosted?.length || 0;
  const alreadyBoosted = result.raw_error === 'product.error_busi';

  if (boostedCount > 0) {
    // 신규 부스트 성공 시에만 실제 API 성공 시각으로 last_boost_at 갱신
    await db.updateLastBoostTime(country, realTimestamp);
    for (const iid of result.boosted) {
      await db.updateItemStatus(country, iid, 'Active', realTimestamp);
    }
  } else if (alreadyBoosted) {
    // ⭐ 이미 부스트 중: 기존 last_boost_at을 절대 현재 시각으로 덮어쓰지 않고 보존!
    const existingLast = await db.getLastBoostTime(country);
    if (!existingLast) {
      await db.updateLastBoostTime(country, realTimestamp);
    }
  }

  // 진짜 실패한 상품만 Error 처리 (이미 부스트 중은 제외)
  if (!alreadyBoosted && result.failed?.length > 0) {
    for (const iid of result.failed) {
      await db.updateItemStatus(country, iid, 'Error', realTimestamp);
    }
  }

  // ── 7. 로그 기록 ──
  if (alreadyBoosted) {
    await db.addLog(country, '', '⏳ 쿨타임 대기', 'info',
      `${itemIds.length}개 상품 부스트 활성 중 (4시간 후 자동 갱신)`);
    return `already boosted (${itemIds.length} items active)`;
  } else {
    await db.addLog(country, '',
      boostedCount > 0 ? '🚀 자동 부스트' : '❌ 자동 부스트 실패',
      boostedCount > 0 ? 'success' : 'fail',
      boostedCount > 0
        ? `${boostedCount}개 상품 자동 부스트 성공`
        : `${itemIds.length}개 상품 자동 부스트 실패 — ${result.raw_error || result.message || '원인 불명'}`
    );
    return boostedCount > 0
      ? `boosted ${boostedCount}/${itemIds.length}`
      : `FAILED 0/${itemIds.length}: ${result.raw_error || result.message || 'unknown'}`;
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/cron/reboost — 메인 핸들러 (완전 병렬 처리)
// ═══════════════════════════════════════════════════════════════

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

    // 8개국 전체를 완전 병렬(Promise.allSettled)로 실행
    await Promise.allSettled(
      shopee.COUNTRIES.map(async (country) => {
        try {
          results[country] = await processCountry(country, tokens, force);
        } catch (e: any) {
          results[country] = `error: ${e.message?.slice(0, 60)}`;
          await db.addLog(country, '', '❌ 자동 부스트 오류', 'fail', `시스템 오류: ${e.message?.slice(0, 50)}`);
        }
      })
    );

    return NextResponse.json({ success: true, version: '2026-09-15-v2', results, timestamp: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
