// =====================================================================
// Danh mục 60 hàm API mà giao diện web đang gọi.
//
//   doc:      true  = chỉ đọc dữ liệu (gọi bằng GET, được lưu đệm ở trình duyệt)
//   canQuyen: false = cho phép gọi khi CHƯA được duyệt (đăng nhập/xin quyền)
//   chuThoi:  true  = chỉ tài khoản chủ mới được gọi
//
// Hàm nào chưa chuyển xong sẽ báo lỗi rõ ràng bằng tiếng Việt,
// không bao giờ trả về trang HTML.
//
// TRẠNG THÁI: đã chuyển xong toàn bộ 60 hàm cũ, cộng thêm 11 hàm mới của
// nhóm Trụ đỡ (sổ mốc Hữu hiệu / Báp-têm, điểm và khen thưởng), cộng thêm
// các hàm quản trị (Hủy báo cáo, Duyệt truy cập, Quản lý khu vực) — cộng
// thêm 4 hàm quản lý Admin (getApprovedAccess/revokeAccess/grantAdmin/
// revokeAdmin, mới 21/08/2026) — cộng thêm 2 hàm "Điểm danh công việc"
// (getCVCongViec/saveCVCongViec, mới 23/08/2026) — tổng 85.
// =====================================================================

import * as truyCap from './handlers/truy-cap.js';
import * as cauHinh from './handlers/cau-hinh.js';
import * as diemDanh from './handlers/diem-danh.js';
import * as thoPhuong from './handlers/tho-phuong.js';
import * as hocVien from './handlers/hoc-vien.js';
import * as mucTieuGiaoDuc from './handlers/muc-tieu-giao-duc.js';
import * as daoTaoLeHoi from './handlers/dao-tao-le-hoi.js';
import * as lich from './handlers/lich-lam-viec.js';
import * as thongKeTP from './handlers/thong-ke-tp.js';
import * as truDo from './handlers/tru-do.js';
import * as khuVuc from './handlers/khu-vuc.js';
import * as congViec from './handlers/cong-viec.js';

