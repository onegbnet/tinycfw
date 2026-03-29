/**
 * URL Shortener — Cloudflare Worker + KV
 *
 * Single-file, zero-dependency. Paste into the CF dashboard editor.
 *
 * Setup:
 *   1. Workers KV → Create namespace (e.g. "URL_STORE")
 *   2. Worker Settings → KV Namespace Bindings → Variable name: DATA → select your namespace
 *   3. Worker Settings → Secrets → Add: KEY = <comma-separated API keys>
 *   4. (Optional) Add variable: TTL = default expiration in seconds (0=permanent, 60-31536000)
 *   5. (Optional) Add variable: BASE = short link base URL (e.g. https://s.mydomain.tld)
 *   6. (Optional) Add variable: DEFAULT = fallback redirect URL when slug not found
 */

const SLUG_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
const SLUG_MIN = 3;
const SLUG_MAX = 10;

const PW_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const PW_LEN = 16;

const DELAY_MAX = 60;
const DELAY_HTML_MAX = 2000;
const DELAY_TITLE_MAX = 128;

const TTL_MIN = 60;
const TTL_MAX = 31536000; // 12 months

function normalizeTtl(val, fallback) {
  const n = Math.floor(Number(val));
  if (n === 0) return 0;
  if (isNaN(n) || n < TTL_MIN || n > TTL_MAX) return fallback !== undefined ? fallback : 0;
  return n;
}

function makeSlug() {
  const len = SLUG_MIN + Math.floor(Math.random() * (SLUG_MAX - SLUG_MIN + 1));
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SLUG_CHARS[b % SLUG_CHARS.length]).join("");
}

function generatePassword() {
  const bytes = new Uint8Array(PW_LEN);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PW_CHARS[b % PW_CHARS.length]).join("");
}

async function hashPassword(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function esc(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function clean(obj) {
  var defaults = { countdown: 0, permanent: true, lightPage: true, ttl: 0, clicks: 0, redirectMode: "instant" };
  var result = {};
  for (var k in obj) {
    if (!obj.hasOwnProperty(k)) continue;
    var v = obj[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (defaults.hasOwnProperty(k) && v === defaults[k]) continue;
    result[k] = v;
  }
  return result;
}

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode('_cmp_'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(String(a || ''))),
    crypto.subtle.sign('HMAC', key, enc.encode(String(b || '')))
  ]);
  const ua = new Uint8Array(sa), ub = new Uint8Array(sb);
  let d = 0;
  for (let i = 0; i < ua.length; i++) d |= ua[i] ^ ub[i];
  return d === 0;
}


function isValidUrl(val) {
  if (!val || typeof val !== 'string') return false;
  try {
    const u = new URL(val);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(u.hostname)) return false;
    return true;
  } catch { return false; }
}

