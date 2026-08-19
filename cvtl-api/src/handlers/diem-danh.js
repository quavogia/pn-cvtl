// =====================================================================
// Điểm danh — phần hay dùng nhất và cũng hay lỗi nhất ở bản cũ.
// =====================================================================

import { KHU_VUC_LIST, DD_BUOI_LIST, nhomCuaBuoi, thangHopLe } from '../hang-so.js';

/**
 * Giới tính / nhóm tuổi của 7 Khu vực CŨ — giữ đúng y hệt bản gốc để không ai
 * thấy khác gì cả. Khu vực MỚI (tách/thêm sau này qua "Quản lý khu vực") sẽ
 * không có trong bảng này, mặc định để trống — không sao vì 3 trường này
 * (gioiTinh/nhomTuoi/isTreEm) hiện KHÔNG được index.html dùng ở đâu cả
 * (đã rà soát toàn bộ giao diện, không có chỗ nào đọc 3 trường này).
 */
const META_KHU_VUC_CU = {
  'K Đức':  { gioiTinh: 'Nam', nhomTuoi: 'Tráng niên', isTreEm: false },
  'K Long': { gioiTinh: 'Nam', nhomTuoi: 'Thanh niên', isTreEm: false },
  'SĐ':     { gioiTinh: 'Nam', nhomTuoi: '',            isTreEm: false },
  'Đ Uyên': { gioiTinh: 'Nữ',  nhomTuoi: 'Phụ nữ',      isTreEm: false },
  'K Thành':{ gioiTinh: 'Nữ',  nhomTuoi: 'Phụ nữ',      isTreEm: false },
  'K Trâm': { gioiTinh: 'Nữ',  nhomTuoi: 'Thanh niên',  isTreEm: false },
  'K My':   { gioiTinh: 'Nữ',  nhomTuoi: 'Thanh niên',  isTreEm: false },
};

/**
 * 2 nhóm "trẻ em" đặc biệt của bản cũ — KHÔNG phải Khu vực thật, không nằm
 * trong config_list, giữ nguyên cứng ở đây (đã rà soát: hiện không có chỗ
 * nào trong index.html tham chiếu tới 2 tên này, coi như chưa dùng tới,
 * nhưng vẫn giữ lại phòng khi có dữ liệu cũ gắn với 2 nhóm này).
 */
const NHOM_TRE_EM = [
  { nhom: 'Học sinh Tiểu học', gioiTinh: 'Nam', nhomTuoi: 'Thiếu nhi', isTreEm: true },
  { nhom: 'Tiểu học',          gioiTinh: 'Nữ',  nhomTuoi: 'Thiếu nhi', isTreEm: true },
];

/**
 * Danh sách nhóm (Khu vực) hiển thị trong bảng Điểm danh, ĐÚNG THỨ TỰ đang
 * hiển thị trên trang "Nhập số liệu theo tuần" / "Hiện trạng khu vực".
 * Trước đây (tới 18/08/2026) danh sách này cứng trong hang-so.js
 * (NHOM_DIEM_DANH) — Khu vực nào không có mặt trong đó thì bảng Điểm danh
 * của Khu vực đó COI NHƯ KHÔNG TỒN TẠI (trống trơn) dù đã có trong config_list
 * và hiện đủ ở mọi bảng khác. Sửa 19/08/2026 (để phục vụ tính năng "Quản lý
 * khu vực" tự tách/thêm Khu vực): đọc thẳng config_list, ghép thêm mô tả
 * gioiTinh/nhomTuoi từ META_KHU_VUC_CU (Khu vực mới thì để trống), rồi nối
 * thêm 2 nhóm "trẻ em" cũ vào cuối cho khỏi mất dữ liệu cũ (nếu có).
 */
async function layDanhSachNhomDiemDanh(db) {
  const rows = await db.all(
    "SELECT gia_tri FROM config_list WHERE loai = 'khu_vuc' ORDER BY thu_tu, id"
  );
  const ds = rows.map((r) => String(r.gia_tri || '').trim()).filter(Boolean);
  const dsKV = ds.length ? ds : KHU_VUC_LIST.slice();
  const nhomKV = dsKV.map((kv) => ({
    nhom: kv,
    gioiTinh: META_KHU_VUC_CU[kv]?.gioiTinh || '',
    nhomTuoi: META_KHU_VUC_CU[kv]?.nhomTuoi || '',
    isTreEm: false,
  }));
  return nhomKV.concat(NHOM_TRE_EM);
}

