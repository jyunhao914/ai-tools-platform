/* Shared static-page renderer: browser admin and offline regeneration use identical output. */
(function(root){
'use strict';
const BASE='https://jyunhao914.github.io/ai-tools-platform';
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const extra=c=>{try{return typeof c.extra==='string'?JSON.parse(c.extra):c.extra||{}}catch(e){return {}}};
const isPublic=c=>!!c.id&&/^[\w-]+$/.test(c.id)&&c.visible!==false&&(!c.permission||c.permission==='public')&&!c.archived&&!c.hidden;
function page(c){
 const url=BASE+'/cards/'+encodeURIComponent(c.id)+'.html';
 if(!isPublic(c))return '<!doctype html><html lang="zh-TW"><meta charset="utf-8"><meta name="robots" content="noindex"><title>內容未公開</title><body><p>此內容未公開。</p><a href="'+BASE+'/">返回首頁</a></body></html>';
 const ex=extra(c), brand='Jyunhao AI工具資源平台', title=c.title+' | '+brand;
 let body=c.content||c.desc||'';
 if(ex.content&&ex.content.length>body.length)body=ex.content;
 // Legacy storage escapes HTML quotes/newlines an extra time.
 body=body.replace(/\\"/g,'"').replace(/\\n/g,'\n');
 if(!/<[a-z][\s\S]*>/i.test(body))body='<p style="white-space:pre-wrap">'+esc(body)+'</p>';
 const desc=(c.desc||c.description||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').slice(0,160);
 let img=String(c.coverImage||ex.coverImage||(c.imageUrls||[])[0]||'assets/yaml-gem-thumb.jpg').split('|')[0];
 const drive=img.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]+)/);
 if(drive&&/google/.test(img))img='https://lh3.googleusercontent.com/d/'+drive[1];
 img=new URL(img,BASE+'/').href;
 const schema={'@context':'https://schema.org','@type':c.type==='article'?'Article':'WebPage',headline:c.title,name:c.title,description:desc,url,mainEntityOfPage:url,image:img};
 if(c.publishDate)schema.datePublished=c.publishDate;
 return `<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${BASE}/"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}"><meta property="og:type" content="${c.type==='article'?'article':'website'}"><meta property="og:site_name" content="${brand}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${esc(img)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(img)}"><link rel="icon" href="${BASE}/favicon.ico"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script><style>body{margin:0;background:#f7f8fa;color:#263044;font:16px/1.8 system-ui,sans-serif}main{max-width:900px;margin:auto;padding:24px;overflow-wrap:anywhere}a{color:#315bbb}img,video,iframe{max-width:100%;height:auto}pre{white-space:pre-wrap}table{display:block;overflow:auto}h1{line-height:1.4;font-size:clamp(25px,5vw,36px)}.cover{width:100%;max-height:420px;object-fit:contain}nav{display:flex;gap:16px;flex-wrap:wrap}article{background:white;padding:24px;border-radius:16px}@media(max-width:480px){main{padding:16px}article{padding:16px}}</style></head><body><main><nav><a href="${BASE}/">${brand}</a><a href="${BASE}/#article=${encodeURIComponent(c.id)}">在平台開啟（閱讀／分享）</a></nav><h1>${esc(c.title)}</h1><img class="cover" src="${esc(img)}" alt="${esc(c.title)}"><article>${body}</article>${c.linkUrl?'<p><a href="'+esc(new URL(c.linkUrl,BASE+'/').href)+'">'+esc(c.meta2||'開啟工具')+'</a></p>':''}<p><a href="${BASE}/">返回所有工具與文章</a></p></main></body></html>`;
}
function homeDirectory(cards){
 return '<section class="brand-directory" aria-labelledby="brand-directory-title"><h2 id="brand-directory-title">關於 Jyunhao AI工具資源平台</h2><p>由 Jyunhao 建立，整理 AI 工具、簡報製作與教學資源，協助教師、學生、行政與影音製作人員尋找實用工具。</p><details><summary>瀏覽公開工具與教學文章</summary><ul>'+cards.filter(isPublic).map(c=>'<li><a href="cards/'+encodeURIComponent(c.id)+'.html">'+esc(c.title)+'</a></li>').join('')+'</ul></details></section>';
}
function updateHome(source,cards){
 const start='<!-- PUBLIC-DIRECTORY:START -->',end='<!-- PUBLIC-DIRECTORY:END -->';
 const a=source.indexOf(start),b=source.indexOf(end);
 if(a<0||b<a)throw new Error('Homepage directory markers missing');
 return source.slice(0,a)+start+'\n'+homeDirectory(cards)+'\n'+source.slice(b);
}
root.CardPages={page,isPublic,homeDirectory,updateHome};
if(typeof module!=='undefined')module.exports=root.CardPages;
})(typeof window!=='undefined'?window:globalThis);
if(typeof require!=='undefined'&&require.main===module){let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(input).map(c=>({id:c.id,html:module.exports.page(c)})))));}
