#!/usr/bin/env python3
"""
Regenerate /cards/<id>.html OG pages from GAS backend.
Run manually after adding new articles:
  python3 scripts/regen-cards.py
Then: git add cards/ && git commit -m "chore: regen card OG pages" && git push
"""
import urllib.request, json, os, html as htmlmod, sys, subprocess, ssl

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

    print(f'Fetching cards from GAS...')
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(GAS, context=ctx) as r:
            data = json.loads(r.read())
    except Exception:
        # Fallback to curl (handles cert issues on some systems)
        raw = subprocess.check_output(['curl', '-sL', GAS])
        data = json.loads(raw)
    cards = data.get('cards', [])
    print(f'Got {len(cards)} cards')

    count = 0
    ids_seen = set()
    for c in cards:
        cid = c.get('id', '')
        if not cid:
            continue
        ids_seen.add(cid)
        title = htmlmod.escape(c.get('title') or 'AI 工具資源平台')
        desc = htmlmod.escape((c.get('desc') or '')[:150])
        raw_img = c.get('coverImage') or ''
        if not raw_img:
            imgs = c.get('imageUrls', [])
            raw_img = (imgs[0] if isinstance(imgs, list) and imgs else '') or ''
        if raw_img and not raw_img.startswith('http'):
            raw_img = BASE + '/' + raw_img
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

if __name__ == '__main__':
    main()
