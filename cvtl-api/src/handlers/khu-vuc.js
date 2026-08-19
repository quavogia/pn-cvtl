// =====================================================================
// Quản lý Khu vực — TỰ TÁCH / THÊM MỚI khu vực, KHÔNG cần báo Claude.
// (thêm 19/08/2026, theo yêu cầu anh Rise: "xây 1 cơ chế để sau này có tách
// hoặc thêm mới thì anh có thể tự làm trên web chứ không cần phải báo em")
//
// Hai việc chính:
//   themKhuVucMoi          — thêm 1 Khu vực mới (trống trơn) vào đúng vị trí
//                             mong muốn trong danh sách Khu vực.
//   chuyenThanhVienKhuVuc  — chuyển TOÀN BỘ dữ liệu của một số thành viên
//                             (được chọn theo tên) từ Khu vực này sang Khu
//                             vực khác (mới hoặc đã có sẵn).
//
// ⚠️ CHỈ 10 BẢNG "THEO TỪNG NGƯỜI" (có cả cột khu_vuc lẫn ten, nhận diện
// đúng MỘT người) mới được chuyển: hoc_vien, muc_tieu_ca_nhan,
// giao_duc_thanh_vien, diem_danh, diem_danh_roster, diem_danh_ghi_chu,
// dao_tao_tien_do, dao_tao_viec_giao, le_hoi_tien_do, so_moc.
//
// 6 BẢNG "TỔNG HỢP CẢ KHU VỰC" (không gắn với riêng ai) CỐ Ý KHÔNG đụng tới:
// tp_tho_phuong, tp_bao_cao, muc_tieu_kv, nhat_ky_don_thuan, chot_ky,
// le_hoi_cau_hinh. Số liệu TP đã báo cáo (tp_bao_cao) của Khu vực cũ vẫn giữ
// nguyên làm lịch sử "đã báo cáo thật"; những tuần CHƯA báo cáo thì tính năng
// "tự động điền từ Điểm danh" (getDiemDanhTPGoiY, sửa 18/08/2026) sẽ tự cập
// nhật lại đúng số cho cả Khu vực cũ (giảm xuống) lẫn Khu vực mới (tăng lên)
// ngay sau khi bảng diem_danh đã chuyển xong, không cần làm gì thêm.
// =====================================================================

import { KHU_VUC_LIST } from '../hang-so.js';
import { chuoi, batBuoc } from '../tien-ich.js';

/**
 * Mô tả 10 bảng "theo từng người" cần chuyển.
 * coCotId: true  -> bảng có cột `id` tự tăng, chuyển bằng UPDATE ... WHERE id = ?
 * coCotId: false -> không có `id` (khoá chính là các cột nghiệp vụ), chuyển
 *                   bằng UPDATE ... WHERE <đúng các cột trong `khoa`>.
 * Dù cách nào, đều bọc try/catch: nếu Khu vực mới ĐÃ CÓ sẵn một dòng trùng
 * khoá duy nhất (hiếm khi xảy ra vì Khu vực mới thường trống, nhưng vẫn có
 * thể xảy ra khi chuyển sang Khu vực đã có người) thì BỎ QUA dòng cũ, GIỮ
 * NGUYÊN dòng đã có ở Khu vực mới — không ghi đè, không mất dữ liệu, không
 * làm hỏng cả việc chuyển vì 1 dòng trùng.
 */
const BANG_THEO_NGUOI = [
  { bang: 'hoc_vien',            coCotId: true },
  { bang: 'muc_tieu_ca_nhan',    coCotId: false, khoa: ['thang', 'khu_vuc', 'ten'] },
  { bang: 'giao_duc_thanh_vien', coCotId: false, khoa: ['thang', 'khu_vuc', 'ten', 'tuan'] },
  { bang: 'diem_danh',           coCotId: false, khoa: ['thang', 'khu_vuc', 'ten', 'tuan', 'buoi'] },
  { bang: 'diem_danh_roster',    coCotId: true },
  { bang: 'diem_danh_ghi_chu',   coCotId: false, khoa: ['khu_vuc', 'ten'] },
  { bang: 'dao_tao_tien_do',     coCotId: false, khoa: ['khu_vuc', 'ten'] },
  { bang: 'dao_tao_viec_giao',   coCotId: true },
  { bang: 'le_hoi_tien_do',      coCotId: false, khoa: ['ma_le_hoi', 'khu_vuc', 'ten'] },
  { bang: 'so_moc',              coCotId: true },
];

