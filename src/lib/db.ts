/**
 * db.ts — Supabase CRUD for Shopee Boost
 * 테이블: boost_items, boost_logs, boost_settings, auth_tokens, products_cache
 */

import { supabase } from './supabase';

// ─── boost_items ───

export async function getItemsByCountry(country: string) {
  const { data } = await supabase
    .from('boost_items')
    .select('*')
    .eq('country', country)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function addItem(country: string, itemId: string, itemName: string, status = 'Waiting') {
  const { error } = await supabase
    .from('boost_items')
    .insert({ country, item_id: itemId, item_name: itemName, status });
  return !error;
}

export async function removeItem(country: string, itemId: string) {
  await supabase.from('boost_items').delete().eq('country', country).eq('item_id', itemId);
}

export async function updateItemStatus(country: string, itemId: string, status: string, lastBoostAt?: string) {
  const update: any = { status };
  if (lastBoostAt) update.last_boost_at = lastBoostAt;
  await supabase.from('boost_items').update(update).eq('country', country).eq('item_id', itemId);
}

export async function countItemsByStatus(country: string) {
  const { data } = await supabase.from('boost_items').select('status').eq('country', country);
  const counts = { Active: 0, Waiting: 0 };
  (data || []).forEach((r: any) => {
    if (r.status === 'Active') counts.Active++;
    else if (r.status === 'Waiting') counts.Waiting++;
  });
  return counts;
}

export async function getAllItems() {
  const { data } = await supabase.from('boost_items').select('*');
  return data || [];
}

export async function replaceBoostItem(country: string, oldItemId: string, newItemId: string, newItemName: string) {
  await supabase.from('boost_items').delete().eq('country', country).eq('item_id', oldItemId);
  const { error } = await supabase.from('boost_items').insert({ country, item_id: newItemId, item_name: newItemName, status: 'Waiting' });
  return !error;
}

// ─── boost_settings ───

export async function getBoostActive(country: string): Promise<boolean> {
  const { data } = await supabase.from('boost_settings').select('is_active').eq('country', country).single();
  return data?.is_active ?? false;
}

export async function setBoostActive(country: string, active: boolean) {
  await supabase.from('boost_settings').upsert({ country, is_active: active });
}

export async function getLastBoostTime(country: string): Promise<string | null> {
  const { data } = await supabase.from('boost_settings').select('last_boost_at').eq('country', country).single();
  return data?.last_boost_at || null;
}

export async function updateLastBoostTime(country: string, time: string) {
  await supabase.from('boost_settings').upsert({ country, last_boost_at: time });
}

// ─── boost_logs ───

export async function addLog(country: string, itemId: string, action: string, result: string, message: string) {
  await supabase.from('boost_logs').insert({ country, item_id: itemId, action, result, message });
}

export async function getLogs(country: string, limit = 10) {
  const { data } = await supabase
    .from('boost_logs')
    .select('*')
    .eq('country', country)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// ─── auth_tokens ───

export async function saveTokens(tokens: Record<string, any>) {
  await supabase.from('auth_tokens').upsert({ key: 'main', token_data: tokens });
}

export async function loadTokens(): Promise<Record<string, any>> {
  const { data } = await supabase.from('auth_tokens').select('token_data').eq('key', 'main').single();
  return data?.token_data || {};
}

// ─── products_cache ───

export async function saveProductsCache(country: string, products: any[]) {
  await supabase.from('products_cache').upsert({
    country,
    products,
    synced_at: new Date().toISOString(),
  });
}

export async function loadProductsCache(country: string): Promise<any[]> {
  const { data } = await supabase.from('products_cache').select('products').eq('country', country).single();
  let products = data?.products || [];
  // Supabase에서 문자열로 저장된 경우 파싱
  if (typeof products === 'string') {
    try { products = JSON.parse(products); } catch { products = []; }
  }
  return Array.isArray(products) ? products : [];
}

// ─── 국가별 전체 데이터 (한 번에 로드) ───

export async function getCountryData(country: string) {
  const [products, boostedItems, counts, isActive, lastBoost] = await Promise.all([
    loadProductsCache(country),
    getItemsByCountry(country),
    countItemsByStatus(country),
    getBoostActive(country),
    getLastBoostTime(country),
  ]);

  return { products, boostedItems, counts, isActive, lastBoost };
}
