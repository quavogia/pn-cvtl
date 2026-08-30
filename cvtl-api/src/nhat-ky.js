// =====================================================================
// NHẬT KÝ THAY ĐỔI SỐ LIỆU  (thêm 25/08/2026)
//
// Ghi lại: AI gọi hàm GHI nào, cho KHU VỰC nào, LÚC NÀO, thành công hay lỗi.
//
// Vì sao có file này: ngày 24/08/2026 có sự cố D1 mà không tra được nguyên
// nhân vì nhật ký đang tắt (bài học #31 trong CVTL-BAN-GIAO.md). Nhật ký
// KHÔNG HỒI TỐ — bật muộn ngày nào là mất lịch sử ngày đó.
//
// ⚠️⚠️ BỐN NGUYÊN TẮC — đừng phá:
//
// 1. KHÔNG BAO GIỜ làm hỏng lời gọi chính. Mọi lỗi trong file này đều bị
//    nuốt. Thà mất một dòng nhật ký còn hơn làm hỏng việc nhập liệu của cả
//    phòng.
//
// 2. CHỈ ghi hàm GHI (doc: false). Ghi cả hàm ĐỌC thì mỗi lần mở trang là
//    hàng chục dòng — vài ngày là ngập bảng. Ngoại lệ duy nhất: dòng
//    'bong_toi' (xem nguyên tắc 4).
//
// 3. KHÔNG ghi token, KHÔNG ghi "số sự sống" (CCCD). Chỉ tên hàm + khu vực
//    + tóm tắt tham số đã cắt ngắn.
//
// 4. Cột loai:
//      'ghi'      = một lệnh ghi thật đã chạy
//      'bong_toi' = lời gọi mà LUẬT PHÂN QUYỀN mới lẽ ra sẽ chặn, nhưng
//                   đang chạy thử nên vẫn cho qua. Dùng ở đợt phân quyền,
//                   xem CVTL-KE-HOACH-PHAN-QUYEN.md mục 5.
// =====================================================================

// Vị trí tham số khuVuc của từng hàm (0 = tham số đầu tiên SAU ctx).
// ⚠️ Bảng này SINH TỰ ĐỘNG từ chữ ký hàm trong src/handlers/*.js — nếu đổi
// thứ tự tham số của hàm nào thì PHẢI sửa ở đây, nếu không nhật ký sẽ ghi
// nhầm khu vực. Bộ kiểm thử kiem-thu-nhat-ky.mjs có ca kiểm chính chuyện này.
export const VI_TRI_KHU_VUC = {
  addCVNguoi: 0,
  addDiemDanhTreEm: 0,
  capChungChiDaoTao: 0,
  chotKy: 3,
  deleteDiemDanhTreEm: 0,
  deleteGiaoDucMember: 0,
  deleteGoalCaNhan: 1,
  deleteGoalKV: 1,
  dongBoTPTuDiemDanh: 1,
  donDepTPKhuVuc: 0,
  getBaoCaoTuan: 1,
  getCVCongViec: 0,
  getDaoTaoViecList: 0,
  getGiaoDucWeekly: 1,
  getKhuVucOverview: 1,
  getMocDaGhi: 1,
  getProgressBreakdown: 1,
  getSoMoc: 3,
  getXepHang: 2,
  hideCVNguoi: 0,
  huyBaoCaoTuan: 1,
  huyTPBaoCao: 1,
  moveDiemDanhTreEm: 0,
  saveBaoCaoTuan: 1,
  saveCVCongViec: 0,
  saveDiemDanhCell: 1,
  saveDiemDanhGhiChu: 0,
  saveGiaoDucWeek: 1,
  saveGoalCaNhan: 1,
  saveGoalKV: 1,
  saveTPBaoCao: 1,
  saveTPWeek: 1,
  setDaoTaoBaiAll: 0,
  setDaoTaoQuyenAll: 0,
  toggleBaoCaoTich: 1,
  toggleDaoTaoBai: 0,
  toggleLeHoiLan: 1,
  unhideCVNguoi: 0,
};

/**
 * Hàm này có phải hàm GHI không (nguyên tắc 2).
 * doc: true = hàm ĐỌC, KHÔNG ghi nhật ký. Mọi hàm còn lại đều ghi.
 * Tách riêng ra đây để kiểm thử được — router chỉ gọi lại.
 */
export function laHamGhi(muc) {
  return !!muc && muc.doc !== true;
}