/** Chuyển toàn bộ dòng của 1 người trong 1 bảng, trả về số dòng đã chuyển / bỏ qua. */
async function chuyenMotBang_(db, mo, khuVucCu, ten, khuVucMoi) {
  const rows = await db.all(`SELECT * FROM ${mo.bang} WHERE khu_vuc = ? AND ten = ?`, [khuVucCu, ten]);
  let daChuyen = 0;
  let boQuaTrungLap = 0;
  for (const r of rows) {
    try {
      if (mo.coCotId) {
        await db.run(`UPDATE ${mo.bang} SET khu_vuc = ? WHERE id = ?`, [khuVucMoi, r.id]);
      } else {
        const dieuKien = mo.khoa.map((c) => `${c} = ?`).join(' AND ');
        const giaTri = mo.khoa.map((c) => r[c]);
        await db.run(`UPDATE ${mo.bang} SET khu_vuc = ? WHERE ${dieuKien}`, [khuVucMoi, ...giaTri]);
      }
      daChuyen++;
    } catch (e) {
      // Trùng khoá duy nhất ở Khu vực mới -> bỏ qua dòng cũ, không ghi đè.
      boQuaTrungLap++;
    }
  }
  return { bang: mo.bang, daChuyen, boQuaTrungLap };
}

/** Đánh số lại thu_tu 1..n theo đúng thứ tự hiện có, không để lại khoảng trống. */
async function danhLaiThuTuRoster_(db, khuVuc) {
  const ds = await db.all('SELECT id FROM diem_danh_roster WHERE khu_vuc = ? ORDER BY thu_tu, id', [khuVuc]);
  if (!ds.length) return;
  await db.batch(
    ds.map((x, i) => ({ sql: 'UPDATE diem_danh_roster SET thu_tu = ? WHERE id = ?', params: [i + 1, x.id] }))
  );
}

/**
 * Xoá các dòng `tp_tho_phuong` (MỌI tháng) của 1 Khu vực mà Tuần đó CHƯA hề
 * có báo cáo nào (không T3, không T7) — để tính năng "tự động điền từ Điểm
 * danh" (getDiemDanhTPGoiY, sửa 18/08/2026) tính lại đúng số theo roster MỚI
 * ngay lần xem kế tiếp, thay vì bị kẹt đứng yên ở số cũ.
 *
 * ⚠️ Lý do bắt buộc phải có bước này, không thể chỉ dựa vào lời hứa "tự động
 * điền" có sẵn (phát hiện 19/08/2026, qua báo cáo thật của anh Rise sau khi
 * tách TT Châu): cơ chế "không ghi đè số đã gõ tay" ở giao diện
 * (`window._tpAutoTrack_`) chỉ SỐNG TRONG BỘ NHỚ của 1 lần tải trang — không
 * phân biệt được "số đang có là do TỰ ĐỘNG điền + lưu ở một phiên TRƯỚC đó"
 * hay "số do người dùng THẬT SỰ gõ tay" một khi trang được tải lại mới. Kết
 * quả: hễ 1 Tuần CHƯA báo cáo đã từng có số > 0 được lưu (dù là do tự động
 * điền từ trước), mọi lần tải trang MỚI sau đó đều coi số đó là "đã gõ tay",
 * không bao giờ tự cập nhật lại nữa — dù Khu vực vừa đổi hẳn số người. Xoá
 * hẳn dòng lưu (chỉ với Tuần CHƯA báo cáo) là cách chắc chắn nhất buộc lần
 * xem kế tiếp phải tính lại từ đầu theo đúng roster hiện tại.
 *
 * CHỈ xoá Tuần hoàn toàn chưa báo cáo (không T3 lẫn T7) — Tuần đã báo cáo dù
 * chỉ 1 trong 2 (T3 hoặc T7) vẫn giữ nguyên số đã lưu, coi là mốc lịch sử đã
 * chốt một phần (đúng nguyên tắc đã áp dụng cho các Khu vực khác — xem đầu
 * file). Muốn Tuần đó tính lại thì bấm "Hủy báo cáo" trước.
 */
