# tinyutils

A collection of tiny, self-contained utility scripts.

---

## Mailgun Fire

A single-file Cloudflare Worker for sending emails via the Mailgun HTTP API, with a rich compose UI.

### Features

- **Rich text editor** — WYSIWYG / Markdown toggle, powered by markdown-it
- **To / CC / BCC** — tag-style email input with validation
- **11 languages** — auto-detected from browser, with full RTL support
- **Sent history** — stored in Cloudflare KV (optional), with drawer UI, detail view, and batch delete
- **Password lock** — optional `LOCK` secret, unlock modal with "remember 30 days"
- **Dark / light mode** — toggle with localStorage persistence


### Setup

1. Create a Cloudflare Worker and paste the contents of `mailgunfire.js`
2. Set the following **environment variables** (Settings > Variables):

   | Variable  | Type   | Description                                                                               |
   |-----------|--------|-------------------------------------------------------------------------------------------|
   | `DOMAIN`  | Text   | Your Mailgun domain, e.g. `mydomain.tld`                                                  |
   | `KEY`     | Secret | Mailgun API key                                                                           |
   | `FROM`    | Text   | Default sender username, e.g. `noreply`                                                   |
   | `DISPLAY` | Text   | Default display name, e.g. `John Doe`                                                     |
   | `EU`      | Text   | If present, use Mailgun EU region; otherwise US                                            |
   | `TTL`     | Text   | Sent record expiration in seconds (integer >= 60); ignored if invalid; omit for permanent  |
   | `LOCK`    | Secret | Access password (4+ ASCII printable chars, no spaces); ignored if invalid; omit for open access |

3. (Optional) Bind a **KV namespace** named `SENT` to enable sent email history
4. Click the **Deploy** button in the Worker dashboard to complete deployment

## 开火邮件（Mailgun Fire）

单文件 Cloudflare Worker，通过 Mailgun HTTP API 发送邮件，附带富文本编辑界面。

### 功能（简体中文）

- **富文本编辑器** — 所见即所得 / Markdown 切换，基于 markdown-it
- **收件人 / 抄送 / 密送** — 标签式邮箱输入，自动校验
- **11 种语言** — 根据浏览器自动匹配，完整 RTL 支持
- **已发送记录** — 存储于 Cloudflare KV（可选），支持抽屉式查看、详情浏览和批量删除
- **密码锁** — 可选 `LOCK` Secret，访问前需输入密码，可勾选"30 天内免密"
- **亮色 / 暗色模式** — 可切换，选择保存在 localStorage


### 配置步骤（简体中文）

1. 创建一个 Cloudflare Worker，将 `mailgunfire.js` 的内容粘贴进去
2. 设置以下**环境变量**（Settings > Variables）：

   | 变量名    | 类型   | 说明                                                                          |
   |-----------|--------|-------------------------------------------------------------------------------|
   | `DOMAIN`  | Text   | Mailgun 域名，如 `mydomain.tld`                                               |
   | `KEY`     | Secret | Mailgun API 密钥                                                              |
   | `FROM`    | Text   | 默认发件人用户名，如 `noreply`                                                |
   | `DISPLAY` | Text   | 默认显示名称，如 `John Doe`                                                   |
   | `EU`      | Text   | 只要该键存在即使用欧洲区域，否则使用美国区域                                  |
   | `TTL`     | Text   | 已发送记录保存时长（秒，整数 >= 60），不合法则忽略，不设则永久保存             |
   | `LOCK`    | Secret | 访问密码（4+ 位 ASCII 可打印字符，不含空格），不合法则忽略，不设则开放访问     |

3. （可选）绑定一个名为 `SENT` 的 **KV 命名空间**以启用已发送记录
4. 点击 Worker 界面的**部署**按钮完成部署

## 開火郵件（Mailgun Fire）

單檔案 Cloudflare Worker，透過 Mailgun HTTP API 發送郵件，附帶富文字編輯介面。

### 功能（繁體中文）

