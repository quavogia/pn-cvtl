-- =====================================================================
-- CVTL — Lược đồ CSDL mới (Cloudflare D1 / SQLite)
-- Chuyển từ 17 sheet Google Sheets sang bảng quan hệ.
--
-- Điểm khác biệt quan trọng so với Google Sheets:
--   * Mỗi bảng có RÀNG BUỘC DUY NHẤT (UNIQUE) đúng theo "khoá nghiệp vụ".
--     Đây chính là thứ Google Sheets KHÔNG có, và là nguyên nhân gốc của
--     các lỗi trùng/mất dữ liệu trước đây (Lễ hội 15/15 lùi về 13/15,
--     K My không đồng bộ TP, hai người nhập cùng lúc ghi đè nhau...).
--   * Có chỉ mục (INDEX) nên truy vấn nhanh, không phải quét toàn bộ bảng.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- 1. Quyền truy cập  (sheet: Access Control)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_control (
  email             TEXT PRIMARY KEY,
  trang_thai        TEXT NOT NULL DEFAULT 'cho_duyet',   -- cho_duyet | da_duyet | tu_choi
  ten               TEXT,
  ngay_yeu_cau      TEXT,                                -- ISO8601
  ngay_duyet        TEXT,
  la_chu            INTEGER NOT NULL DEFAULT 0,          -- 1 = tài khoản chủ
  -- pham_vi (thêm 26/08/2026): danh sách khu vực người này PHỤ TRÁCH, ngăn
  -- cách bằng dấu phẩy. Ví dụ 'K My' (khu vực trưởng) hoặc
  -- 'Đ Uyên,K Thành,TT Châu' (địa vực trưởng). Rỗng = không phụ trách khu
  -- vực nào. la_chu = 1 thì bỏ qua cột này (thấy toàn Si-ôn).
  -- ⚠️ CSDL THẬT đã tồn tại từ trước nên CREATE TABLE IF NOT EXISTS ở đây
  -- KHÔNG thêm được cột. Câu ALTER TABLE nằm ở CAU_LENH_NANG_CAP trong
  -- src/schema-sql.js, chạy qua GET /cai-dat. Đừng thêm ALTER vào file này —
  -- file này bị chạy lại nhiều lần trong kiểm thử, ALTER sẽ báo trùng cột.
  pham_vi           TEXT
);

-- ---------------------------------------------------------------------
-- 2. Cấu hình dùng chung  (sheet: Config)
--    Sheet cũ là 3 cột song song; ở đây tách thành các dòng có "loại".
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config_list (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  loai      TEXT NOT NULL,        -- khu_vuc | tien_do | nguoi_dan_dat
  gia_tri   TEXT NOT NULL,
  thu_tu    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (loai, gia_tri)
);
CREATE INDEX IF NOT EXISTS ix_config_loai ON config_list (loai, thu_tu);

-- ---------------------------------------------------------------------
-- 3. Danh sách học viên  (sheet: DS HV)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hoc_vien (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ten               TEXT NOT NULL,
  ngay_chia_se_cuoi TEXT,          -- cột "Ngày"
  ngay_dau_chia_se  TEXT,          -- cột "Ngày đầu chia sẻ"
  dia_chi           TEXT,
  ndd1              TEXT,
  ndd2              TEXT,
  ndd3              TEXT,
  khu_vuc           TEXT,          -- cột "Tổ"
  tien_do           TEXT,          -- B1..BT | Tạm nghỉ
  danh_gia          TEXT,
  cap_nhat_luc      TEXT
);
CREATE INDEX IF NOT EXISTS ix_hv_khuvuc  ON hoc_vien (khu_vuc);
CREATE INDEX IF NOT EXISTS ix_hv_tiendo  ON hoc_vien (tien_do);
CREATE INDEX IF NOT EXISTS ix_hv_ten     ON hoc_vien (ten);

-- ---------------------------------------------------------------------
-- 4. Nhật ký Đơn thuần  (sheet: Nhat Ky Don Thuan)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nhat_ky_don_thuan (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ngay        TEXT NOT NULL,       -- yyyy-MM-dd
  khu_vuc     TEXT NOT NULL,
  don_thuan   INTEGER NOT NULL DEFAULT 0,
  ghi_chu     TEXT,
  ndd1        TEXT,
  ndd2        TEXT,
  ndd3        TEXT
);
CREATE INDEX IF NOT EXISTS ix_nkdt_ngay ON nhat_ky_don_thuan (ngay, khu_vuc);

