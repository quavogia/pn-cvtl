// Đăng nhập & xin cấp quyền truy cập.
//
// ⚠️ HAI ĐIỂM RẤT DỄ SAI (cả hai đều đã từng làm hỏng buổi chạy thử):
//
// 1. Giao diện gọi checkAccess() và requestAccess() **KHÔNG kèm tham số nào cả**.
//    Mã đăng nhập được gửi ở ô "token" của yêu cầu, chứ không nằm trong "args".
//    Chỉ đọc tham số thứ nhất thì luôn báo "Mã đăng nhập không hợp lệ."
//
// 2. checkAccess nhận **HAI LOẠI MÃ khác nhau**:
//    - Mã Google (JWT, 3 phần cách nhau bằng dấu chấm) — lúc mới bấm đăng nhập.
//    - Mã phiên của chính web này (bắt đầu bằng "SESS.") — lúc mở lại trang,
//      giao diện tự gửi mã đã lưu lên để vào thẳng, khỏi bấm đăng nhập lại.
//    Nếu chỉ xử lý loại thứ nhất thì **cứ F5 là bị bắt đăng nhập lại**.
//    Bản Apps Script cũ dùng verifyAnyToken_() để nhận cả hai — phải giữ đúng vậy.

import { xacThucGoogleJwt, taoPhien } from '../auth.js';
import { guiTelegramNgam, thoatHtml } from '../telegram.js';

// Địa chỉ máy chủ — dùng để dựng đường link "Cấp quyền 1-chạm" gửi kèm tin
// Telegram (xem requestAccess bên dưới và route /duyet-truy-cap ở index.js).
const DIA_CHI_API = 'https://cvtl-api.rise-shine1948.workers.dev';

const TIEN_TO_PHIEN = 'SESS.';
const PHIEN_HAN_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày

/** Lấy mã đăng nhập: ưu tiên tham số truyền vào, không có thì lấy ở ô token. */
function layMaDangNhap(ctx, thamSo) {
  return String(thamSo || (ctx && ctx.token) || '');
}

function chuaDangNhap(loi) {
  return { authorized: false, pending: false, error: loi };
}

/**
 * Người dùng gửi mã lên (mã Google hoặc mã phiên cũ).
 * Được duyệt -> trả về mã phiên 30 ngày. Chưa -> báo trạng thái để giao diện
 * hiện màn hình chờ duyệt.
 */
export async function checkAccess(ctx, thamSo) {
  const { db, env } = ctx;
  const ma = layMaDangNhap(ctx, thamSo);
  if (!ma) return chuaDangNhap('Mã đăng nhập không hợp lệ.');

  let email = '';
  let ten = '';
  let maPhienCu = '';

  if (ma.startsWith(TIEN_TO_PHIEN)) {
    // --- Vào lại bằng mã phiên đã lưu (đây là đường đi khi bấm F5) ---
    const phien = await db.first(
      'SELECT email, ten, het_han_luc FROM phien_dang_nhap WHERE token = ?',
      [ma]
    );
    if (!phien) return chuaDangNhap('PHIEN_DANG_NHAP_HET_HAN');
    if (Date.now() > Number(phien.het_han_luc)) {
      await db.run('DELETE FROM phien_dang_nhap WHERE token = ?', [ma]);
      return chuaDangNhap('PHIEN_DANG_NHAP_HET_HAN');
    }
    email = phien.email;
    ten = phien.ten || '';
    maPhienCu = ma;
  } else {
    // --- Vừa bấm "Đăng nhập bằng Google" ---
    try {
      const info = await xacThucGoogleJwt(ma, env.GOOGLE_CLIENT_ID);
      email = info.email;
      ten = info.ten || '';
    } catch (e) {
      return chuaDangNhap(e.message);
    }
  }

  const quyen = await db.first(
    'SELECT trang_thai, ten FROM access_control WHERE lower(email) = lower(?)',
    [email]
  );

  // Tên trường "name" và "pending" giữ đúng như bản cũ — giao diện đang đọc
  // res.email / res.pending / res.sessionToken.
  const chung = { email, name: ten, ten };

  if (!quyen) {
    return { authorized: false, pending: false, ...chung, trangThai: 'chua_dang_ky' };
  }
  if (quyen.trang_thai !== 'da_duyet') {
    // Quyền vừa bị thu hồi mà mã phiên còn hạn -> huỷ luôn mã phiên đó.
    if (maPhienCu) await db.run('DELETE FROM phien_dang_nhap WHERE token = ?', [maPhienCu]);
    return {
      authorized: false, pending: quyen.trang_thai === 'cho_duyet',
      ...chung, trangThai: quyen.trang_thai,
    };
  }

  // Gia hạn thêm 30 ngày mỗi lần vào lại (giống bản cũ): hễ còn ghé web tối
  // thiểu 1 lần trong 30 ngày là không bao giờ bị bắt đăng nhập lại.
  let token;
  if (maPhienCu) {
    // Giữ NGUYÊN mã phiên cũ, chỉ đẩy hạn ra xa — tránh sinh dòng rác mới
    // trong bảng phiên mỗi lần người dùng bấm F5.
    token = maPhienCu;
    await db.run('UPDATE phien_dang_nhap SET het_han_luc = ?, ten = ? WHERE token = ?',
      [Date.now() + PHIEN_HAN_MS, ten || quyen.ten || '', token]);
  } else {
    token = await taoPhien(db, email, ten || quyen.ten || '');
  }

  return { authorized: true, pending: false, ...chung, sessionToken: token };
}

