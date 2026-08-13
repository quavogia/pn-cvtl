// =====================================================================
// Học viên + Nhật ký "Đơn thuần" + các bảng Thống kê tổng hợp.
//
// Ba nhóm việc trong file này:
//   A. Danh sách học viên (bảng hoc_vien): xem / thêm / sửa / xóa + 2 bảng đếm.
//   B. Nhật ký Đơn thuần (bảng nhat_ky_don_thuan): thêm / xem / xóa.
//   C. Các bảng tổng hợp cho tab "Tổng quan" và "Hiện trạng khu vực" —
//      đọc gộp nhiều bảng cùng lúc rồi tính, KHÔNG ghi gì cả.
//
// ⚠️ VỀ CHỮ "row" TRONG FILE NÀY
// Hệ thống cũ chạy trên Google Sheets nên lấy SỐ DÒNG của sheet làm mã nhận
// dạng học viên (updateStudent(row, ...), deleteStudent(row)...). Bảng mới
// không còn "dòng" nữa, mỗi bản ghi có cột `id` tự tăng.
// Cách xử lý: các hàm ĐỌC vẫn trả về trường tên là `row` (vì giao diện web
// đang đọc đúng chữ `row` đó — xem index.html: s.row, l.row), NHƯNG giá trị
// bên trong chính là `id` của bản ghi. Các hàm SỬA/XÓA nhận lại đúng giá trị
// đó và hiểu nó là `id`. Nhờ vậy giao diện không phải sửa dòng nào.
// =====================================================================

import { KHU_VUC_LIST } from '../hang-so.js';
import { mocVuaDat } from './tru-do.js';
import {
  kiemTraThang, thangTruoc, phanTram, laHuuHieu, laBT, soBuoi, BT_STATUS_VALUE,
  chuanNgay, ngayVN, tuanTrongThang, chuoi, soNguyen, batBuoc,
} from '../tien-ich.js';

/** Tiến độ nghĩa là "đang tạm dừng học" — không tính vào "Đang nghe". */
const TAM_NGHI = 'Tạm nghỉ';

/**
 * "Đang nghe" = có Tiến độ, KHÔNG phải "Tạm nghỉ", và CHƯA Báp-têm.
 * (sửa 13/08/2026: trước đây học viên đã BT vẫn bị tính là "đang nghe" —
 * anh Rise chỉ ra là vô lý, vì BT nghĩa là đã hoàn tất, không còn "đang nghe" nữa.)
 */
function laDangNghe(tienDo) {
  const s = chuoi(tienDo);
  return !!s && s !== TAM_NGHI && !laBT(s);
}

// ---------------------------------------------------------------------
// Mấy hàm phụ dùng chung trong file này (không đủ chung để đưa ra tien-ich.js)
// ---------------------------------------------------------------------

/** Đọc một danh sách trong bảng cấu hình: 'khu_vuc' | 'tien_do' | 'nguoi_dan_dat'. */
async function danhSachCauHinh(db, loai) {
  const rows = await db.all(
    'SELECT gia_tri FROM config_list WHERE loai = ? ORDER BY thu_tu, id',
    [loai]
  );
  return rows.map((r) => chuoi(r.gia_tri)).filter(Boolean);
}

/**
 * Danh sách Khu vực theo đúng thứ tự hiển thị.
 * Ưu tiên bảng cấu hình; nếu bảng cấu hình chưa có gì thì dùng danh sách
 * cứng trong hang-so.js để trang web không bị trống trơn.
 */
async function layDanhSachKhuVuc(db) {
  const ds = await danhSachCauHinh(db, 'khu_vuc');
  return ds.length ? ds : KHU_VUC_LIST.slice();
}

/**
 * Đọc TOÀN BỘ học viên đúng 1 lần rồi dùng lại cho mọi phép tính bên dưới
 * (bảng này chỉ vài trăm dòng nên đọc hết là nhanh nhất, giống cách bản cũ
 * gọi getAllStudentRows_ một lần).
 *
 * Mỗi học viên được kèm sẵn 3 thứ đã tính trước cho tiện:
 *   - thangChiaSe: tháng của "Ngày chia sẻ cuối cùng" — dùng cho các bảng nói
 *     về HOẠT ĐỘNG trong tháng (bảng buổi/tiến độ, xếp hạng người dẫn dắt).
 *   - thangMoc / tuanMoc: tháng & tuần của "Ngày đầu chia sẻ" (không có thì
 *     lấy tạm Ngày chia sẻ cuối cùng) — dùng để đếm Hữu hiệu / BT, để một
 *     người luôn được tính vào ĐÚNG tháng lúc bắt đầu nghe, khớp với con số
 *     Đơn thuần của tháng đó.
 * Ngày trong CSDL được chuẩn hóa lại bằng chuanNgay() nên dù dữ liệu cũ nhập
 * kiểu "dd/MM/yyyy" hay "yyyy-MM-dd" đều đọc đúng.
 */
