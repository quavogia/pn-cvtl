// =====================================================================
// Mục tiêu (Khu vực + Cá nhân) và Giáo dục thành viên.
//
// Ba nhóm việc trong file này:
//   A. Mục tiêu Khu vực  -> bảng muc_tieu_kv
//   B. Mục tiêu cá nhân  -> bảng muc_tieu_ca_nhan
//   C. Giáo dục thành viên (EDU LMS + Trực tuyến 127) -> bảng giao_duc_thanh_vien
//
// Lưu ý quan trọng cho người đọc sau này:
//   * Ở bảng cũ trên Google Sheets, "danh sách thành viên" của tab Giáo dục
//     KHÔNG được lưu riêng — nó được SUY RA từ mọi dòng số liệu đã từng nhập
//     (ở bất kỳ tháng nào). Bảng mới giao_duc_thanh_vien cũng gộp như vậy:
//     khoá là (thang, khu_vuc, ten, tuan). Nên muốn một người "có tên" trong
//     danh sách thì phải tồn tại ít nhất 1 dòng tuần của người đó.
//     -> Vì thế addGiaoDucMember luôn tạo sẵn 1 dòng trống (tháng hiện tại,
//        Tuần 1) và saveGiaoDucWeek KHÔNG BAO GIỜ xoá dòng dù cả 2 ô đều rỗng.
//        Nếu xoá, người đó sẽ biến mất khỏi danh sách — đúng thứ ta phải tránh.
//   * EDU LMS bây giờ là TRẠNG THÁI (chuỗi: '' / 'Đang làm' / 'Hoàn thành'),
//     không còn là phần trăm như bản Apps Script cũ trong code_deploy.txt.
//     Trực tuyến 127 là SỐ NGÀY (số nguyên). Giao diện index.html đang hiển
//     thị đúng như vậy, mà giao diện là "hợp đồng" nên ta theo giao diện.
//   * Ở nhóm hàm này không có chỗ nào dùng "số dòng" (row) làm định danh —
//     mọi thứ đều tra theo (tháng, khu vực, tên, tuần) nên không phải đổi gì.
// =====================================================================

import { KHU_VUC_LIST } from '../hang-so.js';
import {
  kiemTraThang, thangTruoc, thangHienTai, thangCuaNgay, chanThangDaQua,
  phanTram, laHuuHieu, laBT, chuoi, soNguyen, batBuoc,
} from '../tien-ich.js';

// ---------------------------------------------------------------------
// Tiện ích nội bộ (chỉ dùng trong file này)
// ---------------------------------------------------------------------

/**
 * Có chặn sửa dữ liệu của tháng đã qua hay không.
 * Bản Apps Script cũ (assertNotPastMonth_) đã CỐ Ý mở khoá — phần thân hàm bị
 * chú thích hết — để Trưởng phòng nhập bù số liệu tháng cũ (TP, Giáo dục, Mục
 * tiêu). Giao diện cũng để ô chọn tháng tự do, không giới hạn tháng nhỏ nhất.
 * Vậy nên ở đây giữ nguyên trạng thái MỞ. Muốn khoá lại sau này thì đổi hằng
 * số dưới đây thành true, không cần sửa gì thêm.
 */
const CHAN_SUA_THANG_CU = false;

/** Chặn (hoặc không) việc sửa dữ liệu của tháng đã qua. */
function chanNeuCanThiet(thang) {
  if (CHAN_SUA_THANG_CU) chanThangDaQua(thang);
}

/** So tên tiếng Việt cho đúng thứ tự bảng chữ cái (có dấu). */
function soSanhTiengViet(a, b) {
  return String(a).localeCompare(String(b), 'vi');
}

/**
 * Danh sách Khu vực để lặp qua khi gom dữ liệu "tất cả Khu vực".
 * Bản cũ lấy từ tab Config; ở đây đọc bảng config_list, nếu chưa có gì thì
 * dùng tạm danh sách cứng trong hang-so.js.
 */