- **富文字編輯器** — 所見即所得 / Markdown 切換，基於 markdown-it
- **收件人 / 副本 / 密件副本** — 標籤式信箱輸入，自動驗證
- **11 種語言** — 根據瀏覽器自動匹配，完整 RTL 支援
- **已傳送紀錄** — 儲存於 Cloudflare KV（選用），支援抽屜式檢視、詳情瀏覽和批次刪除
- **密碼鎖** — 選用 `LOCK` Secret，存取前需輸入密碼，可勾選「30 天內免密」
- **亮色 / 暗色模式** — 可切換，選擇保存在 localStorage


### 設定步驟（繁體中文）

1. 建立一個 Cloudflare Worker，將 `mailgunfire.js` 的內容貼入
2. 設定以下**環境變數**（Settings > Variables）：

   | 變數名    | 類型   | 說明                                                                          |
   |-----------|--------|-------------------------------------------------------------------------------|
   | `DOMAIN`  | Text   | Mailgun 網域，如 `mydomain.tld`                                               |
   | `KEY`     | Secret | Mailgun API 金鑰                                                              |
   | `FROM`    | Text   | 預設寄件人使用者名稱，如 `noreply`                                            |
   | `DISPLAY` | Text   | 預設顯示名稱，如 `John Doe`                                                   |
   | `EU`      | Text   | 只要該鍵存在即使用歐洲區域，否則使用美國區域                                  |
   | `TTL`     | Text   | 已傳送紀錄保存時長（秒，整數 >= 60），不合法則忽略，不設則永久保存             |
   | `LOCK`    | Secret | 存取密碼（4+ 位 ASCII 可列印字元，不含空格），不合法則忽略，不設則開放存取     |

3. （選用）綁定一個名為 `SENT` 的 **KV 命名空間**以啟用已傳送紀錄
4. 點擊 Worker 介面的**部署**按鈕完成部署

---

## Shurl

A single-file, zero-dependency Cloudflare Worker URL shortener. One JS file, one KV namespace — deploy in under a minute.

### Why Shurl?

Most URL shorteners force you to sign up before you can create a link, or give you zero control once the link is made. Shurl takes a different approach: **anyone can create a link and get a one-time modification password** — no account, no login, no cookies. That password is the key to edit or delete the link later, and it works just as well from the web UI as it does from the API.

#### For end users (clicking short links)

- **Instant redirect** — 301/302 with zero delay by default
- **Branded interstitial pages** — when the creator chooses manual or countdown redirect, visitors see a polished page with custom title, rich-text body (WYSIWYG / Markdown), configurable delay (0–60s), and a themed button — not a generic "click here to continue"
- **Access-protected links** — creators can set an `accessPassword`; visitors must enter it before proceeding, useful for sharing sensitive content with a select audience
- **11 languages, dark / light mode** — the interstitial page auto-adapts to the visitor's browser language and theme preference

#### For anonymous link creators (web UI, no account)

- **Create without signup** — open the page, paste a URL, get a short link. No email, no OAuth, no tracking cookies
- **One-time modification password** — shown once at creation. Save it and you can view, edit, or delete your link anytime — you own your link without needing an account
- **Rich redirect page editor** — toggle between WYSIWYG and Markdown to craft a branded interstitial with custom title, button text, dark/light background, and centered layout
- **Rate-limited, not blocked** — a passive fingerprint (IP + UA + TLS, no client storage) enforces a fair daily quota (`LIMIT`, default 10) instead of requiring login

#### For automation & API users

- **RESTful CRUD** — standard `POST` / `PUT` / `DELETE` / `HEAD` on `/:slug`, easy to integrate into CI/CD or scripts
- **Flexible auth** — per-link password via `X-Password`, or global admin key via `X-API-Key` / `Bearer`; private deploys can skip key auth entirely
- **Custom or random slugs** — pick your own (3–10 chars) or let the system generate one
- **Per-link TTL** — set expiration on any link independently
- **All page options via API** — redirect mode, countdown, title, Markdown body, button text, access password, dark background — everything the web UI can do

#### For administrators (with admin key)

- **Global admin key** — manage any link regardless of its modification password; rotate keys anytime via the `KEY` environment variable
- **Lock screen** — optional `LOCK` secret puts a password gate on the web UI while leaving the API fully operational
- **Anti-enumeration** — no 404 responses anywhere; unknown slugs redirect silently to home or a configurable `DEFAULT` URL; all write failures return 403
- **Zero infrastructure** — no database, no Redis, no Docker; one JS file + one KV namespace, deployed on Cloudflare's edge in 300+ cities

