/**
 * Shurl — Cloudflare Worker + KV
 *
 * Single-file, zero-dependency. Paste into the CF dashboard editor.
 *
 * Setup:
 *   1. Workers KV → Create namespace (e.g. "URL_STORE")
 *   2. Worker Settings → KV Namespace Bindings → Variable name: DATA → select your namespace
 *   3. (Optional) Secrets → KEY = comma-separated admin keys (enables admin mode)
 *   4. (Optional) Secrets → LOCK = front-end lock screen password (>=4 chars, does not affect API)
 *   5. (Optional) Add variable: TTL = default expiration in seconds (0=permanent, 60-31536000)
 *   6. (Optional) Add variable: LIMIT = public rate limit per 24h (default: 10, create + modify combined)
 *   7. (Optional) Add variable: BASE = short link base URL (e.g. https://s.mydomain.tld)
 *   8. (Optional) Add variable: DEFAULT = fallback redirect URL when slug not found
 */

const GAOBO_PNG_B64 = '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';

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
  var defaults = { countdown: 0, permanent: true, darkBackground: false, centerContent: false, ttl: 0, redirectMode: "instant" };
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
function html(body) {
  return new Response(body, {
    headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" },
  });
}

const BLOCKED_SHORTENER_HOSTS = ['bit.ly','tinyurl.com','t.co','goo.gl','ow.ly','is.gd','buff.ly','adf.ly','bl.ink','rb.gy','short.io','cutt.ly','rebrand.ly','v.gd','qr.ae','1url.com','hyperurl.co'];

function isBlockedTarget(target, requestUrl, env) {
  try {
    const u = new URL(target);
    const host = u.hostname.toLowerCase();
    // Block self-redirect (origin or BASE)
    const origin = requestUrl.origin.toLowerCase();
    if (target.toLowerCase().startsWith(origin)) return true;
    if (env.BASE) {
      const base = env.BASE.trim().replace(/\/$/, '').toLowerCase();
      if (target.toLowerCase().startsWith(base)) return true;
    }
    // Block common shortener services
    if (BLOCKED_SHORTENER_HOSTS.includes(host)) return true;
    return false;
  } catch { return false; }
}

async function createOne(item, slug, validSlug, env, requestUrl) {
  const target = (item.url || "").trim();
  try { const u = new URL(target); if ((u.protocol !== "http:" && u.protocol !== "https:") || !/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(u.hostname)) throw 0; }
  catch { return { error: "INVALID_URL" }; }
  if (isBlockedTarget(target, requestUrl, env)) return { error: "BLOCKED_URL" };

  const redirectMode = item.redirectMode || 'instant';
  if (Array.isArray(item.redirectMode) || (redirectMode !== 'instant' && redirectMode !== 'manual')) {
    return { error: "INVALID_REDIRECT_MODE" };
  }

  let countdown = Math.floor(Number(item.countdown) || 0);
  if (countdown < 0 || countdown > DELAY_MAX) countdown = 0;

  const permanent = item.permanent !== false;
  const manualBtnTitle = (item.manualBtnTitle || '').trim().slice(0, 128);
  const darkBackground = item.darkBackground === true;
  const centerContent = item.centerContent === true;
  const redirectPageTitle = (item.redirectPageTitle || "").trim().slice(0, DELAY_TITLE_MAX);
  const redirectPageContent = (item.redirectPageContent || "").trim().slice(0, DELAY_HTML_MAX);
  const accessPassword = (item.accessPassword || '').trim();
  let accessHash = null;
  let accessWarn = null;
  if (accessPassword && redirectMode === 'manual') {
    if (/^\S{3,16}$/.test(accessPassword)) {
      accessHash = await hashPassword(accessPassword);
    } else {
      accessWarn = "ACCESS_PASSWORD_IGNORED";
    }
  }
  const defaultTtl = normalizeTtl(env.TTL || 0);
  const ttl = normalizeTtl(item.ttl, defaultTtl);

  let newSlug;
  const warnings = [];
  if (accessWarn) warnings.push(accessWarn);
  if (validSlug) {
    if (await env.DATA.get(slug) !== null) return { error: "SLUG_EXISTS" };
    newSlug = slug;
  } else {
    if (slug) warnings.push("SLUG_IGNORED");
    let tries = 0;
    do { newSlug = makeSlug(); tries++; } while (await env.DATA.get(newSlug) !== null && tries < 5);
    if (await env.DATA.get(newSlug) !== null) return { error: "SLUG_COLLISION" };
  }

  const generatedPassword = generatePassword();
  const pwHash = await hashPassword(generatedPassword);
  const now = new Date().toISOString();
  const newEntry = clean({
    url: target, pwHash, redirectMode, permanent,
    countdown: accessHash ? 0 : countdown,
    redirectPageTitle: redirectPageTitle || null,
    redirectPageContent: redirectPageContent || null,
    manualBtnTitle: manualBtnTitle || null,
    accessHash: accessHash || null,
    darkBackground, centerContent, ttl, createdAt: now, updatedAt: null,
  });
  const putOpts = {};
  if (ttl > 0) putOpts.expirationTtl = ttl;
  await env.DATA.put(newSlug, JSON.stringify(newEntry), putOpts);

  const base = getBaseUrl(env, requestUrl);
  const resp = { short_url: base + newSlug, slug: newSlug, target, password: generatedPassword };
  if (warnings.length === 1) resp.warn = warnings[0];
  else if (warnings.length > 1) resp.warn = warnings;
  return resp;
}

function notFound(env, url) {
  if (isValidUrl(env.DEFAULT)) return Response.redirect(env.DEFAULT, 302);
  return Response.redirect(getBaseUrl(env, url).replace(/\/$/, '') || url.origin, 302);
}

// Returns: { isAdmin: true } | { isAdmin: false } | Response (401 error)
// No KEY configured → everyone is admin
// KEY configured + valid key → admin
// KEY configured + no key → public
// KEY configured + wrong key → 401
async function checkAuth(req, env) {
  if (!env.KEY) return { isAdmin: true };
  const auth = req.headers.get("Authorization") || "";
  const key = req.headers.get("X-Admin-Key") || (auth.startsWith("Bearer ") ? auth.slice(7) : "");
  if (!key) return { isAdmin: false };
  const keys = String(env.KEY).split(",").map(k => k.trim()).filter(Boolean);
  for (const k of keys) {
    if (await safeEqual(key, k)) return { isAdmin: true };
  }
  return json({ error: "UNAUTHORIZED" }, 401);
}

const RATE_LIMIT_DEFAULT = 10;

async function getFingerprint(request) {
  const parts = [
    request.headers.get("CF-Connecting-IP") || "",
    (request.headers.get("User-Agent") || "") + "|" + (request.headers.get("Sec-CH-UA") || ""),
    request.headers.get("Accept-Language") || "",
    (request.cf && request.cf.tlsClientExtensionsSha1) || "",
    (request.cf && request.cf.tlsClientCiphersSha1) || "",
  ].join("|");
  return (await hashPassword(parts)).slice(0, 16);
}

async function checkRateLimit(env, request) {
  const fp = await getFingerprint(request);
  const key = "_rl:" + fp;
  const raw = await env.DATA.get(key);
  const limit = Math.floor(Number(env.LIMIT)) || RATE_LIMIT_DEFAULT;
  const now = Date.now();
  if (raw) {
    const data = JSON.parse(raw);
    if (now - new Date(data.lastOp).getTime() < 86400000 && data.count >= limit) {
      return json({ error: "RATE_LIMITED" }, 429);
    }
    if (now - new Date(data.lastOp).getTime() >= 86400000) {
      return { key, data: { count: 0, lastOp: data.lastOp } };
    }
    return { key, data };
  }
  return { key, data: { count: 0, lastOp: new Date(0).toISOString() } };
}

async function incrementRateLimit(env, key, data) {
  await env.DATA.put(key, JSON.stringify({ count: data.count + 1, lastOp: new Date().toISOString() }));
}

// ── i18n strings (shared by landing page & countdown page) ───────────