async function docHocVien(db) {
  const rows = await db.all(
    `SELECT id, ten, ngay_chia_se_cuoi, ngay_dau_chia_se, dia_chi,
            ndd1, ndd2, ndd3, khu_vuc, tien_do, danh_gia
       FROM hoc_vien
      WHERE TRIM(COALESCE(ten, '')) <> ''
      ORDER BY id`
  );
  return rows.map((r) => {
    const ngayChiaSe = chuanNgay(r.ngay_chia_se_cuoi);
    const ngayDau = chuanNgay(r.ngay_dau_chia_se);
    const ngayMoc = ngayDau || ngayChiaSe;
    return {
      id: r.id,
      ten: chuoi(r.ten),
      ngayChiaSe,
      ngayDau,
      thangChiaSe: ngayChiaSe ? ngayChiaSe.slice(0, 7) : '',
      thangMoc: ngayMoc ? ngayMoc.slice(0, 7) : '',
      tuanMoc: ngayMoc ? tuanTrongThang(ngayMoc) : 0,
      diaChi: chuoi(r.dia_chi),
      ndd1: chuoi(r.ndd1),
      ndd2: chuoi(r.ndd2),
      ndd3: chuoi(r.ndd3),
      khuVuc: chuoi(r.khu_vuc),
      tienDo: chuoi(r.tien_do),
      danhGia: chuoi(r.danh_gia),
    };
  });
}

/**
 * Sắp xếp các mức Tiến độ: B1, B2... B16 trước (theo số), rồi tới BT,
 * "Tạm nghỉ" và các giá trị lạ khác xếp theo bảng chữ cái.
 */
function sapXepTienDo(a, b) {
  const na = soBuoi(a);
  const nb = soBuoi(b);
  if (na !== null && nb !== null) return na - nb;
  if (na !== null) return -1;
  if (nb !== null) return 1;
  return a.localeCompare(b, 'vi');
}

/** Đếm học viên theo từng mức Tiến độ, đã sắp xếp sẵn để hiển thị. */
function bangTheoTienDo(dsHocVien) {
  const dem = {};
  for (const hv of dsHocVien) {
    if (!hv.tienDo) continue;
    dem[hv.tienDo] = (dem[hv.tienDo] || 0) + 1;
  }
  return Object.keys(dem)
    .sort(sapXepTienDo)
    .map((k) => ({ tienDo: k, count: dem[k] }));
}

/** Tổng "Đơn thuần" trong tháng, gom theo Khu vực: { "K My": 12, ... } */
async function tongDonThuanTheoKV(db, thang) {
  const rows = await db.all(
    `SELECT khu_vuc, SUM(don_thuan) AS tong
       FROM nhat_ky_don_thuan
      WHERE substr(ngay, 1, 7) = ?
      GROUP BY khu_vuc`,
    [thang]
  );
  const map = {};
  for (const r of rows) map[chuoi(r.khu_vuc)] = soNguyen(r.tong);
  return map;
}

/** "Đơn thuần" chia theo 5 tuần trong tháng: { "K My": [0,3,0,2,0], ... } */
async function donThuanTheoTuanVaKV(db, thang) {
  const rows = await db.all(
    'SELECT ngay, khu_vuc, don_thuan FROM nhat_ky_don_thuan WHERE substr(ngay, 1, 7) = ?',
    [thang]
  );
  const map = {};
  for (const r of rows) {
    const kv = chuoi(r.khu_vuc);
    const tuan = tuanTrongThang(r.ngay);
    if (!kv || !tuan) continue;
    if (!map[kv]) map[kv] = [0, 0, 0, 0, 0];
    map[kv][tuan - 1] += soNguyen(r.don_thuan);
  }
  return map;
}

/**
 * Mục tiêu của từng Khu vực trong tháng.
 * Theo cách làm mới nhất (đổi từ 01/08/2026): mục tiêu Khu vực KHÔNG nhập tay
 * nữa mà TỰ CỘNG DỒN từ Mục tiêu cá nhân của mọi thành viên thuộc Khu vực đó,
 * nên ở đây đọc bảng muc_tieu_ca_nhan chứ không đọc muc_tieu_kv.
 */
async function mucTieuTheoKV(db, thang) {
  const rows = await db.all(
    `SELECT khu_vuc,
            SUM(mt_don_thuan) AS dt,
            SUM(mt_huu_hieu)  AS hh,
            SUM(mt_bt)        AS bt
       FROM muc_tieu_ca_nhan
      WHERE thang = ?
      GROUP BY khu_vuc`,
    [thang]
  );
  const map = {};
  for (const r of rows) {
    map[chuoi(r.khu_vuc)] = { donThuan: soNguyen(r.dt), huuHieu: soNguyen(r.hh), bt: soNguyen(r.bt) };
  }
  return map;
}

