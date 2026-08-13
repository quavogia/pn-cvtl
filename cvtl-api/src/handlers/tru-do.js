// =====================================================================
// TRỤ ĐỠ — sổ mốc Hữu hiệu / Báp-têm, công thức điểm và bảng khen thưởng.
//
// Ba chặng của "trụ đỡ":  Đơn thuần  ->  Hữu hiệu  ->  Báp-têm
//
// Vì sao phải có sổ riêng: bảng hoc_vien chỉ giữ TRẠNG THÁI HIỆN TẠI. Sửa
// cột Tiến độ một cái là mất dấu, xoá học viên là mất luôn công của người dẫn
// dắt. Sổ này ghi rồi nằm đó, chép cứng tên người và tên người dẫn dắt tại
// thời điểm đạt mốc — báo cáo 1 năm sau vẫn đúng.
//
// CÔNG THỨC ĐIỂM (anh Rise chốt ngày 13/08/2026):
//     1 Đơn thuần = 1 điểm · 1 Hữu hiệu = 100 điểm · 1 Báp-têm = 1000 điểm
//     Điểm CHIA ĐỀU cho số người dẫn dắt.
//     Ví dụ: 1 báp-têm có 3 người dẫn dắt -> mỗi người 1000 / 3 = 333,33.
//
// Nhờ chia đều, tổng điểm toàn phòng luôn khớp số ca thật, không phồng lên.
// Riêng cột "số ca" thì mỗi người vẫn được tính 1 — hai con số nói hai chuyện
// khác nhau: số ca cho biết ai tham gia bao nhiêu ca, điểm dùng để khen thưởng.
// =====================================================================

import {
  chuoi, soNguyen, batBuoc, chuanNgay, homNay, thangCuaNgay, laHuuHieu, laBT,
} from '../tien-ich.js';

/** Điểm gốc của mỗi mốc, TRƯỚC khi chia cho số người dẫn dắt. */
export const DIEM_MOC = {
  don_thuan: 1,
  huu_hieu: 100,
  bap_tem: 1000,
};

const DS_MOC_SO = ['huu_hieu', 'bap_tem'];   // hai mốc được ghi vào sổ so_moc

const TEN_MOC = {
  don_thuan: 'Đơn thuần',
  huu_hieu: 'Hữu hiệu',
  bap_tem: 'Báp-têm',
};

// --- Vài tiện ích nhỏ dùng chung trong file này ----------------------

/** Đọc số dòng đã ghi — chạy được cả trên D1 lẫn node:sqlite khi kiểm thử. */
function soDongDaGhi(kq) {
  return Number(kq?.meta?.changes ?? kq?.changes ?? 0);
}
function idVuaTao(kq) {
  return kq?.meta?.last_row_id ?? kq?.lastInsertRowid ?? null;
}

/**
 * Danh sách người dẫn dắt của một dòng, đã bỏ ô trống và BỎ TRÙNG.
 * Bỏ trùng rất quan trọng: nếu một người bị điền vào cả NDD1 lẫn NDD2 của
 * cùng một học viên thì họ chỉ được tính MỘT lần, nếu không sẽ vừa ăn hai
 * suất điểm vừa làm mẫu số chia sai.
 */
export function dsNguoiDanDat(dong) {
  const ra = [];
  const daCo = new Set();
  for (const ten of [dong?.ndd1, dong?.ndd2, dong?.ndd3]) {
    const s = chuoi(ten);
    if (!s) continue;
    const khoa = s.toLowerCase();
    if (daCo.has(khoa)) continue;
    daCo.add(khoa);
    ra.push(s);
  }
  return ra;
}

/** Làm tròn 2 chữ số thập phân — chỉ dùng lúc TRẢ RA, không dùng khi cộng dồn. */
function tron2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function kiemTraMocSo(moc) {
  const m = chuoi(moc);
  if (!DS_MOC_SO.includes(m)) {
    throw new Error('Mốc không hợp lệ: "' + moc + '" (chỉ nhận huu_hieu hoặc bap_tem).');
  }
  return m;
}

/** Khoảng thời gian: thiếu thì lấy rộng hết cỡ. */
function khoang(tuNgay, denNgay) {
  return {
    tu: chuanNgay(tuNgay) || '0000-01-01',
    den: chuanNgay(denNgay) || '9999-12-31',
  };
}

