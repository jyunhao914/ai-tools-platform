// Name Tag Generator v0.2.0
// 桌牌產生器 — 展開式 tent card，上半倒轉 + Excel 批次 + PNG 拼版輸出
// v0.11.0 — 文字欄位改為陣列：可新增、刪除、排序，且支援 kind='auto' 自動編號

function makeField(over) {
  return Object.assign({
    id: 'f_' + Math.random().toString(36).slice(2,8),
    label: '欄位',
    kind: 'text',          // 'text' | 'auto'
    template: '',          // text 用：{欄位名} ...
    format: '#{n}',        // auto 用：{n} 會被取代成編號
    start: 1,              // auto 起始號
    padding: 0,            // auto 補零位數（0=不補）
    font: 'NotoSansTC', weight: 400, size: 14, color: '#0a2a66',
    x: 50, y: 30, align: 'center',
    letterSpacing: 0, lineHeight: 1.2, rotation: 0,
    autoFit: false, maxFitW: 130,
    stroke: 0, strokeColor: '#ffffff',
    shadow: false, shadowColor: 'rgba(0,0,0,0.4)', shadowBlur: 2
  }, over || {});
}

const state = {
  cardW: 90,           // mm
  cardH: 55,           // mm
  outputMode: 'badge',  // 'tent' | 'badge'
  bgImage: null,       // HTMLImageElement
  bgNaturalW: 0,
  bgNaturalH: 0,
  bgMode: 'unfolded',  // 'unfolded' | 'face'
  rows: [],            // [{單位, 姓名, 職稱, ...}]
  headers: [],
  map: { org: '單位', name: '姓名', title: '職稱' },
  activeIdx: 0,
  selectedFieldId: '',
  fields: [
    makeField({ id:'f_org',   label:'單位', kind:'text', template:'{單位}',
                size:9,  x:5,  y:11, align:'left',   weight:400, lineHeight:1.2 }),
    makeField({ id:'f_name',  label:'姓名', kind:'text', template:'{姓名}',
                size:24, x:45, y:32, align:'center', weight:700,
                letterSpacing:0.05, lineHeight:1.1, autoFit:true, maxFitW:80 }),
    makeField({ id:'f_title', label:'職稱', kind:'text', template:'{職稱}',
                size:10, x:85, y:49, align:'right',  weight:400, lineHeight:1.2 })
  ],
  bgFill: { type: 'none', color1: '#ffffff', color2: '#dbe8ff', angle: 90 },
  paperGap: 0,
  paperBleed: 3,
  printRange: { from: 1, to: 0 }, // 0 = all
  zoom: 1
};
state.selectedFieldId = state.fields[1]?.id || state.fields[0]?.id;

// ===== Field helpers =====
function fieldById(id) { return state.fields.find(f => f.id === id); }
function fieldIndex(id) { return state.fields.findIndex(f => f.id === id); }
function fieldText(f, row, rowIdx) {
  if (!f) return '';
  if (f.kind === 'auto') {
    const n = (f.start || 1) + (rowIdx || 0);
    const padded = (f.padding > 0) ? String(n).padStart(f.padding, '0') : String(n);
    return (f.format || '#{n}').replace(/\{n\}/g, padded);
  }
  return applyTemplate(f.template, row);
}
function migrateFieldsObject(obj) {
  // 舊格式 {org, name, title} → 陣列
  if (Array.isArray(obj)) return obj.map(f => makeField(f));
  if (!obj || typeof obj !== 'object') return null;
  const order = ['org', 'name', 'title'];
  const labels = { org: '單位', name: '姓名', title: '職稱' };
  const out = [];
  for (const k of order) {
    if (obj[k]) out.push(makeField(Object.assign({}, obj[k], {
      id: 'f_' + k, label: labels[k], kind: 'text'
    })));
  }
  // 任何不在預期裡的 key 也補上
  for (const k of Object.keys(obj)) {
    if (!order.includes(k) && obj[k]) {
      out.push(makeField(Object.assign({}, obj[k], { id: 'f_' + k, label: k })));
    }
  }
  return out.length ? out : null;
}

const PX_PER_MM_PREVIEW = 3;  // 3 px/mm on screen (75 DPI-ish)

// =================== DOM refs ===================
const $ = id => document.getElementById(id);
const bgFileInput = $('bgFile');
const xlsxFileInput = $('xlsxFile');
const cardWInput = $('cardW');
const cardHInput = $('cardH');
const assumedDpiSel = $('assumedDpi');
const btnDetectSize = $('btnDetectSize');
const canvas = $('preview');
const ctx = canvas.getContext('2d');

// =================== Utilities ===================
function toast(msg, ms = 2200) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function applyTemplate(tpl, row) {
  if (!row) return '';
  return tpl.replace(/\{([^}]+)\}/g, (_, k) => (row[k.trim()] ?? ''));
}

// =================== Field editors (dynamic tabs + array fields) ===================
function buildFieldTabs() {
  let tabs = document.querySelector('.tabs');
  if (!tabs) return;
  tabs.innerHTML = '';
  state.fields.forEach((f, idx) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (f.id === state.selectedFieldId ? ' active' : '');
    btn.dataset.target = f.id;
    btn.draggable = true;
    btn.innerHTML = `
      <span class="tab-label">${escapeHtml(f.label || '欄位')}</span>
      ${state.fields.length > 1 ? '<span class="tab-x" title="刪除欄位">×</span>' : ''}
    `;
    btn.addEventListener('click', e => {
      if (e.target.classList.contains('tab-x')) return;
      switchToField(f.id);
    });
    btn.querySelector('.tab-x')?.addEventListener('click', e => {
      e.stopPropagation();
      if (state.fields.length <= 1) return;
      if (!confirm(`刪除欄位「${f.label}」？`)) return;
      pushUndo('field-del');
      const i = fieldIndex(f.id);
      state.fields.splice(i, 1);
      if (state.selectedFieldId === f.id) {
        state.selectedFieldId = state.fields[Math.min(i, state.fields.length-1)].id;
      }
      buildFieldTabs(); buildFieldEditors(); renderPreview();
    });
    // Drag & drop reorder
    btn.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', f.id);
      btn.classList.add('dragging');
    });
    btn.addEventListener('dragend', () => btn.classList.remove('dragging'));
    btn.addEventListener('dragover', e => { e.preventDefault(); btn.classList.add('drag-over'); });
    btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
    btn.addEventListener('drop', e => {
      e.preventDefault();
      btn.classList.remove('drag-over');
      const fromId = e.dataTransfer.getData('text/plain');
      if (!fromId || fromId === f.id) return;
      pushUndo('field-reorder');
      const fromIdx = fieldIndex(fromId);
      const toIdx = fieldIndex(f.id);
      const [moved] = state.fields.splice(fromIdx, 1);
      state.fields.splice(toIdx, 0, moved);
      buildFieldTabs(); buildFieldEditors(); renderPreview();
    });
    tabs.appendChild(btn);
  });
  // + Add button
  const addBtn = document.createElement('button');
  addBtn.className = 'tab tab-add';
  addBtn.title = '新增欄位';
  addBtn.textContent = '＋';
  addBtn.addEventListener('click', () => {
    pushUndo('field-add');
    const headers = state.headers.length ? state.headers : ['單位','姓名','職稱'];
    const usedTpl = state.fields.map(f => f.template).join(' ');
    // 預設指向第一個還沒被用到的欄位
    const guess = headers.find(h => !usedTpl.includes('{'+h+'}')) || headers[0];
    const newF = makeField({
      label: '欄位' + (state.fields.length + 1),
      kind: 'text',
      template: '{' + guess + '}',
      x: state.cardW / 2,
      y: state.cardH / 2,
      align: 'center',
      size: 14
    });
    state.fields.push(newF);
    state.selectedFieldId = newF.id;
    buildFieldTabs(); buildFieldEditors(); renderPreview();
  });
  tabs.appendChild(addBtn);
}

