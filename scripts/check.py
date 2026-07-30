#!/usr/bin/env python3
"""發佈前健檢：語法、資料 schema、SEO 檔案一致性。git pre-push 會自動跑。"""
import json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ERRS, WARNS = [], []
KNOWN_TYPES = {'accordion','cards','article','carousel','video','faq','files','buttons','twocol','embed'}

def err(m): ERRS.append(m)
def warn(m): WARNS.append(m)

def check_scripts():
    for path in ['index.html','hub-template.html','hub-admin.html','admin/index.html','gpt-slides/index.html']:
        full = os.path.join(HERE, path)
        if not os.path.exists(full): continue
        src = open(full, encoding='utf-8').read()
        for m in re.finditer(r'<script(\s[^>]*)?>(.*?)</script>', src, re.S):
            attrs, code = m.group(1) or '', m.group(2)
            if 'src=' in attrs or 'ld+json' in attrs or not code.strip(): continue
            with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
                f.write(code); p = f.name
            r = subprocess.run(['node','--check',p], capture_output=True, text=True)
            os.unlink(p)
            if r.returncode != 0:
                err(path+'：JS 語法錯誤 → '+r.stderr.strip().splitlines()[-1][:120])

def check_modules(mods, where):
    if mods is None: return
    if not isinstance(mods, list):
        err(where+'：modules 應為陣列'); return
    for i, m in enumerate(mods):
        w = where+' 第%d個區塊' % (i+1)
        if not isinstance(m, dict): err(w+'：格式錯誤'); continue
        if m.get('type') not in KNOWN_TYPES: err(w+'：未知型別 %r' % m.get('type'))
        for k in ('publishAt','unpublishAt'):
            v = m.get(k)
            if v and not re.match(r'^\d{4}-\d{2}-\d{2}', str(v)): err(w+'：%s 不是有效時間 %r' % (k, v))
        for j, it in enumerate(m.get('items') or []):
            if m.get('type') == 'cards' and isinstance(it, dict) and not it.get('id'):
                err(w+' 第%d張卡片：缺 id' % (j+1))

def check_data():
    # 主站
    for name in ['data.json','site.json','hubs.json']:
        full = os.path.join(HERE, name)
        try: json.load(open(full, encoding='utf-8'))
        except Exception as e: err(name+'：JSON 解析失敗 '+str(e)[:80])
    site = json.load(open(os.path.join(HERE,'site.json'), encoding='utf-8'))
    check_modules(site.get('modules'), 'site.json')
    data = json.load(open(os.path.join(HERE,'data.json'), encoding='utf-8'))
    ids = set()
    for c in data.get('cards', []):
        cid = c.get('id')
        if not cid: err('data.json：有卡片缺 id（%s）' % (c.get('title') or '?'))
        elif cid in ids: err('data.json：卡片 id 重複 %s' % cid)
        ids.add(cid)
    size = os.path.getsize(os.path.join(HERE,'data.json'))
    if size > 200*1024: warn('data.json 已達 %dKB，留意是否有內嵌大內容' % (size//1024))
    # 子頁面
    hubs = json.load(open(os.path.join(HERE,'hubs.json'), encoding='utf-8')).get('hubs', [])
    sitemap = open(os.path.join(HERE,'sitemap.xml'), encoding='utf-8').read() if os.path.exists(os.path.join(HERE,'sitemap.xml')) else ''
    for h in hubs:
        folder = h.get('folder','')
        dj = os.path.join(HERE, folder, 'data.json')
        if h.get('archived'): continue
        if not os.path.exists(dj): err('hub %s：缺 data.json' % folder); continue
        try:
            hd = json.load(open(dj, encoding='utf-8'))
            check_modules(hd.get('modules'), folder)
        except Exception as e:
            err('hub %s：data.json 解析失敗 %s' % (folder, str(e)[:80]))
        if not os.path.exists(os.path.join(HERE, folder, 'index.html')):
            err('hub %s：缺 index.html（未下架卻無頁面）' % folder)
        if sitemap and ('/'+folder+'/') not in sitemap:
            warn('sitemap.xml 未包含子頁面 /%s/' % folder)
    # robots
    rb = os.path.join(HERE,'robots.txt')
    if not os.path.exists(rb) or 'Disallow: /admin/' not in open(rb, encoding='utf-8').read():
        warn('robots.txt 未擋 /admin/')

def main():
    check_scripts()
    check_data()
    for w in WARNS: print('⚠︎ '+w)
    if ERRS:
        for e in ERRS: print('✕ '+e)
        print('\n健檢失敗（%d 個錯誤）。修正後再推送；緊急時 git push --no-verify 可略過。' % len(ERRS))
        sys.exit(1)
    print('✓ 健檢通過（%d 警告）' % len(WARNS))

if __name__ == '__main__':
    main()
