function isValidLock(val) {
  return typeof val === "string" && /^[\x21-\x7e]{3,64}$/.test(val);
}
async function hashToken(prefix, pw) {
  const data = new TextEncoder().encode(prefix + pw);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function safeEqual(a, b) {
  const enc2 = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc2.encode("_cmp_"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc2.encode(String(a || ""))),
    crypto.subtle.sign("HMAC", key, enc2.encode(String(b || "")))
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

var HOST_DEFAULT = "cdn.jsdelivr.net";
var HOST_CN = "jsd.onmicrosoft.cn";
function selectJsdelivrCdnHost(request) {
  if (request && request.cf && request.cf.country === "CN") return HOST_CN;
  return HOST_DEFAULT;
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

var SUPPORTED_LANGS_DEFAULT = [
  "en",
  "eo",
  "fr",
  "de",
  "es",
  "it",
  "nl",
  "da",
  "zh-cn",
  "zh-tw",
  "ja",
  "ko",
  "ms",
  "vi",
  "th",
  "ta",
  "my",
  "uk",
  "he",
  "ar"
];
function detectLangFromAcceptLanguage(headerString, supported) {
  supported = supported || SUPPORTED_LANGS_DEFAULT;
  if (!headerString) return "en";
  const candidates = headerString.split(",").map((s) => s.split(";")[0].trim().toLowerCase()).filter(Boolean);
  for (const l of candidates) {
    if (supported.indexOf(l) !== -1) return l;
    if (/^zh-(hant|tw|hk|mo)/.test(l) && supported.indexOf("zh-tw") !== -1) return "zh-tw";
    if (/^zh/.test(l) && supported.indexOf("zh-cn") !== -1) return "zh-cn";
    const p = l.split("-")[0];
    if (supported.indexOf(p) !== -1) return p;
  }
  return "en";
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
  function json2(data, status = 200, extraHeaders = {}) {
    const body = prettyJson ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    return new Response(body, {
      status,
      headers: { ...baseJsonHeaders, ...extraHeaders }
    });
  }
  function html2(body, status = 200) {
    return new Response(body, { status, headers: baseHtmlHeaders });
  }
  function text2(body, status = 200) {
    return new Response(body, {
      status,
      headers: { "Content-Type": "text/plain;charset=UTF-8" }
    });
  }
  return { json: json2, html: html2, text: text2 };
}

var { json, html, text } = makeResponseHelpers({});

var main_default = `<!DOCTYPE html>
<html lang="{{LANG}}" data-theme="{{THEME}}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MixSSL \u2014 Certificates with domains from mixed DNS accounts under same or different registrars</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232563eb' stroke-width='2.5' stroke-linecap='round'%3E%3Crect x='3' y='11' width='18' height='11' rx='2'/%3E%3Cpath d='M7 11V7a5 5 0 0110 0v4'/%3E%3C/svg%3E">
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/overlay/style.min.css">
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/toast/style.min.css">
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/spinner/style.min.css">
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@c2edd27efa7fac4045a25f099140c16655198933/mixssl/view.min.css"></head>
<body>
<header>
  <div class="brand">
    <div class="logo-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
    <div class="brand-text">
      <div class="brand-name" id="app-title" data-i18n="app_name">MixSSL</div>
      <div class="brand-sub" data-i18n="app_sub">Certificates with domains from mixed DNS accounts under same or different registrars</div>
    </div>
  </div>
  <div class="spacer"></div>
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

  <button class="btn btn-icon" id="openDrawerBtn" data-i18n-title="ttl_configure" title="Configure">\u2699\uFE0F</button>
  <button type="button" class="logout-btn" id="logoutBtn">\u{1F512} <span data-i18n="btn_logout">Logout</span></button>
</header>
<main>
  <div class="totals-line" id="totalsLine">
    <button class="btn btn-primary btn-sm" id="newCertBtn" data-i18n-title="ttl_new_cert" title="New certificate" data-i18n="btn_new_cert" style="display:none">+</button>
    <span id="totalsText"></span>
  </div>
  <div class="filters-bar" id="filtersBar">
    <div class="filters-group" id="filtersGroup" style="display:none">
      <select id="filterStatus"></select>
      <select id="filterLifecycle"></select>
      <div class="filter-multi">
        <button type="button" id="filterZonesBtn" data-i18n="filter_by_zone">By zone</button>
        <div class="filter-multi-pop" id="filterZonesPop" style="display:none"></div>
      </div>
      <select id="filterCaKt"></select>
    </div>
    <div class="filters-empty" id="filtersEmpty" style="display:none" data-i18n="no_confs">No certificates yet. Click + to add one.</div>
    <input type="search" id="searchLabel" data-i18n-ph="ph_search" placeholder="Search label\u2026" style="display:none">
  </div>
  <h2 id="certsTitle" data-i18n="h_certs" style="margin:16px 0 10px 0;display:none">Certificates</h2>
  <div id="confList"><div class="modal-loading"><div class="spinner"></div><span data-i18n="loading">Loading\u2026</span></div></div>
</main>
<footer style="text-align:center;padding:1rem 0;font-size:.75rem;color:var(--footer-color,inherit)">\xA9 <span id="footerYear"></span> <a href="https://go.gb.net/gaobo" target="_blank" style="color:var(--footer-color,inherit);text-decoration:none;border-bottom:1px dashed var(--footer-border,currentColor)"><img src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/gaobo.png" alt="" style="height:20px;vertical-align:middle;margin:0 2px;"><span id="footerBrand"></span></a> <span id="footerProd"></span> <a href="https://github.com/onegbnet/tinyutils/blob/master/LICENSE" target="_blank" style="color:var(--footer-color,inherit);text-decoration:none;border-bottom:1px dashed var(--footer-border,currentColor)">MIT License</a></footer>


<div id="toasts"></div>

<!-- Drawer content host: hidden until openDrawer() moves these nodes into the
     Overlay-owned .drawer shell (h.box.insertBefore for tabs/loading; h.body
     for the section grid). On close, nodes move back here so listeners
     attached at module init survive across open/close cycles. -->
<div id="drawerHost" hidden>
  <div class="drawer-tabs" id="drawerTabsHost">
    <button data-tab="accounts" class="active" data-i18n="tab_accounts">Accounts Configuration</button>
    <button data-tab="settings" data-i18n="tab_settings">Settings</button>
  </div>
  <div id="drawerLoading" class="modal-loading" style="display:none">
    <div class="spinner"></div><span data-i18n="loading">Loading\u2026</span>
  </div>
  <div class="drawer-body" id="drawerBody">
    <section id="tab-accounts" class="active">
      <div class="sub-tabs">
        <label><input type="radio" name="accountsSub" value="dns" checked> <span data-i18n="sub_dns">DNS Registrars</span></label>
        <label><input type="radio" name="accountsSub" value="acme"> <span data-i18n="sub_acme">Certificate Authorities</span></label>
      </div>
      <div id="sub-dns" class="sub-pane active">
        <form id="dnsForm" class="sticky-form dns-form">
          <label data-i18n="lbl_type">Type</label>
          <select name="type"><option value="cloudflare">Cloudflare</option><option value="dnspod">DNSPod.cn</option></select>
          <div id="dnsCfFields">
            <label><span data-i18n="lbl_cf_token">Cloudflare API Token</span> <small style="color:var(--muted)" data-i18n="hnt_cf">(Zone:Read + DNS:Edit)</small></label>
            <input name="api_token" placeholder="cfut_... / v1.0-...">
          </div>
          <div id="dnsDpFields" style="display:none">
            <div class="row">
              <div><label>SecretId</label><input name="secret_id" placeholder="AKID..."></div>
              <div><label>SecretKey</label><input name="secret_key"></div>
            </div>
          </div>
          <div class="ca-form-actions">
            <span class="ca-status" id="dnsFormStatus"></span>
            <button type="submit" class="btn btn-primary btn-sm" data-i18n="btn_add_dns">Add DNS account</button>
          </div>
        </form>
        <div id="dnsList"></div>
      </div>
      <div id="sub-acme" class="sub-pane">
        <div id="acmeSections"></div>
      </div>
    </section>
    <section id="tab-settings">
      <h3 class="settings-group-title" data-i18n="settings_danger">DANGER ZONE</h3>
      <div class="danger-zone">
        <p class="danger-note" data-i18n="danger_note">Irreversible operations.</p>
        <label class="danger-item">
          <input type="radio" name="purgeScope" value="certs">
          <div class="danger-desc"><b data-i18n="danger_certs_t">Certificates &amp; history</b><span data-i18n="danger_certs_d">Removes all configured and issued certificates together with all issuance jobs and logs. DNS and CA accounts are kept.</span></div>
        </label>
        <label class="danger-item">
          <input type="radio" name="purgeScope" value="accounts">
          <div class="danger-desc"><b data-i18n="danger_accounts_t">DNS &amp; CA config</b><span data-i18n="danger_accounts_d">Removes all DNS and CA accounts. ZeroSSL is re-registered as fallback if ZEK/ZEH secrets are set. Configured certificates immediately fallback.</span></div>
        </label>
        <label class="danger-item">
          <input type="radio" name="purgeScope" value="all">
          <div class="danger-desc"><b data-i18n="danger_all_t">Everything</b><span data-i18n="danger_all_d">Full wipe. Equivalent to a fresh install.</span></div>
        </label>
        <div class="danger-confirm">
          <input type="text" id="purgeConfirm" data-i18n-ph="ph_purge" placeholder='Type "PURGE" to confirm' autocomplete="off" spellcheck="false">
          <button id="purgeBtn" class="btn btn-danger" disabled data-i18n="btn_purge">PURGE</button>
        </div>
      </div>
    </section>
  </div>
</div>

<!-- New-cert modal content host: hidden until openCertModal() moves these
     children into the Overlay-owned .cmn-modal-box body. Same move-on-
     open / move-back-on-close pattern as #drawerHost \u2014 preserves the
     listeners attached at module init (#certForm submit, #toggleAdvBtn,
     #addDomainBtn, #cancelModalBtn etc.) across open/close cycles. -->
<div id="certModalHost" hidden>
  <div id="certLoading" class="modal-loading">
    <div class="spinner"></div><span data-i18n="loading">Loading\u2026</span>
  </div>
  <form id="certForm" style="display:none">
    <label data-i18n="lbl_label">Label</label>
    <input name="name" data-i18n-ph="ph_auto" placeholder="leave blank for auto">
    <div class="row">
      <div><label data-i18n="lbl_ca">Certificate Authority</label><select name="primary_acme_directory_name" id="certCaSel" required></select></div>
      <div><label data-i18n="lbl_keytype">Key type</label><select name="key_type">
        <option value="ec256" selected>ECDSA P-256</option>
        <option value="ec384">ECDSA P-384</option>
        <option value="rsa2048">RSA 2048</option>
        <option value="rsa3072">RSA 3072</option>
        <option value="rsa4096">RSA 4096</option>
      </select></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
      <label style="margin:0"><b data-i18n="lbl_domains">Domains</b></label>
      <button type="button" class="btn btn-sm" id="toggleAdvBtn" data-i18n="btn_advanced">Advanced</button>
    </div>
    <div id="structuredPane">
      <div id="domainRows"></div>
      <button type="button" class="btn btn-sm" id="addDomainBtn" data-i18n="btn_add_domain">+ Add domain</button>
    </div>
    <div id="advancedPane" style="display:none">
      <small style="color:var(--muted)" data-i18n="hnt_fqdn">One FQDN per line. First one as primary. Wildcards like *.foo.bar.com supported.</small>
      <textarea name="advancedDomains" id="advancedText" placeholder="example.com
*.example.com
foo.bar.example.com"></textarea>
      <div id="advError" style="color:var(--err);font-size:.82rem;display:none"></div>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button type="button" class="btn btn-sm" id="cancelModalBtn" data-i18n="btn_cancel">Cancel</button>
      <button type="submit" class="btn btn-primary btn-sm" data-i18n="btn_create">Create</button>
    </div>
  </form>
</div>

<!-- Outer-script shim: declare placeholder vars BEFORE any IIFE so the
     cross-origin client.min.js sees them as free vars (esbuild can't
     constant-fold their comparisons). INITIAL_LANG = lang cookie value
     or Accept-Language fallback rendered server-side; client.mjs uses
     it instead of localStorage('lang'). -->
<script>
var INITIAL_LANG = "{{LANG}}";
</script>

<!-- CDN-served browser modules. Order: i18n-engine first (exposes
     detectLang/applyI18nAttrs/LangSelect); action before overlay
     (overlay's modal sugar refs window.Action); theme self-contained
     (storage-free, reads <html data-theme>). {{CDN_HOST}} swapped per-
     request by handleGet(). -->
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/i18n-engine/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/footer-brand/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/action/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/field/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/overlay/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/popover/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/toast/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/theme/client.min.js"></script>

<!-- mixssl's own assets: i18n.min.js (sets \`var I18N=\u2026\`) loads BEFORE
     client.min.js so the IIFE sees I18N as a free var. Both shipped via
     jsDelivr (1 year cache, repeat-page revisits skip the download).
     client.min.js reads outer-script free var INITIAL_LANG + window
     globals from CDN modules above. -->
<script src="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@c2edd27efa7fac4045a25f099140c16655198933/mixssl/i18n.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@c2edd27efa7fac4045a25f099140c16655198933/mixssl/client.min.js"></script>
</body></html>`;

var VALID_THEMES = /* @__PURE__ */ new Set(["light", "dark"]);
var VALID_LANGS = new Set(SUPPORTED_LANGS_DEFAULT);
async function handlePrefs(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }
  const setCookies = [];
  if (typeof body.theme === "string") {
    if (!VALID_THEMES.has(body.theme)) {
      return json({ error: "INVALID_THEME" }, 400);
    }
    setCookies.push(buildSetCookie("theme", body.theme, {
      maxAge: 31536e3,
      sameSite: "Lax"
    }));
  }
  if (typeof body.lang === "string") {
    if (!VALID_LANGS.has(body.lang)) {
      return json({ error: "INVALID_LANG" }, 400);
    }
    setCookies.push(buildSetCookie("lang", body.lang, {
      maxAge: 31536e3,
      sameSite: "Lax"
    }));
  }
  if (setCookies.length === 0) {
    return json({ error: "NO_PREFS" }, 400);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": setCookies.join(", ")
    }
  });
}