function buildFieldEditors() {
  const host = $('fieldEditors');
  host.innerHTML = '';
  state.fields.forEach(f => {
    const id = f.id;
    const div = document.createElement('div');
    div.className = 'field-editor' + (id === state.selectedFieldId ? ' active' : '');
    div.dataset.id = id;
    div.innerHTML = `
      <div class="row">
        <label>欄位名稱<input type="text" data-k="label"></label>
        <label>類型
          <select data-k="kind">
            <option value="text">文字</option>
            <option value="auto">自動編號</option>
          </select>
        </label>
      </div>
      <div class="row auto-only" style="display:none;">
        <label>編號格式<input type="text" data-k="format" placeholder="#{n}"></label>
        <label>起始<input type="number" data-k="start" min="0" step="1"></label>
        <label>補零位數<input type="number" data-k="padding" min="0" max="6" step="1"></label>
      </div>
      <div class="row">
        <label>字型
          <select data-k="font">
            <option value="NotoSansTC">黑體 Noto Sans TC</option>
            <option value="NotoSerifTC">明體 Noto Serif TC</option>
          </select>
        </label>
        <label>粗細
          <select data-k="weight">
            <option value="400">Regular</option>
            <option value="700">Bold</option>
          </select>
        </label>
      </div>
      <div class="row">
        <label>字級 (pt)<input type="number" data-k="size" min="6" max="200" step="0.5"></label>
        <label>顏色<input type="color" data-k="color"></label>
      </div>
      <div class="row">
        <label>X (mm)<input type="number" data-k="x" step="0.5"></label>
        <label>Y (mm)<input type="number" data-k="y" step="0.5"></label>
      </div>
      <div class="row">
        <label>對齊
          <select data-k="align">
            <option value="left">靠左</option>
            <option value="center">置中</option>
            <option value="right">靠右</option>
          </select>
        </label>
        <label>旋轉 (度)<input type="number" data-k="rotation" step="1" min="-180" max="180"></label>
      </div>
      <div class="row">
        <label>字距 (em)<input type="number" data-k="letterSpacing" step="0.01" min="-0.5" max="2"></label>
        <label>行距 (倍)<input type="number" data-k="lineHeight" step="0.05" min="0.8" max="3"></label>
      </div>
      <div class="row align-row">
        <button type="button" data-align="hcenter">水平置中</button>
        <button type="button" data-align="vcenter">垂直置中</button>
        <button type="button" data-align="both">正中央</button>
      </div>
      <div class="row">
        <label><input type="checkbox" data-k="autoFit"> 超寬自動縮字</label>
        <label>最大寬 (mm)<input type="number" data-k="maxFitW" min="10" max="500" step="1"></label>
      </div>
      <div class="row">
        <label>描邊粗細 (px)<input type="number" data-k="stroke" min="0" max="20" step="0.5"></label>
        <label>描邊色<input type="color" data-k="strokeColor"></label>
      </div>
      <div class="row">
        <label><input type="checkbox" data-k="shadow"> 陰影</label>
        <label>陰影模糊<input type="number" data-k="shadowBlur" min="0" max="40" step="0.5"></label>
      </div>
      <label>內容範本（按 Enter 可換行，欄位用 {欄位名}）
        <textarea data-k="template" rows="2" placeholder="{姓名}"></textarea>
      </label>
    `;
    host.appendChild(div);
    // align quick buttons
    div.querySelectorAll('[data-align]').forEach(btn => {
      btn.addEventListener('click', () => applyQuickAlign(id, btn.dataset.align));
    });
    // toggle auto-only row visibility
    const autoRow = div.querySelector('.auto-only');
    const refreshKindUI = () => {
      if (autoRow) autoRow.style.display = (f.kind === 'auto') ? '' : 'none';
    };
    refreshKindUI();
    // fill values
    div.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k;
      if (el.type === 'checkbox') el.checked = !!f[k];
      else el.value = f[k] ?? '';
      const handler = () => {
        pushUndo('edit');
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else v = el.value;
        if (['size','x','y','weight','rotation','letterSpacing','lineHeight',
             'maxFitW','stroke','shadowBlur','start','padding'].includes(k)) {
          v = parseFloat(v);
          if (isNaN(v)) v = 0;
        }
        f[k] = v;
        if (k === 'kind') refreshKindUI();
        if (k === 'label') buildFieldTabs();
        renderPreview();
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });
  });
}

function applyQuickAlign(id, mode) {
  pushUndo('align');
  const f = fieldById(id);
  if (!f) return;
  const row = state.rows[state.activeIdx];
  const bbox = computeFieldBboxMm(f, row, state.activeIdx); // 為了拿到目前文字實際高度
  if (mode === 'hcenter' || mode === 'both') {
    f.align = 'center';
    f.x = +(state.cardW / 2).toFixed(2);
  }
  if (mode === 'vcenter' || mode === 'both') {
    // baseline y: 讓 bbox 垂直置中於單面
    if (bbox) {
      const desiredCenterY = state.cardH / 2;
      // bbox.y = f.y - ascent，bbox 中心 = bbox.y + bbox.h/2
      // 要 bbox 中心 == desiredCenterY → f.y = desiredCenterY - bbox.h/2 + ascent
      // ascent = sizeMm * 0.85
      const sizeMm = f.size * 25.4 / 72;
      const ascent = sizeMm * 0.85;
      f.y = +(desiredCenterY - bbox.h / 2 + ascent).toFixed(2);
    } else {
      f.y = +(state.cardH / 2).toFixed(2);
    }
  }
  // 同步輸入框
  const ed = document.querySelector(`.field-editor[data-id="${id}"]`);
  if (ed) {
    ed.querySelector('[data-k="x"]').value = f.x;
    ed.querySelector('[data-k="y"]').value = f.y;
    ed.querySelector('[data-k="align"]').value = f.align;
  }
  renderPreview();
}

// Tab clicks now wired in buildFieldTabs(); switchToField below handles tab/editor toggle.

// =================== File loading ===================
bgFileInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.bgImage = img;
    state.bgNaturalW = img.naturalWidth;
    state.bgNaturalH = img.naturalHeight;
    $('bgInfo').textContent = `✓ ${file.name} (${img.naturalWidth}×${img.naturalHeight}px)`;
    renderPreview();
  };
  img.onerror = () => toast('圖片載入失敗');
  img.src = url;
});

btnDetectSize.addEventListener('click', () => {
  if (!state.bgImage) { toast('請先載入背景圖'); return; }
  const dpi = parseFloat(assumedDpiSel.value);
  const wmm = +(state.bgNaturalW / dpi * 25.4).toFixed(1);
  const hmm = +(state.bgNaturalH / dpi * 25.4).toFixed(1);
  if (state.bgMode === 'unfolded') {
    // 圖即為展開全圖
    cardWInput.value = wmm;
    cardHInput.value = hmm;
    state.cardW = wmm; state.cardH = hmm / 2;
    toast(`展開 ${wmm}×${hmm}mm（@${dpi} DPI）`);
  } else {
    // 單面 → 展開高 = 單面高 × 2
    cardWInput.value = wmm;
    cardHInput.value = +(hmm * 2).toFixed(1);
    state.cardW = wmm; state.cardH = hmm;
    toast(`單面 ${wmm}×${hmm}mm → 展開 ${wmm}×${(hmm*2).toFixed(1)}mm`);
  }
  renderPreview();
  updateLayoutHint();
});

$('bgMode').addEventListener('change', e => {
  state.bgMode = e.target.value;
  renderPreview();
});

function syncBgFillUI() {
  $('bgFillType').value = state.bgFill.type;
  $('bgFillColor1').value = state.bgFill.color1;
  $('bgFillColor2').value = state.bgFill.color2;
  $('bgFillAngle').value = state.bgFill.angle;
  $('bgFillColors').style.display =
    state.bgFill.type === 'none' ? 'none' : '';
  $('bgFillColor2').parentElement.style.display =
    state.bgFill.type === 'gradient' ? '' : 'none';
  $('bgFillAngle').parentElement.style.display =
    state.bgFill.type === 'gradient' ? '' : 'none';
}

['bgFillType','bgFillColor1','bgFillColor2','bgFillAngle'].forEach(id => {
  $(id).addEventListener('input', () => {
    pushUndo('edit');
    state.bgFill.type = $('bgFillType').value;
    state.bgFill.color1 = $('bgFillColor1').value;
    state.bgFill.color2 = $('bgFillColor2').value;
    state.bgFill.angle = parseFloat($('bgFillAngle').value) || 0;
    syncBgFillUI();
    renderPreview();
  });
});

function updateLayoutHint() {
  const hint = $('layoutHint');
  if (!hint) return;
  const paper = currentPaper();
  const { perSheet, cols, rows } = layoutPositions(paper, state.cardW, state.cardH, 0);
  if (perSheet === 0) {
    hint.textContent = `⚠️ 桌牌展開 ${state.cardW}×${state.cardH*2}mm 放不進此紙張`;
    hint.style.color = '#c62828';
  } else {
    hint.textContent = `📐 每張紙可放 ${perSheet} 個（${cols}×${rows}），桌牌展開 ${state.cardW}×${state.cardH*2}mm`;
    hint.style.color = '';
  }
}

