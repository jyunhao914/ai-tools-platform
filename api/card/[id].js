const GAS = 'https://script.google.com/macros/s/AKfycbx6qfQFbhAwiqA4AdRisH2HuZDw8iLQEEw-pxraTYCCoMInj0O9cpygBSsB6ii32j21/exec';
const BASE = 'https://jyunhao914.github.io/ai-tools-platform';
const SITE = 'AI 工具資源平台';
const DEFAULT_OG = BASE + '/assets/og-hero.jpg';

function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export default async function handler(req, res) {
  const id = req.query.id;
  let card = null;

  try {
    const r = await fetch(GAS + '?action=getData');
    const data = await r.json();
    card = (data.cards || []).find(c => c.id === id);
  } catch (_) {}

  const title = card ? card.title : SITE;
  const desc  = card ? String(card.desc || '').substring(0, 150) : '為教師、學生整合最新 AI 科技工具';
  const rawImg = card
    ? (card.coverImage || (Array.isArray(card.imageUrls) ? card.imageUrls[0] : '') || '')
    : '';
  const image = rawImg
    ? (rawImg.startsWith('http') ? rawImg : BASE + '/' + rawImg)
    : DEFAULT_OG;
  const redirect = BASE + '/#article=' + id;

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1024">
<meta property="og:image:height" content="572">
<meta property="og:url" content="${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['host']}${req.url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${image}">
<meta http-equiv="refresh" content="0;url=${redirect}">
<script>location.replace(${JSON.stringify(redirect)})</script>
</head>
<body></body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  res.send(html);
}
