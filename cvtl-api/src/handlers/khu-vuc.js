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
// ⚠️ CHỈ 12 BẢNG "THEO TỪNG NGƯỜI" (có cả cột khu_vuc lẫn ten, nhận diện
// đúng MỘT người) mới được chuyển: hoc_vien, muc_tieu_ca_nhan,
// giao_duc_thanh_vien, diem_danh, diem_danh_roster, diem_danh_ghi_chu,
// dao_tao_tien_do, dao_tao_viec_giao, le_hoi_tien_do, so_moc, cv_cong_viec,
// cv_nguoi.
//
// 6 BẢNG "TỔNG HỢP CẢ KHU VỰC" (không gắn với riêng ai) CỐ Ý KHÔNG đụng tới:
// tp_bao_cao, muc_tieu_kv, nhat_ky_don_thuan, chot_ky, le_hoi_cau_hinh.
// RIÊNG tp_tho_phuong (số ≥1/≥4 lần theo Tuần) CÓ đụng tới, xem
// resetTPTheoKhuVuc_ bên dưới: xoá SỐ (không đụng mốc tp_bao_cao) của MỌI
// Tuần ở cả Khu vực cũ lẫn Khu vực mới, để tính năng "tự động điền từ Điểm
// danh" (getDiemDanhTPGoiY, sửa 18/08/2026) tính lại đúng số theo roster mới
// ngay lần xem kế tiếp — kể cả Tuần ĐÃ báo cáo (sửa 20/08/2026, theo yêu cầu
// anh Rise: "chuyển đi rồi thì tính bên mới còn bên cũ thì không tính", xem
// giải thích đầy đủ ở resetTPTheoKhuVuc_).
// =====================================================================

import { KHU_VUC_LIST } from '../hang-so.js';
import { chuoi, batBuoc } from '../tien-ich.js';

/**
 * Mô tả 11 bảng "theo từng người" cần chuyển.
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
  // Điểm danh công việc (thêm 23/08/2026) — chuyển theo người luôn, để ai
  // đổi khu vực thì số liệu công việc đã nhập đi theo, không bị bỏ lại.
  { bang: 'cv_cong_viec',        coCotId: false, khoa: ['khu_vuc', 'ten', 'thang', 'tuan', 'buoi', 'ngay'] },
  // Chỉnh danh sách riêng của bảng Điểm danh công việc (người tự thêm / bị ẩn)
  // cũng phải theo người sang khu vực mới, nếu không họ sẽ "hiện lại" ở khu
  // vực cũ hoặc biến mất ở khu vực mới.
  { bang: 'cv_nguoi',            coCotId: false, khoa: ['khu_vuc', 'ten'] },
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
 * Xoá TOÀN BỘ các dòng `tp_tho_phuong` (MỌI tháng, MỌI Tuần) của 1 Khu vực —
 * để tính năng "tự động điền từ Điểm danh" (getDiemDanhTPGoiY, sửa
 * 18/08/2026) tính lại đúng số theo roster MỚI ngay lần xem kế tiếp, thay vì
 * bị kẹt đứng yên ở số cũ. KHÔNG đụng tới `tp_bao_cao` (mốc "đã báo cáo") —
 * Tuần nào đã báo cáo vẫn hiện đúng nhãn/khoá "đã báo cáo" như cũ, chỉ riêng
 * CON SỐ ≥1/≥4 lần được tính lại cho khớp với ai đang thật sự thuộc Khu vực
 * này (xem thêm ở dưới).
 *
 * ⚠️ Lý do bắt buộc phải có bước này, không thể chỉ dựa vào lời hứa "tự động
 * điền" có sẵn (phát hiện 19/08/2026, qua báo cáo thật của anh Rise sau khi
 * tách TT Châu): cơ chế "không ghi đè số đã gõ tay" ở giao diện
 * (`window._tpAutoTrack_`) chỉ SỐNG TRONG BỘ NHỚ của 1 lần tải trang — không
 * phân biệt được "số đang có là do TỰ ĐỘNG điền + lưu ở một phiên TRƯỚC đó"
 * hay "số do người dùng THẬT SỰ gõ tay" một khi trang được tải lại mới. Kết
 * quả: hễ 1 Tuần đã từng có số > 0 được lưu (dù là do tự động điền từ
 * trước), mọi lần tải trang MỚI sau đó đều coi số đó là "đã gõ tay", không
 * bao giờ tự cập nhật lại nữa — dù Khu vực vừa đổi hẳn số người. Xoá hẳn
 * dòng lưu là cách chắc chắn nhất buộc lần xem kế tiếp phải tính lại từ đầu
 * theo đúng roster hiện tại.
 *
 * ⚠️⚠️ SỬA 20/08/2026 (theo yêu cầu trực tiếp của anh Rise, sau khi thấy K
 * Thành vẫn hiện 9 người dù đã chuyển 7 người sang TT Châu): BAN ĐẦU (bản
 * 19/08/2026) hàm này CHỈ xoá Tuần hoàn toàn CHƯA báo cáo, cố ý giữ nguyên
 * số của Tuần ĐÃ báo cáo coi là "mốc lịch sử đã chốt". Anh Rise chỉ ra điều
 * này SAI THỰC TẾ cho đúng tình huống tách/chuyển khu vực: "chuyển đi rồi
 * thì tính bên mới còn bên cũ thì không tính" — nghĩa là khi ai đó đã rời
 * khỏi Khu vực, số ≥1/≥4 lần của Khu vực CŨ phải phản ánh đúng những người
 * CÒN LẠI, kể cả với các Tuần đã lỡ báo cáo trước đó (vì lúc báo cáo, người
 * đó vẫn còn tính trong Khu vực cũ — sau khi chuyển đi thì số đó không còn
 * đúng thực tế nữa). Anh Rise đã chọn rõ: **tính lại số, nhưng GIỮ NGUYÊN
 * trạng thái/nhãn "đã báo cáo"** — không huỷ báo cáo, không mở khoá gì, chỉ
 * riêng con số hiển thị được cập nhật lại. Do `saveTPWeek` (hàm lưu số, xem
 * `tho-phuong.js`) hoàn toàn KHÔNG kiểm tra `tp_bao_cao` trước khi ghi, và
 * bảng Điểm danh/nhãn "đã báo cáo" đọc riêng từ `tp_bao_cao` (không đọc từ
 * `tp_tho_phuong`), nên chỉ cần xoá dòng `tp_tho_phuong` (không đụng
 * `tp_bao_cao`) là tự động điền sẽ tính lại và LƯU số mới ngay ở lần xem kế
 * tiếp, mà nhãn/khoá "đã báo cáo" vẫn nguyên vẹn — đúng ý anh Rise.
 */
