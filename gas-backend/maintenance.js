/* maintenance.js — 自 Code.js 拆出（GAS 全域共享，檔案僅作組織用） */

/* ── 壞連結巡檢 ──
   掃 data.json 與各子頁面 data.json 的所有對外連結，回報失效者。
   需要 UrlFetchApp（外部連線）授權：第一次請在 Apps Script 編輯器手動執行
   authorizeOnce()，同意權限後即可運作。未授權時回 null（前端顯示指引）。 */
function authorizeOnce() {
  var r = UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  Logger.log('授權完成，狀態碼：' + r.getResponseCode());
}

function collectLinks_() {
  var BASE = 'https://jyunhao914.github.io/ai-tools-platform/';
  var out = [];   // {url, where}
  function addFrom(obj, where) {
    ['linkUrl','link','video','url'].forEach(function(k){
      var v = obj && obj[k];
      if (typeof v === 'string' && /^https?:\/\//.test(v)) out.push({ url: v, where: where });
    });
    (obj && obj.buttons || []).forEach(function(b){
      if (b.url && /^https?:\/\//.test(b.url)) out.push({ url: b.url, where: where + '（按鈕）' });
    });
    (obj && obj.files || []).forEach(function(f){
      if (f.url && /^https?:\/\//.test(f.url)) out.push({ url: f.url, where: where + '（檔案）' });
    });
  }
  var d = JSON.parse(UrlFetchApp.fetch(BASE + 'data.json', { muteHttpExceptions: true }).getContentText());
  (d.cards || []).forEach(function(cd){ if (cd.visible !== false) addFrom(cd, '卡片：' + (cd.title || cd.id)); });
  try {
    var hubs = JSON.parse(UrlFetchApp.fetch(BASE + 'hubs.json', { muteHttpExceptions: true }).getContentText()).hubs || [];
    hubs.forEach(function(h){
      if (h.archived) return;
      try {
        var hd = JSON.parse(UrlFetchApp.fetch(BASE + h.folder + '/data.json', { muteHttpExceptions: true }).getContentText());
        (hd.modules || []).forEach(function(m){
          addFrom(m, '子頁面 ' + (h.title || h.folder));
          (m.items || []).forEach(function(it){ addFrom(it, '子頁面 ' + (h.title || h.folder) + '：' + (it.scene || '')); });
        });
      } catch(e) {}
    });
  } catch(e) {}
  try {
    var site = JSON.parse(UrlFetchApp.fetch(BASE + 'site.json', { muteHttpExceptions: true }).getContentText());
    (site.modules || []).forEach(function(m){
      addFrom(m, '網站區塊：' + (m.title || m.type));
      (m.items || []).forEach(function(it){ addFrom(it, '網站區塊：' + (it.scene || '') ); });
    });
  } catch(e) {}
  /* 去重（同網址只查一次，但保留所有出處） */
  var map = {};
  out.forEach(function(l){ (map[l.url] = map[l.url] || []).push(l.where); });
  return Object.keys(map).map(function(u){ return { url: u, wheres: map[u] }; });
}

function runLinkCheck_() {
  var links;
  try { links = collectLinks_(); }
  catch(e) { return null; }   /* UrlFetchApp 未授權 */
  var broken = [];
  for (var i = 0; i < links.length; i += 20) {
    var chunk = links.slice(i, i + 20);
    try {
      var resps = UrlFetchApp.fetchAll(chunk.map(function(l){
        return { url: l.url, muteHttpExceptions: true, followRedirects: true,
                 headers: { 'User-Agent': 'Mozilla/5.0 (link-check)' } };
      }));
      resps.forEach(function(r, k){
        var code = r.getResponseCode();
        if (code >= 400) broken.push({ url: chunk[k].url, status: code, where: chunk[k].wheres.join('、') });
      });
    } catch(e) {
      chunk.forEach(function(l){ broken.push({ url: l.url, status: 0, where: l.wheres.join('、') }); });
    }
  }
  var report = { checkedAt: Date.now(), total: links.length, broken: broken };
  PropertiesService.getScriptProperties().setProperty('LINK_REPORT', JSON.stringify(report));
  return report;
}

function runBackup_() {
  var folder = getBackupFolder_();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  var name = '平台資料備份_' + stamp;
  DriveApp.getFileById(SHEET_ID).makeCopy(name, folder);

  // 只留最近 N 份
  var files = [], it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function(a, b) { return b.getDateCreated() - a.getDateCreated(); });
  for (var i = BACKUP_KEEP; i < files.length; i++) files[i].setTrashed(true);

  PropertiesService.getScriptProperties().setProperty('lastBackupAt', String(Date.now()));
  return { ok: true, saved: name, kept: Math.min(files.length + 1, BACKUP_KEEP), folder: folder.getUrl() };
}

function maybeBackup_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var last = Number(props.getProperty('lastBackupAt') || 0);
    if (Date.now() - last < BACKUP_INTERVAL_MS) return;
    props.setProperty('lastBackupAt', String(Date.now()));   // 先記時間，避免同時多次觸發
    runBackup_();
  } catch (e) { /* 靜默略過 */ }
}