/** Đếm Hữu hiệu / BT của tháng, gom theo Khu vực (tính theo tháng mốc). */
function demHuuHieuVaBT(dsHocVien, thang) {
  const huuHieu = {};
  const bt = {};
  for (const hv of dsHocVien) {
    if (!hv.khuVuc || hv.thangMoc !== thang) continue;
    if (laHuuHieu(hv.tienDo)) huuHieu[hv.khuVuc] = (huuHieu[hv.khuVuc] || 0) + 1;
    if (laBT(hv.tienDo)) bt[hv.khuVuc] = (bt[hv.khuVuc] || 0) + 1;
  }
  return { huuHieu, bt };
}

/** Một dòng "Mục tiêu / Thực tế / %" của 1 Khu vực. */
function dongMucTieu(khuVuc, mucTieuMap, donThuanMap, huuHieuMap, btMap) {
  const goal = mucTieuMap[khuVuc] || { donThuan: 0, huuHieu: 0, bt: 0 };
  const actual = {
    donThuan: donThuanMap[khuVuc] || 0,
    huuHieu: huuHieuMap[khuVuc] || 0,
    bt: btMap[khuVuc] || 0,
  };
  return {
    khuVuc,
    goal,
    actual,
    percent: {
      donThuan: phanTram(actual.donThuan, goal.donThuan),
      huuHieu: phanTram(actual.huuHieu, goal.huuHieu),
      bt: phanTram(actual.bt, goal.bt),
    },
  };
}

/** Xếp hạng trạng thái EDU LMS để so "cao nhất": Hoàn thành > Đang làm > trống. */
function hangEduLms(giaTri) {
  const s = chuoi(giaTri);
  if (s === 'Hoàn thành') return 2;
  if (s === 'Đang làm') return 1;
  return 0;
}

/**
 * Kết quả EDU LMS gộp TẤT CẢ Khu vực trong tháng.
 * EDU LMS bây giờ là TRẠNG THÁI (Đang làm / Hoàn thành) chứ không còn là %
 * nhập tay, nên "avg" ở đây = phần trăm số thành viên đạt "Hoàn thành" (lấy
 * trạng thái cao nhất trong 5 tuần) trên tổng số thành viên của mọi Khu vực.
 * Ai chưa nhập tuần nào trong tháng thì tính là "Chưa bắt đầu".
 * Trả về: { avg, count, hoanThanh, dangLam } — đúng các tên giao diện đang đọc.
 */
async function tomTatEduLms(db, thang) {
  const [roster, soLieu] = await Promise.all([
    // Danh sách thành viên lấy từ MỌI tháng đã từng nhập, để sang tháng mới
    // chưa nhập gì vẫn không bị mất tên.
    db.all('SELECT DISTINCT khu_vuc, ten FROM giao_duc_thanh_vien'),
    db.all('SELECT khu_vuc, ten, edu_lms FROM giao_duc_thanh_vien WHERE thang = ?', [thang]),
  ]);
  if (!roster.length) return { avg: null, count: 0, hoanThanh: 0, dangLam: 0 };

  const caoNhat = new Map();
  for (const r of soLieu) {
    const khoa = chuoi(r.khu_vuc) + '||' + chuoi(r.ten);
    const h = hangEduLms(r.edu_lms);
    if (h > (caoNhat.get(khoa) || 0)) caoNhat.set(khoa, h);
  }

  let hoanThanh = 0;
  let dangLam = 0;
  for (const m of roster) {
    const h = caoNhat.get(chuoi(m.khu_vuc) + '||' + chuoi(m.ten)) || 0;
    if (h === 2) hoanThanh++;
    else if (h === 1) dangLam++;
  }
  const count = roster.length;
  return {
    avg: Math.round((hoanThanh / count) * 1000) / 10,
    count,
    hoanThanh,
    dangLam,
  };
}

/** Tổng TP ≥1 lần và ≥4 lần của cả Hội Thánh trong tháng. */
async function tongTPToanBo(db, thang) {
  // Số TP là số đếm LŨY KẾ từ đầu tháng, nên "tổng tháng" của một Khu vực là
  // số LỚN NHẤT trong 5 tuần (KHÔNG cộng các tuần lại), rồi mới cộng các Khu vực.
  const rows = await db.all(
    `SELECT khu_vuc, loai, MAX(so_luong) AS cao_nhat
       FROM tp_tho_phuong
      WHERE thang = ?
      GROUP BY khu_vuc, loai`,
    [thang]
  );
  let oneLan = 0;
  let fourLan = 0;
  for (const r of rows) {
    const n = soNguyen(r.cao_nhat);
    if (chuoi(r.loai) === '1lan') oneLan += n;
    else if (chuoi(r.loai) === '4lan') fourLan += n;
  }
  return { oneLan, fourLan };
}

// =====================================================================
// NHÓM A — DANH SÁCH HỌC VIÊN
// =====================================================================

/**
 * Toàn bộ danh sách học viên cho tab "Nhập học viên".
 * Trường `row` chính là `id` của bản ghi (xem ghi chú đầu file); giao diện
 * gửi lại đúng giá trị này khi bấm Sửa / Xóa.
 * `stt` được đánh lại 1, 2, 3... theo thứ tự hiện tại — bảng mới không cần
 * cột STT riêng nên cũng không còn cảnh "đánh số lại cả sheet" như bản cũ.
 */
