# API Documentation

---

## Shurl

Pure RESTful API — no `/api/` prefix. All endpoints accept and return JSON.

### Authentication

**API Key** (required only when `KEY` environment variable is configured):

```
X-API-Key: your-api-key
```
or
```
Authorization: Bearer your-api-key
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
| `UNAUTHORIZED`          | 401    | Missing or invalid API key                         |
| `INVALID_JSON`          | 400    | Request body is not valid JSON                     |
| `INVALID_URL`           | 400    | Target URL is not a valid HTTP/HTTPS URL           |
| `INVALID_REDIRECT_MODE` | 400    | `redirectMode` is not `instant` or `manual`        |
| `SLUG_EXISTS`           | 400    | Slug already taken and no password provided        |
| `SLUG_COLLISION`        | 503    | Random slug generation failed after retries        |
| `VERIFY_FAILED`         | 403    | Wrong password, slug not found, or no password     |

Note: write endpoints never return 404 — all failures use 403 `VERIFY_FAILED` to prevent slug enumeration.

---

### HEAD /:slug — Verify slug + password

Check whether a slug exists and the password is correct, without returning any data.

**Headers:**

| Header       | Required | Description                          |
|--------------|----------|--------------------------------------|
| `X-Password` | Yes      | Slug password                        |
| `X-API-Key`  | If KEY set | API key                            |

**Response:** No body.

| Status | Meaning                                      |
|--------|----------------------------------------------|
| 200    | Slug exists and password is correct          |
| 401    | API key missing or invalid                   |
| 403    | Wrong password / slug not found / no password |

---

### POST / — Create short URL (single)

Create a new short link. Optionally specify a custom slug via `POST /:slug` or in the request body.

**Headers:**

| Header       | Required   | Description                          |
|--------------|------------|--------------------------------------|
| `X-Password` | No         | If slug exists, verifies ownership and returns entry data |
| `X-API-Key`  | If KEY set | API key                              |

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

---

### POST /:slug — Verify + query existing slug

Retrieve full details of an existing slug by verifying with password.

**Headers:**

| Header       | Required   | Description   |
|--------------|------------|---------------|
| `X-Password` | Yes        | Slug password |
| `X-API-Key`  | If KEY set | API key       |

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

---

### PUT /:slug — Update short URL

Update an existing short link.

**Headers:**

| Header       | Required   | Description   |
|--------------|------------|---------------|
| `X-Password` | Yes        | Slug password |
| `X-API-Key`  | If KEY set | API key       |

**Request Body:** Same fields as create, plus:

| Field           | Type    | Required | Description                                          |
|-----------------|---------|----------|------------------------------------------------------|
| `resetPassword` | boolean | No       | Regenerate slug password; default `false`            |

**Response (200):**

Returns updated entry data. If `resetPassword` is `true`, a new `password` field is included — save it immediately.

---

### DELETE /:slug — Delete short URL

**Headers:**

| Header       | Required   | Description   |
|--------------|------------|---------------|
| `X-Password` | Yes        | Slug password |
| `X-API-Key`  | If KEY set | API key       |

**Response (200):**

```json
{
  "deleted": "aBc123"
}
```

---

### GET / — Landing page

Returns the homepage / management UI.

### GET /:slug — Redirect

Redirects to the target URL using 301 or 302, or shows a countdown/manual redirect page depending on configuration.

If the slug does not exist, redirects (302) to `DEFAULT` URL or the homepage — never returns 404.

---
---

## Shurl（简体中文）

纯 RESTful API，无 `/api/` 前缀。所有端点接收和返回 JSON。

### 认证方式

**API 密钥**（仅在配置了 `KEY` 环境变量时需要）：

```
X-API-Key: your-api-key
```
或
```
Authorization: Bearer your-api-key
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
| `UNAUTHORIZED`            | 401    | API 密钥缺失或无效                        |
| `INVALID_JSON`            | 400    | 请求体不是有效的 JSON                     |
| `INVALID_URL`             | 400    | 目标 URL 不是有效的 HTTP/HTTPS 地址       |
| `INVALID_REDIRECT_MODE`   | 400    | `redirectMode` 不是 `instant` 或 `manual` |
| `SLUG_EXISTS`             | 400    | 短码已存在且未提供密码                    |
| `SLUG_COLLISION`          | 503    | 随机短码生成失败                          |
| `VERIFY_FAILED`           | 403    | 密码错误、短码不存在或未提供密码          |

注：写入端点不会返回 404 —— 所有失败均使用 403 `VERIFY_FAILED`，以防止短码枚举。

---

### HEAD /:slug — 验证短码 + 密码

检查短码是否存在以及密码是否正确，不返回任何数据。

**请求头：**

| 请求头       | 必填       | 说明       |
|--------------|------------|------------|
| `X-Password` | 是         | 短码密码   |
| `X-API-Key`  | 配置时必填 | API 密钥   |

**响应：** 无响应体。

| 状态码 | 含义                             |
|--------|----------------------------------|
| 200    | 短码存在且密码正确               |
| 401    | API 密钥缺失或无效               |
| 403    | 密码错误 / 短码不存在 / 未提供密码 |

---

### POST / — 创建短链接（单条）

创建一条新短链接。可通过 `POST /:slug` 或请求体中的 `slug` 字段指定自定义短码。

**请求头：**

| 请求头       | 必填       | 说明                                     |
|--------------|------------|------------------------------------------|
| `X-Password` | 否         | 若短码已存在，验证所有权并返回条目数据   |
| `X-API-Key`  | 配置时必填 | API 密钥                                 |

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

---

