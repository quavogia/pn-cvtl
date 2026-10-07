// =====================================================================
// Kế hoạch Tin Lành theo từng mảng theo từng Khu vực (mở rộng 07/10/2026).
//
// Bảng `ke_hoach_muc`:
//   thang          TEXT NOT NULL,
//   khu_vuc        TEXT NOT NULL,
//   muc            TEXT NOT NULL,
//   noi_dung       TEXT NOT NULL DEFAULT '',
//   can_ho_tro     TEXT NOT NULL DEFAULT '',
//   nguoi_cap_nhat TEXT,
//   cap_nhat_luc   TEXT,
//   PRIMARY KEY (thang, khu_vuc, muc)
// =====================================================================

import { kiemTraThang, batBuoc, chuoi } from '../tien-ich.js';
import { duocXemKhuVuc } from '../auth.js';

const CAC_MUC_HOP_LE = new Set(['tp', 'trudo', 'edu', 'daotao', 'lehoi']);

function kiemTraMuc_(muc) {
  const m = chuoi(muc).trim();
  if (!m) throw new Error('Thiếu mảng kế hoạch.');
  if (!CAC_MUC_HOP_LE.has(m)) throw new Error('Mảng kế hoạch không hợp lệ: "' + m + '".');
  return m;
}

let daTaoBang_ = false;
async function damBaoBang_(db) {
  if (daTaoBang_) return;
  await db.run(
    `CREATE TABLE IF NOT EXISTS ke_hoach_muc (
      thang          TEXT NOT NULL,
      khu_vuc        TEXT NOT NULL,
      muc            TEXT NOT NULL,
      noi_dung       TEXT NOT NULL DEFAULT '',
      can_ho_tro     TEXT NOT NULL DEFAULT '',
      nguoi_cap_nhat TEXT,
      cap_nhat_luc   TEXT,
      PRIMARY KEY (thang, khu_vuc, muc)
    )`
  );
  await db.run('CREATE INDEX IF NOT EXISTS ix_khm_thang ON ke_hoach_muc (thang)');
  daTaoBang_ = true;
}

/** Đọc kế hoạch của một khu vực theo mảng (hàm thuần đọc, 0 lệnh ghi). */
export async function getKeHoachThang({ db }, thang, khuVuc, muc) {
  const t = kiemTraThang(thang);
  const kv = batBuoc(khuVuc, 'Khu vực');
  const m = kiemTraMuc_(muc);

  try {
    const row = await db.first(
      'SELECT thang, khu_vuc, muc, noi_dung, can_ho_tro, nguoi_cap_nhat, cap_nhat_luc FROM ke_hoach_muc WHERE thang = ? AND khu_vuc = ? AND muc = ?',
      [t, kv, m]
    );
    if (!row) {
      return { thang: t, khuVuc: kv, muc: m, noiDung: '', canHoTro: '', nguoiCapNhat: '', capNhatLuc: '' };
    }
    return {
      thang: chuoi(row.thang),
      khuVuc: chuoi(row.khu_vuc),
      muc: chuoi(row.muc),
      noiDung: chuoi(row.noi_dung),
      canHoTro: chuoi(row.can_ho_tro),
      nguoiCapNhat: chuoi(row.nguoi_cap_nhat),
      capNhatLuc: chuoi(row.cap_nhat_luc),
    };
  } catch (e) {
    if (e && String(e.message || e).includes('no such table')) {
      return { thang: t, khuVuc: kv, muc: m, noiDung: '', canHoTro: '', nguoiCapNhat: '', capNhatLuc: '' };
    }
    throw e;
  }
}

/** Lưu kế hoạch của một khu vực theo mảng (hàm ghi). */
export async function saveKeHoachThang({ db, nguoiGoi }, thang, khuVuc, muc, noiDung, canHoTro) {
  await damBaoBang_(db);
  const t = kiemTraThang(thang);
  const kv = batBuoc(khuVuc, 'Khu vực');
  const m = kiemTraMuc_(muc);
  const nd = chuoi(noiDung);
  const cht = chuoi(canHoTro);

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
    `INSERT INTO ke_hoach_muc (thang, khu_vuc, muc, noi_dung, can_ho_tro, nguoi_cap_nhat, cap_nhat_luc)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (thang, khu_vuc, muc) DO UPDATE SET
       noi_dung = excluded.noi_dung,
       can_ho_tro = excluded.can_ho_tro,
       nguoi_cap_nhat = excluded.nguoi_cap_nhat,
       cap_nhat_luc = excluded.cap_nhat_luc`,
    [t, kv, m, nd, cht, email, capNhatLuc]
  );

  return {
    success: true,
    thang: t,
    khuVuc: kv,
    muc: m,
    noiDung: nd,
    canHoTro: cht,
    nguoiCapNhat: email,
    capNhatLuc,
  };
}

/** Đọc kế hoạch tháng của TẤT CẢ khu vực và mảng (hàm thuần đọc, 0 lệnh ghi). */
export async function getAllKeHoachThang({ db }, thang) {
  const t = kiemTraThang(thang);

  try {
    const rows = await db.all(
      'SELECT thang, khu_vuc, muc, noi_dung, can_ho_tro, nguoi_cap_nhat, cap_nhat_luc FROM ke_hoach_muc WHERE thang = ? ORDER BY khu_vuc, muc',
      [t]
    );

    const ds = [];
    const map = {};
    for (const r of rows) {
      const item = {
        thang: chuoi(r.thang),
        khuVuc: chuoi(r.khu_vuc),
        muc: chuoi(r.muc),
        noiDung: chuoi(r.noi_dung),
        canHoTro: chuoi(r.can_ho_tro),
        nguoiCapNhat: chuoi(r.nguoi_cap_nhat),
        capNhatLuc: chuoi(r.cap_nhat_luc),
      };
      ds.push(item);
      if (!map[item.khuVuc]) map[item.khuVuc] = {};
      map[item.khuVuc][item.muc] = item;
    }

    return { thang: t, danhSach: ds, theoKhuVuc: map, map };
  } catch (e) {
    if (e && String(e.message || e).includes('no such table')) {
      return { thang: t, danhSach: [], theoKhuVuc: {}, map: {} };
    }
    throw e;
  }
}