-- ---------------------------------------------------------------------
-- 5. Mục tiêu Khu vực / tháng  (sheet: Muc Tieu KV Thang)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS muc_tieu_kv (
  thang       TEXT NOT NULL,       -- yyyy-MM
  khu_vuc     TEXT NOT NULL,
  mt_don_thuan INTEGER NOT NULL DEFAULT 0,
  mt_huu_hieu  INTEGER NOT NULL DEFAULT 0,
  mt_bt        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (thang, khu_vuc)
);

-- ---------------------------------------------------------------------
-- 6. Mục tiêu cá nhân  (sheet: Muc Tieu Ca Nhan)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS muc_tieu_ca_nhan (
  thang          TEXT NOT NULL,
  khu_vuc        TEXT NOT NULL,
  ten            TEXT NOT NULL,
  mt_don_thuan   INTEGER NOT NULL DEFAULT 0,
  mt_huu_hieu    INTEGER NOT NULL DEFAULT 0,
  mt_bt          INTEGER NOT NULL DEFAULT 0,
  mt_tt127_ngay  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (thang, khu_vuc, ten)
);

-- ---------------------------------------------------------------------
-- 7. TP Thờ phượng  (sheet: TP Tho Phuong)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tp_tho_phuong (
  thang     TEXT NOT NULL,
  khu_vuc   TEXT NOT NULL,
  loai      TEXT NOT NULL,         -- 1lan | 4lan
  tuan      INTEGER NOT NULL,      -- 1..5
  so_luong  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (thang, khu_vuc, loai, tuan)
);

-- ---------------------------------------------------------------------
-- 8. TP đã Báo cáo  (sheet: TP Bao Cao)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tp_bao_cao (
  thang           TEXT NOT NULL,
  khu_vuc         TEXT NOT NULL,
  tuan            INTEGER NOT NULL,
  nhom            TEXT NOT NULL,   -- T3 | T7
  thoi_gian       TEXT NOT NULL,   -- hiển thị dd/MM/yyyy HH:mm
  thoi_gian_ms    INTEGER NOT NULL,
  snap_1lan       INTEGER NOT NULL DEFAULT 0,
  snap_4lan       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (thang, khu_vuc, tuan, nhom)
);

-- ---------------------------------------------------------------------
-- 9. Giáo dục thành viên  (sheet: Giao Duc Thanh Vien)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS giao_duc_thanh_vien (
  thang         TEXT NOT NULL,
  khu_vuc       TEXT NOT NULL,
  ten           TEXT NOT NULL,
  tuan          INTEGER NOT NULL,
  edu_lms       TEXT,              -- '' | Đang làm | Hoàn thành
  tt127_ngay    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (thang, khu_vuc, ten, tuan)
);
CREATE INDEX IF NOT EXISTS ix_gdtv_thang_kv ON giao_duc_thanh_vien (thang, khu_vuc);

-- ---------------------------------------------------------------------
-- 10. Điểm danh  (sheet: Diem Danh)
--     nhom ở đây nghĩa là KHU VỰC (giữ nguyên cách gọi cũ để khỏi lệch).
--     buoi: T3toi | CNsang | CNchieu | CNtoi
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diem_danh (
  thang     TEXT NOT NULL,
  khu_vuc   TEXT NOT NULL,
  ten       TEXT NOT NULL,
  tuan      INTEGER NOT NULL,
  buoi      TEXT NOT NULL,
  gia_tri   TEXT NOT NULL,
  PRIMARY KEY (thang, khu_vuc, ten, tuan, buoi)
);
CREATE INDEX IF NOT EXISTS ix_dd_thang_kv ON diem_danh (thang, khu_vuc);

-- ---------------------------------------------------------------------
-- 11. Danh sách người điểm danh  (sheet: Diem Danh Tre Em)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diem_danh_roster (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  khu_vuc    TEXT NOT NULL,
  ten        TEXT NOT NULL,
  phu_huynh  TEXT,
  thu_tu     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (khu_vuc, ten)
);
CREATE INDEX IF NOT EXISTS ix_ddr_kv ON diem_danh_roster (khu_vuc, thu_tu);

