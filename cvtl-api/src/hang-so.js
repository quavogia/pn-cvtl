// Các hằng số nghiệp vụ — sao chép nguyên vẹn từ hệ thống cũ.

export const KHU_VUC_LIST = ['Đ Uyên', 'K Thành', 'K Trâm', 'K My', 'K Long', 'K Đức', 'SĐ'];

export const DD_BUOI_LIST = ['T3toi', 'CNsang', 'CNchieu', 'CNtoi'];
export const DD_TUAN_LIST = [1, 2, 3, 4, 5];
export const TP_LOAI_LIST = ['1lan', '4lan'];
export const TP_NHOM_LIST = ['T3', 'T7'];

/** Buổi 'T3toi' thuộc nhóm báo cáo T3; ba buổi còn lại thuộc T7. */
export function nhomCuaBuoi(buoi) {
  return buoi === 'T3toi' ? 'T3' : 'T7';
}

export function thangHopLe(s) {
  return /^\d{4}-\d{2}$/.test(String(s || ''));
}
