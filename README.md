# tinycfw

Tiny Cloudflare Workers. Self-contained and well-documented. Simply copy and paste the corresponding single Javascript file content to **Cloudflare Workers and Pages** code editor and click **deploy** button, that's all.

| Product                          | Source          | Description                                                                                        |
|----------------------------------|-----------------|----------------------------------------------------------------------------------------------------|
| [Mailgun Fire](mailgunfire.md)   | `mailgunfire.js`| Sends email via the Mailgun HTTP API; Markdown compose UI with preview; large file attachments (up to Mailgun's ~50 MB whole-message limit); optional AI-assisted compose; runs on Cloudflare Workers or self-hosted via Docker |
| [Shurl](shurl.md)                | `shurl.js`      | URL shortener (also short links for uploaded files): anonymous creation, per-link password, customizable redirect pages (Markdown content), full API |
| [MixSSL](mixssl.md)              | `mixssl.js`     | Issues SSL certs combining domains from multiple accounts at same or different DNS registrars; supports CAs like ZeroSSL and Google Trust Services with RSA / elliptic-curve key algorithms |

---

# tinycfw（简体中文）

微型 Cloudflare Workers。自包含、文档完备。把对应的单个 JavaScript 文件内容复制粘贴到 **Cloudflare Workers and Pages** 的代码编辑器，点击 **部署** 按钮即可。

| 产品                             | 源码            | 说明                                                                                              |
|----------------------------------|-----------------|---------------------------------------------------------------------------------------------------|
| [开火邮件](mailgunfire.md)        | `mailgunfire.js`| 通过 Mailgun HTTP API 发送邮件；Markdown 编辑界面（含预览）；大附件（可达 Mailgun ~50 MB 整封上限）；可选 AI 辅助撰写；可部署于 Cloudflare Workers 或通过 Docker 自托管 |
| [速至短链](shurl.md)              | `shurl.js`      | 短链接服务（支持 URL 或文件上传）：匿名创建、短链密码、自定义跳转页（Markdown 内容），提供完整 API |
| [混搭证书](mixssl.md)            | `mixssl.js`     | 混合来自相同或不同 DNS 管理机构下多帐号域名的 SSL 证书签发，支持 ZeroSSL 和 Google Trust Services 等 CA 及多种 RSA / 椭圆曲线密钥算法 |

---

# tinycfw（繁體中文）

微型 Cloudflare Workers。自包含、文件完備。把對應的單個 JavaScript 檔案內容複製貼到 **Cloudflare Workers and Pages** 的程式碼編輯器，點擊 **部署** 按鈕即可。

| 產品                             | 源碼            | 說明                                                                                              |
|----------------------------------|-----------------|---------------------------------------------------------------------------------------------------|
| [開火郵件](mailgunfire.md)        | `mailgunfire.js`| 透過 Mailgun HTTP API 發送郵件；Markdown 編輯介面（含預覽）；大附件（可達 Mailgun ~50 MB 整封上限）；可選 AI 輔助撰寫；可部署於 Cloudflare Workers 或透過 Docker 自我託管 |
| [速至短鏈](shurl.md)              | `shurl.js`      | 短連結服務（支援 URL 或檔案上傳）：匿名建立、短鏈密碼、自訂跳轉頁（Markdown 內容），提供完整 API   |
| [混搭憑證](mixssl.md)            | `mixssl.js`     | 混合來自相同或不同 DNS 管理機構下多帳號域名的 SSL 憑證簽發，支援 ZeroSSL 和 Google Trust Services 等 CA 及多種 RSA / 橢圓曲線金鑰演算法              |