export const DANH_MUC = {
  // --- Đăng nhập / phân quyền (không yêu cầu đã duyệt) ---
  checkAccess:            { doc: true,  canQuyen: false, fn: truyCap.checkAccess },
  requestAccess:          { doc: false, canQuyen: false, fn: truyCap.requestAccess },

  // Màn hình "Duyệt truy cập" — chỉ tài khoản chủ mới gọi được (17/08/2026)
  getPendingAccess:       { doc: false, chuThoi: true, fn: truyCap.getPendingAccess },
  approveAccessRequest:   { doc: false, chuThoi: true, fn: truyCap.approveAccessRequest },
  denyAccessRequest:      { doc: false, chuThoi: true, fn: truyCap.denyAccessRequest },

  // Quản lý người ĐÃ được cấp quyền — xem/gỡ quyền, cấp/gỡ quyền Admin
  // (mới 21/08/2026, theo yêu cầu anh Rise). Chỉ Admin (chuThoi) mới gọi được.
  getApprovedAccess:      { doc: false, chuThoi: true, fn: truyCap.getApprovedAccess },
  revokeAccess:           { doc: false, chuThoi: true, fn: truyCap.revokeAccess },
  grantAdmin:             { doc: false, chuThoi: true, fn: truyCap.grantAdmin },
  revokeAdmin:            { doc: false, chuThoi: true, fn: truyCap.revokeAdmin },

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
  huyTPBaoCao:            { doc: false, chuThoi: true, fn: thoPhuong.huyTPBaoCao },
  getMembersDecreasedTP:  { doc: true,  fn: thongKeTP.getMembersDecreasedTP },

  // --- Học viên ---
  getStudents:            { doc: true,  fn: hocVien.getStudents },
  addStudent:             { doc: false, fn: hocVien.addStudent },
  updateStudent:          { doc: false, fn: hocVien.updateStudent },
  deleteStudent:          { doc: false, fn: hocVien.deleteStudent },
  getStats:               { doc: true,  fn: hocVien.getStats },
  getProgressBreakdown:   { doc: true,  fn: hocVien.getProgressBreakdown },

  // --- Nhật ký Đơn thuần ---
  addDonThuanLog:         { doc: false, fn: hocVien.addDonThuanLog },
  getDonThuanLogs:        { doc: true,  fn: hocVien.getDonThuanLogs },
  deleteDonThuanLog:      { doc: false, fn: hocVien.deleteDonThuanLog },

  // --- Tổng quan / thống kê ---
  getMonthlySummaryByKV:   { doc: true, fn: hocVien.getMonthlySummaryByKV },
  getMonthlySummaryOverall:{ doc: true, fn: hocVien.getMonthlySummaryOverall },
  getKhuVucOverview:       { doc: true, fn: hocVien.getKhuVucOverview },
  getAllKhuVucOverview:    { doc: true, fn: hocVien.getAllKhuVucOverview },
  getAllKhuVucWeekly:      { doc: true, fn: hocVien.getAllKhuVucWeekly },
  getTopNguoiDanDat:       { doc: true, fn: hocVien.getTopNguoiDanDat },
  getKVTongSummary:        { doc: true, fn: hocVien.getKVTongSummary },

  // --- Mục tiêu Khu vực / cá nhân ---
  saveGoalKV:              { doc: false, fn: mucTieuGiaoDuc.saveGoalKV },
  deleteGoalKV:            { doc: false, fn: mucTieuGiaoDuc.deleteGoalKV },
  saveGoalCaNhan:          { doc: false, fn: mucTieuGiaoDuc.saveGoalCaNhan },
  deleteGoalCaNhan:        { doc: false, fn: mucTieuGiaoDuc.deleteGoalCaNhan },
  getPersonalGoalsAllKhuVuc:{ doc: true, fn: mucTieuGiaoDuc.getPersonalGoalsAllKhuVuc },

  // --- Giáo dục thành viên ---
  getGiaoDucMembers:       { doc: true,  fn: mucTieuGiaoDuc.getGiaoDucMembers },
  addGiaoDucMember:        { doc: false, fn: mucTieuGiaoDuc.addGiaoDucMember },
  deleteGiaoDucMember:     { doc: false, fn: mucTieuGiaoDuc.deleteGiaoDucMember },
  saveGiaoDucWeek:         { doc: false, fn: mucTieuGiaoDuc.saveGiaoDucWeek },
  getGiaoDucWeekly:        { doc: true,  fn: mucTieuGiaoDuc.getGiaoDucWeekly },
  getGiaoDucWeeklyAll:     { doc: true,  fn: mucTieuGiaoDuc.getGiaoDucWeeklyAll },

  // --- Đào tạo ---
  toggleDaoTaoBai:         { doc: false, fn: daoTaoLeHoi.toggleDaoTaoBai },
  setDaoTaoBaiAll:         { doc: false, fn: daoTaoLeHoi.setDaoTaoBaiAll },
  setDaoTaoQuyenAll:       { doc: false, fn: daoTaoLeHoi.setDaoTaoQuyenAll },
  capChungChiDaoTao:       { doc: false, fn: daoTaoLeHoi.capChungChiDaoTao },
  getDaoTaoTienDoAll:      { doc: true,  fn: daoTaoLeHoi.getDaoTaoTienDoAll },
  addDaoTaoViec:           { doc: false, fn: daoTaoLeHoi.addDaoTaoViec },
  updateDaoTaoViec:        { doc: false, fn: daoTaoLeHoi.updateDaoTaoViec },
  deleteDaoTaoViec:        { doc: false, fn: daoTaoLeHoi.deleteDaoTaoViec },
  getDaoTaoViecList:       { doc: true,  fn: daoTaoLeHoi.getDaoTaoViecList },

  // --- Lễ hội ---
  getLeHoiActive:          { doc: true,  fn: daoTaoLeHoi.getLeHoiActive },
  getLeHoiBanner:          { doc: true,  fn: daoTaoLeHoi.getLeHoiBanner },
  getLeHoiTienDoAll:       { doc: true,  fn: daoTaoLeHoi.getLeHoiTienDoAll },
  getLeHoiXepHang:         { doc: true,  fn: daoTaoLeHoi.getLeHoiXepHang },
  toggleLeHoiLan:          { doc: false, fn: daoTaoLeHoi.toggleLeHoiLan },

  // --- Trụ đỡ: sổ mốc Hữu hiệu / Báp-têm, điểm và khen thưởng ---
  getSoMoc:                { doc: true,  fn: truDo.getSoMoc },
  getMocDaGhi:             { doc: true,  fn: truDo.getMocDaGhi },
  addSoMoc:                { doc: false, fn: truDo.addSoMoc },
  updateSoMoc:             { doc: false, fn: truDo.updateSoMoc },
  deleteSoMoc:             { doc: false, fn: truDo.deleteSoMoc },
  getBapTemBanner:         { doc: true,  fn: truDo.getBapTemBanner },
  getXepHang:              { doc: true,  fn: truDo.getXepHang },
  getChotKy:               { doc: true,  fn: truDo.getChotKy },
  getDsChotKy:             { doc: true,  fn: truDo.getDsChotKy },
  chotKy:                  { doc: false, chuThoi: true, fn: truDo.chotKy },
  xoaChotKy:               { doc: false, chuThoi: true, fn: truDo.xoaChotKy },

  // --- Lịch làm việc ---
  getLichTuan:             { doc: true,  fn: lich.getLichTuan },
  addLichEvent:            { doc: false, fn: lich.addLichEvent },
  updateLichEvent:         { doc: false, fn: lich.updateLichEvent },
  deleteLichEvent:         { doc: false, fn: lich.deleteLichEvent },

  // --- Quản lý Khu vực: tự tách/thêm mới, chỉ tài khoản chủ (19/08/2026) ---
  themKhuVucMoi:           { doc: false, chuThoi: true, fn: khuVuc.themKhuVucMoi },
  chuyenThanhVienKhuVuc:   { doc: false, chuThoi: true, fn: khuVuc.chuyenThanhVienKhuVuc },
  donDepTPKhuVuc:          { doc: false, chuThoi: true, fn: khuVuc.donDepTPKhuVuc },
  donDepTPTatCaKhuVuc:     { doc: false, chuThoi: true, fn: khuVuc.donDepTPTatCaKhuVuc },

  // --- Điểm danh công việc (thêm 23/08/2026, xem handlers/cong-viec.js) ---
  // Nằm trong tab con "Trudo" của từng Khu vực, DÙNG CHUNG danh sách người
  // của bảng Điểm danh nên KHÔNG cần hàm thêm/xoá người. Cố ý KHÔNG đặt
  // chuThoi: cả phòng cùng nhập, giống bảng Điểm danh hiện có.
  getCVCongViec:           { doc: true,  fn: congViec.getCVCongViec },
  saveCVCongViec:          { doc: false, fn: congViec.saveCVCongViec },
};

export const DANH_SACH_DOC = new Set(
  Object.entries(DANH_MUC).filter(([, v]) => v.doc).map(([k]) => k)
);
