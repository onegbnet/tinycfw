var HOST_DEFAULT = "cdn.jsdelivr.net";
var HOST_CN = "jsd.onmicrosoft.cn";
function selectJsdelivrCdnHost(request) {
  if (request && request.cf && request.cf.country === "CN") return HOST_CN;
  return HOST_DEFAULT;
}
function makeJsdelivrUrl(host, pkg, version, file) {
  return `https://${host}/npm/${pkg}@${version}/${file}`;
}
function makeJsdelivrScriptTag(host, pkg, version, file) {
  return `<script src="${makeJsdelivrUrl(host, pkg, version, file)}"></script>`;
}

var MARKDOWN_IT_VERSION = "14";
function makeMarkdownItScriptTag(cdnHost) {
  return makeJsdelivrScriptTag(
    cdnHost,
    "markdown-it",
    MARKDOWN_IT_VERSION,
    "dist/markdown-it.min.js"
  );
}

function isValidLock(val) {
  return typeof val === "string" && /^[\x21-\x7e]{3,64}$/.test(val);
}
async function hashToken(prefix, pw) {
  const data = new TextEncoder().encode(prefix + pw);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode("_cmp_"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(String(a || ""))),
    crypto.subtle.sign("HMAC", key, enc.encode(String(b || "")))
  ]);
  const ua = new Uint8Array(sa), ub = new Uint8Array(sb);
  let d = 0;
  for (let i = 0; i < ua.length; i++) d |= ua[i] ^ ub[i];
  return d === 0;
}
function makeLockModule({
  cookieName,
  hashPrefix,
  unlockPath,
  appName,
  errorCode = "UNAUTHORIZED",
  apiBypass = () => false,
  slugBypass = () => false,
  lockPageHtml
} = {}) {
  for (const [k, v] of Object.entries({ cookieName, hashPrefix, unlockPath, appName, lockPageHtml })) {
    if (v == null || v === "") throw new Error(`makeLockModule: missing required option "${k}"`);
  }
  const cookieRe = new RegExp(`(?:^|;\\s*)${cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]+)`);
  async function handleUnlock(request, env) {
    const headers = { "Content-Type": "application/json" };
    if (!isValidLock(env.LOCK)) {
      return new Response(JSON.stringify({ ok: true }), { headers });
    }
    let input;
    try {
      input = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "INVALID_JSON" }), { status: 400, headers });
    }
    if (!await safeEqual(input.password || "", env.LOCK)) {
      return new Response(JSON.stringify({ ok: false }), { status: 403, headers });
    }
    const token = await hashToken(hashPrefix, env.LOCK);
    const maxAge = input.remember ? 2592e3 : 86400;
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
      }
    });
  }
  async function isAuthorized(request, env) {
    if (!isValidLock(env.LOCK)) return true;
    if (apiBypass(request)) return true;
    const cookie = request.headers.get("Cookie") || "";
    const m = cookie.match(cookieRe);
    if (!m) return false;
    return await safeEqual(m[1], await hashToken(hashPrefix, env.LOCK));
  }
  function renderLockPage(cdnHost) {
    return new Response(
      lockPageHtml.replace(/\{\{CDN_HOST\}\}/g, cdnHost),
      { headers: { "Content-Type": "text/html;charset=UTF-8" } }
    );
  }
  return {
    cookieName,
    hashPrefix,
    unlockPath,
    appName,
    errorCode,
    isValidLock,
    hashToken: (pw) => hashToken(hashPrefix, pw),
    safeEqual,
    handleUnlock,
    isAuthorized,
    renderLockPage,
    apiBypass,
    slugBypass
  };
}

function makeResponseHelpers({
  cors = null,
  prettyJson = false,
  htmlCache = null
} = {}) {
  const baseJsonHeaders = { "Content-Type": "application/json" };
  if (cors) baseJsonHeaders["Access-Control-Allow-Origin"] = cors;
  const baseHtmlHeaders = { "Content-Type": "text/html;charset=UTF-8" };
  if (htmlCache) baseHtmlHeaders["Cache-Control"] = htmlCache;
  function json6(data, status = 200, extraHeaders = {}) {
    const body = prettyJson ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    return new Response(body, {
      status,
      headers: { ...baseJsonHeaders, ...extraHeaders }
    });
  }
  function html2(body, status = 200) {
    return new Response(body, { status, headers: baseHtmlHeaders });
  }
  function text(body, status = 200) {
    return new Response(body, {
      status,
      headers: { "Content-Type": "text/plain;charset=UTF-8" }
    });
  }
  return { json: json6, html: html2, text };
}

function getCookie(reqOrHeader, name) {
  const header = typeof reqOrHeader === "string" ? reqOrHeader : reqOrHeader && reqOrHeader.headers && reqOrHeader.headers.get("Cookie") || "";
  if (!header) return null;
  const parts = header.split(/;\s*/);
  const prefix = name + "=";
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      const raw = part.slice(prefix.length);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}
function buildSetCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.secure !== false) parts.push("Secure");
  if (opts.httpOnly) parts.push("HttpOnly");
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  return parts.join("; ");
}

