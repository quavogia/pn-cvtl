// =====================================================================
// TRỤ ĐỠ — sổ mốc Hữu hiệu / Báp-têm và bảng xếp hạng.
//
// Ba chặng của "trụ đỡ":  Đơn thuần  ->  Hữu hiệu  ->  Báp-têm
//
// Vì sao phải có sổ riêng: bảng hoc_vien chỉ giữ TRẠNG THÁI HIỆN TẠI. Sửa
// cột Tiến độ một cái là mất dấu, xoá học viên là mất luôn công của người dẫn
// dắt. Sổ này ghi rồi nằm đó, chép cứng tên người và tên người dẫn dắt tại
// thời điểm đạt mốc — báo cáo 1 năm sau vẫn đúng.
//
// ⭐⭐ 30/08/2026 — WEB KHÔNG CÒN ĐIỂM, KHÔNG CÒN CÔNG THỨC NÀO.
// Anh Rise chốt: memo (trang web Hội Thánh) đã có sẵn công thức và là sổ
// CHÍNH THỨC — điểm xem bên memo. Web chỉ đếm SỐ CA, và xếp hạng theo:
//     Báp-têm  ->  Hữu hiệu  ->  Đơn thuần
// tức là hơn ở nấc trên thì thắng, bằng nhau mới xét xuống nấc dưới.
//
// ⚠️ Ai sửa file này về sau: đừng thêm lại một thang điểm "cho tiện". Web tự
// tính mà lệch memo thì web luôn là bên sai — vì memo mới là cái Hội Thánh
// công nhận. Hai con số cho một người chỉ tổ làm cả phòng cãi nhau xem tin
// bảng nào. MỘT con số thì phải có MỘT nơi định nghĩa (bài học #33).
//
// ⚠️ HỆ QUẢ PHẢI BIẾT: thứ hạng ở đây KHÁC thứ hạng theo điểm của memo. Memo
// cộng có trọng số, còn đây là so bậc thang. Người 1 báp-têm đứng trên người
// 0 báp-têm nhưng 300 đơn thuần — theo điểm memo thì ngược lại. Không sai,
// chỉ là hai thước đo. Bảng nào là chính thức thì memo mới là chính thức.
//
// Bảng xếp hạng vì vậy chỉ còn BA cột số, tất cả web tự đếm từ sổ:
//     Đơn thuần · Hữu hiệu · Báp-têm
//
// Cột "Đơn thuần" hiện SỐ LƯỢNG đã chia đều cho số người dẫn dắt (1 dòng ghi
// 100 cho 2 người -> mỗi người 50), để cộng cột lại đúng bằng số thật.
// Cột "Hữu hiệu" / "Báp-têm" đếm số HỌC VIÊN nên mỗi người dẫn dắt tính trọn 1.
// =====================================================================

import {
  chuoi, soNguyen, batBuoc, chuanNgay, homNay, thangCuaNgay, laHuuHieu, laBT, tuanTrongThang,
} from '../tien-ich.js';
import { cacTuanCuaThang } from '../lich-tuan.js';

/**
 * Các mốc được ghi vào sổ `so_moc` (mỗi người mỗi mốc chỉ một dòng).
 *
 * ⚠️ 30/08/2026 — GỠ hai mốc 'bap_tem_du_le' và 'chien_bi_mat' (thêm 27/08,
 * dùng đúng ba ngày). Anh Rise chốt bảng xếp hạng chỉ còn Đơn thuần · Hữu
 * hiệu · Báp-têm · Điểm. Dòng cũ (nếu có ai đã ghi) vẫn nằm nguyên trong CSDL
 * chứ không bị xoá — chỉ là không còn chỗ nào đọc tới. CỐ Ý không viết lệnh
 * xoá: xoá dữ liệu người ta đã nhập thì không lấy lại được, còn để đó thì
 * chẳng hại ai.
 */
const DS_MOC_SO = ['huu_hieu', 'bap_tem'];

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
    throw new Error('Mốc không hợp lệ: "' + moc + '" (chỉ nhận: ' + DS_MOC_SO.join(', ') + ').');
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
 * Tự động ghi vào sổ `so_moc` khi học viên VỪA VƯỢT MỐC (B2 cho Hữu hiệu, BT cho
 * Báp-têm). Đổi từ 20/10/2026 (T-010, anh Rise chốt):
 *   - Ngày nào nhập tiến độ B2/BT thì tính vào ngày và tháng đó (homNay()).
 *   - Báp-têm mà chưa có Hữu hiệu trong sổ thì ghi cả hai.
 *   - Dùng INSERT OR IGNORE trên khoá UNIQUE (moc, ten, khu_vuc): mỗi học viên
 *     mỗi mốc chỉ một lần, tuyệt đối không ghi đè dòng sổ đã ghi tay trước đó.
 *   - Không tự ghi cho học viên đã ≥B2 từ trước mà chỉ sửa thông tin khác.
 *   - Hạ tiến độ về sau không xoá dòng sổ.
 */
