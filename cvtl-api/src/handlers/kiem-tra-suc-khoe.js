// =====================================================================
// Kiểm tra sức khoẻ DỮ LIỆU — tự động, chạy định kỳ (mới, 20/08/2026, theo
// yêu cầu anh Rise: "có thể tạo agent phát hiện lỗi để tự báo không?").
//
// Bối cảnh: lỗi "số TP kẹt cứng" (xem CVTL-BAN-GIAO.md mục 3) là kiểu lỗi
// KHÔNG có ca kiểm thử offline nào bắt được, vì nó chỉ lộ ra khi dữ liệu
// THẬT bị lệch theo thời gian (một khu vực tách/chuyển thành viên, số TP cũ
// vẫn còn kẹt lại). Cần một phép kiểm tra chạy trên chính dữ liệu thật,
// định kỳ, không cần ai bấm gì.
//
// Phép kiểm tra chọn ở đây là một BẤT BIẾN TOÁN HỌC chắc chắn đúng, không
// thể có báo động giả (false positive):
//   Số người đạt "≥1 lần" / "≥4 lần" của một Khu vực trong MỘT Tuần
//   KHÔNG BAO GIỜ được lớn hơn tổng số thành viên HIỆN TẠI của khu vực đó
//   (diem_danh_roster) — vì con số đó vốn dĩ là ĐẾM trong số thành viên đó.
// Nếu số đang lưu (tp_tho_phuong.so_luong) lớn hơn số thành viên hiện tại,
// chắc chắn có gì đó sai — thường là số TP cũ còn sót lại từ TRƯỚC khi một
// số thành viên bị chuyển/xoá khỏi khu vực (đúng kiểu lỗi K Thành đã gặp).
//
// Cố ý KHÔNG so sánh trực tiếp với getDiemDanhTPGoiY (số gợi ý từ Điểm
// danh) — vì lệch với số gợi ý là chuyện BÌNH THƯỜNG (ai đó gõ tay một số
// khác, hoặc điểm danh tháng này chưa đủ) và sẽ gây báo động giả liên tục.
// Phép kiểm tra ở đây chỉ bắt kiểu lỗi "chắc chắn vô lý", không bắt mọi
// khác biệt.
// =====================================================================

export async function kiemTraSucKhoeDuLieu({ db }) {
  const [roster, tpRows] = await Promise.all([
    db.all('SELECT khu_vuc, COUNT(*) AS soNguoi FROM diem_danh_roster GROUP BY khu_vuc'),
    db.all(
      `SELECT thang, khu_vuc, loai, tuan, so_luong FROM tp_tho_phuong WHERE so_luong > 0`
    ),
  ]);

  const soNguoiTheoKV = new Map(roster.map((r) => [r.khu_vuc, r.soNguoi]));
  const batThuong = [];
  for (const r of tpRows) {
    const soNguoiHienTai = soNguoiTheoKV.get(r.khu_vuc) ?? 0;
    if (r.so_luong > soNguoiHienTai) {
      batThuong.push({
        khuVuc: r.khu_vuc,
        thang: r.thang,
        tuan: Number(r.tuan),
        loai: r.loai === '4lan' ? '≥4 lần' : '≥1 lần',
        soDangLuu: r.so_luong,
        soThanhVienHienTai: soNguoiHienTai,
      });
    }
  }
  // Khu vực bất thường nhiều/nghiêm trọng nhất lên đầu, dễ đọc khi báo Telegram.
  batThuong.sort((a, b) => (b.soDangLuu - b.soThanhVienHienTai) - (a.soDangLuu - a.soThanhVienHienTai));

  return {
    kiemTraLuc: new Date().toISOString(),
    soKhuVucKiemTra: roster.length,
    soDongTPKiemTra: tpRows.length,
    batThuong,
  };
}

/** Dựng nội dung tin Telegram (tách riêng để dễ kiểm thử không cần gửi thật). */
export function soanTinBatThuong(ketQua, thoatHtml) {
  const dong = ketQua.batThuong
    .map(
      (b) =>
        '• ' + thoatHtml(b.khuVuc) + ' — Tháng ' + thoatHtml(b.thang) + ', Tuần ' + b.tuan +
        ', ' + b.loai + ': đang lưu <b>' + b.soDangLuu + '</b> nhưng khu vực hiện chỉ có ' +
        '<b>' + b.soThanhVienHienTai + '</b> người'
    )
    .join('\n');
  return (
    '⚠️ <b>CVTL — Phát hiện số Thờ phượng bất thường</b>\n\n' +
    'Số ≥1/≥4 lần đang lưu LỚN HƠN số thành viên hiện có của khu vực — dấu hiệu số liệu cũ ' +
    'chưa cập nhật sau khi tách/chuyển khu vực:\n\n' +
    dong +
    '\n\nCách sửa: vào "🗂️ Quản lý khu vực" → mục 3 → chọn đúng khu vực → bấm "🧹 Dọn dẹp".'
  );
}