var landing_default = `<!DOCTYPE html>
<html lang="en" dir="ltr" data-theme="{{THEME}}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shurl</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71'/%3E%3Cpath d='M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71'/%3E%3C/svg%3E">
<script src="https://{{CDN_HOST}}/npm/markdown-it@14/dist/markdown-it.min.js"></script>
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/overlay/style.min.css">
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@c2edd27efa7fac4045a25f099140c16655198933/shurl/view.min.css"></head><body><div style="width:100%;max-width:480px"><div class="c">
<div class="header">
  <div class="header-left">
    <div class="logo-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
      </svg>
    </div>
    <h1 id="app-title" data-i18n="app_name"></h1>
  </div>
  <div style="display:flex;gap:8px;align-items:center">
    <select id="lang-select" class="lang-select">
  <option value="en">English</option>
  <option value="eo">Esperanto</option>
  <option value="fr">Fran\xE7ais</option>
  <option value="de">Deutsch</option>
  <option value="es">Espa\xF1ol</option>
  <option value="it">Italiano</option>
  <option value="nl">Nederlands</option>
  <option value="da">Dansk</option>
  <option value="zh-cn">\u7B80\u4F53\u4E2D\u6587</option>
  <option value="zh-tw">\u7E41\u9AD4\u4E2D\u6587</option>
  <option value="ja">\u65E5\u672C\u8A9E</option>
  <option value="ko">\uD55C\uAD6D\uC5B4</option>
  <option value="ms">Bahasa Melayu</option>
  <option value="vi">Ti\u1EBFng Vi\u1EC7t</option>
  <option value="th">\u0E44\u0E17\u0E22</option>
  <option value="ta">\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD</option>
  <option value="my">\u1019\u103C\u1014\u103A\u1019\u102C</option>
  <option value="uk">\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430</option>
  <option value="he">\u05E2\u05D1\u05E8\u05D9\u05EA</option>
  <option value="ar">\u0627\u0644\u0639\u0631\u0628\u064A\u0629</option>
</select>

    <button type="button" class="theme-toggle" id="themeToggle" title="Toggle theme"></button>

    <button type="button" id="adminBtn" data-i18n-title="admin_enter" style="background:none;border:1px solid var(--s-border);border-radius:.4rem;padding:4px 8px;cursor:pointer;font-size:.85rem;color:var(--s-text-muted)" title="">\u{1F511}</button>
  </div>
</div>
<div class="tabs">
  <div class="tab active" id="tab-create" data-i18n="tab_create" onclick="setMode('create')"></div>
  <div class="tab" id="tab-modify" data-i18n="tab_modify" onclick="setMode('modify')"></div>
</div>


<label class="field-label" data-show-mode="create"><span data-i18n="slug_label_create"></span> <span data-i18n="hint_omittable"></span></label>
<label class="field-label" data-show-mode="modify" data-i18n="slug_label_modify"></label>
<div class="slug-row">
  <input id="s" type="text" minlength="3" maxlength="10" pattern="[a-zA-Z0-9]{3,10}">
  <button class="form-btn" onclick="verifySlug()" id="check-btn" disabled data-show-mode="modify" style="display:none"></button>
</div>
<div id="slug-status"></div>

<div id="pw-section" data-show-mode="modify" style="display:none">
  <label id="l-pw" data-i18n="slug_password" class="field-label"></label>
  <div class="slug-row">
    <input id="p" type="password" data-i18n-ph="pw_placeholder">
  </div>
  <p class="hint" id="h-pw" data-i18n="pw_hint"></p>
</div>

<div id="modify-actions" class="hidden">
  <div class="btn-row">
    <button class="form-btn" id="view-btn" onclick="loadEntry()" data-i18n="btn_view"></button>
    <button class="form-btn btn-delete" id="action-delete-btn" onclick="deleteSlug()" data-i18n="btn_delete"></button>
  </div>
</div>

<div id="edit-form">
<div class="kind-row" id="kind-row">
  <label class="rd-radio"><input type="radio" name="kind" value="url" checked><span id="l-kindUrl" data-i18n="kind_url"></span></label>
  <label class="rd-radio"><input type="radio" name="kind" value="file"><span id="l-kindFile" data-i18n="kind_file"></span></label>
</div>

<div id="url-section">
<label id="l-url" data-i18n="label_target_url" class="field-label"></label>
<input id="u" type="url" placeholder="https://mydomain.tld/long/path/to/shorten">
<div id="url-status"></div>
</div>

<div id="file-section" class="hidden">
  <label id="l-filePicker" data-i18n="file_picker_label" class="field-label"></label>
  <div id="file-drop" style="border:2px dashed var(--s-border);border-radius:.6rem;padding:1.2rem .8rem;text-align:center;cursor:pointer;margin-bottom:.6rem;transition:border-color .15s,background .15s">
    <input id="file-input" type="file" multiple style="display:none">
    <div id="file-drop-hint" data-i18n="file_picker_hint" style="color:var(--s-text-muted);font-size:.88rem"></div>
  </div>
  <div id="file-list" style="margin-bottom:.6rem"></div>
  <div id="file-totals" class="hint" style="margin-bottom:.8rem"></div>
</div>

<div id="renew-pw-section" class="hidden" style="margin-bottom:.8rem">
  <label style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;color:var(--s-text-muted);cursor:pointer">
    <input type="checkbox" id="resetPassword" style="accent-color:var(--s-accent)">
    <span id="l-resetPassword" data-i18n="btn_reset_password"></span>
  </label>
</div>

<div class="collapse-toggle" id="ttl-toggle" onclick="toggleTtl()"><span class="caret">\u25B6</span> <span data-i18n="ttl_options"></span></div>
<div id="ttl-section" class="hidden">
  <div class="ttl-row">
    <input id="ttl" type="number" min="0">
    <select id="ttl-unit">
      <option value="s" id="ttlopt-s" data-i18n="ttl_unit_s">Seconds</option>
      <option value="m" id="ttlopt-m" data-i18n="ttl_unit_m">Minutes</option>
      <option value="h" id="ttlopt-h" data-i18n="ttl_unit_h">Hours</option>
      <option value="d" id="ttlopt-d" data-i18n="ttl_unit_d">Days</option>
      <option value="mo" id="ttlopt-mo" data-i18n="ttl_unit_mo">Months</option>
    </select>
  </div>
  <p class="hint" id="h-ttl" data-i18n="ttl_hint"></p>
  <label class="rd-check" style="margin:.8rem 0">
    <input type="checkbox" id="oneTime">
    <span id="l-oneTime" data-i18n="label_one_time"></span>
  </label>
</div>

<div class="collapse-toggle" id="adv-toggle" onclick="toggleAdvanced()"><span class="caret">\u25B6</span> <span data-i18n="redirect_options"></span></div>
<div id="advanced" class="hidden">
<div class="rd-mode">
  <label class="rd-radio">
    <input type="radio" name="rdMode" value="instant" checked>
    <span id="l-rdInstant" data-i18n="redirect_mode_instant"></span>
  </label>
  <div id="rd-instant-opts" style="padding-left:1.5rem;margin-bottom:.6rem">
    <label class="rd-check">
      <input type="checkbox" id="usePermanent" checked>
      <span id="l-usePermanent" data-i18n="label_use_permanent"></span>
    </label>
  </div>
</div>

<div class="rd-mode">
  <label class="rd-radio">
    <input type="radio" name="rdMode" value="manual">
    <span id="l-rdManual" data-i18n="redirect_mode_manual"></span>
  </label>
  <div id="rd-manual-opts" class="hidden" style="padding-left:1.5rem">
    <div class="group-title" id="g-contentStyle" data-i18n="heading_content_style"></div>
    <label id="l-redirectPageTitle" data-i18n="redirect_page_title_label" class="field-label"></label>
    <input id="redirectPageTitle" type="text" maxlength="128" data-i18n-ph="redirect_page_title_placeholder">

    <label id="l-redirectPageContent" data-i18n="redirect_page_content_label" class="field-label"></label>
    <!-- dev/common/markdown-editor/view.html \u2014 see README for placeholder spec -->
<div class="mde-root" data-textarea-id="mdPane">
  <div class="mde-toolbar" role="toolbar">
    <button type="button" class="mde-tb-btn" data-cmd="bold" title="Bold"><b>B</b></button>
    <button type="button" class="mde-tb-btn" data-cmd="italic" title="Italic"><i>I</i></button>
    <span class="mde-tb-sep"></span>
    <button type="button" class="mde-tb-btn" data-cmd="h1" title="Heading 1">H1</button>
    <button type="button" class="mde-tb-btn" data-cmd="h2" title="Heading 2">H2</button>
    <button type="button" class="mde-tb-btn" data-cmd="h3" title="Heading 3">H3</button>
    <span class="mde-tb-sep"></span>
    <button type="button" class="mde-tb-btn" data-cmd="ul" title="Bullet list">&#8226;</button>
    <button type="button" class="mde-tb-btn" data-cmd="ol" title="Numbered list">1.</button>
    <button type="button" class="mde-tb-btn" data-cmd="blockquote" title="Blockquote">&ldquo;</button>
    <button type="button" class="mde-tb-btn" data-cmd="code" title="Inline code">&lt;/&gt;</button>
    <button type="button" class="mde-tb-btn" data-cmd="link" title="Insert link">&#128279;</button>
    <button type="button" class="mde-tb-btn" data-cmd="hr" title="Horizontal rule">&mdash;</button>
    <span class="mde-tb-spacer"></span>
    <button type="button" class="mde-tb-btn mde-tb-preview" data-cmd="preview" title="Preview">
      <span class="mde-tb-preview-icon">&#128065;</span>
      <span class="mde-tb-preview-label">Preview</span>
    </button>
  </div>
  <textarea id="mdPane" class="mde-textarea" placeholder="Write markdown here..."></textarea>
</div>

<div class="mde-preview-modal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="mde-preview-title">
  <div class="mde-preview-inner">
    <div class="mde-preview-header">
      <h3 id="mde-preview-title">Preview</h3>
      <button type="button" class="mde-preview-close" aria-label="Close">&times;</button>
    </div>
    <div class="mde-preview-body"></div>
  </div>
</div>

    <p class="hint" id="h-redirectPageContent" data-i18n="redirect_page_content_hint"></p>

    <label class="rd-check" style="margin-top:.4rem">
      <input type="checkbox" id="centerContent">
      <span id="l-centerContent" data-i18n="label_center_content"></span>
    </label>
    <label class="rd-check" style="margin-top:.4rem">
      <input type="checkbox" id="darkBackground">
      <span id="l-darkBackground" data-i18n="label_dark_background"></span>
    </label>

    <div class="group-title" id="g-interaction" data-i18n="heading_interaction"></div>
    <div style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
      <label class="rd-check" style="margin:0">
        <input type="checkbox" id="requirePassword">
        <span id="l-requirePassword" data-i18n="label_require_password"></span>
      </label>
      <input id="accessPassword" type="password" maxlength="16" style="display:none;flex:1;min-width:140px;margin:0">
    </div>
    <p class="hint" id="h-accessPassword" style="color:#ef4444;display:none;margin:.2rem 0 .4rem"></p>

    <div style="margin-top:.4rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
      <label class="rd-check" style="margin:0">
        <input type="checkbox" id="useCountdown">
        <span id="l-useCountdown" data-i18n="label_use_countdown"></span>
      </label>
      <select id="countdown" style="display:none;width:auto;margin:0"></select>
    </div>

    <label id="l-manualBtn" data-i18n="manual_btn_label" class="field-label" style="margin-top:.8rem"></label>
    <input id="manualBtnTitle" type="text" maxlength="128" data-i18n-ph="manual_btn_placeholder">
  </div>
</div>
</div>

<div class="btn-row">
<button class="form-btn" onclick="go()" id="submit-btn" disabled></button>
</div>
</div>
<div id="r"></div>

</div>
<footer style="text-align:center;padding:1rem 0;font-size:.75rem;color:var(--footer-color,inherit)">\xA9 <span id="footerYear"></span> <a href="https://go.gb.net/gaobo" target="_blank" style="color:var(--footer-color,inherit);text-decoration:none;border-bottom:1px dashed var(--footer-border,currentColor)"><img src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/gaobo.png" alt="" style="height:20px;vertical-align:middle;margin:0 2px;"><span id="footerBrand"></span></a> <span id="footerProd"></span> <a href="https://github.com/onegbnet/tinyutils/blob/master/LICENSE" target="_blank" style="color:var(--footer-color,inherit);text-decoration:none;border-bottom:1px dashed var(--footer-border,currentColor)">MIT License</a></footer>

</div>
<script>
// Outer-script shim: declare placeholder vars BEFORE any IIFE so esbuild
// can't constant-fold their comparison inside the cross-origin
// client.min.js. IS_ADMIN_RAW renders server-side from cookie-aware
// checkAuth \u2014 first paint shows admin/public state correctly with no
// flash of wrong UI after JS loads.
//
// I18N table is no longer inline \u2014 it's loaded from dist/i18n.min.js
// (Phase 5b-A self assets) via the <script src> below. jsDelivr 1y cache.
var KEY_REQUIRED_RAW = "{{KEY_REQUIRED}}";
var IS_ADMIN_RAW = "{{IS_ADMIN}}";
</script>

<!-- CDN-served browser modules \u2014 order: i18n-engine first; action before
     overlay; field separately; theme self-contained (storage-free, reads
     <html data-theme>). {{CDN_HOST}} swapped per-request by handleGet(). -->
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/i18n-engine/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/footer-brand/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/action/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/field/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/overlay/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/theme/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/upload2kv/client.min.js"></script>

<!-- markdown-editor (Phase 5b-B): per-app config via inline shim BEFORE
     the CDN <script src> so window.MDE_CONFIG / window.MDE_I18N_OVERRIDES
     are set when the IIFE executes. -->
<script>window.MDE_CONFIG={"textareaId":"mdPane","trimReturn":true};</script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/markdown-editor/client.min.js"></script>

<!-- shurl's own assets: i18n.min.js (sets window.I18N) loads BEFORE
     client.min.js so the IIFE sees I18N as a free var. Both shipped via
     jsDelivr (1 year cache, repeat-page revisits skip the download). -->
<script src="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@c2edd27efa7fac4045a25f099140c16655198933/shurl/i18n.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@c2edd27efa7fac4045a25f099140c16655198933/shurl/client.min.js"></script></body></html>`;

var SLUG_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
var SLUG_MIN = 3;
var SLUG_MAX = 10;
var PW_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
var PW_LEN = 16;
var DELAY_MAX = 60;
var DELAY_HTML_MAX = 2e3;
var DELAY_TITLE_MAX = 128;
var TTL_MIN = 60;
var TTL_MAX = 31536e3;
var CHUNK_SIZE = 10 * 1024 * 1024;
var TOTAL_MAX = 128 * 1024 * 1024;
var RESERVE_TTL = 3600;
var UPLOAD_TOKEN_LEN = 24;
var FILE_NAME_MAX = 255;
var FILE_MIME_MAX = 128;