-- ---------------------------------------------------------------------
-- 12. Ghi chú / mã cấp độ thành viên  (sheet: Diem Danh Ghi Chu)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diem_danh_ghi_chu (
  khu_vuc        TEXT NOT NULL,
  ten            TEXT NOT NULL,
  ma_cap_do      TEXT,
  ghi_chu        TEXT,
  ngay_cap_nhat  TEXT,
  PRIMARY KEY (khu_vuc, ten)
);

-- ---------------------------------------------------------------------
-- 13. Lịch làm việc  (sheet: Lich Lam Viec Tuan)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lich_lam_viec (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ngay             TEXT NOT NULL,     -- yyyy-MM-dd
  gio_bat_dau      TEXT,
  gio_ket_thuc     TEXT,
  noi_dung         TEXT NOT NULL,
  nguoi_phu_trach  TEXT,
  khu_vuc          TEXT,
  dia_diem         TEXT,
  trang_thai       TEXT,
  nguoi_tham_gia   TEXT
);
CREATE INDEX IF NOT EXISTS ix_lich_ngay ON lich_lam_viec (ngay);

-- ---------------------------------------------------------------------
-- 14. Đào tạo — tiến độ 70 bài  (sheet: Dao Tao Tien Do)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dao_tao_tien_do (
  khu_vuc            TEXT NOT NULL,
  ten                TEXT NOT NULL,
  bai_da_hoc         TEXT,            -- "Q1-01,Q1-02,..."
  ngay_cap_chung_chi TEXT,
  PRIMARY KEY (khu_vuc, ten)
);

-- ---------------------------------------------------------------------
-- 15. Đào tạo — việc giao  (sheet: Dao Tao Viec Giao)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dao_tao_viec_giao (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  khu_vuc       TEXT NOT NULL,
  ten           TEXT NOT NULL,
  noi_dung      TEXT NOT NULL,
  ngay_giao     TEXT,
  han_hoan_thanh TEXT,
  trang_thai    TEXT
);
CREATE INDEX IF NOT EXISTS ix_dtvg_kv ON dao_tao_viec_giao (khu_vuc, ten);

