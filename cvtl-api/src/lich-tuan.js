// =====================================================================
// LỊCH TUẦN CỦA MỘT THÁNG  (thêm 26/08/2026 — nền cho tab Báo cáo)
//
// Quy ước anh Rise chốt 25/08/2026:
//   - Tuần bắt đầu từ CHỦ NHẬT
//   - Tuần 1 = tuần CHỨA NGÀY 1 của tháng
//   - Ngày thuộc tháng TRƯỚC thì KHÔNG tính
//
// Ví dụ anh Rise nêu: "tuần 1 là 26/7 - 1/8 thì chỉ có thờ phượng thứ 7
// thôi, còn thứ 3 thì không đánh được vì thứ 3 là của tháng trước".
//
// ⚠️ VÌ SAO PHẢI CÓ FILE RIÊNG: bảng kiểm của tab Báo cáo chấm "đủ / thiếu"
// cho từng tuần. Tính sai lịch một ngày là báo THIẾU OAN cho cả phòng —
// mà báo thiếu oan thì người ta mất tin vào bảng kiểm, tính năng coi như
// hỏng dù mã chạy đúng.
//
// ⚠️ KHÔNG dùng new Date() theo múi giờ máy chủ. Cloudflare chạy giờ UTC,
// còn anh Rise ở UTC+7. Mọi phép tính ở đây dùng Date.UTC cho chắc.
// =====================================================================

/** Thứ trong tuần của một ngày (0 = Chủ nhật ... 6 = Thứ Bảy), tính theo UTC. */
export function thuTrongTuan(nam, thang, ngay) {
  return new Date(Date.UTC(nam, thang - 1, ngay)).getUTCDay();
}

/** Số ngày của một tháng. */
export function soNgayCuaThang(nam, thang) {
  return new Date(Date.UTC(nam, thang, 0)).getUTCDate();
}

/**
 * Chia một tháng thành các tuần (Chủ nhật -> Thứ Bảy).
 * Trả về mảng, mỗi phần tử:
 *   {
 *     tuan,          // 1..6
 *     tuNgay, denNgay,   // ngày ĐẦU/CUỐI còn THUỘC THÁNG này (số nguyên)
 *     ngayT3,        // ngày Thứ Ba thuộc tháng, 0 nếu không có
 *     ngayT7,        // ngày Thứ Bảy thuộc tháng, 0 nếu không có
 *     soNgay         // số ngày của tuần đó còn thuộc tháng
 *   }
 * Chỉ trả về những tuần CÓ ít nhất 1 ngày thuộc tháng.
 */
export function cacTuanCuaThang(thangKey) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(thangKey || ''));
  if (!m) return [];
  const nam = Number(m[1]);
  const thang = Number(m[2]);
  if (thang < 1 || thang > 12) return [];

  const soNgay = soNgayCuaThang(nam, thang);
  const thuNgay1 = thuTrongTuan(nam, thang, 1); // 0=CN
  const ds = [];

  for (let d = 1; d <= soNgay; d++) {
    // Tuần 1 chứa ngày 1. Ngày 1 nằm ở vị trí thuNgay1 trong tuần đó.
    const soTuan = Math.floor((d + thuNgay1 - 1) / 7) + 1;
    let t = ds[soTuan - 1];
    if (!t) {
      t = { tuan: soTuan, tuNgay: d, denNgay: d, ngayT3: 0, ngayT7: 0, soNgay: 0 };
      ds[soTuan - 1] = t;
    }
    t.denNgay = d;
    t.soNgay += 1;
    const thu = thuTrongTuan(nam, thang, d);
    if (thu === 2) t.ngayT3 = d; // Thứ Ba
    if (thu === 6) t.ngayT7 = d; // Thứ Bảy
  }
  return ds.filter(Boolean);
}

/** Một tuần cụ thể, hoặc null nếu tháng đó không có tuần ấy. */
export function tuanCuaThang(thangKey, tuan) {
  const t = Number(tuan);
  return cacTuanCuaThang(thangKey).find((x) => x.tuan === t) || null;
}

/**
 * Ngày 'yyyy-MM-dd' này rơi vào tuần thứ mấy của chính tháng nó?
 * Trả 0 nếu ngày không hợp lệ.
 */
export function tuanCuaNgay(ngayKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ngayKey || ''));
  if (!m) return 0;
  const nam = Number(m[1]);
  const thang = Number(m[2]);
  const ngay = Number(m[3]);
  if (thang < 1 || thang > 12) return 0;
  if (ngay < 1 || ngay > soNgayCuaThang(nam, thang)) return 0;
  const thuNgay1 = thuTrongTuan(nam, thang, 1);
  return Math.floor((ngay + thuNgay1 - 1) / 7) + 1;
}

/**
 * Trạng thái thời gian của một tuần so với HÔM NAY.
 *   'da_qua'    — tuần đã kết thúc (kể cả 2 ngày ân hạn thì mới tính trễ)
 *   'dang_dien' — tuần đang diễn ra
 *   'chua_toi'  — tuần chưa bắt đầu
 * `homNayKey` dạng 'yyyy-MM-dd'.
 */
export function trangThaiTuan(thangKey, tuan, homNayKey) {
  const t = tuanCuaThang(thangKey, tuan);
  if (!t) return 'chua_toi';
  const dauTuan = thangKey + '-' + String(t.tuNgay).padStart(2, '0');
  const cuoiTuan = thangKey + '-' + String(t.denNgay).padStart(2, '0');
  const h = String(homNayKey || '');
  if (h < dauTuan) return 'chua_toi';
  if (h > cuoiTuan) return 'da_qua';
  return 'dang_dien';
}

/**
 * Một BUỔI (thứ Ba hoặc thứ Bảy) của tuần này đã tới ngày chưa?
 * ⚠️ Quan trọng: buổi CHƯA TỚI thì KHÔNG được coi là "thiếu" — nếu không
 * bảng kiểm sẽ báo thiếu oan cho ngày chưa đến (phát hiện 26/08/2026 khi
 * đọc số thật: hôm đó là thứ Tư 26/8, thứ Bảy của tuần là 29/8).
 * Trả: 'khong_co' | 'chua_toi' | 'da_qua'
 */
export function trangThaiBuoi(thangKey, ngayTrongThang, homNayKey) {
  const d = Number(ngayTrongThang);
  if (!d) return 'khong_co';
  const key = thangKey + '-' + String(d).padStart(2, '0');
  return String(homNayKey || '') < key ? 'chua_toi' : 'da_qua';
}