function dongRaNgoai(r) {
  return {
    row: r.id,                 // giao diện dùng "row" làm định danh, giống các bảng khác
    moc: r.moc,
    tenMoc: TEN_MOC[r.moc] || r.moc,
    ngay: r.ngay,
    thang: r.thang,
    ten: r.ten,
    khuVuc: r.khu_vuc,
    ndd1: r.ndd1 || '',
    ndd2: r.ndd2 || '',
    ndd3: r.ndd3 || '',
    nguoiDanDat: dsNguoiDanDat(r),
    ghiChu: r.ghi_chu || '',
    nguoiGhi: r.nguoi_ghi || '',
  };
}

// =====================================================================
// A. ĐỌC SỔ
// =====================================================================

/**
 * Danh sách trong sổ.
 * @param moc     'huu_hieu' | 'bap_tem' | '' (rỗng = lấy cả hai)
 * @param khuVuc  rỗng = tất cả khu vực
 */
export async function getSoMoc({ db }, moc, tuNgay, denNgay, khuVuc) {
  const { tu, den } = khoang(tuNgay, denNgay);
  const m = chuoi(moc);
  const kv = chuoi(khuVuc);

  let sql = 'SELECT * FROM so_moc WHERE ngay >= ? AND ngay <= ?';
  const p = [tu, den];
  if (m) { kiemTraMocSo(m); sql += ' AND moc = ?'; p.push(m); }
  if (kv) { sql += ' AND khu_vuc = ?'; p.push(kv); }
  sql += ' ORDER BY ngay DESC, id DESC';

  const rows = await db.all(sql, p);
  return rows.map(dongRaNgoai);
}

/**
 * Dải chúc mừng Báp-têm ở trang Tổng quan.
 * Trả về danh sách người báp-têm trong THÁNG đang xem. Tháng nào không có ai
 * thì trả mảng rỗng — giao diện tự ẩn dải đi.
 */
export async function getBapTemBanner({ db }, thang) {
  const th = chuoi(thang) || homNay().slice(0, 7);
  const rows = await db.all(
    'SELECT * FROM so_moc WHERE moc = ? AND thang = ? ORDER BY ngay DESC, id DESC',
    ['bap_tem', th]
  );
  return { thang: th, soNguoi: rows.length, danhSach: rows.map(dongRaNgoai) };
}

// =====================================================================
// B. GHI SỔ
// =====================================================================

/**
 * Thêm một dòng vào sổ. Dùng cho cả hai đường:
 *   - Giao diện tự hỏi sau khi Tiến độ vượt mốc
 *   - Nút "Thêm thủ công" để nhập bù ca cũ
 *
 * Nếu người đó đã có trong sổ cho mốc này rồi thì BÁO LỖI RÕ RÀNG, không ghi
 * thêm — đây là lá chắn chống thổi phồng số liệu.
 */
