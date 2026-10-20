// =====================================================================
// Nhóm hàm: Thực hiện kế hoạch theo từng mảng và từng tuần (ket_qua_muc)
//
// Mỗi khu vực trong một tháng và một mảng công việc (5 mảng: 'tp',
// 'trudo', 'edu', 'daotao', 'lehoi') có các bản ghi kết quả thực hiện
// theo từng tuần (1..6) và Tổng kết tháng (tuan = 0), gồm 2 trường:
//   - da_lam:   Đã làm được
//   - chua_lam: Chưa làm được, vì sao
//
// Phân quyền:
//   - Đọc 1 khu vực (getKetQuaMuc): chỉ Chủ/Admin hoặc người có khu vực nằm
//     trong phạm vi phụ trách (duocXemKhuVuc). Kiểm tra trực tiếp trong hàm
//     trước khi chạm CSDL vì nội dung "chưa làm được, vì sao" nhạy cảm.
//   - Ghi (saveKetQuaMuc): chỉ Chủ/Admin hoặc người có khu vực nằm trong
//     phạm vi phụ trách (duocXemKhuVuc).
//   - Đọc gộp toàn Si-ôn (getAllKetQuaMuc): chỉ Chủ/Admin (chuThoi: true).
// =====================================================================

import { batBuoc, chuoi, homNay, kiemTraThang } from '../tien-ich.js';
import { cacTuanCuaThang, tuanCuaNgay } from '../lich-tuan.js';
import { duocXemKhuVuc, tachPhamVi } from '../auth.js';

export const CAC_MUC_HOP_LE = ['tp', 'trudo', 'edu', 'daotao', 'lehoi'];

/**
 * Chuẩn hoá đối tượng người gọi để tương thích cả định dạng từ router
 * ({ laChu, phamVi }) lẫn đối tượng truyền trực tiếp trong kiểm thử
 * ({ la_chu: 1, pham_vi: 'K My' }).
 */
function chuanHoaNguoiGoi_(nguoiGoi) {
  if (!nguoiGoi) return null;
  const laChu = !!(nguoiGoi.laChu || Number(nguoiGoi.la_chu) === 1);
  const phamVi = Array.isArray(nguoiGoi.phamVi)
    ? nguoiGoi.phamVi
    : tachPhamVi(nguoiGoi.phamVi !== undefined ? nguoiGoi.phamVi : nguoiGoi.pham_vi);
  return {
    email: chuoi(nguoiGoi.email),
    laChu,
    phamVi,
  };
}

/**
 * Kiểm tra định dạng tháng yyyy-MM và phần tháng 01..12.
 */
function kiemThang_(thang) {
  const t = chuoi(thang);
  if (!kiemTraThang(t)) {
    throw new Error('Tháng không hợp lệ (cần định dạng yyyy-MM): "' + t + '"');
  }
  const mm = Number(t.slice(5, 7));
  if (!Number.isInteger(mm) || mm < 1 || mm > 12) {
    throw new Error('Tháng không hợp lệ (tháng phải từ 01 đến 12): "' + t + '"');
  }
  return t;
}

/**
 * Kiểm tra tham số mảng công việc (muc): bắt buộc truyền và phải nằm trong
 * 5 mảng hợp lệ ('tp', 'trudo', 'edu', 'daotao', 'lehoi').
 */
function kiemMuc_(muc) {
  const m = chuoi(muc);
  if (!m) {
    throw new Error('Thiếu mảng công việc (cần chọn một trong: tp, trudo, edu, daotao, lehoi).');
  }
  if (!CAC_MUC_HOP_LE.includes(m)) {
    throw new Error('Mảng công việc không hợp lệ: "' + m + '" (chỉ chấp nhận: tp, trudo, edu, daotao, lehoi).');
  }
  return m;
}

/**
 * Kiểm tra tham số tuần: chỉ chấp nhận số nguyên 0 (Tổng kết tháng)
 * hoặc số tuần có mặt trong cacTuanCuaThang(thang) (1..N).
 */