export async function getStudents({ db }) {
  const ds = await docHocVien(db);
  return ds.map((hv, i) => ({
    row: hv.id,
    stt: i + 1,
    ten: hv.ten,
    ngay: ngayVN(hv.ngayChiaSe),
    ngayDau: ngayVN(hv.ngayDau),
    diaChi: hv.diaChi,
    ndd1: hv.ndd1,
    ndd2: hv.ndd2,
    ndd3: hv.ndd3,
    to: hv.khuVuc,
    tienDo: hv.tienDo,
    danhGia: hv.danhGia,
  }));
}

/**
 * Kiểm tra Khu vực / Tiến độ / Người dẫn dắt có nằm trong danh sách cấu hình
 * không, TRƯỚC khi ghi. Báo lỗi bằng tiếng Việt rõ ràng để người nhập biết
 * phải chọn lại gì. Nếu bảng cấu hình chưa có danh sách nào thì bỏ qua bước
 * kiểm tra đó (giống bản cũ) để không chặn oan lúc mới cài đặt.
 */
async function kiemTraDuLieuHocVien(db, data) {
  // Đọc THẲNG bảng cấu hình, KHÔNG dùng layDanhSachKhuVuc() ở đây: hàm đó tự
  // thay bằng danh sách cứng trong hang-so.js khi cấu hình còn trống — dùng để
  // HIỂN THỊ thì tốt, nhưng đem đi KIỂM TRA thì lúc mới cài đặt (config_list
  // rỗng) sẽ chặn oan mọi Khu vực chưa kịp khai báo.
  const dsKV = await danhSachCauHinh(db, 'khu_vuc');
  const kv = chuoi(data.to);
  if (kv && dsKV.length && !dsKV.includes(kv)) {
    throw new Error('Khu vực/Tổ "' + kv + '" không hợp lệ. Vui lòng chọn một trong: ' + dsKV.join(', '));
  }

  // Tiến độ là bắt buộc (ô có dấu * trên form).
  const tienDo = chuoi(data.tienDo);
  if (!tienDo) throw new Error('Vui lòng chọn Tiến độ.');
  const dsTienDo = await danhSachCauHinh(db, 'tien_do');
  if (dsTienDo.length && !dsTienDo.includes(tienDo)) {
    throw new Error('Tiến độ "' + tienDo + '" không hợp lệ. Vui lòng chọn một trong: ' + dsTienDo.join(', '));
  }

  const dsNdd = await danhSachCauHinh(db, 'nguoi_dan_dat');
  if (dsNdd.length) {
    for (const khoa of ['ndd1', 'ndd2', 'ndd3']) {
      const v = chuoi(data[khoa]);
      if (v && !dsNdd.includes(v)) {
        throw new Error('Người dẫn dắt "' + v + '" không hợp lệ. Vui lòng chọn một trong: ' + dsNdd.join(', '));
      }
    }
  }
}

