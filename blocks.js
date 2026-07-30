/* ═══════════════════════════════════════════════════════════════
   blocks.js — 區塊系統唯一來源
   每種區塊在 TYPES 定義一次（meta＋renderer＋editor＋schema），
   主站、子頁面、兩個後台都引用這份檔案。
   新增區塊型別：只改這個檔案（TYPES 加一項），其他頁面自動跟上。

   render ctx：{ resolveSrc(rel)→url, onCopy(item, btnEl) }
   editor ctx：{ stageImage(file,cb(rel)), stageFile(file,cb(rel)),
                resolveSrc(rel)→url, markDirty(), rerender(), uid() }
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ── 共用工具 ── */
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function ce(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }
  /* 排程顯示：publishAt 前、unpublishAt 後不顯示（留空不限） */
  function schedOk(o) {
    var now = Date.now();
    if (o && o.publishAt && now < new Date(o.publishAt).getTime()) return false;
    if (o && o.unpublishAt && now >= new Date(o.unpublishAt).getTime()) return false;
    return true;
  }
  /* 縮圖顯示設定：縮小(<100%)時裁滿改完整顯示才能露出全圖 */
  function applyDisplay(img, s) {
    if (!img) return;
    var fit = s.fit || 'cover';
    var z = (parseInt(s.zoom, 10) || 100) / 100;
    var effFit = (fit === 'cover' && z < 1) ? 'contain' : fit;
    img.style.objectFit = effFit;
    img.style.objectPosition = s.pos || 'center';
    img.style.transform = z !== 1 ? 'scale(' + z + ')' : '';
    var st = img.parentElement;
    if (st) st.style.background = (effFit === 'contain' && s.bg) ? s.bg : '';
  }
  function toEmbed(u) {
    if (!u) return '';
    var m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
    if (m) return 'https://www.youtube-nocookie.com/embed/' + m[1];
    if (/youtube(-nocookie)?\.com\/embed\//.test(u)) return u;
    return '';
  }
  function normalizeHtml(v) {
    v = (v || '').trim();
    if (!v) return '';
    if (/<\w+[^>]*>/.test(v)) return v;
    return v.split(/\n{2,}/).map(function (p) {
      return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  /* ── 編輯器共用小工具（be-* 樣式在 blocks-admin.css） ── */
  function beField(label, inner) {
    var f = ce('div', 'be-field');
    f.innerHTML = '<label>' + label + '</label>';
    if (typeof inner === 'string') f.innerHTML += inner;
    else if (inner) f.appendChild(inner);
    return f;
  }
  function bindText(inp, obj, key, ctx, after) {
    inp.value = obj[key] || '';
    inp.oninput = function () {
      obj[key] = inp.value;
      ctx.markDirty();
      if (after) after(inp.value);
    };
  }
  function schedFields(body, obj, ctx) {
    var f = ce('div', 'be-field');
    f.innerHTML = '<div class="be-grid2">'
      + '<div><label>排程上架（留空＝立即）</label><input type="datetime-local" data-sc="publishAt"></div>'
      + '<div><label>排程下架（留空＝不下架）</label><input type="datetime-local" data-sc="unpublishAt"></div></div>';
    f.querySelectorAll('[data-sc]').forEach(function (inp) {
      inp.value = (obj[inp.dataset.sc] || '').slice(0, 16);
      inp.oninput = function () {
        if (inp.value) obj[inp.dataset.sc] = inp.value; else delete obj[inp.dataset.sc];
        ctx.markDirty();
      };
    });
    body.appendChild(f);
  }
  /* 視覺化文字編輯器（存檔時 img 換回相對路徑） */
  function htmlToEditor(html, ctx) {
    var d = ce('div', '', html || '');
    d.querySelectorAll('img').forEach(function (im) {
      var src = im.getAttribute('src') || '';
      if (!/^(https?:|data:)/.test(src)) { im.dataset.rel = src; im.src = ctx.resolveSrc(src); }
    });
    return d.innerHTML;
  }
  function editorToHtml(editor) {
    var d = editor.cloneNode(true);
    d.querySelectorAll('img').forEach(function (im) {
      if (im.dataset.rel) { im.setAttribute('src', im.dataset.rel); im.removeAttribute('data-rel'); }
      im.removeAttribute('style');
    });
    return d.innerHTML;
  }
  function htmlField(body, m, label, ctx) {
    var f = ce('div', 'be-field');
    f.innerHTML = '<label>' + label + '</label>'
      + '<div class="be-rtebar">'
      + '<button type="button" class="be-btn" data-c="bold"><b>B</b></button>'
      + '<button type="button" class="be-btn" data-c="italic"><i>I</i></button>'
      + '<button type="button" class="be-btn" data-c="h3">小標</button>'
      + '<button type="button" class="be-btn" data-c="ul">• 清單</button>'
      + '<button type="button" class="be-btn" data-c="link">🔗 連結</button>'
      + '<button type="button" class="be-btn" data-c="img">🖼 插圖</button>'
      + '<button type="button" class="be-btn" data-c="src">&lt;/&gt; 原始碼</button>'
      + '<input type="file" accept="image/*" class="be-hidden"></div>'
      + '<div class="be-rte" contenteditable="true"></div>'
      + '<textarea class="be-hidden be-src"></textarea>';
    var ed = f.querySelector('.be-rte'), ta = f.querySelector('textarea'), fi = f.querySelector('input[type=file]');
    ed.innerHTML = htmlToEditor(m.html, ctx);
    function sync() { m.html = editorToHtml(ed); ctx.markDirty(); }
    ed.addEventListener('input', sync);
    f.querySelectorAll('[data-c]').forEach(function (b) {
      b.onclick = function () {
        var c = b.dataset.c;
        if (c === 'src') {
          if (ta.classList.contains('be-hidden')) {
            ta.value = editorToHtml(ed); ta.classList.remove('be-hidden'); ed.classList.add('be-hidden'); b.textContent = '視覺編輯';
          } else {
            m.html = normalizeHtml(ta.value); ed.innerHTML = htmlToEditor(m.html, ctx);
            ta.classList.add('be-hidden'); ed.classList.remove('be-hidden'); b.innerHTML = '&lt;/&gt; 原始碼'; ctx.markDirty();
          }
          return;
        }
        ed.focus();
        if (c === 'bold') document.execCommand('bold');
        else if (c === 'italic') document.execCommand('italic');
        else if (c === 'h3') document.execCommand('formatBlock', false, '<h3>');
        else if (c === 'ul') document.execCommand('insertUnorderedList');
        else if (c === 'link') { var u = prompt('連結網址：', 'https://'); if (u) document.execCommand('createLink', false, u); }
        else if (c === 'img') { fi.click(); return; }
        sync();
      };
    });
    ta.oninput = function () { m.html = normalizeHtml(ta.value); ctx.markDirty(); };
    fi.addEventListener('change', function () {
      var file = fi.files[0]; if (!file) return;
      ctx.stageImage(file, function (rel, dataUrl) {
        ed.focus();
        document.execCommand('insertHTML', false, '<img src="' + (dataUrl || ctx.resolveSrc(rel)) + '" data-rel="' + rel + '" style="max-width:100%">');
        sync();
      });
      fi.value = '';
    });
    body.appendChild(f);
  }
  /* 泛用列清單編輯器 */
  function listEditor(body, arr, ctx, opts) {
    var box = ce('div', 'be-field');
    var head = ce('div', 'be-listhead');
    head.innerHTML = '<label>' + opts.label + '（' + arr.length + '）</label><button class="be-btn be-btn-pri" type="button">＋ ' + opts.addLabel + '</button>';
    head.querySelector('button').onclick = function () {
      var o = {}; opts.fields.forEach(function (f) { o[f.key] = ''; });
      arr.push(o); ctx.markDirty(); ctx.rerender();
    };
    box.appendChild(head);
    arr.forEach(function (row, i) {
      var r = ce('div', 'be-listrow');
      var col = ce('div', 'be-listcol');
      opts.fields.forEach(function (f) {
        var inp = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
        inp.placeholder = f.label + (f.ph ? ('，' + f.ph) : '');
        inp.value = row[f.key] || '';
        inp.oninput = function () { row[f.key] = inp.value; ctx.markDirty(); };
        col.appendChild(inp);
      });
      r.appendChild(col);
      var ops = ce('div', 'be-listops');
      [['↑', -1], ['↓', 1]].forEach(function (mv) {
        var b = ce('button', 'be-btn', mv[0]); b.type = 'button';
        b.onclick = function () {
          var j = i + mv[1]; if (j < 0 || j >= arr.length) return;
          var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
          ctx.markDirty(); ctx.rerender();
        };
        ops.appendChild(b);
      });
      var del = ce('button', 'be-btn be-btn-danger', '✕'); del.type = 'button';
      del.onclick = function () { arr.splice(i, 1); ctx.markDirty(); ctx.rerender(); };
      ops.appendChild(del);
      r.appendChild(ops);
      box.appendChild(r);
    });
    body.appendChild(box);
  }
  function thumbControls(body, s, ctx, stageSel) {
    /* stageSel: 讓呼叫端同步更新列首縮圖 */
    var wrapEl = ce('div', 'be-thumbflex');
    var stage = ce('div', 'be-stage');
    if (s.thumb) stage.innerHTML = '<img src="' + esc(ctx.resolveSrc(s.thumb)) + '">';
    var side = ce('div');
    side.innerHTML = '<button class="be-btn" type="button">更換縮圖</button><input type="file" accept="image/*" class="be-hidden">'
      + '<p class="be-hint">預覽即前台實際效果</p>';
    var col = ce('div');
    col.appendChild(stage); col.appendChild(side);
    wrapEl.appendChild(col);
    var grid = ce('div', 'be-dispgrid');
    grid.innerHTML =
      '<div class="be-field"><label>顯示方式</label><select data-d="fit"><option value="cover">裁滿（超出裁切）</option><option value="contain">完整顯示（不裁切）</option></select></div>'
      + '<div class="be-field"><label>對齊位置</label><select data-d="pos"><option value="center">置中</option><option value="top">靠上</option><option value="bottom">靠下</option><option value="left">靠左</option><option value="right">靠右</option></select></div>'
      + '<div class="be-field"><label>縮放 <span data-zl>100</span>%</label><input type="range" min="50" max="200" step="5" data-d="zoom"></div>'
      + '<div class="be-field"><label>留白底色</label><div class="be-row">'
      + '<button class="be-btn" data-bg="" type="button">透明</button>'
      + '<button class="be-btn" data-bg="#ffffff" type="button">白色</button>'
      + '<button class="be-btn" data-bg="#000000" type="button">黑色</button></div></div>';
    wrapEl.appendChild(grid);
    body.appendChild(wrapEl);
    var stageImg = function () { return stage.querySelector('img'); };
    var fitSel = grid.querySelector('[data-d=fit]'), posSel = grid.querySelector('[data-d=pos]'),
        zoomInp = grid.querySelector('[data-d=zoom]'), zl = grid.querySelector('[data-zl]');
    fitSel.value = s.fit || 'cover'; posSel.value = s.pos || 'center';
    zoomInp.value = parseInt(s.zoom, 10) || 100; zl.textContent = zoomInp.value;
    function refresh() { applyDisplay(stageImg(), s); if (stageSel) stageSel(s); }
    function markBg() {
      grid.querySelectorAll('[data-bg]').forEach(function (b) {
        b.classList.toggle('on', (s.bg || '') === b.dataset.bg);
      });
    }
    refresh(); markBg();
    fitSel.onchange = function () { s.fit = fitSel.value; ctx.markDirty(); refresh(); };
    posSel.onchange = function () { s.pos = posSel.value; ctx.markDirty(); refresh(); };
    zoomInp.oninput = function () { s.zoom = parseInt(zoomInp.value, 10); zl.textContent = zoomInp.value; ctx.markDirty(); refresh(); };
    grid.querySelectorAll('[data-bg]').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.bg) s.bg = b.dataset.bg; else delete s.bg;
        ctx.markDirty(); refresh(); markBg();
      };
    });
    var fi = side.querySelector('input[type=file]');
    side.querySelector('button').onclick = function () { fi.click(); };
    fi.addEventListener('change', function () {
      var f = fi.files[0]; if (!f) return;
      ctx.stageImage(f, function (rel) { s.thumb = rel; ctx.rerender(); });
    });
  }

  /* ═══ 區塊型別定義 ═══ */
  var TYPES = {
    accordion: {
      ico: '📌', label: '摺疊說明', hint: '可收合的條列說明框',
      init: function (m) { m.items = []; },
      render: function (host, m) {
        var d = document.createElement('details'); d.className = 'blk-acc';
        d.innerHTML = '<summary><span></span><span class="blk-arrow">▼</span></summary><ul></ul>';
        d.querySelector('summary span').textContent = m.title || '說明';
        var ul = d.querySelector('ul');
        (m.items || []).forEach(function (f) { var li = document.createElement('li'); li.textContent = f; ul.appendChild(li); });
        host.appendChild(d);
      },
      editor: function (body, m, ctx) {
        var f = beField('條列內容（一行一項）', '<textarea class="be-tall"></textarea>');
        var ta = f.querySelector('textarea');
        ta.value = (m.items || []).join('\n');
        ta.oninput = function () {
          m.items = ta.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
          ctx.markDirty();
        };
        body.appendChild(f);
      }
    },

    cards: {
      ico: '🗂', label: '卡片格', hint: '縮圖卡片牆：每張卡可設複製內容或外部連結',
      init: function (m) { m.items = []; },
      render: function (host, m, ctx) {
        var g = ce('div', 'blk-grid');
        (m.items || []).filter(schedOk).forEach(function (s) {
          var el = ce('div', 'blk-card');
          el.innerHTML = '<div class="blk-thumb">' + (s.thumb ? '<img loading="lazy" src="' + esc(ctx.resolveSrc(s.thumb)) + '" alt="' + esc(s.scene || '') + '">' : '') + '</div>'
            + '<div class="blk-info"><div class="blk-scene">' + esc(s.scene || '') + '</div>'
            + (s.name ? '<div class="blk-name">' + esc(s.name) + '</div>' : '')
            + (s.prompt ? '<button class="blk-copy">📋 複製指令</button>' : '')
            + (s.link ? '<a class="blk-copy" href="' + esc(s.link) + '" target="_blank" rel="noopener">↗ ' + esc(s.linkLabel || '開啟連結') + '</a>' : '')
            + '</div>';
          var im = el.querySelector('.blk-thumb img');
          if (im) applyDisplay(im, s);
          var b = el.querySelector('button.blk-copy');
          if (b) b.onclick = function () { ctx.onCopy(s, this); };
          g.appendChild(el);
        });
        host.appendChild(g);
      },
      editor: function (body, m, ctx) {
        var hd = ce('div', 'be-listhead');
        hd.innerHTML = '<label>卡片（' + (m.items || []).length + '）</label><button class="be-btn be-btn-pri" type="button">＋ 新增卡片</button>';
        hd.querySelector('button').onclick = function () {
          m.items.push({ id: 's' + ctx.uid(), scene: '', name: '', prompt: '', thumb: '' });
          ctx.markDirty(); ctx.rerender();
        };
        body.appendChild(hd);
        (m.items || []).forEach(function (s, i) {
          var thumbSrc = s.thumb ? ctx.resolveSrc(s.thumb) : '';
          var el = ce('div', 'be-sub');
          el.innerHTML = '<div class="be-subhd">'
            + '<div class="be-subthumb">' + (thumbSrc ? '<img src="' + esc(thumbSrc) + '">' : '') + '</div>'
            + '<div class="be-subt"><div class="be-subtt">' + esc(s.scene || '（未填標題）') + '</div><div class="be-subts">' + esc(s.name || '') + '</div></div>'
            + '<div class="be-subops">'
            + '<button class="be-btn" data-act="up" type="button">↑</button>'
            + '<button class="be-btn" data-act="down" type="button">↓</button>'
            + '<button class="be-btn be-btn-danger" data-act="del" type="button">刪除</button>'
            + '</div></div><div class="be-subbody be-hidden"></div>';
          var sb = el.querySelector('.be-subbody');
          el.querySelector('.be-subhd').addEventListener('click', function (ev) {
            if (ev.target.closest('button')) return;
            sb.classList.toggle('be-hidden');
          });
          el.querySelector('[data-act=up]').onclick = function () {
            if (i < 1) return; var t = m.items[i]; m.items[i] = m.items[i - 1]; m.items[i - 1] = t;
            ctx.markDirty(); ctx.rerender();
          };
          el.querySelector('[data-act=down]').onclick = function () {
            if (i >= m.items.length - 1) return; var t = m.items[i]; m.items[i] = m.items[i + 1]; m.items[i + 1] = t;
            ctx.markDirty(); ctx.rerender();
          };
          el.querySelector('[data-act=del]').onclick = function () {
            if (!confirm('確定刪除卡片「' + (s.scene || '') + '」？')) return;
            m.items.splice(i, 1); ctx.markDirty(); ctx.rerender();
          };
          thumbControls(sb, s, ctx, function (obj) { applyDisplay(el.querySelector('.be-subthumb img'), obj); });
          var f1 = beField('標題', '<input type="text">');
          bindText(f1.querySelector('input'), s, 'scene', ctx, function (v) {
            el.querySelector('.be-subtt').textContent = v || '（未填標題）';
          });
          sb.appendChild(f1);
          var f2 = beField('副標（選填）', '<input type="text">');
          bindText(f2.querySelector('input'), s, 'name', ctx, function (v) {
            el.querySelector('.be-subts').textContent = v;
          });
          sb.appendChild(f2);
          var f3 = beField('複製內容（選填｜提供後卡片顯示「複製」按鈕）', '<textarea class="be-tall be-mono"></textarea>');
          bindText(f3.querySelector('textarea'), s, 'prompt', ctx);
          sb.appendChild(f3);
          var f4 = beField('連結網址（選填｜提供後卡片顯示開啟按鈕）', '<input type="text">');
          bindText(f4.querySelector('input'), s, 'link', ctx);
          sb.appendChild(f4);
          var f5 = beField('連結按鈕文字', '<input type="text" placeholder="開啟連結">');
          bindText(f5.querySelector('input'), s, 'linkLabel', ctx);
          sb.appendChild(f5);
          schedFields(sb, s, ctx);
          body.appendChild(el);
        });
      }
    },

    article: {
      ico: '📝', label: '文字區塊', hint: '標題＋內文的圖文段落',
      init: function (m) { m.html = ''; },
      render: function (host, m) { host.appendChild(ce('div', 'blk-article', m.html || '')); },
      editor: function (body, m, ctx) { htmlField(body, m, '內文', ctx); }
    },

    carousel: {
      ico: '🖼', label: '圖片輪播', hint: '多張圖片左右滑動展示，可附說明文字',
      init: function (m) { m.images = []; m.html = ''; },
      render: function (host, m, ctx) {
        var imgs = (m.images || []).map(ctx.resolveSrc);
        if (imgs.length) {
          var c = ce('div', 'blk-carousel'), track = ce('div', 'blk-track'), dots = ce('div', 'blk-dots'), idx = 0;
          imgs.forEach(function (u) { var im = document.createElement('img'); im.loading = 'lazy'; im.src = u; track.appendChild(im); });
          c.appendChild(track);
          var go = function (i) {
            idx = (i + imgs.length) % imgs.length;
            track.style.transform = 'translateX(-' + (idx * 100) + '%)';
            dots.querySelectorAll('i').forEach(function (d, k) { d.classList.toggle('on', k === idx); });
          };
          imgs.forEach(function (_, k) {
            var i = document.createElement('i'); if (k === 0) i.className = 'on';
            i.onclick = function () { go(k); }; dots.appendChild(i);
          });
          if (imgs.length > 1) {
            var pv = ce('button', 'blk-cbtn blk-prev', '‹'); pv.onclick = function () { go(idx - 1); };
            var nx = ce('button', 'blk-cbtn blk-next', '›'); nx.onclick = function () { go(idx + 1); };
            c.appendChild(pv); c.appendChild(nx); c.appendChild(dots);
          }
          host.appendChild(c);
        }
        if (m.html) { var t = ce('div', 'blk-article blk-mt', m.html); host.appendChild(t); }
      },
      editor: function (body, m, ctx) {
        var box = ce('div', 'be-field');
        box.innerHTML = '<label>輪播圖片（依序顯示）</label><div class="be-caroimgs"></div>'
          + '<button class="be-btn" type="button">＋ 加入圖片（可多選）</button>'
          + '<input type="file" accept="image/*" multiple class="be-hidden">';
        var grid = box.querySelector('.be-caroimgs');
        (m.images || []).forEach(function (rel, i) {
          var ci = ce('div', 'be-ci');
          ci.innerHTML = '<img src="' + esc(ctx.resolveSrc(rel)) + '"><button class="be-ci-rm" type="button">✕</button>'
            + '<div class="be-ci-mv"><button data-mv="-1" type="button">‹</button><button data-mv="1" type="button">›</button></div>';
          ci.querySelector('.be-ci-rm').onclick = function () { m.images.splice(i, 1); ctx.markDirty(); ctx.rerender(); };
          ci.querySelectorAll('[data-mv]').forEach(function (b) {
            b.onclick = function () {
              var j = i + parseInt(b.dataset.mv, 10);
              if (j < 0 || j >= m.images.length) return;
              var t = m.images[i]; m.images[i] = m.images[j]; m.images[j] = t;
              ctx.markDirty(); ctx.rerender();
            };
          });
          grid.appendChild(ci);
        });
        var fi = box.querySelector('input[type=file]');
        box.querySelector('button.be-btn').onclick = function () { fi.click(); };
        fi.addEventListener('change', function () {
          var files = Array.prototype.slice.call(fi.files);
          if (!files.length) return;
          var left = files.length;
          files.forEach(function (f) {
            ctx.stageImage(f, function (rel) {
              m.images.push(rel);
              if (--left === 0) ctx.rerender();
            });
          });
        });
        body.appendChild(box);
        htmlField(body, m, '說明文字（選填，顯示於輪播下方）', ctx);
      }
    },

    video: {
      ico: '🎬', label: '影片', hint: 'YouTube 或 MP4 影片嵌入，可附說明文字',
      init: function (m) { m.video = ''; m.html = ''; },
      render: function (host, m) {
        if (m.video) {
          var w = ce('div', 'blk-vid');
          var em = toEmbed(m.video);
          if (em) { var f = document.createElement('iframe'); f.src = em; f.allowFullscreen = true; w.appendChild(f); }
          else { var v = document.createElement('video'); v.src = m.video; v.controls = true; w.appendChild(v); }
          host.appendChild(w);
        }
        if (m.html) { var t = ce('div', 'blk-article blk-mt', m.html); host.appendChild(t); }
      },
      editor: function (body, m, ctx) {
        var f = beField('影片網址（YouTube 連結或 mp4 檔網址）', '<input type="text" placeholder="https://www.youtube.com/watch?v=…">');
        bindText(f.querySelector('input'), m, 'video', ctx);
        body.appendChild(f);
        htmlField(body, m, '說明文字（選填，顯示於影片下方）', ctx);
      }
    },

    faq: {
      ico: '❓', label: 'FAQ 問答', hint: '常見問答，逐題收合展開',
      init: function (m) { m.items = []; },
      render: function (host, m) {
        (m.items || []).forEach(function (it) {
          var d = document.createElement('details'); d.className = 'blk-acc';
          d.innerHTML = '<summary><span></span><span class="blk-arrow">▼</span></summary><div class="blk-fa"></div>';
          d.querySelector('summary span').textContent = it.q || '';
          var a = d.querySelector('.blk-fa');
          a.innerHTML = /<\w+[^>]*>/.test(it.a || '') ? it.a : esc(it.a || '').replace(/\n/g, '<br>');
          host.appendChild(d);
        });
      },
      editor: function (body, m, ctx) {
        listEditor(body, m.items, ctx, {
          label: '問答', addLabel: '新增問答',
          fields: [{ key: 'q', label: '問題' }, { key: 'a', label: '答案', type: 'textarea' }]
        });
      }
    },

    files: {
      ico: '📎', label: '檔案下載', hint: '提供 PDF、簡報等檔案下載',
      init: function (m) { m.files = []; },
      render: function (host, m, ctx) {
        (m.files || []).forEach(function (f) {
          var url = /^https?:/.test(f.url || '') ? f.url : ctx.resolveSrc(f.url || '');
          var row = ce('div', 'blk-dl');
          row.innerHTML = '<span class="blk-dl-ico">📎</span><span class="blk-dn"></span>'
            + '<a href="' + esc(url) + '" ' + (/^https?:/.test(f.url || '') ? 'target="_blank" rel="noopener"' : 'download') + '>⬇ 下載</a>';
          row.querySelector('.blk-dn').textContent = f.name || f.url;
          host.appendChild(row);
        });
      },
      editor: function (body, m, ctx) {
        var up = ce('div', 'be-field');
        up.innerHTML = '<button class="be-btn" type="button">⬆ 上傳檔案（≤20MB）</button><input type="file" class="be-hidden">'
          + '<span class="be-hint">大檔請貼雲端硬碟連結</span>';
        var fi = up.querySelector('input');
        up.querySelector('button').onclick = function () { fi.click(); };
        fi.addEventListener('change', function () {
          var f = fi.files[0]; if (!f) return;
          ctx.stageFile(f, function (rel) { m.files.push({ name: f.name, url: rel }); ctx.rerender(); });
          fi.value = '';
        });
        body.appendChild(up);
        listEditor(body, m.files, ctx, {
          label: '檔案清單', addLabel: '加外部連結',
          fields: [{ key: 'name', label: '顯示名稱' }, { key: 'url', label: '網址或已上傳路徑' }]
        });
      }
    },

    buttons: {
      ico: '🔘', label: '按鈕列', hint: '一排行動按鈕（連結）',
      init: function (m) { m.buttons = []; },
      render: function (host, m) {
        var row = ce('div', 'blk-btnrow');
        (m.buttons || []).forEach(function (b) {
          var a = document.createElement('a');
          a.className = b.style === 'line' ? 'line' : 'pri';
          a.href = b.url || '#';
          if (/^https?:/.test(b.url || '')) { a.target = '_blank'; a.rel = 'noopener'; }
          a.textContent = b.label || '按鈕';
          row.appendChild(a);
        });
        host.appendChild(row);
      },
      editor: function (body, m, ctx) {
        listEditor(body, m.buttons, ctx, {
          label: '按鈕', addLabel: '新增按鈕',
          fields: [{ key: 'label', label: '按鈕文字' }, { key: 'url', label: '連結網址' },
                   { key: 'style', label: '樣式', ph: 'pri＝實心（預設）/ line＝外框' }]
        });
      }
    },

    twocol: {
      ico: '📰', label: '雙欄圖文', hint: '圖片＋文字左右排版',
      init: function (m) { m.image = ''; m.side = 'left'; m.html = ''; },
      render: function (host, m, ctx) {
        var d = ce('div', 'blk-twocol' + (m.side === 'right' ? ' img-right' : ''));
        if (m.image) { var im = document.createElement('img'); im.loading = 'lazy'; im.src = ctx.resolveSrc(m.image); d.appendChild(im); }
        d.appendChild(ce('div', 'blk-tc', m.html || ''));
        host.appendChild(d);
      },
      editor: function (body, m, ctx) {
        var f = ce('div', 'be-field');
        f.innerHTML = '<label>圖片</label><div class="be-row">'
          + '<div class="be-stage be-stage-sm">' + (m.image ? '<img src="' + esc(ctx.resolveSrc(m.image)) + '">' : '') + '</div>'
          + '<div><button class="be-btn" type="button">更換圖片</button><input type="file" accept="image/*" class="be-hidden">'
          + '<div class="be-field" style="margin-top:10px"><label>圖片位置</label><select><option value="left">靠左</option><option value="right">靠右</option></select></div></div></div>';
        var fi = f.querySelector('input[type=file]');
        f.querySelector('button').onclick = function () { fi.click(); };
        fi.addEventListener('change', function () {
          var file = fi.files[0]; if (!file) return;
          ctx.stageImage(file, function (rel) { m.image = rel; ctx.rerender(); });
        });
        var sel = f.querySelector('select'); sel.value = m.side || 'left';
        sel.onchange = function () { m.side = sel.value; ctx.markDirty(); };
        body.appendChild(f);
        htmlField(body, m, '文字內容', ctx);
      }
    },

    embed: {
      ico: '🧩', label: '嵌入頁面', hint: '嵌入外部網頁（iframe）',
      init: function (m) { m.url = ''; m.height = 480; },
      render: function (host, m) {
        if (!m.url) return;
        var w = ce('div', 'blk-embed');
        var f = document.createElement('iframe');
        f.src = m.url; f.height = parseInt(m.height, 10) || 480; f.loading = 'lazy';
        f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
        w.appendChild(f);
        host.appendChild(w);
      },
      editor: function (body, m, ctx) {
        var f = ce('div', 'be-field');
        f.innerHTML = '<label>嵌入網址（對方網站需允許被嵌入）</label><input type="text" placeholder="https://…">'
          + '<div class="be-field" style="margin-top:10px"><label>高度（px）</label><input type="number" min="100" max="2000" step="20"></div>';
        var u = f.querySelectorAll('input')[0], h = f.querySelectorAll('input')[1];
        u.value = m.url || ''; h.value = parseInt(m.height, 10) || 480;
        u.oninput = function () { m.url = u.value.trim(); ctx.markDirty(); };
        h.oninput = function () { m.height = parseInt(h.value, 10) || 480; ctx.markDirty(); };
        body.appendChild(f);
      }
    }
  };

  /* ── 對外 API ── */
  function render(host, m, ctx) {
    if (!TYPES[m.type] || !schedOk(m)) return false;
    TYPES[m.type].render(host, m, ctx);
    return true;
  }
  function editor(body, m, ctx) {
    if (TYPES[m.type]) TYPES[m.type].editor(body, m, ctx);
  }
  function newModule(type, uid) {
    var m = { id: 'm' + uid, type: type, title: '' };
    if (TYPES[type] && TYPES[type].init) TYPES[type].init(m);
    return m;
  }

  /* ── 資料驗證（發佈前閘門） ── */
  function validate(data) {
    var errs = [];
    function bad(where, msg) { errs.push(where + '：' + msg); }
    if (data.site != null && typeof data.site !== 'object') bad('site', '應為物件');
    ['title', 'desc', 'footer', 'backUrl', 'backLabel', 'featureTitle'].forEach(function (k) {
      if (data.site && data.site[k] != null && typeof data.site[k] !== 'string') bad('site.' + k, '應為文字');
    });
    var mods = data.modules;
    if (mods != null) {
      if (!Array.isArray(mods)) { bad('modules', '應為陣列'); return errs; }
      mods.forEach(function (m, i) {
        var w = '第 ' + (i + 1) + ' 個區塊' + (m && m.title ? '「' + m.title + '」' : '');
        if (!m || typeof m !== 'object') { bad(w, '格式錯誤'); return; }
        if (!TYPES[m.type]) bad(w, '未知的區塊型別 ' + m.type);
        ['publishAt', 'unpublishAt'].forEach(function (k) {
          if (m[k] != null && isNaN(new Date(m[k]).getTime())) bad(w, k + ' 不是有效時間');
        });
        (m.items || []).forEach(function (it, j) {
          if (m.type === 'cards') {
            if (!it.id) bad(w + ' 第 ' + (j + 1) + ' 張卡片', '缺 id');
            ['publishAt', 'unpublishAt'].forEach(function (k) {
              if (it[k] != null && isNaN(new Date(it[k]).getTime())) bad(w + ' 第 ' + (j + 1) + ' 張卡片', k + ' 不是有效時間');
            });
          }
          if (m.type === 'faq' && typeof it !== 'object') bad(w, 'FAQ 項目格式錯誤');
        });
        (m.buttons || []).forEach(function (b, j) {
          if (b.url && !/^(https?:\/\/|#|\/)/.test(b.url)) bad(w + ' 按鈕 ' + (j + 1), '網址格式可疑：' + b.url);
        });
      });
    }
    return errs;
  }

  global.HUB_BLOCKS = {
    TYPES: TYPES, render: render, editor: editor, newModule: newModule,
    validate: validate, schedOk: schedOk, applyDisplay: applyDisplay,
    esc: esc, normalizeHtml: normalizeHtml
  };
})(window);