async function resetTPChuaBaoCao_(db, khuVuc) {
  const tuanChuaBaoCao = await db.all(
    `SELECT DISTINCT t.thang AS thang, t.tuan AS tuan
       FROM tp_tho_phuong t
      WHERE t.khu_vuc = ?
        AND NOT EXISTS (
          SELECT 1 FROM tp_bao_cao b
           WHERE b.khu_vuc = t.khu_vuc AND b.thang = t.thang AND b.tuan = t.tuan
        )`,
    [khuVuc]
  );
  if (!tuanChuaBaoCao.length) return { xoa: 0 };
  await db.batch(
    tuanChuaBaoCao.map((r) => ({
      sql: 'DELETE FROM tp_tho_phuong WHERE khu_vuc = ? AND thang = ? AND tuan = ?',
      params: [khuVuc, r.thang, r.tuan],
    }))
  );
  return { xoa: tuanChuaBaoCao.length };
}

/**
 * Thêm 1 Khu vực mới (trống trơn, chưa có ai) vào danh sách Khu vực.
 * `sauKhuVuc`: tên Khu vực muốn chèn Khu vực mới vào NGAY SAU (để trống/để
 * trống hoặc không tìm thấy -> thêm vào CUỐI danh sách).
 * (Chỉ tài khoản chủ — chặn ở registry.js bằng `chuThoi: true`.)
 */
export async function themKhuVucMoi({ db }, tenMoi, sauKhuVuc) {
  const ten = batBuoc(tenMoi, 'Tên khu vực mới');
  const daCo = await db.first("SELECT 1 AS co FROM config_list WHERE loai = 'khu_vuc' AND gia_tri = ?", [ten]);
  if (daCo) throw new Error('Khu vực "' + ten + '" đã tồn tại.');

  let ds = await db.all("SELECT id, gia_tri FROM config_list WHERE loai = 'khu_vuc' ORDER BY thu_tu, id");
  if (!ds.length) {
    // config_list chưa có Khu vực nào (hệ thống mới cài đặt) -> khởi tạo từ
    // danh sách cứng trước để giữ đúng thứ tự cũ, rồi đọc lại.
    await db.batch(
      KHU_VUC_LIST.map((kv, i) => ({
        sql: "INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('khu_vuc', ?, ?)",
        params: [kv, i + 1],
      }))
    );
    ds = await db.all("SELECT id, gia_tri FROM config_list WHERE loai = 'khu_vuc' ORDER BY thu_tu, id");
  }

  const sau = chuoi(sauKhuVuc);
  let viTri = ds.length; // mặc định: thêm vào cuối danh sách
  if (sau) {
    const i = ds.findIndex((r) => r.gia_tri === sau);
    if (i < 0) throw new Error('Không tìm thấy khu vực "' + sau + '" để chèn vào sau.');
    viTri = i + 1;
  }

  // Đánh số lại thu_tu 1..n cho TOÀN BỘ danh sách (kể cả Khu vực mới) theo
  // đúng vị trí mong muốn — cách chắc chắn nhất, không sợ thu_tu cũ có
  // khoảng trống hay trùng nhau.
  const capNhat = ds
    .slice(0, viTri)
    .map((r, i) => ({ sql: 'UPDATE config_list SET thu_tu = ? WHERE id = ?', params: [i + 1, r.id] }))
    .concat(
      ds.slice(viTri).map((r, i) => ({
        sql: 'UPDATE config_list SET thu_tu = ? WHERE id = ?',
        params: [viTri + 2 + i, r.id],
      }))
    );
  if (capNhat.length) await db.batch(capNhat);
  await db.run("INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('khu_vuc', ?, ?)", [ten, viTri + 1]);

  return { success: true };
}

/** Tự thêm Khu vực mới (vào cuối danh sách) nếu tên đó chưa có trong config_list. */
async function themKhuVucMoiNeuChua_(db, ten) {
  const daCo = await db.first("SELECT 1 AS co FROM config_list WHERE loai = 'khu_vuc' AND gia_tri = ?", [ten]);
  if (daCo) return;
  await themKhuVucMoi({ db }, ten, null);
}

