// 모든 /api 함수가 같이 쓰는 도구. 키와 비밀번호는 환경변수 이름으로만 읽는다.
const crypto = require('node:crypto');

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

const sbHeaders = (extra = {}) => ({
  apikey: SB_KEY,
  ...(String(SB_KEY).startsWith('eyJ') ? { Authorization: `Bearer ${SB_KEY}` } : {}),
  'Content-Type': 'application/json',
  ...extra,
});

const same = (a, b) => {
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};

// 비밀번호 확인. 통과하면 true, 아니면 응답을 보내고 false.
function guard(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) {
    res.status(500).json({ error: 'Vercel 환경변수에 ADMIN_PASSWORD를 넣고 Redeploy 해 주세요.' });
    return false;
  }
  if (!same(req.headers['x-admin-password'] || '', pass)) {
    res.status(401).json({ error: '비밀번호가 맞지 않아요.' });
    return false;
  }
  if (!SB_URL || !SB_KEY) {
    res.status(500).json({ error: 'Supabase 연결 정보가 없어요. Vercel Storage에서 Supabase를 연결한 뒤 다시 배포해 주세요.' });
    return false;
  }
  return true;
}

async function sb(path, options = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...options, headers: sbHeaders(options.headers) });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    const err = new Error(`Supabase ${r.status}`);
    err.detail = text.slice(0, 300);
    throw err;
  }
  if (r.status === 204) return null;
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

function body(req) {
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b;
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

module.exports = { guard, sb, body, isDate };