### Routes

| Method   | Path     | Description                                                                 |
|----------|----------|-----------------------------------------------------------------------------|
| `GET`    | `/`      | Landing page                                                                |
| `GET`    | `/:slug` | Redirect to target URL                                                      |
| `HEAD`   | `/:slug` | Verify slug + password (`X-Password` header); returns 200 or 403 only       |
| `POST`   | `/`      | Create with random slug                                                     |
| `POST`   | `/:slug` | Create with custom slug, or verify + query existing slug                    |
| `PUT`    | `/:slug` | Update existing short link                                                  |
| `DELETE` | `/:slug` | Delete short link                                                           |

### Setup

1. Create a Cloudflare Worker and paste the contents of `shurl.js`
2. Bind a **KV namespace** named `DATA`
3. (Optional) Set **environment variables**:

   | Variable  | Type   | Description                                                                               |
   |-----------|--------|-------------------------------------------------------------------------------------------|
   | `KEY`     | Secret | Comma-separated admin keys for authentication; omit for open access                        |
   | `BASE`    | Text   | Short link base URL, e.g. `https://s.mydomain.tld`; omit to use request origin             |
   | `TTL`     | Text   | Default link expiration in seconds (integer >= 60); omit for permanent                     |
   | `DEFAULT` | Text   | Fallback redirect URL when slug not found; omit to redirect to home page                    |
   | `LOCK`    | Secret | Front-end lock screen password (4+ chars); does not affect API; omit for open access         |
   | `LIMIT`   | Text   | Public rate limit per 24 hours (default: 10, create + modify combined)                       |

4. Click the **Deploy** button in the Worker dashboard to complete deployment