async function layDanhSachKhuVuc(db) {
  const rows = await db.all(
    "SELECT gia_tri FROM config_list WHERE loai = 'khu_vuc' ORDER BY thu_tu, id"
  );
  const ds = rows.map((r) => chuoi(r.gia_tri)).filter(Boolean);
  return ds.length ? ds : KHU_VUC_LIST.slice();
}

/** Danh sách tên Người dẫn dắt (tab Config cột C ngày xưa). */
async function layDanhSachNguoiDanDat(db) {
  const rows = await db.all(
    "SELECT gia_tri FROM config_list WHERE loai = 'nguoi_dan_dat' ORDER BY thu_tu, id"
  );
  return rows.map((r) => chuoi(r.gia_tri)).filter(Boolean);
}

/**
 * Danh sách tên Người dẫn dắt của MỘT dòng (học viên hoặc nhật ký), đã bỏ ô
 * trống và bỏ trùng. Một người bị gõ tên ở cả ndd1 lẫn ndd2 của cùng một dòng
 * thì chỉ được tính 1 lần — giống hệt cách getTopNguoiDanDat đang làm, nếu
 * không, bảng "Mục tiêu cá nhân" sẽ đếm gấp đôi cho người đó.
 */
function tenNguoiDanDat(dong) {
  return new Set([chuoi(dong.ndd1), chuoi(dong.ndd2), chuoi(dong.ndd3)].filter(Boolean));
}

/** Ba trạng thái hợp lệ của EDU LMS ('' nghĩa là "Chưa bắt đầu"). */
const EDU_TRANG_THAI = ['', 'Đang làm', 'Hoàn thành'];

/** Ép giá trị EDU LMS về đúng 1 trong 3 trạng thái; lạ quá thì coi như rỗng. */
function chuanTrangThaiEdu(v) {
  const s = chuoi(v);
  return EDU_TRANG_THAI.includes(s) ? s : '';
}

/**
 * Xếp hạng trạng thái EDU LMS để biết cái nào "cao" hơn.
 * Hoàn thành (2) > Đang làm (1) > Chưa bắt đầu (0).
 * Giống hệt eduStatusRankOf_ bên index.html.
 */
function hangTrangThaiEdu(s) {
  return s === 'Hoàn thành' ? 2 : (s === 'Đang làm' ? 1 : 0);
}

/**
 * Quy đổi map tuần của 1 thành viên thành { weeks, total } cho EDU LMS.
 * "Tổng tháng" = trạng thái CAO NHẤT trong 5 tuần (lũy kế, không cộng dồn) —
 * cùng quy tắc "lấy lớn nhất" mà bản cũ (eduMetricFromMap_) dùng cho số %.
 */
function chiSoEduLms(cacTuan) {
  const weeks = [1, 2, 3, 4, 5].map((w) => chuanTrangThaiEdu(cacTuan[w]?.eduLms));
  let total = '';
  for (const w of weeks) {
    if (hangTrangThaiEdu(w) > hangTrangThaiEdu(total)) total = w;
  }
  return { weeks, total };
}

/**
 * Quy đổi map tuần của 1 thành viên thành { weeks, total } cho Trực tuyến 127.
 * "Tổng tháng" = SỐ NGÀY LỚN NHẤT trong 5 tuần (số ngày là lũy kế nên lấy
 * lớn nhất chứ không cộng lại) — đúng như eduMetricFromMap_ cũ.
 */
function chiSoTruc127(cacTuan) {
  const weeks = [1, 2, 3, 4, 5].map((w) => soNguyen(cacTuan[w]?.truc127));
  const total = Math.max(0, ...weeks);
  return { weeks, total };
}

/** Gom các dòng giao_duc_thanh_vien thành map[tên][tuần] = {eduLms, truc127}. */
function gomTheoThanhVien(rows) {
  const map = {};
  for (const r of rows) {
    const ten = chuoi(r.ten);
    const tuan = Number(r.tuan);
    if (!ten || !tuan) continue;
    if (!map[ten]) map[ten] = {};
    map[ten][tuan] = { eduLms: chuanTrangThaiEdu(r.edu_lms), truc127: soNguyen(r.tt127_ngay) };
  }
  return map;
}

