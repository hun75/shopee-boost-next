'use client';

import { useState, useEffect, useCallback } from 'react';

const COUNTRIES = ['TW', 'MY', 'VN', 'TH', 'PH', 'SG', 'BR', 'MX'] as const;
const NAMES: Record<string, string> = {
  TW: '🔴 TW 대만', MY: '🟣 MY 말레이시아', VN: '🟡 VN 베트남', TH: '🔵 TH 태국',
  PH: '🟠 PH 필리핀', SG: '🔴 SG 싱가포르', BR: '🟢 BR 브라질', MX: '🟢 MX 멕시코',
};
const CC: Record<string, { bg: string; tx: string }> = {
  TW: { bg: '#D6EAF8', tx: '#2471A3' }, MY: { bg: '#FADADD', tx: '#C0392B' },
  VN: { bg: '#FFF9C4', tx: '#C59100' }, TH: { bg: '#D8D8F0', tx: '#3949AB' },
  PH: { bg: '#FFE0B2', tx: '#E65100' }, SG: { bg: '#FFCDD2', tx: '#C62828' },
  BR: { bg: '#C8E6C9', tx: '#2E7D32' }, MX: { bg: '#B2DFDB', tx: '#00695C' },
};
const MAX_SLOTS = 5;
const COOLDOWN_HOURS = 4;

function toKST(s: string | null) {
  if (!s) return '없음';
  try {
    const d = new Date(s);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return `${String(kst.getUTCMonth()+1).padStart(2,'0')}/${String(kst.getUTCDate()).padStart(2,'0')} ${String(kst.getUTCHours()).padStart(2,'0')}:${String(kst.getUTCMinutes()).padStart(2,'0')}`;
  } catch { return s.slice(0, 16); }
}

interface Product { item_id: string; item_name: string; weight: number; price: number; stock: number; has_model: boolean; }
interface BoostedItem { item_id: string; item_name: string; status: string; }
interface CountryData { products: Product[]; boostedItems: BoostedItem[]; counts: { Active: number; Waiting: number }; isActive: boolean; lastBoost: string | null; }
interface LogEntry { action: string; item_id: string; result: string; message: string; created_at: string; }

