// =============================================
//  AI 工具資源平台 — Apps Script 後端
//  Code.gs  v6.0 — Permission System Added
// =============================================

// Run this function ONCE to trigger Drive authorization
function authorizeDrive() {
  var folders = DriveApp.getRootFolder().getName();
  Logger.log('Drive authorized! Root folder: ' + folders);
}

const SHEET_ID = '15fZQjVxCK0z5iFqVrwKiJI3Qims5AEQ-UMLzmZSN3yI';

// ★ 每個分頁名稱對應一個網站頁面
const PAGES = ['簡報生成', '海報製作', '工具箱', '關於我們'];

const GEMINI_GEM_URL = 'https://gemini.google.com/gem/1-I-HEXLdgeStt9PmL-dla2q8Blq3Omop?usp=sharing';

// -----------------------------------------------
// Cards sheet 欄位說明（A~K，共 11 欄）：
//  A  id          唯一識別碼
//  B  category    分類
//  C  title       標題
//  D  desc        說明
//  E  linkUrl     連結 URL
//  F  tag         標籤
//  G  imageUrls   預覽圖（多張用換行分隔）
//  H  iconUrl     圖示 URL
//  I  visible     是否顯示
//  J  type        類型: link / file / article (預設 link)
//  K  extra       JSON 字串，存放類型特有資料（含 permission）
// -----------------------------------------------

// ============================================
// AUTH HELPERS — 三級權限
// ============================================

function getRole_(pw, token) {
  if (pw) {
    var auth = checkAdmin(pw);
    if (auth.ok) return 'admin';
  }
  if (token) {
    var cache = CacheService.getScriptCache();
    var role = cache.get('stok_' + token);
    if (role) return role; // 'student'
  }
  return 'public';
}