/** Một dòng thành viên trong bảng Giáo dục (dùng chung cho 2 hàm đọc). */
function dongGiaoDuc(ten, tuanThangNay, tuanThangTruoc) {
  const eduLms = chiSoEduLms(tuanThangNay);
  const truc127 = chiSoTruc127(tuanThangNay);
  const eduLmsTruoc = chiSoEduLms(tuanThangTruoc);
  const truc127Truoc = chiSoTruc127(tuanThangTruoc);
  return {
    ten,
    eduLms: { prevMonthTotal: eduLmsTruoc.total, weeks: eduLms.weeks, total: eduLms.total },
    truc127: { prevMonthTotal: truc127Truoc.total, weeks: truc127.weeks, total: truc127.total },
  };
}

// =====================================================================
// NHÓM A — MỤC TIÊU KHU VỰC (bảng muc_tieu_kv)
//
// Ghi chú nghiệp vụ: từ 01/08/2026, Mục tiêu Khu vực hiển thị trên web được
// TỰ ĐỘNG CỘNG DỒN từ Mục tiêu cá nhân của các thành viên trong khu vực đó
// (xem getGoalKVMap_ cũ), nên giao diện hiện tại KHÔNG còn gọi saveGoalKV /
// deleteGoalKV nữa. Hai hàm này vẫn được giữ để không phá vỡ giao thức API
// và để còn chỗ ghi/sửa số liệu lịch sử đã nhập tay trước đây.
// =====================================================================

/**
 * Lưu cả 3 chỉ tiêu của 1 Khu vực trong 1 tháng.
 * frontend (bản cũ) gọi: saveGoalKV(monthKey, khuVuc, { donThuan, huuHieu, bt })
 */
export async function saveGoalKV({ db }, monthKey, khuVuc, data) {
  const thang = kiemTraThang(monthKey);
  const kv = batBuoc(khuVuc, 'Khu vực');
  chanNeuCanThiet(thang);

  const d = data || {};
  await db.run(
    `INSERT INTO muc_tieu_kv (thang, khu_vuc, mt_don_thuan, mt_huu_hieu, mt_bt)
     VALUES (?,?,?,?,?)
     ON CONFLICT (thang, khu_vuc) DO UPDATE SET
       mt_don_thuan = excluded.mt_don_thuan,
       mt_huu_hieu  = excluded.mt_huu_hieu,
       mt_bt        = excluded.mt_bt`,
    [thang, kv, soNguyen(d.donThuan), soNguyen(d.huuHieu), soNguyen(d.bt)]
  );
  return { success: true };
}

/**
 * Xoá mục tiêu của 1 Khu vực trong 1 tháng.
 * Bản cũ "xoá trắng" cả dòng trên Sheet, tức là 3 chỉ tiêu về 0 — ở đây xoá
 * hẳn dòng, kết quả đọc ra vẫn là 0 nên không lệch gì.
 */
export async function deleteGoalKV({ db }, monthKey, khuVuc) {
  const thang = kiemTraThang(monthKey);
  const kv = batBuoc(khuVuc, 'Khu vực');
  chanNeuCanThiet(thang);

  await db.run('DELETE FROM muc_tieu_kv WHERE thang = ? AND khu_vuc = ?', [thang, kv]);
  return { success: true };
}

// =====================================================================
// NHÓM B — MỤC TIÊU CÁ NHÂN (bảng muc_tieu_ca_nhan)
// =====================================================================

/**
 * Lưu mục tiêu tháng của 1 thành viên.
 * frontend gọi: saveGoalCaNhan(monthKey, khuVuc, ten, {donThuan, huuHieu, bt, truc127})
 *
 * Người này BẮT BUỘC đã có trong danh sách thành viên (tab "Giáo dục") của
 * đúng Khu vực đó — tránh gõ nhầm tên tạo ra "thành viên ma" không bao giờ
 * hiện được số thực tế.
 */
