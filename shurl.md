# Shurl

A single-file, zero-dependency Cloudflare Worker URL shortener. One JS file, one KV namespace — deploy in under a minute.

## Why Shurl?

Most URL shorteners force you to sign up before you can create a link, or give you zero control once the link is made. Shurl takes a different approach: **anyone can create a link and get a one-time modification password** — no account, no login, no cookies. That password is the key to edit or delete the link later, and it works just as well from the web UI as it does from the API.

### For end users (clicking short links)

- **Instant redirect** — 301/302 with zero delay by default
- **Branded interstitial pages** — when the creator chooses manual or countdown redirect, visitors see a polished page with custom title, rich-text body (WYSIWYG / Markdown), configurable delay (0–60s), and a themed button — not a generic "click here to continue"
- **Access-protected links** — creators can set an `accessPassword`; visitors must enter it before proceeding, useful for sharing sensitive content with a select audience
- **11 languages, dark / light mode** — the interstitial page auto-adapts to the visitor's browser language and theme preference

### For anonymous link creators (web UI, no account)

- **Create without signup** — open the page, paste a URL, get a short link. No email, no OAuth, no tracking cookies
- **One-time modification password** — shown once at creation. Save it and you can view, edit, or delete your link anytime — you own your link without needing an account
- **Rich redirect page editor** — toggle between WYSIWYG and Markdown to craft a branded interstitial with custom title, button text, dark/light background, and centered layout
- **One-time links** — check a box and the link self-destructs after the first successful redirect; deletion happens only when the visitor actually navigates, not when the page is merely viewed
- **Rate-limited, not blocked** — a passive fingerprint (IP + UA + TLS, no client storage) enforces a fair daily quota (`LIMIT`, default 10) instead of requiring login

### For automation & API users

- **RESTful CRUD** — standard `POST` / `PUT` / `DELETE` / `HEAD` on `/:slug`, easy to integrate into CI/CD or scripts
- **Flexible auth** — per-link password via `X-Password`, or global admin key via `X-API-Key` / `Bearer`; private deploys can skip key auth entirely
- **Custom or random slugs** — pick your own (3–10 chars) or let the system generate one
- **Per-link TTL** — set expiration on any link independently
- **All page options via API** — redirect mode, countdown, title, Markdown body, button text, access password, dark background — everything the web UI can do

### For administrators (with admin key)

- **Global admin key** — manage any link regardless of its modification password; rotate keys anytime via the `KEY` environment variable
- **Lock screen** — optional `LOCK` secret puts a password gate on the web UI while leaving the API fully operational
- **Anti-enumeration** — no 404 responses anywhere; unknown slugs redirect silently to home or a configurable `DEFAULT` URL; all write failures return 403
- **Loop prevention** — target URLs pointing to this service or common shorteners (bit.ly, tinyurl.com, t.co, etc.) are rejected at both frontend and API level
- **Zero infrastructure** — no database, no Redis, no Docker; one JS file + one KV namespace, deployed on Cloudflare's edge in 300+ cities

## Routes

| Method   | Path     | Description                                                                 |
|----------|----------|-----------------------------------------------------------------------------|
| `GET`    | `/`      | Landing page                                                                |
| `GET`    | `/:slug` | Redirect to target URL                                                      |
| `HEAD`   | `/:slug` | Verify slug + password (`X-Password` header); returns 200 or 403 only       |
| `POST`   | `/`      | Create with random slug                                                     |
| `POST`   | `/:slug` | Create with custom slug, or verify + query existing slug                    |
| `PUT`    | `/:slug` | Update existing short link                                                  |
| `DELETE` | `/:slug` | Delete short link                                                           |

## Setup

1. Create a Cloudflare Worker and paste the contents of `shurl.js`
2. Bind a **KV namespace** named `DATA`
3. (Optional) Set **environment variables**:

   | Variable  | Type   | Description                                                                               |
   |-----------|--------|-------------------------------------------------------------------------------------------|
   | `KEY`     | Secret | Comma-separated admin keys for authentication; omit for open access                        |
   | `BASE`    | Text   | Short link base URL, e.g. `https://s.mydomain.tld`; omit to use request origin             |
   | `TTL`     | Text   | Default link expiration in seconds (integer >= 60); omit for permanent                     |
   | `DEFAULT` | Text   | Fallback redirect URL when slug not found; omit to redirect to home page                    |
   | `LOCK`    | Secret | Front-end lock screen password (3–16 printable chars, no spaces); does not affect API; omit for open access         |
   | `LIMIT`   | Text   | Public rate limit per 24 hours (default: 10, create + modify combined)                       |

4. Click the **Deploy** button in the Worker dashboard to complete deployment

## API

Pure RESTful API — no `/api/` prefix. All endpoints accept and return JSON.

### Authentication

**Admin Key** (required only when `KEY` environment variable is configured):

```
X-API-Key: your-admin-key
```
or
```
Authorization: Bearer your-admin-key
```

**Slug Password** (per-slug secret, returned on creation):

```
X-Password: slug-password
```

Password is always sent via the `X-Password` header, never in the request body.

### Error Responses

All errors return `{ "error": "<ERROR_CODE>" }` with an appropriate HTTP status code.