export async function addStudent({ db }, data) {
  const d = data || {};
  await kiemTraDuLieuHocVien(db, d);
  const ten = batBuoc(d.ten, 'Tên học viên');

  const ngayChiaSe = chuanNgay(d.ngay);
  // Để trống "Ngày đầu chia sẻ" thì lấy theo "Ngày chia sẻ cuối cùng"
  // (đúng như dòng gợi ý dưới ô nhập trên giao diện).
  const ngayDau = chuanNgay(d.ngayDau) || ngayChiaSe;

  const kq = await db.run(
    `INSERT INTO hoc_vien
       (ten, ngay_chia_se_cuoi, ngay_dau_chia_se, dia_chi, ndd1, ndd2, ndd3,
        khu_vuc, tien_do, danh_gia, cap_nhat_luc)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      ten, ngayChiaSe, ngayDau, chuoi(d.diaChi),
      chuoi(d.ndd1), chuoi(d.ndd2), chuoi(d.ndd3),
      chuoi(d.to), chuoi(d.tienDo), chuoi(d.danhGia),
      new Date().toISOString(),
    ]
  );
  // Học viên mới mà nhập thẳng ở mức Hữu hiệu / Báp-têm thì phải ghi sổ luôn.
  const ghiSo = await mocVuaDat({ db }, '', {
    ten, khuVuc: chuoi(d.to), tienDo: chuoi(d.tienDo),
    ndd1: chuoi(d.ndd1), ndd2: chuoi(d.ndd2), ndd3: chuoi(d.ndd3),
  });

  // Trả kèm `row` (= id vừa tạo) phòng khi giao diện muốn dùng ngay,
  // vẫn giữ `success: true` như bản cũ.
  return { success: true, row: kq?.meta?.last_row_id ?? null, ghiSo };
}

/**
 * Sửa thông tin 1 học viên. Tham số `row` giữ nguyên tên như bản cũ nhưng
 * giá trị là `id` của học viên (xem ghi chú đầu file).
 * "Ngày đầu chia sẻ" đã dùng để tính Hữu hiệu nên KHÔNG cho sửa lại: nếu học
 * viên đã có ngày đó rồi thì giữ nguyên, chỉ điền khi trước đây còn trống.
 */
export async function updateStudent({ db }, row, data) {
  const id = soNguyen(row);
  if (!id) throw new Error('Thiếu mã học viên cần sửa.');
  const d = data || {};
  await kiemTraDuLieuHocVien(db, d);
  const ten = batBuoc(d.ten, 'Tên học viên');

  const cu = await db.first(
    'SELECT id, ngay_dau_chia_se, tien_do FROM hoc_vien WHERE id = ?', [id]);
  if (!cu) throw new Error('Không tìm thấy học viên cần sửa (có thể vừa bị xóa).');

  const ngayChiaSe = chuanNgay(d.ngay);
  const ngayDau = chuanNgay(cu.ngay_dau_chia_se) || chuanNgay(d.ngayDau) || ngayChiaSe;

  await db.run(
    `UPDATE hoc_vien SET
       ten = ?, ngay_chia_se_cuoi = ?, ngay_dau_chia_se = ?, dia_chi = ?,
       ndd1 = ?, ndd2 = ?, ndd3 = ?, khu_vuc = ?, tien_do = ?, danh_gia = ?,
       cap_nhat_luc = ?
     WHERE id = ?`,
    [
      ten, ngayChiaSe, ngayDau, chuoi(d.diaChi),
      chuoi(d.ndd1), chuoi(d.ndd2), chuoi(d.ndd3),
      chuoi(d.to), chuoi(d.tienDo), chuoi(d.danhGia),
      new Date().toISOString(), id,
    ]
  );

  // Vừa vượt mốc Hữu hiệu / Báp-têm thì báo cho giao diện hỏi ngày để ghi sổ.
  // KHÔNG tự ghi ở đây vì ngày đạt mốc có thể là ngày trong quá khứ.
  const ghiSo = await mocVuaDat({ db }, chuoi(cu.tien_do), {
    ten, khuVuc: chuoi(d.to), tienDo: chuoi(d.tienDo),
    ndd1: chuoi(d.ndd1), ndd2: chuoi(d.ndd2), ndd3: chuoi(d.ndd3),
  });

  return { success: true, ghiSo };
}

/** Xóa 1 học viên. `row` ở đây là `id` của học viên. */
export async function deleteStudent({ db }, row) {
  const id = soNguyen(row);
  if (!id) throw new Error('Thiếu mã học viên cần xóa.');
  await db.run('DELETE FROM hoc_vien WHERE id = ?', [id]);
  return { success: true };
}

/**
 * Bảng đếm "Đang nghe" theo từng Khu vực, kèm dòng "Tổng" ở cuối.
 * "Đang nghe" = học viên có Khu vực, Tiến độ khác "Tạm nghỉ", và CHƯA Báp-têm
 * (sửa 13/08/2026: học viên đã BT thì đã hoàn tất, không còn "đang nghe" nữa).
 * Khác bản cũ: KHÔNG ghi ngược kết quả xuống sheet nữa (bản cũ có hàm
 * updateStats_ ghi lại vào Google Sheets), chỉ tính rồi trả về.
 * Trường `row` chỉ còn là số thứ tự dòng cho giao diện, không dùng để sửa/xóa.
 */
export async function getStats({ db }) {
  const dsKV = await layDanhSachKhuVuc(db);
  const rows = await db.all(
    `SELECT khu_vuc, COUNT(*) AS so_luong
       FROM hoc_vien
      WHERE TRIM(COALESCE(ten, '')) <> ''
        AND TRIM(COALESCE(khu_vuc, '')) <> ''
        AND TRIM(COALESCE(tien_do, '')) <> ?
        AND TRIM(COALESCE(tien_do, '')) <> ?
      GROUP BY khu_vuc`,
    [TAM_NGHI, BT_STATUS_VALUE]
  );
  const dem = {};
  for (const r of rows) dem[chuoi(r.khu_vuc)] = soNguyen(r.so_luong);

  const ketQua = dsKV.map((kv, i) => ({ row: i + 1, to: kv, dangNghe: dem[kv] || 0 }));
  // Dòng "Tổng" phải bằng đúng tổng CÁC DÒNG ĐANG HIỆN ở trên, nên cộng lại từ
  // ketQua chứ không cộng thẳng kết quả truy vấn: dữ liệu cũ nhập từ Google
  // Sheets có thể còn Khu vực không nằm trong Config, những dòng đó không hiện
  // trong bảng thì cũng không được lén cộng vào dòng "Tổng" (bảng sẽ không khớp).
  const tong = ketQua.reduce((s, x) => s + x.dangNghe, 0);
  ketQua.push({ row: dsKV.length + 1, to: 'Tổng', dangNghe: tong });
  return ketQua;
}

/**
 * Đếm học viên theo từng mức Tiến độ (B1..B16, BT, Tạm nghỉ...) trong tháng,
 * lọc theo "Ngày chia sẻ cuối cùng". Để trống `khuVuc` thì tính toàn bộ.
 * Trả về: [ { tienDo, count } ] đã sắp xếp B1 -> B16 -> BT -> còn lại.
 */
export async function getProgressBreakdown({ db }, monthKey, khuVuc) {
  const thang = kiemTraThang(monthKey);
  const kv = chuoi(khuVuc);
  const ds = await docHocVien(db);
  return bangTheoTienDo(
    ds.filter((hv) => hv.thangChiaSe === thang && (!kv || hv.khuVuc === kv))
  );
}

// =====================================================================
// NHÓM B — NHẬT KÝ "ĐƠN THUẦN"
// =====================================================================

/** Kiểm tra 3 ô Người dẫn dắt của nhật ký (ô số 1 là bắt buộc). */
async function kiemTraNddNhatKy(db, d) {
  if (!chuoi(d.ndd1)) throw new Error('Vui lòng nhập "Người dẫn dắt 1".');
  const dsNdd = await danhSachCauHinh(db, 'nguoi_dan_dat');
  if (!dsNdd.length) return;
  const nhan = { ndd1: 'Người dẫn dắt 1', ndd2: 'Người dẫn dắt 2', ndd3: 'Người dẫn dắt 3' };
  for (const khoa of ['ndd1', 'ndd2', 'ndd3']) {
    const v = chuoi(d[khoa]);
    if (v && !dsNdd.includes(v)) {
      throw new Error('"' + nhan[khoa] + '": "' + v + '" không có trong danh sách Người dẫn dắt.');
    }
  }
}

export async function addDonThuanLog({ db }, data) {
  const d = data || {};
  await kiemTraNddNhatKy(db, d);

  const ngay = chuanNgay(d.ngay);
  if (!ngay) throw new Error('Vui lòng chọn Ngày.');
  const khuVuc = batBuoc(d.khuVuc, 'Khu vực');

  const kq = await db.run(
    `INSERT INTO nhat_ky_don_thuan (ngay, khu_vuc, don_thuan, ghi_chu, ndd1, ndd2, ndd3)
     VALUES (?,?,?,?,?,?,?)`,
    [ngay, khuVuc, soNguyen(d.soLuong), chuoi(d.ghiChu), chuoi(d.ndd1), chuoi(d.ndd2), chuoi(d.ndd3)]
  );
  return { success: true, row: kq?.meta?.last_row_id ?? null };
}

/**
 * Các dòng nhật ký Đơn thuần của 1 tháng, mới nhất lên đầu.
 * Trường `row` = `id` của dòng — giao diện gửi lại đúng giá trị này khi bấm Xóa.
 * `soLuong` chính là cột `don_thuan` trong CSDL (giữ tên cũ cho giao diện).
 */
export async function getDonThuanLogs({ db }, monthKey) {
  const thang = kiemTraThang(monthKey);
  const rows = await db.all(
    `SELECT id, ngay, khu_vuc, don_thuan, ghi_chu, ndd1, ndd2, ndd3
       FROM nhat_ky_don_thuan
      WHERE substr(ngay, 1, 7) = ?
      ORDER BY ngay DESC, id DESC`,
    [thang]
  );
  return rows.map((r) => ({
    row: r.id,
    ngay: ngayVN(chuanNgay(r.ngay)),
    khuVuc: chuoi(r.khu_vuc),
    soLuong: soNguyen(r.don_thuan),
    ghiChu: chuoi(r.ghi_chu),
    ndd1: chuoi(r.ndd1),
    ndd2: chuoi(r.ndd2),
    ndd3: chuoi(r.ndd3),
  }));
}

/** Xóa 1 dòng nhật ký. `row` ở đây là `id` của dòng. */
export async function deleteDonThuanLog({ db }, row) {
  const id = soNguyen(row);
  if (!id) throw new Error('Thiếu mã dòng nhật ký cần xóa.');
  await db.run('DELETE FROM nhat_ky_don_thuan WHERE id = ?', [id]);
  return { success: true };
}

// =====================================================================
// NHÓM C — CÁC BẢNG THỐNG KÊ TỔNG HỢP
// =====================================================================

/**
 * Mục tiêu / Thực tế / % của TẤT CẢ Khu vực trong 1 tháng.
 * Trả về: [ { khuVuc, goal{donThuan,huuHieu,bt}, actual{...}, percent{...} } ]
 */
export async function getMonthlySummaryByKV({ db }, monthKey) {
  const thang = kiemTraThang(monthKey);
  const [dsKV, donThuanMap, mucTieuMap, dsHV] = await Promise.all([
    layDanhSachKhuVuc(db),
    tongDonThuanTheoKV(db, thang),
    mucTieuTheoKV(db, thang),
    docHocVien(db),
  ]);
  const { huuHieu, bt } = demHuuHieuVaBT(dsHV, thang);
  return dsKV.map((kv) => dongMucTieu(kv, mucTieuMap, donThuanMap, huuHieu, bt));
}

/**
 * Cộng gộp tất cả Khu vực trong 1 tháng — dùng cho các thẻ ở tab "Tổng quan".
 * Trả về: { monthKey, goal, actual, percent, eduLms{avg,count,hoanThanh,dangLam} }
 */
export async function getMonthlySummaryOverall(ctx, monthKey) {
  const thang = kiemTraThang(monthKey);
  const [ds, eduLms] = await Promise.all([
    getMonthlySummaryByKV(ctx, thang),
    tomTatEduLms(ctx.db, thang),
  ]);

  const goal = { donThuan: 0, huuHieu: 0, bt: 0 };
  const actual = { donThuan: 0, huuHieu: 0, bt: 0 };
  for (const s of ds) {
    goal.donThuan += s.goal.donThuan;
    goal.huuHieu += s.goal.huuHieu;
    goal.bt += s.goal.bt;
    actual.donThuan += s.actual.donThuan;
    actual.huuHieu += s.actual.huuHieu;
    actual.bt += s.actual.bt;
  }
  return {
    monthKey: thang,
    goal,
    actual,
    percent: {
      donThuan: phanTram(actual.donThuan, goal.donThuan),
      huuHieu: phanTram(actual.huuHieu, goal.huuHieu),
      bt: phanTram(actual.bt, goal.bt),
    },
    eduLms,
  };
}

/**
 * Ruột chung của getKhuVucOverview / getAllKhuVucOverview: đọc CSDL đúng 1
 * lượt rồi tính cho cả 6-7 Khu vực, tháng đang xem lẫn tháng trước.
 */
async function tinhOverviewTatCa(db, thang) {
  const truoc = thangTruoc(thang);
  const [dsKV, dsHV, dtNay, dtTruoc, mtNay, mtTruoc] = await Promise.all([
    layDanhSachKhuVuc(db),
    docHocVien(db),
    tongDonThuanTheoKV(db, thang),
    tongDonThuanTheoKV(db, truoc),
    mucTieuTheoKV(db, thang),
    mucTieuTheoKV(db, truoc),
  ]);
  const nay = demHuuHieuVaBT(dsHV, thang);
  const cu = demHuuHieuVaBT(dsHV, truoc);

  // Tổng số học viên của mỗi Khu vực — tính TOÀN BỘ, không lọc theo tháng.
  const tongHV = {};
  for (const hv of dsHV) {
    if (!hv.khuVuc) continue;
    tongHV[hv.khuVuc] = (tongHV[hv.khuVuc] || 0) + 1;
  }

  return dsKV.map((kv) => ({
    khuVuc: kv,
    tongHocVien: tongHV[kv] || 0,
    goalSummary: dongMucTieu(kv, mtNay, dtNay, nay.huuHieu, nay.bt),
    prevGoalSummary: dongMucTieu(kv, mtTruoc, dtTruoc, cu.huuHieu, cu.bt),
    breakdown: bangTheoTienDo(dsHV.filter((hv) => hv.khuVuc === kv && hv.thangChiaSe === thang)),
  }));
}

/**
 * Số liệu tổng hợp của 1 Khu vực (tab "Hiện trạng khu vực" > Trụ đỡ).
 * Trả về: { khuVuc, tongHocVien, goalSummary, prevGoalSummary, breakdown[] }
 */
export async function getKhuVucOverview({ db }, monthKey, khuVuc) {
  const thang = kiemTraThang(monthKey);
  const kv = batBuoc(khuVuc, 'Khu vực');
  const tatCa = await tinhOverviewTatCa(db, thang);
  return (
    tatCa.find((x) => x.khuVuc === kv) || {
      khuVuc: kv,
      tongHocVien: 0,
      goalSummary: dongMucTieu(kv, {}, {}, {}, {}),
      prevGoalSummary: dongMucTieu(kv, {}, {}, {}, {}),
      breakdown: [],
    }
  );
}

/**
 * Bản "gộp tất cả Khu vực" của getKhuVucOverview — trang web gọi 1 lần rồi
 * đổi Khu vực trên trình duyệt là hiện ngay, không phải gọi mạng lại.
 */
export async function getAllKhuVucOverview({ db }, monthKey) {
  return tinhOverviewTatCa(db, kiemTraThang(monthKey));
}

/**
 * Số liệu chia theo 5 tuần trong tháng, cho tất cả Khu vực.
 * Trả về: [ { khuVuc, donThuan[5], huuHieu[5], bt[5] } ]
 * Đơn thuần chia theo tuần của ngày ghi nhật ký; Hữu hiệu/BT chia theo tuần
 * của "ngày mốc" (Ngày đầu chia sẻ) — cùng cách tính với con số theo tháng ở
 * getAllKhuVucOverview, nên cộng 5 tuần lại sẽ khớp với tổng tháng.
 */
export async function getAllKhuVucWeekly({ db }, monthKey) {
  const thang = kiemTraThang(monthKey);
  const [dsKV, dtTuan, dsHV] = await Promise.all([
    layDanhSachKhuVuc(db),
    donThuanTheoTuanVaKV(db, thang),
    docHocVien(db),
  ]);

  const hhTuan = {};
  const btTuan = {};
  for (const hv of dsHV) {
    if (!hv.khuVuc || hv.thangMoc !== thang || !hv.tuanMoc) continue;
    if (laHuuHieu(hv.tienDo)) {
      if (!hhTuan[hv.khuVuc]) hhTuan[hv.khuVuc] = [0, 0, 0, 0, 0];
      hhTuan[hv.khuVuc][hv.tuanMoc - 1]++;
    }
    if (laBT(hv.tienDo)) {
      if (!btTuan[hv.khuVuc]) btTuan[hv.khuVuc] = [0, 0, 0, 0, 0];
      btTuan[hv.khuVuc][hv.tuanMoc - 1]++;
    }
  }

  return dsKV.map((kv) => ({
    khuVuc: kv,
    donThuan: dtTuan[kv] || [0, 0, 0, 0, 0],
    huuHieu: hhTuan[kv] || [0, 0, 0, 0, 0],
    bt: btTuan[kv] || [0, 0, 0, 0, 0],
  }));
}

/**
 * Xếp hạng Người dẫn dắt theo số học viên "Đang nghe" trong tháng.
 * "Đang nghe" = có Tiến độ, khác "Tạm nghỉ", và CHƯA Báp-têm (xem laDangNghe).
 * Một học viên có thể có tới 3 Anh/Chị dẫn dắt (ndd1/ndd2/ndd3) — mỗi người
 * có tên ở BẤT KỲ cột nào trong 3 cột đó đều được +1, nhưng nếu một tên bị
 * ghi lặp ở 2-3 cột của CÙNG một học viên thì chỉ tính 1 lần.
 * Trả về TOÀN BỘ danh sách đã sắp xếp giảm dần (giao diện chỉ hiện 3 người đầu):
 *   [ { nguoiDanDat, count } ]
 */
export async function getTopNguoiDanDat({ db }, monthKey) {
  const thang = kiemTraThang(monthKey);
  const dsHV = await docHocVien(db);

  const dem = new Map();
  for (const hv of dsHV) {
    if (hv.thangChiaSe !== thang) continue;
    if (!laDangNghe(hv.tienDo)) continue;
    // Set để một tên xuất hiện 2-3 lần trong cùng 1 học viên chỉ tính 1 lần.
    const ten = new Set([hv.ndd1, hv.ndd2, hv.ndd3].filter(Boolean));
    for (const t of ten) dem.set(t, (dem.get(t) || 0) + 1);
  }

  return [...dem.entries()]
    .map(([nguoiDanDat, count]) => ({ nguoiDanDat, count }))
    .sort((a, b) => b.count - a.count || a.nguoiDanDat.localeCompare(b.nguoiDanDat, 'vi'));
}

/**
 * Bốn thẻ số liệu gộp toàn bộ Khu vực ở chip "📊 Tổng" của tab
 * "Hiện trạng khu vực".
 * Trả về: { monthKey, tpOneLan, tpOneLanPrev, tpFourLan, tpFourLanPrev,
 *           eduLmsAvg, eduLmsCount, eduLmsHoanThanh, certCount }
 * (tpOneLanPrev / tpFourLanPrev là số của tháng trước, để giao diện vẽ mũi
 * tên tăng/giảm; eduLmsHoanThanh là số thành viên đã "Hoàn thành".)
 */
export async function getKVTongSummary({ db }, monthKey) {
  const thang = kiemTraThang(monthKey);
  const truoc = thangTruoc(thang);

  const [tpNay, tpTruoc, eduLms, cert] = await Promise.all([
    tongTPToanBo(db, thang),
    tongTPToanBo(db, truoc),
    tomTatEduLms(db, thang),
    // Số người đã được cấp chứng chỉ Giáo trình ELOHIM ACADEMY — chỉ tính
    // những người còn nằm trong danh sách thành viên của tab "Giáo dục".
    db.first(
      `SELECT COUNT(*) AS so_luong
         FROM dao_tao_tien_do d
        WHERE TRIM(COALESCE(d.ngay_cap_chung_chi, '')) <> ''
          AND EXISTS (
            SELECT 1 FROM giao_duc_thanh_vien g
             WHERE g.khu_vuc = d.khu_vuc AND g.ten = d.ten
          )`
    ),
  ]);

  return {
    monthKey: thang,
    tpOneLan: tpNay.oneLan,
    tpOneLanPrev: tpTruoc.oneLan,
    tpFourLan: tpNay.fourLan,
    tpFourLanPrev: tpTruoc.fourLan,
    eduLmsAvg: eduLms.avg,
    eduLmsCount: eduLms.count,
    eduLmsHoanThanh: eduLms.hoanThanh,
    certCount: soNguyen(cert?.so_luong),
  };
}
