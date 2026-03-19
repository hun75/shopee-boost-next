'use client';

import { useState, useEffect, useCallback } from 'react';

const COUNTRIES = ['TW', 'MY', 'VN', 'TH', 'PH', 'SG', 'BR', 'MX'] as const;
const NAMES: Record<string, string> = {
  TW: '🇹🇼 대만', MY: '🇲🇾 말레이시아', VN: '🇻🇳 베트남', TH: '🇹🇭 태국',
  PH: '🇵🇭 필리핀', SG: '🇸🇬 싱가포르', BR: '🇧🇷 브라질', MX: '🇲🇽 멕시코',
};
const C: Record<string, { bg: string; tx: string; glow: string }> = {
  TW: { bg: '#1e3a5f', tx: '#60a5fa', glow: '#3b82f620' },
  MY: { bg: '#3b1f2b', tx: '#f472b6', glow: '#ec489920' },
  VN: { bg: '#3b3520', tx: '#fbbf24', glow: '#f59e0b20' },
  TH: { bg: '#2d2b50', tx: '#818cf8', glow: '#6366f120' },
  PH: { bg: '#3b2a1a', tx: '#fb923c', glow: '#f9731620' },
  SG: { bg: '#3b1a1a', tx: '#f87171', glow: '#ef444420' },
  BR: { bg: '#1a3b2a', tx: '#4ade80', glow: '#22c55e20' },
  MX: { bg: '#1a3b3b', tx: '#2dd4bf', glow: '#14b8a620' },
};
const MAX_SLOTS = 5;

