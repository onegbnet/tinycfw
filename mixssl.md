# MixSSL

A single-file SSL certificate issuer using ACME DNS-01, running as a Cloudflare Worker. Its signature differentiator: one certificate can span multiple accounts under the same DNS registrar — e.g. two separate Cloudflare accounts (personal + work) — as well as multiple registrars and any of ZeroSSL / Google Trust Services as the issuing CA. So zones under different accounts of the same registrar, or zones split between Cloudflare (international) and DNSPod.cn (mainland China), can all live in one leaf certificate. A designated **built-in CA** is auto-registered on first run, cannot be deleted, and serves as the default fallback when another CA fails.

On Cloudflare the built-in CA is **ZeroSSL**: Let's Encrypt can't be used there because Cloudflare Workers' fetch to `acme-v02.api.letsencrypt.org` hits a persistent HTTP 525 TLS handshake failure on that network path. So on Cloudflare the `ZEK` + `ZEH` secrets are **required** to bootstrap ZeroSSL on first run; without them the worker refuses to operate. **When self-hosting, the built-in CA is [Let's Encrypt](https://letsencrypt.org) instead** — reachable from your own network, zero-config, no EAB — so there's no `ZEK`/`ZEH` when self-hosting (the ZeroSSL EAB is a Cloudflare-only variable). See [Self-hosting](#self-hosting-docker).

## Features

- **Mix accounts and registrars in one cert** — the unique differentiator: a single certificate can cover zones managed by multiple accounts of the same DNS registrar (e.g. two Cloudflare accounts) *and* multiple registrars at once. Each zone's DNS-01 challenge is signed by the correct account automatically. Currently supported DNS registrars: **Cloudflare (international)** and **DNSPod.cn (mainland China)**.
- **Multi-CA, chosen per config** — ZeroSSL (auto-bootstrapped built-in CA via EAB), Google Trust Services (GCP Service Account auto-mints EAB), and **Let's Encrypt** (zero-config, no EAB — the built-in CA when self-hosting). Each cert-config picks its primary CA and optional fallback chain. Let's Encrypt is **available only when self-hosting** — Cloudflare Workers can't reach it (the CF ↔ LE HTTP 525 issue), so on Cloudflare the built-in CA is ZeroSSL.
- **20 languages, dark / light mode** — auto-detected from browser, with full RTL support; theme + language preferences persisted via cookie (works in 100% of browsers including Strict Tracking Prevention modes)
- **Auto-renewal** — per-config policies: `days:N` before expiry, first-of-month, day-of-week, last-of-prev-month, or manual
- **Five key types** — EC P-256, EC P-384, RSA 2048, RSA 3072, RSA 4096
- **Encryption at rest** — account JWKs and DNS registrar credentials AES-GCM-256 encrypted with your `MASTER` secret
- **Robust revocation** — cert-key signing per RFC 8555 §7.6; works even after account rotation
- **Job state machine** — 1-minute cron ticks, idempotent steps, automatic fallback to the built-in CA on upstream failure
- **Danger Zone** — three manual purge scopes: certs only / accounts only / everything. A schema-incompatible upgrade auto-fires an "everything" purge on first boot (avoids a UI-blocking 500 from stale columns)
- **Certificate Transparency lookup** — public endpoints (no auth required regardless of `LOCK`) that proxy [crt.sh](https://crt.sh) CT search: `GET /{domain}` renders a paginated HTML page listing all CT log entries for the domain and its subdomains (50 per page, sorted by expiry newest first, showing subject, issuer, validity dates, and matching names); `GET /api/ct?domain={domain}` returns the same data as JSON `{ domain, certs: [{ id, url, not_before, not_after, subject, issuer, names }] }`.

## Setup

1. Create a Cloudflare Worker and paste the contents of `mixssl.js`
2. Bind a **D1 database** with the binding name `DATA`
3. Set the following **environment variables** (Settings > Variables):

   | Variable | Type   | Description                                                                 |
   |----------|--------|-----------------------------------------------------------------------------|
   | `LOCK`   | Secret | Dashboard password (3–64 ASCII printable chars, no spaces). Omit for open mode. |
   | `MASTER` | Secret | 32-byte AES-GCM key, base64-encoded. Generate in a browser console with `btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))` |
   | `ZEK`    | Secret | **Required.** ZeroSSL EAB KID — built-in CA bootstrap. Without it the worker halts. (Cloudflare-only; self-hosting has no ZEK/ZEH — its built-in CA is Let's Encrypt.) |
   | `ZEH`    | Secret | **Required.** ZeroSSL EAB HMAC (base64url), paired with `ZEK`. Without it the worker halts. (Cloudflare-only.) |

4. Add a **Cron Trigger** of `* * * * *` (every minute) — runs the job state machine and renewal scanner
5. Deploy

## Self-hosting (Docker)

MixSSL also runs outside Cloudflare as a self-hosted container, using the same worker bundle on [workerd](https://github.com/cloudflare/workerd) (the open-source core of Cloudflare Workers). Cloudflare's managed pieces are replaced by your own: **D1 → a [libSQL/sqld](https://github.com/tursodatabase/libsql) database** for storage, and the **cron trigger → a small per-minute ticker** that calls a token-gated `POST /_cron` endpoint (independent workerd has no managed cron). The built-in CA also changes: **on your own network Let's Encrypt is reachable**, so the container auto-registers **Let's Encrypt** as the zero-config built-in CA (no EAB). There is no `ZEK`/`ZEH` here — the ZeroSSL EAB is a Cloudflare-only variable that doesn't exist in the container. The browser still loads the UI from the public CDN, exactly as on Cloudflare.

The published image is `ghcr.io/onegbnet/mixssl:latest`. A ready-to-run Docker Compose file and an environment template ship alongside this doc as **`mixssl.yaml`** and **`mixssl.env`**. Save `mixssl.yaml` as `compose.yaml`, set `MASTER` + `CRON` (and optionally `LOCK`), then:

```sh
docker compose up -d
# open http://localhost:8080
```

Container environment variables:

| Variable | Description |
|----------|-------------|
| `DATA`   | libSQL/sqld HTTP URL (the bundled `sqld` service, e.g. `http://sqld:8080`). On Cloudflare this is the D1 binding instead. |
| `MASTER` | Same 32-byte base64 AES-GCM key as on Cloudflare. Generate with `openssl rand -base64 32`. |
| `CRON`   | Bearer token for the per-minute `POST /_cron` ticker that drives jobs + renewals. Set any random string — required for unattended automation in the container. On Cloudflare leave it unset (the platform cron trigger drives the worker there). |
| `LOCK`   | Optional dashboard password — same as Cloudflare. |

(There is no `ZEK`/`ZEH` here — the ZeroSSL EAB is Cloudflare-only.) ZeroSSL and Google Trust Services can still be added by hand in the UI as extra CAs.

Everything else — mixing DNS accounts/registrars and CAs in one certificate, auto-renewal, the CT lookup — works identically to the Cloudflare deployment (with Let's Encrypt also available as a CA, since your network can reach it).

---

# MixSSL（简体中文）

单文件 SSL 证书签发器，基于 ACME DNS-01，作为 Cloudflare Worker 运行。最核心的差异化：同一张证书可跨同一 DNS 管理机构下的多个账号（例如两个 Cloudflare 账号：个人 + 工作），也可以跨多个管理机构、并从 ZeroSSL / Google Trust Services 中任选一个签发 CA。这样无论是分散在同一家管理机构不同账号下的 zone，还是一半在 Cloudflare（国际）、一半在 DNSPod.cn（中国大陆）的 zone，都可以合到同一张终端证书里。系统指定一个**内置 CA**：首次运行时自动注册，不可删除，其他 CA 失败时默认兜底。

在 Cloudflare 上，内置 CA 为 **ZeroSSL**：那里无法使用 Let's Encrypt，因为 Cloudflare Workers 到 `acme-v02.api.letsencrypt.org` 的 TLS 握手会持续返回 HTTP 525（该网络路径上长期存在的已知问题）。所以在 Cloudflare 上 `ZEK` + `ZEH` Secret 为**必需**，用于首次运行时自动注册 ZeroSSL；未配置时 Worker 会拒绝运行。**自托管时，内置 CA改为 [Let's Encrypt](https://letsencrypt.org)** —— 在你自己的网络里可达、零配置、无需 EAB —— 因此自托管下没有 `ZEK`/`ZEH`（ZeroSSL EAB 是 Cloudflare 专属变量）。见下方「自托管」一节。

## 功能

- **一证多账号、多管理机构混合** — 产品的核心差异化：一张证书可以同时覆盖同一个 DNS 管理机构下多个账号的 zone（例如两个 Cloudflare 账号），也可以同时覆盖多个管理机构。每个 zone 的 DNS-01 challenge 会自动用对应的账号去签。当前支持的 DNS 管理机构：**Cloudflare（国际）** 与 **DNSPod.cn（中国大陆）**。
- **多 CA，按配置选择** — ZeroSSL（通过 EAB 自动引导的内置 CA）、Google Trust Services（GCP Service Account 自动铸造 EAB）、以及 **Let's Encrypt**（零配置、无需 EAB —— 自托管时的内置 CA）。每个证书配置单独选定主 CA 与可选的回退链。Let's Encrypt **仅在自托管时可用** —— Cloudflare Workers 连不到它（CF ↔ LE 的 HTTP 525 问题），所以在 Cloudflare 上内置 CA是 ZeroSSL。
- **20 种语言 + 亮色/暗色模式** — 根据浏览器自动匹配语言，完整 RTL 支持；主题与语言偏好通过 cookie 持久化（在严格跟踪防护模式的浏览器下也工作）
- **自动续签** — 每个配置可独立策略：到期前 N 天、每月 1 日、到期周的指定星期、到期前一月末日，或手动
- **五种密钥类型** — EC P-256、EC P-384、RSA 2048、RSA 3072、RSA 4096
- **静态加密** — 账号 JWK 和 DNS 管理机构凭证用 `MASTER` 密钥做 AES-GCM-256 加密
- **稳健吊销** — 按 RFC 8555 §7.6 用证书私钥签名，账号轮换后仍可吊销历史证书
- **任务状态机** — 每分钟 cron 推进，幂等步骤，上游 CA 失败时自动回退到内置 CA
- **危险区域** — 三种手动清除范围：仅证书 / 仅账号 / 全部。schema 不兼容的升级会在首次启动时自动执行一次"全部"清除（避免旧列查询导致阻塞 UI 的 500）
- **证书透明度查询** — 公开端点（无论 `LOCK` 是否设置均无需认证），代理 [crt.sh](https://crt.sh) CT 搜索：`GET /{domain}` 渲染分页 HTML 页面，列出该域名及其子域名的所有 CT 日志记录（每页 50 条，按到期时间倒序，显示主题、颁发机构、有效期和匹配域名）；`GET /api/ct?domain={domain}` 以 JSON 形式返回相同数据 `{ domain, certs: [{ id, url, not_before, not_after, subject, issuer, names }] }`。

## 配置步骤

1. 创建一个 Cloudflare Worker，将 `mixssl.js` 的内容粘贴进去
2. 绑定一个 **D1 数据库**，绑定名为 `DATA`
3. 设置以下**环境变量**（Settings > Variables）：

   | 变量名   | 类型   | 说明                                                                             |
   |----------|--------|---------------------------------------------------------------------------------|
   | `LOCK`   | Secret | 控制台访问密码（3–64 位 ASCII 可打印字符，不含空格）。不设则开放访问。           |
   | `MASTER` | Secret | 32 字节 AES-GCM 密钥，base64 编码。可在浏览器控制台执行 `btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))` 生成 |
   | `ZEK`    | Secret | **必需。** ZeroSSL EAB KID —— 内置 CA 引导用。未配置时 Worker 将拒绝运行。（仅 Cloudflare 用；自托管下没有 ZEK/ZEH —— 其内置 CA 是 Let's Encrypt。） |
   | `ZEH`    | Secret | **必需。** ZeroSSL EAB HMAC（base64url），与 `ZEK` 配对使用。未配置时 Worker 将拒绝运行。（仅 Cloudflare 用。） |

4. 添加 **Cron Trigger** `* * * * *`（每分钟一次）—— 驱动任务状态机和续签扫描
5. 部署

## 自托管（Docker）

MixSSL 也能脱离 Cloudflare、作为自托管容器运行，基于同一份 worker 跑在 [workerd](https://github.com/cloudflare/workerd)（Cloudflare Workers 的开源内核）上。Cloudflare 的托管组件由你自己的替代：**D1 → [libSQL/sqld](https://github.com/tursodatabase/libsql) 数据库**做存储，**cron 触发器 → 一个每分钟的小 ticker**，去调用带 token 的 `POST /_cron` 端点（独立 workerd 没有托管 cron）。内置 CA 也随之改变：**在你自己的网络里 Let's Encrypt 是可达的**，所以容器自动注册 **Let's Encrypt** 作为零配置内置 CA（无需 EAB）。这里没有 `ZEK`/`ZEH` —— ZeroSSL EAB 是 Cloudflare 专属变量、容器里不存在。浏览器仍从公共 CDN 加载 UI，与 Cloudflare 上完全一致。

发布的镜像是 `ghcr.io/onegbnet/mixssl:latest`。一份开箱即用的 Docker Compose 文件和环境变量模板随本文档一起发布，名为 **`mixssl.yaml`** 和 **`mixssl.env`**。把 `mixssl.yaml` 存为 `compose.yaml`，设好 `MASTER` + `CRON`（以及可选的 `LOCK`），然后：

```sh
docker compose up -d
# 打开 http://localhost:8080
```

容器环境变量：

| 变量名 | 说明 |
|--------|------|
| `DATA`   | libSQL/sqld 的 HTTP URL（内置的 `sqld` 服务，例如 `http://sqld:8080`）。在 Cloudflare 上这是 D1 绑定。 |
| `MASTER` | 与 Cloudflare 相同的 32 字节 base64 AES-GCM 密钥。用 `openssl rand -base64 32` 生成。 |
| `CRON`   | 给每分钟 `POST /_cron` ticker 用的 Bearer token，驱动任务 + 续签。设任意随机串 —— 容器里无人值守自动化所必需。在 Cloudflare 上留空（由平台 cron 触发器驱动）。 |
| `LOCK`   | 可选的控制台密码 —— 同 Cloudflare。 |

（这里没有 `ZEK`/`ZEH` —— ZeroSSL EAB 仅 Cloudflare 用。）ZeroSSL 和 Google Trust Services 仍可在界面里手动添加作为额外 CA。

其余一切 —— 一证混合多 DNS 账号/管理机构与多 CA、自动续签、CT 查询 —— 都与 Cloudflare 部署完全一致（且 Let's Encrypt 也可作为 CA，因为你的网络能连到它）。

---

# MixSSL（繁體中文）

單檔案 SSL 憑證簽發器，基於 ACME DNS-01，作為 Cloudflare Worker 執行。最核心的差異化：同一張憑證可跨同一 DNS 管理機構下的多個帳號（例如兩個 Cloudflare 帳號：個人 + 工作），也可以跨多個管理機構、並從 ZeroSSL / Google Trust Services 中任選一個簽發 CA。這樣無論是分散在同一家管理機構不同帳號下的 zone，還是一半在 Cloudflare（國際）、一半在 DNSPod.cn（中國大陸）的 zone，都可以合到同一張終端憑證裡。系統指定一個**內建 CA**：首次執行時自動註冊，不可刪除，其他 CA 失敗時預設兜底。

在 Cloudflare 上，內建 CA 為 **ZeroSSL**：那裡無法使用 Let's Encrypt，因為 Cloudflare Workers 到 `acme-v02.api.letsencrypt.org` 的 TLS 交握會持續回傳 HTTP 525（該網路路徑上長期存在的已知問題）。所以在 Cloudflare 上 `ZEK` + `ZEH` Secret 為**必需**，用於首次執行時自動註冊 ZeroSSL；未設定時 Worker 會拒絕運作。**自我託管時，內建 CA 改為 [Let's Encrypt](https://letsencrypt.org)** —— 在你自己的網路裡可達、零配置、無需 EAB —— 因此自我託管下沒有 `ZEK`/`ZEH`（ZeroSSL EAB 是 Cloudflare 專屬變數）。見下方「自我託管」一節。

## 功能

- **一證多帳號、多管理機構混合** — 產品的核心差異化：一張憑證可同時涵蓋同一家 DNS 管理機構下多個帳號的 zone（例如兩個 Cloudflare 帳號），也可同時涵蓋多家管理機構。每個 zone 的 DNS-01 challenge 會自動用對應帳號簽署。目前支援的 DNS 管理機構：**Cloudflare（國際）** 與 **DNSPod.cn（中國大陸）**。
- **多 CA，依設定選擇** — ZeroSSL（透過 EAB 自動引導的內建 CA）、Google Trust Services（GCP Service Account 自動鑄造 EAB）、以及 **Let's Encrypt**（零配置、無需 EAB —— 自我託管時的內建 CA）。每個憑證設定單獨選定主 CA 與可選的回退鏈。Let's Encrypt **僅在自我託管時可用** —— Cloudflare Workers 連不到它（CF ↔ LE 的 HTTP 525 問題），所以在 Cloudflare 上內建 CA 是 ZeroSSL。
- **20 種語言 + 亮色/暗色模式** — 根據瀏覽器自動匹配語言，完整 RTL 支援；主題與語言偏好透過 cookie 持久化（在嚴格追蹤防護模式的瀏覽器下也工作）
- **自動續簽** — 每個設定可獨立策略：到期前 N 天、每月 1 日、到期週的指定星期、到期前一月末日，或手動
- **五種金鑰類型** — EC P-256、EC P-384、RSA 2048、RSA 3072、RSA 4096
- **靜態加密** — 帳號 JWK 和 DNS 管理機構憑據用 `MASTER` 金鑰做 AES-GCM-256 加密
- **穩健吊銷** — 依 RFC 8555 §7.6 以憑證私鑰簽名，帳號輪換後仍可吊銷歷史憑證
- **任務狀態機** — 每分鐘 cron 推進，冪等步驟，上游 CA 失敗時自動回退至內建 CA
- **危險區域** — 三種手動清除範圍：僅憑證 / 僅帳號 / 全部。schema 不相容的升級會在首次啟動時自動執行一次「全部」清除（避免舊欄位查詢導致阻塞 UI 的 500）
- **憑證透明度查詢** — 公開端點（無論 `LOCK` 是否設定均無需認證），代理 [crt.sh](https://crt.sh) CT 搜尋：`GET /{domain}` 渲染分頁 HTML 頁面，列出該域名及其子域名的所有 CT 日誌記錄（每頁 50 筆，依到期時間倒序，顯示主題、核發機構、有效期與匹配域名）；`GET /api/ct?domain={domain}` 以 JSON 形式回傳相同資料 `{ domain, certs: [{ id, url, not_before, not_after, subject, issuer, names }] }`。

## 設定步驟

1. 建立一個 Cloudflare Worker，將 `mixssl.js` 的內容貼入
2. 綁定一個 **D1 資料庫**，綁定名稱為 `DATA`
3. 設定以下**環境變數**（Settings > Variables）：

   | 變數名   | 類型   | 說明                                                                             |
   |----------|--------|---------------------------------------------------------------------------------|
   | `LOCK`   | Secret | 控制台存取密碼（3–64 位 ASCII 可列印字元，不含空格）。未設定則開放存取。         |
   | `MASTER` | Secret | 32 位元組 AES-GCM 金鑰，base64 編碼。可在瀏覽器主控台執行 `btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))` 產生 |
   | `ZEK`    | Secret | **必需。** ZeroSSL EAB KID —— 內建 CA 引導用。未設定時 Worker 將拒絕運作。（僅 Cloudflare 用；自我託管下沒有 ZEK/ZEH —— 其內建 CA 是 Let's Encrypt。） |
   | `ZEH`    | Secret | **必需。** ZeroSSL EAB HMAC（base64url），與 `ZEK` 配對使用。未設定時 Worker 將拒絕運作。（僅 Cloudflare 用。） |

4. 新增 **Cron Trigger** `* * * * *`（每分鐘一次）—— 驅動任務狀態機和續簽掃描
5. 部署

## 自我託管（Docker）

MixSSL 也能脫離 Cloudflare、作為自我託管容器執行，基於同一份 worker 跑在 [workerd](https://github.com/cloudflare/workerd)（Cloudflare Workers 的開源核心）上。Cloudflare 的託管元件由你自己的替代：**D1 → [libSQL/sqld](https://github.com/tursodatabase/libsql) 資料庫**做儲存，**cron 觸發器 → 一個每分鐘的小 ticker**，去呼叫帶 token 的 `POST /_cron` 端點（獨立 workerd 沒有託管 cron）。內建 CA 也隨之改變：**在你自己的網路裡 Let's Encrypt 是可達的**，所以容器自動註冊 **Let's Encrypt** 作為零配置內建 CA（無需 EAB）。這裡沒有 `ZEK`/`ZEH` —— ZeroSSL EAB 是 Cloudflare 專屬變數、容器裡不存在。瀏覽器仍從公共 CDN 載入 UI，與 Cloudflare 上完全一致。

發布的映像是 `ghcr.io/onegbnet/mixssl:latest`。一份開箱即用的 Docker Compose 檔案和環境變數範本隨本文件一起發布，名為 **`mixssl.yaml`** 和 **`mixssl.env`**。把 `mixssl.yaml` 存為 `compose.yaml`，設好 `MASTER` + `CRON`（以及選用的 `LOCK`），然後：

```sh
docker compose up -d
# 開啟 http://localhost:8080
```

容器環境變數：

| 變數名 | 說明 |
|--------|------|
| `DATA`   | libSQL/sqld 的 HTTP URL（內建的 `sqld` 服務，例如 `http://sqld:8080`）。在 Cloudflare 上這是 D1 綁定。 |
| `MASTER` | 與 Cloudflare 相同的 32 位元組 base64 AES-GCM 金鑰。用 `openssl rand -base64 32` 產生。 |
| `CRON`   | 給每分鐘 `POST /_cron` ticker 用的 Bearer token，驅動任務 + 續簽。設任意隨機字串 —— 容器裡無人值守自動化所必需。在 Cloudflare 上留空（由平台 cron 觸發器驅動）。 |
| `LOCK`   | 選用的控制台密碼 —— 同 Cloudflare。 |

（這裡沒有 `ZEK`/`ZEH` —— ZeroSSL EAB 僅 Cloudflare 用。）ZeroSSL 和 Google Trust Services 仍可在介面裡手動添加作為額外 CA。

其餘一切 —— 一證混合多 DNS 帳號/管理機構與多 CA、自動續簽、CT 查詢 —— 都與 Cloudflare 部署完全一致（且 Let's Encrypt 也可作為 CA，因為你的網路能連到它）。