[cardWInput, cardHInput].forEach(inp => {
  inp.addEventListener('input', () => {
    pushUndo('edit');
    const w = parseFloat(cardWInput.value) || 148;
    const h = parseFloat(cardHInput.value) || 105;
    state.cardW = w;
    state.cardH = state.outputMode === 'badge' ? h : h / 2;
    renderPreview();
    updateLayoutHint();
  });
});

// 輸出模式切換
$('outputMode').addEventListener('change', e => {
  pushUndo('mode');
  const newMode = e.target.value;
  // 維持「使用者輸入的展開高」不變（讓切換體驗自然）
  const inputH = parseFloat(cardHInput.value) || (state.outputMode === 'badge' ? state.cardH : state.cardH * 2);
  state.outputMode = newMode;
  state.cardH = newMode === 'badge' ? inputH : inputH / 2;
  syncOutputModeUI();
  renderPreview();
  updateLayoutHint();
});

function syncOutputModeUI() {
  const m = state.outputMode;
  $('outputMode').value = m;
  $('cardWLabel').textContent = m === 'badge' ? '寬' : '展開寬';
  $('cardHLabel').textContent = m === 'badge' ? '高' : '展開高';
  $('presetTent').style.display  = m === 'tent'  ? '' : 'none';
  $('presetBadge').style.display = m === 'badge' ? '' : 'none';
  $('sizeHint').innerHTML = m === 'badge'
    ? '📌 名牌單面，無摺線；輸入的就是實際印製尺寸。'
    : '📌 摺線在中間（橫向對折），上半自動倒轉。單面 = 展開寬 × (展開高 ÷ 2)。';
  // 預覽工具列描述
  const ptl = document.querySelector('.preview-toolbar span');
  if (ptl) ptl.textContent = m === 'badge'
    ? '預覽（名牌單面，無摺）'
    : '預覽（展開圖，上半自動倒轉，紅虛線=摺線）';
}

document.querySelectorAll('.preset').forEach(btn => {
  btn.addEventListener('click', () => {
    cardWInput.value = btn.dataset.w;
    cardHInput.value = btn.dataset.h;
    state.cardW = parseFloat(btn.dataset.w);
    state.cardH = parseFloat(btn.dataset.h) / 2;
    renderPreview();
    updateLayoutHint();
  });
});
document.querySelectorAll('.preset-badge').forEach(btn => {
  btn.addEventListener('click', () => {
    pushUndo('preset');
    cardWInput.value = btn.dataset.w;
    cardHInput.value = btn.dataset.h;
    state.cardW = parseFloat(btn.dataset.w);
    state.cardH = parseFloat(btn.dataset.h);
    renderPreview();
    updateLayoutHint();
  });
});

document.addEventListener('change', e => {
  if (e.target.id === 'paper') {
    $('customPaperRow').style.display = e.target.value === 'custom' ? '' : 'none';
    updateLayoutHint();
  }
});
['paperW','paperH'].forEach(id => {
  $(id).addEventListener('input', updateLayoutHint);
});

let _lastXlsxBuffer = null;
let _lastXlsxName = '';

let _lastWorkbook = null;
function populateSheetSelect(wb) {
  const sel = $('xlsxSheet');
  const wrap = $('xlsxSheetWrap');
  if (!wb || wb.SheetNames.length <= 1) {
    wrap.style.display = 'none';
    return;
  }
  sel.innerHTML = wb.SheetNames.map(n =>
    `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  wrap.style.display = '';
}

function parseXlsx(buf) {
  const mode = $('xlsxHeaderMode').value; // 'header' or 'data'
  const wb = XLSX.read(buf, { type: 'array' });
  _lastWorkbook = wb;
  populateSheetSelect(wb);
  const sheetName = $('xlsxSheet').value || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]];
  let json, headers;
  if (mode === 'data') {
    // 第一列就是資料；用 A,B,C... 當欄位名
    json = XLSX.utils.sheet_to_json(ws, { header: 'A', defval: '' });
    if (!json.length) return { json: [], headers: [] };
    // 取所有出現過的 A/B/C... 鍵
    const keySet = new Set();
    json.forEach(r => Object.keys(r).forEach(k => keySet.add(k)));
    // 依 Excel 欄序（A,B,...,Z,AA,AB,...）排序，而非字母順序（會把 B 排到 AZ 後面）
    const colIdx = k => {
      let n = 0;
      for (const ch of k) n = n * 26 + (ch.charCodeAt(0) - 64);
      return n;
    };
    headers = [...keySet].sort((a, b) => colIdx(a) - colIdx(b));
    // 過濾完全空白的欄位
    headers = headers.filter(h => json.some(r => String(r[h] ?? '').trim() !== ''));
  } else {
    json = XLSX.utils.sheet_to_json(ws, { defval: '' });
    headers = json.length ? Object.keys(json[0]) : [];
  }
  return { json, headers };
}

function applyXlsxParse() {
  if (!_lastXlsxBuffer) return;
  const { json, headers } = parseXlsx(_lastXlsxBuffer);
  if (!json.length) { toast('Excel 沒有資料'); return; }
  state.rows = json;
  state.headers = headers;
  $('xlsxInfo').textContent = `✓ ${_lastXlsxName}（${json.length} 筆，${headers.length} 欄）`;
  populateHeaderSelects();
  renderRecList();
  state.activeIdx = 0;
  renderPreview();
}

xlsxFileInput.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  _lastXlsxBuffer = await file.arrayBuffer();
  _lastXlsxName = file.name;
  applyXlsxParse();
});

$('xlsxHeaderMode').addEventListener('change', () => {
  if (_lastXlsxBuffer) applyXlsxParse();
});
$('xlsxSheet').addEventListener('change', () => {
  if (_lastXlsxBuffer) applyXlsxParse();
});

// Google Sheets 連結載入 / 重新整理
function parseGSheetUrl(url) {
  // /d/{ID}/...  ?gid=NN  或 #gid=NN
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return null;
  const id = m[1];
  let gid = '0';
  const g = url.match(/[?#&]gid=(\d+)/);
  if (g) gid = g[1];
  return { id, gid };
}

async function loadGoogleSheet(url) {
  const info = parseGSheetUrl(url);
  if (!info) { toast('連結格式不正確'); return; }
  const csvUrl = `https://docs.google.com/spreadsheets/d/${info.id}/export?format=csv&gid=${info.gid}`;
  try {
    toast('讀取中…');
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    // SheetJS 解析 CSV
    const wb = XLSX.read(csv, { type: 'string' });
    // 重新編碼成 buffer 給 applyXlsxParse 復用
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    _lastXlsxBuffer = buf;
    _lastXlsxName = `Google 試算表 (${info.id.slice(0,8)}…)`;
    applyXlsxParse();
    toast('✓ 已載入 Google 試算表');
  } catch (e) {
    console.error(e);
    toast('讀取失敗：請確認連結為「知道連結者皆可檢視」');
  }
}

$('btnGsLoad').addEventListener('click', () => {
  const url = $('gsUrl').value.trim();
  if (!url) { toast('請貼上 Google 試算表連結'); return; }
  loadGoogleSheet(url);
});
$('btnGsRefresh').addEventListener('click', () => {
  const url = $('gsUrl').value.trim();
  if (!url) { toast('沒有連結可重新整理'); return; }
  loadGoogleSheet(url);
});

function populateHeaderSelects() {
  const sample = state.rows[0] || {};
  // 預設猜測：找標題名相符；找不到就用前 3 欄
  const guessFor = (preferName, fallbackIdx) => {
    if (state.headers.includes(preferName)) return preferName;
    return state.headers[fallbackIdx] ?? state.headers[0];
  };
  const defaults = {
    org:   guessFor('單位', 0),
    name:  guessFor('姓名', 1),
    title: guessFor('職稱', 2)
  };
  ['mapOrg','mapName','mapTitle'].forEach((id, i) => {
    const key = ['org','name','title'][i];
    const fieldId = 'f_' + key;
    const sel = $(id);
    sel.innerHTML = state.headers.map(h => {
      const v = String(sample[h] ?? '').slice(0, 12);
      const label = v ? `${h} → ${v}` : h;
      return `<option value="${h}" ${h === defaults[key] ? 'selected' : ''}>${label}</option>`;
    }).join('');
    state.map[key] = defaults[key];
    sel.value = state.map[key];
    // update template of corresponding default field if it still exists
    const f = fieldById(fieldId);
    if (f && f.kind === 'text') f.template = `{${defaults[key]}}`;
    sel.onchange = () => {
      state.map[key] = sel.value;
      const f2 = fieldById(fieldId);
      if (f2 && f2.kind === 'text') f2.template = `{${sel.value}}`;
      buildFieldTabs(); buildFieldEditors();
      renderRecList();
      renderPreview();
    };
  });
  buildFieldTabs(); buildFieldEditors();
}

// =================== Record list ===================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function ensureHeaders() {
  if (!state.headers.length) {
    state.headers = ['單位','姓名','職稱'];
    state.map = { org: '單位', name: '姓名', title: '職稱' };
    populateHeaderSelects();
  }
}