export async function saveGoalCaNhan({ db }, monthKey, khuVuc, ten, data) {
  const thang = kiemTraThang(monthKey);
  const kv = chuoi(khuVuc);
  const tenTV = chuoi(ten);
  if (!kv) throw new Error('Vui lòng chọn Khu vực.');
  if (!tenTV) throw new Error('Vui lòng chọn Thành viên.');
  chanNeuCanThiet(thang);

  const co = await db.first(
    'SELECT 1 AS co FROM giao_duc_thanh_vien WHERE khu_vuc = ? AND ten = ? LIMIT 1',
    [kv, tenTV]
  );
  if (!co) {
    throw new Error('"' + tenTV + '" chưa có trong danh sách thành viên của Khu vực "' + kv +
      '" — vào tab "Giáo dục" thêm thành viên này trước.');
  }

  const d = data || {};
  // Bảng mới không có cột mục tiêu EDU LMS (vì EDU LMS giờ là trạng thái,
  // không đặt mục tiêu bằng con số được) — giao diện cũng không gửi lên nữa.
  await db.run(
    `INSERT INTO muc_tieu_ca_nhan (thang, khu_vuc, ten, mt_don_thuan, mt_huu_hieu, mt_bt, mt_tt127_ngay)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT (thang, khu_vuc, ten) DO UPDATE SET
       mt_don_thuan  = excluded.mt_don_thuan,
       mt_huu_hieu   = excluded.mt_huu_hieu,
       mt_bt         = excluded.mt_bt,
       mt_tt127_ngay = excluded.mt_tt127_ngay`,
    [thang, kv, tenTV, soNguyen(d.donThuan), soNguyen(d.huuHieu), soNguyen(d.bt), soNguyen(d.truc127)]
  );
  return { success: true };
}

/** Xoá hẳn mục tiêu cá nhân của 1 người trong 1 tháng. */
export async function deleteGoalCaNhan({ db }, monthKey, khuVuc, ten) {
  const thang = kiemTraThang(monthKey);
  const kv = chuoi(khuVuc);
  const tenTV = chuoi(ten);
  if (!kv) throw new Error('Vui lòng chọn Khu vực.');
  if (!tenTV) throw new Error('Vui lòng chọn Thành viên.');
  chanNeuCanThiet(thang);

  await db.run(
    'DELETE FROM muc_tieu_ca_nhan WHERE thang = ? AND khu_vuc = ? AND ten = ?',
    [thang, kv, tenTV]
  );
  return { success: true };
}

/**
 * Mục tiêu / Thực tế / % của TẤT CẢ thành viên, TẤT CẢ Khu vực, trong 1 tháng.
 * Gọi 1 lần khi mở tab con "🎯 Mục tiêu"; đổi Khu vực trên trình duyệt sau đó
 * chỉ là đọc lại đúng nhánh trong object đã có, không gọi mạng nữa.
 *
 * Trả về: { "<Khu vực>": [ { ten, goal, actual, percent }, ... ] }
 *
 * "Thực tế" lấy từ 3 nguồn khác nhau:
 *   - Đơn thuần : cộng dồn Nhật ký Đơn thuần của tháng, tính cho MỌI người có
 *                 tên ở cột Người dẫn dắt 1/2/3 (không chia đôi chia ba).
 *   - Hữu hiệu / BT : đếm học viên trong DS HV có "Ngày chia sẻ cuối" thuộc
 *                 tháng này, đúng Khu vực, đạt tiêu chí Hữu hiệu / Báp-têm, và
 *                 người này đứng tên ở NDD1/2/3.
 *   - EDU LMS / Trực tuyến 127 : lấy "Tổng tháng" ở tab Giáo dục.
 * Đúng quy tắc đang dùng ở bảng "Xếp hạng Anh/Chị dẫn dắt".
 */
