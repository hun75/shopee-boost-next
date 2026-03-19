/**
 * shopee.ts — Shopee Open Platform API v2 유틸리티
 * 서명 생성, 공통 파라미터, API 호출 함수들
 */

import crypto from 'crypto';

// ─── 설정 ───
const PARTNER_ID = 2031482;
const PARTNER_KEY = 'shpk554a515675436c534d4e6572646744754c55595745785a4559574e736976';
const API_HOST = 'https://partner.shopeemobile.com';

// 국가별 shop_id
export const SHOPS: Record<string, number> = {
  TW: 1717775662,
  MY: 1717775649,
  VN: 1717775657,
  TH: 1717775659,
  PH: 1717775655,
  SG: 1705371709,
  BR: 1717775673,
  MX: 1717775689,
};

export const COUNTRIES = ['TW', 'MY', 'VN', 'TH', 'PH', 'SG', 'BR', 'MX'] as const;
export type Country = typeof COUNTRIES[number];

export const COUNTRY_NAMES: Record<string, string> = {
  TW: 'TW 대만', MY: 'MY 말레이시아', VN: 'VN 베트남', TH: 'TH 태국',
  PH: 'PH 필리핀', SG: 'SG 싱가포르', BR: 'BR 브라질', MX: 'MX 멕시코',
};

export const COUNTRY_COLORS: Record<string, { bg: string; text: string }> = {
  TW: { bg: '#D6EAF8', text: '#2471A3' },
  MY: { bg: '#FADADD', text: '#C0392B' },
  VN: { bg: '#FFF9C4', text: '#C59100' },
  TH: { bg: '#D8D8F0', text: '#3949AB' },
  PH: { bg: '#FFE0B2', text: '#E65100' },
  SG: { bg: '#FFCDD2', text: '#C62828' },
  BR: { bg: '#C8E6C9', text: '#2E7D32' },
  MX: { bg: '#B2DFDB', text: '#00695C' },
};

export const MAX_SLOTS = 5;
export const COOLDOWN_HOURS = 4;

// ─── 서명 생성 ───
function generateSign(apiPath: string, timestamp: number, accessToken: string, shopId: number): string {
  const baseString = `${PARTNER_ID}${apiPath}${timestamp}${accessToken}${shopId}`;
  return crypto.createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex');
}

function generateAuthSign(apiPath: string, timestamp: number): string {
  const baseString = `${PARTNER_ID}${apiPath}${timestamp}`;
  return crypto.createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex');
}

// ─── 공통 파라미터 ───
function buildParams(apiPath: string, accessToken: string, shopId: number) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSign(apiPath, timestamp, accessToken, shopId);
  return { partner_id: PARTNER_ID, timestamp, access_token: accessToken, shop_id: shopId, sign };
}

// ─── API 호출 ───

export async function getShopItems(country: string, accessToken: string): Promise<any[]> {
  const shopId = SHOPS[country];
  if (!shopId) throw new Error(`Unknown country: ${country}`);

  // 1단계: item_id 목록 조회
  const listPath = '/api/v2/product/get_item_list';
  const listParams = { ...buildParams(listPath, accessToken, shopId), offset: 0, page_size: 50, item_status: 'NORMAL' };
  const listUrl = `${API_HOST}${listPath}?${new URLSearchParams(Object.entries(listParams).map(([k, v]) => [k, String(v)])).toString()}`;

  const listResp = await fetch(listUrl, { cache: 'no-store' });
  const listData = await listResp.json();

  if (listData.error) throw new Error(`API 오류: ${listData.error} - ${listData.message || ''}`);

  const itemIds: number[] = (listData.response?.item || []).map((i: any) => i.item_id);
  if (itemIds.length === 0) return [];

  // 2단계: 상세 정보 조회 (50개씩)
  const allItems: any[] = [];
  for (let i = 0; i < itemIds.length; i += 50) {
    const batch = itemIds.slice(i, i + 50);
    const infoPath = '/api/v2/product/get_item_base_info';
    const infoParams = { ...buildParams(infoPath, accessToken, shopId), item_id_list: batch.join(',') };
    const infoUrl = `${API_HOST}${infoPath}?${new URLSearchParams(Object.entries(infoParams).map(([k, v]) => [k, String(v)])).toString()}`;

    const infoResp = await fetch(infoUrl, { cache: 'no-store' });
    const infoData = await infoResp.json();

    if (infoData.error) {
      batch.forEach(id => allItems.push({ item_id: String(id), item_name: `Item ${id}`, weight: 0, price: 0, stock: 0, has_model: false }));
      continue;
    }

    for (const item of infoData.response?.item_list || []) {
      let price = 0;
      const priceInfo = item.price_info;
      if (Array.isArray(priceInfo) && priceInfo.length > 0) price = priceInfo[0]?.current_price || 0;
      else if (priceInfo && typeof priceInfo === 'object') price = priceInfo.current_price || 0;

      let stock = 0;
      const stockInfo = item.stock_info_v2?.summary_info;
      if (stockInfo) stock = stockInfo.total_available_stock || 0;

      let imageUrl = '';
      if (item.image?.image_url_list?.length) imageUrl = item.image.image_url_list[0];

      allItems.push({
        item_id: String(item.item_id),
        item_name: item.item_name || `Item ${item.item_id}`,
        weight: item.weight || 0,
        price,
        stock,
        image_url: imageUrl,
        item_status: item.item_status || 'NORMAL',
        has_model: item.has_model || false,
      });
    }
  }

  return allItems;
}