function normalizeTtl(val, fallback) {
  const n = Math.floor(Number(val));
  if (n === 0) return 0;
  if (isNaN(n) || n < TTL_MIN || n > TTL_MAX) return fallback !== void 0 ? fallback : 0;
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
function generateUploadToken() {
  const bytes = new Uint8Array(UPLOAD_TOKEN_LEN / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function contentDispositionHeader(filename) {
  const ascii = String(filename || "download").replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  const encoded = encodeURIComponent(filename || "download");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

async function hashPassword(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function clean(obj) {
  var defaults = { countdown: 0, permanent: true, oneTime: false, darkBackground: false, centerContent: false, ttl: 0, redirectMode: "instant" };
  var result = {};
  for (var k in obj) {
    if (!obj.hasOwnProperty(k)) continue;
    var v = obj[k];
    if (v === void 0 || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (defaults.hasOwnProperty(k) && v === defaults[k]) continue;
    result[k] = v;
  }
  return result;
}
async function applyMetadataFields(body, existing, env) {
  const redirectMode = body.redirectMode || "instant";
  if (Array.isArray(body.redirectMode) || redirectMode !== "instant" && redirectMode !== "manual") {
    return { error: "INVALID_REDIRECT_MODE" };
  }
  let countdown = Math.floor(Number(body.countdown) || 0);
  if (countdown < 0 || countdown > DELAY_MAX) countdown = 0;
  const permanent = body.permanent !== false;
  const manualBtnTitle = (body.manualBtnTitle || "").trim().slice(0, 128);
  const oneTime = body.oneTime === true;
  const darkBackground = body.darkBackground === true;
  const centerContent = body.centerContent === true;
  const redirectPageTitle = (body.redirectPageTitle || "").trim().slice(0, DELAY_TITLE_MAX);
  const redirectPageContent = (body.redirectPageContent || "").trim().slice(0, DELAY_HTML_MAX);
  const warnings = [];
  let accessHash = existing ? existing.accessHash || null : null;
  const accessPassword = (body.accessPassword || "").trim();
  if (redirectMode === "manual") {
    if (accessPassword) {
      if (/^\S{3,16}$/.test(accessPassword)) {
        accessHash = await hashPassword(accessPassword);
      } else {
        warnings.push("ACCESS_PASSWORD_IGNORED");
      }
    } else if (existing && Object.prototype.hasOwnProperty.call(body, "accessPassword") && !accessPassword) {
      accessHash = null;
    }
  } else {
    accessHash = null;
  }
  const defaultTtl = normalizeTtl(env.TTL || 0);
  const ttl = normalizeTtl(body.ttl, defaultTtl);
  return {
    fields: {
      redirectMode,
      permanent,
      countdown: accessHash ? 0 : countdown,
      redirectPageTitle: redirectPageTitle || null,
      redirectPageContent: redirectPageContent || null,
      manualBtnTitle: manualBtnTitle || null,
      accessHash: accessHash || null,
      oneTime,
      darkBackground,
      centerContent,
      ttl
    },
    warnings
  };
}
function isValidUrl(val) {
  if (!val || typeof val !== "string") return false;
  try {
    const u = new URL(val);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
function getBaseUrl(env, requestUrl) {
  if (env.BASE) {
    let base = env.BASE.trim();
    if (!base.endsWith("/")) base += "/";
    if (isValidUrl(base.replace(/\/$/, ""))) return base;
  }
  if (requestUrl.hostname && !requestUrl.hostname.endsWith(".workers.dev")) {
    return requestUrl.origin + "/";
  }
  return requestUrl.origin + "/";
}
var BLOCKED_SHORTENER_HOSTS = [
  // International
  "bit.ly",
  "j.mp",
  "bitly.com",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "v.gd",
  "buff.ly",
  "adf.ly",
  "bl.ink",
  "rb.gy",
  "short.io",
  "cutt.ly",
  "rebrand.ly",
  "qr.ae",
  "1url.com",
  "hyperurl.co",
  "bit.do",
  "tiny.cc",
  "shorturl.at",
  "shorturl.me",
  "t.ly",
  "t2m.io",
  "to.ly",
  "tr.im",
  "snip.ly",
  "snipurl.com",
  "po.st",
  "su.pr",
  "soo.gd",
  "clck.ru",
  "ppt.cc",
  "reurl.cc",
  "s.id",
  "dub.sh",
  "lc.chat",
  "shorten.tv",
  "waa.ai",
  "han.gl",
  "kl.am",
  "u.nu",
  "u.to",
  "fur.ly",
  "cli.gs",
  "trib.al",
  "shr.lc",
  "urlz.fr",
  "x.co",
  "0rz.tw",
  "go.ly",
  "goo.by",
  "loom.ly",
  "clicky.me",
  "bom.so",
  "ln.is",
  "p.ly",
  // Chinese
  "t.cn",
  "url.cn",
  "w.url.cn",
  "dwz.cn",
  "dwz.date",
  "dwz.lc",
  "dwz.win",
  "sina.lt",
  "suo.nz",
  "mrw.so",
  "mtw.so",
  "rrd.me",
  "c-n.cc",
  "m6z.cn",
  "u6.gg",
  "tb.cn",
  "d.cn"
];
function isBlockedTarget(target, requestUrl, env) {
  try {
    const u = new URL(target);
    const host = u.hostname.toLowerCase();
    const origin = requestUrl.origin.toLowerCase();
    if (target.toLowerCase().startsWith(origin)) return true;
    if (env.BASE) {
      const base = env.BASE.trim().replace(/\/$/, "").toLowerCase();
      if (target.toLowerCase().startsWith(base)) return true;
    }
    if (BLOCKED_SHORTENER_HOSTS.includes(host)) return true;
    return false;
  } catch {
    return false;
  }
}
async function createOne(item, slug, validSlug, env, requestUrl) {
  const target = (item.url || "").trim();
  try {
    const u = new URL(target);
    if (u.protocol !== "http:" && u.protocol !== "https:" || !/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(u.hostname)) throw 0;
  } catch {
    return { error: "INVALID_URL" };
  }
  if (isBlockedTarget(target, requestUrl, env)) return { error: "BLOCKED_URL" };
  const meta = await applyMetadataFields(item, null, env);
  if (meta.error) return { error: meta.error };
  let newSlug;
  const warnings = [...meta.warnings];
  if (validSlug) {
    if (await env.DATA.get(slug) !== null) return { error: "SLUG_EXISTS" };
    newSlug = slug;
  } else {
    if (slug) warnings.push("SLUG_IGNORED");
    let tries = 0;
    do {
      newSlug = makeSlug();
      tries++;
    } while (await env.DATA.get(newSlug) !== null && tries < 5);
    if (await env.DATA.get(newSlug) !== null) return { error: "SLUG_COLLISION" };
  }
  const generatedPassword = generatePassword();
  const pwHash = await hashPassword(generatedPassword);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const newEntry = clean({
    url: target,
    pwHash,
    ...meta.fields,
    createdAt: now,
    updatedAt: null
  });
  const putOpts = {};
  if (meta.fields.ttl > 0) putOpts.expirationTtl = meta.fields.ttl;
  await env.DATA.put(newSlug, JSON.stringify(newEntry), putOpts);
  const base = getBaseUrl(env, requestUrl);
  const resp = { short_url: base + newSlug, slug: newSlug, target, password: generatedPassword };
  if (warnings.length === 1) resp.warn = warnings[0];
  else if (warnings.length > 1) resp.warn = warnings;
  return resp;
}
function notFound(env, url) {
  if (isValidUrl(env.DEFAULT)) return Response.redirect(env.DEFAULT, 302);
  return Response.redirect(getBaseUrl(env, url).replace(/\/$/, "") || url.origin, 302);
}

var { json } = makeResponseHelpers({ cors: "*", prettyJson: true });
var adminCookieName = "shul_admin";
var TOKEN_AGE_SEC = 86400 * 7;
async function hmacSignHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function makeAdminToken(secret) {
  const ts = Date.now().toString();
  const sig = await hmacSignHex(secret, ts);
  return `${ts}.${sig}`;
}
async function verifyAdminToken(token, secret, nowMs) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const dot = token.indexOf(".");
  const ts = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!ts || !sig) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  if (now - tsNum > TOKEN_AGE_SEC * 1e3) return false;
  if (now < tsNum - 6e4) return false;
  const expected = await hmacSignHex(secret, ts);
  return await safeEqual(sig, expected);
}
async function handleAdminAuth(request, env) {
  if (!env.KEY) return json({ error: "NO_AUTH_REQUIRED" }, 400);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }
  const submitted = (body && body.key || "").toString().trim();
  if (!submitted) return json({ error: "UNAUTHORIZED" }, 401);
  const keys = String(env.KEY).split(",").map((k) => k.trim()).filter(Boolean);
  let valid = false;
  for (const k of keys) {
    if (await safeEqual(submitted, k)) {
      valid = true;
      break;
    }
  }
  if (!valid) return json({ error: "UNAUTHORIZED" }, 401);
  const token = await makeAdminToken(keys[0]);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": buildSetCookie(adminCookieName, token, {
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
        maxAge: TOKEN_AGE_SEC
      })
    }
  });
}
async function handleAdminLogout() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": buildSetCookie(adminCookieName, "", {
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
        maxAge: 0
      })
    }
  });
}