var enc = new TextEncoder();
var dec = new TextDecoder();
function b64uEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sha256(data) {
  const buf = typeof data === "string" ? enc.encode(data) : data;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
}
async function importMasterKey(env) {
  if (!env.MASTER) throw new Error("MASTER secret not configured");
  const raw = b64uDecode(env.MASTER.replace(/=+$/, ""));
  if (raw.length !== 32) throw new Error("MASTER must be 32 bytes (base64-encoded)");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function aesEncrypt(env, plaintext) {
  const key = await importMasterKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return b64uEncode(out);
}
async function aesDecrypt(env, ciphertextB64u) {
  const key = await importMasterKey(env);
  const buf = b64uDecode(ciphertextB64u);
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return dec.decode(pt);
}

function derLen(n) {
  if (n < 128) return new Uint8Array([n]);
  const bytes = [];
  while (n > 0) {
    bytes.unshift(n & 255);
    n >>>= 8;
  }
  return new Uint8Array([128 | bytes.length, ...bytes]);
}
function concatBytes(...arrs) {
  let total = 0;
  for (const a of arrs) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}
function derTag(tag, content) {
  return concatBytes(new Uint8Array([tag]), derLen(content.length), content);
}
function derSeq(...items) {
  return derTag(48, concatBytes(...items));
}
function derSet(...items) {
  return derTag(49, concatBytes(...items));
}
function derNull() {
  return new Uint8Array([5, 0]);
}
function derOctetString(buf) {
  return derTag(4, buf);
}
function derContextConstructed(n, content) {
  return derTag(160 | n, content);
}
function derInt(buf) {
  let bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  bytes = bytes.slice(i);
  if (bytes[0] & 128) bytes = concatBytes(new Uint8Array([0]), bytes);
  return derTag(2, bytes);
}
function derBitString(buf) {
  return derTag(3, concatBytes(new Uint8Array([0]), buf));
}
function derOid(oid) {
  const parts = oid.split(".").map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let n = parts[i];
    const stack = [n & 127];
    n >>>= 7;
    while (n > 0) {
      stack.unshift(n & 127 | 128);
      n >>>= 7;
    }
    bytes.push(...stack);
  }
  return derTag(6, new Uint8Array(bytes));
}
var OID_EC_PUBLIC_KEY = derOid("1.2.840.10045.2.1");
var OID_PRIME256V1 = derOid("1.2.840.10045.3.1.7");
var OID_SECP384R1 = derOid("1.3.132.0.34");
var OID_ECDSA_WITH_SHA256 = derOid("1.2.840.10045.4.3.2");
var OID_ECDSA_WITH_SHA384 = derOid("1.2.840.10045.4.3.3");
var OID_EXTENSION_REQUEST = derOid("1.2.840.113549.1.9.14");
var OID_SUBJECT_ALT_NAME = derOid("2.5.29.17");
function spkiEc(curve, pubXY) {
  const oid = curve === "P-384" ? OID_SECP384R1 : OID_PRIME256V1;
  const algo = derSeq(OID_EC_PUBLIC_KEY, oid);
  const point = concatBytes(new Uint8Array([4]), pubXY);
  return derSeq(algo, derBitString(point));
}
function sanExtension(domains) {
  const generalNames = domains.map((d) => derTag(130, enc.encode(d)));
  const octets = derOctetString(derSeq(...generalNames));
  return derSeq(OID_SUBJECT_ALT_NAME, octets);
}
function attributesWithSan(domains) {
  const extensions = derSeq(sanExtension(domains));
  const value = derSet(extensions);
  const attribute = derSeq(OID_EXTENSION_REQUEST, value);
  return derContextConstructed(0, attribute);
}
async function generateRsaKeyPair(bits) {
  const kp = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey));
  return { privateKey: kp.privateKey, publicKey: kp.publicKey, spki };
}
var OID_SHA256_WITH_RSA = derOid("1.2.840.113549.1.1.11");
async function buildCsrRsa(domains, certPrivateKey, spkiBytes) {
  const certificationRequestInfo = derSeq(
    derInt(new Uint8Array([0])),
    derSeq(),
    spkiBytes,
    attributesWithSan(domains)
  );
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", certPrivateKey, certificationRequestInfo)
  );
  const sigAlgo = derSeq(OID_SHA256_WITH_RSA, derNull());
  return derSeq(certificationRequestInfo, sigAlgo, derBitString(sigBytes));
}
async function buildCsrEcdsa(domains, certPrivateKey, certPublicJwk, curve) {
  curve = curve || "P-256";
  const x = b64uDecode(certPublicJwk.x);
  const y = b64uDecode(certPublicJwk.y);
  const pubXY = concatBytes(x, y);
  const hash = curve === "P-384" ? "SHA-384" : "SHA-256";
  const sigOid = curve === "P-384" ? OID_ECDSA_WITH_SHA384 : OID_ECDSA_WITH_SHA256;
  const coordLen = curve === "P-384" ? 48 : 32;
  const certificationRequestInfo = derSeq(
    derInt(new Uint8Array([0])),
    derSeq(),
    spkiEc(curve, pubXY),
    attributesWithSan(domains)
  );
  const sigRaw = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash }, certPrivateKey, certificationRequestInfo)
  );
  const r = sigRaw.slice(0, coordLen);
  const s = sigRaw.slice(coordLen, coordLen * 2);
  const sigDer = derSeq(derInt(r), derInt(s));
  return derSeq(certificationRequestInfo, derSeq(sigOid), derBitString(sigDer));
}
function toPem(label, der) {
  const b64 = btoa(String.fromCharCode(...der));
  let out = `-----BEGIN ${label}-----
`;
  for (let i = 0; i < b64.length; i += 64) out += b64.slice(i, i + 64) + "\n";
  out += `-----END ${label}-----
`;
  return out;
}
async function ecPrivateKeyToPkcs8Pem(privateKey) {
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
  return toPem("PRIVATE KEY", pkcs8);
}
function pemBodyToDer(pem) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function generateEcKeyPair(curve) {
  curve = curve || "P-256";
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: curve },
    true,
    ["sign", "verify"]
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const publicJwk = { kty: "EC", crv: curve, x: privateJwk.x, y: privateJwk.y };
  return { privateKey: kp.privateKey, publicKey: kp.publicKey, privateJwk, publicJwk, curve };
}
async function importEcPrivateKey(privateJwk) {
  return crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"]
  );
}
async function jwkThumbprint(publicJwk) {
  const canonical = `{"crv":"${publicJwk.crv}","kty":"${publicJwk.kty}","x":"${publicJwk.x}","y":"${publicJwk.y}"}`;
  return b64uEncode(await sha256(canonical));
}
async function jwsSignEs256(privateKey, protectedHeader, payloadObj) {
  const protectedB64 = b64uEncode(enc.encode(JSON.stringify(protectedHeader)));
  const payloadB64 = payloadObj === "" || payloadObj === void 0 ? "" : b64uEncode(enc.encode(JSON.stringify(payloadObj)));
  const signingInput = enc.encode(`${protectedB64}.${payloadB64}`);
  const sigRaw = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, signingInput)
  );
  return { protected: protectedB64, payload: payloadB64, signature: b64uEncode(sigRaw) };
}
async function jwsSignHs256(rawHmacKey, protectedHeader, payloadObj) {
  const key = await crypto.subtle.importKey(
    "raw",
    rawHmacKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const protectedB64 = b64uEncode(enc.encode(JSON.stringify(protectedHeader)));
  const payloadB64 = typeof payloadObj === "string" ? payloadObj : b64uEncode(enc.encode(JSON.stringify(payloadObj)));
  const signingInput = enc.encode(`${protectedB64}.${payloadB64}`);
  const sigRaw = new Uint8Array(await crypto.subtle.sign("HMAC", key, signingInput));
  return { protected: protectedB64, payload: payloadB64, signature: b64uEncode(sigRaw) };
}

function parseLenientJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
  }
  let out = "", inStr = false, escape = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (escape) {
        out += c;
        escape = false;
        continue;
      }
      if (c === "\\") {
        out += c;
        escape = true;
        continue;
      }
      if (c === '"') {
        out += c;
        inStr = false;
        continue;
      }
      if (c === "\n") {
        out += "\\n";
        continue;
      }
      if (c === "\r") {
        out += "\\r";
        continue;
      }
      if (c === "	") {
        out += "\\t";
        continue;
      }
      out += c;
    } else {
      if (c === '"') inStr = true;
      out += c;
    }
  }
  return JSON.parse(out);
}
async function gcpGetAccessToken(saJson) {
  const sa = typeof saJson === "string" ? parseLenientJson(saJson) : saJson;
  const pkcs8 = pemBodyToDer(sa.private_key);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const nowSec = Math.floor(Date.now() / 1e3);
  const header = { alg: "RS256", typ: "JWT", kid: sa.private_key_id };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    exp: nowSec + 3600,
    iat: nowSec
  };
  const hb = b64uEncode(enc.encode(JSON.stringify(header)));
  const cb = b64uEncode(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    enc.encode(`${hb}.${cb}`)
  ));
  const jwt = `${hb}.${cb}.${b64uEncode(sig)}`;
  const r = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`gcp token exchange failed: ${r.status} ${JSON.stringify(j)}`);
  return { accessToken: j.access_token, saEmail: sa.client_email, projectId: sa.project_id };
}
async function gcpMintPublicCaEab(saJson) {
  const { accessToken, projectId } = await gcpGetAccessToken(saJson);
  const url = `https://publicca.googleapis.com/v1/projects/${projectId}/locations/global/externalAccountKeys`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: "{}"
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`gcp publicca mint failed: ${r.status} ${JSON.stringify(j)}`);
  return { keyId: j.keyId, b64MacKey: j.b64MacKey };
}

async function acmeFetchDirectory(directoryUrl) {
  const r = await fetch(directoryUrl, { headers: { "User-Agent": "mixssl/0.1" } });
  if (!r.ok) throw new Error(`acme directory fetch failed ${r.status}`);
  return r.json();
}
async function acmeNewNonce(dir) {
  const r = await fetch(dir.newNonce, { method: "HEAD", headers: { "User-Agent": "mixssl/0.1" } });
  if (!r.ok) throw new Error(`acme newNonce failed ${r.status}`);
  const n = r.headers.get("Replay-Nonce");
  if (!n) throw new Error("acme newNonce: no Replay-Nonce header");
  return n;
}
async function acmeSignedPost(dir, account, url, payload, useJwk) {
  if (!account.nonce) account.nonce = await acmeNewNonce(dir);
  const protectedHeader = useJwk ? { alg: "ES256", jwk: account.publicJwk, nonce: account.nonce, url } : { alg: "ES256", kid: account.kid, nonce: account.nonce, url };
  const jws = await jwsSignEs256(account.privateKey, protectedHeader, payload);
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/jose+json", "User-Agent": "mixssl/0.1" },
    body: JSON.stringify(jws)
  });
  account.nonce = r.headers.get("Replay-Nonce") || null;
  return r;
}
async function acmePostAsGet(dir, account, url) {
  return acmeSignedPost(dir, account, url, "", false);
}
async function buildEab(eabKid, eabHmacB64u, accountPublicJwk, newAccountUrl) {
  const protectedHeader = { alg: "HS256", kid: eabKid, url: newAccountUrl };
  const rawHmac = b64uDecode(eabHmacB64u);
  return jwsSignHs256(rawHmac, protectedHeader, accountPublicJwk);
}
async function acmeNewAccount(dir, account, contact, eab) {
  const payload = {
    termsOfServiceAgreed: true,
    contact: contact && contact.length ? contact : void 0
  };
  if (eab) payload.externalAccountBinding = eab;
  const r = await acmeSignedPost(dir, account, dir.newAccount, payload, true);
  if (r.status !== 200 && r.status !== 201) {
    const body = await r.text();
    throw new Error(`acme newAccount failed ${r.status}: ${body}`);
  }
  account.kid = r.headers.get("Location");
  if (!account.kid) throw new Error("acme newAccount: no Location header");
  return account.kid;
}
async function acmeNewOrder(dir, account, domains) {
  const identifiers = domains.map((d) => ({ type: "dns", value: d }));
  const r = await acmeSignedPost(dir, account, dir.newOrder, { identifiers }, false);
  if (r.status !== 201) {
    const body = await r.text();
    throw new Error(`acme newOrder failed ${r.status}: ${body}`);
  }
  const order = await r.json();
  order.url = r.headers.get("Location");
  return order;
}
async function acmeFetchAuthz(dir, account, authzUrl) {
  const r = await acmePostAsGet(dir, account, authzUrl);
  if (!r.ok) throw new Error(`acme fetchAuthz failed ${r.status}`);
  return r.json();
}
async function acmeRespondChallenge(dir, account, challengeUrl) {
  const r = await acmeSignedPost(dir, account, challengeUrl, {}, false);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`acme respondChallenge failed ${r.status}: ${body}`);
  }
  return r.json();
}
async function acmeFinalize(dir, account, finalizeUrl, csrDer) {
  const csrB64u = b64uEncode(csrDer);
  const r = await acmeSignedPost(dir, account, finalizeUrl, { csr: csrB64u }, false);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`acme finalize failed ${r.status}: ${body}`);
  }
  return r.json();
}
async function acmeFetchOrder(dir, account, orderUrl) {
  const r = await acmePostAsGet(dir, account, orderUrl);
  if (!r.ok) throw new Error(`acme fetchOrder failed ${r.status}`);
  return r.json();
}
async function acmeDownloadCert(dir, account, certUrl) {
  const r = await acmePostAsGet(dir, account, certUrl);
  if (!r.ok) throw new Error(`acme downloadCert failed ${r.status}`);
  return r.text();
}
async function acmeRevokeCertWithCertKey(dir, leafPem, keyPem, keyType, reason) {
  if (!dir.revokeCert) throw new Error("directory has no revokeCert endpoint");
  let algo, jwsAlg, signAlgo;
  if ((keyType || "").startsWith("rsa")) {
    algo = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    jwsAlg = "RS256";
    signAlgo = "RSASSA-PKCS1-v1_5";
  } else {
    const curve = keyType === "ec384" ? "P-384" : "P-256";
    algo = { name: "ECDSA", namedCurve: curve };
    jwsAlg = curve === "P-384" ? "ES384" : "ES256";
    signAlgo = { name: "ECDSA", hash: curve === "P-384" ? "SHA-384" : "SHA-256" };
  }
  const privateKey = await crypto.subtle.importKey("pkcs8", pemBodyToDer(keyPem), algo, true, ["sign"]);
  const fullJwk = await crypto.subtle.exportKey("jwk", privateKey);
  const publicJwk = fullJwk.kty === "RSA" ? { e: fullJwk.e, kty: "RSA", n: fullJwk.n } : { crv: fullJwk.crv, kty: "EC", x: fullJwk.x, y: fullJwk.y };
  const nonce = await acmeNewNonce(dir);
  const payload = { certificate: b64uEncode(pemBodyToDer(leafPem)) };
  if (typeof reason === "number") payload.reason = reason;
  const protectedHeader = { alg: jwsAlg, jwk: publicJwk, nonce, url: dir.revokeCert };
  const protectedB64 = b64uEncode(enc.encode(JSON.stringify(protectedHeader)));
  const payloadB64 = b64uEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = enc.encode(`${protectedB64}.${payloadB64}`);
  const sigRaw = new Uint8Array(await crypto.subtle.sign(signAlgo, privateKey, signingInput));
  const jws = { protected: protectedB64, payload: payloadB64, signature: b64uEncode(sigRaw) };
  const r = await fetch(dir.revokeCert, {
    method: "POST",
    headers: { "Content-Type": "application/jose+json", "User-Agent": "mixssl/0.1" },
    body: JSON.stringify(jws)
  });
  if (r.status === 200 || r.status === 201) return true;
  const body = await r.text();
  if (r.status === 409 || /already.*revoked/i.test(body)) return true;
  throw new Error(`acme revokeCert (cert-key) failed ${r.status}: ${body}`);
}
function splitChainPem(fullchain) {
  const certs = fullchain.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----\n?/g) || [];
  return { leaf: certs[0] || "", chain: certs.slice(1).join("") };
}
async function keyAuthorization(token, accountPublicJwk) {
  return `${token}.${await jwkThumbprint(accountPublicJwk)}`;
}
async function dnsChallengeTxtValue(keyAuth) {
  return b64uEncode(await sha256(keyAuth));
}

