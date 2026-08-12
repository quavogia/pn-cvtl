// Đăng nhập & xin cấp quyền truy cập.

import { xacThucGoogleJwt, taoPhien } from '../auth.js';

/**
 * Người dùng gửi JWT Google lên. Nếu đã được duyệt -> trả về mã phiên 30 ngày.
 * Nếu chưa -> báo trạng thái để giao diện hiện màn hình chờ duyệt.
 */
export async function checkAccess({ db, env }, jwt) {
  let info;
  try {
    info = await xacThucGoogleJwt(jwt, env.GOOGLE_CLIENT_ID);
  } catch (e) {
    return { authorized: false, error: e.message };
  }

  const quyen = await db.first('SELECT trang_thai, ten FROM access_control WHERE email = ?', [info.email]);

  if (!quyen) {
    return { authorized: false, email: info.email, ten: info.ten, trangThai: 'chua_dang_ky' };
  }
  if (quyen.trang_thai !== 'da_duyet') {
    return { authorized: false, email: info.email, ten: info.ten, trangThai: quyen.trang_thai };
  }

  const token = await taoPhien(db, info.email, info.ten || quyen.ten || '');
  return { authorized: true, email: info.email, ten: info.ten, sessionToken: token };
}

/** Ghi nhận yêu cầu cấp quyền để tài khoản chủ duyệt sau. */
export async function requestAccess({ db, env }, jwt) {
  const info = await xacThucGoogleJwt(jwt, env.GOOGLE_CLIENT_ID);
  await db.run(
    `INSERT INTO access_control (email, trang_thai, ten, ngay_yeu_cau) VALUES (?, 'cho_duyet', ?, ?)
     ON CONFLICT (email) DO UPDATE SET ten = excluded.ten`,
    [info.email, info.ten || '', new Date().toISOString()]
  );
  return { success: true, trangThai: 'cho_duyet' };
}
