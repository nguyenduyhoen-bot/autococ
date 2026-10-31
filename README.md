# CAT Product Manager: Hệ sinh thái Quản lý Adobe Extensions & AI Tools

**CAT Product Manager** là hệ sinh thái thương mại hoàn chỉnh chuyên quản lý, phân phối, kích hoạt bản quyền, tự động cập nhật và vận hành các Extension AI dành cho **Adobe Premiere Pro** và **Adobe After Effects** (hỗ trợ các phiên bản CC 2022, 2023, 2024, 2025 và 2026).

---

## 🏗️ 1. Kiến trúc Hệ sinh thái

Hệ thống bao gồm 3 phân hệ liên kết chặt chẽ:

1. **CAT Central Backend & API**:
   - Xây dựng trên nền tảng Node.js / Express với cơ sở dữ liệu SQLite chuẩn C nhúng (`node:sqlite`) kết hợp khả năng kết nối linh hoạt với MySQL Server (`sql106.infinityfree.com`).
   - Xác thực JWT, phân quyền Role-Based (Admin & User), giới hạn tần suất gọi API (Rate-limiting), mã hóa bảo mật chuẩn quân sự AES-256-GCM cho Gemini API Key.
   - Module **FTP Deployment Manager** tự động build và upload Website lên máy chủ hosting từ xa an toàn.
2. **CAT Website & Admin Dashboard**:
   - Giao diện Dark Cyberpunk công nghệ hiện đại, phát triển bằng React 18, Vite, Tailwind CSS và Lucide Icons.
   - Landing page giới thiệu sản phẩm, bảng so sánh tính năng, khu vực video hướng dẫn, bảng giá 3 gói (Starter, Pro, Studio).
   - Download Center cung cấp bộ cài đặt Windows, macOS và các gói ZIP Extension kèm mã băm toàn vẹn SHA-256.
   - User Portal quản lý thiết bị, hủy kích hoạt từ xa, cài đặt Gemini API Key cá nhân.
   - Admin Dashboard quản trị người dùng, sinh hàng loạt License Key, phát hành phiên bản Extension mới, và 1-Click FTP Deployer với terminal theo dõi thời gian thực.
3. **CAT Manager Desktop App**:
   - Ứng dụng Desktop phát triển bằng Electron + React + Tailwind CSS cho Windows và macOS.
   - Tự động phát hiện phiên bản Adobe Premiere Pro và After Effects đã cài đặt trên máy.
   - Quản lý cài đặt 1-Click Extension vào thư mục hệ thống Adobe CEP, tự động kích hoạt `PlayerDebugMode` trong Windows Registry / macOS Plist.
   - Cung cấp **Local Loopback Bridge Server** (cổng `127.0.0.1:48123`) giúp các Extension trong Adobe Premiere và After Effects đọc được bản quyền và Gemini API Key mà không cần đăng nhập lại.
4. **CAT Prime (Premiere Pro Extension)**:
   - Bảng công cụ CEP tích hợp trực tiếp trong Premiere Pro:
     - **Rough Cut AI**: Nhận diện khoảng lặng, đoạn vấp thoại, rung giật và tạo Sequence mới đã xử lý non-destructive (cam kết không ghi đè tệp gốc).
     - **AI Subtitle**: Chuyển giọng nói thành văn bản chuẩn tiếng Việt, phân tách câu tự động, tạo mốc thời gian, tạo track phụ đề trực tiếp trên Timeline Premiere và xuất tệp `.srt` / `.vtt`.
     - **AI Noise Reduction**: Triệt tiêu tiếng quạt, gió, điều hòa với thanh trượt cường độ và tính năng nghe thử trước/sau xử lý.
     - **AI Face Beauty**: Làm mịn da tự nhiên, sáng da, V-line không làm mờ nét mắt môi thông qua Adjustment Layer.