function bytesToHex(buf) {
  let s = "";
  for (let i = 0; i < buf.length; i++) s += buf[i].toString(16).padStart(2, "0");
  return s;
}
async function hmacSha256Raw(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, typeof data === "string" ? enc.encode(data) : data);
  return new Uint8Array(sig);
}
function baseDomain(d) {
  return d.startsWith("*.") ? d.slice(2) : d;
}
function txtChallengeName(domain) {
  return `_acme-challenge.${baseDomain(domain)}`;
}

async function cfRequest(token, method, urlPath, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${urlPath}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "mixssl/0.1"
    },
    body: body ? JSON.stringify(body) : void 0
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) {
    const errs = (j.errors || []).map((e) => `${e.code} ${e.message}`).join("; ") || `HTTP ${r.status}`;
    throw new Error(`cloudflare ${method} ${urlPath}: ${errs}`);
  }
  return j;
}
async function cfFindZoneId(token, fqdn) {
  const parts = baseDomain(fqdn).split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    const j = await cfRequest(token, "GET", `/zones?name=${encodeURIComponent(candidate)}`);
    if (j.result && j.result.length > 0) return { zoneId: j.result[0].id, zoneName: candidate };
  }
  throw new Error(`cloudflare: no zone found for ${fqdn}`);
}
async function cfListZones(creds) {
  const all = [];
  let page = 1;
  while (true) {
    const j = await cfRequest(creds.api_token, "GET", `/zones?per_page=50&page=${page}`);
    const got = (j.result || []).map((z) => z.name);
    all.push(...got);
    if (got.length < 50) break;
    page++;
    if (page > 20) break;
  }
  return all;
}
async function cfAddTxt(creds, fqdn, value) {
  const name = txtChallengeName(fqdn);
  const { zoneId } = await cfFindZoneId(creds.api_token, fqdn);
  try {
    const j = await cfRequest(creds.api_token, "POST", `/zones/${zoneId}/dns_records`, {
      type: "TXT",
      name,
      content: value,
      ttl: 60
    });
    return { recordId: j.result.id, zoneId };
  } catch (e) {
    if (!/\b81058\b/.test(e.message || "")) throw e;
    const list = await cfRequest(
      creds.api_token,
      "GET",
      `/zones/${zoneId}/dns_records?type=TXT&name=${encodeURIComponent(name)}`
    );
    for (const rec of list.result || []) {
      const content = (rec.content || "").replace(/^"|"$/g, "");
      if (content === value) return { recordId: rec.id, zoneId };
    }
    throw e;
  }
}
async function cfRemoveTxt(creds, fqdn, value) {
  const name = txtChallengeName(fqdn);
  const { zoneId } = await cfFindZoneId(creds.api_token, fqdn);
  const j = await cfRequest(
    creds.api_token,
    "GET",
    `/zones/${zoneId}/dns_records?type=TXT&name=${encodeURIComponent(name)}`
  );
  let removed = 0;
  for (const rec of j.result || []) {
    const content = (rec.content || "").replace(/^"|"$/g, "");
    if (!value || content === value) {
      await cfRequest(creds.api_token, "DELETE", `/zones/${zoneId}/dns_records/${rec.id}`);
      removed++;
    }
  }
  return { removed };
}
async function cfQueryTxt(creds, fqdn, value) {
  const name = txtChallengeName(fqdn);
  const { zoneId } = await cfFindZoneId(creds.api_token, fqdn);
  const j = await cfRequest(
    creds.api_token,
    "GET",
    `/zones/${zoneId}/dns_records?type=TXT&name=${encodeURIComponent(name)}`
  );
  return (j.result || []).some((rec) => (rec.content || "").replace(/^"|"$/g, "") === value);
}

var TC_HOST = "dnspod.tencentcloudapi.com";
var TC_SERVICE = "dnspod";
var TC_VERSION = "2021-03-23";
async function tcSignedCall2(creds, action, payload) {
  const ts = Math.floor(Date.now() / 1e3);
  const date = new Date(ts * 1e3).toISOString().slice(0, 10);
  const payloadJson = JSON.stringify(payload);
  const payloadHash = bytesToHex(await sha256(payloadJson));
  const canonicalHeaders = `content-type:application/json; charset=utf-8
host:${TC_HOST}
x-tc-action:${action.toLowerCase()}
`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = "POST\n/\n\n" + canonicalHeaders + "\n" + signedHeaders + "\n" + payloadHash;
  const credentialScope = `${date}/${TC_SERVICE}/tc3_request`;
  const stringToSign = "TC3-HMAC-SHA256\n" + ts + "\n" + credentialScope + "\n" + bytesToHex(await sha256(canonicalRequest));
  const secretDate = await hmacSha256Raw(enc.encode("TC3" + creds.secret_key), date);
  const secretService = await hmacSha256Raw(secretDate, TC_SERVICE);
  const secretSigning = await hmacSha256Raw(secretService, "tc3_request");
  const signature = bytesToHex(await hmacSha256Raw(secretSigning, stringToSign));
  const authorization = `TC3-HMAC-SHA256 Credential=${creds.secret_id}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const r = await fetch(`https://${TC_HOST}/`, {
    method: "POST",
    headers: {
      "Authorization": authorization,
      "Content-Type": "application/json; charset=utf-8",
      "Host": TC_HOST,
      "X-TC-Action": action,
      "X-TC-Timestamp": String(ts),
      "X-TC-Version": TC_VERSION
    },
    body: payloadJson
  });
  const j = await r.json().catch(() => ({}));
  if (j.Response && j.Response.Error) {
    const e = j.Response.Error;
    throw new Error(`dnspod ${action}: ${e.Code} ${e.Message}`);
  }
  if (!r.ok) throw new Error(`dnspod ${action}: HTTP ${r.status}`);
  return j.Response;
}
async function dpListDomains(creds) {
  const all = [];
  let offset = 0;
  while (true) {
    const r = await tcSignedCall2(creds, "DescribeDomainList", { Offset: offset, Limit: 100 });
    const got = (r.DomainList || []).map((d) => d.Name);
    all.push(...got);
    if (got.length < 100) break;
    offset += 100;
    if (offset > 2e3) break;
  }
  return all;
}
async function dpResolveDomain(creds, fqdn) {
  const base = baseDomain(fqdn);
  const parts = base.split(".");
  for (let take = 2; take <= Math.min(parts.length, 4); take++) {
    const candidate = parts.slice(parts.length - take).join(".");
    try {
      await tcSignedCall2(creds, "DescribeDomain", { Domain: candidate });
      const sub = parts.slice(0, parts.length - take).join(".") || "@";
      return { domain: candidate, subDomain: sub };
    } catch (e) {
      if (!/InvalidParameter|DomainNotExists|ResourceNotFound/i.test(e.message)) throw e;
    }
  }
  throw new Error(`dnspod: no managed domain found for ${fqdn}`);
}
async function dpAddTxt(creds, fqdn, value) {
  const { domain, subDomain } = await dpResolveDomain(creds, fqdn);
  const sub = subDomain === "@" ? "_acme-challenge" : `_acme-challenge.${subDomain}`;
  const payload = {
    Domain: domain,
    SubDomain: sub,
    RecordType: "TXT",
    RecordLine: "\u9ED8\u8BA4",
    Value: value,
    TTL: 600
  };
  try {
    const r = await tcSignedCall2(creds, "CreateRecord", payload);
    return { recordId: r.RecordId, domain, subDomain: sub };
  } catch (e) {
    try {
      const list = await tcSignedCall2(creds, "DescribeRecordList", {
        Domain: domain,
        Subdomain: sub,
        RecordType: "TXT"
      });
      for (const rec of list.RecordList || []) {
        if ((rec.Value || "") === value) {
          return { recordId: rec.RecordId, domain, subDomain: sub };
        }
      }
    } catch {
    }
    throw e;
  }
}
async function dpRemoveTxt(creds, fqdn, value) {
  const { domain, subDomain } = await dpResolveDomain(creds, fqdn);
  const sub = subDomain === "@" ? "_acme-challenge" : `_acme-challenge.${subDomain}`;
  const list = await tcSignedCall2(creds, "DescribeRecordList", {
    Domain: domain,
    Subdomain: sub,
    RecordType: "TXT"
  }).catch((e) => {
    if (/RecordNotExists|ResourceNotFound/i.test(e.message)) return { RecordList: [] };
    throw e;
  });
  let removed = 0;
  for (const rec of list.RecordList || []) {
    if (!value || rec.Value === value) {
      await tcSignedCall2(creds, "DeleteRecord", { Domain: domain, RecordId: rec.RecordId });
      removed++;
    }
  }
  return { removed };
}
async function dpQueryTxt(creds, fqdn, value) {
  const { domain, subDomain } = await dpResolveDomain(creds, fqdn);
  const sub = subDomain === "@" ? "_acme-challenge" : `_acme-challenge.${subDomain}`;
  const list = await tcSignedCall2(creds, "DescribeRecordList", {
    Domain: domain,
    Subdomain: sub,
    RecordType: "TXT"
  }).catch((e) => {
    if (/RecordNotExists|ResourceNotFound/i.test(e.message)) return { RecordList: [] };
    throw e;
  });
  return (list.RecordList || []).some((rec) => rec.Value === value);
}

var DNS_PROVIDERS = {
  cloudflare: { addTxt: cfAddTxt, removeTxt: cfRemoveTxt, queryTxt: cfQueryTxt, listZones: cfListZones },
  dnspod: { addTxt: dpAddTxt, removeTxt: dpRemoveTxt, queryTxt: dpQueryTxt, listZones: dpListDomains }
};
async function providerListZones(type, credentials) {
  const p = DNS_PROVIDERS[type];
  if (!p || !p.listZones) throw new Error(`unknown DNS provider type: ${type}`);
  return p.listZones(credentials);
}
async function providerAddTxt(type, credentials, fqdn, value) {
  const p = DNS_PROVIDERS[type];
  if (!p) throw new Error(`unknown DNS provider type: ${type}`);
  return p.addTxt(credentials, fqdn, value);
}
async function providerQueryTxt(type, credentials, fqdn, value) {
  const p = DNS_PROVIDERS[type];
  if (!p || !p.queryTxt) throw new Error(`unknown DNS provider type: ${type}`);
  return p.queryTxt(credentials, fqdn, value);
}
async function providerRemoveTxt(type, credentials, fqdn, value) {
  const p = DNS_PROVIDERS[type];
  if (!p) throw new Error(`unknown DNS provider type: ${type}`);
  return p.removeTxt(credentials, fqdn, value);
}
async function findDnsAccountForDomain(env, domain) {
  const base = baseDomain(domain);
  const rows = (await env.DATA.prepare(
    "SELECT id, type, credentials_encrypted, zones_cache_json FROM dns_accounts ORDER BY id"
  ).all()).results || [];
  let best = null;
  for (const r of rows) {
    let zones = [];
    try {
      zones = JSON.parse(r.zones_cache_json || "[]");
    } catch {
    }
    for (const z of zones) {
      if (!z.enabled) continue;
      if (z.authoritative === false) continue;
      if (base === z.zone || base.endsWith("." + z.zone)) {
        if (!best || z.zone.length > best.zone.length) {
          best = { zone: z.zone, account: r };
        }
      }
    }
  }
  if (!best) throw new Error(`no enabled DNS zone covers ${domain}`);
  return {
    zone: best.zone,
    accountId: best.account.id,
    type: best.account.type,
    credentials: JSON.parse(await aesDecrypt(env, best.account.credentials_encrypted))
  };
}

var SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS acme_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    directory_name TEXT NOT NULL,
    jwk_encrypted TEXT NOT NULL,
    kid TEXT,
    conf TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE (directory_name)
  )`,
  `CREATE TABLE IF NOT EXISTS dns_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    credentials_encrypted TEXT NOT NULL,
    zones_cache_json TEXT,
    zones_probed_at INTEGER,
    probe_error TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS zones (
    zone TEXT PRIMARY KEY,
    dns_account_id INTEGER NOT NULL,
    FOREIGN KEY (dns_account_id) REFERENCES dns_accounts(id)
  )`,
  `CREATE TABLE IF NOT EXISTS cert_confs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    domains_json TEXT NOT NULL,
    primary_acme_directory_name TEXT NOT NULL,
    fallback_acme_directory_names_json TEXT,
    key_type TEXT NOT NULL DEFAULT 'ec256',
    auto_renew_policy TEXT NOT NULL DEFAULT 'manual',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS certs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conf_id INTEGER NOT NULL,
    cert_pem TEXT NOT NULL,
    chain_pem TEXT NOT NULL,
    key_pem_encrypted TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    issued_at INTEGER NOT NULL,
    acme_directory_name TEXT NOT NULL,
    key_type TEXT,
    domains_json TEXT,
    revoked_at INTEGER,
    FOREIGN KEY (conf_id) REFERENCES cert_confs(id)
  )`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conf_id INTEGER NOT NULL,
    acme_directory_name TEXT NOT NULL,
    acme_account_attempt_index INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL,
    step_data_json TEXT,
    next_tick_at INTEGER NOT NULL,
    lease_until INTEGER NOT NULL DEFAULT 0,
    lease_token TEXT,
    attempt INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (conf_id) REFERENCES cert_confs(id)
  )`,
  `CREATE TABLE IF NOT EXISTS job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_pending ON jobs(state, next_tick_at, lease_until)`,
  `CREATE INDEX IF NOT EXISTS idx_certs_conf ON certs(conf_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_job ON job_logs(job_id, ts)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_confs_name ON cert_confs(name) WHERE deleted_at IS NULL`
];
var ACME_DIRECTORIES = {
  "ZeroSSL": { url: "https://acme.zerossl.com/v2/DV90", eab: 1 },
  "Google Trust Services": { url: "https://dv.acme-v02.api.pki.goog/directory", eab: 1 }
};
function acmeDirectoryByName(name) {
  const d = ACME_DIRECTORIES[name];
  if (!d) throw new Error(`unknown ACME directory: ${name}`);
  return d;
}
async function ensureSchema(env) {
  let stale = false;
  try {
    const cols = await env.DATA.prepare(`PRAGMA table_info(certs)`).all();
    const names = (cols.results || []).map((r) => r.name);
    stale = names.includes("acme_account_id") && !names.includes("acme_directory_name");
  } catch {
  }
  if (stale) {
    console.warn("stale pre-refactor schema detected \u2014 purging all app tables for rebuild");
    const tables = ["job_logs", "jobs", "certs", "cert_confs", "zones", "dns_accounts", "acme_accounts"];
    for (const t of tables) await env.DATA.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  }
  for (const sql of SCHEMA_SQL) {
    await env.DATA.prepare(sql).run();
  }
}