-- ---------------------------------------------------------------------
-- 16. Lễ hội — cấu hình  (sheet: Le Hoi Cau Hinh)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS le_hoi_cau_hinh (
  ma_le_hoi     TEXT PRIMARY KEY,
  ten_le_hoi    TEXT NOT NULL,
  ngay_bat_dau  TEXT,
  ngay_ket_thuc TEXT,
  danh_sach_bai TEXT,
  so_lan_yeu_cau INTEGER NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------
-- 17. Lễ hội — tiến độ  (sheet: Le Hoi Tien Do)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS le_hoi_tien_do (
  ma_le_hoi      TEXT NOT NULL,
  khu_vuc        TEXT NOT NULL,
  ten            TEXT NOT NULL,
  da_phat_bieu   TEXT,              -- "Q1-01#1,Q1-01#2,..."
  ngay_hoan_thanh TEXT,
  PRIMARY KEY (ma_le_hoi, khu_vuc, ten)
);

-- ---------------------------------------------------------------------
-- 18. Phiên đăng nhập (thay cho token tự ký trong Apps Script)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phien_dang_nhap (
  token       TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  ten         TEXT,
  tao_luc     INTEGER NOT NULL,
  het_han_luc INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_phien_email ON phien_dang_nhap (email);

-- ---------------------------------------------------------------------
-- 19. Sổ mốc Trụ đỡ — Hữu hiệu & Báp-têm   (thêm 13/08/2026)
--
-- VÌ SAO CẦN BẢNG NÀY: bảng hoc_vien chỉ giữ TRẠNG THÁI HIỆN TẠI (cột
-- tien_do). Sửa tiến độ một cái là mất dấu, xoá học viên là mất luôn công
-- của người dẫn dắt. Muốn báo cáo 6 tháng / 1 năm và khen thưởng công bằng
-- thì phải có sổ ghi riêng, ghi rồi nằm đó.
--
-- Tên người và tên người dẫn dắt được CHÉP CỨNG vào đây tại thời điểm đạt
-- mốc — không trỏ tới hoc_vien — để sau này ai sửa/xoá hồ sơ thì sổ vẫn đúng.
--
-- Khoá duy nhất (moc, ten, khu_vuc): MỖI NGƯỜI CHỈ GHI SỔ MỘT LẦN cho mỗi
-- mốc. Không có ràng buộc này thì sửa tiến độ B2 -> B1 -> B2 ba lần là thành
-- 3 ca hữu hiệu, tức +300 điểm khống.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS so_moc (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  moc        TEXT NOT NULL,
  ngay       TEXT NOT NULL,
  thang      TEXT NOT NULL,
  ten        TEXT NOT NULL,
  khu_vuc    TEXT NOT NULL,
  ndd1       TEXT,
  ndd2       TEXT,
  ndd3       TEXT,
  ghi_chu    TEXT,
  nguoi_ghi  TEXT,
  tao_luc    INTEGER NOT NULL,
  UNIQUE (moc, ten, khu_vuc)
);
CREATE INDEX IF NOT EXISTS ix_so_moc_ngay  ON so_moc (ngay, moc);
CREATE INDEX IF NOT EXISTS ix_so_moc_thang ON so_moc (thang, moc);

-- ---------------------------------------------------------------------
-- 20. Chốt kỳ khen thưởng   (thêm 13/08/2026)
-- Đóng băng bảng xếp hạng của một kỳ sau khi đã phát thưởng, để sau này ai
-- sửa sổ thì bảng đã chốt vẫn giữ nguyên con số lúc trao giải.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chot_ky (
  ky           TEXT PRIMARY KEY,
  tu_ngay      TEXT NOT NULL,
  den_ngay     TEXT NOT NULL,
  khu_vuc      TEXT,
  bang_json    TEXT NOT NULL,
  tom_tat_json TEXT,
  nguoi_chot   TEXT,
  chot_luc     INTEGER NOT NULL
);

-- ---------------------------------------------------------------------
-- 21. ĐIỂM DANH CÔNG VIỆC   (thêm 23/08/2026, theo yêu cầu anh Rise)
-- Chép lại đúng sheet "CVTL PN" anh Rise đang dùng: mỗi người 3 dòng
-- Sáng / Chiều / Tối, 6 Tuần × 7 ngày (CN..T7) hiện cùng lúc.
--
-- ⚠️ KHÔNG có bảng danh sách người riêng: bảng này DÙNG CHUNG danh sách
-- Điểm danh của khu vực (`diem_danh_roster`) — anh Rise chốt 23/08/2026:
-- "chuyển tab đó vào tab trudo trong mỗi khu vực, quản lý thành viên sẽ dễ
-- dàng hơn". Thêm/xoá người chỉ làm ở MỘT chỗ (bảng Điểm danh).
--
-- Khoá theo (khu_vuc, ten) giống 10 bảng "theo từng người" khác — nhờ vậy
-- `chuyenThanhVienKhuVuc` mang luôn dữ liệu này theo người khi đổi khu vực
-- (đã thêm vào BANG_THEO_NGUOI trong handlers/khu-vuc.js). Trong một khu
-- vực, `diem_danh_roster` đã có UNIQUE(khu_vuc, ten) nên tên không trùng.
--
-- Ô để TRỐNG thì XOÁ hẳn dòng (không lưu chuỗi rỗng) — nhờ vậy cột "Tổng"
-- chỉ cần đếm số dòng (COUNT), không phải lọc chuỗi rỗng.
--   buoi: sang | chieu | toi     ngay: CN,T2,T3,T4,T5,T6,T7     tuan: 1..6
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_cong_viec (
  khu_vuc  TEXT NOT NULL,
  ten      TEXT NOT NULL,
  thang    TEXT NOT NULL,
  tuan     INTEGER NOT NULL,
  buoi     TEXT NOT NULL,
  ngay     TEXT NOT NULL,
  gia_tri  TEXT NOT NULL,
  PRIMARY KEY (khu_vuc, ten, thang, tuan, buoi, ngay)
);
CREATE INDEX IF NOT EXISTS ix_cvcv_kv_thang ON cv_cong_viec (khu_vuc, thang);

-- ---------------------------------------------------------------------
-- 21b. cv_nguoi — CHỈNH DANH SÁCH NGƯỜI CỦA RIÊNG BẢNG ĐIỂM DANH CÔNG VIỆC
-- (thêm 23/08/2026 lần 2, anh Rise: "thêm phần xóa hoặc nhập thêm người mới")
--
-- Bảng công việc lấy NỀN từ `diem_danh_roster`, rồi cộng/trừ bằng bảng này:
--        hiển thị = (diem_danh_roster)  −  (kieu='an')  +  (kieu='them')
--
-- ⚠️ Anh Rise đã chốt (AskUserQuestion): sửa ở bảng công việc **KHÔNG** đụng
-- tới bảng Điểm danh, và ngược lại. Vì vậy tuyệt đối KHÔNG được đổi hai hàm
-- này thành ghi thẳng vào `diem_danh_roster`.
--
-- ⚠️ Ẩn/xoá người ở đây KHÔNG xoá dữ liệu trong `cv_cong_viec` — hiện lại
-- đúng tên là số cũ về đủ. Cố ý, để lỡ tay không mất số liệu.
--   kieu: 'an'  = có trong Điểm danh nhưng KHÔNG hiện ở bảng công việc
--         'them'= chỉ có ở bảng công việc, KHÔNG có trong Điểm danh
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_nguoi (
  khu_vuc  TEXT NOT NULL,
  ten      TEXT NOT NULL,
  kieu     TEXT NOT NULL,
  thu_tu   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (khu_vuc, ten)
);

-- ---------------------------------------------------------------------
-- 22. NHẬT KÝ THAY ĐỔI SỐ LIỆU  (thêm 25/08/2026)
--
-- Ghi lại ai gọi hàm GHI nào, cho khu vực nào, lúc nào, được hay lỗi.
-- Xem src/nhat-ky.js để biết bốn nguyên tắc.
--
-- Vì sao có bảng này: sự cố D1 ngày 24/08/2026 không tra được nguyên nhân
-- vì nhật ký đang tắt. Nhật ký KHÔNG HỒI TỐ.
--
--   loai: 'ghi'      = một lệnh ghi thật đã chạy
--         'bong_toi' = lời gọi mà luật phân quyền mới LẼ RA sẽ chặn, nhưng
--                      đang chạy thử nên vẫn cho qua
--   ket_qua: 'ok' | 'loi'
--
-- ⚠️ KHÔNG lưu token, KHÔNG lưu "số sự sống" (CCCD). tham_so đã cắt ngắn.
-- ⚠️ Bảng có id tự tăng nên db.js CỐ Ý không thử lại khi lỗi — thử lại
--    INSERT kiểu này sẽ sinh dòng trùng (bài học #30).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nhat_ky_thay_doi (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  thoi_gian_ms  INTEGER NOT NULL,
  loai          TEXT NOT NULL DEFAULT 'ghi',
  email         TEXT,
  ham           TEXT NOT NULL,
  khu_vuc       TEXT,
  tham_so       TEXT,
  ket_qua       TEXT NOT NULL DEFAULT 'ok',
  ghi_chu       TEXT
);
CREATE INDEX IF NOT EXISTS ix_nktd_thoi_gian ON nhat_ky_thay_doi (thoi_gian_ms);
CREATE INDEX IF NOT EXISTS ix_nktd_kv ON nhat_ky_thay_doi (khu_vuc, thoi_gian_ms);

-- ---------------------------------------------------------------------
-- 23. BÁO CÁO TUẦN  (thêm 26/08/2026 — tab Báo cáo)
--
-- Mỗi dòng = một khu vực đã chốt "số của tôi tuần này đã xong".
--   snap_json : dấu vết hạng mục nào ĐÃ CÓ DỮ LIỆU lúc bấm, dạng
--               "tho_phuong=1;trudo_truyen_dao=0;..."
--               ⚠️ CỐ Ý chỉ chụp CÓ/KHÔNG, không chụp trạng thái ✅⏳⚠️ —
--               trạng thái đổi theo ngày nên chụp nó là gắn cờ "đã sửa sau
--               báo cáo" oan cho cả phòng mỗi khi qua hạn.
--
-- ⚠️ Anh Rise chốt KHÔNG khoá ô sau khi báo cáo. Nghĩa là số vẫn sửa được,
--    và dấu vết này là cách duy nhất biết bản đã gửi lên trên còn khớp không.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bao_cao_tuan (
  thang         TEXT NOT NULL,
  khu_vuc       TEXT NOT NULL,
  tuan          INTEGER NOT NULL,
  snap_json     TEXT NOT NULL,
  nguoi_bao_cao TEXT,
  thoi_gian_ms  INTEGER NOT NULL,
  PRIMARY KEY (thang, khu_vuc, tuan)
);
CREATE INDEX IF NOT EXISTS ix_bct_thang ON bao_cao_tuan (thang);
