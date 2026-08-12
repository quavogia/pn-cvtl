// =====================================================================
// ĐÀO TẠO + LỄ HỘI
//
// Gồm 3 nhóm việc:
//   (A) Đào tạo — giáo trình "Đứng lớp" 70 bài (7 quyển x 10 bài, mã "Q-B"
//       ví dụ "3-7" = Quyển 3 Bài 7). Đủ 70/70 mới được cấp chứng chỉ.
//   (B) Đào tạo — việc giao trong tuần/tháng (thêm/sửa/xóa/xem).
//   (C) Lễ hội — mỗi bài phải phát biểu đủ N lần, lưu dạng "4-6#1,4-6#2".
//
// ⚠️ CHỖ TỪNG MẤT DỮ LIỆU (lỗi "Lễ hội 15/15 lùi về 13/15"):
// Bản cũ ĐỌC cả chuỗi "đã phát biểu" về trình duyệt/máy chủ, sửa trong bộ nhớ
// rồi GHI ĐÈ lại cả chuỗi. Hai người bấm cùng lúc (hoặc một người bấm nhanh
// nhiều ô) thì lượt ghi sau xoá mất phần lượt ghi trước vừa thêm.
// Ở đây KHÔNG đọc-rồi-ghi nữa: mọi lần tích/bỏ tích đều được viết thành MỘT
// câu lệnh SQL duy nhất, để chính CSDL vừa đọc vừa sửa chuỗi trong cùng một
// nhịp — hai người bấm cùng lúc thì cả hai đều được ghi nhận, không ai đè ai.
// =====================================================================

import { chuoi, batBuoc, chuanNgay, homNay } from '../tien-ich.js';

/** ---------------- Hằng số ---------------- */
const DAOTAO_SO_QUYEN = 7;
const DAOTAO_SO_BAI_MOI_QUYEN = 10;
const DAOTAO_TONG_BAI = DAOTAO_SO_QUYEN * DAOTAO_SO_BAI_MOI_QUYEN; // 70
const DAOTAO_VIEC_TRANGTHAI_LIST = ['Chưa làm', 'Đang làm', 'Hoàn thành', 'Trễ hạn'];
/** Lễ hội không khai báo "số lần yêu cầu" thì hiểu là 3 lần (giống bản cũ). */
const LEHOI_SO_LAN_MAC_DINH = 3;

/** ---------------- Tiện ích nội bộ ----------------
 * (Chỉ nhóm hàm này dùng nên để ngay tại đây, không đụng vào tien-ich.js.)
 */

/** "1-1, 1-2 ,3-7" -> ['1-1','1-2','3-7'] (bỏ khoảng trắng thừa và mã rỗng). */
function tachDanhSach(val) {
  return chuoi(val).split(',').map((v) => v.trim()).filter(Boolean);
}

/** Mã bài hợp lệ là "Quyển-Bài": quyển 1..7, bài 1..10. */
function maBaiHopLe(ma) {
  const m = chuoi(ma).match(/^([1-7])-(\d{1,2})$/);
  if (!m) return false;
  const bai = Number(m[2]);
  return bai >= 1 && bai <= DAOTAO_SO_BAI_MOI_QUYEN;
}

/** 10 mã bài của một quyển: 3 -> ['3-1', ..., '3-10']. */
function maCuaQuyen(q) {
  const ds = [];
  for (let b = 1; b <= DAOTAO_SO_BAI_MOI_QUYEN; b++) ds.push(q + '-' + b);
  return ds;
}

/** Cả 70 mã bài, theo đúng thứ tự quyển rồi bài. */
function taoTatCaMaBai() {
  const ds = [];
  for (let q = 1; q <= DAOTAO_SO_QUYEN; q++) ds.push(...maCuaQuyen(q));
  return ds;
}

function phanTramTron(thucTe, tong) {
  if (!tong) return 0;
  return Math.round((thucTe / tong) * 1000) / 10;
}

/** Sắp xếp tên tiếng Việt cho đúng dấu. */
function soSanhTiengViet(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'vi');
}

/**
 * Mảnh SQL: lấy chuỗi mã của một cột và bọc dấu phẩy ở hai đầu,
 * ví dụ cột đang là "1-1,1-2" thì cho ra ",1-1,1-2,".
 * Bọc như vậy để tìm/xoá một mã luôn khớp trọn vẹn (",1-1," chứ không dính
 * nhầm "11-1"). Đồng thời bỏ hết khoảng trắng và coi ô trống như chuỗi rỗng.
 */
