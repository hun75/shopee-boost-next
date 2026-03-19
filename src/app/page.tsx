'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── 상수 ───
const COUNTRIES = ['TW', 'MY', 'VN', 'TH', 'PH', 'SG', 'BR', 'MX'] as const;
const COUNTRY_NAMES: Record<string, string> = {
  TW: 'TW 대만', MY: 'MY 말레이시아', VN: 'VN 베트남', TH: 'TH 태국',
  PH: 'PH 필리핀', SG: 'SG 싱가포르', BR: 'BR 브라질', MX: 'MX 멕시코',
};
const COLORS: Record<string, { bg: string; text: string; border: string }> = {
  TW: { bg: '#D6EAF8', text: '#2471A3', border: '#2471A3' },
  MY: { bg: '#FADADD', text: '#C0392B', border: '#C0392B' },
  VN: { bg: '#FFF9C4', text: '#C59100', border: '#C59100' },
  TH: { bg: '#D8D8F0', text: '#3949AB', border: '#3949AB' },
  PH: { bg: '#FFE0B2', text: '#E65100', border: '#E65100' },
  SG: { bg: '#FFCDD2', text: '#C62828', border: '#C62828' },
  BR: { bg: '#C8E6C9', text: '#2E7D32', border: '#2E7D32' },
  MX: { bg: '#B2DFDB', text: '#00695C', border: '#00695C' },
};
const MAX_SLOTS = 5;

// ─── 시간 변환 ───
function toKST(utcStr: string | null): string {
  if (!utcStr) return '없음';
  try {
    const dt = new Date(utcStr);
    dt.setHours(dt.getHours() + 9);
    return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  } catch { return utcStr.slice(0, 16); }
}

// ─── 타입 ───
interface Product {
  item_id: string; item_name: string; weight: number;
  price: number; stock: number; has_model: boolean;
}
interface BoostedItem { item_id: string; item_name: string; status: string; }
interface CountryData {
  products: Product[]; boostedItems: BoostedItem[];
  counts: { Active: number; Waiting: number };
  isActive: boolean; lastBoost: string | null;
}
interface LogEntry {
  action: string; item_id: string; result: string;
  message: string; created_at: string;
}