function now() {
  return Math.floor(Date.now() / 1e3);
}
async function logJob(env, jobId, level, message) {
  await env.DATA.prepare(
    "INSERT INTO job_logs (job_id, ts, level, message) VALUES (?, ?, ?, ?)"
  ).bind(jobId, now(), level, message).run();
}
async function loadAcmeAccount(env, directoryName) {
  const a = await env.DATA.prepare("SELECT * FROM acme_accounts WHERE directory_name = ?").bind(directoryName).first();
  if (!a) throw new Error(`no ACME account registered for ${directoryName}`);
  const dir = acmeDirectoryByName(a.directory_name);
  a.directory_url = dir.url;
  const privJwk = JSON.parse(await aesDecrypt(env, a.jwk_encrypted));
  const privateKey = await importEcPrivateKey(privJwk);
  const publicJwk = { kty: "EC", crv: "P-256", x: privJwk.x, y: privJwk.y };
  let eab = null, saJson = null;
  if (a.conf) {
    try {
      const conf = JSON.parse(await aesDecrypt(env, a.conf));
      if (conf.eab_kid && conf.eab_hmac) eab = { kid: conf.eab_kid, hmac: conf.eab_hmac };
      if (conf.gcp_sa_json) saJson = conf.gcp_sa_json;
    } catch {
    }
  }
  let contact = [];
  if (saJson) {
    try {
      const sa = parseLenientJson(saJson);
      if (sa.client_email) contact = ["mailto:" + sa.client_email];
    } catch {
    }
  }
  return {
    row: a,
    directoryUrl: a.directory_url,
    kid: a.kid,
    contact,
    eab,
    saJson,
    account: { privateKey, publicJwk, kid: a.kid, nonce: null }
  };
}
async function ensureAcmeKid(env, loaded, dir) {
  if (loaded.kid) return loaded.kid;
  let eab = loaded.eab;
  if (!eab && loaded.saJson) {
    const minted = await gcpMintPublicCaEab(loaded.saJson);
    eab = { kid: minted.keyId, hmac: minted.b64MacKey };
  }
  let eabJws = null;
  if (eab) {
    eabJws = await buildEab(eab.kid, eab.hmac, loaded.account.publicJwk, dir.newAccount);
  }
  const kid = await acmeNewAccount(dir, loaded.account, loaded.contact, eabJws);
  await env.DATA.prepare("UPDATE acme_accounts SET kid = ? WHERE id = ?").bind(kid, loaded.row.id).run();
  loaded.kid = kid;
  loaded.account.kid = kid;
  return kid;
}
async function tickJob(env, jobId) {
  const t = now();
  const lease = t + 120;
  const myToken = crypto.randomUUID();
  const up = await env.DATA.prepare(
    `UPDATE jobs SET lease_until = ?, lease_token = ?, updated_at = ?
       WHERE id = ? AND lease_until < ? AND state NOT IN ('done','failed')`
  ).bind(lease, myToken, t, jobId, t).run();
  if (!up.meta || up.meta.changes === 0) return { skipped: true };
  const job = await env.DATA.prepare("SELECT * FROM jobs WHERE id = ?").bind(jobId).first();
  if (!job) return { skipped: true };
  const conf = await env.DATA.prepare("SELECT * FROM cert_confs WHERE id = ? AND deleted_at IS NULL").bind(job.conf_id).first();
  if (!conf) throw new Error(`certificate ${job.conf_id} missing or deleted`);
  let stepData = {};
  try {
    stepData = job.step_data_json ? JSON.parse(job.step_data_json) : {};
  } catch {
    stepData = {};
  }
  const writeIfOwner = async (sql, binds) => {
    const r = await env.DATA.prepare(sql).bind(...binds).run();
    return !!(r.meta && r.meta.changes);
  };
  try {
    const result = await advanceState(env, job, conf, stepData);
    const nextTickAt = t + (result.delay || 5);
    const ok = await writeIfOwner(
      `UPDATE jobs SET state = ?, step_data_json = ?, next_tick_at = ?,
         lease_until = 0, lease_token = NULL, updated_at = ?, attempt = attempt + 1
       WHERE id = ? AND lease_token = ?`,
      [result.nextState, JSON.stringify(result.stepData || stepData), nextTickAt, t, jobId, myToken]
    );
    if (!ok) return { skipped: true, reason: "lease-stolen" };
    if (result.log) await logJob(env, jobId, "info", result.log);
    return { ok: true, newState: result.nextState };
  } catch (e) {
    const msg = e.message || String(e);
    try {
      await logJob(env, jobId, "error", msg);
    } catch {
    }
    try {
      const sd = job.step_data_json ? JSON.parse(job.step_data_json) : {};
      await cleanupTxtRecords(env, jobId, sd);
    } catch {
    }
    const fbRow = await env.DATA.prepare(
      `SELECT 1 FROM acme_accounts WHERE directory_name = ? AND kid IS NOT NULL`
    ).bind("ZeroSSL").first();
    const canFallback = fbRow && job.acme_directory_name !== "ZeroSSL" && (job.acme_account_attempt_index || 0) === 0;
    if (canFallback) {
      const ok2 = await writeIfOwner(
        `UPDATE jobs SET acme_directory_name=?, acme_account_attempt_index=1, state='new',
           step_data_json=NULL, next_tick_at=?, lease_until=0, lease_token=NULL,
           error=?, updated_at=? WHERE id=? AND lease_token=?`,
        ["ZeroSSL", t + 3, msg, t, jobId, myToken]
      );
      if (!ok2) return { skipped: true, reason: "lease-stolen" };
      try {
        await logJob(env, jobId, "warn", "falling back to ZeroSSL");
      } catch {
      }
      return { ok: false, error: msg, fallback: true };
    }
    const ok = await writeIfOwner(
      `UPDATE jobs SET state='failed', error=?, lease_until=0, lease_token=NULL,
         updated_at=? WHERE id=? AND lease_token=?`,
      [msg, t, jobId, myToken]
    );
    if (!ok) return { skipped: true, reason: "lease-stolen" };
    try {
      await logJob(env, jobId, "error", "issuance aborted, no more fallback available");
    } catch {
    }
    return { ok: false, error: msg };
  }
}
async function advanceState(env, job, conf, stepData) {
  const domains = JSON.parse(conf.domains_json);
  const state = job.state;
  const resolveDns = async (domain) => findDnsAccountForDomain(env, domain);
  if (state === "new") {
    return { nextState: "ensure_account", stepData: {}, log: `start for ${domains.join(",")}` };
  }
  const loaded = await loadAcmeAccount(env, job.acme_directory_name);
  const dir = await acmeFetchDirectory(loaded.directoryUrl);
  if (state === "ensure_account") {
    await ensureAcmeKid(env, loaded, dir);
    return { nextState: "new_order", stepData: { ...stepData }, log: `ACME account ready at ${loaded.row.directory_name || "CA"}` };
  }
  if (state === "new_order") {
    const order = await acmeNewOrder(dir, loaded.account, domains);
    return {
      nextState: "fetch_authzs",
      stepData: {
        ...stepData,
        orderUrl: order.url,
        finalizeUrl: order.finalize,
        authzUrls: order.authorizations
      },
      log: `order created, ${order.authorizations.length} authorizations`
    };
  }
  if (state === "fetch_authzs") {
    const authzs = [];
    for (const authzUrl of stepData.authzUrls) {
      const a = await acmeFetchAuthz(dir, loaded.account, authzUrl);
      const challenge = (a.challenges || []).find((c) => c.type === "dns-01");
      if (!challenge) throw new Error(`no dns-01 challenge for ${a.identifier.value}`);
      const domain = (a.wildcard ? "*." : "") + a.identifier.value;
      const keyAuth = await keyAuthorization(challenge.token, loaded.account.publicJwk);
      const txtValue = await dnsChallengeTxtValue(keyAuth);
      authzs.push({
        url: authzUrl,
        domain,
        status: a.status,
        challengeUrl: challenge.url,
        token: challenge.token,
        txtValue
      });
    }
    return {
      nextState: "set_txt",
      stepData: { ...stepData, authzs },
      log: `authzs fetched: ${authzs.map((a) => a.domain).join(", ")}`
    };
  }
  if (state === "set_txt") {
    const updated = [];
    for (const a of stepData.authzs) {
      if (a.recordId) {
        updated.push(a);
        continue;
      }
      if (a.status === "valid") {
        updated.push(a);
        continue;
      }
      const dns = await resolveDns(a.domain);
      const r = await providerAddTxt(dns.type, dns.credentials, a.domain, a.txtValue);
      await logJob(env, job.id, "info", `TXT write ${txtChallengeName(a.domain)}="${a.txtValue}" via ${dns.type}`);
      updated.push({ ...a, recordId: r.recordId, dnsType: dns.type, dnsAccountId: dns.accountId });
    }
    return {
      nextState: "wait_propagation",
      stepData: { ...stepData, authzs: updated },
      delay: 10,
      log: `TXT records written: ${updated.filter((a) => a.recordId).length}/${updated.length}`
    };
  }
  if (state === "wait_propagation") {
    const REQUIRED_CONFIRMS = 3;
    let allReady = true;
    const details = [];
    for (const a of stepData.authzs) {
      if (a.status === "valid") {
        details.push(`${a.domain}:skip`);
        continue;
      }
      const acc = await env.DATA.prepare(
        "SELECT credentials_encrypted FROM dns_accounts WHERE id = ?"
      ).bind(a.dnsAccountId).first();
      if (!acc) {
        details.push(`${a.domain}:no-acct`);
        allReady = false;
        continue;
      }
      let found = false;
      try {
        const creds = JSON.parse(await aesDecrypt(env, acc.credentials_encrypted));
        found = await providerQueryTxt(a.dnsType, creds, a.domain, a.txtValue);
      } catch {
      }
      details.push(`${a.domain}:${found ? "ok" : "wait"}`);
      if (!found) allReady = false;
    }
    const confirms = (stepData.propagationConfirms || 0) + (allReady ? 1 : 0);
    if (!allReady || confirms < REQUIRED_CONFIRMS) {
      return {
        nextState: "wait_propagation",
        stepData: { ...stepData, propagationConfirms: allReady ? confirms : 0 },
        delay: 15,
        log: `propagation [${confirms}/${REQUIRED_CONFIRMS}]: ${details.join(" ")}`
      };
    }
    return { nextState: "notify_challenges", stepData, log: `propagated (stable): ${details.join(" ")}` };
  }
  if (state === "notify_challenges") {
    for (const a of stepData.authzs) {
      if (a.status === "valid") continue;
      await acmeRespondChallenge(dir, loaded.account, a.challengeUrl);
    }
    return { nextState: "wait_authz_valid", stepData, delay: 5, log: "challenges notified" };
  }
  if (state === "wait_authz_valid") {
    const statuses = [];
    const updated = [];
    let allValid = true;
    for (const a of stepData.authzs) {
      const fresh = await acmeFetchAuthz(dir, loaded.account, a.url);
      statuses.push(`${a.domain}:${fresh.status}`);
      updated.push({ ...a, status: fresh.status });
      if (fresh.status === "invalid") {
        const challenge = (fresh.challenges || []).find((c) => c.type === "dns-01");
        const err = challenge && challenge.error ? JSON.stringify(challenge.error) : "authz invalid";
        throw new Error(`authz ${a.domain} invalid: ${err}`);
      }
      if (fresh.status !== "valid") allValid = false;
    }
    if (!allValid) {
      return { nextState: "wait_authz_valid", stepData: { ...stepData, authzs: updated }, delay: 5, log: `authz: ${statuses.join(" ")}` };
    }
    return { nextState: "finalize", stepData: { ...stepData, authzs: updated }, log: `authz all valid: ${statuses.join(" ")}` };
  }
  if (state === "finalize") {
    const kt = conf.key_type || "ec256";
    let certPrivateKey, csrDer;
    if (kt.startsWith("rsa")) {
      const bits = parseInt(kt.slice(3), 10) || 2048;
      const rsaKp = await generateRsaKeyPair(bits);
      csrDer = await buildCsrRsa(domains, rsaKp.privateKey, rsaKp.spki);
      certPrivateKey = rsaKp.privateKey;
    } else {
      const curve = kt === "ec384" ? "P-384" : "P-256";
      const ecKp = await generateEcKeyPair(curve);
      csrDer = await buildCsrEcdsa(domains, ecKp.privateKey, ecKp.publicJwk, curve);
      certPrivateKey = ecKp.privateKey;
    }
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", certPrivateKey));
    const certKeyPem = toPem("PRIVATE KEY", pkcs8);
    const order = await acmeFinalize(dir, loaded.account, stepData.finalizeUrl, csrDer);
    return {
      nextState: "wait_order_ready",
      stepData: { ...stepData, certKeyPemEnc: await aesEncrypt(env, certKeyPem), orderStatus: order.status, certUrl: order.certificate || null },
      delay: 5,
      log: `finalize submitted, order status=${order.status}`
    };
  }
  if (state === "wait_order_ready") {
    const order = await acmeFetchOrder(dir, loaded.account, stepData.orderUrl);
    if (order.status === "invalid") throw new Error(`order invalid: ${JSON.stringify(order.error || {})}`);
    if (order.status !== "valid") {
      return { nextState: "wait_order_ready", stepData: { ...stepData, orderStatus: order.status }, delay: 5, log: `order status=${order.status}` };
    }
    return {
      nextState: "download",
      stepData: { ...stepData, orderStatus: "valid", certUrl: order.certificate },
      log: "order ready"
    };
  }
  if (state === "download") {
    const fullchain = await acmeDownloadCert(dir, loaded.account, stepData.certUrl);
    const { leaf, chain } = splitChainPem(fullchain);
    const expiresAt = extractCertExpiry(leaf) || now() + 86400 * 90;
    await env.DATA.prepare(
      `INSERT INTO certs (conf_id, cert_pem, chain_pem, key_pem_encrypted, expires_at, issued_at, acme_directory_name, key_type, domains_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(conf.id, leaf, chain, stepData.certKeyPemEnc, expiresAt, now(), job.acme_directory_name, conf.key_type || "ec256", conf.domains_json).run();
    const actualCa = loaded.row.directory_name;
    if (actualCa && conf.primary_acme_directory_name !== actualCa) {
      await env.DATA.prepare("UPDATE cert_confs SET primary_acme_directory_name = ? WHERE id = ?").bind(actualCa, conf.id).run();
    }
    return {
      nextState: "cleanup_txt",
      stepData,
      log: `certificate issued, expires ${new Date(expiresAt * 1e3).toISOString().slice(0, 10)}`
    };
  }
  if (state === "cleanup_txt") {
    await cleanupTxtRecords(env, job.id, stepData);
    return { nextState: "done", stepData: {}, log: "TXT cleanup complete" };
  }
  throw new Error(`unknown state: ${state}`);
}
async function cleanupTxtRecords(env, jobId, stepData) {
  if (!stepData.authzs) return;
  for (const a of stepData.authzs) {
    if (!a.recordId && !a.txtValue) continue;
    try {
      const dns = await findDnsAccountForDomain(env, a.domain);
      await providerRemoveTxt(dns.type, dns.credentials, a.domain, a.txtValue);
      await logJob(env, jobId, "info", `TXT remove ${txtChallengeName(a.domain)}="${a.txtValue}" via ${dns.type}`);
    } catch (e) {
      await logJob(env, jobId, "warn", `TXT remove ${txtChallengeName(a.domain)}="${a.txtValue}" failed: ${e && e.message || String(e)}`);
    }
  }
}
function extractCertExpiry(certPem) {
  try {
    const b64 = certPem.replace(/-----BEGIN CERTIFICATE-----/g, "").replace(/-----END CERTIFICATE-----/g, "").replace(/\s+/g, "");
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    let p = 0;
    const readTLV = () => {
      const tag = buf[p++];
      let len = buf[p++];
      if (len & 128) {
        const n = len & 127;
        len = 0;
        for (let i = 0; i < n; i++) len = len << 8 | buf[p++];
      }
      const start = p;
      p += len;
      return { tag, start, len, end: p };
    };
    const outer = readTLV();
    p = outer.start;
    const tbs = readTLV();
    p = tbs.start;
    const first = readTLV();
    if (first.tag === 160) {
    } else p = first.start;
    readTLV();
    readTLV();
    readTLV();
    const validity = readTLV();
    p = validity.start;
    readTLV();
    const notAfter = readTLV();
    const s = new TextDecoder().decode(buf.slice(notAfter.start, notAfter.end));
    let year, mm, dd, hh, mi, ss;
    if (notAfter.tag === 23) {
      year = parseInt(s.slice(0, 2), 10);
      year += year < 50 ? 2e3 : 1900;
      mm = parseInt(s.slice(2, 4), 10);
      dd = parseInt(s.slice(4, 6), 10);
      hh = parseInt(s.slice(6, 8), 10);
      mi = parseInt(s.slice(8, 10), 10);
      ss = parseInt(s.slice(10, 12), 10);
    } else {
      year = parseInt(s.slice(0, 4), 10);
      mm = parseInt(s.slice(4, 6), 10);
      dd = parseInt(s.slice(6, 8), 10);
      hh = parseInt(s.slice(8, 10), 10);
      mi = parseInt(s.slice(10, 12), 10);
      ss = parseInt(s.slice(12, 14), 10);
    }
    return Math.floor(Date.UTC(year, mm - 1, dd, hh, mi, ss) / 1e3);
  } catch {
    return null;
  }
}
function renewTriggerTs(expiresAt, policy) {
  if (!policy || policy === "manual") return null;
  const MIN_BUFFER = 2 * 86400;
  const clamp = (t) => Math.min(t, expiresAt - MIN_BUFFER);
  if (policy.startsWith("days:")) {
    const n = parseInt(policy.slice(5), 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    return clamp(expiresAt - n * 86400);
  }
  const d = new Date(expiresAt * 1e3);
  if (policy === "first_of_month") {
    return clamp(Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1e3));
  }
  if (policy === "last_of_prev_month") {
    return clamp(Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0) / 1e3));
  }
  if (policy === "sunday_of_week") {
    const day = d.getUTCDay();
    return clamp(Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) / 1e3));
  }
  if (policy === "monday_of_week") {
    const day = d.getUTCDay();
    const offset = (day + 6) % 7;
    return clamp(Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offset) / 1e3));
  }
  return null;
}
async function scanAndCreateRenewals(env) {
  const t = now();
  const rows = await env.DATA.prepare(
    `SELECT c.id, c.conf_id, c.expires_at, s.auto_renew_policy, s.primary_acme_directory_name,
            EXISTS (SELECT 1 FROM acme_accounts a WHERE a.directory_name = s.primary_acme_directory_name AND a.kid IS NOT NULL) AS has_account
       FROM certs c JOIN cert_confs s ON s.id = c.conf_id
      WHERE s.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM jobs j WHERE j.conf_id = c.conf_id
            AND j.state NOT IN ('done','failed')
        )`
  ).all();
  let created = 0;
  for (const c of rows.results || []) {
    const trigger = renewTriggerTs(c.expires_at, c.auto_renew_policy);
    if (trigger == null || trigger > t) continue;
    if (!c.has_account) continue;
    await env.DATA.prepare(
      `INSERT INTO jobs (conf_id, acme_directory_name, acme_account_attempt_index, state, next_tick_at, created_at, updated_at)
       VALUES (?, ?, 0, 'new', ?, ?, ?)`
    ).bind(c.conf_id, c.primary_acme_directory_name, t, t, t).run();
    created++;
  }
  return created;
}
async function ensureZeroSslAccount(env) {
  const caName = "ZeroSSL";
  const pre = await env.DATA.prepare("SELECT id, kid FROM acme_accounts WHERE directory_name = ?").bind(caName).first();
  if (pre && pre.kid) return pre.id;
  if (!env.ZEK || !env.ZEH) {
    throw new Error("ZEK / ZEH secrets not configured \u2014 set them in Worker Settings > Variables and redeploy");
  }
  const attempt = async () => {
    const existing = await env.DATA.prepare("SELECT id, kid FROM acme_accounts WHERE directory_name = ?").bind(caName).first();
    if (existing && existing.kid) return existing.id;
    const kp = await generateEcKeyPair();
    const jwkEnc = await aesEncrypt(env, JSON.stringify(kp.privateJwk));
    const confEnc = await aesEncrypt(env, JSON.stringify({
      eab_kid: env.ZEK,
      eab_hmac: env.ZEH
    }));
    let id;
    if (existing) {
      id = existing.id;
      await env.DATA.prepare(
        `UPDATE acme_accounts SET jwk_encrypted = ?, kid = NULL, conf = ? WHERE id = ?`
      ).bind(jwkEnc, confEnc, id).run();
    } else {
      const ins = await env.DATA.prepare(
        `INSERT INTO acme_accounts (directory_name, jwk_encrypted, conf, created_at) VALUES (?,?,?,?)`
      ).bind(caName, jwkEnc, confEnc, now()).run();
      id = ins.meta.last_row_id;
    }
    const loaded = await loadAcmeAccount(env, caName);
    const acmeDir = await acmeFetchDirectory(loaded.directoryUrl);
    await ensureAcmeKid(env, loaded, acmeDir);
    return id;
  };
  let lastErr;
  let delay = 1e3;
  for (let i = 0; i < 5; i++) {
    try {
      return await attempt();
    } catch (e) {
      lastErr = e;
      console.warn(`ZeroSSL bootstrap attempt ${i + 1}/5 failed:`, e.message || e);
    }
    if (i < 4) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 8e3);
    }
  }
  throw new Error(
    `ZeroSSL bootstrap failed after 5 attempts \u2014 last error: ${lastErr?.message || lastErr}. Verify ZEK and ZEH secrets in Worker Settings > Variables.`
  );
}

async function apiIssueConf(env, confId) {
  const conf = await env.DATA.prepare("SELECT * FROM cert_confs WHERE id = ? AND deleted_at IS NULL").bind(confId).first();
  if (!conf) return json({ error: "certificate not found" }, 404);
  const existing = await env.DATA.prepare(
    `SELECT id FROM jobs WHERE conf_id = ? AND state NOT IN ('done','failed')
       ORDER BY id DESC LIMIT 1`
  ).bind(confId).first();
  if (existing) return json({ ok: true, jobId: existing.id, reused: true });
  const acct = await env.DATA.prepare(
    "SELECT 1 FROM acme_accounts WHERE directory_name = ? AND kid IS NOT NULL"
  ).bind(conf.primary_acme_directory_name).first();
  if (!acct) return json({ error: `no CA account registered for ${conf.primary_acme_directory_name}` }, 400);
  const t = now();
  const r = await env.DATA.prepare(
    `INSERT INTO jobs (conf_id, acme_directory_name, acme_account_attempt_index, state, next_tick_at, created_at, updated_at)
     VALUES (?, ?, 0, 'new', ?, ?, ?)`
  ).bind(conf.id, conf.primary_acme_directory_name, t, t, t).run();
  return json({ ok: true, jobId: r.meta.last_row_id });
}
async function apiStatus(env) {
  const confs = (await env.DATA.prepare(
    `SELECT s.*, s.primary_acme_directory_name AS primary_ca,
            COALESCE(
              (SELECT c.acme_directory_name FROM certs c
                WHERE c.conf_id = s.id
                ORDER BY c.id DESC LIMIT 1),
              s.primary_acme_directory_name
            ) AS effective_ca,
            (SELECT c.key_type FROM certs c WHERE c.conf_id = s.id
              ORDER BY c.id DESC LIMIT 1) AS effective_key_type,
            (SELECT c.domains_json FROM certs c WHERE c.conf_id = s.id
              ORDER BY c.id DESC LIMIT 1) AS effective_domains_json,
            (SELECT COUNT(*) FROM certs WHERE conf_id = s.id) AS cert_count,
            MAX(
              s.created_at,
              COALESCE(s.updated_at, 0),
              COALESCE((SELECT MAX(issued_at)  FROM certs WHERE conf_id = s.id), 0),
              COALESCE((SELECT MAX(revoked_at) FROM certs WHERE conf_id = s.id), 0)
            ) AS last_op_at
       FROM cert_confs s
      WHERE s.deleted_at IS NULL
       ORDER BY last_op_at DESC, s.id DESC`
  ).all()).results || [];
  const certs = (await env.DATA.prepare(
    `SELECT id, conf_id, expires_at, issued_at, acme_directory_name, revoked_at
       FROM certs
      WHERE id IN (SELECT MAX(id) FROM certs GROUP BY conf_id)
        AND conf_id IN (SELECT id FROM cert_confs WHERE deleted_at IS NULL)`
  ).all()).results || [];
  const jobs = (await env.DATA.prepare(
    `SELECT * FROM jobs WHERE state NOT IN ('done','failed') ORDER BY updated_at DESC LIMIT 20`
  ).all()).results || [];
  const recent = (await env.DATA.prepare(
    "SELECT * FROM jobs ORDER BY id DESC LIMIT 10"
  ).all()).results || [];
  return json({ now: now(), confs, certs, activeJobs: jobs, recentJobs: recent });
}
async function apiJobLog(env, jobId) {
  const job = await env.DATA.prepare("SELECT * FROM jobs WHERE id = ?").bind(jobId).first();
  if (!job) return json({ error: "job not found" }, 404);
  const logs = (await env.DATA.prepare(
    "SELECT ts, level, message FROM job_logs WHERE job_id = ? ORDER BY id DESC LIMIT 200"
  ).bind(jobId).all()).results || [];
  return json({ job, logs });
}

function maskCredentials(type, obj) {
  if (!obj) return {};
  if (type === "cloudflare") {
    const tok = String(obj.api_token || "");
    return { api_token: tok.length > 8 ? tok.slice(0, 4) + "\u2026" + tok.slice(-4) : "\u2026" };
  }
  if (type === "dnspod") {
    const sid = String(obj.secret_id || "");
    return { secret_id: sid.length > 8 ? sid.slice(0, 6) + "\u2026" + sid.slice(-3) : "\u2026", secret_key: "\u2026" };
  }
  return Object.keys(obj).reduce((acc, k) => {
    acc[k] = "\u2026";
    return acc;
  }, {});
}
async function apiListDnsAccounts(env) {
  const rows = (await env.DATA.prepare(
    `SELECT id, type, credentials_encrypted, created_at, zones_cache_json, probe_error, zones_probed_at
       FROM dns_accounts ORDER BY id`
  ).all()).results || [];
  const out = [];
  for (const r of rows) {
    let preview = {};
    try {
      preview = maskCredentials(r.type, JSON.parse(await aesDecrypt(env, r.credentials_encrypted)));
    } catch {
    }
    let zones = [];
    try {
      zones = JSON.parse(r.zones_cache_json || "[]");
    } catch {
    }
    const enabled = zones.filter((z) => z.enabled && z.authoritative !== false).length;
    const authoritative = zones.filter((z) => z.authoritative !== false).length;
    out.push({
      id: r.id,
      type: r.type,
      created_at: r.created_at,
      preview,
      zones,
      zones_enabled: enabled,
      zones_total: authoritative,
      zones_all: zones.length,
      probe_error: r.probe_error || null,
      zones_probed_at: r.zones_probed_at || null
    });
  }
  return json(out);
}
async function queryZoneNs(zone) {
  try {
    const r = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(zone)}&type=NS`,
      { headers: { "Accept": "application/dns-json" } }
    );
    const j = await r.json().catch(() => ({}));
    return (j.Answer || []).filter((a) => a.type === 2).map((a) => (a.data || "").toLowerCase().replace(/\.$/, ""));
  } catch {
    return [];
  }
}
function isAuthoritativeFor(type, nsList) {
  if (!nsList || nsList.length === 0) return false;
  if (type === "cloudflare") return nsList.some((ns) => ns.endsWith(".ns.cloudflare.com"));
  if (type === "dnspod") return nsList.some((ns) => /(\.|^)dnspod\.(net|com|cn)$/.test(ns));
  return true;
}
async function probeAndStoreZones(env, accountId, type, credentials) {
  try {
    const zoneNames = await providerListZones(type, credentials);
    const nsResults = await Promise.all(zoneNames.map((z) => queryZoneNs(z)));
    const zones = zoneNames.map((z, i) => {
      const auth = isAuthoritativeFor(type, nsResults[i]);
      return { zone: z, enabled: auth, authoritative: auth, ns: nsResults[i] };
    });
    await env.DATA.prepare(
      "UPDATE dns_accounts SET zones_cache_json = ?, probe_error = NULL, zones_probed_at = ? WHERE id = ?"
    ).bind(JSON.stringify(zones), now(), accountId).run();
    return { ok: true, zones };
  } catch (e) {
    await env.DATA.prepare(
      "UPDATE dns_accounts SET zones_cache_json = ?, probe_error = ?, zones_probed_at = ? WHERE id = ?"
    ).bind("[]", e.message || String(e), now(), accountId).run();
    return { ok: false, error: e.message || String(e) };
  }
}
function canonicalJson(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}
async function apiCreateDnsAccount(env, body) {
  if (!body.type || !body.credentials) return json({ error: "type/credentials required" }, 400);
  const newHash = b64uEncode(await sha256(canonicalJson(body.credentials)));
  const peers = (await env.DATA.prepare(
    "SELECT id, credentials_encrypted FROM dns_accounts WHERE type = ?"
  ).bind(body.type).all()).results || [];
  for (const p of peers) {
    try {
      const existing = JSON.parse(await aesDecrypt(env, p.credentials_encrypted));
      const existingHash = b64uEncode(await sha256(canonicalJson(existing)));
      if (existingHash === newHash) {
        return json({ error: "These credentials are already added." }, 409);
      }
    } catch {
    }
  }
  const enc2 = await aesEncrypt(env, JSON.stringify(body.credentials));
  const r = await env.DATA.prepare(
    "INSERT INTO dns_accounts (type, credentials_encrypted, created_at) VALUES (?,?,?)"
  ).bind(body.type, enc2, now()).run();
  const id = r.meta.last_row_id;
  const probe = await probeAndStoreZones(env, id, body.type, body.credentials);
  if (!probe.ok) {
    await env.DATA.prepare("DELETE FROM dns_accounts WHERE id = ?").bind(id).run();
    return json({ error: "Probe failed: " + probe.error }, 400);
  }
  return json({ id, probe });
}
async function apiRefreshDnsAccount(env, id) {
  const row = await env.DATA.prepare("SELECT type, credentials_encrypted FROM dns_accounts WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "not found" }, 404);
  const creds = JSON.parse(await aesDecrypt(env, row.credentials_encrypted));
  const before = await env.DATA.prepare("SELECT zones_cache_json FROM dns_accounts WHERE id = ?").bind(id).first();
  let prevMap = {};
  try {
    JSON.parse(before.zones_cache_json || "[]").forEach((z) => {
      prevMap[z.zone] = z.enabled;
    });
  } catch {
  }
  const probe = await probeAndStoreZones(env, id, row.type, creds);
  if (probe.ok) {
    const merged = probe.zones.map((z) => {
      const prev = prevMap[z.zone];
      const desired = prev !== void 0 ? !!prev : z.authoritative !== false;
      return { ...z, enabled: z.authoritative === false ? false : desired };
    });
    await env.DATA.prepare("UPDATE dns_accounts SET zones_cache_json = ? WHERE id = ?").bind(JSON.stringify(merged), id).run();
  }
  return json(probe);
}
async function apiToggleZone(env, id, zone, enabled) {
  const row = await env.DATA.prepare("SELECT zones_cache_json FROM dns_accounts WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "not found" }, 404);
  let zones = [];
  try {
    zones = JSON.parse(row.zones_cache_json || "[]");
  } catch {
  }
  zones = zones.map((z) => z.zone === zone ? { ...z, enabled: z.authoritative === false ? false : !!enabled } : z);
  await env.DATA.prepare("UPDATE dns_accounts SET zones_cache_json = ? WHERE id = ?").bind(JSON.stringify(zones), id).run();
  return json({ ok: true });
}
async function apiBulkToggleZones(env, id, enabled) {
  const row = await env.DATA.prepare("SELECT zones_cache_json FROM dns_accounts WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "not found" }, 404);
  let zones = [];
  try {
    zones = JSON.parse(row.zones_cache_json || "[]");
  } catch {
  }
  zones = zones.map((z) => z.authoritative === false ? z : { ...z, enabled: !!enabled });
  await env.DATA.prepare("UPDATE dns_accounts SET zones_cache_json = ? WHERE id = ?").bind(JSON.stringify(zones), id).run();
  return json({ ok: true });
}
async function apiUpdateDnsAccount(env, id, body) {
  if (!body.credentials) return json({ error: "nothing to update" }, 400);
  const enc2 = await aesEncrypt(env, JSON.stringify(body.credentials));
  await env.DATA.prepare("UPDATE dns_accounts SET credentials_encrypted = ? WHERE id = ?").bind(enc2, id).run();
  return json({ ok: true });
}
async function apiDeleteDnsAccount(env, id) {
  await env.DATA.prepare("DELETE FROM dns_accounts WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
async function apiListZones(env) {
  const rows = (await env.DATA.prepare(
    `SELECT z.zone, z.dns_account_id, a.type
       FROM zones z JOIN dns_accounts a ON a.id = z.dns_account_id ORDER BY z.zone`
  ).all()).results || [];
  return json(rows);
}
async function apiUpsertZone(env, body) {
  if (!body.zone || !body.dns_account_id) return json({ error: "zone/dns_account_id required" }, 400);
  await env.DATA.prepare("INSERT OR REPLACE INTO zones (zone, dns_account_id) VALUES (?, ?)").bind(body.zone, body.dns_account_id).run();
  return json({ ok: true });
}
async function apiDeleteZone(env, zone) {
  await env.DATA.prepare("DELETE FROM zones WHERE zone = ?").bind(zone).run();
  return json({ ok: true });
}
async function apiListAcmeDirectories() {
  const rows = Object.entries(ACME_DIRECTORIES).map(([name, d]) => ({
    name,
    directory_url: d.url,
    eab_required: d.eab
  }));
  return json(rows);
}
async function apiListAcmeAccounts(env) {
  await ensureZeroSslAccount(env);
  const rows = (await env.DATA.prepare(
    `SELECT id, directory_name, kid, created_at FROM acme_accounts ORDER BY id`
  ).all()).results || [];
  const kept = rows.filter((r) => ACME_DIRECTORIES[r.directory_name]);
  for (const r of kept) {
    r.eab_required = ACME_DIRECTORIES[r.directory_name].eab;
  }
  return json(kept);
}
function randHex(n) {
  const b = new Uint8Array(n / 2);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
async function apiCreateAcmeAccount(env, body) {
  if (!body.directory_name || !ACME_DIRECTORIES[body.directory_name]) {
    return json({ error: "directory_name required (must be a known CA)" }, 400);
  }
  const kp = await generateEcKeyPair();
  const jwkEnc = await aesEncrypt(env, JSON.stringify(kp.privateJwk));
  const saStr = body.gcp_sa_json ? typeof body.gcp_sa_json === "string" ? body.gcp_sa_json : JSON.stringify(body.gcp_sa_json) : null;
  const confObj = {};
  if (body.eab_kid) confObj.eab_kid = body.eab_kid;
  if (body.eab_hmac) confObj.eab_hmac = body.eab_hmac;
  if (saStr) confObj.gcp_sa_json = saStr;
  const confEnc = Object.keys(confObj).length ? await aesEncrypt(env, JSON.stringify(confObj)) : null;
  const existing = await env.DATA.prepare(
    "SELECT id, kid FROM acme_accounts WHERE directory_name = ?"
  ).bind(body.directory_name).first();
  const prev = existing ? await env.DATA.prepare("SELECT * FROM acme_accounts WHERE id = ?").bind(existing.id).first() : null;
  let id;
  if (existing) {
    id = existing.id;
    await env.DATA.prepare(
      `UPDATE acme_accounts SET jwk_encrypted = ?, kid = NULL, conf = ? WHERE id = ?`
    ).bind(jwkEnc, confEnc, id).run();
  } else {
    const ins = await env.DATA.prepare(
      `INSERT INTO acme_accounts (directory_name, jwk_encrypted, conf, created_at) VALUES (?,?,?,?)`
    ).bind(body.directory_name, jwkEnc, confEnc, now()).run();
    id = ins.meta.last_row_id;
  }
  try {
    const loaded = await loadAcmeAccount(env, body.directory_name);
    const dir = await acmeFetchDirectory(loaded.directoryUrl);
    await ensureAcmeKid(env, loaded, dir);
    if (body.eab_hmac) {
      const remaining = { ...confObj };
      delete remaining.eab_hmac;
      const newConfEnc = Object.keys(remaining).length ? await aesEncrypt(env, JSON.stringify(remaining)) : null;
      await env.DATA.prepare("UPDATE acme_accounts SET conf = ? WHERE id = ?").bind(newConfEnc, id).run();
    }
    return json({ id, kid: loaded.kid });
  } catch (e) {
    if (existing && prev) {
      await env.DATA.prepare(
        `UPDATE acme_accounts SET jwk_encrypted=?, kid=?, conf=? WHERE id=?`
      ).bind(prev.jwk_encrypted, prev.kid, prev.conf, id).run();
    } else {
      await env.DATA.prepare("DELETE FROM acme_accounts WHERE id = ?").bind(id).run();
    }
    return json({ error: "Registration failed: " + (e.message || String(e)) }, 400);
  }
}
async function apiDeleteAcmeAccount(env, id) {
  const a = await env.DATA.prepare(
    `SELECT id, directory_name FROM acme_accounts WHERE id = ?`
  ).bind(id).first();
  if (!a) return json({ error: "not found" }, 404);
  if ((a.directory_name || "").toLowerCase().includes("zerossl")) {
    return json({ error: "ZeroSSL is managed automatically and cannot be removed." }, 400);
  }
  await env.DATA.prepare(
    `UPDATE cert_confs SET primary_acme_directory_name = ?
      WHERE deleted_at IS NULL
        AND id IN (
          SELECT conf_id FROM certs
           WHERE acme_directory_name = ?
             AND id IN (SELECT MAX(id) FROM certs GROUP BY conf_id)
        )`
  ).bind("ZeroSSL", a.directory_name).run();
  await env.DATA.prepare(
    `UPDATE acme_accounts SET kid = NULL, conf = NULL WHERE id = ?`
  ).bind(id).run();
  return json({ ok: true });
}
async function apiListCertConfs(env) {
  const rows = (await env.DATA.prepare(
    `SELECT s.*, s.primary_acme_directory_name AS primary_ca,
            (SELECT COUNT(*) FROM certs WHERE conf_id = s.id) AS cert_count,
            (SELECT MAX(expires_at) FROM certs WHERE conf_id = s.id) AS latest_expires_at
       FROM cert_confs s
      WHERE s.deleted_at IS NULL
       ORDER BY s.id`
  ).all()).results || [];
  return json(rows);
}
var VALID_RENEW_POLICIES = /* @__PURE__ */ new Set(["manual", "days:30", "days:15", "days:7", "days:3", "last_of_prev_month", "first_of_month", "sunday_of_week", "monday_of_week"]);
var VALID_KEY_TYPES = /* @__PURE__ */ new Set(["ec256", "ec384", "rsa2048", "rsa3072", "rsa4096"]);
async function apiCreateCertConf(env, body) {
  if (!body.domains || !body.primary_acme_directory_name) {
    return json({ error: "domains and CA are required" }, 400);
  }
  if (!ACME_DIRECTORIES[body.primary_acme_directory_name]) {
    return json({ error: `unknown CA: ${body.primary_acme_directory_name}` }, 400);
  }
  const v = normalizeAndValidateDomains(body.domains);
  if (v.error) return json({ error: v.error }, 400);
  if (!body.name || !body.name.trim()) body.name = `cert-${randHex(8)}`;
  const policy = VALID_RENEW_POLICIES.has(body.auto_renew_policy) ? body.auto_renew_policy : "manual";
  const keyType = VALID_KEY_TYPES.has(body.key_type) ? body.key_type : "ec256";
  try {
    const r = await env.DATA.prepare(
      `INSERT INTO cert_confs (name, domains_json, primary_acme_directory_name, auto_renew_policy, key_type, created_at)
       VALUES (?,?,?,?,?,?)`
    ).bind(
      body.name,
      JSON.stringify(v.domains),
      body.primary_acme_directory_name,
      policy,
      keyType,
      now()
    ).run();
    return json({ id: r.meta.last_row_id });
  } catch (e) {
    if (/UNIQUE constraint failed: cert_confs\.name/i.test(e.message || "")) {
      return json({ error: `Name "${body.name}" already in use` }, 409);
    }
    throw e;
  }
}
function normalizeDomain(d) {
  if (typeof d !== "string") return "";
  let s = d.trim().toLowerCase();
  if (!s) return "";
  let prefix = "";
  if (s.startsWith("*.")) {
    prefix = "*.";
    s = s.slice(2);
  }
  try {
    const u = new URL("https://" + s);
    if (!u.hostname) return "";
    return prefix + u.hostname;
  } catch {
    return "";
  }
}
function isValidDomainName(d) {
  if (typeof d !== "string") return false;
  const s = d.trim();
  if (!s || s.length > 253) return false;
  const parts = s.split(".");
  if (parts.length < 2) return false;
  const labelRe = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  for (let i = 0; i < parts.length; i++) {
    if (i === 0 && parts[i] === "*") continue;
    if (!labelRe.test(parts[i])) return false;
  }
  return true;
}
function normalizeAndValidateDomains(rawArr) {
  if (!Array.isArray(rawArr) || rawArr.length === 0) {
    return { error: "domains must be non-empty array" };
  }
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const d of rawArr) {
    const n = normalizeDomain(d);
    if (!n || !isValidDomainName(n)) return { error: `invalid domain: ${d}` };
    if (seen.has(n)) return { error: `duplicate domain: ${n}` };
    seen.add(n);
    out.push(n);
  }
  return { domains: out };
}
async function apiUpdateCertConf(env, id, body) {
  if (!body || typeof body !== "object") return json({ error: "body required" }, 400);
  const current = await env.DATA.prepare("SELECT id FROM cert_confs WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!current) return json({ error: "not found" }, 404);
  const sets = [], params = [];
  if ("name" in body) {
    const name = String(body.name || "").trim();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(name))
      return json({ error: "invalid name (letters, digits, and dashes only; 1-63 chars)" }, 400);
    sets.push("name = ?");
    params.push(name);
  }
  if ("primary_acme_directory_name" in body) {
    const name = String(body.primary_acme_directory_name || "");
    if (!ACME_DIRECTORIES[name]) return json({ error: `unknown CA: ${name}` }, 400);
    sets.push("primary_acme_directory_name = ?");
    params.push(name);
  }
  if ("key_type" in body) {
    if (!VALID_KEY_TYPES.has(body.key_type)) return json({ error: "invalid key_type" }, 400);
    sets.push("key_type = ?");
    params.push(body.key_type);
  }
  if ("domains" in body) {
    const v = normalizeAndValidateDomains(body.domains);
    if (v.error) return json({ error: v.error }, 400);
    sets.push("domains_json = ?");
    params.push(JSON.stringify(v.domains));
  }
  if ("auto_renew_policy" in body) {
    if (!VALID_RENEW_POLICIES.has(body.auto_renew_policy))
      return json({ error: "invalid auto_renew_policy" }, 400);
    sets.push("auto_renew_policy = ?");
    params.push(body.auto_renew_policy);
  }
  if (!sets.length) return json({ error: "no fields to update" }, 400);
  sets.push("updated_at = ?");
  params.push(now());
  params.push(id);
  try {
    const r = await env.DATA.prepare(`UPDATE cert_confs SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`).bind(...params).run();
    if (!r.meta.changes) return json({ error: "not found" }, 404);
    return json({ ok: true });
  } catch (e) {
    if (/UNIQUE constraint failed: cert_confs\.name/i.test(e.message || "")) {
      return json({ error: `Name "${body.name}" already in use` }, 409);
    }
    throw e;
  }
}
async function apiPurge(env, scope) {
  if (scope === "certs") {
    await env.DATA.prepare("DELETE FROM job_logs").run();
    await env.DATA.prepare("DELETE FROM jobs").run();
    await env.DATA.prepare("DELETE FROM certs").run();
    await env.DATA.prepare("DELETE FROM cert_confs").run();
  } else if (scope === "accounts") {
    await env.DATA.prepare("DELETE FROM zones").run();
    await env.DATA.prepare("DELETE FROM dns_accounts").run();
    await env.DATA.prepare("DELETE FROM acme_accounts").run();
    try {
      await ensureZeroSslAccount(env);
    } catch (e) {
      console.warn("purge: ZeroSSL rebootstrap failed:", e.message || e);
    }
    await env.DATA.prepare(
      `UPDATE cert_confs SET primary_acme_directory_name = ?
        WHERE deleted_at IS NULL AND primary_acme_directory_name != ?`
    ).bind("ZeroSSL", "ZeroSSL").run();
  } else if (scope === "all") {
    const tables = ["job_logs", "jobs", "certs", "cert_confs", "zones", "dns_accounts", "acme_accounts"];
    for (const t of tables) await env.DATA.prepare(`DROP TABLE IF EXISTS ${t}`).run();
    await ensureSchema(env);
    await ensureZeroSslAccount(env);
  } else {
    return json({ error: "unknown scope" }, 400);
  }
  return json({ ok: true });
}
async function apiDeleteCertConf(env, id) {
  const r = await env.DATA.prepare(
    "UPDATE cert_confs SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL"
  ).bind(now(), id).run();
  if (!r.meta.changes) return json({ error: "not found" }, 404);
  return json({ ok: true });
}
async function apiRevokeConf(env, confId) {
  try {
    const conf = await env.DATA.prepare(
      "SELECT id FROM cert_confs WHERE id = ? AND deleted_at IS NULL"
    ).bind(confId).first();
    if (!conf) return json({ error: "certificate not found" }, 404);
    const cert = await env.DATA.prepare(
      `SELECT * FROM certs WHERE conf_id = ? AND revoked_at IS NULL
         ORDER BY id DESC LIMIT 1`
    ).bind(confId).first();
    if (!cert) return json({ error: "no active certificate to revoke" }, 404);
    const dirDef = ACME_DIRECTORIES[cert.acme_directory_name];
    if (!dirDef) return json({ error: `unknown CA: ${cert.acme_directory_name}` }, 400);
    const dir = await acmeFetchDirectory(dirDef.url);
    const keyPem = await aesDecrypt(env, cert.key_pem_encrypted);
    try {
      await acmeRevokeCertWithCertKey(dir, cert.cert_pem, keyPem, cert.key_type || "ec256");
    } catch (e) {
      return json({ error: e.message || String(e) }, 502);
    }
    await env.DATA.prepare("UPDATE certs SET revoked_at = ? WHERE id = ?").bind(now(), cert.id).run();
    await env.DATA.prepare("UPDATE cert_confs SET auto_renew_policy = 'manual' WHERE id = ?").bind(confId).run();
    return json({ ok: true, cert_id: cert.id });
  } catch (e) {
    console.error("apiRevokeConf failed:", e);
    return json({ error: "revoke failed: " + (e.message || String(e)) }, 500);
  }
}
var CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(bytes) {
  let c = 4294967295;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function buildZipStore(files) {
  const te = new TextEncoder();
  const parts = [];
  const cd = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = te.encode(f.name);
    const size = f.data.length;
    const c = crc32(f.data);
    const lfh = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(lfh.buffer);
    dv.setUint32(0, 67324752, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 33, true);
    dv.setUint32(14, c, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    lfh.set(nameBytes, 30);
    parts.push(lfh);
    parts.push(f.data);
    const cdh = new Uint8Array(46 + nameBytes.length);
    const dv2 = new DataView(cdh.buffer);
    dv2.setUint32(0, 33639248, true);
    dv2.setUint16(4, 20, true);
    dv2.setUint16(6, 20, true);
    dv2.setUint16(8, 0, true);
    dv2.setUint16(10, 0, true);
    dv2.setUint16(12, 0, true);
    dv2.setUint16(14, 33, true);
    dv2.setUint32(16, c, true);
    dv2.setUint32(20, size, true);
    dv2.setUint32(24, size, true);
    dv2.setUint16(28, nameBytes.length, true);
    dv2.setUint32(42, offset, true);
    cdh.set(nameBytes, 46);
    cd.push(cdh);
    offset += lfh.length + f.data.length;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const h of cd) {
    parts.push(h);
    cdSize += h.length;
  }
  const eocd = new Uint8Array(22);
  const dv3 = new DataView(eocd.buffer);
  dv3.setUint32(0, 101010256, true);
  dv3.setUint16(8, cd.length, true);
  dv3.setUint16(10, cd.length, true);
  dv3.setUint32(12, cdSize, true);
  dv3.setUint32(16, cdStart, true);
  parts.push(eocd);
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function tarHeader(name, size) {
  if (name.length > 100) throw new Error("tar: filename too long");
  const hdr = new Uint8Array(512);
  const te = new TextEncoder();
  hdr.set(te.encode(name), 0);
  hdr.set(te.encode("0000644\0"), 100);
  hdr.set(te.encode("0000000\0"), 108);
  hdr.set(te.encode("0000000\0"), 116);
  hdr.set(te.encode(size.toString(8).padStart(11, "0") + "\0"), 124);
  hdr.set(te.encode(Math.floor(Date.now() / 1e3).toString(8).padStart(11, "0") + "\0"), 136);
  for (let i = 148; i < 156; i++) hdr[i] = 32;
  hdr[156] = 48;
  hdr.set(te.encode("ustar\0"), 257);
  hdr.set(te.encode("00"), 263);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += hdr[i];
  hdr.set(te.encode(sum.toString(8).padStart(6, "0") + "\0 "), 148);
  return hdr;
}
async function buildTarGz(files) {
  const parts = [];
  for (const f of files) {
    parts.push(tarHeader(f.name, f.data.length));
    parts.push(f.data);
    const pad = (512 - f.data.length % 512) % 512;
    if (pad) parts.push(new Uint8Array(pad));
  }
  parts.push(new Uint8Array(1024));
  let total = 0;
  for (const p of parts) total += p.length;
  const tar = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    tar.set(p, o);
    o += p.length;
  }
  const gz = new Response(tar).body.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(gz).arrayBuffer());
}
async function apiDownloadCert(env, certId, fmt) {
  const row = await env.DATA.prepare(
    "SELECT c.*, s.name AS conf_name FROM certs c JOIN cert_confs s ON s.id = c.conf_id WHERE c.id = ? AND s.deleted_at IS NULL"
  ).bind(certId).first();
  if (!row) return new Response("Not found", { status: 404 });
  const keyPem = await aesDecrypt(env, row.key_pem_encrypted);
  const rawLabel = row.conf_name || `cert-${certId}`;
  const label = rawLabel.replace(/[^a-zA-Z0-9._-]+/g, "_") || `cert-${certId}`;
  const te = new TextEncoder();
  const files = [
    { name: `${label}-fullchain.pem`, data: te.encode(row.cert_pem + row.chain_pem) },
    { name: `${label}-cert.pem`, data: te.encode(row.cert_pem) },
    { name: `${label}-interm.pem`, data: te.encode(row.chain_pem) },
    { name: `${label}-key.pem`, data: te.encode(keyPem) }
  ];
  if (fmt === "tar.gz") {
    const data = await buildTarGz(files);
    return new Response(data, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${label}.tar.gz"`
      }
    });
  }
  const zip = buildZipStore(files);
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${label}.zip"`
    }
  });
}
async function apiViewCert(env, certId) {
  const row = await env.DATA.prepare(
    `SELECT c.* FROM certs c
       JOIN cert_confs s ON s.id = c.conf_id
      WHERE c.id = ? AND s.deleted_at IS NULL`
  ).bind(certId).first();
  if (!row) return json({ error: "Not found" }, 404);
  const keyPem = await aesDecrypt(env, row.key_pem_encrypted);
  let domains = [];
  try {
    domains = JSON.parse(row.domains_json || "[]");
  } catch {
  }
  return json({
    cert: row.cert_pem,
    chain: row.chain_pem,
    privkey: keyPem,
    domains,
    ca: row.acme_directory_name || null,
    keyType: row.key_type || null
  });
}