function toKST(s: string | null): string {
  if (!s) return '-';
  try {
    const d = new Date(s);
    d.setHours(d.getHours() + 9);
    return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch { return s.slice(0,16); }
}

interface Product { item_id: string; item_name: string; weight: number; price: number; stock: number; has_model: boolean; }
interface BoostedItem { item_id: string; item_name: string; status: string; }
interface CountryData { products: Product[]; boostedItems: BoostedItem[]; counts: { Active: number; Waiting: number }; isActive: boolean; lastBoost: string | null; }
interface LogEntry { action: string; item_id: string; result: string; message: string; created_at: string; }

export default function Dashboard() {
  const [sel, setSel] = useState('TW');
  const [data, setData] = useState<CountryData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [auth, setAuth] = useState({ authenticated: false });
  const [showLogs, setShowLogs] = useState(false);

  const load = useCallback(async (c: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/shopee/items?country=${c}`);
      const j = await r.json();
      if (!j.error) setData(j);
    } catch {} finally { setLoading(false); }
  }, []);

  const loadLogs = useCallback(async (c: string) => {
    const r = await fetch(`/api/shopee/logs?country=${c}`);
    setLogs(await r.json() || []);
  }, []);

  useEffect(() => { fetch('/api/shopee/auth', { method: 'POST' }).then(r => r.json()).then(setAuth).catch(() => {}); }, []);
  useEffect(() => { load(sel); }, [sel, load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await fetch(`/api/shopee/items?country=${sel}`, { method: 'POST' });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      await load(sel);
    } catch (e: any) { alert(`❌ ${e.message}`); } finally { setSyncing(false); }
  };

  const act = async (action: string, extra: any = {}) => {
    const r = await fetch('/api/shopee/boost', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, country: sel, ...extra }),
    });
    const j = await r.json();
    if (j.error) { alert(`❌ ${j.error}`); return; }
    await load(sel);
  };

  const doAuth = async () => {
    const r = await fetch('/api/shopee/auth');
    const j = await r.json();
    if (j.authUrl) window.location.href = j.authUrl;
  };

  const boostedIds = new Set(data?.boostedItems?.map(i => i.item_id) || []);
  const totalReg = (data?.counts?.Active || 0) + (data?.counts?.Waiting || 0);
  const remaining = MAX_SLOTS - totalReg;
  const synced = data?.products?.length || 0;

  let filtered = data?.products || [];
  if (search) { const q = search.toLowerCase(); filtered = filtered.filter(p => p.item_name.toLowerCase().includes(q) || p.item_id.includes(q)); }
  if (sort === 'price') filtered = [...filtered].sort((a, b) => (b.price || 0) - (a.price || 0));
  else if (sort === 'stock') filtered = [...filtered].sort((a, b) => (b.stock || 0) - (a.stock || 0));
  else filtered = [...filtered].sort((a, b) => a.item_name.localeCompare(b.item_name));

  const cc = C[sel];

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a' }}>
      {/* 헤더 */}
      <header style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>🤖</span>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>쇼피 에이전트</h1>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>크로스보더 Shopee 관리 솔루션 v6.0</p>
          </div>
        </div>
        {auth.authenticated ? (
          <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>✅ 인증됨</span>
        ) : (
          <button onClick={doAuth} style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #f97316, #ef4444)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            🔐 인증하기
          </button>
        )}
      </header>

      {/* 국가 탭 */}
      <div style={{ background: '#1e293b', padding: '12px 24px 0', borderBottom: '1px solid #334155', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {COUNTRIES.map(c => (
          <button key={c} onClick={() => setSel(c)}
            style={{
              padding: '10px 16px', borderRadius: '8px 8px 0 0', fontSize: 13, fontWeight: sel === c ? 700 : 500, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
              background: sel === c ? C[c].bg : 'transparent',
              color: sel === c ? C[c].tx : '#64748b',
              borderBottom: sel === c ? `3px solid ${C[c].tx}` : '3px solid transparent',
              boxShadow: sel === c ? `0 0 12px ${C[c].glow}` : 'none',
            }}
          >{NAMES[c]}</button>
        ))}
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 24px' }}>
        {loading && !data ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#64748b' }}>로딩 중...</div>
        ) : (
          <>
            {/* 요약 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { val: synced, label: '📦 동기화', grad: 'linear-gradient(135deg, #1e3a5f, #1e293b)', border: '#3b82f6' },
                { val: data?.counts?.Active || 0, label: '🟢 부스트 중', grad: 'linear-gradient(135deg, #1a3b2a, #1e293b)', border: '#22c55e' },
                { val: data?.counts?.Waiting || 0, label: '🟡 대기 중', grad: 'linear-gradient(135deg, #3b3520, #1e293b)', border: '#f59e0b' },
                { val: `${totalReg}/${MAX_SLOTS}`, label: '📋 등록', grad: 'linear-gradient(135deg, #2d2b50, #1e293b)', border: '#818cf8' },
                { val: remaining, label: '🆓 남은 슬롯', grad: 'linear-gradient(135deg, #2d1a3b, #1e293b)', border: '#a855f7' },
              ].map((card, i) => (
                <div key={i} style={{ background: card.grad, borderRadius: 12, padding: 16, textAlign: 'center', borderLeft: `3px solid ${card.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9' }}>{card.val}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{card.label}</div>
                </div>
              ))}
            </div>

            {/* 부스트 컨트롤 */}
            {totalReg > 0 && (
              <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                  {data?.isActive ? (
                    <span>🟢 <b style={{ color: '#22c55e' }}>부스트 활성</b> · {totalReg}개 · 마지막: {toKST(data?.lastBoost)}</span>
                  ) : (
                    <span>⏸️ <b style={{ color: '#f59e0b' }}>부스트 비활성</b> · {totalReg}개</span>
                  )}
                </div>
                {!data?.isActive ? (
                  <button onClick={() => act('start', { itemIds: data?.boostedItems?.map(i => i.item_id) })}
                    style={{ padding: '8px 20px', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(34,197,94,0.3)' }}>
                    🚀 부스트 시작
                  </button>
                ) : (
                  <button onClick={() => act('stop')}
                    style={{ padding: '8px 20px', background: '#475569', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    ⏹ 부스트 정지
                  </button>
                )}
              </div>
            )}

            {/* 필터 */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <input type="text" placeholder="상품명, 상품ID 검색..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, padding: '10px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13, outline: 'none' }} />
              <select value={sort} onChange={e => setSort(e.target.value)}
                style={{ padding: '10px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 13 }}>
                <option value="name">이름순</option>
                <option value="price">가격순</option>
                <option value="stock">재고순</option>
              </select>
              <button onClick={sync} disabled={syncing}
                style={{ padding: '10px 20px', background: syncing ? '#475569' : 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: syncing ? 'not-allowed' : 'pointer', boxShadow: '0 2px 8px rgba(59,130,246,0.3)' }}>
                {syncing ? '⏳ 동기화 중...' : '🔄 상품 동기화'}
              </button>
            </div>

            {/* 상품 리스트 */}
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>📭 상품이 없습니다<br/><small>🔄 상품 동기화를 클릭하세요</small></div>
            ) : (
              <>
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px' }}>전체 {synced}개 중 {filtered.length}개 표시</p>
                <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', overflow: 'hidden' }}>
                  {filtered.map((p, idx) => {
                    const isBoosted = boostedIds.has(p.item_id);
                    const w = p.weight >= 1 ? `${Number(p.weight).toFixed(2)}kg` : (Number(p.weight) > 0 ? `${Math.round(Number(p.weight) * 1000)}g` : '-');
                    const pr = p.price > 0 ? Number(p.price).toLocaleString() : '-';
                    const st = p.stock > 0 ? String(p.stock) : (p.has_model ? '옵션별' : '0');

                    return (
                      <div key={p.item_id} style={{
                        display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'default', transition: 'background 0.15s',
                        borderBottom: idx < filtered.length - 1 ? '1px solid #334155' : 'none',
                        background: isBoosted ? '#1a2e1a' : 'transparent',
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = isBoosted ? '#1f3a1f' : '#334155')}
                        onMouseLeave={e => (e.currentTarget.style.background = isBoosted ? '#1a2e1a' : 'transparent')}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isBoosted && <span style={{ marginRight: 4, filter: 'drop-shadow(0 0 4px #22c55e)' }}>🟢</span>}
                            {p.item_name}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            ID: {p.item_id}
                            <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: cc.bg, color: cc.tx }}>{sel}</span>
                            {p.has_model && <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: '#3b2a1a', color: '#fb923c' }}>옵션있음</span>}
                          </div>
                        </div>
                        {[
                          { label: '무게', val: w },
                          { label: '재고', val: st },
                          { label: '가격', val: pr },
                        ].map((col, ci) => (
                          <div key={ci} style={{ width: 64, textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#64748b' }}>{col.label}</div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>{col.val}</div>
                          </div>
                        ))}
                        <div style={{ width: 90, marginLeft: 12 }}>
                          {isBoosted ? (
                            <button onClick={() => act('unregister', { itemId: p.item_id, itemName: p.item_name })}
                              style={{ width: '100%', padding: '6px 0', background: '#475569', color: '#94a3b8', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>해제</button>
                          ) : remaining > 0 ? (
                            <button onClick={() => act('register', { itemId: p.item_id, itemName: p.item_name })}
                              style={{ width: '100%', padding: '6px 0', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 6px rgba(59,130,246,0.3)' }}>⚡ 부스트</button>
                          ) : (
                            <button disabled style={{ width: '100%', padding: '6px 0', background: '#334155', color: '#475569', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'not-allowed' }}>슬롯 없음</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* 로그 */}
            <div style={{ marginTop: 16 }}>
              <button onClick={() => { setShowLogs(!showLogs); if (!showLogs) loadLogs(sel); }}
                style={{ fontSize: 12, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
                📋 {showLogs ? '로그 닫기' : '최근 로그 보기'}
              </button>
              {showLogs && (
                <div style={{ marginTop: 8, background: '#1e293b', borderRadius: 8, border: '1px solid #334155', padding: 12, fontSize: 11, color: '#94a3b8' }}>
                  {logs.length === 0 ? <span>로그 없음</span> : logs.map((log, i) => (
                    <div key={i} style={{ padding: '2px 0' }}>
                      {log.result === 'success' ? '✅' : '❌'} [{log.action}] {log.item_id?.slice(0, 20)} — {log.message}
                      <span style={{ opacity: 0.4, marginLeft: 4 }}>({toKST(log.created_at)})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
      <footer style={{ textAlign: 'center', fontSize: 11, color: '#334155', padding: 16 }}>쇼피 에이전트 v6.0 (Next.js)</footer>
    </div>
  );
}
