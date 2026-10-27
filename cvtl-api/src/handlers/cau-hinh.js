// Cấu hình dùng chung: danh sách Khu vực / Tiến độ / Người dẫn dắt.
//
// ⚠️ TÊN TRƯỜNG PHẢI GIỮ ĐÚNG: toList / tienDoList / nddList.
// Giao diện (index.html, hàm loadDropdowns) đọc đúng ba tên này. Đặt tên khác
// đi thì mọi ô chọn Khu vực / Tiến độ / Người dẫn dắt sẽ trống trơn.

import { KHU_VUC_LIST } from '../hang-so.js';

const DO_DAI_TEN_NDD_TOI_DA = 60;

/**
 * Chuẩn hoá tên người dẫn dắt khi thêm/xoá:
 * - Cấm dấu phẩy (vì lich_lam_viec.nguoi_tham_gia nối nhiều tên bằng dấu phẩy).
 * - Cấm ký tự xuống dòng / tab.
 * - Chuẩn Unicode NFC, bỏ khoảng trắng đầu/cuối, gộp nhiều khoảng trắng liên tiếp.
 * - Không rỗng, tối đa 60 ký tự.
 */
export function chuanHoaTenNdd(ten) {
  const tho = String(ten === null || ten === undefined ? '' : ten);
  if (tho.includes(',')) {
    throw new Error('Tên không được chứa dấu phẩy.');
  }
  if (/[\r\n\t]/.test(tho)) {
    throw new Error('Tên không được chứa ký tự xuống dòng hoặc tab.');
  }
  const s = tho.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!s) {
    throw new Error('Vui lòng nhập tên người dẫn dắt.');
  }
  if (s.length > DO_DAI_TEN_NDD_TOI_DA) {
    throw new Error('Tên người dẫn dắt không được dài quá 60 ký tự.');
  }
  return s;
}

/** Khoá chuẩn hoá (NFC + gộp khoảng trắng + chữ thường) để so trùng không phân biệt hoa/thường hay NFD/NFC. */
export function khoaSoTrungNdd(ten) {
  return String(ten === null || ten === undefined ? '' : ten)
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi');
}

export async function getDropdownOptions({ db }) {
  const rows = await db.all('SELECT loai, gia_tri FROM config_list ORDER BY loai, thu_tu, id');
  const gom = (loai) => rows.filter((r) => r.loai === loai).map((r) => r.gia_tri);

  const toList = gom('khu_vuc');
  return {
    // Chưa nhập Config thì vẫn có sẵn danh sách Khu vực mặc định, để giao diện
    // không bị "chết cứng" ngay lần đầu chạy.
    toList: toList.length ? toList : KHU_VUC_LIST.slice(),
    tienDoList: gom('tien_do'),
    nddList: gom('nguoi_dan_dat'),
  };
}

/**
 * Đọc danh sách Người dẫn dắt kèm số lần đang dùng ở các bảng.
 * - Hàm ĐỌC thuần (không ghi gì vào CSDL).
 * - Phương án R1 (chốt ở #96):
 *   + soDangDung = soHocVien + soLichLamViec (2 nơi có kiểm lại nguoi_dan_dat khi Sửa -> chặn xoá).
 *   + soDonThuan, soSoMoc, soGiaoDuc: chỉ kiểm lúc thêm mới / lịch sử -> hiện số và cảnh báo khi xoá, không chặn xoá.
 */
