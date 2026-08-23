// =====================================================================
// ĐIỂM DANH CÔNG VIỆC — thêm 23/08/2026 theo yêu cầu anh Rise.
//
// Chép lại bố cục "Sổ ghi chép hoạt động Hội Thánh" của WISBranch, với 3
// điểm khác đã CHỐT VỚI ANH RISE (qua AskUserQuestion, 23/08/2026):
//   1. BỎ cột "Số sự sống".
//   2. Danh sách thành viên là RIÊNG (bảng `cv_thanh_vien`), có ô tự thêm
//      người mới — cố ý KHÔNG dùng chung `diem_danh_roster`, để thêm/xoá
//      bên này không đụng gì tới bảng Điểm danh đang dùng hằng tuần.
//   3. Cột "Tổng cộng" TỰ ĐỘNG tính = ĐẾM SỐ Ô ĐÃ NHẬP trong tháng (mỗi ô
//      đã nhập = 1 lần). Anh Rise chọn BỎ HẲN 5 cột phân loại (Truyền đạo /
//      Giáo dục / Thờ phượng / Hành chính / Xây dựng) của sổ gốc, chỉ giữ
//      "Tổng cộng" — nên ở đây KHÔNG có bất kỳ chỗ nào phải hiểu ý nghĩa
//      con số trong ô; ô cho gõ TỰ DO (số, chữ, mã... đều được).
//
// 3 dòng "Phân loại" 1/2/3 của sổ gốc chính là SÁNG / CHIỀU / TỐI
// (anh Rise xác nhận) -> mỗi thành viên LUÔN có đúng 3 dòng, không thêm bớt.
//
// ⚠️ Vì sao khoá theo `id` chứ không theo tên: hai người hoàn toàn có thể
// trùng tên. Các bảng cũ khoá theo (khu_vuc, ten) từng gây đúng kiểu lỗi
// "trùng khoá thì âm thầm bỏ qua" (xem khu-vuc.js, chuyenMotBang_). Bảng
// mới làm lại cho chắc ngay từ đầu.
// =====================================================================

import { chuoi, batBuoc, thangHopLe, thangTruoc } from '../tien-ich.js';

// 3 dòng của mỗi người (đúng thứ tự hiển thị).
export const CV_BUOI_LIST = ['sang', 'chieu', 'toi'];
// 7 cột ngày trong tuần (đúng thứ tự sổ gốc: Chủ nhật đứng đầu).
export const CV_NGAY_LIST = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
// Số tuần tối đa trong 1 tháng (sổ gốc có sẵn ô Tuần 1..6).
export const CV_SO_TUAN = 6;

