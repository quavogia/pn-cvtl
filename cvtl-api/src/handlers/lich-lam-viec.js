// =====================================================================
// LỊCH LÀM VIỆC TUẦN
// Mỗi dòng là 1 công việc gắn với 1 ngày cụ thể (KHÔNG tự lặp lại mỗi tuần —
// mỗi tuần Trưởng phòng / các Khu vực tự nhập mới).
// Dùng cho tab "Lịch làm việc": bảng lịch 7 ngày, mọi Khu vực / Người dẫn dắt
// cùng xem để biết tuần này ai làm gì, ở đâu.
//
// ⚠️ VỀ CHỮ "row": bản cũ chạy trên Google Sheet nên lấy SỐ DÒNG làm định danh
// (updateLichEvent(row, ...), deleteLichEvent(row)). Bảng mới không có "dòng"
// nữa, mỗi công việc có cột `id` tự tăng. Vì vậy:
//   * Tham số `row` mà giao diện gửi lên ĐƯỢC HIỂU LÀ `id` của công việc.
//   * Hàm đọc getLichTuan trả về trường `row` = `id` (giao diện đang đọc
//     `ev.row` để vẽ nút Sửa / Xóa / Đã diễn ra, xem index.html).
// Nhờ vậy giao diện không phải sửa một dòng nào.
// =====================================================================

import { chuanNgay, chuoi } from '../tien-ich.js';

/** Ba trạng thái của một công việc (giữ nguyên bản cũ). */
export const LICH_TRANG_THAI_LIST = ['Chưa diễn ra', 'Đã diễn ra', 'Hủy'];

const TEN_THU_VN = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

// ---------------------------------------------------------------------
// Mấy hàm phụ dùng riêng trong file này
// ---------------------------------------------------------------------

/**
 * Cộng thêm n ngày vào một ngày "yyyy-MM-dd", trả lại cũng "yyyy-MM-dd".
 * Tính bằng giờ UTC nên không bao giờ lệch múi giờ.
 */