export async function getPersonalGoalsAllKhuVuc({ db }, monthKey) {
  const thang = kiemTraThang(monthKey);

  const [dsKhuVuc, dongGD, dongLog, dongHV, dongMucTieu] = await Promise.all([
    layDanhSachKhuVuc(db),
    // Đọc TOÀN BỘ bảng Giáo dục 1 lần: vừa để lấy danh sách thành viên (mọi
    // tháng), vừa để lấy số liệu của riêng tháng đang xem.
    db.all('SELECT thang, khu_vuc, ten, tuan, edu_lms, tt127_ngay FROM giao_duc_thanh_vien'),
    db.all(
      `SELECT khu_vuc, don_thuan, ndd1, ndd2, ndd3
         FROM nhat_ky_don_thuan
        WHERE substr(ngay, 1, 7) = ?`,
      [thang]
    ),
    db.all(
      `SELECT khu_vuc, ten, ngay_chia_se_cuoi, tien_do, ndd1, ndd2, ndd3
         FROM hoc_vien
        WHERE substr(ngay_chia_se_cuoi, 1, 7) = ?`,
      [thang]
    ),
    db.all(
      `SELECT khu_vuc, ten, mt_don_thuan, mt_huu_hieu, mt_bt, mt_tt127_ngay
         FROM muc_tieu_ca_nhan WHERE thang = ?`,
      [thang]
    ),
  ]);

  // --- Danh sách thành viên + số liệu Giáo dục của tháng đang xem ---
  const dsTheoKV = {};   // khuVuc -> Set(tên)
  const eduTheoKV = {};  // khuVuc -> ten -> tuan -> {eduLms, truc127}
  for (const r of dongGD) {
    const kv = chuoi(r.khu_vuc);
    const ten = chuoi(r.ten);
    if (!kv || !ten) continue;
    if (!dsTheoKV[kv]) dsTheoKV[kv] = new Set();
    dsTheoKV[kv].add(ten);

    if (chuoi(r.thang) !== thang) continue;
    const tuan = Number(r.tuan);
    if (!tuan) continue;
    if (!eduTheoKV[kv]) eduTheoKV[kv] = {};
    if (!eduTheoKV[kv][ten]) eduTheoKV[kv][ten] = {};
    eduTheoKV[kv][ten][tuan] = {
      eduLms: chuanTrangThaiEdu(r.edu_lms),
      truc127: soNguyen(r.tt127_ngay),
    };
  }

  // --- Đơn thuần thực tế ---
  const donThuanTheoKV = {};
  for (const l of dongLog) {
    const kv = chuoi(l.khu_vuc);
    if (!kv) continue;
    const sl = soNguyen(l.don_thuan);
    if (!donThuanTheoKV[kv]) donThuanTheoKV[kv] = {};
    // Set: một người bị ghi tên ở 2-3 ô của CÙNG một dòng nhật ký thì vẫn chỉ
    // được cộng 1 lần (đúng quy tắc của bảng "Xếp hạng Anh/Chị dẫn dắt").
    for (const ten of tenNguoiDanDat(l)) {
      donThuanTheoKV[kv][ten] = (donThuanTheoKV[kv][ten] || 0) + sl;
    }
  }

  // --- Hữu hiệu / BT thực tế ---
  const huuHieuTheoKV = {};
  const btTheoKV = {};
  for (const hv of dongHV) {
    if (!chuoi(hv.ten)) continue;
    const kv = chuoi(hv.khu_vuc);
    if (!kv) continue;
    // Lọc lại tháng bằng tay cho chắc, phòng khi ngày lưu ở dạng khác.
    if (thangCuaNgay(hv.ngay_chia_se_cuoi) !== thang) continue;
    const hh = laHuuHieu(hv.tien_do);
    const bt = laBT(hv.tien_do);
    if (!hh && !bt) continue;
    // Set: cùng một tên ở 2-3 ô NDD của MỘT học viên chỉ tính 1 lần.
    for (const nguoiDat of tenNguoiDanDat(hv)) {
      if (hh) {
        if (!huuHieuTheoKV[kv]) huuHieuTheoKV[kv] = {};
        huuHieuTheoKV[kv][nguoiDat] = (huuHieuTheoKV[kv][nguoiDat] || 0) + 1;
      }
      if (bt) {
        if (!btTheoKV[kv]) btTheoKV[kv] = {};
        btTheoKV[kv][nguoiDat] = (btTheoKV[kv][nguoiDat] || 0) + 1;
      }
    }
  }

  // --- Mục tiêu đã lưu ---
  const mucTieuTheoKV = {};
  for (const g of dongMucTieu) {
    const kv = chuoi(g.khu_vuc);
    const ten = chuoi(g.ten);
    if (!kv || !ten) continue;
    if (!mucTieuTheoKV[kv]) mucTieuTheoKV[kv] = {};
    mucTieuTheoKV[kv][ten] = {
      donThuan: soNguyen(g.mt_don_thuan),
      huuHieu: soNguyen(g.mt_huu_hieu),
      bt: soNguyen(g.mt_bt),
      truc127: soNguyen(g.mt_tt127_ngay),
    };
  }

  const ketQua = {};
  for (const kv of dsKhuVuc) {
    const dsTen = Array.from(dsTheoKV[kv] || []).sort(soSanhTiengViet);
    ketQua[kv] = dsTen.map((ten) => {
      const goal = (mucTieuTheoKV[kv] && mucTieuTheoKV[kv][ten]) ||
        { donThuan: 0, huuHieu: 0, bt: 0, truc127: 0 };
      const cacTuan = (eduTheoKV[kv] && eduTheoKV[kv][ten]) || {};
      const actual = {
        donThuan: (donThuanTheoKV[kv] && donThuanTheoKV[kv][ten]) || 0,
        huuHieu: (huuHieuTheoKV[kv] && huuHieuTheoKV[kv][ten]) || 0,
        bt: (btTheoKV[kv] && btTheoKV[kv][ten]) || 0,
        // EDU LMS là TRẠNG THÁI (chuỗi), giao diện hiện thẳng chữ chứ không tính %.
        eduLms: chiSoEduLms(cacTuan).total,
        truc127: chiSoTruc127(cacTuan).total,
      };
      return {
        ten,
        goal,
        actual,
        percent: {
          donThuan: phanTram(actual.donThuan, goal.donThuan),
          huuHieu: phanTram(actual.huuHieu, goal.huuHieu),
          bt: phanTram(actual.bt, goal.bt),
          truc127: phanTram(actual.truc127, goal.truc127),
        },
      };
    });
  }
  return ketQua;
}