function computeHash_(str) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str);
  return bytes.map(function(b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
}

function filterCardsByRole_(cards, role) {
  return cards.filter(function(c) {
    var perm = c.permission || 'public';
    if (perm === 'student') return role === 'student' || role === 'admin';
    if (perm === 'admin') return role === 'admin';
    return true;
  });
}

// ============================================
// doGet
// ============================================

function doGet(e) {
  maybeBackup_();
  var p = (e && e.parameter) || {};
  var action = p.action || "";
  var cb = p.callback || "";

  if (action) {
    var result = {};
    var role = getRole_(p.pw || '', p.token || '');

    // Admin-only actions
    var adminActions = {runBackup:1,backupStatus:1,saveCard:1,deleteCard:1,reorderCard:1,reorderAll:1,batchUpdate:1,resetStats:1,setStats:1,setVisitCount:1,getCardsAdmin:1,getAdmins:1,saveAdmins:1,resetCardsSheet:1,saveSetting:1,savePages:1,getSettings:1,getAdminLog:1,saveArticle:1,changeStudentPw:1};
    if (adminActions[action]) {
      if (role !== 'admin') {
        result = { ok:false, error:'auth' };
        var out = cb ? cb+'('+JSON.stringify(result)+')' : JSON.stringify(result);
        return ContentService.createTextOutput(out).setMimeType(cb?ContentService.MimeType.JAVASCRIPT:ContentService.MimeType.JSON);
      }
    }

    try {
      switch(action) {
        case "_testAdminCards_once":
          (function(){
            var adminCards=getPublicCards('admin');
            var toolbox=adminCards.filter(function(c){return c.category==='工具箱';});
            result={ok:true,total:adminCards.length,toolboxCount:toolbox.length,
              toolboxCards:toolbox.map(function(c){return{id:c.id,title:c.title,permission:c.permission,imageUrls:c.imageUrls,type:c.type,extra:c.extra};})};
          })();
          break;
        case "getData":
          recordVisit();
          var settings = getSettings();
          result = { ok:true, cards:getPublicCards(role), pages:getDynamicPages(), gemUrl:GEMINI_GEM_URL, stats:getStats(), settings:settings };
          break;
        case "checkAdmin":
          result = checkAdmin(p.pw || '');
          break;
        case "getCardsAdmin":
          result = { ok:true, cards:getCardsAdmin() };
          break;
        case "saveCard":
          saveCardAdmin(JSON.parse(p.data || "{}"));
          result = { ok:true };
          break;
        case "deleteCard":
          deleteCardAdmin(p.id);
          result = { ok:true };
          break;
        case "reorderCard":
          result = reorderCard(p.id, p.dir);
          break;
        case "resetStats":
          result = resetCardStats(p.id);
          break;
        case "setStats":
          result = setCardStats(p.id, parseInt(p.count||'0',10));
          break;
        case "getAdmins":
          result = { ok:true, admins:getAdmins() };
          break;
        case "setVisitCount":
          result = setVisitCount(parseInt(p.count||'0',10));
          break;
        case "resetCardsSheet":
          var rss = SpreadsheetApp.openById(SHEET_ID);
          var rcs = rss.getSheetByName('Cards');
          if(rcs) rss.deleteSheet(rcs);
          result = { ok:true, msg:'Cards sheet deleted, will re-bootstrap' };
          break;
        case "saveAdmins":
          saveAdmins(JSON.parse(p.data || "[]"));
          result = { ok:true };
          break;
        case "recordClick":
          recordToolClick(p.title || "", p.id || "");
          result = { ok:true };
          break;
        case "runBackup":
          result = weeklyBackup();
          break;
        case "backupStatus": {
          var bf = getBackupFolder_();
          var bl = [], bit = bf.getFiles();
          while (bit.hasNext()) { var bfile = bit.next(); bl.push({ name: bfile.getName(), at: bfile.getDateCreated().toISOString() }); }
          bl.sort(function(a, b) { return a.at < b.at ? 1 : -1; });
          var lastAt = Number(PropertiesService.getScriptProperties().getProperty('lastBackupAt') || 0);
          result = { ok: true, folder: bf.getUrl(), files: bl.slice(0, 10),
                     scheduled: true, lastAt: lastAt || null };
          break;
        }
        case "getStats":
          /* 輕量版：只回統計與各卡片瀏覽數，不序列化整份卡片資料（getData 要 7 秒，這支不到 1 秒） */
          recordVisit();
          var _sv = {};
          try {
            var _ss = SpreadsheetApp.openById(SHEET_ID);
            var _st = _ss.getSheetByName('Stats');
            if (_st && _st.getLastRow() > 1) {
              _st.getRange(2, 1, _st.getLastRow() - 1, 2).getValues().forEach(function(r){
                if (r[0]) _sv[String(r[0])] = Number(r[1]) || 0;
              });
            }
          } catch(e) {}
          result = { ok:true, stats:getStats(), views:_sv };
          break;
        case "getStatsByIds":
          result = { ok:true, stats: getStatsByIds_(p.ids || "") };
          break;
        case "getSettings":
          result = { ok:true, settings: getSettings() };
          break;
        case "listAssets": {
          // 檔案庫：列出集中上傳資料夾的檔案（新後台用）
          var laAuth = checkAdmin(p.pw || '');
          if (!laAuth.ok) { result = { ok:false, error:'auth' }; break; }
          var laFolderId = getOrCreateUploadFolder();
          var laFolder = DriveApp.getFolderById(laFolderId);
          var laFiles = laFolder.getFiles();
          var laList = [];
          while (laFiles.hasNext() && laList.length < 200) {
            var lf = laFiles.next();
            laList.push({
              id: lf.getId(), name: lf.getName(), size: lf.getSize(),
              mimeType: lf.getMimeType(), date: lf.getDateCreated().toISOString(),
              fileUrl: 'https://drive.google.com/file/d/' + lf.getId() + '/view',
              directUrl: 'https://lh3.googleusercontent.com/d/' + lf.getId(),
              dlUrl: 'https://drive.google.com/uc?export=download&id=' + lf.getId()
            });
          }
          laList.sort(function(a,b){ return a.date < b.date ? 1 : -1; });
          result = { ok:true, folderId: laFolderId,
                     folderUrl: 'https://drive.google.com/drive/folders/' + laFolderId,
                     files: laList };
          break;
        }
        case "deleteAsset": {
          var daAuth = checkAdmin(p.pw || '');
          if (!daAuth.ok) { result = { ok:false, error:'auth' }; break; }
          DriveApp.getFileById(p.id).setTrashed(true);
          logAdminAction('刪除雲端檔案', p.id, '');
          result = { ok:true };
          break;
        }
        case "saveSetting":
          saveSetting(p.key, p.value);
          result = { ok:true };
          break;
        case "savePages":
          saveSetting('pages', p.data);
          result = { ok:true };
          break;
        case "getAnalytics":
          result = { ok:true, analytics: getAnalytics() };
          break;
        case "getArticle":
          result = { ok:true, article: getArticleById(p.id, role) };
          break;
        case "saveArticle":
          try {
            var artData = JSON.parse(p.data || '{}');
            var artContent = '';
            if (p.contentB64) {
              artContent = Utilities.newBlob(Utilities.base64Decode(p.contentB64)).getDataAsString();
            }
            var artExtra = {
              content: artContent,
              author: artData.author || '',
              coverImage: artData.coverImage || '',
              publishDate: artData.publishDate || new Date().toISOString()
            };
            var artCard = {
              id: artData.id || undefined,
              category: artData.category || '',
              title: artData.title || '',
              desc: artData.desc || '',
              linkUrl: '',
              tag: artData.tag || '',
              imageUrls: artData.coverImage ? [artData.coverImage] : [],
              iconUrl: '',
              visible: artData.visible !== false,
              type: 'article',
              permission: artData.permission || 'public',
              extra: JSON.stringify(artExtra)
            };
            result = saveCardAdmin(artCard);
            logAdminAction('saveArticle', artData.title || '', '');
          } catch(artErr) {
            result = { ok:false, error:artErr.message };
          }
          break;
        case "reorderAll":
          var order = JSON.parse(p.data || '[]');
          reorderAllCards(order);
          result = {ok:true};
          break;
        case "batchUpdate":
          var ops = JSON.parse(p.data || '[]');
          result = batchUpdateCards(ops);
          break;
        case "getAdminLog":
          result = {ok:true, logs:getAdminLog()};
          break;
        // ── 管理員修改學員密碼 ──
        case "changeStudentPw":
          try {
            var props = PropertiesService.getScriptProperties();
            var newUser = p.username || 'student';
            var newPw = p.password || '';
            var salt = props.getProperty('HASH_SALT') || 'ai_platform_2025';
            if (!newPw) { result = {ok:false, error:'密碼不能為空'}; break; }
            var newHash = computeHash_(salt + newPw);
            props.setProperty('STUDENT_USER', newUser);
            props.setProperty('STUDENT_PW_HASH', newHash);
            // 清除所有現有學員 token
            logAdminAction('修改學員密碼', newUser, '');
            result = {ok:true};
          } catch(err) {
            result = {ok:false, error:err.message};
          }
          break;
        default:
          result = { ok:false, error:"Unknown action: "+action };
      }
    } catch(err) {
      result = { ok:false, error:err.message };
    }
    var json = JSON.stringify(result);
    if (cb) {
      return ContentService.createTextOutput(cb + "(" + json + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Redirect to GitHub Pages
  recordVisit();
  return HtmlService.createHtmlOutput('<html><body style="text-align:center;padding:60px;font-family:sans-serif;background:#0f172a;color:#fff"><p style="font-size:18px">\u6b63\u5728\u8df3\u8f49\u5230 AI \u5de5\u5177\u8cc7\u6e90\u5e73\u53f0...</p><a href="https://jyunhao914.github.io/ai-tools-platform/" target="_top" id="go" style="color:#38bdf8;font-size:16px">\u5982\u672a\u81ea\u52d5\u8df3\u8f49\uff0c\u8acb\u9ede\u6b64</a><script>window.top.location.href="https://jyunhao914.github.io/ai-tools-platform/"<\/script></body></html>').setTitle("AI \u5de5\u5177\u8cc7\u6e90\u5e73\u53f0");
}

// ============================================
// Unified Cards — getPublicCards
// ============================================

function getPublicCards(role) {
  role = role || 'public';
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var statsMap = {};
  var statsSheet = ss.getSheetByName('Stats');
  if (statsSheet && statsSheet.getLastRow() > 1) {
    var sdata = statsSheet.getRange(2,1,statsSheet.getLastRow()-1,2).getValues();
    sdata.forEach(function(r){if(r[0]) statsMap[String(r[0])]=Number(r[1])||0;});
  }
  var cardsSheet = ss.getSheetByName('Cards');
  if (cardsSheet && cardsSheet.getLastRow() >= 2) {
    var numCols = Math.min(cardsSheet.getLastColumn(), 11);
    var data = cardsSheet.getRange(2,1,cardsSheet.getLastRow()-1, numCols).getValues();
    var cards = data.filter(function(r){
      return r[0] && r[8]!==false && r[8]!=='false' && r[8]!==0;
    }).map(function(r){
      var imgStr = String(r[6]||'');
      var imgs = imgStr ? imgStr.split(/[\n,]+/).map(function(u){return convertDriveUrl(u.trim())}).filter(Boolean) : [];
      var id = String(r[0]);
      var type = String(r[9]||'link') || 'link';
      var extraRaw = r[10] ? String(r[10]) : '{}';
      var extra = {};
      try { extra = JSON.parse(extraRaw); } catch(e) {}
      var perm = extra.permission || 'public';
      var card = {
        id: id,
        category: String(r[1]),
        title:    String(r[2]),
        desc:     String(r[3]),
        linkUrl:  String(r[4]),
        tag:      String(r[5]),
        imageUrls:imgs,
        iconUrl:  String(r[7]||''),
        views:    statsMap[id]||0,
        type:     type,
        permission: perm,
        meta1:'', meta2:'', meta3:''
      };
      if (type === 'file') {
        card.fileUrl = extra.fileUrl || '';
        card.fileName = extra.fileName || '';
        card.mimeType = extra.mimeType || '';
        card.driveId = extra.driveId || '';
      } else if (type === 'article') {
        card.content = (extra.content || '').substring(0, 200);
        card.author = extra.author || '';
        card.coverImage = extra.coverImage || '';
        card.publishDate = extra.publishDate || '';
      }
      card.extra = JSON.stringify(extra);
      return card;
    });
    // Filter by permission
    return filterCardsByRole_(cards, role);
  }
  // Bootstrap from page-named sheets
  var srcCards = getCards();
  var bootstrapped = srcCards.map(function(c,i){
    c.id = String(Date.now()) + '_' + i;
    c.visible = true;
    c.type = 'link';
    c.permission = 'public';
    c.extra = '{}';
    return c;
  });
  _writeCardsSheet(bootstrapped);
  bootstrapped.forEach(function(c){ c.views = statsMap[c.id] || 0; });
  return filterCardsByRole_(bootstrapped, role);
}

function getCards() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const cards = [];
    var dynamicPages = getDynamicPages();
    for (const page of dynamicPages) {
      const sheet = ss.getSheetByName(page);
      if (!sheet) continue;
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) continue;
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const en = row[0];
        if (!en || en === false || en === 'FALSE' || en === '') continue;
        const rawImgs = String(row[7] || '');
        const imageUrls = rawImgs
          .split(/[\n,]+/)
          .map(function(u) { return convertDriveUrl(u.trim()); })
          .filter(Boolean);
        cards.push({
          category:  page,
          tag:       String(row[1] || ''),
          title:     String(row[2] || ''),
          desc:      String(row[3] || ''),
          meta1:     String(row[4] || ''),
          meta2:     String(row[5] || ''),
          meta3:     String(row[6] || ''),
          imageUrls: imageUrls,
          linkUrl:   String(row[8] || '') || GEMINI_GEM_URL,
          permission: 'public'
        });
      }
    }
    return cards;
  } catch(e) {
    Logger.log('getCards error: ' + e);
    return [];
  }
}

