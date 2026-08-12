// =====================================================================
// THỐNG KÊ THỜ PHƯỢNG — bảng "Thành viên giảm thờ phượng so với tháng trước"
// nằm trong tab "Hiện trạng khu vực" > chip "📊 Tổng" (index.html, phần
// loadTPDecreasedPanel).
//
// Ý nghĩa: đếm xem mỗi người đi thờ phượng (được ĐIỂM DANH) bao nhiêu buổi
// trong tháng đang xem, so với tháng liền trước. Ai đi ÍT HƠN tháng trước thì
// đưa vào danh sách, giảm nhiều nhất xếp lên đầu — để Trưởng phòng biết mà
// hỏi thăm sớm.
// =====================================================================

import { kiemTraThang, thangTruoc } from '../tien-ich.js';

/**
 * Danh sách người đi thờ phượng tháng này ít hơn tháng trước.
 * Giao diện gọi: getMembersDecreasedTP("yyyy-MM")
 *
 * Trả về mảng (đã sắp xếp giảm nhiều nhất trước), mỗi phần tử:
 *   { ten, khuVuc, thangNay, thangTruoc, chenhLech }
 * trong đó `chenhLech` = thangNay - thangTruoc nên LUÔN LÀ SỐ ÂM
 * (giao diện in thẳng số này ra ô màu đỏ, giống kiểu "▼-3" ở các ô khác).
 */
export async function getMembersDecreasedTP({ db }, thang) {
  const thangNay = kiemTraThang(thang);
  const thangTruocDo = thangTruoc(thangNay);

  // "Có mặt" = ô điểm danh có nội dung (đúng quy ước của diem-danh.js:
  // TRIM(gia_tri) <> ''; ô trống bị xóa hẳn khỏi bảng). Đếm ĐỦ CẢ 4 BUỔI
  // (Tối thứ 3 + Sáng/Chiều/Tối Chủ nhật), giống hệt cột "T.K" (Tổng kết)
  // trong bảng Điểm danh.
  const rows = await db.all(
    `SELECT thang, khu_vuc, ten, COUNT(*) AS so_buoi
       FROM diem_danh
      WHERE thang IN (?, ?) AND TRIM(gia_tri) <> ''
      GROUP BY thang, khu_vuc, ten`,
    [thangNay, thangTruocDo]
  );

  // Danh sách người còn trong bảng điểm danh — dùng để loại "người đã bị xóa
  // khỏi danh sách" (họ không đi buổi nào tháng này chỉ vì đã rời danh sách,
  // báo là "giảm" thì sai).
  const roster = await db.all('SELECT khu_vuc, ten FROM diem_danh_roster');
  const conTrongDanhSach = new Set(roster.map((r) => r.khu_vuc + '|' + r.ten));

  // Gom theo từng người (một người = một Khu vực + một Tên).
  const bang = new Map();
  for (const r of rows) {
    const khoa = r.khu_vuc + '|' + r.ten;
    if (!bang.has(khoa)) {
      bang.set(khoa, { ten: r.ten, khuVuc: r.khu_vuc, thangNay: 0, thangTruoc: 0 });
    }
    const o = bang.get(khoa);
    if (r.thang === thangNay) o.thangNay = Number(r.so_buoi) || 0;
    else o.thangTruoc = Number(r.so_buoi) || 0;
  }

  const ketQua = [];
  for (const [khoa, o] of bang) {
    if (o.thangNay >= o.thangTruoc) continue;               // không giảm thì bỏ qua
    if (o.thangNay === 0 && !conTrongDanhSach.has(khoa)) continue; // đã rời danh sách
    ketQua.push({
      ten: o.ten,
      khuVuc: o.khuVuc,
      thangNay: o.thangNay,
      thangTruoc: o.thangTruoc,
      chenhLech: o.thangNay - o.thangTruoc, // số âm: giảm bao nhiêu buổi
    });
  }

  // Giảm nhiều nhất lên đầu; bằng nhau thì xếp theo Khu vực rồi Tên cho dễ dò.
  ketQua.sort((a, b) => {
    if (a.chenhLech !== b.chenhLech) return a.chenhLech - b.chenhLech;
    if (a.khuVuc !== b.khuVuc) return a.khuVuc < b.khuVuc ? -1 : 1;
    return a.ten < b.ten ? -1 : a.ten > b.ten ? 1 : 0;
  });

  return ketQua;
}
