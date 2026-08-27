// =====================================================================
// TAB BÁO CÁO — bảng kiểm 5 hạng mục theo tuần  (thêm 26/08/2026)
//
// ⭐ MỤC TIÊU SỐ MỘT (anh Rise nói rõ): tạo THÓI QUEN nhập đủ mỗi tuần.
// KHÔNG phải làm một bản báo cáo đẹp để gửi lên trên. Nhập đủ thì bản nào
// cũng có; nhập thiếu thì bản đẹp mấy cũng vô nghĩa.
//
// ⚠️⚠️ NGUYÊN TẮC LỚN NHẤT CỦA FILE NÀY: THÀ BỎ SÓT CÒN HƠN BÁO THIẾU OAN.
// Bảng kiểm chấm "đủ / thiếu" cho cả phòng. Báo thiếu một lần oan là người
// ta mất tin vào bảng kiểm, và từ đó bỏ qua cả những cảnh báo THẬT — tính
// năng coi như hỏng dù mã chạy đúng. Vì vậy ở đây có tới BA trạng thái
// "chưa nhưng không sao": chua / khong_ap_dung.
//
// ⚠️ Định nghĩa "đã nhập" là phần dễ sai nhất. Toàn bộ đã được KIỂM CHỨNG
// TRÊN SỐ THẬT ngày 26/08/2026 (chỉ chạy SELECT) — xem chú thích từng hạng
// mục bên dưới.
// =====================================================================

import { KHU_VUC_LIST } from '../hang-so.js';
import { kiemTraThang, chuoi, homNay } from '../tien-ich.js';
import { cacTuanCuaThang } from '../lich-tuan.js';
import { phamViKhuVuc, duocXemKhuVuc } from '../auth.js';
import { guiTelegramNgam, thoatHtml } from '../telegram.js';

// ---------------------------------------------------------------------
// Hằng số
// ---------------------------------------------------------------------

/**
 * Số ngày ân hạn sau khi tuần kết thúc mới tính là TRỄ (anh Rise chốt
 * 25/08/2026: "hết tuần + 2 ngày ân hạn, quá thì hiện ❌").
 */
export const AN_HAN_NGAY = 2;

/**
 * Tuần lớn nhất mà các bảng NHẬP TAY chấp nhận.
 * Thờ phượng / Điểm danh / Giáo dục chỉ cho tuần 1..5. Đã rà lịch 2026-2030
 * (xem CVTL-KE-HOACH-BAO-CAO.md mục 5.4): tuần 6 chỉ bao giờ gồm ngày 30/31
 * nên KHÔNG BAO GIỜ có Thứ Ba hay Thứ Bảy → giới hạn 5 là ĐÚNG, không phải
 * lỗi. Ở tuần 6 các hạng mục đó phải hiện "—", tuyệt đối không hiện "thiếu".
 */
export const TUAN_TOI_DA_NHAP_TAY = 5;

/** Các hàm ghi của tab Đào tạo — dùng để biết tuần đó có ai đụng vào không. */
export const HAM_DAO_TAO = ['toggleDaoTaoBai', 'setDaoTaoBaiAll', 'setDaoTaoQuyenAll', 'capChungChiDaoTao'];

/** Hàm ghi của tab Lễ hội. */
export const HAM_LE_HOI = ['toggleLeHoiLan'];

/**
 * NĂM dòng của bảng kiểm — đúng 5 hạng mục anh Rise chốt 26/08/2026:
 * "thờ phượng, trudo, giáo dục, đào tạo, lễ hội lời".
 *
 * ⚠️⚠️ 27/08/2026 — ĐÃ BỎ dòng thứ sáu "Trudo — điểm danh công việc".
 * Bản đầu có nó vì anh Rise liệt kê điểm danh công việc trong nhóm Trudo.
 * NHƯNG hôm sau anh nói rõ: **việc đó nhập thẳng trên My Memo**, bảng
 * `cv_cong_viec` trên web chỉ để CHỮA CHÁY khi ai đó nhập muộn ở My Memo.
 * Nghĩa là bảng trống KHÔNG có nghĩa là chưa làm — nó là bình thường.
 * Chấm ⚠️ ở đó là **báo thiếu oan cho cả 8 khu vực, mọi tuần**, và vì một ô
 * ⚠️ đủ làm cả dòng tuần đỏ nên nó nhuộm đỏ luôn bảng theo dõi toàn Si-ôn.
 *
 * 📌 BÀI HỌC: trước khi chấm một bảng dữ liệu, phải hỏi **bảng đó có phải
 * NGUỒN THẬT không**. "Có dữ liệu" ≠ "là nơi người ta nhập". Ở dự án này sổ
 * gốc là My Memo; web chỉ là lớp con số chép sang.
 *
 * ⚠️ Bảng `cv_cong_viec` và tab Trudo GIỮ NGUYÊN — chữa cháy vẫn dùng được.
 * Chỉ bỏ khỏi phần CHẤM ĐIỂM.
 */