async function resetTPTheoKhuVuc_(db, khuVuc) {
  const tuanCoSo = await db.all(
    `SELECT DISTINCT thang, tuan FROM tp_tho_phuong WHERE khu_vuc = ?`,
    [khuVuc]
  );
  if (!tuanCoSo.length) return { xoa: 0 };
  await db.batch(
    tuanCoSo.map((r) => ({
      sql: 'DELETE FROM tp_tho_phuong WHERE khu_vuc = ? AND thang = ? AND tuan = ?',
      params: [khuVuc, r.thang, r.tuan],
    }))
  );
  return { xoa: tuanCoSo.length };
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

  // Xoá số TP "kẹt cứng" ở cả 2 Khu vực (MỌI Tuần, kể cả đã báo cáo — sửa
  // 20/08/2026, xem giải thích đầy đủ ở resetTPTheoKhuVuc_) — bắt buộc để
  // tính năng tự động điền tính lại đúng theo roster mới ngay lần xem kế
  // tiếp, không chỉ riêng Tuần chưa báo cáo.
  const tpXoaCu = await resetTPTheoKhuVuc_(db, kvCu);
  const tpXoaMoi = await resetTPTheoKhuVuc_(db, kvMoi);

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
 * cứng" (xem resetTPTheoKhuVuc_) cho MỘT Khu vực chỉ định, KHÔNG động tới
 * bất kỳ bảng nào khác. Dùng để dọn lại những Khu vực đã bị TÁCH/CHUYỂN
 * thành viên TRƯỚC KHI có bước dọn tự động này (thêm 19/08/2026, ngay sau
 * khi tách TT Châu — anh Rise phát hiện số TP của K Thành/Đ Uyên đứng yên
 * không cập nhật theo roster mới), hoặc dùng lại bất kỳ lúc nào cần tính lại
 * số cho một Khu vực (ví dụ sau bản sửa 20/08/2026, dùng để tính lại cả các
 * Tuần đã báo cáo — xem resetTPTheoKhuVuc_). Từ nay về sau,
 * `chuyenThanhVienKhuVuc` đã tự làm bước này ngay khi chuyển — hàm này vẫn
 * hữu ích để chạy LẠI thủ công cho các lần tách/chuyển đã lỡ làm trước đó.
 */
export async function donDepTPKhuVuc({ db }, khuVuc) {
  const kv = batBuoc(khuVuc, 'Khu vực');
  const ketQua = await resetTPTheoKhuVuc_(db, kv);
  return { success: true, khuVuc: kv, tpDaXoa: ketQua.xoa };
}

/**
 * Dọn dẹp TẤT CẢ Khu vực cùng lúc (Chỉ tài khoản chủ) — chạy đúng bước
 * "xoá số TP kẹt cứng" (resetTPTheoKhuVuc_) cho MỌI Khu vực đang có trong
 * danh sách (đọc ĐỘNG từ config_list, không dùng danh sách cứng
 * KHU_VUC_LIST, để tự bắt luôn cả Khu vực thêm sau này như TT Châu).
 *
 * Thêm 20/08/2026 lần 3, sau khi anh Rise phát hiện: bản sửa "≥1/≥4 lần phải
 * cộng dồn từ đầu tháng" (xem diem-danh.js, hàm getDiemDanhTPGoiY) CHỈ sửa
 * CÔNG THỨC tính GỢI Ý cho các ô CHƯA có số lưu sẵn — không tự động ghi đè
 * những số ĐÃ LƯU trước đó, vì đúng cơ chế "không ghi đè số đã gõ tay" ở
 * giao diện (xem giải thích đầy đủ ở resetTPTheoKhuVuc_ phía trên) không
 * phân biệt được số đã lưu là do người gõ tay hay do chính tính năng tự
 * điền lưu lại từ TRƯỚC khi có bản sửa công thức. Kiểm tra thực tế
 * (20/08/2026) cho thấy: không chỉ riêng khu SĐ, mà có tới 14 ô ở 8 Khu vực
 * đang lưu số CŨ (tính theo công thức sai — đếm theo đúng 1 Tuần riêng lẻ)
 * khác với số ĐÚNG theo công thức mới (cộng dồn cả tháng) — anh Rise phát
 * hiện qua việc "sửa ≥4 lần nhưng ≥1 lần vẫn sai", đúng bản chất là cùng 1
 * nguyên nhân: những ô đã có số lưu sẵn (đa số Tuần của ≥1 lần) không được
 * cập nhật, còn vài ô ≥4 lần "trông như đã đúng" chỉ vì số cũ tình cờ trùng
 * số mới.
 *
 * Hàm này cho phép dọn TẤT CẢ Khu vực trong 1 lần bấm — tránh phải vào
 * Quản lý khu vực bấm tay từng khu vực một (mục 3, nút 🧹 Dọn dẹp).
 *
 * ⚠️ Y HỆT donDepTPKhuVuc: xoá SỐ đã lưu (mọi Tuần, mọi Khu vực, kể cả đã
 * báo cáo) để tính lại 100% THEO ĐIỂM DANH ngay lần xem kế tiếp — nếu Tuần
 * nào từng gõ tay số KHÁC Điểm danh (có lý do thực tế, ví dụ Điểm danh nhập
 * thiếu), số gõ tay đó CŨNG bị thay bằng số tính theo Điểm danh, không giữ
 * lại. KHÔNG đụng tới `tp_bao_cao` (nhãn/mốc "đã báo cáo" giữ nguyên).
 */
export async function donDepTPTatCaKhuVuc({ db }) {
  const ds = await db.all("SELECT gia_tri FROM config_list WHERE loai = 'khu_vuc' ORDER BY thu_tu, id");
  const chiTiet = [];
  let tongXoa = 0;
  for (const r of ds) {
    const ketQua = await resetTPTheoKhuVuc_(db, r.gia_tri);
    chiTiet.push({ khuVuc: r.gia_tri, tpDaXoa: ketQua.xoa });
    tongXoa += ketQua.xoa;
  }
  return { success: true, tongSoKhuVuc: ds.length, tongXoa, chiTiet };
}