For API documentation, see [API.md](API.md#shurl).

## 速至短链（Shurl）

单文件、零依赖的 Cloudflare Worker 短链接服务。一个 JS 文件 + 一个 KV 命名空间，一分钟内即可部署。

### 为什么选择速至短链？

大多数短链接服务要求你先注册才能创建链接，或者创建后完全无法管理。速至短链采用不同的思路：**任何人都可以创建链接并获得一次性修改密码** — 无需账号、无需登录、不设 Cookie。凭这个密码即可随时编辑或删除链接，Web 界面和 API 均可使用。

#### 最终用户（点击短链接的人）

- **即时跳转** — 默认 301/302 零延迟直跳
- **品牌化中间页** — 创建者选择手动或倒计时跳转时，访客看到的是精心设计的页面：自定义标题、富文本正文（所见即所得 / Markdown）、可配置延迟（0–60 秒）、主题化按钮 — 而非千篇一律的"点击此处继续"
- **访问密码保护** — 创建者可设置 `accessPassword`，访客必须输入密码才能继续跳转，适合向特定人群分享敏感内容
- **11 种语言 + 亮色/暗色模式** — 中间页自动适配访客的浏览器语言和主题偏好

#### 匿名链接创建者（Web 界面，无需账号）

- **无需注册即可创建** — 打开页面、粘贴 URL、获得短链接。不要邮箱、不要 OAuth、不设追踪 Cookie
- **一次性修改密码** — 创建时显示一次，保存好它就能随时查看、编辑或删除你的链接 — 不用注册账号也能拥有链接的完整控制权
- **富文本跳转页编辑器** — 在所见即所得和 Markdown 之间自由切换，打造品牌化中间页，自定义标题、按钮文案、亮色/暗色背景、内容居中
- **限频而非封锁** — 基于被动指纹（IP + UA + TLS，无客户端存储）实施合理的每日配额（`LIMIT`，默认 10 次），代替强制登录

#### 自动化与 API 用户

- **RESTful CRUD** — 标准 `POST` / `PUT` / `DELETE` / `HEAD` 操作 `/:slug`，轻松集成到 CI/CD 或脚本
- **灵活认证** — 逐链接密码（`X-Password`）或全局管理员密钥（`X-API-Key` / `Bearer`）；私有部署可完全跳过密钥认证
- **自定义或随机短码** — 自选（3–10 位）或系统生成
- **逐链接 TTL** — 每条链接可独立设置过期时间
- **所有页面选项均可通过 API 设置** — 跳转模式、倒计时、标题、Markdown 正文、按钮文案、访问密码、暗色背景 — Web 界面能做的，API 都能做

#### 管理员（持有管理员密钥）

- **全局管理员密钥** — 可管理任意链接，无需其修改密码；随时通过 `KEY` 环境变量轮换密钥
- **锁屏保护** — 可选 `LOCK` Secret，为 Web 界面加上密码门禁，同时 API 不受影响
- **防枚举** — 全站无 404 响应；未知短码静默跳转至首页或可配置的 `DEFAULT` URL；所有写操作失败均返回 403
- **零基础设施** — 无需数据库、无需 Redis、无需 Docker；一个 JS 文件 + 一个 KV 命名空间，部署在 Cloudflare 全球 300+ 城市的边缘节点

### 路由（简体中文）

| 方法     | 路径     | 说明                                                                    |
|----------|----------|-------------------------------------------------------------------------|
| `GET`    | `/`      | 首页                                                                    |
| `GET`    | `/:slug` | 跳转到目标 URL                                                          |
| `HEAD`   | `/:slug` | 验证短码 + 密码（`X-Password` 请求头）；仅返回 200 或 403               |
| `POST`   | `/`      | 随机短码创建                                                            |
| `POST`   | `/:slug` | 指定短码创建，或验证 + 查询已有短码                                     |
| `PUT`    | `/:slug` | 更新短链接                                                              |
| `DELETE` | `/:slug` | 删除短链接                                                              |

### 配置步骤（简体中文）

1. 创建一个 Cloudflare Worker，将 `shurl.js` 的内容粘贴进去
2. 绑定一个名为 `DATA` 的 **KV 命名空间**
3. （可选）设置**环境变量**：

   | 变量名    | 类型   | 说明                                                                          |
   |-----------|--------|-------------------------------------------------------------------------------|
   | `KEY`     | Secret | 逗号分隔的管理员密钥；不设则无需认证                                           |
   | `BASE`    | Text   | 短链接基础 URL，如 `https://s.mydomain.tld`；不设则使用请求来源               |
   | `TTL`     | Text   | 默认链接过期时间（秒，整数 >= 60）；不设则永久                                |
   | `DEFAULT` | Text   | slug 不存在时的跳转 URL；不设或非法则回到首页                                 |
   | `LOCK`    | Secret | 前端锁屏密码（4+ 位字符）；不影响 API；不设则开放访问                         |
   | `LIMIT`   | Text   | 公开实例每 24 小时操作限额（默认 10，创建 + 修改合计）                         |

4. 点击 Worker 界面的**部署**按钮完成部署

API 文档详见 [API.md](API.md#shurl简体中文)。

## 速至短鏈（Shurl）

單檔案、零依賴的 Cloudflare Worker 短連結服務。一個 JS 檔案 + 一個 KV 命名空間，一分鐘內即可部署。

### 為什麼選擇速至短鏈？

大多數短連結服務要求你先註冊才能建立連結，或者建立後完全無法管理。速至短鏈採用不同的思路：**任何人都可以建立連結並取得一次性修改密碼** — 無需帳號、無需登入、不設 Cookie。憑這個密碼即可隨時編輯或刪除連結，Web 介面和 API 均可使用。

#### 最終使用者（點擊短連結的人）

- **即時跳轉** — 預設 301/302 零延遲直跳
- **品牌化中間頁** — 建立者選擇手動或倒數跳轉時，訪客看到的是精心設計的頁面：自訂標題、富文字正文（所見即所得 / Markdown）、可配置延遲（0–60 秒）、主題化按鈕 — 而非千篇一律的「點擊此處繼續」
- **存取密碼保護** — 建立者可設定 `accessPassword`，訪客必須輸入密碼才能繼續跳轉，適合向特定人群分享敏感內容
- **11 種語言 + 亮色/暗色模式** — 中間頁自動適配訪客的瀏覽器語言和主題偏好

#### 匿名連結建立者（Web 介面，無需帳號）

- **無需註冊即可建立** — 開啟頁面、貼上 URL、取得短連結。不要信箱、不要 OAuth、不設追蹤 Cookie
- **一次性修改密碼** — 建立時顯示一次，保存好它就能隨時檢視、編輯或刪除你的連結 — 不用註冊帳號也能擁有連結的完整控制權
- **富文字跳轉頁編輯器** — 在所見即所得和 Markdown 之間自由切換，打造品牌化中間頁，自訂標題、按鈕文案、亮色/暗色背景、內容置中
- **限頻而非封鎖** — 基於被動指紋（IP + UA + TLS，無用戶端儲存）實施合理的每日配額（`LIMIT`，預設 10 次），代替強制登入

#### 自動化與 API 使用者

- **RESTful CRUD** — 標準 `POST` / `PUT` / `DELETE` / `HEAD` 操作 `/:slug`，輕鬆整合到 CI/CD 或指令碼
- **靈活認證** — 逐連結密碼（`X-Password`）或全域管理員金鑰（`X-API-Key` / `Bearer`）；私有部署可完全跳過金鑰認證
- **自訂或隨機短碼** — 自選（3–10 位）或系統產生
- **逐連結 TTL** — 每條連結可獨立設定過期時間
- **所有頁面選項均可透過 API 設定** — 跳轉模式、倒數、標題、Markdown 正文、按鈕文案、存取密碼、暗色背景 — Web 介面能做的，API 都能做

#### 管理員（持有管理員金鑰）

- **全域管理員金鑰** — 可管理任意連結，無需其修改密碼；隨時透過 `KEY` 環境變數輪換金鑰
- **鎖屏保護** — 選用 `LOCK` Secret，為 Web 介面加上密碼門禁，同時 API 不受影響
- **防列舉** — 全站無 404 回應；未知短碼靜默跳轉至首頁或可配置的 `DEFAULT` URL；所有寫入操作失敗均回傳 403
- **零基礎設施** — 無需資料庫、無需 Redis、無需 Docker；一個 JS 檔案 + 一個 KV 命名空間，部署在 Cloudflare 全球 300+ 城市的邊緣節點

### 路由（繁體中文）

| 方法     | 路徑     | 說明                                                                    |
|----------|----------|-------------------------------------------------------------------------|
| `GET`    | `/`      | 首頁                                                                    |
| `GET`    | `/:slug` | 跳轉到目標 URL                                                          |
| `HEAD`   | `/:slug` | 驗證短碼 + 密碼（`X-Password` 請求標頭）；僅回傳 200 或 403             |
| `POST`   | `/`      | 隨機短碼建立                                                            |
| `POST`   | `/:slug` | 指定短碼建立，或驗證 + 查詢既有短碼                                     |
| `PUT`    | `/:slug` | 更新短連結                                                              |
| `DELETE` | `/:slug` | 刪除短連結                                                              |

### 設定步驟（繁體中文）

1. 建立一個 Cloudflare Worker，將 `shurl.js` 的內容貼入
2. 綁定一個名為 `DATA` 的 **KV 命名空間**
3. （選用）設定**環境變數**：

   | 變數名    | 類型   | 說明                                                                          |
   |-----------|--------|-------------------------------------------------------------------------------|
   | `KEY`     | Secret | 逗號分隔的管理員金鑰；不設則無需認證                                           |
   | `BASE`    | Text   | 短連結基礎 URL，如 `https://s.mydomain.tld`；不設則使用請求來源               |
   | `TTL`     | Text   | 預設連結過期時間（秒，整數 >= 60）；不設則永久                                |
   | `DEFAULT` | Text   | slug 不存在時的跳轉 URL；不設或非法則回到首頁                                 |
   | `LOCK`    | Secret | 前端鎖屏密碼（4+ 位字元）；不影響 API；不設則開放存取                         |
   | `LIMIT`   | Text   | 公開實例每 24 小時操作限額（預設 10，建立 + 修改合計）                         |

4. 點擊 Worker 介面的**部署**按鈕完成部署

API 文件詳見 [API.md](API.md#shurl繁體中文)。

---

## gnum.py

Graham's number calculator using Conway chained arrow notation.
