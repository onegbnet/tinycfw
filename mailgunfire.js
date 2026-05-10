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

var { json, html, text } = makeResponseHelpers();

var main_default = `<!DOCTYPE html>
<html lang="en" data-theme="{{THEME}}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mailgun Fire</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='6 8 22 20' fill='none' stroke='rgb(59,130,246)' stroke-width='2'><path d='M8 10h16v2H8zm0 5h12l4 4v5a2 2 0 01-2 2H10a2 2 0 01-2-2v-9z'/><path d='M8 15h12l4 4'/></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://{{CDN_HOST}}/npm/markdown-it@14/dist/markdown-it.min.js"></script>
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/overlay/style.min.css">
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@4adbd0b090db5384e84e801f87aa9dc4a91bc496/mailgunfire/view.min.css">
</head>
<body>
<div style="width:100%;max-width:680px">
<div class="card">
  <div class="card-header">
    <div class="card-header-left">
      <div class="logo-icon">
        <svg width="28" height="28" viewBox="0 0 32 32">
          <path d="M8 10h16v2H8zm0 5h12l4 4v5a2 2 0 01-2 2H10a2 2 0 01-2-2v-9z" fill="none" stroke="white" stroke-width="1.5"/>
          <path d="M8 15h12l4 4" fill="none" stroke="white" stroke-width="1.5"/>
        </svg>
      </div>
      <div>
        <h1 id="app-title">Mailgun Fire</h1>
        <div class="subtitle" id="hdr-sub" data-i18n="hdr_sub">Fire Your Mailgun</div>
      </div>
    </div>
    <div class="header-right">
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

      <button type="button" class="logout-btn" id="logoutBtn" style="display:none">&#x1F512; <span data-i18n="btn_logout">Logout</span></button>
    </div>
  </div>

  <form id="mailForm">
    <div class="row">
      <div>
        <label class="field-label" data-i18n="label_from">FROM</label>
        <div class="input-group">
          <input type="text" id="sender" value="{{DEFAULT_SENDER}}">
          <span class="suffix">@{{DOMAIN}}</span>
        </div>
      </div>
      <div>
        <label class="field-label" data-i18n="label_display">DISPLAY NAME</label>
        <input type="text" id="display" value="{{DEFAULT_DISPLAY}}" data-i18n-ph="ph_display" placeholder="Display name">
      </div>
    </div>

    <div class="section-divider"></div>

    <div>
      <label class="field-label" data-i18n="label_to">TO</label>
      <div class="tag-input-wrap" id="toWrap">
        <input class="tag-text" data-i18n-ph="ph_email" placeholder="email@example.com">
      </div>
      <div class="hint" data-i18n="hint_email">Press Enter, Tab, or comma to add</div>
    </div>

    <div>
      <label class="field-label" data-i18n="label_cc">CC</label>
      <div class="tag-input-wrap" id="ccWrap">
        <input class="tag-text" data-i18n-ph="ph_email" placeholder="email@example.com">
      </div>
    </div>

    <div>
      <label class="field-label" data-i18n="label_bcc">BCC</label>
      <div class="tag-input-wrap" id="bccWrap">
        <input class="tag-text" data-i18n-ph="ph_email" placeholder="email@example.com">
      </div>
    </div>

    <div class="section-divider"></div>

    <div>
      <label class="field-label" data-i18n="label_subject">SUBJECT</label>
      <input type="text" id="subject" data-i18n-ph="ph_subject" placeholder="Email subject">
    </div>

    <div>
      <div class="label-row">
        <label class="field-label" data-i18n="label_attachments">ATTACHMENTS</label>
        <span class="att-size-label" id="attSizeLabel"></span>
      </div>
      <div class="att-wrap" id="attWrap">
        <input type="file" id="attInput" multiple hidden>
        <button type="button" class="att-add-btn" id="attAddBtn">&#128206; <span data-i18n="btn_add_file">Add files</span></button>
      </div>
    </div>

    <div>
      <div class="label-row">
        <label class="field-label" data-i18n="label_body">BODY</label>
        <label class="save-toggle" id="saveSentWrap" style="display:none">
          <input type="checkbox" id="saveSent" checked>
          <span data-i18n="save_sent">Save to sent</span>
        </label>
      </div>
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
  <textarea id="mdPane" class="mde-textarea" placeholder="Compose your email..."></textarea>
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

    </div>

    <div id="status"></div>

    <div class="btn-row">
      <button type="button" class="btn-secondary" id="sentOpenBtn" style="display:none">&#128229; <span data-i18n="sent_history">View Sent</span></button>
      <button type="submit" class="btn-primary" id="sendBtn">&#9993; <span data-i18n="btn_send">Send</span></button>
    </div>
  </form>
</div>
<footer style="text-align:center;padding:1rem 0;font-size:.75rem;color:var(--footer-color,inherit)">\xA9 <span id="footerYear"></span> <a href="https://go.gb.net/gaobo" target="_blank" style="color:var(--footer-color,inherit);text-decoration:none;border-bottom:1px dashed var(--footer-border,currentColor)"><img src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/gaobo.png" alt="" style="height:20px;vertical-align:middle;margin:0 2px;"><span id="footerBrand"></span></a> <span id="footerProd"></span> <a href="https://github.com/onegbnet/tinyutils/blob/master/LICENSE" target="_blank" style="color:var(--footer-color,inherit);text-decoration:none;border-bottom:1px dashed var(--footer-border,currentColor)">MIT License</a></footer>

</div>

<!-- Drawer content host: hidden until openDrawer() moves children into the
     Overlay-owned .drawer shell. Move-on-open / move-back-on-close preserves
     event listeners attached at module init. Footer button stays in
     drawerFooterHost, slid into the shell by setFooter() when needed. -->
<div id="drawerHost" hidden>
  <div id="drawerList"></div>
  <div id="drawerDetail" style="display:none"></div>
</div>
<div id="drawerFooterHost" hidden>
  <button id="batchDeleteBtn" data-i18n="btn_delete">Delete selected</button>
</div>

<script>
// Outer-script shim: declare placeholder vars BEFORE any IIFE so esbuild's
// constant-fold (in the cross-origin client.min.js) sees free vars rather
// than literal-vs-literal equalities. (See CLAUDE.md \xA77 esbuild IIFE
// constant-folds occurrence.) These bools are read by the IIFE's
// \`=== "true"\` checks.
var KV_BOUND_RAW = "{{KV_BOUND}}";
var LOCKED_RAW = "{{LOCKED}}";
</script>

<!-- CDN-served browser modules \u2014 load order matters: i18n-engine first
     (provides global helpers used downstream); action before overlay
     (overlay's modal sugar refs window.Action); field separately; theme
     self-contained (storage-free now \u2014 reads <html data-theme>). All
     parser-blocking, executed in source order. -->
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
<script>window.MDE_CONFIG={"textareaId":"mdPane","trimReturn":false};window.MDE_I18N_OVERRIDES={"md_placeholder":"Compose your email..."};</script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/markdown-editor/client.min.js"></script>

<!-- mg's own bulk: dist/client.min.js shipped via jsDelivr (replaces
     the old inline app-script block). Reads outer-script free vars
     KV_BOUND_RAW / LOCKED_RAW + window globals from CDN modules above. -->
<script src="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@4adbd0b090db5384e84e801f87aa9dc4a91bc496/mailgunfire/client.min.js"></script>
</body>
</html>
`;

