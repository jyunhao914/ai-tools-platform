/* auth.js — 自 Code.js 拆出（GAS 全域共享，檔案僅作組織用） */

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
