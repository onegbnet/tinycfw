# Mailgun Fire

A single-file Cloudflare Worker for sending emails via the Mailgun HTTP API, with a rich compose UI.

## Features

- **Markdown editor** — toolbar (bold / italic / lists / code / quote / hr / link) + live preview, powered by markdown-it
- **Attachments** — multiple files, up to ~50 MB total message size (the whole message — body + attachments — must fit Mailgun's send limit). A saved email is kept whole in KV; with `TTL` set it expires on schedule, otherwise it stays until deleted
- **AI-assisted compose** *(optional)* — draft a subject from your body, draft a body from your subject, or polish the body, with a model picker. Powered by Cloudflare Workers AI on the hosted Worker, or your own Ollama when self-hosted. Hidden entirely unless a model backend is configured
- **To / CC / BCC** — tag-style email input with validation
- **20 languages** — auto-detected from browser, with full RTL support
- **Sent history** — stored in Cloudflare KV (optional), with drawer UI, detail view, and batch delete
- **Password lock** — optional `LOCK` secret, unlock modal with "remember 30 days"
- **Dark / light mode** — toggle persisted via cookie (works in 100% of browsers including Strict Tracking Prevention modes)

## Setup

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
   | `LOCK`    | Secret | Access password (3–64 ASCII printable chars, no spaces); ignored if invalid; omit for open access |
   | `MODEL`   | Text   | Default AI model id, e.g. `@cf/meta/llama-3.1-8b-instruct`; only used when the `AI` binding is present; can also be picked per-request in the UI |

3. (Optional) Bind a **KV namespace** named `SENT` to enable sent email history
4. (Optional) Enable AI-assisted compose by binding **Workers AI** as `AI` — see **AI-assisted compose** below
5. Click the **Deploy** button in the Worker dashboard to complete deployment

## AI-assisted compose (optional)

The compose box has three AI helpers — draft a subject from the body, draft a body from the subject, and polish the body — plus a model picker. It's **off by default**: the buttons don't appear at all until a model backend is wired up.

- **On Cloudflare** — bind **Workers AI** to the Worker under the binding name `AI` (Settings → Bindings). Optionally set the `MODEL` variable to choose the default model (e.g. `@cf/meta/llama-3.1-8b-instruct`); you can also switch models per request from the picker.
- **Self-hosted** — point `OLLAMA` at an Ollama endpoint (see **Self-hosting (Docker)** below).

No API keys to manage either way — on Cloudflare the binding carries its own auth; self-hosted it talks to your own Ollama.

## Self-hosting (Docker)

mailgunfire isn't Cloudflare-only. The exact same worker bundle also runs on [workerd](https://github.com/cloudflare/workerd) (the open-source core of Cloudflare Workers) in a container — using **Redis** for storage instead of Workers KV, and **Ollama** instead of Workers AI. Same bytes, different bindings, resolved at runtime.

A ready-to-run image is published at `ghcr.io/onegbnet/mailgunfire`. Grab the two **example** config files from this repo's root — [`mailgunfire.yaml`](mailgunfire.yaml) (Docker Compose) and [`mailgunfire.env`](mailgunfire.env) (environment template) — fill in your Mailgun `DOMAIN` + `KEY` in `mailgunfire.env`, then:

```sh
docker compose -f mailgunfire.yaml --env-file mailgunfire.env up -d   # → http://localhost:8080
```

(Or rename them to `compose.yaml` + `.env` and just run `docker compose up -d`.) Both files are starting-point examples — every variable is documented inline in `mailgunfire.yaml`.

AI compose stays off until you point `OLLAMA` at an Ollama endpoint — your own, or the bundled one via `docker compose -f mailgunfire.yaml --profile ai up -d`.

### Cloudflare vs. self-hosted

Mailgun config is identical both ways (`DOMAIN` / `KEY` / `FROM` / `DISPLAY` / `EU` / `TTL` / `LOCK`). Only the storage + AI backends differ:

| | Cloudflare Worker | Self-hosted container |
|---|---|---|
| Storage (sent history + attachments) | Workers KV (binding `SENT`) | Redis (`KV=redis://…`, optional `PREFIX`) |
| AI compose backend | Workers AI (binding `AI`) | Ollama (`OLLAMA=http://…:11434`) |
| Default AI model | `MODEL` | `MODEL` |
| Deploy method | paste `mailgunfire.js` | `docker compose up` from the ghcr image |

---

# 开火邮件（Mailgun Fire）

单文件 Cloudflare Worker，通过 Mailgun HTTP API 发送邮件，附带富文本编辑界面。

## 功能（简体中文）

- **Markdown 编辑器** — 工具栏（粗体 / 斜体 / 列表 / 代码 / 引用 / 分隔线 / 链接）+ 实时预览，基于 markdown-it
- **附件** — 支持多文件，整封消息上限 ~50 MB（整封 = 正文 + 附件，需在 Mailgun 发送限制内）。已发送邮件整封存入 KV；设了 `TTL` 则按时过期，否则保留至手动删除
- **AI 辅助撰写** *(可选)* — 根据正文起草主题、根据主题起草正文，或润色正文，并可选择模型。托管 Worker 用 Cloudflare Workers AI，自托管时用你自己的 Ollama。未配置模型后端时整个功能隐藏
- **收件人 / 抄送 / 密送** — 标签式邮箱输入，自动校验
- **20 种语言** — 根据浏览器自动匹配，完整 RTL 支持
- **已发送记录** — 存储于 Cloudflare KV（可选），支持抽屉式查看、详情浏览和批量删除
- **密码锁** — 可选 `LOCK` Secret，访问前需输入密码，可勾选"30 天内免密"
- **亮色 / 暗色模式** — 可切换，偏好通过 cookie 持久化（在严格跟踪防护模式的浏览器下也工作）

## 配置步骤（简体中文）

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
   | `LOCK`    | Secret | 访问密码（3–64 位 ASCII 可打印字符，不含空格），不合法则忽略，不设则开放访问     |
   | `MODEL`   | Text   | 默认 AI 模型 id，如 `@cf/meta/llama-3.1-8b-instruct`；仅在绑定了 `AI` 时生效；也可在界面上按次选择 |

3. （可选）绑定一个名为 `SENT` 的 **KV 命名空间**以启用已发送记录
4. （可选）绑定 **Workers AI**（绑定名 `AI`）即可启用 AI 辅助撰写——详见下方 **AI 辅助撰写**
5. 点击 Worker 界面的**部署**按钮完成部署

## AI 辅助撰写（可选）

编辑区提供三个 AI 助手——根据正文起草主题、根据主题起草正文、润色正文——外加模型选择器。**默认关闭**：在配置好模型后端之前，这些按钮根本不出现。

- **在 Cloudflare 上** — 给 Worker 绑定 **Workers AI**，绑定名为 `AI`（Settings → Bindings）。可选地设置 `MODEL` 变量来指定默认模型（如 `@cf/meta/llama-3.1-8b-instruct`）；也可以在选择器里按次切换模型。
- **自托管** — 把 `OLLAMA` 指向一个 Ollama 端点（见下方 **自托管（Docker）**）。

两种方式都无需管理 API 密钥——在 Cloudflare 上绑定自带鉴权；自托管时直接与你自己的 Ollama 通信。

## 自托管（Docker）

开火邮件不只能跑在 Cloudflare 上。完全相同的 worker bundle 也能在容器里通过 [workerd](https://github.com/cloudflare/workerd)（Cloudflare Workers 的开源内核）运行——用 **Redis** 代替 Workers KV 做存储、用 **Ollama** 代替 Workers AI。同一份字节，只是绑定不同，运行时自动解析。

开箱即用的镜像发布在 `ghcr.io/onegbnet/mailgunfire`。从本仓库根目录取两个**示例**配置文件——[`mailgunfire.yaml`](mailgunfire.yaml)（Docker Compose）和 [`mailgunfire.env`](mailgunfire.env)（环境变量模板）——在 `mailgunfire.env` 里填入你的 Mailgun `DOMAIN` + `KEY`，然后：

```sh
docker compose -f mailgunfire.yaml --env-file mailgunfire.env up -d   # → http://localhost:8080
```

（或把它俩改名为 `compose.yaml` + `.env`，直接 `docker compose up -d`。）两个都是起步示例——每个变量都在 `mailgunfire.yaml` 里有行内说明。

AI 撰写默认关闭，直到你把 `OLLAMA` 指向一个 Ollama 端点——你自己的，或通过 `docker compose -f mailgunfire.yaml --profile ai up -d` 启动内置的。

### Cloudflare 与自托管的差异

两种方式的 Mailgun 配置完全一致（`DOMAIN` / `KEY` / `FROM` / `DISPLAY` / `EU` / `TTL` / `LOCK`），只有存储和 AI 后端不同：

| | Cloudflare Worker | 自托管容器 |
|---|---|---|
| 存储（已发送记录 + 附件） | Workers KV（绑定 `SENT`） | Redis（`KV=redis://…`，可选 `PREFIX`） |
| AI 撰写后端 | Workers AI（绑定 `AI`） | Ollama（`OLLAMA=http://…:11434`） |
| 默认 AI 模型 | `MODEL` | `MODEL` |
| 部署方式 | 粘贴 `mailgunfire.js` | 从 ghcr 镜像 `docker compose up` |

---

# 開火郵件（Mailgun Fire）

單檔案 Cloudflare Worker，透過 Mailgun HTTP API 發送郵件，附帶富文字編輯介面。

## 功能（繁體中文）

- **Markdown 編輯器** — 工具列（粗體 / 斜體 / 清單 / 程式碼 / 引用 / 分隔線 / 連結）+ 即時預覽，基於 markdown-it
- **附件** — 支援多檔案，整封訊息上限 ~50 MB（整封 = 正文 + 附件，需在 Mailgun 發送限制內）。已傳送郵件整封儲存於 KV；設了 `TTL` 則按時過期，否則保留至手動刪除
- **AI 輔助撰寫** *(選用)* — 根據正文起草主旨、根據主旨起草正文，或潤飾正文，並可選擇模型。託管 Worker 用 Cloudflare Workers AI，自我託管時用你自己的 Ollama。未設定模型後端時整個功能隱藏
- **收件人 / 副本 / 密件副本** — 標籤式信箱輸入，自動驗證
- **20 種語言** — 根據瀏覽器自動匹配，完整 RTL 支援
- **已傳送紀錄** — 儲存於 Cloudflare KV（選用），支援抽屜式檢視、詳情瀏覽和批次刪除
- **密碼鎖** — 選用 `LOCK` Secret，存取前需輸入密碼，可勾選「30 天內免密」
- **亮色 / 暗色模式** — 可切換，偏好透過 cookie 持久化（在嚴格追蹤防護模式的瀏覽器下也工作）

## 設定步驟（繁體中文）

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
   | `LOCK`    | Secret | 存取密碼（3–64 位 ASCII 可列印字元，不含空格），不合法則忽略，不設則開放存取     |
   | `MODEL`   | Text   | 預設 AI 模型 id，如 `@cf/meta/llama-3.1-8b-instruct`；僅在綁定了 `AI` 時生效；也可在介面上按次選擇 |

3. （選用）綁定一個名為 `SENT` 的 **KV 命名空間**以啟用已傳送紀錄
4. （選用）綁定 **Workers AI**（綁定名 `AI`）即可啟用 AI 輔助撰寫——詳見下方 **AI 輔助撰寫**
5. 點擊 Worker 介面的**部署**按鈕完成部署

## AI 輔助撰寫（選用）

編輯區提供三個 AI 助手——根據正文起草主旨、根據主旨起草正文、潤飾正文——外加模型選擇器。**預設關閉**：在設定好模型後端之前，這些按鈕根本不出現。

- **在 Cloudflare 上** — 給 Worker 綁定 **Workers AI**，綁定名為 `AI`（Settings → Bindings）。可選擇地設定 `MODEL` 變數來指定預設模型（如 `@cf/meta/llama-3.1-8b-instruct`）；也可以在選擇器裡按次切換模型。
- **自我託管** — 把 `OLLAMA` 指向一個 Ollama 端點（見下方 **自我託管（Docker）**）。

兩種方式都無需管理 API 金鑰——在 Cloudflare 上綁定自帶鑑權；自我託管時直接與你自己的 Ollama 通訊。

## 自我託管（Docker）

開火郵件不只能跑在 Cloudflare 上。完全相同的 worker bundle 也能在容器裡透過 [workerd](https://github.com/cloudflare/workerd)（Cloudflare Workers 的開源核心）執行——用 **Redis** 代替 Workers KV 做儲存、用 **Ollama** 代替 Workers AI。同一份位元組，只是綁定不同，執行時自動解析。

開箱即用的映像發佈在 `ghcr.io/onegbnet/mailgunfire`。從本倉庫根目錄取兩個**範例**設定檔——[`mailgunfire.yaml`](mailgunfire.yaml)（Docker Compose）和 [`mailgunfire.env`](mailgunfire.env)（環境變數範本）——在 `mailgunfire.env` 裡填入你的 Mailgun `DOMAIN` + `KEY`，然後：

```sh
docker compose -f mailgunfire.yaml --env-file mailgunfire.env up -d   # → http://localhost:8080
```

（或把它倆改名為 `compose.yaml` + `.env`，直接 `docker compose up -d`。）兩個都是起步範例——每個變數都在 `mailgunfire.yaml` 裡有行內說明。

AI 撰寫預設關閉，直到你把 `OLLAMA` 指向一個 Ollama 端點——你自己的，或透過 `docker compose -f mailgunfire.yaml --profile ai up -d` 啟動內建的。

### Cloudflare 與自我託管的差異

兩種方式的 Mailgun 設定完全一致（`DOMAIN` / `KEY` / `FROM` / `DISPLAY` / `EU` / `TTL` / `LOCK`），只有儲存和 AI 後端不同：

| | Cloudflare Worker | 自我託管容器 |
|---|---|---|
| 儲存（已傳送紀錄 + 附件） | Workers KV（綁定 `SENT`） | Redis（`KV=redis://…`，選用 `PREFIX`） |
| AI 撰寫後端 | Workers AI（綁定 `AI`） | Ollama（`OLLAMA=http://…:11434`） |
| 預設 AI 模型 | `MODEL` | `MODEL` |
| 部署方式 | 貼上 `mailgunfire.js` | 從 ghcr 映像 `docker compose up` |
