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

import { xacThucGoogleJwt, taoPhien, CHU_VINH_VIEN, tachPhamVi, gopPhamVi } from '../auth.js';
import { KHU_VUC_LIST } from '../hang-so.js';
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

  // SELECT * chứ không liệt kê cột — xem lời giải thích ở nhanDienNguoiGoi
  // trong src/auth.js (cột pham_vi chỉ có mặt SAU khi chạy GET /cai-dat;
  // liệt kê tên cột thì cả phòng không đăng nhập được trong lúc chờ).
  const quyen = await db.first(
    'SELECT * FROM access_control WHERE lower(email) = lower(?)',
    [email]
  );

  // laChu (mới 21/08/2026): true nếu tài khoản này được cấp quyền Admin
  // (la_chu=1 trong CSDL) — dùng để giao diện tự hiện đúng các mục chỉ-Admin
  // (Hủy báo cáo, Quản lý khu vực, Duyệt truy cập...), thay cho cách cũ chỉ
  // so email cứng với đúng 1 địa chỉ (isChuTaiKhoan_() ở index.html). Email
  // CHU_VINH_VIEN LUÔN được coi là Admin dù cột la_chu lỡ chưa/không còn là 1
  // trong CSDL — tránh tuyệt đối việc tự khoá mất quyền của chính chủ.
  const laChu = (!!quyen && quyen.la_chu === 1) || email === CHU_VINH_VIEN;

  // Tên trường "name" và "pending" giữ đúng như bản cũ — giao diện đang đọc
  // res.email / res.pending / res.sessionToken.
  // phamVi (mới 26/08/2026): danh sách khu vực người này phụ trách. Giao
  // diện nhận sẵn từ lúc đăng nhập để về sau khỏi phải gọi thêm một lượt.
  // Chủ/Admin thì phamVi vô nghĩa (thấy toàn Si-ôn) nhưng vẫn trả cho đủ.
  const chung = { email, name: ten, ten, laChu, phamVi: tachPhamVi(quyen && quyen.pham_vi) };

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

/**
 * Màn hình "Duyệt truy cập" trong web (17/08/2026, theo yêu cầu anh Rise) —
 * chỉ tài khoản chủ mới gọi được (chuThoi: true ở registry.js), phòng khi
 * Telegram bị bỏ lỡ/tắt tiếng thì vẫn có chỗ vào duyệt trực tiếp. Liệt kê
 * người đang "chờ duyệt", cũ nhất lên đầu (chờ lâu nhất cần xử lý trước).
 */
export async function getPendingAccess({ db }) {
  const ds = await db.all(
    `SELECT email, ten, ngay_yeu_cau FROM access_control
     WHERE trang_thai = 'cho_duyet' ORDER BY ngay_yeu_cau ASC`
  );
  return ds.map((r) => ({ email: r.email, ten: r.ten || '', ngayYeuCau: r.ngay_yeu_cau || '' }));
}

/** Duyệt 1 yêu cầu ngay trong web — cùng hiệu ứng với link "Cấp quyền
 * 1-chạm" gửi qua Telegram (route /duyet-truy-cap ở index.js), chỉ khác chỗ
 * bấm. Bấm lại nhiều lần vẫn an toàn, không sinh dòng trùng. */
export async function approveAccessRequest({ db }, email) {
  const e = String(email || '').toLowerCase().trim();
  if (!e) throw new Error('Thiếu email cần cấp quyền.');
  const nay = new Date().toISOString();
  await db.run(
    `INSERT INTO access_control (email, trang_thai, ten, ngay_yeu_cau, ngay_duyet) VALUES (?, 'da_duyet', '', ?, ?)
     ON CONFLICT (email) DO UPDATE SET trang_thai = 'da_duyet', ngay_duyet = excluded.ngay_duyet`,
    [e, nay, nay]
  );
  return { ok: true };
}

/** Từ chối 1 yêu cầu — KHÔNG khoá vĩnh viễn, người đó vẫn thấy màn "chưa
 * được cấp quyền" và có thể bấm "Gửi yêu cầu truy cập" lại nếu cần. */
