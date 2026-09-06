// =====================================================================
// ĐIỂM DANH LỄ TRỌNG THỂ — thêm 06/09/2026 theo yêu cầu anh Rise.
//
// Anh Rise báo "Lễ Trọng Thể Mùa Thu 2026": 6 buổi lễ lớn (Lễ Kèn Thổi, Tuần
// lễ cầu nguyện Đại Lễ Chuộc Tội, Đại Lễ Chuộc Tội, Lễ Lều Tạm, Tuần lễ cầu
// nguyện Lễ Lều Tạm, Ngày sau cùng), gộp lại đúng 24 buổi nhỏ (Sáng/Chiều
// hoặc từng tối liên tục). Anh Rise chốt qua nhiều vòng phác thảo Artifact
// (bản 1 → 11, anh duyệt bản 11 rồi mới cho viết mã):
//
//   1. Ô điểm danh là Ô NHẬP THẬT (số/chữ tuỳ ý), giống hệt bảng "Điểm danh"
//      (Thứ 3 & Thứ 7) đang có — KHÔNG phải tích V.
//   2. Bảng LUÔN hiện (không tự ẩn theo ngày mùa lễ).
//   3. Cột "Tổng" luôn cộng đủ CẢ MÙA (24 buổi), không đổi theo bộ lọc
//      hiện/ẩn — giống hệt cột "T.K" ở bảng Điểm danh hằng tuần.
//   4. Tách RIÊNG theo từng khu vực — danh sách thành viên LẤY NỀN từ
//      `diem_danh_roster` (giống `cv_cong_viec`/"Điểm danh công việc"), KHÔNG
//      tạo danh sách người mới.
//   5. Đặt thành 1 TAB CON RIÊNG trong tab TP (cạnh "Theo tuần"), không xếp
//      chồng vào cùng trang với 3 card đang có.
//   6. KHÔNG xây màn hình "Cấu hình Mùa Lễ Trọng Thể" — mùa lễ mới làm giống
//      hệt "Lễ hội": Claude soạn sẵn câu SQL, anh Rise tự chạy trong D1
//      Console (bảng `le_trong_the_cau_hinh`), không đụng vào mã nguồn.
//
// ⚠️ HAI BẢNG, giống đúng tinh thần `le_hoi_cau_hinh` + `le_hoi_tien_do`:
//   `le_trong_the_cau_hinh`  — LỊCH của mùa lễ (CHUNG toàn Si-ôn, mỗi buổi
//                              nhỏ 1 dòng: mã buổi, thuộc sự kiện nào, thuộc
//                              cụm nào, ngày, nhãn). CHỈ sửa bằng SQL tay.
//   `le_trong_the_diem_danh` — SỐ đã điểm danh, RIÊNG theo từng khu vực,
//                              khoá tự nhiên (khu_vuc, ten, ma_mua, ma_buoi),
//                              giống hệt `cv_cong_viec`: ô trống = xoá dòng.
//
// Mùa nào là "mùa hiện tại" được TỰ CHỌN từ chính ngày tháng trong
// `le_trong_the_cau_hinh` (chonMuaHienTai_) — thêm mùa mới chỉ cần thêm dòng
// SQL, KHÔNG cần sửa mã nguồn, y hệt tinh thần "Lễ hội".
// =====================================================================

import { chuoi, batBuoc } from '../tien-ich.js';

/** Toàn bộ lịch của 1 mùa, sắp đúng thứ tự hiển thị. */
async function layCauHinhMua_(db, maMua) {
  return db.all(
    `SELECT ma_buoi, thu_tu, ma_su_kien, ten_su_kien, cum, ten_cum, ngay, nhan, gio, ten_mua
     FROM le_trong_the_cau_hinh WHERE ma_mua = ? ORDER BY thu_tu`,
    [maMua]
  );
}

/**
 * Tự chọn mùa "hiện tại" khi giao diện không chỉ định rõ `maMua`:
 * ưu tiên mùa sắp/đang diễn ra gần nhất (den_ngay >= hôm nay, den_ngay nhỏ
 * nhất trong số đó); nếu không còn mùa nào sắp tới thì lấy mùa gần nhất ĐÃ
 * qua. Nhờ vậy thêm 1 mùa mới (chỉ bằng SQL) là giao diện tự chuyển sang
 * đúng mùa đó khi tới ngày, không cần sửa mã.
 */
