# API Documentation

---

## Shurl

All API endpoints accept and return JSON. Authentication via `X-API-Key` header or `Authorization: Bearer <key>`. If `KEY` is not configured, authentication is skipped.

### Authentication

```
X-API-Key: your-api-key
```
or
```
Authorization: Bearer your-api-key
```

### Error Responses

All errors return `{ "error": "<ERROR_CODE>" }` with an appropriate HTTP status code.

| Error Code              | Status | Description                                      |
|-------------------------|--------|--------------------------------------------------|
| `UNAUTHORIZED`          | 401    | Missing or invalid API key                       |
| `INVALID_JSON`          | 400    | Request body is not valid JSON                   |
| `INVALID_URL`           | 400    | Target URL is not a valid HTTP/HTTPS URL         |
| `INVALID_SLUG`          | 400    | Slug format invalid (must be 3–10 alphanumeric)  |
| `INVALID_REDIRECT_MODE` | 400    | `redirectMode` is not `instant` or `manual`      |
| `SLUG_EXISTS`           | 400    | Slug already exists (password required to modify) |
| `VERIFY_FAILED`         | 403    | Slug not found or wrong password                 |
| `SLUG_COLLISION`        | 503    | Failed to generate unique random slug            |
| `NOT_FOUND`             | 404    | Slug does not exist                              |

---

### POST /api/shorten

Create or update a short link.

**Request Body:**

| Field            | Type    | Required | Description                                                        |
|------------------|---------|----------|--------------------------------------------------------------------|
| `url`            | string  | Yes      | Target URL (must be valid HTTP/HTTPS)                              |
| `slug`           | string  | No       | Custom slug (3–10 alphanumeric); omit for random                   |
| `mode`           | string  | No       | `create` or `modify`; default `create`                             |
| `password`       | string  | No       | Required when modifying an existing slug                           |
| `resetPassword`        | boolean | No       | Regenerate slug password on update; default `true`                 |
| `redirectMode`   | string  | No       | `instant` or `manual`; default `instant`                           |
| `permanent`      | boolean | No       | Use 301 (true) or 302 (false) for instant redirect; default `true` |
| `countdown`          | integer | No       | Countdown seconds (0–60); 0 = manual button; default `0`          |
| `redirectPageTitle`     | string  | No       | Custom redirect page title                                         |
| `redirectPageContent`        | string  | No       | Custom redirect page content (Markdown)                            |
| `manualBtnTitle` | string  | No       | Custom redirect button text                                        |
| `lightPage`      | boolean | No       | Light background for redirect page; default `true`                 |
| `ttl`            | integer | No       | Link expiration in seconds (60–31536000); 0 = permanent            |

**Response (201 Created):**

```json
{
  "short_url": "https://example.com/aBc123",
  "slug": "aBc123",
  "target": "https://destination.com/page",
  "updated": false,
  "password": "HjKm5xNpQrSt2vWy"
}
```

`password` is only returned on creation or when `resetPassword` is true on update. **Save it immediately — it will not be shown again.**

**Response (200 Updated):**

```json
{
  "short_url": "https://example.com/aBc123",
  "slug": "aBc123",
  "target": "https://destination.com/new-page",
  "updated": true,
  "password": "NewPassword1234Ab"
}
```

---

### POST /api/verify/:slug

Verify slug ownership with password and return full details. Used by the management UI before allowing modifications.

**Request Body:**