export async function denyAccessRequest({ db }, email) {
  const e = String(email || '').toLowerCase().trim();
  if (!e) throw new Error('Thiếu email cần từ chối.');
  await db.run(`UPDATE access_control SET trang_thai = 'tu_choi' WHERE lower(email) = lower(?)`, [e]);
  return { ok: true };
}

/**
 * Danh sách người ĐÃ được cấp quyền truy cập (mới 21/08/2026, theo yêu cầu
 * anh Rise: "anh cần hiện lại những mail đã cấp quyền, bên cạnh đó cũng có
 * thêm cả nút gỡ quyền và cấp quyền admin nữa"). Khác với getPendingAccess
 * (chỉ người đang CHỜ duyệt), đây là người ĐÃ da_duyet — dùng để anh Rise
 * xem toàn bộ danh sách, gỡ quyền, hoặc cấp/gỡ quyền Admin ngay trong web.
 * Admin xếp lên đầu (la_chu DESC), sau đó theo tên cho dễ tìm.
 */
export async function getApprovedAccess({ db }) {
  // SELECT * — cột pham_vi chỉ có sau khi chạy /cai-dat, xem src/auth.js.
  const ds = await db.all(
    `SELECT * FROM access_control
     WHERE trang_thai = 'da_duyet' ORDER BY la_chu DESC, lower(ten) ASC, lower(email) ASC`
  );
  return ds.map((r) => {
    const email = String(r.email || '').toLowerCase();
    const laChuVinhVien = email === CHU_VINH_VIEN;
    return {
      email: r.email,
      ten: r.ten || '',
      ngayDuyet: r.ngay_duyet || '',
      laChu: r.la_chu === 1 || laChuVinhVien,
      laChuVinhVien, // true = tài khoản chủ gốc, không ai gỡ được (kể cả Admin khác)
      phamVi: tachPhamVi(r.pham_vi), // khu vực người này phụ trách (26/08/2026)
    };
  });
}

/** Danh sách khu vực hợp lệ hiện có — lấy từ Cấu hình, chưa có thì dùng
 *  danh sách mặc định. ⚠️ Phải đọc config_list chứ KHÔNG dùng cứng
 *  KHU_VUC_LIST: khu vực "TT Châu" thêm ngày 19/08/2026 chỉ nằm trong
 *  config_list, không có trong hằng số. */
async function dsKhuVucHopLe(db) {
  const rows = await db.all(
    "SELECT gia_tri FROM config_list WHERE loai = 'khu_vuc' ORDER BY thu_tu, id"
  );
  const ds = (rows || []).map((r) => String(r.gia_tri || '').trim()).filter(Boolean);
  return ds.length ? ds : KHU_VUC_LIST.slice();
}

/**
 * Gán khu vực PHỤ TRÁCH cho một tài khoản (mới 26/08/2026).
 *
 * Anh Rise: "tại sao không tạo 1 nút cấp quyền cho ai có quyền ấn báo cáo
 * cho nhanh, sau này có mail mới thì đỡ phải báo lại em" — nên việc gán này
 * làm HẲN trên web, Claude không bao giờ gõ email vào mã.
 *
 *   dsKhuVuc = ['K My']                     -> khu vực trưởng
 *   dsKhuVuc = ['Đ Uyên','K Thành','TT Châu'] -> địa vực trưởng
 *   dsKhuVuc = []                            -> không phụ trách khu vực nào
 *
 * ⚠️ Ở đợt này việc gán CHƯA chặn ai cả — chỉ là ghi nhận. Luật chặn/lọc là
 * bước 4 (xem CVTL-KE-HOACH-PHAN-QUYEN.md mục 6).
 */
