// 관리 화면: 올린 기록·쇼핑몰 목록·월 목표 보기(GET), 월 목표 저장(PUT).
const { guard, sb, body } = require('./_lib');

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    if (req.method === 'GET') {
      const [uploads, targets] = await Promise.all([
        sb('uploads?select=id,created_at,channel,file_name,row_count,cancelled_count,date_from,date_to&order=created_at.desc&limit=30'),
        sb('settings?select=key,value&key=like.target:*&order=key.desc&limit=24'),
      ]);
      const channels = [...new Set(uploads.map((u) => u.channel))];
      return res.status(200).json({
        uploads,
        channels,
        targets: targets.map((t) => ({ month: t.key.slice(7), amount: t.value?.amount ?? null })),
      });
    }
    if (req.method === 'PUT') {
      const b = body(req);
      const month = String(b.month || '');
      const amount = Math.round(Number(b.amount));
      if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: '어느 달인지 골라 주세요.' });
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return res.status(400).json({ error: '목표 금액을 숫자로 적어 주세요.' });
      await sb('settings?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key: `target:${month}`, value: { amount }, updated_at: new Date().toISOString() }),
      });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: '지원하지 않는 요청이에요.' });
  } catch (e) {
    return res.status(500).json({ error: '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.', detail: e.detail });
  }
};
