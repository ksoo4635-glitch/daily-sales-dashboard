// 대시보드와 관리 화면이 같이 쓰는 것: 비밀번호 잠금, /api 부르기, 숫자·날짜 글자로 바꾸기.
// 비밀번호는 sessionStorage(탭을 닫으면 사라짐)에만 잠깐 둔다.
const KEY = 'sales-pass';

export const pass = {
  get() { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } },
  set(v) { try { sessionStorage.setItem(KEY, v); } catch { /* 저장이 막혀 있으면 이번 화면에서만 쓴다 */ } memo = v; },
  clear() { try { sessionStorage.removeItem(KEY); } catch {} memo = ''; },
};
let memo = '';

export async function api(path, options = {}) {
  const r = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-admin-password': pass.get() || memo, ...(options.headers || {}) },
  });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    const err = new Error(data.error || '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
    err.status = r.status;
    throw err;
  }
  return data;
}

// 잠금 화면: 비밀번호가 맞으면 onOpen(첫 데이터)을 부른다.
export function lockScreen({ form, input, error, lock, app, check, onOpen }) {
  const tryOpen = async () => {
    try {
      const data = await check();
      lock.hidden = true;
      app.hidden = false;
      onOpen(data);
      return true;
    } catch (e) {
      if (e.status === 401) { pass.clear(); return false; }
      lock.hidden = false; app.hidden = true;
      error.textContent = e.message;
      return false;
    }
  };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    pass.set(input.value);
    const btn = form.querySelector('button');
    btn.disabled = true;
    const ok = await tryOpen();
    btn.disabled = false;
    if (!ok && !error.textContent) {
      error.textContent = '비밀번호가 맞지 않아요.';
      input.value = '';
      input.focus();
    }
  });
  if (pass.get()) tryOpen().then((ok) => { if (!ok) { lock.hidden = false; input.focus(); } });
  else { lock.hidden = false; input.focus(); }
}

const nf = new Intl.NumberFormat('ko-KR');
export const won = (n) => nf.format(Math.round(Number(n) || 0)) + '원';
export const int = (n) => nf.format(Math.round(Number(n) || 0));
// 큰 금액을 "128만 원"처럼 짧게
export function shortWon(n) {
  const v = Math.abs(Math.round(Number(n) || 0));
  if (v >= 1e8) return `${(v / 1e8).toFixed(v >= 1e9 ? 0 : 1).replace(/\.0$/, '')}억 원`;
  if (v >= 1e4) return `${nf.format(Math.round(v / 1e4))}만 원`;
  return `${nf.format(v)}원`;
}

const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const dt = (s) => new Date(s + 'T00:00:00Z');
export const weekday = (s) => WD[dt(s).getUTCDay()];
export const md = (s) => `${dt(s).getUTCMonth() + 1}월 ${dt(s).getUTCDate()}일`;
export const mdw = (s) => `${md(s)} ${weekday(s)}요일`;
export function addDays(s, n) { const t = dt(s); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
// 한국 시간 기준 오늘
export function todayKST() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
export function stamp(iso) {
  const t = new Date(new Date(iso).getTime() + 9 * 3600e3);
  const s = t.toISOString();
  return `${md(s.slice(0, 10))} ${s.slice(11, 16)}`;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