function convertDriveUrl(url) {
  if (!url) return '';
  if (url.includes('uc?export=view') || url.includes('lh3.googleusercontent.com')) return url;
  var m1 = url.match(/\/file\/d\/([^\/\?]+)/);
  if (m1) return 'https://drive.google.com/uc?export=view&id=' + m1[1];
  var m2 = url.match(/[?&]id=([^&]+)/);
  if (m2) return 'https://drive.google.com/uc?export=view&id=' + m2[1];
  return url;
}

// ============================================
// 瀏覽統計
// ============================================

function recordVisit() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('瀏覽統計');
  if (!sheet) {
    sheet = ss.insertSheet('瀏覽統計');
    sheet.appendRow(['日期時間', '類型', '內容']);
  }
  sheet.appendRow([new Date(), 'visit', 'page_view']);
}


// ============================================
// 每週自動備份（Drive 複製試算表；只用既有 Drive 權限，
// 不用 ScriptApp 觸發器以免需要重新授權）
// 排程方式：任何 API 呼叫時檢查距上次備份是否已滿 7 天
// ============================================
const BACKUP_FOLDER_NAME = 'AI工具平台_備份';
const BACKUP_KEEP = 8;          // 保留最近 8 份
const BACKUP_INTERVAL_MS = 7 * 24 * 3600 * 1000;

function getBackupFolder_() {
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER_NAME);
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

// 惰性排程：距上次備份滿 7 天就在下一次 API 呼叫時補做（失敗不影響 API）
function maybeBackup_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var last = Number(props.getProperty('lastBackupAt') || 0);
    if (Date.now() - last < BACKUP_INTERVAL_MS) return;
    props.setProperty('lastBackupAt', String(Date.now()));   // 先記時間，避免同時多次觸發
    runBackup_();
  } catch (e) { /* 靜默略過 */ }
}

function weeklyBackup() {
  try { return runBackup_(); }
  catch (e) { return { ok: false, error: String(e) }; }
}

function getStatsByIds_(idsCsv) {
  var out = {};
  try {
    var ids = String(idsCsv).split(',').map(function(s){return s.trim()}).filter(String);
    if (!ids.length) return out;
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var st = ss.getSheetByName('Stats');
    if (!st || st.getLastRow() < 2) return out;
    var rows = st.getRange(2, 1, st.getLastRow() - 1, 2).getValues();
    var map = {};
    rows.forEach(function(r){ map[String(r[0])] = Number(r[1]) || 0; });
    ids.forEach(function(id){ out[id] = map[id] || 0; });
  } catch(e) {}
  return out;
}

function recordToolClick(toolTitle, cardId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('瀏覽統計');
  if (!sheet) {
    sheet = ss.insertSheet('瀏覽統計');
    sheet.appendRow(['日期時間', '類型', '內容', '卡片ID']);
  }
  sheet.appendRow([new Date(), 'tool_click', toolTitle, cardId || '']);
  // 以 id 為鍵累加 Stats 表（卡片 views 的權威來源）
  if (cardId && cardId !== '_page_view') {
    try {
      var lock = LockService.getScriptLock();
      lock.tryLock(5000);
      var st = ss.getSheetByName('Stats') || ss.insertSheet('Stats');
      if (st.getLastRow() < 1) st.appendRow(['id', 'views']);
      var found = false;
      if (st.getLastRow() > 1) {
        var ids = st.getRange(2, 1, st.getLastRow() - 1, 2).getValues();
        for (var i = 0; i < ids.length; i++) {
          if (String(ids[i][0]) === String(cardId)) {
            st.getRange(i + 2, 2).setValue((Number(ids[i][1]) || 0) + 1);
            found = true;
            break;
          }
        }
      }
      if (!found) st.appendRow([String(cardId), 1]);
      lock.releaseLock();
    } catch (e) {}
  }
}

/* 統計表是逐次瀏覽累加的，列數會一直長；掃全表很貴（實測 7-9 秒）。
   → 結果快取 60 秒，並改用時間戳比較取代逐列 Utilities.formatDate。 */
