// =====================================================================
// Danh mục 60 hàm API mà giao diện web đang gọi.
//
//   doc:      true  = chỉ đọc dữ liệu (gọi bằng GET, được lưu đệm ở trình duyệt)
//   canQuyen: false = cho phép gọi khi CHƯA được duyệt (đăng nhập/xin quyền)
//   chuThoi:  true  = chỉ tài khoản chủ mới được gọi
//
// Hàm nào chưa chuyển xong sẽ báo lỗi rõ ràng bằng tiếng Việt,
// không bao giờ trả về trang HTML.
// =====================================================================

import * as truyCap from './handlers/truy-cap.js';
import * as cauHinh from './handlers/cau-hinh.js';
import * as diemDanh from './handlers/diem-danh.js';
import * as thoPhuong from './handlers/tho-phuong.js';

export const DANH_MUC = {
  // --- Đăng nhập / phân quyền (không yêu cầu đã duyệt) ---
  checkAccess:            { doc: true,  canQuyen: false, fn: truyCap.checkAccess },
  requestAccess:          { doc: false, canQuyen: false, fn: truyCap.requestAccess },

  // --- Cấu hình dùng chung ---
  getDropdownOptions:     { doc: true,  fn: cauHinh.getDropdownOptions },

  // --- Điểm danh ---
  getDiemDanhRoster:      { doc: true,  fn: diemDanh.getDiemDanhRoster },
  getDiemDanhTPGoiY:      { doc: true,  fn: diemDanh.getDiemDanhTPGoiY },
  saveDiemDanhCell:       { doc: false, fn: diemDanh.saveDiemDanhCell },
  addDiemDanhTreEm:       { doc: false, fn: diemDanh.addDiemDanhTreEm },
  deleteDiemDanhTreEm:    { doc: false, fn: diemDanh.deleteDiemDanhTreEm },
  moveDiemDanhTreEm:      { doc: false, fn: diemDanh.moveDiemDanhTreEm },
  getDiemDanhGhiChuAll:   { doc: true,  fn: diemDanh.getDiemDanhGhiChuAll },
  saveDiemDanhGhiChu:     { doc: false, fn: diemDanh.saveDiemDanhGhiChu },

  // --- Thờ phượng (TP) ---
  getTPSummary:           { doc: true,  fn: thoPhuong.getTPSummary },
  saveTPWeek:             { doc: false, fn: thoPhuong.saveTPWeek },
  saveTPBaoCao:           { doc: false, fn: thoPhuong.saveTPBaoCao },

  // --- Các hàm còn lại: sẽ chuyển ở các bước kế tiếp ---
  ...taoChoTrong([
    'getStudents', 'getStats', 'getProgressBreakdown', 'getMonthlySummaryByKV',
    'getMonthlySummaryOverall', 'getKhuVucOverview', 'getAllKhuVucOverview',
    'getAllKhuVucWeekly', 'getDonThuanLogs', 'getTopNguoiDanDat', 'getKVTongSummary',
    'getGiaoDucMembers', 'getGiaoDucWeekly', 'getGiaoDucWeeklyAll',
    'getPersonalGoalsAllKhuVuc', 'getLichTuan', 'getDaoTaoTienDoAll',
    'getDaoTaoViecList', 'getLeHoiActive', 'getLeHoiTienDoAll', 'getLeHoiBanner',
    'getLeHoiXepHang', 'getMembersDecreasedTP',
  ], true),
  ...taoChoTrong([
    'addStudent', 'updateStudent', 'deleteStudent', 'saveGoalKV', 'deleteGoalKV',
    'addDonThuanLog', 'deleteDonThuanLog', 'addGiaoDucMember', 'deleteGiaoDucMember',
    'saveGiaoDucWeek', 'saveGoalCaNhan', 'deleteGoalCaNhan', 'addLichEvent',
    'updateLichEvent', 'deleteLichEvent', 'toggleDaoTaoBai', 'setDaoTaoBaiAll',
    'setDaoTaoQuyenAll', 'capChungChiDaoTao', 'addDaoTaoViec', 'updateDaoTaoViec',
    'deleteDaoTaoViec', 'toggleLeHoiLan',
  ], false),
};

function taoChoTrong(ten, doc) {
  const o = {};
  for (const t of ten) {
    o[t] = {
      doc,
      chuaChuyen: true,
      fn: async () => {
        throw new Error('Chức năng "' + t + '" chưa được chuyển sang hệ thống mới.');
      },
    };
  }
  return o;
}

export const DANH_SACH_DOC = new Set(
  Object.entries(DANH_MUC).filter(([, v]) => v.doc).map(([k]) => k)
);