export const HANG_MUC = [
  { ma: 'tho_phuong', ten: 'Thờ phượng', nhom: 'Thờ phượng' },
  { ma: 'trudo_truyen_dao', ten: 'Trudo — truyền đạo', nhom: 'Trudo' },
  { ma: 'giao_duc', ten: 'Giáo dục', nhom: 'Giáo dục' },
  { ma: 'dao_tao', ten: 'Đào tạo 70 bài', nhom: 'Đào tạo' },
  { ma: 'le_hoi', ten: 'Lễ hội Lời', nhom: 'Lễ hội' },
];

/**
 * BỐN trạng thái của một ô trong bảng kiểm (27/08/2026 — trước là năm).
 *   du               ✅ người đã TÍCH V
 *   chua             ⬜ chưa tích, nhưng CHƯA quá hạn -> KHÔNG phải lỗi
 *   tre              ⬜ chưa tích và ĐÃ quá hạn (hết tuần + 2 ngày ân hạn)
 *   khong_ap_dung    ➖ tuần đó không có buổi / không áp dụng
 *
 * ⭐ ĐÃ BỎ trạng thái thứ năm (❓ "chưa đủ dữ liệu"): trước đây Đào tạo và Lễ
 * hội phải đoán qua nhật ký thay đổi (chỉ có từ 26/08/2026) nên mọi tuần
 * trước đó hiện ❓. Nay người tích tay nên máy không phải đoán — bớt được một
 * trạng thái mà ai nhìn cũng thấy khó hiểu.
 */
export const TRANG_THAI = ['du', 'chua', 'tre', 'khong_ap_dung'];

// ---------------------------------------------------------------------
// Tiện ích ngày tháng — tất cả dùng Date.UTC, KHÔNG dùng giờ máy chủ
// (Cloudflare chạy UTC, anh Rise ở UTC+7; lệch múi giờ là lệch ngày).
// ---------------------------------------------------------------------

/**
 * ⚠️ `kiemTraThang` dùng chung CHỈ kiểm ĐỊNH DẠNG yyyy-MM — '2026-13' vẫn
 * lọt qua (đã phát hiện khi làm trang Trợ lý 25/08/2026). Ở đây tháng quyết
 * định cả cái lịch tuần nên phải kiểm chặt hơn, nếu không `cacTuanCuaThang`
 * trả mảng rỗng và bảng kiểm hiện trắng trơn mà không ai hiểu vì sao.
 */
function kiemThangChat(thang) {
  const th = kiemTraThang(thang);
  const m = Number(th.slice(5, 7));
  if (!(m >= 1 && m <= 12)) throw new Error('Tháng không hợp lệ: ' + thang);
  return th;
}

function hai(n) {
  return String(n).padStart(2, '0');
}

/** ('2026-08', 5) -> '2026-08-05' */
function ngayKey(thangKey, ngay) {
  return thangKey + '-' + hai(ngay);
}

/** Cộng thêm n ngày vào 'yyyy-MM-dd', trả cùng định dạng. Sang tháng/năm vẫn đúng. */
function congNgay(key, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(n)));
  return d.getUTCFullYear() + '-' + hai(d.getUTCMonth() + 1) + '-' + hai(d.getUTCDate());
}