function congNgay(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' +
    String(t.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(t.getUTCDate()).padStart(2, '0');
}

/** "2026-08-12" -> "12/08/2026 (Thứ 4)" — đúng kiểu tin nhắn Telegram cũ. */
function ngayVNCoThu(ymd) {
  const s = chuanNgay(ymd);
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  const thu = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y} (${TEN_THU_VN[thu]})`;
}

/**
 * Chuẩn hóa "Người tham gia" (nhiều người) về mảng tên đã cắt khoảng trắng.
 * Nhận cả mảng ["A","B"] (form gửi lên) lẫn chuỗi "A, B" (đọc lại từ CSDL,
 * hoặc nút "✓ Đã diễn ra" gửi lại nguyên chuỗi cũ) — nên dùng chung được.
 */
function tachThamGia(val) {
  if (Array.isArray(val)) return val.map((v) => chuoi(v)).filter(Boolean);
  return String(val || '').split(',').map((v) => v.trim()).filter(Boolean);
}

/** Lấy một danh sách trong bảng cấu hình (khu_vuc / nguoi_dan_dat / tien_do). */
async function danhSachCauHinh(db, loai) {
  const rows = await db.all(
    'SELECT gia_tri FROM config_list WHERE loai = ? ORDER BY thu_tu, id',
    [loai]
  );
  return rows.map((r) => chuoi(r.gia_tri)).filter(Boolean);
}

/**
 * Kiểm tra dữ liệu một công việc trước khi lưu.
 * Danh sách nào trong Config còn TRỐNG thì bỏ qua kiểm tra danh sách đó
 * (giống bản cũ: chưa cấu hình thì không chặn người dùng nhập).
 */
async function kiemTraDuLieuLich(db, data) {
  const d = data || {};
  if (!chuanNgay(d.ngay)) throw new Error('Vui lòng chọn Ngày hợp lệ.');
  if (!chuoi(d.noiDung)) throw new Error('Vui lòng nhập Nội dung công việc.');

  const nddList = await danhSachCauHinh(db, 'nguoi_dan_dat');
  const nguoiPhuTrach = chuoi(d.nguoiPhuTrach);
  if (nguoiPhuTrach && nddList.length && !nddList.includes(nguoiPhuTrach)) {
    throw new Error('"Người phụ trách": "' + nguoiPhuTrach +
      '" không có trong danh sách Người dẫn dắt (tab Config).');
  }
  for (const ten of tachThamGia(d.nguoiThamGia)) {
    if (nddList.length && !nddList.includes(ten)) {
      throw new Error('"Người tham gia": "' + ten +
        '" không có trong danh sách Người dẫn dắt (tab Config).');
    }
  }

  const khuVuc = chuoi(d.khuVuc);
  if (khuVuc) {
    const kvList = await danhSachCauHinh(db, 'khu_vuc');
    if (kvList.length && !kvList.includes(khuVuc)) throw new Error('Khu vực không hợp lệ.');
  }

  const trangThai = chuoi(d.trangThai);
  if (trangThai && !LICH_TRANG_THAI_LIST.includes(trangThai)) {
    throw new Error('Trạng thái không hợp lệ.');
  }
}

/** Gom dữ liệu form thành đúng bộ giá trị để ghi vào 9 cột của bảng. */
function giaTriLich(data) {
  const d = data || {};
  return [
    chuanNgay(d.ngay),
    chuoi(d.gioBatDau),
    chuoi(d.gioKetThuc),
    chuoi(d.noiDung),
    chuoi(d.nguoiPhuTrach),
    chuoi(d.khuVuc),
    chuoi(d.diaDiem),
    chuoi(d.trangThai) || LICH_TRANG_THAI_LIST[0],
    tachThamGia(d.nguoiThamGia).join(', '),
  ];
}

// ---------------------------------------------------------------------
// THÔNG BÁO TELEGRAM
// Bản cũ dùng UrlFetchApp + Script Properties. Ở Worker thì dùng fetch() và
// đọc token từ BIẾN MÔI TRƯỜNG env.TELEGRAM_BOT_TOKEN / env.TELEGRAM_CHAT_ID.
// Nếu hai biến này chưa được cấu hình -> hàm tự lặng lẽ bỏ qua, TUYỆT ĐỐI
// không ném lỗi làm hỏng việc lưu lịch.
// ---------------------------------------------------------------------

/** Thay dấu <, >, & để tin nhắn HTML của Telegram không bị gãy định dạng. */
function thoatHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function guiTelegram(env, noiDung) {
  const token = env && env.TELEGRAM_BOT_TOKEN;
  const chatId = env && env.TELEGRAM_CHAT_ID;
  // Chưa khai báo token/chat id -> im lặng bỏ qua, coi như không có gì xảy ra.
  if (!token || !chatId) return;

  await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: noiDung, parse_mode: 'HTML' }),
  });
}

/**
 * Gửi thông báo CHẠY NGẦM: không await, nên người dùng không phải chờ Telegram
 * mới thấy "Đã lưu" — phản hồi trả về ngay, việc gửi tin chạy song song sau đó.
 * Mọi lỗi đều bị nuốt để không ảnh hưởng việc lưu lịch.
 *
 * `ctx` là ExecutionContext của Cloudflare (tham số thứ 3 của fetch(), xem
 * index.js). Việc "chạy ngầm sau khi đã trả lời" BẮT BUỘC phải đăng ký qua
 * ctx.waitUntil(...) thì Cloudflare mới giữ Worker sống đủ lâu để gửi xong —
 * không đăng ký thì Cloudflare có thể cắt ngang bất cứ lúc nào ngay sau khi
 * trả lời xong, tin nhắn gửi dở có thể không tới. Có ctx thì luôn dùng.
 */
function guiTelegramNgam(ctx, env, noiDung) {
  try {
    const viec = guiTelegram(env, noiDung).catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(viec);
  } catch {
    // Kệ — thông báo hỏng thì thôi, dữ liệu lịch vẫn phải được lưu.
  }
}

/** Các dòng "thông tin buổi học" dùng chung cho cả 3 loại tin (thêm/sửa/xóa). */
function dungThongTinLich(data) {
  const d = data || {};
  const gio = chuoi(d.gioBatDau) + (chuoi(d.gioKetThuc) ? ' - ' + chuoi(d.gioKetThuc) : '');
  const thamGia = tachThamGia(d.nguoiThamGia).join(', ');
  const khuVuc = chuoi(d.khuVuc);
  const phuTrach = chuoi(d.nguoiPhuTrach);
  const lines = [
    '⏰ Thời gian: ' + ngayVNCoThu(d.ngay),
    '⏳ Thời lượng: ' + gio,
    '✅ Nội dung: ' + thoatHtml(chuoi(d.noiDung)),
  ];
  if (khuVuc) lines.push('🗺️ Khu vực: ' + thoatHtml(khuVuc));
  if (phuTrach) lines.push('👤 Phụ trách: ' + thoatHtml(phuTrach));
  lines.push(
    '🖥️ Địa điểm: ' + thoatHtml(chuoi(d.diaDiem)),
    '🧑‍🧑‍🧒 Tham gia: ' + thoatHtml(thamGia)
  );
  return lines;
}

function tinLich(tieuDe, data) {
  return ['Cpn các Ace ạ ~~', '', tieuDe, '']
    .concat(dungThongTinLich(data))
    .concat(['', 'Xin cảm ơn', '', 'CPN'])
    .join('\n');
}

// ---------------------------------------------------------------------
// CÁC HÀM GIAO DIỆN GỌI
// ---------------------------------------------------------------------

/**
 * Thêm một công việc mới.
 * Giao diện gọi: addLichEvent(data)
 */
export async function addLichEvent({ db, env, ctx }, data) {
  await kiemTraDuLieuLich(db, data);
  const v = giaTriLich(data);

  await db.run(
    `INSERT INTO lich_lam_viec
       (ngay, gio_bat_dau, gio_ket_thuc, noi_dung, nguoi_phu_trach,
        khu_vuc, dia_diem, trang_thai, nguoi_tham_gia)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    v
  );

  // Lấy lại id vừa sinh để trả về (giao diện gọi loadLichTuan() ngay sau đó
  // nên không bắt buộc, nhưng có sẵn thì tiện cho việc kiểm thử).
  const moi = await db.first(
    `SELECT id FROM lich_lam_viec
      WHERE ngay = ? AND noi_dung = ?
      ORDER BY id DESC LIMIT 1`,
    [v[0], v[3]]
  );

  guiTelegramNgam(ctx, env, tinLich('Xin gửi thông tin lớp học Kinh Thánh: ', data));
  return { success: true, row: moi ? moi.id : null };
}