function getConfig(env) {
  const domain = env.DOMAIN || "";
  const apiKey = env.KEY || "";
  const login = env.FROM || "noreply";
  const display = env.DISPLAY || "";
  const eu = env.EU !== void 0 && env.EU !== "";
  if (!domain) return { error: "DOMAIN not configured" };
  if (!apiKey) return { error: "KEY not configured" };
  return { domain, apiKey, login, display, eu };
}
function isValidLock(val) {
  return typeof val === "string" && /^[\x21-\x7e]{3,64}$/.test(val);
}
function isValidTtl(val) {
  const n = parseInt(val, 10);
  return !isNaN(n) && n >= 60 && String(n) === String(val).trim();
}

function handleGet(env, cdnHost, theme) {
  const cfg = getConfig(env);
  if (cfg.error) return json({ error: cfg.error }, 500);
  const kvBound = env.SENT ? "true" : "false";
  const locked = isValidLock(env.LOCK) ? "true" : "false";
  const body = main_default.replace(/\{\{CDN_HOST\}\}/g, cdnHost).replace(/\{\{KV_BOUND\}\}/g, kvBound).replace(/\{\{LOCKED\}\}/g, locked).replace(/\{\{THEME\}\}/g, theme).replace(/\{\{DOMAIN\}\}/g, cfg.domain).replace(/\{\{DEFAULT_SENDER\}\}/g, cfg.login).replace(/\{\{DEFAULT_DISPLAY\}\}/g, cfg.display);
  return html(body);
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

function isValidLock2(val) {
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
    if (!isValidLock2(env.LOCK)) {
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
    if (!isValidLock2(env.LOCK)) return true;
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
    isValidLock: isValidLock2,
    hashToken: (pw) => hashToken(hashPrefix, pw),
    safeEqual,
    handleUnlock,
    isAuthorized,
    renderLockPage,
    apiBypass,
    slugBypass
  };
}

var ATT_TOTAL_MAX = 20 * 1e3 * 1e3;
var RESERVE_TTL = 3600;
var UPLOAD_TOKEN_LEN = 24;
var upload = makeUploadModule({
  chunkSize: 10 * 1024 * 1024,
  totalMax: ATT_TOTAL_MAX,
  fileNameMax: 255,
  fileMimeMax: 128
});
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function generateUploadToken() {
  const bytes = new Uint8Array(UPLOAD_TOKEN_LEN / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function handleSendReserve(request, env) {
  const cfg = getConfig(env);
  if (cfg.error) return json({ error: cfg.error }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const sender = (body.sender || cfg.login || "").trim();
  const display = (body.display || cfg.display || "").trim();
  const to = (body.to || "").trim();
  const cc = (body.cc || "").trim();
  const bcc = (body.bcc || "").trim();
  const subject = (body.subject || "").trim();
  const bodyMd = body.body || "";
  const html2 = body.html || "";
  const saveSent = body.save_sent !== false;
  const filesIn = Array.isArray(body.files) ? body.files : [];
  if (!to) return json({ error: "to is required" }, 400);
  if (!subject) return json({ error: "subject is required" }, 400);
  if (!bodyMd) return json({ error: "body is required" }, 400);
  const plan = upload.planFiles(filesIn, { startOffset: 0, startId: 0 });
  if (plan.error) return json({ error: plan.error }, 400);
  if (plan.sessionBytes > upload.totalMax) {
    return json({ error: "Total attachments exceed 20 MB" }, 413);
  }
  const id = generateId();
  const uploadToken = generateUploadToken();
  const pendingEntry = {
    type: "pending-send",
    uploadToken,
    pendingSession: { sessionStart: 0, sessionBytes: plan.sessionBytes },
    pendingFiles: plan.files,
    email: { sender, display, to, cc, bcc, subject, body: bodyMd, html: html2, saveSent },
    ts: Date.now()
  };
  await env.SENT.put(id, JSON.stringify(pendingEntry), { expirationTtl: RESERVE_TTL });
  return json({
    uploadKey: id,
    uploadToken,
    chunkSize: upload.chunkSize,
    chunks: upload.sessionChunkPlan(0, plan.sessionBytes)
  }, 201);
}
async function handleSendChunk(request, env, url, id) {
  if (!id || !/^[a-z0-9]+$/i.test(id)) return json({ error: "INVALID_ID" }, 400);
  const token = request.headers.get("X-Upload-Token") || "";
  const chunkIdxStr = url.searchParams.get("c");
  const chunkIdx = Math.floor(Number(chunkIdxStr));
  if (!Number.isFinite(chunkIdx) || chunkIdx < 0) {
    return json({ error: "INVALID_CHUNK_INDEX" }, 400);
  }
  const raw = await env.SENT.get(id);
  if (!raw) return json({ error: "NOT_FOUND" }, 404);
  const entry = JSON.parse(raw);
  if (entry.type !== "pending-send") return json({ error: "NOT_PENDING" }, 400);
  if (!entry.uploadToken || !await safeEqual(entry.uploadToken, token)) {
    return json({ error: "UPLOAD_TOKEN_INVALID" }, 403);
  }
  const ps = entry.pendingSession;
  const expected = upload.expectedChunkSize(chunkIdx, ps.sessionStart, ps.sessionBytes);
  if (expected === null) return json({ error: "CHUNK_OUT_OF_RANGE" }, 400);
  const buf = await request.arrayBuffer();
  const finalTtl = isValidTtl(env.TTL) ? parseInt(env.TTL, 10) : 0;
  const ttl = finalTtl > 0 ? Math.max(RESERVE_TTL, finalTtl) : RESERVE_TTL;
  const r = await upload.writeChunk(env.SENT, id, chunkIdx, buf, {
    expectedSize: expected,
    ttl
  });
  if (r.error) return json(r, 400);
  return json({ ok: true });
}
async function handleSendCommit(request, env, id) {
  if (!id || !/^[a-z0-9]+$/i.test(id)) return json({ error: "INVALID_ID" }, 400);
  const token = request.headers.get("X-Upload-Token") || "";
  const raw = await env.SENT.get(id);
  if (!raw) return json({ error: "NOT_FOUND" }, 404);
  const entry = JSON.parse(raw);
  if (entry.type !== "pending-send") return json({ error: "NOT_PENDING" }, 400);
  if (!entry.uploadToken || !await safeEqual(entry.uploadToken, token)) {
    return json({ error: "UPLOAD_TOKEN_INVALID" }, 403);
  }
  const ps = entry.pendingSession;
  const range = upload.sessionChunks(ps.sessionStart, ps.sessionBytes);
  if (range) {
    const missing = await upload.verifyAllChunks(env.SENT, id, range.firstChunk, range.lastChunk);
    if (missing.length) return json({ error: "COMMIT_INCOMPLETE", missing }, 400);
  }
  const cfg = getConfig(env);
  if (cfg.error) return json({ error: cfg.error }, 500);
  const em = entry.email;
  const fromAddr = em.display ? `${em.display} <${em.sender}@${cfg.domain}>` : `${em.sender}@${cfg.domain}`;
  const mgForm = new FormData();
  mgForm.append("from", fromAddr);
  mgForm.append("to", em.to);
  if (em.cc) mgForm.append("cc", em.cc);
  if (em.bcc) mgForm.append("bcc", em.bcc);
  mgForm.append("subject", em.subject);
  mgForm.append("text", em.body);
  mgForm.append("html", em.html || em.body);
  for (const file of entry.pendingFiles) {
    const bytes = await upload.readFile(env.SENT, id, file);
    if (!bytes) return json({ error: "CHUNK_READ_FAILED", fileId: file.id }, 500);
    mgForm.append("attachment", new Blob([bytes], { type: file.mime }), file.name);
  }
  const apiBase = cfg.eu ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
  const mgUrl = `${apiBase}/v3/${cfg.domain}/messages`;
  const authHeader = "Basic " + btoa("api:" + cfg.apiKey);
  let mgResp;
  try {
    mgResp = await fetch(mgUrl, {
      method: "POST",
      headers: { Authorization: authHeader },
      body: mgForm
    });
  } catch (err) {
    return json({ error: "Mailgun request failed: " + err.message }, 502);
  }
  const mgBody = await mgResp.text();
  let mgJson;
  try {
    mgJson = JSON.parse(mgBody);
  } catch {
    mgJson = { message: mgBody };
  }
  if (!mgResp.ok) {
    return json({ error: mgJson.message || "Mailgun error", status: mgResp.status }, mgResp.status);
  }
  const finalTtl = isValidTtl(env.TTL) ? parseInt(env.TTL, 10) : 0;
  const kvOpts = {};
  if (finalTtl > 0) kvOpts.expirationTtl = finalTtl;
  if (em.saveSent) {
    const newCommittedChunkEnd = upload.nextSessionStart(ps.sessionStart + ps.sessionBytes) / upload.chunkSize;
    const sentRecord = {
      id,
      from: fromAddr,
      to: em.to,
      cc: em.cc,
      bcc: em.bcc,
      subject: em.subject,
      body: em.body,
      files: entry.pendingFiles,
      committedChunkEnd: newCommittedChunkEnd,
      ts: Date.now()
    };
    await env.SENT.put("sent:" + id, JSON.stringify(sentRecord), kvOpts);
    await env.SENT.delete(id);
  } else {
    if (range) {
      await upload.deleteAllChunks(env.SENT, id, range.firstChunk, range.lastChunk);
    }
    await env.SENT.delete(id);
  }
  return json({ success: true, message: mgJson.message || "Queued", id });
}

async function handleSentList(env, url) {
  if (!env.SENT) return json({ items: [], error: "KV not bound" });
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const cursor = url.searchParams.get("cursor") || void 0;
  const listResult = await env.SENT.list({ prefix: "sent:", limit, cursor });
  const items = [];
  for (const key of listResult.keys) {
    const val = await env.SENT.get(key.name);
    if (val) {
      try {
        items.push(JSON.parse(val));
      } catch {
      }
    }
  }
  return json({
    items,
    cursor: listResult.list_complete ? null : listResult.cursor
  });
}
async function handleSentDetail(env, id) {
  if (!env.SENT) return json({ error: "KV not bound" }, 404);
  const val = await env.SENT.get("sent:" + id);
  if (!val) return json({ error: "Not found" }, 404);
  return new Response(val, {
    headers: { "Content-Type": "application/json" }
  });
}
async function handleAttachment(env, id, idx) {
  if (!env.SENT) return text("KV not bound", 404);
  if (!/^[a-z0-9]+$/i.test(id) || !/^\d+$/.test(idx)) return text("Bad request", 400);
  const recRaw = await env.SENT.get("sent:" + id);
  if (!recRaw) return text("Not found", 404);
  let rec;
  try {
    rec = JSON.parse(recRaw);
  } catch {
    return text("Corrupt record", 500);
  }
  const i = parseInt(idx, 10);
  const file = Array.isArray(rec.files) ? rec.files[i] : null;
  if (!file) return text("Not found", 404);
  const bytes = await upload.readFile(env.SENT, id, file);
  if (!bytes) return text("Attachment expired", 404);
  const safeName = (file.name || "attachment").replace(/["\r\n]/g, "_");
  return new Response(bytes, {
    headers: {
      "Content-Type": file.mime || "application/octet-stream",
      "Content-Disposition": 'attachment; filename="' + safeName + `"; filename*=UTF-8''` + encodeURIComponent(file.name || "attachment"),
      "Content-Length": String(file.size || bytes.byteLength),
      "Cache-Control": "private, no-store"
    }
  });
}
async function handleSentDelete(request, env) {
  if (!env.SENT) return json({ error: "KV not bound" }, 400);
  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const ids = input.ids || [];
  for (const id of ids) {
    const raw = await env.SENT.get("sent:" + id);
    if (raw) {
      try {
        const rec = JSON.parse(raw);
        const committedEnd = rec.committedChunkEnd || 0;
        if (committedEnd > 0) {
          await upload.deleteAllChunks(env.SENT, id, 0, committedEnd - 1);
        }
      } catch {
      }
    }
    await env.SENT.delete("sent:" + id);
  }
  return json({ success: true, deleted: ids.length });
}

var VALID_THEMES = /* @__PURE__ */ new Set(["light", "dark"]);
async function handlePrefs(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const headers = {};
  let setCookies = [];
  if (typeof body.theme === "string") {
    if (!VALID_THEMES.has(body.theme)) {
      return json({ error: "Invalid theme" }, 400);
    }
    setCookies.push(buildSetCookie("theme", body.theme, {
      maxAge: 31536e3,
      // 1 year
      sameSite: "Lax"
    }));
  }
  if (setCookies.length === 0) {
    return json({ error: "No prefs to update" }, 400);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": setCookies.join(", ")
    }
  });
}

var LOCK_PAGE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mailgun Fire</title>
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
  <h1 id="lockTitle">Mailgun Fire</h1>
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
<script>
<script>window.LOCK_CONFIG={"unlockPath":"/unlock","appNameI18n":{"en":"Mailgun Fire","eo":"Mailgun Fire","fr":"Mailgun Fire","de":"Mailgun Fire","es":"Mailgun Fire","it":"Mailgun Fire","nl":"Mailgun Fire","da":"Mailgun Fire","zh-cn":"\u5F00\u706B\u90AE\u4EF6","zh-tw":"\u958B\u706B\u90F5\u4EF6","ja":"Mailgun Fire","ko":"Mailgun Fire","ms":"Mailgun Fire","vi":"Mailgun Fire","th":"Mailgun Fire","ta":"Mailgun Fire","my":"Mailgun Fire","uk":"Mailgun Fire","he":"Mailgun Fire","ar":"Mailgun Fire"}};</script><script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@7191554f0b83eb52aea9a9d22303ba026d4820f4/lock/client.min.js"></script>
</script>
</body></html>
`;
var lock = makeLockModule({
  cookieName: "mgfr_auth",
  hashPrefix: "mgfr:",
  unlockPath: "/unlock",
  appName: "Mailgun Fire",
  errorCode: "Unauthorized",
  // mailgunfire keeps sentence-case error codes
  lockPageHtml: LOCK_PAGE_HTML
});
var lockModule = lock;

var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const cdnHost = selectJsdelivrCdnHost(request);
    const themeCookie = getCookie(request, "theme");
    const theme = themeCookie === "dark" ? "dark" : "light";
    if (method === "POST" && path === lockModule.unlockPath) {
      return lockModule.handleUnlock(request, env);
    }
    if (method === "POST" && path === "/logout") {
      return json({ ok: true }, 200, {
        "Set-Cookie": `${lockModule.cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
      });
    }
    if (!await lockModule.isAuthorized(request, env)) {
      if (method === "GET" && path === "/") {
        return lockModule.renderLockPage(cdnHost);
      }
      return json({ error: lockModule.errorCode }, 401);
    }
    if (method === "GET" && path === "/") {
      return handleGet(env, cdnHost, theme);
    }
    if (method === "POST" && path === "/api/prefs") {
      return handlePrefs(request);
    }
    if (method === "POST" && path === "/send/reserve") {
      return handleSendReserve(request, env);
    }
    if (method === "PUT" && path.startsWith("/send/chunk/")) {
      const id = path.slice("/send/chunk/".length);
      return handleSendChunk(request, env, url, id);
    }
    if (method === "POST" && path.startsWith("/send/commit/")) {
      const id = path.slice("/send/commit/".length);
      return handleSendCommit(request, env, id);
    }
    if (method === "GET" && path === "/sent") {
      return handleSentList(env, url);
    }
    if (method === "GET" && path.startsWith("/sent/")) {
      const id = path.slice(6);
      return handleSentDetail(env, id);
    }
    if (method === "POST" && path === "/sent/delete") {
      return handleSentDelete(request, env);
    }
    if (method === "GET" && path.startsWith("/attachment/")) {
      const parts = path.slice("/attachment/".length).split("/");
      if (parts.length !== 2) return text("Bad request", 400);
      return handleAttachment(env, parts[0], parts[1]);
    }
    return text("Not Found", 404);
  }
};
export {
  index_default as default
};