const I18N_JSON = JSON.stringify({
  en: {
    title: "Shurl",
    tabCreate: "✨ Create",
    tabModify: "✏️ Modify",
    slugLabelCreate: "Custom slug", omittableText: "(leave empty for default)",
    slugLabelModify: "Slug to modify",
    slugPlaceholderCreate: "leave empty for random",
    slugPlaceholderModify: "enter existing slug",
    check: "Verify & Query", adminCheck: "Query",
    targetUrl: "Target URL",
    slugPassword: "Slug Password",
    pwPlaceholder: "password from when you created it",
    pwHint: "Enter the password shown when you first created this slug.",
    ttlOptions: "Expiration",
    ttlHint: "0 = permanent. Min 60 seconds, max 12 months. Invalid input such as negative numbers or decimals will be ignored.",
    ttlUnit_s: "Seconds",
    ttlUnit_m: "Minutes",
    ttlUnit_h: "Hours",
    ttlUnit_d: "Days",
    ttlUnit_mo: "Months",
    redirectOptions: "Redirect options",
    manualSub: "Manual redirect", countdownSub: "Countdown redirect",
    accessPasswordLabel: "Require password from visitor (leave empty for none)",
    countdownSelectLabel: "Countdown seconds",
    accessPromptTitle: "Password required",
    accessPromptPlaceholder: "Enter password",
    accessPromptError: "Incorrect password",
    rdInstant: "Instant redirect",
    rdManual: "Manual or countdown redirect",
    usePermanent: "Use permanent redirect",
    manualBtnLabel: "Redirect / password button title (leave empty for default)",
    manualBtnPlaceholder: "default: Go now",
    manualBtnDefault: "Go now", darkBackground: "Use dark background", centerContent: "Center page content",
    redirectPageTitleLabel: "Redirect page title (leave empty for default)",
    redirectPageTitlePlaceholder: "default: show prompt message",
    redirectPageContentLabel: "Redirect page content (leave empty for default)",
    redirectPageContentPlaceholder: "Compose content...",
    redirectPageContentHint: "Markdown supported.",
    mode_rich: "Rich", mode_md: "MD",
    adminKey: "Admin Key",
    resetPassword: "Renew slug password",
    btnCreate: "Create",
    btnUpdate: "Update", btnDelete: "Delete", confirmDeleteMsg: "Delete this short link?", confirmYes: "Delete", confirmNo: "Cancel",
    created: "✅ Created",
    updated: "♻️ Updated",
    pwBoxLabel: "🔑 Modification password:",
    pwBoxWarn: "Save this now! It will never be shown again.",
    errUrl: "URL is required", errUrlInvalid: "Invalid URL", errUrlBlocked: "Cannot shorten this service or known shorteners",
    errSlug: "Slug is required",
    errPw: "Password is required",
    errNet: "Network error",
    errSlugEmpty: "Enter a slug first",
    errSlugInvalid: "Invalid: 3-10 alphanumeric chars only",
    slugFound: "Verified", adminSlugFound: "Slug found", btnView: "View & Edit",
    slugAuthFail: "Check your identity key",
    defaultRedirectTitle: "Destination URL {url}",
    err_UNAUTHORIZED: "Unauthorized \u2013 check your identity key",
    err_INVALID_JSON: "Invalid request",
    err_INVALID_URL: "Invalid URL",
    err_BLOCKED_URL: "URL points to this service or a known shortener",
    err_INVALID_SLUG: "Invalid slug format",
    err_SLUG_EXISTS: "This slug already exists \u2013 use Modify mode with the password",
   
    err_SLUG_COLLISION: "Failed to generate slug, please try again",
    warn_SLUG_IGNORED: "Custom slug was invalid and ignored, a random slug was assigned",
    err_BATCH_DUPLICATE_SLUG: "Duplicate slug in batch",
    warn_ACCESS_PASSWORD_IGNORED: "Access password was invalid and ignored",
    err_NOT_FOUND: "Not found", err_VERIFY_FAILED: "Slug not found or wrong password",
    err_INVALID_REDIRECT_MODE: "Invalid redirect mode",
    err_INVALID_ACCESS_PASSWORD: "Access password must be 3–16 characters with no spaces",
    err_RATE_LIMITED: "Quota exhausted — resets 24 hours after your last successful operation",
    adminMode: "Admin Mode", adminExit: "Exit", adminEnter: "Enter Admin Mode", adminKeyPlaceholder: "Admin Key", adminCancel: "Cancel", adminSubmit: "Enter", adminKeyWrong: "Invalid key",
    tb_bold: "Bold", tb_italic: "Italic", tb_underline: "Underline", tb_h1: "Heading 1", tb_h2: "Heading 2", tb_h3: "Heading 3", tb_ul: "Bullet list", tb_ol: "Numbered list", tb_blockquote: "Blockquote", tb_code: "Inline code", tb_link: "Insert link", tb_hr: "Horizontal rule",
  },
  "zh-cn": {
    title: "速至短链",
    tabCreate: "✨ 创建",
    tabModify: "✏️ 修改",
    slugLabelCreate: "自定义短码", omittableText: "（可留空）",
    slugLabelModify: "要修改的短码",
    slugPlaceholderCreate: "留空自动生成",
    slugPlaceholderModify: "输入已有短码",
    check: "验证并查询", adminCheck: "查询",
    targetUrl: "目标网址",
    slugPassword: "短码密码",
    pwPlaceholder: "创建时显示的密码",
    pwHint: "输入创建该短码时显示的密码。",
    ttlOptions: "有效时长",
    ttlHint: "0 = 永久有效。最小 60 秒，最长 12 个月。输入无效值或负数、小数等非法值将被忽略。",
    ttlUnit_s: "秒",
    ttlUnit_m: "分钟",
    ttlUnit_h: "小时",
    ttlUnit_d: "天",
    ttlUnit_mo: "月",
    redirectOptions: "跳转选项",
    manualSub: "手动跳转", countdownSub: "倒计时跳转",
    accessPasswordLabel: "要求访问者验证密码（留空则不要求）",
    countdownSelectLabel: "倒计时秒数",
    accessPromptTitle: "需要密码",
    accessPromptPlaceholder: "请输入密码",
    accessPromptError: "密码不正确",
    rdInstant: "立即跳转",
    rdManual: "手动或倒计时跳转",
    usePermanent: "使用永久跳转",
    manualBtnLabel: "加速跳转或密码验证按钮标题（可留空）",
    manualBtnPlaceholder: "默认：马上跳转",
    manualBtnDefault: "马上跳转", darkBackground: "使用暗色背景", centerContent: "页面内容居中",
    redirectPageTitleLabel: "跳转页面标题（可留空）",
    redirectPageTitlePlaceholder: "默认显示提示信息",
    redirectPageContentLabel: "跳转页面内容（可留空）",
    redirectPageContentPlaceholder: "编写内容...",
    redirectPageContentHint: "支持 Markdown 格式",
    mode_rich: "富文本", mode_md: "MD",
    adminKey: "管理密钥",
    resetPassword: "更换当前短链密码",
    btnCreate: "生成",
    btnUpdate: "更新", btnDelete: "删除", confirmDeleteMsg: "确定删除该短链接？", confirmYes: "删除", confirmNo: "取消",
    created: "✅ 已创建",
    updated: "♻️ 已更新",
    pwBoxLabel: "🔑 修改密码：",
    pwBoxWarn: "请立即保存！此密码仅显示一次。",
    errUrl: "请输入网址", errUrlInvalid: "网址格式无效", errUrlBlocked: "不允许缩短本服务或已知短链接服务的网址",
    errSlug: "请输入短码",
    errPw: "请输入密码",
    errNet: "网络错误",
    errSlugEmpty: "请先输入短码",
    errSlugInvalid: "无效：仅限 3-10 位字母数字",
    slugFound: "验证通过", adminSlugFound: "找到短码", btnView: "查看并编辑",
    slugAuthFail: "请检查身份密钥",
    defaultRedirectTitle: "目标网址 {url}",
    err_UNAUTHORIZED: "未授权 – 请检查身份密钥",
    err_INVALID_JSON: "请求无效",
    err_INVALID_URL: "网址格式无效",
    err_BLOCKED_URL: "不允许跳转到本服务或已知短链接服务",
    err_INVALID_SLUG: "短码格式无效",
    err_SLUG_EXISTS: "该短码已存在 – 请切换到修改模式并输入密码",
   
    err_SLUG_COLLISION: "短码生成失败，请重试",
    warn_SLUG_IGNORED: "自定义短码格式无效已忽略，已分配随机短码",
    err_BATCH_DUPLICATE_SLUG: "批量创建中存在重复短码",
    warn_ACCESS_PASSWORD_IGNORED: "访问密码格式无效已忽略",
    err_NOT_FOUND: "未找到", err_VERIFY_FAILED: "短码不存在，或密码错误",
    err_INVALID_REDIRECT_MODE: "无效的跳转模式",
    err_INVALID_ACCESS_PASSWORD: "访问密码须为 3–16 位非空格字符",
    err_RATE_LIMITED: "配额已用尽——将于最后一次成功操作 24 小时后重置",
    adminMode: "管理模式", adminExit: "退出", adminEnter: "进入管理模式", adminKeyPlaceholder: "管理密钥", adminCancel: "取消", adminSubmit: "进入", adminKeyWrong: "管理密钥无效",
    tb_bold: "加粗", tb_italic: "斜体", tb_underline: "下划线", tb_h1: "标题 1", tb_h2: "标题 2", tb_h3: "标题 3", tb_ul: "无序列表", tb_ol: "有序列表", tb_blockquote: "引用", tb_code: "行内代码", tb_link: "插入链接", tb_hr: "水平线",
  },
  "zh-tw": {
    title: "速至短鏈",
    tabCreate: "✨ 建立",
    tabModify: "✏️ 修改",
    slugLabelCreate: "自訂短碼", omittableText: "（可留空）",
    slugLabelModify: "要修改的短碼",
    slugPlaceholderCreate: "留空自動產生",
    slugPlaceholderModify: "輸入現有短碼",
    check: "驗證並查詢", adminCheck: "查詢",
    targetUrl: "目標網址",
    slugPassword: "短碼密碼",
    pwPlaceholder: "建立時顯示的密碼",
    pwHint: "輸入建立該短碼時顯示的密碼。",
    ttlOptions: "有效時長",
    ttlHint: "0 = 永久有效。最小 60 秒，最長 12 個月。輸入無效值或負數、小數等非法值將被忽略。",
    ttlUnit_s: "秒",
    ttlUnit_m: "分鐘",
    ttlUnit_h: "小時",
    ttlUnit_d: "天",
    ttlUnit_mo: "月",
    redirectOptions: "跳轉選項",
    manualSub: "手動跳轉", countdownSub: "倒數跳轉",
    accessPasswordLabel: "要求訪問者驗證密碼（留空則不要求）",
    countdownSelectLabel: "倒數秒數",
    accessPromptTitle: "需要密碼",
    accessPromptPlaceholder: "請輸入密碼",
    accessPromptError: "密碼不正確",
    rdInstant: "立即跳轉",
    rdManual: "手動或倒數跳轉",
    usePermanent: "使用永久跳轉",
    manualBtnLabel: "加速跳轉或密碼驗證按鈕標題（可留空）",
    manualBtnPlaceholder: "預設：馬上跳轉",
    manualBtnDefault: "馬上跳轉", darkBackground: "使用暗色背景", centerContent: "頁面內容置中",
    redirectPageTitleLabel: "跳轉頁面標題（可留空）",
    redirectPageTitlePlaceholder: "預設顯示提示訊息",
    redirectPageContentLabel: "跳轉頁面內容（可留空）",
    redirectPageContentPlaceholder: "編寫內容...",
    redirectPageContentHint: "支援 Markdown 格式",
    mode_rich: "富文字", mode_md: "MD",
    adminKey: "管理金鑰",
    resetPassword: "更換目前短連結密碼",
    btnCreate: "產生",
    btnUpdate: "更新", btnDelete: "刪除", confirmDeleteMsg: "確定刪除該短連結？", confirmYes: "刪除", confirmNo: "取消",
    created: "✅ 已建立",
    updated: "♻️ 已更新",
    pwBoxLabel: "🔑 修改密碼：",
    pwBoxWarn: "請立即儲存！此密碼僅顯示一次。",
    errUrl: "請輸入網址", errUrlInvalid: "網址格式無效", errUrlBlocked: "不允許縮短本服務或已知短連結服務的網址",
    errSlug: "請輸入短碼",
    errPw: "請輸入密碼",
    errNet: "網路錯誤",
    errSlugEmpty: "請先輸入短碼",
    errSlugInvalid: "無效：僅限 3-10 位英數字元",
    slugFound: "驗證通過", adminSlugFound: "找到短碼", btnView: "查��並編輯",
    slugAuthFail: "請檢查身分金鑰",
    defaultRedirectTitle: "目標網址 {url}",
    err_UNAUTHORIZED: "未授權 – 請檢查身分金鑰",
    err_INVALID_JSON: "請求無效",
    err_INVALID_URL: "網址格式無效",
    err_BLOCKED_URL: "不允許跳轉到本服務或已知短連結服務",
    err_INVALID_SLUG: "短碼格式無效",
    err_SLUG_EXISTS: "該短碼已存在 – 請切換到修改模式並輸入密碼",
    err_SLUG_COLLISION: "短碼產生失敗，請重試",
    warn_SLUG_IGNORED: "自訂短碼格式無效已忽略，已分配隨機短碼",
    err_BATCH_DUPLICATE_SLUG: "批量建立中存在重複短碼",
    warn_ACCESS_PASSWORD_IGNORED: "存取密碼格式無效已忽略",
    err_NOT_FOUND: "未找到", err_VERIFY_FAILED: "短碼不存在，或密碼錯誤",
    err_INVALID_REDIRECT_MODE: "無效的跳轉模式",
    err_INVALID_ACCESS_PASSWORD: "存取密碼須為 3–16 位非空格字元",
    err_RATE_LIMITED: "配額已用盡——將於最後一次成功操作 24 小時後重置",
    adminMode: "管理模式", adminExit: "退出", adminEnter: "進入管理模式", adminKeyPlaceholder: "管理金鑰", adminCancel: "取消", adminSubmit: "進入", adminKeyWrong: "管理金鑰無效",
    tb_bold: "粗體", tb_italic: "斜體", tb_underline: "底線", tb_h1: "標題 1", tb_h2: "標題 2", tb_h3: "標題 3", tb_ul: "無序清單", tb_ol: "有序清單", tb_blockquote: "引用", tb_code: "行內程式碼", tb_link: "插入連結", tb_hr: "水平線",
  },
  ja: {
    title: "Shurl",
    tabCreate: "✨ 作成",
    tabModify: "✏️ 変更",
    slugLabelCreate: "カスタムスラッグ", omittableText: "（空欄可）",
    slugLabelModify: "変更するスラッグ",
    slugPlaceholderCreate: "空欄で自動生成",
    slugPlaceholderModify: "既存のスラッグを入力",
    check: "認証して照会", adminCheck: "照会",
    targetUrl: "転送先URL",
    slugPassword: "スラッグパスワード",
    pwPlaceholder: "作成時に表示されたパスワード",
    pwHint: "作成時に表示されたパスワードを入力してください。",
    ttlOptions: "有効期限",
    ttlHint: "0 = 無期限。最小60秒、最大12ヶ月。無効な値や負数・小数などは無視されます。",
    ttlUnit_s: "秒",
    ttlUnit_m: "分",
    ttlUnit_h: "時間",
    ttlUnit_d: "日",
    ttlUnit_mo: "ヶ月",
    redirectOptions: "リダイレクト設定",
    manualSub: "手動リダイレクト", countdownSub: "カウントダウンリダイレクト",
    accessPasswordLabel: "訪問者にパスワードを要求（空欄は不要）",
    countdownSelectLabel: "カウントダウン秒数",
    accessPromptTitle: "パスワードが必要です",
    accessPromptPlaceholder: "パスワードを入力",
    accessPromptError: "パスワードが正しくありません",
    rdInstant: "即座リダイレクト",
    rdManual: "手動またはカウントダウンリダイレクト",
    usePermanent: "恒久リダイレクトを使用",
    manualBtnLabel: "リダイレクト／パスワードボタンのタイトル（空欄可）",
    manualBtnPlaceholder: "デフォルト：すぐに移動",
    manualBtnDefault: "すぐに移動", darkBackground: "ダークモードを使用", centerContent: "ページ内容を中央揃え",
    redirectPageTitleLabel: "リダイレクトページのタイトル（空欄可）",
    redirectPageTitlePlaceholder: "デフォルト：案内メッセージを表示",
    redirectPageContentLabel: "リダイレクトページの内容（空欄可）",
    redirectPageContentPlaceholder: "内容を入力...",
    redirectPageContentHint: "Markdown対応",
    mode_rich: "リッチ", mode_md: "MD",
    adminKey: "管理キー",
    resetPassword: "スラッグパスワードを更新",
    btnCreate: "短縮",
    btnUpdate: "更新", btnDelete: "削除", confirmDeleteMsg: "この短縮リンクを削除しますか？", confirmYes: "削除", confirmNo: "キャンセル",
    created: "✅ 作成完了",
    updated: "♻️ 更新完了",
    pwBoxLabel: "🔑 変更用パスワード：",
    pwBoxWarn: "今すぐ保存してください！二度と表示されません。",
    errUrl: "URLを入力してください", errUrlInvalid: "無効なURL", errUrlBlocked: "このサービスや既知の短縮URLは短縮できません",
    errSlug: "スラッグを入力してください",
    errPw: "パスワードを入力してください",
    errNet: "ネットワークエラー",
    errSlugEmpty: "先にスラッグを入力してください",
    errSlugInvalid: "無効：英数字3〜10文字のみ",
    slugFound: "確認済み", adminSlugFound: "スラッグが見つかりました", btnView: "表示・編集",
    slugAuthFail: "認証キーを確認してください",
    defaultRedirectTitle: "転送先URL {url}",
    err_UNAUTHORIZED: "認証エラー – 認証キーを確認してください",
    err_INVALID_JSON: "無効なリクエスト",
    err_INVALID_URL: "無効なURL",
    err_BLOCKED_URL: "このサービスまたは既知の短縮URLへのリダイレクトは禁止されています",
    err_INVALID_SLUG: "無効なスラッグ形式",
    err_SLUG_EXISTS: "このスラッグは既に存在します – 変更モードでパスワードを入力してください",
   
    err_SLUG_COLLISION: "スラッグ生成に失敗しました。再試行してください",
    warn_SLUG_IGNORED: "カスタムスラッグが無効のため無視され、ランダムスラッグが割り当てられました",
    err_BATCH_DUPLICATE_SLUG: "バッチ内にスラッグが重複しています",
    warn_ACCESS_PASSWORD_IGNORED: "アクセスパスワードが無効のため無視されました",
    err_NOT_FOUND: "見つかりません", err_VERIFY_FAILED: "スラッグが見つからないか、パスワードが違います",
    err_INVALID_REDIRECT_MODE: "無効なリダイレクトモード",
    err_INVALID_ACCESS_PASSWORD: "アクセスパスワードは3〜16文字（スペース不可）",
    err_RATE_LIMITED: "クォータ超過——最後の操作から24時間後にリセットされます",
    adminMode: "管理モード", adminExit: "終了", adminEnter: "管理モードに入る", adminKeyPlaceholder: "管理キー", adminCancel: "キャンセル", adminSubmit: "入る", adminKeyWrong: "管理キーが無効です",
    tb_bold: "太字", tb_italic: "斜体", tb_underline: "下線", tb_h1: "見出し 1", tb_h2: "見出し 2", tb_h3: "見出し 3", tb_ul: "箇条書き", tb_ol: "番号付きリスト", tb_blockquote: "引用", tb_code: "インラインコード", tb_link: "リンクを挿入", tb_hr: "水平線",
  },
  ko: {
    title: "Shurl",
    tabCreate: "✨ 만들기",
    tabModify: "✏️ 수정",
    slugLabelCreate: "사용자 정의 슬러그", omittableText: "(비워두기 가능)",
    slugLabelModify: "수정할 슬러그",
    slugPlaceholderCreate: "비워두면 자동 생성",
    slugPlaceholderModify: "기존 슬러그 입력",
    check: "인증 및 조회", adminCheck: "조회",
    targetUrl: "대상 URL",
    slugPassword: "슬러그 비밀번호",
    pwPlaceholder: "생성 시 표시된 비밀번호",
    pwHint: "슬러그 생성 시 표시된 비밀번호를 입력하세요.",
    ttlOptions: "유효 기간",
    ttlHint: "0 = 영구. 최소 60초, 최대 12개월. 잘못된 값이나 음수, 소수 등은 무시됩니다.",
    ttlUnit_s: "초",
    ttlUnit_m: "분",
    ttlUnit_h: "시간",
    ttlUnit_d: "일",
    ttlUnit_mo: "개월",
    redirectOptions: "리다이렉트 옵션",
    manualSub: "수동 리다이렉트", countdownSub: "카운트다운 리다이렉트",
    accessPasswordLabel: "방문자에게 비밀번호 요구 (비워두면 불필요)",
    countdownSelectLabel: "카운트다운 초",
    accessPromptTitle: "비밀번호 필요",
    accessPromptPlaceholder: "비밀번호 입력",
    accessPromptError: "비밀번호가 올바르지 않습니다",
    rdInstant: "즉시 리다이렉트",
    rdManual: "수동 또는 카운트다운 리다이렉트",
    usePermanent: "영구 리다이렉트 사용",
    manualBtnLabel: "리다이렉트/비밀번호 버튼 제목 (비워두기 가능)",
    manualBtnPlaceholder: "기본: 바로 이동",
    manualBtnDefault: "바로 이동", darkBackground: "어두운 배경 사용", centerContent: "페이지 내용 가운데 정렬",
    redirectPageTitleLabel: "리다이렉트 페이지 제목 (비워두기 가능)",
    redirectPageTitlePlaceholder: "기본: 안내 메시지 표시",
    redirectPageContentLabel: "리다이렉트 페이지 내용 (비워두기 가능)",
    redirectPageContentPlaceholder: "내용 작성...",
    redirectPageContentHint: "Markdown 지원",
    mode_rich: "서식", mode_md: "MD",
    adminKey: "관리 키",
    resetPassword: "슬러그 비밀번호 갱신",
    btnCreate: "단축",
    btnUpdate: "업데이트", btnDelete: "삭제", confirmDeleteMsg: "이 단축 링크를 삭제하시겠습니까?", confirmYes: "삭제", confirmNo: "취소",
    created: "✅ 생성됨",
    updated: "♻️ 업데이트됨",
    pwBoxLabel: "🔑 수정 비밀번호:",
    pwBoxWarn: "지금 저장하세요! 다시 표시되지 않습니다.",
    errUrl: "URL이 필요합니다", errUrlInvalid: "잘못된 URL", errUrlBlocked: "이 서비스나 알려진 단축 URL은 단축할 수 없습니다",
    errSlug: "슬러그가 필요합니다",
    errPw: "비밀번호가 필요합니다",
    errNet: "네트워크 오류",
    errSlugEmpty: "먼저 슬러그를 입력하세요",
    errSlugInvalid: "유효하지 않음: 영숫자 3-10자만",
    slugFound: "확인됨", adminSlugFound: "슬러그 찾음", btnView: "보기 및 편집",
    slugAuthFail: "인증 키를 확인하세요",
    defaultRedirectTitle: "대상 URL {url}",
    err_UNAUTHORIZED: "인증 실패 – 인증 키를 확인하세요",
    err_INVALID_JSON: "잘못된 요청",
    err_INVALID_URL: "잘못된 URL",
    err_BLOCKED_URL: "이 서비스 또는 알려진 단축 URL로의 리디렉션은 금지됩니다",
    err_INVALID_SLUG: "잘못된 슬러그 형식",
    err_SLUG_EXISTS: "이 슬러그는 이미 존재합니다 – 수정 모드에서 비밀번호를 입력하세요",
   
    err_SLUG_COLLISION: "슬러그 생성 실패, 다시 시도하세요",
    warn_SLUG_IGNORED: "사용자 지정 슬러그가 유효하지 않아 무시되었으며, 임의 슬러그가 할당되었습니다",
    err_BATCH_DUPLICATE_SLUG: "배치 내 슬러그 중복",
    warn_ACCESS_PASSWORD_IGNORED: "접근 비밀번호가 유효하지 않아 무시되었습니다",
    err_NOT_FOUND: "찾을 수 없음", err_VERIFY_FAILED: "슬러그를 찾을 수 없거나 비밀번호가 틀렸습니다",
    err_INVALID_REDIRECT_MODE: "잘못된 리다이렉트 모드",
    err_INVALID_ACCESS_PASSWORD: "접근 비밀번호는 3~16자, 공백 불가",
    err_RATE_LIMITED: "할당량 소진 — 마지막 작업 후 24시간 뒤 초기화됩니다",
    adminMode: "관리 모드", adminExit: "나가기", adminEnter: "관리 모드 진입", adminKeyPlaceholder: "관리 키", adminCancel: "취소", adminSubmit: "진입", adminKeyWrong: "키가 유효하지 않습니다",
    tb_bold: "굵게", tb_italic: "기울임", tb_underline: "밑줄", tb_h1: "제목 1", tb_h2: "제목 2", tb_h3: "제목 3", tb_ul: "글머리 기호", tb_ol: "번호 목록", tb_blockquote: "인용", tb_code: "인라인 코드", tb_link: "링크 삽입", tb_hr: "구분선",
  },
  ms: {
    title: "Shurl",
    tabCreate: "✨ Cipta",
    tabModify: "✏️ Ubah",
    slugLabelCreate: "Slug tersuai", omittableText: "(boleh dikosongkan)",
    slugLabelModify: "Slug untuk diubah",
    slugPlaceholderCreate: "kosongkan untuk rawak",
    slugPlaceholderModify: "masukkan slug sedia ada",
    check: "Sahkan & Semak", adminCheck: "Semak",
    targetUrl: "URL Sasaran",
    slugPassword: "Kata laluan slug",
    pwPlaceholder: "kata laluan semasa dicipta",
    pwHint: "Masukkan kata laluan yang dipaparkan semasa slug ini dicipta.",
    ttlOptions: "Tempoh sah",
    ttlHint: "0 = kekal. Min 60 saat, maks 12 bulan. Nilai tidak sah seperti nombor negatif atau perpuluhan akan diabaikan.",
    ttlUnit_s: "Saat",
    ttlUnit_m: "Minit",
    ttlUnit_h: "Jam",
    ttlUnit_d: "Hari",
    ttlUnit_mo: "Bulan",
    redirectOptions: "Pilihan pengalihan",
    manualSub: "Pengalihan manual", countdownSub: "Pengalihan undur detik",
    accessPasswordLabel: "Minta kata laluan daripada pelawat (kosongkan jika tidak perlu)",
    countdownSelectLabel: "Saat undur detik",
    accessPromptTitle: "Kata laluan diperlukan",
    accessPromptPlaceholder: "Masukkan kata laluan",
    accessPromptError: "Kata laluan salah",
    rdInstant: "Pengalihan serta-merta",
    rdManual: "Pengalihan manual atau undur detik",
    usePermanent: "Gunakan pengalihan kekal",
    manualBtnLabel: "Tajuk butang pengalihan/kata laluan (boleh dikosongkan)",
    manualBtnPlaceholder: "lalai: Pergi sekarang",
    manualBtnDefault: "Pergi sekarang", darkBackground: "Gunakan latar gelap", centerContent: "Pusatkan kandungan halaman",
    redirectPageTitleLabel: "Tajuk halaman pengalihan (boleh dikosongkan)",
    redirectPageTitlePlaceholder: "lalai: papar mesej panduan",
    redirectPageContentLabel: "Kandungan halaman pengalihan (boleh dikosongkan)",
    redirectPageContentPlaceholder: "Tulis kandungan...",
    redirectPageContentHint: "Sokongan Markdown",
    mode_rich: "Kaya", mode_md: "MD",
    adminKey: "Kunci Pentadbir",
    resetPassword: "Baharu kata laluan slug",
    btnCreate: "Pendekkan",
    btnUpdate: "Kemas kini", btnDelete: "Padam", confirmDeleteMsg: "Padam pautan pendek ini?", confirmYes: "Padam", confirmNo: "Batal",
    created: "✅ Dicipta",
    updated: "♻️ Dikemas kini",
    pwBoxLabel: "🔑 Kata laluan ubah suai:",
    pwBoxWarn: "Simpan sekarang! Tidak akan dipaparkan lagi.",
    errUrl: "URL diperlukan", errUrlInvalid: "URL tidak sah", errUrlBlocked: "Tidak boleh memendekkan perkhidmatan ini atau pemendek URL yang diketahui",
    errSlug: "Slug diperlukan",
    errPw: "Kata laluan diperlukan",
    errNet: "Ralat rangkaian",
    errSlugEmpty: "Masukkan slug dahulu",
    errSlugInvalid: "Tidak sah: 3-10 aksara alfanumerik sahaja",
    slugFound: "Disahkan", adminSlugFound: "Slug ditemui", btnView: "Lihat & Edit",
    slugAuthFail: "Semak kunci identiti anda",
    defaultRedirectTitle: "URL sasaran {url}",
    err_UNAUTHORIZED: "Tidak dibenarkan – semak kunci identiti anda",
    err_INVALID_JSON: "Permintaan tidak sah",
    err_INVALID_URL: "URL tidak sah",
    err_BLOCKED_URL: "URL menghala ke perkhidmatan ini atau pemendek URL yang diketahui",
    err_INVALID_SLUG: "Format slug tidak sah",
    err_SLUG_EXISTS: "Slug ini sudah wujud – gunakan mod Ubah dengan kata laluan",
   
    err_SLUG_COLLISION: "Gagal menjana slug, sila cuba lagi",
    warn_SLUG_IGNORED: "Slug tersuai tidak sah dan diabaikan, slug rawak telah ditetapkan",
    err_BATCH_DUPLICATE_SLUG: "Slug pendua dalam kelompok",
    warn_ACCESS_PASSWORD_IGNORED: "Kata laluan akses tidak sah dan diabaikan",
    err_NOT_FOUND: "Tidak ditemui", err_VERIFY_FAILED: "Slug tidak ditemui atau kata laluan salah",
    err_INVALID_REDIRECT_MODE: "Mod pengalihan tidak sah",
    err_INVALID_ACCESS_PASSWORD: "Kata laluan akses mestilah 3–16 aksara tanpa ruang",
    err_RATE_LIMITED: "Kuota habis — ditetapkan semula 24 jam selepas operasi terakhir",
    adminMode: "Mod Pentadbir", adminExit: "Keluar", adminEnter: "Masuk Mod Pentadbir", adminKeyPlaceholder: "Kunci Pentadbir", adminCancel: "Batal", adminSubmit: "Masuk", adminKeyWrong: "Kunci tidak sah",
    tb_bold: "Tebal", tb_italic: "Condong", tb_underline: "Garis bawah", tb_h1: "Tajuk 1", tb_h2: "Tajuk 2", tb_h3: "Tajuk 3", tb_ul: "Senarai titik", tb_ol: "Senarai bernombor", tb_blockquote: "Petikan", tb_code: "Kod sebaris", tb_link: "Sisip pautan", tb_hr: "Garisan mendatar",
  },
  vi: {
    title: "Shurl",
    tabCreate: "✨ Tạo",
    tabModify: "✏️ Sửa",
    slugLabelCreate: "Slug tùy chỉnh", omittableText: "(có thể để trống)",
    slugLabelModify: "Slug cần sửa",
    slugPlaceholderCreate: "để trống để tạo ngẫu nhiên",
    slugPlaceholderModify: "nhập slug hiện có",
    check: "Xác minh & Truy vấn", adminCheck: "Truy vấn",
    targetUrl: "URL đích",
    slugPassword: "Mật khẩu slug",
    pwPlaceholder: "mật khẩu khi tạo",
    pwHint: "Nhập mật khẩu được hiển thị khi bạn tạo slug này.",
    ttlOptions: "Thời hạn",
    ttlHint: "0 = vĩnh viễn. Tối thiểu 60 giây, tối đa 12 tháng. Giá trị không hợp lệ như số âm, số thập phân sẽ bị bỏ qua.",
    ttlUnit_s: "Giây",
    ttlUnit_m: "Phút",
    ttlUnit_h: "Giờ",
    ttlUnit_d: "Ngày",
    ttlUnit_mo: "Tháng",
    redirectOptions: "Tùy chọn chuyển hướng",
    manualSub: "Chuyển hướng thủ công", countdownSub: "Chuyển hướng đếm ngược",
    accessPasswordLabel: "Yêu cầu mật khẩu từ khách (để trống nếu không cần)",
    countdownSelectLabel: "Giây đếm ngược",
    accessPromptTitle: "Cần mật khẩu",
    accessPromptPlaceholder: "Nhập mật khẩu",
    accessPromptError: "Mật khẩu không đúng",
    rdInstant: "Chuyển hướng ngay",
    rdManual: "Chuyển hướng thủ công hoặc đếm ngược",
    usePermanent: "Dùng chuyển hướng vĩnh viễn",
    manualBtnLabel: "Tiêu đề nút chuyển hướng/mật khẩu (có thể để trống)",
    manualBtnPlaceholder: "mặc định: Đi ngay",
    manualBtnDefault: "Đi ngay", darkBackground: "Dùng nền tối", centerContent: "Căn giữa nội dung trang",
    redirectPageTitleLabel: "Tiêu đề trang chuyển hướng (có thể để trống)",
    redirectPageTitlePlaceholder: "mặc định: hiện thông báo hướng dẫn",
    redirectPageContentLabel: "Nội dung trang chuyển hướng (có thể để trống)",
    redirectPageContentPlaceholder: "Soạn nội dung...",
    redirectPageContentHint: "Hỗ trợ Markdown",
    mode_rich: "Định dạng", mode_md: "MD",
    adminKey: "Khóa quản trị",
    resetPassword: "Đổi mật khẩu slug",
    btnCreate: "Rút gọn",
    btnUpdate: "Cập nhật", btnDelete: "Xóa", confirmDeleteMsg: "Xóa liên kết ngắn này?", confirmYes: "Xóa", confirmNo: "Hủy",
    created: "✅ Đã tạo",
    updated: "♻️ Đã cập nhật",
    pwBoxLabel: "🔑 Mật khẩu sửa đổi:",
    pwBoxWarn: "Lưu ngay! Sẽ không hiển thị lại.",
    errUrl: "Cần URL", errUrlInvalid: "URL không hợp lệ", errUrlBlocked: "Không thể rút gọn dịch vụ này hoặc dịch vụ rút gọn URL đã biết",
    errSlug: "Cần slug",
    errPw: "Cần mật khẩu",
    errNet: "Lỗi mạng",
    errSlugEmpty: "Nhập slug trước",
    errSlugInvalid: "Không hợp lệ: chỉ 3-10 ký tự chữ-số",
    slugFound: "Đã xác minh", adminSlugFound: "Đã tìm thấy slug", btnView: "Xem & Sửa",
    slugAuthFail: "Kiểm tra khóa xác thực",
    defaultRedirectTitle: "URL đích {url}",
    err_UNAUTHORIZED: "Không được phép – kiểm tra khóa xác thực",
    err_INVALID_JSON: "Yêu cầu không hợp lệ",
    err_INVALID_URL: "URL không hợp lệ",
    err_BLOCKED_URL: "URL trỏ đến dịch vụ này hoặc dịch vụ rút gọn URL đã biết",
    err_INVALID_SLUG: "Định dạng slug không hợp lệ",
    err_SLUG_EXISTS: "Slug này đã tồn tại – chuyển sang chế độ Sửa và nhập mật khẩu",
   
    err_SLUG_COLLISION: "Tạo slug thất bại, vui lòng thử lại",
    warn_SLUG_IGNORED: "Slug tùy chỉnh không hợp lệ đã bị bỏ qua, slug ngẫu nhiên đã được gán",
    err_BATCH_DUPLICATE_SLUG: "Slug trùng lặp trong lô",
    warn_ACCESS_PASSWORD_IGNORED: "Mật khẩu truy cập không hợp lệ đã bị bỏ qua",
    err_NOT_FOUND: "Không tìm thấy", err_VERIFY_FAILED: "Không tìm thấy slug hoặc sai mật khẩu",
    err_INVALID_REDIRECT_MODE: "Chế độ chuyển hướng không hợp lệ",
    err_INVALID_ACCESS_PASSWORD: "Mật khẩu truy cập phải từ 3–16 ký tự, không chứa khoảng trắng",
    err_RATE_LIMITED: "Đã hết hạn mức — đặt lại sau 24 giờ kể từ thao tác cuối",
    adminMode: "Chế độ quản trị", adminExit: "Thoát", adminEnter: "Vào chế độ quản trị", adminKeyPlaceholder: "Khóa quản trị", adminCancel: "Hủy", adminSubmit: "Vào", adminKeyWrong: "Khóa không hợp lệ",
    tb_bold: "Đậm", tb_italic: "Nghiêng", tb_underline: "Gạch chân", tb_h1: "Tiêu đề 1", tb_h2: "Tiêu đề 2", tb_h3: "Tiêu đề 3", tb_ul: "Danh sách", tb_ol: "Danh sách số", tb_blockquote: "Trích dẫn", tb_code: "Mã nội dòng", tb_link: "Chèn liên kết", tb_hr: "Đường kẻ ngang",
  },
  th: {
    title: "Shurl",
    tabCreate: "✨ สร้าง",
    tabModify: "✏️ แก้ไข",
    slugLabelCreate: "slug กำหนดเอง", omittableText: "(เว้นว่างได้)",
    slugLabelModify: "slug ที่ต้องการแก้ไข",
    slugPlaceholderCreate: "เว้นว่างเพื่อสุ่ม",
    slugPlaceholderModify: "ใส่ slug ที่มีอยู่",
    check: "ยืนยันและสอบถาม", adminCheck: "สอบถาม",
    targetUrl: "URL ปลายทาง",
    slugPassword: "รหัสผ่าน slug",
    pwPlaceholder: "รหัสผ่านที่แสดงตอนสร้าง",
    pwHint: "ใส่รหัสผ่านที่แสดงเมื่อคุณสร้าง slug นี้",
    ttlOptions: "ระยะเวลาใช้งาน",
    ttlHint: "0 = ถาวร ขั้นต่ำ 60 วินาที สูงสุด 12 เดือน ค่าที่ไม่ถูกต้อง เช่น ค่าลบ ทศนิยม จะถูกละเว้น",
    ttlUnit_s: "วินาที",
    ttlUnit_m: "นาที",
    ttlUnit_h: "ชั่วโมง",
    ttlUnit_d: "วัน",
    ttlUnit_mo: "เดือน",
    redirectOptions: "ตั้งค่าการเปลี่ยนเส้นทาง",
    manualSub: "เปลี่ยนเส้นทางแบบกดเอง", countdownSub: "เปลี่ยนเส้นทางแบบนับถอยหลัง",
    accessPasswordLabel: "ต้องการรหัสผ่านจากผู้เยี่ยมชม (เว้นว่างหากไม่ต้องการ)",
    countdownSelectLabel: "วินาทีนับถอยหลัง",
    accessPromptTitle: "ต้องใส่รหัสผ่าน",
    accessPromptPlaceholder: "ใส่รหัสผ่าน",
    accessPromptError: "รหัสผ่านไม่ถูกต้อง",
    rdInstant: "เปลี่ยนเส้นทางทันที",
    rdManual: "เปลี่ยนเส้นทางแบบกดเองหรือนับถอยหลัง",
    usePermanent: "ใช้การเปลี่ยนเส้นทางถาวร",
    manualBtnLabel: "ชื่อปุ่มเปลี่ยนเส้นทาง/รหัสผ่าน (เว้นว่างได้)",
    manualBtnPlaceholder: "ค่าเริ่มต้น: ไปทันที",
    manualBtnDefault: "ไปทันที", darkBackground: "ใช้พื้นหลังมืด", centerContent: "จัดเนื้อหาหน้าให้อยู่กลาง",
    redirectPageTitleLabel: "ชื่อหน้าเปลี่ยนเส้นทาง (เว้นว่างได้)",
    redirectPageTitlePlaceholder: "ค่าเริ่มต้น: แสดงข้อความแนะนำ",
    redirectPageContentLabel: "เนื้อหาหน้าเปลี่ยนเส้นทาง (เว้นว่างได้)",
    redirectPageContentPlaceholder: "เขียนเนื้อหา...",
    redirectPageContentHint: "รองรับ Markdown",
    mode_rich: "ริช", mode_md: "MD",
    adminKey: "คีย์ผู้ดูแล",
    resetPassword: "เปลี่ยนรหัสผ่าน slug",
    btnCreate: "ย่อลิงก์",
    btnUpdate: "อัปเดต", btnDelete: "ลบ", confirmDeleteMsg: "ลบลิงก์สั้นนี้?", confirmYes: "ลบ", confirmNo: "ยกเลิก",
    created: "✅ สร้างแล้ว",
    updated: "♻️ อัปเดตแล้ว",
    pwBoxLabel: "🔑 รหัสผ่านสำหรับแก้ไข:",
    pwBoxWarn: "บันทึกเลย! จะไม่แสดงอีก",
    errUrl: "กรุณาใส่ URL", errUrlInvalid: "URL ไม่ถูกต้อง", errUrlBlocked: "ไม่สามารถย่อบริการนี้หรือบริการย่อ URL ที่รู้จัก",
    errSlug: "กรุณาใส่ slug",
    errPw: "กรุณาใส่รหัสผ่าน",
    errNet: "เครือข่ายผิดพลาด",
    errSlugEmpty: "กรุณาใส่ slug ก่อน",
    errSlugInvalid: "ไม่ถูกต้อง: ตัวอักษร-ตัวเลข 3-10 ตัวเท่านั้น",
    slugFound: "ยืนยันแล้ว", adminSlugFound: "พบ slug", btnView: "ดู & แก้ไข",
    slugAuthFail: "ตรวจสอบคีย์ยืนยันตัวตน",
    defaultRedirectTitle: "URL ปลายทาง {url}",
    err_UNAUTHORIZED: "ไม่ได้รับอนุญาต – ตรวจสอบคีย์ยืนยันตัวตน",
    err_INVALID_JSON: "คำขอไม่ถูกต้อง",
    err_INVALID_URL: "URL ไม่ถูกต้อง",
    err_BLOCKED_URL: "URL ชี้ไปยังบริการนี้หรือบริการย่อ URL ที่รู้จัก",
    err_INVALID_SLUG: "รูปแบบ slug ไม่ถูกต้อง",
    err_SLUG_EXISTS: "slug นี้มีอยู่แล้ว – ใช้โหมดแก้ไขพร้อมรหัสผ่าน",
   
    err_SLUG_COLLISION: "สร้าง slug ไม่สำเร็จ กรุณาลองใหม่",
    warn_SLUG_IGNORED: "slug ที่กำหนดเองไม่ถูกต้องและถูกละเว้น ระบบได้กำหนด slug แบบสุ่มแล้ว",
    err_BATCH_DUPLICATE_SLUG: "slug ซ้ำในชุด",
    warn_ACCESS_PASSWORD_IGNORED: "รหัสผ่านเข้าถึงไม่ถูกต้องและถูกละเว้น",
    err_NOT_FOUND: "ไม่พบ", err_VERIFY_FAILED: "ไม่พบ slug หรือรหัสผ่านผิด",
    err_INVALID_REDIRECT_MODE: "โหมดเปลี่ยนเส้นทางไม่ถูกต้อง",
    err_INVALID_ACCESS_PASSWORD: "รหัสผ่านเข้าถึงต้องมี 3–16 ตัวอักษร ห้ามมีช่องว่าง",
    err_RATE_LIMITED: "โควตาหมด — รีเซ็ต 24 ชั่วโมงหลังการดำเนินการสำเร็จครั้งสุดท้าย",
    adminMode: "โหมดผู้ดูแล", adminExit: "ออก", adminEnter: "เข้าสู่โหมดผู้ดูแล", adminKeyPlaceholder: "คีย์ผู้ดูแล", adminCancel: "ยกเลิก", adminSubmit: "เข้าสู่", adminKeyWrong: "คีย์ไม่ถูกต้อง",
    tb_bold: "ตัวหนา", tb_italic: "ตัวเอียง", tb_underline: "ขีดเส้นใต้", tb_h1: "หัวข้อ 1", tb_h2: "หัวข้อ 2", tb_h3: "หัวข้อ 3", tb_ul: "รายการจุด", tb_ol: "รายการเลข", tb_blockquote: "คำพูด", tb_code: "โค้ดในบรรทัด", tb_link: "แทรกลิงก์", tb_hr: "เส้นแนวนอน",
  },
  ta: {
    title: "Shurl",
    tabCreate: "✨ உருவாக்கு",
    tabModify: "✏️ மாற்று",
    slugLabelCreate: "தனிப்பயன் slug", omittableText: "(காலியாக விடலாம்)",
    slugLabelModify: "மாற்ற வேண்டிய slug",
    slugPlaceholderCreate: "தானாக உருவாக்க காலியாக விடுக",
    slugPlaceholderModify: "இருக்கும் slug ஐ உள்ளிடுக",
    check: "சரிபார் & வினவு", adminCheck: "வினவு",
    targetUrl: "இலக்கு URL",
    slugPassword: "Slug கடவுச்சொல்",
    pwPlaceholder: "உருவாக்கும்போது காட்டிய கடவுச்சொல்",
    pwHint: "இந்த slug ஐ உருவாக்கும்போது காட்டிய கடவுச்சொல்லை உள்ளிடுக.",
    ttlOptions: "செல்லுபடி காலம்",
    ttlHint: "0 = நிரந்தரம். குறைந்தது 60 வினாடி, அதிகபட்சம் 12 மாதங்கள். எதிர்மறை எண், தசமம் போன்ற தவறான மதிப்புகள் புறக்கணிக்கப்படும்.",
    ttlUnit_s: "வினாடி",
    ttlUnit_m: "நிமிடம்",
    ttlUnit_h: "மணி",
    ttlUnit_d: "நாள்",
    ttlUnit_mo: "மாதம்",
    redirectOptions: "திசைமாற்ற விருப்பங்கள்",
    manualSub: "கைமுறை திசைமாற்றம்", countdownSub: "கவுண்ட்டவுன் திசைமாற்றம்",
    accessPasswordLabel: "பார்வையாளரிடம் கடவுச்சொல் கேட்க (காலியாக விட்டால் தேவையில்லை)",
    countdownSelectLabel: "கவுண்ட்டவுன் வினாடிகள்",
    accessPromptTitle: "கடவுச்சொல் தேவை",
    accessPromptPlaceholder: "கடவுச்சொல்லை உள்ளிடவும்",
    accessPromptError: "கடவுச்சொல் தவறானது",
    rdInstant: "உடனடி திசைமாற்றம்",
    rdManual: "கைமுறை அல்லது கவுண்ட்டவுன் திசைமாற்றம்",
    usePermanent: "நிரந்தர திசைமாற்றம் பயன்படுத்து",
    manualBtnLabel: "திசைமாற்ற/கடவுச்சொல் பொத்தான் தலைப்பு (காலியாக விடலாம்)",
    manualBtnPlaceholder: "இயல்பு: உடனே செல்",
    manualBtnDefault: "உடனே செல்", darkBackground: "இருண்ட பின்னணி பயன்படுத்து", centerContent: "பக்க உள்ளடக்கத்தை நடுவில் சீரமை",
    redirectPageTitleLabel: "திசைமாற்ற பக்க தலைப்பு (காலியாக விடலாம்)",
    redirectPageTitlePlaceholder: "இயல்பு: வழிகாட்டி செய்தி காட்டு",
    redirectPageContentLabel: "திசைமாற்ற பக்க உள்ளடக்கம் (காலியாக விடலாம்)",
    redirectPageContentPlaceholder: "உள்ளடக்கம் எழுதுங்கள்...",
    redirectPageContentHint: "Markdown ஆதரவு",
    mode_rich: "ரிச்", mode_md: "MD",
    adminKey: "நிர்வாக விசை",
    resetPassword: "Slug கடவுச்சொல்லை புதுப்பி",
    btnCreate: "சுருக்கு",
    btnUpdate: "புதுப்பி", btnDelete: "நீக்கு", confirmDeleteMsg: "இந்த குறுகிய இணைப்பை நீக்கவா?", confirmYes: "நீக்கு", confirmNo: "ரத்து",
    created: "✅ உருவாக்கப்பட்டது",
    updated: "♻️ புதுப்பிக்கப்பட்டது",
    pwBoxLabel: "🔑 மாற்ற கடவுச்சொல்:",
    pwBoxWarn: "இப்போதே சேமிக்கவும்! மீண்டும் காட்டப்படாது.",
    errUrl: "URL தேவை", errUrlInvalid: "தவறான URL", errUrlBlocked: "இந்த சேவை அல்லது அறியப்பட்ட சுருக்க URL சேவையை சுருக்க முடியாது",
    errSlug: "Slug தேவை",
    errPw: "கடவுச்சொல் தேவை",
    errNet: "பிணையப் பிழை",
    errSlugEmpty: "முதலில் slug உள்ளிடுக",
    errSlugInvalid: "செல்லாது: 3-10 எழுத்து-எண் மட்டும்",
    slugFound: "சரிபார்க்கப்பட்டது", adminSlugFound: "Slug கண்டுபிடிக்கப்பட்டது", btnView: "பார் & திருத்து",
    slugAuthFail: "அடையாள விசையை சரிபார்க்கவும்",
    defaultRedirectTitle: "இலக்கு URL {url}",
    err_UNAUTHORIZED: "அங்கீகரிக்கப்படவில்லை – அடையாள விசையை சரிபார்க்கவும்",
    err_INVALID_JSON: "தவறான கோரிக்கை",
    err_INVALID_URL: "தவறான URL",
    err_BLOCKED_URL: "URL இந்த சேவை அல்லது அறியப்பட்ட சுருக்க URL சேவையை சுட்டிக்காட்டுகிறது",
    err_INVALID_SLUG: "தவறான slug வடிவம்",
    err_SLUG_EXISTS: "இந்த slug ஏற்கனவே உள்ளது – கடவுச்சொல்லுடன் மாற்று முறையைப் பயன்படுத்தவும்",
   
    err_SLUG_COLLISION: "slug உருவாக்கம் தோல்வி, மீண்டும் முயற்சிக்கவும்",
    warn_SLUG_IGNORED: "தனிப்பயன் slug செல்லாததால் புறக்கணிக்கப்பட்டது, சீரற்ற slug ஒதுக்கப்பட்டது",
    err_BATCH_DUPLICATE_SLUG: "தொகுதியில் slug நகல்",
    warn_ACCESS_PASSWORD_IGNORED: "அணுகல் கடவுச்சொல் செல்லாததால் புறக்கணிக்கப்பட்டது",
    err_NOT_FOUND: "கிடைக்கவில்லை", err_VERIFY_FAILED: "Slug கிடைக்கவில்லை அல்லது கடவுச்சொல் தவறு",
    err_INVALID_REDIRECT_MODE: "தவறான திசைமாற்ற முறை",
    err_INVALID_ACCESS_PASSWORD: "அணுகல் கடவுச்சொல் 3–16 எழுத்துகள், இடைவெளி இல்லாமல்",
    err_RATE_LIMITED: "ஒதுக்கீடு தீர்ந்தது — கடைசி வெற்றிகரமான செயலிலிருந்து 24 மணி நேரத்தில் மீட்டமைக்கப்படும்",
    adminMode: "நிர்வாக முறை", adminExit: "வெளியேறு", adminEnter: "நிர்வாக முறையில் நுழை", adminKeyPlaceholder: "நிர்வாக விசை", adminCancel: "ரத்து", adminSubmit: "நுழை", adminKeyWrong: "விசை தவறானது",
    tb_bold: "தடிமன்", tb_italic: "சாய்வு", tb_underline: "அடிக்கோடு", tb_h1: "தலைப்பு 1", tb_h2: "தலைப்பு 2", tb_h3: "தலைப்பு 3", tb_ul: "புள்ளி பட்டியல்", tb_ol: "எண் பட்டியல்", tb_blockquote: "மேற்கோள்", tb_code: "இன்லைன் குறியீடு", tb_link: "இணைப்பு செருகு", tb_hr: "கிடைக்கோடு",
  },
  he: {
    title: "Shurl",
    tabCreate: "✨ יצירה",
    tabModify: "✏️ עריכה",
    slugLabelCreate: "קוד מותאם", omittableText: "(ניתן להשאיר ריק)",
    slugLabelModify: "קוד לעריכה",
    slugPlaceholderCreate: "השאר ריק ליצירה אוטומטית",
    slugPlaceholderModify: "הכנס קוד קיים",
    check: "אמת ושאילתה", adminCheck: "שאילתה",
    targetUrl: "כתובת יעד",
    slugPassword: "סיסמת קוד",
    pwPlaceholder: "הסיסמה שהוצגה ביצירה",
    pwHint: "הכנס את הסיסמה שהוצגה כשיצרת את הקוד.",
    ttlOptions: "תוקף",
    ttlHint: "0 = לצמיתות. מינימום 60 שניות, מקסימום 12 חודשים. ערכים לא תקינים כגון מספרים שליליים או עשרוניים יתעלמו.",
    ttlUnit_s: "שניות",
    ttlUnit_m: "דקות",
    ttlUnit_h: "שעות",
    ttlUnit_d: "ימים",
    ttlUnit_mo: "חודשים",
    redirectOptions: "הגדרות הפניה",
    manualSub: "הפניה ידנית", countdownSub: "הפניה עם ספירה לאחור",
    accessPasswordLabel: "דרוש סיסמה מהמבקר (השאר ריק אם לא נדרש)",
    countdownSelectLabel: "שניות ספירה לאחור",
    accessPromptTitle: "נדרשת סיסמה",
    accessPromptPlaceholder: "הזן סיסמה",
    accessPromptError: "סיסמה שגויה",
    rdInstant: "הפניה מיידית",
    rdManual: "הפניה ידנית או ספירה לאחור",
    usePermanent: "השתמש בהפניה קבועה",
    manualBtnLabel: "כותרת כפתור הפניה/סיסמה (ניתן להשאיר ריק)",
    manualBtnPlaceholder: "ברירת מחדל: עבור מיד",
    manualBtnDefault: "עבור מיד", darkBackground: "השתמש ברקע כהה", centerContent: "מרכז תוכן הדף",
    redirectPageTitleLabel: "כותרת דף ההפניה (ניתן להשאיר ריק)",
    redirectPageTitlePlaceholder: "ברירת מחדל: הצג הודעת הנחיה",
    redirectPageContentLabel: "תוכן דף ההפניה (ניתן להשאיר ריק)",
    redirectPageContentPlaceholder: "כתוב תוכן...",
    redirectPageContentHint: "תמיכה ב-Markdown",
    mode_rich: "עשיר", mode_md: "MD",
    adminKey: "מפתח ניהול",
    resetPassword: "חדש סיסמת קוד",
    btnCreate: "קצר",
    btnUpdate: "עדכן", btnDelete: "מחק", confirmDeleteMsg: "למחוק קישור מקוצר זה?", confirmYes: "מחק", confirmNo: "ביטול",
    created: "✅ נוצר",
    updated: "♻️ עודכן",
    pwBoxLabel: "🔑 סיסמת עריכה:",
    pwBoxWarn: "שמור עכשיו! לא תוצג שוב.",
    errUrl: "נדרשת כתובת", errUrlInvalid: "כתובת לא תקינה", errUrlBlocked: "לא ניתן לקצר שירות זה או שירותי קיצור כתובות מוכרים",
    errSlug: "נדרש קוד",
    errPw: "נדרשת סיסמה",
    errNet: "שגיאת רשת",
    errSlugEmpty: "הכנס קוד תחילה",
    errSlugInvalid: "לא תקין: 3-10 אותיות וספרות בלבד",
    slugFound: "אומת", adminSlugFound: "הקוד נמצא", btnView: "צפה ועריכה",
    slugAuthFail: "בדוק את מפתח הזהות",
    defaultRedirectTitle: "כתובת יעד {url}",
    err_UNAUTHORIZED: "לא מורשה – בדוק את מפתח הזהות",
    err_INVALID_JSON: "בקשה לא תקינה",
    err_INVALID_URL: "כתובת לא תקינה",
    err_BLOCKED_URL: "הכתובת מפנה לשירות זה או לשירות קיצור כתובות מוכר",
    err_INVALID_SLUG: "פורמט קוד לא תקין",
    err_SLUG_EXISTS: "קוד זה כבר קיים – השתמש במצב עריכה עם הסיסמה",
   
    err_SLUG_COLLISION: "יצירת קוד נכשלה, נסה שוב",
    warn_SLUG_IGNORED: "הקוד המותאם אישית לא תקין והתעלמנו ממנו, הוקצה קוד אקראי",
    err_BATCH_DUPLICATE_SLUG: "קוד כפול באצווה",
    warn_ACCESS_PASSWORD_IGNORED: "סיסמת הגישה לא תקינה והתעלמנו ממנה",
    err_NOT_FOUND: "לא נמצא", err_VERIFY_FAILED: "הקוד לא נמצא או הסיסמה שגויה",
    err_INVALID_REDIRECT_MODE: "מצב הפניה לא תקין",
    err_INVALID_ACCESS_PASSWORD: "סיסמת גישה חייבת להכיל 3–16 תווים ללא רווחים",
    err_RATE_LIMITED: "המכסה נגמרה — מתאפס 24 שעות לאחר הפעולה המוצלחת האחרונה",
    adminMode: "מצב ניהול", adminExit: "יציאה", adminEnter: "כניסה למצב ניהול", adminKeyPlaceholder: "מפתח ניהול", adminCancel: "ביטול", adminSubmit: "כניסה", adminKeyWrong: "מפתח לא תקין",
    tb_bold: "מודגש", tb_italic: "נטוי", tb_underline: "קו תחתון", tb_h1: "כותרת 1", tb_h2: "כותרת 2", tb_h3: "כותרת 3", tb_ul: "רשימת תבליטים", tb_ol: "רשימה ממוספרת", tb_blockquote: "ציטוט", tb_code: "קוד בשורה", tb_link: "הכנס קישור", tb_hr: "קו אופקי",
  },
  ar: {
    title: "Shurl",
    tabCreate: "✨ إنشاء",
    tabModify: "✏️ تعديل",
    slugLabelCreate: "رمز مخصص", omittableText: "(يمكن تركه فارغاً)",
    slugLabelModify: "الرمز المراد تعديله",
    slugPlaceholderCreate: "اتركه فارغاً للتوليد التلقائي",
    slugPlaceholderModify: "أدخل الرمز الموجود",
    check: "تحقق واستعلم", adminCheck: "استعلم",
    targetUrl: "الرابط الهدف",
    slugPassword: "كلمة مرور الرمز",
    pwPlaceholder: "كلمة المرور التي ظهرت عند الإنشاء",
    pwHint: "أدخل كلمة المرور التي ظهرت عند إنشاء هذا الرمز.",
    ttlOptions: "مدة الصلاحية",
    ttlHint: "0 = دائم. الحد الأدنى 60 ثانية، الحد الأقصى 12 شهرًا. القيم غير الصالحة كالأرقام السالبة أو العشرية سيتم تجاهلها.",
    ttlUnit_s: "ثوانٍ",
    ttlUnit_m: "دقائق",
    ttlUnit_h: "ساعات",
    ttlUnit_d: "أيام",
    ttlUnit_mo: "أشهر",
    redirectOptions: "خيارات التوجيه",
    manualSub: "توجيه يدوي", countdownSub: "توجيه بعد تنازلي",
    accessPasswordLabel: "طلب كلمة مرور من الزائر (اتركه فارغاً إذا لم يكن مطلوباً)",
    countdownSelectLabel: "ثواني العد التنازلي",
    accessPromptTitle: "كلمة المرور مطلوبة",
    accessPromptPlaceholder: "أدخل كلمة المرور",
    accessPromptError: "كلمة المرور غير صحيحة",
    rdInstant: "توجيه فوري",
    rdManual: "توجيه يدوي أو عد تنازلي",
    usePermanent: "استخدم التوجيه الدائم",
    manualBtnLabel: "عنوان زر التوجيه/كلمة المرور (يمكن تركه فارغاً)",
    manualBtnPlaceholder: "افتراضي: انطلق الآن",
    manualBtnDefault: "انطلق الآن", darkBackground: "استخدم خلفية داكنة", centerContent: "توسيط محتوى الصفحة",
    redirectPageTitleLabel: "عنوان صفحة التوجيه (يمكن تركه فارغاً)",
    redirectPageTitlePlaceholder: "افتراضي: عرض رسالة إرشادية",
    redirectPageContentLabel: "محتوى صفحة التوجيه (يمكن تركه فارغاً)",
    redirectPageContentPlaceholder: "اكتب المحتوى...",
    redirectPageContentHint: "يدعم Markdown",
    mode_rich: "منسق", mode_md: "MD",
    adminKey: "مفتاح الإدارة",
    resetPassword: "تجديد كلمة مرور الرمز",
    btnCreate: "اختصار",
    btnUpdate: "تحديث", btnDelete: "حذف", confirmDeleteMsg: "حذف هذا الرابط المختصر؟", confirmYes: "حذف", confirmNo: "إلغاء",
    created: "✅ تم الإنشاء",
    updated: "♻️ تم التحديث",
    pwBoxLabel: "🔑 كلمة مرور التعديل:",
    pwBoxWarn: "احفظها الآن! لن تظهر مرة أخرى.",
    errUrl: "الرابط مطلوب", errUrlInvalid: "رابط غير صالح", errUrlBlocked: "لا يمكن اختصار هذه الخدمة أو خدمات الاختصار المعروفة",
    errSlug: "الرمز مطلوب",
    errPw: "كلمة المرور مطلوبة",
    errNet: "خطأ في الشبكة",
    errSlugEmpty: "أدخل الرمز أولاً",
    errSlugInvalid: "غير صالح: 3-10 أحرف وأرقام فقط",
    slugFound: "تم التحقق", adminSlugFound: "تم العثور على الرمز", btnView: "عرض وتعديل",
    slugAuthFail: "تحقق من مفتاح الهوية",
    defaultRedirectTitle: "الرابط الهدف {url}",
    err_UNAUTHORIZED: "غير مصرح – تحقق من مفتاح الهوية",
    err_INVALID_JSON: "طلب غير صالح",
    err_INVALID_URL: "رابط غير صالح",
    err_BLOCKED_URL: "الرابط يشير إلى هذه الخدمة أو خدمة اختصار معروفة",
    err_INVALID_SLUG: "تنسيق الرمز غير صالح",
    err_SLUG_EXISTS: "هذا الرمز موجود بالفعل – استخدم وضع التعديل مع كلمة المرور",
   
    err_SLUG_COLLISION: "فشل في إنشاء الرمز، حاول مرة أخرى",
    warn_SLUG_IGNORED: "الرمز المخصص غير صالح وتم تجاهله، تم تعيين رمز عشوائي",
    err_BATCH_DUPLICATE_SLUG: "رمز مكرر في الدفعة",
    warn_ACCESS_PASSWORD_IGNORED: "كلمة مرور الوصول غير صالحة وتم تجاهلها",
    err_NOT_FOUND: "غير موجود", err_VERIFY_FAILED: "الرمز غير موجود أو كلمة المرور خاطئة",
    err_INVALID_REDIRECT_MODE: "وضع التوجيه غير صالح",
    err_INVALID_ACCESS_PASSWORD: "كلمة مرور الوصول يجب أن تكون 3–16 حرفاً بدون مسافات",
    err_RATE_LIMITED: "تم استنفاد الحصة — يتم إعادة التعيين بعد 24 ساعة من آخر عملية ناجحة",
    adminMode: "وضع الإدارة", adminExit: "خروج", adminEnter: "دخول وضع الإدارة", adminKeyPlaceholder: "مفتاح الإدارة", adminCancel: "إلغاء", adminSubmit: "دخول", adminKeyWrong: "المفتاح غير صالح",
    tb_bold: "غامق", tb_italic: "مائل", tb_underline: "تسطير", tb_h1: "عنوان 1", tb_h2: "عنوان 2", tb_h3: "عنوان 3", tb_ul: "قائمة نقطية", tb_ol: "قائمة مرقمة", tb_blockquote: "اقتباس", tb_code: "كود سطري", tb_link: "إدراج رابط", tb_hr: "خط أفقي",
  }
});