| Field      | Type   | Required | Description              |
|------------|--------|----------|--------------------------|
| `password` | string | Yes      | Slug modification password |

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
  "clicks": 42,
  "createdAt": "2026-03-28T12:00:00.000Z",
  "updatedAt": "2026-03-29T08:30:00.000Z"
}
```

Fields that are at default values or empty may be omitted.

---

### GET /api/urls/:slug

Get details of a single short link (without password hash).

**Response (200):**

```json
{
  "slug": "aBc123",
  "url": "https://destination.com/page",
  "redirectMode": "instant",
  "clicks": 42,
  "createdAt": "2026-03-28T12:00:00.000Z"
}
```

---

### DELETE /api/urls/:slug

Delete a short link.

**Response (200):**

```json
{
  "deleted": "aBc123"
}
```

---

## Shurl（简体中文）

所有 API 端点接收和返回 JSON。通过 `X-API-Key` 请求头或 `Authorization: Bearer <key>` 进行认证。如果未配置 `KEY`，则跳过认证。

### 认证方式

```
X-API-Key: your-api-key
```
或
```
Authorization: Bearer your-api-key
```

### 错误响应

所有错误返回 `{ "error": "<错误码>" }`，附带相应的 HTTP 状态码。

| 错误码                    | 状态码 | 说明                                      |
|---------------------------|--------|-------------------------------------------|
| `UNAUTHORIZED`            | 401    | API 密钥缺失或无效                        |
| `INVALID_JSON`            | 400    | 请求体不是有效的 JSON                     |
| `INVALID_URL`             | 400    | 目标 URL 不是有效的 HTTP/HTTPS 地址       |
| `INVALID_SLUG`            | 400    | 短码格式无效（须为 3–10 位字母数字）      |
| `INVALID_REDIRECT_MODE`   | 400    | `redirectMode` 不是 `instant` 或 `manual` |
| `SLUG_EXISTS`             | 400    | 短码已存在（需要密码才能修改）            |
| `VERIFY_FAILED`           | 403    | 短码不存在，或密码错误                    |
| `SLUG_COLLISION`          | 503    | 随机短码生成失败                          |
| `NOT_FOUND`               | 404    | 短码不存在                                |

---

### POST /api/shorten

创建或更新短链接。

**请求体：**

| 字段             | 类型    | 必填 | 说明                                                          |
|------------------|---------|------|---------------------------------------------------------------|
| `url`            | string  | 是   | 目标 URL（须为有效的 HTTP/HTTPS 地址）                        |
| `slug`           | string  | 否   | 自定义短码（3–10 位字母数字）；留空则随机生成                 |
| `mode`           | string  | 否   | `create` 或 `modify`；默认 `create`                           |
| `password`       | string  | 否   | 修改已有短码时必填                                            |
| `resetPassword`        | boolean | 否   | 更新时重新生成密码；默认 `true`                               |
| `redirectMode`   | string  | 否   | `instant` 或 `manual`；默认 `instant`                         |
| `permanent`      | boolean | 否   | 立即跳转时使用 301（true）或 302（false）；默认 `true`        |
| `countdown`          | integer | 否   | 倒计数秒数（0–60）；0 = 手动跳转按钮；默认 `0`               |
| `redirectPageTitle`     | string  | 否   | 自定义跳转页面标题                                            |
| `redirectPageContent`        | string  | 否   | 自定义跳转页面内容（Markdown 格式）                           |
| `manualBtnTitle` | string  | 否   | 自定义跳转按钮文案                                            |
| `lightPage`      | boolean | 否   | 跳转页面使用亮色背景；默认 `true`                             |
| `ttl`            | integer | 否   | 链接过期时间（60–31536000 秒）；0 = 永久                     |

**响应（201 已创建）：**

```json
{
  "short_url": "https://example.com/aBc123",
  "slug": "aBc123",
  "target": "https://destination.com/page",
  "updated": false,
  "password": "HjKm5xNpQrSt2vWy"
}
```

`password` 仅在创建时或更新且 `resetPassword` 为 true 时返回。**请立即保存，此密码仅显示一次。**

---

### POST /api/verify/:slug

通过密码验证短码所有权并返回完整详情。管理界面在允许修改前调用此接口。

**请求体：**

| 字段       | 类型   | 必填 | 说明         |
|------------|--------|------|--------------|
| `password` | string | 是   | 短码修改密码 |

**响应（200）：**

```json
{
  "slug": "aBc123",
  "url": "https://destination.com/page",
  "redirectMode": "manual",
  "countdown": 5,
  "clicks": 42,
  "createdAt": "2026-03-28T12:00:00.000Z"
}
```

处于默认值或为空的字段可能被省略。

---

### GET /api/urls/:slug

获取单条短链接详情（不含密码哈希）。

---

### DELETE /api/urls/:slug

删除一条短链接。

---

## Shurl（繁體中文）

所有 API 端點接收和回傳 JSON。透過 `X-API-Key` 請求標頭或 `Authorization: Bearer <key>` 進行認證。如果未設定 `KEY`，則跳過認證。

### 認證方式

```
X-API-Key: your-api-key
```
或
```
Authorization: Bearer your-api-key
```

### 錯誤回應

所有錯誤回傳 `{ "error": "<錯誤碼>" }`，附帶相應的 HTTP 狀態碼。

| 錯誤碼                    | 狀態碼 | 說明                                      |
|---------------------------|--------|-------------------------------------------|
| `UNAUTHORIZED`            | 401    | API 金鑰缺失或無效                        |
| `INVALID_JSON`            | 400    | 請求體不是有效的 JSON                     |
| `INVALID_URL`             | 400    | 目標 URL 不是有效的 HTTP/HTTPS 地址       |
| `INVALID_SLUG`            | 400    | 短碼格式無效（須為 3–10 位字母數字）      |
| `INVALID_REDIRECT_MODE`   | 400    | `redirectMode` 不是 `instant` 或 `manual` |
| `SLUG_EXISTS`             | 400    | 短碼已存在（需要密碼才能修改）            |
| `VERIFY_FAILED`           | 403    | 短碼不存在，或密碼錯誤                    |
| `SLUG_COLLISION`          | 503    | 隨機短碼產生失敗                          |
| `NOT_FOUND`               | 404    | 短碼不存在                                |

---

### POST /api/shorten

建立或更新短連結。

**請求體：**

| 欄位             | 類型    | 必填 | 說明                                                          |
|------------------|---------|------|---------------------------------------------------------------|
| `url`            | string  | 是   | 目標 URL（須為有效的 HTTP/HTTPS 地址）                        |
| `slug`           | string  | 否   | 自訂短碼（3–10 位字母數字）；留空則隨機產生                   |
| `mode`           | string  | 否   | `create` 或 `modify`；預設 `create`                           |
| `password`       | string  | 否   | 修改已有短碼時必填                                            |
| `resetPassword`        | boolean | 否   | 更新時重新產生密碼；預設 `true`                               |
| `redirectMode`   | string  | 否   | `instant` 或 `manual`；預設 `instant`                         |
| `permanent`      | boolean | 否   | 立即跳轉時使用 301（true）或 302（false）；預設 `true`        |
| `countdown`          | integer | 否   | 倒數秒數（0–60）；0 = 手動跳轉按鈕；預設 `0`                 |
| `redirectPageTitle`     | string  | 否   | 自訂跳轉頁面標題                                              |
| `redirectPageContent`        | string  | 否   | 自訂跳轉頁面內容（Markdown 格式）                             |
| `manualBtnTitle` | string  | 否   | 自訂跳轉按鈕文案                                              |
| `lightPage`      | boolean | 否   | 跳轉頁面使用亮色背景；預設 `true`                             |
| `ttl`            | integer | 否   | 連結過期時間（60–31536000 秒）；0 = 永久                     |

**回應（201 已建立）：**

```json
{
  "short_url": "https://example.com/aBc123",
  "slug": "aBc123",
  "target": "https://destination.com/page",
  "updated": false,
  "password": "HjKm5xNpQrSt2vWy"
}
```

`password` 僅在建立時或更新且 `resetPassword` 為 true 時回傳。**請立即儲存，此密碼僅顯示一次。**

---

### POST /api/verify/:slug

透過密碼驗證短碼所有權並回傳完整詳情。管理介面在允許修改前呼叫此介面。

**請求體：**

| 欄位       | 類型   | 必填 | 說明         |
|------------|--------|------|--------------|
| `password` | string | 是   | 短碼修改密碼 |

**回應（200）：**

```json
{
  "slug": "aBc123",
  "url": "https://destination.com/page",
  "redirectMode": "manual",
  "countdown": 5,
  "clicks": 42,
  "createdAt": "2026-03-28T12:00:00.000Z"
}
```

處於預設值或為空的欄位可能被省略。

---

### GET /api/urls/:slug

取得單條短連結詳情（不含密碼雜湊）。

---

### DELETE /api/urls/:slug

刪除一條短連結。