function bocPhay(cot) {
  return `(',' || replace(coalesce(${cot}, ''), ' ', '') || ',')`;
}

/**
 * Danh sách thành viên (roster) — dùng CHUNG với tab Giáo dục, đúng như bản cũ
 * (getGiaoDucMembers): mỗi cặp Khu vực + Tên xuất hiện trong bảng Giáo dục là
 * một thành viên. Ở đây đọc thẳng bảng `giao_duc_thanh_vien` để nhóm hàm này
 * không phụ thuộc vào file handler Giáo dục (bạn khác đang viết).
 */
async function layDanhSachThanhVien(db) {
  const rows = await db.all(
    `SELECT DISTINCT khu_vuc, ten FROM giao_duc_thanh_vien
      WHERE trim(coalesce(khu_vuc,'')) <> '' AND trim(coalesce(ten,'')) <> ''`
  );
  const ds = rows.map((r) => ({ khuVuc: chuoi(r.khu_vuc), ten: chuoi(r.ten) }));
  ds.sort((a, b) => (a.khuVuc !== b.khuVuc ? soSanhTiengViet(a.khuVuc, b.khuVuc) : soSanhTiengViet(a.ten, b.ten)));
  return ds;
}

// =====================================================================
// (A) ĐÀO TẠO — giáo trình "Đứng lớp" 70 bài
// =====================================================================

/**
 * Đánh dấu Đã học / Chưa học MỘT bài cho một thành viên (bấm ô trong lưới).
 * hoanThanh = true  -> thêm mã bài vào danh sách (đã có rồi thì thôi)
 * hoanThanh = false -> bỏ mã bài ra khỏi danh sách
 *
 * Cả việc "đọc chuỗi cũ - sửa - ghi lại" nằm gọn trong 1 câu lệnh, nên hai
 * người tích hai ô khác nhau cùng lúc thì cả hai ô đều được lưu.
 */
export async function toggleDaoTaoBai({ db }, khuVuc, ten, maBai, hoanThanh) {
  const kv = batBuoc(khuVuc, 'Khu vực');
  const tenTV = batBuoc(ten, 'tên thành viên');
  const ma = chuoi(maBai);
  if (!maBaiHopLe(ma)) {
    throw new Error('Mã bài không hợp lệ: "' + ma + '" (phải dạng "Quyển-Bài", ví dụ "3-7").');
  }
  const bat = !!hoanThanh;
  const W = bocPhay('bai_da_hoc');

  // Thêm: nếu mã đã có trong chuỗi thì giữ nguyên, chưa có thì nối vào cuối.
  // Bỏ: thay ",<mã>," bằng "," rồi cắt dấu phẩy thừa ở hai đầu.
  // Vì sao lồng replace 3 lần khi BỎ tích: lệnh replace của SQLite quét một
  // lượt từ trái sang, nên hai mã giống nhau NẰM SÁT NHAU (",1-1,1-1,") chỉ bị
  // xoá một cái — dấu phẩy ở giữa đã bị lượt đầu "ăn" mất. Dữ liệu nhập từ
  // Google Sheets cũ có thể có mã trùng như vậy (API mới thì không bao giờ tạo
  // ra). Lồng 3 lần là dọn sạch trong mọi trường hợp thực tế.
  const bieuThuc = bat
    ? `CASE WHEN instr(${W}, ',' || ? || ',') > 0 THEN trim(${W}, ',')
            ELSE trim(${W} || ? || ',', ',') END`
    : `trim(replace(replace(replace(${W}, ',' || ? || ',', ','), ',' || ? || ',', ','), ',' || ? || ',', ','), ',')`;
  const thamSoBieuThuc = bat ? [ma, ma] : [ma, ma, ma];

  await db.run(
    `INSERT INTO dao_tao_tien_do (khu_vuc, ten, bai_da_hoc) VALUES (?,?,?)
     ON CONFLICT (khu_vuc, ten) DO UPDATE SET bai_da_hoc = ${bieuThuc}`,
    [kv, tenTV, bat ? ma : '', ...thamSoBieuThuc]
  );

  // Đọc lại chỉ để báo số bài cho giao diện (giao diện đã tự cập nhật sẵn).
  const soBai = await demBaiDaHoc(db, kv, tenTV);
  return { success: true, soBai, phanTram: phanTramTron(soBai, DAOTAO_TONG_BAI) };
}