function kiemThang(thang) {
  const t = chuoi(thang);
  // `thangHopLe` dùng chung chỉ kiểm ĐỊNH DẠNG yyyy-MM, không kiểm số tháng
  // có nằm trong 1..12 hay không — nên "2026-13" vẫn lọt (bộ kiểm thử của
  // tính năng này đã bắt được). Ở đây kiểm chặt thêm, cố ý KHÔNG sửa hàm
  // dùng chung để không ảnh hưởng các phần đang chạy ổn định.
  const thang12 = thangHopLe(t) && Number(t.slice(5, 7)) >= 1 && Number(t.slice(5, 7)) <= 12;
  if (!thang12) throw new Error('Tháng không hợp lệ: "' + t + '" (phải dạng yyyy-MM, tháng từ 01 đến 12).');
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

/** Đưa 1 dòng CSDL về đúng hình dạng giao diện mong đợi. */
function goiThanhVien(r) {
  return {
    id: Number(r.id),
    ten: chuoi(r.ten),
    gioiTinh: chuoi(r.gioi_tinh),
    banNganh: chuoi(r.ban_nganh),
    diaVuc: chuoi(r.dia_vuc),
    khuVuc: chuoi(r.khu_vuc),
    chucTrach: chuoi(r.chuc_trach),
    chucPhan: chuoi(r.chuc_phan),
    thuTu: Number(r.thu_tu) || 0,
  };
}

async function docDanhSach_(db) {
  const rows = await db.all(
    'SELECT id, ten, gioi_tinh, ban_nganh, dia_vuc, khu_vuc, chuc_trach, chuc_phan, thu_tu FROM cv_thanh_vien ORDER BY thu_tu, id'
  );
  return rows.map(goiThanhVien);
}

/** Đếm số ô đã nhập của MỌI người trong 1 tháng -> Map(id -> số ô). */
async function demTheoThang_(db, thang) {
  const rows = await db.all(
    'SELECT thanh_vien_id, COUNT(*) AS n FROM cv_diem_danh WHERE thang = ? GROUP BY thanh_vien_id',
    [thang]
  );
  const m = new Map();
  for (const r of rows) m.set(Number(r.thanh_vien_id), Number(r.n) || 0);
  return m;
}

/**
 * Dữ liệu để vẽ bảng của MỘT tuần:
 *   { thang, tuan, thanhVien: [ { ...thông tin người,
 *       o: { sang: {CN:'127',...}, chieu: {...}, toi: {...} },
 *       tongCong,          // số ô đã nhập trong CẢ THÁNG đang xem
 *       tongThangTruoc } ] }
 * Cố ý trả luôn danh sách người (không cần gọi thêm 1 hàm nữa) để giao diện
 * chỉ tốn ĐÚNG 1 lượt gọi mạng mỗi lần đổi tháng/tuần.
 */
export async function getCVDiemDanh({ db }, thang, tuan) {
  const t = kiemThang(thang);
  const w = kiemTuan(tuan);
  const tTruoc = thangTruoc(t);

  const [ds, oTuan, demNay, demTruoc] = await Promise.all([
    docDanhSach_(db),
    db.all(
      'SELECT thanh_vien_id, buoi, ngay, gia_tri FROM cv_diem_danh WHERE thang = ? AND tuan = ?',
      [t, w]
    ),
    demTheoThang_(db, t),
    demTheoThang_(db, tTruoc),
  ]);

  const theoNguoi = new Map();
  for (const r of oTuan) {
    const id = Number(r.thanh_vien_id);
    if (!theoNguoi.has(id)) theoNguoi.set(id, {});
    const hop = theoNguoi.get(id);
    const b = chuoi(r.buoi);
    if (!hop[b]) hop[b] = {};
    hop[b][chuoi(r.ngay)] = chuoi(r.gia_tri);
  }

  return {
    thang: t,
    tuan: w,
    thangTruoc: tTruoc,
    thanhVien: ds.map((tv) => {
      const hop = theoNguoi.get(tv.id) || {};
      const o = {};
      for (const b of CV_BUOI_LIST) o[b] = hop[b] || {};
      return { ...tv, o, tongCong: demNay.get(tv.id) || 0, tongThangTruoc: demTruoc.get(tv.id) || 0 };
    }),
  };
}

/** Thêm 1 thành viên mới vào CUỐI danh sách. Chỉ bắt buộc có Tên. */
export async function addCVThanhVien({ db }, tv) {
  const d = tv || {};
  const ten = batBuoc(d.ten, 'Tên thành viên');
  const max = await db.first('SELECT COALESCE(MAX(thu_tu), 0) AS m FROM cv_thanh_vien');
  const thuTu = (Number(max && max.m) || 0) + 1;
  const kq = await db.run(
    `INSERT INTO cv_thanh_vien (ten, gioi_tinh, ban_nganh, dia_vuc, khu_vuc, chuc_trach, chuc_phan, thu_tu)
     VALUES (?,?,?,?,?,?,?,?)`,
    [ten, chuoi(d.gioiTinh), chuoi(d.banNganh), chuoi(d.diaVuc), chuoi(d.khuVuc),
     chuoi(d.chucTrach), chuoi(d.chucPhan), thuTu]
  );
  const id = Number(kq && kq.meta && kq.meta.last_row_id) || 0;
  return { success: true, id, ten, thuTu };
}

/**
 * Sửa thông tin 1 thành viên (Tên / Giới tính / Ban ngành / Địa vực / Khu
 * vực / Chức trách / Chức phận). Chỉ sửa những trường ĐƯỢC GỬI LÊN — trường
 * nào không gửi thì giữ nguyên, để giao diện có thể lưu từng ô một khi người
 * dùng rời ô, không phải gửi lại cả dòng.
 */
export async function updateCVThanhVien({ db }, id, tv) {
  const ma = Number(id);
  if (!ma) throw new Error('Thiếu mã thành viên.');
  const cu = await db.first('SELECT id FROM cv_thanh_vien WHERE id = ?', [ma]);
  if (!cu) throw new Error('Không tìm thấy thành viên (mã ' + ma + ').');

  const d = tv || {};
  const anhXa = {
    ten: 'ten', gioiTinh: 'gioi_tinh', banNganh: 'ban_nganh', diaVuc: 'dia_vuc',
    khuVuc: 'khu_vuc', chucTrach: 'chuc_trach', chucPhan: 'chuc_phan',
  };
  const cot = [];
  const giaTri = [];
  for (const [khoa, ten] of Object.entries(anhXa)) {
    if (d[khoa] === undefined) continue;
    if (khoa === 'ten' && !chuoi(d.ten)) throw new Error('Tên thành viên không được để trống.');
    cot.push(ten + ' = ?');
    giaTri.push(chuoi(d[khoa]));
  }
  if (!cot.length) return { success: true, khongDoi: true };
  await db.run('UPDATE cv_thanh_vien SET ' + cot.join(', ') + ' WHERE id = ?', [...giaTri, ma]);
  return { success: true, id: ma };
}

/** Xoá hẳn 1 thành viên + TOÀN BỘ ô đã nhập của người đó (mọi tháng). */
export async function deleteCVThanhVien({ db }, id) {
  const ma = Number(id);
  if (!ma) throw new Error('Thiếu mã thành viên.');
  const cu = await db.first('SELECT ten FROM cv_thanh_vien WHERE id = ?', [ma]);
  if (!cu) throw new Error('Không tìm thấy thành viên (mã ' + ma + ').');
  await db.batch([
    { sql: 'DELETE FROM cv_diem_danh WHERE thanh_vien_id = ?', params: [ma] },
    { sql: 'DELETE FROM cv_thanh_vien WHERE id = ?', params: [ma] },
  ]);
  return { success: true, id: ma, ten: chuoi(cu.ten) };
}

/** Đổi chỗ 1 thành viên lên/xuống 1 bậc trong danh sách. */
export async function moveCVThanhVien({ db }, id, huong) {
  const ma = Number(id);
  if (!ma) throw new Error('Thiếu mã thành viên.');
  const h = chuoi(huong);
  if (h !== 'len' && h !== 'xuong') throw new Error('Hướng không hợp lệ (phải là "len" hoặc "xuong").');

  const ds = await docDanhSach_(db);
  const i = ds.findIndex((x) => x.id === ma);
  if (i < 0) throw new Error('Không tìm thấy thành viên (mã ' + ma + ').');
  const j = h === 'len' ? i - 1 : i + 1;
  if (j < 0 || j >= ds.length) return { success: true, khongDoi: true };

  // Đánh lại thu_tu 1..n cho TOÀN BỘ danh sách sau khi hoán đổi — chắc chắn
  // đúng kể cả khi thu_tu cũ bị trùng hoặc có khoảng trống.
  const moi = ds.slice();
  const tmp = moi[i]; moi[i] = moi[j]; moi[j] = tmp;
  await db.batch(moi.map((x, k) => ({
    sql: 'UPDATE cv_thanh_vien SET thu_tu = ? WHERE id = ?', params: [k + 1, x.id],
  })));
  return { success: true, id: ma, viTriMoi: j + 1 };
}

/**
 * Lưu ĐÚNG 1 ô. Gõ rỗng = XOÁ dòng (xem giải thích ở migrations).
 * Trả về `tongCong` mới của chính người đó để giao diện cập nhật ngay cột
 * "Tổng cộng" mà không phải tải lại cả bảng.
 */
export async function saveCVCell({ db }, id, thang, tuan, buoi, ngay, giaTri) {
  const ma = Number(id);
  if (!ma) throw new Error('Thiếu mã thành viên.');
  const t = kiemThang(thang);
  const w = kiemTuan(tuan);
  const b = kiemBuoi(buoi);
  const n = kiemNgay(ngay);
  const co = await db.first('SELECT id FROM cv_thanh_vien WHERE id = ?', [ma]);
  if (!co) throw new Error('Không tìm thấy thành viên (mã ' + ma + ').');

  const v = chuoi(giaTri);
  if (v === '') {
    await db.run(
      'DELETE FROM cv_diem_danh WHERE thanh_vien_id=? AND thang=? AND tuan=? AND buoi=? AND ngay=?',
      [ma, t, w, b, n]
    );
  } else {
    // Ghi đè an toàn nhờ khoá chính — hai người nhập cùng lúc không sinh dòng trùng.
    await db.run(
      `INSERT INTO cv_diem_danh (thanh_vien_id, thang, tuan, buoi, ngay, gia_tri) VALUES (?,?,?,?,?,?)
       ON CONFLICT (thanh_vien_id, thang, tuan, buoi, ngay) DO UPDATE SET gia_tri = excluded.gia_tri`,
      [ma, t, w, b, n, v]
    );
  }
  const dem = await db.first(
    'SELECT COUNT(*) AS n FROM cv_diem_danh WHERE thanh_vien_id = ? AND thang = ?', [ma, t]
  );
  return { success: true, tongCong: Number(dem && dem.n) || 0 };
}