/**
 * Chuyển TOÀN BỘ dữ liệu (10 bảng theo người, xem BANG_THEO_NGUOI ở trên)
 * của một danh sách thành viên (chọn theo TÊN, đúng nguyên văn như đang hiển
 * thị trong bảng Điểm danh) từ Khu vực cũ sang Khu vực mới.
 * Khu vực mới tự động được thêm vào danh sách Khu vực (cuối danh sách) nếu
 * chưa từng khai báo — để không bắt buộc phải gọi themKhuVucMoi trước.
 * (Chỉ tài khoản chủ — chặn ở registry.js bằng `chuThoi: true`.)
 */
export async function chuyenThanhVienKhuVuc({ db }, khuVucCu, danhSachTen, khuVucMoi) {
  const kvCu = batBuoc(khuVucCu, 'Khu vực cũ');
  const kvMoi = batBuoc(khuVucMoi, 'Khu vực mới');
  const ds = (Array.isArray(danhSachTen) ? danhSachTen : [danhSachTen]).map((t) => chuoi(t)).filter(Boolean);
  if (!ds.length) throw new Error('Chưa chọn thành viên nào để chuyển.');
  if (kvCu === kvMoi) throw new Error('Khu vực cũ và khu vực mới phải khác nhau.');

  await themKhuVucMoiNeuChua_(db, kvMoi);

  const ketQua = [];
  for (const ten of ds) {
    const chiTiet = [];
    for (const mo of BANG_THEO_NGUOI) {
      chiTiet.push(await chuyenMotBang_(db, mo, kvCu, ten, kvMoi));
    }
    ketQua.push({ ten, chiTiet });
  }

  // Đánh lại thứ tự hiển thị của bảng Điểm danh cho cả 2 Khu vực, khỏi để
  // khoảng trống thu_tu sau khi có người vừa chuyển đi.
  await danhLaiThuTuRoster_(db, kvCu);
  await danhLaiThuTuRoster_(db, kvMoi);

  // Xoá số TP "kẹt cứng" của các Tuần CHƯA báo cáo ở cả 2 Khu vực — bắt buộc
  // để tính năng tự động điền tính lại đúng theo roster mới ngay lần xem kế
  // tiếp (xem giải thích đầy đủ ở resetTPChuaBaoCao_, thêm 19/08/2026).
  const tpXoaCu = await resetTPChuaBaoCao_(db, kvCu);
  const tpXoaMoi = await resetTPChuaBaoCao_(db, kvMoi);

  return {
    success: true,
    khuVucCu: kvCu,
    khuVucMoi: kvMoi,
    ketQua,
    tpDaXoaKhuVucCu: tpXoaCu.xoa,
    tpDaXoaKhuVucMoi: tpXoaMoi.xoa,
  };
}

/**
 * Dọn dẹp thủ công (Chỉ tài khoản chủ) — chạy lại đúng bước "xoá số TP kẹt
 * cứng của Tuần chưa báo cáo" (xem resetTPChuaBaoCao_) cho MỘT Khu vực chỉ
 * định, KHÔNG động tới bất kỳ bảng nào khác. Dùng để dọn lại những Khu vực
 * đã bị TÁCH/CHUYỂN thành viên TRƯỚC KHI có bước dọn tự động này (thêm
 * 19/08/2026, ngay sau khi tách TT Châu — anh Rise phát hiện số TP của K
 * Thành/Đ Uyên đứng yên không cập nhật theo roster mới). Từ nay về sau,
 * `chuyenThanhVienKhuVuc` đã tự làm bước này — hàm này chỉ cần dùng LẠI cho
 * các lần tách/chuyển đã lỡ làm trước bản sửa 19/08/2026.
 */
export async function donDepTPKhuVuc({ db }, khuVuc) {
  const kv = batBuoc(khuVuc, 'Khu vực');
  const ketQua = await resetTPChuaBaoCao_(db, kv);
  return { success: true, khuVuc: kv, tpDaXoa: ketQua.xoa };
}
