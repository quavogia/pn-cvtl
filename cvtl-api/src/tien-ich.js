// =====================================================================
// Tiện ích dùng chung — sao chép đúng logic nghiệp vụ của hệ thống cũ.
// Mọi handler đều dùng chung file này để không lệch cách tính giữa các tab.
// =====================================================================

/** Ngưỡng buổi học để tính là "Hữu hiệu" (giống HUU_HIEU_MIN_BUOI cũ). */
export const HUU_HIEU_MIN_BUOI = 2;

/** Giá trị Tiến độ đại diện cho học viên đã Báp-têm. */
export const BT_STATUS_VALUE = 'BT';

/** Tiến độ dạng "B<số>" -> số buổi; ngược lại null. */
export function soBuoi(tienDo) {
  const m = String(tienDo || '').trim().match(/^B(\d+)$/i);
  return m ? Number(m[1]) : null;
}

export function laHuuHieu(tienDo) {
  const n = soBuoi(tienDo);
  return n !== null && n >= HUU_HIEU_MIN_BUOI;
}

export function laBT(tienDo) {
  return String(tienDo || '').trim() === BT_STATUS_VALUE;
}

/** "yyyy-MM" hợp lệ? */
export function thangHopLe(s) {
  return /^\d{4}-\d{2}$/.test(String(s || ''));
}

export function kiemTraThang(s) {
  if (!thangHopLe(s)) throw new Error('Tháng không hợp lệ (cần dạng yyyy-MM).');
  return String(s);
}

/** Tháng liền trước: "2026-01" -> "2025-12" */
export function thangTruoc(thang) {
  const p = String(thang || '').split('-');
  if (p.length !== 2) return '';
  let y = Number(p[0]);
  let m = Number(p[1]) - 1;
  if (m < 1) { m = 12; y -= 1; }
  return y + '-' + String(m).padStart(2, '0');
}

/** Tháng hiện tại theo giờ Việt Nam. */
export function thangHienTai() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

/** Chặn sửa dữ liệu của tháng đã qua (giống assertNotPastMonth_ cũ). */
export function chanThangDaQua(thang) {
  if (thang < thangHienTai()) {
    throw new Error('Không thể sửa dữ liệu của tháng đã qua: ' + thang);
  }
}

/**
 * Đưa mọi kiểu ngày về "yyyy-MM-dd".
 * Nhận: "yyyy-MM-dd", "dd/MM/yyyy", chuỗi ISO, hoặc số mili-giây.
 * Không đọc được -> trả về ''.
 */
export function chuanNgay(val) {
  if (val === null || val === undefined || val === '') return '';
  const s = String(val).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  const d = new Date(typeof val === 'number' ? val : s);
  if (isNaN(d.getTime())) return '';
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0');
}

/** "yyyy-MM-dd" -> "dd/MM/yyyy" (định dạng giao diện đang hiển thị). */
export function ngayVN(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(ymd || '');
}

/** Tháng của một ngày: "2026-08-12" -> "2026-08". */
export function thangCuaNgay(ymd) {
  const s = chuanNgay(ymd);
  return s ? s.slice(0, 7) : '';
}

/** Tuần trong tháng (1..5) — giống weekOfMonth_ cũ: ceil(ngày / 7). */
export function tuanTrongThang(ymd) {
  const s = chuanNgay(ymd);
  if (!s) return 0;
  return Math.min(5, Math.ceil(Number(s.slice(8, 10)) / 7));
}

/** Phần trăm làm tròn 1 chữ số; mục tiêu = 0 -> null (giống pct_ cũ). */
export function phanTram(thucTe, mucTieu) {
  if (!mucTieu) return null;
  return Math.round((thucTe / mucTieu) * 1000) / 10;
}

/** Cắt khoảng trắng, ép về chuỗi. */
export function chuoi(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

/** Ép về số nguyên >= 0. */
export function soNguyen(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Bắt buộc có giá trị, nếu rỗng thì ném lỗi tiếng Việt rõ ràng. */
export function batBuoc(v, ten) {
  const s = chuoi(v);
  if (!s) throw new Error('Thiếu ' + ten + '.');
  return s;
}

/** Định dạng "dd/MM/yyyy HH:mm" theo giờ Việt Nam từ mốc mili-giây. */
export function thoiGianVN(ms) {
  const d = new Date(ms + 7 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Ngày hôm nay theo giờ Việt Nam, dạng "yyyy-MM-dd". */
export function homNay() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0');
}