function kiemTuan_(tuan, dsTuan) {
  if (tuan === null || tuan === undefined || typeof tuan === 'boolean' || typeof tuan === 'object') {
    throw new Error('Tuần không hợp lệ: "' + String(tuan) + '"');
  }
  if (typeof tuan === 'string' && tuan.trim() === '') {
    throw new Error('Tuần không hợp lệ: ""');
  }
  const n = Number(tuan);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('Tuần không hợp lệ: "' + String(tuan) + '"');
  }
  if (n === 0) return 0;
  const hopLe = Array.isArray(dsTuan) && dsTuan.some((w) => w.tuan === n);
  if (!hopLe) {
    const maxT = Array.isArray(dsTuan) && dsTuan.length ? dsTuan[dsTuan.length - 1].tuan : 0;
    throw new Error('Tuần không hợp lệ cho tháng này: "' + n + '" (chỉ chấp nhận 0 hoặc 1..' + maxT + ').');
  }
  return n;
}

/**
 * Đảm bảo bảng ket_qua_muc đã tồn tại trên CSDL (CHỈ gọi trong hàm GHI
 * saveKetQuaMuc để hàm ĐỌC tuyệt đối không phát sinh lệnh ghi).
 */
async function damBaoBang_(db) {
  await db.run(
    `CREATE TABLE IF NOT EXISTS ket_qua_muc (
      thang          TEXT NOT NULL,
      khu_vuc        TEXT NOT NULL,
      muc            TEXT NOT NULL,
      tuan           INTEGER NOT NULL,
      da_lam         TEXT NOT NULL DEFAULT '',
      chua_lam       TEXT NOT NULL DEFAULT '',
      nguoi_cap_nhat TEXT,
      cap_nhat_luc   TEXT,
      PRIMARY KEY (thang, khu_vuc, muc, tuan)
    )`
  );
  await db.run('CREATE INDEX IF NOT EXISTS ix_kqm_thang ON ket_qua_muc (thang)');
}

/**
 * Nhận diện lỗi "chưa có bảng ket_qua_muc" khi CSDL chưa kịp chạy lệnh tạo bảng.
 */
function laLoiChuaCoBang_(err) {
  const msg = String((err && err.message) || err || '');
  return /no such table/i.test(msg) && /ket_qua_muc/i.test(msg);
}

/**
 * Đọc kết quả thực hiện của 1 khu vực trong 1 tháng và 1 mảng công việc
 * cho toàn bộ các tuần trong tháng và Tổng kết tháng (tuan = 0).
 * Chỉ Chủ/Admin hoặc người phụ trách khu vực đó mới được xem (kiểm tra trước
 * khi chạm vào CSDL). Hàm thuần ĐỌC: không chạy bất kỳ lệnh ghi/DDL nào.
 */
export async function getKetQuaMuc({ db, nguoiGoi }, thang, khuVuc, muc) {
  const t = kiemThang_(thang);
  const kv = batBuoc(khuVuc, 'Khu vực');
  const m = kiemMuc_(muc);

  const nguoi = chuanHoaNguoiGoi_(nguoiGoi);
  if (!nguoi || !duocXemKhuVuc(nguoi, kv)) {
    throw new Error('Bạn không có quyền xem kết quả thực hiện của khu vực "' + kv + '".');
  }

  const dsTuan = cacTuanCuaThang(t);
  const hn = homNay();
  const tuanHienTai = hn.slice(0, 7) === t ? tuanCuaNgay(hn) : 0;

  let rows = [];
  try {
    rows = await db.all(
      'SELECT tuan, da_lam, chua_lam, nguoi_cap_nhat, cap_nhat_luc FROM ket_qua_muc WHERE thang = ? AND khu_vuc = ? AND muc = ? ORDER BY tuan',
      [t, kv, m]
    );
  } catch (e) {
    if (laLoiChuaCoBang_(e)) {
      rows = [];
    } else {
      throw e;
    }
  }

  const theoTuan = new Map();
  for (const r of (rows || [])) {
    theoTuan.set(Number(r.tuan), r);
  }

  const tuan = dsTuan.map((w) => {
    const r = theoTuan.get(w.tuan);
    return {
      tuan: w.tuan,
      tuNgay: w.tuNgay,
      denNgay: w.denNgay,
      daLam: r ? (r.da_lam || '') : '',
      chuaLam: r ? (r.chua_lam || '') : '',
      nguoiCapNhat: r ? (r.nguoi_cap_nhat || '') : '',
      capNhatLuc: r ? (r.cap_nhat_luc || '') : '',
    };
  });

  const r0 = theoTuan.get(0);
  const tongKet = {
    daLam: r0 ? (r0.da_lam || '') : '',
    chuaLam: r0 ? (r0.chua_lam || '') : '',
    nguoiCapNhat: r0 ? (r0.nguoi_cap_nhat || '') : '',
    capNhatLuc: r0 ? (r0.cap_nhat_luc || '') : '',
  };

  return {
    thang: t,
    khuVuc: kv,
    muc: m,
    tuanHienTai,
    tuan,
    tongKet,
  };
}