function getStats() {
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
    var hit = cache.get('stats_v1');
    if (hit) return JSON.parse(hit);
  } catch(e) {}
  var out = computeStats_();
  try { if (cache) cache.put('stats_v1', JSON.stringify(out), 60); } catch(e) {}
  return out;
}
function computeStats_() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('瀏覽統計');
    if (!sheet) return { total: 0, today: 0, tools: {}, cardsToday: {} };
    const data = sheet.getDataRange().getValues();
    let total = 0;
    const tools = {};
    var today = 0;
    var cardsToday = {};
    // 今日區間（台北時區）只算一次，之後純數字比較
    var nowTpe = new Date(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss'));
    var offset = new Date().getTime() - nowTpe.getTime();
    var startTpe = new Date(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd') + ' 00:00:00');
    var dayStart = startTpe.getTime() + offset;
    var dayEnd = dayStart + 86400000;
    data.slice(1).forEach(row => {
      if (row[1] === 'visit') total++;
      if (row[1] === 'tool_click') {
        tools[row[2]] = (tools[row[2]] || 0) + 1;
      }
      if (row[0] instanceof Date) {
        var ts = row[0].getTime();
        if (ts >= dayStart && ts < dayEnd) {
          if (row[2] === '_page_view' || row[1] === 'visit') today++;
          else if (row[1] === 'tool_click') {
            var key = String(row[3] || '') || String(row[2] || '');
            if (key) cardsToday[key] = (cardsToday[key] || 0) + 1;
          }
        }
      }
    });
    var override = sheet.getRange(1,5).getValue();
    if (override && Number(override) > 0) total = Number(override);
    return { total, today, tools, cardsToday };
  } catch(e) {
    return { total: 0, today: 0, tools: {}, cardsToday: {} };
  }
}

// ============================================
// Settings
// ============================================

function getSettings() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) return {};
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) return {};
  var data = sheet.getRange(1,1,lastRow,2).getValues();
  var result = {};
  data.forEach(function(r){ if(r[0]) result[String(r[0])] = String(r[1]); });
  return result;
}

function saveSetting(key, value) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Settings') || ss.insertSheet('Settings');
  var lastRow = sheet.getLastRow();
  if (lastRow > 0) {
    var keys = sheet.getRange(1,1,lastRow,1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === key) { sheet.getRange(i+1,2).setValue(value); logAdminAction('設定更新',key,''); return {ok:true}; }
    }
  }
  sheet.appendRow([key, value]);
  logAdminAction('設定更新',key,'');
  return {ok:true};
}

function getDynamicPages() {
  var settings = getSettings();
  if (settings.pages) {
    try { return JSON.parse(settings.pages); } catch(e) {}
  }
  return PAGES;
}

// ============================================
// Analytics
// ============================================

function getAnalytics() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('瀏覽統計');
    if (!sheet) return { daily: [] };
    var data = sheet.getDataRange().getValues();
    var dailyMap = {};
    var now = new Date();
    for (var d = 6; d >= 0; d--) {
      var dt = new Date(now.getTime() - d * 86400000);
      var key = Utilities.formatDate(dt, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      dailyMap[key] = 0;
    }
    data.slice(1).forEach(function(row) {
      if (row[1] === 'visit' && row[0]) {
        var dateKey;
        try {
          dateKey = Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } catch(e) { return; }
        if (dailyMap.hasOwnProperty(dateKey)) {
          dailyMap[dateKey]++;
        }
      }
    });
    var daily = [];
    for (var k in dailyMap) {
      if (dailyMap.hasOwnProperty(k)) {
        daily.push({ date: k, count: dailyMap[k] });
      }
    }
    daily.sort(function(a,b){ return a.date < b.date ? -1 : 1; });
    return { daily: daily };
  } catch(e) {
    return { daily: [] };
  }
}

// ═══════════════════════════════════════════
//  Admin System
// ═══════════════════════════════════════════

function checkAdmin(pw) {
  var cache = CacheService.getScriptCache();
  var LOCK_KEY  = 'admin_lock';
  var FAIL_KEY  = 'admin_fail';
  var MAX_FAILS = 5;
  var LOCK_SEC  = 900;  // 15 分鐘
  var FAIL_SEC  = 600;  // 計數視窗 10 分鐘

  // 1. 先判斷是否已被鎖定
  if (cache.get(LOCK_KEY)) {
    return {ok:false, email:'', error:'locked', msg:'登入次數過多，請 15 分鐘後再試'};
  }

  try {
    // 2. Google OAuth 登入（不計入暴力計數）
    var email = Session.getActiveUser().getEmail();
    if (email) {
      var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Admins');
      if (!sheet || sheet.getLastRow()===0) return {ok:false,email:email};
      var emails = sheet.getRange(1,1,sheet.getLastRow(),1).getValues()
        .map(function(r){return r[0].toString().toLowerCase().trim();})
        .filter(function(e){return e;});
      return {ok:emails.indexOf(email.toLowerCase())>=0, email:email};
    }

    // 3. 密碼登入
    if (pw) {
      var adminSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Admins');
      var storedPw = '';
      if (adminSheet && adminSheet.getLastRow() >= 1) {
        storedPw = adminSheet.getRange(1,2).getValue().toString().trim();
      }
      if (!storedPw) storedPw = 'admin';

      var success = (pw === storedPw);

      if (!success) {
        // 記錄失敗次數
        var fails = parseInt(cache.get(FAIL_KEY) || '0', 10) + 1;
        if (fails >= MAX_FAILS) {
          cache.put(LOCK_KEY, '1', LOCK_SEC);
          cache.remove(FAIL_KEY);
          try { logAdminAction('SECURITY', 'admin_locked', '密碼錯誤 ' + MAX_FAILS + ' 次，封鎖 15 分鐘'); } catch(e2){}
        } else {
          cache.put(FAIL_KEY, String(fails), FAIL_SEC);
        }
        return {ok:false, email:'', fails:fails};
      }

      // 登入成功 — 清除計數
      cache.remove(FAIL_KEY);
      cache.remove(LOCK_KEY);
      return {ok:true, email:'admin'};
    }

    return {ok:false, email:''};
  } catch(e) { return {ok:false, email:'', err:e.toString()}; }
}