async function demBaiDaHoc(db, kv, ten) {
  const r = await db.first('SELECT bai_da_hoc FROM dao_tao_tien_do WHERE khu_vuc = ? AND ten = ?', [kv, ten]);
  return r ? tachDanhSach(r.bai_da_hoc).length : 0;
}

/**
 * "Chọn tất cả" / "Bỏ chọn tất cả" 70 bài — ghi thẳng cả danh sách trong 1
 * lượt, không cần đọc chuỗi cũ nên không có chuyện đè nhau.
 */
export async function setDaoTaoBaiAll({ db }, khuVuc, ten, hoanThanh) {
  const kv = batBuoc(khuVuc, 'Khu vực');
  const tenTV = batBuoc(ten, 'tên thành viên');
  const danhSach = hoanThanh ? taoTatCaMaBai() : [];
  const chuoiBai = danhSach.join(',');

  await db.run(
    `INSERT INTO dao_tao_tien_do (khu_vuc, ten, bai_da_hoc) VALUES (?,?,?)
     ON CONFLICT (khu_vuc, ten) DO UPDATE SET bai_da_hoc = excluded.bai_da_hoc`,
    [kv, tenTV, chuoiBai]
  );
  return { success: true, soBai: danhSach.length, phanTram: phanTramTron(danhSach.length, DAOTAO_TONG_BAI) };
}

/**
 * "Chọn cả quyển" / "Bỏ chọn cả quyển" — chỉ đụng 10 bài của quyển đó,
 * GIỮ NGUYÊN các bài đã đánh dấu ở quyển khác.
 * Cách làm trong 1 câu lệnh: xoá lần lượt 10 mã của quyển ra khỏi chuỗi
 * (replace lồng nhau), sau đó nếu là "chọn" thì nối 10 mã đó vào cuối.
 */
export async function setDaoTaoQuyenAll({ db }, khuVuc, ten, quyen, hoanThanh) {
  const kv = batBuoc(khuVuc, 'Khu vực');
  const tenTV = batBuoc(ten, 'tên thành viên');
  const q = Number(quyen);
  if (!(q >= 1 && q <= DAOTAO_SO_QUYEN)) throw new Error('Quyển không hợp lệ: ' + quyen);
  const maQuyen = maCuaQuyen(q);
  const bat = !!hoanThanh;

  // Chuỗi còn lại sau khi bỏ hết 10 mã của quyển này (vẫn còn dấu phẩy 2 đầu).
  let conLai = bocPhay('bai_da_hoc');
  for (let i = 0; i < maQuyen.length; i++) conLai = `replace(${conLai}, ',' || ? || ',', ',')`;
  const thamSoXoa = maQuyen.slice();

  // Bật -> nối 10 mã vào cuối; Tắt -> chỉ cắt dấu phẩy thừa ở hai đầu.
  const bieuThuc = bat ? `trim(${conLai} || ?, ',')` : `trim(${conLai}, ',')`;
  const thamSoBieuThuc = bat ? [...thamSoXoa, maQuyen.join(',')] : thamSoXoa;

  await db.run(
    `INSERT INTO dao_tao_tien_do (khu_vuc, ten, bai_da_hoc) VALUES (?,?,?)
     ON CONFLICT (khu_vuc, ten) DO UPDATE SET bai_da_hoc = ${bieuThuc}`,
    [kv, tenTV, bat ? maQuyen.join(',') : '', ...thamSoBieuThuc]
  );

  const soBai = await demBaiDaHoc(db, kv, tenTV);
  return { success: true, soBai, phanTram: phanTramTron(soBai, DAOTAO_TONG_BAI) };
}

