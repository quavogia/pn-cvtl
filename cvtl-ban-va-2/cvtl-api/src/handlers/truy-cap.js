// Đăng nhập & xin cấp quyền truy cập.
//
// ⚠️ ĐIỂM RẤT DỄ SAI (đã từng làm hỏng buổi chạy thử):
// Giao diện gọi checkAccess() và requestAccess() **KHÔNG kèm tham số nào cả**.
// Mã đăng nhập của Google được gửi ở ô "token" của yêu cầu, chứ không nằm
// trong "args". Vì vậy ở đây phải lấy mã từ bối cảnh (ctx.token).
// Nếu chỉ đọc tham số thứ nhất thì luôn báo "Mã đăng nhập không hợp lệ."
// và không ai đăng nhập được.

import { xacThucGoogleJwt, taoPhien } from '../auth.js';

/** Lấy mã đăng nhập: ưu tiên tham số truyền vào, không có thì lấy ở ô token. */
function layMaDangNhap(ctx, thamSo) {
  return String(thamSo || (ctx && ctx.token) || '');
}

/**
 * Người dùng gửi mã Google lên. Nếu đã được duyệt -> trả về mã phiên 30 ngày.
 * Nếu chưa -> báo trạng thái để giao diện hiện màn hình chờ duyệt.
 */
export async function checkAccess(ctx, thamSo) {
  const { db, env } = ctx;
  const jwt = layMaDangNhap(ctx, thamSo);

  let info;
  try {
    info = await xacThucGoogleJwt(jwt, env.GOOGLE_CLIENT_ID);
  } catch (e) {
    return { authorized: false, pending: false, error: e.message };
  }

  const quyen = await db.first(
    'SELECT trang_thai, ten FROM access_control WHERE lower(email) = lower(?)',
    [info.email]
  );

  // Tên trường "name" và "pending" giữ đúng như bản cũ — giao diện đang đọc
  // res.email / res.pending / res.sessionToken.
  if (!quyen) {
    return {
      authorized: false, pending: false,
      email: info.email, name: info.ten, ten: info.ten, trangThai: 'chua_dang_ky',
    };
  }
  if (quyen.trang_thai !== 'da_duyet') {
    return {
      authorized: false, pending: quyen.trang_thai === 'cho_duyet',
      email: info.email, name: info.ten, ten: info.ten, trangThai: quyen.trang_thai,
    };
  }

  const token = await taoPhien(db, info.email, info.ten || quyen.ten || '');
  return {
    authorized: true, pending: false,
    email: info.email, name: info.ten, ten: info.ten, sessionToken: token,
  };
}

/** Ghi nhận yêu cầu cấp quyền để tài khoản chủ duyệt sau. */
export async function requestAccess(ctx, thamSo) {
  const { db, env } = ctx;
  const jwt = layMaDangNhap(ctx, thamSo);
  const info = await xacThucGoogleJwt(jwt, env.GOOGLE_CLIENT_ID);

  await db.run(
    `INSERT INTO access_control (email, trang_thai, ten, ngay_yeu_cau) VALUES (?, 'cho_duyet', ?, ?)
     ON CONFLICT (email) DO UPDATE SET ten = excluded.ten`,
    [info.email, info.ten || '', new Date().toISOString()]
  );
  return { ok: true, success: true, trangThai: 'cho_duyet' };
}