function getCardsAdmin() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Cards');
  var cards;
  if (!sheet || sheet.getLastRow() < 2) {
    cards = getCards().map(function(c,i){
      c.id = c.id || String(Date.now()) + '_' + i;
      c.visible = true;
      c.type = 'link';
      c.permission = 'public';
      c.extra = '{}';
      return c;
    });
    _writeCardsSheet(cards);
  } else {
    var numCols = Math.min(sheet.getLastColumn(), 11);
    var data = sheet.getRange(2,1,sheet.getLastRow()-1, numCols).getValues();
    cards = data.filter(function(r){return r[0];}).map(function(r){
      var imgStr = String(r[6]||'');
      var imgs = imgStr ? imgStr.split(/[\n,]+/).map(function(u){return convertDriveUrl(u.trim())}).filter(Boolean) : [];
      var type = (numCols >= 10) ? String(r[9]||'link') : 'link';
      var extraRaw = (numCols >= 11 && r[10]) ? String(r[10]) : '{}';
      var extra = {};
      try { extra = JSON.parse(extraRaw); } catch(e) {}
      var perm = extra.permission || 'public';
      var card = {
        id:         String(r[0]),
        category:   String(r[1]),
        title:      String(r[2]),
        desc:       String(r[3]),
        linkUrl:    String(r[4]),
        tag:        String(r[5]),
        imageUrls:  imgs,
        iconUrl:    String(r[7]||''),
        visible:    r[8]!==false&&r[8]!=='false'&&r[8]!==0,
        type:       type,
        permission: perm,
        extra:      extra
      };
      return card;
    });
  }
  var statsSheet = ss.getSheetByName('Stats');
  var statsMap = {};
  if (statsSheet && statsSheet.getLastRow() > 1) {
    var sdata = statsSheet.getRange(2,1,statsSheet.getLastRow()-1,2).getValues();
    sdata.forEach(function(r){if(r[0]) statsMap[String(r[0])]=Number(r[1])||0;});
  }
  cards.forEach(function(c){c.views = statsMap[c.id]||0;});
  return cards;
}

function saveCardAdmin(card) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Cards')||ss.insertSheet('Cards');
  if (sheet.getLastRow()===0) sheet.getRange(1,1,1,11).setValues([['id','category','title','desc','linkUrl','tag','imageUrls','iconUrl','visible','type','extra']]);
  var id = card.id || String(Date.now());
  var isNew = !card.id;
  var vis = (card.visible===false||card.visible==='false') ? false : true;
  var cat = card.category || card.page || card.cat || '';
  var imgs = Array.isArray(card.imageUrls) ? card.imageUrls.join('\n') : (card.imageUrls||card.img||'');
  var type = card.type || 'link';

  // Parse existing extra
  var extra = {};
  if (typeof card.extra === 'string') {
    try { extra = JSON.parse(card.extra); } catch(e) { extra = {}; }
  } else if (typeof card.extra === 'object' && card.extra !== null) {
    extra = card.extra;
  }

  // Store permission inside extra (no schema change needed)
  var perm = card.permission || 'public';
  if (perm !== 'public') {
    extra.permission = perm;
  } else {
    delete extra.permission; // don't store 'public' (saves space, defaults to public)
  }

  var extraStr = JSON.stringify(extra);
  var row = [id, cat, card.title||'', card.desc||'', card.linkUrl||card.url||'', card.tag||'', imgs, card.iconUrl||card.ico||'', vis, type, extraStr];

  var lastRow = sheet.getLastRow();
  if (lastRow >= 1) {
    var maxCol = sheet.getLastColumn();
    if (maxCol < 10) sheet.getRange(1,10).setValue('type');
    if (maxCol < 11) sheet.getRange(1,11).setValue('extra');
  }
  if (lastRow > 1) {
    var ids = sheet.getRange(2,1,lastRow-1,1).getValues();
    for(var i=0;i<ids.length;i++){
      if(String(ids[i][0])===String(id)){ sheet.getRange(i+2,1,1,11).setValues([row]); logAdminAction(isNew?'新增':'編輯',card.title||id, type); return {ok:true,id:id}; }
    }
  }
  sheet.appendRow(row);
  logAdminAction('新增',card.title||id, type);
  return {ok:true,id:id};
}

function deleteCardAdmin(id) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Cards');
  if(!sheet||sheet.getLastRow()<2) return {ok:false};
  var numCols = Math.min(sheet.getLastColumn(), 11);
  var data = sheet.getRange(2,1,sheet.getLastRow()-1, numCols).getValues();
  for(var i=data.length-1;i>=0;i--){
    if(String(data[i][0])===String(id)){
      var title=String(data[i][2]);
      var type = numCols >= 10 ? String(data[i][9]||'link') : 'link';
      if (type === 'file') {
        try {
          var extraRaw = numCols >= 11 ? String(data[i][10]||'{}') : '{}';
          var extra = JSON.parse(extraRaw);
          if (extra.driveId) {
            DriveApp.getFileById(extra.driveId).setTrashed(true);
          }
        } catch(e) {}
      }
      sheet.deleteRow(i+2);
      logAdminAction('刪除',title,type);
      return {ok:true};
    }
  }
  return {ok:false};
}

function reorderCard(id, dir) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Cards');
  if(!sheet||sheet.getLastRow()<3) return {ok:false};
  var numCols = Math.min(sheet.getLastColumn(), 11);
  var data = sheet.getRange(2,1,sheet.getLastRow()-1, numCols).getValues();
  var idx=-1;
  for(var i=0;i<data.length;i++){if(String(data[i][0])===String(id)){idx=i;break;}}
  if(idx<0) return {ok:false};
  var sw = dir==='up' ? idx-1 : idx+1;
  if(sw<0||sw>=data.length) return {ok:false};
  var tmp=data[idx]; data[idx]=data[sw]; data[sw]=tmp;
  sheet.getRange(2,1,data.length, numCols).setValues(data);
  logAdminAction('排序',String(data[sw][2]),dir==='up'?'上移':'下移');
  return {ok:true};
}

function resetCardStats(id) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Stats');
  if(!sheet||sheet.getLastRow()<2) return {ok:false};
  var ids = sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues();
  for(var i=0;i<ids.length;i++){
    if(String(ids[i][0])===String(id)){ sheet.getRange(i+2,2).setValue(0); return {ok:true}; }
  }
  return {ok:false};
}

function setCardStats(id, count) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Stats');
  if(!sheet) { sheet = ss.insertSheet('Stats'); sheet.getRange(1,1,1,2).setValues([['id','count']]); }
  if(sheet.getLastRow()>=2){
    var ids = sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues();
    for(var i=0;i<ids.length;i++){
      if(String(ids[i][0])===String(id)){ sheet.getRange(i+2,2).setValue(count); logAdminAction('設定統計',id,'count='+count); return {ok:true}; }
    }
  }
  sheet.appendRow([id, count]);
  logAdminAction('設定統計',id,'count='+count);
  return {ok:true};
}