/** Cấp chứng chỉ "Đứng lớp" — chỉ khi đã đủ trọn 70/70 bài. */
export async function capChungChiDaoTao({ db }, khuVuc, ten) {
  const kv = batBuoc(khuVuc, 'Khu vực');
  const tenTV = batBuoc(ten, 'tên thành viên');

  const dong = await db.first(
    'SELECT bai_da_hoc, ngay_cap_chung_chi FROM dao_tao_tien_do WHERE khu_vuc = ? AND ten = ?',
    [kv, tenTV]
  );
  if (!dong) throw new Error('Thành viên chưa có tiến độ nào để cấp chứng chỉ.');
  const soBai = tachDanhSach(dong.bai_da_hoc).length;
  if (soBai < DAOTAO_TONG_BAI) {
    throw new Error('Chưa đủ điều kiện — mới hoàn thành ' + soBai + '/' + DAOTAO_TONG_BAI + ' bài.');
  }

  // Điều kiện "đủ 70 bài" được kiểm lại NGAY TRONG câu lệnh ghi (đếm số mã =
  // số dấu phẩy + 1), phòng khi vừa lúc đó có người bỏ tích bớt bài.
  const ngay = homNay();
  await db.run(
    `UPDATE dao_tao_tien_do SET ngay_cap_chung_chi = ?
      WHERE khu_vuc = ? AND ten = ?
        AND (length(trim(${bocPhay('bai_da_hoc')}, ',')) -
             length(replace(trim(${bocPhay('bai_da_hoc')}, ','), ',', '')) + 1) >= ?`,
    [ngay, kv, tenTV, DAOTAO_TONG_BAI]
  );

  const sau = await db.first(
    'SELECT ngay_cap_chung_chi FROM dao_tao_tien_do WHERE khu_vuc = ? AND ten = ?',
    [kv, tenTV]
  );
  const ngayCap = chuanNgay(sau && sau.ngay_cap_chung_chi);
  if (!ngayCap) throw new Error('Chưa cấp được chứng chỉ — tiến độ vừa thay đổi, xin tải lại và thử lại.');
  return { success: true, ngayCap };
}

/**
 * Toàn bộ tiến độ 70 bài của MỌI khu vực trong một lần đọc.
 * Trả về { "<Khu vực>": [ {ten, baiDaHoc, soBai, phanTram, ngayCapChungChi} ] }
 * Danh sách thành viên lấy CHUNG với tab Giáo dục (giống bản cũ).
 */
export async function getDaoTaoTienDoAll({ db }) {
  const [roster, tienDo] = await Promise.all([
    layDanhSachThanhVien(db),
    db.all('SELECT khu_vuc, ten, bai_da_hoc, ngay_cap_chung_chi FROM dao_tao_tien_do'),
  ]);

  const bang = new Map(); // "Khu vực||Tên" -> { baiDaHoc, ngayCap }
  for (const r of tienDo) {
    const kv = chuoi(r.khu_vuc);
    const ten = chuoi(r.ten);
    if (!kv || !ten) continue;
    bang.set(kv + '||' + ten, {
      baiDaHoc: tachDanhSach(r.bai_da_hoc),
      ngayCap: chuanNgay(r.ngay_cap_chung_chi),
    });
  }

  const ketQua = {};
  for (const tv of roster) {
    const p = bang.get(tv.khuVuc + '||' + tv.ten) || { baiDaHoc: [], ngayCap: '' };
    if (!ketQua[tv.khuVuc]) ketQua[tv.khuVuc] = [];
    ketQua[tv.khuVuc].push({
      ten: tv.ten,
      baiDaHoc: p.baiDaHoc,
      soBai: p.baiDaHoc.length,
      phanTram: phanTramTron(p.baiDaHoc.length, DAOTAO_TONG_BAI),
      ngayCapChungChi: p.ngayCap || '',
    });
  }
  return ketQua;
}

// =====================================================================
// (B) ĐÀO TẠO — việc giao trong tuần/tháng
//
// ⚠️ "row" không còn là số dòng của Google Sheet nữa. Bảng mới có cột `id` tự
// tăng, nên tham số `row` mà giao diện gửi lên chính là `id` của việc đó.
// Hàm đọc getDaoTaoViecList trả về trường `row` = `id` để giao diện gửi lại
// đúng giá trị này khi bấm Sửa / Xóa / ✓ Xong.
// =====================================================================