| Error Code              | Status | Description                                        |
|-------------------------|--------|----------------------------------------------------|
| `UNAUTHORIZED`          | 401    | Missing or invalid admin key                       |
| `INVALID_JSON`          | 400    | Request body is not valid JSON                     |
| `INVALID_URL`           | 400    | Target URL is not a valid HTTP/HTTPS URL           |
| `BLOCKED_URL`           | 400    | Target URL points to this service or a known shortener |
| `INVALID_REDIRECT_MODE` | 400    | `redirectMode` is not `instant` or `manual`        |
| `SLUG_EXISTS`           | 400    | Slug already taken and no password provided        |
| `SLUG_COLLISION`        | 503    | Random slug generation failed after retries        |
| `VERIFY_FAILED`         | 403    | Wrong password, slug not found, or no password     |

Note: write endpoints never return 404 — all failures use 403 `VERIFY_FAILED` to prevent slug enumeration.

### HEAD /:slug — Verify slug + password

Check whether a slug exists and the password is correct, without returning any data.

**Headers:**

| Header       | Required | Description                          |
|--------------|----------|--------------------------------------|
| `X-Password` | Yes      | Slug password                        |
| `X-API-Key`  | If KEY set | Admin key                          |

**Response:** No body.

| Status | Meaning                                      |
|--------|----------------------------------------------|
| 200    | Slug exists and password is correct          |
| 401    | Admin key missing or invalid                   |
| 403    | Wrong password / slug not found / no password |

### POST / — Create short URL (single)

Create a new short link. Optionally specify a custom slug via `POST /:slug` or in the request body.

**Headers:**

| Header       | Required   | Description                          |
|--------------|------------|--------------------------------------|
| `X-Password` | No         | If slug exists, verifies ownership and returns entry data |
| `X-API-Key`  | If KEY set | Admin key                            |

**Request Body:**

| Field                | Type    | Required | Description                                        |
|----------------------|---------|----------|----------------------------------------------------|
| `url`                | string  | Yes      | Target URL (must be valid HTTP/HTTPS)              |
| `slug`               | string  | No       | Custom slug; omit for random generation            |
| `redirectMode`       | string  | No       | `instant` or `manual`; default `instant`           |
| `permanent`          | boolean | No       | 301 (true) or 302 (false); default `true`          |
| `countdown`          | integer | No       | Seconds 0–60; default `0`                          |
| `redirectPageTitle`  | string  | No       | Custom redirect page title; max 128 chars          |
| `redirectPageContent`| string  | No       | Redirect page content (Markdown); max 2000 chars   |
| `manualBtnTitle`     | string  | No       | Custom redirect button text; max 128 chars         |
| `oneTime`            | boolean | No       | Link self-destructs after first redirect; default `false`  |
| `accessPassword`     | string  | No       | Visitor password for manual-redirect links (3–16 printable non-space chars); ignored if invalid or mode is `instant` |
| `lightPage`          | boolean | No       | Light background for redirect page; default `true` |
| `ttl`                | integer | No       | Expiration in seconds (60–31536000); 0 = permanent |

**Behavior:**

- If the slug format is invalid, a random slug is generated and the response includes `"warn": "SLUG_IGNORED"`.
- If the slug already exists and no `X-Password` is provided, returns 400 `SLUG_EXISTS`.
- If the slug already exists and `X-Password` is correct, returns the existing entry data.
- If the slug does not exist but `X-Password` is provided without `url`, returns 403 `VERIFY_FAILED`.

**Response (201 Created):**

```json
{
  "short_url": "https://example.com/aBc123",
  "slug": "aBc123",
  "target": "https://destination.com/page",
  "password": "HjKm5xNpQrSt2vWy"
}
```

`password` is returned on creation. **Save it immediately — it will not be shown again.**

If slug format was invalid: `"warn": "SLUG_IGNORED"` is included in the response.

### POST / — Batch create (admin only)

Create multiple short links in one request by sending a JSON array instead of a single object. Requires admin key.

**Headers:**

| Header       | Required | Description                          |
|--------------|----------|--------------------------------------|
| `X-API-Key`  | Yes      | Admin key                            |

**Request Body:** JSON array of create objects (same fields as single create).

**Behavior:**

- Duplicate slugs within the batch return 400 `BATCH_DUPLICATE_SLUG`.
- Each item is created independently; partial success is possible.
- Returns 201 if all succeed, 400 if all fail, 207 if mixed.

**Response:** JSON array of results, one per item (same format as single create, or `{ "error": "..." }` for failures).

### POST /:slug — Verify + query existing slug

Retrieve full details of an existing slug by verifying with password.

**Headers:**

| Header       | Required   | Description   |
|--------------|------------|---------------|
| `X-Password` | Yes        | Slug password |
| `X-API-Key`  | If KEY set | Admin key     |

**Response (200):**

```json
{
  "slug": "aBc123",
  "url": "https://destination.com/page",
  "redirectMode": "manual",
  "permanent": true,
  "countdown": 5,
  "redirectPageTitle": "Please wait...",
  "redirectPageContent": "**Content** in markdown",
  "manualBtnTitle": "Go now",
  "lightPage": true,
  "ttl": 86400,
  "createdAt": "2026-03-28T12:00:00.000Z",
  "updatedAt": "2026-03-29T08:30:00.000Z"
}
```

