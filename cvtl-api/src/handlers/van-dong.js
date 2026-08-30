// =====================================================================
// KỲ VẬN ĐỘNG TRUYỀN ĐẠO  (thêm 27/08/2026)
// Kỳ đầu tiên: "Vận động Thánh Linh Lễ Lều Tạm", 01/09 → 30/09/2026.
//
// ⭐⭐ VÌ SAO FILE NÀY KHÔNG GIỐNG dao-tao-le-hoi.js
// Lễ hội Lời là một DANH SÁCH HỮU HẠN: 5 bài × 3 lần = 15 ô, người tự tay
// tích, tích hết là xong. Kỳ vận động truyền đạo thì ngược hẳn — nó là con
// số TĂNG KHÔNG GIỚI HẠN, và quan trọng hơn: **số đã được nhập ở chỗ khác
// rồi** (Nhật ký đơn thuần + Sổ mốc). Ở đây KHÔNG CÓ GÌ ĐỂ TÍCH.
//
// Anh Rise chốt 27/08/2026: "web chỉ chép con số, và chỉ chép một lần".
// Nên file này CHỈ ĐỌC. Không có một hàm ghi nào, và cố ý là như vậy —
// thêm một màn hình nhập liệu ở đây là bắt cả phòng nhập lại lần thứ hai.
//
// ⚠️⚠️ CÁCH TÍNH ĐIỂM NẰM TRONG CSDL, KHÔNG NẰM TRONG FILE NÀY.
// Hội Thánh sẽ ban hành bảng điểm, và bảng điểm kiểu này hay đổi giữa kỳ.
// Cột `le_hoi_cau_hinh.cach_tinh` giữ JSON đó. Ai định "cho nhanh" bằng cách
// viết thẳng con số điểm vào đây: đừng — mỗi lần Hội Thánh đổi là một lần
// phải sửa mã và đẩy lại web cho cả phòng, tức là một lần rủi ro.
//
// ⚠️ HAI NGUỒN SỐ, ĐÃ CÂN NHẮC KỸ:
//   Đơn thuần        <- nhat_ky_don_thuan (theo cột `ngay`)
//   Hữu hiệu/Báp-têm <- so_moc            (theo cột `ngay`)
// KHÔNG dùng bảng `hoc_vien` như bảng 🏆 Thi đua đang làm. Lý do dứt khoát:
// kỳ vận động bị chặn bởi HAI NGÀY (01/09 và 30/09), mà chỉ `so_moc` mới ghi
// NGÀY đạt mốc. `hoc_vien` không có ngày báp-têm — bảng Thi đua đang phải
// suy tháng từ "ngày đầu chia sẻ", thứ không liên quan gì đến ngày một người
// được báp-têm. Hệ quả phải biết: số Báp-têm ở đây CÓ THỂ KHÁC bảng Thi đua.
// =====================================================================

import { chuoi, chuanNgay, soNguyen, phanTram, homNay } from '../tien-ich.js';
import { KHU_VUC_LIST } from '../hang-so.js';
import { phamViKhuVuc, duocXemKhuVuc } from '../auth.js';
import { dsNguoiDanDat } from './tru-do.js';

/** Các hạng mục của kỳ vận động, đúng thứ tự hiển thị. */
export const HANG_MUC_VD = ['donThuan', 'huuHieu', 'bapTem', 'bapTemDuLe', 'chienBiMat'];

/** Tên tiếng Việt để ghép câu lỗi / tiêu đề cột. */
export const TEN_HANG_MUC_VD = {
  donThuan: 'Đơn thuần',
  huuHieu: 'Hữu hiệu',
  bapTem: 'Báp-têm',
  bapTemDuLe: 'Báp-têm dự lễ',
  chienBiMat: 'Chiên bị mất',
};