function renderRecList() {
  const host = $('recList');
  $('recCount').textContent = state.rows.length ? `(${state.rows.length})` : '';
  host.innerHTML = '';
  state.rows.forEach((r, i) => {
    const item = document.createElement('div');
    item.className = 'rec-item' + (i === state.activeIdx ? ' active' : '');
    item.innerHTML = `
      <div class="rec-row-head">
        <span>#${i+1}</span>
        <label class="rec-skip"><input type="checkbox" class="rec-skip-cb" ${r._skip ? 'checked' : ''}> 不印</label>
        <button class="rec-del" title="刪除">×</button>
      </div>
      <input data-h="${escapeHtml(state.map.org)}"   placeholder="單位" value="${escapeHtml(r[state.map.org] ?? '')}">
      <input data-h="${escapeHtml(state.map.name)}"  placeholder="姓名" value="${escapeHtml(r[state.map.name] ?? '')}">
      <input data-h="${escapeHtml(state.map.title)}" placeholder="職稱" value="${escapeHtml(r[state.map.title] ?? '')}">
    `;
    if (r._skip) item.classList.add('skip');
    item.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT' || e.target.classList.contains('rec-del')) return;
      state.activeIdx = i;
      host.querySelectorAll('.rec-item').forEach((el, j) =>
        el.classList.toggle('active', j === i));
      renderPreview();
    });
    item.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => {
        pushUndo('edit');
        r[inp.dataset.h] = inp.value;
        if (i === state.activeIdx) renderPreview();
      });
      inp.addEventListener('focus', () => {
        state.activeIdx = i;
        host.querySelectorAll('.rec-item').forEach((el, j) =>
          el.classList.toggle('active', j === i));
        renderPreview();
      });
    });
    item.querySelector('.rec-del').addEventListener('click', e => {
      e.stopPropagation();
      deleteRow(i);
    });
    item.querySelector('.rec-skip-cb').addEventListener('change', e => {
      e.stopPropagation();
      pushUndo('skip');
      r._skip = e.target.checked;
      item.classList.toggle('skip', !!r._skip);
    });
    item.querySelector('.rec-skip').addEventListener('click', e => e.stopPropagation());
    host.appendChild(item);
  });
}

function addBlankRow() {
  ensureHeaders();
  const row = {};
  state.headers.forEach(h => row[h] = '');
  state.rows.push(row);
  state.activeIdx = state.rows.length - 1;
  renderRecList();
  renderPreview();
  // focus the new row's first input
  setTimeout(() => {
    const items = document.querySelectorAll('.rec-item');
    const last = items[items.length - 1];
    last?.scrollIntoView({ block: 'nearest' });
    last?.querySelector('input')?.focus();
  }, 0);
}

function deleteRow(i) {
  if (!confirm(`刪除第 ${i+1} 筆？`)) return;
  state.rows.splice(i, 1);
  if (state.activeIdx >= state.rows.length) state.activeIdx = Math.max(0, state.rows.length - 1);
  renderRecList();
  renderPreview();
}

function clearRows() {
  if (!state.rows.length) return;
  if (!confirm('確定清空所有名單？')) return;
  state.rows = [];
  state.activeIdx = 0;
  renderRecList();
  renderPreview();
}

// =================== Rendering ===================
function applyBgFill(tctx, x, y, w, h) {
  const fill = state.bgFill;
  if (!fill || fill.type === 'none') return false;
  if (fill.type === 'solid') {
    tctx.fillStyle = fill.color1 || '#ffffff';
    tctx.fillRect(x, y, w, h);
    return true;
  }
  if (fill.type === 'gradient') {
    const ang = ((fill.angle || 0) * Math.PI) / 180;
    const cx = x + w / 2, cy = y + h / 2;
    const dx = Math.cos(ang) * (w / 2);
    const dy = Math.sin(ang) * (h / 2);
    const g = tctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    g.addColorStop(0, fill.color1 || '#ffffff');
    g.addColorStop(1, fill.color2 || '#dbe8ff');
    tctx.fillStyle = g;
    tctx.fillRect(x, y, w, h);
    return true;
  }
  return false;
}

function drawFaceBg(tctx, pxPerMm) {
  const W = state.cardW * pxPerMm;
  const H = state.cardH * pxPerMm;
  // bgFill (only if no image OR fill explicitly chosen)
  if (!state.bgImage) {
    if (!applyBgFill(tctx, 0, 0, W, H)) {
      tctx.fillStyle = '#fafbff';
      tctx.fillRect(0, 0, W, H);
      tctx.strokeStyle = '#cbd2de';
      tctx.setLineDash([4, 4]);
      tctx.strokeRect(0.5, 0.5, W-1, H-1);
      tctx.setLineDash([]);
    }
  }
  if (state.bgImage && state.bgMode === 'face') {
    tctx.drawImage(state.bgImage, 0, 0, W, H);
  }
}

function drawFaceText(tctx, row, pxPerMm, rowIdx) {
  state.fields.forEach(f => {
    const text = fieldText(f, row, rowIdx);
    if (text === '' || text == null) return;
    drawTextBlock(tctx, text, f, pxPerMm);
  });
}

function measureLineWidthPx(tctx, line, lsPx) {
  const chars = Array.from(line);
  let w = 0;
  for (const c of chars) w += tctx.measureText(c).width;
  return w + lsPx * Math.max(0, chars.length - 1);
}

function drawTextBlock(tctx, text, f, pxPerMm) {
  let sizePt = f.size;
  let px = sizePt * pxPerMm * (25.4 / 72);
  const lines = String(text).split(/\r?\n/);

  // ---- Auto-fit: shrink size if widest line exceeds maxFitW (mm) ----
  if (f.autoFit && f.maxFitW > 0) {
    const maxPx = f.maxFitW * pxPerMm;
    tctx.save();
    tctx.font = `${f.weight} ${px}px "${f.font}", sans-serif`;
    let lsPx = (f.letterSpacing || 0) * px;
    let widest = 0;
    for (const line of lines) {
      const w = measureLineWidthPx(tctx, line, lsPx);
      if (w > widest) widest = w;
    }
    if (widest > maxPx) {
      const scale = maxPx / widest;
      px = px * scale;
      sizePt = sizePt * scale;
    }
    tctx.restore();
  }

  const lineH = px * (f.lineHeight || 1.2);
  tctx.save();
  tctx.translate(f.x * pxPerMm, f.y * pxPerMm);
  if (f.rotation) tctx.rotate((f.rotation * Math.PI) / 180);
  tctx.font = `${f.weight} ${px}px "${f.font}", sans-serif`;
  tctx.textAlign = f.align;
  tctx.textBaseline = 'alphabetic';
  const ls = (f.letterSpacing || 0) * px;
  if ('letterSpacing' in tctx) tctx.letterSpacing = ls + 'px';

  // shadow
  if (f.shadow) {
    tctx.shadowColor = f.shadowColor || 'rgba(0,0,0,0.4)';
    tctx.shadowBlur = (f.shadowBlur || 2) * pxPerMm * 0.3;
    tctx.shadowOffsetX = 0;
    tctx.shadowOffsetY = 0;
  }

  // stroke (drawn before fill for crisp outline)
  if (f.stroke && f.stroke > 0) {
    tctx.lineJoin = 'round';
    tctx.lineWidth = f.stroke * pxPerMm * 0.3;
    tctx.strokeStyle = f.strokeColor || '#fff';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const y = i * lineH;
      if ('letterSpacing' in tctx || ls === 0) {
        tctx.strokeText(line, 0, y);
      } else {
        drawLineManualSpacing(tctx, line, 0, y, ls, f.align, 'stroke');
      }
    }
    // disable shadow for fill so it doesn't double
    tctx.shadowColor = 'transparent';
  }

  tctx.fillStyle = f.color;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const y = i * lineH;
    if ('letterSpacing' in tctx || ls === 0) {
      tctx.fillText(line, 0, y);
    } else {
      drawLineManualSpacing(tctx, line, 0, y, ls, f.align, 'fill');
    }
  }
  tctx.restore();
}