Fields at default values may be omitted. `pwHash` is never returned.

### PUT /:slug — Update short URL

Update an existing short link.

**Headers:**

| Header       | Required   | Description   |
|--------------|------------|---------------|
| `X-Password` | Yes        | Slug password |
| `X-API-Key`  | If KEY set | Admin key     |

**Request Body:** Same fields as create, plus:

| Field           | Type    | Required | Description                                          |
|-----------------|---------|----------|------------------------------------------------------|
| `resetPassword` | boolean | No       | Regenerate slug password; default `false`            |

**Response (200):**

Returns updated entry data. If `resetPassword` is `true`, a new `password` field is included — save it immediately.

### DELETE /:slug — Delete short URL

**Headers:**

| Header       | Required   | Description   |
|--------------|------------|---------------|
| `X-Password` | Yes        | Slug password |
| `X-API-Key`  | If KEY set | Admin key     |

Note: admins with `X-API-Key` can delete any slug without knowing its modification password.

**Response (200):**

```json
{
  "deleted": "aBc123"
}
```

### DELETE / — Purge all (admin only)

Delete **all** short links in the KV namespace. Requires admin key. Use with caution.

**Headers:**

| Header       | Required | Description                          |
|--------------|----------|--------------------------------------|
| `X-API-Key`  | Yes      | Admin key                            |

**Response (200):**

```json
{
  "purged": 42
}
```

### Admin-only capabilities

The following operations are exclusive to holders of the admin key (`X-API-Key`):

| Capability              | Description                                                        |
|-------------------------|--------------------------------------------------------------------|
| **Batch create**        | `POST /` with a JSON array — create multiple links in one request  |
| **Purge all**           | `DELETE /` — wipe every link in the namespace                      |
| **Manage any link**     | View, update, or delete any slug without its modification password |
| **Bypass rate limits**  | Admin requests are never rate-limited                              |

### GET / — Landing page

Returns the homepage / management UI.

### GET /:slug — Redirect

Redirects to the target URL using 301 or 302, or shows a countdown/manual redirect page depending on configuration.

If the slug does not exist, redirects (302) to `DEFAULT` URL or the homepage — never returns 404.

---

# 速至短链（Shurl）

单文件、零依赖的 Cloudflare Worker 短链接服务。一个 JS 文件 + 一个 KV 命名空间，一分钟内即可部署。

## 为什么选择速至短链？

大多数短链接服务要求你先注册才能创建链接，或者创建后完全无法管理。速至短链采用不同的思路：**任何人都可以创建链接并获得一次性修改密码** — 无需账号、无需登录、不设 Cookie。凭这个密码即可随时编辑或删除链接，Web 界面和 API 均可使用。

### 最终用户（点击短链接的人）

- **即时跳转** — 默认 301/302 零延迟直跳
- **品牌化中间页** — 创建者选择手动或倒计时跳转时，访客看到的是精心设计的页面：自定义标题、富文本正文（所见即所得 / Markdown）、可配置延迟（0–60 秒）、主题化按钮 — 而非千篇一律的"点击此处继续"
- **访问密码保护** — 创建者可设置 `accessPassword`，访客必须输入密码才能继续跳转，适合向特定人群分享敏感内容
- **11 种语言 + 亮色/暗色模式** — 中间页自动适配访客的浏览器语言和主题偏好

### 匿名链接创建者（Web 界面，无需账号）

- **无需注册即可创建** — 打开页面、粘贴 URL、获得短链接。不要邮箱、不要 OAuth、不设追踪 Cookie
- **一次性修改密码** — 创建时显示一次，保存好它就能随时查看、编辑或删除你的链接 — 不用注册账号也能拥有链接的完整控制权
- **富文本跳转页编辑器** — 在所见即所得和 Markdown 之间自由切换，打造品牌化中间页，自定义标题、按钮文案、亮色/暗色背景、内容居中
- **一次性链接** — 勾选即可创建跳转后自动销毁的链接；仅在访客真正完成跳转时才删除，而非仅展示页面时
- **限频而非封锁** — 基于被动指纹（IP + UA + TLS，无客户端存储）实施合理的每日配额（`LIMIT`，默认 10 次），代替强制登录

### 自动化与 API 用户

- **RESTful CRUD** — 标准 `POST` / `PUT` / `DELETE` / `HEAD` 操作 `/:slug`，轻松集成到 CI/CD 或脚本
- **灵活认证** — 逐链接密码（`X-Password`）或全局管理员密钥（`X-API-Key` / `Bearer`）；私有部署可完全跳过密钥认证
- **自定义或随机短码** — 自选（3–10 位）或系统生成
- **逐链接 TTL** — 每条链接可独立设置过期时间
- **所有页面选项均可通过 API 设置** — 跳转模式、倒计时、标题、Markdown 正文、按钮文案、访问密码、暗色背景 — Web 界面能做的，API 都能做

### 管理员（持有管理员密钥）

