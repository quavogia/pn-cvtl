# CVTL API — máy chủ dữ liệu mới (Cloudflare Workers + D1)

Thay thế Google Apps Script. Giữ nguyên giao thức {fn, args, token}
nên giao diện web chỉ cần đổi 1 dòng địa chỉ.

## Thư mục
- `src/`          mã nguồn (đọc được, có chú thích tiếng Việt)
- `migrations/`   cấu trúc CSDL
- `scripts/`      bộ kiểm thử chạy offline
- `wrangler.toml` cấu hình kết nối Cloudflare

## Chạy kiểm thử (không cần mạng)
    node scripts/kiem-thu.mjs
    node scripts/kiem-thu-giao-thuc.mjs