/**
 * ⚠️ CHỈ BA hạng mục cũ có chỗ đặt mục tiêu (bảng `muc_tieu_ca_nhan` chỉ có
 * mt_don_thuan / mt_huu_hieu / mt_bt). Hai hạng mục mới KHÔNG có đích — và cố
 * ý không thêm cột mục tiêu cho chúng lúc này: bảng điểm vừa mới ban hành,
 * chưa ai biết đặt đích bao nhiêu là hợp lý. Ô của chúng chỉ hiện con số.
 *
 * Nếu hiện "chưa đặt MT" cho hai cột KHÔNG BAO GIỜ đặt được thì đó là lời
 * nhắc vĩnh viễn không ai làm gì được — nhiễu, và người ta sẽ quen bỏ qua cả
 * những lời nhắc thật.
 */
export const HANG_MUC_CO_DICH = ['donThuan', 'huuHieu', 'bapTem'];

/** Cột `moc` trong bảng so_moc -> tên trường ở đây. */
const MOC_SANG_TRUONG = {
  huu_hieu: 'huuHieu',
  bap_tem: 'bapTem',
  bap_tem_du_le: 'bapTemDuLe',
  chien_bi_mat: 'chienBiMat',
};

/**
 * Cách tính MẶC ĐỊNH khi cột `cach_tinh` còn trống — tức là khi Hội Thánh
 * chưa ban hành bảng điểm. Anh Rise chốt 27/08/2026: "xếp theo số lượng
 * báp têm".
 *
 * ⚠️ Xếp thuần theo báp-têm thì cả bảng dễ hoà nhau ở 0 (tháng 8/2026 cả
 * Si-ôn chỉ có 2 báp-têm). Nên bằng nhau thì xét tiếp Hữu hiệu rồi Đơn
 * thuần — báp-têm vẫn là thước đo chính, nhưng người chưa có báp-têm vẫn
 * được sắp theo công sức thật chứ không nằm lộn xộn theo bảng chữ cái.
 */
const CACH_TINH_MAC_DINH = {
  diem: null,
  chiaDeu: false,
  xepTheo: ['bapTem', 'huuHieu', 'donThuan'],
};

const KHOA_XEP_HOP_LE = ['diem', 'donThuan', 'huuHieu', 'bapTem'];