- **全局管理员密钥** — 可管理任意链接，无需其修改密码；随时通过 `KEY` 环境变量轮换密钥
- **锁屏保护** — 可选 `LOCK` Secret，为 Web 界面加上密码门禁，同时 API 不受影响
- **防枚举** — 全站无 404 响应；未知短码静默跳转至首页或可配置的 `DEFAULT` URL；所有写操作失败均返回 403
- **防循环跳转** — 指向本服务或常见短链接服务（bit.ly、tinyurl.com、t.co 等）的目标 URL 在前端和 API 层面均被拒绝
- **零基础设施** — 无需数据库、无需 Redis、无需 Docker；一个 JS 文件 + 一个 KV 命名空间，部署在 Cloudflare 全球 300+ 城市的边缘节点

## 路由

| 方法     | 路径     | 说明                                                                    |
|----------|----------|-------------------------------------------------------------------------|
| `GET`    | `/`      | 首页                                                                    |
| `GET`    | `/:slug` | 跳转到目标 URL                                                          |
| `HEAD`   | `/:slug` | 验证短码 + 密码（`X-Password` 请求头）；仅返回 200 或 403               |
| `POST`   | `/`      | 随机短码创建                                                            |
| `POST`   | `/:slug` | 指定短码创建，或验证 + 查询已有短码                                     |
| `PUT`    | `/:slug` | 更新短链接                                                              |
| `DELETE` | `/:slug` | 删除短链接                                                              |

## 配置步骤

1. 创建一个 Cloudflare Worker，将 `shurl.js` 的内容粘贴进去
2. 绑定一个名为 `DATA` 的 **KV 命名空间**
3. （可选）设置**环境变量**：

   | 变量名    | 类型   | 说明                                                                          |
   |-----------|--------|-------------------------------------------------------------------------------|
   | `KEY`     | Secret | 逗号分隔的管理员密钥；不设则无需认证                                           |
   | `BASE`    | Text   | 短链接基础 URL，如 `https://s.mydomain.tld`；不设则使用请求来源               |
   | `TTL`     | Text   | 默认链接过期时间（秒，整数 >= 60）；不设则永久                                |
   | `DEFAULT` | Text   | slug 不存在时的跳转 URL；不设或非法则回到首页                                 |
   | `LOCK`    | Secret | 前端锁屏密码（3–16 位可打印字符，不含空格）；不影响 API；不设则开放访问                         |
   | `LIMIT`   | Text   | 公开实例每 24 小时操作限额（默认 10，创建 + 修改合计）                         |

4. 点击 Worker 界面的**部署**按钮完成部署

## API

纯 RESTful API，无 `/api/` 前缀。所有端点接收和返回 JSON。

### 认证方式

**管理员密钥**（仅在配置了 `KEY` 环境变量时需要）：

```
X-API-Key: your-admin-key
```
或
```
Authorization: Bearer your-admin-key
```

**短码密码**（创建时返回的短码专属密钥）：

```
X-Password: slug-password
```

密码始终通过 `X-Password` 请求头发送，不再放在请求体中。

### 错误响应

所有错误返回 `{ "error": "<错误码>" }`，附带相应的 HTTP 状态码。

| 错误码                    | 状态码 | 说明                                      |
|---------------------------|--------|-------------------------------------------|
| `UNAUTHORIZED`            | 401    | 管理员密钥缺失或无效                      |
| `INVALID_JSON`            | 400    | 请求体不是有效的 JSON                     |
| `INVALID_URL`             | 400    | 目标 URL 不是有效的 HTTP/HTTPS 地址       |
| `BLOCKED_URL`             | 400    | 目标 URL 指向本服务或已知短链接服务       |
| `INVALID_REDIRECT_MODE`   | 400    | `redirectMode` 不是 `instant` 或 `manual` |
| `SLUG_EXISTS`             | 400    | 短码已存在且未提供密码                    |
| `SLUG_COLLISION`          | 503    | 随机短码生成失败                          |
| `VERIFY_FAILED`           | 403    | 密码错误、短码不存在或未提供密码          |

注：写入端点不会返回 404 —— 所有失败均使用 403 `VERIFY_FAILED`，以防止短码枚举。

### HEAD /:slug — 验证短码 + 密码

检查短码是否存在以及密码是否正确，不返回任何数据。

**请求头：**

| 请求头       | 必填       | 说明       |
|--------------|------------|------------|
| `X-Password` | 是         | 短码密码   |
| `X-API-Key`  | 配置时必填 | 管理员密钥 |

**响应：** 无响应体。

| 状态码 | 含义                             |
|--------|----------------------------------|
| 200    | 短码存在且密码正确               |
| 401    | 管理员密钥缺失或无效             |
| 403    | 密码错误 / 短码不存在 / 未提供密码 |

### POST / — 创建短链接（单条）

创建一条新短链接。可通过 `POST /:slug` 或请求体中的 `slug` 字段指定自定义短码。

**请求头：**

| 请求头       | 必填       | 说明                                     |
|--------------|------------|------------------------------------------|
| `X-Password` | 否         | 若短码已存在，验证所有权并返回条目数据   |
| `X-API-Key`  | 配置时必填 | 管理员密钥                               |

**请求体：**