/** Khu vực của một lời gọi — '' nếu hàm đó không gắn với khu vực nào. */
export function khuVucCuaLoiGoi(fn, args) {
  const i = VI_TRI_KHU_VUC[fn];
  if (i === undefined) return '';
  const v = (args || [])[i];
  return typeof v === 'string' ? v.trim() : '';
}

const DAI_TOI_DA = 300;

/**
 * Tóm tắt tham số để lưu. Cắt ngắn để một dòng nhật ký không phình to.
 * Không bao giờ ném lỗi — hỏng thì trả chuỗi rỗng.
 */
export function tomTatThamSo(args, gioiHan) {
  const max = gioiHan || DAI_TOI_DA;
  try {
    const s = JSON.stringify(args === undefined ? [] : args);
    if (typeof s !== 'string') return '';
    return s.length <= max ? s : s.slice(0, max) + '...(cat)';
  } catch (e) {
    return '';
  }
}

/**
 * Ghi thật một dòng. Dùng trực tiếp trong kiểm thử.
 * Vẫn nuốt lỗi — gọi ở đâu cũng an toàn.
 */
export async function ghiNhatKy(db, ban) {
  try {
    if (!db || !ban || !ban.ham) return false;
    await db.run(
      'INSERT INTO nhat_ky_thay_doi (thoi_gian_ms, loai, email, ham, khu_vuc, tham_so, ket_qua, ghi_chu)'
        + ' VALUES (?,?,?,?,?,?,?,?)',
      [
        Number(ban.thoiGianMs) || Date.now(),
        String(ban.loai || 'ghi'),
        String(ban.email || ''),
        String(ban.ham),
        String(ban.khuVuc || ''),
        String(ban.thamSo || ''),
        String(ban.ketQua || 'ok'),
        String(ban.ghiChu || ''),
      ]
    );
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Ghi ngầm, KHÔNG chờ, KHÔNG bao giờ ném lỗi.
 * Gọi từ router sau mỗi lời gọi. Dùng ctx.waitUntil nếu có để không làm
 * chậm phản hồi trả về cho người dùng.
 */
export function ghiNhatKyNen(boiCanh, ban) {
  try {
    const viec = ghiNhatKy(boiCanh && boiCanh.db, ban);
    const ctx = boiCanh && boiCanh.ctx;
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(viec);
    else if (viec && typeof viec.catch === 'function') viec.catch(function () {});
  } catch (e) {
    // nuốt — xem nguyên tắc 1
  }
}

/**
 * Đọc lại nhật ký. CHỈ tài khoản chủ/Admin (chuThoi trong registry.js).
 *   soNgay : lấy bao nhiêu ngày gần nhất (mặc định 7)
 *   khuVuc : lọc theo khu vực, '' = tất cả
 *   loai   : 'ghi' | 'bong_toi' | '' (tất cả)
 *   gioiHan: số dòng tối đa (mặc định 200, trần 1000)
 */
export async function getNhatKyThayDoi({ db }, soNgay, khuVuc, loai, gioiHan) {
  const ngay = Math.min(Math.max(Number(soNgay) || 7, 1), 365);
  const max = Math.min(Math.max(Number(gioiHan) || 200, 1), 1000);
  const tu = Date.now() - ngay * 24 * 60 * 60 * 1000;
  const kv = String(khuVuc || '').trim();
  const lo = String(loai || '').trim();

  let sql = 'SELECT id, thoi_gian_ms, loai, email, ham, khu_vuc, tham_so, ket_qua, ghi_chu'
    + ' FROM nhat_ky_thay_doi WHERE thoi_gian_ms >= ?';
  const p = [tu];
  if (kv) { sql += ' AND khu_vuc = ?'; p.push(kv); }
  if (lo) { sql += ' AND loai = ?'; p.push(lo); }
  sql += ' ORDER BY thoi_gian_ms DESC, id DESC LIMIT ?';
  p.push(max);

  const rows = await db.all(sql, p);
  return (rows || []).map(function (r) {
    return {
      id: r.id,
      thoiGianMs: r.thoi_gian_ms,
      loai: r.loai || 'ghi',
      email: r.email || '',
      ham: r.ham || '',
      khuVuc: r.khu_vuc || '',
      thamSo: r.tham_so || '',
      ketQua: r.ket_qua || 'ok',
      ghiChu: r.ghi_chu || '',
    };
  });
}