function tron2(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function danhSachCauHinh(db, loai) {
  const rows = await db.all(
    'SELECT gia_tri FROM config_list WHERE loai = ? ORDER BY thu_tu, id',
    [loai]
  );
  return rows.map((r) => chuoi(r.gia_tri)).filter(Boolean);
}

async function layDanhSachKhuVuc(db) {
  const ds = await danhSachCauHinh(db, 'khu_vuc');
  return ds.length ? ds : KHU_VUC_LIST.slice();
}

/**
 * Đọc JSON `cach_tinh`. Hỏng cú pháp thì KHÔNG ném lỗi — trả về mặc định.
 * Lý do: bảng điểm do người gõ tay vào CSDL, gõ sai một dấu ngoặc mà làm sập
 * cả màn hình lễ hội giữa kỳ thì tệ hơn nhiều so với việc lặng lẽ dùng mặc
 * định. Giao diện có cờ `cachTinhHong` để hiện lời nhắc.
 */
function docCachTinh(raw) {
  const goc = { ...CACH_TINH_MAC_DINH, xepTheo: CACH_TINH_MAC_DINH.xepTheo.slice() };
  const s = chuoi(raw);
  if (!s) return { ...goc, cachTinhHong: false };

  let d = null;
  try { d = JSON.parse(s); } catch (e) { d = null; }
  if (!d || typeof d !== 'object') return { ...goc, cachTinhHong: true };

  const ra = { ...goc, cachTinhHong: false };

  if (d.diem && typeof d.diem === 'object') {
    const diem = {};
    let coSo = false;
    for (const k of HANG_MUC_VD) {
      const v = Number(d.diem[k]);
      diem[k] = Number.isFinite(v) ? v : 0;
      if (diem[k]) coSo = true;
    }
    ra.diem = coSo ? diem : null;
  }

  ra.chiaDeu = d.chiaDeu === true;

  if (Array.isArray(d.xepTheo)) {
    const loc = d.xepTheo.map(chuoi).filter((k) => KHOA_XEP_HOP_LE.includes(k));
    if (loc.length) ra.xepTheo = loc;
  }
  // Xếp theo điểm mà lại không khai bảng điểm thì không xếp được -> bỏ khoá đó.
  if (!ra.diem) ra.xepTheo = ra.xepTheo.filter((k) => k !== 'diem');
  if (!ra.xepTheo.length) ra.xepTheo = CACH_TINH_MAC_DINH.xepTheo.slice();
  return ra;
}

/** Một dòng cấu hình kỳ vận động, đã đọc sẵn cách tính. */
async function layCauHinhVanDong(db, maLeHoi) {
  const ma = chuoi(maLeHoi);
  if (!ma) throw new Error('Thiếu mã kỳ vận động.');
  const r = await db.first(
    `SELECT ma_le_hoi, ten_le_hoi, ngay_bat_dau, ngay_ket_thuc, loai, cach_tinh
       FROM le_hoi_cau_hinh WHERE ma_le_hoi = ?`,
    [ma]
  );
  if (!r) throw new Error('Không tìm thấy kỳ vận động: ' + ma);
  const loai = chuoi(r.loai) || 'loi';
  if (loai !== 'truyen_dao') {
    throw new Error('"' + ma + '" không phải kỳ vận động truyền đạo (loại: ' + loai + ').');
  }
  const bd = chuanNgay(r.ngay_bat_dau);
  const kt = chuanNgay(r.ngay_ket_thuc);
  if (!bd || !kt) throw new Error('Kỳ vận động "' + ma + '" chưa khai đủ ngày bắt đầu / kết thúc.');
  return {
    ma,
    ten: chuoi(r.ten_le_hoi),
    ngayBatDau: bd,
    ngayKetThuc: kt,
    // Mục tiêu cá nhân lưu theo THÁNG, nên lấy tháng của ngày bắt đầu.
    thangMucTieu: bd.slice(0, 7),
    cach: docCachTinh(r.cach_tinh),
  };
}

function oTrong() {
  const o = { diem: 0 };
  for (const k of HANG_MUC_VD) o[k] = 0;
  return o;
}

/**
 * Cộng số của cả kỳ, gom theo "<Khu vực>||<Tên người dẫn dắt>".
 *
 * ⚠️⚠️ BA QUY TẮC CỘNG — chép ĐÚNG theo bảng 🏆 Xếp hạng đã chạy từ trước
 * (getXepHang trong tru-do.js), để hai màn hình KHÔNG BAO GIỜ nói hai con số
 * khác nhau. Đây chính là bài học #33; bộ kiểm thử có ca đối chiếu tuyệt đối
 * giữa hai hàm khi `chiaDeu = true`.
 *   1. Đơn thuần  : SỐ LƯỢNG chia đều cho các người dẫn dắt — nếu `chiaDeu`.
 *   2. Hữu hiệu / Báp-têm : mỗi người dẫn dắt được tính 1, **KHÔNG BAO GIỜ
 *      chia** — vì đó là SỐ NGƯỜI, không phải số lượng.
 *   3. Điểm       : luôn chia theo cùng quy tắc với Đơn thuần.
 *
 * Dòng không ghi tên ai thì số vẫn được cộng vào TỔNG của phòng và cộng
 * riêng vào `chuaCoTen`, để anh Rise nhìn ra ngay là có chỗ nhập thiếu tên
 * chứ không phải số bốc hơi.
 */
async function congSoLieu(db, cauHinh) {
  const { ngayBatDau: tu, ngayKetThuc: den } = cauHinh;
  const { chiaDeu, diem } = cauHinh.cach;

  const [dsDT, dsMoc] = await Promise.all([
    db.all(
      `SELECT khu_vuc, don_thuan, ndd1, ndd2, ndd3 FROM nhat_ky_don_thuan
        WHERE ngay >= ? AND ngay <= ?`,
      [tu, den]
    ),
    db.all(
      `SELECT khu_vuc, moc, ndd1, ndd2, ndd3 FROM so_moc
        WHERE ngay >= ? AND ngay <= ?`,
      [tu, den]
    ),
  ]);

  const theoNguoi = new Map();   // "kv||ten" -> {khuVuc, ten, ...ô}
  const tong = oTrong();
  const chuaCoTen = oTrong();

  const lay = (kv, ten) => {
    const khoa = kv + '||' + ten;
    if (!theoNguoi.has(khoa)) theoNguoi.set(khoa, { khuVuc: kv, ten, ...oTrong() });
    return theoNguoi.get(khoa);
  };

  for (const r of dsDT) {
    const kv = chuoi(r.khu_vuc);
    const sl = soNguyen(r.don_thuan);
    if (!kv || sl <= 0) continue;
    const diemDong = diem ? sl * diem.donThuan : 0;
    tong.donThuan += sl;
    tong.diem += diemDong;

    const ndd = dsNguoiDanDat(r);
    if (!ndd.length) { chuaCoTen.donThuan += sl; chuaCoTen.diem += diemDong; continue; }
    const chia = chiaDeu ? ndd.length : 1;
    for (const ten of ndd) {
      const o = lay(kv, ten);
      o.donThuan += sl / chia;
      o.diem += diemDong / chia;
    }
  }

  for (const r of dsMoc) {
    const kv = chuoi(r.khu_vuc);
    const truong = MOC_SANG_TRUONG[chuoi(r.moc)];
    if (!kv || !truong) continue;
    const diemDong = diem ? diem[truong] : 0;
    tong[truong] += 1;
    tong.diem += diemDong;

    const ndd = dsNguoiDanDat(r);
    if (!ndd.length) { chuaCoTen[truong] += 1; chuaCoTen.diem += diemDong; continue; }
    const chia = chiaDeu ? ndd.length : 1;
    for (const ten of ndd) {
      const o = lay(kv, ten);
      // ⚠️ KHÔNG chia — số NGƯỜI thì mỗi người dẫn dắt đều được tính trọn 1.
      o[truong] += 1;
      o.diem += diemDong / chia;
    }
  }

  return { theoNguoi, tong, chuaCoTen };
}

/** Mục tiêu cá nhân của tháng, gom theo "<Khu vực>||<Tên>". */
async function layMucTieu(db, thang) {
  const rows = await db.all(
    `SELECT khu_vuc, ten, mt_don_thuan, mt_huu_hieu, mt_bt
       FROM muc_tieu_ca_nhan WHERE thang = ?`,
    [thang]
  );
  const map = new Map();
  for (const r of rows) {
    const kv = chuoi(r.khu_vuc);
    const ten = chuoi(r.ten);
    if (!kv || !ten) continue;
    map.set(kv + '||' + ten, {
      donThuan: soNguyen(r.mt_don_thuan),
      huuHieu: soNguyen(r.mt_huu_hieu),
      bapTem: soNguyen(r.mt_bt),
    });
  }
  return map;
}

/** Danh sách thành viên — dùng CHUNG với tab Giáo dục, giống Lễ hội Lời. */
async function layDanhSachThanhVien(db) {
  const rows = await db.all(
    `SELECT DISTINCT khu_vuc, ten FROM giao_duc_thanh_vien
      WHERE trim(coalesce(khu_vuc,'')) <> '' AND trim(coalesce(ten,'')) <> ''`
  );
  const ds = rows.map((r) => ({ khuVuc: chuoi(r.khu_vuc), ten: chuoi(r.ten) }));
  ds.sort((a, b) => (a.khuVuc !== b.khuVuc
    ? a.khuVuc.localeCompare(b.khuVuc, 'vi')
    : a.ten.localeCompare(b.ten, 'vi')));
  return ds;
}

function lamDep(o, coDiem) {
  const ra = {};
  for (const k of HANG_MUC_VD) ra[k] = tron2(o[k]);
  if (coDiem) ra.diem = tron2(o.diem);
  return ra;
}

function goiCauHinh(c) {
  return {
    ma: c.ma,
    ten: c.ten,
    ngayBatDau: c.ngayBatDau,
    ngayKetThuc: c.ngayKetThuc,
    thangMucTieu: c.thangMucTieu,
    coDiem: !!c.cach.diem,
    hangMuc: HANG_MUC_VD.map((k) => ({
      ma: k, ten: TEN_HANG_MUC_VD[k], coDich: HANG_MUC_CO_DICH.indexOf(k) >= 0,
    })),
    xepTheo: c.cach.xepTheo.slice(),
    chiaDeu: c.cach.chiaDeu,
    cachTinhHong: c.cach.cachTinhHong,
  };
}

// =====================================================================
// HÀM CÔNG KHAI 1 — bảng theo dõi của MỘT khu vực
// =====================================================================

/**
 * Bảng theo dõi kỳ vận động cho một khu vực: mỗi thành viên một dòng, kèm
 * đích lấy từ Mục tiêu cá nhân của tháng.
 *
 * ⚠️ `laKhach` là danh sách tên CÓ SỐ trong khu vực này nhưng KHÔNG có trong
 * danh sách thành viên (tab Giáo dục). Bắt buộc phải trả về: hai danh sách
 * này là hai bảng khác nhau (người dẫn dắt lấy từ cấu hình, thành viên lấy
 * từ bảng Giáo dục) nên tên lệch nhau là chuyện có thật. Không nói ra thì số
 * của họ lặng lẽ biến mất khỏi bảng mà không ai biết.
 */
export async function getVanDongTienDo({ db, nguoiGoi }, maLeHoi, khuVuc) {
  const kv = chuoi(khuVuc);
  if (!kv) throw new Error('Thiếu Khu vực.');
  if (!duocXemKhuVuc(nguoiGoi, kv)) {
    throw new Error('Bạn không phụ trách khu vực "' + kv + '" nên không xem được bảng này.');
  }

  const cauHinh = await layCauHinhVanDong(db, maLeHoi);
  const coDiem = !!cauHinh.cach.diem;
  const [{ theoNguoi, tong, chuaCoTen }, mucTieu, roster] = await Promise.all([
    congSoLieu(db, cauHinh),
    layMucTieu(db, cauHinh.thangMucTieu),
    layDanhSachThanhVien(db),
  ]);

  const cuaKV = roster.filter((x) => x.khuVuc === kv).map((x) => x.ten);
  const daCo = new Set(cuaKV);

  const tongKV = oTrong();
  const dichKV = {};
  for (const k of HANG_MUC_CO_DICH) dichKV[k] = 0;

  const dong = cuaKV.map((ten) => {
    const o = theoNguoi.get(kv + '||' + ten) || oTrong();
    const mt = mucTieu.get(kv + '||' + ten) || {};
    const dich = {};
    const pct = {};
    for (const k of HANG_MUC_VD) {
      tongKV[k] += o[k];
      // Hạng mục không có chỗ đặt mục tiêu -> `null`, KHÁC HẲN với 0.
      // null = "không có đích để so"; 0 = "có chỗ đặt nhưng chưa ai đặt".
      // Giao diện đọc hai thứ này ra hai câu khác nhau.
      if (HANG_MUC_CO_DICH.indexOf(k) < 0) { dich[k] = null; pct[k] = null; continue; }
      dich[k] = soNguyen(mt[k]);
      dichKV[k] += dich[k];
      // phanTram trả null khi mục tiêu = 0 -> giao diện hiện "chưa đặt MT",
      // TUYỆT ĐỐI không hiện 0% (đúng cách đã chốt ở bảng Thi đua 27/08).
      pct[k] = phanTram(o[k], dich[k]);
    }
    tongKV.diem += o.diem;
    return { ten, ...lamDep(o, coDiem), dich, phanTram: pct };
  });

  const laKhach = [];
  for (const o of theoNguoi.values()) {
    if (o.khuVuc !== kv || daCo.has(o.ten)) continue;
    if (!o.donThuan && !o.huuHieu && !o.bapTem) continue;
    laKhach.push({ ten: o.ten, ...lamDep(o, coDiem) });
  }
  laKhach.sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));

  return {
    ...goiCauHinh(cauHinh),
    khuVuc: kv,
    homNay: homNay(),
    dong,
    tong: { ...lamDep(tongKV, coDiem), dich: dichKV },
    laKhach,
    // Số của TOÀN Si-ôn trong kỳ — để khu vực biết mình đang ở đâu.
    toanSiOn: lamDep(tong, coDiem),
    chuaCoTen: lamDep(chuaCoTen, coDiem),
  };
}