5. **CAT AF (After Effects Extension)**:
   - Bảng công cụ CEP tích hợp trực tiếp trong After Effects:
     - **Gemini Vision Analysis**: Kéo thả ảnh tham chiếu, AI phân tích chủ thể, bố cục, ánh sáng, dải màu và phong cách chuyển động.
     - **Prompt Generator**: Đề xuất hơn 10 hiệu ứng motion cao cấp (Cinematic Reveal, 3D Camera Orbit, Light Sweep, HUD, Glitch...).
     - **AI Generate After Effects Script (.jsx)**: Tự động sinh mã nguồn ExtendScript thực sự thực thi được (tạo Composition, Camera 3D, Solid, Đèn rọi, Keyframes toán học) với nút **Run in After Effects**, kiểm tra lỗi cú pháp và lưu Preset.
     - **Thư viện Effect Presets**: Danh mục hơn 10 hiệu ứng sẵn có cho phép xem mã và thực thi tức thì.

---

## 🚀 2. Hướng dẫn Khởi chạy Nhanh

### 2.1 Cài đặt & Khởi động Backend API
```bash
cd backend
npm install
npm run seed       # Khởi tạo database và tài khoản Admin/Demo
npm start          # Khởi động Backend trên cổng 5000
```
- **API Base URL**: `http://localhost:5000/api/v1`
- **Health Check**: `http://localhost:5000/health`

### 2.2 Cài đặt & Khởi động Website & Admin Portal
```bash
cd web
npm install
npm run dev        # Chạy máy chủ phát triển trên cổng 3000
npm run build      # Đóng gói bản dựng sản phẩm vào web/dist
```

### 2.3 Cài đặt & Khởi động Desktop App (CAT Manager)
```bash
cd desktop-app
npm install
npm run build:renderer   # Đóng gói giao diện React
npm start                # Khởi động ứng dụng Electron
```

---

## 🔑 3. Tài khoản Đăng nhập Khởi tạo