function drawLineManualSpacing(tctx, text, x, y, ls, align, mode = 'fill') {
  const chars = Array.from(text);
  const widths = chars.map(c => tctx.measureText(c).width);
  const total = widths.reduce((s, w) => s + w, 0) + ls * Math.max(0, chars.length - 1);
  let cursor = x;
  if (align === 'center') cursor = x - total / 2;
  else if (align === 'right') cursor = x - total;
  const prevAlign = tctx.textAlign;
  tctx.textAlign = 'left';
  for (let i = 0; i < chars.length; i++) {
    if (mode === 'stroke') tctx.strokeText(chars[i], cursor, y);
    else tctx.fillText(chars[i], cursor, y);
    cursor += widths[i] + ls;
  }
  tctx.textAlign = prevAlign;
}

function drawUnfolded(tctx, row, pxPerMm, { showFold = true, rowIdx = 0 } = {}) {
  const W = state.cardW * pxPerMm;
  const H = state.cardH * pxPerMm;
  const isBadge = state.outputMode === 'badge';
  const totalH = isBadge ? H : H * 2;
  // Background fill (covers whole drawing area if no image)
  if (!state.bgImage) {
    applyBgFill(tctx, 0, 0, W, totalH);
  }
  // Background image
  if (state.bgImage && state.bgMode === 'unfolded') {
    tctx.drawImage(state.bgImage, 0, 0, W, totalH);
  }
  // Badge mode: only one face, no fold
  if (isBadge) {
    tctx.save();
    drawFaceBg(tctx, pxPerMm);
    drawFaceText(tctx, row, pxPerMm, rowIdx);
    tctx.restore();
    return;
  }
  // Top face (rotated 180°) — text + (face-mode bg)
  tctx.save();
  tctx.translate(W, H);
  tctx.rotate(Math.PI);
  drawFaceBg(tctx, pxPerMm);
  drawFaceText(tctx, row, pxPerMm, rowIdx);
  tctx.restore();
  // Bottom face (normal)
  tctx.save();
  tctx.translate(0, H);
  drawFaceBg(tctx, pxPerMm);
  drawFaceText(tctx, row, pxPerMm, rowIdx);
  tctx.restore();
  // Fold line
  if (showFold) {
    tctx.save();
    tctx.strokeStyle = 'rgba(255,0,0,.5)';
    tctx.setLineDash([6, 4]);
    tctx.lineWidth = 1;
    tctx.beginPath();
    tctx.moveTo(0, H);
    tctx.lineTo(W, H);
    tctx.stroke();
    tctx.restore();
  }
}

function renderPreview() {
  const pxPerMm = PX_PER_MM_PREVIEW * state.zoom;
  const W = state.cardW * pxPerMm;
  const H = (state.outputMode === 'badge' ? state.cardH : state.cardH * 2) * pxPerMm;
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.clearRect(0, 0, W, H);
  const row = state.rows[state.activeIdx];
  drawUnfolded(ctx, row, pxPerMm, { showFold: true, rowIdx: state.activeIdx });
}

// Hit-test helpers: convert canvas click → face-local mm; bbox for each field
function clickToFaceLocal(px, py, pxPerMm) {
  const xmm = px / pxPerMm;
  const ymm = py / pxPerMm;
  const H = state.cardH;
  if (state.outputMode === 'badge') {
    return { x: xmm, y: ymm };
  }
  if (ymm < H) {
    return { x: state.cardW - xmm, y: H - ymm };
  }
  return { x: xmm, y: ymm - H };
}

const _measureCtx = document.createElement('canvas').getContext('2d');
function computeFieldBboxMm(f, row, rowIdx) {
  const text = fieldText(f, row, rowIdx || 0);
  if (text === '' || text == null) return null;
  const sizeMm = f.size * 25.4 / 72;
  const lineHMm = sizeMm * (f.lineHeight || 1.2);
  const lines = String(text).split(/\r?\n/);
  // measure with px==mm
  _measureCtx.font = `${f.weight} ${sizeMm}px "${f.font}", sans-serif`;
  const ls = (f.letterSpacing || 0) * sizeMm;
  let maxW = 0;
  for (const line of lines) {
    const chars = Array.from(line);
    let w = chars.reduce((s, c) => s + _measureCtx.measureText(c).width, 0)
          + ls * Math.max(0, chars.length - 1);
    if (w > maxW) maxW = w;
  }
  const ascent = sizeMm * 0.85;
  const descent = sizeMm * 0.25;
  let x;
  if (f.align === 'center') x = f.x - maxW / 2;
  else if (f.align === 'right') x = f.x - maxW;
  else x = f.x;
  const y = f.y - ascent;
  const h = ascent + descent + lineHMm * (lines.length - 1);
  // pad a tiny bit for clickability
  const pad = 1;
  return { x: x - pad, y: y - pad, w: maxW + pad * 2, h: h + pad * 2 };
}

function hitTestField(localX, localY) {
  const row = state.rows[state.activeIdx];
  // 由小到大命中（後加入的欄位優先），減小遮蔽問題
  for (let i = state.fields.length - 1; i >= 0; i--) {
    const f = state.fields[i];
    const b = computeFieldBboxMm(f, row, state.activeIdx);
    if (!b) continue;
    if (localX >= b.x && localX <= b.x + b.w &&
        localY >= b.y && localY <= b.y + b.h) {
      return f.id;
    }
  }
  return null;
}

function switchToField(id) {
  state.selectedFieldId = id;
  document.querySelectorAll('.tab').forEach(b =>
    b.classList.toggle('active', b.dataset.target === id));
  document.querySelectorAll('.field-editor').forEach(e =>
    e.classList.toggle('active', e.dataset.id === id));
}

canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  const pxPerMm = PX_PER_MM_PREVIEW * state.zoom;
  const local = clickToFaceLocal(e.clientX - rect.left, e.clientY - rect.top, pxPerMm);
  const hit = hitTestField(local.x, local.y);
  if (hit) switchToField(hit);
});

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const pxPerMm = PX_PER_MM_PREVIEW * state.zoom;
  const local = clickToFaceLocal(e.clientX - rect.left, e.clientY - rect.top, pxPerMm);
  const hit = hitTestField(local.x, local.y);
  canvas.classList.toggle('hit', !!hit);
});

$('zoom').addEventListener('input', e => {
  state.zoom = parseFloat(e.target.value);
  renderPreview();
});

// =================== Export ===================
function dpiToPxPerMm(dpi) { return dpi / 25.4; }

function renderCardToCanvas(row, dpi, rowIdx) {
  const pxPerMm = dpiToPxPerMm(dpi);
  const W = Math.round(state.cardW * pxPerMm);
  const H = Math.round((state.outputMode === 'badge' ? state.cardH : state.cardH * 2) * pxPerMm);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const t = c.getContext('2d');
  drawUnfolded(t, row, pxPerMm, { showFold: false, rowIdx: rowIdx || 0 });
  return c;
}

function sanitizeFilename(s) {
  return String(s).replace(/[\/\\:*?"<>|]/g, '_').trim() || 'card';
}

function canvasToBlob(canvas, type='image/png', quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function fallbackDownload(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}

async function saveSingleFile(blob, suggestedName, mime, ext, description) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description, accept: { [mime]: [ext] } }]
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      toast('✓ 已儲存');
      return true;
    } catch (e) {
      if (e.name === 'AbortError') { toast('已取消'); return false; }
      console.warn('showSaveFilePicker failed, fallback', e);
    }
  }
  fallbackDownload(blob, suggestedName);
  toast('✓ 已下載到「下載」資料夾');
  return true;
}

async function saveMultipleToDirectory(files /* [{name,blob}] */) {
  if (window.showDirectoryPicker) {
    try {
      const dir = await window.showDirectoryPicker({ id: 'desk-card-out', mode: 'readwrite' });
      for (const f of files) {
        const fh = await dir.getFileHandle(f.name, { create: true });
        const w = await fh.createWritable();
        await w.write(f.blob);
        await w.close();
      }
      toast(`✓ 已存 ${files.length} 個檔案到所選資料夾`);
      return true;
    } catch (e) {
      if (e.name === 'AbortError') { toast('已取消'); return false; }
      console.warn('showDirectoryPicker failed, fallback', e);
    }
  }
  // Fallback: download one by one
  for (const f of files) fallbackDownload(f.blob, f.name);
  toast(`✓ 已下載 ${files.length} 個檔案`);
  return true;
}

