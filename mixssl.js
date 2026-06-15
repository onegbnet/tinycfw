function isValidLock(val) {
  return typeof val === "string" && /^[\x21-\x7e]{3,64}$/.test(val);
}
async function hashToken(prefix, pw) {
  const data = new TextEncoder().encode(prefix + pw);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b2) => b2.toString(16).padStart(2, "0")).join("");
}
async function safeEqual(a, b2) {
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
    crypto.subtle.sign("HMAC", key, enc2.encode(String(b2 || "")))
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

function makeD1Binding({ driver } = {}) {
  if (!driver || typeof driver.query !== "function") {
    throw new Error("d1-adapter: makeD1Binding needs a driver with query(sql, params)");
  }
  function statement(sql, params) {
    return {
      bind(...values2) {
        return statement(sql, values2);
      },
      async run() {
        const r = await driver.query(sql, params);
        return {
          success: true,
          meta: {
            last_row_id: numify(r && r.lastInsertRowid),
            changes: numify(r && r.changes)
          }
        };
      },
      async first() {
        const r = await driver.query(sql, params);
        const rows = r && r.rows || [];
        return rows.length ? rows[0] : null;
      },
      async all() {
        const r = await driver.query(sql, params);
        return { results: r && r.rows || [] };
      }
    };
  }
  function prepare(sql) {
    return statement(sql, []);
  }
  return { prepare };
}
function numify(v) {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseConn(url) {
  const u = new URL(url);
  const raw = u.password || u.username || "";
  u.username = "";
  u.password = "";
  const base = u.toString().replace(/\/+$/, "");
  return { base, token: raw ? decodeURIComponent(raw) : "" };
}
function encodeArg(v) {
  if (v == null) return { type: "null" };
  const t = typeof v;
  if (t === "number") {
    return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  }
  if (t === "string") return { type: "text", value: v };
  if (t === "bigint") return { type: "integer", value: String(v) };
  if (t === "boolean") return { type: "integer", value: v ? "1" : "0" };
  throw new Error("d1-sqld-driver: unsupported bind value type: " + t);
}
function decodeValue(val) {
  if (!val || val.type === "null") return null;
  switch (val.type) {
    case "integer":
      return Number(val.value);
    case "float":
      return typeof val.value === "number" ? val.value : Number(val.value);
    case "text":
      return val.value;
    case "blob": {
      const bin = atob(val.base64 || "");
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return u8.buffer;
    }
    default:
      throw new Error("d1-sqld-driver: unknown Hrana value type: " + val.type);
  }
}
function makeSqldDriver(config = {}) {
  const url = typeof config === "string" ? config : config.url;
  if (!url) throw new Error("d1-sqld-driver: makeSqldDriver needs a url (the env.DATA conn string)");
  const { base, token } = parseConn(url);
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  async function query(sql, params = []) {
    const body = JSON.stringify({
      baton: null,
      requests: [
        { type: "execute", stmt: { sql, args: (params || []).map(encodeArg), want_rows: true } },
        { type: "close" }
      ]
    });
    let resp;
    try {
      resp = await fetch(base + "/v2/pipeline", { method: "POST", headers, body });
    } catch (err) {
      throw new Error("d1-sqld-driver: request failed: " + (err && err.message || err));
    }
    if (!resp.ok) {
      const text2 = await resp.text().catch(() => "");
      throw new Error("d1-sqld-driver: HTTP " + resp.status + (text2 ? " " + text2 : ""));
    }
    const out = await resp.json();
    const first = out && out.results && out.results[0];
    if (!first) throw new Error("d1-sqld-driver: empty pipeline response");
    if (first.type === "error") {
      const e = first.error || {};
      throw new Error(e.message || "d1-sqld-driver: sql error");
    }
    const result = first.response && first.response.result || {};
    const cols = (result.cols || []).map((c) => c.name);
    const rows = (result.rows || []).map((row) => {
      const o = {};
      for (let i = 0; i < cols.length; i++) o[cols[i]] = decodeValue(row[i]);
      return o;
    });
    return {
      rows,
      lastInsertRowid: result.last_insert_rowid,
      changes: result.affected_row_count
    };
  }
  return { query, backend: "sqlite" };
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
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/overlay/style.min.css">
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/toast/style.min.css">
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/spinner/style.min.css">
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@df345f0ff39d94e0b7d695d43c05b9c427f54efe/mixssl/view.min.css"></head>
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
<footer style="text-align:center;padding:1rem 0;font-size:.75rem;color:var(--footer-color,inherit)">\xA9 <span id="footerYear"></span> <a href="https://go.gb.net/gaobo" target="_blank" style="color:var(--footer-color,inherit);text-decoration:none;border-bottom:1px dashed var(--footer-border,currentColor)"><img src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/gaobo.png" alt="" style="height:20px;vertical-align:middle;margin:0 2px;"><span id="footerBrand"></span></a> <span id="footerProd"></span> <a href="https://github.com/onegbnet/tinyutils/blob/master/LICENSE" target="_blank" style="color:var(--footer-color,inherit);text-decoration:none;border-bottom:1px dashed var(--footer-border,currentColor)">MIT License</a></footer>


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
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/i18n-engine/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/footer-brand/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/action/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/field/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/overlay/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/popover/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/toast/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/theme/client.min.js"></script>

<!-- Per-lang i18n loader: bootstrap reads server-injected INITIAL_LANG
     (preferred) or falls back to client-side detectLang, then async-
     fetches the matching i18n-<lang>.min.js. Exposes window.LangBundle \u2014
     client.min.js waits on LangBundle.ready before applyI18n and uses
     LangBundle.load on lang switch. -->
<script>(function(){var b="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@df345f0ff39d94e0b7d695d43c05b9c427f54efe/mixssl";var s=["en","eo","fr","de","es","it","nl","da","zh-cn","zh-tw","ja","ko","ms","vi","th","ta","my","uk","he","ar"];var d="en";function load(l){return new Promise(function(r,j){var x=document.createElement('script');x.src=b+'/i18n-'+l+'.min.js';x.onload=function(){r(l)};x.onerror=function(){j(new Error('i18n-'+l+' failed'))};document.head.appendChild(x)})}var init=(function(){var g=window["INITIAL_LANG"];if(typeof g==='string'&&s.indexOf(g)>=0)return g;return typeof detectLang==='function'?detectLang(s):d})();if(s.indexOf(init)<0)init=d;window.LangBundle={initial:init,ready:load(init),load:load}})();</script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@df345f0ff39d94e0b7d695d43c05b9c427f54efe/mixssl/client.min.js"></script>
</body></html>`;

var DEFAULT_VALID_THEMES = /* @__PURE__ */ new Set(["light", "dark"]);
var DEFAULT_VALID_LANGS = new Set(SUPPORTED_LANGS_DEFAULT);
var DEFAULT_COOKIE_NAMES = { theme: "theme", lang: "lang" };
var DEFAULT_MAX_AGE = 31536e3;
function buildPrefCookies(prefs, options = {}) {
  const cookieNames = { ...DEFAULT_COOKIE_NAMES, ...options.cookieNames || {} };
  const validThemes = options.validThemes || DEFAULT_VALID_THEMES;
  const validLangs = options.validLangs || DEFAULT_VALID_LANGS;
  const maxAge = options.maxAge || DEFAULT_MAX_AGE;
  const cookieOpts = { maxAge, sameSite: "Lax" };
  const out = [];
  if (typeof prefs.theme === "string") {
    if (!validThemes.has(prefs.theme)) throw new Error("Invalid theme");
    out.push(buildSetCookie(cookieNames.theme, prefs.theme, cookieOpts));
  }
  if (typeof prefs.lang === "string") {
    if (!validLangs.has(prefs.lang)) throw new Error("Invalid lang");
    out.push(buildSetCookie(cookieNames.lang, prefs.lang, cookieOpts));
  }
  return out;
}
async function handlePrefs(request, options) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  let cookies;
  try {
    cookies = buildPrefCookies(body, options);
  } catch (e) {
    return jsonResponse({ error: e.message }, 400);
  }
  if (cookies.length === 0) {
    return jsonResponse({ error: "No prefs to update" }, 400);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookies.join(", ")
    }
  });
}
function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
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
function timingSafeEqual(a, b2) {
  if (a.length !== b2.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b2.charCodeAt(i);
  return r === 0;
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
var SELF_HOST_DIRECTORIES = {
  "Let's Encrypt": { url: "https://acme-v02.api.letsencrypt.org/directory", eab: 0 }
};
var KNOWN_DIRECTORIES = { ...ACME_DIRECTORIES, ...SELF_HOST_DIRECTORIES };
function acmeDirectoryByName(name) {
  const d = KNOWN_DIRECTORIES[name];
  if (!d) throw new Error(`unknown ACME directory: ${name}`);
  return d;
}
function availableDirectories(env) {
  return env && env.__selfHost ? KNOWN_DIRECTORIES : ACME_DIRECTORIES;
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
function pemBodyToDer(pem) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseLenientJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
  }
  let out = "", inStr = false, escape2 = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (escape2) {
        out += c;
        escape2 = false;
        continue;
      }
      if (c === "\\") {
        out += c;
        escape2 = true;
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
async function tcSignedCall(creds, action, payload) {
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
    const r = await tcSignedCall(creds, "DescribeDomainList", { Offset: offset, Limit: 100 });
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
      await tcSignedCall(creds, "DescribeDomain", { Domain: candidate });
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
    const r = await tcSignedCall(creds, "CreateRecord", payload);
    return { recordId: r.RecordId, domain, subDomain: sub };
  } catch (e) {
    try {
      const list = await tcSignedCall(creds, "DescribeRecordList", {
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
  const list = await tcSignedCall(creds, "DescribeRecordList", {
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
      await tcSignedCall(creds, "DeleteRecord", { Domain: domain, RecordId: rec.RecordId });
      removed++;
    }
  }
  return { removed };
}
async function dpQueryTxt(creds, fqdn, value) {
  const { domain, subDomain } = await dpResolveDomain(creds, fqdn);
  const sub = subDomain === "@" ? "_acme-challenge" : `_acme-challenge.${subDomain}`;
  const list = await tcSignedCall(creds, "DescribeRecordList", {
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
    const builtinCa = builtinCaName(env);
    const fbRow = await env.DATA.prepare(
      `SELECT 1 FROM acme_accounts WHERE directory_name = ? AND kid IS NOT NULL`
    ).bind(builtinCa).first();
    const canFallback = fbRow && job.acme_directory_name !== builtinCa && (job.acme_account_attempt_index || 0) === 0;
    if (canFallback) {
      const ok2 = await writeIfOwner(
        `UPDATE jobs SET acme_directory_name=?, acme_account_attempt_index=1, state='new',
           step_data_json=NULL, next_tick_at=?, lease_until=0, lease_token=NULL,
           error=?, updated_at=? WHERE id=? AND lease_token=?`,
        [builtinCa, t + 3, msg, t, jobId, myToken]
      );
      if (!ok2) return { skipped: true, reason: "lease-stolen" };
      try {
        await logJob(env, jobId, "warn", `falling back to ${builtinCa}`);
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
function builtinCaName(env) {
  return env && env.__selfHost ? "Let's Encrypt" : "ZeroSSL";
}
async function ensureBuiltinCaAccount(env) {
  const caName = builtinCaName(env);
  const pre = await env.DATA.prepare("SELECT id, kid FROM acme_accounts WHERE directory_name = ?").bind(caName).first();
  if (pre && pre.kid) return pre.id;
  let confObj = null;
  if (caName === "ZeroSSL") {
    if (!env.ZEK || !env.ZEH) {
      throw new Error("ZEK / ZEH secrets not configured \u2014 set them in Worker Settings > Variables and redeploy");
    }
    confObj = { eab_kid: env.ZEK, eab_hmac: env.ZEH };
  }
  const attempt = async () => {
    const existing = await env.DATA.prepare("SELECT id, kid FROM acme_accounts WHERE directory_name = ?").bind(caName).first();
    if (existing && existing.kid) return existing.id;
    const kp = await generateEcKeyPair();
    const jwkEnc = await aesEncrypt(env, JSON.stringify(kp.privateJwk));
    const confEnc = confObj ? await aesEncrypt(env, JSON.stringify(confObj)) : null;
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
      console.warn(`${caName} built-in CA bootstrap attempt ${i + 1}/5 failed:`, e.message || e);
    }
    if (i < 4) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 8e3);
    }
  }
  throw new Error(`${caName} built-in CA bootstrap failed after 5 attempts \u2014 last error: ${lastErr?.message || lastErr}.`);
}

import os from "os";
import fs from "fs";

var originCache = /* @__PURE__ */ new Map();
var originStackCache = /* @__PURE__ */ new Map();
var originError = /* @__PURE__ */ Symbol("OriginError");
var CLOSE = {};
var Query = class extends Promise {
  constructor(strings, args, handler, canceller, options = {}) {
    let resolve, reject;
    super((a, b2) => {
      resolve = a;
      reject = b2;
    });
    this.tagged = Array.isArray(strings.raw);
    this.strings = strings;
    this.args = args;
    this.handler = handler;
    this.canceller = canceller;
    this.options = options;
    this.state = null;
    this.statement = null;
    this.resolve = (x) => (this.active = false, resolve(x));
    this.reject = (x) => (this.active = false, reject(x));
    this.active = false;
    this.cancelled = null;
    this.executed = false;
    this.signature = "";
    this[originError] = this.handler.debug ? new Error() : this.tagged && cachedError(this.strings);
  }
  get origin() {
    return (this.handler.debug ? this[originError].stack : this.tagged && originStackCache.has(this.strings) ? originStackCache.get(this.strings) : originStackCache.set(this.strings, this[originError].stack).get(this.strings)) || "";
  }
  static get [Symbol.species]() {
    return Promise;
  }
  cancel() {
    return this.canceller && (this.canceller(this), this.canceller = null);
  }
  simple() {
    this.options.simple = true;
    this.options.prepare = false;
    return this;
  }
  async readable() {
    this.simple();
    this.streaming = true;
    return this;
  }
  async writable() {
    this.simple();
    this.streaming = true;
    return this;
  }
  cursor(rows = 1, fn) {
    this.options.simple = false;
    if (typeof rows === "function") {
      fn = rows;
      rows = 1;
    }
    this.cursorRows = rows;
    if (typeof fn === "function")
      return this.cursorFn = fn, this;
    let prev;
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          if (this.executed && !this.active)
            return { done: true };
          prev && prev();
          const promise = new Promise((resolve, reject) => {
            this.cursorFn = (value) => {
              resolve({ value, done: false });
              return new Promise((r) => prev = r);
            };
            this.resolve = () => (this.active = false, resolve({ done: true }));
            this.reject = (x) => (this.active = false, reject(x));
          });
          this.execute();
          return promise;
        },
        return() {
          prev && prev(CLOSE);
          return { done: true };
        }
      })
    };
  }
  describe() {
    this.options.simple = false;
    this.onlyDescribe = this.options.prepare = true;
    return this;
  }
  stream() {
    throw new Error(".stream has been renamed to .forEach");
  }
  forEach(fn) {
    this.forEachFn = fn;
    this.handle();
    return this;
  }
  raw() {
    this.isRaw = true;
    return this;
  }
  values() {
    this.isRaw = "values";
    return this;
  }
  async handle() {
    !this.executed && (this.executed = true) && await 1 && this.handler(this);
  }
  execute() {
    this.handle();
    return this;
  }
  then() {
    this.handle();
    return super.then.apply(this, arguments);
  }
  catch() {
    this.handle();
    return super.catch.apply(this, arguments);
  }
  finally() {
    this.handle();
    return super.finally.apply(this, arguments);
  }
};
function cachedError(xs) {
  if (originCache.has(xs))
    return originCache.get(xs);
  const x = Error.stackTraceLimit;
  Error.stackTraceLimit = 4;
  originCache.set(xs, new Error());
  Error.stackTraceLimit = x;
  return originCache.get(xs);
}

var PostgresError = class extends Error {
  constructor(x) {
    super(x.message);
    this.name = this.constructor.name;
    Object.assign(this, x);
  }
};
var Errors = {
  connection,
  postgres,
  generic,
  notSupported
};
function connection(x, options, socket) {
  const { host, port } = socket || options;
  const error = Object.assign(
    new Error("write " + x + " " + (options.path || host + ":" + port)),
    {
      code: x,
      errno: x,
      address: options.path || host
    },
    options.path ? {} : { port }
  );
  Error.captureStackTrace(error, connection);
  return error;
}
function postgres(x) {
  const error = new PostgresError(x);
  Error.captureStackTrace(error, postgres);
  return error;
}
function generic(code, message) {
  const error = Object.assign(new Error(code + ": " + message), { code });
  Error.captureStackTrace(error, generic);
  return error;
}
function notSupported(x) {
  const error = Object.assign(
    new Error(x + " (B) is not supported"),
    {
      code: "MESSAGE_NOT_SUPPORTED",
      name: x
    }
  );
  Error.captureStackTrace(error, notSupported);
  return error;
}

var types = {
  string: {
    to: 25,
    from: null,
    // defaults to string
    serialize: (x) => "" + x
  },
  number: {
    to: 0,
    from: [21, 23, 26, 700, 701],
    serialize: (x) => "" + x,
    parse: (x) => +x
  },
  json: {
    to: 114,
    from: [114, 3802],
    serialize: (x) => JSON.stringify(x),
    parse: (x) => JSON.parse(x)
  },
  boolean: {
    to: 16,
    from: 16,
    serialize: (x) => x === true ? "t" : "f",
    parse: (x) => x === "t"
  },
  date: {
    to: 1184,
    from: [1082, 1114, 1184],
    serialize: (x) => (x instanceof Date ? x : new Date(x)).toISOString(),
    parse: (x) => new Date(x)
  },
  bytea: {
    to: 17,
    from: 17,
    serialize: (x) => "\\x" + Buffer.from(x).toString("hex"),
    parse: (x) => Buffer.from(x.slice(2), "hex")
  }
};
var NotTagged = class {
  then() {
    notTagged();
  }
  catch() {
    notTagged();
  }
  finally() {
    notTagged();
  }
};
var Identifier = class extends NotTagged {
  constructor(value) {
    super();
    this.value = escapeIdentifier(value);
  }
};
var Parameter = class extends NotTagged {
  constructor(value, type, array) {
    super();
    this.value = value;
    this.type = type;
    this.array = array;
  }
};
var Builder = class extends NotTagged {
  constructor(first, rest) {
    super();
    this.first = first;
    this.rest = rest;
  }
  build(before, parameters, types2, options) {
    const keyword = builders.map(([x, fn]) => ({ fn, i: before.search(x) })).sort((a, b2) => a.i - b2.i).pop();
    return keyword.i === -1 ? escapeIdentifiers(this.first, options) : keyword.fn(this.first, this.rest, parameters, types2, options);
  }
};
function handleValue(x, parameters, types2, options) {
  let value = x instanceof Parameter ? x.value : x;
  if (value === void 0) {
    x instanceof Parameter ? x.value = options.transform.undefined : value = x = options.transform.undefined;
    if (value === void 0)
      throw Errors.generic("UNDEFINED_VALUE", "Undefined values are not allowed");
  }
  return "$" + types2.push(
    x instanceof Parameter ? (parameters.push(x.value), x.array ? x.array[x.type || inferType(x.value)] || x.type || firstIsString(x.value) : x.type) : (parameters.push(x), inferType(x))
  );
}
var defaultHandlers = typeHandlers(types);
function stringify(q, string, value, parameters, types2, options) {
  for (let i = 1; i < q.strings.length; i++) {
    string += stringifyValue(string, value, parameters, types2, options) + q.strings[i];
    value = q.args[i];
  }
  return string;
}
function stringifyValue(string, value, parameters, types2, o) {
  return value instanceof Builder ? value.build(string, parameters, types2, o) : value instanceof Query ? fragment(value, parameters, types2, o) : value instanceof Identifier ? value.value : value && value[0] instanceof Query ? value.reduce((acc, x) => acc + " " + fragment(x, parameters, types2, o), "") : handleValue(value, parameters, types2, o);
}
function fragment(q, parameters, types2, options) {
  q.fragment = true;
  return stringify(q, q.strings[0], q.args[0], parameters, types2, options);
}
function valuesBuilder(first, parameters, types2, columns, options) {
  return first.map(
    (row) => "(" + columns.map(
      (column) => stringifyValue("values", row[column], parameters, types2, options)
    ).join(",") + ")"
  ).join(",");
}
function values(first, rest, parameters, types2, options) {
  const multi = Array.isArray(first[0]);
  const columns = rest.length ? rest.flat() : Object.keys(multi ? first[0] : first);
  return valuesBuilder(multi ? first : [first], parameters, types2, columns, options);
}
function select(first, rest, parameters, types2, options) {
  typeof first === "string" && (first = [first].concat(rest));
  if (Array.isArray(first))
    return escapeIdentifiers(first, options);
  let value;
  const columns = rest.length ? rest.flat() : Object.keys(first);
  return columns.map((x) => {
    value = first[x];
    return (value instanceof Query ? fragment(value, parameters, types2, options) : value instanceof Identifier ? value.value : handleValue(value, parameters, types2, options)) + " as " + escapeIdentifier(options.transform.column.to ? options.transform.column.to(x) : x);
  }).join(",");
}
var builders = Object.entries({
  values,
  in: (...xs) => {
    const x = values(...xs);
    return x === "()" ? "(null)" : x;
  },
  select,
  as: select,
  returning: select,
  "\\(": select,
  update(first, rest, parameters, types2, options) {
    return (rest.length ? rest.flat() : Object.keys(first)).map(
      (x) => escapeIdentifier(options.transform.column.to ? options.transform.column.to(x) : x) + "=" + stringifyValue("values", first[x], parameters, types2, options)
    );
  },
  insert(first, rest, parameters, types2, options) {
    const columns = rest.length ? rest.flat() : Object.keys(Array.isArray(first) ? first[0] : first);
    return "(" + escapeIdentifiers(columns, options) + ")values" + valuesBuilder(Array.isArray(first) ? first : [first], parameters, types2, columns, options);
  }
}).map(([x, fn]) => [new RegExp("((?:^|[\\s(])" + x + "(?:$|[\\s(]))(?![\\s\\S]*\\1)", "i"), fn]);
function notTagged() {
  throw Errors.generic("NOT_TAGGED_CALL", "Query not called as a tagged template literal");
}
var serializers = defaultHandlers.serializers;
var parsers = defaultHandlers.parsers;
function firstIsString(x) {
  if (Array.isArray(x))
    return firstIsString(x[0]);
  return typeof x === "string" ? 1009 : 0;
}
var mergeUserTypes = function(types2) {
  const user = typeHandlers(types2 || {});
  return {
    serializers: Object.assign({}, serializers, user.serializers),
    parsers: Object.assign({}, parsers, user.parsers)
  };
};
function typeHandlers(types2) {
  return Object.keys(types2).reduce((acc, k) => {
    types2[k].from && [].concat(types2[k].from).forEach((x) => acc.parsers[x] = types2[k].parse);
    if (types2[k].serialize) {
      acc.serializers[types2[k].to] = types2[k].serialize;
      types2[k].from && [].concat(types2[k].from).forEach((x) => acc.serializers[x] = types2[k].serialize);
    }
    return acc;
  }, { parsers: {}, serializers: {} });
}
function escapeIdentifiers(xs, { transform: { column } }) {
  return xs.map((x) => escapeIdentifier(column.to ? column.to(x) : x)).join(",");
}
var escapeIdentifier = function escape(str) {
  return '"' + str.replace(/"/g, '""').replace(/\./g, '"."') + '"';
};
var inferType = function inferType2(x) {
  return x instanceof Parameter ? x.type : x instanceof Date ? 1184 : x instanceof Uint8Array ? 17 : x === true || x === false ? 16 : typeof x === "bigint" ? 20 : Array.isArray(x) ? inferType2(x[0]) : 0;
};
var escapeBackslash = /\\/g;
var escapeQuote = /"/g;
function arrayEscape(x) {
  return x.replace(escapeBackslash, "\\\\").replace(escapeQuote, '\\"');
}
var arraySerializer = function arraySerializer2(xs, serializer, options, typarray) {
  if (Array.isArray(xs) === false)
    return xs;
  if (!xs.length)
    return "{}";
  const first = xs[0];
  const delimiter = typarray === 1020 ? ";" : ",";
  if (Array.isArray(first) && !first.type)
    return "{" + xs.map((x) => arraySerializer2(x, serializer, options, typarray)).join(delimiter) + "}";
  return "{" + xs.map((x) => {
    if (x === void 0) {
      x = options.transform.undefined;
      if (x === void 0)
        throw Errors.generic("UNDEFINED_VALUE", "Undefined values are not allowed");
    }
    return x === null ? "null" : '"' + arrayEscape(serializer ? serializer(x.type ? x.value : x) : "" + x) + '"';
  }).join(delimiter) + "}";
};
var arrayParserState = {
  i: 0,
  char: null,
  str: "",
  quoted: false,
  last: 0
};
var arrayParser = function arrayParser2(x, parser, typarray) {
  arrayParserState.i = arrayParserState.last = 0;
  return arrayParserLoop(arrayParserState, x, parser, typarray);
};
function arrayParserLoop(s, x, parser, typarray) {
  const xs = [];
  const delimiter = typarray === 1020 ? ";" : ",";
  for (; s.i < x.length; s.i++) {
    s.char = x[s.i];
    if (s.quoted) {
      if (s.char === "\\") {
        s.str += x[++s.i];
      } else if (s.char === '"') {
        xs.push(parser ? parser(s.str) : s.str);
        s.str = "";
        s.quoted = x[s.i + 1] === '"';
        s.last = s.i + 2;
      } else {
        s.str += s.char;
      }
    } else if (s.char === '"') {
      s.quoted = true;
    } else if (s.char === "{") {
      s.last = ++s.i;
      xs.push(arrayParserLoop(s, x, parser, typarray));
    } else if (s.char === "}") {
      s.quoted = false;
      s.last < s.i && xs.push(parser ? parser(x.slice(s.last, s.i)) : x.slice(s.last, s.i));
      s.last = s.i + 1;
      break;
    } else if (s.char === delimiter && s.p !== "}" && s.p !== '"') {
      xs.push(parser ? parser(x.slice(s.last, s.i)) : x.slice(s.last, s.i));
      s.last = s.i + 1;
    }
    s.p = s.char;
  }
  s.last < s.i && xs.push(parser ? parser(x.slice(s.last, s.i + 1)) : x.slice(s.last, s.i + 1));
  return xs;
}
var toCamel = (x) => {
  let str = x[0];
  for (let i = 1; i < x.length; i++)
    str += x[i] === "_" ? x[++i].toUpperCase() : x[i];
  return str;
};
var toPascal = (x) => {
  let str = x[0].toUpperCase();
  for (let i = 1; i < x.length; i++)
    str += x[i] === "_" ? x[++i].toUpperCase() : x[i];
  return str;
};
var toKebab = (x) => x.replace(/_/g, "-");
var fromCamel = (x) => x.replace(/([A-Z])/g, "_$1").toLowerCase();
var fromPascal = (x) => (x.slice(0, 1) + x.slice(1).replace(/([A-Z])/g, "_$1")).toLowerCase();
var fromKebab = (x) => x.replace(/-/g, "_");
function createJsonTransform(fn) {
  return function jsonTransform(x, column) {
    return typeof x === "object" && x !== null && (column.type === 114 || column.type === 3802) ? Array.isArray(x) ? x.map((x2) => jsonTransform(x2, column)) : Object.entries(x).reduce((acc, [k, v]) => Object.assign(acc, { [fn(k)]: jsonTransform(v, column) }), {}) : x;
  };
}
toCamel.column = { from: toCamel };
toCamel.value = { from: createJsonTransform(toCamel) };
fromCamel.column = { to: fromCamel };
var camel = { ...toCamel };
camel.column.to = fromCamel;
toPascal.column = { from: toPascal };
toPascal.value = { from: createJsonTransform(toPascal) };
fromPascal.column = { to: fromPascal };
var pascal = { ...toPascal };
pascal.column.to = fromPascal;
toKebab.column = { from: toKebab };
toKebab.value = { from: createJsonTransform(toKebab) };
fromKebab.column = { to: fromKebab };
var kebab = { ...toKebab };
kebab.column.to = fromKebab;

import net from "net";
import tls from "tls";
import crypto2 from "crypto";
import Stream from "stream";
import { performance } from "perf_hooks";

var Result = class extends Array {
  constructor() {
    super();
    Object.defineProperties(this, {
      count: { value: null, writable: true },
      state: { value: null, writable: true },
      command: { value: null, writable: true },
      columns: { value: null, writable: true },
      statement: { value: null, writable: true }
    });
  }
  static get [Symbol.species]() {
    return Array;
  }
};

var queue_default = Queue;
function Queue(initial = []) {
  let xs = initial.slice();
  let index = 0;
  return {
    get length() {
      return xs.length - index;
    },
    remove: (x) => {
      const index2 = xs.indexOf(x);
      return index2 === -1 ? null : (xs.splice(index2, 1), x);
    },
    push: (x) => (xs.push(x), x),
    shift: () => {
      const out = xs[index++];
      if (index === xs.length) {
        index = 0;
        xs = [];
      } else {
        xs[index - 1] = void 0;
      }
      return out;
    }
  };
}

var size = 256;
var buffer = Buffer.allocUnsafe(size);
var messages = "BCcDdEFfHPpQSX".split("").reduce((acc, x) => {
  const v = x.charCodeAt(0);
  acc[x] = () => {
    buffer[0] = v;
    b.i = 5;
    return b;
  };
  return acc;
}, {});
var b = Object.assign(reset, messages, {
  N: String.fromCharCode(0),
  i: 0,
  inc(x) {
    b.i += x;
    return b;
  },
  str(x) {
    const length = Buffer.byteLength(x);
    fit(length);
    b.i += buffer.write(x, b.i, length, "utf8");
    return b;
  },
  i16(x) {
    fit(2);
    buffer.writeUInt16BE(x, b.i);
    b.i += 2;
    return b;
  },
  i32(x, i) {
    if (i || i === 0) {
      buffer.writeUInt32BE(x, i);
      return b;
    }
    fit(4);
    buffer.writeUInt32BE(x, b.i);
    b.i += 4;
    return b;
  },
  z(x) {
    fit(x);
    buffer.fill(0, b.i, b.i + x);
    b.i += x;
    return b;
  },
  raw(x) {
    buffer = Buffer.concat([buffer.subarray(0, b.i), x]);
    b.i = buffer.length;
    return b;
  },
  end(at = 1) {
    buffer.writeUInt32BE(b.i - at, at);
    const out = buffer.subarray(0, b.i);
    b.i = 0;
    buffer = Buffer.allocUnsafe(size);
    return out;
  }
});
var bytes_default = b;
function fit(x) {
  if (buffer.length - b.i < x) {
    const prev = buffer, length = prev.length;
    buffer = Buffer.allocUnsafe(length + (length >> 1) + x);
    prev.copy(buffer);
  }
}
function reset() {
  b.i = 0;
  return b;
}

var connection_default = Connection;
var uid = 1;
var Sync = bytes_default().S().end();
var Flush = bytes_default().H().end();
var SSLRequest = bytes_default().i32(8).i32(80877103).end(8);
var ExecuteUnnamed = Buffer.concat([bytes_default().E().str(bytes_default.N).i32(0).end(), Sync]);
var DescribeUnnamed = bytes_default().D().str("S").str(bytes_default.N).end();
var noop = () => {
};
var retryRoutines = /* @__PURE__ */ new Set([
  "FetchPreparedStatement",
  "RevalidateCachedQuery",
  "transformAssignedExpr"
]);
var errorFields = {
  83: "severity_local",
  // S
  86: "severity",
  // V
  67: "code",
  // C
  77: "message",
  // M
  68: "detail",
  // D
  72: "hint",
  // H
  80: "position",
  // P
  112: "internal_position",
  // p
  113: "internal_query",
  // q
  87: "where",
  // W
  115: "schema_name",
  // s
  116: "table_name",
  // t
  99: "column_name",
  // c
  100: "data type_name",
  // d
  110: "constraint_name",
  // n
  70: "file",
  // F
  76: "line",
  // L
  82: "routine"
  // R
};
function Connection(options, queues = {}, { onopen = noop, onend = noop, onclose = noop } = {}) {
  const {
    sslnegotiation,
    ssl,
    max,
    user,
    host,
    port,
    database,
    parsers: parsers2,
    transform,
    onnotice,
    onnotify,
    onparameter,
    max_pipeline,
    keep_alive,
    backoff: backoff2,
    target_session_attrs
  } = options;
  const sent = queue_default(), id = uid++, backend = { pid: null, secret: null }, idleTimer = timer(end, options.idle_timeout), lifeTimer = timer(end, options.max_lifetime), connectTimer = timer(connectTimedOut, options.connect_timeout);
  let socket = null, cancelMessage, errorResponse = null, result = new Result(), incoming = Buffer.alloc(0), needsTypes = options.fetch_types, backendParameters = {}, statements = {}, statementId = Math.random().toString(36).slice(2), statementCount = 1, closedTime = 0, remaining = 0, hostIndex = 0, retries = 0, length = 0, delay = 0, rows = 0, serverSignature = null, nextWriteTimer = null, terminated = false, incomings = null, results = null, initial = null, ending = null, stream = null, chunk = null, ended = null, nonce = null, query = null, final = null;
  const connection2 = {
    queue: queues.closed,
    idleTimer,
    connect(query2) {
      initial = query2;
      reconnect();
    },
    terminate,
    execute,
    cancel,
    end,
    count: 0,
    id
  };
  queues.closed && queues.closed.push(connection2);
  return connection2;
  async function createSocket() {
    let x;
    try {
      x = options.socket ? await Promise.resolve(options.socket(options)) : new net.Socket();
    } catch (e) {
      error(e);
      return;
    }
    x.on("error", error);
    x.on("close", closed);
    x.on("drain", drain);
    return x;
  }
  async function cancel({ pid, secret }, resolve, reject) {
    try {
      cancelMessage = bytes_default().i32(16).i32(80877102).i32(pid).i32(secret).end(16);
      await connect();
      socket.once("error", reject);
      socket.once("close", resolve);
    } catch (error2) {
      reject(error2);
    }
  }
  function execute(q) {
    if (terminated)
      return queryError(q, Errors.connection("CONNECTION_DESTROYED", options));
    if (stream)
      return queryError(q, Errors.generic("COPY_IN_PROGRESS", "You cannot execute queries during copy"));
    if (q.cancelled)
      return;
    try {
      q.state = backend;
      query ? sent.push(q) : (query = q, query.active = true);
      build(q);
      return write(toBuffer(q)) && !q.describeFirst && !q.cursorFn && sent.length < max_pipeline && (!q.options.onexecute || q.options.onexecute(connection2));
    } catch (error2) {
      sent.length === 0 && write(Sync);
      errored(error2);
      return true;
    }
  }
  function toBuffer(q) {
    if (q.parameters.length >= 65534)
      throw Errors.generic("MAX_PARAMETERS_EXCEEDED", "Max number of parameters (65534) exceeded");
    return q.options.simple ? bytes_default().Q().str(q.statement.string + bytes_default.N).end() : q.describeFirst ? Buffer.concat([describe(q), Flush]) : q.prepare ? q.prepared ? prepared(q) : Buffer.concat([describe(q), prepared(q)]) : unnamed(q);
  }
  function describe(q) {
    return Buffer.concat([
      Parse(q.statement.string, q.parameters, q.statement.types, q.statement.name),
      Describe("S", q.statement.name)
    ]);
  }
  function prepared(q) {
    return Buffer.concat([
      Bind(q.parameters, q.statement.types, q.statement.name, q.cursorName),
      q.cursorFn ? Execute("", q.cursorRows) : ExecuteUnnamed
    ]);
  }
  function unnamed(q) {
    return Buffer.concat([
      Parse(q.statement.string, q.parameters, q.statement.types),
      DescribeUnnamed,
      prepared(q)
    ]);
  }
  function build(q) {
    const parameters = [], types2 = [];
    const string = stringify(q, q.strings[0], q.args[0], parameters, types2, options);
    !q.tagged && q.args.forEach((x) => handleValue(x, parameters, types2, options));
    q.prepare = options.prepare && ("prepare" in q.options ? q.options.prepare : true);
    q.string = string;
    q.signature = q.prepare && types2 + string;
    q.onlyDescribe && delete statements[q.signature];
    q.parameters = q.parameters || parameters;
    q.prepared = q.prepare && q.signature in statements;
    q.describeFirst = q.onlyDescribe || parameters.length && !q.prepared;
    q.statement = q.prepared ? statements[q.signature] : { string, types: types2, name: q.prepare ? statementId + statementCount++ : "" };
    typeof options.debug === "function" && options.debug(id, string, parameters, types2);
  }
  function write(x, fn) {
    chunk = chunk ? Buffer.concat([chunk, x]) : Buffer.from(x);
    if (fn || chunk.length >= 1024)
      return nextWrite(fn);
    nextWriteTimer === null && (nextWriteTimer = setImmediate(nextWrite));
    return true;
  }
  function nextWrite(fn) {
    const x = socket.write(chunk, fn);
    nextWriteTimer !== null && clearImmediate(nextWriteTimer);
    chunk = nextWriteTimer = null;
    return x;
  }
  function connectTimedOut() {
    errored(Errors.connection("CONNECT_TIMEOUT", options, socket));
    socket.destroy();
  }
  async function secure() {
    if (sslnegotiation !== "direct") {
      write(SSLRequest);
      const canSSL = await new Promise((r) => socket.once("data", (x) => r(x[0] === 83)));
      if (!canSSL && ssl === "prefer")
        return connected();
    }
    const options2 = {
      socket,
      servername: net.isIP(socket.host) ? void 0 : socket.host
    };
    if (sslnegotiation === "direct")
      options2.ALPNProtocols = ["postgresql"];
    if (ssl === "require" || ssl === "allow" || ssl === "prefer")
      options2.rejectUnauthorized = false;
    else if (typeof ssl === "object")
      Object.assign(options2, ssl);
    socket.removeAllListeners();
    socket = tls.connect(options2);
    socket.on("secureConnect", connected);
    socket.on("error", error);
    socket.on("close", closed);
    socket.on("drain", drain);
  }
  function drain() {
    !query && onopen(connection2);
  }
  function data(x) {
    if (incomings) {
      incomings.push(x);
      remaining -= x.length;
      if (remaining > 0)
        return;
    }
    incoming = incomings ? Buffer.concat(incomings, length - remaining) : incoming.length === 0 ? x : Buffer.concat([incoming, x], incoming.length + x.length);
    while (incoming.length > 4) {
      length = incoming.readUInt32BE(1);
      if (length >= incoming.length) {
        remaining = length - incoming.length;
        incomings = [incoming];
        break;
      }
      try {
        handle(incoming.subarray(0, length + 1));
      } catch (e) {
        query && (query.cursorFn || query.describeFirst) && write(Sync);
        errored(e);
      }
      incoming = incoming.subarray(length + 1);
      remaining = 0;
      incomings = null;
    }
  }
  async function connect() {
    terminated = false;
    backendParameters = {};
    socket || (socket = await createSocket());
    if (!socket)
      return;
    connectTimer.start();
    if (options.socket)
      return ssl ? secure() : connected();
    socket.on("connect", ssl ? secure : connected);
    if (options.path)
      return socket.connect(options.path);
    socket.ssl = ssl;
    socket.connect(port[hostIndex], host[hostIndex]);
    socket.host = host[hostIndex];
    socket.port = port[hostIndex];
    hostIndex = (hostIndex + 1) % port.length;
  }
  function reconnect() {
    setTimeout(connect, closedTime ? Math.max(0, closedTime + delay - performance.now()) : 0);
  }
  function connected() {
    try {
      statements = {};
      needsTypes = options.fetch_types;
      statementId = Math.random().toString(36).slice(2);
      statementCount = 1;
      lifeTimer.start();
      socket.on("data", data);
      keep_alive && socket.setKeepAlive && socket.setKeepAlive(true, 1e3 * keep_alive);
      const s = StartupMessage();
      write(s);
    } catch (err) {
      error(err);
    }
  }
  function error(err) {
    if (connection2.queue === queues.connecting && options.host[retries + 1])
      return;
    errored(err);
    while (sent.length)
      queryError(sent.shift(), err);
  }
  function errored(err) {
    stream && (stream.destroy(err), stream = null);
    query && queryError(query, err);
    initial && (queryError(initial, err), initial = null);
  }
  function queryError(query2, err) {
    if (query2.reserve)
      return query2.reject(err);
    if (!err || typeof err !== "object")
      err = new Error(err);
    "query" in err || "parameters" in err || Object.defineProperties(err, {
      stack: { value: err.stack + query2.origin.replace(/.*\n/, "\n"), enumerable: options.debug },
      query: { value: query2.string, enumerable: options.debug },
      parameters: { value: query2.parameters, enumerable: options.debug },
      args: { value: query2.args, enumerable: options.debug },
      types: { value: query2.statement && query2.statement.types, enumerable: options.debug }
    });
    query2.reject(err);
  }
  function end() {
    return ending || (!connection2.reserved && onend(connection2), !connection2.reserved && !initial && !query && sent.length === 0 ? (terminate(), new Promise((r) => socket && socket.readyState !== "closed" ? socket.once("close", r) : r())) : ending = new Promise((r) => ended = r));
  }
  function terminate() {
    terminated = true;
    if (stream || query || initial || sent.length)
      error(Errors.connection("CONNECTION_DESTROYED", options));
    clearImmediate(nextWriteTimer);
    if (socket) {
      socket.removeListener("data", data);
      socket.removeListener("connect", connected);
      socket.readyState === "open" && socket.end(bytes_default().X().end());
    }
    ended && (ended(), ending = ended = null);
  }
  async function closed(hadError) {
    incoming = Buffer.alloc(0);
    remaining = 0;
    incomings = null;
    clearImmediate(nextWriteTimer);
    socket.removeListener("data", data);
    socket.removeListener("connect", connected);
    idleTimer.cancel();
    lifeTimer.cancel();
    connectTimer.cancel();
    socket.removeAllListeners();
    socket = null;
    if (initial)
      return reconnect();
    !hadError && (query || sent.length) && error(Errors.connection("CONNECTION_CLOSED", options, socket));
    closedTime = performance.now();
    hadError && options.shared.retries++;
    delay = (typeof backoff2 === "function" ? backoff2(options.shared.retries) : backoff2) * 1e3;
    onclose(connection2, Errors.connection("CONNECTION_CLOSED", options, socket));
  }
  function handle(xs, x = xs[0]) {
    (x === 68 ? DataRow : (
      // D
      x === 100 ? CopyData : (
        // d
        x === 65 ? NotificationResponse : (
          // A
          x === 83 ? ParameterStatus : (
            // S
            x === 90 ? ReadyForQuery : (
              // Z
              x === 67 ? CommandComplete : (
                // C
                x === 50 ? BindComplete : (
                  // 2
                  x === 49 ? ParseComplete : (
                    // 1
                    x === 116 ? ParameterDescription : (
                      // t
                      x === 84 ? RowDescription : (
                        // T
                        x === 82 ? Authentication : (
                          // R
                          x === 110 ? NoData : (
                            // n
                            x === 75 ? BackendKeyData : (
                              // K
                              x === 69 ? ErrorResponse : (
                                // E
                                x === 115 ? PortalSuspended : (
                                  // s
                                  x === 51 ? CloseComplete : (
                                    // 3
                                    x === 71 ? CopyInResponse : (
                                      // G
                                      x === 78 ? NoticeResponse : (
                                        // N
                                        x === 72 ? CopyOutResponse : (
                                          // H
                                          x === 99 ? CopyDone : (
                                            // c
                                            x === 73 ? EmptyQueryResponse : (
                                              // I
                                              x === 86 ? FunctionCallResponse : (
                                                // V
                                                x === 118 ? NegotiateProtocolVersion : (
                                                  // v
                                                  x === 87 ? CopyBothResponse : (
                                                    // W
                                                    /* c8 ignore next */
                                                    UnknownMessage
                                                  )
                                                )
                                              )
                                            )
                                          )
                                        )
                                      )
                                    )
                                  )
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    ))(xs);
  }
  function DataRow(x) {
    let index = 7;
    let length2;
    let column;
    let value;
    const row = query.isRaw ? new Array(query.statement.columns.length) : {};
    for (let i = 0; i < query.statement.columns.length; i++) {
      column = query.statement.columns[i];
      length2 = x.readInt32BE(index);
      index += 4;
      value = length2 === -1 ? null : query.isRaw === true ? x.subarray(index, index += length2) : column.parser === void 0 ? x.toString("utf8", index, index += length2) : column.parser.array === true ? column.parser(x.toString("utf8", index + 1, index += length2)) : column.parser(x.toString("utf8", index, index += length2));
      query.isRaw ? row[i] = query.isRaw === true ? value : transform.value.from ? transform.value.from(value, column) : value : row[column.name] = transform.value.from ? transform.value.from(value, column) : value;
    }
    query.forEachFn ? query.forEachFn(transform.row.from ? transform.row.from(row) : row, result) : result[rows++] = transform.row.from ? transform.row.from(row) : row;
  }
  function ParameterStatus(x) {
    const [k, v] = x.toString("utf8", 5, x.length - 1).split(bytes_default.N);
    backendParameters[k] = v;
    if (options.parameters[k] !== v) {
      options.parameters[k] = v;
      onparameter && onparameter(k, v);
    }
  }
  function ReadyForQuery(x) {
    if (query) {
      if (errorResponse) {
        query.retried ? errored(query.retried) : query.prepared && retryRoutines.has(errorResponse.routine) ? retry(query, errorResponse) : errored(errorResponse);
      } else {
        query.resolve(results || result);
      }
    } else if (errorResponse) {
      errored(errorResponse);
    }
    query = results = errorResponse = null;
    result = new Result();
    connectTimer.cancel();
    if (initial) {
      if (target_session_attrs) {
        if (!backendParameters.in_hot_standby || !backendParameters.default_transaction_read_only)
          return fetchState();
        else if (tryNext(target_session_attrs, backendParameters))
          return terminate();
      }
      if (needsTypes) {
        initial.reserve && (initial = null);
        return fetchArrayTypes();
      }
      initial && !initial.reserve && execute(initial);
      options.shared.retries = retries = 0;
      initial = null;
      return;
    }
    while (sent.length && (query = sent.shift()) && (query.active = true, query.cancelled))
      Connection(options).cancel(query.state, query.cancelled.resolve, query.cancelled.reject);
    if (query)
      return;
    connection2.reserved ? !connection2.reserved.release && x[5] === 73 ? ending ? terminate() : (connection2.reserved = null, onopen(connection2)) : connection2.reserved() : ending ? terminate() : onopen(connection2);
  }
  function CommandComplete(x) {
    rows = 0;
    for (let i = x.length - 1; i > 0; i--) {
      if (x[i] === 32 && x[i + 1] < 58 && result.count === null)
        result.count = +x.toString("utf8", i + 1, x.length - 1);
      if (x[i - 1] >= 65) {
        result.command = x.toString("utf8", 5, i);
        result.state = backend;
        break;
      }
    }
    final && (final(), final = null);
    if (result.command === "BEGIN" && max !== 1 && !connection2.reserved)
      return errored(Errors.generic("UNSAFE_TRANSACTION", "Only use sql.begin, sql.reserved or max: 1"));
    if (query.options.simple)
      return BindComplete();
    if (query.cursorFn) {
      result.count && query.cursorFn(result);
      write(Sync);
    }
  }
  function ParseComplete() {
    query.parsing = false;
  }
  function BindComplete() {
    !result.statement && (result.statement = query.statement);
    result.columns = query.statement.columns;
  }
  function ParameterDescription(x) {
    const length2 = x.readUInt16BE(5);
    for (let i = 0; i < length2; ++i)
      !query.statement.types[i] && (query.statement.types[i] = x.readUInt32BE(7 + i * 4));
    query.prepare && (statements[query.signature] = query.statement);
    query.describeFirst && !query.onlyDescribe && (write(prepared(query)), query.describeFirst = false);
  }
  function RowDescription(x) {
    if (result.command) {
      results = results || [result];
      results.push(result = new Result());
      result.count = null;
      query.statement.columns = null;
    }
    const length2 = x.readUInt16BE(5);
    let index = 7;
    let start;
    query.statement.columns = Array(length2);
    for (let i = 0; i < length2; ++i) {
      start = index;
      while (x[index++] !== 0) ;
      const table = x.readUInt32BE(index);
      const number = x.readUInt16BE(index + 4);
      const type = x.readUInt32BE(index + 6);
      query.statement.columns[i] = {
        name: transform.column.from ? transform.column.from(x.toString("utf8", start, index - 1)) : x.toString("utf8", start, index - 1),
        parser: parsers2[type],
        table,
        number,
        type
      };
      index += 18;
    }
    result.statement = query.statement;
    if (query.onlyDescribe)
      return query.resolve(query.statement), write(Sync);
  }
  async function Authentication(x, type = x.readUInt32BE(5)) {
    (type === 3 ? AuthenticationCleartextPassword : type === 5 ? AuthenticationMD5Password : type === 10 ? SASL : type === 11 ? SASLContinue : type === 12 ? SASLFinal : type !== 0 ? UnknownAuth : noop)(x, type);
  }
  async function AuthenticationCleartextPassword() {
    const payload = await Pass();
    write(
      bytes_default().p().str(payload).z(1).end()
    );
  }
  async function AuthenticationMD5Password(x) {
    const payload = "md5" + await md5(
      Buffer.concat([
        Buffer.from(await md5(await Pass() + user)),
        x.subarray(9)
      ])
    );
    write(
      bytes_default().p().str(payload).z(1).end()
    );
  }
  async function SASL() {
    nonce = (await crypto2.randomBytes(18)).toString("base64");
    bytes_default().p().str("SCRAM-SHA-256" + bytes_default.N);
    const i = bytes_default.i;
    write(bytes_default.inc(4).str("n,,n=*,r=" + nonce).i32(bytes_default.i - i - 4, i).end());
  }
  async function SASLContinue(x) {
    const res = x.toString("utf8", 9).split(",").reduce((acc, x2) => (acc[x2[0]] = x2.slice(2), acc), {});
    const saltedPassword = await crypto2.pbkdf2Sync(
      await Pass(),
      Buffer.from(res.s, "base64"),
      parseInt(res.i),
      32,
      "sha256"
    );
    const clientKey = await hmac(saltedPassword, "Client Key");
    const auth = "n=*,r=" + nonce + ",r=" + res.r + ",s=" + res.s + ",i=" + res.i + ",c=biws,r=" + res.r;
    serverSignature = (await hmac(await hmac(saltedPassword, "Server Key"), auth)).toString("base64");
    const payload = "c=biws,r=" + res.r + ",p=" + xor(
      clientKey,
      Buffer.from(await hmac(await sha2562(clientKey), auth))
    ).toString("base64");
    write(
      bytes_default().p().str(payload).end()
    );
  }
  function SASLFinal(x) {
    if (x.toString("utf8", 9).split(bytes_default.N, 1)[0].slice(2) === serverSignature)
      return;
    errored(Errors.generic("SASL_SIGNATURE_MISMATCH", "The server did not return the correct signature"));
    socket.destroy();
  }
  function Pass() {
    return Promise.resolve(
      typeof options.pass === "function" ? options.pass() : options.pass
    );
  }
  function NoData() {
    result.statement = query.statement;
    result.statement.columns = [];
    if (query.onlyDescribe)
      return query.resolve(query.statement), write(Sync);
  }
  function BackendKeyData(x) {
    backend.pid = x.readUInt32BE(5);
    backend.secret = x.readUInt32BE(9);
  }
  async function fetchArrayTypes() {
    needsTypes = false;
    const types2 = await new Query([`
      select b.oid, b.typarray
      from pg_catalog.pg_type a
      left join pg_catalog.pg_type b on b.oid = a.typelem
      where a.typcategory = 'A'
      group by b.oid, b.typarray
      order by b.oid
    `], [], execute);
    types2.forEach(({ oid, typarray }) => addArrayType(oid, typarray));
  }
  function addArrayType(oid, typarray) {
    if (!!options.parsers[typarray] && !!options.serializers[typarray]) return;
    const parser = options.parsers[oid];
    options.shared.typeArrayMap[oid] = typarray;
    options.parsers[typarray] = (xs) => arrayParser(xs, parser, typarray);
    options.parsers[typarray].array = true;
    options.serializers[typarray] = (xs) => arraySerializer(xs, options.serializers[oid], options, typarray);
  }
  function tryNext(x, xs) {
    return x === "read-write" && xs.default_transaction_read_only === "on" || x === "read-only" && xs.default_transaction_read_only === "off" || x === "primary" && xs.in_hot_standby === "on" || x === "standby" && xs.in_hot_standby === "off" || x === "prefer-standby" && xs.in_hot_standby === "off" && options.host[retries];
  }
  function fetchState() {
    const query2 = new Query([`
      show transaction_read_only;
      select pg_catalog.pg_is_in_recovery()
    `], [], execute, null, { simple: true });
    query2.resolve = ([[a], [b2]]) => {
      backendParameters.default_transaction_read_only = a.transaction_read_only;
      backendParameters.in_hot_standby = b2.pg_is_in_recovery ? "on" : "off";
    };
    query2.execute();
  }
  function ErrorResponse(x) {
    if (query) {
      (query.cursorFn || query.describeFirst) && write(Sync);
      errorResponse = Errors.postgres(parseError(x));
    } else {
      errored(Errors.postgres(parseError(x)));
    }
  }
  function retry(q, error2) {
    delete statements[q.signature];
    q.retried = error2;
    execute(q);
  }
  function NotificationResponse(x) {
    if (!onnotify)
      return;
    let index = 9;
    while (x[index++] !== 0) ;
    onnotify(
      x.toString("utf8", 9, index - 1),
      x.toString("utf8", index, x.length - 1)
    );
  }
  async function PortalSuspended() {
    try {
      const x = await Promise.resolve(query.cursorFn(result));
      rows = 0;
      x === CLOSE ? write(Close(query.portal)) : (result = new Result(), write(Execute("", query.cursorRows)));
    } catch (err) {
      write(Sync);
      query.reject(err);
    }
  }
  function CloseComplete() {
    result.count && query.cursorFn(result);
    query.resolve(result);
  }
  function CopyInResponse() {
    stream = new Stream.Writable({
      autoDestroy: true,
      write(chunk2, encoding, callback) {
        socket.write(bytes_default().d().raw(chunk2).end(), callback);
      },
      destroy(error2, callback) {
        callback(error2);
        socket.write(bytes_default().f().str(error2 + bytes_default.N).end());
        stream = null;
      },
      final(callback) {
        socket.write(bytes_default().c().end());
        final = callback;
        stream = null;
      }
    });
    query.resolve(stream);
  }
  function CopyOutResponse() {
    stream = new Stream.Readable({
      read() {
        socket.resume();
      }
    });
    query.resolve(stream);
  }
  function CopyBothResponse() {
    stream = new Stream.Duplex({
      autoDestroy: true,
      read() {
        socket.resume();
      },
      /* c8 ignore next 11 */
      write(chunk2, encoding, callback) {
        socket.write(bytes_default().d().raw(chunk2).end(), callback);
      },
      destroy(error2, callback) {
        callback(error2);
        socket.write(bytes_default().f().str(error2 + bytes_default.N).end());
        stream = null;
      },
      final(callback) {
        socket.write(bytes_default().c().end());
        final = callback;
      }
    });
    query.resolve(stream);
  }
  function CopyData(x) {
    stream && (stream.push(x.subarray(5)) || socket.pause());
  }
  function CopyDone() {
    stream && stream.push(null);
    stream = null;
  }
  function NoticeResponse(x) {
    onnotice ? onnotice(parseError(x)) : console.log(parseError(x));
  }
  function EmptyQueryResponse() {
  }
  function FunctionCallResponse() {
    errored(Errors.notSupported("FunctionCallResponse"));
  }
  function NegotiateProtocolVersion() {
    errored(Errors.notSupported("NegotiateProtocolVersion"));
  }
  function UnknownMessage(x) {
    console.error("Postgres.js : Unknown Message:", x[0]);
  }
  function UnknownAuth(x, type) {
    console.error("Postgres.js : Unknown Auth:", type);
  }
  function Bind(parameters, types2, statement = "", portal = "") {
    let prev, type;
    bytes_default().B().str(portal + bytes_default.N).str(statement + bytes_default.N).i16(0).i16(parameters.length);
    parameters.forEach((x, i) => {
      if (x === null)
        return bytes_default.i32(4294967295);
      type = types2[i];
      parameters[i] = x = type in options.serializers ? options.serializers[type](x) : "" + x;
      prev = bytes_default.i;
      bytes_default.inc(4).str(x).i32(bytes_default.i - prev - 4, prev);
    });
    bytes_default.i16(0);
    return bytes_default.end();
  }
  function Parse(str, parameters, types2, name = "") {
    bytes_default().P().str(name + bytes_default.N).str(str + bytes_default.N).i16(parameters.length);
    parameters.forEach((x, i) => bytes_default.i32(types2[i] || 0));
    return bytes_default.end();
  }
  function Describe(x, name = "") {
    return bytes_default().D().str(x).str(name + bytes_default.N).end();
  }
  function Execute(portal = "", rows2 = 0) {
    return Buffer.concat([
      bytes_default().E().str(portal + bytes_default.N).i32(rows2).end(),
      Flush
    ]);
  }
  function Close(portal = "") {
    return Buffer.concat([
      bytes_default().C().str("P").str(portal + bytes_default.N).end(),
      bytes_default().S().end()
    ]);
  }
  function StartupMessage() {
    return cancelMessage || bytes_default().inc(4).i16(3).z(2).str(
      Object.entries(Object.assign(
        {
          user,
          database,
          client_encoding: "UTF8"
        },
        options.connection
      )).filter(([, v]) => v).map(([k, v]) => k + bytes_default.N + v).join(bytes_default.N)
    ).z(2).end(0);
  }
}
function parseError(x) {
  const error = {};
  let start = 5;
  for (let i = 5; i < x.length - 1; i++) {
    if (x[i] === 0) {
      error[errorFields[x[start]]] = x.toString("utf8", start + 1, i);
      start = i + 1;
    }
  }
  return error;
}
function md5(x) {
  return crypto2.createHash("md5").update(x).digest("hex");
}
function hmac(key, x) {
  return crypto2.createHmac("sha256", key).update(x).digest();
}
function sha2562(x) {
  return crypto2.createHash("sha256").update(x).digest();
}
function xor(a, b2) {
  const length = Math.max(a.length, b2.length);
  const buffer2 = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i++)
    buffer2[i] = a[i] ^ b2[i];
  return buffer2;
}
function timer(fn, seconds) {
  seconds = typeof seconds === "function" ? seconds() : seconds;
  if (!seconds)
    return { cancel: noop, start: noop };
  let timer2;
  return {
    cancel() {
      timer2 && (clearTimeout(timer2), timer2 = null);
    },
    start() {
      timer2 && clearTimeout(timer2);
      timer2 = setTimeout(done, seconds * 1e3, arguments);
    }
  };
  function done(args) {
    fn.apply(null, args);
    timer2 = null;
  }
}

var noop2 = () => {
};
function Subscribe(postgres2, options) {
  const subscribers = /* @__PURE__ */ new Map(), slot = "postgresjs_" + Math.random().toString(36).slice(2), state = {};
  let connection2, stream, ended = false;
  const sql = subscribe.sql = postgres2({
    ...options,
    transform: { column: {}, value: {}, row: {} },
    max: 1,
    fetch_types: false,
    idle_timeout: null,
    max_lifetime: null,
    connection: {
      ...options.connection,
      replication: "database"
    },
    onclose: async function() {
      if (ended)
        return;
      stream = null;
      state.pid = state.secret = void 0;
      connected(await init(sql, slot, options.publications));
      subscribers.forEach((event) => event.forEach(({ onsubscribe }) => onsubscribe()));
    },
    no_subscribe: true
  });
  const end = sql.end, close = sql.close;
  sql.end = async () => {
    ended = true;
    stream && await new Promise((r) => (stream.once("close", r), stream.end()));
    return end();
  };
  sql.close = async () => {
    stream && await new Promise((r) => (stream.once("close", r), stream.end()));
    return close();
  };
  return subscribe;
  async function subscribe(event, fn, onsubscribe = noop2, onerror = noop2) {
    event = parseEvent(event);
    if (!connection2)
      connection2 = init(sql, slot, options.publications);
    const subscriber = { fn, onsubscribe };
    const fns = subscribers.has(event) ? subscribers.get(event).add(subscriber) : subscribers.set(event, /* @__PURE__ */ new Set([subscriber])).get(event);
    const unsubscribe = () => {
      fns.delete(subscriber);
      fns.size === 0 && subscribers.delete(event);
    };
    return connection2.then((x) => {
      connected(x);
      onsubscribe();
      stream && stream.on("error", onerror);
      return { unsubscribe, state, sql };
    });
  }
  function connected(x) {
    stream = x.stream;
    state.pid = x.state.pid;
    state.secret = x.state.secret;
  }
  async function init(sql2, slot2, publications) {
    if (!publications)
      throw new Error("Missing publication names");
    const xs = await sql2.unsafe(
      `CREATE_REPLICATION_SLOT ${slot2} TEMPORARY LOGICAL pgoutput NOEXPORT_SNAPSHOT`
    );
    const [x] = xs;
    const stream2 = await sql2.unsafe(
      `START_REPLICATION SLOT ${slot2} LOGICAL ${x.consistent_point} (proto_version '1', publication_names '${publications}')`
    ).writable();
    const state2 = {
      lsn: Buffer.concat(x.consistent_point.split("/").map((x2) => Buffer.from(("00000000" + x2).slice(-8), "hex")))
    };
    stream2.on("data", data);
    stream2.on("error", error);
    stream2.on("close", sql2.close);
    return { stream: stream2, state: xs.state };
    function error(e) {
      console.error("Unexpected error during logical streaming - reconnecting", e);
    }
    function data(x2) {
      if (x2[0] === 119) {
        parse(x2.subarray(25), state2, sql2.options.parsers, handle, options.transform);
      } else if (x2[0] === 107 && x2[17]) {
        state2.lsn = x2.subarray(1, 9);
        pong();
      }
    }
    function handle(a, b2) {
      const path = b2.relation.schema + "." + b2.relation.table;
      call("*", a, b2);
      call("*:" + path, a, b2);
      b2.relation.keys.length && call("*:" + path + "=" + b2.relation.keys.map((x2) => a[x2.name]), a, b2);
      call(b2.command, a, b2);
      call(b2.command + ":" + path, a, b2);
      b2.relation.keys.length && call(b2.command + ":" + path + "=" + b2.relation.keys.map((x2) => a[x2.name]), a, b2);
    }
    function pong() {
      const x2 = Buffer.alloc(34);
      x2[0] = "r".charCodeAt(0);
      x2.fill(state2.lsn, 1);
      x2.writeBigInt64BE(BigInt(Date.now() - Date.UTC(2e3, 0, 1)) * BigInt(1e3), 25);
      stream2.write(x2);
    }
  }
  function call(x, a, b2) {
    subscribers.has(x) && subscribers.get(x).forEach(({ fn }) => fn(a, b2, x));
  }
}
function Time(x) {
  return new Date(Date.UTC(2e3, 0, 1) + Number(x / BigInt(1e3)));
}
function parse(x, state, parsers2, handle, transform) {
  const char = (acc, [k, v]) => (acc[k.charCodeAt(0)] = v, acc);
  Object.entries({
    R: (x2) => {
      let i = 1;
      const r = state[x2.readUInt32BE(i)] = {
        schema: x2.toString("utf8", i += 4, i = x2.indexOf(0, i)) || "pg_catalog",
        table: x2.toString("utf8", i + 1, i = x2.indexOf(0, i + 1)),
        columns: Array(x2.readUInt16BE(i += 2)),
        keys: []
      };
      i += 2;
      let columnIndex = 0, column;
      while (i < x2.length) {
        column = r.columns[columnIndex++] = {
          key: x2[i++],
          name: transform.column.from ? transform.column.from(x2.toString("utf8", i, i = x2.indexOf(0, i))) : x2.toString("utf8", i, i = x2.indexOf(0, i)),
          type: x2.readUInt32BE(i += 1),
          parser: parsers2[x2.readUInt32BE(i)],
          atttypmod: x2.readUInt32BE(i += 4)
        };
        column.key && r.keys.push(column);
        i += 4;
      }
    },
    Y: () => {
    },
    // Type
    O: () => {
    },
    // Origin
    B: (x2) => {
      state.date = Time(x2.readBigInt64BE(9));
      state.lsn = x2.subarray(1, 9);
    },
    I: (x2) => {
      let i = 1;
      const relation = state[x2.readUInt32BE(i)];
      const { row } = tuples(x2, relation.columns, i += 7, transform);
      handle(row, {
        command: "insert",
        relation
      });
    },
    D: (x2) => {
      let i = 1;
      const relation = state[x2.readUInt32BE(i)];
      i += 4;
      const key = x2[i] === 75;
      handle(
        key || x2[i] === 79 ? tuples(x2, relation.columns, i += 3, transform).row : null,
        {
          command: "delete",
          relation,
          key
        }
      );
    },
    U: (x2) => {
      let i = 1;
      const relation = state[x2.readUInt32BE(i)];
      i += 4;
      const key = x2[i] === 75;
      const xs = key || x2[i] === 79 ? tuples(x2, relation.columns, i += 3, transform) : null;
      xs && (i = xs.i);
      const { row } = tuples(x2, relation.columns, i + 3, transform);
      handle(row, {
        command: "update",
        relation,
        key,
        old: xs && xs.row
      });
    },
    T: () => {
    },
    // Truncate,
    C: () => {
    }
    // Commit
  }).reduce(char, {})[x[0]](x);
}
function tuples(x, columns, xi, transform) {
  let type, column, value;
  const row = transform.raw ? new Array(columns.length) : {};
  for (let i = 0; i < columns.length; i++) {
    type = x[xi++];
    column = columns[i];
    value = type === 110 ? null : type === 117 ? void 0 : column.parser === void 0 ? x.toString("utf8", xi + 4, xi += 4 + x.readUInt32BE(xi)) : column.parser.array === true ? column.parser(x.toString("utf8", xi + 5, xi += 4 + x.readUInt32BE(xi))) : column.parser(x.toString("utf8", xi + 4, xi += 4 + x.readUInt32BE(xi)));
    transform.raw ? row[i] = transform.raw === true ? value : transform.value.from ? transform.value.from(value, column) : value : row[column.name] = transform.value.from ? transform.value.from(value, column) : value;
  }
  return { i: xi, row: transform.row.from ? transform.row.from(row) : row };
}
function parseEvent(x) {
  const xs = x.match(/^(\*|insert|update|delete)?:?([^.]+?\.?[^=]+)?=?(.+)?/i) || [];
  if (!xs)
    throw new Error("Malformed subscribe pattern: " + x);
  const [, command, path, key] = xs;
  return (command || "*") + (path ? ":" + (path.indexOf(".") === -1 ? "public." + path : path) : "") + (key ? "=" + key : "");
}

import Stream2 from "stream";
function largeObject(sql, oid, mode = 131072 | 262144) {
  return new Promise(async (resolve, reject) => {
    await sql.begin(async (sql2) => {
      let finish;
      !oid && ([{ oid }] = await sql2`select lo_creat(-1) as oid`);
      const [{ fd }] = await sql2`select lo_open(${oid}, ${mode}) as fd`;
      const lo = {
        writable,
        readable,
        close: () => sql2`select lo_close(${fd})`.then(finish),
        tell: () => sql2`select lo_tell64(${fd})`,
        read: (x) => sql2`select loread(${fd}, ${x}) as data`,
        write: (x) => sql2`select lowrite(${fd}, ${x})`,
        truncate: (x) => sql2`select lo_truncate64(${fd}, ${x})`,
        seek: (x, whence = 0) => sql2`select lo_lseek64(${fd}, ${x}, ${whence})`,
        size: () => sql2`
          select
            lo_lseek64(${fd}, location, 0) as position,
            seek.size
          from (
            select
              lo_lseek64($1, 0, 2) as size,
              tell.location
            from (select lo_tell64($1) as location) tell
          ) seek
        `
      };
      resolve(lo);
      return new Promise(async (r) => finish = r);
      async function readable({
        highWaterMark = 2048 * 8,
        start = 0,
        end = Infinity
      } = {}) {
        let max = end - start;
        start && await lo.seek(start);
        return new Stream2.Readable({
          highWaterMark,
          async read(size2) {
            const l = size2 > max ? size2 - max : size2;
            max -= size2;
            const [{ data }] = await lo.read(l);
            this.push(data);
            if (data.length < size2)
              this.push(null);
          }
        });
      }
      async function writable({
        highWaterMark = 2048 * 8,
        start = 0
      } = {}) {
        start && await lo.seek(start);
        return new Stream2.Writable({
          highWaterMark,
          write(chunk, encoding, callback) {
            lo.write(chunk).then(() => callback(), callback);
          }
        });
      }
    }).catch(reject);
  });
}

Object.assign(Postgres, {
  PostgresError,
  toPascal,
  pascal,
  toCamel,
  camel,
  toKebab,
  kebab,
  fromPascal,
  fromCamel,
  fromKebab,
  BigInt: {
    to: 20,
    from: [20],
    parse: (x) => BigInt(x),
    // eslint-disable-line
    serialize: (x) => x.toString()
  }
});
var src_default = Postgres;
function Postgres(a, b2) {
  const options = parseOptions(a, b2), subscribe = options.no_subscribe || Subscribe(Postgres, { ...options });
  let ending = false;
  const queries = queue_default(), connecting = queue_default(), reserved = queue_default(), closed = queue_default(), ended = queue_default(), open = queue_default(), busy = queue_default(), full = queue_default(), queues = { connecting, reserved, closed, ended, open, busy, full };
  const connections = [...Array(options.max)].map(() => connection_default(options, queues, { onopen, onend, onclose }));
  const sql = Sql(handler);
  Object.assign(sql, {
    get parameters() {
      return options.parameters;
    },
    largeObject: largeObject.bind(null, sql),
    subscribe,
    CLOSE,
    END: CLOSE,
    PostgresError,
    options,
    reserve,
    listen,
    begin,
    close,
    end
  });
  return sql;
  function Sql(handler2) {
    handler2.debug = options.debug;
    Object.entries(options.types).reduce((acc, [name, type]) => {
      acc[name] = (x) => new Parameter(x, type.to);
      return acc;
    }, typed);
    Object.assign(sql2, {
      types: typed,
      typed,
      unsafe,
      notify,
      array,
      json: json2,
      file
    });
    return sql2;
    function typed(value, type) {
      return new Parameter(value, type);
    }
    function sql2(strings, ...args) {
      const query = strings && Array.isArray(strings.raw) ? new Query(strings, args, handler2, cancel) : typeof strings === "string" && !args.length ? new Identifier(options.transform.column.to ? options.transform.column.to(strings) : strings) : new Builder(strings, args);
      return query;
    }
    function unsafe(string, args = [], options2 = {}) {
      arguments.length === 2 && !Array.isArray(args) && (options2 = args, args = []);
      const query = new Query([string], args, handler2, cancel, {
        prepare: false,
        ...options2,
        simple: "simple" in options2 ? options2.simple : args.length === 0
      });
      return query;
    }
    function file(path, args = [], options2 = {}) {
      arguments.length === 2 && !Array.isArray(args) && (options2 = args, args = []);
      const query = new Query([], args, (query2) => {
        fs.readFile(path, "utf8", (err, string) => {
          if (err)
            return query2.reject(err);
          query2.strings = [string];
          handler2(query2);
        });
      }, cancel, {
        ...options2,
        simple: "simple" in options2 ? options2.simple : args.length === 0
      });
      return query;
    }
  }
  async function listen(name, fn, onlisten) {
    const listener = { fn, onlisten };
    const sql2 = listen.sql || (listen.sql = Postgres({
      ...options,
      max: 1,
      idle_timeout: null,
      max_lifetime: null,
      fetch_types: false,
      onclose() {
        Object.entries(listen.channels).forEach(([name2, { listeners }]) => {
          delete listen.channels[name2];
          Promise.all(listeners.map((l) => listen(name2, l.fn, l.onlisten).catch(() => {
          })));
        });
      },
      onnotify(c, x) {
        c in listen.channels && listen.channels[c].listeners.forEach((l) => l.fn(x));
      }
    }));
    const channels = listen.channels || (listen.channels = {}), exists = name in channels;
    if (exists) {
      channels[name].listeners.push(listener);
      const result2 = await channels[name].result;
      listener.onlisten && listener.onlisten();
      return { state: result2.state, unlisten };
    }
    channels[name] = { result: sql2`listen ${sql2.unsafe('"' + name.replace(/"/g, '""') + '"')}`, listeners: [listener] };
    const result = await channels[name].result;
    listener.onlisten && listener.onlisten();
    return { state: result.state, unlisten };
    async function unlisten() {
      if (name in channels === false)
        return;
      channels[name].listeners = channels[name].listeners.filter((x) => x !== listener);
      if (channels[name].listeners.length)
        return;
      delete channels[name];
      return sql2`unlisten ${sql2.unsafe('"' + name.replace(/"/g, '""') + '"')}`;
    }
  }
  async function notify(channel, payload) {
    return await sql`select pg_notify(${channel}, ${"" + payload})`;
  }
  async function reserve() {
    const queue = queue_default();
    const c = open.length ? open.shift() : await new Promise((resolve, reject) => {
      const query = { reserve: resolve, reject };
      queries.push(query);
      closed.length && connect(closed.shift(), query);
    });
    move(c, reserved);
    c.reserved = () => queue.length ? c.execute(queue.shift()) : move(c, reserved);
    c.reserved.release = true;
    const sql2 = Sql(handler2);
    sql2.release = () => {
      c.reserved = null;
      onopen(c);
    };
    return sql2;
    function handler2(q) {
      c.queue === full ? queue.push(q) : c.execute(q) || move(c, full);
    }
  }
  async function begin(options2, fn) {
    !fn && (fn = options2, options2 = "");
    const queries2 = queue_default();
    let savepoints = 0, connection2, prepare = null;
    try {
      await sql.unsafe("begin " + options2.replace(/[^a-z ]/ig, ""), [], { onexecute }).execute();
      return await Promise.race([
        scope(connection2, fn),
        new Promise((_, reject) => connection2.onclose = reject)
      ]);
    } catch (error) {
      throw error;
    }
    async function scope(c, fn2, name) {
      const sql2 = Sql(handler2);
      sql2.savepoint = savepoint;
      sql2.prepare = (x) => prepare = x.replace(/[^a-z0-9$-_. ]/gi);
      let uncaughtError, result;
      name && await sql2`savepoint ${sql2(name)}`;
      try {
        result = await new Promise((resolve, reject) => {
          const x = fn2(sql2);
          Promise.resolve(Array.isArray(x) ? Promise.all(x) : x).then(resolve, reject);
        });
        if (uncaughtError)
          throw uncaughtError;
      } catch (e) {
        await (name ? sql2`rollback to ${sql2(name)}` : sql2`rollback`);
        throw e instanceof PostgresError && e.code === "25P02" && uncaughtError || e;
      }
      if (!name) {
        prepare ? await sql2`prepare transaction '${sql2.unsafe(prepare)}'` : await sql2`commit`;
      }
      return result;
      function savepoint(name2, fn3) {
        if (name2 && Array.isArray(name2.raw))
          return savepoint((sql3) => sql3.apply(sql3, arguments));
        arguments.length === 1 && (fn3 = name2, name2 = null);
        return scope(c, fn3, "s" + savepoints++ + (name2 ? "_" + name2 : ""));
      }
      function handler2(q) {
        q.catch((e) => uncaughtError || (uncaughtError = e));
        c.queue === full ? queries2.push(q) : c.execute(q) || move(c, full);
      }
    }
    function onexecute(c) {
      connection2 = c;
      move(c, reserved);
      c.reserved = () => queries2.length ? c.execute(queries2.shift()) : move(c, reserved);
    }
  }
  function move(c, queue) {
    c.queue.remove(c);
    queue.push(c);
    c.queue = queue;
    queue === open ? c.idleTimer.start() : c.idleTimer.cancel();
    return c;
  }
  function json2(x) {
    return new Parameter(x, 3802);
  }
  function array(x, type) {
    if (!Array.isArray(x))
      return array(Array.from(arguments));
    return new Parameter(x, type || (x.length ? inferType(x) || 25 : 0), options.shared.typeArrayMap);
  }
  function handler(query) {
    if (ending)
      return query.reject(Errors.connection("CONNECTION_ENDED", options, options));
    if (open.length)
      return go(open.shift(), query);
    if (closed.length)
      return connect(closed.shift(), query);
    busy.length ? go(busy.shift(), query) : queries.push(query);
  }
  function go(c, query) {
    return c.execute(query) ? move(c, busy) : move(c, full);
  }
  function cancel(query) {
    return new Promise((resolve, reject) => {
      query.state ? query.active ? connection_default(options).cancel(query.state, resolve, reject) : query.cancelled = { resolve, reject } : (queries.remove(query), query.cancelled = true, query.reject(Errors.generic("57014", "canceling statement due to user request")), resolve());
    });
  }
  async function end({ timeout = null } = {}) {
    if (ending)
      return ending;
    await 1;
    let timer2;
    return ending = Promise.race([
      new Promise((r) => timeout !== null && (timer2 = setTimeout(destroy, timeout * 1e3, r))),
      Promise.all(connections.map((c) => c.end()).concat(
        listen.sql ? listen.sql.end({ timeout: 0 }) : [],
        subscribe.sql ? subscribe.sql.end({ timeout: 0 }) : []
      ))
    ]).then(() => clearTimeout(timer2));
  }
  async function close() {
    await Promise.all(connections.map((c) => c.end()));
  }
  async function destroy(resolve) {
    await Promise.all(connections.map((c) => c.terminate()));
    while (queries.length)
      queries.shift().reject(Errors.connection("CONNECTION_DESTROYED", options));
    resolve();
  }
  function connect(c, query) {
    move(c, connecting);
    c.connect(query);
    return c;
  }
  function onend(c) {
    move(c, ended);
  }
  function onopen(c) {
    if (queries.length === 0)
      return move(c, open);
    let max = Math.ceil(queries.length / (connecting.length + 1)), ready = true;
    while (ready && queries.length && max-- > 0) {
      const query = queries.shift();
      if (query.reserve)
        return query.reserve(c);
      ready = c.execute(query);
    }
    ready ? move(c, busy) : move(c, full);
  }
  function onclose(c, e) {
    move(c, closed);
    c.reserved = null;
    c.onclose && (c.onclose(e), c.onclose = null);
    options.onclose && options.onclose(c.id);
    queries.length && connect(c, queries.shift());
  }
}
function parseOptions(a, b2) {
  if (a && a.shared)
    return a;
  const env = process.env, o = (!a || typeof a === "string" ? b2 : a) || {}, { url, multihost } = parseUrl(a), query = [...url.searchParams].reduce((a2, [b3, c]) => (a2[b3] = c, a2), {}), host = o.hostname || o.host || multihost || url.hostname || env.PGHOST || "localhost", port = o.port || url.port || env.PGPORT || 5432, user = o.user || o.username || url.username || env.PGUSERNAME || env.PGUSER || osUsername();
  o.no_prepare && (o.prepare = false);
  query.sslmode && (query.ssl = query.sslmode, delete query.sslmode);
  "timeout" in o && (console.log("The timeout option is deprecated, use idle_timeout instead"), o.idle_timeout = o.timeout);
  query.sslrootcert === "system" && (query.ssl = "verify-full");
  const ints = ["idle_timeout", "connect_timeout", "max_lifetime", "max_pipeline", "backoff", "keep_alive"];
  const defaults = {
    max: globalThis.Cloudflare ? 3 : 10,
    ssl: false,
    sslnegotiation: null,
    idle_timeout: null,
    connect_timeout: 30,
    max_lifetime,
    max_pipeline: 100,
    backoff,
    keep_alive: 60,
    prepare: true,
    debug: false,
    fetch_types: true,
    publications: "alltables",
    target_session_attrs: null
  };
  return {
    host: Array.isArray(host) ? host : host.split(",").map((x) => x.split(":")[0]),
    port: Array.isArray(port) ? port : host.split(",").map((x) => parseInt(x.split(":")[1] || port)),
    path: o.path || host.indexOf("/") > -1 && host + "/.s.PGSQL." + port,
    database: o.database || o.db || (url.pathname || "").slice(1) || env.PGDATABASE || user,
    user,
    pass: o.pass || o.password || url.password || env.PGPASSWORD || "",
    ...Object.entries(defaults).reduce(
      (acc, [k, d]) => {
        const value = k in o ? o[k] : k in query ? query[k] === "disable" || query[k] === "false" ? false : query[k] : env["PG" + k.toUpperCase()] || d;
        acc[k] = typeof value === "string" && ints.includes(k) ? +value : value;
        return acc;
      },
      {}
    ),
    connection: {
      application_name: env.PGAPPNAME || "postgres.js",
      ...o.connection,
      ...Object.entries(query).reduce((acc, [k, v]) => (k in defaults || (acc[k] = v), acc), {})
    },
    types: o.types || {},
    target_session_attrs: tsa(o, url, env),
    onnotice: o.onnotice,
    onnotify: o.onnotify,
    onclose: o.onclose,
    onparameter: o.onparameter,
    socket: o.socket,
    transform: parseTransform(o.transform || { undefined: void 0 }),
    parameters: {},
    shared: { retries: 0, typeArrayMap: {} },
    ...mergeUserTypes(o.types)
  };
}
function tsa(o, url, env) {
  const x = o.target_session_attrs || url.searchParams.get("target_session_attrs") || env.PGTARGETSESSIONATTRS;
  if (!x || ["read-write", "read-only", "primary", "standby", "prefer-standby"].includes(x))
    return x;
  throw new Error("target_session_attrs " + x + " is not supported");
}
function backoff(retries) {
  return (0.5 + Math.random() / 2) * Math.min(3 ** retries / 100, 20);
}
function max_lifetime() {
  return 60 * (30 + Math.random() * 30);
}
function parseTransform(x) {
  return {
    undefined: x.undefined,
    column: {
      from: typeof x.column === "function" ? x.column : x.column && x.column.from,
      to: x.column && x.column.to
    },
    value: {
      from: typeof x.value === "function" ? x.value : x.value && x.value.from,
      to: x.value && x.value.to
    },
    row: {
      from: typeof x.row === "function" ? x.row : x.row && x.row.from,
      to: x.row && x.row.to
    }
  };
}
function parseUrl(url) {
  if (!url || typeof url !== "string")
    return { url: { searchParams: /* @__PURE__ */ new Map() } };
  let host = url;
  host = host.slice(host.indexOf("://") + 3).split(/[?/]/)[0];
  host = decodeURIComponent(host.slice(host.indexOf("@") + 1));
  const urlObj = new URL(url.replace(host, host.split(",")[0]));
  return {
    url: {
      username: decodeURIComponent(urlObj.username),
      password: decodeURIComponent(urlObj.password),
      host: urlObj.host,
      hostname: urlObj.hostname,
      port: urlObj.port,
      pathname: urlObj.pathname,
      searchParams: urlObj.searchParams
    },
    multihost: host.indexOf(",") > -1 && host
  };
}
function osUsername() {
  try {
    return os.userInfo().username;
  } catch (_) {
    return process.env.USERNAME || process.env.USER || process.env.LOGNAME;
  }
}

async function handleCt(request) {
  const url = new URL(request.url);
  const domain = (url.searchParams.get("domain") || "").trim().toLowerCase();
  if (!domain) return json({ error: "domain query param required" }, 400);
  if (!/^[a-z0-9.-]+$/.test(domain)) return json({ error: "invalid domain" }, 400);
  const reversedDomain = [...domain].reverse().join("");
  const tsquery = domain + " | " + reversedDomain + ":*";
  const domainSuffix = "%." + domain;
  const sql = src_default({
    host: "crt.sh",
    port: 5432,
    database: "certwatch",
    username: "guest",
    password: "",
    ssl: false,
    max: 1,
    idle_timeout: 0,
    connect_timeout: 10
  });
  try {
    const rows = await sql`
      SELECT
        c.id,
        x509_notbefore(c.certificate)           AS not_before,
        x509_notafter(c.certificate)            AS not_after,
        x509_subjectname(c.certificate)          AS subject,
        x509_issuername(c.certificate)          AS issuer,
        array_agg(DISTINCT lower(san) ORDER BY lower(san)) AS names
      FROM certificate c,
           x509_altnames(c.certificate) AS san
      WHERE identities(c.certificate) @@ to_tsquery('simple', ${tsquery})
        AND (lower(san) = ${domain} OR lower(san) LIKE ${domainSuffix})
      GROUP BY c.id,
               x509_notbefore(c.certificate),
               x509_notafter(c.certificate),
               x509_subjectname(c.certificate),
               x509_issuername(c.certificate)
      ORDER BY x509_notafter(c.certificate) DESC NULLS LAST
      LIMIT 100
    `;
    return json({
      domain,
      certs: rows.map((r) => ({
        id: r.id,
        url: "https://crt.sh/?id=" + r.id,
        not_before: r.not_before,
        not_after: r.not_after,
        subject: r.subject,
        issuer: r.issuer,
        names: r.names
      }))
    });
  } catch (err) {
    console.error("crt.sh query error:", err && err.message || err);
    return json({ error: "crt.sh query failed: " + (err && err.message || String(err)) }, 502);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

var PAGE_SIZE = 50;
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtDate(ts) {
  if (!ts) return "\u2014";
  return new Date(ts).toISOString().slice(0, 10);
}
function simplifyIssuer(dn) {
  if (!dn) return "\u2014";
  const o = (dn.match(/O=([^,]+)/) || [])[1] || "";
  const cn = (dn.match(/CN=([^,]+)/) || [])[1] || "";
  if (o && cn) return o + " \xB7 " + cn;
  return cn || o || dn;
}
async function queryCrtSh(domain, offset) {
  const limit = PAGE_SIZE + 1;
  const reversedDomain = [...domain].reverse().join("");
  const tsquery = domain + " | " + reversedDomain + ":*";
  const domainSuffix = "%." + domain;
  const sql = src_default({
    host: "crt.sh",
    port: 5432,
    database: "certwatch",
    username: "guest",
    password: "",
    ssl: false,
    max: 1,
    idle_timeout: 0,
    connect_timeout: 10
  });
  try {
    return await sql`
      SELECT
        c.id,
        x509_notbefore(c.certificate)   AS not_before,
        x509_notafter(c.certificate)    AS not_after,
        x509_subjectname(c.certificate) AS subject,
        x509_issuername(c.certificate)  AS issuer,
        array_agg(DISTINCT lower(san) ORDER BY lower(san)) AS names
      FROM certificate c,
           x509_altnames(c.certificate) AS san
      WHERE identities(c.certificate) @@ to_tsquery('simple', ${tsquery})
        AND (lower(san) = ${domain} OR lower(san) LIKE ${domainSuffix})
      GROUP BY c.id,
               x509_notbefore(c.certificate),
               x509_notafter(c.certificate),
               x509_subjectname(c.certificate),
               x509_issuername(c.certificate)
      ORDER BY x509_notafter(c.certificate) DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
function pagerHtml(domain, page, hasNext) {
  const hasPrev = page > 1;
  if (!hasPrev && !hasNext) return "";
  const prevHtml = hasPrev ? `<a class="pg-btn" href="/${esc(domain)}?p=${page - 1}">\u2190 Prev</a>` : `<span class="pg-btn off">\u2190 Prev</span>`;
  const nextHtml = hasNext ? `<a class="pg-btn" href="/${esc(domain)}?p=${page + 1}">Next \u2192</a>` : `<span class="pg-btn off">Next \u2192</span>`;
  return `<nav class="pager">${prevHtml}<span class="pg-num">Page ${page}</span>${nextHtml}</nav>`;
}
function renderPage(domain, certs, errMsg, page, hasNext) {
  const now2 = /* @__PURE__ */ new Date();
  let body;
  if (errMsg) {
    body = `<p class="err-box">${esc(errMsg)}</p>`;
  } else if (certs.length === 0 && page === 1) {
    body = `<p class="empty">No certificate transparency records found for <code>${esc(domain)}</code>.</p>`;
  } else {
    const pager = pagerHtml(domain, page, hasNext);
    const cards = certs.map((r) => {
      const notAfter = r.not_after ? new Date(r.not_after) : null;
      const active = notAfter && notAfter > now2;
      const statusHtml = notAfter ? `<span class="badge ${active ? "active" : "expired"}">${active ? "active" : "expired"}</span>` : "";
      const nameTags = (r.names || []).map((n) => `<span class="tag">${esc(n)}</span>`).join("");
      return `<div class="card">
  <div class="card-head">
    <div class="subj-row">
      <span class="subj">${esc(r.subject || "(no subject)")}</span>${statusHtml}
    </div>
    <a class="crt-link" href="https://crt.sh/?id=${esc(String(r.id))}" target="_blank" rel="noopener">#${esc(String(r.id))} \u2197</a>
  </div>
  <dl class="meta">
    <dt>Issuer</dt><dd>${esc(simplifyIssuer(r.issuer))}</dd>
    <dt>Valid</dt><dd>${esc(fmtDate(r.not_before))} \u2192 ${esc(fmtDate(r.not_after))}</dd>
  </dl>${nameTags ? `
  <div class="tags">${nameTags}</div>` : ""}
</div>`;
    }).join("\n");
    body = `<div class="list">${cards}</div>
${pager}`;
  }
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = (page - 1) * PAGE_SIZE + certs.length;
  const subtitle = errMsg ? "Query failed" : page === 1 && !hasNext ? `${certs.length} certificate record${certs.length !== 1 ? "s" : ""} \xB7 sorted by expiry, newest first` : `Records ${start}\u2013${end}${hasNext ? "+" : ""} \xB7 sorted by expiry, newest first`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CT \xB7 ${esc(domain)}${page > 1 ? ` \xB7 p${page}` : ""}</title>
<style>
:root{color-scheme:light dark}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;max-width:860px;margin:0 auto;padding:28px 16px 56px;background:#f5f5f7;color:#1c1c1e;line-height:1.5}
@media(prefers-color-scheme:dark){body{background:#111113;color:#e8e8ed}}

h1{font-size:1.25rem;font-weight:700;margin-bottom:3px;display:flex;align-items:baseline;gap:8px}
h1 code{font-size:1.1rem;font-weight:600;background:#e8e8ed;border-radius:5px;padding:1px 8px;font-family:ui-monospace,monospace}
@media(prefers-color-scheme:dark){h1 code{background:#2c2c2e}}
.sub{color:#888;font-size:.82rem;margin-bottom:24px}

.list{display:flex;flex-direction:column;gap:10px}
.card{background:#fff;border:1px solid #dddde0;border-radius:10px;padding:15px 17px}
@media(prefers-color-scheme:dark){.card{background:#1c1c1e;border-color:#2c2c2e}}

.card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:9px}
.subj-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.subj{font-weight:600;font-size:.88rem;font-family:ui-monospace,monospace;word-break:break-all}
.crt-link{font-size:.77rem;color:#999;text-decoration:none;white-space:nowrap;flex-shrink:0}
.crt-link:hover{color:#1a73e8;text-decoration:underline}
@media(prefers-color-scheme:dark){.crt-link:hover{color:#7baaf7}}

.badge{display:inline-block;border-radius:12px;padding:1px 8px;font-size:.71rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.badge.active{background:#e6f4ea;color:#137333}
.badge.expired{background:#fce8e6;color:#c5221f}
@media(prefers-color-scheme:dark){.badge.active{background:#0f2a19;color:#81c995}.badge.expired{background:#2e1111;color:#f28b82}}

.meta{display:grid;grid-template-columns:auto 1fr;gap:3px 13px;font-size:.81rem}
.meta dt{color:#888;white-space:nowrap}
.meta dd{word-break:break-all}

.tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}
.tag{background:#e8f0fe;color:#1558b0;border-radius:4px;padding:2px 7px;font-size:.74rem;font-family:ui-monospace,monospace}
@media(prefers-color-scheme:dark){.tag{background:#1b2c4a;color:#7baaf7}}

.pager{display:flex;align-items:center;gap:10px;margin-top:20px}
.pg-btn{display:inline-block;padding:6px 15px;border-radius:7px;font-size:.83rem;text-decoration:none;background:#e8e8ed;color:#1c1c1e;font-weight:500}
.pg-btn:hover{background:#d0d0d5}
.pg-btn.off{opacity:.35;pointer-events:none}
@media(prefers-color-scheme:dark){.pg-btn{background:#2c2c2e;color:#e8e8ed}.pg-btn:hover{background:#3a3a3e}}
.pg-num{font-size:.83rem;color:#888}

.err-box{color:#c5221f;background:#fce8e6;border-radius:8px;padding:13px 16px;font-size:.87rem}
@media(prefers-color-scheme:dark){.err-box{background:#2e1111;color:#f28b82}}
.empty{color:#888;padding:12px 0;font-size:.88rem}
code{font-family:ui-monospace,monospace}

footer{margin-top:32px;font-size:.74rem;color:#aaa}
footer a{color:inherit;text-decoration:none}
footer a:hover{text-decoration:underline}
</style>
</head>
<body>
<h1>CT Records \xB7 <code>${esc(domain)}</code></h1>
<p class="sub">${esc(subtitle)}</p>
${body}
<footer>Data via <a href="https://crt.sh/?q=${encodeURIComponent(domain)}" target="_blank" rel="noopener">crt.sh</a> Certificate Transparency search</footer>
</body>
</html>`;
}
async function handleCtPage(request, domain) {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("p") || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  let rows = [];
  let errMsg = null;
  try {
    rows = await queryCrtSh(domain, offset);
  } catch (e) {
    console.error("ct-page crt.sh error:", e && e.message || e);
    errMsg = "crt.sh query failed: " + (e && e.message || String(e));
  }
  const hasNext = rows.length > PAGE_SIZE;
  const certs = rows.slice(0, PAGE_SIZE);
  return new Response(renderPage(domain, certs, errMsg, page, hasNext), {
    status: errMsg ? 502 : 200,
    headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store" }
  });
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
async function apiListAcmeDirectories(env) {
  const builtinCa = builtinCaName(env);
  const rows = Object.entries(availableDirectories(env)).map(([name, d]) => ({ name, directory_url: d.url, eab_required: d.eab, builtin: name === builtinCa }));
  return json(rows);
}
async function apiListAcmeAccounts(env) {
  await ensureBuiltinCaAccount(env);
  const rows = (await env.DATA.prepare(
    `SELECT id, directory_name, kid, created_at FROM acme_accounts ORDER BY id`
  ).all()).results || [];
  const avail = availableDirectories(env);
  const kept = rows.filter((r) => avail[r.directory_name]);
  for (const r of kept) {
    r.eab_required = avail[r.directory_name].eab;
  }
  return json(kept);
}
function randHex(n) {
  const b2 = new Uint8Array(n / 2);
  crypto.getRandomValues(b2);
  return Array.from(b2, (x) => x.toString(16).padStart(2, "0")).join("");
}
async function apiCreateAcmeAccount(env, body) {
  if (!body.directory_name || !availableDirectories(env)[body.directory_name]) {
    return json({ error: "directory_name required (must be a CA available in this deployment)" }, 400);
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
  const builtinCa = builtinCaName(env);
  if (a.directory_name === builtinCa) {
    return json({ error: `${builtinCa} is the built-in CA, managed automatically and cannot be removed.` }, 400);
  }
  await env.DATA.prepare(
    `UPDATE cert_confs SET primary_acme_directory_name = ?
      WHERE deleted_at IS NULL
        AND id IN (
          SELECT conf_id FROM certs
           WHERE acme_directory_name = ?
             AND id IN (SELECT MAX(id) FROM certs GROUP BY conf_id)
        )`
  ).bind(builtinCa, a.directory_name).run();
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
  if (!availableDirectories(env)[body.primary_acme_directory_name]) {
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
    if (!availableDirectories(env)[name]) return json({ error: `unknown CA: ${name}` }, 400);
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
    const builtinCa = builtinCaName(env);
    await env.DATA.prepare("DELETE FROM zones").run();
    await env.DATA.prepare("DELETE FROM dns_accounts").run();
    await env.DATA.prepare("DELETE FROM acme_accounts").run();
    try {
      await ensureBuiltinCaAccount(env);
    } catch (e) {
      console.warn("purge: built-in CA rebootstrap failed:", e.message || e);
    }
    await env.DATA.prepare(
      `UPDATE cert_confs SET primary_acme_directory_name = ?
        WHERE deleted_at IS NULL AND primary_acme_directory_name != ?`
    ).bind(builtinCa, builtinCa).run();
  } else if (scope === "all") {
    const tables = ["job_logs", "jobs", "certs", "cert_confs", "zones", "dns_accounts", "acme_accounts"];
    for (const t of tables) await env.DATA.prepare(`DROP TABLE IF EXISTS ${t}`).run();
    await ensureSchema(env);
    await ensureBuiltinCaAccount(env);
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
    const dirDef = availableDirectories(env)[cert.acme_directory_name];
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
    const size2 = f.data.length;
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
    dv.setUint32(18, size2, true);
    dv.setUint32(22, size2, true);
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
    dv2.setUint32(20, size2, true);
    dv2.setUint32(24, size2, true);
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
function tarHeader(name, size2) {
  if (name.length > 100) throw new Error("tar: filename too long");
  const hdr = new Uint8Array(512);
  const te = new TextEncoder();
  hdr.set(te.encode(name), 0);
  hdr.set(te.encode("0000644\0"), 100);
  hdr.set(te.encode("0000000\0"), 108);
  hdr.set(te.encode("0000000\0"), 116);
  hdr.set(te.encode(size2.toString(8).padStart(11, "0") + "\0"), 124);
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
<script>window.LOCK_CONFIG={"unlockPath":"/unlock","appNameI18n":{"en":"MixSSL","eo":"MixSSL","fr":"MixSSL","de":"MixSSL","es":"MixSSL","it":"MixSSL","nl":"MixSSL","da":"MixSSL","zh-cn":"\u6DF7\u642D\u8BC1\u4E66","zh-tw":"\u6DF7\u642D\u6191\u8B49","ja":"MixSSL","ko":"MixSSL","ms":"MixSSL","vi":"MixSSL","th":"MixSSL","ta":"MixSSL","my":"MixSSL","uk":"MixSSL","he":"MixSSL","ar":"MixSSL"}};</script><script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/lock/client.min.js"></script>
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
function resolveBindings(rawEnv) {
  const env = rawEnv || {};
  if (env.DATA && typeof env.DATA.prepare === "function") return env;
  if (env.DATA) {
    return { ...env, DATA: makeD1Binding({ driver: makeSqldDriver({ url: env.DATA }) }), __selfHost: true };
  }
  return env;
}
async function runCron(env, cronStr) {
  try {
    await ensureSchema(env);
    await ensureBuiltinCaAccount(env);
  } catch (e) {
    console.error("cron: schema init failed (includes built-in CA bootstrap)", e);
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
  if ((cronStr || "").startsWith("0 0 ") || new Date(t * 1e3).getUTCHours() === 0 && new Date(t * 1e3).getUTCMinutes() === 0) {
    try {
      await scanAndCreateRenewals(env);
    } catch (e) {
      console.error("renewal scan failed", e);
    }
  }
}
var schemaReady = false;
var index_default = {
  async fetch(request, rawEnv, _ctx) {
    const env = resolveBindings(rawEnv);
    if (!schemaReady) {
      try {
        await ensureSchema(env);
        await ensureBuiltinCaAccount(env);
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
    if (method === "POST" && path === "/_cron") {
      if (!env.CRON) return new Response("Not Found", { status: 404 });
      const auth = request.headers.get("Authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!timingSafeEqual(token, env.CRON)) return json({ error: lockModule.errorCode }, 401);
      await runCron(env, "");
      return json({ ok: true });
    }
    if (method === "GET" && path === "/api/ct") return handleCt(request);
    {
      const dm = method === "GET" && path.match(/^\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})$/i);
      if (dm) return handleCtPage(request, dm[1].toLowerCase());
    }
    const authed = await lockModule.isAuthorized(request, env);
    if (!authed) {
      if (method === "GET" && (path === "/" || path.startsWith("/index"))) {
        return lockModule.renderLockPage(selectJsdelivrCdnHost(request));
      }
      return json({ error: lockModule.errorCode }, 401);
    }
    try {
      await ensureSchema(env);
      await ensureBuiltinCaAccount(env);
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
    if (method === "GET" && path === "/api/acme-directories") return apiListAcmeDirectories(env);
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
  async scheduled(event, rawEnv, _ctx) {
    await runCron(resolveBindings(rawEnv), event && event.cron || "");
  }
};
export {
  index_default as default
};
