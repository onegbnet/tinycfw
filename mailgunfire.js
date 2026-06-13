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

var enc = new TextEncoder();
var dec = new TextDecoder();
var META_PREFIX = "\0kvmeta\0";
function toBytes(value) {
  if (typeof value === "string") return enc.encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return enc.encode(typeof value === "object" ? JSON.stringify(value) : String(value));
}
function readType(typeOrOpts) {
  if (typeof typeOrOpts === "string") return typeOrOpts;
  if (typeOrOpts && typeof typeOrOpts === "object") return typeOrOpts.type || "text";
  return "text";
}
function isComplete(cursor) {
  return cursor === "" || cursor === "0" || cursor == null;
}
function makeKvBinding({ driver } = {}) {
  if (!driver || typeof driver.get !== "function") {
    throw new Error("kv-adapter: makeKvBinding needs a driver with get/set/del/scan");
  }
  async function get(key, typeOrOpts) {
    const bytes = await driver.get(key);
    if (bytes == null) return null;
    const type = readType(typeOrOpts);
    if (type === "arrayBuffer") {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    const str = dec.decode(bytes);
    if (type === "json") {
      try {
        return JSON.parse(str);
      } catch {
        return null;
      }
    }
    return str;
  }
  async function put(key, value, opts = {}) {
    const ttl = opts && Number(opts.expirationTtl) || 0;
    await driver.set(key, toBytes(value), ttl > 0 ? ttl : 0);
    if (opts && opts.metadata != null) {
      await driver.set(META_PREFIX + key, enc.encode(JSON.stringify(opts.metadata)), ttl > 0 ? ttl : 0);
    }
  }
  async function del(key) {
    await driver.del(key);
    await driver.del(META_PREFIX + key);
  }
  async function list({ prefix = "", cursor = "", limit = 1e3 } = {}) {
    const r = await driver.scan(prefix, cursor || "", limit);
    const rawNames = Array.isArray(r && r.names) ? r.names : [];
    const names = rawNames.filter((n) => !n.startsWith(META_PREFIX));
    const keys = [];
    for (const name of names) {
      const entry = { name };
      const metaBytes = await driver.get(META_PREFIX + name);
      if (metaBytes != null) {
        try {
          entry.metadata = JSON.parse(dec.decode(metaBytes));
        } catch {
        }
      }
      keys.push(entry);
    }
    const next = r && r.cursor;
    const complete = isComplete(next);
    const out = { keys, list_complete: complete };
    if (!complete) out.cursor = next;
    return out;
  }
  return { get, put, delete: del, list };
}

import { connect } from "cloudflare:sockets";

var enc2 = new TextEncoder();
var dec2 = new TextDecoder();
var CRLF = enc2.encode("\r\n");
function encodeCommand(args) {
  const parts = [enc2.encode("*" + args.length + "\r\n")];
  for (const a of args) {
    const bytes = a instanceof Uint8Array ? a : enc2.encode(String(a));
    parts.push(enc2.encode("$" + bytes.byteLength + "\r\n"));
    parts.push(bytes);
    parts.push(CRLF);
  }
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}
function makeByteReader(reader) {
  let chunks = [];
  let head = 0;
  let avail = 0;
  async function pull() {
    const { value, done } = await reader.read();
    if (done) throw new Error("redis: connection closed");
    chunks.push(value);
    avail += value.byteLength;
  }
  function readByteSync() {
    const c = chunks[0];
    const b = c[head++];
    avail--;
    if (head >= c.byteLength) {
      chunks.shift();
      head = 0;
    }
    return b;
  }
  async function readN(n) {
    while (avail < n) await pull();
    const out = new Uint8Array(n);
    let written = 0;
    while (written < n) {
      const c = chunks[0];
      const take = Math.min(c.byteLength - head, n - written);
      out.set(c.subarray(head, head + take), written);
      written += take;
      head += take;
      avail -= take;
      if (head >= c.byteLength) {
        chunks.shift();
        head = 0;
      }
    }
    return out;
  }
  async function readLine() {
    const bytes = [];
    for (; ; ) {
      while (avail < 1) await pull();
      const b = readByteSync();
      if (b === 13) {
        while (avail < 1) await pull();
        readByteSync();
        return Uint8Array.from(bytes);
      }
      bytes.push(b);
    }
  }
  return { readN, readLine };
}
async function parseReply(br) {
  const line = await br.readLine();
  const type = line[0];
  const rest = dec2.decode(line.subarray(1));
  switch (type) {
    case 43:
      return { status: rest };
    case 45:
      throw new Error("redis: " + rest);
    case 58:
      return Number(rest);
    case 36: {
      const len = Number(rest);
      if (len < 0) return null;
      const data = await br.readN(len);
      await br.readN(2);
      return data;
    }
    case 42: {
      const count = Number(rest);
      if (count < 0) return null;
      const arr = [];
      for (let i = 0; i < count; i++) arr.push(await parseReply(br));
      return arr;
    }
    default:
      throw new Error("redis: bad reply type 0x" + (type || 0).toString(16));
  }
}

var dec3 = new TextDecoder();
function escapeGlob(s) {
  return String(s).replace(/[\\*?[\]]/g, (c) => "\\" + c);
}
function parseConn({ url, hostname, port, password, db } = {}) {
  let tls = false;
  if (url) {
    const u = new URL(url);
    tls = u.protocol === "rediss:";
    hostname = hostname || u.hostname;
    port = port || (u.port ? Number(u.port) : 6379);
    password = password || (u.password ? decodeURIComponent(u.password) : "");
    const path = u.pathname.replace(/^\//, "");
    if (db == null && path) db = Number(path);
  }
  return {
    hostname: hostname || "localhost",
    port: port || 6379,
    password: password || "",
    db: db || 0,
    tls
  };
}
function makeRedisDriver(config = {}) {
  const conn = parseConn(config);
  const keyPrefix = config.keyPrefix || "";
  let socket = null;
  let writer = null;
  let br = null;
  let chain = Promise.resolve();
  async function open() {
    socket = connect(
      { hostname: conn.hostname, port: conn.port },
      conn.tls ? { secureTransport: "on" } : void 0
    );
    writer = socket.writable.getWriter();
    br = makeByteReader(socket.readable.getReader());
    if (conn.password) await rawCommand(["AUTH", conn.password]);
    if (conn.db) await rawCommand(["SELECT", String(conn.db)]);
  }
  async function rawCommand(args) {
    await writer.write(encodeCommand(args));
    return parseReply(br);
  }
  function reset() {
    try {
      if (writer) writer.releaseLock();
    } catch {
    }
    try {
      if (socket) socket.close();
    } catch {
    }
    socket = null;
    writer = null;
    br = null;
  }
  function command(args) {
    const run = (async () => {
      try {
        if (!socket) await open();
        return await rawCommand(args);
      } catch (err) {
        reset();
        await open();
        return rawCommand(args);
      }
    });
    const result = chain.then(run, run);
    chain = result.then(() => {
    }, () => {
    });
    return result;
  }
  const k = (key) => keyPrefix + key;
  async function get(key) {
    const r = await command(["GET", k(key)]);
    return r == null ? null : r;
  }
  async function set(key, bytes, ttlSec) {
    const args = ["SET", k(key), bytes];
    if (ttlSec && ttlSec > 0) {
      args.push("EX", String(Math.floor(ttlSec)));
    }
    await command(args);
  }
  async function del(key) {
    await command(["DEL", k(key)]);
  }
  async function scan(prefix, cursor, n) {
    const match = escapeGlob(keyPrefix + (prefix || "")) + "*";
    const reply = await command(["SCAN", cursor || "0", "MATCH", match, "COUNT", String(n || 1e3)]);
    const nextCursor = reply[0] instanceof Uint8Array ? dec3.decode(reply[0]) : String(reply[0]);
    const rawKeys = Array.isArray(reply[1]) ? reply[1] : [];
    const names = rawKeys.map((b) => {
      const full = b instanceof Uint8Array ? dec3.decode(b) : String(b);
      return keyPrefix && full.startsWith(keyPrefix) ? full.slice(keyPrefix.length) : full;
    });
    return { names, cursor: nextCursor };
  }
  return { get, set, del, scan, backend: "redis" };
}

var CF_DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
var CF_CATALOG = [
  {
    id: "@cf/meta/llama-3.1-8b-instruct",
    label: "Llama 3.1 8B",
    note: {
      en: "General-purpose, fast, low cost. Good default for everyday drafting; decent multilingual.",
      "zh-cn": "\u901A\u7528\u3001\u5FEB\u3001\u4FBF\u5B9C\u3002\u65E5\u5E38\u8D77\u8349\u7684\u7A33\u59A5\u9ED8\u8BA4\uFF1B\u591A\u8BED\u8A00\u5C1A\u53EF\u3002"
    }
  },
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    label: "Llama 3.3 70B",
    note: {
      en: "Much larger \u2014 higher quality and reasoning, a bit slower/pricier. Reach for important or nuanced emails.",
      "zh-cn": "\u5927\u5F97\u591A\u2014\u2014\u8D28\u91CF\u4E0E\u63A8\u7406\u66F4\u5F3A\uFF0C\u7A0D\u6162\u7A0D\u8D35\u3002\u91CD\u8981\u6216\u63AA\u8F9E\u8BB2\u7A76\u7684\u90AE\u4EF6\u7528\u5B83\u3002"
    }
  },
  {
    id: "@cf/qwen/qwen1.5-14b-chat-awq",
    label: "Qwen 1.5 14B",
    note: {
      en: "Strong Chinese and East-Asian language handling. Prefer for zh / ja / ko drafting.",
      "zh-cn": "\u4E2D\u6587\u53CA\u4E1C\u4E9A\u8BED\u8A00\u5904\u7406\u5F3A\u3002\u4E2D / \u65E5 / \u97E9 \u8D77\u8349\u4F18\u5148\u9009\u5B83\u3002"
    }
  },
  {
    id: "@cf/mistral/mistral-7b-instruct-v0.2",
    label: "Mistral 7B",
    note: {
      en: "Lightweight, crisp English prose. Fast and economical for short English emails.",
      "zh-cn": "\u8F7B\u91CF\u3001\u82F1\u6587\u884C\u6587\u5229\u843D\u3002\u77ED\u82F1\u6587\u90AE\u4EF6\u53C8\u5FEB\u53C8\u7701\u3002"
    }
  }
];
var OLLAMA_NOTES = {
  llama3: { en: "Meta Llama 3 \u2014 general-purpose, balanced.", "zh-cn": "Meta Llama 3 \u2014\u2014 \u901A\u7528\u3001\u5747\u8861\u3002" },
  "llama3.1": { en: "Meta Llama 3.1 \u2014 general-purpose, good multilingual.", "zh-cn": "Meta Llama 3.1 \u2014\u2014 \u901A\u7528\u3001\u591A\u8BED\u8A00\u4E0D\u9519\u3002" },
  "llama3.2": { en: "Meta Llama 3.2 \u2014 compact, fast.", "zh-cn": "Meta Llama 3.2 \u2014\u2014 \u7D27\u51D1\u3001\u5FEB\u3002" },
  "llama3.3": { en: "Meta Llama 3.3 \u2014 large, high quality.", "zh-cn": "Meta Llama 3.3 \u2014\u2014 \u5927\u6A21\u578B\u3001\u8D28\u91CF\u9AD8\u3002" },
  qwen2: { en: "Qwen2 \u2014 strong Chinese / multilingual.", "zh-cn": "Qwen2 \u2014\u2014 \u4E2D\u6587 / \u591A\u8BED\u8A00\u5F3A\u3002" },
  "qwen2.5": { en: "Qwen2.5 \u2014 strong Chinese / multilingual.", "zh-cn": "Qwen2.5 \u2014\u2014 \u4E2D\u6587 / \u591A\u8BED\u8A00\u5F3A\u3002" },
  mistral: { en: "Mistral \u2014 lightweight, crisp English.", "zh-cn": "Mistral \u2014\u2014 \u8F7B\u91CF\u3001\u82F1\u6587\u5229\u843D\u3002" },
  gemma2: { en: "Google Gemma 2 \u2014 compact, capable.", "zh-cn": "Google Gemma 2 \u2014\u2014 \u7D27\u51D1\u3001\u80FD\u6253\u3002" },
  phi3: { en: "Microsoft Phi-3 \u2014 small, efficient.", "zh-cn": "Microsoft Phi-3 \u2014\u2014 \u5C0F\u5DE7\u3001\u9AD8\u6548\u3002" }
};
var CF_TO_OLLAMA = {
  "@cf/meta/llama-3.1-8b-instruct": "llama3.1",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": "llama3.3",
  "@cf/qwen/qwen1.5-14b-chat-awq": "qwen2.5",
  "@cf/mistral/mistral-7b-instruct-v0.2": "mistral"
};
function pickNote(noteMap, lang) {
  if (!noteMap) return "";
  return noteMap[lang] || noteMap.en || "";
}
function ollamaBaseName(name) {
  return String(name || "").split(":")[0];
}
function makeWorkersAiDriver({ binding, defaultModel } = {}) {
  if (!binding || typeof binding.run !== "function") {
    throw new Error("ai-adapter: Workers AI driver needs env.AI binding");
  }
  const def = defaultModel || CF_DEFAULT_MODEL;
  async function chat({ system, user, model } = {}) {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: user || "" });
    const r = await binding.run(model || def, { messages });
    const text2 = typeof r === "string" ? r : r && (r.response ?? (r.result && r.result.response)) || "";
    return { text: String(text2).trim() };
  }
  async function listModels({ lang } = {}) {
    const models = CF_CATALOG.map((m) => ({
      id: m.id,
      label: m.label,
      note: pickNote(m.note, lang)
    }));
    return { models, default: def };
  }
  return { chat, listModels, defaultModel: def, backend: "workers-ai" };
}
function makeOllamaDriver({ baseUrl, defaultModel } = {}) {
  const base = String(baseUrl || "http://localhost:11434").replace(/\/+$/, "");
  const def = defaultModel || CF_TO_OLLAMA[CF_DEFAULT_MODEL] || "llama3.1";
  async function chat({ system, user, model } = {}) {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: user || "" });
    const resp = await fetch(base + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model || def, messages, stream: false })
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error("ollama chat " + resp.status + (detail ? ": " + detail.slice(0, 200) : ""));
    }
    const data = await resp.json();
    const text2 = data && data.message && data.message.content || "";
    return { text: String(text2).trim() };
  }
  async function listModels({ lang } = {}) {
    const resp = await fetch(base + "/api/tags");
    if (!resp.ok) throw new Error("ollama tags " + resp.status);
    const data = await resp.json();
    const installed = data && Array.isArray(data.models) ? data.models : [];
    const models = installed.map((m) => {
      const name = m.name || m.model || "";
      const note = pickNote(OLLAMA_NOTES[ollamaBaseName(name)], lang);
      return { id: name, label: name, note };
    });
    const haveDefault = models.some((m) => m.id === def);
    const fallback = models.length ? models[0].id : def;
    return { models, default: haveDefault ? def : fallback };
  }
  return { chat, listModels, defaultModel: def, backend: "ollama" };
}
function makeAi({ driver } = {}) {
  if (!driver || typeof driver.chat !== "function") {
    throw new Error("ai-adapter: makeAi needs a driver with chat()");
  }
  return {
    backend: driver.backend,
    defaultModel: driver.defaultModel,
    chat: (opts) => driver.chat(opts),
    listModels: (opts) => driver.listModels(opts)
    // chatStream reserved for the streaming fast-follow (Workers AI SSE vs
    // Ollama NDJSON normalization). Not implemented in the non-stream MVP.
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
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/overlay/style.min.css">
<link rel="stylesheet" href="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@7366b973438eff38abe24bb628704a01ca99e427/mailgunfire/view.min.css">
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
      <div class="label-row">
        <label class="field-label" data-i18n="label_subject">SUBJECT</label>
        <button type="button" class="ai-mini-btn" id="aiSubjectBtn" style="display:none">&#10024; <span data-i18n="ai_gen_subject">Suggest subject</span></button>
      </div>
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
        <button type="button" class="ai-mini-btn" id="aiAssistBtn" style="display:none">&#10024; <span data-i18n="ai_assist">AI Assist</span></button>
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

      <p class="hint" data-i18n="ph_body_md_hint"></p>
    </div>

    <div id="status"></div>

    <div class="btn-row">
      <button type="button" class="btn-secondary" id="sentOpenBtn" style="display:none">&#128229; <span data-i18n="sent_history">View Sent</span></button>
      <button type="submit" class="btn-primary" id="sendBtn">&#9993; <span data-i18n="btn_send">Send</span></button>
    </div>
  </form>
</div>
<footer style="text-align:center;padding:1rem 0;font-size:.75rem;color:var(--footer-color,inherit)">\xA9 <span id="footerYear"></span> <a href="https://go.gb.net/gaobo" target="_blank" style="color:var(--footer-color,inherit);text-decoration:none;border-bottom:1px dashed var(--footer-border,currentColor)"><img src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/gaobo.png" alt="" style="height:20px;vertical-align:middle;margin:0 2px;"><span id="footerBrand"></span></a> <span id="footerProd"></span> <a href="https://github.com/onegbnet/tinyutils/blob/master/LICENSE" target="_blank" style="color:var(--footer-color,inherit);text-decoration:none;border-bottom:1px dashed var(--footer-border,currentColor)">MIT License</a></footer>

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

<!-- AI assist panel content host: hidden until openAiPanel() moves it into an
     Overlay box and back on close (drawer pattern \u2014 preserves the listeners
     wired once at module init). Two modes: draft a body from the subject, or
     improve the current body. Optional recipient / intent context + a model
     picker populated from GET /api/ai/models. -->
<div id="aiPanelHost" hidden>
  <div class="ai-panel">
    <div class="ai-modes" id="aiModes">
      <button type="button" class="ai-mode-btn" data-mode="body" data-i18n="ai_mode_body">Draft from subject</button>
      <button type="button" class="ai-mode-btn" data-mode="optimize" data-i18n="ai_mode_optimize">Improve current body</button>
    </div>
    <label class="field-label" data-i18n="ai_recipient">Recipient (optional)</label>
    <input type="text" id="aiRecipient" class="ai-input" data-i18n-ph="ai_recipient_ph" placeholder="e.g. a new client, my manager">
    <label class="field-label" data-i18n="ai_intent">Intent / key points (optional)</label>
    <textarea id="aiIntent" class="ai-textarea" rows="3" data-i18n-ph="ai_intent_ph" placeholder="What should this email accomplish?"></textarea>
    <label class="field-label" data-i18n="ai_model">Model</label>
    <select id="aiModel" class="ai-select"></select>
    <div class="ai-model-note" id="aiModelNote"></div>
    <div id="aiResultWrap" style="display:none">
      <label class="field-label" data-i18n="ai_result">Result (editable)</label>
      <textarea id="aiResult" class="ai-textarea" rows="8"></textarea>
    </div>
    <div id="aiPanelStatus" class="ai-panel-status" style="display:none"></div>
    <div class="ai-panel-actions">
      <button type="button" class="btn-primary" id="aiGenerateBtn"><span data-i18n="ai_generate">Generate</span></button>
      <button type="button" class="btn-secondary" id="aiApplyReplace" style="display:none" data-i18n="ai_replace">Replace body</button>
      <button type="button" class="btn-secondary" id="aiApplyAppend" style="display:none" data-i18n="ai_append">Append</button>
    </div>
  </div>
</div>

<script>
// Outer-script shim: declare placeholder vars BEFORE any IIFE so esbuild's
// constant-fold (in the cross-origin client.min.js) sees free vars rather
// than literal-vs-literal equalities. (See CLAUDE.md \xA77 esbuild IIFE
// constant-folds occurrence.) These bools are read by the IIFE's
// \`=== "true"\` checks.
var KV_BOUND_RAW = "{{KV_BOUND}}";
var LOCKED_RAW = "{{LOCKED}}";
var AI_ENABLED_RAW = "{{AI_ENABLED}}";
// Server-injected lang (cookie OR Accept-Language fallback). Bootstrap
// reads this via initialFromGlobal:'INITIAL_LANG' so reload preserves
// the user's last LangSelect choice (persisted via POST /api/prefs).
var INITIAL_LANG = "{{LANG}}";
</script>

<!-- CDN-served browser modules \u2014 load order matters: i18n-engine first
     (provides global helpers used downstream); action before overlay
     (overlay's modal sugar refs window.Action); field separately; theme
     self-contained (storage-free now \u2014 reads <html data-theme>). All
     parser-blocking, executed in source order. -->
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/i18n-engine/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/footer-brand/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/action/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/field/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/overlay/client.min.js"></script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/theme/client.min.js"></script>

<!-- markdown-editor (Phase 5b-B): per-app config via inline shim BEFORE
     the CDN <script src> so window.MDE_CONFIG / window.MDE_I18N_OVERRIDES
     are set when the IIFE executes. -->
<script>window.MDE_CONFIG={"textareaId":"mdPane","trimReturn":false};</script>
<script>var MDE_I18N = {en:{md_placeholder:"Write markdown here...",md_preview_title:"Preview",md_preview_close:"Close",md_tb_bold:"Bold",md_tb_italic:"Italic",md_tb_h1:"Heading 1",md_tb_h2:"Heading 2",md_tb_h3:"Heading 3",md_tb_ul:"Bullet list",md_tb_ol:"Numbered list",md_tb_blockquote:"Blockquote",md_tb_code:"Inline code",md_tb_link:"Insert link",md_tb_hr:"Horizontal rule",md_tb_preview:"Preview"},eo:{md_placeholder:"Skribu markdown \u0109i tie...",md_preview_title:"Anta\u016Drigardo",md_preview_close:"Fermi",md_tb_bold:"Grasa",md_tb_italic:"Kursiva",md_tb_h1:"Titolo 1",md_tb_h2:"Titolo 2",md_tb_h3:"Titolo 3",md_tb_ul:"Bula listo",md_tb_ol:"Numerita listo",md_tb_blockquote:"Cita\u0135o",md_tb_code:"Enlinia kodo",md_tb_link:"Enmeti ligilon",md_tb_hr:"Horizontala linio",md_tb_preview:"Anta\u016Drigardo"},fr:{md_placeholder:"\xC9crivez du markdown ici...",md_preview_title:"Aper\xE7u",md_preview_close:"Fermer",md_tb_bold:"Gras",md_tb_italic:"Italique",md_tb_h1:"Titre 1",md_tb_h2:"Titre 2",md_tb_h3:"Titre 3",md_tb_ul:"Liste \xE0 puces",md_tb_ol:"Liste num\xE9rot\xE9e",md_tb_blockquote:"Citation",md_tb_code:"Code en ligne",md_tb_link:"Ins\xE9rer un lien",md_tb_hr:"Ligne horizontale",md_tb_preview:"Aper\xE7u"},de:{md_placeholder:"Markdown hier schreiben...",md_preview_title:"Vorschau",md_preview_close:"Schlie\xDFen",md_tb_bold:"Fett",md_tb_italic:"Kursiv",md_tb_h1:"\xDCberschrift 1",md_tb_h2:"\xDCberschrift 2",md_tb_h3:"\xDCberschrift 3",md_tb_ul:"Aufz\xE4hlung",md_tb_ol:"Nummerierte Liste",md_tb_blockquote:"Zitat",md_tb_code:"Inline-Code",md_tb_link:"Link einf\xFCgen",md_tb_hr:"Horizontale Linie",md_tb_preview:"Vorschau"},es:{md_placeholder:"Escribe markdown aqu\xED...",md_preview_title:"Vista previa",md_preview_close:"Cerrar",md_tb_bold:"Negrita",md_tb_italic:"Cursiva",md_tb_h1:"Encabezado 1",md_tb_h2:"Encabezado 2",md_tb_h3:"Encabezado 3",md_tb_ul:"Lista con vi\xF1etas",md_tb_ol:"Lista numerada",md_tb_blockquote:"Cita",md_tb_code:"C\xF3digo en l\xEDnea",md_tb_link:"Insertar enlace",md_tb_hr:"L\xEDnea horizontal",md_tb_preview:"Vista previa"},it:{md_placeholder:"Scrivi markdown qui...",md_preview_title:"Anteprima",md_preview_close:"Chiudi",md_tb_bold:"Grassetto",md_tb_italic:"Corsivo",md_tb_h1:"Titolo 1",md_tb_h2:"Titolo 2",md_tb_h3:"Titolo 3",md_tb_ul:"Elenco puntato",md_tb_ol:"Elenco numerato",md_tb_blockquote:"Citazione",md_tb_code:"Codice in linea",md_tb_link:"Inserisci collegamento",md_tb_hr:"Riga orizzontale",md_tb_preview:"Anteprima"},nl:{md_placeholder:"Schrijf hier markdown...",md_preview_title:"Voorbeeld",md_preview_close:"Sluiten",md_tb_bold:"Vet",md_tb_italic:"Cursief",md_tb_h1:"Kop 1",md_tb_h2:"Kop 2",md_tb_h3:"Kop 3",md_tb_ul:"Opsommingslijst",md_tb_ol:"Genummerde lijst",md_tb_blockquote:"Citaat",md_tb_code:"Inline code",md_tb_link:"Link invoegen",md_tb_hr:"Horizontale lijn",md_tb_preview:"Voorbeeld"},da:{md_placeholder:"Skriv markdown her...",md_preview_title:"Forh\xE5ndsvisning",md_preview_close:"Luk",md_tb_bold:"Fed",md_tb_italic:"Kursiv",md_tb_h1:"Overskrift 1",md_tb_h2:"Overskrift 2",md_tb_h3:"Overskrift 3",md_tb_ul:"Punktliste",md_tb_ol:"Nummereret liste",md_tb_blockquote:"Citat",md_tb_code:"Inline-kode",md_tb_link:"Inds\xE6t link",md_tb_hr:"Vandret linje",md_tb_preview:"Forh\xE5ndsvisning"},"zh-cn":{md_placeholder:"\u5728\u6B64\u7F16\u5199 Markdown...",md_preview_title:"\u9884\u89C8",md_preview_close:"\u5173\u95ED",md_tb_bold:"\u52A0\u7C97",md_tb_italic:"\u659C\u4F53",md_tb_h1:"\u6807\u9898 1",md_tb_h2:"\u6807\u9898 2",md_tb_h3:"\u6807\u9898 3",md_tb_ul:"\u65E0\u5E8F\u5217\u8868",md_tb_ol:"\u6709\u5E8F\u5217\u8868",md_tb_blockquote:"\u5F15\u7528",md_tb_code:"\u884C\u5185\u4EE3\u7801",md_tb_link:"\u63D2\u5165\u94FE\u63A5",md_tb_hr:"\u6C34\u5E73\u7EBF",md_tb_preview:"\u9884\u89C8"},"zh-tw":{md_placeholder:"\u5728\u6B64\u7DE8\u5BEB Markdown...",md_preview_title:"\u9810\u89BD",md_preview_close:"\u95DC\u9589",md_tb_bold:"\u7C97\u9AD4",md_tb_italic:"\u659C\u9AD4",md_tb_h1:"\u6A19\u984C 1",md_tb_h2:"\u6A19\u984C 2",md_tb_h3:"\u6A19\u984C 3",md_tb_ul:"\u7121\u5E8F\u6E05\u55AE",md_tb_ol:"\u6709\u5E8F\u6E05\u55AE",md_tb_blockquote:"\u5F15\u7528",md_tb_code:"\u884C\u5167\u7A0B\u5F0F\u78BC",md_tb_link:"\u63D2\u5165\u9023\u7D50",md_tb_hr:"\u6C34\u5E73\u7DDA",md_tb_preview:"\u9810\u89BD"},ja:{md_placeholder:"Markdown\u3067\u8A18\u8FF0...",md_preview_title:"\u30D7\u30EC\u30D3\u30E5\u30FC",md_preview_close:"\u9589\u3058\u308B",md_tb_bold:"\u592A\u5B57",md_tb_italic:"\u659C\u4F53",md_tb_h1:"\u898B\u51FA\u3057 1",md_tb_h2:"\u898B\u51FA\u3057 2",md_tb_h3:"\u898B\u51FA\u3057 3",md_tb_ul:"\u7B87\u6761\u66F8\u304D",md_tb_ol:"\u756A\u53F7\u4ED8\u304D\u30EA\u30B9\u30C8",md_tb_blockquote:"\u5F15\u7528",md_tb_code:"\u30A4\u30F3\u30E9\u30A4\u30F3\u30B3\u30FC\u30C9",md_tb_link:"\u30EA\u30F3\u30AF\u3092\u633F\u5165",md_tb_hr:"\u6C34\u5E73\u7DDA",md_tb_preview:"\u30D7\u30EC\u30D3\u30E5\u30FC"},ko:{md_placeholder:"\uB9C8\uD06C\uB2E4\uC6B4 \uC791\uC131...",md_preview_title:"\uBBF8\uB9AC\uBCF4\uAE30",md_preview_close:"\uB2EB\uAE30",md_tb_bold:"\uAD75\uAC8C",md_tb_italic:"\uAE30\uC6B8\uC784",md_tb_h1:"\uC81C\uBAA9 1",md_tb_h2:"\uC81C\uBAA9 2",md_tb_h3:"\uC81C\uBAA9 3",md_tb_ul:"\uAE00\uBA38\uB9AC \uAE30\uD638",md_tb_ol:"\uBC88\uD638 \uBAA9\uB85D",md_tb_blockquote:"\uC778\uC6A9",md_tb_code:"\uC778\uB77C\uC778 \uCF54\uB4DC",md_tb_link:"\uB9C1\uD06C \uC0BD\uC785",md_tb_hr:"\uAD6C\uBD84\uC120",md_tb_preview:"\uBBF8\uB9AC\uBCF4\uAE30"},ms:{md_placeholder:"Tulis markdown di sini...",md_preview_title:"Pratonton",md_preview_close:"Tutup",md_tb_bold:"Tebal",md_tb_italic:"Condong",md_tb_h1:"Tajuk 1",md_tb_h2:"Tajuk 2",md_tb_h3:"Tajuk 3",md_tb_ul:"Senarai titik",md_tb_ol:"Senarai bernombor",md_tb_blockquote:"Petikan",md_tb_code:"Kod sebaris",md_tb_link:"Sisip pautan",md_tb_hr:"Garisan mendatar",md_tb_preview:"Pratonton"},vi:{md_placeholder:"Vi\u1EBFt markdown t\u1EA1i \u0111\xE2y...",md_preview_title:"Xem tr\u01B0\u1EDBc",md_preview_close:"\u0110\xF3ng",md_tb_bold:"\u0110\u1EADm",md_tb_italic:"Nghi\xEAng",md_tb_h1:"Ti\xEAu \u0111\u1EC1 1",md_tb_h2:"Ti\xEAu \u0111\u1EC1 2",md_tb_h3:"Ti\xEAu \u0111\u1EC1 3",md_tb_ul:"Danh s\xE1ch",md_tb_ol:"Danh s\xE1ch s\u1ED1",md_tb_blockquote:"Tr\xEDch d\u1EABn",md_tb_code:"M\xE3 n\u1ED9i d\xF2ng",md_tb_link:"Ch\xE8n li\xEAn k\u1EBFt",md_tb_hr:"\u0110\u01B0\u1EDDng k\u1EBB ngang",md_tb_preview:"Xem tr\u01B0\u1EDBc"},th:{md_placeholder:"\u0E40\u0E02\u0E35\u0E22\u0E19 Markdown \u0E17\u0E35\u0E48\u0E19\u0E35\u0E48...",md_preview_title:"\u0E14\u0E39\u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07",md_preview_close:"\u0E1B\u0E34\u0E14",md_tb_bold:"\u0E15\u0E31\u0E27\u0E2B\u0E19\u0E32",md_tb_italic:"\u0E15\u0E31\u0E27\u0E40\u0E2D\u0E35\u0E22\u0E07",md_tb_h1:"\u0E2B\u0E31\u0E27\u0E02\u0E49\u0E2D 1",md_tb_h2:"\u0E2B\u0E31\u0E27\u0E02\u0E49\u0E2D 2",md_tb_h3:"\u0E2B\u0E31\u0E27\u0E02\u0E49\u0E2D 3",md_tb_ul:"\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E08\u0E38\u0E14",md_tb_ol:"\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E25\u0E02",md_tb_blockquote:"\u0E04\u0E33\u0E1E\u0E39\u0E14",md_tb_code:"\u0E42\u0E04\u0E49\u0E14\u0E43\u0E19\u0E1A\u0E23\u0E23\u0E17\u0E31\u0E14",md_tb_link:"\u0E41\u0E17\u0E23\u0E01\u0E25\u0E34\u0E07\u0E01\u0E4C",md_tb_hr:"\u0E40\u0E2A\u0E49\u0E19\u0E41\u0E19\u0E27\u0E19\u0E2D\u0E19",md_tb_preview:"\u0E14\u0E39\u0E15\u0E31\u0E27\u0E2D\u0E22\u0E48\u0E32\u0E07"},ta:{md_placeholder:"Markdown \u0B8E\u0BB4\u0BC1\u0BA4\u0BC1\u0B99\u0BCD\u0B95\u0BB3\u0BCD...",md_preview_title:"\u0BAE\u0BC1\u0BA9\u0BCD\u0BA9\u0BCB\u0B9F\u0BCD\u0B9F\u0BAE\u0BCD",md_preview_close:"\u0BAE\u0BC2\u0B9F\u0BC1",md_tb_bold:"\u0BA4\u0B9F\u0BBF\u0BAE\u0BA9\u0BCD",md_tb_italic:"\u0B9A\u0BBE\u0BAF\u0BCD\u0BB5\u0BC1",md_tb_h1:"\u0BA4\u0BB2\u0BC8\u0BAA\u0BCD\u0BAA\u0BC1 1",md_tb_h2:"\u0BA4\u0BB2\u0BC8\u0BAA\u0BCD\u0BAA\u0BC1 2",md_tb_h3:"\u0BA4\u0BB2\u0BC8\u0BAA\u0BCD\u0BAA\u0BC1 3",md_tb_ul:"\u0BAA\u0BC1\u0BB3\u0BCD\u0BB3\u0BBF \u0BAA\u0B9F\u0BCD\u0B9F\u0BBF\u0BAF\u0BB2\u0BCD",md_tb_ol:"\u0B8E\u0BA3\u0BCD \u0BAA\u0B9F\u0BCD\u0B9F\u0BBF\u0BAF\u0BB2\u0BCD",md_tb_blockquote:"\u0BAE\u0BC7\u0BB1\u0BCD\u0B95\u0BCB\u0BB3\u0BCD",md_tb_code:"\u0B87\u0BA9\u0BCD\u0BB2\u0BC8\u0BA9\u0BCD \u0B95\u0BC1\u0BB1\u0BBF\u0BAF\u0BC0\u0B9F\u0BC1",md_tb_link:"\u0B87\u0BA3\u0BC8\u0BAA\u0BCD\u0BAA\u0BC1 \u0B9A\u0BC6\u0BB0\u0BC1\u0B95\u0BC1",md_tb_hr:"\u0B95\u0BBF\u0B9F\u0BC8\u0B95\u0BCD\u0B95\u0BCB\u0B9F\u0BC1",md_tb_preview:"\u0BAE\u0BC1\u0BA9\u0BCD\u0BA9\u0BCB\u0B9F\u0BCD\u0B9F\u0BAE\u0BCD"},my:{md_placeholder:"\u1024\u1014\u1031\u101B\u102C\u1010\u103D\u1004\u103A Markdown \u101B\u1031\u1038\u1015\u102B...",md_preview_title:"\u1000\u103C\u102D\u102F\u1000\u103C\u100A\u1037\u103A",md_preview_close:"\u1015\u102D\u1010\u103A",md_tb_bold:"\u1011\u1030",md_tb_italic:"\u1005\u1031\u102C\u1004\u103A\u1038",md_tb_h1:"\u1001\u1031\u102B\u1004\u103A\u1038\u1005\u1009\u103A \u1041",md_tb_h2:"\u1001\u1031\u102B\u1004\u103A\u1038\u1005\u1009\u103A \u1042",md_tb_h3:"\u1001\u1031\u102B\u1004\u103A\u1038\u1005\u1009\u103A \u1043",md_tb_ul:"\u1021\u1005\u1000\u103A\u1005\u102C\u101B\u1004\u103A\u1038",md_tb_ol:"\u1014\u1036\u1015\u102B\u1010\u103A\u1005\u102C\u101B\u1004\u103A\u1038",md_tb_blockquote:"\u1000\u102D\u102F\u1038\u1000\u102C\u1038",md_tb_code:"\u101C\u102D\u102F\u1004\u103A\u1038\u1010\u103D\u1004\u103A\u1038\u1000\u102F\u1012\u103A",md_tb_link:"\u101C\u1004\u1037\u103A\u1011\u100A\u1037\u103A",md_tb_hr:"\u1019\u103B\u1009\u103A\u1038\u1021\u101C\u103B\u102C\u1038",md_tb_preview:"\u1000\u103C\u102D\u102F\u1000\u103C\u100A\u1037\u103A"},uk:{md_placeholder:"\u041F\u0438\u0448\u0456\u0442\u044C markdown \u0442\u0443\u0442...",md_preview_title:"\u041F\u043E\u043F\u0435\u0440\u0435\u0434\u043D\u0456\u0439 \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u0434",md_preview_close:"\u0417\u0430\u043A\u0440\u0438\u0442\u0438",md_tb_bold:"\u0416\u0438\u0440\u043D\u0438\u0439",md_tb_italic:"\u041A\u0443\u0440\u0441\u0438\u0432",md_tb_h1:"\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A 1",md_tb_h2:"\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A 2",md_tb_h3:"\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A 3",md_tb_ul:"\u041C\u0430\u0440\u043A\u043E\u0432\u0430\u043D\u0438\u0439 \u0441\u043F\u0438\u0441\u043E\u043A",md_tb_ol:"\u041D\u0443\u043C\u0435\u0440\u043E\u0432\u0430\u043D\u0438\u0439 \u0441\u043F\u0438\u0441\u043E\u043A",md_tb_blockquote:"\u0426\u0438\u0442\u0430\u0442\u0430",md_tb_code:"\u0412\u0431\u0443\u0434\u043E\u0432\u0430\u043D\u0438\u0439 \u043A\u043E\u0434",md_tb_link:"\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u0438 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F",md_tb_hr:"\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u044C\u043D\u0430 \u043B\u0456\u043D\u0456\u044F",md_tb_preview:"\u041F\u043E\u043F\u0435\u0440\u0435\u0434\u043D\u0456\u0439 \u043F\u0435\u0440\u0435\u0433\u043B\u044F\u0434"},he:{md_placeholder:"\u05DB\u05EA\u05D5\u05D1 Markdown \u05DB\u05D0\u05DF...",md_preview_title:"\u05EA\u05E6\u05D5\u05D2\u05D4 \u05DE\u05E7\u05D3\u05D9\u05DE\u05D4",md_preview_close:"\u05E1\u05D2\u05D5\u05E8",md_tb_bold:"\u05DE\u05D5\u05D3\u05D2\u05E9",md_tb_italic:"\u05E0\u05D8\u05D5\u05D9",md_tb_h1:"\u05DB\u05D5\u05EA\u05E8\u05EA 1",md_tb_h2:"\u05DB\u05D5\u05EA\u05E8\u05EA 2",md_tb_h3:"\u05DB\u05D5\u05EA\u05E8\u05EA 3",md_tb_ul:"\u05E8\u05E9\u05D9\u05DE\u05EA \u05EA\u05D1\u05DC\u05D9\u05D8\u05D9\u05DD",md_tb_ol:"\u05E8\u05E9\u05D9\u05DE\u05D4 \u05DE\u05DE\u05D5\u05E1\u05E4\u05E8\u05EA",md_tb_blockquote:"\u05E6\u05D9\u05D8\u05D5\u05D8",md_tb_code:"\u05E7\u05D5\u05D3 \u05D1\u05E9\u05D5\u05E8\u05D4",md_tb_link:"\u05D4\u05DB\u05E0\u05E1 \u05E7\u05D9\u05E9\u05D5\u05E8",md_tb_hr:"\u05E7\u05D5 \u05D0\u05D5\u05E4\u05E7\u05D9",md_tb_preview:"\u05EA\u05E6\u05D5\u05D2\u05D4 \u05DE\u05E7\u05D3\u05D9\u05DE\u05D4"},ar:{md_placeholder:"\u0627\u0643\u062A\u0628 Markdown \u0647\u0646\u0627...",md_preview_title:"\u0645\u0639\u0627\u064A\u0646\u0629",md_preview_close:"\u0625\u063A\u0644\u0627\u0642",md_tb_bold:"\u063A\u0627\u0645\u0642",md_tb_italic:"\u0645\u0627\u0626\u0644",md_tb_h1:"\u0639\u0646\u0648\u0627\u0646 1",md_tb_h2:"\u0639\u0646\u0648\u0627\u0646 2",md_tb_h3:"\u0639\u0646\u0648\u0627\u0646 3",md_tb_ul:"\u0642\u0627\u0626\u0645\u0629 \u0646\u0642\u0637\u064A\u0629",md_tb_ol:"\u0642\u0627\u0626\u0645\u0629 \u0645\u0631\u0642\u0645\u0629",md_tb_blockquote:"\u0627\u0642\u062A\u0628\u0627\u0633",md_tb_code:"\u0643\u0648\u062F \u0633\u0637\u0631\u064A",md_tb_link:"\u0625\u062F\u0631\u0627\u062C \u0631\u0627\u0628\u0637",md_tb_hr:"\u062E\u0637 \u0623\u0641\u0642\u064A",md_tb_preview:"\u0645\u0639\u0627\u064A\u0646\u0629"}};</script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/markdown-editor/client.min.js"></script>

<!-- Per-lang i18n loader: detect lang client-side, async-fetch ONLY the
     matching i18n-<lang>.min.js (~5 KB) instead of the legacy all-langs
     pattern (~100 KB). Exposes window.LangBundle.{initial,ready,load} \u2014
     client.min.js waits on LangBundle.ready before its first applyI18n
     and uses LangBundle.load for switch-on-demand. Bootstrap depends on
     detectLang() from ccs:i18n-engine loaded above. -->
<script>(function(){var b="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@7366b973438eff38abe24bb628704a01ca99e427/mailgunfire";var s=["en","eo","fr","de","es","it","nl","da","zh-cn","zh-tw","ja","ko","ms","vi","th","ta","my","uk","he","ar"];var d="en";function load(l){return new Promise(function(r,j){var x=document.createElement('script');x.src=b+'/i18n-'+l+'.min.js';x.onload=function(){r(l)};x.onerror=function(){j(new Error('i18n-'+l+' failed'))};document.head.appendChild(x)})}var init=(function(){var g=window["INITIAL_LANG"];if(typeof g==='string'&&s.indexOf(g)>=0)return g;return typeof detectLang==='function'?detectLang(s):d})();if(s.indexOf(init)<0)init=d;window.LangBundle={initial:init,ready:load(init),load:load}})();</script>
<script src="https://{{CDN_HOST}}/gh/onegbnet/tinycfw@7366b973438eff38abe24bb628704a01ca99e427/mailgunfire/client.min.js"></script>
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

function handleGet(env, cdnHost, theme, lang) {
  const cfg = getConfig(env);
  if (cfg.error) return json({ error: cfg.error }, 500);
  const kvBound = env.KV_ENABLED ? "true" : "false";
  const aiEnabled = env.AI_ENABLED ? "true" : "false";
  const locked = isValidLock(env.LOCK) ? "true" : "false";
  const body = main_default.replace(/\{\{CDN_HOST\}\}/g, cdnHost).replace(/\{\{KV_BOUND\}\}/g, kvBound).replace(/\{\{AI_ENABLED\}\}/g, aiEnabled).replace(/\{\{LOCKED\}\}/g, locked).replace(/\{\{THEME\}\}/g, theme).replace(/\{\{LANG\}\}/g, lang).replace(/\{\{DOMAIN\}\}/g, cfg.domain).replace(/\{\{DEFAULT_SENDER\}\}/g, cfg.login).replace(/\{\{DEFAULT_DISPLAY\}\}/g, cfg.display);
  return html(body);
}

var enc3 = new TextEncoder();
var dec4 = new TextDecoder();
var CRLF2 = enc3.encode("\r\n");
var CRLFCRLF = enc3.encode("\r\n\r\n");
function indexOf(hay, needle, from) {
  const last = hay.length - needle.length;
  outer: for (let i = from; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
function boundaryFromBody(body) {
  const nl = indexOf(body, CRLF2, 0);
  if (nl < 2) return null;
  const first = dec4.decode(body.subarray(0, nl));
  return first.startsWith("--") ? first.slice(2) : null;
}
function parseMultipart(body, boundary) {
  const delim = enc3.encode("--" + boundary);
  const out = [];
  let pos = indexOf(body, delim, 0);
  if (pos < 0) return out;
  pos += delim.length;
  while (pos < body.length) {
    if (body[pos] === 45 && body[pos + 1] === 45) break;
    if (body[pos] === 13 && body[pos + 1] === 10) pos += 2;
    const headEnd = indexOf(body, CRLFCRLF, pos);
    if (headEnd < 0) break;
    const headerText = dec4.decode(body.subarray(pos, headEnd));
    const contentStart = headEnd + 4;
    const next = indexOf(body, delim, contentStart);
    if (next < 0) break;
    let contentEnd = next;
    if (body[contentEnd - 2] === 13 && body[contentEnd - 1] === 10) contentEnd -= 2;
    const cd = /content-disposition:[^\r\n]*/i.exec(headerText);
    const cdLine = cd ? cd[0] : "";
    const nameM = /name="([^"]*)"/i.exec(cdLine);
    const fnM = /filename="([^"]*)"/i.exec(cdLine);
    const ctM = /content-type:\s*([^\r\n]*)/i.exec(headerText);
    out.push({
      name: nameM ? nameM[1] : "",
      filename: fnM ? fnM[1] : "",
      contentType: ctM ? ctM[1].trim() : "",
      start: contentStart,
      end: contentEnd
    });
    pos = next + delim.length;
  }
  return out;
}
function attachmentAt(body, idx) {
  const boundary = boundaryFromBody(body);
  if (!boundary) return null;
  const files = parseMultipart(body, boundary).filter((p2) => p2.filename);
  const p = files[idx];
  if (!p) return null;
  return {
    filename: p.filename,
    contentType: p.contentType || "application/octet-stream",
    bytes: body.subarray(p.start, p.end)
  };
}

var MG_REQUEST_MAX = 524e5;
var CF_KV_VALUE_MAX = 26214400;
var RESERVE_TTL = 3600;
var MAX_SLABS = 8;
var META_FIELD_MAX = 256;
function slabSizeFor(env) {
  return env.KV_BACKEND === "redis" ? MG_REQUEST_MAX : CF_KV_VALUE_MAX;
}
function slabKey(id, n) {
  return "m:" + id + ":" + n;
}
function genId() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
var isId = (s) => typeof s === "string" && /^[a-f0-9]{20,}$/.test(s);
async function readBody(env, id) {
  const parts = [];
  let total = 0;
  for (let n = 0; n < MAX_SLABS; n++) {
    const ab = await env.SENT.get(slabKey(id, n), "arrayBuffer");
    if (ab == null) break;
    const u = new Uint8Array(ab);
    parts.push(u);
    total += u.byteLength;
  }
  if (parts.length === 0) return null;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}
async function deleteBody(env, id) {
  for (let n = 0; n < MAX_SLABS; n++) await env.SENT.delete(slabKey(id, n));
}
async function handleSendReserve(request, env) {
  if (!env.SENT) return json({ error: "KV not bound" }, 400);
  const cfg = getConfig(env);
  if (cfg.error) return json({ error: cfg.error }, 500);
  let body = {};
  try {
    body = await request.json();
  } catch {
  }
  const sender = (body.sender || cfg.login || "").trim();
  const display = (body.display || cfg.display || "").trim();
  const fromAddr = display ? display + " <" + sender + "@" + cfg.domain + ">" : sender + "@" + cfg.domain;
  return json({
    id: genId(),
    from: fromAddr,
    slabSize: slabSizeFor(env),
    max: MG_REQUEST_MAX
  }, 201);
}
async function handleSendPart(request, env, url, id) {
  if (!env.SENT) return json({ error: "KV not bound" }, 400);
  if (!isId(id)) return json({ error: "INVALID_ID" }, 400);
  const n = parseInt(url.searchParams.get("n") || "", 10);
  if (!Number.isInteger(n) || n < 0 || n >= MAX_SLABS) {
    return json({ error: "INVALID_SLAB_INDEX" }, 400);
  }
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.byteLength === 0) return json({ error: "EMPTY_SLAB" }, 400);
  if (env.KV_BACKEND !== "redis" && buf.byteLength > CF_KV_VALUE_MAX) {
    return json({ error: "SLAB_TOO_BIG" }, 413);
  }
  await env.SENT.put(slabKey(id, n), buf, { expirationTtl: RESERVE_TTL });
  return json({ ok: true });
}
async function handleSendCommit(request, env, id) {
  if (!env.SENT) return json({ error: "KV not bound" }, 400);
  if (!isId(id)) return json({ error: "INVALID_ID" }, 400);
  let input = {};
  try {
    input = await request.json();
  } catch {
  }
  const saveSent = input.save_sent !== false;
  const subject = String(input.subject || "").slice(0, META_FIELD_MAX);
  const to = String(input.to || "").slice(0, META_FIELD_MAX);
  const bodyBytes = await readBody(env, id);
  if (!bodyBytes) return json({ error: "NOT_FOUND" }, 404);
  if (bodyBytes.byteLength > MG_REQUEST_MAX) {
    return json({ error: "REQUEST_TOO_LARGE" }, 413);
  }
  const boundary = boundaryFromBody(bodyBytes);
  if (!boundary || boundary.length > 200 || !/^[0-9A-Za-z'()+_,\-./:=? ]+$/.test(boundary)) {
    return json({ error: "INVALID_BODY" }, 400);
  }
  const cfg = getConfig(env);
  if (cfg.error) return json({ error: cfg.error }, 500);
  const apiBase = cfg.eu ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
  const mgUrl = apiBase + "/v3/" + cfg.domain + "/messages";
  const authHeader = "Basic " + btoa("api:" + cfg.apiKey);
  let mgResp;
  try {
    mgResp = await fetch(mgUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "multipart/form-data; boundary=" + boundary
      },
      body: bodyBytes
    });
  } catch (err) {
    return json({ error: "Mailgun request failed: " + (err && err.message || err) }, 502);
  }
  const mgText = await mgResp.text();
  let mgJson;
  try {
    mgJson = JSON.parse(mgText);
  } catch {
    mgJson = { message: mgText };
  }
  if (!mgResp.ok) {
    return json({ error: mgJson.message || "Mailgun error", status: mgResp.status }, mgResp.status);
  }
  if (saveSent) {
    const finalTtl = isValidTtl(env.TTL) ? parseInt(env.TTL, 10) : 0;
    const slabSize = slabSizeFor(env);
    const total = bodyBytes.byteLength;
    let off = 0, n = 0;
    while (off < total) {
      const slab = bodyBytes.subarray(off, Math.min(off + slabSize, total));
      const opts = {};
      if (finalTtl > 0) opts.expirationTtl = finalTtl;
      if (n === 0) opts.metadata = { subject, to, ts: Date.now() };
      await env.SENT.put(slabKey(id, n), slab, opts);
      off += slab.byteLength;
      n++;
    }
    for (let k = n; k < MAX_SLABS; k++) await env.SENT.delete(slabKey(id, k));
  } else {
    await deleteBody(env, id);
  }
  return json({ success: true, message: mgJson.message || "Queued", id });
}