async function chonMuaHienTai_(db) {
  const rows = await db.all(
    `SELECT ma_mua, ten_mua, MIN(ngay) AS tu_ngay, MAX(ngay) AS den_ngay, COUNT(*) AS so_buoi
     FROM le_trong_the_cau_hinh GROUP BY ma_mua, ten_mua`
  );
  if (!rows.length) return null;
  const homNay = new Date().toISOString().slice(0, 10);
  const sapToi = rows
    .filter((r) => chuoi(r.den_ngay) >= homNay)
    .sort((a, b) => chuoi(a.den_ngay).localeCompare(chuoi(b.den_ngay)));
  if (sapToi.length) return sapToi[0];
  return rows.slice().sort((a, b) => chuoi(b.den_ngay).localeCompare(chuoi(a.den_ngay)))[0];
}

/** Danh sách mọi mùa đã có cấu hình — dùng nếu sau này cần màn hình chọn mùa. */
export async function getLeTrongTheMuaList({ db }) {
  const rows = await db.all(
    `SELECT ma_mua, ten_mua, MIN(ngay) AS tu_ngay, MAX(ngay) AS den_ngay, COUNT(*) AS so_buoi
     FROM le_trong_the_cau_hinh GROUP BY ma_mua, ten_mua ORDER BY MIN(ngay) DESC`
  );
  return { danhSach: rows };
}

/**
 * Toàn bộ bảng Điểm danh Lễ Trọng Thể của MỘT khu vực, MỘT mùa:
 *   { coDuLieu, khuVuc, maMua, tenMua, buoi: [...lịch cả mùa...],
 *     tongSoBuoi, thanhVien: [ { ten, o: {ma_buoi: gia_tri}, tong } ],
 *     tongCum: { ma_buoi: <số người đã điểm danh buổi đó> } }
 *
 * `maMua` để trống thì tự chọn mùa hiện tại (xem chonMuaHienTai_).
 * `coDuLieu:false` khi CHƯA có mùa lễ trọng thể nào được cấu hình — giao
 * diện phải nói thẳng "chưa có mùa lễ trọng thể nào", không vẽ bảng rỗng
 * trông như đã nhập xong mà làm kém (nguyên tắc đã áp cho trang Trợ lý).
 *
 * Danh sách người LẤY NỀN từ `diem_danh_roster` — giữ đúng thứ tự đang hiển
 * thị ở bảng Điểm danh (thu_tu, id), để mọi bảng "theo người" trong 1 khu
 * vực luôn cùng thứ tự, nhìn không bị lệch nhau (giống getCVCongViec).
 */
export async function getLeTrongThe({ db }, khuVuc, maMua) {
  const kv = batBuoc(khuVuc, 'Khu vực');
  let ma = chuoi(maMua);

  if (!ma) {
    const hienTai = await chonMuaHienTai_(db);
    if (!hienTai) {
      return { coDuLieu: false, khuVuc: kv, maMua: '', tenMua: '', buoi: [], tongSoBuoi: 0, thanhVien: [], tongCum: {} };
    }
    ma = chuoi(hienTai.ma_mua);
  }

  const [buoiCauHinh, roster, oCell] = await Promise.all([
    layCauHinhMua_(db, ma),
    db.all('SELECT ten FROM diem_danh_roster WHERE khu_vuc = ? ORDER BY thu_tu, id', [kv]),
    db.all(
      'SELECT ten, ma_buoi, gia_tri FROM le_trong_the_diem_danh WHERE khu_vuc = ? AND ma_mua = ?',
      [kv, ma]
    ),
  ]);

  if (!buoiCauHinh.length) {
    return { coDuLieu: false, khuVuc: kv, maMua: ma, tenMua: '', buoi: [], tongSoBuoi: 0, thanhVien: [], tongCum: {} };
  }

  // ten_mua nằm lặp lại trên mỗi dòng cấu hình — lấy từ dòng đầu tiên là đủ.
  const tenMuaThuc = chuoi(buoiCauHinh[0].ten_mua || '');

  const buoi = buoiCauHinh.map((r) => ({
    maBuoi: chuoi(r.ma_buoi),
    thuTu: Number(r.thu_tu) || 0,
    maSuKien: chuoi(r.ma_su_kien),
    tenSuKien: chuoi(r.ten_su_kien),
    cum: chuoi(r.cum),
    tenCum: chuoi(r.ten_cum),
    ngay: chuoi(r.ngay),
    nhan: chuoi(r.nhan),
    gio: chuoi(r.gio),
  }));
  const tongSoBuoi = buoi.length;

  // Gom ô theo tên -> ma_buoi -> giá trị, đồng thời đếm tổng theo từng buổi
  // (để hiện ở dòng "Cả khu vực" cuối bảng, giống footer trong bản Artifact).
  const bang = new Map();
  const tongCum = {};
  for (const b of buoi) tongCum[b.maBuoi] = 0;
  for (const r of oCell) {
    const ten = chuoi(r.ten);
    const mb = chuoi(r.ma_buoi);
    if (tongCum[mb] === undefined) continue; // buổi lạ (mùa cũ/đó đổi cấu hình) -> bỏ qua
    if (!bang.has(ten)) bang.set(ten, {});
    bang.get(ten)[mb] = chuoi(r.gia_tri);
    tongCum[mb]++;
  }

  const thanhVien = roster.map((r) => {
    const ten = chuoi(r.ten);
    const o = bang.get(ten) || {};
    let tong = 0;
    for (const b of buoi) if (chuoi(o[b.maBuoi] || '') !== '') tong++;
    return { ten, o, tong };
  });

  return { coDuLieu: true, khuVuc: kv, maMua: ma, tenMua: tenMuaThuc, buoi, tongSoBuoi, thanhVien, tongCum };
}

