#!/usr/bin/env python3
"""
Regenerate /cards/<id>.html OG pages + sitemap.xml from the repo's data.json.
(資料源是 repo；GAS 只剩瀏覽數。--gas 才會改抓 GAS。)
Run manually after adding new articles:
  python3 scripts/regen-cards.py
Then: git add cards/ && git commit -m "chore: regen card OG pages" && git push
"""
import urllib.request, urllib.parse, json, os, html as htmlmod, sys, subprocess, ssl, re

GAS = 'https://script.google.com/macros/s/AKfycbx6qfQFbhAwiqA4AdRisH2HuZDw8iLQEEw-pxraTYCCoMInj0O9cpygBSsB6ii32j21/exec?action=getData'
BASE = 'https://jyunhao914.github.io/ai-tools-platform'
DEFAULT_IMG = BASE + '/assets/yaml-gem-thumb.jpg'

TMPL = '''<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="AI 工具資源平台">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{image}">
<meta property="og:image:width" content="1024">
<meta property="og:image:height" content="572">
<meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{image}">
<script>location.replace("{redirect}")</script>
</head><body></body></html>'''

def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cards_dir = os.path.join(here, 'cards')
    os.makedirs(cards_dir, exist_ok=True)

    # 資料源已改為 repo 的 data.json（GAS 僅剩瀏覽數）。--gas 可強制走舊路徑。
    if '--gas' in sys.argv:
        print('Fetching cards from GAS...')
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(GAS, context=ctx) as r:
                data = json.loads(r.read())
        except Exception:
            raw = subprocess.check_output(['curl', '-sL', GAS])
            data = json.loads(raw)
    else:
        with open(os.path.join(here, 'data.json'), encoding='utf-8') as f:
            data = json.load(f)
        print('Loaded local data.json')
    cards = data.get('cards', [])
    print(f'Got {len(cards)} cards')

    count = 0
    ids_seen = set()
    for c in cards:
        cid = c.get('id', '')
        if not cid:
            continue
        ids_seen.add(cid)
        # 與 admin 的 OG 產生器一致：標題要帶站名後綴，否則兩邊互相覆蓋
        title = htmlmod.escape((c.get('title') or '') + ' | AI 工具資源平台')
        desc = htmlmod.escape(re.sub(r'\s+', ' ', c.get('desc') or c.get('description') or '').strip()[:160])
        raw_img = ''
        try:
            ex = c.get('extra')
            ex = json.loads(ex) if isinstance(ex, str) else (ex or {})
            raw_img = ex.get('coverImage') or ''
        except Exception:
            pass
        raw_img = c.get('coverImage') or raw_img
        if not raw_img:
            imgs = c.get('imageUrls', [])
            raw_img = (imgs[0] if isinstance(imgs, list) and imgs else '') or ''
        raw_img = str(raw_img).split('|')[0]   # 縮圖顯示參數（|contain 等）不能進 og:image
        if raw_img and not raw_img.startswith('http'):
            raw_img = BASE + '/' + raw_img.lstrip('./')
        image = raw_img or DEFAULT_IMG
        redirect = BASE + '/#article=' + cid
        page_url = BASE + '/cards/' + cid + '.html'
        content = TMPL.format(title=title, desc=desc, image=image, url=page_url, redirect=redirect)
        out_path = os.path.join(cards_dir, cid + '.html')
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(content)
        count += 1

    # Remove stale card html files whose id no longer exists
    existing = [f for f in os.listdir(cards_dir) if f.endswith('.html')]
    removed = 0
    for f in existing:
        cid = f[:-5]
        if '_' in cid:
            # image subpages from legacy generation, skip
            continue
        if cid not in ids_seen:
            os.remove(os.path.join(cards_dir, f))
            removed += 1
            print(f'  removed stale: {f}')

    print(f'Generated {count} card HTML files; removed {removed} stale files.')

    # Also write static data.json snapshot so first-time visitors get instant render
    # (index.html fetches ./data.json before GAS to skip the 2-5s GAS cold start)
    # 蓋更新日期章（頁尾顯示用）
    import datetime as _dt
    data.setdefault('settings', {})['site_updated'] = _dt.datetime.now(_dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.') + '%03dZ' % (_dt.datetime.now(_dt.timezone.utc).microsecond // 1000)
    site_path_stamp = os.path.join(here, 'site.json')
    if os.path.exists(site_path_stamp):
        with open(site_path_stamp, encoding='utf-8') as f:
            _site = json.load(f)
        _site.setdefault('settings', {})['site_updated'] = data['settings']['site_updated']
        with open(site_path_stamp, 'w', encoding='utf-8') as f:
            json.dump(_site, f, ensure_ascii=False, indent=2)

    data_json_path = os.path.join(here, 'data.json')
    with open(data_json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    print(f'Wrote data.json snapshot ({os.path.getsize(data_json_path)} bytes).')

    write_sitemap(here, data)

def write_sitemap(here, data):
    """由 data.json / site.json 產生 sitemap：首頁 + 分類 + 每張卡片頁 + 獨立工具頁。"""
    import datetime
    today = datetime.date.today().isoformat()
    urls = [(BASE + '/', '1.0', 'weekly')]

    # 分類（含子分類）— hash 路由
    nav = data.get('nav') or []
    if not nav:
        site_path = os.path.join(here, 'site.json')
        if os.path.exists(site_path):
            with open(site_path, encoding='utf-8') as f:
                nav = json.load(f).get('nav') or []
    for n in nav:
        name = n.get('name') if isinstance(n, dict) else n
        if not name:
            continue
        urls.append((BASE + '/#' + urllib.parse.quote(name), '0.8', 'weekly'))
        for kid in (n.get('children') or []) if isinstance(n, dict) else []:
            urls.append((BASE + '/#' + urllib.parse.quote(name + '/' + kid), '0.7', 'weekly'))

    # 每張可見卡片的分享頁（OG 頁本身會轉址回站內，但能被索引）
    for c in data.get('cards', []):
        cid = c.get('id')
        if not cid or c.get('visible') is False:
            continue
        if (c.get('permission') or 'public') != 'public':
            continue
        urls.append((BASE + '/cards/' + cid + '.html', '0.6', 'monthly'))

    # 子頁面（hubs.json 登錄、未下架者）
    hubs_path = os.path.join(here, 'hubs.json')
    if os.path.exists(hubs_path):
        with open(hubs_path, encoding='utf-8') as f:
            for h in (json.load(f).get('hubs') or []):
                if h.get('archived'):
                    continue
                folder = h.get('folder')
                if folder and os.path.isfile(os.path.join(here, folder, 'index.html')):
                    urls.append((BASE + '/' + folder + '/', '0.8', 'weekly'))

    # 獨立工具頁
    tools_dir = os.path.join(here, 'tools')
    if os.path.isdir(tools_dir):
        for t in sorted(os.listdir(tools_dir)):
            if os.path.isfile(os.path.join(tools_dir, t, 'index.html')):
                urls.append((BASE + '/tools/' + t + '/', '0.6', 'monthly'))

    body = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, prio, freq in urls:
        body.append('  <url>')
        body.append(f'    <loc>{htmlmod.escape(loc)}</loc>')
        body.append(f'    <lastmod>{today}</lastmod>')
        body.append(f'    <changefreq>{freq}</changefreq>')
        body.append(f'    <priority>{prio}</priority>')
        body.append('  </url>')
    body.append('</urlset>')
    path = os.path.join(here, 'sitemap.xml')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(body) + '\n')
    print(f'Wrote sitemap.xml ({len(urls)} urls).')

if __name__ == '__main__':
    main()