export async function boostItems(country: string, accessToken: string, itemIds: string[]): Promise<any> {
  const shopId = SHOPS[country];
  const apiPath = '/api/v2/product/boost_item';
  const params = buildParams(apiPath, accessToken, shopId);
  const url = `${API_HOST}${apiPath}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_id_list: itemIds.map(Number) }),
    cache: 'no-store',
  });
  const data = await resp.json();

  // ── 배치 성공 (개별 failures만 있을 수 있음) ──
  if (!data.error) {
    const boosted: string[] = [];
    const failed: string[] = [];
    const failures = data.response?.failures || [];
    const failedIds = new Set(failures.map((f: any) => String(f.item_id)));
    for (const id of itemIds) {
      if (failedIds.has(id)) failed.push(id); else boosted.push(id);
    }
    return {
      success: failed.length === 0, boosted, failed,
      message: `${boosted.length}건 성공, ${failed.length}건 실패`,
      failures_detail: failures,
    };
  }

  // ── 배치 실패 → 상품별 개별 부스트로 폴백 (에러 격리) ──
  const boosted: string[] = [];
  const failed: string[] = [];
  const failErrors: string[] = [];

  for (const itemId of itemIds) {
    try {
      const singleParams = buildParams(apiPath, accessToken, shopId);
      const singleUrl = `${API_HOST}${apiPath}?${new URLSearchParams(Object.entries(singleParams).map(([k, v]) => [k, String(v)])).toString()}`;

      const singleResp = await fetch(singleUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id_list: [Number(itemId)] }),
        cache: 'no-store',
      });
      const singleData = await singleResp.json();

      if (singleData.error) {
        failed.push(itemId);
        failErrors.push(`${itemId}: ${singleData.error}`);
      } else {
        const singleFailures = singleData.response?.failures || [];
        if (singleFailures.length > 0) {
          failed.push(itemId);
          failErrors.push(`${itemId}: ${singleFailures[0]?.failed_reason || 'unknown'}`);
        } else {
          boosted.push(itemId);
        }
      }
    } catch (e: any) {
      failed.push(itemId);
      failErrors.push(`${itemId}: ${e.message?.slice(0, 30) || 'error'}`);
    }
  }

  return {
    success: failed.length === 0, boosted, failed,
    message: `개별 부스트: ${boosted.length}건 성공, ${failed.length}건 실패`,
    raw_error: data.error,
    fail_details: failErrors,
  };
}

export function generateAuthUrl(redirectUrl: string): string {
  const path = '/api/v2/shop/auth_partner';
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateAuthSign(path, timestamp);
  return `${API_HOST}${path}?partner_id=${PARTNER_ID}&redirect=${encodeURIComponent(redirectUrl)}&sign=${sign}&timestamp=${timestamp}`;
}

export async function exchangeCodeForToken(code: string, shopId?: number, mainAccountId?: number): Promise<any> {
  const path = '/api/v2/auth/token/get';
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `${PARTNER_ID}${path}${timestamp}`;
  const sign = crypto.createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex');

  const url = `${API_HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}`;
  const body: any = { code, partner_id: PARTNER_ID };
  if (mainAccountId) body.main_account_id = mainAccountId;
  else if (shopId) body.shop_id = shopId;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  return resp.json();
}

/**
 * 토큰 리프레시 — shop_id 기반
 *
 * Shopee API: POST /api/v2/auth/access_token/get
 * Body: { partner_id, refresh_token, shop_id }
 *
 * @returns { access_token, refresh_token, expire_in, ... }
 */
export async function refreshAccessToken(refreshToken: string, shopId: number): Promise<{
  access_token: string;
  refresh_token: string;
  expire_in: number;
}> {
  if (!refreshToken) throw new Error('refresh_token이 없습니다');
  if (!shopId) throw new Error('shop_id가 없습니다');

  const path = '/api/v2/auth/access_token/get';
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `${PARTNER_ID}${path}${timestamp}`;
  const sign = crypto.createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex');

  const url = `${API_HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      partner_id: PARTNER_ID,
      refresh_token: refreshToken,
      shop_id: shopId,
    }),
    cache: 'no-store',
  });

  const data = await resp.json();

  if (data.error) {
    throw new Error(`${data.error} - ${data.message || ''}`);
  }
  if (!data.access_token) {
    throw new Error('응답에 access_token이 없습니다');
  }

  return data;
}

// shop_id → country 매핑
export function getCountryForShopId(shopId: number): string | null {
  for (const [country, sid] of Object.entries(SHOPS)) {
    if (sid === shopId) return country;
  }
  return null;
}