// Imposition — paper size only; per-sheet capacity computed from card size
const PAPERS = {
  A4P: { w: 210, h: 297, label: 'A4 直向' },
  A4L: { w: 297, h: 210, label: 'A4 橫向' },
  A3P: { w: 297, h: 420, label: 'A3 直向' },
  A3L: { w: 420, h: 297, label: 'A3 橫向' },
  B4P: { w: 257, h: 364, label: 'B4 直向' },
  B4L: { w: 364, h: 257, label: 'B4 橫向' }
};

function currentPaper() {
  const key = $('paper').value;
  if (key === 'custom') {
    return {
      w: parseFloat($('paperW').value) || 297,
      h: parseFloat($('paperH').value) || 210,
      label: '自訂'
    };
  }
  return PAPERS[key];
}

function layoutPositions(paper, cardW, cardH, gap = 0) {
  const uW = cardW;
  const uH = (state.outputMode === 'badge') ? cardH : cardH * 2;
  const cols = Math.max(1, Math.floor((paper.w + gap) / (uW + gap)));
  const rows = Math.max(1, Math.floor((paper.h + gap) / (uH + gap)));
  const totalW = cols * uW + (cols - 1) * gap;
  const totalH = rows * uH + (rows - 1) * gap;
  const startX = (paper.w - totalW) / 2;
  const startY = (paper.h - totalH) / 2;
  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({
        x: startX + c * (uW + gap),
        y: startY + r * (uH + gap)
      });
    }
  }
  return { positions, cols, rows, perSheet: cols * rows };
}

function drawCropMarks(t, x, y, w, h, pxPerMm, len = 5) {
  t.save();
  t.strokeStyle = '#000';
  t.lineWidth = 0.3 * pxPerMm;
  const L = len * pxPerMm;
  const X = x * pxPerMm, Y = y * pxPerMm, W = w * pxPerMm, H = h * pxPerMm;
  const gap = 2 * pxPerMm;
  const corners = [
    [X, Y], [X+W, Y], [X, Y+H], [X+W, Y+H]
  ];
  corners.forEach(([cx, cy], i) => {
    const dirX = i % 2 === 0 ? -1 : 1;
    const dirY = i < 2 ? -1 : 1;
    t.beginPath();
    t.moveTo(cx + dirX * gap, cy);
    t.lineTo(cx + dirX * (gap + L), cy);
    t.moveTo(cx, cy + dirY * gap);
    t.lineTo(cx, cy + dirY * (gap + L));
    t.stroke();
  });
  t.restore();
}

function getPrintableRows() {
  const from = Math.max(1, parseInt($('rangeFrom').value) || 1);
  const toRaw = parseInt($('rangeTo').value) || 0;
  const to = toRaw > 0 ? toRaw : state.rows.length;
  const out = [];
  for (let i = from - 1; i < Math.min(to, state.rows.length); i++) {
    const r = state.rows[i];
    if (!r._skip) out.push(r);
  }
  return out;
}

function buildImpositionPages() {
  const rowsToPrint = getPrintableRows();
  if (!rowsToPrint.length) { toast('沒有可輸出的名單（檢查範圍與「不印」勾選）'); return null; }
  const dpi = parseInt($('dpi').value);
  const paper = currentPaper();
  const gap = parseFloat($('gap').value) || 0;
  const { positions, perSheet, cols, rows } = layoutPositions(paper, state.cardW, state.cardH, gap);
  if (perSheet === 0) { toast('紙張放不下這個尺寸'); return null; }
  const showCrop = $('cropMarks').checked;
  const showBleed = $('bleedMarks').checked;
  const bleedMm = parseFloat($('bleed').value) || 0;
  const pxPerMm = dpiToPxPerMm(dpi);
  const sheetW = Math.round(paper.w * pxPerMm);
  const sheetH = Math.round(paper.h * pxPerMm);
  const total = rowsToPrint.length;
  const sheetCount = Math.ceil(total / perSheet);
  const pages = [];
  for (let s = 0; s < sheetCount; s++) {
    const c = document.createElement('canvas');
    c.width = sheetW; c.height = sheetH;
    const t = c.getContext('2d');
    t.fillStyle = '#fff'; t.fillRect(0, 0, sheetW, sheetH);
    for (let k = 0; k < perSheet; k++) {
      const idx = s * perSheet + k;
      if (idx >= total) break;
      const row = rowsToPrint[idx];
      const pos = positions[k];
      t.save();
      t.translate(pos.x * pxPerMm, pos.y * pxPerMm);
      drawUnfolded(t, row, pxPerMm, { showFold: false, rowIdx: idx });
      t.restore();
      const cardTotalH = state.outputMode === 'badge' ? state.cardH : state.cardH * 2;
      if (showBleed && bleedMm > 0) {
        t.save();
        t.strokeStyle = '#888';
        t.setLineDash([3, 3]);
        t.lineWidth = 0.2 * pxPerMm;
        t.strokeRect(
          (pos.x - bleedMm) * pxPerMm, (pos.y - bleedMm) * pxPerMm,
          (state.cardW + bleedMm * 2) * pxPerMm,
          (cardTotalH + bleedMm * 2) * pxPerMm);
        t.restore();
      }
      if (showCrop) drawCropMarks(t, pos.x, pos.y, state.cardW, cardTotalH, pxPerMm);
    }
    pages.push(c);
  }
  return { pages, paper, perSheet, cols, rows, dpi };
}

// =================== Imposition preview modal ===================
let _impData = null;     // { pages, paper, ... }
let _impIdx = 0;

function openImpModal() {
  const data = buildImpositionPages();
  if (!data) return;
  _impData = data;
  _impIdx = 0;
  $('impMeta').textContent =
    `${data.paper.w}×${data.paper.h}mm，每頁 ${data.perSheet} 個（${data.cols}×${data.rows}），共 ${data.pages.length} 頁`;
  const m = $('impModal'); m.classList.remove('hidden'); m.style.display = '';
  buildImpThumbs();
  renderImpPage();
}
function closeImpModal() {
  const m = $('impModal');
  m.classList.add('hidden'); m.style.display = 'none';
  _impData = null;
}

function buildImpThumbs() {
  const host = $('impThumbs');
  host.innerHTML = '';
  _impData.pages.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'imp-thumb' + (i === _impIdx ? ' active' : '');
    const img = document.createElement('img');
    // small thumb: shrink the canvas
    const tc = document.createElement('canvas');
    const scale = 100 / c.width;
    tc.width = Math.round(c.width * scale);
    tc.height = Math.round(c.height * scale);
    tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
    img.src = tc.toDataURL('image/png');
    div.appendChild(img);
    const lbl = document.createElement('div');
    lbl.textContent = `第 ${i+1} 頁`;
    div.appendChild(lbl);
    div.addEventListener('click', () => { _impIdx = i; renderImpPage(); });
    host.appendChild(div);
  });
}

function renderImpPage() {
  const c = _impData.pages[_impIdx];
  const dest = $('impCanvas');
  const wrap = dest.parentElement;
  const maxW = wrap.clientWidth - 40;
  const maxH = wrap.clientHeight - 40;
  const scale = Math.min(maxW / c.width, maxH / c.height, 1);
  dest.width = Math.round(c.width * scale);
  dest.height = Math.round(c.height * scale);
  const t = dest.getContext('2d');
  t.imageSmoothingQuality = 'high';
  t.drawImage(c, 0, 0, dest.width, dest.height);
  $('impPageInfo').textContent = `${_impIdx + 1} / ${_impData.pages.length}`;
  $('impPrev').disabled = _impIdx === 0;
  $('impNext').disabled = _impIdx === _impData.pages.length - 1;
  document.querySelectorAll('.imp-thumb').forEach((el, i) =>
    el.classList.toggle('active', i === _impIdx));
}

$('btnPreviewSheets').addEventListener('click', openImpModal);
$('impClose').addEventListener('click', closeImpModal);
$('impPrev').addEventListener('click', () => { if (_impIdx > 0) { _impIdx--; renderImpPage(); } });
$('impNext').addEventListener('click', () => {
  if (_impIdx < _impData.pages.length - 1) { _impIdx++; renderImpPage(); }
});
document.addEventListener('keydown', e => {
  if ($('impModal').classList.contains('hidden')) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); $('impPrev').click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); $('impNext').click(); }
  else if (e.key === 'Escape') { closeImpModal(); }
});