// ── Redirect page (countdown / manual / password) ───────────────────

function lockPage(cdnHost) {
  return `<!DOCTYPE html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shurl</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71'/%3E%3Cpath d='M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71'/%3E%3C/svg%3E">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#f4f6f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.lock-card{background:#fff;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:40px 36px;width:100%;max-width:380px;text-align:center}
.lock-icon{width:56px;height:56px;margin:0 auto 20px;background:linear-gradient(135deg,#3b82f6,#06b6d4);border-radius:14px;display:flex;align-items:center;justify-content:center}
.lock-card h1{font-size:1.3rem;font-weight:700;color:#1e293b;margin-bottom:6px}
.lock-card p{font-size:.85rem;color:#64748b;margin-bottom:20px}
.lock-card input[type=password]{width:100%;padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;font-size:.95rem;outline:none;transition:border-color .2s,box-shadow .2s}
.lock-card input[type=password]:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.12)}
.lock-card .remember{display:flex;align-items:center;gap:6px;margin:14px 0 18px;font-size:.8rem;color:#64748b;cursor:pointer;justify-content:center}
.lock-card .remember input{accent-color:#3b82f6;cursor:pointer}
.lock-card button{width:100%;padding:10px;border:none;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#06b6d4);color:#fff;font-size:.95rem;font-weight:600;cursor:pointer;transition:filter .2s,box-shadow .2s}
.lock-card button:hover{filter:brightness(1.05);box-shadow:0 4px 16px rgba(59,130,246,.3)}
.lock-card button:disabled{opacity:.5;cursor:not-allowed}
.lock-err{color:#dc2626;font-size:.82rem;margin-top:12px;min-height:1.2em}
</style></head><body>
<div class="lock-card">
<div class="lock-icon">
<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
</div>
<h1 id="lockTitle">Shurl</h1>
<p id="lockMsg"></p>
<form id="lockForm">
<input type="password" id="lockPw" autofocus required>
<label class="remember"><input type="checkbox" id="lockRemember"> <span id="lockRemLabel"></span></label>
<button type="submit" id="lockBtn"></button>
<div class="lock-err" id="lockErr"></div>
</form>
</div>
<script>
var L={en:{app:"Shurl",msg:"Enter password to continue",ph:"Password",rem:"Remember for 30 days",btn:"Unlock",wrong:"Wrong password",net:"Network error"},"zh-cn":{app:"速至短链",msg:"请输入密码以继续",ph:"密码",rem:"30天内不再要求密码",btn:"解锁",wrong:"密码错误",net:"网络错误"},"zh-tw":{app:"速至短鏈",msg:"請輸入密碼以繼續",ph:"密碼",rem:"30天內不再要求密碼",btn:"解鎖",wrong:"密碼錯誤",net:"網路錯誤"},ja:{msg:"パスワードを入力してください",ph:"パスワード",rem:"30日間パスワードを要求しない",btn:"ロック解除",wrong:"パスワードが違います",net:"ネットワークエラー"},ko:{msg:"비밀번호를 입력하세요",ph:"비밀번호",rem:"30일간 비밀번호 요구 안 함",btn:"잠금 해제",wrong:"비밀번호가 틀렸습니다",net:"네트워크 오류"},ms:{msg:"Masukkan kata laluan untuk meneruskan",ph:"Kata laluan",rem:"Ingat selama 30 hari",btn:"Buka kunci",wrong:"Kata laluan salah",net:"Ralat rangkaian"},vi:{msg:"Nhập mật khẩu để tiếp tục",ph:"Mật khẩu",rem:"Ghi nhớ 30 ngày",btn:"Mở khóa",wrong:"Sai mật khẩu",net:"Lỗi mạng"},th:{msg:"กรุณาใส่รหัสผ่านเพื่อดำเนินการต่อ",ph:"รหัสผ่าน",rem:"จำไว้ 30 วัน",btn:"ปลดล็อก",wrong:"รหัสผ่านผิด",net:"ข้อผิดพลาดเครือข่าย"},ta:{msg:"தொடர கடவுச்சொல்லை உள்ளிடவும்",ph:"கடவுச்சொல்",rem:"30 நாட்கள் நினைவில் வை",btn:"திறக்க",wrong:"தவறான கடவுச்சொல்",net:"பிணையப் பிழை"},he:{msg:"הזן סיסמה כדי להמשיך",ph:"סיסמה",rem:"זכור למשך 30 יום",btn:"פתח נעילה",wrong:"סיסמה שגויה",net:"שגיאת רשת"},ar:{msg:"أدخل كلمة المرور للمتابعة",ph:"كلمة المرور",rem:"تذكر لمدة 30 يومًا",btn:"فتح القفل",wrong:"كلمة المرور خاطئة",net:"خطأ في الشبكة"}};
function dl(){var s=Object.keys(L);var c=navigator.languages||[navigator.language||"en"];for(var i=0;i<c.length;i++){var l=c[i].toLowerCase();if(s.indexOf(l)!==-1)return l;if(/^zh-(hant|tw|hk|mo)/.test(l))return"zh-tw";if(/^zh/.test(l))return"zh-cn";var p=l.split("-")[0];if(s.indexOf(p)!==-1)return p;}return"en";}
var t=L[dl()]||L.en;
if(t.app){document.getElementById("lockTitle").textContent=t.app;document.title=t.app;}
document.getElementById("lockMsg").textContent=t.msg;
document.getElementById("lockPw").placeholder=t.ph;
document.getElementById("lockRemLabel").textContent=t.rem;
document.getElementById("lockBtn").textContent=t.btn;
if(["he","ar"].indexOf(dl())!==-1)document.documentElement.dir="rtl";
document.getElementById("lockForm").addEventListener("submit",function(e){
e.preventDefault();var btn=document.getElementById("lockBtn");var pw=document.getElementById("lockPw").value;var rem=document.getElementById("lockRemember").checked;var err=document.getElementById("lockErr");
if(!/^[\x21-\x7e]{3,16}$/.test(pw)){err.textContent=t.wrong;return}
btn.disabled=true;err.textContent="";
fetch("/_unlock",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:pw,remember:rem})}).then(function(r){return r.json()}).then(function(d){if(d.ok){window.location.reload()}else{err.textContent=t.wrong;btn.disabled=false}}).catch(function(){err.textContent=t.net;btn.disabled=false})});
<\/script></body></html>`;
}