| 字段                 | 类型    | 必填 | 说明                                         |
|----------------------|---------|------|----------------------------------------------|
| `url`                | string  | 是   | 目标 URL（须为有效的 HTTP/HTTPS 地址）       |
| `slug`               | string  | 否   | 自定义短码；留空则随机生成                   |
| `redirectMode`       | string  | 否   | `instant` 或 `manual`；默认 `instant`        |
| `permanent`          | boolean | 否   | 301（true）或 302（false）；默认 `true`      |
| `countdown`          | integer | 否   | 倒计时秒数 0–60；默认 `0`                   |
| `redirectPageTitle`  | string  | 否   | 自定义跳转页面标题；最长 128 字符            |
| `redirectPageContent`| string  | 否   | 跳转页面内容（Markdown）；最长 2000 字符     |
| `manualBtnTitle`     | string  | 否   | 自定义跳转按钮文案；最长 128 字符            |
| `oneTime`            | boolean | 否   | 跳转后即失效，首次跳转后自动删除；默认 `false`               |
| `accessPassword`     | string  | 否   | 访客密码，仅手动跳转模式有效（3–16 位可打印非空格字符）；无效则忽略 |
| `lightPage`          | boolean | 否   | 跳转页面使用亮色背景；默认 `true`            |
| `ttl`                | integer | 否   | 过期时间（60–31536000 秒）；0 = 永久         |

**行为说明：**

- 若短码格式无效，则自动生成随机短码，响应中包含 `"warn": "SLUG_IGNORED"`。
- 若短码已存在且未提供 `X-Password`，返回 400 `SLUG_EXISTS`。
- 若短码已存在且 `X-Password` 正确，返回已有条目数据。
- 若短码不存在但提供了 `X-Password` 而无 `url`，返回 403 `VERIFY_FAILED`。

**响应（201 已创建）：**

```json
{
  "short_url": "https://example.com/aBc123",
  "slug": "aBc123",
  "target": "https://destination.com/page",
  "password": "HjKm5xNpQrSt2vWy"
}
```

`password` 在创建时返回。**请立即保存，此密码仅显示一次。**

若短码格式无效：响应中会包含 `"warn": "SLUG_IGNORED"`。

### POST / — 批量创建（仅管理员）

发送 JSON 数组一次创建多条短链接。需要管理员密钥。

**请求头：**

| 请求头       | 必填 | 说明       |
|--------------|------|------------|
| `X-API-Key`  | 是   | 管理员密钥 |

**请求体：** 与单条创建相同字段的 JSON 数组。

**行为说明：**

- 批次内短码重复返回 400 `BATCH_DUPLICATE_SLUG`。
- 每条独立创建，可能部分成功。
- 全部成功返回 201，全部失败返回 400，部分成功返回 207。

**响应：** JSON 数组，每项与单条创建格式相同（失败项为 `{ "error": "..." }`）。

### POST /:slug — 验证并查询已有短码

通过密码验证后获取短码完整详情。

**请求头：**

| 请求头       | 必填       | 说明     |
|--------------|------------|----------|
| `X-Password` | 是         | 短码密码 |
| `X-API-Key`  | 配置时必填 | 管理员密钥 |

**响应（200）：**

```json
{
  "slug": "aBc123",
  "url": "https://destination.com/page",
  "redirectMode": "manual",
  "permanent": true,
  "countdown": 5,
  "redirectPageTitle": "Please wait...",
  "redirectPageContent": "**Content** in markdown",
  "manualBtnTitle": "Go now",
  "lightPage": true,
  "ttl": 86400,
  "createdAt": "2026-03-28T12:00:00.000Z",
  "updatedAt": "2026-03-29T08:30:00.000Z"
}
```

处于默认值的字段可能被省略。`pwHash` 不会返回。

### PUT /:slug — 更新短链接

更新已有短链接。

**请求头：**

| 请求头       | 必填       | 说明     |
|--------------|------------|----------|
| `X-Password` | 是         | 短码密码 |
| `X-API-Key`  | 配置时必填 | 管理员密钥 |

**请求体：** 与创建相同的字段，另加：

| 字段            | 类型    | 必填 | 说明                            |
|-----------------|---------|------|---------------------------------|
| `resetPassword` | boolean | 否   | 重新生成短码密码；默认 `false`  |

**响应（200）：**

返回更新后的条目数据。若 `resetPassword` 为 `true`，响应中包含新的 `password` 字段，请立即保存。

### DELETE /:slug — 删除短链接

**请求头：**

| 请求头       | 必填       | 说明     |
|--------------|------------|----------|
| `X-Password` | 是         | 短码密码   |
| `X-API-Key`  | 配置时必填 | 管理员密钥 |

注：持有 `X-API-Key` 的管理员可删除任意短码，无需其修改密码。

**响应（200）：**

```json
{
  "deleted": "aBc123"
}
```

### DELETE / — 清除全部（仅管理员）

删除 KV 命名空间中的**所有**短链接。需要管理员密钥。请谨慎使用。

**请求头：**

| 请求头       | 必填 | 说明       |
|--------------|------|------------|
| `X-API-Key`  | 是   | 管理员密钥 |

**响应（200）：**

```json
{
  "purged": 42
}
```

### 管理员专属功能