export async function getDanhSachNguoiDanDat({ db }) {
  const dsConfig = await db.all(
    "SELECT id, gia_tri, thu_tu FROM config_list WHERE loai = 'nguoi_dan_dat' ORDER BY thu_tu, id"
  );
  if (!dsConfig.length) return [];

  const ketQua = dsConfig.map((r) => ({
    ten: r.gia_tri,
    thuTu: Number(r.thu_tu) || 0,
    soHocVien: 0,
    soLichLamViec: 0,
    soDonThuan: 0,
    soSoMoc: 0,
    soGiaoDuc: 0,
    soDangDung: 0,
  }));

  // Ánh xạ cả chuỗi gốc (kể cả nếu đang lưu dạng NFD cũ) lẫn khoá chuẩn hoá về đúng mục
  const theoKhoa = new Map();
  for (const muc of ketQua) {
    theoKhoa.set(muc.ten, muc);
    const k = khoaSoTrungNdd(muc.ten);
    if (k && !theoKhoa.has(k)) theoKhoa.set(k, muc);
  }
  const timMuc = (ten) => {
    const t = String(ten || '').trim();
    if (!t) return null;
    return theoKhoa.get(t) || theoKhoa.get(khoaSoTrungNdd(t)) || null;
  };

  const [hvRows, lichRows, dtRows, smRows, gdRows] = await Promise.all([
    db.all(
      "SELECT ndd1, ndd2, ndd3 FROM hoc_vien WHERE (ndd1 IS NOT NULL AND ndd1 != '') OR (ndd2 IS NOT NULL AND ndd2 != '') OR (ndd3 IS NOT NULL AND ndd3 != '')"
    ),
    db.all(
      "SELECT nguoi_phu_trach, nguoi_tham_gia FROM lich_lam_viec WHERE (nguoi_phu_trach IS NOT NULL AND nguoi_phu_trach != '') OR (nguoi_tham_gia IS NOT NULL AND nguoi_tham_gia != '')"
    ),
    db.all(
      "SELECT ndd1, ndd2, ndd3 FROM nhat_ky_don_thuan WHERE (ndd1 IS NOT NULL AND ndd1 != '') OR (ndd2 IS NOT NULL AND ndd2 != '') OR (ndd3 IS NOT NULL AND ndd3 != '')"
    ),
    db.all(
      "SELECT ndd1, ndd2, ndd3 FROM so_moc WHERE (ndd1 IS NOT NULL AND ndd1 != '') OR (ndd2 IS NOT NULL AND ndd2 != '') OR (ndd3 IS NOT NULL AND ndd3 != '')"
    ),
    db.all(
      "SELECT DISTINCT khu_vuc, ten FROM giao_duc_thanh_vien WHERE ten IS NOT NULL AND ten != ''"
    ),
  ]);

  for (const r of hvRows) {
    const daTinh = new Set();
    for (const cot of [r.ndd1, r.ndd2, r.ndd3]) {
      const m = timMuc(cot);
      if (m && !daTinh.has(m)) {
        daTinh.add(m);
        m.soHocVien += 1;
      }
    }
  }

  for (const r of lichRows) {
    const daTinh = new Set();
    const dsTen = [
      r.nguoi_phu_trach,
      ...String(r.nguoi_tham_gia || '').split(','),
    ];
    for (const ten of dsTen) {
      const m = timMuc(ten);
      if (m && !daTinh.has(m)) {
        daTinh.add(m);
        m.soLichLamViec += 1;
      }
    }
  }

  for (const r of dtRows) {
    const daTinh = new Set();
    for (const cot of [r.ndd1, r.ndd2, r.ndd3]) {
      const m = timMuc(cot);
      if (m && !daTinh.has(m)) {
        daTinh.add(m);
        m.soDonThuan += 1;
      }
    }
  }

  for (const r of smRows) {
    const daTinh = new Set();
    for (const cot of [r.ndd1, r.ndd2, r.ndd3]) {
      const m = timMuc(cot);
      if (m && !daTinh.has(m)) {
        daTinh.add(m);
        m.soSoMoc += 1;
      }
    }
  }

  for (const r of gdRows) {
    const m = timMuc(r.ten);
    if (m) m.soGiaoDuc += 1;
  }

  for (const muc of ketQua) {
    muc.soDangDung = muc.soHocVien + muc.soLichLamViec;
  }

  return ketQua;
}

export async function addNguoiDanDat({ db }, ten) {
  const tenMoi = chuanHoaTenNdd(ten);
  const khoaMoi = khoaSoTrungNdd(tenMoi);

  const ds = await db.all(
    "SELECT gia_tri, thu_tu FROM config_list WHERE loai = 'nguoi_dan_dat' ORDER BY thu_tu, id"
  );
  const daCo = ds.find((r) => khoaSoTrungNdd(r.gia_tri) === khoaMoi);
  if (daCo) {
    throw new Error('Tên "' + daCo.gia_tri + '" đã có trong danh sách Người dẫn dắt.');
  }

  const thuTuMoi = ds.length
    ? Math.max(...ds.map((r) => Number(r.thu_tu) || 0)) + 1
    : 0;

  try {
    await db.run(
      "INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('nguoi_dan_dat', ?, ?)",
      [tenMoi, thuTuMoi]
    );
  } catch (e) {
    if (/UNIQUE/i.test(String((e && e.message) || e || ''))) {
      throw new Error('Tên "' + tenMoi + '" đã có trong danh sách Người dẫn dắt.');
    }
    throw e;
  }

  return {
    ok: true,
    ten: tenMoi,
    thuTu: thuTuMoi,
    danhSach: await getDanhSachNguoiDanDat({ db }),
  };
}

export async function deleteNguoiDanDat({ db }, ten) {
  const tenHopLe = chuanHoaTenNdd(ten);
  const khoaCanXoa = khoaSoTrungNdd(tenHopLe);

  const ds = await getDanhSachNguoiDanDat({ db });
  const muc = ds.find((x) => khoaSoTrungNdd(x.ten) === khoaCanXoa);
  if (!muc) {
    throw new Error('Không tìm thấy "' + tenHopLe + '" trong danh sách Người dẫn dắt.');
  }

  if (muc.soHocVien > 0 || muc.soLichLamViec > 0) {
    const chiTiet = [];
    if (muc.soHocVien > 0) chiTiet.push(muc.soHocVien + ' học viên');
    if (muc.soLichLamViec > 0) chiTiet.push(muc.soLichLamViec + ' lịch làm việc');
    throw new Error(
      'Không thể xoá "' + muc.ten + '" vì còn đang dùng ở: ' + chiTiet.join(', ') + '. Vui lòng sửa các dòng đó trước.'
    );
  }

  // Xoá bằng đúng chuỗi gia_tri gốc đang lưu trong CSDL (phòng trường hợp dòng cũ lưu dạng NFD)
  await db.run(
    "DELETE FROM config_list WHERE loai = 'nguoi_dan_dat' AND gia_tri = ?",
    [muc.ten]
  );

  return {
    ok: true,
    daXoa: muc.ten,
    danhSach: await getDanhSachNguoiDanDat({ db }),
  };
}