/**
 * Lưu ĐÚNG 1 ô. Gõ rỗng (kể cả toàn dấu cách) = XOÁ dòng — giống hệt quy tắc
 * của `saveCVCongViec`, nhờ vậy cột "Tổng" chỉ cần đếm số dòng đang có, không
 * phải lọc chuỗi rỗng.
 *
 * ⚠️ Cố ý KHÔNG kiểm `ten` có trong `diem_danh_roster` hay không (giống hệt
 * saveCVCongViec): nếu ai bị xoá khỏi Điểm danh thì dòng cũ vẫn nằm im, quay
 * lại danh sách là số hiện ra đầy đủ — an toàn hơn xoá theo.
 *
 * ⚠️ CÓ kiểm `maBuoi` phải nằm trong đúng lịch của `maMua` — chặn gõ nhầm mã
 * buổi rác vào bảng số liệu thật.
 */
export async function saveLeTrongThe({ db }, khuVuc, ten, maMua, maBuoi, giaTri) {
  const kv = batBuoc(khuVuc, 'Khu vực');
  const tenTV = batBuoc(ten, 'Tên thành viên');
  const ma = batBuoc(maMua, 'Mùa lễ trọng thể');
  const mb = batBuoc(maBuoi, 'Buổi lễ');

  const hopLe = await db.first(
    'SELECT 1 AS x FROM le_trong_the_cau_hinh WHERE ma_mua = ? AND ma_buoi = ?',
    [ma, mb]
  );
  if (!hopLe) throw new Error('Buổi lễ không hợp lệ: "' + mb + '" (không có trong lịch mùa "' + ma + '").');

  const v = chuoi(giaTri);
  if (v === '') {
    await db.run(
      'DELETE FROM le_trong_the_diem_danh WHERE khu_vuc=? AND ten=? AND ma_mua=? AND ma_buoi=?',
      [kv, tenTV, ma, mb]
    );
  } else {
    await db.run(
      `INSERT INTO le_trong_the_diem_danh (khu_vuc, ten, ma_mua, ma_buoi, gia_tri) VALUES (?,?,?,?,?)
       ON CONFLICT (khu_vuc, ten, ma_mua, ma_buoi) DO UPDATE SET gia_tri = excluded.gia_tri`,
      [kv, tenTV, ma, mb, v]
    );
  }

  const tongSoBuoi = await db.first(
    'SELECT COUNT(*) AS n FROM le_trong_the_cau_hinh WHERE ma_mua = ?',
    [ma]
  );
  const daDiem = await db.first(
    'SELECT COUNT(*) AS n FROM le_trong_the_diem_danh WHERE khu_vuc=? AND ten=? AND ma_mua=?',
    [kv, tenTV, ma]
  );
  return { success: true, tong: Number(daDiem?.n) || 0, tongSoBuoi: Number(tongSoBuoi?.n) || 0 };
}
