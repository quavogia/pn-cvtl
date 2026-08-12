// =====================================================================
// Điểm danh — phần hay dùng nhất và cũng hay lỗi nhất ở bản cũ.
// =====================================================================

import { NHOM_DIEM_DANH, DD_BUOI_LIST, nhomCuaBuoi, thangHopLe } from '../hang-so.js';

/** Bảng điểm danh đầy đủ của một tháng, gom theo nhóm. */
export async function getDiemDanhRoster({ db }, thang) {
  if (!thangHopLe(thang)) throw new Error('Tháng không hợp lệ.');

  const [roster, oCell] = await Promise.all([
    db.all('SELECT khu_vuc, ten, phu_huynh FROM diem_danh_roster ORDER BY khu_vuc, thu_tu, id'),
    db.all('SELECT khu_vuc, ten, tuan, buoi, gia_tri FROM diem_danh WHERE thang = ?', [thang]),
  ]);

  // Gom ô điểm danh theo "khu vực|tên" để tra cứu nhanh.
  const bang = new Map();
  for (const c of oCell) {
    const k = c.khu_vuc + '|' + c.ten;
    if (!bang.has(k)) bang.set(k, {});
    const o = bang.get(k);
    if (!o[c.tuan]) o[c.tuan] = {};
    if (String(c.gia_tri || '').trim()) o[c.tuan][c.buoi] = c.gia_tri;
  }

  const theoKV = new Map();
  for (const r of roster) {
    if (!theoKV.has(r.khu_vuc)) theoKV.set(r.khu_vuc, []);
    theoKV.get(r.khu_vuc).push(r);
  }

  return NHOM_DIEM_DANH.map((g) => ({
    nhom: g.nhom,
    gioiTinh: g.gioiTinh,
    nhomTuoi: g.nhomTuoi,
    isTreEm: g.isTreEm,
    thanhVien: (theoKV.get(g.nhom) || []).map((tv) => {
      const dd = bang.get(g.nhom + '|' + tv.ten) || {};
      let tongKet = 0;
      for (const tuan of Object.keys(dd)) tongKet += Object.keys(dd[tuan]).length;
      return { ten: tv.ten, phuHuynh: tv.phu_huynh || '', diemDanh: dd, tongKet };
    }),
  }));
}

/** Số người đi ≥1 lần / ≥4 lần theo từng tuần — dùng để tự điền bảng TP. */
export async function getDiemDanhTPGoiY({ db }, thang, khuVuc) {
  if (!thangHopLe(thang)) throw new Error('Tháng không hợp lệ.');

  const rows = await db.all(
    `SELECT tuan, ten, COUNT(*) AS soBuoi
       FROM diem_danh
      WHERE thang = ? AND khu_vuc = ? AND TRIM(gia_tri) <> ''
      GROUP BY tuan, ten`,
    [thang, String(khuVuc || '').trim()]
  );

  const oneLan = [0, 0, 0, 0, 0];
  const fourLan = [0, 0, 0, 0, 0];
  for (const r of rows) {
    const i = Number(r.tuan) - 1;
    if (i < 0 || i > 4) continue;
    if (r.soBuoi >= 1) oneLan[i]++;
    if (r.soBuoi >= 4) fourLan[i]++;
  }
  return { oneLan, fourLan };
}

/**
 * Ghi một ô điểm danh.
 * Nếu tuần/nhóm buổi đó ĐÃ báo cáo thì chặn, trừ tài khoản chủ.
 * (Chặn ngay tại máy chủ nên không ai lách được bằng cách sửa trình duyệt.)
 */