// =====================================================================
// NHÓM C — GIÁO DỤC THÀNH VIÊN (bảng giao_duc_thanh_vien)
// =====================================================================

/**
 * Danh sách thành viên của TẤT CẢ Khu vực — mỗi cặp (Khu vực, Tên) đúng 1 lần,
 * gộp từ mọi tháng đã từng nhập, sắp theo Khu vực rồi đến Tên.
 * Trả về: [ { khuVuc, ten }, ... ]
 */
export async function getGiaoDucMembers({ db }) {
  const rows = await db.all(
    'SELECT DISTINCT khu_vuc, ten FROM giao_duc_thanh_vien'
  );
  return rows
    .map((r) => ({ khuVuc: chuoi(r.khu_vuc), ten: chuoi(r.ten) }))
    .filter((m) => m.khuVuc && m.ten)
    .sort((a, b) => (a.khuVuc !== b.khuVuc
      ? soSanhTiengViet(a.khuVuc, b.khuVuc)
      : soSanhTiengViet(a.ten, b.ten)));
}

/**
 * Thêm 1 thành viên vào Khu vực.
 * frontend gọi: addGiaoDucMember({ khuVuc, ten })
 *
 * Vì bảng mới không có chỗ lưu riêng "danh sách thành viên", ta tạo sẵn 1 dòng
 * trống ở tháng HIỆN TẠI, Tuần 1 (EDU LMS rỗng, 127 = 0 ngày) để người này có
 * mặt trong danh sách ngay. Tên phải nằm trong danh sách Người dẫn dắt (Config)
 * — giao diện chỉ cho chọn, nhưng vẫn kiểm lại ở đây phòng khi ai gọi thẳng API.
 */
