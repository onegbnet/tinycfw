# Mailgun Fire

A single-file Cloudflare Worker for sending emails via the Mailgun HTTP API, with a rich compose UI.

## Features

- **Rich text editor** — WYSIWYG / Markdown toggle, powered by markdown-it
- **Attachments** — multiple files, 16 MiB total cap (stored in KV alongside the sent record, expires together via `TTL`)
- **To / CC / BCC** — tag-style email input with validation
- **11 languages** — auto-detected from browser, with full RTL support
- **Sent history** — stored in Cloudflare KV (optional), with drawer UI, detail view, and batch delete
- **Password lock** — optional `LOCK` secret, unlock modal with "remember 30 days"
- **Dark / light mode** — toggle with localStorage persistence

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
   | `LOCK`    | Secret | Access password (3–16 ASCII printable chars, no spaces); ignored if invalid; omit for open access |

3. (Optional) Bind a **KV namespace** named `SENT` to enable sent email history
4. Click the **Deploy** button in the Worker dashboard to complete deployment

---

# 开火邮件（Mailgun Fire）

单文件 Cloudflare Worker，通过 Mailgun HTTP API 发送邮件，附带富文本编辑界面。

## 功能（简体中文）

- **富文本编辑器** — 所见即所得 / Markdown 切换，基于 markdown-it
- **附件** — 支持多文件，总大小 ≤ 16 MiB（与已发送记录一起存入 KV，随 `TTL` 一同过期）
- **收件人 / 抄送 / 密送** — 标签式邮箱输入，自动校验
- **11 种语言** — 根据浏览器自动匹配，完整 RTL 支持
- **已发送记录** — 存储于 Cloudflare KV（可选），支持抽屉式查看、详情浏览和批量删除
- **密码锁** — 可选 `LOCK` Secret，访问前需输入密码，可勾选"30 天内免密"
- **亮色 / 暗色模式** — 可切换，选择保存在 localStorage

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
   | `LOCK`    | Secret | 访问密码（3–16 位 ASCII 可打印字符，不含空格），不合法则忽略，不设则开放访问     |

3. （可选）绑定一个名为 `SENT` 的 **KV 命名空间**以启用已发送记录
4. 点击 Worker 界面的**部署**按钮完成部署

---

# 開火郵件（Mailgun Fire）

單檔案 Cloudflare Worker，透過 Mailgun HTTP API 發送郵件，附帶富文字編輯介面。

## 功能（繁體中文）

- **富文字編輯器** — 所見即所得 / Markdown 切換，基於 markdown-it
- **附件** — 支援多檔案，總大小 ≤ 16 MiB（與已傳送紀錄一同儲存於 KV，依 `TTL` 一起過期）
- **收件人 / 副本 / 密件副本** — 標籤式信箱輸入，自動驗證
- **11 種語言** — 根據瀏覽器自動匹配，完整 RTL 支援
- **已傳送紀錄** — 儲存於 Cloudflare KV（選用），支援抽屜式檢視、詳情瀏覽和批次刪除
- **密碼鎖** — 選用 `LOCK` Secret，存取前需輸入密碼，可勾選「30 天內免密」
- **亮色 / 暗色模式** — 可切換，選擇保存在 localStorage

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
   | `LOCK`    | Secret | 存取密碼（3–16 位 ASCII 可列印字元，不含空格），不合法則忽略，不設則開放存取     |

3. （選用）綁定一個名為 `SENT` 的 **KV 命名空間**以啟用已傳送紀錄
4. 點擊 Worker 介面的**部署**按鈕完成部署