function redirectPage(entry, acceptLang, cdnHost, slug, showError) {
  const target = entry.url;
  const seconds = entry.countdown || 0;
  const needsPw = !!entry.accessHash;
  const lang = detectLang(acceptLang);
  const dir = (lang === "ar" || lang === "he") ? "rtl" : "ltr";

  const titleRaw = entry.redirectPageTitle || null;
  const bodyRaw = entry.redirectPageContent || null;
  const customBtnTitle = entry.manualBtnTitle || null;
  const light = entry.darkBackground !== true;
  const center = entry.centerContent === true;
  const bg = light ? '#f4f6f9' : '#0f172a';
  const fg = light ? '#1e293b' : '#e2e8f0';
  const muted = light ? '#64748b' : '#94a3b8';
  const barBg = light ? '#cbd5e1' : '#1e293b';
  const linkColor = light ? '#2563eb' : '#60a5fa';
  const skipBorder = light ? '#94a3b8' : '#475569';
  const inputBorder = light ? '#cbd5e1' : '#475569';
  const inputBg = light ? '#fff' : '#1e293b';

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://${cdnHost}/npm/markdown-it@14/dist/markdown-it.min.js"><\/script>
<title id="page-title"></title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:${bg};color:${fg};min-height:100vh;display:flex;align-items:center;justify-content:center}
.wrap{max-width:520px;width:100%;padding:2rem}
.countdown{font-size:3rem;font-weight:700;color:#3b82f6;margin:1.2rem 0;text-align:center}
.body-content{margin:1.5rem 0;font-size:1rem;line-height:1.6${center ? ';text-align:center' : ''}}
.body-content p{margin-bottom:.8em}
.body-content blockquote{border-left:3px solid #3b82f6;padding-left:.8em;margin:.5em 0;font-style:italic}
.body-content ul,.body-content ol{padding-left:1.5em;margin-bottom:.5em}
.body-content code{background:rgba(127,127,127,.15);padding:1px 4px;border-radius:3px;font-size:.9em}
.body-content hr{border:none;border-top:1px solid rgba(127,127,127,.3);margin:.8em 0}
.skip{margin-top:1.2rem;text-align:center}
.skip a,.skip button{color:${muted};font-size:.85rem;text-decoration:none;border-bottom:1px dashed ${skipBorder};background:none;border-top:none;border-left:none;border-right:none;cursor:pointer}
.skip a:hover,.skip button:hover{color:${fg}}
.bar-track{width:100%;height:4px;background:${barBg};border-radius:2px;margin-top:1.5rem;overflow:hidden}
.bar-fill{height:100%;background:#3b82f6;border-radius:2px;transition:width .3s linear}
.pw-area{text-align:center;margin:1.2rem 0}
.pw-area input{padding:.6rem .8rem;border:1px solid ${inputBorder};border-radius:.5rem;font-size:1rem;outline:none;background:${inputBg};color:${fg};width:100%;max-width:280px}
.pw-area input:focus{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.15)}
.pw-err{color:#ef4444;font-size:.85rem;margin-bottom:.6rem;text-align:center}
</style></head><body><div class="wrap">
<div class="body-content" id="body-content"></div>
${needsPw ? `${showError ? '<p class="pw-err" id="pw-err"></p>' : ''}<form id="pw-form" method="GET" action="/${esc(slug)}"><div class="pw-area"><input type="password" name="_pw" id="pw-input" autofocus required></div><div class="skip"><button type="submit" id="pw-btn" style="display:inline-block;padding:12px 32px;background:#3b82f6;color:#fff;border-radius:8px;font-size:1rem;font-weight:600;border:none;cursor:pointer"></button></div></form>` : `<div class="countdown" id="count">${seconds}</div>
<div class="bar-track"><div class="bar-fill" id="bar" style="width:100%"></div></div>
<div class="skip"><a id="skip-link" href="${esc(target)}"></a></div>`}
</div><script>
const I18N=${I18N_JSON};
const lang=${JSON.stringify(lang)};
const t=I18N[lang]||I18N.en;
const target=${JSON.stringify(target)};
const needsPw=${needsPw};
const customTitle=${JSON.stringify(titleRaw)};
const customBody=${JSON.stringify(bodyRaw)};
const customBtnTitle=${JSON.stringify(customBtnTitle)};
if(needsPw){
  document.getElementById('page-title').textContent=customTitle||t.accessPromptTitle;
  if(customBody){var md=window.markdownit({html:false,linkify:true});document.getElementById('body-content').innerHTML=md.render(customBody)}
  document.getElementById('pw-input').placeholder=t.accessPromptPlaceholder;
  document.getElementById('pw-btn').textContent=customBtnTitle||t.manualBtnDefault;
  var errEl=document.getElementById('pw-err');
  if(errEl) errEl.textContent=t.accessPromptError;
}else{
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
<title>Shurl</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71'/%3E%3Cpath d='M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71'/%3E%3C/svg%3E">
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
.warn{margin-top:.5rem;padding:.5rem .75rem;border-radius:.4rem;background:#fef3c7;color:#92400e;font-size:.85rem;border:1px solid #f59e0b}
@media(prefers-color-scheme:dark){.warn{background:#422006;color:#fbbf24}}
[data-theme=light] .warn{background:#fef3c7;color:#92400e}
[data-theme=dark] .warn{background:#422006;color:#fbbf24}
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
</style></head><body><div style="width:100%;max-width:480px"><div class="c">
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
    <button type="button" class="theme-toggle" id="themeToggle">☀️</button>
    <button type="button" id="adminBtn" style="background:none;border:1px solid var(--s-border);border-radius:.4rem;padding:4px 8px;cursor:pointer;font-size:.85rem;color:var(--s-text-muted)" title="">🔑</button>
  </div>
</div>
<div id="adminKeyOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999;align-items:center;justify-content:center" onclick="if(event.target===this){this.className='hidden';this.style.display='none'}">
  <div style="background:var(--s-surface);border:1px solid var(--s-border);border-radius:.75rem;padding:1.5rem;width:320px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.2)">
    <h3 id="adminDialogTitle" style="margin:0 0 1rem;font-size:1rem;color:var(--s-text)"></h3>
    <input type="password" id="adminKeyInput" style="width:100%;padding:.6rem .75rem;border:1px solid var(--s-border);border-radius:.5rem;background:var(--s-bg);color:var(--s-text);font-size:.9rem;outline:none;margin-bottom:.8rem" placeholder="">
    <p id="adminKeyError" style="color:#ef4444;font-size:.85rem;margin-bottom:.6rem;display:none"></p>
    <div style="display:flex;gap:.5rem;justify-content:flex-end">
      <button type="button" id="adminKeyCancel" style="padding:.5rem 1rem;background:none;border:1px solid var(--s-border);border-radius:.4rem;color:var(--s-text-muted);cursor:pointer;font-size:.85rem"></button>
      <button type="button" id="adminKeySubmit" style="padding:.5rem 1rem;background:var(--s-accent);color:#fff;border:none;border-radius:.4rem;cursor:pointer;font-size:.85rem"></button>
    </div>
  </div>
</div>

<div class="tabs">
  <div class="tab active" id="tab-create" onclick="setMode('create')"></div>
  <div class="tab" id="tab-modify" onclick="setMode('modify')"></div>
</div>


<label id="l-slug" class="field-label"></label>
<div class="slug-row">
  <input id="s" type="text" minlength="3" maxlength="10" pattern="[a-zA-Z0-9]{3,10}">
  <button class="form-btn" onclick="verifySlug()" id="check-btn" disabled style="display:none"></button>
</div>
<div id="slug-status"></div>

<div id="pw-section" style="display:none">
  <label id="l-pw" class="field-label"></label>
  <div class="slug-row">
    <input id="p" type="password">
  </div>
  <p class="hint" id="h-pw"></p>
</div>

<div id="modify-actions" class="hidden">
  <div class="btn-row">
    <button class="form-btn" id="view-btn" onclick="loadEntry()"></button>
    <button class="form-btn btn-delete" id="action-delete-btn" onclick="deleteSlug()"></button>
  </div>
</div>

<div id="edit-form">
<label id="l-url" class="field-label"></label>
<input id="u" type="url" placeholder="https://mydomain.tld/long/path/to/shorten">
<div id="url-status"></div>

<div id="renew-pw-section" class="hidden" style="margin-bottom:.8rem">
  <label style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;color:var(--s-text-muted);cursor:pointer">
    <input type="checkbox" id="resetPassword" style="accent-color:var(--s-accent)">
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
    <label class="rd-radio">
      <input type="radio" name="manualMode" value="manual" checked>
      <span id="l-manualSub"></span>
    </label>
    <div id="manual-sub-opts" style="padding-left:1.5rem;margin-bottom:.6rem">
      <label id="l-accessPassword" class="field-label"></label>
      <input id="accessPassword" type="password" maxlength="16" minlength="3">
      <p class="hint" id="h-accessPassword" style="color:#ef4444;display:none"></p>
    </div>

    <label class="rd-radio">
      <input type="radio" name="manualMode" value="countdown">
      <span id="l-countdownSub"></span>
    </label>
    <div id="countdown-sub-opts" style="display:none;padding-left:1.5rem;margin-bottom:.6rem">
      <label id="l-countdownSelect" class="field-label"></label>
      <select id="countdown"></select>
    </div>

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

    <label class="rd-check" style="margin-top:.4rem">
      <input type="checkbox" id="centerContent">
      <span id="l-centerContent"></span>
    </label>
    <label class="rd-check" style="margin-top:.4rem">
      <input type="checkbox" id="darkBackground">
      <span id="l-darkBackground"></span>
    </label>

    <label id="l-manualBtn" class="field-label" style="margin-top:.8rem"></label>
    <input id="manualBtnTitle" type="text" maxlength="128">
  </div>
</div>
</div>

<div class="btn-row">
<button class="form-btn" onclick="go()" id="submit-btn" disabled></button>
</div>
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
<footer style="text-align:center;padding:1.2rem 0 .5rem;font-size:.75rem;color:var(--s-text-muted)">© <span id="footerYear"></span> <a href="https://go.gb.net/gaobo" target="_blank" style="color:var(--s-text-muted);text-decoration:none;border-bottom:1px dashed var(--s-border)"><img src="/gaobo.png" alt="" style="height:20px;vertical-align:middle;margin:0 2px;"><span id="footerBrand">高博的世界</span></a> <span id="footerProd">出品</span> <a href="https://github.com/onegbnet/tinyutils/blob/master/LICENSE" target="_blank" style="color:var(--s-text-muted);text-decoration:none;border-bottom:1px dashed var(--s-border)">MIT License</a></footer>
</div>
<script>
document.getElementById('footerYear').textContent=new Date().getFullYear();
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

var manualModeRadios = document.querySelectorAll('input[name="manualMode"]');
function updateManualMode() {
  var mm = document.querySelector('input[name="manualMode"]:checked').value;
  document.getElementById('manual-sub-opts').style.display = mm === 'manual' ? '' : 'none';
  document.getElementById('countdown-sub-opts').style.display = mm === 'countdown' ? '' : 'none';
}
for (var mi = 0; mi < manualModeRadios.length; mi++) {
  manualModeRadios[mi].addEventListener('change', updateManualMode);
}
(function(){
  var sel = document.getElementById('countdown');
  for(var i=1;i<=60;i++){
    var opt=document.createElement('option');
    opt.value=i; opt.textContent=i;
    if(i===30) opt.selected=true;
    sel.appendChild(opt);
  }
})();

var defaultTtl = parseInt('{{DEFAULT_TTL}}') || 0;
var KEY_REQUIRED = '{{KEY_REQUIRED}}' === 'true';
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
  document.getElementById('l-darkBackground').textContent=t.darkBackground;
  document.getElementById('l-centerContent').textContent=t.centerContent;
  document.getElementById('l-manualSub').textContent=t.manualSub;
  document.getElementById('l-countdownSub').textContent=t.countdownSub;
  document.getElementById('l-accessPassword').textContent=t.accessPasswordLabel;
  document.getElementById('l-countdownSelect').textContent=t.countdownSelectLabel;
  document.getElementById('l-redirectPageTitle').textContent=t.redirectPageTitleLabel;
  document.getElementById('l-redirectPageContent').textContent=t.redirectPageContentLabel;
  document.getElementById('h-redirectPageContent').textContent=t.redirectPageContentHint;
  document.getElementById('redirectPageTitle').placeholder=t.redirectPageTitlePlaceholder;
  document.getElementById('modeRich').textContent=t.mode_rich;
  document.getElementById('modeMd').textContent=t.mode_md;
  wysiwygPane.setAttribute('data-placeholder',t.redirectPageContentPlaceholder);
  mdPane.placeholder=t.redirectPageContentPlaceholder;
  document.getElementById('p').placeholder=t.pwPlaceholder;
  document.getElementById('check-btn').textContent=isAdminMode()?t.adminCheck:t.check;
  document.getElementById('l-resetPassword').textContent=t.resetPassword;
  var tooltipMap = {bold:'tb_bold', italic:'tb_italic', underline:'tb_underline', h1:'tb_h1', h2:'tb_h2', h3:'tb_h3', ul:'tb_ul', ol:'tb_ol', blockquote:'tb_blockquote', code:'tb_code', link:'tb_link', hr:'tb_hr'};
  document.querySelectorAll('.tb-btn[data-cmd]').forEach(function(btn){
    var key = tooltipMap[btn.getAttribute('data-cmd')];
    if(key && t[key]) btn.title = t[key];
  });
  document.getElementById('adminBtn').title=t.adminEnter;
  document.getElementById('adminDialogTitle').textContent=t.adminEnter;
  document.getElementById('adminKeyCancel').textContent=t.adminCancel;
  document.getElementById('adminKeySubmit').textContent=t.adminSubmit;
  document.getElementById('adminKeyInput').placeholder=t.adminKeyPlaceholder;
  var isChinese = (lang === 'zh-cn' || lang === 'zh-tw');
  document.getElementById('footerBrand').textContent = isChinese ? '高博的世界' : 'ONE.GB.NET';
  document.getElementById('footerProd').textContent = isChinese ? '出品' : '';
}
applyI18n();

// ── Admin mode ──
var adminKey = sessionStorage.getItem('adminKey') || '';
function isAdminMode() { return !!adminKey; }
function updateAdminUI() {
  var btn = document.getElementById('adminBtn');
  if (!KEY_REQUIRED) {
    btn.style.display = 'none';
    return;
  }
  if (isAdminMode()) {
    btn.textContent = '🔓';
    btn.title = t.adminExit;
    btn.style.background = 'var(--s-accent)';
    btn.style.color = '#fff';
    btn.style.borderColor = 'var(--s-accent)';
  } else {
    btn.textContent = '🔑';
    btn.title = t.adminEnter;
    btn.style.background = 'none';
    btn.style.color = 'var(--s-text-muted)';
    btn.style.borderColor = 'var(--s-border)';
  }
}
function showAdminModal() {
  var overlay = document.getElementById('adminKeyOverlay');
  overlay.className = '';
  overlay.style.display = 'flex';
  document.getElementById('adminKeyInput').value = '';
  document.getElementById('adminKeyError').style.display = 'none';
  document.getElementById('adminKeyInput').style.borderColor = '';
  setTimeout(function(){ document.getElementById('adminKeyInput').focus(); }, 50);
}
function hideAdminModal() {
  var overlay = document.getElementById('adminKeyOverlay');
  overlay.className = 'hidden';
  overlay.style.display = 'none';
}
document.getElementById('adminBtn').addEventListener('click', function() {
  if (isAdminMode()) {
    adminKey = '';
    sessionStorage.removeItem('adminKey');
    updateAdminUI();
    setMode(mode);
    applyI18n();
  } else {
    showAdminModal();
  }
});
document.getElementById('adminKeyCancel').addEventListener('click', hideAdminModal);
document.getElementById('adminKeySubmit').addEventListener('click', async function() {
  var key = document.getElementById('adminKeyInput').value.trim();
  if (!key) return;
  var errEl = document.getElementById('adminKeyError');
  try {
    var res = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key }, body: '{}' });
    if (res.status !== 401) {
      adminKey = key;
      sessionStorage.setItem('adminKey', key);
      hideAdminModal();
      updateAdminUI();
      setMode(mode);
      applyI18n();
    } else {
      document.getElementById('adminKeyInput').style.borderColor = '#ef4444';
      errEl.textContent = t.adminKeyWrong;
      errEl.style.display = '';
    }
  } catch(e) {
    document.getElementById('adminKeyInput').style.borderColor = '#ef4444';
    errEl.textContent = t.adminKeyWrong;
    errEl.style.display = '';
  }
});
document.getElementById('adminKeyInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('adminKeySubmit').click();
  this.style.borderColor = '';
  document.getElementById('adminKeyError').style.display = 'none';
});
updateAdminUI();
function getAdminKey() { return adminKey; }

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
  document.querySelector('input[name="manualMode"][value="manual"]').checked=true;
  document.getElementById('accessPassword').value='';
  document.getElementById('countdown').value='30';
  document.getElementById('redirectPageTitle').value='';
  wysiwygPane.innerHTML='';
  mdPane.value='';
  document.getElementById('manualBtnTitle').value='';
  document.getElementById('darkBackground').checked=false;
  document.getElementById('centerContent').checked=false;
  updateRdMode();
  updateManualMode();
  document.getElementById('r').style.display='none';
  document.getElementById('renew-pw-section').className='hidden';
  document.getElementById('modify-actions').className='hidden';
  document.getElementById('edit-form').className=(m==='create'?'':'hidden');
  document.getElementById('s').readOnly=false;
  document.getElementById('p').readOnly=false;
  submitBtn.disabled=true;
  updateLabels();
  updateCheckBtn();
  checkSubmitState();
}

function updateLabels(){
  document.getElementById('l-slug').textContent=mode==='create'?(t.slugLabelCreate+' '+t.omittableText):t.slugLabelModify;
  document.getElementById('s').placeholder=mode==='create'?t.slugPlaceholderCreate:t.slugPlaceholderModify;
  document.getElementById('s').required=mode==='modify';
  document.getElementById('pw-section').style.display=(mode==='modify'&&!isAdminMode())?'':'none';
  document.getElementById('check-btn').style.display=(mode==='modify')?'':'none';
  document.getElementById('submit-btn').textContent=mode==='create'?t.btnCreate:t.btnUpdate;
  document.getElementById('view-btn').textContent=t.btnView;
  document.getElementById('action-delete-btn').textContent=t.btnDelete;
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
  if(isAdminMode()||!KEY_REQUIRED) keyOk=true;
  if(uv){urlOk=true;try{var u=new URL(uv);if((u.protocol!=='http:'&&u.protocol!=='https:')||!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,63}$/i.test(u.hostname))urlOk=false;else if(isBlockedUrl(uv))urlOk=false}catch(e){urlOk=false}}
  var sv=document.getElementById('s').value.trim();
  if(sv&&!/^[a-zA-Z0-9]{3,10}$/.test(sv))slugOk=false;
  submitBtn.disabled=!(urlOk&&slugOk&&keyOk);
}

var BLOCKED_HOSTS=['bit.ly','tinyurl.com','t.co','goo.gl','ow.ly','is.gd','buff.ly','adf.ly','bl.ink','rb.gy','short.io','cutt.ly','rebrand.ly','v.gd','qr.ae','1url.com','hyperurl.co'];
function isBlockedUrl(v){try{var u=new URL(v);var h=u.hostname.toLowerCase();if(v.toLowerCase().indexOf(window.location.origin.toLowerCase())===0)return true;if(BLOCKED_HOSTS.indexOf(h)!==-1)return true}catch(e){}return false}
function validateUrl(){
  var v=urlInput.value.trim();
  if(!v){urlStatus.textContent='';urlStatus.className='';checkSubmitState();return}
  try{var u=new URL(v);if((u.protocol==='http:'||u.protocol==='https:')&&/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,63}$/i.test(u.hostname)){if(isBlockedUrl(v)){urlStatus.textContent='❌ '+t.errUrlBlocked;urlStatus.className='bad';checkSubmitState();return}urlStatus.textContent='';urlStatus.className='';checkSubmitState();return}}catch(e){}
  urlStatus.textContent='❌ '+t.errUrlInvalid;urlStatus.className='bad';checkSubmitState();
}
urlInput.addEventListener('input',validateUrl);
urlInput.addEventListener('blur',validateUrl);
document.getElementById('accessPassword').addEventListener('input', function() {
  var v = this.value;
  var hint = document.getElementById('h-accessPassword');
  if (v && (/\s/.test(v) || (v.length > 0 && v.length < 3))) {
    hint.textContent = t.err_INVALID_ACCESS_PASSWORD;
    hint.style.display = '';
  } else {
    hint.style.display = 'none';
  }
});

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

async function verifySlug(){
  var s=document.getElementById('s').value.trim();
  var k=getAdminKey();
  var p=document.getElementById('p').value;
  var st=document.getElementById('slug-status');

  if(!s){st.textContent='❌ '+t.errSlugEmpty;st.className='bad';return}
  if(!/^[a-zA-Z0-9]{3,10}$/.test(s)){st.textContent='❌ '+t.errSlugInvalid;st.className='bad';return}

  try{
    var hdrs={'X-Password':p};
    if(k) hdrs['X-Admin-Key']=k;
    var res=await fetch('/'+s,{method:'HEAD',headers:hdrs});
    if(res.ok){
      st.textContent='✓ '+(isAdminMode()?t.adminSlugFound:t.slugFound);st.className='free';
      document.getElementById('modify-actions').className='';
      document.getElementById('s').readOnly=true;
      document.getElementById('p').readOnly=true;
      document.getElementById('check-btn').disabled=true;
    }else if(res.status===401){
      st.textContent='❌ '+t.slugAuthFail;st.className='bad';
    }else{
      st.textContent='❌ '+(isAdminMode()?t.err_NOT_FOUND:t.err_VERIFY_FAILED);st.className='bad';
    }
  }catch(e){st.textContent='❌ '+t.errNet;st.className='bad'}
}

async function loadEntry(){
  var s=document.getElementById('s').value.trim();
  var k=getAdminKey();
  var p=document.getElementById('p').value;
  var st=document.getElementById('slug-status');

  try{
    var res=await fetch('/'+s,{
      method:'POST',
      headers:{'X-Admin-Key':k,'X-Password':p}
    });
    if(res.ok){
      var d=await res.json();
      document.getElementById('u').value=d.url;
      var rdMode = d.redirectMode || 'instant';
      var rdRadio = document.querySelector('input[name="rdMode"][value="' + rdMode + '"]');
      if (rdRadio) rdRadio.checked = true;
      document.getElementById('usePermanent').checked = d.permanent !== false;
      if (rdMode === 'manual' && (d.countdown || 0) > 0) {
        document.querySelector('input[name="manualMode"][value="countdown"]').checked = true;
        document.getElementById('countdown').value = d.countdown;
      } else {
        document.querySelector('input[name="manualMode"][value="manual"]').checked = true;
      }
      document.getElementById('accessPassword').value = '';
      document.getElementById('redirectPageTitle').value = d.redirectPageTitle || '';
      var loadedMd = d.redirectPageContent || '';
      mdPane.value = loadedMd;
      wysiwygPane.innerHTML = loadedMd ? mdToHtml(loadedMd) : '';
      if (loadedMd && editorMode !== 'md') {
        editorMode = 'md';
        wysiwygPane.style.display = 'none';
        mdPane.style.display = 'block';
        document.querySelectorAll('.tb-btn').forEach(function(b){ b.style.display='none'; });
        document.querySelectorAll('.tb-sep').forEach(function(b){ b.style.display='none'; });
        document.getElementById('modeRich').classList.remove('active');
        document.getElementById('modeMd').classList.add('active');
      }
      document.getElementById('manualBtnTitle').value = d.manualBtnTitle || '';
      document.getElementById('darkBackground').checked = d.darkBackground === true;
      document.getElementById('centerContent').checked = d.centerContent === true;
      updateRdMode();
      updateManualMode();
      document.getElementById('ttl').value=d.ttl||0;
      document.getElementById('renew-pw-section').className='';
      submitBtn.disabled=false;
      document.getElementById('edit-form').className='';
      if(rdMode !== 'instant' && !advOpen) toggleAdvanced();
      if(!ttlOpen&&d.ttl) toggleTtl();
    }else{
      var d2=await res.json();
      st.textContent='❌ '+(t['err_'+d2.error]||t.slugAuthFail);st.className='bad';
    }
  }catch(e){st.textContent='❌ '+t.errNet;st.className='bad'}
}

function updateCheckBtn(){
  var s=document.getElementById('s').value.trim();
  var p=isAdminMode()?'ok':document.getElementById('p').value;
  var btn=document.getElementById('check-btn');
  btn.disabled=!(s && /^[a-zA-Z0-9]{3,10}$/.test(s) && p);
}
document.getElementById('s').addEventListener('input',updateCheckBtn);
document.getElementById('p').addEventListener('input',updateCheckBtn);

async function go(){
  const u=document.getElementById('u').value.trim(),s=document.getElementById('s').value.trim(),
        p=document.getElementById('p').value,k=getAdminKey(),
        redirectPageTitle=document.getElementById('redirectPageTitle').value.trim(),
        r=document.getElementById('r');
  var redirectPageContent=getEditorMarkdown();
  if(redirectPageContent.length>2000) redirectPageContent=redirectPageContent.slice(0,2000);
  if(!u){r.textContent='❌ '+t.errUrl;r.className='err';r.style.display='block';return}
  try{var uu=new URL(u);if((uu.protocol!=='http:'&&uu.protocol!=='https:')||!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,63}$/i.test(uu.hostname))throw 0}catch(e){r.textContent='❌ '+t.errUrlInvalid;r.className='err';r.style.display='block';return}
  if(mode==='modify'&&!s){r.textContent='❌ '+t.errSlug;r.className='err';r.style.display='block';return}
  if(mode==='modify'&&!p&&!isAdminMode()){r.textContent='❌ '+t.errPw;r.className='err';r.style.display='block';return}
  const payload={url:u};
  if(mode==='create'&&s) payload.slug=s;
  if(mode==='modify'){
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
  if (rdMode === 'manual') {
    var mm = document.querySelector('input[name="manualMode"]:checked').value;
    if (mm === 'countdown') {
      payload.countdown = parseInt(document.getElementById('countdown').value) || 30;
    } else {
      payload.countdown = 0;
      var ap = document.getElementById('accessPassword').value.trim();
      if (ap) {
        if (!/^\S{3,16}$/.test(ap)) {
          r.textContent='❌ '+t.err_INVALID_ACCESS_PASSWORD;r.className='err';r.style.display='block';return;
        }
        payload.accessPassword = ap;
      }
    }
  } else {
    payload.countdown = 0;
  }
  payload.redirectPageTitle=redirectPageTitle;
  payload.redirectPageContent=redirectPageContent;
  payload.manualBtnTitle=document.getElementById('manualBtnTitle').value.trim();
  payload.darkBackground=document.getElementById('darkBackground').checked;
  payload.centerContent=document.getElementById('centerContent').checked;
  var fetchUrl = mode==='modify' ? '/'+s : (s ? '/'+s : '/');
  var fetchMethod = mode==='modify' ? 'PUT' : 'POST';
  try{
    var hdrs={'Content-Type':'application/json','X-Admin-Key':k};
    if(mode==='modify') hdrs['X-Password']=p;
    const res=await fetch(fetchUrl,{method:fetchMethod,headers:hdrs,body:JSON.stringify(payload)});
    const d=await res.json();
    if(res.ok){
      let html=(d.updated?t.updated:t.created)+' <a href="'+d.short_url+'" target="_blank">'+d.short_url+'</a>';
      if(d.warn){var warns=Array.isArray(d.warn)?d.warn:[d.warn];warns.forEach(function(w){html+='<div class="warn">⚠ '+(t['warn_'+w]||w)+'</div>';});}
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
  var k=getAdminKey();
  var r=document.getElementById('r');
  if(!s) return;
  try{
    var p=document.getElementById('p').value;
    var res=await fetch('/'+s,{method:'DELETE',headers:{'X-Admin-Key':k,'X-Password':p}});
    var d=await res.json();
    if(res.ok){
      r.textContent='✓';r.className='free';r.style.display='block';
      document.getElementById('modify-actions').className='hidden';
      document.getElementById('edit-form').className='hidden';
      document.getElementById('s').readOnly=false;
      document.getElementById('p').readOnly=false;
      submitBtn.disabled=true;
    }else{
      r.textContent='❌ '+(t['err_'+d.error]||d.error);r.className='err';r.style.display='block';
    }
  }catch(e){r.textContent='❌ '+t.errNet;r.className='err';r.style.display='block';}
}

</script></body></html>`;

// ── LOCK helpers ─────────────────────────────────────────────────────

function isValidLock(val) {
  return typeof val === 'string' && /^[\x21-\x7e]{3,16}$/.test(val);
}

async function hashLockToken(password) {
  const data = new TextEncoder().encode('su:' + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hasApiHeader(request) {
  return !!(request.headers.get("X-Admin-Key") || (request.headers.get("Authorization") || "").startsWith("Bearer "));
}

// ── Request handler ──────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,X-Admin-Key,X-Password,Authorization",
        },
      });
    }

    // GET /gaobo.png — serve logo
    if (request.method === 'GET' && path === '/gaobo.png') {
      const raw = atob(GAOBO_PNG_B64);
      const buf = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
      return new Response(buf, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' } });
    }

    const slug = path.slice(1);
    const method = request.method;
    const cdnHost = (request.cf && request.cf.country === 'CN') ? 'cdn.jsdmirror.com' : 'cdn.jsdelivr.net';

    // ── LOCK: unlock endpoint ──
    if (method === "POST" && slug === "_unlock") {
      const headers = { "Content-Type": "application/json" };
      if (!isValidLock(env.LOCK)) {
        return new Response(JSON.stringify({ ok: true }), { headers });
      }
      let input;
      try { input = await request.json(); } catch {
        return new Response(JSON.stringify({ ok: false }), { status: 400, headers });
      }
      if (!(await safeEqual(input.password || '', env.LOCK))) {
        return new Response(JSON.stringify({ ok: false }), { status: 403, headers });
      }
      const token = await hashLockToken(env.LOCK);
      const maxAge = input.remember ? 2592000 : 86400;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...headers, "Set-Cookie": "su_auth=" + token + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge },
      });
    }

    // ── LOCK: check (skip for API calls with auth header, skip for slug redirects) ──
    if (isValidLock(env.LOCK) && !hasApiHeader(request)) {
      const cookie = request.headers.get("Cookie") || "";
      const match = cookie.match(/su_auth=([^;]+)/);
      const valid = match && await safeEqual(match[1], await hashLockToken(env.LOCK));
      if (!valid && method === "GET" && !slug) {
        return html(lockPage(cdnHost));
      }
      if (!valid && (method === "POST" || method === "PUT" || method === "DELETE") && !slug.startsWith("_")) {
        // Allow slug redirects (GET with slug) but block write operations from locked-out users
        return json({ error: "UNAUTHORIZED" }, 401);
      }
    }

    // ── GET: Landing page or redirect ──
    if (method === "GET") {
      if (!slug) {
        const keyRequired = env.KEY ? 'true' : 'false';
        const page = HTML.replace('{{DEFAULT_TTL}}', String(normalizeTtl(env.TTL || 0))).replace('{{KEY_REQUIRED}}', keyRequired).replace('{{CDN_HOST}}', cdnHost);
        return html(page);
      }
      if (slug.includes("/")) return notFound(env, url);
      const raw = await env.DATA.get(slug);
      if (!raw) return notFound(env, url);
      const entry = JSON.parse(raw);
      const mode = entry.redirectMode || 'instant';
      if (mode === 'manual') {
        const acceptLang = request.headers.get("Accept-Language") || "";
        if (entry.accessHash) {
          const providedPw = url.searchParams.get('_pw') || '';
          if (providedPw) {
            const h = await hashPassword(providedPw);
            if (await safeEqual(h, entry.accessHash)) {
              return Response.redirect(entry.url, entry.permanent === false ? 302 : 301);
            }
            return html(redirectPage(entry, acceptLang, cdnHost, slug, true));
          }
          return html(redirectPage(entry, acceptLang, cdnHost, slug, false));
        }
        return html(redirectPage(entry, acceptLang, cdnHost, slug, false));
      }
      return Response.redirect(entry.url, entry.permanent === false ? 302 : 301);
    }

    // ── HEAD /:slug — verify slug + password (no body) ──
    if (method === "HEAD") {
      const auth = await checkAuth(request, env);
      if (auth instanceof Response) return new Response(null, { status: 401 });
      if (!slug || slug.includes("/")) return new Response(null, { status: 403 });
      if (auth.isAdmin) {
        const raw = await env.DATA.get(slug);
        return new Response(null, { status: raw ? 200 : 403 });
      }
      const password = (request.headers.get("X-Password") || "").trim();
      if (!password) return new Response(null, { status: 403 });
      const raw = await env.DATA.get(slug);
      if (!raw) return new Response(null, { status: 403 });
      const entry = JSON.parse(raw);
      const pwHash = await hashPassword(password);
      if (!(await safeEqual(entry.pwHash, pwHash))) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 200 });
    }

    // ── POST /:slug — verify password & return entry ──
    // ── POST / or POST /:slug — create (single or batch) ──
    if (method === "POST") {
      const auth = await checkAuth(request, env);
      if (auth instanceof Response) return auth;
      const isAdmin = auth.isAdmin;

      const password = (request.headers.get("X-Password") || "").trim();
      let body;
      try { body = await request.json(); } catch { body = {}; }

      // ── Batch create (admin only) ──
      if (Array.isArray(body)) {
        if (!isAdmin) return json({ error: "UNAUTHORIZED" }, 401);
        const slugsSeen = new Set();
        for (const item of body) {
          const s = (item.slug || "").trim();
          if (s && /^[a-zA-Z0-9]{3,10}$/.test(s)) {
            if (slugsSeen.has(s)) return json({ error: "BATCH_DUPLICATE_SLUG", slug: s }, 400);
            slugsSeen.add(s);
          }
        }
        const results = await Promise.all(body.map((item) => {
          const itemSlug = (item.slug || "").trim();
          const itemValidSlug = itemSlug && !itemSlug.includes("/") && /^[a-zA-Z0-9]{3,10}$/.test(itemSlug);
          return createOne(item, itemSlug, itemValidSlug, env, url);
        }));
        const errors = results.filter(r => r.error).length;
        const status = errors === 0 ? 201 : errors === results.length ? 400 : 207;
        return json(results, status);
      }

      const validSlug = slug && !slug.includes("/") && /^[a-zA-Z0-9]{3,10}$/.test(slug);
      const hasUrl = !!(body.url || '').trim();

      // Slug exists — verify or return entry
      if (validSlug) {
        const raw = await env.DATA.get(slug);
        if (raw) {
          if (isAdmin) {
            const entry = JSON.parse(raw);
            const { pwHash: _, accessHash: _ah, ...safe } = entry;
            return json({ slug, ...safe });
          }
          if (!password) return json({ error: "SLUG_EXISTS" }, 400);
          const entry = JSON.parse(raw);
          const pwHash = await hashPassword(password);
          if (!(await safeEqual(entry.pwHash, pwHash))) {
            return json({ error: "VERIFY_FAILED" }, 403);
          }
          const { pwHash: _, accessHash: _ah, ...safe } = entry;
          return json({ slug, ...safe });
        }
        if (password && !hasUrl) return json({ error: "VERIFY_FAILED" }, 403);
      }

      // Public mode checks
      if (!isAdmin) {
        const rl = await checkRateLimit(env, request);
        if (rl instanceof Response) return rl;
        const result = await createOne(body, slug, validSlug, env, url);
        if (!result.error) await incrementRateLimit(env, rl.key, rl.data);
        return json(result, result.error ? 400 : 201);
      }

      return json(await createOne(body, slug, validSlug, env, url), 201);
    }

    // ── PUT /:slug — update short URL ──
    if (method === "PUT") {
      const auth = await checkAuth(request, env);
      if (auth instanceof Response) return auth;
      const isAdmin = auth.isAdmin;
      if (!slug || slug.includes("/")) return json({ error: "VERIFY_FAILED" }, 403);

      const password = (request.headers.get("X-Password") || "").trim();

      let body;
      try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }

      const raw = await env.DATA.get(slug);
      if (!raw) return json({ error: "VERIFY_FAILED" }, 403);
      const entry = JSON.parse(raw);

      if (!isAdmin) {
        if (!password) return json({ error: "VERIFY_FAILED" }, 403);
        const pwHash = await hashPassword(password);
        if (!(await safeEqual(entry.pwHash, pwHash))) {
          return json({ error: "VERIFY_FAILED" }, 403);
        }
        const rl = await checkRateLimit(env, request);
        if (rl instanceof Response) return rl;
        // increment after successful update below
        var _rlKey = rl.key, _rlData = rl.data;
      }

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
      const darkBackground = body.darkBackground === true;
      const centerContent = body.centerContent === true;
      const redirectPageTitle = (body.redirectPageTitle || "").trim().slice(0, DELAY_TITLE_MAX);
      const redirectPageContent = (body.redirectPageContent || "").trim().slice(0, DELAY_HTML_MAX);
      let accessHash = entry.accessHash || null;
      let updateWarn = null;
      const accessPassword = (body.accessPassword || '').trim();
      if (redirectMode === 'manual') {
        if (accessPassword) {
          if (/^\S{3,16}$/.test(accessPassword)) {
            accessHash = await hashPassword(accessPassword);
          } else {
            updateWarn = "ACCESS_PASSWORD_IGNORED";
          }
        } else if (body.hasOwnProperty('accessPassword') && !accessPassword) {
          accessHash = null;
        }
      } else {
        accessHash = null;
      }
      const defaultTtl = normalizeTtl(env.TTL || 0);
      const ttl = normalizeTtl(body.ttl, defaultTtl);

      const updatedEntry = clean({
        ...entry, url: target, redirectMode, permanent,
        countdown: accessHash ? 0 : countdown,
        redirectPageTitle: redirectPageTitle || null,
        redirectPageContent: redirectPageContent || null,
        manualBtnTitle: manualBtnTitle || null,
        accessHash: accessHash || null,
        darkBackground, centerContent, ttl, updatedAt: new Date().toISOString(),
      });
      let newPassword = null;
      if (body.resetPassword === true) {
        newPassword = generatePassword();
        updatedEntry.pwHash = await hashPassword(newPassword);
      }
      const putOpts = {};
      if (ttl > 0) putOpts.expirationTtl = ttl;
      await env.DATA.put(slug, JSON.stringify(updatedEntry), putOpts);
      if (!isAdmin) await incrementRateLimit(env, _rlKey, _rlData);

      const resp = { short_url: getBaseUrl(env, url) + slug, slug, target, updated: true };
      if (newPassword) resp.password = newPassword;
      if (updateWarn) resp.warn = updateWarn;
      return json(resp, 200);
    }

    // ── DELETE / — purge all (admin only) ──
    // ── DELETE /:slug — delete single short URL ──
    if (method === "DELETE") {
      const auth = await checkAuth(request, env);
      if (auth instanceof Response) return auth;
      const isAdmin = auth.isAdmin;

      // Purge all (admin only)
      if (!slug) {
        if (!isAdmin) return json({ error: "UNAUTHORIZED" }, 401);
        let deleted = 0;
        let cursor = null;
        do {
          const list = await env.DATA.list({ cursor, limit: 1000 });
          if (list.keys.length) {
            await Promise.all(list.keys.map(k => env.DATA.delete(k.name)));
            deleted += list.keys.length;
          }
          cursor = list.list_complete ? null : list.cursor;
        } while (cursor);
        return json({ purged: deleted });
      }

      if (slug.includes("/")) return json({ error: "VERIFY_FAILED" }, 403);

      if (isAdmin) {
        const raw = await env.DATA.get(slug);
        if (!raw) return json({ error: "VERIFY_FAILED" }, 403);
        await env.DATA.delete(slug);
        return json({ deleted: slug });
      }

      const password = (request.headers.get("X-Password") || "").trim();
      if (!password) return json({ error: "VERIFY_FAILED" }, 403);
      const raw = await env.DATA.get(slug);
      if (!raw) return json({ error: "VERIFY_FAILED" }, 403);
      const entry = JSON.parse(raw);
      const pwHash = await hashPassword(password);
      if (!(await safeEqual(entry.pwHash, pwHash))) {
        return json({ error: "VERIFY_FAILED" }, 403);
      }
      await env.DATA.delete(slug);
      return json({ deleted: slug });
    }

    return notFound(env, url);
  },
};
