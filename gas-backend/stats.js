/* stats.js — 自 Code.js 拆出（GAS 全域共享，檔案僅作組織用） */

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

function recordVisit() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('瀏覽統計');
  if (!sheet) {
    sheet = ss.insertSheet('瀏覽統計');
    sheet.appendRow(['日期時間', '類型', '內容']);
  }
  sheet.appendRow([new Date(), 'visit', 'page_view']);
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
