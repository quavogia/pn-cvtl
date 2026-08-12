// Các hằng số nghiệp vụ — sao chép nguyên vẹn từ hệ thống cũ.

export const KHU_VUC_LIST = ['Đ Uyên', 'K Thành', 'K Trâm', 'K My', 'K Long', 'K Đức', 'SĐ'];

export const DD_BUOI_LIST = ['T3toi', 'CNsang', 'CNchieu', 'CNtoi'];
export const DD_TUAN_LIST = [1, 2, 3, 4, 5];
export const TP_LOAI_LIST = ['1lan', '4lan'];
export const TP_NHOM_LIST = ['T3', 'T7'];

// Thứ tự hiển thị + phân loại nhóm trong bảng Điểm danh (giữ đúng bản cũ).
export const NHOM_DIEM_DANH = [
  { nhom: 'K Đức',              gioiTinh: 'Nam', nhomTuoi: 'Tráng niên', isTreEm: false },
  { nhom: 'K Long',             gioiTinh: 'Nam', nhomTuoi: 'Thanh niên', isTreEm: false },
  { nhom: 'SĐ',                 gioiTinh: 'Nam', nhomTuoi: '',           isTreEm: false },
  { nhom: 'Đ Uyên',             gioiTinh: 'Nữ',  nhomTuoi: 'Phụ nữ',     isTreEm: false },
  { nhom: 'K Thành',            gioiTinh: 'Nữ',  nhomTuoi: 'Phụ nữ',     isTreEm: false },
  { nhom: 'K Trâm',             gioiTinh: 'Nữ',  nhomTuoi: 'Thanh niên', isTreEm: false },
  { nhom: 'K My',               gioiTinh: 'Nữ',  nhomTuoi: 'Thanh niên', isTreEm: false },
  { nhom: 'Học sinh Tiểu học',  gioiTinh: 'Nam', nhomTuoi: 'Thiếu nhi',  isTreEm: true  },
  { nhom: 'Tiểu học',           gioiTinh: 'Nữ',  nhomTuoi: 'Thiếu nhi',  isTreEm: true  },
];

/** Buổi 'T3toi' thuộc nhóm báo cáo T3; ba buổi còn lại thuộc T7. */
export function nhomCuaBuoi(buoi) {
  return buoi === 'T3toi' ? 'T3' : 'T7';
}

export function thangHopLe(s) {
  return /^\d{4}-\d{2}$/.test(String(s || ''));
}