function getBaseUrl(env, requestUrl) {
  // 1. BASE env var (highest priority)
  if (env.BASE) {
    let base = env.BASE.trim();
    if (!base.endsWith('/')) base += '/';
    if (isValidUrl(base.replace(/\/$/, ''))) return base;
  }
  // 2. Non-workers.dev custom domain
  if (requestUrl.hostname && !requestUrl.hostname.endsWith('.workers.dev')) {
    return requestUrl.origin + '/';
  }
  // 3. Fallback to workers.dev
  return requestUrl.origin + '/';
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

async function checkAuth(req, env) {
  if (!env.KEY) return null;
  const auth = req.headers.get("Authorization") || "";
  const key = req.headers.get("X-API-Key") || (auth.startsWith("Bearer ") ? auth.slice(7) : "");
  if (!key) return json({ error: "UNAUTHORIZED" }, 401);
  const keys = String(env.KEY).split(",").map(k => k.trim()).filter(Boolean);
  for (const k of keys) {
    if (await safeEqual(key, k)) return null;
  }
  return json({ error: "UNAUTHORIZED" }, 401);
}

// ── i18n strings (shared by landing page & countdown page) ───────────

const I18N_JSON = JSON.stringify({
  en: {
    title: "URL Shortener",
    tabCreate: "✨ Create",
    tabModify: "✏️ Modify",
    slugLabelCreate: "Custom slug", omittableText: "(leave empty for default)",
    slugLabelModify: "Slug to modify",
    slugPlaceholderCreate: "leave empty for random",
    slugPlaceholderModify: "enter existing slug",
    slugHint: "3-10 alphanumeric characters (case-sensitive).",
    check: "Verify & Query",
    targetUrl: "Target URL",
    slugPassword: "Slug Password",
    pwPlaceholder: "password from when you created it",
    pwHint: "Enter the password shown when you first created this slug.",
    ttlOptions: "Expiration",
    ttlLabel: "Time to live",
    ttlHint: "0 = permanent. Min 60 seconds, max 12 months. Invalid input such as negative numbers or decimals will be ignored.",
    ttlUnit_s: "Seconds",
    ttlUnit_m: "Minutes",
    ttlUnit_h: "Hours",
    ttlUnit_d: "Days",
    ttlUnit_mo: "Months",
    redirectOptions: "Redirect options",
    countdownLabel: "Countdown seconds",
    countdownHint: "0 = manual redirect (disables countdown). 1–60 = show countdown. Other input treated as 0.",
    rdInstant: "Instant redirect",
    rdManual: "Manual or countdown redirect",
    usePermanent: "Use permanent redirect",
    manualBtnLabel: "Manual redirect button title (leave empty for default)",
    manualBtnPlaceholder: "default: Redirect now",
    manualBtnDefault: "Redirect now", lightPage: "Use light background",
    redirectPageTitleLabel: "Redirect page title (leave empty for default)",
    redirectPageTitlePlaceholder: "default: Destination URL {url}",
    redirectPageContentLabel: "Redirect page content (leave empty for default)",
    redirectPageContentPlaceholder: "Compose content...",
    redirectPageContentHint: "Markdown supported. Leave empty to show linked target URL.",
    mode_rich: "Rich", mode_md: "MD",
    apiKey: "Identity Key",
    resetPassword: "Renew slug password",
    btnCreate: "Create",
    btnUpdate: "Update", btnDelete: "Delete", confirmDeleteMsg: "Delete this short link?", confirmYes: "Delete", confirmNo: "Cancel",
    created: "✅ Created",
    updated: "♻️ Updated",
    pwBoxLabel: "🔑 Modification password:",
    pwBoxWarn: "Save this now! It will never be shown again.",
    errUrl: "URL is required", errUrlInvalid: "Invalid URL",
    errSlug: "Slug is required",
    errPw: "Password is required",
    errNet: "Network error",
    errSlugEmpty: "Enter a slug first",
    errSlugInvalid: "Invalid: 3-10 alphanumeric chars only",
    slugFound: "Verified",
    slugNotFound: "Slug not found",
    slugAuthFail: "Check your identity key",
    defaultRedirectTitle: "Destination URL {url}",
    err_UNAUTHORIZED: "Unauthorized \u2013 check your identity key",
    err_INVALID_JSON: "Invalid request",
    err_INVALID_URL: "Invalid URL",
    err_INVALID_SLUG: "Invalid slug format",
    err_SLUG_EXISTS: "This slug already exists \u2013 use Modify mode with the password",
   
    err_SLUG_COLLISION: "Failed to generate slug, please try again",
    err_NOT_FOUND: "Not found", err_VERIFY_FAILED: "Slug not found or wrong password",
    err_INVALID_REDIRECT_MODE: "Invalid redirect mode",
    tb_bold: "Bold", tb_italic: "Italic", tb_underline: "Underline", tb_h1: "Heading 1", tb_h2: "Heading 2", tb_h3: "Heading 3", tb_ul: "Bullet list", tb_ol: "Numbered list", tb_blockquote: "Blockquote", tb_code: "Inline code", tb_link: "Insert link", tb_hr: "Horizontal rule",
  },
  "zh-cn": {
    title: "短链接服务",
    tabCreate: "✨ 创建",
    tabModify: "✏️ 修改",
    slugLabelCreate: "自定义短码", omittableText: "（可留空）",
    slugLabelModify: "要修改的短码",
    slugPlaceholderCreate: "留空自动生成",
    slugPlaceholderModify: "输入已有短码",
    slugHint: "3-10 位字母和数字组合（区分大小写）。",
    check: "验证并查询",
    targetUrl: "目标网址",
    slugPassword: "短码密码",
    pwPlaceholder: "创建时显示的密码",
    pwHint: "输入创建该短码时显示的密码。",
    ttlOptions: "有效时长",
    ttlLabel: "有效时长",
    ttlHint: "0 = 永久有效。最小 60 秒，最长 12 个月。输入无效值或负数、小数等非法值将被忽略。",
    ttlUnit_s: "秒",
    ttlUnit_m: "分钟",
    ttlUnit_h: "小时",
    ttlUnit_d: "天",
    ttlUnit_mo: "月",
    redirectOptions: "跳转选项",
    countdownLabel: "倒计数秒数",
    countdownHint: "0 = 手动跳转（禁用倒计时）。1–60 = 显示倒计时。其他输入视为 0。",
    rdInstant: "立即跳转",
    rdManual: "手动或倒计时跳转",
    usePermanent: "使用永久跳转",
    manualBtnLabel: "手动跳转按钮标题（可留空）",
    manualBtnPlaceholder: "默认：立即跳转",
    manualBtnDefault: "立即跳转", lightPage: "使用亮色背景",
    redirectPageTitleLabel: "跳转页面标题（可留空）",
    redirectPageTitlePlaceholder: "默认：目标网址 {url}",
    redirectPageContentLabel: "跳转页面内容（可留空）",
    redirectPageContentPlaceholder: "编写内容...",
    redirectPageContentHint: "支持 Markdown 格式。留空显示带链接的目标网址。",
    mode_rich: "富文本", mode_md: "MD",
    apiKey: "身份密钥",
    resetPassword: "更换当前短链密码",
    btnCreate: "生成",
    btnUpdate: "更新", btnDelete: "删除", confirmDeleteMsg: "确定删除该短链接？", confirmYes: "删除", confirmNo: "取消",
    created: "✅ 已创建",
    updated: "♻️ 已更新",
    pwBoxLabel: "🔑 修改密码：",
    pwBoxWarn: "请立即保存！此密码仅显示一次。",
    errUrl: "请输入网址", errUrlInvalid: "网址格式无效",
    errSlug: "请输入短码",
    errPw: "请输入密码",
    errNet: "网络错误",
    errSlugEmpty: "请先输入短码",
    errSlugInvalid: "无效：仅限 3-10 位字母数字",
    slugFound: "验证通过",
    slugNotFound: "短码不存在",
    slugAuthFail: "请检查身份密钥",
    defaultRedirectTitle: "目标网址 {url}",
    err_UNAUTHORIZED: "未授权 – 请检查身份密钥",
    err_INVALID_JSON: "请求无效",
    err_INVALID_URL: "网址格式无效",
    err_INVALID_SLUG: "短码格式无效",
    err_SLUG_EXISTS: "该短码已存在 – 请切换到修改模式并输入密码",
   
    err_SLUG_COLLISION: "短码生成失败，请重试",
    err_NOT_FOUND: "未找到", err_VERIFY_FAILED: "短码不存在，或密码错误",
    err_INVALID_REDIRECT_MODE: "无效的跳转模式",
    tb_bold: "加粗", tb_italic: "斜体", tb_underline: "下划线", tb_h1: "标题 1", tb_h2: "标题 2", tb_h3: "标题 3", tb_ul: "无序列表", tb_ol: "有序列表", tb_blockquote: "引用", tb_code: "行内代码", tb_link: "插入链接", tb_hr: "水平线",
  },
  "zh-tw": {
    title: "短連結服務",
    tabCreate: "✨ 建立",
    tabModify: "✏️ 修改",
    slugLabelCreate: "自訂短碼", omittableText: "（可留空）",
    slugLabelModify: "要修改的短碼",
    slugPlaceholderCreate: "留空自動產生",
    slugPlaceholderModify: "輸入現有短碼",
    slugHint: "3-10 位字母和數字組合（區分大小寫）。",
    check: "驗證並查詢",
    targetUrl: "目標網址",
    slugPassword: "短碼密碼",
    pwPlaceholder: "建立時顯示的密碼",
    pwHint: "輸入建立該短碼時顯示的密碼。",
    ttlOptions: "有效時長",
    ttlLabel: "有效時長",
    ttlHint: "0 = 永久有效。最小 60 秒，最長 12 個月。輸入無效值或負數、小數等非法值將被忽略。",
    ttlUnit_s: "秒",
    ttlUnit_m: "分鐘",
    ttlUnit_h: "小時",
    ttlUnit_d: "天",
    ttlUnit_mo: "月",
    redirectOptions: "跳轉選項",
    countdownLabel: "倒數秒數",
    countdownHint: "0 = 手動跳轉（禁用倒數）。1–60 = 顯示倒數。其他輸入視為 0。",
    rdInstant: "立即跳轉",
    rdManual: "手動或倒數跳轉",
    usePermanent: "使用永久跳轉",
    manualBtnLabel: "手動跳轉按鈕標題（可留空）",
    manualBtnPlaceholder: "預設：立即跳轉",
    manualBtnDefault: "立即跳轉", lightPage: "使用亮色背景",
    redirectPageTitleLabel: "跳轉頁面標題（可留空）",
    redirectPageTitlePlaceholder: "預設：目標網址 {url}",
    redirectPageContentLabel: "跳轉頁面內容（可留空）",
    redirectPageContentPlaceholder: "編寫內容...",
    redirectPageContentHint: "支援 Markdown 格式。留空顯示帶連結的目標網址。",
    mode_rich: "富文字", mode_md: "MD",
    apiKey: "身分金鑰",
    resetPassword: "更換目前短連結密碼",
    btnCreate: "產生",
    btnUpdate: "更新", btnDelete: "刪除", confirmDeleteMsg: "確定刪除該短連結？", confirmYes: "刪除", confirmNo: "取消",
    created: "✅ 已建立",
    updated: "♻️ 已更新",
    pwBoxLabel: "🔑 修改密碼：",
    pwBoxWarn: "請立即儲存！此密碼僅顯示一次。",
    errUrl: "請輸入網址", errUrlInvalid: "網址格式無效",
    errSlug: "請輸入短碼",
    errPw: "請輸入密碼",
    errNet: "網路錯誤",
    errSlugEmpty: "請先輸入短碼",
    errSlugInvalid: "無效：僅限 3-10 位英數字元",
    slugFound: "驗證通過",
    slugNotFound: "短碼不存在",
    slugAuthFail: "請檢查身分金鑰",
    defaultRedirectTitle: "目標網址 {url}",
    err_UNAUTHORIZED: "未授權 – 請檢查身分金鑰",
    err_INVALID_JSON: "請求無效",
    err_INVALID_URL: "網址格式無效",
    err_INVALID_SLUG: "短碼格式無效",
    err_SLUG_EXISTS: "該短碼已存在 – 請切換到修改模式並輸入密碼",
    err_SLUG_COLLISION: "短碼產生失敗，請重試",
    err_NOT_FOUND: "未找到", err_VERIFY_FAILED: "短碼不存在，或密碼錯誤",
    err_INVALID_REDIRECT_MODE: "無效的跳轉模式",
    tb_bold: "粗體", tb_italic: "斜體", tb_underline: "底線", tb_h1: "標題 1", tb_h2: "標題 2", tb_h3: "標題 3", tb_ul: "無序清單", tb_ol: "有序清單", tb_blockquote: "引用", tb_code: "行內程式碼", tb_link: "插入連結", tb_hr: "水平線",
  },
  ja: {
    title: "URL短縮サービス",
    tabCreate: "✨ 作成",
    tabModify: "✏️ 変更",
    slugLabelCreate: "カスタムスラッグ", omittableText: "（空欄可）",
    slugLabelModify: "変更するスラッグ",
    slugPlaceholderCreate: "空欄で自動生成",
    slugPlaceholderModify: "既存のスラッグを入力",
    slugHint: "3〜10文字の英数字（大文字・小文字区別あり）。",
    check: "認証して照会",
    targetUrl: "転送先URL",
    slugPassword: "スラッグパスワード",
    pwPlaceholder: "作成時に表示されたパスワード",
    pwHint: "作成時に表示されたパスワードを入力してください。",
    ttlOptions: "有効期限",
    ttlLabel: "有効期間",
    ttlHint: "0 = 無期限。最小60秒、最大12ヶ月。無効な値や負数・小数などは無視されます。",
    ttlUnit_s: "秒",
    ttlUnit_m: "分",
    ttlUnit_h: "時間",
    ttlUnit_d: "日",
    ttlUnit_mo: "ヶ月",
    redirectOptions: "リダイレクト設定",
    countdownLabel: "カウントダウン秒数",
    countdownHint: "0 = 手動リダイレクト（カウントダウン無効）。1〜60 = カウントダウン表示。その他の入力は 0 扱い。",
    rdInstant: "即座リダイレクト",
    rdManual: "手動またはカウントダウンリダイレクト",
    usePermanent: "恒久リダイレクトを使用",
    manualBtnLabel: "手動リダイレクトボタンのタイトル（空欄可）",
    manualBtnPlaceholder: "デフォルト：今すぐ移動",
    manualBtnDefault: "今すぐ移動", lightPage: "明るい背景を使用",
    redirectPageTitleLabel: "リダイレクトページのタイトル（空欄可）",
    redirectPageTitlePlaceholder: "デフォルト：転送先URL {url}",
    redirectPageContentLabel: "リダイレクトページの内容（空欄可）",
    redirectPageContentPlaceholder: "内容を入力...",
    redirectPageContentHint: "Markdown対応。空欄の場合はリンク付きURLを表示。",
    mode_rich: "リッチ", mode_md: "MD",
    apiKey: "認証キー",
    resetPassword: "スラッグパスワードを更新",
    btnCreate: "短縮",
    btnUpdate: "更新", btnDelete: "削除", confirmDeleteMsg: "この短縮リンクを削除しますか？", confirmYes: "削除", confirmNo: "キャンセル",
    created: "✅ 作成完了",
    updated: "♻️ 更新完了",
    pwBoxLabel: "🔑 変更用パスワード：",
    pwBoxWarn: "今すぐ保存してください！二度と表示されません。",
    errUrl: "URLを入力してください", errUrlInvalid: "無効なURL",
    errSlug: "スラッグを入力してください",
    errPw: "パスワードを入力してください",
    errNet: "ネットワークエラー",
    errSlugEmpty: "先にスラッグを入力してください",
    errSlugInvalid: "無効：英数字3〜10文字のみ",
    slugFound: "確認済み",
    slugNotFound: "スラッグが見つかりません",
    slugAuthFail: "認証キーを確認してください",
    defaultRedirectTitle: "転送先URL {url}",
    err_UNAUTHORIZED: "認証エラー – 認証キーを確認してください",
    err_INVALID_JSON: "無効なリクエスト",
    err_INVALID_URL: "無効なURL",
    err_INVALID_SLUG: "無効なスラッグ形式",
    err_SLUG_EXISTS: "このスラッグは既に存在します – 変更モードでパスワードを入力してください",
   
    err_SLUG_COLLISION: "スラッグ生成に失敗しました。再試行してください",
    err_NOT_FOUND: "見つかりません", err_VERIFY_FAILED: "スラッグが見つからないか、パスワードが違います",
    err_INVALID_REDIRECT_MODE: "無効なリダイレクトモード",
    tb_bold: "太字", tb_italic: "斜体", tb_underline: "下線", tb_h1: "見出し 1", tb_h2: "見出し 2", tb_h3: "見出し 3", tb_ul: "箇条書き", tb_ol: "番号付きリスト", tb_blockquote: "引用", tb_code: "インラインコード", tb_link: "リンクを挿入", tb_hr: "水平線",
  },
  ko: {
    title: "URL 단축 서비스",
    tabCreate: "✨ 만들기",
    tabModify: "✏️ 수정",
    slugLabelCreate: "사용자 정의 슬러그", omittableText: "(비워두기 가능)",
    slugLabelModify: "수정할 슬러그",
    slugPlaceholderCreate: "비워두면 자동 생성",
    slugPlaceholderModify: "기존 슬러그 입력",
    slugHint: "3-10자 영숫자 조합 (대소문자 구분).",
    check: "인증 및 조회",
    targetUrl: "대상 URL",
    slugPassword: "슬러그 비밀번호",
    pwPlaceholder: "생성 시 표시된 비밀번호",
    pwHint: "슬러그 생성 시 표시된 비밀번호를 입력하세요.",
    ttlOptions: "유효 기간",
    ttlLabel: "유효 기간",
    ttlHint: "0 = 영구. 최소 60초, 최대 12개월. 잘못된 값이나 음수, 소수 등은 무시됩니다.",
    ttlUnit_s: "초",
    ttlUnit_m: "분",
    ttlUnit_h: "시간",
    ttlUnit_d: "일",
    ttlUnit_mo: "개월",
    redirectOptions: "리다이렉트 옵션",
    countdownLabel: "카운트다운 초",
    countdownHint: "0 = 수동 리다이렉트(카운트다운 비활성화). 1-60 = 카운트다운 표시. 기타 입력은 0으로 처리.",
    rdInstant: "즉시 리다이렉트",
    rdManual: "수동 또는 카운트다운 리다이렉트",
    usePermanent: "영구 리다이렉트 사용",
    manualBtnLabel: "수동 리다이렉트 버튼 제목 (비워두기 가능)",
    manualBtnPlaceholder: "기본: 지금 이동",
    manualBtnDefault: "지금 이동", lightPage: "밝은 배경 사용",
    redirectPageTitleLabel: "리다이렉트 페이지 제목 (비워두기 가능)",
    redirectPageTitlePlaceholder: "기본: 대상 URL {url}",
    redirectPageContentLabel: "리다이렉트 페이지 내용 (비워두기 가능)",
    redirectPageContentPlaceholder: "내용 작성...",
    redirectPageContentHint: "Markdown 지원. 비워두면 링크된 대상 URL 표시.",
    mode_rich: "서식", mode_md: "MD",
    apiKey: "인증 키",
    resetPassword: "슬러그 비밀번호 갱신",
    btnCreate: "단축",
    btnUpdate: "업데이트", btnDelete: "삭제", confirmDeleteMsg: "이 단축 링크를 삭제하시겠습니까?", confirmYes: "삭제", confirmNo: "취소",
    created: "✅ 생성됨",
    updated: "♻️ 업데이트됨",
    pwBoxLabel: "🔑 수정 비밀번호:",
    pwBoxWarn: "지금 저장하세요! 다시 표시되지 않습니다.",
    errUrl: "URL이 필요합니다", errUrlInvalid: "잘못된 URL",
    errSlug: "슬러그가 필요합니다",
    errPw: "비밀번호가 필요합니다",
    errNet: "네트워크 오류",
    errSlugEmpty: "먼저 슬러그를 입력하세요",
    errSlugInvalid: "유효하지 않음: 영숫자 3-10자만",
    slugFound: "확인됨",
    slugNotFound: "슬러그를 찾을 수 없음",
    slugAuthFail: "인증 키를 확인하세요",
    defaultRedirectTitle: "대상 URL {url}",
    err_UNAUTHORIZED: "인증 실패 – 인증 키를 확인하세요",
    err_INVALID_JSON: "잘못된 요청",
    err_INVALID_URL: "잘못된 URL",
    err_INVALID_SLUG: "잘못된 슬러그 형식",
    err_SLUG_EXISTS: "이 슬러그는 이미 존재합니다 – 수정 모드에서 비밀번호를 입력하세요",
   
    err_SLUG_COLLISION: "슬러그 생성 실패, 다시 시도하세요",
    err_NOT_FOUND: "찾을 수 없음", err_VERIFY_FAILED: "슬러그를 찾을 수 없거나 비밀번호가 틀렸습니다",
    err_INVALID_REDIRECT_MODE: "잘못된 리다이렉트 모드",
    tb_bold: "굵게", tb_italic: "기울임", tb_underline: "밑줄", tb_h1: "제목 1", tb_h2: "제목 2", tb_h3: "제목 3", tb_ul: "글머리 기호", tb_ol: "번호 목록", tb_blockquote: "인용", tb_code: "인라인 코드", tb_link: "링크 삽입", tb_hr: "구분선",
  },
  ms: {
    title: "Pemendek URL",
    tabCreate: "✨ Cipta",
    tabModify: "✏️ Ubah",
    slugLabelCreate: "Slug tersuai", omittableText: "(boleh dikosongkan)",
    slugLabelModify: "Slug untuk diubah",
    slugPlaceholderCreate: "kosongkan untuk rawak",
    slugPlaceholderModify: "masukkan slug sedia ada",
    slugHint: "3-10 aksara alfanumerik (sensitif huruf besar/kecil).",
    check: "Sahkan & Semak",
    targetUrl: "URL Sasaran",
    slugPassword: "Kata laluan slug",
    pwPlaceholder: "kata laluan semasa dicipta",
    pwHint: "Masukkan kata laluan yang dipaparkan semasa slug ini dicipta.",
    ttlOptions: "Tempoh sah",
    ttlLabel: "Tempoh sah",
    ttlHint: "0 = kekal. Min 60 saat, maks 12 bulan. Nilai tidak sah seperti nombor negatif atau perpuluhan akan diabaikan.",
    ttlUnit_s: "Saat",
    ttlUnit_m: "Minit",
    ttlUnit_h: "Jam",
    ttlUnit_d: "Hari",
    ttlUnit_mo: "Bulan",
    redirectOptions: "Pilihan pengalihan",
    countdownLabel: "Saat undur detik",
    countdownHint: "0 = pengalihan manual (nyahaktif undur detik). 1-60 = papar undur detik. Input lain dianggap 0.",
    rdInstant: "Pengalihan serta-merta",
    rdManual: "Pengalihan manual atau undur detik",
    usePermanent: "Gunakan pengalihan kekal",
    manualBtnLabel: "Tajuk butang pengalihan manual (boleh dikosongkan)",
    manualBtnPlaceholder: "lalai: Alih sekarang",
    manualBtnDefault: "Alih sekarang", lightPage: "Gunakan latar terang",
    redirectPageTitleLabel: "Tajuk halaman pengalihan (boleh dikosongkan)",
    redirectPageTitlePlaceholder: "lalai: URL sasaran {url}",
    redirectPageContentLabel: "Kandungan halaman pengalihan (boleh dikosongkan)",
    redirectPageContentPlaceholder: "Tulis kandungan...",
    redirectPageContentHint: "Sokongan Markdown. Kosongkan untuk papar URL sasaran berpautan.",
    mode_rich: "Kaya", mode_md: "MD",
    apiKey: "Kunci Identiti",
    resetPassword: "Baharu kata laluan slug",
    btnCreate: "Pendekkan",
    btnUpdate: "Kemas kini", btnDelete: "Padam", confirmDeleteMsg: "Padam pautan pendek ini?", confirmYes: "Padam", confirmNo: "Batal",
    created: "✅ Dicipta",
    updated: "♻️ Dikemas kini",
    pwBoxLabel: "🔑 Kata laluan ubah suai:",
    pwBoxWarn: "Simpan sekarang! Tidak akan dipaparkan lagi.",
    errUrl: "URL diperlukan", errUrlInvalid: "URL tidak sah",
    errSlug: "Slug diperlukan",
    errPw: "Kata laluan diperlukan",
    errNet: "Ralat rangkaian",
    errSlugEmpty: "Masukkan slug dahulu",
    errSlugInvalid: "Tidak sah: 3-10 aksara alfanumerik sahaja",
    slugFound: "Disahkan",
    slugNotFound: "Slug tidak ditemui",
    slugAuthFail: "Semak kunci identiti anda",
    defaultRedirectTitle: "URL sasaran {url}",
    err_UNAUTHORIZED: "Tidak dibenarkan – semak kunci identiti anda",
    err_INVALID_JSON: "Permintaan tidak sah",
    err_INVALID_URL: "URL tidak sah",
    err_INVALID_SLUG: "Format slug tidak sah",
    err_SLUG_EXISTS: "Slug ini sudah wujud – gunakan mod Ubah dengan kata laluan",
   
    err_SLUG_COLLISION: "Gagal menjana slug, sila cuba lagi",
    err_NOT_FOUND: "Tidak ditemui", err_VERIFY_FAILED: "Slug tidak ditemui atau kata laluan salah",
    err_INVALID_REDIRECT_MODE: "Mod pengalihan tidak sah",
    tb_bold: "Tebal", tb_italic: "Condong", tb_underline: "Garis bawah", tb_h1: "Tajuk 1", tb_h2: "Tajuk 2", tb_h3: "Tajuk 3", tb_ul: "Senarai titik", tb_ol: "Senarai bernombor", tb_blockquote: "Petikan", tb_code: "Kod sebaris", tb_link: "Sisip pautan", tb_hr: "Garisan mendatar",
  },
  vi: {
    title: "Rút gọn URL",
    tabCreate: "✨ Tạo",
    tabModify: "✏️ Sửa",
    slugLabelCreate: "Slug tùy chỉnh", omittableText: "(có thể để trống)",
    slugLabelModify: "Slug cần sửa",
    slugPlaceholderCreate: "để trống để tạo ngẫu nhiên",
    slugPlaceholderModify: "nhập slug hiện có",
    slugHint: "3-10 ký tự chữ-số (phân biệt hoa thường).",
    check: "Xác minh & Truy vấn",
    targetUrl: "URL đích",
    slugPassword: "Mật khẩu slug",
    pwPlaceholder: "mật khẩu khi tạo",
    pwHint: "Nhập mật khẩu được hiển thị khi bạn tạo slug này.",
    ttlOptions: "Thời hạn",
    ttlLabel: "Thời gian hiệu lực",
    ttlHint: "0 = vĩnh viễn. Tối thiểu 60 giây, tối đa 12 tháng. Giá trị không hợp lệ như số âm, số thập phân sẽ bị bỏ qua.",
    ttlUnit_s: "Giây",
    ttlUnit_m: "Phút",
    ttlUnit_h: "Giờ",
    ttlUnit_d: "Ngày",
    ttlUnit_mo: "Tháng",
    redirectOptions: "Tùy chọn chuyển hướng",
    countdownLabel: "Giây đếm ngược",
    countdownHint: "0 = chuyển hướng thủ công (tắt đếm ngược). 1-60 = hiện đếm ngược. Đầu vào khác coi là 0.",
    rdInstant: "Chuyển hướng ngay",
    rdManual: "Chuyển hướng thủ công hoặc đếm ngược",
    usePermanent: "Dùng chuyển hướng vĩnh viễn",
    manualBtnLabel: "Tiêu đề nút chuyển hướng thủ công (có thể để trống)",
    manualBtnPlaceholder: "mặc định: Chuyển ngay",
    manualBtnDefault: "Chuyển ngay", lightPage: "Dùng nền sáng",
    redirectPageTitleLabel: "Tiêu đề trang chuyển hướng (có thể để trống)",
    redirectPageTitlePlaceholder: "mặc định: URL đích {url}",
    redirectPageContentLabel: "Nội dung trang chuyển hướng (có thể để trống)",
    redirectPageContentPlaceholder: "Soạn nội dung...",
    redirectPageContentHint: "Hỗ trợ Markdown. Để trống sẽ hiện URL đích có liên kết.",
    mode_rich: "Định dạng", mode_md: "MD",
    apiKey: "Khóa xác thực",
    resetPassword: "Đổi mật khẩu slug",
    btnCreate: "Rút gọn",
    btnUpdate: "Cập nhật", btnDelete: "Xóa", confirmDeleteMsg: "Xóa liên kết ngắn này?", confirmYes: "Xóa", confirmNo: "Hủy",
    created: "✅ Đã tạo",
    updated: "♻️ Đã cập nhật",
    pwBoxLabel: "🔑 Mật khẩu sửa đổi:",
    pwBoxWarn: "Lưu ngay! Sẽ không hiển thị lại.",
    errUrl: "Cần URL", errUrlInvalid: "URL không hợp lệ",
    errSlug: "Cần slug",
    errPw: "Cần mật khẩu",
    errNet: "Lỗi mạng",
    errSlugEmpty: "Nhập slug trước",
    errSlugInvalid: "Không hợp lệ: chỉ 3-10 ký tự chữ-số",
    slugFound: "Đã xác minh",
    slugNotFound: "Không tìm thấy slug",
    slugAuthFail: "Kiểm tra khóa xác thực",
    defaultRedirectTitle: "URL đích {url}",
    err_UNAUTHORIZED: "Không được phép – kiểm tra khóa xác thực",
    err_INVALID_JSON: "Yêu cầu không hợp lệ",
    err_INVALID_URL: "URL không hợp lệ",
    err_INVALID_SLUG: "Định dạng slug không hợp lệ",
    err_SLUG_EXISTS: "Slug này đã tồn tại – chuyển sang chế độ Sửa và nhập mật khẩu",
   
    err_SLUG_COLLISION: "Tạo slug thất bại, vui lòng thử lại",
    err_NOT_FOUND: "Không tìm thấy", err_VERIFY_FAILED: "Không tìm thấy slug hoặc sai mật khẩu",
    err_INVALID_REDIRECT_MODE: "Chế độ chuyển hướng không hợp lệ",
    tb_bold: "Đậm", tb_italic: "Nghiêng", tb_underline: "Gạch chân", tb_h1: "Tiêu đề 1", tb_h2: "Tiêu đề 2", tb_h3: "Tiêu đề 3", tb_ul: "Danh sách", tb_ol: "Danh sách số", tb_blockquote: "Trích dẫn", tb_code: "Mã nội dòng", tb_link: "Chèn liên kết", tb_hr: "Đường kẻ ngang",
  },
  th: {
    title: "บริการย่อลิงก์",
    tabCreate: "✨ สร้าง",
    tabModify: "✏️ แก้ไข",
    slugLabelCreate: "slug กำหนดเอง", omittableText: "(เว้นว่างได้)",
    slugLabelModify: "slug ที่ต้องการแก้ไข",
    slugPlaceholderCreate: "เว้นว่างเพื่อสุ่ม",
    slugPlaceholderModify: "ใส่ slug ที่มีอยู่",
    slugHint: "3-10 ตัวอักษรและตัวเลข (แยกตัวพิมพ์ใหญ่-เล็ก)",
    check: "ยืนยันและสอบถาม",
    targetUrl: "URL ปลายทาง",
    slugPassword: "รหัสผ่าน slug",
    pwPlaceholder: "รหัสผ่านที่แสดงตอนสร้าง",
    pwHint: "ใส่รหัสผ่านที่แสดงเมื่อคุณสร้าง slug นี้",
    ttlOptions: "ระยะเวลาใช้งาน",
    ttlLabel: "ระยะเวลาใช้งาน",
    ttlHint: "0 = ถาวร ขั้นต่ำ 60 วินาที สูงสุด 12 เดือน ค่าที่ไม่ถูกต้อง เช่น ค่าลบ ทศนิยม จะถูกละเว้น",
    ttlUnit_s: "วินาที",
    ttlUnit_m: "นาที",
    ttlUnit_h: "ชั่วโมง",
    ttlUnit_d: "วัน",
    ttlUnit_mo: "เดือน",
    redirectOptions: "ตั้งค่าการเปลี่ยนเส้นทาง",
    countdownLabel: "วินาทีนับถอยหลัง",
    countdownHint: "0 = เปลี่ยนเส้นทางแบบกดเอง (ปิดนับถอยหลัง) 1-60 = แสดงนับถอยหลัง ค่าอื่นถือว่า 0",
    rdInstant: "เปลี่ยนเส้นทางทันที",
    rdManual: "เปลี่ยนเส้นทางแบบกดเองหรือนับถอยหลัง",
    usePermanent: "ใช้การเปลี่ยนเส้นทางถาวร",
    manualBtnLabel: "ชื่อปุ่มเปลี่ยนเส้นทาง (เว้นว่างได้)",
    manualBtnPlaceholder: "ค่าเริ่มต้น: ไปเลย",
    manualBtnDefault: "ไปเลย", lightPage: "ใช้พื้นหลังสว่าง",
    redirectPageTitleLabel: "ชื่อหน้าเปลี่ยนเส้นทาง (เว้นว่างได้)",
    redirectPageTitlePlaceholder: "ค่าเริ่มต้น: URL ปลายทาง {url}",
    redirectPageContentLabel: "เนื้อหาหน้าเปลี่ยนเส้นทาง (เว้นว่างได้)",
    redirectPageContentPlaceholder: "เขียนเนื้อหา...",
    redirectPageContentHint: "รองรับ Markdown เว้นว่างจะแสดง URL ปลายทางเป็นลิงก์",
    mode_rich: "ริช", mode_md: "MD",
    apiKey: "คีย์ยืนยันตัวตน",
    resetPassword: "เปลี่ยนรหัสผ่าน slug",
    btnCreate: "ย่อลิงก์",
    btnUpdate: "อัปเดต", btnDelete: "ลบ", confirmDeleteMsg: "ลบลิงก์สั้นนี้?", confirmYes: "ลบ", confirmNo: "ยกเลิก",
    created: "✅ สร้างแล้ว",
    updated: "♻️ อัปเดตแล้ว",
    pwBoxLabel: "🔑 รหัสผ่านสำหรับแก้ไข:",
    pwBoxWarn: "บันทึกเลย! จะไม่แสดงอีก",
    errUrl: "กรุณาใส่ URL", errUrlInvalid: "URL ไม่ถูกต้อง",
    errSlug: "กรุณาใส่ slug",
    errPw: "กรุณาใส่รหัสผ่าน",
    errNet: "เครือข่ายผิดพลาด",
    errSlugEmpty: "กรุณาใส่ slug ก่อน",
    errSlugInvalid: "ไม่ถูกต้อง: ตัวอักษร-ตัวเลข 3-10 ตัวเท่านั้น",
    slugFound: "ยืนยันแล้ว",
    slugNotFound: "ไม่พบ slug",
    slugAuthFail: "ตรวจสอบคีย์ยืนยันตัวตน",
    defaultRedirectTitle: "URL ปลายทาง {url}",
    err_UNAUTHORIZED: "ไม่ได้รับอนุญาต – ตรวจสอบคีย์ยืนยันตัวตน",
    err_INVALID_JSON: "คำขอไม่ถูกต้อง",
    err_INVALID_URL: "URL ไม่ถูกต้อง",
    err_INVALID_SLUG: "รูปแบบ slug ไม่ถูกต้อง",
    err_SLUG_EXISTS: "slug นี้มีอยู่แล้ว – ใช้โหมดแก้ไขพร้อมรหัสผ่าน",
   
    err_SLUG_COLLISION: "สร้าง slug ไม่สำเร็จ กรุณาลองใหม่",
    err_NOT_FOUND: "ไม่พบ", err_VERIFY_FAILED: "ไม่พบ slug หรือรหัสผ่านผิด",
    err_INVALID_REDIRECT_MODE: "โหมดเปลี่ยนเส้นทางไม่ถูกต้อง",
    tb_bold: "ตัวหนา", tb_italic: "ตัวเอียง", tb_underline: "ขีดเส้นใต้", tb_h1: "หัวข้อ 1", tb_h2: "หัวข้อ 2", tb_h3: "หัวข้อ 3", tb_ul: "รายการจุด", tb_ol: "รายการเลข", tb_blockquote: "คำพูด", tb_code: "โค้ดในบรรทัด", tb_link: "แทรกลิงก์", tb_hr: "เส้นแนวนอน",
  },
  ta: {
    title: "URL சுருக்கி",
    tabCreate: "✨ உருவாக்கு",
    tabModify: "✏️ மாற்று",
    slugLabelCreate: "தனிப்பயன் slug", omittableText: "(காலியாக விடலாம்)",
    slugLabelModify: "மாற்ற வேண்டிய slug",
    slugPlaceholderCreate: "தானாக உருவாக்க காலியாக விடுக",
    slugPlaceholderModify: "இருக்கும் slug ஐ உள்ளிடுக",
    slugHint: "3-10 எழுத்து-எண் (பெரிய-சிறிய எழுத்து வேறுபடும்).",
    check: "சரிபார் & வினவு",
    targetUrl: "இலக்கு URL",
    slugPassword: "Slug கடவுச்சொல்",
    pwPlaceholder: "உருவாக்கும்போது காட்டிய கடவுச்சொல்",
    pwHint: "இந்த slug ஐ உருவாக்கும்போது காட்டிய கடவுச்சொல்லை உள்ளிடுக.",
    ttlOptions: "செல்லுபடி காலம்",
    ttlLabel: "செல்லுபடி காலம்",
    ttlHint: "0 = நிரந்தரம். குறைந்தது 60 வினாடி, அதிகபட்சம் 12 மாதங்கள். எதிர்மறை எண், தசமம் போன்ற தவறான மதிப்புகள் புறக்கணிக்கப்படும்.",
    ttlUnit_s: "வினாடி",
    ttlUnit_m: "நிமிடம்",
    ttlUnit_h: "மணி",
    ttlUnit_d: "நாள்",
    ttlUnit_mo: "மாதம்",
    redirectOptions: "திசைமாற்ற விருப்பங்கள்",
    countdownLabel: "கவுண்ட்டவுன் வினாடிகள்",
    countdownHint: "0 = கைமுறை திசைமாற்றம் (கவுண்ட்டவுன் முடக்கு). 1-60 = கவுண்ட்டவுன் காட்டு. பிற உள்ளீடு 0 ஆகக் கருதப்படும்.",
    rdInstant: "உடனடி திசைமாற்றம்",
    rdManual: "கைமுறை அல்லது கவுண்ட்டவுன் திசைமாற்றம்",
    usePermanent: "நிரந்தர திசைமாற்றம் பயன்படுத்து",
    manualBtnLabel: "கைமுறை திசைமாற்ற பொத்தான் தலைப்பு (காலியாக விடலாம்)",
    manualBtnPlaceholder: "இயல்பு: இப்போதே செல்",
    manualBtnDefault: "இப்போதே செல்", lightPage: "ஒளி பின்னணி பயன்படுத்து",
    redirectPageTitleLabel: "திசைமாற்ற பக்க தலைப்பு (காலியாக விடலாம்)",
    redirectPageTitlePlaceholder: "இயல்பு: இலக்கு URL {url}",
    redirectPageContentLabel: "திசைமாற்ற பக்க உள்ளடக்கம் (காலியாக விடலாம்)",
    redirectPageContentPlaceholder: "உள்ளடக்கம் எழுதுங்கள்...",
    redirectPageContentHint: "Markdown ஆதரவு. காலியாக விட்டால் இணைப்புடன் இலக்கு URL காட்டப்படும்.",
    mode_rich: "ரிச்", mode_md: "MD",
    apiKey: "அடையாள விசை",
    resetPassword: "Slug கடவுச்சொல்லை புதுப்பி",
    btnCreate: "சுருக்கு",
    btnUpdate: "புதுப்பி", btnDelete: "நீக்கு", confirmDeleteMsg: "இந்த குறுகிய இணைப்பை நீக்கவா?", confirmYes: "நீக்கு", confirmNo: "ரத்து",
    created: "✅ உருவாக்கப்பட்டது",
    updated: "♻️ புதுப்பிக்கப்பட்டது",
    pwBoxLabel: "🔑 மாற்ற கடவுச்சொல்:",
    pwBoxWarn: "இப்போதே சேமிக்கவும்! மீண்டும் காட்டப்படாது.",
    errUrl: "URL தேவை", errUrlInvalid: "தவறான URL",
    errSlug: "Slug தேவை",
    errPw: "கடவுச்சொல் தேவை",
    errNet: "பிணையப் பிழை",
    errSlugEmpty: "முதலில் slug உள்ளிடுக",
    errSlugInvalid: "செல்லாது: 3-10 எழுத்து-எண் மட்டும்",
    slugFound: "சரிபார்க்கப்பட்டது",
    slugNotFound: "Slug கிடைக்கவில்லை",
    slugAuthFail: "அடையாள விசையை சரிபார்க்கவும்",
    defaultRedirectTitle: "இலக்கு URL {url}",
    err_UNAUTHORIZED: "அங்கீகரிக்கப்படவில்லை – அடையாள விசையை சரிபார்க்கவும்",
    err_INVALID_JSON: "தவறான கோரிக்கை",
    err_INVALID_URL: "தவறான URL",
    err_INVALID_SLUG: "தவறான slug வடிவம்",
    err_SLUG_EXISTS: "இந்த slug ஏற்கனவே உள்ளது – கடவுச்சொல்லுடன் மாற்று முறையைப் பயன்படுத்தவும்",
   
    err_SLUG_COLLISION: "slug உருவாக்கம் தோல்வி, மீண்டும் முயற்சிக்கவும்",
    err_NOT_FOUND: "கிடைக்கவில்லை", err_VERIFY_FAILED: "Slug கிடைக்கவில்லை அல்லது கடவுச்சொல் தவறு",
    err_INVALID_REDIRECT_MODE: "தவறான திசைமாற்ற முறை",
    tb_bold: "தடிமன்", tb_italic: "சாய்வு", tb_underline: "அடிக்கோடு", tb_h1: "தலைப்பு 1", tb_h2: "தலைப்பு 2", tb_h3: "தலைப்பு 3", tb_ul: "புள்ளி பட்டியல்", tb_ol: "எண் பட்டியல்", tb_blockquote: "மேற்கோள்", tb_code: "இன்லைன் குறியீடு", tb_link: "இணைப்பு செருகு", tb_hr: "கிடைக்கோடு",
  },
  he: {
    title: "קיצור קישורים",
    tabCreate: "✨ יצירה",
    tabModify: "✏️ עריכה",
    slugLabelCreate: "קוד מותאם", omittableText: "(ניתן להשאיר ריק)",
    slugLabelModify: "קוד לעריכה",
    slugPlaceholderCreate: "השאר ריק ליצירה אוטומטית",
    slugPlaceholderModify: "הכנס קוד קיים",
    slugHint: "3-10 תווים אלפאנומריים (רגיש לרישיות).",
    check: "אמת ושאילתה",
    targetUrl: "כתובת יעד",
    slugPassword: "סיסמת קוד",
    pwPlaceholder: "הסיסמה שהוצגה ביצירה",
    pwHint: "הכנס את הסיסמה שהוצגה כשיצרת את הקוד.",
    ttlOptions: "תוקף",
    ttlLabel: "משך תוקף",
    ttlHint: "0 = לצמיתות. מינימום 60 שניות, מקסימום 12 חודשים. ערכים לא תקינים כגון מספרים שליליים או עשרוניים יתעלמו.",
    ttlUnit_s: "שניות",
    ttlUnit_m: "דקות",
    ttlUnit_h: "שעות",
    ttlUnit_d: "ימים",
    ttlUnit_mo: "חודשים",
    redirectOptions: "הגדרות הפניה",
    countdownLabel: "שניות ספירה לאחור",
    countdownHint: "0 = הפניה ידנית (ללא ספירה). 1-60 = הצג ספירה לאחור. קלט אחר = 0.",
    rdInstant: "הפניה מיידית",
    rdManual: "הפניה ידנית או ספירה לאחור",
    usePermanent: "השתמש בהפניה קבועה",
    manualBtnLabel: "כותרת כפתור הפניה ידנית (ניתן להשאיר ריק)",
    manualBtnPlaceholder: "ברירת מחדל: עבור עכשיו",
    manualBtnDefault: "עבור עכשיו", lightPage: "השתמש ברקע בהיר",
    redirectPageTitleLabel: "כותרת דף ההפניה (ניתן להשאיר ריק)",
    redirectPageTitlePlaceholder: "ברירת מחדל: כתובת יעד {url}",
    redirectPageContentLabel: "תוכן דף ההפניה (ניתן להשאיר ריק)",
    redirectPageContentPlaceholder: "כתוב תוכן...",
    redirectPageContentHint: "תמיכה ב-Markdown. השאר ריק כדי להציג URL עם קישור.",
    mode_rich: "עשיר", mode_md: "MD",
    apiKey: "מפתח זהות",
    resetPassword: "חדש סיסמת קוד",
    btnCreate: "קצר",
    btnUpdate: "עדכן", btnDelete: "מחק", confirmDeleteMsg: "למחוק קישור מקוצר זה?", confirmYes: "מחק", confirmNo: "ביטול",
    created: "✅ נוצר",
    updated: "♻️ עודכן",
    pwBoxLabel: "🔑 סיסמת עריכה:",
    pwBoxWarn: "שמור עכשיו! לא תוצג שוב.",
    errUrl: "נדרשת כתובת", errUrlInvalid: "כתובת לא תקינה",
    errSlug: "נדרש קוד",
    errPw: "נדרשת סיסמה",
    errNet: "שגיאת רשת",
    errSlugEmpty: "הכנס קוד תחילה",
    errSlugInvalid: "לא תקין: 3-10 אותיות וספרות בלבד",
    slugFound: "אומת",
    slugNotFound: "הקוד לא נמצא",
    slugAuthFail: "בדוק את מפתח הזהות",
    defaultRedirectTitle: "כתובת יעד {url}",
    err_UNAUTHORIZED: "לא מורשה – בדוק את מפתח הזהות",
    err_INVALID_JSON: "בקשה לא תקינה",
    err_INVALID_URL: "כתובת לא תקינה",
    err_INVALID_SLUG: "פורמט קוד לא תקין",
    err_SLUG_EXISTS: "קוד זה כבר קיים – השתמש במצב עריכה עם הסיסמה",
   
    err_SLUG_COLLISION: "יצירת קוד נכשלה, נסה שוב",
    err_NOT_FOUND: "לא נמצא", err_VERIFY_FAILED: "הקוד לא נמצא או הסיסמה שגויה",
    err_INVALID_REDIRECT_MODE: "מצב הפניה לא תקין",
    tb_bold: "מודגש", tb_italic: "נטוי", tb_underline: "קו תחתון", tb_h1: "כותרת 1", tb_h2: "כותרת 2", tb_h3: "כותרת 3", tb_ul: "רשימת תבליטים", tb_ol: "רשימה ממוספרת", tb_blockquote: "ציטוט", tb_code: "קוד בשורה", tb_link: "הכנס קישור", tb_hr: "קו אופקי",
  },
  ar: {
    title: "اختصار الروابط",
    tabCreate: "✨ إنشاء",
    tabModify: "✏️ تعديل",
    slugLabelCreate: "رمز مخصص", omittableText: "(يمكن تركه فارغاً)",
    slugLabelModify: "الرمز المراد تعديله",
    slugPlaceholderCreate: "اتركه فارغاً للتوليد التلقائي",
    slugPlaceholderModify: "أدخل الرمز الموجود",
    slugHint: "3-10 أحرف وأرقام (حساس لحالة الأحرف).",
    check: "تحقق واستعلم",
    targetUrl: "الرابط الهدف",
    slugPassword: "كلمة مرور الرمز",
    pwPlaceholder: "كلمة المرور التي ظهرت عند الإنشاء",
    pwHint: "أدخل كلمة المرور التي ظهرت عند إنشاء هذا الرمز.",
    ttlOptions: "مدة الصلاحية",
    ttlLabel: "مدة الصلاحية",
    ttlHint: "0 = دائم. الحد الأدنى 60 ثانية، الحد الأقصى 12 شهرًا. القيم غير الصالحة كالأرقام السالبة أو العشرية سيتم تجاهلها.",
    ttlUnit_s: "ثوانٍ",
    ttlUnit_m: "دقائق",
    ttlUnit_h: "ساعات",
    ttlUnit_d: "أيام",
    ttlUnit_mo: "أشهر",
    redirectOptions: "خيارات التوجيه",
    countdownLabel: "ثواني العد التنازلي",
    countdownHint: "0 = توجيه يدوي (بدون عد تنازلي). 1-60 = عرض عد تنازلي. المدخلات الأخرى تعتبر 0.",
    rdInstant: "توجيه فوري",
    rdManual: "توجيه يدوي أو عد تنازلي",
    usePermanent: "استخدم التوجيه الدائم",
    manualBtnLabel: "عنوان زر التوجيه اليدوي (يمكن تركه فارغاً)",
    manualBtnPlaceholder: "افتراضي: انتقل الآن",
    manualBtnDefault: "انتقل الآن", lightPage: "استخدم خلفية فاتحة",
    redirectPageTitleLabel: "عنوان صفحة التوجيه (يمكن تركه فارغاً)",
    redirectPageTitlePlaceholder: "افتراضي: الرابط الهدف {url}",
    redirectPageContentLabel: "محتوى صفحة التوجيه (يمكن تركه فارغاً)",
    redirectPageContentPlaceholder: "اكتب المحتوى...",
    redirectPageContentHint: "يدعم Markdown. اتركه فارغاً لعرض الرابط الهدف مع رابط.",
    mode_rich: "منسق", mode_md: "MD",
    apiKey: "مفتاح الهوية",
    resetPassword: "تجديد كلمة مرور الرمز",
    btnCreate: "اختصار",
    btnUpdate: "تحديث", btnDelete: "حذف", confirmDeleteMsg: "حذف هذا الرابط المختصر؟", confirmYes: "حذف", confirmNo: "إلغاء",
    created: "✅ تم الإنشاء",
    updated: "♻️ تم التحديث",
    pwBoxLabel: "🔑 كلمة مرور التعديل:",
    pwBoxWarn: "احفظها الآن! لن تظهر مرة أخرى.",
    errUrl: "الرابط مطلوب", errUrlInvalid: "رابط غير صالح",
    errSlug: "الرمز مطلوب",
    errPw: "كلمة المرور مطلوبة",
    errNet: "خطأ في الشبكة",
    errSlugEmpty: "أدخل الرمز أولاً",
    errSlugInvalid: "غير صالح: 3-10 أحرف وأرقام فقط",
    slugFound: "تم التحقق",
    slugNotFound: "الرمز غير موجود",
    slugAuthFail: "تحقق من مفتاح الهوية",
    defaultRedirectTitle: "الرابط الهدف {url}",
    err_UNAUTHORIZED: "غير مصرح – تحقق من مفتاح الهوية",
    err_INVALID_JSON: "طلب غير صالح",
    err_INVALID_URL: "رابط غير صالح",
    err_INVALID_SLUG: "تنسيق الرمز غير صالح",
    err_SLUG_EXISTS: "هذا الرمز موجود بالفعل – استخدم وضع التعديل مع كلمة المرور",
   
    err_SLUG_COLLISION: "فشل في إنشاء الرمز، حاول مرة أخرى",
    err_NOT_FOUND: "غير موجود", err_VERIFY_FAILED: "الرمز غير موجود أو كلمة المرور خاطئة",
    err_INVALID_REDIRECT_MODE: "وضع التوجيه غير صالح",
    tb_bold: "غامق", tb_italic: "مائل", tb_underline: "تسطير", tb_h1: "عنوان 1", tb_h2: "عنوان 2", tb_h3: "عنوان 3", tb_ul: "قائمة نقطية", tb_ol: "قائمة مرقمة", tb_blockquote: "اقتباس", tb_code: "كود سطري", tb_link: "إدراج رابط", tb_hr: "خط أفقي",
  }
});

// ── Countdown redirect page ──────────────────────────────────────────

function countdownPage(entry, acceptLang, cdnHost) {
  const target = entry.url;
  const seconds = entry.countdown || 0;
  const lang = detectLang(acceptLang);
  const dir = (lang === "ar" || lang === "he") ? "rtl" : "ltr";

  // Title & body use stored custom values, or locale-aware defaults
  // NOTE: redirectPageContent field now stores Markdown (kept field name for backward compat)
  const titleRaw = entry.redirectPageTitle || null;
  const bodyRaw = entry.redirectPageContent || null;
  const customBtnTitle = entry.manualBtnTitle || null;
  const light = entry.lightPage !== false;
  const bg = light ? '#f4f6f9' : '#0f172a';
  const fg = light ? '#1e293b' : '#e2e8f0';
  const muted = light ? '#64748b' : '#94a3b8';
  const barBg = light ? '#cbd5e1' : '#1e293b';
  const linkColor = light ? '#2563eb' : '#60a5fa';
  const skipBorder = light ? '#94a3b8' : '#475569';

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://${cdnHost}/npm/markdown-it@14/dist/markdown-it.min.js"><\/script>
<title id="page-title"></title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:${bg};color:${fg};min-height:100vh;display:flex;align-items:center;justify-content:center}
.wrap{max-width:520px;width:100%;padding:2rem;text-align:center}
.countdown{font-size:3rem;font-weight:700;color:#3b82f6;margin:1.2rem 0}
.body-content{margin:1.5rem 0;font-size:1rem;line-height:1.6}
.body-content p{margin-bottom:.8em}
.body-content blockquote{border-left:3px solid #3b82f6;padding-left:.8em;margin:.5em 0;font-style:italic}
.body-content ul,.body-content ol{padding-left:1.5em;margin-bottom:.5em}
.body-content code{background:rgba(127,127,127,.15);padding:1px 4px;border-radius:3px;font-size:.9em}
.body-content hr{border:none;border-top:1px solid rgba(127,127,127,.3);margin:.8em 0}
.skip{margin-top:1.2rem}
.skip a{color:${muted};font-size:.85rem;text-decoration:none;border-bottom:1px dashed ${skipBorder}}
.skip a:hover{color:${fg}}
.bar-track{width:100%;height:4px;background:${barBg};border-radius:2px;margin-top:1.5rem;overflow:hidden}
.bar-fill{height:100%;background:#3b82f6;border-radius:2px;transition:width .3s linear}
</style></head><body><div class="wrap">
<div class="body-content" id="body-content"></div>
<div class="countdown" id="count">${seconds}</div>
<div class="bar-track"><div class="bar-fill" id="bar" style="width:100%"></div></div>
<div class="skip"><a id="skip-link" href="${esc(target)}"></a></div>
</div><script>
const I18N=${I18N_JSON};
const lang=${JSON.stringify(lang)};
const t=I18N[lang]||I18N.en;
const target=${JSON.stringify(target)};
const customTitle=${JSON.stringify(titleRaw)};
const customBody=${JSON.stringify(bodyRaw)};
const customBtnTitle=${JSON.stringify(customBtnTitle)};
document.getElementById('page-title').textContent=customTitle||t.defaultRedirectTitle.replace('{url}',target);
if(customBody){var md=window.markdownit({html:false,linkify:true});document.getElementById('body-content').innerHTML=md.render(customBody)}else{document.getElementById('body-content').innerHTML='<a href="'+target+'" style="color:${linkColor};word-break:break-all">'+target.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</a>'}
var btnTitle=customBtnTitle||t.manualBtnDefault;
const total=${seconds};
if(total===0){
  document.getElementById('count').style.display='none';
  document.getElementById('bar').parentNode.style.display='none';
  document.getElementById('skip-link').textContent=btnTitle;
  document.getElementById('skip-link').style.cssText='display:inline-block;padding:12px 32px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-size:1rem;font-weight:600';
}else{
  document.getElementById('skip-link').textContent=btnTitle;
  let left=${seconds};
  const countEl=document.getElementById('count');
  const barEl=document.getElementById('bar');
  const iv=setInterval(()=>{
    left--;
    if(left<=0){clearInterval(iv);location.href=target;return}
    countEl.textContent=left;
    barEl.style.width=((left/total)*100)+'%';
  },1000);
}
</script></body></html>`;
}

function detectLang(acceptLang) {
  if (!acceptLang) return "en";
  const parts = acceptLang.toLowerCase().split(",");
  for (const part of parts) {
    const tag = part.split(";")[0].trim();
    if (/^zh[-_]?(hant|tw|hk|mo)/.test(tag)) return "zh-tw";
    if (/^zh/.test(tag)) return "zh-cn";
    const prefixes = ["ja","ko","ms","vi","th","ta","he","ar"];
    for (const s of prefixes) {
      if (tag === s || tag.startsWith(s + "-")) return s;
    }
  }
  return "en";
}

// ── Landing page ─────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>URL Shortener</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%233b82f6'/%3E%3Cstop offset='100%25' stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='6' fill='url(%23g)'/%3E%3Cpath d='M12 20l-2 2a3 3 0 01-4.24-4.24l4-4a3 3 0 014.24 0' fill='none' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M20 12l2-2a3 3 0 00-4.24-4.24l-4 4a3 3 0 000 4.24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E">
<script src="https://{{CDN_HOST}}/npm/markdown-it@14/dist/markdown-it.min.js"><\/script>
<style>
:root{
  --s-bg:#0f172a;--s-surface:#1e293b;--s-surface2:#0f172a;
  --s-border:#334155;--s-border-hi:#475569;
  --s-text:#e2e8f0;--s-text-muted:#94a3b8;--s-text-dim:#64748b;
  --s-accent:#3b82f6;--s-accent-hover:#2563eb;
  --s-err:#f87171;--s-found:#fbbf24;--s-free:#34d399;
}
[data-theme="light"]{
  --s-bg:#f4f6f9;--s-surface:#ffffff;--s-surface2:#f8fafc;
  --s-border:#cbd5e1;--s-border-hi:#94a3b8;
  --s-text:#1e293b;--s-text-muted:#64748b;--s-text-dim:#94a3b8;
  --s-accent:#2563eb;--s-accent-hover:#1d4ed8;
  --s-err:#dc2626;--s-found:#d97706;--s-free:#059669;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:var(--s-bg);color:var(--s-text);min-height:100vh;display:flex;align-items:center;justify-content:center}
[data-theme="light"] body{background:linear-gradient(135deg,#e0e7ff 0%,#f4f6f9 40%,#ecfeff 100%)}
.c{max-width:480px;width:100%;padding:2rem}
[data-theme="light"] .c{background:var(--s-surface);border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.06)}
h1{font-size:1.4rem;margin-bottom:1.5rem;text-align:center}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem}
.header h1{margin-bottom:0}
.header-left{display:flex;align-items:center;gap:10px}
.logo-icon{width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#06b6d4);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.header select{width:auto;margin-bottom:0;font-size:.8rem;padding:0 .5rem;height:30px}
.theme-toggle{background:var(--s-surface);border:1px solid var(--s-border);border-radius:.5rem;padding:0 .5rem;height:30px;font-size:.8rem;cursor:pointer;color:var(--s-text-muted);transition:all .18s;display:inline-flex;align-items:center}
.theme-toggle:hover{border-color:var(--s-accent);color:var(--s-text)}
.field-label{display:block;font-size:.85rem;color:var(--s-text-muted);margin-bottom:.2rem}
input[type=text],input[type=url],input[type=password],input[type=number],textarea,select{width:100%;padding:.6rem .75rem;border:1px solid var(--s-border);border-radius:.5rem;background:var(--s-surface);color:var(--s-text);font-size:.9rem;outline:none;margin-bottom:.8rem;font-family:inherit}
input:focus,textarea:focus,select:focus{border-color:var(--s-accent)}
textarea{resize:vertical;min-height:60px}
.form-btn{width:100%;padding:.6rem;border:none;border-radius:.5rem;background:var(--s-accent);color:#fff;font-size:.9rem;cursor:pointer}
.form-btn:hover{background:var(--s-accent-hover)}
.form-btn:disabled{opacity:.4;cursor:not-allowed;background:var(--s-border)}
.btn-row{display:flex;gap:.5rem}
.btn-row .form-btn{width:auto;flex:1}
.btn-delete{background:#dc2626!important}
.btn-delete:hover{background:#b91c1c!important}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:999}
.modal-overlay.show{display:flex}
.modal-box{background:var(--s-surface);border:1px solid var(--s-border);border-radius:.75rem;padding:1.5rem;max-width:340px;width:90%;text-align:center}
.modal-box p{color:var(--s-text);font-size:.95rem;margin-bottom:1.2rem}
.modal-btns{display:flex;gap:.5rem}
.modal-btns button{flex:1;padding:.5rem;border:none;border-radius:.5rem;font-size:.85rem;font-weight:600;cursor:pointer}
.modal-cancel{background:var(--s-border);color:var(--s-text)}
.modal-confirm{background:#dc2626;color:#fff}
.modal-confirm:hover{background:#b91c1c}
#r{margin-top:1rem;padding:.75rem;border-radius:.5rem;background:var(--s-surface);word-break:break-all;display:none}
#r a{color:var(--s-accent);text-decoration:none}
.err{color:var(--s-err)}
.hint{font-size:.75rem;color:var(--s-text-dim);margin:-0.4rem 0 .8rem}
.tabs{display:flex;gap:.5rem;margin-bottom:1.2rem}
.tab{flex:1;padding:.5rem;border:1px solid var(--s-border);border-radius:.5rem;background:transparent;color:var(--s-text-muted);font-size:.85rem;cursor:pointer;text-align:center;transition:all .2s}
.tab.active{background:var(--s-surface);color:var(--s-text);border-color:var(--s-accent)}
.slug-row{display:flex;gap:.5rem;margin-bottom:.8rem}
.slug-row input{flex:1;margin-bottom:0}
.slug-row .form-btn{width:auto;padding:.6rem .9rem;font-size:.8rem;white-space:nowrap}
.ttl-row{display:flex;gap:.5rem;margin-bottom:.8rem}
.ttl-row input{flex:1;margin-bottom:0}
.ttl-row select{width:auto;margin-bottom:0}
#slug-status,#url-status{font-size:.75rem;margin:-0.2rem 0 .6rem}
#slug-status:empty,#url-status:empty{margin:0}
.found{color:var(--s-found)}.free{color:var(--s-free)}.bad{color:var(--s-err)}
.pw-box{margin-top:.75rem;padding:.75rem;border-radius:.5rem;background:var(--s-surface2);border:1px solid #f59e0b}
.pw-box strong{color:var(--s-found);font-family:monospace;font-size:1rem;user-select:all}
.pw-box p{font-size:.75rem;color:#f59e0b;margin-top:.3rem}
.hidden{display:none}
.collapse-toggle{font-size:.8rem;color:var(--s-text-dim);cursor:pointer;margin-bottom:.8rem;user-select:none}
.collapse-toggle:hover{color:var(--s-text-muted)}
.editor-wrap{border:1px solid var(--s-border);border-radius:.5rem;overflow:hidden;margin-bottom:.8rem;transition:border-color .18s}
.editor-wrap:focus-within{border-color:var(--s-accent)}
.editor-toolbar{display:flex;align-items:center;gap:3px;padding:6px 8px;background:var(--s-surface2);border-bottom:1px solid var(--s-border);flex-wrap:wrap}
.tb-btn{padding:4px 7px;border:none;border-radius:4px;background:transparent;color:var(--s-text-dim);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit;line-height:1.2;transition:all .18s}
.tb-btn:hover{background:var(--s-surface);color:var(--s-text)}
.tb-sep{width:1px;height:18px;background:var(--s-border);margin:0 4px}
.tb-mode-toggle{margin-left:auto;display:flex;background:var(--s-surface2);border:1px solid var(--s-border);border-radius:4px;overflow:hidden}
.tb-mode{padding:3px 10px;font-size:.72rem;font-weight:500;border:none;background:transparent;color:var(--s-text-dim);cursor:pointer;transition:all .18s}
.tb-mode.active{background:var(--s-accent);color:#fff}
.tb-mode:not(.active):hover{background:var(--s-surface);color:var(--s-text)}
#wysiwygPane{min-height:80px;max-height:200px;overflow-y:auto;padding:8px 10px;outline:none;font-size:.85rem;line-height:1.6;color:var(--s-text);background:var(--s-surface)}
#wysiwygPane p{margin-bottom:.5em}
#wysiwygPane blockquote{border-left:3px solid var(--s-accent);padding-left:.8em;margin:.5em 0;color:var(--s-text-muted)}
#wysiwygPane ul,#wysiwygPane ol{padding-left:1.5em;margin-bottom:.5em}
#wysiwygPane code{background:rgba(127,127,127,.2);padding:1px 4px;border-radius:3px;font-size:.9em}
#wysiwygPane hr{border:none;border-top:1px solid var(--s-border);margin:.5em 0}
#wysiwygPane:empty::before{content:attr(data-placeholder);color:var(--s-border-hi);pointer-events:none}
#wysiwygPane a{color:var(--s-accent)}
#wysiwygPane code{background:var(--s-surface2);padding:1px 4px;border-radius:3px;font-size:.85em}
#wysiwygPane blockquote{border-left:2px solid var(--s-accent);padding-left:8px;color:var(--s-text-muted);margin:4px 0}
#mdPane{width:100%;min-height:80px;max-height:200px;resize:vertical;padding:8px 10px;font-family:monospace;font-size:.82rem;line-height:1.6;color:var(--s-text-muted);background:var(--s-surface);border:none;outline:none}
.rd-mode{margin-bottom:.4rem}
.rd-radio{display:flex;align-items:center;gap:.4rem;font-size:.9rem;color:var(--s-text);cursor:pointer;margin-bottom:.4rem}
.rd-radio input[type=radio]{accent-color:var(--s-accent)}
.rd-check{display:flex;align-items:center;gap:.4rem;font-size:.85rem;color:var(--s-text-muted);cursor:pointer}
.rd-check input[type=checkbox]{accent-color:var(--s-accent)}
</style></head><body><div class="c">
<div class="header">
  <div class="header-left">
    <div class="logo-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
      </svg>
    </div>
    <h1 id="i-title"></h1>
  </div>
  <div style="display:flex;gap:8px;align-items:center">
    <button type="button" class="theme-toggle" id="themeToggle">☀️</button>
    <select id="lang-select">
    <option value="en">English</option>
    <option value="zh-cn">简体中文</option>
    <option value="zh-tw">繁體中文</option>
    <option value="ja">日本語</option>
    <option value="ko">한국어</option>
    <option value="ms">Bahasa Melayu</option>
    <option value="vi">Tiếng Việt</option>
    <option value="th">ไทย</option>
    <option value="ta">தமிழ்</option>
    <option value="he">עברית</option>
    <option value="ar">العربية</option>
  </select>
  </div>
</div>

<div class="tabs">
  <div class="tab active" id="tab-create" onclick="setMode('create')"></div>
  <div class="tab" id="tab-modify" onclick="setMode('modify')"></div>
</div>

<div id="apikey-section">
<label id="l-apikey" class="field-label"></label>
<input id="k" type="password">
</div>

<label id="l-slug" class="field-label"></label>
<div class="slug-row">
  <input id="s" type="text" minlength="3" maxlength="10" pattern="[a-zA-Z0-9]{3,10}">
</div>
<div id="slug-status"></div>
<p class="hint" id="h-slug"></p>

<div id="pw-section" class="hidden">
  <label id="l-pw" class="field-label"></label>
  <div class="slug-row">
    <input id="p" type="password">
    <button class="form-btn" onclick="checkSlug()" id="check-btn" disabled></button>
  </div>
  <p class="hint" id="h-pw"></p>
</div>

<label id="l-url" class="field-label"></label>
<input id="u" type="url" placeholder="https://mydomain.tld/long/path/to/shorten">
<div id="url-status"></div>

<div id="renew-pw-section" class="hidden" style="margin-bottom:.8rem">
  <label style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;color:var(--s-text-muted);cursor:pointer">
    <input type="checkbox" id="resetPassword" checked style="accent-color:var(--s-accent)">
    <span id="l-resetPassword"></span>
  </label>
</div>

<div class="collapse-toggle" id="ttl-toggle" onclick="toggleTtl()"></div>
<div id="ttl-section" class="hidden">
  <div class="ttl-row">
    <input id="ttl" type="number" min="0">
    <select id="ttl-unit">
      <option value="s" id="ttlopt-s">Seconds</option>
      <option value="m" id="ttlopt-m">Minutes</option>
      <option value="h" id="ttlopt-h">Hours</option>
      <option value="d" id="ttlopt-d">Days</option>
      <option value="mo" id="ttlopt-mo">Months</option>
    </select>
  </div>
  <p class="hint" id="h-ttl"></p>
</div>

<div class="collapse-toggle" id="adv-toggle" onclick="toggleAdvanced()"></div>
<div id="advanced" class="hidden">
<div class="rd-mode">
  <label class="rd-radio">
    <input type="radio" name="rdMode" value="instant" checked>
    <span id="l-rdInstant"></span>
  </label>
  <div id="rd-instant-opts" style="padding-left:1.5rem;margin-bottom:.6rem">
    <label class="rd-check">
      <input type="checkbox" id="usePermanent" checked>
      <span id="l-usePermanent"></span>
    </label>
  </div>
</div>

<div class="rd-mode">
  <label class="rd-radio">
    <input type="radio" name="rdMode" value="manual">
    <span id="l-rdManual"></span>
  </label>
  <div id="rd-manual-opts" class="hidden" style="padding-left:1.5rem">
    <label id="l-countdown" class="field-label"></label>
    <input id="countdown" type="number" min="0" max="60" value="0">
    <p class="hint" id="h-countdown"></p>

    <label id="l-redirectPageTitle" class="field-label"></label>
    <input id="redirectPageTitle" type="text" maxlength="128">

    <label id="l-redirectPageContent" class="field-label"></label>
    <div class="editor-wrap">
      <div class="editor-toolbar">
        <button type="button" class="tb-btn" data-cmd="bold"><b>B</b></button>
        <button type="button" class="tb-btn" data-cmd="italic"><i>I</i></button>
        <button type="button" class="tb-btn" data-cmd="underline"><u>U</u></button>
        <span class="tb-sep"></span>
        <button type="button" class="tb-btn" data-cmd="h1">H1</button>
        <button type="button" class="tb-btn" data-cmd="h2">H2</button>
        <button type="button" class="tb-btn" data-cmd="h3">H3</button>
        <span class="tb-sep"></span>
        <button type="button" class="tb-btn" data-cmd="ul">&#8226;</button>
        <button type="button" class="tb-btn" data-cmd="ol">1.</button>
        <button type="button" class="tb-btn" data-cmd="blockquote">&ldquo;</button>
        <button type="button" class="tb-btn" data-cmd="code">&lt;/&gt;</button>
        <button type="button" class="tb-btn" data-cmd="link">&#128279;</button>
        <button type="button" class="tb-btn" data-cmd="hr">&mdash;</button>
        <div class="tb-mode-toggle">
          <button type="button" class="tb-mode" id="modeRich"></button>
          <button type="button" class="tb-mode active" id="modeMd"></button>
        </div>
      </div>
      <div id="wysiwygPane" contenteditable="true" data-placeholder="" style="display:none"></div>
      <textarea id="mdPane"></textarea>
    </div>
    <p class="hint" id="h-redirectPageContent"></p>

    <label id="l-manualBtn" class="field-label"></label>
    <input id="manualBtnTitle" type="text" maxlength="128">

    <label class="rd-check" style="margin-top:.4rem">
      <input type="checkbox" id="lightPage" checked>
      <span id="l-lightPage"></span>
    </label>
  </div>
</div>
</div>

<div class="btn-row">
<button class="form-btn" onclick="go()" id="submit-btn" disabled></button>
<button class="form-btn btn-delete" onclick="deleteSlug()" id="delete-btn" disabled style="display:none"></button>
</div>
<div id="r"></div>

</div>
<div class="modal-overlay" id="deleteModal">
  <div class="modal-box">
    <p id="modal-msg"></p>
    <div class="modal-btns">
      <button class="modal-cancel" onclick="closeDeleteModal()" id="modal-cancel"></button>
      <button class="modal-confirm" onclick="confirmDelete()" id="modal-confirm"></button>
    </div>
  </div>
</div>
<script>
const I18N=${I18N_JSON};

function detectLang(){
  const nav=(navigator.language||navigator.userLanguage||'en').toLowerCase();
  if(/^zh[-_]?(hant|tw|hk|mo)/.test(nav)) return 'zh-tw';
  if(/^zh/.test(nav)) return 'zh-cn';
  const prefixes=["ja","ko","ms","vi","th","ta","he","ar"];
  for(const s of prefixes){if(nav===s||nav.startsWith(s+'-'))return s}
  return 'en';
}

let lang=detectLang();
let t=I18N[lang]||I18N.en;

// RTL
function applyDir(){
  if(lang==='ar'||lang==='he'){document.documentElement.dir='rtl'}else{document.documentElement.dir='ltr'}
  document.documentElement.lang=lang;
}
applyDir();

var themeToggle = document.getElementById('themeToggle');
function getTheme() {
  var saved = localStorage.getItem('su_theme');
  if (saved) return saved;
  return 'light';
}
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('su_theme', theme);
}
setTheme(getTheme());
themeToggle.addEventListener('click', function() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
});

// Language selector
const langSelect=document.getElementById('lang-select');
langSelect.value=lang;
langSelect.addEventListener('change',function(){
  lang=this.value;
  t=I18N[lang]||I18N.en;
  applyI18n();
  updateLabels();
  applyDir();
});

// Markdown-it instance
var mdit = window.markdownit({ html: false, linkify: true, typographer: true });

function mdToHtml(src) { return mdit.render(src); }

function htmlToMd(html) {
  var s = html;
  s = s.replace(/<h1[^>]*>(.*?)<\\/h1>/gi, "# $1\\n\\n");
  s = s.replace(/<h2[^>]*>(.*?)<\\/h2>/gi, "## $1\\n\\n");
  s = s.replace(/<h3[^>]*>(.*?)<\\/h3>/gi, "### $1\\n\\n");
  s = s.replace(/<h4[^>]*>(.*?)<\\/h4>/gi, "#### $1\\n\\n");
  s = s.replace(/<h5[^>]*>(.*?)<\\/h5>/gi, "##### $1\\n\\n");
  s = s.replace(/<h6[^>]*>(.*?)<\\/h6>/gi, "###### $1\\n\\n");
  s = s.replace(/<strong[^>]*>(.*?)<\\/strong>/gi, "**$1**");
  s = s.replace(/<b[^>]*>(.*?)<\\/b>/gi, "**$1**");
  s = s.replace(/<em[^>]*>(.*?)<\\/em>/gi, "*$1*");
  s = s.replace(/<i[^>]*>(.*?)<\\/i>/gi, "*$1*");
  s = s.replace(/<u[^>]*>(.*?)<\\/u>/gi, "$1");
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\\/a>/gi, "[$2]($1)");
  s = s.replace(/<code[^>]*>(.*?)<\\/code>/gi, "\`$1\`");
  s = s.replace(/<blockquote[^>]*>(.*?)<\\/blockquote>/gi, function(m, c) {
    var text = c.replace(/<[^>]+>/g, "").trim();
    return "> " + text + "\\n\\n";
  });
  s = s.replace(/<ol[^>]*>([\\s\\S]*?)<\\/ol>/gi, function(m, c) {
    var n = 1;
    return c.replace(/<li[^>]*>(.*?)<\\/li>/gi, function(m2, text) { return (n++) + ". " + text + "\\n"; }) + "\\n";
  });
  s = s.replace(/<li[^>]*>(.*?)<\\/li>/gi, "- $1\\n");
  s = s.replace(/<hr[^>]*\\/?>/gi, "---\\n\\n");
  s = s.replace(/<br[^>]*\\/?>/gi, "\\n");
  s = s.replace(/<p[^>]*>(.*?)<\\/p>/gi, "$1\\n\\n");
  s = s.replace(/<div[^>]*>(.*?)<\\/div>/gi, "$1\\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  s = s.replace(/\\n{3,}/g, "\\n\\n");
  return s.trim();
}

// Editor state
var wysiwygPane = document.getElementById('wysiwygPane');
var mdPane = document.getElementById('mdPane');
var editorMode = 'md';
document.querySelectorAll('.tb-btn').forEach(function(b){ b.style.display='none'; });
document.querySelectorAll('.tb-sep').forEach(function(b){ b.style.display='none'; });

function setEditorMode(mode) {
  if (mode === editorMode) return;
  if (mode === 'md') {
    mdPane.value = htmlToMd(wysiwygPane.innerHTML);
    wysiwygPane.style.display = 'none';
    mdPane.style.display = 'block';
    document.querySelectorAll('.tb-btn').forEach(function(b){ b.style.display='none'; });
    document.querySelectorAll('.tb-sep').forEach(function(b){ b.style.display='none'; });
    document.getElementById('modeRich').classList.remove('active');
    document.getElementById('modeMd').classList.add('active');
  } else {
    wysiwygPane.innerHTML = mdToHtml(mdPane.value);
    mdPane.style.display = 'none';
    wysiwygPane.style.display = 'block';
    document.querySelectorAll('.tb-btn').forEach(function(b){ b.style.display=''; });
    document.querySelectorAll('.tb-sep').forEach(function(b){ b.style.display=''; });
    document.getElementById('modeMd').classList.remove('active');
    document.getElementById('modeRich').classList.add('active');
  }
  editorMode = mode;
}

document.getElementById('modeRich').addEventListener('click', function(){ setEditorMode('wysiwyg'); });
document.getElementById('modeMd').addEventListener('click', function(){ setEditorMode('md'); });

// Toolbar commands
document.querySelectorAll('.tb-btn[data-cmd]').forEach(function(btn) {
  btn.addEventListener('mousedown', function(e) {
    e.preventDefault();
    var cmd = btn.getAttribute('data-cmd');
    wysiwygPane.focus();
    switch(cmd) {
      case 'bold': document.execCommand('bold'); break;
      case 'italic': document.execCommand('italic'); break;
      case 'underline': document.execCommand('underline'); break;
      case 'h1': case 'h2': case 'h3':
        document.execCommand('formatBlock', false, '<'+cmd+'>'); break;
      case 'ul': document.execCommand('insertUnorderedList'); break;
      case 'ol': document.execCommand('insertOrderedList'); break;
      case 'blockquote': document.execCommand('formatBlock', false, '<blockquote>'); break;
      case 'code':
        var sel = window.getSelection();
        if (sel && sel.rangeCount) { var range = sel.getRangeAt(0); var c = document.createElement('code'); range.surroundContents(c); }
        break;
      case 'link':
        var url = prompt('URL:');
        if (url) document.execCommand('createLink', false, url);
        break;
      case 'hr': document.execCommand('insertHorizontalRule'); break;
    }
  });
});

function getEditorMarkdown() {
  if (editorMode === 'md') return mdPane.value.trim();
  return htmlToMd(wysiwygPane.innerHTML).trim();
}

var rdModeRadios = document.querySelectorAll('input[name="rdMode"]');
function updateRdMode() {
  var mode = document.querySelector('input[name="rdMode"]:checked').value;
  document.getElementById('rd-instant-opts').style.display = mode === 'instant' ? '' : 'none';
  document.getElementById('rd-manual-opts').className = mode === 'manual' ? '' : 'hidden';
}
for (var ri = 0; ri < rdModeRadios.length; ri++) {
  rdModeRadios[ri].addEventListener('change', updateRdMode);
}

var defaultTtl = parseInt('{{DEFAULT_TTL}}') || 0;
var KEY_REQUIRED = '{{KEY_REQUIRED}}' === 'true';
if(!KEY_REQUIRED) document.getElementById('apikey-section').style.display='none';
let mode='create',advOpen=false,ttlOpen=false;

function applyI18n(){
  document.title=t.title;
  document.getElementById('i-title').textContent=t.title;
  document.getElementById('tab-create').textContent=t.tabCreate;
  document.getElementById('tab-modify').textContent=t.tabModify;
  document.getElementById('l-url').textContent=t.targetUrl;
  document.getElementById('l-pw').textContent=t.slugPassword;
  document.getElementById('h-pw').textContent=t.pwHint;
  document.getElementById('h-ttl').textContent=t.ttlHint;
  document.getElementById('ttlopt-s').textContent=t.ttlUnit_s;
  document.getElementById('ttlopt-m').textContent=t.ttlUnit_m;
  document.getElementById('ttlopt-h').textContent=t.ttlUnit_h;
  document.getElementById('ttlopt-d').textContent=t.ttlUnit_d;
  document.getElementById('ttlopt-mo').textContent=t.ttlUnit_mo;
  document.getElementById('l-rdInstant').textContent=t.rdInstant;
  document.getElementById('l-rdManual').textContent=t.rdManual;
  document.getElementById('l-usePermanent').textContent=t.usePermanent;
  document.getElementById('l-manualBtn').textContent=t.manualBtnLabel;
  document.getElementById('manualBtnTitle').placeholder=t.manualBtnPlaceholder;
  document.getElementById('l-lightPage').textContent=t.lightPage;
  document.getElementById('l-countdown').textContent=t.countdownLabel;
  document.getElementById('h-countdown').textContent=t.countdownHint;
  document.getElementById('l-redirectPageTitle').textContent=t.redirectPageTitleLabel;
  document.getElementById('l-redirectPageContent').textContent=t.redirectPageContentLabel;
  document.getElementById('h-redirectPageContent').textContent=t.redirectPageContentHint;
  document.getElementById('l-apikey').textContent=t.apiKey;
  document.getElementById('redirectPageTitle').placeholder=t.redirectPageTitlePlaceholder;
  document.getElementById('modeRich').textContent=t.mode_rich;
  document.getElementById('modeMd').textContent=t.mode_md;
  wysiwygPane.setAttribute('data-placeholder',t.redirectPageContentPlaceholder);
  mdPane.placeholder=t.redirectPageContentPlaceholder;
  document.getElementById('p').placeholder=t.pwPlaceholder;
  document.getElementById('check-btn').textContent=t.check;
  document.getElementById('h-slug').textContent=t.slugHint;
  document.getElementById('l-resetPassword').textContent=t.resetPassword;
  var tooltipMap = {bold:'tb_bold', italic:'tb_italic', underline:'tb_underline', h1:'tb_h1', h2:'tb_h2', h3:'tb_h3', ul:'tb_ul', ol:'tb_ol', blockquote:'tb_blockquote', code:'tb_code', link:'tb_link', hr:'tb_hr'};
  document.querySelectorAll('.tb-btn[data-cmd]').forEach(function(btn){
    var key = tooltipMap[btn.getAttribute('data-cmd')];
    if(key && t[key]) btn.title = t[key];
  });
}
applyI18n();

function setMode(m){
  mode=m;
  document.querySelectorAll('.tab').forEach((el,i)=>el.classList.toggle('active',i===(m==='create'?0:1)));
  document.getElementById('slug-status').textContent='';
  document.getElementById('s').value='';
  document.getElementById('u').value='';
  document.getElementById('p').value='';
  document.getElementById('ttl').value=defaultTtl;
  document.getElementById('ttl-unit').value='s';
  document.querySelector('input[name="rdMode"][value="instant"]').checked=true;
  document.getElementById('usePermanent').checked=true;
  document.getElementById('countdown').value='0';
  document.getElementById('redirectPageTitle').value='';
  wysiwygPane.innerHTML='';
  mdPane.value='';
  document.getElementById('manualBtnTitle').value='';
  document.getElementById('lightPage').checked=true;
  updateRdMode();
  document.getElementById('r').style.display='none';
  document.getElementById('renew-pw-section').className='hidden';
  submitBtn.disabled=true;
  updateLabels();
  updateCheckBtn();
  checkSubmitState();
}

function updateLabels(){
  document.getElementById('l-slug').textContent=mode==='create'?(t.slugLabelCreate+' '+t.omittableText):t.slugLabelModify;
  document.getElementById('s').placeholder=mode==='create'?t.slugPlaceholderCreate:t.slugPlaceholderModify;
  document.getElementById('s').required=mode==='modify';
  document.getElementById('pw-section').className=mode==='modify'?'':'hidden';
  document.getElementById('submit-btn').textContent=mode==='create'?t.btnCreate:t.btnUpdate;
  var delBtn=document.getElementById('delete-btn');
  delBtn.textContent=t.btnDelete;
  delBtn.style.display=mode==='modify'?'':'none';
  delBtn.disabled=true;
  document.getElementById('h-slug').style.display=mode==='create'?'':'none';
  document.getElementById('ttl-toggle').textContent=(ttlOpen?'▼':'▶')+' '+t.ttlOptions;
  document.getElementById('adv-toggle').textContent=(advOpen?'▼':'▶')+' '+t.redirectOptions;
  updateCheckBtn();
}
updateLabels();

document.getElementById('ttl').value=defaultTtl;

var urlInput=document.getElementById('u');
var urlStatus=document.getElementById('url-status');
var submitBtn=document.getElementById('submit-btn');

function checkSubmitState(){
  if(mode==='modify') return; // submit controlled by verify in modify mode
  var urlOk=false,slugOk=true,keyOk=!KEY_REQUIRED;
  var uv=urlInput.value.trim();
  if(KEY_REQUIRED){var kv=document.getElementById('k').value.trim();if(kv) keyOk=true;}
  if(uv){urlOk=true;try{var u=new URL(uv);if((u.protocol!=='http:'&&u.protocol!=='https:')||!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,63}$/i.test(u.hostname))urlOk=false}catch(e){urlOk=false}}
  var sv=document.getElementById('s').value.trim();
  if(sv&&!/^[a-zA-Z0-9]{3,10}$/.test(sv))slugOk=false;
  submitBtn.disabled=!(urlOk&&slugOk&&keyOk);
}

function validateUrl(){
  var v=urlInput.value.trim();
  if(!v){urlStatus.textContent='';urlStatus.className='';checkSubmitState();return}
  try{var u=new URL(v);if((u.protocol==='http:'||u.protocol==='https:')&&/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,63}$/i.test(u.hostname)){urlStatus.textContent='';urlStatus.className='';checkSubmitState();return}}catch(e){}
  urlStatus.textContent='❌ '+t.errUrlInvalid;urlStatus.className='bad';checkSubmitState();
}
urlInput.addEventListener('input',validateUrl);
urlInput.addEventListener('blur',validateUrl);
document.getElementById('k').addEventListener('input',checkSubmitState);

var slugInput=document.getElementById('s');
var slugStatus=document.getElementById('slug-status');

function validateSlug(){
  var v=slugInput.value.trim();
  if(!v){slugStatus.textContent='';slugStatus.className='';checkSubmitState();return}
  if(!/^[a-zA-Z0-9]{3,10}$/.test(v)){
    slugStatus.textContent='❌ '+t.errSlugInvalid;slugStatus.className='bad';checkSubmitState();
  }else{
    slugStatus.textContent='';slugStatus.className='';checkSubmitState();
  }
}
slugInput.addEventListener('input',validateSlug);

function toggleTtl(){
  ttlOpen=!ttlOpen;
  document.getElementById('ttl-section').className=ttlOpen?'':'hidden';
  document.getElementById('ttl-toggle').textContent=(ttlOpen?'▼':'▶')+' '+t.ttlOptions;
}

function toggleAdvanced(){
  advOpen=!advOpen;
  document.getElementById('advanced').className=advOpen?'':'hidden';
  document.getElementById('adv-toggle').textContent=(advOpen?'▼':'▶')+' '+t.redirectOptions;
}

async function checkSlug(){
  var s=document.getElementById('s').value.trim();
  var k=document.getElementById('k').value.trim();
  var p=document.getElementById('p').value;
  var st=document.getElementById('slug-status');

  if(!s){st.textContent='❌ '+t.errSlugEmpty;st.className='bad';return}
  if(!/^[a-zA-Z0-9]{3,10}$/.test(s)){st.textContent='❌ '+t.errSlugInvalid;st.className='bad';return}

  try{
    var res=await fetch('/api/verify/'+s,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-API-Key':k},
      body:JSON.stringify({password:p})
    });
    if(res.ok){
      var d=await res.json();
      st.textContent='✓ '+t.slugFound;st.className='free';
      document.getElementById('u').value=d.url;
      // Set redirect mode radio
      var rdMode = d.redirectMode || 'instant';
      var rdRadio = document.querySelector('input[name="rdMode"][value="' + rdMode + '"]');
      if (rdRadio) rdRadio.checked = true;
      // Set instant options
      document.getElementById('usePermanent').checked = d.permanent !== false;
      // Set manual options
      document.getElementById('countdown').value = d.countdown || 0;
      document.getElementById('redirectPageTitle').value = d.redirectPageTitle || '';
      var loadedMd = d.redirectPageContent || '';
      mdPane.value = loadedMd;
      wysiwygPane.innerHTML = loadedMd ? mdToHtml(loadedMd) : '';
      if (loadedMd && editorMode !== 'md') {
        // Switch to MD mode without overwriting mdPane
        editorMode = 'md';
        wysiwygPane.style.display = 'none';
        mdPane.style.display = 'block';
        document.querySelectorAll('.tb-btn').forEach(function(b){ b.style.display='none'; });
        document.querySelectorAll('.tb-sep').forEach(function(b){ b.style.display='none'; });
        document.getElementById('modeRich').classList.remove('active');
        document.getElementById('modeMd').classList.add('active');
      }
      document.getElementById('manualBtnTitle').value = d.manualBtnTitle || '';
      document.getElementById('lightPage').checked = d.lightPage !== false;
      updateRdMode();
      document.getElementById('ttl').value=d.ttl||0;
      // Show renew password section and enable submit
      document.getElementById('renew-pw-section').className='';
      submitBtn.disabled=false;
      document.getElementById('delete-btn').disabled=false;
      // Open advanced sections if they have values
      if(rdMode !== 'instant' && !advOpen) toggleAdvanced();
      if(!ttlOpen&&d.ttl) toggleTtl();
    }else if(res.status===404){
      st.textContent='❌ '+t.slugNotFound;st.className='bad';
    }else if(res.status===403){
      var d2=await res.json();
      st.textContent='❌ '+(t['err_'+d2.error]||t.slugAuthFail);st.className='bad';
    }else{st.textContent='❌ '+t.slugAuthFail;st.className='bad'}
  }catch(e){st.textContent='❌ '+t.errNet;st.className='bad'}
}

function updateCheckBtn(){
  var s=document.getElementById('s').value.trim();
  var k=KEY_REQUIRED?document.getElementById('k').value.trim():'ok';
  var p=document.getElementById('p').value;
  var btn=document.getElementById('check-btn');
  btn.disabled=!(s && /^[a-zA-Z0-9]{3,10}$/.test(s) && k && p);
}
document.getElementById('s').addEventListener('input',updateCheckBtn);
document.getElementById('k').addEventListener('input',updateCheckBtn);
document.getElementById('p').addEventListener('input',updateCheckBtn);

async function go(){
  const u=document.getElementById('u').value.trim(),s=document.getElementById('s').value.trim(),
        p=document.getElementById('p').value,k=document.getElementById('k').value.trim(),
        countdown=parseInt(document.getElementById('countdown').value)||0,
        redirectPageTitle=document.getElementById('redirectPageTitle').value.trim(),
        r=document.getElementById('r');
  var redirectPageContent=getEditorMarkdown();
  if(redirectPageContent.length>2000) redirectPageContent=redirectPageContent.slice(0,2000);
  if(!u){r.textContent='❌ '+t.errUrl;r.className='err';r.style.display='block';return}
  try{var uu=new URL(u);if((uu.protocol!=='http:'&&uu.protocol!=='https:')||!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,63}$/i.test(uu.hostname))throw 0}catch(e){r.textContent='❌ '+t.errUrlInvalid;r.className='err';r.style.display='block';return}
  if(mode==='modify'&&!s){r.textContent='❌ '+t.errSlug;r.className='err';r.style.display='block';return}
  if(mode==='modify'&&!p){r.textContent='❌ '+t.errPw;r.className='err';r.style.display='block';return}
  const payload={url:u,mode:mode};
  if(s) payload.slug=s;
  if(mode==='modify'){
    payload.password=p;
    payload.resetPassword=document.getElementById('resetPassword').checked;
  }
  var ttlVal = parseInt(document.getElementById('ttl').value) || 0;
  var ttlUnit = document.getElementById('ttl-unit').value;
  var ttlSeconds = ttlVal;
  if (ttlUnit === 'm') ttlSeconds = ttlVal * 60;
  else if (ttlUnit === 'h') ttlSeconds = ttlVal * 3600;
  else if (ttlUnit === 'd') ttlSeconds = ttlVal * 86400;
  else if (ttlUnit === 'mo') ttlSeconds = ttlVal * 2592000;
  payload.ttl = ttlSeconds;
  var rdMode = document.querySelector('input[name="rdMode"]:checked').value;
  payload.redirectMode = rdMode;
  payload.permanent = document.getElementById('usePermanent').checked;
  payload.countdown=countdown;
  payload.redirectPageTitle=redirectPageTitle;
  payload.redirectPageContent=redirectPageContent;
  payload.manualBtnTitle=document.getElementById('manualBtnTitle').value.trim();
  payload.lightPage=document.getElementById('lightPage').checked;
  try{
    const res=await fetch('/api/shorten',{method:'POST',
      headers:{'Content-Type':'application/json','X-API-Key':k},body:JSON.stringify(payload)});
    const d=await res.json();
    if(res.ok){
      let html=(d.updated?t.updated:t.created)+' <a href="'+d.short_url+'" target="_blank">'+d.short_url+'</a>';
      if(d.password){
        html+='<div class="pw-box">'+t.pwBoxLabel+' <strong>'+d.password+'</strong>'
             +'<p>'+t.pwBoxWarn+'</p></div>';
      }
      r.innerHTML=html;r.className='';
    }else{r.textContent='❌ '+(t['err_'+d.error]||d.error);r.className='err'}
  }catch(e){r.textContent='❌ '+t.errNet;r.className='err'}
  r.style.display='block';
}

function deleteSlug(){
  document.getElementById('modal-msg').textContent=t.confirmDeleteMsg;
  document.getElementById('modal-cancel').textContent=t.confirmNo;
  document.getElementById('modal-confirm').textContent=t.confirmYes;
  document.getElementById('deleteModal').classList.add('show');
}
function closeDeleteModal(){
  document.getElementById('deleteModal').classList.remove('show');
}
async function confirmDelete(){
  closeDeleteModal();
  var s=document.getElementById('s').value.trim();
  var k=KEY_REQUIRED?document.getElementById('k').value.trim():'';
  var r=document.getElementById('r');
  if(!s) return;
  try{
    var res=await fetch('/api/urls/'+s,{method:'DELETE',headers:{'X-API-Key':k}});
    var d=await res.json();
    if(res.ok){
      r.textContent='✓';r.className='free';r.style.display='block';
      document.getElementById('delete-btn').disabled=true;
      submitBtn.disabled=true;
    }else{
      r.textContent='❌ '+(t['err_'+d.error]||d.error);r.className='err';r.style.display='block';
    }
  }catch(e){r.textContent='❌ '+t.errNet;r.className='err';r.style.display='block';}
}

</script></body></html>`;

// ── Request handler ──────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // TODO: Add basic rate limiting (requires additional KV namespace or external state)

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,X-API-Key,Authorization",
        },
      });
    }

    // ── Landing page ──
    if (path === "/" && request.method === "GET") {
      const keyRequired = env.KEY ? 'true' : 'false';
      const cdnHost = (request.cf && request.cf.country === 'CN') ? 'cdn.jsdmirror.com' : 'cdn.jsdelivr.net';
      const page = HTML.replace('{{DEFAULT_TTL}}', String(normalizeTtl(env.TTL || 0))).replace('{{KEY_REQUIRED}}', keyRequired).replace('{{CDN_HOST}}', cdnHost);
      return new Response(page, { headers: { "Content-Type": "text/html;charset=utf-8" } });
    }

    // ── Create / Update short URL ──
    if (path === "/api/shorten" && request.method === "POST") {
      const err = await checkAuth(request, env);
      if (err) return err;

      let body;
      try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }

      const target = (body.url || "").trim();
      try { const u = new URL(target); if ((u.protocol !== "http:" && u.protocol !== "https:") || !/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(u.hostname)) throw 0; }
      catch { return json({ error: "INVALID_URL" }, 400); }

      const redirectMode = body.redirectMode || 'instant';
      if (Array.isArray(body.redirectMode) || (redirectMode !== 'instant' && redirectMode !== 'manual')) {
        return json({ error: "INVALID_REDIRECT_MODE" }, 400);
      }

      let countdown = Math.floor(Number(body.countdown) || 0);
      if (countdown < 0 || countdown > DELAY_MAX) countdown = 0;

      const permanent = body.permanent !== false;
      const manualBtnTitle = (body.manualBtnTitle || '').trim().slice(0, 128);
      const lightPage = body.lightPage !== false;

      const redirectPageTitle = (body.redirectPageTitle || "").trim().slice(0, DELAY_TITLE_MAX);
      const redirectPageContent = (body.redirectPageContent || "").trim().slice(0, DELAY_HTML_MAX);

      const defaultTtl = normalizeTtl(env.TTL || 0);
      const ttl = normalizeTtl(body.ttl, defaultTtl);

      const password = (body.password || "").trim();

      let slug = (body.slug || "").trim();
      let updated = false;
      let generatedPassword = null;

      if (slug) {
        if (!/^[a-zA-Z0-9]{3,10}$/.test(slug)) return json({ error: "INVALID_SLUG" }, 400);

        const existing = await env.DATA.get(slug);
        if (existing !== null) {
          if (!password) return json({ error: "SLUG_EXISTS" }, 400);
          const entry = JSON.parse(existing);
          const pwHash = await hashPassword(password);
          if (!(await safeEqual(entry.pwHash, pwHash))) {
            return json({ error: "VERIFY_FAILED" }, 403);
          }
          const updatedEntry = clean({
            ...entry,
            url: target,
            redirectMode: redirectMode,
            permanent: permanent,
            countdown: countdown,
            redirectPageTitle: redirectPageTitle || null,
            redirectPageContent: redirectPageContent || null,
            manualBtnTitle: manualBtnTitle || null,
            lightPage: lightPage,
            ttl: ttl,
            updatedAt: new Date().toISOString(),
          });
          let newPassword = null;
          if (body.resetPassword !== false) {
            newPassword = generatePassword();
            const newPwHash = await hashPassword(newPassword);
            updatedEntry.pwHash = newPwHash;
          }
          const putOpts = {
            metadata: { url: target, clicks: updatedEntry.clicks || 0, createdAt: entry.createdAt || new Date().toISOString() }
          };
          if (ttl > 0) putOpts.expirationTtl = ttl;
          await env.DATA.put(slug, JSON.stringify(updatedEntry), putOpts);
          updated = true;
          const resp = { short_url: getBaseUrl(env, url) + slug, slug, target, updated: true };
          if (newPassword) resp.password = newPassword;
          return json(resp, 200);
        } else if (body.mode === 'modify') {
          return json({ error: "VERIFY_FAILED" }, 403);
        }
      } else {
        let tries = 0;
        do { slug = makeSlug(); tries++; } while (await env.DATA.get(slug) !== null && tries < 5);
        if (await env.DATA.get(slug) !== null) {
          return json({ error: "SLUG_COLLISION" }, 503);
        }
      }

      if (!updated) {
        generatedPassword = generatePassword();
        const pwHash = await hashPassword(generatedPassword);
        const now = new Date().toISOString();
        const newEntry = clean({
          url: target,
          pwHash: pwHash,
          redirectMode: redirectMode,
          permanent: permanent,
          countdown: countdown,
          redirectPageTitle: redirectPageTitle || null,
          redirectPageContent: redirectPageContent || null,
          manualBtnTitle: manualBtnTitle || null,
          ttl: ttl,
          createdAt: now,
          updatedAt: null,
          clicks: 0,
        });
        const newPutOpts = {
          metadata: { url: target, clicks: 0, createdAt: now }
        };
        if (ttl > 0) newPutOpts.expirationTtl = ttl;
        await env.DATA.put(slug, JSON.stringify(newEntry), newPutOpts);
      }

      const resp = { short_url: getBaseUrl(env, url) + slug, slug, target, updated };
      if (generatedPassword) resp.password = generatedPassword;
      return json(resp, updated ? 200 : 201);
    }

    // ── Verify slug password and return entry ──
    if (request.method === 'POST' && path.startsWith('/api/verify/')) {
      const err = await checkAuth(request, env);
      if (err) return err;
      const slug = path.slice('/api/verify/'.length);
      let body;
      try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
      const raw = await env.DATA.get(slug);
      if (!raw) return json({ error: "VERIFY_FAILED" }, 403);
      const entry = JSON.parse(raw);
      const pwHash = await hashPassword((body.password || '').trim());
      if (!(await safeEqual(entry.pwHash, pwHash))) {
        return json({ error: "VERIFY_FAILED" }, 403);
      }
      const { pwHash: _, ...safe } = entry;
      return json({ slug, ...safe });
    }

    // ── URL info (admin) ──
    if (path.startsWith("/api/urls/") && request.method === "GET") {
      const err = await checkAuth(request, env);
      if (err) return err;
      const slug = path.slice("/api/urls/".length);
      const raw = await env.DATA.get(slug);
      if (!raw) return json({ error: "NOT_FOUND" }, 404);
      const { pwHash, ...safe } = JSON.parse(raw);
      return json({ slug, ...safe });
    }

    // ── Delete URL (admin) ──
    if (path.startsWith("/api/urls/") && request.method === "DELETE") {
      const err = await checkAuth(request, env);
      if (err) return err;
      const slug = path.slice("/api/urls/".length);
      if (await env.DATA.get(slug) === null) return json({ error: "NOT_FOUND" }, 404);
      await env.DATA.delete(slug);
      return json({ deleted: slug });
    }

    // ── Redirect (or countdown) ──
    const slug = path.slice(1);
    if (slug && !slug.includes("/")) {
      const raw = await env.DATA.get(slug);
      if (raw) {
        const entry = JSON.parse(raw);
        // NOTE: Click count increment is not atomic — concurrent requests may lose counts.
        // Fixing this properly requires Durable Objects instead of KV.
        const clickOpts = {
          metadata: { url: entry.url, clicks: (entry.clicks || 0) + 1, createdAt: entry.createdAt || new Date().toISOString() }
        };
        if (entry.ttl && entry.ttl > 0) clickOpts.expirationTtl = entry.ttl;
        ctx.waitUntil(
          env.DATA.put(slug, JSON.stringify(clean({ ...entry, clicks: (entry.clicks || 0) + 1 })), clickOpts)
        );
        const mode = entry.redirectMode || 'instant';
        if (mode === 'manual') {
          const acceptLang = request.headers.get("Accept-Language") || "";
          const cdnHost = (request.cf && request.cf.country === 'CN') ? 'cdn.jsdmirror.com' : 'cdn.jsdelivr.net';
          return new Response(countdownPage(entry, acceptLang, cdnHost), {
            headers: { "Content-Type": "text/html;charset=utf-8" },
          });
        }
        return Response.redirect(entry.url, entry.permanent === false ? 302 : 301);
      }
    }

    // Slug not found — redirect to DEFAULT or home
    if (isValidUrl(env.DEFAULT)) {
      return Response.redirect(env.DEFAULT, 302);
    }
    return Response.redirect(getBaseUrl(env, url).replace(/\/$/, '') || url.origin, 302);
  },
};