export async function tuGhiSoMoc(ctx, tienDoCu, hocVien) {
  const { db, nguoiGoi } = ctx;
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

  const ngay = homNay();
  const thang = thangCuaNgay(ngay);
  const nguoiGhi = chuoi(nguoiGoi?.email);
  const daGhi = [];

  for (const moc of can) {
    const kq = await db.run(
      `INSERT OR IGNORE INTO so_moc
         (moc, ngay, thang, ten, khu_vuc, ndd1, ndd2, ndd3, ghi_chu, nguoi_ghi, tao_luc)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        moc, ngay, thang, ten, khuVuc,
        chuoi(hocVien?.ndd1), chuoi(hocVien?.ndd2), chuoi(hocVien?.ndd3),
        'Tự ghi khi nhập tiến độ', nguoiGhi, Date.now(),
      ]
    );
    if (soDongDaGhi(kq) > 0) {
      daGhi.push({
        moc,
        tenMoc: TEN_MOC[moc],
        ten,
        khuVuc,
        ngay,
        thang,
        ndd1: chuoi(hocVien?.ndd1),
        ndd2: chuoi(hocVien?.ndd2),
        ndd3: chuoi(hocVien?.ndd3),
        nguoiDanDat: dsNguoiDanDat(hocVien),
      });
    }
  }
  return daGhi;
}

/**
 * Đếm số ca Hữu hiệu và Báp-têm trong một tháng từ sổ `so_moc`, gom theo Khu vực.
 * Nguồn đếm duy nhất của cả web (T-010, 20/10/2026).
 */
export async function demMocTheoThang(db, thang) {
  const rows = await db.all(
    `SELECT khu_vuc, moc, COUNT(*) AS so
       FROM so_moc
      WHERE thang = ? AND moc IN ('huu_hieu', 'bap_tem')
      GROUP BY khu_vuc, moc`,
    [thang]
  );
  const huuHieu = {};
  const bt = {};
  for (const r of rows) {
    const kv = chuoi(r.khu_vuc);
    if (!kv) continue;
    const so = soNguyen(r.so);
    if (r.moc === 'huu_hieu') huuHieu[kv] = so;
    else if (r.moc === 'bap_tem') bt[kv] = so;
  }
  return { huuHieu, bt };
}

/**
 * Đếm số ca Hữu hiệu và Báp-têm theo từng tuần trong tháng từ sổ `so_moc`.
 * Dùng cùng hàm `tuanTrongThang` / `cacTuanCuaThang` với biểu đồ tuần Đơn thuần
 * để tổng các tuần luôn bằng đúng tổng tháng.
 */
export async function demMocTheoTuan(db, thang) {
  const rows = await db.all(
    `SELECT khu_vuc, moc, ngay
       FROM so_moc
      WHERE thang = ? AND moc IN ('huu_hieu', 'bap_tem')`,
    [thang]
  );
  const soTuan = cacTuanCuaThang(thang).length || 5;
  const huuHieu = {};
  const bt = {};
  for (const r of rows) {
    const kv = chuoi(r.khu_vuc);
    const tuan = tuanTrongThang(r.ngay);
    if (!kv || !tuan || tuan > soTuan) continue;
    if (r.moc === 'huu_hieu') {
      if (!huuHieu[kv]) huuHieu[kv] = new Array(soTuan).fill(0);
      huuHieu[kv][tuan - 1]++;
    } else if (r.moc === 'bap_tem') {
      if (!bt[kv]) bt[kv] = new Array(soTuan).fill(0);
      bt[kv][tuan - 1]++;
    }
  }
  return { soTuan, huuHieu, bt };
}

/**
 * Đếm số người KHÁC NHAU có ít nhất một mốc ('huu_hieu' hoặc 'bap_tem')
 * trong tháng từ sổ `so_moc`, gom theo Khu vực: { [khuVuc]: so }.
 * Một người nhảy B1 lên BT cùng tháng (hai dòng sổ) chỉ đếm một; người Báp-têm
 * đã hữu hiệu từ tháng trước (chỉ có dòng 'bap_tem' trong tháng này) vẫn được đếm.
 */
export async function demNguoiDiTiepTheoThang(db, thang) {
  const rows = await db.all(
    `SELECT khu_vuc, COUNT(DISTINCT ten) AS so
       FROM so_moc
      WHERE thang = ? AND moc IN ('huu_hieu', 'bap_tem')
      GROUP BY khu_vuc`,
    [thang]
  );
  const map = {};
  for (const r of rows) {
    const kv = chuoi(r.khu_vuc);
    if (!kv) continue;
    map[kv] = soNguyen(r.so);
  }
  return map;
}

// =====================================================================
// C. XẾP HẠNG   (không còn tính điểm — xem chú thích đầu file)
// =====================================================================

/**
 * Cộng một phần đóng góp vào bảng.
 *
 * @param soCaThem  Số ca cộng thêm. Hữu hiệu / Báp-têm luôn là 1 (một dòng sổ =
 *   một học viên). Đơn thuần thì truyền **số lượng đã chia cho số người dẫn dắt**,
 *   chứ KHÔNG phải 1 — vì một dòng nhật ký có thể ghi 100 đơn thuần, hiện "1"
 *   ở cột Đơn thuần là sai (anh Rise phát hiện 13/08/2026).
 */
function themVao(bang, ten, moc, soCaThem = 1) {
  const khoa = ten.toLowerCase();
  if (!bang[khoa]) {
    bang[khoa] = {
      ten,
      soCa: { don_thuan: 0, huu_hieu: 0, bap_tem: 0 },
    };
  }
  bang[khoa].soCa[moc] += soCaThem;
}

/**
 * Bảng xếp hạng gộp cả ba chặng — MỘT bảng duy nhất của cả web.
 *
 * Ba cột: Đơn thuần · Hữu hiệu · Báp-têm, web tự đếm cả ba.
 *
 * Xếp theo Báp-têm > Hữu hiệu > Đơn thuần (anh Rise chốt 30/08/2026): trong
 * một kỳ truyền đạo thì báp-têm là đích cuối, nên ai có báp-têm đứng trên;
 * bằng nhau mới xét tiếp Hữu hiệu rồi Đơn thuần. Bằng hết thì xếp theo tên
 * cho thứ tự ổn định, không nhảy lung tung mỗi lần tải lại.
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
  const tong = { soDonThuan: 0, soHuuHieu: 0, soBapTem: 0, soChuaCoNguoi: 0 };

  // --- Đơn thuần ---
  for (const r of dsDT) {
    const soLuong = soNguyen(r.don_thuan);
    if (soLuong <= 0) continue;
    tong.soDonThuan += soLuong;

    const ndd = dsNguoiDanDat(r);
    // Dòng không ghi tên ai thì số KHÔNG bốc hơi: vẫn vào tổng của phòng, và
    // đếm riêng vào `soChuaCoNguoi` để anh Rise thấy có chỗ nhập thiếu tên.
    if (!ndd.length) { tong.soChuaCoNguoi += soLuong; continue; }
    // Cột "Đơn thuần" đếm SỐ LƯỢNG đã chia đều, không đếm số dòng nhật ký.
    for (const ten of ndd) themVao(bang, ten, 'don_thuan', soLuong / ndd.length);
  }

  // --- Hữu hiệu & Báp-têm ---
  for (const r of dsMoc) {
    const moc = chuoi(r.moc);
    // ⚠️ Bỏ qua mọi mốc ngoài hai mốc này — kể cả dòng cũ 'bap_tem_du_le' /
    // 'chien_bi_mat' còn sót trong CSDL từ bản 27/08. Xem DS_MOC_SO.
    if (moc !== 'huu_hieu' && moc !== 'bap_tem') continue;
    if (moc === 'huu_hieu') tong.soHuuHieu += 1;
    else tong.soBapTem += 1;

    const ndd = dsNguoiDanDat(r);
    if (!ndd.length) continue;
    // KHÔNG chia — đây là số NGƯỜI, mỗi người dẫn dắt được tính trọn 1.
    for (const ten of ndd) themVao(bang, ten, moc);
  }

  const danhSach = Object.values(bang)
    .map((x) => ({
      ten: x.ten,
      donThuan: tron2(x.soCa.don_thuan),
      huuHieu: x.soCa.huu_hieu,
      bapTem: x.soCa.bap_tem,
      soCa: tron2(x.soCa.don_thuan + x.soCa.huu_hieu + x.soCa.bap_tem),
    }))
    .sort((a, b) => (b.bapTem - a.bapTem) || (b.huuHieu - a.huuHieu)
      || (b.donThuan - a.donThuan) || a.ten.localeCompare(b.ten, 'vi'));

  // Hạng: giống hệt CẢ BA cột thì cùng hạng (1,1,1,4 — không phải 1,2,3,4).
  const khoaSo = (x) => [x.bapTem, x.huuHieu, x.donThuan].join('|');
  let hang = 0;
  let truoc = null;
  danhSach.forEach((x, i) => {
    const k = khoaSo(x);
    if (k !== truoc) { hang = i + 1; truoc = k; }
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
      // Đơn thuần của những dòng không ghi tên ai — vẫn vào tổng của phòng,
      // nhưng chưa vào dòng của ai. Nêu ra để thấy có chỗ nhập thiếu tên.
      soChuaCoNguoi: tong.soChuaCoNguoi,
      soNguoiCoCa: danhSach.length,
    },
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
