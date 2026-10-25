### Hướng dẫn chạy ứng dụng KHÔNG cần Docker

#### Bước 1: Khởi động Backend (Core)
Mở terminal tại thư mục gốc của dự án hoặc thư mục `core`:
```bash
cd core
npm install
```

**Cách A — Chạy trực tiếp truyền cấu hình DB qua cờ CLI (Khuyên dùng khi máy có cấu hình DB riêng):**
```bash
# Ví dụ 1: SQL Server mặc định trên localhost (port 1433)
npm run start:dev -- --db-host=localhost --db-port=1433 --db-username=sa --db-password=YourPassword123! --db-database=warranty_management

# Ví dụ 2: Nếu máy dùng SQL Server Instance (ví dụ SQLEXPRESS):
npm run start:dev -- --db-host=localhost --db-instance=SQLEXPRESS --db-username=sa --db-password=YourPassword123! --db-database=warranty_management
```

**Cách B — Chạy qua file `.env`:**
Tạo hoặc chỉnh sửa file `core/.env` với thông tin DB của bạn:
```env
DB_HOST=localhost
DB_PORT=1433
DB_USERNAME=Username của Login tự tao, nên gán quyền sysadmin
DB_PASSWORD=MatKhauTuTao
DB_DATABASE=warranty_management
DB_TRUST_SERVER_CERTIFICATE=true
```
Sau đó chỉ cần chạy:
```bash
npm run start:dev
```
Backend sẽ khởi chạy tại: `http://localhost:3001/api`

---

#### Bước 2: Khởi động Frontend (CRM)
Mở một cửa sổ terminal mới:
```bash
cd crm
npm install
npm run dev
```
Frontend sẽ khởi chạy tại: `http://localhost:3000` (tự động kết nối tới Backend tại port 3001).