function kiemTraViecGiao(data) {
  const d = data || {};
  const khuVuc = chuoi(d.khuVuc);
  const ten = chuoi(d.ten);
  const noiDung = chuoi(d.noiDung);
  if (!khuVuc) throw new Error('Vui lòng chọn Khu vực.');
  if (!ten) throw new Error('Vui lòng chọn Thành viên.');
  if (!noiDung) throw new Error('Vui lòng nhập Nội dung công việc.');
  const trangThai = chuoi(d.trangThai);
  if (trangThai && !DAOTAO_VIEC_TRANGTHAI_LIST.includes(trangThai)) {
    throw new Error('Trạng thái không hợp lệ.');
  }
  return {
    khuVuc,
    ten,
    noiDung,
    ngayGiao: chuanNgay(d.ngayGiao),
    hanHoanThanh: chuanNgay(d.hanHoanThanh),
    trangThai: trangThai || DAOTAO_VIEC_TRANGTHAI_LIST[0],
  };
}

/** Giao một việc mới. */
export async function addDaoTaoViec({ db }, data) {
  const v = kiemTraViecGiao(data);
  await db.run(
    `INSERT INTO dao_tao_viec_giao (khu_vuc, ten, noi_dung, ngay_giao, han_hoan_thanh, trang_thai)
     VALUES (?,?,?,?,?,?)`,
    [v.khuVuc, v.ten, v.noiDung, v.ngayGiao, v.hanHoanThanh, v.trangThai]
  );
  return { success: true };
}

/** Sửa một việc đã giao. `row` chính là `id` của việc đó. */
export async function updateDaoTaoViec({ db }, row, data) {
  const id = Number(row);
  if (!Number.isFinite(id) || id <= 0) throw new Error('Không rõ việc cần sửa — xin tải lại trang rồi thử lại.');
  const v = kiemTraViecGiao(data);

  const co = await db.first('SELECT id FROM dao_tao_viec_giao WHERE id = ?', [id]);
  if (!co) throw new Error('Việc này không còn nữa (có thể ai đó vừa xóa) — xin tải lại trang.');

  await db.run(
    `UPDATE dao_tao_viec_giao
        SET khu_vuc = ?, ten = ?, noi_dung = ?, ngay_giao = ?, han_hoan_thanh = ?, trang_thai = ?
      WHERE id = ?`,
    [v.khuVuc, v.ten, v.noiDung, v.ngayGiao, v.hanHoanThanh, v.trangThai, id]
  );
  return { success: true };
}

/** Xóa một việc đã giao. `row` chính là `id`. Xóa cái đã mất thì coi như xong. */
export async function deleteDaoTaoViec({ db }, row) {
  const id = Number(row);
  if (!Number.isFinite(id) || id <= 0) throw new Error('Không rõ việc cần xóa — xin tải lại trang rồi thử lại.');
  await db.run('DELETE FROM dao_tao_viec_giao WHERE id = ?', [id]);
  return { success: true };
}

/**
 * Danh sách việc đã giao. Bỏ trống Khu vực = lấy tất cả.
 * Sắp theo Hạn hoàn thành (chưa có hạn thì xuống cuối) rồi tới Ngày giao.
 */
export async function getDaoTaoViecList({ db }, khuVuc) {
  const kv = chuoi(khuVuc);
  const dieuKien = kv ? 'AND trim(khu_vuc) = ?' : '';
  const thamSo = kv ? [kv] : [];

  const rows = await db.all(
    `SELECT id, khu_vuc, ten, noi_dung, ngay_giao, han_hoan_thanh, trang_thai
       FROM dao_tao_viec_giao
      WHERE trim(coalesce(noi_dung,'')) <> '' ${dieuKien}
      ORDER BY CASE WHEN trim(coalesce(han_hoan_thanh,'')) = '' THEN '9999-99-99'
                    ELSE han_hoan_thanh END,
               coalesce(ngay_giao,''), id`,
    thamSo
  );

  return rows.map((r) => ({
    row: r.id, // "row" ở đây là id của bản ghi — giao diện gửi lại chính số này
    khuVuc: chuoi(r.khu_vuc),
    ten: chuoi(r.ten),
    noiDung: chuoi(r.noi_dung),
    ngayGiao: chuanNgay(r.ngay_giao),
    hanHoanThanh: chuanNgay(r.han_hoan_thanh),
    trangThai: chuoi(r.trang_thai) || DAOTAO_VIEC_TRANGTHAI_LIST[0],
  }));
}

