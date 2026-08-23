// =====================================================================
// ĐIỂM DANH CÔNG VIỆC — thêm 23/08/2026 theo yêu cầu anh Rise.
//
// Chép lại đúng sheet "CVTL PN — Tháng 8/2026" anh Rise đang dùng (ảnh chụp
// gửi 23/08/2026), nằm TRONG tab con "Trudo" của từng Khu vực:
//
//   STT | Họ và Tên | Thời Gian | Tuần 1 (CN..T7) | ... | Tuần 6 (CN..T7) | Tổng
//                     Sáng
//                     Chiều
//                     Tối
//
// ⚠️ Những điểm đã CHỐT VỚI ANH RISE (qua AskUserQuestion, 23/08/2026) —
// đọc kỹ trước khi định sửa gì ở đây:
//   1. Danh sách người **DÙNG CHUNG bảng Điểm danh** của khu vực đó
//      (`diem_danh_roster`), KHÔNG có danh sách riêng. Anh Rise: "chuyển tab
//      đó vào tab trudo trong mỗi khu vực, quản lý thành viên sẽ dễ dàng
//      hơn". Vì vậy ở đây KHÔNG có hàm thêm/xoá/đổi thứ tự người — làm việc
//      đó ở bảng Điểm danh, bên này tự hiện theo.
//   2. Mỗi người ĐÚNG 3 dòng Sáng / Chiều / Tối (cột "Thời Gian" của sheet).
//   3. Hiện **CẢ 6 TUẦN cùng lúc** (kéo ngang), không bấm chọn từng tuần.
//   4. Ô ngày cho gõ **TỰ DO** (số, chữ, mã... đều được) — cố ý KHÔNG hiểu ý
//      nghĩa con số, vì anh Rise chọn "cứ cho gõ tự do, không cần hiểu".
//   5. Cột "Tổng": mỗi DÒNG (Sáng/Chiều/Tối) có một số = **đếm số ô đã nhập
//      của buổi đó trong CẢ THÁNG**; và mỗi NGƯỜI có một số tổng = cộng 3
//      buổi. Đã đối chiếu đúng với sheet thật của anh Rise (NT Ngân: Sáng 4,
//      Chiều 4, Tối 6, tổng người 14).
//   6. KHÔNG có cột Ghi Chú (anh Rise chọn bỏ).
//
// Ô để trống thì XOÁ hẳn dòng, nên "Tổng" chỉ cần COUNT — xem migrations.
// =====================================================================

import { chuoi, batBuoc, thangHopLe } from '../tien-ich.js';

/** 3 dòng của mỗi người, đúng thứ tự hiển thị (cột "Thời Gian" của sheet). */
export const CV_BUOI_LIST = ['sang', 'chieu', 'toi'];
/** 7 cột ngày trong tuần, đúng thứ tự sheet: Chủ nhật đứng đầu. */
export const CV_NGAY_LIST = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
/** Sheet có sẵn Tuần 1..6 (tháng nhiều nhất chạm 6 tuần lịch). */
export const CV_SO_TUAN = 6;

function kiemThang(thang) {
  const t = chuoi(thang);
  // `thangHopLe` dùng chung chỉ kiểm ĐỊNH DẠNG yyyy-MM, KHÔNG kiểm số tháng
  // có nằm trong 01..12 hay không — nên "2026-13" vẫn lọt (bộ kiểm thử của
  // tính năng này đã bắt được). Kiểm chặt thêm ở đây, cố ý KHÔNG sửa hàm
  // dùng chung để không ảnh hưởng các phần đang chạy ổn định.
  const ok = thangHopLe(t) && Number(t.slice(5, 7)) >= 1 && Number(t.slice(5, 7)) <= 12;
  if (!ok) throw new Error('Tháng không hợp lệ: "' + t + '" (phải dạng yyyy-MM, tháng từ 01 đến 12).');
  return t;
}

function kiemTuan(tuan) {
  const n = Number(tuan);
  if (!Number.isInteger(n) || n < 1 || n > CV_SO_TUAN) {
    throw new Error('Tuần không hợp lệ: "' + tuan + '" (phải từ 1 đến ' + CV_SO_TUAN + ').');
  }
  return n;
}

function kiemBuoi(buoi) {
  const b = chuoi(buoi);
  if (!CV_BUOI_LIST.includes(b)) {
    throw new Error('Buổi không hợp lệ: "' + b + '" (phải là sang/chieu/toi).');
  }
  return b;
}

function kiemNgay(ngay) {
  const n = chuoi(ngay);
  if (!CV_NGAY_LIST.includes(n)) {
    throw new Error('Ngày không hợp lệ: "' + n + '" (phải là ' + CV_NGAY_LIST.join('/') + ').');
  }
  return n;
}

/** Số ô đã nhập của 1 người trong 1 tháng, tách theo từng buổi + tổng cộng. */
async function demCuaNguoi_(db, khuVuc, ten, thang) {
  const rows = await db.all(
    'SELECT buoi, COUNT(*) AS n FROM cv_cong_viec WHERE khu_vuc=? AND ten=? AND thang=? GROUP BY buoi',
    [khuVuc, ten, thang]
  );
  const tongBuoi = {};
  for (const b of CV_BUOI_LIST) tongBuoi[b] = 0;
  let tongNguoi = 0;
  for (const r of rows) {
    const b = chuoi(r.buoi);
    const n = Number(r.n) || 0;
    if (tongBuoi[b] === undefined) continue;   // buổi lạ (dữ liệu cũ) -> bỏ qua
    tongBuoi[b] = n;
    tongNguoi += n;
  }
  return { tongBuoi, tongNguoi };
}