var { json: json2 } = makeResponseHelpers({ cors: "*", prettyJson: true });
async function checkAuth(req, env) {
  if (!env.KEY) return { isAdmin: true };
  const keys = String(env.KEY).split(",").map((k) => k.trim()).filter(Boolean);
  const cookieToken = getCookie(req, adminCookieName);
  if (cookieToken && keys.length > 0 && await verifyAdminToken(cookieToken, keys[0])) {
    return { isAdmin: true };
  }
  const auth = req.headers.get("Authorization") || "";
  const key = req.headers.get("X-Admin-Key") || (auth.startsWith("Bearer ") ? auth.slice(7) : "");
  if (!key) return { isAdmin: false };
  for (const k of keys) {
    if (await safeEqual(key, k)) return { isAdmin: true };
  }
  return json2({ error: "UNAUTHORIZED" }, 401);
}
var RATE_LIMIT_DEFAULT = 10;
async function getFingerprint(request) {
  const parts = [
    request.headers.get("CF-Connecting-IP") || "",
    (request.headers.get("User-Agent") || "") + "|" + (request.headers.get("Sec-CH-UA") || ""),
    request.headers.get("Accept-Language") || "",
    request.cf && request.cf.tlsClientExtensionsSha1 || "",
    request.cf && request.cf.tlsClientCiphersSha1 || ""
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
    if (now - new Date(data.lastOp).getTime() < 864e5 && data.count >= limit) {
      return json2({ error: "RATE_LIMITED" }, 429);
    }
    if (now - new Date(data.lastOp).getTime() >= 864e5) {
      return { key, data: { count: 0, lastOp: data.lastOp } };
    }
    return { key, data };
  }
  return { key, data: { count: 0, lastOp: (/* @__PURE__ */ new Date(0)).toISOString() } };
}
async function incrementRateLimit(env, key, data) {
  await env.DATA.put(key, JSON.stringify({ count: data.count + 1, lastOp: (/* @__PURE__ */ new Date()).toISOString() }), { expirationTtl: 172800 });
}

var UNLOCK_TTL_SECONDS = 3600;
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function bytesToHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(keyHex, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(keyHex),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
}
async function makeUnlockToken(slug, accessHashHex, ttlSeconds = UNLOCK_TTL_SECONDS) {
  const exp = Date.now() + ttlSeconds * 1e3;
  const sig = await hmacHex(accessHashHex, slug + ":" + exp);
  return exp + "." + sig;
}
async function verifyUnlockToken(token, slug, accessHashHex) {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = Number(token.slice(0, dot));
  if (!exp || exp < Date.now()) return false;
  const expected = await hmacHex(accessHashHex, slug + ":" + exp);
  return await safeEqual(token.slice(dot + 1), expected);
}
function unlockCookieName(slug) {
  return "shul_a_" + slug;
}
function makeUnlockCookieHeader(slug, token, ttlSeconds = UNLOCK_TTL_SECONDS) {
  return `${unlockCookieName(slug)}=${token}; Path=/${slug}; Max-Age=${ttlSeconds}; HttpOnly; Secure; SameSite=Lax`;
}
function readCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  for (const part of c.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return null;
}

var LOCK_PAGE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shurl</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z'/%3E%3C/svg%3E">
<style>
/* dev/common/lock/view.css
 * Modern, minimal lock-screen styling. Uses CSS vars with neutral
 * fallbacks so the host theme can override colors if desired.
 */

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background: linear-gradient(135deg, #f0f4f8 0%, #fafbfc 60%, #e8f0ff 100%);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  color: #1e293b;
}

@media (prefers-color-scheme: dark) {
  body {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0c1424 100%);
    color: #e2e8f0;
  }
}

.lock-card {
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .04), 0 12px 32px rgba(0, 0, 0, .08);
  padding: 40px 36px;
  width: 100%;
  max-width: 360px;
  text-align: center;
  animation: lc-in .25s ease;
}

@media (prefers-color-scheme: dark) {
  .lock-card {
    background: #1e293b;
    box-shadow: 0 1px 3px rgba(0, 0, 0, .25), 0 12px 32px rgba(0, 0, 0, .35);
  }
}

@keyframes lc-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}

.lock-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 18px;
  background: linear-gradient(135deg, #3b82f6, #06b6d4);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.lock-card h1 {
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 6px;
  letter-spacing: -.01em;
}

.lock-card p {
  font-size: .88rem;
  color: #64748b;
  margin-bottom: 22px;
}

@media (prefers-color-scheme: dark) {
  .lock-card p { color: #94a3b8; }
}

.lock-card input[type=password] {
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid #cbd5e1;
  border-radius: 10px;
  font-size: .96rem;
  outline: none;
  transition: border-color .18s, box-shadow .18s;
  font-family: inherit;
  background: #fff;
  color: inherit;
  margin-bottom: 12px;
}

.lock-card input[type=password]:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, .12);
}

@media (prefers-color-scheme: dark) {
  .lock-card input[type=password] {
    background: #0f172a;
    border-color: #334155;
  }
}

.remember {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: .82rem;
  color: #64748b;
  margin-bottom: 14px;
  user-select: none;
  cursor: pointer;
}