export async function saveDiemDanhCell({ db, nguoiGoi }, thang, khuVuc, ten, tuan, buoi, giaTri) {
  if (!thangHopLe(thang)) throw new Error('Tháng không hợp lệ.');
  const kv = String(khuVuc || '').trim();
  const tv = String(ten || '').trim();
  const t = Number(tuan);
  const b = String(buoi || '').trim();
  if (!kv) throw new Error('Thiếu Khu vực.');
  if (!tv) throw new Error('Thiếu Tên.');
  if (!t || t < 1 || t > 5) throw new Error('Tuần không hợp lệ.');
  if (!DD_BUOI_LIST.includes(b)) throw new Error('Buổi không hợp lệ.');

  if (!nguoiGoi?.laChu) {
    const daBaoCao = await db.first(
      'SELECT 1 AS co FROM tp_bao_cao WHERE thang = ? AND khu_vuc = ? AND tuan = ? AND nhom = ?',
      [thang, kv, t, nhomCuaBuoi(b)]
    );
    if (daBaoCao) throw new Error('Tuần này đã báo cáo — chỉ tài khoản chủ mới được sửa.');
  }

  const gt = String(giaTri ?? '').trim();
  if (gt === '') {
    await db.run(
      'DELETE FROM diem_danh WHERE thang=? AND khu_vuc=? AND ten=? AND tuan=? AND buoi=?',
      [thang, kv, tv, t, b]
    );
  } else {
    // Ghi đè an toàn: nhờ khoá chính, hai người nhập cùng lúc không sinh dòng trùng.
    await db.run(
      `INSERT INTO diem_danh (thang, khu_vuc, ten, tuan, buoi, gia_tri) VALUES (?,?,?,?,?,?)
       ON CONFLICT (thang, khu_vuc, ten, tuan, buoi) DO UPDATE SET gia_tri = excluded.gia_tri`,
      [thang, kv, tv, t, b, gt]
    );
  }
  return { success: true };
}

export async function addDiemDanhTreEm({ db }, khuVuc, ten, phuHuynh) {
  const kv = String(khuVuc || '').trim();
  const tv = String(ten || '').trim();
  if (!kv) throw new Error('Thiếu Khu vực.');
  if (!tv) throw new Error('Thiếu Tên.');

  const max = await db.first('SELECT COALESCE(MAX(thu_tu), 0) AS m FROM diem_danh_roster WHERE khu_vuc = ?', [kv]);
  await db.run(
    `INSERT INTO diem_danh_roster (khu_vuc, ten, phu_huynh, thu_tu) VALUES (?,?,?,?)
     ON CONFLICT (khu_vuc, ten) DO UPDATE SET phu_huynh = excluded.phu_huynh`,
    [kv, tv, String(phuHuynh || '').trim(), (max?.m || 0) + 1]
  );
  return { success: true };
}

export async function deleteDiemDanhTreEm({ db }, khuVuc, ten) {
  const kv = String(khuVuc || '').trim();
  const tv = String(ten || '').trim();
  await db.run('DELETE FROM diem_danh_roster WHERE khu_vuc = ? AND ten = ?', [kv, tv]);
  return { success: true };
}

/** Đổi thứ tự hiển thị: huong = -1 (lên) hoặc 1 (xuống). */
export async function moveDiemDanhTreEm({ db }, khuVuc, ten, huong) {
  const kv = String(khuVuc || '').trim();
  const tv = String(ten || '').trim();
  const ds = await db.all('SELECT id, ten FROM diem_danh_roster WHERE khu_vuc = ? ORDER BY thu_tu, id', [kv]);
  const i = ds.findIndex((x) => x.ten === tv);
  if (i < 0) throw new Error('Không tìm thấy thành viên.');
  const j = i + (Number(huong) < 0 ? -1 : 1);
  if (j < 0 || j >= ds.length) return { success: true };

  [ds[i], ds[j]] = [ds[j], ds[i]];
  await db.batch(
    ds.map((x, k) => ({ sql: 'UPDATE diem_danh_roster SET thu_tu = ? WHERE id = ?', params: [k + 1, x.id] }))
  );
  return { success: true };
}

export async function getDiemDanhGhiChuAll({ db }) {
  const rows = await db.all('SELECT khu_vuc, ten, ma_cap_do, ghi_chu FROM diem_danh_ghi_chu');
  const out = {};
  for (const r of rows) {
    out[r.khu_vuc + '|' + r.ten] = { maCapDo: r.ma_cap_do || '', ghiChu: r.ghi_chu || '' };
  }
  return out;
}

export async function saveDiemDanhGhiChu({ db }, khuVuc, ten, maCapDo, ghiChu) {
  const kv = String(khuVuc || '').trim();
  const tv = String(ten || '').trim();
  if (!kv || !tv) throw new Error('Thiếu Khu vực hoặc Tên.');
  await db.run(
    `INSERT INTO diem_danh_ghi_chu (khu_vuc, ten, ma_cap_do, ghi_chu, ngay_cap_nhat) VALUES (?,?,?,?,?)
     ON CONFLICT (khu_vuc, ten) DO UPDATE SET
       ma_cap_do = excluded.ma_cap_do,
       ghi_chu = excluded.ghi_chu,
       ngay_cap_nhat = excluded.ngay_cap_nhat`,
    [kv, tv, String(maCapDo || '').trim(), String(ghiChu || '').trim(), new Date().toISOString()]
  );
  return { success: true };
}