export async function addSoMoc(ctx, data) {
  const { db, nguoiGoi } = ctx;
  const d = data || {};
  const moc = kiemTraMocSo(d.moc);
  const ten = batBuoc(d.ten, 'tên học viên');
  const khuVuc = batBuoc(d.khuVuc ?? d.to, 'Khu vực');
  const ngay = chuanNgay(d.ngay) || homNay();

  const kq = await db.run(
    `INSERT OR IGNORE INTO so_moc
       (moc, ngay, thang, ten, khu_vuc, ndd1, ndd2, ndd3, ghi_chu, nguoi_ghi, tao_luc)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      moc, ngay, thangCuaNgay(ngay), ten, khuVuc,
      chuoi(d.ndd1), chuoi(d.ndd2), chuoi(d.ndd3),
      chuoi(d.ghiChu), chuoi(nguoiGoi?.email), Date.now(),
    ]
  );

  if (soDongDaGhi(kq) === 0) {
    const cu = await db.first(
      'SELECT ngay FROM so_moc WHERE moc = ? AND ten = ? AND khu_vuc = ?',
      [moc, ten, khuVuc]
    );
    throw new Error(
      ten + ' đã có trong sổ ' + (TEN_MOC[moc] || moc) +
      (cu?.ngay ? ' từ ngày ' + cu.ngay : '') + ' rồi — mỗi người chỉ ghi một lần.'
    );
  }
  return { success: true, row: idVuaTao(kq) };
}

/** Sửa một dòng trong sổ (ngày, ghi chú, người dẫn dắt). */
export async function updateSoMoc({ db }, row, data) {
  const id = soNguyen(row);
  if (!id) throw new Error('Thiếu mã dòng cần sửa.');
  const d = data || {};
  const cu = await db.first('SELECT * FROM so_moc WHERE id = ?', [id]);
  if (!cu) throw new Error('Dòng này không còn trong sổ nữa — xin tải lại trang.');

  const ngay = chuanNgay(d.ngay) || cu.ngay;
  await db.run(
    `UPDATE so_moc SET ngay = ?, thang = ?, ndd1 = ?, ndd2 = ?, ndd3 = ?, ghi_chu = ?
     WHERE id = ?`,
    [
      ngay, thangCuaNgay(ngay),
      d.ndd1 === undefined ? cu.ndd1 : chuoi(d.ndd1),
      d.ndd2 === undefined ? cu.ndd2 : chuoi(d.ndd2),
      d.ndd3 === undefined ? cu.ndd3 : chuoi(d.ndd3),
      d.ghiChu === undefined ? cu.ghi_chu : chuoi(d.ghiChu),
      id,
    ]
  );
  return { success: true };
}

/** Xoá một dòng khỏi sổ. Xoá dòng đã mất rồi cũng coi như xong, không báo lỗi. */
export async function deleteSoMoc({ db }, row) {
  const id = soNguyen(row);
  if (!id) throw new Error('Thiếu mã dòng cần xoá.');
  await db.run('DELETE FROM so_moc WHERE id = ?', [id]);
  return { success: true };
}

/**
 * Học viên này đã có trong sổ những mốc nào rồi?
 * Giao diện gọi trước khi hỏi, để khỏi hỏi lại người đã ghi.
 */
export async function getMocDaGhi({ db }, ten, khuVuc) {
  const rows = await db.all(
    'SELECT moc, ngay FROM so_moc WHERE ten = ? AND khu_vuc = ?',
    [chuoi(ten), chuoi(khuVuc)]
  );
  const ra = {};
  for (const r of rows) ra[r.moc] = r.ngay;
  return ra;
}

/**
 * Học viên vừa vượt mốc nào? Dùng ngay sau khi thêm/sửa học viên.
 *
 * Trả về danh sách mốc CẦN HỎI để ghi sổ — giao diện sẽ bật ô hỏi ngày cho
 * từng mốc, đã điền sẵn người dẫn dắt. Không tự ghi ngay vì phải để người
 * dùng nhập đúng ngày đạt mốc (có thể là ngày trong quá khứ).
 *
 * Quy ước: đã Báp-têm thì đương nhiên đã qua Hữu hiệu. Nên nếu ai đó nhập
 * thẳng từ B1 lên BT mà chưa từng ghi sổ Hữu hiệu, hệ thống hỏi cả hai mốc.
 *
 * Chỉ hỏi khi VỪA VƯỢT MỐC. Học viên đã ở B5 từ trước khi có tính năng này
 * thì sửa hồ sơ sẽ không bị hỏi — dùng nút "Thêm thủ công" để nhập bù.
 */
export async function mocVuaDat(ctx, tienDoCu, hocVien) {
  const cuBT = laBT(tienDoCu);
  const cuHH = laHuuHieu(tienDoCu) || cuBT;
  const moiBT = laBT(hocVien?.tienDo);
  const moiHH = laHuuHieu(hocVien?.tienDo) || moiBT;

  const can = [];
  if (moiHH && !cuHH) can.push('huu_hieu');
  if (moiBT && !cuBT) can.push('bap_tem');
  if (!can.length) return [];

  const ten = chuoi(hocVien?.ten);
  const khuVuc = chuoi(hocVien?.khuVuc);
  if (!ten || !khuVuc) return [];

  const daGhi = await getMocDaGhi(ctx, ten, khuVuc);
  return can
    .filter((m) => !daGhi[m])
    .map((m) => ({
      moc: m,
      tenMoc: TEN_MOC[m],
      ten,
      khuVuc,
      ngayGoiY: homNay(),
      ndd1: chuoi(hocVien?.ndd1),
      ndd2: chuoi(hocVien?.ndd2),
      ndd3: chuoi(hocVien?.ndd3),
      nguoiDanDat: dsNguoiDanDat(hocVien),
      diem: DIEM_MOC[m],
    }));
}

// =====================================================================
// C. TÍNH ĐIỂM & XẾP HẠNG
// =====================================================================

function themVao(bang, ten, moc, diem) {
  const khoa = ten.toLowerCase();
  if (!bang[khoa]) {
    bang[khoa] = {
      ten,
      soCa: { don_thuan: 0, huu_hieu: 0, bap_tem: 0 },
      diem: 0,
    };
  }
  bang[khoa].soCa[moc] += 1;
  bang[khoa].diem += diem;
}

/**
 * Bảng xếp hạng gộp cả ba chặng.
 *
 * Cách tính, đúng như anh Rise chốt:
 *   - Đơn thuần: mỗi dòng nhật ký được (số lượng × 1) điểm, chia đều cho số
 *     người dẫn dắt của dòng đó.
 *   - Hữu hiệu / Báp-têm: mỗi dòng sổ được 100 / 1000 điểm, chia đều cho số
 *     người dẫn dắt của học viên đó.
 *   - Cột "số ca" thì mỗi người được tính 1, KHÔNG chia.
 *
 * Dòng nào không ghi người dẫn dắt nào thì điểm đó không thuộc về ai — vẫn
 * được cộng vào tổng của phòng để anh Rise nhìn ra là có chỗ nhập thiếu tên.
 */
export async function getXepHang({ db }, tuNgay, denNgay, khuVuc) {
  const { tu, den } = khoang(tuNgay, denNgay);
  const kv = chuoi(khuVuc);

  let sqlDT = 'SELECT * FROM nhat_ky_don_thuan WHERE ngay >= ? AND ngay <= ?';
  const pDT = [tu, den];
  if (kv) { sqlDT += ' AND khu_vuc = ?'; pDT.push(kv); }

  let sqlMoc = 'SELECT * FROM so_moc WHERE ngay >= ? AND ngay <= ?';
  const pMoc = [tu, den];
  if (kv) { sqlMoc += ' AND khu_vuc = ?'; pMoc.push(kv); }

  const [dsDT, dsMoc] = await Promise.all([db.all(sqlDT, pDT), db.all(sqlMoc, pMoc)]);

  const bang = {};
  const tong = {
    soDonThuan: 0, soHuuHieu: 0, soBapTem: 0,
    tongDiem: 0, diemChuaCoNguoi: 0,
  };

  // --- Đơn thuần ---
  for (const r of dsDT) {
    const soLuong = soNguyen(r.don_thuan);
    if (soLuong <= 0) continue;
    const diemDong = soLuong * DIEM_MOC.don_thuan;
    tong.soDonThuan += soLuong;
    tong.tongDiem += diemDong;

    const ndd = dsNguoiDanDat(r);
    if (!ndd.length) { tong.diemChuaCoNguoi += diemDong; continue; }
    const moiNguoi = diemDong / ndd.length;
    for (const ten of ndd) themVao(bang, ten, 'don_thuan', moiNguoi);
  }

  // --- Hữu hiệu & Báp-têm ---
  for (const r of dsMoc) {
    const moc = r.moc;
    const diemDong = DIEM_MOC[moc];
    if (!diemDong) continue;
    if (moc === 'huu_hieu') tong.soHuuHieu += 1;
    if (moc === 'bap_tem') tong.soBapTem += 1;
    tong.tongDiem += diemDong;

    const ndd = dsNguoiDanDat(r);
    if (!ndd.length) { tong.diemChuaCoNguoi += diemDong; continue; }
    const moiNguoi = diemDong / ndd.length;
    for (const ten of ndd) themVao(bang, ten, moc, moiNguoi);
  }

  const danhSach = Object.values(bang)
    .map((x) => ({
      ten: x.ten,
      donThuan: x.soCa.don_thuan,
      huuHieu: x.soCa.huu_hieu,
      bapTem: x.soCa.bap_tem,
      soCa: x.soCa.don_thuan + x.soCa.huu_hieu + x.soCa.bap_tem,
      diem: tron2(x.diem),
    }))
    .sort((a, b) => (b.diem - a.diem) || a.ten.localeCompare(b.ten, 'vi'));

  // Hạng: cùng điểm thì cùng hạng (1,1,1,4 — không phải 1,2,3,4)
  let hang = 0;
  let diemTruoc = null;
  danhSach.forEach((x, i) => {
    if (x.diem !== diemTruoc) { hang = i + 1; diemTruoc = x.diem; }
    x.hang = hang;
  });

  return {
    tuNgay: tu === '0000-01-01' ? '' : tu,
    denNgay: den === '9999-12-31' ? '' : den,
    khuVuc: kv,
    danhSach,
    tomTat: {
      soDonThuan: tong.soDonThuan,
      soHuuHieu: tong.soHuuHieu,
      soBapTem: tong.soBapTem,
      tongDiem: tron2(tong.tongDiem),
      diemChuaCoNguoi: tron2(tong.diemChuaCoNguoi),
      soNguoiCoDiem: danhSach.length,
    },
    congThuc: { ...DIEM_MOC, chiaDeuChoNguoiDanDat: true },
  };
}

// =====================================================================
// D. CHỐT KỲ KHEN THƯỞNG
// =====================================================================

/**
 * Đóng băng bảng xếp hạng của một kỳ.
 * Sau khi đã phát thưởng tháng 8 mà có người sửa sổ tháng 8, bảng tính lại sẽ
 * khác con số lúc trao giải. Chốt kỳ giữ lại đúng bảng tại thời điểm chốt.
 * Chỉ tài khoản chủ được chốt và xoá chốt.
 */
export async function chotKy(ctx, ky, tuNgay, denNgay, khuVuc) {
  const { db, nguoiGoi } = ctx;
  const nhan = batBuoc(ky, 'tên kỳ (ví dụ 2026-08)');
  const bang = await getXepHang(ctx, tuNgay, denNgay, khuVuc);

  await db.run(
    `INSERT INTO chot_ky (ky, tu_ngay, den_ngay, khu_vuc, bang_json, tom_tat_json, nguoi_chot, chot_luc)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT (ky) DO UPDATE SET
       tu_ngay = excluded.tu_ngay, den_ngay = excluded.den_ngay,
       khu_vuc = excluded.khu_vuc, bang_json = excluded.bang_json,
       tom_tat_json = excluded.tom_tat_json, nguoi_chot = excluded.nguoi_chot,
       chot_luc = excluded.chot_luc`,
    [
      nhan, bang.tuNgay, bang.denNgay, bang.khuVuc,
      JSON.stringify(bang.danhSach), JSON.stringify(bang.tomTat),
      chuoi(nguoiGoi?.email), Date.now(),
    ]
  );
  return { success: true, ky: nhan, soNguoi: bang.danhSach.length };
}

/** Đọc lại một kỳ đã chốt. Chưa chốt thì trả null. */
export async function getChotKy({ db }, ky) {
  const r = await db.first('SELECT * FROM chot_ky WHERE ky = ?', [chuoi(ky)]);
  if (!r) return null;
  let danhSach = [];
  let tomTat = null;
  try { danhSach = JSON.parse(r.bang_json); } catch { danhSach = []; }
  try { tomTat = JSON.parse(r.tom_tat_json || 'null'); } catch { tomTat = null; }
  return {
    ky: r.ky, tuNgay: r.tu_ngay, denNgay: r.den_ngay, khuVuc: r.khu_vuc || '',
    danhSach, tomTat, nguoiChot: r.nguoi_chot || '', chotLuc: r.chot_luc,
  };
}

/** Danh sách các kỳ đã chốt, mới nhất trước. */
export async function getDsChotKy({ db }) {
  const rows = await db.all(
    'SELECT ky, tu_ngay, den_ngay, khu_vuc, nguoi_chot, chot_luc FROM chot_ky ORDER BY chot_luc DESC'
  );
  return rows.map((r) => ({
    ky: r.ky, tuNgay: r.tu_ngay, denNgay: r.den_ngay,
    khuVuc: r.khu_vuc || '', nguoiChot: r.nguoi_chot || '', chotLuc: r.chot_luc,
  }));
}

/** Bỏ chốt một kỳ (chỉ tài khoản chủ) để chốt lại. */
export async function xoaChotKy({ db }, ky) {
  await db.run('DELETE FROM chot_ky WHERE ky = ?', [chuoi(ky)]);
  return { success: true };
}