export default function Dashboard() {
  const [selected, setSelected] = useState('TW');
  const [data, setData] = useState<CountryData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [authStatus, setAuthStatus] = useState<{ authenticated: boolean }>({ authenticated: false });
  const [showLogs, setShowLogs] = useState(false);

  // 데이터 로드
  const loadData = useCallback(async (country: string) => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/shopee/items?country=${country}`);
      const json = await resp.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // 로그 로드
  const loadLogs = useCallback(async (country: string) => {
    const resp = await fetch(`/api/shopee/logs?country=${country}`);
    const json = await resp.json();
    setLogs(json || []);
  }, []);

  // 인증 상태
  useEffect(() => {
    fetch('/api/shopee/auth', { method: 'POST' })
      .then(r => r.json())
      .then(setAuthStatus)
      .catch(() => {});
  }, []);

  // 탭 전환 시 데이터 로드
  useEffect(() => { loadData(selected); }, [selected, loadData]);

  // 동기화
  const handleSync = async () => {
    setSyncing(true);
    try {
      const resp = await fetch(`/api/shopee/items?country=${selected}`, { method: 'POST' });
      const json = await resp.json();
      if (json.error) throw new Error(json.error);
      await loadData(selected);
    } catch (e: any) {
      alert(`❌ 동기화 실패: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // 부스트 액션
  const boostAction = async (action: string, extra: any = {}) => {
    const resp = await fetch('/api/shopee/boost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, country: selected, ...extra }),
    });
    const json = await resp.json();
    if (json.error) { alert(`❌ ${json.error}`); return; }
    await loadData(selected);
  };

  // 인증
  const handleAuth = async () => {
    const resp = await fetch('/api/shopee/auth');
    const json = await resp.json();
    if (json.authUrl) window.location.href = json.authUrl;
  };

  // ─── 파생 데이터 ───
  const boostedIds = new Set(data?.boostedItems?.map(i => i.item_id) || []);
  const totalReg = (data?.counts?.Active || 0) + (data?.counts?.Waiting || 0);
  const remaining = MAX_SLOTS - totalReg;
  const synced = data?.products?.length || 0;

  // 필터 + 정렬
  let filtered = data?.products || [];
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(p => p.item_name.toLowerCase().includes(q) || p.item_id.includes(q));
  }
  if (sort === 'price') filtered = [...filtered].sort((a, b) => (b.price || 0) - (a.price || 0));
  else if (sort === 'stock') filtered = [...filtered].sort((a, b) => (b.stock || 0) - (a.stock || 0));
  else filtered = [...filtered].sort((a, b) => a.item_name.localeCompare(b.item_name));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🤖</span>
          <div>
            <h1 className="text-xl font-bold text-gray-800">쇼피 에이전트</h1>
            <p className="text-xs text-gray-400">크로스보더 Shopee 관리 솔루션</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {authStatus.authenticated ? (
            <span className="text-sm text-green-600 font-medium">✅ 인증됨</span>
          ) : (
            <button onClick={handleAuth} className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold hover:bg-orange-600 transition">
              🔐 인증하기
            </button>
          )}
        </div>
      </header>

      {/* 국가 탭 */}
      <div className="bg-white px-6 pt-4 border-b flex gap-1 overflow-x-auto">
        {COUNTRIES.map(c => (
          <button
            key={c}
            onClick={() => setSelected(c)}
            className="px-4 py-2.5 rounded-t-lg text-sm font-semibold transition-all whitespace-nowrap"
            style={{
              background: selected === c ? COLORS[c].bg : '#f3f4f6',
              color: selected === c ? COLORS[c].text : '#9ca3af',
              borderBottom: selected === c ? `3px solid ${COLORS[c].border}` : '3px solid transparent',
              fontWeight: selected === c ? 700 : 500,
            }}
          >
            {COUNTRY_NAMES[c]}
          </button>
        ))}
      </div>

      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl mx-auto px-6 py-4">
        {loading && !data ? (
          <div className="text-center py-20 text-gray-400">로딩 중...</div>
        ) : (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-5 gap-3 mb-4">
              {[
                { val: synced, label: '📦 동기화', color: '#607D8B' },
                { val: data?.counts?.Active || 0, label: '🟢 부스트 중', color: '#4CAF50' },
                { val: data?.counts?.Waiting || 0, label: '🟡 대기 중', color: '#FF9800' },
                { val: `${totalReg}/${MAX_SLOTS}`, label: '📋 등록', color: '#2196F3' },
                { val: remaining, label: '🆓 남은 슬롯', color: '#9C27B0' },
              ].map((card, i) => (
                <div key={i} className="bg-white rounded-lg border p-3 text-center" style={{ borderLeft: `3px solid ${card.color}` }}>
                  <div className="text-2xl font-bold text-gray-800">{card.val}</div>
                  <div className="text-xs text-gray-500">{card.label}</div>
                </div>
              ))}
            </div>

            {/* 부스트 컨트롤 */}
            {totalReg > 0 && (
              <div className="bg-white rounded-lg border p-3 mb-4 flex items-center justify-between">
                <div className="text-sm">
                  {data?.isActive ? (
                    <span>🟢 <b>부스트 활성</b> · {totalReg}개 · 마지막: {toKST(data?.lastBoost)}</span>
                  ) : (
                    <span>⏸️ <b>부스트 비활성</b> · {totalReg}개</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {!data?.isActive ? (
                    <button
                      onClick={() => boostAction('start', { itemIds: data?.boostedItems?.map(i => i.item_id) })}
                      className="px-4 py-2 bg-green-500 text-white rounded text-sm font-bold hover:bg-green-600 transition"
                    >🚀 부스트 시작</button>
                  ) : (
                    <button
                      onClick={() => boostAction('stop')}
                      className="px-4 py-2 bg-gray-500 text-white rounded text-sm font-bold hover:bg-gray-600 transition"
                    >⏹ 부스트 정지</button>
                  )}
                </div>
              </div>
            )}

            {/* 필터 + 동기화 */}
            <div className="flex gap-3 mb-4">
              <input
                type="text"
                placeholder="상품명, 상품ID 검색..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <select
                value={sort}
                onChange={e => setSort(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                <option value="name">이름순</option>
                <option value="price">가격순</option>
                <option value="stock">재고순</option>
              </select>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-bold hover:bg-blue-600 transition disabled:opacity-50"
              >
                {syncing ? '⏳ 동기화 중...' : '🔄 상품 동기화'}
              </button>
            </div>

            {/* 상품 리스트 */}
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                📭 상품이 없습니다<br /><small>🔄 상품 동기화를 클릭하세요</small>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400 mb-2">전체 {synced}개 중 {filtered.length}개 표시</p>
                <div className="bg-white rounded-lg border divide-y">
                  {filtered.map((p, idx) => {
                    const isBoosted = boostedIds.has(p.item_id);
                    const w = p.weight >= 1 ? `${p.weight.toFixed(2)}kg` : (p.weight > 0 ? `${Math.round(p.weight * 1000)}g` : '-');
                    const pr = p.price > 0 ? p.price.toLocaleString() : '-';
                    const st = p.stock > 0 ? String(p.stock) : (p.has_model ? '옵션별' : '0');
                    const cc = COLORS[selected];

                    return (
                      <div key={p.item_id} className={`flex items-center px-4 py-3 hover:bg-gray-50 transition ${isBoosted ? 'bg-yellow-50' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-800 text-sm truncate">
                            {isBoosted && <span className="mr-1">🟢</span>}
                            {p.item_name}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                            ID: {p.item_id}
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: cc.bg, color: cc.text }}>{selected}</span>
                            {p.has_model && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-600">옵션있음</span>}
                          </div>
                        </div>
                        <div className="w-16 text-center">
                          <div className="text-[10px] text-gray-400">무게</div>
                          <div className="text-sm font-medium text-gray-600">{w}</div>
                        </div>
                        <div className="w-16 text-center">
                          <div className="text-[10px] text-gray-400">재고</div>
                          <div className="text-sm font-medium text-gray-600">{st}</div>
                        </div>
                        <div className="w-16 text-center">
                          <div className="text-[10px] text-gray-400">가격</div>
                          <div className="text-sm font-medium text-gray-600">{pr}</div>
                        </div>
                        <div className="w-24 ml-3">
                          {isBoosted ? (
                            <button
                              onClick={() => boostAction('unregister', { itemId: p.item_id, itemName: p.item_name })}
                              className="w-full py-1.5 bg-gray-200 text-gray-600 rounded text-xs font-bold hover:bg-gray-300 transition"
                            >해제</button>
                          ) : remaining > 0 ? (
                            <button
                              onClick={() => boostAction('register', { itemId: p.item_id, itemName: p.item_name })}
                              className="w-full py-1.5 bg-blue-500 text-white rounded text-xs font-bold hover:bg-blue-600 transition"
                            >⚡ 부스트</button>
                          ) : (
                            <button className="w-full py-1.5 bg-gray-100 text-gray-400 rounded text-xs cursor-not-allowed" disabled>
                              슬롯 없음
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* 로그 */}
            <div className="mt-4">
              <button
                onClick={() => { setShowLogs(!showLogs); if (!showLogs) loadLogs(selected); }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                📋 {showLogs ? '로그 닫기' : '최근 로그 보기'}
              </button>
              {showLogs && (
                <div className="mt-2 bg-white rounded-lg border p-3 text-xs text-gray-500 space-y-1">
                  {logs.length === 0 ? <span>로그 없음</span> : logs.map((log, i) => (
                    <div key={i}>
                      {log.result === 'success' ? '✅' : '❌'} [{log.action}] {log.item_id?.slice(0, 20)} — {log.message}
                      <span className="opacity-40 ml-1">({toKST(log.created_at)})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <footer className="text-center text-xs text-gray-300 py-4">쇼피 에이전트 v6.0 (Next.js)</footer>
    </div>
  );
}