/** Ghi nhận yêu cầu cấp quyền để tài khoản chủ duyệt sau. */
export async function requestAccess(ctx, thamSo) {
  const { db, env } = ctx;
  const ma = layMaDangNhap(ctx, thamSo);
  if (ma.startsWith(TIEN_TO_PHIEN)) {
    throw new Error('Phiên đăng nhập đã hết hạn. Xin đăng nhập lại bằng Google.');
  }
  const info = await xacThucGoogleJwt(ma, env.GOOGLE_CLIENT_ID);

  await db.run(
    `INSERT INTO access_control (email, trang_thai, ten, ngay_yeu_cau) VALUES (?, 'cho_duyet', ?, ?)
     ON CONFLICT (email) DO UPDATE SET ten = excluded.ten`,
    [info.email, info.ten || '', new Date().toISOString()]
  );

  // Báo cho anh Rise qua Telegram để duyệt. Bản Apps Script cũ gửi email kèm
  // link "Cấp quyền" bấm 1 phát là xong — bản Cloudflare khi chuyển sang bị
  // BỎ SÓT hoàn toàn bước báo này (anh Rise phát hiện 16/08/2026: ấn "Gửi yêu
  // cầu truy cập" xong mà không có gì báo để duyệt). Giữ đúng tinh thần cũ:
  // 1 link bấm là duyệt luôn, không cần mở web hay đăng nhập gì thêm — chỉ
  // đổi kênh báo từ email sang Telegram theo lựa chọn của anh Rise.
  if (env.MA_CAI_DAT) {
    const linkDuyet =
      DIA_CHI_API + '/duyet-truy-cap?email=' + encodeURIComponent(info.email) +
      '&ma=' + encodeURIComponent(env.MA_CAI_DAT);
    const tin = [
      '🔑 Có người xin CẤP QUYỀN truy cập trang nhập liệu:',
      '',
      '👤 Tên: ' + thoatHtml(info.ten || '(không rõ)'),
      '📧 Email: ' + thoatHtml(info.email),
      '',
      '👉 <a href="' + linkDuyet.replace(/&/g, '&amp;') + '">Bấm để CẤP QUYỀN ngay</a> (không cần đăng nhập gì thêm)',
      '',
      'Không muốn cấp quyền thì bỏ qua tin này (có thể duyệt sau).',
    ].join('\n');
    guiTelegramNgam(ctx.ctx, env, tin);
  }

  return { ok: true, success: true, trangThai: 'cho_duyet' };
}