// =====================================================================
// (C) LỄ HỘI
//
// Mỗi lễ hội là 1 dòng cấu hình (mã, tên, ngày bắt đầu/kết thúc, danh sách
// bài áp dụng, số lần phải phát biểu mỗi bài). Thêm lễ hội mới = thêm 1 dòng
// vào bảng `le_hoi_cau_hinh`, KHÔNG phải sửa mã nguồn.
// Tiến độ lưu dạng "<mã bài>#<lần>", ví dụ "4-6#1,4-6#2,4-6#3".
// =====================================================================

/** Đọc toàn bộ cấu hình lễ hội, sắp theo ngày bắt đầu. Bảng rỗng -> mảng rỗng. */
async function layCauHinhLeHoi(db) {
  const rows = await db.all(
    `SELECT ma_le_hoi, ten_le_hoi, ngay_bat_dau, ngay_ket_thuc, danh_sach_bai, so_lan_yeu_cau
       FROM le_hoi_cau_hinh`
  );
  const ds = [];
  for (const r of rows) {
    const ma = chuoi(r.ma_le_hoi);
    if (!ma) continue;
    ds.push({
      ma,
      ten: chuoi(r.ten_le_hoi),
      ngayBatDau: chuanNgay(r.ngay_bat_dau),
      ngayKetThuc: chuanNgay(r.ngay_ket_thuc),
      danhSachBai: tachDanhSach(r.danh_sach_bai),
      soLanYeuCau: Number(r.so_lan_yeu_cau) || LEHOI_SO_LAN_MAC_DINH,
    });
  }
  // Ngày dạng "yyyy-MM-dd" nên so sánh chuỗi là đúng thứ tự thời gian.
  ds.sort((a, b) => (a.ngayBatDau < b.ngayBatDau ? -1 : a.ngayBatDau > b.ngayBatDau ? 1 : 0));
  return ds;
}

async function timCauHinhLeHoi(db, maLeHoi) {
  const ma = chuoi(maLeHoi);
  const ds = await layCauHinhLeHoi(db);
  return ds.find((lh) => lh.ma === ma) || null;
}

function goiCauHinhVeGiaoDien(lh) {
  return {
    ma: lh.ma,
    ten: lh.ten,
    ngayBatDau: lh.ngayBatDau,
    ngayKetThuc: lh.ngayKetThuc,
    danhSachBai: lh.danhSachBai,
    soLanYeuCau: lh.soLanYeuCau,
  };
}

/**
 * Lễ hội đang diễn ra HÔM NAY (trùng nhiều thì lấy cái bắt đầu sớm nhất).
 * Chưa có lễ hội nào (bảng cấu hình còn trống) -> trả về null, KHÔNG báo lỗi.
 */
export async function getLeHoiActive({ db }) {
  const ds = await layCauHinhLeHoi(db);
  const nay = homNay();
  const dangDienRa = ds.filter((lh) => lh.ngayBatDau && lh.ngayKetThuc && nay >= lh.ngayBatDau && nay <= lh.ngayKetThuc);
  if (!dangDienRa.length) return null;
  return goiCauHinhVeGiaoDien(dangDienRa[0]);
}

/**
 * Dùng cho banner ở trang Tổng quan: đang diễn ra thì trả lễ hội đó
 * (trangThai 'active'); không có thì trả lễ hội SẮP tới gần nhất
 * (trangThai 'upcoming'); không có cả hai -> null (giao diện ẩn banner).
 */
export async function getLeHoiBanner({ db }) {
  const ds = await layCauHinhLeHoi(db);
  const nay = homNay();
  const dangDienRa = ds.find((lh) => lh.ngayBatDau && lh.ngayKetThuc && nay >= lh.ngayBatDau && nay <= lh.ngayKetThuc);
  // Danh sách đã sắp theo ngày bắt đầu nên cái đầu tiên chính là gần nhất.
  const sapToi = ds.find((lh) => lh.ngayBatDau && lh.ngayBatDau > nay);
  const lh = dangDienRa || sapToi;
  if (!lh) return null;
  return { ...goiCauHinhVeGiaoDien(lh), trangThai: dangDienRa ? 'active' : 'upcoming' };
}