var lockModule = makeLockModule({
  cookieName: "mxsl_auth",
  hashPrefix: "mxsl:",
  unlockPath: "/unlock",
  appName: "MixSSL",
  errorCode: "Unauthorized",
  lockPageHtml: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MixSSL</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z'/%3E%3C/svg%3E">
<style>
/* dev/common/lock/view-gradient.css
 * Bold gradient lock-screen styling \u2014 purple body backdrop, blue\u2192cyan
 * gradient button, no auto dark-mode. Counterpart to view-minimal.css;
 * apps select via assembleLockPage({ themeStyle: 'gradient' }).
 *
 * Selectors mirror view.html exactly so the same lock page HTML renders
 * either style; only colors / shadow / radii differ from view-minimal.
 */

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: linear-gradient(135deg, #667eea, #764ba2);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.lock-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .2);
  padding: 36px 32px;
  width: 100%;
  max-width: 380px;
  text-align: center;
}

.lock-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  background: linear-gradient(135deg, #3b82f6, #06b6d4);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.lock-card h1 {
  font-size: 1.3rem;
  margin-bottom: 8px;
  color: #1e293b;
}

.lock-card p {
  color: #64748b;
  font-size: .9rem;
  margin-bottom: 20px;
}

.lock-card input[type=password] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: .95rem;
  outline: none;
  transition: border-color .2s;
  font-family: inherit;
}

.lock-card input[type=password]:focus {
  border-color: #3b82f6;
}

.remember {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 14px 0;
  font-size: .85rem;
  color: #475569;
  user-select: none;
  cursor: pointer;
}

.remember input[type=checkbox] {
  cursor: pointer;
  accent-color: #3b82f6;
}

.lock-card button[type=submit] {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #2563eb, #06b6d4);
  color: #fff;
  font-size: .95rem;
  font-weight: 600;
  cursor: pointer;
  transition: filter .2s, box-shadow .2s;
  font-family: inherit;
}

.lock-card button[type=submit]:hover {
  filter: brightness(1.05);
  box-shadow: 0 4px 16px rgba(37, 99, 235, .3);
}

.lock-card button[type=submit]:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.lock-err {
  color: #dc2626;
  font-size: .82rem;
  margin-top: 12px;
  min-height: 1.2em;
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
  <h1 id="lockTitle">MixSSL</h1>
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
<script>window.LOCK_CONFIG={"unlockPath":"/unlock","appNameI18n":{"en":"MixSSL","eo":"MixSSL","fr":"MixSSL","de":"MixSSL","es":"MixSSL","it":"MixSSL","nl":"MixSSL","da":"MixSSL","zh-cn":"\u6DF7\u642D\u8BC1\u4E66","zh-tw":"\u6DF7\u642D\u6191\u8B49","ja":"MixSSL","ko":"MixSSL","ms":"MixSSL","vi":"MixSSL","th":"MixSSL","ta":"MixSSL","my":"MixSSL","uk":"MixSSL","he":"MixSSL","ar":"MixSSL"}};</script><script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/lock/client.min.js"></script>
</body></html>
`
});
function handleLogout() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${lockModule.cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
    }
  });
}
var schemaReady = false;
var index_default = {
  async fetch(request, env, _ctx) {
    if (!schemaReady) {
      try {
        await ensureSchema(env);
        await ensureZeroSslAccount(env);
        schemaReady = true;
      } catch (e) {
        return new Response("Schema init failed: " + (e.message || e), { status: 500 });
      }
    }
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    if (method === "POST" && path === "/unlock") return lockModule.handleUnlock(request, env);
    if (method === "POST" && path === "/logout") return handleLogout();
    const authed = await lockModule.isAuthorized(request, env);
    if (!authed) {
      if (method === "GET" && (path === "/" || path.startsWith("/index"))) {
        return lockModule.renderLockPage(selectJsdelivrCdnHost(request));
      }
      return json({ error: lockModule.errorCode }, 401);
    }
    try {
      await ensureSchema(env);
      await ensureZeroSslAccount(env);
    } catch (e) {
      return json({ error: "Schema init failed: " + (e.message || String(e)) }, 500);
    }
    if (method === "GET" && path === "/") {
      const cdnHost = selectJsdelivrCdnHost(request);
      const themeCookie = getCookie(request, "theme");
      const theme = themeCookie === "dark" ? "dark" : "light";
      const langCookie = getCookie(request, "lang");
      const lang = langCookie && SUPPORTED_LANGS_DEFAULT.includes(langCookie) ? langCookie : detectLangFromAcceptLanguage(request.headers.get("Accept-Language") || "", SUPPORTED_LANGS_DEFAULT);
      const body = main_default.replace(/\{\{CDN_HOST\}\}/g, cdnHost).replace(/\{\{THEME\}\}/g, theme).replace(/\{\{LANG\}\}/g, lang);
      return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (method === "POST" && path === "/api/prefs") {
      return handlePrefs(request);
    }
    if (method === "GET" && path === "/api/_debug/csr") {
      const domains = (url.searchParams.get("domains") || "example.com").split(",");
      const kp = await generateEcKeyPair();
      const csrDer = await buildCsrEcdsa(domains, kp.privateKey, kp.publicJwk);
      const keyPem = await ecPrivateKeyToPkcs8Pem(kp.privateKey);
      const csrPem = toPem("CERTIFICATE REQUEST", csrDer);
      return new Response(keyPem + csrPem, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (method === "GET" && path === "/api/_debug/directory") {
      const u = url.searchParams.get("url");
      if (!u) return json({ ok: false, error: "url query param required" }, 400);
      try {
        const dir = await acmeFetchDirectory(u);
        const nonce = await acmeNewNonce(dir);
        return json({ ok: true, dir, nonce_sample_len: nonce.length });
      } catch (e) {
        return json({ ok: false, error: e.message || String(e) }, 500);
      }
    }
    if (method === "GET" && path === "/api/_debug/newaccount") {
      const u = url.searchParams.get("url");
      if (!u) return json({ ok: false, error: "url query param required" }, 400);
      try {
        const dir = await acmeFetchDirectory(u);
        const kp = await generateEcKeyPair();
        const account = { privateKey: kp.privateKey, publicJwk: kp.publicJwk, kid: null, nonce: null };
        const contactParam = url.searchParams.get("contact") || "mailto:test@gb.net";
        const eabKid = url.searchParams.get("eab_kid");
        const eabHmac = url.searchParams.get("eab_hmac");
        let eab = null;
        if (eabKid && eabHmac) {
          eab = await buildEab(eabKid, eabHmac, kp.publicJwk, dir.newAccount);
        }
        const kid = await acmeNewAccount(dir, account, [contactParam], eab);
        return json({ ok: true, kid });
      } catch (e) {
        return json({ ok: false, error: e.message || String(e) }, 500);
      }
    }
    if (method === "POST" && path === "/api/_debug/dns-add") {
      const body = await request.json();
      try {
        const r = await providerAddTxt(body.type, body.credentials, body.fqdn, body.value);
        return json({ ok: true, result: r });
      } catch (e) {
        return json({ ok: false, error: e.message || String(e) }, 500);
      }
    }
    if (method === "POST" && path === "/api/_debug/dns-remove") {
      const body = await request.json();
      try {
        const r = await providerRemoveTxt(body.type, body.credentials, body.fqdn, body.value);
        return json({ ok: true, result: r });
      } catch (e) {
        return json({ ok: false, error: e.message || String(e) }, 500);
      }
    }
    if (method === "POST" && path === "/api/_debug/gts-mint") {
      const body = await request.json();
      try {
        return json({ ok: true, ...await gcpMintPublicCaEab(body.sa_json) });
      } catch (e) {
        return json({ ok: false, error: e.message || String(e) }, 500);
      }
    }
    if (method === "POST" && path === "/api/_debug/seed") {
      const b = await request.json();
      const t = now();
      const dnsMap = {};
      for (const d of b.dnsAccounts || []) {
        const enc2 = await aesEncrypt(env, JSON.stringify(d.credentials));
        const r = await env.DATA.prepare(
          "INSERT INTO dns_accounts (type, credentials_encrypted, created_at) VALUES (?,?,?)"
        ).bind(d.type, enc2, t).run();
        dnsMap[d.key] = r.meta.last_row_id;
      }
      for (const z of b.zones || []) {
        await env.DATA.prepare("INSERT OR REPLACE INTO zones (zone, dns_account_id) VALUES (?, ?)").bind(z.zone, dnsMap[z.dns_key]).run();
      }
      const acmeMap = {};
      for (const a of b.acmeAccounts || []) {
        if (!ACME_DIRECTORIES[a.directory_name]) throw new Error(`directory ${a.directory_name} not recognized`);
        const kp = await generateEcKeyPair();
        const jwkEnc = await aesEncrypt(env, JSON.stringify(kp.privateJwk));
        const confObj = {};
        if (a.eab_kid) confObj.eab_kid = a.eab_kid;
        if (a.eab_hmac) confObj.eab_hmac = a.eab_hmac;
        if (a.gcp_sa_json) confObj.gcp_sa_json = typeof a.gcp_sa_json === "string" ? a.gcp_sa_json : JSON.stringify(a.gcp_sa_json);
        const confEnc = Object.keys(confObj).length ? await aesEncrypt(env, JSON.stringify(confObj)) : null;
        const r = await env.DATA.prepare(
          `INSERT INTO acme_accounts (directory_name, jwk_encrypted, conf, created_at)
           VALUES (?,?,?,?)`
        ).bind(a.directory_name, jwkEnc, confEnc, t).run();
        acmeMap[a.directory_name] = r.meta.last_row_id;
      }
      const confMap = {};
      for (const s of b.certSpecs || []) {
        const fallbackNames = (s.fallback_acme_directories || []).filter((n) => ACME_DIRECTORIES[n]);
        const r = await env.DATA.prepare(
          `INSERT INTO cert_confs (name, domains_json, primary_acme_directory_name, fallback_acme_directory_names_json, auto_renew_policy, created_at)
           VALUES (?,?,?,?,?,?)`
        ).bind(
          s.name,
          JSON.stringify(s.domains),
          s.primary_acme_directory,
          fallbackNames.length ? JSON.stringify(fallbackNames) : null,
          s.auto_renew_policy || "days:30",
          t
        ).run();
        confMap[s.name] = r.meta.last_row_id;
      }
      return json({ ok: true, dnsMap, acmeMap, confMap });
    }
    if (method === "POST" && path === "/api/_debug/dnspod-list") {
      const body = await request.json();
      try {
        const r = await tcSignedCall(body.credentials, "DescribeDomainList", { Offset: 0, Limit: 20 });
        return json({ ok: true, domains: (r.DomainList || []).map((d) => d.Name) });
      } catch (e) {
        return json({ ok: false, error: e.message || String(e) }, 500);
      }
    }
    if (method === "GET" && path === "/api/_debug/jws") {
      const kp = await generateEcKeyPair();
      const thumb = await jwkThumbprint(kp.publicJwk);
      const jws = await jwsSignEs256(kp.privateKey, { alg: "ES256", jwk: kp.publicJwk, nonce: "test", url: "https://example.com/" }, { test: "payload" });
      const keyAuth = await keyAuthorization("sample-token", kp.publicJwk);
      const txt = await dnsChallengeTxtValue(keyAuth);
      return json({ thumbprint: thumb, jws, keyAuth, dns_txt: txt });
    }
    if (method === "GET" && path === "/api/status") return apiStatus(env);
    let m;
    if ((m = path.match(/^\/api\/cert-confs\/(\d+)\/issue$/)) && method === "POST") {
      return apiIssueConf(env, Number(m[1]));
    }
    if ((m = path.match(/^\/api\/cert-confs\/(\d+)\/renew$/)) && method === "POST") {
      return apiIssueConf(env, Number(m[1]));
    }
    if ((m = path.match(/^\/api\/jobs\/(\d+)\/log$/)) && method === "GET") {
      return apiJobLog(env, Number(m[1]));
    }
    if ((m = path.match(/^\/api\/jobs\/(\d+)\/tick$/)) && method === "POST") {
      try {
        const r = await tickJob(env, Number(m[1]));
        return json(r);
      } catch (e) {
        return json({ error: e.message || String(e) }, 500);
      }
    }
    if (method === "GET" && path === "/api/dns-accounts") return apiListDnsAccounts(env);
    if (method === "POST" && path === "/api/dns-accounts") return apiCreateDnsAccount(env, await request.json());
    if ((m = path.match(/^\/api\/dns-accounts\/(\d+)\/refresh$/)) && method === "POST") {
      return apiRefreshDnsAccount(env, Number(m[1]));
    }
    if ((m = path.match(/^\/api\/dns-accounts\/(\d+)\/zones$/)) && method === "PUT") {
      const body = await request.json();
      return apiBulkToggleZones(env, Number(m[1]), !!body.enabled);
    }
    if ((m = path.match(/^\/api\/dns-accounts\/(\d+)\/zones\/(.+)$/)) && method === "PUT") {
      const body = await request.json();
      return apiToggleZone(env, Number(m[1]), decodeURIComponent(m[2]), !!body.enabled);
    }
    if (m = path.match(/^\/api\/dns-accounts\/(\d+)$/)) {
      const id = Number(m[1]);
      if (method === "PUT" || method === "PATCH") return apiUpdateDnsAccount(env, id, await request.json());
      if (method === "DELETE") return apiDeleteDnsAccount(env, id);
    }
    if (method === "GET" && path === "/api/zones") return apiListZones(env);
    if (method === "POST" && path === "/api/zones") return apiUpsertZone(env, await request.json());
    if ((m = path.match(/^\/api\/zones\/(.+)$/)) && method === "DELETE") {
      return apiDeleteZone(env, decodeURIComponent(m[1]));
    }
    if (method === "POST" && path === "/api/_admin/purge/certs") return apiPurge(env, "certs");
    if (method === "POST" && path === "/api/_admin/purge/accounts") return apiPurge(env, "accounts");
    if (method === "POST" && path === "/api/_admin/purge/all") return apiPurge(env, "all");
    if (method === "GET" && path === "/api/acme-directories") return apiListAcmeDirectories();
    if (method === "GET" && path === "/api/acme-accounts") return apiListAcmeAccounts(env);
    if (method === "POST" && path === "/api/acme-accounts") return apiCreateAcmeAccount(env, await request.json());
    if ((m = path.match(/^\/api\/acme-accounts\/(\d+)$/)) && method === "DELETE") {
      return apiDeleteAcmeAccount(env, Number(m[1]));
    }
    if (method === "GET" && path === "/api/cert-confs") return apiListCertConfs(env);
    if (method === "POST" && path === "/api/cert-confs") return apiCreateCertConf(env, await request.json());
    if (m = path.match(/^\/api\/cert-confs\/(\d+)$/)) {
      const id = Number(m[1]);
      if (method === "PATCH" || method === "PUT") return apiUpdateCertConf(env, id, await request.json());
      if (method === "DELETE") return apiDeleteCertConf(env, id);
    }
    if ((m = path.match(/^\/api\/cert-confs\/(\d+)\/revoke$/)) && method === "POST") {
      return apiRevokeConf(env, Number(m[1]));
    }
    if ((m = path.match(/^\/api\/certs\/(\d+)\/download$/)) && method === "GET") {
      return apiDownloadCert(env, Number(m[1]), url.searchParams.get("fmt"));
    }
    if ((m = path.match(/^\/api\/certs\/(\d+)\/view$/)) && method === "GET") {
      return apiViewCert(env, Number(m[1]));
    }
    if (path.startsWith("/api/")) {
      return json({ error: "API not implemented yet", path }, 501);
    }
    return new Response("Not Found", { status: 404 });
  },
  async scheduled(event, env, _ctx) {
    try {
      await ensureSchema(env);
      await ensureZeroSslAccount(env);
    } catch (e) {
      console.error("scheduled: schema init failed (includes ZeroSSL bootstrap)", e);
      return;
    }
    const t = now();
    const due = await env.DATA.prepare(
      `SELECT id FROM jobs WHERE state NOT IN ('done','failed')
         AND next_tick_at < ? AND lease_until < ? ORDER BY next_tick_at LIMIT 10`
    ).bind(t, t).all();
    for (const row of due.results || []) {
      try {
        await tickJob(env, row.id);
      } catch (e) {
        console.error(`tick job ${row.id} failed:`, e);
      }
    }
    const cronStr = event && event.cron || "";
    if (cronStr.startsWith("0 0 ") || new Date(t * 1e3).getUTCHours() === 0 && new Date(t * 1e3).getUTCMinutes() === 0) {
      try {
        await scanAndCreateRenewals(env);
      } catch (e) {
        console.error("renewal scan failed", e);
      }
    }
  }
};
export {
  index_default as default
};