// =====================================================================
// HÀM CÔNG KHAI 2 — xếp hạng toàn Si-ôn
// =====================================================================

/**
 * Xếp hạng người dẫn dắt trong cả kỳ, gộp mọi khu vực.
 *
 * ⚠️ Cố ý KHÔNG đặt `chuThoi`: giống lưới của tab Báo cáo, ai CÓ phạm vi đều
 * xem được đủ mọi khu vực — thi đua thì phải nhìn thấy nhau.
 *
 * Huy chương chỉ trao cho người thật sự có số ở hạng mục đứng đầu danh sách
 * `xepTheo` (mặc định là Báp-têm). Trao huy chương cho người 0 báp-têm trong
 * một kỳ vận động truyền đạo là mỉa mai.
 */
export async function getVanDongXepHang({ db, nguoiGoi }, maLeHoi) {
  const dsKV = await layDanhSachKhuVuc(db);
  if (!phamViKhuVuc(nguoiGoi, dsKV).length) {
    throw new Error('Tài khoản của bạn chưa được gán khu vực phụ trách nên chưa xem được bảng này.');
  }

  const cauHinh = await layCauHinhVanDong(db, maLeHoi);
  const coDiem = !!cauHinh.cach.diem;
  const [{ theoNguoi, tong, chuaCoTen }, roster] = await Promise.all([
    congSoLieu(db, cauHinh),
    layDanhSachThanhVien(db),
  ]);

  // Một người có thể dẫn dắt ở nhiều khu vực -> gộp theo TÊN, giống bảng
  // 🏆 Xếp hạng của Trudo. Khu vực hiển thị lấy từ danh sách thành viên.
  const kvCuaTen = new Map();
  for (const x of roster) if (!kvCuaTen.has(x.ten)) kvCuaTen.set(x.ten, x.khuVuc);

  const gop = new Map();
  for (const o of theoNguoi.values()) {
    if (!gop.has(o.ten)) gop.set(o.ten, { ten: o.ten, ...oTrong() });
    const g = gop.get(o.ten);
    for (const k of HANG_MUC_VD) g[k] += o[k];
    g.diem += o.diem;
  }

  const xepTheo = cauHinh.cach.xepTheo;
  const danhSach = [...gop.values()]
    .map((x) => ({
      ten: x.ten,
      khuVuc: kvCuaTen.get(x.ten) || '',
      ...lamDep(x, coDiem),
      _sx: x,
    }))
    .sort((a, b) => {
      for (const k of xepTheo) {
        const d = (Number(b._sx[k]) || 0) - (Number(a._sx[k]) || 0);
        if (d) return d;
      }
      return a.ten.localeCompare(b.ten, 'vi');
    });

  // Hạng: cùng số thì cùng hạng (1,1,1,4 — không phải 1,2,3,4), giống
  // getXepHang của tru-do.js.
  const khoaSo = (x) => xepTheo.map((k) => Number(x._sx[k]) || 0).join('|');
  let hang = 0;
  let truoc = null;
  danhSach.forEach((x, i) => {
    const k = khoaSo(x);
    if (k !== truoc) { hang = i + 1; truoc = k; }
    x.hang = hang;
    delete x._sx;
  });

  const truongDau = xepTheo[0];
  return {
    ...goiCauHinh(cauHinh),
    homNay: homNay(),
    truongXepHang: truongDau,
    danhSach,
    tong: lamDep(tong, coDiem),
    chuaCoTen: lamDep(chuaCoTen, coDiem),
  };
}
