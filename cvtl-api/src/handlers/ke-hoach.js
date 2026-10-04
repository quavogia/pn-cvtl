// =====================================================================
// Kế hoạch Tin Lành tháng theo từng Khu vực (thêm 04/10/2026).
//
// Bảng `ke_hoach_thang`:
//   thang          TEXT NOT NULL,
//   khu_vuc        TEXT NOT NULL,
//   noi_dung       TEXT NOT NULL,
//   nguoi_cap_nhat TEXT,
//   cap_nhat_luc   TEXT,
//   PRIMARY KEY (thang, khu_vuc)
// =====================================================================

import { kiemTraThang, batBuoc, chuoi } from '../tien-ich.js';
import { duocXemKhuVuc } from '../auth.js';

let daTaoBang_ = false;
async function damBaoBang_(db) {
  if (daTaoBang_) return;
  await db.run(
    `CREATE TABLE IF NOT EXISTS ke_hoach_thang (
      thang          TEXT NOT NULL,
      khu_vuc        TEXT NOT NULL,
      noi_dung       TEXT NOT NULL,
      nguoi_cap_nhat TEXT,
      cap_nhat_luc   TEXT,
      PRIMARY KEY (thang, khu_vuc)
    )`
  );
  await db.run(`CREATE INDEX IF NOT EXISTS ix_kht_thang ON ke_hoach_thang (thang)`);
  daTaoBang_ = true;
}

/** Đọc kế hoạch tháng của một khu vực. */
export async function getKeHoachThang({ db }, thang, khuVuc) {
  await damBaoBang_(db);
  const t = kiemTraThang(thang);
  const kv = batBuoc(khuVuc, 'Khu vực');

  const row = await db.first(
    'SELECT thang, khu_vuc, noi_dung, nguoi_cap_nhat, cap_nhat_luc FROM ke_hoach_thang WHERE thang = ? AND khu_vuc = ?',
    [t, kv]
  );
  if (!row) {
    return { thang: t, khuVuc: kv, noiDung: '', nguoiCapNhat: '', capNhatLuc: '' };
  }
  return {
    thang: chuoi(row.thang),
    khuVuc: chuoi(row.khu_vuc),
    noiDung: chuoi(row.noi_dung),
    nguoiCapNhat: chuoi(row.nguoi_cap_nhat),
    capNhatLuc: chuoi(row.cap_nhat_luc),
  };
}

/** Lưu kế hoạch tháng của một khu vực. */
export async function saveKeHoachThang({ db, nguoiGoi }, thang, khuVuc, noiDung) {
  await damBaoBang_(db);
  const t = kiemTraThang(thang);
  const kv = batBuoc(khuVuc, 'Khu vực');
  const nd = chuoi(noiDung);
  const nguoi = nguoiGoi
    ? {
        ...nguoiGoi,
        laChu: !!nguoiGoi.laChu || nguoiGoi.la_chu === 1 || nguoiGoi.email === 'rise.shine1948@gmail.com',
        phamVi: nguoiGoi.phamVi !== undefined ? nguoiGoi.phamVi : nguoiGoi.pham_vi,
      }
    : null;

  if (!duocXemKhuVuc(nguoi, kv)) {
    throw new Error('Bạn không có quyền sửa kế hoạch của khu vực "' + kv + '".');
  }

  const email = (nguoiGoi && nguoiGoi.email) || 'admin';
  const capNhatLuc = new Date().toISOString();

  await db.run(
    `INSERT INTO ke_hoach_thang (thang, khu_vuc, noi_dung, nguoi_cap_nhat, cap_nhat_luc)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (thang, khu_vuc) DO UPDATE SET
       noi_dung = excluded.noi_dung,
       nguoi_cap_nhat = excluded.nguoi_cap_nhat,
       cap_nhat_luc = excluded.cap_nhat_luc`,
    [t, kv, nd, email, capNhatLuc]
  );

  return {
    success: true,
    thang: t,
    khuVuc: kv,
    noiDung: nd,
    nguoiCapNhat: email,
    capNhatLuc,
  };
}

/** Đọc kế hoạch tháng của TẤT CẢ khu vực (dùng cho màn hình Tổng). */
export async function getAllKeHoachThang({ db }, thang) {
  await damBaoBang_(db);
  const t = kiemTraThang(thang);

  const rows = await db.all(
    'SELECT thang, khu_vuc, noi_dung, nguoi_cap_nhat, cap_nhat_luc FROM ke_hoach_thang WHERE thang = ? ORDER BY khu_vuc',
    [t]
  );

  const ds = [];
  const map = {};
  for (const r of rows) {
    const item = {
      thang: chuoi(r.thang),
      khuVuc: chuoi(r.khu_vuc),
      noiDung: chuoi(r.noi_dung),
      nguoiCapNhat: chuoi(r.nguoi_cap_nhat),
      capNhatLuc: chuoi(r.cap_nhat_luc),
    };
    ds.push(item);
    map[chuoi(r.khu_vuc)] = item;
  }

  return { thang: t, danhSach: ds, theoKhuVuc: map, map };
}