/**
 * Toàn bộ tiến độ của MỘT lễ hội, gom theo Khu vực:
 * { "<Khu vực>": [ {ten, theoBai:{"4-6":2}, theoBaiLan:{"4-6":[1,2]},
 *                   soLanDaPhat, tongSoLanYeuCau, phanTram, ngayHoanThanh} ] }
 * theoBaiLan cho biết CHÍNH XÁC những "lần" nào đã tích (giao diện đọc trường
 * này để vẽ đúng ô đã tích, chứ không chỉ đếm số lượng).
 */
export async function getLeHoiTienDoAll({ db }, maLeHoi) {
  const cauHinh = await timCauHinhLeHoi(db, maLeHoi);
  if (!cauHinh) throw new Error('Không tìm thấy lễ hội: ' + chuoi(maLeHoi));

  const [roster, tienDo] = await Promise.all([
    layDanhSachThanhVien(db),
    db.all(
      'SELECT khu_vuc, ten, da_phat_bieu, ngay_hoan_thanh FROM le_hoi_tien_do WHERE ma_le_hoi = ?',
      [cauHinh.ma]
    ),
  ]);

  const bang = new Map(); // "Khu vực||Tên" -> { daPhat: [...], ngayHoanThanh }
  for (const r of tienDo) {
    const kv = chuoi(r.khu_vuc);
    const ten = chuoi(r.ten);
    if (!kv || !ten) continue;
    bang.set(kv + '||' + ten, {
      daPhat: tachDanhSach(r.da_phat_bieu),
      ngayHoanThanh: chuanNgay(r.ngay_hoan_thanh),
    });
  }

  const tongSoLanYeuCau = cauHinh.danhSachBai.length * cauHinh.soLanYeuCau;
  const ketQua = {};
  for (const tv of roster) {
    const p = bang.get(tv.khuVuc + '||' + tv.ten) || { daPhat: [], ngayHoanThanh: '' };
    const theoBai = {};
    const theoBaiLan = {};
    for (const ma of cauHinh.danhSachBai) {
      const cacLan = [];
      for (let lan = 1; lan <= cauHinh.soLanYeuCau; lan++) {
        if (p.daPhat.includes(ma + '#' + lan)) cacLan.push(lan);
      }
      theoBai[ma] = cacLan.length;
      theoBaiLan[ma] = cacLan;
    }
    if (!ketQua[tv.khuVuc]) ketQua[tv.khuVuc] = [];
    ketQua[tv.khuVuc].push({
      ten: tv.ten,
      theoBai,
      theoBaiLan,
      soLanDaPhat: p.daPhat.length,
      tongSoLanYeuCau,
      phanTram: phanTramTron(p.daPhat.length, tongSoLanYeuCau),
      ngayHoanThanh: p.ngayHoanThanh || '',
    });
  }
  return ketQua;
}

/**
 * Bảng xếp hạng toàn bộ (gộp mọi Khu vực): ai hoàn thành đủ TRƯỚC thì hạng
 * cao hơn (theo Ngày hoàn thành); chưa xong thì xếp theo % giảm dần.
 */
export async function getLeHoiXepHang(ctx, maLeHoi) {
  const tatCa = await getLeHoiTienDoAll(ctx, maLeHoi);
  const phang = [];
  for (const kv of Object.keys(tatCa)) {
    for (const m of tatCa[kv]) {
      phang.push({
        ten: m.ten,
        khuVuc: kv,
        soLanDaPhat: m.soLanDaPhat,
        tongSoLanYeuCau: m.tongSoLanYeuCau,
        phanTram: m.phanTram,
        ngayHoanThanh: m.ngayHoanThanh,
      });
    }
  }
  phang.sort((a, b) => {
    const aXong = !!a.ngayHoanThanh;
    const bXong = !!b.ngayHoanThanh;
    if (aXong && bXong) {
      if (a.ngayHoanThanh !== b.ngayHoanThanh) return a.ngayHoanThanh < b.ngayHoanThanh ? -1 : 1;
    } else if (aXong !== bXong) {
      return aXong ? -1 : 1;
    } else if (b.phanTram !== a.phanTram) {
      return b.phanTram - a.phanTram;
    }
    return soSanhTiengViet(a.ten, b.ten);
  });
  return phang;
}