var dec5 = new TextDecoder();
var isId2 = (s) => typeof s === "string" && /^[a-f0-9]{20,}$/.test(s);
async function handleSentList(env, url) {
  if (!env.SENT) return json({ items: [], error: "KV not bound" });
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const cursor = url.searchParams.get("cursor") || void 0;
  const r = await env.SENT.list({ prefix: "m:", limit: Math.min(limit * 3, 1e3), cursor });
  const items = [];
  for (const key of r.keys) {
    const m = /^m:([a-f0-9]+):0$/.exec(key.name);
    if (!m) continue;
    const meta = key.metadata || {};
    items.push({ id: m[1], subject: meta.subject || "", to: meta.to || "", ts: meta.ts || 0 });
  }
  items.sort((a, b) => b.ts - a.ts);
  return json({ items, cursor: r.list_complete ? null : r.cursor });
}
async function handleSentDetail(env, id) {
  if (!env.SENT) return json({ error: "KV not bound" }, 404);
  if (!isId2(id)) return json({ error: "Bad id" }, 400);
  const body = await readBody(env, id);
  if (!body) return json({ error: "Not found" }, 404);
  const boundary = boundaryFromBody(body);
  if (!boundary) return json({ error: "Corrupt record" }, 500);
  const fields = {};
  const files = [];
  for (const p of parseMultipart(body, boundary)) {
    if (p.filename) {
      files.push({ name: p.filename, mime: p.contentType || "application/octet-stream", size: p.end - p.start });
    } else if (p.name) {
      fields[p.name] = dec5.decode(body.subarray(p.start, p.end));
    }
  }
  return json({
    id,
    from: fields.from || "",
    to: fields.to || "",
    cc: fields.cc || "",
    bcc: fields.bcc || "",
    subject: fields.subject || "",
    body: fields.text || "",
    html: fields.html || "",
    files
  });
}
async function handleAttachment(env, id, idx) {
  if (!env.SENT) return text("KV not bound", 404);
  if (!isId2(id) || !/^\d+$/.test(idx)) return text("Bad request", 400);
  const body = await readBody(env, id);
  if (!body) return text("Not found", 404);
  const att = attachmentAt(body, parseInt(idx, 10));
  if (!att) return text("Not found", 404);
  const safeName = (att.filename || "attachment").replace(/["\r\n]/g, "_");
  return new Response(att.bytes, {
    headers: {
      "Content-Type": att.contentType,
      "Content-Disposition": 'attachment; filename="' + safeName + `"; filename*=UTF-8''` + encodeURIComponent(att.filename || "attachment"),
      "Content-Length": String(att.bytes.byteLength),
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
  const ids = Array.isArray(input.ids) ? input.ids : [];
  let deleted = 0;
  for (const id of ids) {
    if (isId2(id)) {
      await deleteBody(env, id);
      deleted++;
    }
  }
  return json({ success: true, deleted });
}

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

var LANG_NAMES = {
  en: "English",
  eo: "Esperanto",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  nl: "Dutch",
  da: "Danish",
  "zh-cn": "Simplified Chinese",
  "zh-tw": "Traditional Chinese",
  ja: "Japanese",
  ko: "Korean",
  ms: "Malay",
  vi: "Vietnamese",
  th: "Thai",
  ta: "Tamil",
  my: "Burmese",
  uk: "Ukrainian",
  he: "Hebrew",
  ar: "Arabic"
};
var SUBJECT_MAX = 2e3;
var BODY_MAX = 8e3;
var FIELD_MAX = 1e3;
function langName(lang) {
  return LANG_NAMES[lang] || lang || "English";
}
function clip(s, max) {
  return String(s || "").trim().slice(0, max);
}
function buildPrompt({ action, subject, body, recipient, intent, lang }) {
  const L = langName(lang);
  const ctx = [];
  if (recipient) ctx.push("Recipient: " + clip(recipient, FIELD_MAX));
  if (intent) ctx.push("Sender intent / key points: " + clip(intent, FIELD_MAX));
  const ctxBlock = ctx.length ? "\n\n" + ctx.join("\n") : "";
  if (action === "subject") {
    const b = clip(body, SUBJECT_MAX);
    if (!b) return { error: "NO_BODY" };
    return {
      system: `You write concise, professional email subject lines. Given an email body, produce ONE clear subject line. Reply with ONLY the subject text \u2014 no quotes, no "Subject:" prefix, no explanation. Write in ${L}.`,
      user: "Email body:\n" + b
    };
  }
  if (action === "body") {
    const s = clip(subject, FIELD_MAX);
    const it = clip(intent, FIELD_MAX);
    if (!s && !it) return { error: "NO_SUBJECT_OR_INTENT" };
    return {
      system: `You write professional, well-structured email bodies in Markdown. Reply with ONLY the email body in Markdown \u2014 no subject line, no greeting placeholders like [Name] unless asked, no explanation. Write in ${L}.`,
      user: (s ? "Subject: " + s : "Subject: (none given)") + ctxBlock
    };
  }
  if (action === "optimize") {
    const b = clip(body, BODY_MAX);
    if (!b) return { error: "NO_BODY" };
    return {
      system: `You improve email bodies: clearer, more professional, well-structured, while preserving the original meaning and intent. Reply with ONLY the improved email body in Markdown \u2014 no explanation. Write in ${L}.`,
      user: "Current email body:\n" + b + ctxBlock
    };
  }
  return { error: "BAD_ACTION" };
}
function stripThink(text2) {
  return String(text2 || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}
function stripCodeFence(text2) {
  const t = String(text2 || "").trim();
  const m = t.match(/^```[a-zA-Z0-9]*[ \t]*\n([\s\S]*?)\n?```$/);
  return m ? m[1].trim() : t;
}
function cleanSubject(text2) {
  const first = String(text2 || "").split("\n").map((l) => l.trim()).find((l) => l) || "";
  return first.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
}
async function handleAiDraft(request, env) {
  if (!env.AI || typeof env.AI.chat !== "function") {
    return json({ error: "AI_UNAVAILABLE" }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = String(body.action || "");
  const prompt = buildPrompt({
    action,
    subject: body.subject,
    body: body.body,
    recipient: body.recipient,
    intent: body.intent,
    lang: body.lang
  });
  if (prompt.error) return json({ error: prompt.error }, 400);
  let out;
  try {
    out = await env.AI.chat({ system: prompt.system, user: prompt.user, model: body.model || void 0 });
  } catch (err) {
    console.error("ai draft (" + action + "):", err && err.message || err);
    return json({ error: "AI_FAILED" }, 502);
  }
  const text2 = stripThink(out && out.text || "");
  const result = action === "subject" ? cleanSubject(text2) : stripCodeFence(text2);
  return json({ result });
}
async function handleAiModels(request, env) {
  if (!env.AI || typeof env.AI.listModels !== "function") {
    return json({ error: "AI_UNAVAILABLE" }, 503);
  }
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") || "en";
  try {
    const r = await env.AI.listModels({ lang });
    return json({ models: r.models || [], default: r.default || "" });
  } catch (err) {
    console.error("ai models:", err && err.message || err);
    return json({ error: "AI_FAILED" }, 502);
  }
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
  const enc4 = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc4.encode("_cmp_"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc4.encode(String(a || ""))),
    crypto.subtle.sign("HMAC", key, enc4.encode(String(b || "")))
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
<script>window.LOCK_CONFIG={"unlockPath":"/unlock","appNameI18n":{"en":"Mailgun Fire","eo":"Mailgun Fire","fr":"Mailgun Fire","de":"Mailgun Fire","es":"Mailgun Fire","it":"Mailgun Fire","nl":"Mailgun Fire","da":"Mailgun Fire","zh-cn":"\u5F00\u706B\u90AE\u4EF6","zh-tw":"\u958B\u706B\u90F5\u4EF6","ja":"Mailgun Fire","ko":"Mailgun Fire","ms":"Mailgun Fire","vi":"Mailgun Fire","th":"Mailgun Fire","ta":"Mailgun Fire","my":"Mailgun Fire","uk":"Mailgun Fire","he":"Mailgun Fire","ar":"Mailgun Fire"}};</script><script src="https://{{CDN_HOST}}/gh/onegbnet/ccs@8ece97cc2e5585de1c8afb23906d8ce0e28d42c4/lock/client.min.js"></script>
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

function resolveBindings(env) {
  const hasCfKv = env.SENT && typeof env.SENT.get === "function";
  const hasContainerKv = !hasCfKv && !!env.KV;
  const SENT = hasCfKv ? env.SENT : hasContainerKv ? makeKvBinding({ driver: makeRedisDriver({ url: env.KV, keyPrefix: env.PREFIX }) }) : env.SENT;
  const hasCfAi = env.AI && typeof env.AI.run === "function";
  const hasContainerAi = !hasCfAi && !!env.OLLAMA;
  const AI = hasCfAi ? makeAi({ driver: makeWorkersAiDriver({ binding: env.AI, defaultModel: env.MODEL }) }) : hasContainerAi ? makeAi({ driver: makeOllamaDriver({ baseUrl: env.OLLAMA, defaultModel: env.MODEL }) }) : void 0;
  return {
    ...env,
    SENT,
    AI,
    KV_ENABLED: hasCfKv || hasContainerKv,
    // Which backend won — lets mail_uploader pick the slab size (CF KV's 25 MiB
    // per-value cap vs a container Redis value that holds the whole body).
    KV_BACKEND: hasCfKv ? "cf" : hasContainerKv ? "redis" : null,
    AI_ENABLED: hasCfAi || hasContainerAi
  };
}
var index_default = {
  async fetch(request, rawEnv) {
    const env = resolveBindings(rawEnv);
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const cdnHost = selectJsdelivrCdnHost(request);
    const themeCookie = getCookie(request, "theme");
    const theme = themeCookie === "dark" ? "dark" : "light";
    const langCookie = getCookie(request, "lang");
    const lang = langCookie && SUPPORTED_LANGS_DEFAULT.includes(langCookie) ? langCookie : detectLangFromAcceptLanguage(request.headers.get("Accept-Language") || "", SUPPORTED_LANGS_DEFAULT);
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
      return handleGet(env, cdnHost, theme, lang);
    }
    if (method === "POST" && path === "/api/prefs") {
      return handlePrefs(request);
    }
    if (method === "GET" && path === "/api/ai/models") {
      return handleAiModels(request, env);
    }
    if (method === "POST" && path === "/api/ai/draft") {
      return handleAiDraft(request, env);
    }
    if (method === "POST" && path === "/send/reserve") {
      return handleSendReserve(request, env);
    }
    if (method === "PUT" && path.startsWith("/send/part/")) {
      const id = path.slice("/send/part/".length);
      return handleSendPart(request, env, url, id);
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
