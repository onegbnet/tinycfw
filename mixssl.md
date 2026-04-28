# MixSSL

A single-file SSL certificate issuer using ACME DNS-01, running as a Cloudflare Worker. Its signature differentiator: one certificate can span multiple accounts under the same DNS registrar — e.g. two separate Cloudflare accounts (personal + work) — as well as multiple registrars and any of ZeroSSL / Google Trust Services as the issuing CA. So zones under different accounts of the same registrar, or zones split between Cloudflare (international) and DNSPod.cn (mainland China), can all live in one leaf certificate. A designated **lifeline CA** is auto-registered on first run, cannot be deleted, and serves as the default fallback when another CA fails.

The lifeline CA is **ZeroSSL** (Let's Encrypt is not used because Cloudflare Workers fetch to `acme-v02.api.letsencrypt.org` returns a persistent HTTP 525 TLS handshake failure on that network path). The `ZEK` + `ZEH` secrets are **required** (not optional) so the worker can bootstrap ZeroSSL on first run. Without them the worker refuses to operate until they are supplied.

## Features

- **Mix accounts and registrars in one cert** — the unique differentiator: a single certificate can cover zones managed by multiple accounts of the same DNS registrar (e.g. two Cloudflare accounts) *and* multiple registrars at once. Each zone's DNS-01 challenge is signed by the correct account automatically. Currently supported DNS registrars: **Cloudflare (international)** and **DNSPod.cn (mainland China)**.
- **Multi-CA, chosen per config** — ZeroSSL (auto-bootstrapped lifeline via EAB), Google Trust Services (GCP Service Account auto-mints EAB). Each cert-config picks its primary CA and optional fallback chain. Let's Encrypt is **not available** in this build due to the CF ↔ LE HTTP 525 issue.
- **12 languages, dark / light mode** — auto-detected from browser, with full RTL support; theme toggle persisted to localStorage
- **Auto-renewal** — per-config policies: `days:N` before expiry, first-of-month, day-of-week, last-of-prev-month, or manual
- **Five key types** — EC P-256, EC P-384, RSA 2048, RSA 3072, RSA 4096
- **Encryption at rest** — account JWKs and DNS registrar credentials AES-GCM-256 encrypted with your `MASTER` secret
- **Robust revocation** — cert-key signing per RFC 8555 §7.6; works even after account rotation
- **Job state machine** — 1-minute cron ticks, idempotent steps, automatic fallback to the lifeline CA on upstream failure
- **Danger Zone** — three manual purge scopes: certs only / accounts only / everything. A schema-incompatible upgrade auto-fires an "everything" purge on first boot (avoids a UI-blocking 500 from stale columns)

## Setup

1. Create a Cloudflare Worker and paste the contents of `mixssl.js`
2. Bind a **D1 database** with the binding name `DATA`
3. Set the following **environment variables** (Settings > Variables):

   | Variable | Type   | Description                                                                 |
   |----------|--------|-----------------------------------------------------------------------------|
   | `LOCK`   | Secret | Dashboard password (3–64 ASCII printable chars, no spaces). Omit for open mode. |
   | `MASTER` | Secret | 32-byte AES-GCM key, base64-encoded. Generate in a browser console with `btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))` |
   | `ZEK`    | Secret | **Required.** ZeroSSL EAB KID — lifeline CA bootstrap. Without it the worker halts. |
   | `ZEH`    | Secret | **Required.** ZeroSSL EAB HMAC (base64url), paired with `ZEK`. Without it the worker halts. |

4. Add a **Cron Trigger** of `* * * * *` (every minute) — runs the job state machine and renewal scanner
5. Deploy

---

# MixSSL（简体中文）

单文件 SSL 证书签发器，基于 ACME DNS-01，作为 Cloudflare Worker 运行。最核心的差异化：同一张证书可跨同一 DNS 管理机构下的多个账号（例如两个 Cloudflare 账号：个人 + 工作），也可以跨多个管理机构、并从 ZeroSSL / Google Trust Services 中任选一个签发 CA。这样无论是分散在同一家管理机构不同账号下的 zone，还是一半在 Cloudflare（国际）、一半在 DNSPod.cn（中国大陆）的 zone，都可以合到同一张终端证书里。系统指定一个**生命线 CA**：首次运行时自动注册，不可删除，其他 CA 失败时默认兜底。

生命线 CA 为 **ZeroSSL**（不使用 Let's Encrypt：Cloudflare Workers 到 `acme-v02.api.letsencrypt.org` 的 TLS 握手会持续返回 HTTP 525，是该网络路径上长期存在的已知问题）。`ZEK` + `ZEH` Secret 为**必需**（非可选），以便 Worker 在首次运行时自动注册 ZeroSSL 账号。未正确配置时 Worker 会拒绝运行直到补齐配置。

## 功能

- **一证多账号、多管理机构混合** — 产品的核心差异化：一张证书可以同时覆盖同一个 DNS 管理机构下多个账号的 zone（例如两个 Cloudflare 账号），也可以同时覆盖多个管理机构。每个 zone 的 DNS-01 challenge 会自动用对应的账号去签。当前支持的 DNS 管理机构：**Cloudflare（国际）** 与 **DNSPod.cn（中国大陆）**。
- **多 CA，按配置选择** — ZeroSSL（通过 EAB 自动引导的生命线 CA）、Google Trust Services（GCP Service Account 自动铸造 EAB）。每个证书配置单独选定主 CA 与可选的回退链。本版本**不提供** Let's Encrypt，因为存在 CF ↔ LE 的 HTTP 525 问题。
- **12 种语言 + 亮色/暗色模式** — 根据浏览器自动匹配语言，完整 RTL 支持；主题切换保存在 localStorage
- **自动续签** — 每个配置可独立策略：到期前 N 天、每月 1 日、到期周的指定星期、到期前一月末日，或手动
- **五种密钥类型** — EC P-256、EC P-384、RSA 2048、RSA 3072、RSA 4096
- **静态加密** — 账号 JWK 和 DNS 管理机构凭证用 `MASTER` 密钥做 AES-GCM-256 加密
- **稳健吊销** — 按 RFC 8555 §7.6 用证书私钥签名，账号轮换后仍可吊销历史证书
- **任务状态机** — 每分钟 cron 推进，幂等步骤，上游 CA 失败时自动回退到生命线 CA
- **危险区域** — 三种手动清除范围：仅证书 / 仅账号 / 全部。schema 不兼容的升级会在首次启动时自动执行一次"全部"清除（避免旧列查询导致阻塞 UI 的 500）

## 配置步骤

1. 创建一个 Cloudflare Worker，将 `mixssl.js` 的内容粘贴进去
2. 绑定一个 **D1 数据库**，绑定名为 `DATA`
3. 设置以下**环境变量**（Settings > Variables）：

   | 变量名   | 类型   | 说明                                                                             |
   |----------|--------|---------------------------------------------------------------------------------|
   | `LOCK`   | Secret | 控制台访问密码（3–64 位 ASCII 可打印字符，不含空格）。不设则开放访问。           |
   | `MASTER` | Secret | 32 字节 AES-GCM 密钥，base64 编码。可在浏览器控制台执行 `btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))` 生成 |
   | `ZEK`    | Secret | **必需。** ZeroSSL EAB KID —— 生命线 CA 引导用。未配置时 Worker 将拒绝运行。    |
   | `ZEH`    | Secret | **必需。** ZeroSSL EAB HMAC（base64url），与 `ZEK` 配对使用。未配置时 Worker 将拒绝运行。 |

4. 添加 **Cron Trigger** `* * * * *`（每分钟一次）—— 驱动任务状态机和续签扫描
5. 部署

---

# MixSSL（繁體中文）

單檔案 SSL 憑證簽發器，基於 ACME DNS-01，作為 Cloudflare Worker 執行。最核心的差異化：同一張憑證可跨同一 DNS 管理機構下的多個帳號（例如兩個 Cloudflare 帳號：個人 + 工作），也可以跨多個管理機構、並從 ZeroSSL / Google Trust Services 中任選一個簽發 CA。這樣無論是分散在同一家管理機構不同帳號下的 zone，還是一半在 Cloudflare（國際）、一半在 DNSPod.cn（中國大陸）的 zone，都可以合到同一張終端憑證裡。系統指定一個**生命線 CA**：首次執行時自動註冊，不可刪除，其他 CA 失敗時預設兜底。

生命線 CA 為 **ZeroSSL**（不使用 Let's Encrypt：Cloudflare Workers 到 `acme-v02.api.letsencrypt.org` 的 TLS 交握會持續回傳 HTTP 525，是該網路路徑上長期存在的已知問題）。`ZEK` + `ZEH` Secret 為**必需**（非選用），以便 Worker 在首次執行時自動註冊 ZeroSSL 帳號。未正確設定時 Worker 會拒絕運作直到補齊設定。

## 功能

- **一證多帳號、多管理機構混合** — 產品的核心差異化：一張憑證可同時涵蓋同一家 DNS 管理機構下多個帳號的 zone（例如兩個 Cloudflare 帳號），也可同時涵蓋多家管理機構。每個 zone 的 DNS-01 challenge 會自動用對應帳號簽署。目前支援的 DNS 管理機構：**Cloudflare（國際）** 與 **DNSPod.cn（中國大陸）**。
- **多 CA，依設定選擇** — ZeroSSL（透過 EAB 自動引導的生命線 CA）、Google Trust Services（GCP Service Account 自動鑄造 EAB）。每個憑證設定單獨選定主 CA 與可選的回退鏈。本版本**不提供** Let's Encrypt，因為存在 CF ↔ LE 的 HTTP 525 問題。
- **12 種語言 + 亮色/暗色模式** — 根據瀏覽器自動匹配語言，完整 RTL 支援；主題切換儲存在 localStorage
- **自動續簽** — 每個設定可獨立策略：到期前 N 天、每月 1 日、到期週的指定星期、到期前一月末日，或手動
- **五種金鑰類型** — EC P-256、EC P-384、RSA 2048、RSA 3072、RSA 4096
- **靜態加密** — 帳號 JWK 和 DNS 管理機構憑據用 `MASTER` 金鑰做 AES-GCM-256 加密
- **穩健吊銷** — 依 RFC 8555 §7.6 以憑證私鑰簽名，帳號輪換後仍可吊銷歷史憑證
- **任務狀態機** — 每分鐘 cron 推進，冪等步驟，上游 CA 失敗時自動回退至生命線 CA
- **危險區域** — 三種手動清除範圍：僅憑證 / 僅帳號 / 全部。schema 不相容的升級會在首次啟動時自動執行一次「全部」清除（避免舊欄位查詢導致阻塞 UI 的 500）

## 設定步驟

1. 建立一個 Cloudflare Worker，將 `mixssl.js` 的內容貼入
2. 綁定一個 **D1 資料庫**，綁定名稱為 `DATA`
3. 設定以下**環境變數**（Settings > Variables）：

   | 變數名   | 類型   | 說明                                                                             |
   |----------|--------|---------------------------------------------------------------------------------|
   | `LOCK`   | Secret | 控制台存取密碼（3–64 位 ASCII 可列印字元，不含空格）。未設定則開放存取。         |
   | `MASTER` | Secret | 32 位元組 AES-GCM 金鑰，base64 編碼。可在瀏覽器主控台執行 `btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))` 產生 |
   | `ZEK`    | Secret | **必需。** ZeroSSL EAB KID —— 生命線 CA 引導用。未設定時 Worker 將拒絕運作。    |
   | `ZEH`    | Secret | **必需。** ZeroSSL EAB HMAC（base64url），與 `ZEK` 配對使用。未設定時 Worker 將拒絕運作。 |

4. 新增 **Cron Trigger** `* * * * *`（每分鐘一次）—— 驅動任務狀態機和續簽掃描
5. 部署