/**
 * Tích / bỏ tích MỘT ô (một bài, một lần cụ thể) của một thành viên.
 *
 * ⚠️ Đây đúng là chỗ từng làm "15/15 lùi về 13/15". Cách viết ở đây:
 *   - Lệnh 1: sửa chuỗi "đã phát biểu" ngay bên trong CSDL (không mang chuỗi
 *     cũ về rồi ghi đè lại), nên hai người bấm cùng lúc không xoá công nhau.
 *   - Lệnh 2: tự tính lại "Ngày hoàn thành" dựa trên chuỗi VỪA ĐƯỢC sửa.
 * Hai lệnh chạy chung một lượt db.batch nên luôn đi cùng nhau.
 */
export async function toggleLeHoiLan({ db }, maLeHoi, khuVuc, ten, maBai, lan, daPhat) {
  const ma = chuoi(maLeHoi);
  if (!ma) throw new Error('Thiếu mã lễ hội.');
  const kv = batBuoc(khuVuc, 'Khu vực');
  const tenTV = batBuoc(ten, 'tên thành viên');

  const cauHinh = await timCauHinhLeHoi(db, ma);
  if (!cauHinh) throw new Error('Không tìm thấy lễ hội: ' + ma);
  const maB = chuoi(maBai);
  if (!cauHinh.danhSachBai.includes(maB)) throw new Error('Bài không thuộc lễ hội này: ' + maB);
  const soLan = Number(lan);
  if (!(soLan >= 1 && soLan <= cauHinh.soLanYeuCau)) throw new Error('Lần không hợp lệ: ' + lan);

  const code = maB + '#' + soLan;
  const bat = !!daPhat;
  const tongSoLanYeuCau = cauHinh.danhSachBai.length * cauHinh.soLanYeuCau;
  const W = bocPhay('da_phat_bieu');

  // Lồng replace 3 lần khi BỎ tích — xem lời giải thích ở toggleDaoTaoBai.
  const bieuThuc = bat
    ? `CASE WHEN instr(${W}, ',' || ? || ',') > 0 THEN trim(${W}, ',')
            ELSE trim(${W} || ? || ',', ',') END`
    : `trim(replace(replace(replace(${W}, ',' || ? || ',', ','), ',' || ? || ',', ','), ',' || ? || ',', ','), ',')`;
  const thamSoBieuThuc = bat ? [code, code] : [code, code, code];

  // Dòng mới: nếu vừa tích 1 ô mà lễ hội chỉ cần đúng 1 lần thì coi như xong luôn.
  const ngayNay = homNay();
  const ngayHoanThanhBanDau = bat && tongSoLanYeuCau <= 1 ? ngayNay : '';

  await db.batch([
    {
      sql: `INSERT INTO le_hoi_tien_do (ma_le_hoi, khu_vuc, ten, da_phat_bieu, ngay_hoan_thanh)
            VALUES (?,?,?,?,?)
            ON CONFLICT (ma_le_hoi, khu_vuc, ten) DO UPDATE SET da_phat_bieu = ${bieuThuc}`,
      params: [ma, kv, tenTV, bat ? code : '', ngayHoanThanhBanDau, ...thamSoBieuThuc],
    },
    {
      // Đếm số mã trong chuỗi = số dấu phẩy + 1 (chuỗi rỗng thì đếm 0).
      // Đủ số lần yêu cầu -> ghi ngày hoàn thành (chỉ ghi lần đầu, không đè
      // ngày cũ); tụt xuống dưới mức đủ -> xoá ngày đi.
      sql: `UPDATE le_hoi_tien_do
               SET ngay_hoan_thanh = CASE
                     WHEN (CASE WHEN trim(coalesce(da_phat_bieu,'')) = '' THEN 0
                                ELSE length(da_phat_bieu) - length(replace(da_phat_bieu, ',', '')) + 1 END) >= ?
                     THEN CASE WHEN trim(coalesce(ngay_hoan_thanh,'')) = '' THEN ? ELSE ngay_hoan_thanh END
                     ELSE '' END
             WHERE ma_le_hoi = ? AND khu_vuc = ? AND ten = ?`,
      params: [tongSoLanYeuCau, ngayNay, ma, kv, tenTV],
    },
  ]);

  const sau = await db.first(
    'SELECT da_phat_bieu FROM le_hoi_tien_do WHERE ma_le_hoi = ? AND khu_vuc = ? AND ten = ?',
    [ma, kv, tenTV]
  );
  return { success: true, soLanDaPhat: sau ? tachDanhSach(sau.da_phat_bieu).length : 0 };
}