$('impPrint').addEventListener('click', () => {
  if (!_impData) return;
  const { pages, paper } = _impData;
  const w = window.open('', '_blank');
  if (!w) { toast('瀏覽器封鎖了列印視窗'); return; }
  const imgs = pages.map(c => `<img src="${c.toDataURL('image/jpeg', 0.92)}">`).join('');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>列印桌牌</title>
    <style>
      @page { size: ${paper.w}mm ${paper.h}mm; margin: 0; }
      html, body { margin: 0; padding: 0; }
      img { display: block; width: ${paper.w}mm; height: ${paper.h}mm; page-break-after: always; }
      img:last-child { page-break-after: auto; }
    </style></head><body>${imgs}</body></html>`);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
});

$('impDownload').addEventListener('click', async () => {
  const fmt = $('impFormat').value;
  if (fmt === 'pdf') await saveImpAsPdf();
  else await saveImpAsPng();
});

async function saveImpAsPdf() {
  if (!_impData) return;
  const { pages, paper } = _impData;
  const orientation = paper.w > paper.h ? 'landscape' : 'portrait';
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation, unit: 'mm', format: [paper.w, paper.h], compress: true });
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) doc.addPage([paper.w, paper.h], orientation);
    const dataUrl = pages[i].toDataURL('image/jpeg', 0.92);
    doc.addImage(dataUrl, 'JPEG', 0, 0, paper.w, paper.h, undefined, 'FAST');
  }
  const blob = doc.output('blob');
  await saveSingleFile(blob, autoFilename('名牌拼版', '.pdf'), 'application/pdf', '.pdf', 'PDF 檔');
}

async function saveImpAsPng() {
  if (!_impData) return;
  const files = [];
  for (let i = 0; i < _impData.pages.length; i++) {
    files.push({
      name: `sheet_${String(i+1).padStart(2,'0')}.png`,
      blob: await canvasToBlob(_impData.pages[i], 'image/png')
    });
  }
  if (files.length === 1) {
    await saveSingleFile(files[0].blob, autoFilename('名牌拼版', '.png'),
      'image/png', '.png', 'PNG 圖片');
  } else {
    // 多頁：把檔名前綴也改成自動命名
    const prefix = autoFilename('名牌拼版', '');
    files.forEach((f, i) => f.name = `${prefix}_p${String(i+1).padStart(2,'0')}.png`);
    await saveMultipleToDirectory(files);
  }
}

// =================== Single-card export modal ===================
function openEachModal() {
  if (!state.rows.length) { toast('請先建立名單'); return; }
  const m = $('eachModal'); m.classList.remove('hidden'); m.style.display = '';
}
function closeEachModal() {
  const m = $('eachModal'); m.classList.add('hidden'); m.style.display = 'none';
}
$('btnExportEach').addEventListener('click', openEachModal);
$('eachClose').addEventListener('click', closeEachModal);
$('eachCancel').addEventListener('click', closeEachModal);
$('eachConfirm').addEventListener('click', async () => {
  const fmt = $('eachFormat').value;
  closeEachModal();
  if (fmt === 'pdf') await saveEachAsPdf();
  else await saveEachAsPng();
});

async function saveEachAsPdf() {
  const rowsToPrint = getPrintableRows();
  if (!rowsToPrint.length) { toast('沒有可輸出的名單'); return; }
  const dpi = parseInt($('dpi').value);
  const W = state.cardW;
  const H = state.cardH * 2;
  const orientation = W > H ? 'landscape' : 'portrait';
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation, unit: 'mm', format: [W, H], compress: true });
  toast(`產出 PDF…(${rowsToPrint.length} 頁)`);
  for (let i = 0; i < rowsToPrint.length; i++) {
    if (i > 0) doc.addPage([W, H], orientation);
    const c = renderCardToCanvas(rowsToPrint[i], dpi, i);
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    doc.addImage(dataUrl, 'JPEG', 0, 0, W, H, undefined, 'FAST');
  }
  const blob = doc.output('blob');
  await saveSingleFile(blob, autoFilename('名牌單張', '.pdf'), 'application/pdf', '.pdf', 'PDF 檔');
}

async function saveEachAsPng() {
  const rowsToPrint = getPrintableRows();
  if (!rowsToPrint.length) { toast('沒有可輸出的名單'); return; }
  const dpi = parseInt($('dpi').value);
  const files = [];
  toast(`產出 PNG…(${rowsToPrint.length} 張)`);
  for (let i = 0; i < rowsToPrint.length; i++) {
    const row = rowsToPrint[i];
    const c = renderCardToCanvas(row, dpi, i);
    const name = sanitizeFilename(row[state.map.name] || `card_${i+1}`);
    files.push({
      name: `${String(i+1).padStart(3,'0')}_${name}.png`,
      blob: await canvasToBlob(c, 'image/png')
    });
  }
  // 用自動命名前綴讓資料夾內檔案有歸屬感
  const prefix = autoFilename('名牌', '');
  files.forEach((f, i) => f.name = `${prefix}_${f.name}`);
  await saveMultipleToDirectory(files);
}
$('btnAddRow').addEventListener('click', () => { pushUndo('add-row'); addBlankRow(); });
$('btnClearRows').addEventListener('click', () => { pushUndo('clear-rows'); clearRows(); });

// =================== Undo / Redo (history model) ===================
let history = [];
let histPos = -1;
const HIST_LIMIT = 100;
let _histDebT = 0;

function snapshot() {
  return JSON.stringify({
    cardW: state.cardW,
    cardH: state.cardH,
    bgMode: state.bgMode,
    fields: state.fields,
    rows: state.rows,
    map: state.map,
    headers: state.headers,
    activeIdx: state.activeIdx,
    selectedFieldId: state.selectedFieldId
  });
}
function restore(snap) {
  const s = JSON.parse(snap);
  state.cardW = s.cardW;
  state.cardH = s.cardH;
  state.bgMode = s.bgMode;
  const migrated = migrateFieldsObject(s.fields);
  if (migrated) state.fields = migrated;
  state.rows = s.rows || [];
  state.map = s.map || state.map;
  state.headers = s.headers || [];
  state.activeIdx = s.activeIdx ?? 0;
  state.selectedFieldId = s.selectedFieldId || s.selectedField || (state.fields[0] && state.fields[0].id);
  // sync UI
  cardWInput.value = state.cardW;
  cardHInput.value = +(state.cardH * 2).toFixed(1);
  $('bgMode').value = state.bgMode;
  populateHeaderSelects();
  buildFieldTabs(); buildFieldEditors();
  renderRecList();
  renderPreview();
  updateLayoutHint();
}

// localStorage autosave (without bg image - too big)
const LS_KEY = 'nameTagState_v1';
let _saveT = 0;
function autosave() {
  clearTimeout(_saveT);
  _saveT = setTimeout(() => {
    try {
      const s = {
        cardW: state.cardW, cardH: state.cardH,
        bgMode: state.bgMode, bgFill: state.bgFill,
        fields: state.fields,
        rows: state.rows, map: state.map, headers: state.headers,
        paperKey: $('paper').value,
        paperW: parseFloat($('paperW').value),
        paperH: parseFloat($('paperH').value),
        bleed: parseFloat($('bleed').value),
        gap: parseFloat($('gap').value),
        cropMarks: $('cropMarks').checked,
        bleedMarks: $('bleedMarks').checked,
        dpi: $('dpi').value,
        rangeFrom: $('rangeFrom').value,
        rangeTo: $('rangeTo').value
      };
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch (e) { /* ignore quota */ }
  }, 600);
}

function autoload() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (typeof s.cardW === 'number') state.cardW = s.cardW;
    if (typeof s.cardH === 'number') state.cardH = s.cardH;
    if (s.bgMode) state.bgMode = s.bgMode;
    if (s.bgFill) state.bgFill = s.bgFill;
    if (s.fields) {
      const migrated = migrateFieldsObject(s.fields);
      if (migrated) state.fields = migrated;
      state.selectedFieldId = state.fields[0]?.id;
    }
    if (Array.isArray(s.rows)) state.rows = s.rows;
    if (s.map) state.map = s.map;
    if (Array.isArray(s.headers) && s.headers.length) state.headers = s.headers;
    cardWInput.value = state.cardW;
    cardHInput.value = +(state.cardH * 2).toFixed(1);
    $('bgMode').value = state.bgMode;
    if (s.paperKey) $('paper').value = s.paperKey;
    if (s.paperW) $('paperW').value = s.paperW;
    if (s.paperH) $('paperH').value = s.paperH;
    if (typeof s.bleed === 'number') $('bleed').value = s.bleed;
    if (typeof s.gap === 'number') $('gap').value = s.gap;
    if (typeof s.cropMarks === 'boolean') $('cropMarks').checked = s.cropMarks;
    if (typeof s.bleedMarks === 'boolean') $('bleedMarks').checked = s.bleedMarks;
    if (s.dpi) $('dpi').value = s.dpi;
    if (s.rangeFrom) $('rangeFrom').value = s.rangeFrom;
    if (s.rangeTo) $('rangeTo').value = s.rangeTo;
    $('customPaperRow').style.display = $('paper').value === 'custom' ? '' : 'none';
    return true;
  } catch (e) { return false; }
}

function initHistory() {
  history = [snapshot()];
  histPos = 0;
}

// 立即記錄歷史點（離散動作：新增列、刪除、置中、套用模板等）
function pushUndo(/* legacy reason */ reason = '') {
  // 'edit' = 連續輸入，用 debounce 版本
  if (reason === 'edit') return pushUndoDebounced();
  // 其他都立即記錄
  if (_histDebT) {
    // 先把 pending debounce 落地
    clearTimeout(_histDebT); _histDebT = 0;
    _commitHistory();
  }
  _commitHistory();
  autosave();
}

function pushUndoDebounced() {
  clearTimeout(_histDebT);
  _histDebT = setTimeout(() => {
    _histDebT = 0;
    _commitHistory();
    autosave();
  }, 250);
}

function _commitHistory() {
  const snap = snapshot();
  if (history[histPos] === snap) return;
  // 截掉 redo 的未來
  history = history.slice(0, histPos + 1);
  history.push(snap);
  histPos = history.length - 1;
  if (history.length > HIST_LIMIT) {
    const drop = history.length - HIST_LIMIT;
    history = history.slice(drop);
    histPos -= drop;
  }
}

function doUndo() {
  // 把 pending debounce 落地
  if (_histDebT) { clearTimeout(_histDebT); _histDebT = 0; _commitHistory(); }
  if (histPos <= 0) { toast('沒有可復原的步驟'); return; }
  histPos--;
  restore(history[histPos]);
  toast(`↶ 已復原 (${histPos+1}/${history.length})`, 1200);
}
function doRedo() {
  if (histPos >= history.length - 1) { toast('沒有可重做的步驟'); return; }
  histPos++;
  restore(history[histPos]);
  toast(`↷ 已重做 (${histPos+1}/${history.length})`, 1200);
}

$('btnUndo').addEventListener('click', doUndo);
$('btnRedo').addEventListener('click', doRedo);

document.addEventListener('keydown', e => {
  // Arrow nudge when no input focused
  const tag = (document.activeElement?.tagName || '').toUpperCase();
  const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if (!inField && !e.metaKey && !e.ctrlKey &&
      ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    const f = fieldById(state.selectedFieldId);
    if (f) {
      const step = e.shiftKey ? 5 : 0.5;
      pushUndo('nudge');
      if (e.key === 'ArrowLeft')  f.x = +(f.x - step).toFixed(2);
      if (e.key === 'ArrowRight') f.x = +(f.x + step).toFixed(2);
      if (e.key === 'ArrowUp')    f.y = +(f.y - step).toFixed(2);
      if (e.key === 'ArrowDown')  f.y = +(f.y + step).toFixed(2);
      const ed = document.querySelector(`.field-editor[data-id="${state.selectedFieldId}"]`);
      if (ed) {
        ed.querySelector('[data-k="x"]').value = f.x;
        ed.querySelector('[data-k="y"]').value = f.y;
      }
      renderPreview();
      e.preventDefault();
      return;
    }
  }
  const meta = e.metaKey || e.ctrlKey;
  if (!meta) return;
  // 別在 input/textarea 中攔截系統復原（讓輸入框內建復原優先），除非是樣式編輯
  const inField2 = tag === 'INPUT' || tag === 'TEXTAREA';
  // 我們仍處理整個應用層 undo —— 但 Z 在輸入框內讓瀏覽器先處理：使用 Shift+Cmd+Z 重做
  if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
    if (inField2) return; // 輸入框內由瀏覽器處理
    e.preventDefault();
    doUndo();
  } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
    if (inField2) return;
    e.preventDefault();
    doRedo();
  }
});

// =================== Template save / load ===================
function imgToDataURL(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}

function buildBundle(includeRows) {
  return {
    type: 'name-tag-template',
    version: '0.10.0',
    kind: includeRows ? 'project' : 'template',
    cardW: state.cardW,
    cardH: state.cardH,
    bgMode: state.bgMode,
    bgFill: state.bgFill,
    fields: state.fields,
    map: state.map,
    headers: state.headers,
    rows: includeRows ? state.rows : [],
    bgImage: state.bgImage ? imgToDataURL(state.bgImage) : null
  };
}

function autoFilename(prefix, ext) {
  const firstOrg = state.rows[0]?.[state.map.org] || '';
  const orgPart = firstOrg ? sanitizeFilename(firstOrg) : prefix;
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `${orgPart}_${stamp}${ext}`;
}

async function saveProject() {
  const bundle = buildBundle(true);
  const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
  await saveSingleFile(blob, autoFilename('名牌專案', '.json'),
    'application/json', '.json', '名牌專案');
}

async function saveTemplate() {
  const bundle = buildBundle(false);
  const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
  await saveSingleFile(blob, autoFilename('名牌模板', '.template.json'),
    'application/json', '.json', '名牌模板');
}

async function loadTemplate(file) {
  let tpl;
  try {
    tpl = JSON.parse(await file.text());
  } catch (e) { toast('模板檔解析失敗'); return; }
  if (tpl.type !== 'desk-card-template') {
    toast('不是有效的名牌模板檔');
    return;
  }
  // 套用
  if (typeof tpl.cardW === 'number') state.cardW = tpl.cardW;
  if (typeof tpl.cardH === 'number') state.cardH = tpl.cardH;
  if (tpl.bgMode) state.bgMode = tpl.bgMode;
  if (tpl.fields) {
    const migrated = migrateFieldsObject(tpl.fields);
    if (migrated) {
      state.fields = migrated;
      state.selectedFieldId = state.fields[0]?.id;
    }
  }
  if (tpl.map) state.map = tpl.map;
  if (Array.isArray(tpl.headers) && tpl.headers.length) state.headers = tpl.headers;
  if (tpl.bgFill) state.bgFill = tpl.bgFill;
  if (Array.isArray(tpl.rows) && tpl.rows.length) {
    state.rows = tpl.rows;
    state.activeIdx = 0;
  }

  // sync UI inputs
  cardWInput.value = state.cardW;
  cardHInput.value = +(state.cardH * 2).toFixed(1);
  $('bgMode').value = state.bgMode;
  populateHeaderSelects();
  buildFieldTabs(); buildFieldEditors();

  if (tpl.bgImage) {
    const img = new Image();
    img.onload = () => {
      state.bgImage = img;
      state.bgNaturalW = img.naturalWidth;
      state.bgNaturalH = img.naturalHeight;
      $('bgInfo').textContent = `✓ 從模板載入 (${img.naturalWidth}×${img.naturalHeight}px)`;
      renderPreview();
    };
    img.src = tpl.bgImage;
  } else {
    state.bgImage = null;
    $('bgInfo').textContent = '尚未載入';
    renderPreview();
  }
  syncBgFillUI();
  renderRecList();
  updateLayoutHint();
  initHistory();
  toast(tpl.kind === 'project' ? '✓ 專案已載入（含名單）' : '✓ 模板已載入');
}

$('btnSaveTemplate').addEventListener('click', saveTemplate);
$('btnSaveProject').addEventListener('click', saveProject);
$('tplFile').addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) loadTemplate(f);
  e.target.value = '';
});

// =================== Init ===================
async function init() {
  // wait for fonts to load so first render uses correct metrics
  try {
    await document.fonts.load('700 48px "NotoSansTC"');
    await document.fonts.load('400 16px "NotoSansTC"');
    await document.fonts.load('400 16px "NotoSerifTC"');
  } catch (e) {}
  const restored = autoload();
  buildFieldTabs(); buildFieldEditors();
  ensureHeaders();           // 預設欄位 單位/姓名/職稱（即使沒有 Excel）
  if (!state.rows.length) addBlankRow();
  syncBgFillUI();
  syncOutputModeUI();
  renderRecList();
  renderPreview();
  updateLayoutHint();
  initHistory(); // 從目前狀態（含已還原內容）建立第一個歷史點
  if (restored) toast('↺ 已還原上次工作狀態', 1500);
}
init();