export async function setPhamVi({ db }, email, dsKhuVuc) {
  const e = String(email || '').toLowerCase().trim();
  if (!e) throw new Error('Thiếu email cần gán khu vực.');

  const quyen = await db.first(
    `SELECT trang_thai FROM access_control WHERE lower(email) = lower(?)`, [e]
  );
  if (!quyen || quyen.trang_thai !== 'da_duyet') {
    throw new Error('Chỉ gán được khu vực cho người ĐÃ được duyệt truy cập.');
  }

  const chon = tachPhamVi(dsKhuVuc);
  const hopLe = await dsKhuVucHopLe(db);
  const la = chon.filter((k) => !hopLe.includes(k));
  if (la.length) {
    // Báo tên khu vực sai ra hẳn — gõ nhầm dấu tiếng Việt là chuyện rất dễ
    // xảy ra, mà lưu nhầm thì sau này người đó lặng lẽ không xem được gì.
    throw new Error('Không có khu vực: ' + la.join(', '));
  }

  await db.run(
    `UPDATE access_control SET pham_vi = ? WHERE lower(email) = lower(?)`,
    [gopPhamVi(chon), e]
  );
  return { ok: true, email: e, phamVi: chon };
}

/**
 * Gỡ quyền truy cập đã cấp — người này mất quyền đăng nhập ngay lập tức
 * (mọi lệnh gọi kế tiếp của họ bị chặn ở router vì trang_thai không còn là
 * 'da_duyet', xem src/index.js), phải "Gửi yêu cầu truy cập" xin lại từ đầu
 * nếu muốn dùng lại về sau. KHÔNG đụng tới dữ liệu khác của họ (Điểm danh,
 * Trụ đỡ...). Gỡ quyền truy cập thì đồng thời cũng mất luôn quyền Admin
 * (nếu có) — hợp lý vì không còn đăng nhập được thì Admin cũng vô nghĩa.
 */
export async function revokeAccess({ db }, email) {
  const e = String(email || '').toLowerCase().trim();
  if (!e) throw new Error('Thiếu email cần gỡ quyền.');
  if (e === CHU_VINH_VIEN) throw new Error('Không thể gỡ quyền của tài khoản chủ chính.');
  await db.run(
    `UPDATE access_control SET trang_thai = 'tu_choi', la_chu = 0 WHERE lower(email) = lower(?)`,
    [e]
  );
  return { ok: true };
}

/**
 * Cấp quyền Admin (la_chu=1) cho một email ĐÃ được duyệt truy cập từ trước.
 * Admin có TOÀN BỘ quyền như tài khoản chủ: Hủy báo cáo, Quản lý khu vực
 * (thêm/chuyển/dọn dẹp TP), Duyệt truy cập, và cấp/gỡ Admin cho người khác
 * — theo đúng lựa chọn của anh Rise (21/08/2026, "Full quyền như anh").
 */
export async function grantAdmin({ db }, email) {
  const e = String(email || '').toLowerCase().trim();
  if (!e) throw new Error('Thiếu email cần cấp quyền Admin.');
  const quyen = await db.first(`SELECT trang_thai FROM access_control WHERE lower(email) = lower(?)`, [e]);
  if (!quyen || quyen.trang_thai !== 'da_duyet') {
    throw new Error('Chỉ cấp được quyền Admin cho người ĐÃ được duyệt truy cập.');
  }
  await db.run(`UPDATE access_control SET la_chu = 1 WHERE lower(email) = lower(?)`, [e]);
  return { ok: true };
}

/**
 * Gỡ quyền Admin — người này vẫn còn quyền truy cập bình thường (vẫn đăng
 * nhập/dùng web được), chỉ mất các quyền chỉ-Admin. Không thể gỡ Admin của
 * tài khoản chủ chính (an toàn: luôn phải còn ít nhất 1 người có toàn quyền).
 */
export async function revokeAdmin({ db }, email) {
  const e = String(email || '').toLowerCase().trim();
  if (!e) throw new Error('Thiếu email cần gỡ quyền Admin.');
  if (e === CHU_VINH_VIEN) throw new Error('Không thể gỡ quyền Admin của tài khoản chủ chính.');
  await db.run(`UPDATE access_control SET la_chu = 0 WHERE lower(email) = lower(?)`, [e]);
  return { ok: true };
}