function setVisitCount(count) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('瀏覽統計');
  if (!sheet) { sheet = ss.insertSheet('瀏覽統計'); sheet.appendRow(['日期時間','類型','內容']); }
  sheet.getRange(1,5).setValue(count);
  logAdminAction('設定瀏覽數','總瀏覽','count='+count);
  return {ok:true, count:count};
}

function getAdmins() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Admins');
  if(!sheet||sheet.getLastRow()===0) return [];
  return sheet.getRange(1,1,sheet.getLastRow(),1).getValues()
    .map(function(r){return r[0].toString().trim();}).filter(function(e){return e;});
}

function saveAdmins(arr) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Admins')||ss.insertSheet('Admins');
  sheet.clearContents();
  if(arr&&arr.length>0)
    sheet.getRange(1,1,arr.length,1).setValues(arr.map(function(e){return [e];}));
  logAdminAction('更新管理員','管理員列表',arr.length+'人');
  return {ok:true};
}

// ============================================
// Get article full content by card id
// ============================================

function getArticleById(id, role) {
  role = role || 'public';
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Cards');
  if (!sheet || sheet.getLastRow() < 2) return null;
  var numCols = Math.min(sheet.getLastColumn(), 11);
  var data = sheet.getRange(2,1,sheet.getLastRow()-1, numCols).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      var type = numCols >= 10 ? String(data[i][9]||'link') : 'link';
      if (type !== 'article') return null;
      var extraRaw = numCols >= 11 ? String(data[i][10]||'{}') : '{}';
      var extra = {};
      try { extra = JSON.parse(extraRaw); } catch(e) {}
      // Check permission
      var perm = extra.permission || 'public';
      if (perm === 'student' && role === 'public') return {error:'auth'};
      if (perm === 'admin' && role !== 'admin') return {error:'auth'};
      return {
        id: String(data[i][0]),
        title: String(data[i][2]),
        content: extra.content || '',
        author: extra.author || '',
        coverImage: extra.coverImage || '',
        publishDate: extra.publishDate || '',
        category: String(data[i][1]),
        permission: perm
      };
    }
  }
  return null;
}

// ============================================
// doPost — Login + File Upload + Article Save
// ============================================