### POST /:slug — 验证并查询已有短码

通过密码验证后获取短码完整详情。

**请求头：**

| 请求头       | 必填       | 说明     |
|--------------|------------|----------|
| `X-Password` | 是         | 短码密码 |
| `X-API-Key`  | 配置时必填 | API 密钥 |

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

---

### PUT /:slug — 更新短链接

更新已有短链接。

**请求头：**

| 请求头       | 必填       | 说明     |
|--------------|------------|----------|
| `X-Password` | 是         | 短码密码 |
| `X-API-Key`  | 配置时必填 | API 密钥 |

**请求体：** 与创建相同的字段，另加：

| 字段            | 类型    | 必填 | 说明                            |
|-----------------|---------|------|---------------------------------|
| `resetPassword` | boolean | 否   | 重新生成短码密码；默认 `false`  |

**响应（200）：**

返回更新后的条目数据。若 `resetPassword` 为 `true`，响应中包含新的 `password` 字段，请立即保存。

---

### DELETE /:slug — 删除短链接

**请求头：**

| 请求头       | 必填       | 说明     |
|--------------|------------|----------|
| `X-Password` | 是         | 短码密码 |
| `X-API-Key`  | 配置时必填 | API 密钥 |

**响应（200）：**

```json
{
  "deleted": "aBc123"
}
```

---

### GET / — 首页

返回首页 / 管理界面。

### GET /:slug — 跳转

根据配置使用 301 或 302 跳转至目标 URL，或显示倒计时/手动跳转页面。

若短码不存在，302 跳转至 `DEFAULT` URL 或首页 —— 不会返回 404。

---
---

## Shurl（繁體中文）

純 RESTful API，無 `/api/` 前綴。所有端點接收和回傳 JSON。

### 認證方式

**API 金鑰**（僅在設定了 `KEY` 環境變數時需要）：

```
X-API-Key: your-api-key
```
或
```
Authorization: Bearer your-api-key
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
| `UNAUTHORIZED`            | 401    | API 金鑰缺失或無效                        |
| `INVALID_JSON`            | 400    | 請求體不是有效的 JSON                     |
| `INVALID_URL`             | 400    | 目標 URL 不是有效的 HTTP/HTTPS 地址       |
| `INVALID_REDIRECT_MODE`   | 400    | `redirectMode` 不是 `instant` 或 `manual` |
| `SLUG_EXISTS`             | 400    | 短碼已存在且未提供密碼                    |
| `SLUG_COLLISION`          | 503    | 隨機短碼產生失敗                          |
| `VERIFY_FAILED`           | 403    | 密碼錯誤、短碼不存在或未提供密碼          |

注：寫入端點不會回傳 404 —— 所有失敗均使用 403 `VERIFY_FAILED`，以防止短碼列舉。

---

### HEAD /:slug — 驗證短碼 + 密碼

檢查短碼是否存在以及密碼是否正確，不回傳任何資料。

**請求標頭：**

| 請求標頭     | 必填       | 說明       |
|--------------|------------|------------|
| `X-Password` | 是         | 短碼密碼   |
| `X-API-Key`  | 設定時必填 | API 金鑰   |

**回應：** 無回應體。

| 狀態碼 | 含義                              |
|--------|-----------------------------------|
| 200    | 短碼存在且密碼正確                |
| 401    | API 金鑰缺失或無效                |
| 403    | 密碼錯誤 / 短碼不存在 / 未提供密碼 |

---

### POST / — 建立短連結（單條）

建立一條新短連結。可透過 `POST /:slug` 或請求體中的 `slug` 欄位指定自訂短碼。

**請求標頭：**

| 請求標頭     | 必填       | 說明                                     |
|--------------|------------|------------------------------------------|
| `X-Password` | 否         | 若短碼已存在，驗證所有權並回傳條目資料   |
| `X-API-Key`  | 設定時必填 | API 金鑰                                 |

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

---

### POST /:slug — 驗證並查詢已有短碼

透過密碼驗證後取得短碼完整詳情。

**請求標頭：**

| 請求標頭     | 必填       | 說明     |
|--------------|------------|----------|
| `X-Password` | 是         | 短碼密碼 |
| `X-API-Key`  | 設定時必填 | API 金鑰 |

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

---

### PUT /:slug — 更新短連結

更新已有短連結。

**請求標頭：**

| 請求標頭     | 必填       | 說明     |
|--------------|------------|----------|
| `X-Password` | 是         | 短碼密碼 |
| `X-API-Key`  | 設定時必填 | API 金鑰 |

**請求體：** 與建立相同的欄位，另加：

| 欄位            | 類型    | 必填 | 說明                            |
|-----------------|---------|------|---------------------------------|
| `resetPassword` | boolean | 否   | 重新產生短碼密碼；預設 `false`  |

**回應（200）：**

回傳更新後的條目資料。若 `resetPassword` 為 `true`，回應中包含新的 `password` 欄位，請立即儲存。

---

### DELETE /:slug — 刪除短連結

**請求標頭：**

| 請求標頭     | 必填       | 說明     |
|--------------|------------|----------|
| `X-Password` | 是         | 短碼密碼 |
| `X-API-Key`  | 設定時必填 | API 金鑰 |

**回應（200）：**

```json
{
  "deleted": "aBc123"
}
```

---

### GET / — 首頁

回傳首頁 / 管理介面。

### GET /:slug — 跳轉

依據設定使用 301 或 302 跳轉至目標 URL，或顯示倒數計時/手動跳轉頁面。

若短碼不存在，302 跳轉至 `DEFAULT` URL 或首頁 —— 不會回傳 404。
