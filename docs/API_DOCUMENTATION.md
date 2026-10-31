# CAT Product Manager - REST API Documentation

**Base URL**: `http://localhost:5000/api/v1` (hoặc domain triển khai)  
**Authentication**: Header `Authorization: Bearer <JWT_TOKEN>`

---

## 1. Authentication (`/auth`)

### 1.1 Đăng ký tài khoản
- **Endpoint**: `POST /auth/register`
- **Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "Password123!",
    "name": "Nguyễn Văn A"
  }
  ```
- **Response** (201 Created):
  ```json
  {
    "success": true,
    "message": "Đăng ký tài khoản thành công",
    "token": "eyJhbGciOi...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "Nguyễn Văn A",
      "role": "user",
      "licenseKey": "CAT-PRO-XXXX-XXXX-XXXX-XXXX"
    }
  }
  ```

### 1.2 Đăng nhập
- **Endpoint**: `POST /auth/login`
- **Body**:
  ```json
  {
    "email": "admin@catmanager.com",
    "password": "AdminPassword2026!"
  }
  ```
- **Response** (200 OK):
  ```json
  {
    "success": true,
    "message": "Đăng nhập thành công",
    "token": "eyJhbGciOi...",
    "user": { "id": "...", "email": "admin@catmanager.com", "role": "admin" },
    "license": {
      "licenseKey": "CAT-ADM-...",
      "plan": "studio",
      "status": "active",
      "maxDevices": 10
    }
  }
  ```

### 1.3 Lấy thông tin tài khoản & Bản quyền
- **Endpoint**: `GET /auth/me`
- **Headers**: `Authorization: Bearer <token>`
- **Response**: Trả về Profile, License, Danh sách thiết bị và trạng thái cấu hình AI.

---

## 2. Bản quyền & Kích hoạt Thiết bị (`/license`)

### 2.1 Kích hoạt License trên máy trạm (Desktop App)
- **Endpoint**: `POST /license/activate`
- **Body**:
  ```json
  {
    "licenseKey": "CAT-PRO-XXXX-XXXX-XXXX-XXXX",
    "deviceId": "CAT-HW-8635CB195EAE6E15",
    "deviceName": "Editor PC Workstation",
    "os": "windows"
  }
  ```
- **Response**: Trả về chi tiết bản quyền, số thiết bị đã dùng / tối đa, ngày hết hạn.

### 2.2 Kiểm tra trạng thái định kỳ
- **Endpoint**: `GET /license/status?licenseKey=...&deviceId=...`
- **Response**: `{ "success": true, "valid": true, "license": { ... } }`

### 2.3 Hủy kích hoạt thiết bị (Từ xa)
- **Endpoint**: `POST /license/deactivate-device`
- **Headers**: `Authorization: Bearer <token>`
- **Body**: `{ "deviceId": "CAT-HW-XXXX" }`

---

## 3. Quản lý Extension & Cập nhật (`/extensions`)

### 3.1 Danh sách phiên bản mới nhất
- **Endpoint**: `GET /extensions/releases`
- **Response**: Danh sách phiên bản active của `cat-prime` và `cat-af` kèm SHA-256 Checksum.

### 3.2 Kiểm tra cập nhật tự động
- **Endpoint**: `POST /extensions/check-updates`
- **Body**:
  ```json
  {
    "installed": {
      "cat-prime": "1.0.0",
      "cat-af": "0.9.0"
    }
  }
  ```
- **Response**: Báo cáo có cập nhật hay không (`hasUpdate`), changelog và cờ bắt buộc (`isMandatory`).

### 3.3 Tải gói cài đặt Extension
- **Endpoint**: `GET /extensions/download/:slug/:version`
- **Response**: Stream file `.zip` với Header `X-Checksum-SHA256`.

---

## 4. Tích hợp AI Gemini (`/ai`)

### 4.1 Lấy cấu hình AI
- **Endpoint**: `GET /ai/config`
- **Headers**: `Authorization: Bearer <token>`
- **Ghi chú**: Không trả về raw API key cho web client (chỉ trả về `masked_key` ví dụ `AIzaSy...****`). Chỉ trả về raw key nếu có header nội bộ `X-CAT-Bridge-Request`.

### 4.2 Cập nhật & Mã hóa API Key
- **Endpoint**: `PUT /ai/config`
- **Body**:
  ```json
  {
    "apiKey": "AIzaSy...",
    "modelName": "gemini-1.5-flash",
    "temperature": 0.7,
    "responseLanguage": "vi",
    "customPrompt": "Bạn là trợ lý video editor chuyên nghiệp..."
  }
  ```
- **Bảo mật**: Mã hóa AES-256-GCM với khóa bí mật 32-byte độc lập.

### 4.3 Kiểm tra kết nối Gemini trực tiếp
- **Endpoint**: `POST /ai/test-key`
- **Body**: `{ "apiKey": "AIzaSy..." }`
- **Response**: Gọi trực tiếp tới endpoint Google AI Studio và trả về kết quả hợp lệ cùng danh sách model hỗ trợ.

---

## 5. Quản trị hệ thống (`/admin`) - Yêu cầu Role: Admin

- `GET /admin/stats`: Thống kê tổng người dùng, license hoạt động, thiết bị online, releases.
- `GET /admin/users`: Danh sách & tìm kiếm người dùng.
- `PATCH /admin/users/:userId/status`: Khóa hoặc mở khóa tài khoản (`active` / `suspended`).
- `POST /admin/licenses/generate`: Tạo hàng loạt (1 - 100) License Key theo thời hạn và số thiết bị.
- `DELETE /admin/licenses/:licenseId`: Thu hồi bản quyền.
- `POST /admin/extensions/release`: Phát hành phiên bản Extension mới.
- `GET /admin/logs`: Xem nhật ký kiểm toán hệ thống.

---

## 6. FTP Deployment Manager (`/deploy`) - Yêu cầu Role: Admin

- `GET /deploy/config`: Lấy cấu hình FTP (che mật khẩu).
- `PUT /deploy/config`: Cập nhật cấu hình FTP trong `config/ftp_config.txt`.
- `POST /deploy/test-ftp`: Kiểm tra kết nối tới FTP Server (`ftpupload.net`).
- `POST /deploy/execute`: Tự động tải các tệp bản dựng lên Server FTP an toàn.
- `GET /deploy/logs`: Đọc 100 dòng nhật ký mới nhất từ `logs/ftp_deploy.log`.