// ═══ 로그인 화면 ═══
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // 비밀번호 변경 상태
  const [resetMode, setResetMode] = useState<'off' | 'send' | 'verify'>('off');
  const [resetCode, setResetCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const submit = async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: pw }),
      });
      const j = await r.json();
      if (j.success) onLogin();
      else setError(j.error || '로그인 실패');
    } catch { setError('서버 오류'); }
    finally { setLoading(false); }
  };

  const sendCode = async () => {
    setResetLoading(true); setResetMsg('');
    try {
      const r = await fetch('/api/auth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_code' }),
      });
      const j = await r.json();
      if (j.success) { setResetMode('verify'); setResetMsg(j.message); }
      else setResetMsg(j.error || '발송 실패');
    } catch { setResetMsg('서버 오류'); }
    finally { setResetLoading(false); }
  };

  const verifyAndChange = async () => {
    setResetLoading(true); setResetMsg('');
    try {
      const r = await fetch('/api/auth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_and_change', code: resetCode, newPassword: newPw }),
      });
      const j = await r.json();
      if (j.success) { setResetMsg('✅ 비밀번호가 변경되었습니다! 새 비밀번호로 로그인하세요.'); setResetMode('off'); setResetCode(''); setNewPw(''); }
      else setResetMsg(j.error || '변경 실패');
    } catch { setResetMsg('서버 오류'); }
    finally { setResetLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 40, width: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <span style={{ fontSize: 48 }}>🤖</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#333', marginTop: 8 }}>쇼피 에이전트</h1>
          <p style={{ fontSize: 13, color: '#999' }}>{resetMode === 'off' ? '관리자 로그인' : '🔑 비밀번호 변경'}</p>
        </div>

        {resetMode === 'off' ? (
          <>
            {error && <div style={{ padding: '8px 12px', background: '#fee', color: '#c00', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{error}</div>}
            {resetMsg && <div style={{ padding: '8px 12px', background: '#e8f5e9', color: '#2e7d32', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{resetMsg}</div>}
            <input type="text" placeholder="아이디" value={id} onChange={e => setId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: 10, outline: 'none', boxSizing: 'border-box' }} />
            <input type="password" placeholder="비밀번호" value={pw} onChange={e => setPw(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: 16, outline: 'none', boxSizing: 'border-box' }} />
            <button onClick={submit} disabled={loading}
              style={{ width: '100%', padding: '12px', background: '#EE4D2D', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? '로그인 중...' : '🔐 로그인'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button onClick={() => { setResetMode('send'); setResetMsg(''); setError(''); }}
                style={{ background: 'none', border: 'none', color: '#999', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                비밀번호를 잊으셨나요?
              </button>
            </div>
          </>
        ) : resetMode === 'send' ? (
          <>
            {resetMsg && <div style={{ padding: '8px 12px', background: '#fff3cd', color: '#856404', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{resetMsg}</div>}
            <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>등록된 이메일로 인증 코드를 발송합니다.</p>
            <button onClick={sendCode} disabled={resetLoading}
              style={{ width: '100%', padding: '12px', background: '#2196F3', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: resetLoading ? 'not-allowed' : 'pointer', opacity: resetLoading ? 0.7 : 1 }}>
              {resetLoading ? '발송 중...' : '📧 인증 코드 발송'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button onClick={() => { setResetMode('off'); setResetMsg(''); }} style={{ background: 'none', border: 'none', color: '#999', fontSize: 12, cursor: 'pointer' }}>← 로그인으로 돌아가기</button>
            </div>
          </>
        ) : (
          <>
            {resetMsg && <div style={{ padding: '8px 12px', background: '#e3f2fd', color: '#1565c0', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{resetMsg}</div>}
            <input type="text" placeholder="인증 코드 6자리" value={resetCode} onChange={e => setResetCode(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, marginBottom: 10, outline: 'none', boxSizing: 'border-box' as const, textAlign: 'center' as const, letterSpacing: 8, fontWeight: 700, fontSize: 20 }} />
            <input type="password" placeholder="새 비밀번호" value={newPw} onChange={e => setNewPw(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: 16, outline: 'none', boxSizing: 'border-box' }} />
            <button onClick={verifyAndChange} disabled={resetLoading || !resetCode || !newPw}
              style={{ width: '100%', padding: '12px', background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: (resetLoading || !resetCode || !newPw) ? 'not-allowed' : 'pointer', opacity: (resetLoading || !resetCode || !newPw) ? 0.7 : 1 }}>
              {resetLoading ? '변경 중...' : '✅ 비밀번호 변경'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button onClick={() => { setResetMode('off'); setResetMsg(''); setResetCode(''); setNewPw(''); }} style={{ background: 'none', border: 'none', color: '#999', fontSize: 12, cursor: 'pointer' }}>← 로그인으로 돌아가기</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══ 팝업 국가 상세 ═══
function PopupCountryDetail({ country, selectedProduct, onAdd, onRemove, items }: {
  country: string;
  selectedProduct: { itemId: string; itemName: string } | null;
  onAdd: (country: string, itemId: string, itemName: string) => void;
  onRemove: (country: string, itemId: string, itemName: string) => void;
  items: any[];
}) {
  const countryItems = items.filter((i: any) => i.country === country);
  const cnt = countryItems.length;
  const isFull = cnt >= MAX_SLOTS;
  const alreadyAdded = selectedProduct ? countryItems.some(i => i.item_id === selectedProduct.itemId) : false;

  return (
    <div style={{ padding: '0 20px 12px' }}>
      <div style={{ background: isFull ? '#FFF3E0' : '#f8f9fa', border: `1px solid ${isFull ? '#FFB74D' : '#eee'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{country} 지역 부스트 설정</div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{cnt}/{MAX_SLOTS}개 설정됨{cnt < MAX_SLOTS ? ` (${MAX_SLOTS - cnt}개 추가 가능)` : ''}</div>
          </div>
          {isFull && <span style={{ background: '#EE4D2D', color: '#fff', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>최대치 도달</span>}
          {!isFull && cnt > 0 && <span style={{ color: '#4CAF50', fontSize: 12, fontWeight: 600 }}>여유 있음</span>}
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>⊕ 설정된 상품 ({cnt}개)</div>
      {cnt === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#999', fontSize: 13 }}>
          📦 이 지역에 설정된 부스트 상품이 없습니다.<br/>
          <small>하단에서 상품을 추가해보세요.</small>
        </div>
      ) : (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
          {countryItems.map((item: any) => (
            <div key={item.item_id} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f5f5f5', gap: 8 }}>
              <button onClick={() => onRemove(country, item.item_id, item.item_name || '')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#EE4D2D', flexShrink: 0 }}>🗑️</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#999' }}>ID: {item.item_id}</div>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.item_name || 'Unknown'}</div>
              </div>
              <span style={{ fontSize: 11, color: item.status === 'Active' ? '#4CAF50' : '#FF9800', fontWeight: 600, flexShrink: 0 }}>{item.status}</span>
            </div>
          ))}
        </div>
      )}

      {selectedProduct && (
        <div style={{ background: '#E3F2FD', border: '1px solid #BBDEFB', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>선택된 상품을 이 지역에 추가하시겠습니까?</div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedProduct.itemName} (ID: {selectedProduct.itemId})
            </div>
          </div>
          {alreadyAdded ? (
            <span style={{ padding: '6px 14px', background: '#e8e8e8', color: '#999', borderRadius: 6, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>이미 추가됨</span>
          ) : isFull ? (
            <span style={{ padding: '6px 14px', background: '#e8e8e8', color: '#999', borderRadius: 6, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>슬롯 없음</span>
          ) : (
            <button onClick={() => onAdd(country, selectedProduct.itemId, selectedProduct.itemName)}
              style={{ padding: '6px 14px', background: '#2196F3', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>+ 추가</button>
          )}
        </div>
      )}
    </div>
  );
}

// ═══ 메인 대시보드 ═══
export default function Dashboard() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [sel, setSel] = useState('TW');
  const [data, setData] = useState<CountryData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [auth, setAuth] = useState<any>({ authenticated: false, countries: {} });
  const [showLogs, setShowLogs] = useState(false);
  const [allItems, setAllItems] = useState<BoostedItem[]>([]);
  const [authAlerts, setAuthAlerts] = useState<Record<string, { required: boolean; message: string | null }>>({});
  // 부스트 설정 관리 팝업
  const [boostManageOpen, setBoostManageOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ itemId: string; itemName: string } | null>(null);
  const [popupCountry, setPopupCountry] = useState(sel);
  const [toast, setToast] = useState<string | null>(null);

  // 세션 확인
  useEffect(() => {
    fetch('/api/auth/login').then(r => r.json()).then(j => setLoggedIn(j.authenticated)).catch(() => setLoggedIn(false));
  }, []);

  // Shopee OAuth 콜백 — URL에 code 파라미터가 있으면 자동 토큰 교환
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    const shopId = params.get('shop_id') || '';
    const mainAccountId = params.get('main_account_id') || '';
    fetch(`/api/shopee/auth/exchange?code=${code}&shop_id=${shopId}&main_account_id=${mainAccountId}`)
      .then(r => r.json())
      .then(j => {
        if (j.success) { window.history.replaceState({}, '', '/'); window.location.reload(); }
        else { alert(`인증 실패: ${j.error || j.message || '알 수 없는 오류'}`); window.history.replaceState({}, '', '/'); }
      })
      .catch(() => { alert('토큰 교환 중 서버 오류'); window.history.replaceState({}, '', '/'); });
  }, []);

  const load = useCallback(async (c: string) => {
    setLoading(true);
    try { const r = await fetch(`/api/shopee/items?country=${c}`); const j = await r.json(); if (!j.error) setData(j); } catch {} finally { setLoading(false); }
  }, []);

  const loadLogs = useCallback(async (c: string) => {
    try { const r = await fetch(`/api/shopee/logs?country=${c}`); setLogs(await r.json() || []); } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    try { const r = await fetch('/api/shopee/boost?action=allItems'); setAllItems(await r.json() || []); } catch {}
  }, []);

  useEffect(() => { if (loggedIn) { fetch('/api/shopee/auth', { method: 'POST' }).then(r => r.json()).then(setAuth).catch(() => {}); loadAll(); fetch('/api/shopee/auth-alerts').then(r => r.json()).then(setAuthAlerts).catch(() => {}); } }, [loggedIn, loadAll]);
  useEffect(() => { if (loggedIn) { load(sel); if (showLogs) loadLogs(sel); } }, [sel, loggedIn, load]);

  const sync = async () => {
    setSyncing(true);
    try { await fetch(`/api/shopee/items?country=${sel}`, { method: 'POST' }); await load(sel); }
    catch (e: any) { alert(`❌ ${e.message}`); } finally { setSyncing(false); }
  };

  const act = async (action: string, country: string, extra: any = {}) => {
    const r = await fetch('/api/shopee/boost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, country, ...extra }) });
    const j = await r.json(); if (j.error) { setToast(`❌ ${j.error}`); return j; }
    await load(sel); await loadAll();
    return j;
  };

  // 팝업에서 추가/삭제 시 자동 부스트
  const addToBoost = async (country: string, itemId: string, itemName: string) => {
    await act('register', country, { itemId, itemName });
    // 자동으로 부스트 활성화 (아이템 있으면 자동 시작)
    const items = await fetch(`/api/shopee/items?country=${country}`).then(r => r.json());
    const boosted = items?.boostedItems || [];
    if (boosted.length > 0) {
      await act('start', country, { itemIds: boosted.map((i: any) => i.item_id) });
    }
    setToast(`✅ ${itemName.slice(0, 25)}... → ${country} 부스트 추가`);
    setTimeout(() => setToast(null), 3000);
    await load(sel); await loadAll();
  };

  const removeFromBoost = async (country: string, itemId: string, itemName: string) => {
    await act('unregister', country, { itemId, itemName });
    setToast(`🗑️ ${itemName.slice(0, 25)}... → ${country} 부스트 해제`);
    setTimeout(() => setToast(null), 3000);
    await load(sel); await loadAll();
  };

  const doAuth = async () => { const r = await fetch('/api/shopee/auth'); const j = await r.json(); if (j.authUrl) window.location.href = j.authUrl; };

  const handleLogout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); setLoggedIn(false); };

  // 로딩 중
  if (loggedIn === null) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}><p style={{ color: '#999' }}>로딩 중...</p></div>;

  // 로그인 안 됨
  if (!loggedIn) return <LoginScreen onLogin={() => setLoggedIn(true)} />;

  // ── 대시보드 ──
  const boostedIds = new Set(data?.boostedItems?.map(i => i.item_id) || []);
  const totalReg = (data?.counts?.Active || 0) + (data?.counts?.Waiting || 0);
  const remaining = MAX_SLOTS - totalReg;
  const synced = data?.products?.length || 0;
  const totalActive = allItems.filter(i => i.status === 'Active').length;
  const totalWaiting = allItems.filter(i => i.status === 'Waiting').length;
  const hasAuth = auth.authenticated || false;
  const countryAuth = auth.countries || {};
  const cc = CC[sel];

  let filtered = data?.products || [];
  if (search) { const q = search.toLowerCase(); filtered = filtered.filter(p => p.item_name.toLowerCase().includes(q) || p.item_id.includes(q)); }
  if (sort === 'price') filtered = [...filtered].sort((a, b) => (b.price || 0) - (a.price || 0));
  else if (sort === 'stock') filtered = [...filtered].sort((a, b) => (b.stock || 0) - (a.stock || 0));
  else filtered = [...filtered].sort((a, b) => a.item_name.localeCompare(b.item_name));

  const alertCountries = Object.entries(authAlerts).filter(([, v]) => v.required);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f8f9fa' }}>
      {/* ===== 재인증 필요 경고 배너 ===== */}
      {alertCountries.length > 0 && (
        <div style={{ background: '#DC3545', color: '#fff', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <strong>⚠️ 토큰 만료 경고</strong>
            {alertCountries.map(([c, v]) => (
              <span key={c} style={{ display: 'inline-block', marginLeft: 12, padding: '2px 8px', background: 'rgba(255,255,255,0.2)', borderRadius: 4, fontSize: 13 }}>
                {v.message || `${c} 재인증 필요`}
              </span>
            ))}
          </div>
          <button onClick={doAuth} style={{ padding: '6px 16px', background: '#fff', color: '#DC3545', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            🔐 재인증하기
          </button>
        </div>
      )}
    <div style={{ display: 'flex', flex: 1 }}>
      {/* 토스트 알림 */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#333', color: '#fff', padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, zIndex: 2000, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', animation: 'fadeIn 0.3s' }}>
          {toast}
        </div>
      )}

      {/* ===== 부스트 설정 관리 팝업 ===== */}
      {boostManageOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setBoostManageOpen(false); setSelectedProduct(null); }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 0, width: 600, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>⚡ 부스트 설정 관리</h3>
                {selectedProduct && <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>선택: {selectedProduct.itemName.slice(0, 60)}</p>}
              </div>
              <button onClick={() => { setBoostManageOpen(false); setSelectedProduct(null); }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            {/* 국가 탭 */}
            <div style={{ padding: '12px 20px' }}>
              <p style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>지역별 부스트 설정</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {COUNTRIES.map(c => {
                  const cCount = allItems.filter((i: any) => i.country === c).length;
                  return (
                    <button key={c} onClick={() => setPopupCountry(c)} style={{
                      padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: popupCountry === c ? `2px solid ${CC[c].tx}` : '1px solid #ddd',
                      background: popupCountry === c ? CC[c].bg : '#f8f9fa',
                      color: popupCountry === c ? CC[c].tx : '#999',
                    }}>
                      {c} {cCount}/{MAX_SLOTS}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 선택된 국가 상세 */}
            <PopupCountryDetail
              country={popupCountry}
              selectedProduct={selectedProduct}
              onAdd={addToBoost}
              onRemove={removeFromBoost}
              items={allItems}
            />

            {/* 닫기 */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #eee', textAlign: 'right' }}>
              <button onClick={() => { setBoostManageOpen(false); setSelectedProduct(null); }} style={{ padding: '8px 20px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>✕ 닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 좌측 사이드바 ===== */}
      <aside style={{ width: 240, background: '#fff', borderRight: '1px solid #eee', padding: 20, flexShrink: 0, overflowY: 'auto' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>🔑 메인 계정 인증</h3>
        <p style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>한번 로그인으로 8개국 전체 인증</p>
        {hasAuth ? (
          <div style={{ padding: '6px 12px', background: '#d4edda', color: '#155724', borderRadius: 6, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>✅ 인증 완료!</div>
        ) : (
          <div style={{ padding: '6px 12px', background: '#fff3cd', color: '#856404', borderRadius: 6, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>❌ 미인증</div>
        )}
        <button onClick={doAuth} style={{ display: 'block', width: '100%', padding: '8px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 12, background: hasAuth ? '#4CAF50' : '#EE4D2D', color: '#fff' }}>
          {hasAuth ? '🔄 재인증' : '🔐 인증하기'}
        </button>
        <p style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>국가별 인증:</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 16 }}>
          {COUNTRIES.map(c => (<div key={c} style={{ textAlign: 'center', padding: '4px', background: '#f8f9fa', borderRadius: 4, fontSize: 11 }}>{!!countryAuth[c] ? '✅' : '❌'} <b>{c}</b></div>))}
        </div>
        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '12px 0' }} />
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>📊 전체 부스트 현황</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, textAlign: 'center', padding: 8, background: '#f8f9fa', borderRadius: 8 }}><div style={{ fontSize: 11, color: '#999' }}>⚡ 설정됨</div><div style={{ fontSize: 22, fontWeight: 800 }}>{allItems.length}개</div></div>
          <div style={{ flex: 1, textAlign: 'center', padding: 8, background: '#f8f9fa', borderRadius: 8 }}><div style={{ fontSize: 11, color: '#999' }}>🟢 활성 중</div><div style={{ fontSize: 22, fontWeight: 800 }}>{totalActive}개</div></div>
        </div>
        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '12px 0' }} />
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>⚙️ 시스템 정보</h3>
        <table style={{ width: '100%', fontSize: 11, color: '#666', borderCollapse: 'collapse' }}>
          <tbody>
            {[['국가', `${COUNTRIES.length}개국`], ['슬롯', `${MAX_SLOTS}개/국가`], ['쿨타임', `${COOLDOWN_HOURS}시간`], ['엔진', 'Next.js + Vercel']].map(([k, v]) => (
              <tr key={k}><td style={{ padding: '3px 0', fontWeight: 600 }}>{k}</td><td style={{ padding: '3px 0', textAlign: 'right' }}>{v}</td></tr>
            ))}
          </tbody>
        </table>
        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '16px 0' }} />
        <button onClick={handleLogout} style={{ width: '100%', padding: '6px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, color: '#999', cursor: 'pointer' }}>🚪 로그아웃</button>
      </aside>

      {/* ===== 메인 ===== */}
      <main style={{ flex: 1, overflow: 'auto', background: '#f8f9fa' }}>
        {/* 헤더 */}
        <div style={{ padding: '20px 32px 0', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 32 }}>🤖</span>
              <div><h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>쇼피 에이전트</h1><p style={{ fontSize: 12, color: '#999', margin: 0 }}>크로스보더 Shopee 관리 솔루션</p></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={sync} disabled={syncing} style={{ padding: '8px 16px', background: '#fff', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: syncing ? 'not-allowed' : 'pointer', color: '#555' }}>
                {syncing ? '⏳ 동기화 중...' : '🔄 상품 동기화'}
              </button>
              <button onClick={() => { setPopupCountry(sel); setSelectedProduct(null); setBoostManageOpen(true); }} style={{ padding: '8px 16px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                ⚡ 부스트 설정
              </button>
            </div>
          </div>

          {/* 국가 탭 — pill 스타일 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 16 }}>
            <span style={{ fontSize: 13, color: '#999', marginRight: 4 }}>🌐 지역 선택:</span>
            {COUNTRIES.map(c => (
              <button key={c} onClick={() => setSel(c)} style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                borderRadius: 20, border: sel === c ? `2px solid ${CC[c].tx}` : '1px solid #e0e0e0',
                background: sel === c ? CC[c].bg : '#fff', color: sel === c ? CC[c].tx : '#888',
              }}>{c}</button>
            ))}
          </div>
        </div>

        {/* 스탯 바 + 부스트 상태 */}
        <div style={{ padding: '16px 32px' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {/* 전체 상품 */}
            <div style={{ flex: 1, background: '#fff', borderRadius: 10, padding: '14px 18px', border: '1px solid #eee' }}>
              <div style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>📦 전체 상품</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>{synced}<span style={{ fontSize: 13, fontWeight: 400, color: '#999' }}>개</span></div>
            </div>
            {/* 부스트 설정 */}
            <div style={{ flex: 1, background: '#fff', borderRadius: 10, padding: '14px 18px', border: '1px solid #eee' }}>
              <div style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>⚡ 부스트 설정</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{totalReg}<span style={{ fontSize: 13, fontWeight: 400, color: '#999' }}>/{MAX_SLOTS}</span></div>
            </div>
            {/* 부스트 활성 상태 */}
            <div style={{ flex: 2, background: data?.isActive ? '#f0fdf4' : '#fff', borderRadius: 10, padding: '14px 18px', border: `1px solid ${data?.isActive ? '#bbf7d0' : '#eee'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#999', fontWeight: 500 }}>{data?.isActive ? '🟢 부스트 활성' : '⏸️ 부스트 비활성'}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: data?.isActive ? '#15803d' : '#999', marginTop: 4 }}>
                    {data?.isActive ? `마지막: ${toKST(data?.lastBoost)}` : '설정된 상품이 없거나 비활성'}
                  </div>
                </div>
                {data?.isActive && <span style={{ background: '#22c55e', width: 8, height: 8, borderRadius: '50%', display: 'inline-block', animation: 'pulse 2s infinite' }} />}
              </div>
            </div>
          </div>

          {/* 검색 + 정렬 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input type="text" placeholder="🔍 상품명, 상품ID 검색..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, padding: '10px 14px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }} />
            <select value={sort} onChange={e => setSort(e.target.value)} style={{ padding: '10px 14px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, background: '#fff', color: '#555' }}>
              <option value="name">이름순</option><option value="price">가격순</option><option value="stock">재고순</option>
            </select>
          </div>
          {loading && !data ? <div style={{ textAlign: 'center', padding: 80, color: '#999' }}>로딩 중...</div> : (
            <>
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>📭 상품이 없습니다<br/><small>🔄 상품 동기화를 클릭하세요</small></div>
              ) : (
                <>
                  <p style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>전체 {synced}개 중 {filtered.length}개 표시</p>
                  {filtered.map((p, idx) => {
                    const isBoosted = boostedIds.has(p.item_id);
                    const w = p.weight >= 1 ? `${Number(p.weight).toFixed(2)}kg` : (Number(p.weight) > 0 ? `${Math.round(Number(p.weight) * 1000)}g` : '-');
                    const pr = p.price > 0 ? Number(p.price).toLocaleString() : '-';
                    const st = p.stock > 0 ? String(p.stock) : (p.has_model ? '옵션별' : '0');
                    return (
                      <div key={p.item_id} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', background: isBoosted ? '#FFF8E1' : '#fff', borderBottom: '1px solid #f0f0f0', transition: 'background 0.15s' }}
                        onMouseEnter={e => { if (!isBoosted) e.currentTarget.style.background = '#fafbfc'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isBoosted ? '#FFF8E1' : '#fff'; }}>
                        <div style={{ flex: 4, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#333', lineHeight: 1.5 }}>{isBoosted && '🟢 '}{p.item_name}</div>
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                            ID: {p.item_id}
                            <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600, marginLeft: 4, background: cc.bg, color: cc.tx }}>{sel}</span>
                            {p.has_model && <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 600, marginLeft: 3, background: '#FFF3E0', color: '#E65100' }}>옵션있음</span>}
                          </div>
                        </div>
                        {[{ l: '🏋️ 무게', v: w }, { l: '📦 재고', v: st }, { l: '💰 가격', v: pr }].map((col, ci) => (
                          <div key={ci} style={{ width: 70, textAlign: 'center' }}><div style={{ fontSize: 10, color: '#999' }}>{col.l}</div><div style={{ fontSize: 13, fontWeight: 500, color: '#555' }}>{col.v}</div></div>
                        ))}
                        <div style={{ width: 90, marginLeft: 8 }}>
                          {isBoosted ? (
                            <button onClick={() => { setPopupCountry(sel); setSelectedProduct(null); setBoostManageOpen(true); }} style={{ width: '100%', padding: '6px', background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#2e7d32', fontWeight: 600 }}>✅ 설정됨</button>
                          ) : (
                            <button onClick={() => { setPopupCountry(sel); setSelectedProduct({ itemId: p.item_id, itemName: p.item_name }); setBoostManageOpen(true); }} style={{ width: '100%', padding: '6px', background: '#2196F3', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>⚡ 부스트</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              <div style={{ marginTop: 16 }}>
                <button onClick={() => { setShowLogs(!showLogs); if (!showLogs) loadLogs(sel); }} style={{ fontSize: 12, color: '#666', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
                  📋 {showLogs ? '로그 닫기' : '최근 로그'}
                </button>
                {showLogs && (
                  <div style={{ marginTop: 8, background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12, fontSize: 12, color: '#666' }}>
                    {logs.length === 0 ? <span>로그 없음</span> : logs.map((log, i) => (
                      <div key={i} style={{ padding: '2px 0' }}>{log.result === 'success' ? '✅' : '❌'} [{log.action}] {log.item_id?.slice(0, 20)} — {log.message} <span style={{ opacity: 0.4 }}>({toKST(log.created_at)})</span></div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
    </div>
  );
}