export async function addGiaoDucMember({ db }, data) {
  const d = data || {};
  const kv = chuoi(d.khuVuc);
  const ten = chuoi(d.ten);
  if (!kv) throw new Error('Vui lòng chọn Khu vực.');
  if (!ten) throw new Error('Vui lòng chọn Tên thành viên.');

  const dsNdd = await layDanhSachNguoiDanDat(db);
  if (dsNdd.length && !dsNdd.includes(ten)) {
    throw new Error('"' + ten + '" không có trong danh sách Người dẫn dắt (tab Config) — ' +
      'vào Config thêm tên này trước.');
  }

  const daCo = await db.first(
    'SELECT 1 AS co FROM giao_duc_thanh_vien WHERE khu_vuc = ? AND ten = ? LIMIT 1',
    [kv, ten]
  );
  if (daCo) throw new Error('Thành viên "' + ten + '" đã có trong Khu vực "' + kv + '".');

  await db.run(
    `INSERT INTO giao_duc_thanh_vien (thang, khu_vuc, ten, tuan, edu_lms, tt127_ngay)
     VALUES (?,?,?,1,'',0)
     ON CONFLICT (thang, khu_vuc, ten, tuan) DO NOTHING`,
    [thangHienTai(), kv, ten]
  );
  return { success: true };
}

/**
 * Xoá hẳn 1 thành viên khỏi Khu vực — xoá TẤT CẢ các dòng của họ ở MỌI tháng
 * (xoá luôn lịch sử), vì danh sách thành viên được suy ra từ chính các dòng đó.
 */
export async function deleteGiaoDucMember({ db }, khuVuc, ten) {
  const kv = chuoi(khuVuc);
  const tenTV = chuoi(ten);
  if (!kv) throw new Error('Thiếu Khu vực.');
  if (!tenTV) throw new Error('Thiếu tên thành viên.');

  await db.run('DELETE FROM giao_duc_thanh_vien WHERE khu_vuc = ? AND ten = ?', [kv, tenTV]);
  return { success: true };
}

/**
 * Lưu số liệu 1 tuần của 1 thành viên.
 * frontend gọi: saveGiaoDucWeek(monthKey, khuVuc, ten, tuan, eduLms, truc127)
 * trong đó eduLms là chuỗi trạng thái ('' | 'Đang làm' | 'Hoàn thành') và
 * truc127 là SỐ NGÀY. Giao diện luôn gửi kèm cả 2 giá trị (kể cả ô không sửa).
 *
 * CỐ Ý không xoá dòng khi cả 2 ô đều trống: dòng này cũng chính là thứ giữ tên
 * thành viên trong danh sách, xoá đi là người đó biến mất khỏi tab Giáo dục.
 */
export async function saveGiaoDucWeek({ db }, monthKey, khuVuc, ten, tuan, eduLms, truc127) {
  const thang = kiemTraThang(monthKey);
  const kv = chuoi(khuVuc);
  const tenTV = chuoi(ten);
  const t = Number(tuan);
  if (!kv) throw new Error('Vui lòng chọn Khu vực.');
  if (!tenTV) throw new Error('Thiếu tên thành viên.');
  if (!t || t < 1 || t > 5) throw new Error('Tuần không hợp lệ (chỉ nhận 1-5).');
  chanNeuCanThiet(thang);

  const trangThai = chuanTrangThaiEdu(eduLms);
  const soNgay = Math.max(0, soNguyen(truc127));

  await db.run(
    `INSERT INTO giao_duc_thanh_vien (thang, khu_vuc, ten, tuan, edu_lms, tt127_ngay)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT (thang, khu_vuc, ten, tuan) DO UPDATE SET
       edu_lms    = excluded.edu_lms,
       tt127_ngay = excluded.tt127_ngay`,
    [thang, kv, tenTV, t, trangThai, soNgay]
  );
  return { success: true };
}

