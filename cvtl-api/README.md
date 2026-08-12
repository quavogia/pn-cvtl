# CVTL API — máy chủ dữ liệu mới (Cloudflare Workers + D1)

Thay thế Google Apps Script. Giữ nguyên giao thức {fn, args, token}
nên giao diện web chỉ cần đổi 1 dòng địa chỉ.

## Thư mục
- `src/`          mã nguồn (đọc được, có chú thích tiếng Việt)
- `src/handlers/` mỗi file một mảng chức năng của web
- `src/tien-ich.js` các phép tính dùng chung (tháng, tuần, phần trăm, hữu hiệu…)
- `migrations/`   cấu trúc CSDL
- `scripts/`      bộ kiểm thử chạy offline
- `wrangler.toml` cấu hình kết nối Cloudflare

## Trạng thái
Đã chuyển **60/60 hàm** mà giao diện web đang gọi. Không còn hàm nào báo
"chưa được chuyển sang hệ thống mới".

| Nhóm | File |
|---|---|
| Đăng nhập / phân quyền | `handlers/truy-cap.js` |
| Cấu hình (Khu vực, Tiến độ, Người dẫn dắt) | `handlers/cau-hinh.js` |
| Điểm danh | `handlers/diem-danh.js` |
| Thờ phượng | `handlers/tho-phuong.js` |
| Học viên + Nhật ký Đơn thuần + Thống kê tổng quan | `handlers/hoc-vien.js` |
| Mục tiêu + Giáo dục thành viên | `handlers/muc-tieu-giao-duc.js` |
| Đào tạo + Lễ hội | `handlers/dao-tao-le-hoi.js` |
| Lịch làm việc (+ báo Telegram) | `handlers/lich-lam-viec.js` |
| Thống kê người giảm Thờ phượng | `handlers/thong-ke-tp.js` |

## Chạy kiểm thử (không cần mạng, không cần Cloudflare)

    node scripts/kiem-thu.mjs            # lõi + điểm danh + thờ phượng
    node scripts/kiem-thu-giao-thuc.mjs  # bảo đảm không bao giờ trả về HTML
    node scripts/kiem-thu-hoc-vien.mjs   # học viên, mục tiêu, giáo dục, thống kê
    node scripts/kiem-thu-dao-tao.mjs    # đào tạo, lễ hội, lịch, TP giảm

Chạy hết bốn lệnh phải ra **389 đạt, 0 hỏng**.

## Hai lời hứa của hệ thống mới
1. **Không bao giờ trả về HTML.** Mọi lỗi đều là JSON tiếng Việt — thứ diệt tận
   gốc lỗi `Unexpected token '<', "<!DOCTYPE "...`.
2. **Mỗi bảng có khóa duy nhất.** Hai người nhập cùng lúc không đè nhau, không
   sinh dòng trùng. Đây là thứ Google Sheets không có.

## Biến môi trường
| Tên | Bắt buộc? | Dùng để |
|---|---|---|
| `DB` | có | kết nối CSDL D1 (binding) |
| `MA_CAI_DAT` | có | bảo vệ đường dẫn `/cai-dat` và `/nhap-du-lieu` |
| `GOOGLE_CLIENT_ID` | có | xác thực đăng nhập Google |
| `TELEGRAM_BOT_TOKEN` | không | báo lịch làm việc qua Telegram |
| `TELEGRAM_CHAT_ID` | không | báo lịch làm việc qua Telegram |

Thiếu hai biến Telegram thì hệ thống **vẫn chạy bình thường**, chỉ là không gửi
thông báo — việc lưu lịch không bao giờ bị hỏng vì lý do này.