/** Mốc mili-giây -> 'yyyy-MM-dd' theo giờ Việt Nam. */
function ngayCuaMs(ms) {
  const d = new Date(Number(ms || 0) + 7 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + hai(d.getUTCMonth() + 1) + '-' + hai(d.getUTCDate());
}

/** 'yyyy-MM-dd' 00:00 giờ Việt Nam -> mili-giây. */
function msDauNgayVN(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return 0;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - 7 * 3600 * 1000;
}

function dinhDangThoiGian(ms) {
  const d = new Date(Number(ms || 0) + 7 * 3600 * 1000);
  return hai(d.getUTCDate()) + '/' + hai(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear()
    + ' ' + hai(d.getUTCHours()) + ':' + hai(d.getUTCMinutes());
}

/** '2026-08' + tuần {tuNgay:2, denNgay:8} -> '2–8/08' */
function nhanTuan(thangKey, t) {
  const mm = String(thangKey).slice(5, 7);
  if (t.tuNgay === t.denNgay) return t.tuNgay + '/' + mm;
  return t.tuNgay + '–' + t.denNgay + '/' + mm;
}

// ---------------------------------------------------------------------
// Danh sách khu vực — giống hệt cách các handler khác lấy, để thứ tự cột
// ở tab Báo cáo không bao giờ khác thứ tự ở các trang kia.
// ---------------------------------------------------------------------
async function layDanhSachKhuVuc(db) {
  const rows = await db.all(
    "SELECT gia_tri FROM config_list WHERE loai = 'khu_vuc' ORDER BY thu_tu, id"
  );
  const ds = (rows || []).map((r) => chuoi(r.gia_tri)).filter(Boolean);
  return ds.length ? ds : KHU_VUC_LIST.slice();
}

// ---------------------------------------------------------------------
// GOM DỮ LIỆU THÔ CỦA CẢ THÁNG — một lượt cho MỌI khu vực
//
// ⚠️ Vì sao gom một lượt rồi mới chia: bảng kiểm phải trả lời câu hỏi
// "(khu vực, tuần) này ĐÃ CÓ DÒNG chưa". Hỏi riêng từng khu vực × từng tuần
// là 8 x 6 x 6 = 288 lượt truy vấn cho một lần mở trang. Gom một lượt thì
// chỉ 6 truy vấn cho toàn bộ Si-ôn.
//
// ⚠️⚠️ VÌ SAO Ở ĐÂY VIẾT SQL RIÊNG CHỨ KHÔNG GỌI LẠI HÀM CŨ (bài học #33):
// bài học đó cấm TÍNH LẠI MỘT CON SỐ đã có nơi khác tính — vì hai nơi tính
// thì sớm muộn cũng lệch. Ở đây KHÔNG tính con số nào cả; câu hỏi là "có
// dòng hay không", mà không hàm nào đang trả lời câu đó. Ngược lại, dùng
// getTPSummary() là SAI: nó trả 0 cho cả "nhập 0" lẫn "chưa nhập" — hai
// việc khác hẳn nhau, và lẫn hai thứ đó lại chính là báo thiếu oan.
// ---------------------------------------------------------------------
async function gomDuLieuThang(db, thang) {
  const [tp, gd, dt, moc, nk, mocNhatKy] = await Promise.all([
    // 1. Thờ phượng — CHỈ CẦN CÓ ÍT NHẤT MỘT DÒNG cho (tháng, kv, tuần).
    //    ⚠️ Cố ý KHÔNG đòi đủ cả hai loại '1lan' và '4lan'. Kiểm chứng số
    //    thật 26/08/2026: TUẦN 1 tháng 8/2026 chỉ có ĐÚNG MỘT buổi (Thứ Bảy
    //    1/8) nên "≥4 lần" không thể khác 0 — 7/8 khu vực vì thế chỉ có dòng
    //    '1lan'. Đòi đủ hai dòng là báo thiếu oan cho gần cả phòng ngay ô
    //    đầu tiên của bảng.
    db.all("SELECT DISTINCT khu_vuc, tuan FROM tp_tho_phuong WHERE thang = ?", [thang]),

    // 2. Giáo dục — phải có ô EDU LMS thật sự được chọn, không chỉ có dòng.
    //    Dòng có thể được tạo ra khi lưu Trực 127 mà EDU LMS vẫn trống.
    db.all(
      "SELECT DISTINCT khu_vuc, tuan FROM giao_duc_thanh_vien"
      + " WHERE thang = ? AND trim(coalesce(edu_lms,'')) <> ''",
      [thang]
    ),

    // 3. Đơn thuần — theo NGÀY, phải quy về tuần bằng lịch thật.
    db.all(
      "SELECT DISTINCT khu_vuc, ngay FROM nhat_ky_don_thuan WHERE substr(ngay,1,7) = ?",
      [thang]
    ),

    // 4. Sổ mốc (hữu hiệu / báp-têm) — cũng theo ngày.
    //    ⭐ Nhờ bảng này mà Hữu hiệu / Báp-têm chia được theo tuần CHÍNH XÁC;
    //    hoc_vien.tien_do không có mốc thời gian nên không dùng được.
    db.all("SELECT DISTINCT khu_vuc, ngay FROM so_moc WHERE thang = ?", [thang]),

    // 5. Đào tạo + Lễ hội — hai tab này KHÔNG có cột "tuần" và KHÔNG có ngày
    //    cho từng thao tác, nên cách duy nhất biết "tuần đó có ai đụng vào
    //    không" là NHẬT KÝ THAY ĐỔI.
    db.all(
      'SELECT DISTINCT ham, khu_vuc, thoi_gian_ms FROM nhat_ky_thay_doi'
      + " WHERE thoi_gian_ms >= ? AND thoi_gian_ms < ? AND ket_qua = 'ok'"
      + " AND trim(coalesce(khu_vuc,'')) <> ''"
      + " AND ham IN ('toggleDaoTaoBai','setDaoTaoBaiAll','setDaoTaoQuyenAll',"
      + "'capChungChiDaoTao','toggleLeHoiLan')",
      [msDauNgayVN(thang + '-01'), msDauNgayVN(congNgay(thang + '-01', 40).slice(0, 7) + '-01')]
    ),

    // 6. ⚠️ Nhật ký chỉ bắt đầu ghi từ 26/08/2026. Mọi tuần KẾT THÚC trước
    //    mốc này thì hệ thống KHÔNG CÓ CÁCH NÀO biết Đào tạo / Lễ hội có
    //    được nhập hay không → phải hiện ❓, tuyệt đối không hiện ⚠️.
    db.first('SELECT MIN(thoi_gian_ms) AS m FROM nhat_ky_thay_doi', []),
  ]);

  const co = {}; // ma -> Set('<kv>|<tuần>')
  for (const h of HANG_MUC) co[h.ma] = new Set();

  const them = (ma, kv, tuan) => {
    const k = chuoi(kv);
    const t = Number(tuan);
    if (k && t) co[ma].add(k + '|' + t);
  };
  const themTheoNgay = (ma, kv, ngay) => {
    const s = chuoi(ngay);
    if (s.length < 10) return;
    them(ma, kv, tuanCuaNgayTrongThang(s));
  };

  for (const r of tp || []) them('tho_phuong', r.khu_vuc, r.tuan);
  for (const r of gd || []) them('giao_duc', r.khu_vuc, r.tuan);
  for (const r of dt || []) themTheoNgay('trudo_truyen_dao', r.khu_vuc, r.ngay);
  for (const r of moc || []) themTheoNgay('trudo_truyen_dao', r.khu_vuc, r.ngay);
  for (const r of nk || []) {
    const ma = HAM_DAO_TAO.indexOf(r.ham) >= 0 ? 'dao_tao'
      : (HAM_LE_HOI.indexOf(r.ham) >= 0 ? 'le_hoi' : '');
    if (!ma) continue;
    const ngay = ngayCuaMs(r.thoi_gian_ms);
    if (ngay.slice(0, 7) !== thang) continue; // thao tác của tháng khác thì bỏ
    themTheoNgay(ma, r.khu_vuc, ngay);
  }

  return { co, mocNhatKyMs: (mocNhatKy && Number(mocNhatKy.m)) || 0 };
}

/** '2026-08-23' -> 5 (tuần trong CHÍNH tháng của ngày đó). */
function tuanCuaNgayTrongThang(key) {
  const thang = String(key).slice(0, 7);
  const ngay = Number(String(key).slice(8, 10));
  const ds = cacTuanCuaThang(thang);
  for (const t of ds) if (ngay >= t.tuNgay && ngay <= t.denNgay) return t.tuan;
  return 0;
}

// ---------------------------------------------------------------------
// Lễ hội của tháng — chỉ hiện dòng Lễ hội khi tháng đó THẬT SỰ có lễ hội
// ---------------------------------------------------------------------
async function leHoiCuaThang(db, thang) {
  const dau = thang + '-01';
  const cuoi = thang + '-31';
  const r = await db.first(
    'SELECT ma_le_hoi, ten_le_hoi, ngay_bat_dau, ngay_ket_thuc FROM le_hoi_cau_hinh'
    + " WHERE coalesce(ngay_bat_dau,'') <> '' AND coalesce(ngay_ket_thuc,'') <> ''"
    + ' AND ngay_bat_dau <= ? AND ngay_ket_thuc >= ?'
    + ' ORDER BY ngay_bat_dau DESC LIMIT 1',
    [cuoi, dau]
  );
  if (!r) return null;
  return {
    ma: chuoi(r.ma_le_hoi),
    ten: chuoi(r.ten_le_hoi),
    tuNgay: chuoi(r.ngay_bat_dau),
    denNgay: chuoi(r.ngay_ket_thuc),
  };
}

/**
 * Tên hiển thị của một hạng mục.
 * Riêng Lễ hội thì ghi kèm tên lễ hội đang diễn ra — nhưng CHỈ khi tên đó
 * khác nhãn sẵn có, nếu không sẽ thành "Lễ hội Lời (Lễ hội Lời)".
 */
function tenHangMuc(h, leHoi) {
  if (h.ma !== 'le_hoi' || !leHoi || !leHoi.ten) return h.ten;
  return leHoi.ten === h.ten ? h.ten : h.ten + ' (' + leHoi.ten + ')';
}

// ---------------------------------------------------------------------
// CHẤM MỘT Ô — trái tim của bảng kiểm
// ---------------------------------------------------------------------
function chamMotO(maHangMuc, tuanInfo, boiCanhTuan) {
  const { thang, hom, daTich, leHoi } = boiCanhTuan;
  const t = tuanInfo;

  // --- (1) Hạng mục có ÁP DỤNG cho tuần này không? ---
  if (maHangMuc === 'tho_phuong') {
    // Không có Thứ Ba lẫn Thứ Bảy nào thuộc tháng -> không có buổi nào để đếm.
    if (!t.ngayT3 && !t.ngayT7) return 'khong_ap_dung';
    if (t.tuan > TUAN_TOI_DA_NHAP_TAY) return 'khong_ap_dung';
  }
  if (maHangMuc === 'giao_duc' && t.tuan > TUAN_TOI_DA_NHAP_TAY) return 'khong_ap_dung';
  if (maHangMuc === 'le_hoi') {
    if (!leHoi) return 'khong_ap_dung';
    const dauTuan = ngayKey(thang, t.tuNgay);
    const cuoiTuan = ngayKey(thang, t.denNgay);
    if (leHoi.denNgay && leHoi.denNgay < dauTuan) return 'khong_ap_dung';
    if (leHoi.tuNgay && leHoi.tuNgay > cuoiTuan) return 'khong_ap_dung';
  }

  // --- (2) ĐÃ TÍCH V thì xong, khỏi xét gì thêm ---
  // ⭐ 27/08/2026 — chấm theo LỜI KHAI của người dùng, KHÔNG theo dữ liệu máy
  // dò được. Anh Rise chọn "người tích hết, máy chỉ gợi ý": máy vẫn dò xem web
  // đã có số chưa (trường `goiY`) để NHẮC, nhưng không tự tích thay.
  if (daTich) return 'du';

  // --- (3) Chưa tích. Đã QUÁ HẠN chưa? ---
  // ⚠️ Chỗ chống "báo thiếu oan" quan trọng nhất: hạn là HẾT TUẦN cộng 2 ngày
  // ân hạn. Tuần đang diễn ra thì chưa ai trễ cả.
  //
  // ⭐⭐ TRẠNG THÁI 'chua_du_du_lieu' (❓) ĐÃ BỎ HẲN 27/08/2026. Trước đây Đào
  // tạo và Lễ hội phải đoán qua nhật ký thay đổi (chỉ có từ 26/08/2026) nên
  // mọi tuần trước đó phải hiện ❓. Nay người tích tay, máy không phải đoán
  // nữa — bớt được một trạng thái mà ai nhìn cũng thấy khó hiểu.
  const hanChot = congNgay(ngayKey(thang, t.denNgay), AN_HAN_NGAY);
  return hom > hanChot ? 'tre' : 'chua';
}

// ---------------------------------------------------------------------
// Dựng bảng kiểm đầy đủ cho MỘT khu vực trong MỘT tháng
// ---------------------------------------------------------------------
function dungBangKiem(thang, khuVuc, goi, leHoi, hom, dsBaoCao, dsTich) {
  const dsTuan = cacTuanCuaThang(thang);
  const banBaoCao = {};
  for (const b of dsBaoCao || []) banBaoCao[Number(b.tuan)] = b;
  // Ô đã tích V — khoá "<tuần>|<mã hạng mục>". Không có dòng = chưa tích.
  const daTichSet = new Set();
  for (const x of dsTich || []) {
    if (chuoi(x.khu_vuc) === khuVuc) daTichSet.add(Number(x.tuan) + '|' + chuoi(x.hang_muc));
  }

  const tuan = dsTuan.map((t) => {
    const dauTuan = ngayKey(thang, t.tuNgay);
    const cuoiTuan = ngayKey(thang, t.denNgay);
    const hanChot = congNgay(cuoiTuan, AN_HAN_NGAY);
    let thoiDiem = 'dang_dien';
    if (hom < dauTuan) thoiDiem = 'chua_toi';
    else if (hom > cuoiTuan) thoiDiem = 'da_qua';

    const hangMuc = HANG_MUC.map((h) => {
      const daTich = daTichSet.has(t.tuan + '|' + h.ma);
      // ⚠️ `goiY` KHÔNG dùng để chấm — chỉ để giao diện nhắc "web đã có số rồi,
      // nhớ tích V". Anh Rise chốt "người tích hết, máy chỉ gợi ý" (27/08/2026).
      const goiY = goi.co[h.ma].has(khuVuc + '|' + t.tuan);
      return {
        ma: h.ma,
        ten: tenHangMuc(h, leHoi),
        nhom: h.nhom,
        daTich,
        goiY,
        trangThai: chamMotO(h.ma, t, { thang, hom, daTich, leHoi }),
      };
    });

    const dem = (tt) => hangMuc.filter((x) => x.trangThai === tt).length;
    const bc = banBaoCao[t.tuan] || null;

    return {
      tuan: t.tuan,
      tuNgay: t.tuNgay,
      denNgay: t.denNgay,
      nhan: nhanTuan(thang, t),
      ngayT3: t.ngayT3,
      ngayT7: t.ngayT7,
      thoiDiem,
      hanChot,
      hangMuc,
      soDu: dem('du'),
      soChua: dem('chua'),
      soTre: dem('tre'),
      soApDung: hangMuc.filter(
        (x) => x.trangThai !== 'khong_ap_dung'
      ).length,
      baoCao: bc ? {
        daBaoCao: true,
        nguoi: chuoi(bc.nguoi_bao_cao),
        thoiGianMs: Number(bc.thoi_gian_ms) || 0,
        nhan: dinhDangThoiGian(bc.thoi_gian_ms),
      } : { daBaoCao: false },
    };
  });

  return { thang, khuVuc, homNay: hom, leHoi, tuan };
}

// ---------------------------------------------------------------------
// HÀM CÔNG KHAI 1 — bảng kiểm của MỘT khu vực (Màn hình A)
// ---------------------------------------------------------------------

/**
 * Bảng kiểm 5 hạng mục × mọi tuần của tháng, cho MỘT khu vực.
 *
 * ⚠️ Khoá quyền ngay tại đây (bài học #49 — giấu nút không phải là khoá):
 * chỉ khu vực trưởng của khu vực đó, địa vực trưởng, hoặc Admin. Anh Rise
 * chốt 26/08/2026: "đối với 9 tài khoản đó cũng ko cần xem phần báo cáo này
 * làm gì, vì họ chỉ là thánh đồ thôi".
 */
export async function getBaoCaoTuan({ db, nguoiGoi }, thang, khuVuc) {
  const th = kiemThangChat(thang);
  const kv = chuoi(khuVuc);
  if (!kv) throw new Error('Thiếu Khu vực.');
  if (!duocXemKhuVuc(nguoiGoi, kv)) throw new Error(loiKhongCoQuyen(nguoiGoi, kv));

  const [goi, leHoi, dsBaoCao, dsTich] = await Promise.all([
    gomDuLieuThang(db, th),
    leHoiCuaThang(db, th),
    db.all(
      'SELECT tuan, nguoi_bao_cao, thoi_gian_ms FROM bao_cao_tuan'
      + ' WHERE thang = ? AND khu_vuc = ?',
      [th, kv]
    ),
    db.all(
      'SELECT khu_vuc, tuan, hang_muc FROM bao_cao_tich WHERE thang = ? AND khu_vuc = ?',
      [th, kv]
    ),
  ]);

  return dungBangKiem(th, kv, goi, leHoi, homNay(), dsBaoCao, dsTich);
}

/**
 * ⭐⭐ BẬT / TẮT MỘT Ô TÍCH V  (thêm 27/08/2026)
 *
 * Anh Rise: "bỏ nút báo cáo thành tích V vào những hạng mục đã điểm danh hàng
 * tuần". Trước đây chỉ có MỘT nút cho cả tuần nên không biết hạng mục nào đã
 * xong; nay tích từng ô.
 *
 * ⚠️ Đây là LỜI KHAI, không phải số máy đo. Máy vẫn dò (trường `goiY`) để nhắc
 * "web đã có số rồi, nhớ tích", nhưng KHÔNG tự tích thay — anh Rise chốt
 * "người tích hết, máy chỉ gợi ý".
 *
 * ⚠️ Bỏ tích thì XOÁ dòng chứ không lưu cờ 0. "Chưa bao giờ tích" và "tích rồi
 * bỏ" là một chuyện — đừng đẻ thêm trạng thái.
 *
 * ⚠️ Quyền = quyền XEM bảng kiểm (`duocXemKhuVuc`), giống nút Báo cáo. Hệ
 * thống chỉ có MỘT cột `pham_vi`, không tách quyền xem với quyền ghi.
 */
export async function toggleBaoCaoTich({ db, nguoiGoi }, thang, khuVuc, tuan, hangMuc, tich) {
  const th = kiemThangChat(thang);
  const kv = chuoi(khuVuc);
  if (!kv) throw new Error('Thiếu Khu vực.');
  if (!duocXemKhuVuc(nguoiGoi, kv)) throw new Error(loiKhongCoQuyen(nguoiGoi, kv));

  const soTuan = Number(tuan);
  if (!cacTuanCuaThang(th).some((x) => x.tuan === soTuan)) {
    throw new Error('Tháng ' + th + ' không có Tuần ' + tuan + '.');
  }

  const ma = chuoi(hangMuc);
  if (!HANG_MUC.some((h) => h.ma === ma)) {
    throw new Error('Không có hạng mục "' + hangMuc + '".');
  }

  if (tich) {
    await db.run(
      'INSERT INTO bao_cao_tich (thang, khu_vuc, tuan, hang_muc, nguoi, thoi_gian_ms)'
      + ' VALUES (?,?,?,?,?,?)'
      + ' ON CONFLICT (thang, khu_vuc, tuan, hang_muc) DO UPDATE SET'
      + ' nguoi = excluded.nguoi, thoi_gian_ms = excluded.thoi_gian_ms',
      [th, kv, soTuan, ma, chuoi(nguoiGoi && nguoiGoi.email), Date.now()]
    );
  } else {
    await db.run(
      'DELETE FROM bao_cao_tich WHERE thang=? AND khu_vuc=? AND tuan=? AND hang_muc=?',
      [th, kv, soTuan, ma]
    );
  }
  return { success: true, thang: th, khuVuc: kv, tuan: soTuan, hangMuc: ma, tich: !!tich };
}

/** Câu nhắc khi tài khoản chưa được gán khu vực nào — dùng ở 2 chỗ. */
const NHAC_CHUA_GAN = 'Tài khoản của bạn chưa được gán khu vực phụ trách nên chưa dùng được '
  + 'tab Báo cáo. Xin báo Trưởng phòng vào mục "Duyệt truy cập" để gán giúp.';

/** Câu báo lỗi tiếng Việt, KHÔNG dùng từ kỹ thuật (bài học #32). */
function loiKhongCoQuyen(nguoiGoi, kv) {
  const dsCua = chuoi(nguoiGoi && nguoiGoi.phamVi);
  if (!dsCua) return NHAC_CHUA_GAN;
  return 'Bạn không phụ trách khu vực "' + kv + '" nên không xem được bảng kiểm của khu vực đó. '
    + 'Bạn đang phụ trách: ' + dsCua + '.';
}

// ---------------------------------------------------------------------
// HÀM CÔNG KHAI 2 — lưới toàn Si-ôn (Màn hình B, ở chip 📊 Tổng)
// ---------------------------------------------------------------------

/**
 * Lưới ✅/⚠️ của MỌI khu vực × mọi tuần trong tháng.
 *
 * ⚠️ CỐ Ý KHÔNG lọc theo phạm vi: anh Rise chốt 26/08/2026 rằng phần này
 * "ai cũng thấy đủ 8 khu vực" vì nó CHỈ CÓ DẤU TICK, không có con số —
 * để cả phòng nhìn nhau mà cố. Nhưng vẫn phải CÓ phạm vi mới gọi được (tức
 * là khu vực trưởng trở lên), giống hệt tab Báo cáo.
 */
export async function getBaoCaoLuoi({ db, nguoiGoi }, thang) {
  const th = kiemThangChat(thang);
  const dsKhuVuc = await layDanhSachKhuVuc(db);
  if (!phamViKhuVuc(nguoiGoi, dsKhuVuc).length) {
    throw new Error(NHAC_CHUA_GAN);
  }

  const [goi, leHoi, dsBaoCao, dsTich] = await Promise.all([
    gomDuLieuThang(db, th),
    leHoiCuaThang(db, th),
    db.all(
      'SELECT khu_vuc, tuan, nguoi_bao_cao, thoi_gian_ms FROM bao_cao_tuan WHERE thang = ?',
      [th]
    ),
    db.all('SELECT khu_vuc, tuan, hang_muc FROM bao_cao_tich WHERE thang = ?', [th]),
  ]);

  const theoKV = {};
  for (const b of dsBaoCao || []) {
    const k = chuoi(b.khu_vuc);
    if (!theoKV[k]) theoKV[k] = [];
    theoKV[k].push(b);
  }

  const hom = homNay();
  const dong = dsKhuVuc.map((kv) => {
    const bang = dungBangKiem(th, kv, goi, leHoi, hom, theoKV[kv] || [], dsTich);
    // Tổng theo hạng mục cho cả tháng — để cột bên phải nói được
    // "Giáo dục: đủ 3/5 tuần" chứ không chỉ có dấu tick từng tuần.
    const theoHangMuc = {};
    for (const h of HANG_MUC) theoHangMuc[h.ma] = { du: 0, tre: 0, chua: 0, apDung: 0 };
    for (const t of bang.tuan) {
      for (const o of t.hangMuc) {
        const g = theoHangMuc[o.ma];
        if (o.trangThai === 'khong_ap_dung') continue;
        g.apDung += 1;
        if (o.trangThai === 'du') g.du += 1;
        else if (o.trangThai === 'tre') g.tre += 1;
        else g.chua += 1;
      }
    }
    return {
      khuVuc: kv,
      laCuaToi: duocXemKhuVuc(nguoiGoi, kv),
      tuan: bang.tuan.map((t) => ({
        tuan: t.tuan,
        nhan: t.nhan,
        thoiDiem: t.thoiDiem,
        daBaoCao: !!t.baoCao.daBaoCao,
        nhanBaoCao: t.baoCao.nhan || '',
        soTre: t.soTre,
        soChua: t.soChua,
        soDu: t.soDu,
        soApDung: t.soApDung,
      })),
      theoHangMuc,
    };
  });

  return {
    thang: th,
    homNay: hom,
    leHoi,
    hangMuc: HANG_MUC.map((h) => ({
      ma: h.ma,
      ten: tenHangMuc(h, leHoi),
    })),
    soTuan: cacTuanCuaThang(th).length,
    dong,
  };
}

// ---------------------------------------------------------------------
// HÀM CÔNG KHAI 3 — bấm Báo cáo
// ---------------------------------------------------------------------

/**
 * Chốt báo cáo một tuần của một khu vực.
 *
 * ⚠️ CỐ Ý KHÔNG chặn khi còn hạng mục thiếu (anh Rise chốt: cảnh báo mềm,
 * không khoá cứng). Khoá cứng sẽ chặn người ta trong tình huống hợp lệ —
 * ví dụ tuần đó khu vực thật sự không có ai đơn thuần — và họ sẽ bỏ dùng,
 * điều đó tệ hơn nhập thiếu. Chính CÁI BẤM là dấu xác nhận "số của tôi tuần
 * này đã xong, kể cả khi bằng 0". Giao diện lo phần hỏi lại.
 *
 * Telegram CHỈ gửi LẦN ĐẦU — bấm lại hay hủy rồi bấm lại đều không gửi nữa
 * (anh Rise chốt 25/08/2026), để không biến nhóm chat thành chỗ spam.
 */
export async function saveBaoCaoTuan(ctx, thang, khuVuc, tuan) {
  const { db, nguoiGoi } = ctx;
  const th = kiemThangChat(thang);
  const kv = chuoi(khuVuc);
  if (!kv) throw new Error('Thiếu Khu vực.');
  if (!duocXemKhuVuc(nguoiGoi, kv)) throw new Error(loiKhongCoQuyen(nguoiGoi, kv));

  const soTuan = Number(tuan);
  const dsTuan = cacTuanCuaThang(th);
  if (!dsTuan.some((x) => x.tuan === soTuan)) {
    throw new Error('Tháng ' + th + ' không có Tuần ' + tuan + '.');
  }

  const [goi, leHoi, daCo, dsTich] = await Promise.all([
    gomDuLieuThang(db, th),
    leHoiCuaThang(db, th),
    db.first('SELECT thoi_gian_ms FROM bao_cao_tuan WHERE thang=? AND khu_vuc=? AND tuan=?',
      [th, kv, soTuan]),
    db.all('SELECT khu_vuc, tuan, hang_muc FROM bao_cao_tich WHERE thang=? AND khu_vuc=?',
      [th, kv]),
  ]);

  const bang = dungBangKiem(th, kv, goi, leHoi, homNay(), [], dsTich);
  const oTuan = bang.tuan.find((x) => x.tuan === soTuan);
  const bay = Date.now();
  const email = chuoi(nguoiGoi && nguoiGoi.email);

  await db.run(
    'INSERT INTO bao_cao_tuan (thang, khu_vuc, tuan, snap_json, nguoi_bao_cao, thoi_gian_ms)'
    + ' VALUES (?,?,?,?,?,?)'
    + ' ON CONFLICT (thang, khu_vuc, tuan) DO UPDATE SET'
    + ' snap_json = excluded.snap_json, nguoi_bao_cao = excluded.nguoi_bao_cao,'
    + ' thoi_gian_ms = excluded.thoi_gian_ms',
    [th, kv, soTuan, '', email, bay]
  );

  if (!daCo) {
    const thieu = oTuan
      ? oTuan.hangMuc.filter((x) => x.trangThai === 'tre' || x.trangThai === 'chua')
      : [];
    const dong = [
      '<b>BÁO CÁO TUẦN ' + soTuan + '</b>',
      'Khu vực: <b>' + thoatHtml(kv) + '</b>',
      'Tháng: ' + thoatHtml(th) + (oTuan ? ' (' + thoatHtml(oTuan.nhan) + ')' : ''),
      'Người báo cáo: ' + thoatHtml(email || '(không rõ)'),
      'Lúc: ' + dinhDangThoiGian(bay),
      thieu.length
        ? 'Còn chưa tích: ' + thoatHtml(thieu.map((x) => x.ten).join(', '))
        : 'Đã tích đủ mọi hạng mục.',
    ];
    guiTelegramNgam(ctx.ctx, ctx.env, dong.join('\n'));
  }

  return { success: true, thang: th, khuVuc: kv, tuan: soTuan, thoiGianMs: bay, daGuiTin: !daCo };
}

/**
 * Gỡ báo cáo một tuần. `chuThoi: true` — chỉ Trưởng phòng / Admin.
 * Giữ lại nút này vì lỡ bấm nhầm thì phải có đường gỡ (bài học #28).
 */
export async function huyBaoCaoTuan({ db }, thang, khuVuc, tuan) {
  const th = kiemThangChat(thang);
  const kv = chuoi(khuVuc);
  if (!kv) throw new Error('Thiếu Khu vực.');
  const soTuan = Number(tuan);
  if (!soTuan) throw new Error('Thiếu Tuần.');
  await db.run('DELETE FROM bao_cao_tuan WHERE thang=? AND khu_vuc=? AND tuan=?',
    [th, kv, soTuan]);
  return { success: true, thang: th, khuVuc: kv, tuan: soTuan };
}