@media (prefers-color-scheme: dark) {
  .remember { color: #94a3b8; }
}

.remember input[type=checkbox] {
  cursor: pointer;
  accent-color: #3b82f6;
}

.lock-card button[type=submit] {
  width: 100%;
  padding: 11px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: .94rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform .12s, box-shadow .18s, opacity .18s;
  font-family: inherit;
  box-shadow: 0 2px 8px rgba(37, 99, 235, .22);
}

.lock-card button[type=submit]:hover {
  box-shadow: 0 4px 14px rgba(37, 99, 235, .32);
  transform: translateY(-1px);
}

.lock-card button[type=submit]:active { transform: translateY(0); }

.lock-card button[type=submit]:disabled {
  opacity: .55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.lock-err {
  color: #ef4444;
  font-size: .82rem;
  margin-top: 12px;
  min-height: 1em;
}

[dir="rtl"] body { direction: rtl; }

</style></head>
<body>
<div class="lock-card">
  <div class="lock-icon" aria-hidden="true">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="11" width="16" height="9" rx="2"/>
      <path d="M8 11V7a4 4 0 018 0v4"/>
    </svg>
  </div>
  <h1 id="lockTitle">Shurl</h1>
  <p id="lockMsg">Enter password to continue</p>
  <form id="lockForm" autocomplete="off">
    <input type="password" id="lockPw" placeholder="Password" autofocus required>
    <label class="remember">
      <input type="checkbox" id="lockRemember">
      <span id="lockRemLabel">Remember for 30 days</span>
    </label>
    <button type="submit" id="lockBtn">Unlock</button>
    <div class="lock-err" id="lockErr"></div>
  </form>
</div>
<script>window.LOCK_CONFIG={"unlockPath":"/_unlock","appNameI18n":{"en":"Shurl","eo":"Shurl","fr":"Shurl","de":"Shurl","es":"Shurl","it":"Shurl","nl":"Shurl","da":"Shurl","zh-cn":"\u901F\u81F3\u77ED\u94FE","zh-tw":"\u901F\u81F3\u77ED\u93C8","ja":"Shurl","ko":"Shurl","ms":"Shurl","vi":"Shurl","th":"Shurl","ta":"Shurl","my":"Shurl","uk":"Shurl","he":"Shurl","ar":"Shurl"}};</script><script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/lock/client.min.js"></script>
</body></html>
`;
function hasApiHeader(request) {
  return !!(request.headers.get("X-Admin-Key") || (request.headers.get("Authorization") || "").startsWith("Bearer "));
}
var lockModule = makeLockModule({
  cookieName: "shul_auth",
  hashPrefix: "shul:",
  unlockPath: "/_unlock",
  appName: "Shurl",
  errorCode: "UNAUTHORIZED",
  apiBypass: hasApiHeader,
  lockPageHtml: LOCK_PAGE_HTML
});

var APP_ASSETS_URL = "gh/onegbnet/tinycfw@c2edd27efa7fac4045a25f099140c16655198933/shurl";
function redirectPage(entry, acceptLang, cdnHost, slug, showError, authed) {
  const isFile = entry.type === "files";
  const files = entry.files || [];
  const filesMany = isFile && files.length > 1;
  const target = isFile ? files.length === 1 ? "/" + slug + "?__f=1&i=0" : "" : entry.url || "";
  const seconds = filesMany ? 0 : entry.countdown || 0;
  const needsPw = !!entry.accessHash && !authed;
  const currentLang = detectLang(acceptLang);
  const dir = currentLang === "ar" || currentLang === "he" ? "rtl" : "ltr";
  const titleRaw = entry.redirectPageTitle || null;
  const bodyRaw = entry.redirectPageContent || null;
  const customBtnTitle = entry.manualBtnTitle || null;
  const light = entry.darkBackground !== true;
  const center = entry.centerContent === true;
  const bg = light ? "#f4f6f9" : "#0f172a";
  const fg = light ? "#1e293b" : "#e2e8f0";
  const muted = light ? "#64748b" : "#94a3b8";
  const barBg = light ? "#cbd5e1" : "#1e293b";
  const linkColor = light ? "#2563eb" : "#60a5fa";
  const skipBorder = light ? "#94a3b8" : "#475569";
  const inputBorder = light ? "#cbd5e1" : "#475569";
  const inputBg = light ? "#fff" : "#1e293b";
  const fileRowBg = light ? "#fff" : "#1e293b";
  const fileRowBorder = light ? "#e2e8f0" : "#334155";
  const filesForPage = files.map((f) => ({ id: f.id, name: f.name, size: f.size }));
  return `<!DOCTYPE html>
<html lang="${currentLang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${makeMarkdownItScriptTag(cdnHost)}
<title id="page-title"></title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:${bg};color:${fg};min-height:100vh;display:flex;align-items:center;justify-content:center}
.wrap{max-width:560px;width:100%;padding:2rem}
.countdown{font-size:3rem;font-weight:700;color:#3b82f6;margin:1.2rem 0;text-align:center}
.body-content{margin:1.5rem 0;font-size:1rem;line-height:1.6${center ? ";text-align:center" : ""}}
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
.files-heading{font-size:.9rem;font-weight:700;color:${fg};margin:1.2rem 0 .7rem;padding:.1rem 0 .3rem .55rem;border-bottom:1px solid ${skipBorder};border-left:3px solid #3b82f6}
.file-row{display:flex;align-items:center;gap:.6rem;padding:.6rem .8rem;margin-bottom:.4rem;background:${fileRowBg};border:1px solid ${fileRowBorder};border-radius:.5rem;text-decoration:none;color:${fg}}
.file-row:hover{border-color:#3b82f6}
.file-row .icon{font-size:1.2rem}
.file-row .name{flex:1;word-break:break-all;font-size:.92rem}
.file-row .size{color:${muted};font-size:.82rem;font-variant-numeric:tabular-nums}
</style></head><body><div class="wrap">
<div class="body-content" id="body-content"></div>
${needsPw ? `${showError ? '<p class="pw-err" id="pw-err"></p>' : ""}<form id="pw-form" method="POST" action="/_a/${esc(slug)}"><div class="pw-area"><input type="password" name="_pw" id="pw-input" autofocus required></div><div class="skip"><button type="submit" id="pw-btn" style="display:inline-block;padding:12px 32px;background:#3b82f6;color:#fff;border-radius:8px;font-size:1rem;font-weight:600;border:none;cursor:pointer"></button></div></form>` : filesMany ? `<div class="files-heading" id="files-heading"></div><div id="file-list"></div>` : `<div class="countdown" id="count">${seconds}</div>
<div class="bar-track"><div class="bar-fill" id="bar" style="width:100%"></div></div>
<div class="skip"><a id="go-link" href="${esc(target)}" onclick="consumeAndGo();return false"></a></div>`}
</div><script src="https://${cdnHost}/${APP_ASSETS_URL}/i18n.min.js"></script><script>
const currentLang=${JSON.stringify(currentLang)};
const t=I18N[currentLang]||I18N.en;
const target=${JSON.stringify(target)};
const needsPw=${needsPw};
const isFile=${isFile};
const filesMany=${filesMany};
const oneTime=${!!entry.oneTime};
const slug=${JSON.stringify(slug)};
const files=${JSON.stringify(filesForPage)};
function formatSize(n){
  if(n<1024)return n+' B';
  if(n<1048576)return (n/1024).toFixed(1)+' KB';
  if(n<1073741824)return (n/1048576).toFixed(1)+' MB';
  return (n/1073741824).toFixed(2)+' GB';
}
function consumeAndGo(){
  if(isFile){location.href=target;return}
  if(!oneTime){location.href=target;return}
  fetch('/_ot/'+slug,{method:'POST'}).finally(function(){location.href=target});
}
const customTitle=${JSON.stringify(titleRaw)};
const customBody=${JSON.stringify(bodyRaw)};
const customBtnTitle=${JSON.stringify(customBtnTitle)};
function renderTitle(defaultTitleFn){
  document.getElementById('page-title').textContent=customTitle||defaultTitleFn();
}
function renderCustomBody(){
  if(customBody){var md=window.markdownit({html:false,linkify:true});document.getElementById('body-content').innerHTML=md.render(customBody)}
}
if(needsPw){
  renderTitle(function(){return t.access_prompt_title});
  renderCustomBody();
  document.getElementById('pw-input').placeholder=t.access_prompt_placeholder;
  document.getElementById('pw-btn').textContent=customBtnTitle||t.manual_btn_default;
  var errEl=document.getElementById('pw-err');
  if(errEl) errEl.textContent=t.access_prompt_error;
}else if(filesMany){
  renderTitle(function(){return (t.default_files_title||'Files ({n})').replace('{n}',files.length)});
  renderCustomBody();
  document.getElementById('files-heading').textContent=t.files_list_heading||'Files';
  var listEl=document.getElementById('file-list');
  files.forEach(function(f,idx){
    var a=document.createElement('a');
    a.className='file-row';
    a.href='/'+slug+'?__f=1&i='+idx;
    a.innerHTML='<span class="icon">\u{1F4C4}</span><span class="name"></span><span class="size"></span>';
    a.querySelector('.name').textContent=f.name;
    a.querySelector('.size').textContent=formatSize(f.size);
    listEl.appendChild(a);
  });
}else{
  renderTitle(function(){return t.default_redirect_title.replace('{url}',target)});
  if(customBody){var md=window.markdownit({html:false,linkify:true});document.getElementById('body-content').innerHTML=md.render(customBody)}
  else if(!isFile){document.getElementById('body-content').innerHTML='<a href="'+target+'" style="color:${linkColor};word-break:break-all">'+target.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</a>'}
  var btnTitle=customBtnTitle||t.manual_btn_default;
  const total=${seconds};
  if(total===0){
    document.getElementById('count').style.display='none';
    document.getElementById('bar').parentNode.style.display='none';
    document.getElementById('go-link').textContent=btnTitle;
    document.getElementById('go-link').style.cssText='display:inline-block;padding:12px 32px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-size:1rem;font-weight:600';
  }else{
    document.getElementById('go-link').textContent=btnTitle;
    let left=${seconds};
    const countEl=document.getElementById('count');
    const barEl=document.getElementById('bar');
    const iv=setInterval(()=>{
      left--;
      if(left<=0){clearInterval(iv);consumeAndGo();return}
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
    const prefixes = ["eo", "ja", "ko", "ms", "vi", "th", "ta", "he", "ar"];
    for (const s of prefixes) {
      if (tag === s || tag.startsWith(s + "-")) return s;
    }
  }
  return "en";
}

function makeUploadModule({
  chunkSize = 10 * 1024 * 1024,
  // 10 MiB
  totalMax,
  fileNameMax = 255,
  fileMimeMax = 128
} = {}) {
  if (typeof totalMax !== "number" || !Number.isFinite(totalMax) || totalMax <= 0) {
    throw new Error("upload2kv: totalMax must be a positive number");
  }
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("upload2kv: chunkSize must be a positive integer");
  }
  function chunkKey(uploadKey, chunkIdx) {
    return uploadKey + ":c" + chunkIdx;
  }
  function planFiles(filesIn, { startOffset = 0, startId = 0 } = {}) {
    if (!Array.isArray(filesIn)) return { error: "INVALID_FILES" };
    if (!Number.isInteger(startOffset) || startOffset < 0) return { error: "INVALID_OFFSET" };
    const planned = [];
    let nextId = startId;
    let offset = startOffset;
    for (const f of filesIn) {
      const name = String(f && f.name || "").trim().slice(0, fileNameMax);
      const sizeRaw = f && f.size;
      const size = Math.floor(Number(sizeRaw));
      if (!name) return { error: "INVALID_FILE" };
      if (!Number.isFinite(size) || size < 0) return { error: "INVALID_FILE" };
      const mime = String(f && f.mime || "application/octet-stream").trim().slice(0, fileMimeMax);
      planned.push({ id: nextId++, name, size, mime, offset });
      offset += size;
    }
    return {
      files: planned,
      nextId,
      sessionStart: startOffset,
      sessionBytes: offset - startOffset,
      sessionEnd: offset
    };
  }
  function chunkRange(byteStart, byteEnd) {
    if (byteEnd <= byteStart) return null;
    return {
      firstChunk: Math.floor(byteStart / chunkSize),
      lastChunk: Math.floor((byteEnd - 1) / chunkSize)
    };
  }
  function sessionChunks(sessionStart, sessionBytes) {
    return chunkRange(sessionStart, sessionStart + sessionBytes);
  }
  function nextSessionStart(currentSessionEnd) {
    return Math.ceil(currentSessionEnd / chunkSize) * chunkSize;
  }
  function sessionChunkPlan(sessionStart, sessionBytes) {
    const range = sessionChunks(sessionStart, sessionBytes);
    if (!range) return [];
    const list = [];
    for (let c = range.firstChunk; c <= range.lastChunk; c++) {
      list.push({ idx: c, size: expectedChunkSize(c, sessionStart, sessionBytes) });
    }
    return list;
  }
  function expectedChunkSize(chunkIdx, sessionStart, sessionBytes) {
    const range = sessionChunks(sessionStart, sessionBytes);
    if (!range) return null;
    if (chunkIdx < range.firstChunk || chunkIdx > range.lastChunk) return null;
    if (chunkIdx < range.lastChunk) {
      return chunkSize;
    }
    const chunkBase = chunkIdx * chunkSize;
    return sessionStart + sessionBytes - chunkBase;
  }
  async function writeChunk(kv, uploadKey, chunkIdx, body, { expectedSize, ttl } = {}) {
    if (!Number.isInteger(chunkIdx) || chunkIdx < 0) {
      return { error: "INVALID_CHUNK_INDEX" };
    }
    const len = body && body.byteLength;
    if (!Number.isFinite(len)) return { error: "CHUNK_BODY_INVALID" };
    if (typeof expectedSize === "number") {
      if (len !== expectedSize) return { error: "CHUNK_SIZE_MISMATCH", expected: expectedSize, got: len };
    } else {
      if (len <= 0 || len > chunkSize) {
        return { error: "CHUNK_SIZE_INVALID", expected: "1.." + chunkSize, got: len };
      }
    }
    const opts = {};
    if (typeof ttl === "number" && ttl > 0) opts.expirationTtl = ttl;
    await kv.put(chunkKey(uploadKey, chunkIdx), body, opts);
    return { ok: true };
  }
  async function verifyAllChunks(kv, uploadKey, firstChunk, lastChunk) {
    const missing = [];
    for (let c = firstChunk; c <= lastChunk; c++) {
      const has = await kv.get(chunkKey(uploadKey, c), "arrayBuffer");
      if (!has) missing.push(c);
    }
    return missing;
  }
  async function readFile(kv, uploadKey, file) {
    if (!file || file.size === 0) return new Uint8Array(0);
    const fileStart = file.offset;
    const fileEnd = file.offset + file.size;
    const range = chunkRange(fileStart, fileEnd);
    const out = new Uint8Array(file.size);
    let written = 0;
    for (let c = range.firstChunk; c <= range.lastChunk; c++) {
      const buf = await kv.get(chunkKey(uploadKey, c), "arrayBuffer");
      if (!buf) return null;
      const bytes = new Uint8Array(buf);
      const chunkBase = c * chunkSize;
      const sliceStart = Math.max(0, fileStart - chunkBase);
      const sliceEnd = Math.min(bytes.length, fileEnd - chunkBase);
      if (sliceEnd <= sliceStart) return null;
      out.set(bytes.subarray(sliceStart, sliceEnd), written);
      written += sliceEnd - sliceStart;
    }
    return written === file.size ? out : null;
  }
  async function deleteAllChunks(kv, uploadKey, firstChunk, lastChunk) {
    const ops = [];
    for (let c = firstChunk; c <= lastChunk; c++) {
      ops.push(kv.delete(chunkKey(uploadKey, c)));
    }
    await Promise.all(ops);
  }
  return {
    chunkSize,
    totalMax,
    fileNameMax,
    fileMimeMax,
    chunkKey,
    planFiles,
    chunkRange,
    sessionChunks,
    sessionChunkPlan,
    nextSessionStart,
    expectedChunkSize,
    writeChunk,
    verifyAllChunks,
    readFile,
    deleteAllChunks
  };
}

var { json: json3 } = makeResponseHelpers({ cors: "*", prettyJson: true, htmlCache: "no-store" });
var upload = makeUploadModule({
  chunkSize: CHUNK_SIZE,
  totalMax: TOTAL_MAX,
  fileNameMax: FILE_NAME_MAX,
  fileMimeMax: FILE_MIME_MAX
});
async function handleUploadReserve(request, env, url) {
  const auth = await checkAuth(request, env);
  if (auth instanceof Response) return auth;
  const isAdmin = auth.isAdmin;
  let body;
  try {
    body = await request.json();
  } catch {
    return json3({ error: "INVALID_JSON" }, 400);
  }
  const customSlug = (body.slug || "").trim();
  const validCustomSlug = customSlug && /^[a-zA-Z0-9]{3,10}$/.test(customSlug);
  const filesIn = Array.isArray(body.files) ? body.files : [];
  const removedFileIds = Array.isArray(body.removedFileIds) ? body.removedFileIds.map((x) => Math.floor(Number(x))).filter((n) => !isNaN(n)) : [];
  let existingEntry = null;
  if (validCustomSlug) {
    const raw = await env.DATA.get(customSlug);
    if (raw) existingEntry = JSON.parse(raw);
  }
  const isModify = existingEntry && existingEntry.type === "files";
  if (isModify) {
    if (existingEntry.pending) return json3({ error: "SLUG_IN_USE" }, 409);
    if (existingEntry.uploadToken) return json3({ error: "UPLOAD_IN_PROGRESS" }, 409);
    const password = (request.headers.get("X-Password") || "").trim();
    if (!isAdmin) {
      if (!password) return json3({ error: "VERIFY_FAILED" }, 403);
      const pwHash2 = await hashPassword(password);
      if (!await safeEqual(existingEntry.pwHash, pwHash2)) {
        return json3({ error: "VERIFY_FAILED" }, 403);
      }
      const rl = await checkRateLimit(env, request);
      if (rl instanceof Response) return rl;
      await incrementRateLimit(env, rl.key, rl.data);
    }
    const existingIds = new Set((existingEntry.files || []).map((f) => f.id));
    for (const id of removedFileIds) {
      if (!existingIds.has(id)) return json3({ error: "UNKNOWN_FILE_ID", id }, 400);
    }
    const sessionStart = (existingEntry.committedChunkEnd || 0) * upload.chunkSize;
    const plan2 = upload.planFiles(filesIn, {
      startOffset: sessionStart,
      startId: existingEntry.nextFileId || 0
    });
    if (plan2.error) return json3({ error: plan2.error }, 400);
    const keptFiles = (existingEntry.files || []).filter((f) => !removedFileIds.includes(f.id));
    const projectedTotal = keptFiles.reduce((s, f) => s + f.size, 0) + plan2.sessionBytes;
    if (projectedTotal > upload.totalMax) return json3({ error: "TOTAL_TOO_BIG" }, 400);
    if (keptFiles.length === 0 && plan2.files.length === 0) {
      return json3({ error: "MODIFY_REMOVES_ALL" }, 400);
    }
    const meta2 = await applyMetadataFields(body, existingEntry, env);
    if (meta2.error) return json3({ error: meta2.error }, 400);
    const uploadToken2 = generateUploadToken();
    const updated = clean({
      ...existingEntry,
      nextFileId: plan2.nextId,
      pendingAdds: plan2.files.length ? plan2.files : void 0,
      pendingRemoveIds: removedFileIds.length ? removedFileIds : void 0,
      pendingSession: { sessionStart, sessionBytes: plan2.sessionBytes },
      pendingMeta: meta2.fields,
      pendingWarns: meta2.warnings.length ? meta2.warnings : void 0,
      pendingResetPw: body.resetPassword === true ? true : void 0,
      uploadToken: uploadToken2,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const putOpts = {};
    if (existingEntry.ttl > 0) putOpts.expirationTtl = existingEntry.ttl;
    await env.DATA.put(customSlug, JSON.stringify(updated), putOpts);
    return json3({
      slug: customSlug,
      uploadKey: customSlug,
      uploadToken: uploadToken2,
      chunkSize: upload.chunkSize,
      chunks: upload.sessionChunkPlan(sessionStart, plan2.sessionBytes),
      files: plan2.files,
      short_url: getBaseUrl(env, url) + customSlug
    });
  }
  if (!filesIn.length) return json3({ error: "NO_FILES" }, 400);
  let _rlKey, _rlData;
  if (!isAdmin) {
    const rl = await checkRateLimit(env, request);
    if (rl instanceof Response) return rl;
    _rlKey = rl.key;
    _rlData = rl.data;
  }
  let newSlug;
  const warnings = [];
  if (validCustomSlug) {
    if (existingEntry) return json3({ error: "SLUG_EXISTS" }, 400);
    newSlug = customSlug;
  } else {
    if (customSlug) warnings.push("SLUG_IGNORED");
    let tries = 0;
    do {
      newSlug = makeSlug();
      tries++;
    } while (await env.DATA.get(newSlug) !== null && tries < 5);
    if (await env.DATA.get(newSlug) !== null) return json3({ error: "SLUG_COLLISION" }, 500);
  }
  const plan = upload.planFiles(filesIn, { startOffset: 0, startId: 0 });
  if (plan.error) return json3({ error: plan.error }, 400);
  if (plan.sessionBytes > upload.totalMax) return json3({ error: "TOTAL_TOO_BIG" }, 400);
  const meta = await applyMetadataFields(body, null, env);
  if (meta.error) return json3({ error: meta.error }, 400);
  warnings.push(...meta.warnings);
  const generatedPassword = generatePassword();
  const pwHash = await hashPassword(generatedPassword);
  const uploadToken = generateUploadToken();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const newEntry = clean({
    type: "files",
    files: [],
    nextFileId: plan.nextId,
    totalSize: plan.sessionBytes,
    committedChunkEnd: 0,
    pending: true,
    uploadToken,
    pendingAdds: plan.files,
    pendingSession: { sessionStart: 0, sessionBytes: plan.sessionBytes },
    pwHash,
    ...meta.fields,
    createdAt: now,
    updatedAt: null
  });
  await env.DATA.put(newSlug, JSON.stringify(newEntry), { expirationTtl: RESERVE_TTL });
  if (!isAdmin) await incrementRateLimit(env, _rlKey, _rlData);
  const resp = {
    slug: newSlug,
    uploadKey: newSlug,
    uploadToken,
    chunkSize: upload.chunkSize,
    chunks: upload.sessionChunkPlan(0, plan.sessionBytes),
    files: plan.files,
    short_url: getBaseUrl(env, url) + newSlug,
    password: generatedPassword
  };
  if (warnings.length === 1) resp.warn = warnings[0];
  else if (warnings.length > 1) resp.warn = warnings;
  return json3(resp, 201);
}
async function handleUploadChunk(request, env, url, slug) {
  if (!slug || !/^[a-zA-Z0-9]{3,10}$/.test(slug)) {
    return json3({ error: "INVALID_SLUG" }, 400);
  }
  const token = request.headers.get("X-Upload-Token") || "";
  const chunkIdxStr = url.searchParams.get("c");
  const chunkIdx = Math.floor(Number(chunkIdxStr));
  if (!Number.isFinite(chunkIdx) || chunkIdx < 0) {
    return json3({ error: "INVALID_CHUNK_INDEX" }, 400);
  }
  const raw = await env.DATA.get(slug);
  if (!raw) return json3({ error: "NOT_FOUND" }, 404);
  const entry = JSON.parse(raw);
  if (entry.type !== "files") return json3({ error: "NOT_FILE_SLUG" }, 400);
  if (!entry.uploadToken || !await safeEqual(entry.uploadToken, token)) {
    return json3({ error: "UPLOAD_TOKEN_INVALID" }, 403);
  }
  const ps = entry.pendingSession;
  if (!ps) return json3({ error: "NO_PENDING_SESSION" }, 400);
  const expected = upload.expectedChunkSize(chunkIdx, ps.sessionStart, ps.sessionBytes);
  if (expected === null) return json3({ error: "CHUNK_OUT_OF_RANGE" }, 400);
  const buf = await request.arrayBuffer();
  const effTtl = entry.ttl > 0 ? Math.max(entry.ttl, RESERVE_TTL) : void 0;
  const r = await upload.writeChunk(env.DATA, slug, chunkIdx, buf, {
    expectedSize: expected,
    ttl: effTtl
  });
  if (r.error) return json3(r, 400);
  return json3({ ok: true });
}
async function handleUploadCommit(request, env, url, slug) {
  if (!slug || !/^[a-zA-Z0-9]{3,10}$/.test(slug)) {
    return json3({ error: "INVALID_SLUG" }, 400);
  }
  const token = request.headers.get("X-Upload-Token") || "";
  const raw = await env.DATA.get(slug);
  if (!raw) return json3({ error: "NOT_FOUND" }, 404);
  const entry = JSON.parse(raw);
  if (entry.type !== "files") return json3({ error: "NOT_FILE_SLUG" }, 400);
  if (!entry.uploadToken || !await safeEqual(entry.uploadToken, token)) {
    return json3({ error: "UPLOAD_TOKEN_INVALID" }, 403);
  }
  const ps = entry.pendingSession;
  if (!ps) return json3({ error: "NO_PENDING_SESSION" }, 400);
  const range = upload.sessionChunks(ps.sessionStart, ps.sessionBytes);
  if (range) {
    const missing = await upload.verifyAllChunks(env.DATA, slug, range.firstChunk, range.lastChunk);
    if (missing.length) return json3({ error: "COMMIT_INCOMPLETE", missing }, 400);
  }
  const pendingAdds = entry.pendingAdds || [];
  const pendingRemoveIds = entry.pendingRemoveIds || [];
  const keptFiles = (entry.files || []).filter((f) => !pendingRemoveIds.includes(f.id));
  const newFiles = keptFiles.concat(pendingAdds);
  const newTotalSize = newFiles.reduce((s, f) => s + f.size, 0);
  const newCommittedChunkEnd = upload.nextSessionStart(ps.sessionStart + ps.sessionBytes) / upload.chunkSize;
  const {
    pending: _p,
    uploadToken: _u,
    pendingAdds: _pa,
    pendingRemoveIds: _pr,
    pendingMeta: _pm,
    pendingWarns: _pw,
    pendingResetPw: _prp,
    pendingSession: _ps,
    ...rest
  } = entry;
  const isCreateCommit = !!entry.pending;
  const stashedMeta = entry.pendingMeta || null;
  let newPassword = null;
  const pwOverride = {};
  if (entry.pendingResetPw === true) {
    newPassword = generatePassword();
    pwOverride.pwHash = await hashPassword(newPassword);
  }
  const finalEntry = clean({
    ...rest,
    ...stashedMeta || {},
    ...pwOverride,
    files: newFiles,
    totalSize: newTotalSize,
    committedChunkEnd: newCommittedChunkEnd,
    updatedAt: isCreateCommit ? null : (/* @__PURE__ */ new Date()).toISOString()
  });
  const finalTtl = stashedMeta && typeof stashedMeta.ttl === "number" ? stashedMeta.ttl : entry.ttl || 0;
  const putOpts = {};
  if (finalTtl > 0) putOpts.expirationTtl = finalTtl;
  await env.DATA.put(slug, JSON.stringify(finalEntry), putOpts);
  const resp = {
    ok: true,
    slug,
    files: newFiles.length,
    short_url: getBaseUrl(env, url) + slug,
    updated: !isCreateCommit
  };
  if (newPassword) resp.password = newPassword;
  const warns = entry.pendingWarns || [];
  if (warns.length === 1) resp.warn = warns[0];
  else if (warns.length > 1) resp.warn = warns;
  return json3(resp);
}

var { json: json4 } = makeResponseHelpers({ cors: "*", prettyJson: true });
var VALID_THEMES = /* @__PURE__ */ new Set(["light", "dark"]);
async function handlePrefs(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json4({ error: "INVALID_JSON" }, 400);
  }
  const setCookies = [];
  if (typeof body.theme === "string") {
    if (!VALID_THEMES.has(body.theme)) {
      return json4({ error: "INVALID_THEME" }, 400);
    }
    setCookies.push(buildSetCookie("theme", body.theme, {
      maxAge: 31536e3,
      sameSite: "Lax"
    }));
  }
  if (setCookies.length === 0) {
    return json4({ error: "NO_PREFS" }, 400);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": setCookies.join(", ")
    }
  });
}

var { json: json5, html } = makeResponseHelpers({ cors: "*", prettyJson: true, htmlCache: "no-store" });
var HTML = landing_default;
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,X-Admin-Key,X-Password,Authorization"
        }
      });
    }
    const slug = path.slice(1);
    const method = request.method;
    const cdnHost = selectJsdelivrCdnHost(request);
    const themeCookie = getCookie(request, "theme");
    const theme = themeCookie === "dark" ? "dark" : "light";
    if (method === "POST" && slug === "_admin/auth") {
      return handleAdminAuth(request, env);
    }
    if (method === "POST" && slug === "_admin/logout") {
      return handleAdminLogout();
    }
    if (method === "POST" && slug === "api/prefs") {
      return handlePrefs(request);
    }
    if (method === "POST" && slug === "_unlock") {
      return lockModule.handleUnlock(request, env);
    }
    if (!await lockModule.isAuthorized(request, env)) {
      if (method === "GET" && !slug) {
        return lockModule.renderLockPage(cdnHost);
      }
      if ((method === "POST" || method === "PUT" || method === "DELETE") && !slug.startsWith("_")) {
        return json5({ error: "UNAUTHORIZED" }, 401);
      }
    }
    if (method === "GET") {
      if (!slug) {
        const keyRequired = env.KEY ? "true" : "false";
        const ttlStr = String(normalizeTtl(env.TTL || 0));
        const authPeek = await checkAuth(request, env);
        const isAdmin = authPeek && authPeek.isAdmin === true ? "true" : "false";
        const page = HTML.replace(/\{\{DEFAULT_TTL\}\}/g, ttlStr).replace(/\{\{KEY_REQUIRED\}\}/g, keyRequired).replace(/\{\{IS_ADMIN\}\}/g, isAdmin).replace(/\{\{THEME\}\}/g, theme).replace(/\{\{CDN_HOST\}\}/g, cdnHost);
        return html(page);
      }
      if (slug.includes("/")) return notFound(env, url);
      const raw = await env.DATA.get(slug);
      if (!raw) return notFound(env, url);
      const entry = JSON.parse(raw);
      if (entry.pending) return notFound(env, url);
      const isFile = entry.type === "files";
      const files = entry.files || [];
      if (isFile && url.searchParams.get("__f") === "1") {
        const idx = Math.floor(Number(url.searchParams.get("i") || 0));
        const file = files[idx];
        if (!file) return notFound(env, url);
        if (entry.accessHash) {
          let authed = false;
          const cookieToken = readCookie(request, unlockCookieName(slug));
          if (cookieToken && await verifyUnlockToken(cookieToken, slug, entry.accessHash)) {
            authed = true;
          }
          if (!authed) {
            const pw = (request.headers.get("X-Password") || "").trim();
            if (pw) {
              const h = await hashPassword(pw);
              if (await safeEqual(h, entry.accessHash)) authed = true;
            }
          }
          if (!authed) return new Response("Unauthorized", { status: 403 });
        }
        const blob = await upload.readFile(env.DATA, slug, file);
        if (!blob) return notFound(env, url);
        if (entry.oneTime && files.length === 1) {
          ctx.waitUntil((async () => {
            const committedEnd = entry.committedChunkEnd || 0;
            if (committedEnd > 0) {
              await upload.deleteAllChunks(env.DATA, slug, 0, committedEnd - 1);
            }
            await env.DATA.delete(slug);
          })());
        }
        return new Response(blob, {
          headers: {
            "Content-Type": file.mime || "application/octet-stream",
            "Content-Disposition": contentDispositionHeader(file.name),
            "Content-Length": String(file.size),
            "Cache-Control": "private, no-store"
          }
        });
      }
      const mode = entry.redirectMode || "instant";
      const consumeOneTime = () => {
        if (!entry.oneTime) return;
        if (isFile) {
          return;
        }
        ctx.waitUntil(env.DATA.delete(slug));
      };
      if (isFile && mode === "instant" && files.length === 1 && !entry.accessHash) {
        const file = files[0];
        const blob = await upload.readFile(env.DATA, slug, file);
        if (!blob) return notFound(env, url);
        if (entry.oneTime) {
          ctx.waitUntil((async () => {
            const committedEnd = entry.committedChunkEnd || 0;
            if (committedEnd > 0) {
              await upload.deleteAllChunks(env.DATA, slug, 0, committedEnd - 1);
            }
            await env.DATA.delete(slug);
          })());
        }
        return new Response(blob, {
          headers: {
            "Content-Type": file.mime || "application/octet-stream",
            "Content-Disposition": contentDispositionHeader(file.name),
            "Content-Length": String(file.size),
            "Cache-Control": "private, no-store"
          }
        });
      }
      if (mode === "manual" || isFile) {
        const acceptLang = request.headers.get("Accept-Language") || "";
        const showError = url.searchParams.get("e") === "1";
        if (entry.accessHash) {
          if (isFile) {
            const cookieToken = readCookie(request, unlockCookieName(slug));
            if (cookieToken && await verifyUnlockToken(cookieToken, slug, entry.accessHash)) {
              return html(redirectPage(entry, acceptLang, cdnHost, slug, false, true));
            }
          }
          return html(redirectPage(entry, acceptLang, cdnHost, slug, showError, false));
        }
        return html(redirectPage(entry, acceptLang, cdnHost, slug, false, false));
      }
      consumeOneTime();
      return Response.redirect(entry.url, entry.permanent === false ? 302 : 301);
    }
    if (method === "POST" && slug.startsWith("_a/")) {
      const realSlug = slug.slice(3);
      if (!realSlug || !/^[a-zA-Z0-9]{3,10}$/.test(realSlug)) return notFound(env, url);
      const raw = await env.DATA.get(realSlug);
      if (!raw) return notFound(env, url);
      const entry = JSON.parse(raw);
      if (!entry.accessHash) return Response.redirect(getBaseUrl(env, url) + realSlug, 303);
      let pw = "";
      try {
        const fd = await request.formData();
        pw = (fd.get("_pw") || "").toString().trim();
      } catch {
      }
      const base = getBaseUrl(env, url);
      if (!pw) return Response.redirect(base + realSlug + "?e=1", 303);
      const h = await hashPassword(pw);
      if (!await safeEqual(h, entry.accessHash)) {
        return Response.redirect(base + realSlug + "?e=1", 303);
      }
      const isFileSlug = entry.type === "files";
      if (!isFileSlug) {
        if (entry.oneTime) ctx.waitUntil(env.DATA.delete(realSlug));
        return Response.redirect(entry.url, entry.permanent === false ? 302 : 301);
      }
      const token = await makeUnlockToken(realSlug, entry.accessHash);
      const headers = new Headers({ "Location": base + realSlug });
      headers.append("Set-Cookie", makeUnlockCookieHeader(realSlug, token));
      return new Response(null, { status: 303, headers });
    }
    if (method === "POST" && slug.startsWith("_ot/")) {
      const realSlug = slug.slice(4);
      if (!realSlug) return json5({ ok: false }, 400);
      const raw = await env.DATA.get(realSlug);
      if (raw) {
        const entry = JSON.parse(raw);
        if (entry.oneTime) {
          await env.DATA.delete(realSlug);
          return json5({ ok: true });
        }
      }
      return json5({ ok: true });
    }
    if (method === "POST" && slug === "_u/reserve") return handleUploadReserve(request, env, url);
    if (method === "PUT" && slug.startsWith("_u/chunk/")) return handleUploadChunk(request, env, url, slug.slice("_u/chunk/".length));
    if (method === "POST" && slug.startsWith("_u/commit/")) return handleUploadCommit(request, env, url, slug.slice("_u/commit/".length));
    if (method === "POST" && slug === "_cleanup") {
      const auth = await checkAuth(request, env);
      if (auth instanceof Response) return auth;
      if (!auth.isAdmin) return json5({ error: "UNAUTHORIZED" }, 401);
      let deleted = 0;
      let cursor = null;
      do {
        const list = await env.DATA.list({ cursor, limit: 1e3 });
        for (const k of list.keys) {
          const m = k.name.match(/^([a-zA-Z0-9]{3,10}):c(\d+)$/);
          if (!m) continue;
          const [, chunkSlug, chunkIdxStr] = m;
          const chunkIdx = parseInt(chunkIdxStr, 10);
          const raw = await env.DATA.get(chunkSlug);
          if (!raw) {
            await env.DATA.delete(k.name);
            deleted++;
            continue;
          }
          const entry = JSON.parse(raw);
          if (entry.type !== "files") {
            await env.DATA.delete(k.name);
            deleted++;
            continue;
          }
          const committedEnd = entry.committedChunkEnd || 0;
          let live = chunkIdx < committedEnd;
          if (!live && entry.pendingSession) {
            const ps = entry.pendingSession;
            const r = upload.sessionChunks(ps.sessionStart, ps.sessionBytes);
            if (r && chunkIdx >= r.firstChunk && chunkIdx <= r.lastChunk) live = true;
          }
          if (!live) {
            await env.DATA.delete(k.name);
            deleted++;
          }
        }
        cursor = list.list_complete ? null : list.cursor;
      } while (cursor);
      return json5({ deleted });
    }
    if (method === "HEAD") {
      const auth = await checkAuth(request, env);
      if (auth instanceof Response) return new Response(null, { status: 401 });
      if (!slug || slug.includes("/")) return new Response(null, { status: 403 });
      if (auth.isAdmin) {
        const raw2 = await env.DATA.get(slug);
        return new Response(null, { status: raw2 ? 200 : 403 });
      }
      const password = (request.headers.get("X-Password") || "").trim();
      if (!password) return new Response(null, { status: 403 });
      const raw = await env.DATA.get(slug);
      if (!raw) return new Response(null, { status: 403 });
      const entry = JSON.parse(raw);
      const pwHash = await hashPassword(password);
      if (!await safeEqual(entry.pwHash, pwHash)) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 200 });
    }
    if (method === "POST") {
      const auth = await checkAuth(request, env);
      if (auth instanceof Response) return auth;
      const isAdmin = auth.isAdmin;
      const password = (request.headers.get("X-Password") || "").trim();
      let body;
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      if (Array.isArray(body)) {
        if (!isAdmin) return json5({ error: "UNAUTHORIZED" }, 401);
        const slugsSeen = /* @__PURE__ */ new Set();
        for (const item of body) {
          const s = (item.slug || "").trim();
          if (s && /^[a-zA-Z0-9]{3,10}$/.test(s)) {
            if (slugsSeen.has(s)) return json5({ error: "BATCH_DUPLICATE_SLUG", slug: s }, 400);
            slugsSeen.add(s);
          }
        }
        const results = await Promise.all(body.map((item) => {
          const itemSlug = (item.slug || "").trim();
          const itemValidSlug = itemSlug && !itemSlug.includes("/") && /^[a-zA-Z0-9]{3,10}$/.test(itemSlug);
          return createOne(item, itemSlug, itemValidSlug, env, url);
        }));
        const errors = results.filter((r) => r.error).length;
        const status = errors === 0 ? 201 : errors === results.length ? 400 : 207;
        return json5(results, status);
      }
      const validSlug = slug && !slug.includes("/") && /^[a-zA-Z0-9]{3,10}$/.test(slug);
      const hasUrl = !!(body.url || "").trim();
      if (validSlug) {
        const raw = await env.DATA.get(slug);
        if (raw) {
          if (isAdmin) {
            const entry2 = JSON.parse(raw);
            const { pwHash: _2, ...safe2 } = entry2;
            if (safe2.accessHash) safe2.accessHash = true;
            return json5({ slug, ...safe2 });
          }
          if (!password) return json5({ error: "SLUG_EXISTS" }, 400);
          const entry = JSON.parse(raw);
          const pwHash = await hashPassword(password);
          if (!await safeEqual(entry.pwHash, pwHash)) {
            return json5({ error: "VERIFY_FAILED" }, 403);
          }
          const { pwHash: _, ...safe } = entry;
          if (safe.accessHash) safe.accessHash = true;
          return json5({ slug, ...safe });
        }
        if (password && !hasUrl) return json5({ error: "VERIFY_FAILED" }, 403);
      }
      if (!isAdmin) {
        const rl = await checkRateLimit(env, request);
        if (rl instanceof Response) return rl;
        const result = await createOne(body, slug, validSlug, env, url);
        if (!result.error) await incrementRateLimit(env, rl.key, rl.data);
        return json5(result, result.error ? 400 : 201);
      }
      return json5(await createOne(body, slug, validSlug, env, url), 201);
    }
    if (method === "PUT") {
      const auth = await checkAuth(request, env);
      if (auth instanceof Response) return auth;
      const isAdmin = auth.isAdmin;
      if (!slug || slug.includes("/")) return json5({ error: "VERIFY_FAILED" }, 403);
      const password = (request.headers.get("X-Password") || "").trim();
      let body;
      try {
        body = await request.json();
      } catch {
        return json5({ error: "INVALID_JSON" }, 400);
      }
      const raw = await env.DATA.get(slug);
      if (!raw) return json5({ error: "VERIFY_FAILED" }, 403);
      const entry = JSON.parse(raw);
      if (!isAdmin) {
        if (!password) return json5({ error: "VERIFY_FAILED" }, 403);
        const pwHash = await hashPassword(password);
        if (!await safeEqual(entry.pwHash, pwHash)) {
          return json5({ error: "VERIFY_FAILED" }, 403);
        }
        const rl = await checkRateLimit(env, request);
        if (rl instanceof Response) return rl;
        var _rlKey = rl.key, _rlData = rl.data;
      }
      const isFile = entry.type === "files";
      if (isFile && entry.uploadToken) {
        return json5({ error: "UPLOAD_IN_PROGRESS" }, 409);
      }
      let target = null;
      if (!isFile) {
        target = (body.url || "").trim();
        try {
          const u = new URL(target);
          if (u.protocol !== "http:" && u.protocol !== "https:" || !/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(u.hostname)) throw 0;
        } catch {
          return json5({ error: "INVALID_URL" }, 400);
        }
      }
      const meta = await applyMetadataFields(body, entry, env);
      if (meta.error) return json5({ error: meta.error }, 400);
      const updatedEntry = clean({
        ...entry,
        ...isFile ? {} : { url: target },
        ...meta.fields,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      let newPassword = null;
      if (body.resetPassword === true) {
        newPassword = generatePassword();
        updatedEntry.pwHash = await hashPassword(newPassword);
      }
      const putOpts = {};
      if (meta.fields.ttl > 0) putOpts.expirationTtl = meta.fields.ttl;
      await env.DATA.put(slug, JSON.stringify(updatedEntry), putOpts);
      if (!isAdmin) await incrementRateLimit(env, _rlKey, _rlData);
      const resp = { short_url: getBaseUrl(env, url) + slug, slug, updated: true };
      if (!isFile) resp.target = target;
      if (newPassword) resp.password = newPassword;
      if (meta.warnings.length === 1) resp.warn = meta.warnings[0];
      else if (meta.warnings.length > 1) resp.warn = meta.warnings;
      return json5(resp, 200);
    }
    if (method === "DELETE") {
      const auth = await checkAuth(request, env);
      if (auth instanceof Response) return auth;
      const isAdmin = auth.isAdmin;
      if (!slug) {
        if (!isAdmin) return json5({ error: "UNAUTHORIZED" }, 401);
        let deleted = 0;
        let cursor = null;
        do {
          const list = await env.DATA.list({ cursor, limit: 1e3 });
          if (list.keys.length) {
            await Promise.all(list.keys.map((k) => env.DATA.delete(k.name)));
            deleted += list.keys.length;
          }
          cursor = list.list_complete ? null : list.cursor;
        } while (cursor);
        return json5({ purged: deleted });
      }
      if (slug.includes("/")) return json5({ error: "VERIFY_FAILED" }, 403);
      const sweepChunks = async (s, e) => {
        const committedEnd = e.committedChunkEnd || 0;
        if (committedEnd > 0) {
          await upload.deleteAllChunks(env.DATA, s, 0, committedEnd - 1);
        }
        if (e.pendingSession) {
          const ps = e.pendingSession;
          const r = upload.sessionChunks(ps.sessionStart, ps.sessionBytes);
          if (r) await upload.deleteAllChunks(env.DATA, s, r.firstChunk, r.lastChunk);
        }
      };
      if (isAdmin) {
        const raw2 = await env.DATA.get(slug);
        if (!raw2) return json5({ error: "VERIFY_FAILED" }, 403);
        const entry2 = JSON.parse(raw2);
        if (entry2.type === "files") await sweepChunks(slug, entry2);
        await env.DATA.delete(slug);
        return json5({ deleted: slug });
      }
      const password = (request.headers.get("X-Password") || "").trim();
      if (!password) return json5({ error: "VERIFY_FAILED" }, 403);
      const raw = await env.DATA.get(slug);
      if (!raw) return json5({ error: "VERIFY_FAILED" }, 403);
      const entry = JSON.parse(raw);
      const pwHash = await hashPassword(password);
      if (!await safeEqual(entry.pwHash, pwHash)) {
        return json5({ error: "VERIFY_FAILED" }, 403);
      }
      if (entry.type === "files") await sweepChunks(slug, entry);
      await env.DATA.delete(slug);
      return json5({ deleted: slug });
    }
    return notFound(env, url);
  }
};
export {
  index_default as default
};