/**
 * Lưu (thêm mới hoặc cập nhật) kết quả thực hiện của 1 khu vực trong 1 tháng,
 * 1 mảng công việc và 1 tuần (1..N hoặc 0 cho Tổng kết tháng).
 */
export async function saveKetQuaMuc({ db, nguoiGoi }, thang, khuVuc, muc, tuan, daLam, chuaLam) {
  const t = kiemThang_(thang);
  const kv = batBuoc(khuVuc, 'Khu vực');
  const m = kiemMuc_(muc);
  const dsTuan = cacTuanCuaThang(t);
  const soTuan = kiemTuan_(tuan, dsTuan);
  const da = chuoi(daLam);
  const chua = chuoi(chuaLam);

  const nguoi = chuanHoaNguoiGoi_(nguoiGoi);
  if (!nguoi || !duocXemKhuVuc(nguoi, kv)) {
    throw new Error('Bạn không có quyền chỉnh sửa kết quả thực hiện của khu vực "' + kv + '".');
  }

  await damBaoBang_(db);

  const email = chuoi(nguoi.email);
  const bayGio = new Date().toISOString();

  await db.run(
    `INSERT INTO ket_qua_muc (thang, khu_vuc, muc, tuan, da_lam, chua_lam, nguoi_cap_nhat, cap_nhat_luc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(thang, khu_vuc, muc, tuan) DO UPDATE SET
       da_lam = excluded.da_lam,
       chua_lam = excluded.chua_lam,
       nguoi_cap_nhat = excluded.nguoi_cap_nhat,
       cap_nhat_luc = excluded.cap_nhat_luc`,
    [t, kv, m, soTuan, da, chua, email, bayGio]
  );

  return {
    success: true,
    thang: t,
    khuVuc: kv,
    muc: m,
    tuan: soTuan,
    daLam: da,
    chuaLam: chua,
    nguoiCapNhat: email,
    capNhatLuc: bayGio,
  };
}

/**
 * Đọc toàn bộ kết quả thực hiện của mọi khu vực và mọi mảng trong 1 tháng.
 * Hàm thuần ĐỌC, chỉ dành cho Chủ/Admin (chuThoi: true).
 */
export async function getAllKetQuaMuc({ db }, thang) {
  const t = kiemThang_(thang);

  let rows = [];
  try {
    rows = await db.all(
      'SELECT thang, khu_vuc, muc, tuan, da_lam, chua_lam, nguoi_cap_nhat, cap_nhat_luc FROM ket_qua_muc WHERE thang = ? ORDER BY khu_vuc, muc, tuan',
      [t]
    );
  } catch (e) {
    if (laLoiChuaCoBang_(e)) {
      return { thang: t, danhSach: [], theoKhuVuc: {} };
    }
    throw e;
  }

  const theoKhuVuc = {};
  const danhSach = (rows || []).map((r) => {
    const kv = r.khu_vuc;
    const m = r.muc;
    const soTuan = Number(r.tuan);
    const item = {
      thang: r.thang,
      khuVuc: kv,
      muc: m,
      tuan: soTuan,
      daLam: r.da_lam || '',
      chuaLam: r.chua_lam || '',
      nguoiCapNhat: r.nguoi_cap_nhat || '',
      capNhatLuc: r.cap_nhat_luc || '',
    };
    if (!theoKhuVuc[kv]) theoKhuVuc[kv] = {};
    if (!theoKhuVuc[kv][m]) theoKhuVuc[kv][m] = {};
    theoKhuVuc[kv][m][soTuan] = {
      daLam: item.daLam,
      chuaLam: item.chuaLam,
      nguoiCapNhat: item.nguoiCapNhat,
      capNhatLuc: item.capNhatLuc,
    };
    return item;
  });

  return {
    thang: t,
    danhSach,
    theoKhuVuc,
  };
}