/**
 * Bảng Giáo dục của 1 Khu vực trong 1 tháng.
 * Trả về: [ { ten,
 *             eduLms:  { prevMonthTotal, weeks: [5 chuỗi], total },
 *             truc127: { prevMonthTotal, weeks: [5 số],    total } }, ... ]
 */
export async function getGiaoDucWeekly({ db }, monthKey, khuVuc) {
  const thang = kiemTraThang(monthKey);
  const kv = batBuoc(khuVuc, 'Khu vực');
  const truoc = thangTruoc(thang);

  // Lấy hết dòng của Khu vực này (mọi tháng) để dựng danh sách thành viên,
  // rồi tách riêng số liệu tháng này / tháng trước.
  const rows = await db.all(
    'SELECT thang, ten, tuan, edu_lms, tt127_ngay FROM giao_duc_thanh_vien WHERE khu_vuc = ?',
    [kv]
  );

  const dsTen = Array.from(new Set(rows.map((r) => chuoi(r.ten)).filter(Boolean)))
    .sort(soSanhTiengViet);
  const thangNay = gomTheoThanhVien(rows.filter((r) => chuoi(r.thang) === thang));
  const thangTruocMap = gomTheoThanhVien(rows.filter((r) => chuoi(r.thang) === truoc));

  return dsTen.map((ten) => dongGiaoDuc(ten, thangNay[ten] || {}, thangTruocMap[ten] || {}));
}

/**
 * Bản "gộp tất cả Khu vực" của getGiaoDucWeekly.
 * Trả về: { "<Khu vực>": [ ...giống getGiaoDucWeekly ] } — kể cả Khu vực chưa
 * có ai thì vẫn có key với mảng rỗng.
 *
 * Chỉ đọc bảng Giáo dục ĐÚNG 1 LẦN rồi gộp cho cả 6 Khu vực (bản cũ đọc lại
 * 18 lần nên rất chậm).
 */
export async function getGiaoDucWeeklyAll({ db }, monthKey) {
  const thang = kiemTraThang(monthKey);
  const truoc = thangTruoc(thang);

  const [dsKhuVuc, rows] = await Promise.all([
    layDanhSachKhuVuc(db),
    db.all('SELECT thang, khu_vuc, ten, tuan, edu_lms, tt127_ngay FROM giao_duc_thanh_vien'),
  ]);

  const dsTheoKV = {};  // khuVuc -> Set(tên)
  const soLieu = {};    // khuVuc -> thang -> ten -> tuan -> {eduLms, truc127}
  for (const r of rows) {
    const kv = chuoi(r.khu_vuc);
    const ten = chuoi(r.ten);
    if (!kv || !ten) continue;
    if (!dsTheoKV[kv]) dsTheoKV[kv] = new Set();
    dsTheoKV[kv].add(ten);

    const tuan = Number(r.tuan);
    if (!tuan) continue;
    const mk = chuoi(r.thang);
    if (mk !== thang && mk !== truoc) continue; // chỉ cần 2 tháng này
    if (!soLieu[kv]) soLieu[kv] = {};
    if (!soLieu[kv][mk]) soLieu[kv][mk] = {};
    if (!soLieu[kv][mk][ten]) soLieu[kv][mk][ten] = {};
    soLieu[kv][mk][ten][tuan] = {
      eduLms: chuanTrangThaiEdu(r.edu_lms),
      truc127: soNguyen(r.tt127_ngay),
    };
  }

  const ketQua = {};
  for (const kv of dsKhuVuc) {
    const dsTen = Array.from(dsTheoKV[kv] || []).sort(soSanhTiengViet);
    const nay = (soLieu[kv] && soLieu[kv][thang]) || {};
    const cu = (soLieu[kv] && soLieu[kv][truoc]) || {};
    ketQua[kv] = dsTen.map((ten) => dongGiaoDuc(ten, nay[ten] || {}, cu[ten] || {}));
  }
  return ketQua;
}