/**
 * Sửa một công việc đã có.
 * Giao diện gọi: updateLichEvent(row, data) — `row` chính là `id` công việc.
 */
export async function updateLichEvent({ db, env, ctx }, row, data) {
  const id = Number(row);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Không rõ cần sửa công việc nào — vui lòng tải lại trang.');
  }
  await kiemTraDuLieuLich(db, data);

  const dangCo = await db.first('SELECT id FROM lich_lam_viec WHERE id = ?', [id]);
  if (!dangCo) throw new Error('Không tìm thấy công việc cần sửa (có thể đã bị xóa).');

  const v = giaTriLich(data);
  await db.run(
    `UPDATE lich_lam_viec SET
       ngay = ?, gio_bat_dau = ?, gio_ket_thuc = ?, noi_dung = ?,
       nguoi_phu_trach = ?, khu_vuc = ?, dia_diem = ?, trang_thai = ?,
       nguoi_tham_gia = ?
     WHERE id = ?`,
    [...v, id]
  );

  // Gửi thông tin MỚI NHẤT (sau khi sửa), không so cũ/mới cho đỡ rối.
  guiTelegramNgam(ctx, env, tinLich('✏️ Thông tin lớp học Kinh Thánh đã được CẬP NHẬT: ', data));
  return { success: true };
}

