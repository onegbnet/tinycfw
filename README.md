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

A single-file Cloudflare Worker URL shortener with flexible redirect modes, multi-language UI, and admin API.

### Features

- **Create & modify** short links with custom or random slugs (3–10 alphanumeric characters)
- **Two redirect modes** — instant (301/302) or manual/countdown with customizable page
- **Countdown / manual page** — configurable delay (0–60s), custom title, Markdown body content, custom button text, light/dark background
- **Password-protected slugs** — auto-generated modification password, shown once on creation, renewable on update (explicit `resetPassword: true` required)
- **Admin API** — create, query, verify, update, delete; password auth via `X-Password` header; API key via `X-API-Key` or `Bearer` auth; optional when `KEY` is not set
- **Security** — no 404 responses anywhere; all failures on write endpoints return 403 to prevent slug enumeration; nonexistent slugs redirect to home/`DEFAULT`
- **Two-step modify UI** — verify slug + password with HEAD first, then choose View/Edit or Delete
- **11 languages** — auto-detected from browser, with full RTL support
- **Dark / light mode** — toggle with localStorage persistence
- **Per-link TTL** — optional expiration per short link
- **Default redirect** — fallback URL when slug not found (optional `DEFAULT` variable)

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
   | `KEY`     | Secret | Comma-separated API keys for authentication; omit for open access                          |
   | `BASE`    | Text   | Short link base URL, e.g. `https://s.mydomain.tld`; omit to use request origin             |
   | `TTL`     | Text   | Default link expiration in seconds (integer >= 60); omit for permanent                     |
   | `DEFAULT` | Text   | Fallback redirect URL when slug not found; omit to redirect to home page                    |

4. Click the **Deploy** button in the Worker dashboard to complete deployment

For API documentation, see [API.md](API.md#shurl).

单文件 Cloudflare Worker 短链接服务，支持灵活的跳转模式、多语言界面和管理 API。

### 功能（简体中文）

- **创建和修改**短链接，支持自定义或随机短码（3–10 位字母数字）
- **两种跳转模式** — 立即跳转（301/302）或手动/倒计时跳转，页面可自定义
- **跳转页面** — 可配置延迟（0–60 秒）、自定义标题、Markdown 正文内容、自定义按钮文案、亮色/暗色背景
- **密码保护短码** — 创建时自动生成修改密码，仅显示一次，修改时需显式传 `resetPassword: true` 方可更换
- **管理 API** — 创建、查询、验证、更新、删除；密码通过 `X-Password` 请求头传递；API 密钥通过 `X-API-Key` 或 `Bearer` 认证；未设 `KEY` 时无需认证
- **安全性** — 全站无 404 响应；所有写端点失败均返回 403 以防止短码枚举；不存在的短码重定向到首页/`DEFAULT`
- **两步修改流程** — 先通过 HEAD 验证短码 + 密码，再选择查看/编辑或删除
- **11 种语言** — 根据浏览器自动匹配，完整 RTL 支持
- **亮色 / 暗色模式** — 可切换，选择保存在 localStorage
- **逐链接 TTL** — 每条短链接可设独立过期时间
- **默认跳转** — slug 不存在时跳转到指定 URL 或回到首页（可选 `DEFAULT` 变量）

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
   | `KEY`     | Secret | 逗号分隔的 API 密钥；不设则无需认证                                           |
   | `BASE`    | Text   | 短链接基础 URL，如 `https://s.mydomain.tld`；不设则使用请求来源               |
   | `TTL`     | Text   | 默认链接过期时间（秒，整数 >= 60）；不设则永久                                |
   | `DEFAULT` | Text   | slug 不存在时的跳转 URL；不设或非法则回到首页                                 |

4. 点击 Worker 界面的**部署**按钮完成部署

API 文档详见 [API.md](API.md#shurl简体中文)。

單檔案 Cloudflare Worker 短連結服務，支援靈活的跳轉模式、多語言介面和管理 API。

### 功能（繁體中文）

- **建立和修改**短連結，支援自訂或隨機短碼（3–10 位字母數字）
- **兩種跳轉模式** — 立即跳轉（301/302）或手動/倒數跳轉，頁面可自訂
- **跳轉頁面** — 可配置延遲（0–60 秒）、自訂標題、Markdown 正文內容、自訂按鈕文案、亮色/暗色背景
- **密碼保護短碼** — 建立時自動產生修改密碼，僅顯示一次，修改時需明確傳 `resetPassword: true` 方可更換
- **管理 API** — 建立、查詢、驗證、更新、刪除；密碼透過 `X-Password` 請求標頭傳遞；API 金鑰透過 `X-API-Key` 或 `Bearer` 認證；未設 `KEY` 時無需認證
- **安全性** — 全站無 404 回應；所有寫入端點失敗均回傳 403 以防止短碼列舉；不存在的短碼重新導向至首頁/`DEFAULT`
- **兩步修改流程** — 先透過 HEAD 驗證短碼 + 密碼，再選擇檢視/編輯或刪除
- **11 種語言** — 根據瀏覽器自動匹配，完整 RTL 支援
- **亮色 / 暗色模式** — 可切換，選擇保存在 localStorage
- **逐連結 TTL** — 每條短連結可設獨立過期時間
- **預設跳轉** — slug 不存在時跳轉到指定 URL 或回到首頁（選用 `DEFAULT` 變數）

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
   | `KEY`     | Secret | 逗號分隔的 API 金鑰；不設則無需認證                                           |
   | `BASE`    | Text   | 短連結基礎 URL，如 `https://s.mydomain.tld`；不設則使用請求來源               |
   | `TTL`     | Text   | 預設連結過期時間（秒，整數 >= 60）；不設則永久                                |
   | `DEFAULT` | Text   | slug 不存在時的跳轉 URL；不設或非法則回到首頁                                 |

4. 點擊 Worker 介面的**部署**按鈕完成部署

API 文件詳見 [API.md](API.md#shurl繁體中文)。

---

## gnum.py

Graham's number calculator using Conway chained arrow notation.