/**
 * Toàn bộ bảng của MỘT Khu vực trong MỘT tháng (cả 6 tuần):
 *   { khuVuc, thang, thanhVien: [ {
 *       ten,
 *       o: { sang: { "1-CN": "105", "4-T3": "127" }, chieu: {...}, toi: {...} },
 *       tongBuoi: { sang: 4, chieu: 4, toi: 6 },
 *       tongNguoi: 14
 *     } ] }
 * Khoá ô là "<tuần>-<ngày>" cho gọn (giao diện ghép lại đúng ô cần vẽ).
 *
 * Danh sách người lấy từ `diem_danh_roster` của ĐÚNG khu vực đó, giữ nguyên
 * thứ tự đang hiển thị ở bảng Điểm danh (thu_tu, id) — để hai bảng luôn cùng
 * một thứ tự, nhìn không bị lệch.
 */
export async function getCVCongViec({ db }, khuVuc, thang) {
  const kv = batBuoc(khuVuc, 'Khu vực');
  const t = kiemThang(thang);

  const [roster, oCell] = await Promise.all([
    db.all('SELECT ten FROM diem_danh_roster WHERE khu_vuc = ? ORDER BY thu_tu, id', [kv]),
    db.all(
      'SELECT ten, tuan, buoi, ngay, gia_tri FROM cv_cong_viec WHERE khu_vuc = ? AND thang = ?',
      [kv, t]
    ),
  ]);

  // Gom ô theo tên -> buổi -> "tuần-ngày"
  const bang = new Map();
  const dem = new Map();   // tên -> {sang,chieu,toi}
  for (const r of oCell) {
    const ten = chuoi(r.ten);
    const b = chuoi(r.buoi);
    if (!CV_BUOI_LIST.includes(b)) continue;
    if (!bang.has(ten)) bang.set(ten, {});
    const hop = bang.get(ten);
    if (!hop[b]) hop[b] = {};
    hop[b][Number(r.tuan) + '-' + chuoi(r.ngay)] = chuoi(r.gia_tri);

    if (!dem.has(ten)) dem.set(ten, { sang: 0, chieu: 0, toi: 0 });
    dem.get(ten)[b]++;
  }

  return {
    khuVuc: kv,
    thang: t,
    thanhVien: roster.map((r) => {
      const ten = chuoi(r.ten);
      const hop = bang.get(ten) || {};
      const o = {};
      for (const b of CV_BUOI_LIST) o[b] = hop[b] || {};
      const d = dem.get(ten) || { sang: 0, chieu: 0, toi: 0 };
      return { ten, o, tongBuoi: d, tongNguoi: d.sang + d.chieu + d.toi };
    }),
  };
}

/**
 * Lưu ĐÚNG 1 ô. Gõ rỗng (kể cả toàn dấu cách) = XOÁ dòng.
 * Trả về `tongBuoi` + `tongNguoi` MỚI của chính người đó, để giao diện cập
 * nhật ngay các ô "Tổng" mà không phải tải lại cả bảng.
 *
 * ⚠️ Cố ý KHÔNG kiểm tra người đó có trong `diem_danh_roster` hay không:
 * nếu ai đó bị xoá khỏi bảng Điểm danh thì dòng dữ liệu cũ vẫn nằm im trong
 * bảng này (không hiện ra, cũng không mất) — chuyển họ về lại khu vực/danh
 * sách là số cũ hiện lại đầy đủ. An toàn hơn là xoá theo.
 */
export async function saveCVCongViec({ db }, khuVuc, ten, thang, tuan, buoi, ngay, giaTri) {
  const kv = batBuoc(khuVuc, 'Khu vực');
  const tenTV = batBuoc(ten, 'Tên thành viên');
  const t = kiemThang(thang);
  const w = kiemTuan(tuan);
  const b = kiemBuoi(buoi);
  const n = kiemNgay(ngay);

  const v = chuoi(giaTri);
  if (v === '') {
    await db.run(
      'DELETE FROM cv_cong_viec WHERE khu_vuc=? AND ten=? AND thang=? AND tuan=? AND buoi=? AND ngay=?',
      [kv, tenTV, t, w, b, n]
    );
  } else {
    // Ghi đè an toàn nhờ khoá chính — hai người nhập cùng lúc không sinh dòng trùng.
    await db.run(
      `INSERT INTO cv_cong_viec (khu_vuc, ten, thang, tuan, buoi, ngay, gia_tri) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (khu_vuc, ten, thang, tuan, buoi, ngay) DO UPDATE SET gia_tri = excluded.gia_tri`,
      [kv, tenTV, t, w, b, n, v]
    );
  }
  const { tongBuoi, tongNguoi } = await demCuaNguoi_(db, kv, tenTV, t);
  return { success: true, tongBuoi, tongNguoi };
}