/**
 * Xóa một công việc.
 * Giao diện gọi: deleteLichEvent(row) — `row` chính là `id` công việc.
 */
export async function deleteLichEvent({ db, env, ctx }, row) {
  const id = Number(row);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Không rõ cần xóa công việc nào — vui lòng tải lại trang.');
  }

  // Đọc TRƯỚC khi xóa để còn nội dung mà gửi thông báo.
  const cu = await db.first(
    `SELECT ngay, gio_bat_dau, gio_ket_thuc, noi_dung, nguoi_phu_trach,
            khu_vuc, dia_diem, nguoi_tham_gia
       FROM lich_lam_viec WHERE id = ?`,
    [id]
  );
  // Không còn thì coi như đã xóa rồi — không báo lỗi để giao diện khỏi nhấp
  // nháy khi hai người cùng bấm Xóa một lúc.
  if (!cu) return { success: true };

  await db.run('DELETE FROM lich_lam_viec WHERE id = ?', [id]);

  if (chuoi(cu.noi_dung)) {
    guiTelegramNgam(ctx, env, tinLich('❌ Lớp học Kinh Thánh sau đã bị HỦY (xóa khỏi lịch): ', {
      ngay: cu.ngay,
      gioBatDau: cu.gio_bat_dau,
      gioKetThuc: cu.gio_ket_thuc,
      noiDung: cu.noi_dung,
      nguoiPhuTrach: cu.nguoi_phu_trach,
      khuVuc: cu.khu_vuc,
      diaDiem: cu.dia_diem,
      nguoiThamGia: cu.nguoi_tham_gia,
    }));
  }
  return { success: true };
}

/**
 * Toàn bộ công việc trong 1 tuần = 7 ngày liên tiếp tính từ `ngayBatDau`.
 * Giao diện gọi: getLichTuan("yyyy-MM-dd") — luôn là ngày CHỦ NHẬT đầu tuần
 * (index.html dùng sundayOf_() rồi ymd_()), nhưng hàm này không bắt buộc phải
 * là Chủ nhật, cứ đếm đủ 7 ngày kể từ ngày được đưa vào.
 *
 * Trả về mảng đã sắp theo Ngày rồi Giờ bắt đầu, mỗi phần tử:
 *   { row, ngay, gioBatDau, gioKetThuc, noiDung, nguoiPhuTrach,
 *     khuVuc, diaDiem, trangThai, nguoiThamGia }
 * trong đó `row` = id bản ghi (xem ghi chú đầu file), `ngay` dạng "yyyy-MM-dd"
 * đúng như giao diện đang so sánh, `nguoiThamGia` là chuỗi "A, B".
 */
export async function getLichTuan({ db }, ngayBatDau) {
  const dau = chuanNgay(ngayBatDau);
  if (!dau) throw new Error('Ngày bắt đầu tuần không hợp lệ.');
  const cuoi = congNgay(dau, 6);

  const rows = await db.all(
    `SELECT id, ngay, gio_bat_dau, gio_ket_thuc, noi_dung, nguoi_phu_trach,
            khu_vuc, dia_diem, trang_thai, nguoi_tham_gia
       FROM lich_lam_viec
      WHERE ngay >= ? AND ngay <= ? AND TRIM(noi_dung) <> ''
      ORDER BY ngay, COALESCE(gio_bat_dau, ''), id`,
    [dau, cuoi]
  );

  return rows.map((r) => ({
    row: r.id, // = id bản ghi; giao diện gửi lại đúng số này khi Sửa/Xóa
    ngay: chuanNgay(r.ngay),
    gioBatDau: r.gio_bat_dau || '',
    gioKetThuc: r.gio_ket_thuc || '',
    noiDung: r.noi_dung || '',
    nguoiPhuTrach: r.nguoi_phu_trach || '',
    khuVuc: r.khu_vuc || '',
    diaDiem: r.dia_diem || '',
    trangThai: r.trang_thai || LICH_TRANG_THAI_LIST[0],
    nguoiThamGia: r.nguoi_tham_gia || '',
  }));
}