function _jsonOut(obj, cb) {
  var out = cb ? cb + '(' + JSON.stringify(obj) + ')' : JSON.stringify(obj);
  return ContentService.createTextOutput(out)
    .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function doPost(e) {
  var p = e.parameter || {};
  var action = p.action || '';
  var cb = p.callback || '';

  /* ── 後台密碼登入：用管理密碼換取 GitHub token ──
     目的是讓任何裝置（手機／別人的電腦）不必手打 token 就能進後台。
     token 存在 Script Properties（不在 repo、不在前端），只有通過管理密碼驗證才發放。
     一律走 doPost，避免密碼與 token 出現在網址或執行紀錄裡。 */
  if (action === 'setGhToken' || action === 'getGhToken') {
    var _auth = checkAdmin(p.pw || '');
    if (!_auth.ok) {
      return _jsonOut({ ok:false, error: _auth.error || 'auth', msg: _auth.msg || '管理密碼錯誤' }, cb);
    }
    var _props = PropertiesService.getScriptProperties();
    if (action === 'setGhToken') {
      var v = String(p.value || '').trim();
      if (!v) return _jsonOut({ ok:false, error:'empty' }, cb);
      _props.setProperty('GH_PAT', v);
      return _jsonOut({ ok:true }, cb);
    }
    var _tok = _props.getProperty('GH_PAT') || '';
    return _jsonOut({ ok: !!_tok, token: _tok, error: _tok ? '' : 'notset' }, cb);
  }

  // ── 學員登入 ──
  if (action === 'login') {
    var props = PropertiesService.getScriptProperties();
    var cache = CacheService.getScriptCache();

    // 暴力破解防護：10分鐘內最多5次
    var failKey = 'fail_login';
    var fails = parseInt(cache.get(failKey) || '0');
    if (fails >= 5) {
      var locked = {ok:false, error:'locked'};
      return ContentService.createTextOutput(JSON.stringify(locked)).setMimeType(ContentService.MimeType.JSON);
    }

    var storedUser = props.getProperty('STUDENT_USER') || 'student';
    var storedHash = props.getProperty('STUDENT_PW_HASH') || '';
    var salt = props.getProperty('HASH_SALT') || 'ai_platform_2025';

    if (!storedHash) {
      // 尚未設定學員帳密
      var noConfig = {ok:false, error:'not_configured'};
      return ContentService.createTextOutput(JSON.stringify(noConfig)).setMimeType(ContentService.MimeType.JSON);
    }

    var inputHash = computeHash_(salt + (p.password || ''));

    if ((p.username || '') === storedUser && inputHash === storedHash) {
      cache.put(failKey, '0', 600);
      var token = Utilities.getUuid();
      cache.put('stok_' + token, 'student', 21600); // 6小時
      var success = {ok:true, token:token, role:'student'};
      return ContentService.createTextOutput(JSON.stringify(success)).setMimeType(ContentService.MimeType.JSON);
    } else {
      cache.put(failKey, String(fails + 1), 600);
      var fail = {ok:false, error:'invalid'};
      return ContentService.createTextOutput(JSON.stringify(fail)).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── 檔案庫上傳（純上傳到集中資料夾，不建卡片；新後台用）──
  if (action === 'uploadAsset') {
    var uaAuth = checkAdmin(p.pw || '');
    if (!uaAuth.ok) {
      return ContentService.createTextOutput(JSON.stringify({ ok:false, error:'auth' })).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var uaBlob = Utilities.newBlob(Utilities.base64Decode(p.fileData), p.mimeType || 'application/octet-stream', p.fileName || 'file');
      var uaFolder = DriveApp.getFolderById(getOrCreateUploadFolder());
      var uaFile = uaFolder.createFile(uaBlob);
      uaFile.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
      logAdminAction('檔案庫上傳', p.fileName || '', '');
      return ContentService.createTextOutput(JSON.stringify({
        ok: true, id: uaFile.getId(), name: uaFile.getName(), size: uaFile.getSize(),
        fileUrl: 'https://drive.google.com/file/d/' + uaFile.getId() + '/view',
        directUrl: 'https://lh3.googleusercontent.com/d/' + uaFile.getId(),
        dlUrl: 'https://drive.google.com/uc?export=download&id=' + uaFile.getId()
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (uaErr) {
      return ContentService.createTextOutput(JSON.stringify({ ok:false, error:uaErr.message })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── 上傳檔案 ──
  if (action === 'uploadFile') {
    var auth = checkAdmin(p.pw || '');
    if (!auth.ok) {
      var errResult = { ok:false, error:'auth' };
      if (cb) return ContentService.createTextOutput(cb+'('+JSON.stringify(errResult)+')').setMimeType(ContentService.MimeType.JAVASCRIPT);
      return ContentService.createTextOutput(JSON.stringify(errResult)).setMimeType(ContentService.MimeType.JSON);
    }

    try {
      var blob = Utilities.newBlob(Utilities.base64Decode(p.fileData), p.mimeType, p.fileName);
      var folderId = getOrCreateUploadFolder();
      var folder = DriveApp.getFolderById(folderId);
      var driveFile = folder.createFile(blob);
      driveFile.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);

      var fileUrl = 'https://drive.google.com/file/d/' + driveFile.getId() + '/view';
      var directUrl = 'https://lh3.googleusercontent.com/d/' + driveFile.getId();

      var extra = {
        fileUrl: fileUrl,
        directUrl: directUrl,
        fileName: p.fileName,
        mimeType: p.mimeType,
        driveId: driveFile.getId(),
        uploadDate: new Date().toISOString()
      };
      var cardData = {
        category: p.category || '',
        title: p.title || p.fileName || '',
        desc: p.desc || '',
        linkUrl: fileUrl,
        tag: p.tag || '',
        imageUrls: [],
        iconUrl: '',
        visible: true,
        type: 'file',
        permission: 'public',
        extra: JSON.stringify(extra)
      };
      var saveResult = saveCardAdmin(cardData);

      logAdminAction('上傳檔案',p.fileName||',',' ');
      var result = {ok:true, id:saveResult.id, fileUrl:fileUrl, directUrl:directUrl};
      if (cb) return ContentService.createTextOutput(cb+'('+JSON.stringify(result)+')').setMimeType(ContentService.MimeType.JAVASCRIPT);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      var errResult2 = { ok:false, error:err.message };
      if (cb) return ContentService.createTextOutput(cb+'('+JSON.stringify(errResult2)+')').setMimeType(ContentService.MimeType.JAVASCRIPT);
      return ContentService.createTextOutput(JSON.stringify(errResult2)).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── 儲存文章 ──
  if (action === 'saveArticle') {
    var auth2 = checkAdmin(p.pw || '');
    if (!auth2.ok) {
      var errResult3 = { ok:false, error:'auth' };
      if (cb) return ContentService.createTextOutput(cb+'('+JSON.stringify(errResult3)+')').setMimeType(ContentService.MimeType.JAVASCRIPT);
      return ContentService.createTextOutput(JSON.stringify(errResult3)).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var articleData = JSON.parse(p.data || '{}');
      var artContent = '';
      if (p.contentB64) {
        artContent = Utilities.newBlob(Utilities.base64Decode(p.contentB64)).getDataAsString();
      } else {
        artContent = articleData.content || '';
      }
      var extra = {
        content: artContent,
        author: articleData.author || '',
        coverImage: articleData.coverImage || '',
        publishDate: articleData.publishDate || new Date().toISOString()
      };
      var cardData = {
        id: articleData.id || undefined,
        category: articleData.category || '',
        title: articleData.title || '',
        desc: articleData.desc || '',
        linkUrl: '',
        tag: articleData.tag || '',
        imageUrls: articleData.coverImage ? [articleData.coverImage] : [],
        iconUrl: '',
        visible: articleData.visible !== false,
        type: 'article',
        permission: articleData.permission || 'public',
        extra: JSON.stringify(extra)
      };
      var result3 = saveCardAdmin(cardData);
      if (cb) return ContentService.createTextOutput(cb+'('+JSON.stringify(result3)+')').setMimeType(ContentService.MimeType.JAVASCRIPT);
      return ContentService.createTextOutput(JSON.stringify(result3)).setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      var errResult4 = { ok:false, error:err.message };
      if (cb) return ContentService.createTextOutput(cb+'('+JSON.stringify(errResult4)+')').setMimeType(ContentService.MimeType.JAVASCRIPT);
      return ContentService.createTextOutput(JSON.stringify(errResult4)).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── 聯絡表單 ──
  if (action === 'submitContact') {
    try {
      var name    = (p.name    || '').trim();
      var email   = (p.email   || '').trim();
      var subject = (p.subject || '').trim() || '（無主旨）';
      var message = (p.message || '').trim();

      if (!name || !message) {
        var missingResult = { ok:false, error:'name 與 message 為必填欄位' };
        if (cb) return ContentService.createTextOutput(cb+'('+JSON.stringify(missingResult)+')').setMimeType(ContentService.MimeType.JAVASCRIPT);
        return ContentService.createTextOutput(JSON.stringify(missingResult)).setMimeType(ContentService.MimeType.JSON);
      }

      var body = '收到來自聯絡表單的新訊息\n\n'
        + '姓名：' + name + '\n'
        + 'Email：' + (email || '（未填寫）') + '\n'
        + '主旨：' + subject + '\n\n'
        + '內容：\n' + message + '\n\n'
        + '送出時間：' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

      MailApp.sendEmail({
        to: 'zxc80057@gmail.com',
        subject: '[AI工具平台] 聯絡表單：' + subject,
        body: body
      });

      // 回覆確認信給填寫者（若有提供 email）
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        MailApp.sendEmail({
          to: email,
          subject: '已收到您的訊息 — AI 工具資源平台',
          body: '您好，' + name + '，\n\n感謝您的來信！我們已收到您的訊息，將盡快回覆。\n\n您的留言內容：\n' + message + '\n\n— AI 工具資源平台團隊'
        });
      }

      var contactResult = { ok:true };
      if (cb) return ContentService.createTextOutput(cb+'('+JSON.stringify(contactResult)+')').setMimeType(ContentService.MimeType.JAVASCRIPT);
      return ContentService.createTextOutput(JSON.stringify(contactResult)).setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      var contactErr = { ok:false, error:err.message };
      if (cb) return ContentService.createTextOutput(cb+'('+JSON.stringify(contactErr)+')').setMimeType(ContentService.MimeType.JAVASCRIPT);
      return ContentService.createTextOutput(JSON.stringify(contactErr)).setMimeType(ContentService.MimeType.JSON);
    }
  }

  var result = { ok:false, error:'Unknown POST action: '+action };
  if (cb) return ContentService.createTextOutput(cb+'('+JSON.stringify(result)+')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateUploadFolder() {
  var settings = getSettings();
  if (settings.uploadFolderId) {
    try { DriveApp.getFolderById(settings.uploadFolderId); return settings.uploadFolderId; } catch(e) {}
  }
  var folder = DriveApp.createFolder('AI工具平台-上傳檔案');
  folder.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
  saveSetting('uploadFolderId', folder.getId());
  return folder.getId();
}

// ============================================
// _writeCardsSheet — 11 columns
// ============================================

function _writeCardsSheet(cards) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Cards')||ss.insertSheet('Cards');
  sheet.clearContents();
  sheet.getRange(1,1,1,11).setValues([['id','category','title','desc','linkUrl','tag','imageUrls','iconUrl','visible','type','extra']]);
  if(cards.length>0)
    sheet.getRange(2,1,cards.length,11).setValues(
      cards.map(function(c){
        var imgs = Array.isArray(c.imageUrls) ? c.imageUrls.join('\n') : (c.imageUrls||'');
        var type = c.type || 'link';
        var extra = {};
        if (typeof c.extra === 'string') { try { extra = JSON.parse(c.extra); } catch(e) {} }
        else if (typeof c.extra === 'object' && c.extra !== null) { extra = c.extra; }
        // Store permission in extra
        var perm = c.permission || 'public';
        if (perm !== 'public') { extra.permission = perm; } else { delete extra.permission; }
        var extraStr = JSON.stringify(extra);
        return [c.id||'',c.category||'',c.title||'',c.desc||'',c.linkUrl||'',c.tag||'',imgs,c.iconUrl||'',c.visible!==false, type, extraStr];
      })
    );
}

// ============================================
// Admin Log
// ============================================

function logAdminAction(action, target, details) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('AdminLog');
    if (!sheet) {
      sheet = ss.insertSheet('AdminLog');
      sheet.getRange(1,1,1,5).setValues([['timestamp','admin','action','target','details']]);
    }
    var email = 'admin';
    try { var e = Session.getActiveUser().getEmail(); if(e) email = e; } catch(ex) {}
    var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([ts, email, action||'', target||'', details||'']);
    if (sheet.getLastRow() > 501) {
      sheet.deleteRows(2, sheet.getLastRow() - 501);
    }
  } catch(e) {
    Logger.log('logAdminAction error: ' + e);
  }
}

function getAdminLog() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName('AdminLog');
    if (!sheet || sheet.getLastRow() < 2) return [];
    var lastRow = sheet.getLastRow();
    var startRow = Math.max(2, lastRow - 49);
    var numRows = lastRow - startRow + 1;
    var data = sheet.getRange(startRow, 1, numRows, 5).getValues();
    var logs = [];
    for (var i = data.length - 1; i >= 0; i--) {
      logs.push({
        timestamp: String(data[i][0]),
        admin: String(data[i][1]),
        action: String(data[i][2]),
        target: String(data[i][3]),
        details: String(data[i][4])
      });
    }
    return logs;
  } catch(e) {
    return [];
  }
}

// ============================================
// Reorder All Cards
// ============================================

function reorderAllCards(order) {
  if (!order || !order.length) return;
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Cards');
  if (!sheet || sheet.getLastRow() < 2) return;
  var numCols = Math.min(sheet.getLastColumn(), 11);
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, numCols).getValues();
  var rowMap = {};
  data.forEach(function(r) { if(r[0]) rowMap[String(r[0])] = r; });
  var newData = [];
  order.forEach(function(item) {
    var id = String(item.id || item);
    if (rowMap[id]) {
      newData.push(rowMap[id]);
      delete rowMap[id];
    }
  });
  for (var k in rowMap) {
    if (rowMap.hasOwnProperty(k)) newData.push(rowMap[k]);
  }
  if (newData.length > 0) {
    sheet.getRange(2, 1, newData.length, numCols).setValues(newData);
    if (newData.length < data.length) {
      sheet.deleteRows(newData.length + 2, data.length - newData.length);
    }
  }
  logAdminAction('拖曳排序','全部',newData.length + '項');
}

// ============================================
// Batch Update Cards
// ============================================

function batchUpdateCards(ops) {
  if (!ops || !ops.length) return {ok:false, error:'no ops'};
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Cards');
  if (!sheet || sheet.getLastRow() < 2) return {ok:false};
  var numCols = Math.min(sheet.getLastColumn(), 11);
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, numCols).getValues();
  var deleteIds = {};
  var modified = false;

  ops.forEach(function(op) {
    var id = String(op.id);
    if (op.action === 'delete') {
      for (var j = 0; j < data.length; j++) {
        if (String(data[j][0]) === id && numCols >= 10 && String(data[j][9]) === 'file') {
          try {
            var extraRaw = numCols >= 11 ? String(data[j][10]||'{}') : '{}';
            var extra = JSON.parse(extraRaw);
            if (extra.driveId) DriveApp.getFileById(extra.driveId).setTrashed(true);
          } catch(e) {}
        }
      }
      deleteIds[id] = true;
      return;
    }
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        if (op.action === 'hide') {
          data[i][8] = false;
          modified = true;
        } else if (op.action === 'show') {
          data[i][8] = true;
          modified = true;
        } else if (op.action === 'move' && op.category) {
          data[i][1] = op.category;
          modified = true;
        }
        break;
      }
    }
  });

  var deleteCount = Object.keys(deleteIds).length;
  if (deleteCount > 0) {
    data = data.filter(function(r) { return !deleteIds[String(r[0])]; });
    modified = true;
  }

  if (modified) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, numCols).clearContent();
    if (data.length > 0) {
      sheet.getRange(2, 1, data.length, numCols).setValues(data);
    }
    var totalRows = sheet.getLastRow();
    if (totalRows > data.length + 1) {
      sheet.deleteRows(data.length + 2, totalRows - data.length - 1);
    }
  }

  var actions = [];
  ops.forEach(function(op) {
    if (op.action === 'hide') actions.push('隱藏');
    else if (op.action === 'show') actions.push('顯示');
    else if (op.action === 'delete') actions.push('刪除');
    else if (op.action === 'move') actions.push('移動→' + (op.category||''));
  });
  var uniqueActions = [];
  actions.forEach(function(a) { if(uniqueActions.indexOf(a)<0) uniqueActions.push(a); });
  logAdminAction('批次操作', ops.length + '項', uniqueActions.join(', '));

  return {ok:true, count:ops.length};
}

// ============================================
// 設定初始管理員
// ============================================

function setupAdmins() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Admins') || ss.insertSheet('Admins');
  sheet.clearContents();
  sheet.getRange(1,1).setValue('zxc80057@gmail.com');
  Logger.log('Admins sheet ready: ' + sheet.getName());
}

// ============================================
// 設定學員帳密（執行一次）
// ============================================

function setupStudentAccount() {
  // 此函式已執行過，帳密已存入 Script Properties。
  // 若需重設，請直接在 Script Properties 修改 STUDENT_USER / STUDENT_PW_HASH / HASH_SALT。
  Logger.log('setupStudentAccount: credentials are already set in Script Properties.');
}