以下操作仅限持有管理员密钥（`X-API-Key`）的用户：

| 功能           | 说明                                                      |
|----------------|-----------------------------------------------------------|
| **批量创建**   | `POST /` 发送 JSON 数组 — 一次请求创建多条短链接          |
| **清除全部**   | `DELETE /` — 删除命名空间中的所有链接                     |
| **管理任意链接** | 无需修改密码即可查看、更新或删除任意短码                |
| **不受频率限制** | 管理员请求不受每日配额限制                              |

### GET / — 首页

返回首页 / 管理界面。

### GET /:slug — 跳转

根据配置使用 301 或 302 跳转至目标 URL，或显示倒计时/手动跳转页面。

若短码不存在，302 跳转至 `DEFAULT` URL 或首页 —— 不会返回 404。

---

# 速至短鏈（Shurl）

單檔案、零依賴的 Cloudflare Worker 短連結服務。一個 JS 檔案 + 一個 KV 命名空間，一分鐘內即可部署。

## 為什麼選擇速至短鏈？

大多數短連結服務要求你先註冊才能建立連結，或者建立後完全無法管理。速至短鏈採用不同的思路：**任何人都可以建立連結並取得一次性修改密碼** — 無需帳號、無需登入、不設 Cookie。憑這個密碼即可隨時編輯或刪除連結，Web 介面和 API 均可使用。

### 最終使用者（點擊短連結的人）

- **即時跳轉** — 預設 301/302 零延遲直跳
- **品牌化中間頁** — 建立者選擇手動或倒數跳轉時，訪客看到的是精心設計的頁面：自訂標題、富文字正文（所見即所得 / Markdown）、可配置延遲（0–60 秒）、主題化按鈕 — 而非千篇一律的「點擊此處繼續」
- **存取密碼保護** — 建立者可設定 `accessPassword`，訪客必須輸入密碼才能繼續跳轉，適合向特定人群分享敏感內容
- **11 種語言 + 亮色/暗色模式** — 中間頁自動適配訪客的瀏覽器語言和主題偏好

### 匿名連結建立者（Web 介面，無需帳號）

- **無需註冊即可建立** — 開啟頁面、貼上 URL、取得短連結。不要信箱、不要 OAuth、不設追蹤 Cookie
- **一次性修改密碼** — 建立時顯示一次，保存好它就能隨時檢視、編輯或刪除你的連結 — 不用註冊帳號也能擁有連結的完整控制權
- **富文字跳轉頁編輯器** — 在所見即所得和 Markdown 之間自由切換，打造品牌化中間頁，自訂標題、按鈕文案、亮色/暗色背景、內容置中
- **一次性連結** — 勾選即可建立跳轉後自動銷毀的連結；僅在訪客真正完成跳轉時才刪除，而非僅展示頁面時
- **限頻而非封鎖** — 基於被動指紋（IP + UA + TLS，無用戶端儲存）實施合理的每日配額（`LIMIT`，預設 10 次），代替強制登入

### 自動化與 API 使用者

- **RESTful CRUD** — 標準 `POST` / `PUT` / `DELETE` / `HEAD` 操作 `/:slug`，輕鬆整合到 CI/CD 或指令碼
- **靈活認證** — 逐連結密碼（`X-Password`）或全域管理員金鑰（`X-API-Key` / `Bearer`）；私有部署可完全跳過金鑰認證
- **自訂或隨機短碼** — 自選（3–10 位）或系統產生
- **逐連結 TTL** — 每條連結可獨立設定過期時間
- **所有頁面選項均可透過 API 設定** — 跳轉模式、倒數、標題、Markdown 正文、按鈕文案、存取密碼、暗色背景 — Web 介面能做的，API 都能做

### 管理員（持有管理員金鑰）

- **全域管理員金鑰** — 可管理任意連結，無需其修改密碼；隨時透過 `KEY` 環境變數輪換金鑰
- **鎖屏保護** — 選用 `LOCK` Secret，為 Web 介面加上密碼門禁，同時 API 不受影響
- **防列舉** — 全站無 404 回應；未知短碼靜默跳轉至首頁或可配置的 `DEFAULT` URL；所有寫入操作失敗均回傳 403
- **防循環跳轉** — 指向本服務或常見短連結服務（bit.ly、tinyurl.com、t.co 等）的目標 URL 在前端和 API 層面均被拒絕
- **零基礎設施** — 無需資料庫、無需 Redis、無需 Docker；一個 JS 檔案 + 一個 KV 命名空間，部署在 Cloudflare 全球 300+ 城市的邊緣節點

## 路由

| 方法     | 路徑     | 說明                                                                    |
|----------|----------|-------------------------------------------------------------------------|
| `GET`    | `/`      | 首頁                                                                    |
| `GET`    | `/:slug` | 跳轉到目標 URL                                                          |
| `HEAD`   | `/:slug` | 驗證短碼 + 密碼（`X-Password` 請求標頭）；僅回傳 200 或 403             |
| `POST`   | `/`      | 隨機短碼建立                                                            |
| `POST`   | `/:slug` | 指定短碼建立，或驗證 + 查詢既有短碼                                     |
| `PUT`    | `/:slug` | 更新短連結                                                              |
| `DELETE` | `/:slug` | 刪除短連結                                                              |