/** Bảng điểm danh đầy đủ của một tháng, gom theo nhóm. */
export async function getDiemDanhRoster({ db }, thang) {
  if (!thangHopLe(thang)) throw new Error('Tháng không hợp lệ.');

  const [dsNhom, roster, oCell] = await Promise.all([
    layDanhSachNhomDiemDanh(db),
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

  return dsNhom.map((g) => ({
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

/**
 * Số người đi ≥1 lần / ≥4 lần theo từng tuần, CHO TẤT CẢ KHU VỰC CÙNG LÚC —
 * dùng để tự điền bảng "Nhập số liệu theo tuần" (TP) từ Điểm danh.
 *
 * (Sửa 18/08/2026, anh Rise phát hiện Tuần đang mở không tự nhảy theo Điểm
 * danh dù rõ ràng có thêm người đủ ≥1/≥4 buổi) Bản CŨ nhận thêm tham số
 * `khuVuc` và chỉ trả về MỘT khu vực dạng `{oneLan, fourLan}`. Nhưng giao
 * diện (`index.html`, hàm `loadTPPanel`/`autoFillTPFromGoiY_`) chỉ gọi
 * `getDiemDanhTPGoiY(monthKey)` — KHÔNG hề truyền khu vực — rồi coi kết quả
 * trả về là một "hộp" tra theo tên khu vực (`map[kv].weeks1`/`.weeks4`/
 * `.hasData`). Vì bản cũ luôn nhận `khuVuc = undefined` (lọc theo
 * `khu_vuc = ''`, không khớp khu vực thật nào) và trả sai hình dạng
 * (`oneLan`/`fourLan` phẳng, không có `weeks1`/`weeks4`/`hasData`, không
 * theo từng khu vực), giao diện luôn coi như "không có gợi ý gì" và bỏ qua
 * hẳn bước tự điền — tính năng này coi như CHƯA TỪNG chạy từ lúc xây dựng.
 * Bản mới bỏ tham số `khuVuc`, tính luôn cho MỌI khu vực trong 1 lần gọi,
 * trả về đúng hình dạng giao diện đang mong đợi.
 *
 * `hasData[i]` = tuần đó khu vực này đã THẬT SỰ có ít nhất 1 người được điểm
 * danh (dù chỉ 1 buổi) — dùng để phân biệt "tuần chưa ai điểm danh, đừng tự
 * điền 0" với "tuần đã điểm danh xong, đúng là 0 người đạt ≥1/≥4 lần".
 */
export async function getDiemDanhTPGoiY({ db }, thang) {
  if (!thangHopLe(thang)) throw new Error('Tháng không hợp lệ.');

  const rows = await db.all(
    `SELECT khu_vuc, tuan, ten, COUNT(*) AS soBuoi
       FROM diem_danh
      WHERE thang = ? AND TRIM(gia_tri) <> ''
      GROUP BY khu_vuc, tuan, ten`,
    [thang]
  );

  const map = {};
  function laySlot(kv) {
    if (!map[kv]) {
      map[kv] = { weeks1: [0, 0, 0, 0, 0], weeks4: [0, 0, 0, 0, 0], hasData: [false, false, false, false, false] };
    }
    return map[kv];
  }
  for (const r of rows) {
    const i = Number(r.tuan) - 1;
    if (i < 0 || i > 4) continue;
    const slot = laySlot(r.khu_vuc);
    slot.hasData[i] = true;
    if (r.soBuoi >= 1) slot.weeks1[i]++;
    if (r.soBuoi >= 4) slot.weeks4[i]++;
  }
  return map;
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

// ⚠️ Phải trả về MẢNG các bản ghi {khuVuc, ten, capDo, ghiChu, ngayCapNhat} —
// ĐÚNG hình dạng và ĐÚNG tên trường mà index.html (loadDiemDanhGhiChu_) đang
// đọc. Bản cũ trả về một OBJECT (khoá "khu_vuc|ten" -> {maCapDo, ghiChu}),
// trong khi giao diện gọi `list.forEach(...)` (chỉ mảng mới có .forEach) rồi
// đọc `r.khuVuc`/`r.capDo` — lệch cả hình dạng lẫn tên trường khiến
// `list.forEach` NÉM LỖI ngay trong tay successHandler. Vì lỗi này rơi vào
// đúng nhánh mà bộ đệm `_inFlight` đã bị xoá trước đó, `withFailureHandler`
// cũng không được gọi — lỗi im lặng, `ddGhiChuMap` không bao giờ tải được và
// mãi mãi rỗng. Hậu quả: Trưởng phòng bấm lưu Ghi chú thấy hiện lên ngay
// (đúng vì đó là dữ liệu tạm trong bộ nhớ trình duyệt), nhưng chỉ cần trang
// tải lại danh sách Điểm danh một lần nữa (đổi khu vực, mở lại tab, F5...)
// là `ddGhiChuMap` bị ghi đè về rỗng — trông như "ghi chú vừa lưu xong lại
// biến mất". Anh Rise phát hiện 16/08/2026. Xem `CVTL-LOI-DA-SUA.md` mục B6.
export async function getDiemDanhGhiChuAll({ db }) {
  const rows = await db.all('SELECT khu_vuc, ten, ma_cap_do, ghi_chu, ngay_cap_nhat FROM diem_danh_ghi_chu');
  return rows.map((r) => ({
    khuVuc: r.khu_vuc,
    ten: r.ten,
    capDo: r.ma_cap_do || '',
    ghiChu: r.ghi_chu || '',
    ngayCapNhat: r.ngay_cap_nhat || '',
  }));
}

export async function saveDiemDanhGhiChu({ db }, khuVuc, ten, maCapDo, ghiChu) {
  const kv = String(khuVuc || '').trim();
  const tv = String(ten || '').trim();
  if (!kv || !tv) throw new Error('Thiếu Khu vực hoặc Tên.');
  const ngayCapNhat = new Date().toISOString();
  await db.run(
    `INSERT INTO diem_danh_ghi_chu (khu_vuc, ten, ma_cap_do, ghi_chu, ngay_cap_nhat) VALUES (?,?,?,?,?)
     ON CONFLICT (khu_vuc, ten) DO UPDATE SET
       ma_cap_do = excluded.ma_cap_do,
       ghi_chu = excluded.ghi_chu,
       ngay_cap_nhat = excluded.ngay_cap_nhat`,
    [kv, tv, String(maCapDo || '').trim(), String(ghiChu || '').trim(), ngayCapNhat]
  );
  // Trả kèm `ngayCapNhat` — index.html (saveDiemDanhGhiChuUI_) đọc `res.ngayCapNhat`
  // để lưu vào bộ nhớ ngay sau khi lưu; trước đây hàm chỉ trả {success:true}
  // nên trường này luôn là `undefined` (không phá gì vì chưa nơi nào hiển thị
  // nó, nhưng vẫn nên trả đúng cho khỏi lệch hợp đồng thêm một chỗ nữa).
  return { success: true, ngayCapNhat };
}