| Tài khoản | Email | Mật khẩu | Quyền hạn | Gói bản quyền |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin@catmanager.com` | `AdminPassword2026!` | `admin` | **Studio Unlimited** (10 thiết bị) |
| **Demo User** | `demo@catmanager.com` | `DemoPassword2026!` | `user` | **Pro Creator** (2 thiết bị) |

> Trên giao diện Website và Desktop App, bạn có thể click nút **1-Click Demo Fill** để tự động điền tài khoản thử nghiệm nhanh chóng.

---

## 🔌 4. Hướng dẫn Cài đặt Extension vào Adobe Premiere & After Effects

### Cách 1: Tự động 1-Click qua CAT Manager Desktop (Khuyên dùng)
1. Mở ứng dụng **CAT Manager Desktop**.
2. Đăng nhập hoặc kích hoạt License Key.
3. Tại trang **Quản lý Extension**, nhấn nút **"Cài đặt Extension (1-Click)"** cho CAT Prime hoặc CAT AF.
4. Mở Adobe Premiere Pro hoặc After Effects:
   - Vào menu: `Window > Extensions > CAT Prime - AI Video Tools`
   - Vào menu: `Window > Extensions > CAT AF - AI Motion & JSX Generator`

### Cách 2: Cài đặt Thủ công (Manual Installation)
Thư mục Extension Adobe CEP trên hệ thống:
- **Windows**: `%APPDATA%\Adobe\CEP\extensions\`  
  (Ví dụ: `C:\Users\<Tên_User>\AppData\Roaming\Adobe\CEP\extensions\`)
- **macOS**: `~/Library/Application Support/Adobe/CEP/extensions/`

Các bước thực hiện:
1. Sao chép thư mục `extensions/cat-prime` vào thư mục trên và đổi tên thành `com.cat.prime`.
2. Sao chép thư mục `extensions/cat-af` vào thư mục trên và đổi tên thành `com.cat.af`.
3. Bật **PlayerDebugMode** để Adobe cho phép chạy extension HTML5:
   - **Windows**: Chạy lệnh PowerShell sau với quyền User:
     ```powershell
     reg add "HKCU\Software\Adobe\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f
     reg add "HKCU\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f
     reg add "HKCU\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f
     reg add "HKCU\Software\Adobe\CSXS.14" /v PlayerDebugMode /t REG_SZ /d 1 /f
     reg add "HKCU\Software\Adobe\CSXS.16" /v PlayerDebugMode /t REG_SZ /d 1 /f
     ```
   - **macOS**: Chạy lệnh Terminal:
     ```bash
     defaults write com.adobe.CSXS.16 PlayerDebugMode 1
     ```

---

## 🌐 5. Triển khai FTP Server & InfinityFree Hosting

### 5.1 Cấu hình FTP an toàn
File cấu hình được lưu tại: `config/ftp_config.txt` (đã được cấu hình theo thông tin server cung cấp và tự động loại trừ khỏi Git qua `.gitignore`):
```ini
FTP_HOST=ftpupload.net
FTP_PORT=21
FTP_USER=if0_43016311
FTP_PASSWORD=ZN4Zw1GHMue33
FTP_REMOTE_PATH=/htdocs/
FTP_PROTOCOL=ftp
AUTO_DEPLOY=false
```

### 5.2 Thực hiện Triển khai
- **Cách 1**: Vào trang **Admin Dashboard > Tab "FTP Deployment Manager"**, nhấn nút **"1-Click Triển khai Website lên Server"**.
- **Cách 2**: Chạy lệnh thông qua terminal:
  ```bash
  cd web && npm run build
  cd ../backend && node -e "require('./src/services/ftpDeployService').deployWebsite({ deployedBy: 'admin' })"
  ```
- **Nhật ký triển khai**: Được ghi đầy đủ và bảo mật (không lộ mật khẩu) tại tệp `logs/ftp_deploy.log`.

### 5.3 Cơ sở dữ liệu Remote MySQL (InfinityFree)
- **Hostname**: `sql106.infinityfree.com`
- **Port**: `3306`
- **Username**: `if0_43016311`
- **Database**: `if0_43016311_cat`
- File di trú cơ sở dữ liệu tự động đã được biên soạn tại `web/dist/api/migrate.php` và đã được đẩy lên server qua FTP. Truy cập `http://<your-domain>/api/migrate.php` để khởi tạo các bảng MySQL từ xa.

---

## 🧪 6. Kiểm thử Tự động (Automated Tests)

Chạy bộ kiểm thử toàn diện:
```bash
cd backend
npm test                             # Chạy unit tests (Crypto, License format, Database)
node --test test/integration.test.js # Chạy E2E tests (Adobe CC, Hardware ID, Device limit, FTP Handshake)
```
Kết quả kiểm tra: **100% Passed**.

---

## 📦 7. Đóng gói Ứng dụng Desktop cho Windows & macOS

Để tạo file cài đặt `.exe` cho Windows hoặc `.dmg` cho macOS:
```bash
cd desktop-app
npm run build:renderer
npm run pack:win    # Xuất file cài đặt Windows Setup x64
npm run pack:mac    # Xuất file ảnh đĩa macOS DMG (ARM64 / Intel)
```

---

## 🛡️ 8. Bảo mật & Tiêu chuẩn Sản xuất
- Mật khẩu người dùng được băm bằng thuật toán `bcrypt` với muối an toàn.
- Google Gemini API Key được mã hóa bằng thuật toán `AES-256-GCM` với Auth Tag và IV ngẫu nhiên; không bao giờ trả về API key dạng văn bản rõ cho client công khai.
- Cắt thô Rough Cut luôn tạo Sequence mới và không chỉnh sửa trực tiếp hay xóa file video gốc trên ổ đĩa.
- ExtendScript After Effects luôn thực thi trong khối `app.beginUndoGroup` cho phép hoàn tác an toàn (Ctrl + Z).