## 設定步驟

1. 建立一個 Cloudflare Worker，將 `shurl.js` 的內容貼入
2. 綁定一個名為 `DATA` 的 **KV 命名空間**
3. （選用）設定**環境變數**：

   | 變數名    | 類型   | 說明                                                                          |
   |-----------|--------|-------------------------------------------------------------------------------|
   | `KEY`     | Secret | 逗號分隔的管理員金鑰；不設則無需認證                                           |
   | `BASE`    | Text   | 短連結基礎 URL，如 `https://s.mydomain.tld`；不設則使用請求來源               |
   | `TTL`     | Text   | 預設連結過期時間（秒，整數 >= 60）；不設則永久                                |
   | `DEFAULT` | Text   | slug 不存在時的跳轉 URL；不設或非法則回到首頁                                 |
   | `LOCK`    | Secret | 前端鎖屏密碼（3–16 位可列印字元，不含空格）；不影響 API；不設則開放存取                         |
   | `LIMIT`   | Text   | 公開實例每 24 小時操作限額（預設 10，建立 + 修改合計）                         |

4. 點擊 Worker 介面的**部署**按鈕完成部署

## API

純 RESTful API，無 `/api/` 前綴。所有端點接收和回傳 JSON。

### 認證方式

**管理員金鑰**（僅在設定了 `KEY` 環境變數時需要）：

```
X-API-Key: your-admin-key
```
或
```
Authorization: Bearer your-admin-key
```

**短碼密碼**（建立時回傳的短碼專屬密鑰）：

```
X-Password: slug-password
```

密碼一律透過 `X-Password` 請求標頭發送，不再放在請求體中。

### 錯誤回應

所有錯誤回傳 `{ "error": "<錯誤碼>" }`，附帶相應的 HTTP 狀態碼。

| 錯誤碼                    | 狀態碼 | 說明                                      |
|---------------------------|--------|-------------------------------------------|
| `UNAUTHORIZED`            | 401    | 管理員金鑰缺失或無效                      |
| `INVALID_JSON`            | 400    | 請求體不是有效的 JSON                     |
| `INVALID_URL`             | 400    | 目標 URL 不是有效的 HTTP/HTTPS 地址       |
| `BLOCKED_URL`             | 400    | 目標 URL 指向本服務或已知短連結服務       |
| `INVALID_REDIRECT_MODE`   | 400    | `redirectMode` 不是 `instant` 或 `manual` |
| `SLUG_EXISTS`             | 400    | 短碼已存在且未提供密碼                    |
| `SLUG_COLLISION`          | 503    | 隨機短碼產生失敗                          |
| `VERIFY_FAILED`           | 403    | 密碼錯誤、短碼不存在或未提供密碼          |

注：寫入端點不會回傳 404 —— 所有失敗均使用 403 `VERIFY_FAILED`，以防止短碼列舉。

### HEAD /:slug — 驗證短碼 + 密碼

檢查短碼是否存在以及密碼是否正確，不回傳任何資料。

**請求標頭：**

| 請求標頭     | 必填       | 說明       |
|--------------|------------|------------|
| `X-Password` | 是         | 短碼密碼   |
| `X-API-Key`  | 設定時必填 | 管理員金鑰 |

**回應：** 無回應體。

| 狀態碼 | 含義                              |
|--------|-----------------------------------|
| 200    | 短碼存在且密碼正確                |
| 401    | 管理員金鑰缺失或無效              |
| 403    | 密碼錯誤 / 短碼不存在 / 未提供密碼 |

### POST / — 建立短連結（單條）

建立一條新短連結。可透過 `POST /:slug` 或請求體中的 `slug` 欄位指定自訂短碼。

**請求標頭：**

| 請求標頭     | 必填       | 說明                                     |
|--------------|------------|------------------------------------------|
| `X-Password` | 否         | 若短碼已存在，驗證所有權並回傳條目資料   |
| `X-API-Key`  | 設定時必填 | 管理員金鑰                               |

**請求體：**

| 欄位                 | 類型    | 必填 | 說明                                         |
|----------------------|---------|------|----------------------------------------------|
| `url`                | string  | 是   | 目標 URL（須為有效的 HTTP/HTTPS 地址）       |
| `slug`               | string  | 否   | 自訂短碼；留空則隨機產生                     |
| `redirectMode`       | string  | 否   | `instant` 或 `manual`；預設 `instant`        |
| `permanent`          | boolean | 否   | 301（true）或 302（false）；預設 `true`      |
| `countdown`          | integer | 否   | 倒數秒數 0–60；預設 `0`                     |
| `redirectPageTitle`  | string  | 否   | 自訂跳轉頁面標題；最長 128 字元              |
| `redirectPageContent`| string  | 否   | 跳轉頁面內容（Markdown）；最長 2000 字元     |
| `manualBtnTitle`     | string  | 否   | 自訂跳轉按鈕文案；最長 128 字元              |
| `oneTime`            | boolean | 否   | 跳轉後即失效，首次跳轉後自動刪除；預設 `false`               |
| `accessPassword`     | string  | 否   | 訪客密碼，僅手動跳轉模式有效（3–16 位可列印非空格字元）；無效則忽略 |
| `lightPage`          | boolean | 否   | 跳轉頁面使用亮色背景；預設 `true`            |
| `ttl`                | integer | 否   | 過期時間（60–31536000 秒）；0 = 永久         |

**行為說明：**

- 若短碼格式無效，則自動產生隨機短碼，回應中包含 `"warn": "SLUG_IGNORED"`。
- 若短碼已存在且未提供 `X-Password`，回傳 400 `SLUG_EXISTS`。
- 若短碼已存在且 `X-Password` 正確，回傳已有條目資料。
- 若短碼不存在但提供了 `X-Password` 而無 `url`，回傳 403 `VERIFY_FAILED`。

**回應（201 已建立）：**

```json
{
  "short_url": "https://example.com/aBc123",
  "slug": "aBc123",
  "target": "https://destination.com/page",
  "password": "HjKm5xNpQrSt2vWy"
}
```

`password` 在建立時回傳。**請立即儲存，此密碼僅顯示一次。**

若短碼格式無效：回應中會包含 `"warn": "SLUG_IGNORED"`。

### POST / — 批次建立（僅管理員）

發送 JSON 陣列一次建立多條短連結。需要管理員金鑰。

**請求標頭：**

| 請求標頭     | 必填 | 說明       |
|--------------|------|------------|
| `X-API-Key`  | 是   | 管理員金鑰 |

**請求體：** 與單條建立相同欄位的 JSON 陣列。

**行為說明：**

- 批次內短碼重複回傳 400 `BATCH_DUPLICATE_SLUG`。
- 每條獨立建立，可能部分成功。
- 全部成功回傳 201，全部失敗回傳 400，部分成功回傳 207。

**回應：** JSON 陣列，每項與單條建立格式相同（失敗項為 `{ "error": "..." }`）。

### POST /:slug — 驗證並查詢已有短碼

透過密碼驗證後取得短碼完整詳情。

**請求標頭：**

| 請求標頭     | 必填       | 說明     |
|--------------|------------|----------|
| `X-Password` | 是         | 短碼密碼 |
| `X-API-Key`  | 設定時必填 | 管理員金鑰 |

**回應（200）：**

```json
{
  "slug": "aBc123",
  "url": "https://destination.com/page",
  "redirectMode": "manual",
  "permanent": true,
  "countdown": 5,
  "redirectPageTitle": "Please wait...",
  "redirectPageContent": "**Content** in markdown",
  "manualBtnTitle": "Go now",
  "lightPage": true,
  "ttl": 86400,
  "createdAt": "2026-03-28T12:00:00.000Z",
  "updatedAt": "2026-03-29T08:30:00.000Z"
}
```

處於預設值的欄位可能被省略。`pwHash` 不會回傳。

### PUT /:slug — 更新短連結

更新已有短連結。

**請求標頭：**

| 請求標頭     | 必填       | 說明     |
|--------------|------------|----------|
| `X-Password` | 是         | 短碼密碼 |
| `X-API-Key`  | 設定時必填 | 管理員金鑰 |

**請求體：** 與建立相同的欄位，另加：

| 欄位            | 類型    | 必填 | 說明                            |
|-----------------|---------|------|---------------------------------|
| `resetPassword` | boolean | 否   | 重新產生短碼密碼；預設 `false`  |

**回應（200）：**

回傳更新後的條目資料。若 `resetPassword` 為 `true`，回應中包含新的 `password` 欄位，請立即儲存。

### DELETE /:slug — 刪除短連結

**請求標頭：**

| 請求標頭     | 必填       | 說明     |
|--------------|------------|----------|
| `X-Password` | 是         | 短碼密碼   |
| `X-API-Key`  | 設定時必填 | 管理員金鑰 |

注：持有 `X-API-Key` 的管理員可刪除任意短碼，無需其修改密碼。

**回應（200）：**

```json
{
  "deleted": "aBc123"
}
```

### DELETE / — 清除全部（僅管理員）

刪除 KV 命名空間中的**所有**短連結。需要管理員金鑰。請謹慎使用。

**請求標頭：**

| 請求標頭     | 必填 | 說明       |
|--------------|------|------------|
| `X-API-Key`  | 是   | 管理員金鑰 |

**回應（200）：**

```json
{
  "purged": 42
}
```

### 管理員專屬功能

以下操作僅限持有管理員金鑰（`X-API-Key`）的使用者：

| 功能             | 說明                                                      |
|------------------|-----------------------------------------------------------|
| **批次建立**     | `POST /` 發送 JSON 陣列 — 一次請求建立多條短連結          |
| **清除全部**     | `DELETE /` — 刪除命名空間中的所有連結                     |
| **管理任意連結** | 無需修改密碼即可檢視、更新或刪除任意短碼                  |
| **不受頻率限制** | 管理員請求不受每日配額限制                                |

### GET / — 首頁

回傳首頁 / 管理介面。

### GET /:slug — 跳轉

依據設定使用 301 或 302 跳轉至目標 URL，或顯示倒數計時/手動跳轉頁面。

若短碼不存在，302 跳轉至 `DEFAULT` URL 或首頁 —— 不會回傳 404。
