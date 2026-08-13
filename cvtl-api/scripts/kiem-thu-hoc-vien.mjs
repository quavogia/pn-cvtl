// =====================================================================
// Kiểm thử OFFLINE cho hai file handler:
//     src/handlers/hoc-vien.js          (16 hàm)
//     src/handlers/muc-tieu-giao-duc.js (11 hàm)
// Tổng cộng 27 hàm — chạy thẳng trên máy, không cần mạng, không cần Cloudflare:
//     node scripts/kiem-thu-hoc-vien.mjs
//
// Cách dựng CSDL giả giống hệt scripts/kiem-thu.mjs: SQLite trong bộ nhớ
// (node:sqlite) + nạp migrations/0001_init.sql, chỉ khác một điểm: ở đây gói
// lại thành hàm taoCSDL() để mỗi nhóm ca kiểm thử có một CSDL SẠCH riêng,
// tránh dữ liệu nhóm trước làm sai lệch nhóm sau.
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_KHOI_TAO = readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8');

const { DANH_MUC } = await import(join(goc, 'src/registry.js'));

// --- Giả lập D1 bằng node:sqlite --------------------------------------
let sqlite = null;
let db = null;

function bocSqlite(conn) {
  return {
    async all(sql, p = []) { return conn.prepare(sql).all(...p); },
    async first(sql, p = []) { return conn.prepare(sql).get(...p) ?? null; },
    async run(sql, p = []) {
      const r = conn.prepare(sql).run(...p);
      // D1 trả về { meta: { last_row_id } } — giả lập lại đúng hình dạng đó
      // để thử được cả giá trị `row` mà addStudent/addDonThuanLog trả về.
      return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    },
    async batch(ds) { for (const { sql, params = [] } of ds) conn.prepare(sql).run(...params); },
  };
}

/** Danh sách Người dẫn dắt dùng xuyên suốt bộ kiểm thử. */
const DS_NDD = ['A Minh', 'C Lan', 'A Phúc', 'C Hoa'];
const DS_KHU_VUC = ['Đ Uyên', 'K Thành', 'K Trâm', 'K My', 'K Long', 'K Đức', 'SĐ'];
const DS_TIEN_DO = ['B1', 'B2', 'B3', 'B10', 'BT', 'Tạm nghỉ'];

/**
 * Dựng một CSDL mới tinh.
 * @param {boolean} napCauHinh false = để bảng config_list RỖNG (ca "mới cài đặt").
 */
function taoCSDL(napCauHinh = true) {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);
  db = bocSqlite(sqlite);
  if (napCauHinh) {
    for (const [i, kv] of DS_KHU_VUC.entries()) {
      sqlite.prepare('INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES (?,?,?)').run('khu_vuc', kv, i);
    }
    for (const [i, t] of DS_TIEN_DO.entries()) {
      sqlite.prepare('INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES (?,?,?)').run('tien_do', t, i);
    }
    for (const [i, n] of DS_NDD.entries()) {
      sqlite.prepare('INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES (?,?,?)').run('nguoi_dan_dat', n, i);
    }
  }
}

// --- Bộ khung kiểm thử ------------------------------------------------
let dat = 0;
let hong = 0;
const daGoi = new Set();   // để kiểm tra cuối bài: đã chạm đủ 27 hàm chưa

const NV = { email: 'nhanvien@gmail.com', ten: 'Nhan vien', laChu: false };
const env = { GOOGLE_CLIENT_ID: 'test', DB: null };

async function goi(fn, args = [], nguoiGoi = NV) {
  const muc = DANH_MUC[fn];
  if (!muc) return { error: 'Không hỗ trợ hàm: ' + fn };
  daGoi.add(fn);
  try {
    return { result: await muc.fn({ db, env, nguoiGoi }, ...args) };
  } catch (e) {
    return { error: e.message };
  }
}

function kiem(ten, dieuKien, chiTiet = '') {
  if (dieuKien) { dat++; console.log('  ✓', ten); }
  else { hong++; console.log('  ✗', ten, chiTiet); }
}

/** Đếm nhanh một bảng (dùng để chắc chắn "không ghi gì vào CSDL"). */
function dem(sql, ...p) { return sqlite.prepare(sql).get(...p).c; }

const TH = '2026-08';        // tháng đang xem
const TRUOC = '2026-07';     // tháng liền trước

console.log('\n=== KIỂM THỬ HỌC VIÊN + MỤC TIÊU/GIÁO DỤC (offline) ===\n');

// =====================================================================
// 1) HỌC VIÊN — thêm / đọc / sửa / xóa
// =====================================================================
console.log('1) Học viên — thêm / đọc / sửa / xóa');
{
  taoCSDL();

  let r = await goi('addStudent', [{
    ten: 'HV Một', ngay: '2026-08-05', diaChi: 'Số 1',
    ndd1: 'A Minh', to: 'K My', tienDo: 'B2', danhGia: 'Nghe tốt',
  }]);
  kiem('thêm học viên thành công', r.result?.success === true, JSON.stringify(r));
  kiem('addStudent trả về row (= id vừa tạo)', r.result?.row === 1, JSON.stringify(r));

  await goi('addStudent', [{
    ten: 'HV Hai', ngay: '2026-08-12', ngayDau: '2026-07-20',
    to: 'K My', tienDo: 'B1', ndd1: 'C Lan',
  }]);

  r = await goi('getStudents', []);
  const ds = r.result || [];
  kiem('getStudents trả đủ 2 học viên', ds.length === 2, JSON.stringify(r));
  kiem('stt chạy 1..n', ds[0]?.stt === 1 && ds[1]?.stt === 2, JSON.stringify(ds.map((s) => s.stt)));
  const idThat = sqlite.prepare('SELECT id FROM hoc_vien ORDER BY id').all().map((x) => x.id);
  kiem('row chính là id của bản ghi', ds[0]?.row === idThat[0] && ds[1]?.row === idThat[1],
    JSON.stringify([ds.map((s) => s.row), idThat]));
  kiem('ngày trả về dạng dd/MM/yyyy', ds[0]?.ngay === '05/08/2026', JSON.stringify(ds[0]?.ngay));
  kiem('để trống "Ngày đầu chia sẻ" thì lấy theo "Ngày chia sẻ cuối"',
    ds[0]?.ngayDau === '05/08/2026', JSON.stringify(ds[0]?.ngayDau));
  kiem('nhập "Ngày đầu chia sẻ" thì giữ đúng ngày đó',
    ds[1]?.ngayDau === '20/07/2026', JSON.stringify(ds[1]?.ngayDau));
  kiem('các trường khác trả đúng tên giao diện đang đọc',
    ds[0]?.to === 'K My' && ds[0]?.tienDo === 'B2' && ds[0]?.ndd1 === 'A Minh' &&
    ds[0]?.diaChi === 'Số 1' && ds[0]?.danhGia === 'Nghe tốt', JSON.stringify(ds[0]));

  // --- Sửa bằng đúng `row` nhận từ getStudents ---
  const rowMot = ds[0].row;
  const rowHai = ds[1].row;
  r = await goi('updateStudent', [rowMot, {
    ten: 'HV Một (đã sửa)', ngay: '2026-08-25', ngayDau: '2026-01-01',
    to: 'K Long', tienDo: 'B3', ndd1: 'A Minh', diaChi: 'Số 2', danhGia: 'Tốt',
  }]);
  kiem('sửa học viên bằng row nhận từ getStudents', r.result?.success === true, JSON.stringify(r));
  const sauSua = (await goi('getStudents', [])).result.find((s) => s.row === rowMot);
  kiem('sửa xong tên đổi đúng', sauSua?.ten === 'HV Một (đã sửa)', JSON.stringify(sauSua));
  kiem('sửa xong "Ngày chia sẻ cuối" đổi theo', sauSua?.ngay === '25/08/2026', JSON.stringify(sauSua));
  kiem('sửa học viên thì ngay_dau_chia_se KHÔNG đổi',
    sqlite.prepare('SELECT ngay_dau_chia_se n FROM hoc_vien WHERE id=?').get(rowMot).n === '2026-08-05',
    JSON.stringify(sqlite.prepare('SELECT ngay_dau_chia_se n FROM hoc_vien WHERE id=?').get(rowMot)));

  // --- Xóa bằng đúng `row` ---
  r = await goi('deleteStudent', [rowHai]);
  kiem('xóa học viên bằng row nhận từ getStudents', r.result?.success === true, JSON.stringify(r));
  const conLai = (await goi('getStudents', [])).result;
  kiem('xóa xong danh sách còn 1 người', conLai.length === 1, JSON.stringify(conLai));
  kiem('stt được đánh lại từ 1', conLai[0]?.stt === 1, JSON.stringify(conLai));

  r = await goi('updateStudent', [rowHai, { ten: 'Ai đó', tienDo: 'B1', to: 'K My' }]);
  kiem('sửa học viên đã bị xóa → lỗi tiếng Việt rõ ràng',
    /Không tìm thấy học viên cần sửa/.test(r.error || ''), JSON.stringify(r));

  r = await goi('updateStudent', [0, { ten: 'Ai đó', tienDo: 'B1' }]);
  kiem('sửa mà thiếu mã học viên → lỗi', /Thiếu mã học viên cần sửa/.test(r.error || ''), JSON.stringify(r));
  r = await goi('deleteStudent', [null]);
  kiem('xóa mà thiếu mã học viên → lỗi', /Thiếu mã học viên cần xóa/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
// 2) HỌC VIÊN — kiểm tra dữ liệu đầu vào, và KHÔNG được ghi gì khi lỗi
// =====================================================================
console.log('\n2) Học viên — chặn dữ liệu sai, không ghi nửa vời');
{
  taoCSDL();
  const truoc = dem('SELECT COUNT(*) c FROM hoc_vien');

  let r = await goi('addStudent', [{ ten: 'X', ngay: '2026-08-01', to: 'K My', tienDo: '' }]);
  kiem('Tiến độ trống → lỗi', /Vui lòng chọn Tiến độ/.test(r.error || ''), JSON.stringify(r));
  kiem('Tiến độ trống → KHÔNG ghi gì vào CSDL', dem('SELECT COUNT(*) c FROM hoc_vien') === truoc);

  r = await goi('addStudent', [{ ten: 'X', ngay: '2026-08-01', to: 'Khu vực lạ', tienDo: 'B1' }]);
  kiem('Khu vực lạ → lỗi', /Khu vực\/Tổ "Khu vực lạ" không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  kiem('Khu vực lạ → KHÔNG ghi gì vào CSDL', dem('SELECT COUNT(*) c FROM hoc_vien') === truoc);

  r = await goi('addStudent', [{ ten: 'X', ngay: '2026-08-01', to: 'K My', tienDo: 'B99' }]);
  kiem('Tiến độ lạ → lỗi', /Tiến độ "B99" không hợp lệ/.test(r.error || ''), JSON.stringify(r));

  r = await goi('addStudent', [{ ten: 'X', ngay: '2026-08-01', to: 'K My', tienDo: 'B1', ndd2: 'Người lạ' }]);
  kiem('Người dẫn dắt lạ → lỗi', /Người dẫn dắt "Người lạ" không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  kiem('Người dẫn dắt lạ → KHÔNG ghi gì vào CSDL', dem('SELECT COUNT(*) c FROM hoc_vien') === truoc);

  r = await goi('addStudent', [{ ten: '  ', ngay: '2026-08-01', to: 'K My', tienDo: 'B1' }]);
  kiem('thiếu Tên học viên → lỗi', /Thiếu Tên học viên/.test(r.error || ''), JSON.stringify(r));
  kiem('thiếu Tên → KHÔNG ghi gì vào CSDL', dem('SELECT COUNT(*) c FROM hoc_vien') === truoc);

  r = await goi('addStudent', [{ ten: 'Không Khu vực', ngay: '2026-08-01', to: '', tienDo: 'B1' }]);
  kiem('để trống Khu vực thì vẫn thêm được (ô không bắt buộc)',
    r.result?.success === true, JSON.stringify(r));

  // --- config_list RỖNG: bỏ qua kiểm tra, không chặn oan ---
  taoCSDL(false);
  r = await goi('addStudent', [{
    ten: 'HV mới cài đặt', ngay: '2026-08-01',
    to: 'Khu vực chưa khai báo', tienDo: 'B7', ndd1: 'Người chưa khai báo',
  }]);
  kiem('config_list rỗng → KHÔNG chặn oan Khu vực/Tiến độ/NDD',
    r.result?.success === true, JSON.stringify(r));
  kiem('config_list rỗng → vẫn ghi được vào CSDL', dem('SELECT COUNT(*) c FROM hoc_vien') === 1);
  r = await goi('addStudent', [{ ten: 'Thiếu tiến độ', ngay: '2026-08-01', to: 'K My' }]);
  kiem('config_list rỗng nhưng Tiến độ vẫn là ô bắt buộc',
    /Vui lòng chọn Tiến độ/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
// 3) getStats — bảng "Đang nghe" theo Khu vực
// =====================================================================
console.log('\n3) getStats — bảng "Đang nghe"');
{
  taoCSDL();
  const them = (ten, to, tienDo) => goi('addStudent', [{ ten, ngay: '2026-08-10', to, tienDo }]);
  await them('A1', 'K My', 'B2');
  await them('A2', 'K My', 'BT');
  await them('A3', 'K My', 'Tạm nghỉ');
  await them('A4', 'K Long', 'B1');
  await them('A5', '', 'B1');                       // không có Khu vực
  // Dòng "kế thừa" từ bản Google Sheets: Khu vực không còn trong Config nữa.
  sqlite.prepare("INSERT INTO hoc_vien (ten, khu_vuc, tien_do) VALUES ('A6','Khu vực cũ','B2')").run();

  const r = await goi('getStats', []);
  const ds = r.result || [];
  const tim = (to) => ds.find((x) => x.to === to);
  kiem('trả đủ 7 Khu vực + 1 dòng Tổng', ds.length === 8, JSON.stringify(ds));
  // K My có A1 (B2, tính), A2 (BT, KHÔNG tính từ 13/08/2026), A3 (Tạm nghỉ, không tính).
  kiem('"Tạm nghỉ" KHÔNG được tính', tim('K My')?.dangNghe === 1, JSON.stringify(tim('K My')));
  kiem('đã Báp-têm (BT) KHÔNG còn được tính là "đang nghe"',
    tim('K My')?.dangNghe === 1, JSON.stringify(tim('K My')));
  kiem('học viên không có Khu vực KHÔNG được tính',
    ds.filter((x) => x.to !== 'Tổng').every((x) => x.to), JSON.stringify(ds));
  kiem('Khu vực chưa có ai vẫn hiện 0', tim('Đ Uyên')?.dangNghe === 0, JSON.stringify(tim('Đ Uyên')));
  kiem('dòng cuối cùng là "Tổng"', ds[ds.length - 1]?.to === 'Tổng', JSON.stringify(ds[ds.length - 1]));
  const tongCacDong = ds.slice(0, -1).reduce((s, x) => s + x.dangNghe, 0);
  kiem('dòng "Tổng" = tổng các dòng ở trên',
    ds[ds.length - 1]?.dangNghe === tongCacDong,
    'Tổng=' + ds[ds.length - 1]?.dangNghe + ' nhưng cộng các dòng = ' + tongCacDong);
  kiem('mỗi dòng có row là số thứ tự tăng dần',
    ds.every((x, i) => x.row === i + 1), JSON.stringify(ds.map((x) => x.row)));
}

// =====================================================================
// 4) getProgressBreakdown — đếm theo Tiến độ
// =====================================================================
console.log('\n4) getProgressBreakdown — đếm theo Tiến độ');
{
  taoCSDL();
  const them = (ten, to, tienDo, ngay) => goi('addStudent', [{ ten, ngay, to, tienDo }]);
  await them('B1a', 'K My', 'B10', '2026-08-02');
  await them('B1b', 'K My', 'B1', '2026-08-03');
  await them('B1c', 'K My', 'B1', '2026-08-04');
  await them('B1d', 'K My', 'BT', '2026-08-05');
  await them('B1e', 'K My', 'Tạm nghỉ', '2026-08-06');
  await them('B1f', 'K Long', 'B2', '2026-08-07');
  await them('B1g', 'K My', 'B1', '2026-07-30');   // tháng khác

  let r = await goi('getProgressBreakdown', [TH, 'K My']);
  kiem('chỉ đếm học viên có "Ngày chia sẻ cuối" trong tháng và đúng Khu vực',
    JSON.stringify(r.result) === JSON.stringify([
      { tienDo: 'B1', count: 2 }, { tienDo: 'B10', count: 1 },
      { tienDo: 'BT', count: 1 }, { tienDo: 'Tạm nghỉ', count: 1 },
    ]), JSON.stringify(r));
  kiem('thứ tự: B1 -> B10 (theo SỐ, không theo chữ) -> BT -> còn lại',
    r.result?.[0].tienDo === 'B1' && r.result?.[1].tienDo === 'B10', JSON.stringify(r.result));

  r = await goi('getProgressBreakdown', [TH, '']);
  kiem('để trống Khu vực thì tính toàn bộ',
    (r.result || []).reduce((s, x) => s + x.count, 0) === 6, JSON.stringify(r));

  r = await goi('getProgressBreakdown', ['8/2026', 'K My']);
  kiem('monthKey sai định dạng → lỗi "Tháng không hợp lệ"',
    /Tháng không hợp lệ/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
// 5) NHẬT KÝ ĐƠN THUẦN
// =====================================================================
console.log('\n5) Nhật ký Đơn thuần');
{
  taoCSDL();
  let r = await goi('addDonThuanLog', [{
    ngay: '2026-08-03', khuVuc: 'K My', soLuong: 4, ghiChu: 'Chợ', ndd1: 'A Minh',
  }]);
  kiem('thêm nhật ký thành công', r.result?.success === true, JSON.stringify(r));
  await goi('addDonThuanLog', [{ ngay: '2026-08-22', khuVuc: 'K My', soLuong: 6, ndd1: 'C Lan', ndd2: 'A Minh' }]);
  await goi('addDonThuanLog', [{ ngay: '2026-07-15', khuVuc: 'K My', soLuong: 9, ndd1: 'A Minh' }]);

  r = await goi('getDonThuanLogs', [TH]);
  const logs = r.result || [];
  kiem('lọc đúng tháng (bỏ dòng tháng 7)', logs.length === 2, JSON.stringify(logs));
  kiem('mới nhất nằm ở đầu', logs[0]?.ngay === '22/08/2026', JSON.stringify(logs.map((l) => l.ngay)));
  kiem('soLuong đọc đúng từ cột CSDL don_thuan', logs[0]?.soLuong === 6 && logs[1]?.soLuong === 4,
    JSON.stringify(logs.map((l) => l.soLuong)));
  kiem('cột CSDL đúng tên don_thuan',
    dem("SELECT COUNT(*) c FROM nhat_ky_don_thuan WHERE don_thuan = 6 AND substr(ngay,1,7)='2026-08'") === 1);
  kiem('ngày trả về dạng dd/MM/yyyy', /^\d{2}\/\d{2}\/\d{4}$/.test(logs[1]?.ngay || ''), JSON.stringify(logs[1]));
  kiem('giữ đủ ghi chú và 3 ô người dẫn dắt',
    logs[1]?.ghiChu === 'Chợ' && logs[1]?.ndd1 === 'A Minh' && logs[0]?.ndd2 === 'A Minh',
    JSON.stringify(logs));

  r = await goi('deleteDonThuanLog', [logs[0].row]);
  kiem('xóa nhật ký bằng row nhận từ getDonThuanLogs', r.result?.success === true, JSON.stringify(r));
  r = await goi('getDonThuanLogs', [TH]);
  kiem('xóa xong chỉ còn 1 dòng trong tháng', r.result?.length === 1, JSON.stringify(r));
  kiem('xóa đúng dòng cần xóa', r.result?.[0]?.soLuong === 4, JSON.stringify(r));

  r = await goi('deleteDonThuanLog', [0]);
  kiem('xóa mà thiếu mã dòng → lỗi', /Thiếu mã dòng nhật ký cần xóa/.test(r.error || ''), JSON.stringify(r));

  const truoc = dem('SELECT COUNT(*) c FROM nhat_ky_don_thuan');
  r = await goi('addDonThuanLog', [{ ngay: '2026-08-03', khuVuc: 'K My', soLuong: 1 }]);
  kiem('thiếu ndd1 → lỗi', /Vui lòng nhập "Người dẫn dắt 1"/.test(r.error || ''), JSON.stringify(r));
  r = await goi('addDonThuanLog', [{ khuVuc: 'K My', soLuong: 1, ndd1: 'A Minh' }]);
  kiem('thiếu Ngày → lỗi', /Vui lòng chọn Ngày/.test(r.error || ''), JSON.stringify(r));
  r = await goi('addDonThuanLog', [{ ngay: '2026-08-03', soLuong: 1, ndd1: 'A Minh' }]);
  kiem('thiếu Khu vực → lỗi', /Thiếu Khu vực/.test(r.error || ''), JSON.stringify(r));
  r = await goi('addDonThuanLog', [{ ngay: '2026-08-03', khuVuc: 'K My', soLuong: 1, ndd1: 'A Minh', ndd3: 'Người lạ' }]);
  kiem('người dẫn dắt lạ → lỗi', /"Người dẫn dắt 3": "Người lạ" không có trong danh sách/.test(r.error || ''),
    JSON.stringify(r));
  kiem('mọi lỗi trên đều KHÔNG ghi gì vào CSDL', dem('SELECT COUNT(*) c FROM nhat_ky_don_thuan') === truoc);

  r = await goi('getDonThuanLogs', ['2026-8']);
  kiem('monthKey sai định dạng → lỗi "Tháng không hợp lệ"',
    /Tháng không hợp lệ/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
// 6) CÁC BẢNG THỐNG KÊ TỔNG HỢP
// =====================================================================
console.log('\n6) Thống kê tổng hợp');
{
  taoCSDL();

  // --- Khi chưa có dữ liệu gì ---
  let r = await goi('getKVTongSummary', [TH]);
  kiem('chưa có ai trong tab Giáo dục → eduLmsAvg = null (không phải 0)',
    r.result?.eduLmsAvg === null && r.result?.eduLmsCount === 0, JSON.stringify(r.result));
  r = await goi('getMonthlySummaryByKV', [TH]);
  kiem('chưa có mục tiêu → percent = null (không phải 0, không phải Infinity)',
    r.result?.[0]?.percent.donThuan === null && r.result?.[0]?.percent.huuHieu === null &&
    r.result?.[0]?.percent.bt === null, JSON.stringify(r.result?.[0]));

  // --- Dựng dữ liệu ---
  await goi('addGiaoDucMember', [{ khuVuc: 'K My', ten: 'A Minh' }]);
  await goi('addGiaoDucMember', [{ khuVuc: 'K My', ten: 'C Lan' }]);
  await goi('addGiaoDucMember', [{ khuVuc: 'K Long', ten: 'A Phúc' }]);
  // Mục tiêu Khu vực = TỔNG mục tiêu cá nhân của các thành viên trong Khu vực.
  await goi('saveGoalCaNhan', [TH, 'K My', 'A Minh', { donThuan: 10, huuHieu: 2, bt: 1, truc127: 127 }]);
  await goi('saveGoalCaNhan', [TH, 'K My', 'C Lan', { donThuan: 5, huuHieu: 1, bt: 0, truc127: 0 }]);

  const themHV = (ten, to, tienDo, ngay, ngayDau, ndd1, ndd2) =>
    goi('addStudent', [{ ten, to, tienDo, ngay, ngayDau, ndd1, ndd2 }]);
  await themHV('HV1', 'K My', 'B2', '2026-08-10', '2026-08-03', 'A Minh', 'C Lan');
  await themHV('HV2', 'K My', 'BT', '2026-08-15', '2026-08-15', 'A Minh');
  await themHV('HV3', 'K My', 'B1', '2026-08-16', '2026-08-16', 'C Lan');
  await themHV('HV4', 'K Long', 'B3', '2026-08-28', '2026-08-25', 'A Phúc');
  await themHV('HV5', 'K My', 'Tạm nghỉ', '2026-08-18', '2026-08-18', 'C Lan');
  await themHV('HV6', 'K My', 'B2', '2026-08-20', '2026-08-20', 'A Minh', 'A Minh'); // trùng tên 2 ô
  await goi('addDonThuanLog', [{ ngay: '2026-08-03', khuVuc: 'K My', soLuong: 4, ndd1: 'A Minh' }]);
  await goi('addDonThuanLog', [{ ngay: '2026-08-22', khuVuc: 'K My', soLuong: 6, ndd1: 'C Lan' }]);
  await goi('addDonThuanLog', [{ ngay: '2026-07-10', khuVuc: 'K My', soLuong: 3, ndd1: 'A Minh' }]);

  // --- getMonthlySummaryByKV ---
  r = await goi('getMonthlySummaryByKV', [TH]);
  const kmy = r.result?.find((x) => x.khuVuc === 'K My');
  kiem('mục tiêu Khu vực = tổng mục tiêu cá nhân',
    kmy?.goal.donThuan === 15 && kmy?.goal.huuHieu === 3 && kmy?.goal.bt === 1, JSON.stringify(kmy?.goal));
  kiem('Đơn thuần thực tế cộng đúng trong tháng', kmy?.actual.donThuan === 10, JSON.stringify(kmy?.actual));
  kiem('"BT" KHÔNG tính là Hữu hiệu (chỉ B2 trở lên)',
    kmy?.actual.huuHieu === 2 && kmy?.actual.bt === 1, JSON.stringify(kmy?.actual));
  kiem('phần trăm làm tròn 1 chữ số',
    kmy?.percent.donThuan === 66.7 && kmy?.percent.huuHieu === 66.7 && kmy?.percent.bt === 100,
    JSON.stringify(kmy?.percent));
  kiem('Khu vực chưa đặt mục tiêu → percent null',
    r.result?.find((x) => x.khuVuc === 'SĐ')?.percent.donThuan === null, JSON.stringify(r.result));
  kiem('trả đủ 7 Khu vực', r.result?.length === 7, JSON.stringify(r.result?.length));

  // --- getMonthlySummaryOverall ---
  r = await goi('getMonthlySummaryOverall', [TH]);
  const tong = r.result;
  kiem('getMonthlySummaryOverall cộng đúng mục tiêu mọi Khu vực',
    tong?.goal.donThuan === 15 && tong?.goal.huuHieu === 3, JSON.stringify(tong?.goal));
  kiem('getMonthlySummaryOverall cộng đúng thực tế mọi Khu vực',
    tong?.actual.donThuan === 10 && tong?.actual.huuHieu === 3 && tong?.actual.bt === 1,
    JSON.stringify(tong?.actual));
  kiem('getMonthlySummaryOverall trả monthKey và thẻ EDU LMS',
    tong?.monthKey === TH && tong?.eduLms?.count === 3, JSON.stringify(tong?.eduLms));

  // --- getKhuVucOverview / getAllKhuVucOverview ---
  r = await goi('getAllKhuVucOverview', [TH]);
  const tatCa = r.result || [];
  const okmy = tatCa.find((x) => x.khuVuc === 'K My');
  kiem('getAllKhuVucOverview đếm đúng tổng học viên của Khu vực (mọi tháng)',
    okmy?.tongHocVien === 5, JSON.stringify(okmy?.tongHocVien));
  kiem('getAllKhuVucOverview có bảng breakdown theo Tiến độ',
    okmy?.breakdown.some((x) => x.tienDo === 'BT' && x.count === 1), JSON.stringify(okmy?.breakdown));
  kiem('getAllKhuVucOverview có số liệu tháng trước',
    okmy?.prevGoalSummary.actual.donThuan === 3, JSON.stringify(okmy?.prevGoalSummary.actual));

  r = await goi('getKhuVucOverview', [TH, 'K My']);
  kiem('getKhuVucOverview khớp với bản gộp',
    JSON.stringify(r.result) === JSON.stringify(okmy), JSON.stringify(r.result));
  r = await goi('getKhuVucOverview', [TH, 'Khu vực không tồn tại']);
  kiem('getKhuVucOverview với Khu vực lạ → trả khung rỗng, không vỡ',
    r.result?.tongHocVien === 0 && r.result?.goalSummary.percent.donThuan === null, JSON.stringify(r.result));
  r = await goi('getKhuVucOverview', [TH, '']);
  kiem('getKhuVucOverview thiếu Khu vực → lỗi', /Thiếu Khu vực/.test(r.error || ''), JSON.stringify(r));

  // --- getAllKhuVucWeekly: cộng 5 tuần PHẢI BẰNG số tháng ---
  r = await goi('getAllKhuVucWeekly', [TH]);
  const tuan = r.result || [];
  const wkmy = tuan.find((x) => x.khuVuc === 'K My');
  kiem('getAllKhuVucWeekly chia Đơn thuần đúng tuần',
    JSON.stringify(wkmy?.donThuan) === JSON.stringify([4, 0, 0, 6, 0]), JSON.stringify(wkmy?.donThuan));
  kiem('getAllKhuVucWeekly chia Hữu hiệu/BT theo tuần của "Ngày đầu chia sẻ"',
    JSON.stringify(wkmy?.huuHieu) === JSON.stringify([1, 0, 1, 0, 0]) &&
    JSON.stringify(wkmy?.bt) === JSON.stringify([0, 0, 1, 0, 0]),
    JSON.stringify({ hh: wkmy?.huuHieu, bt: wkmy?.bt }));
  const cong = (a) => a.reduce((s, x) => s + x, 0);
  let khopHet = true;
  let lech = '';
  for (const w of tuan) {
    const o = tatCa.find((x) => x.khuVuc === w.khuVuc).goalSummary.actual;
    for (const k of ['donThuan', 'huuHieu', 'bt']) {
      if (cong(w[k]) !== o[k]) { khopHet = false; lech += `${w.khuVuc}.${k}: ${cong(w[k])} != ${o[k]}; `; }
    }
  }
  kiem('cộng 5 tuần của getAllKhuVucWeekly = actual của getAllKhuVucOverview', khopHet, lech);
  kiem('getAllKhuVucWeekly trả đủ 7 Khu vực, Khu vực chưa có gì vẫn là mảng 5 số 0',
    tuan.length === 7 && JSON.stringify(tuan.find((x) => x.khuVuc === 'SĐ')?.donThuan) === '[0,0,0,0,0]',
    JSON.stringify(tuan.find((x) => x.khuVuc === 'SĐ')));

  // --- getTopNguoiDanDat ---
  r = await goi('getTopNguoiDanDat', [TH]);
  const top = r.result || [];
  const timTop = (t) => top.find((x) => x.nguoiDanDat === t)?.count;
  // A Minh dẫn HV1 (B2), HV2 (BT — từ 13/08/2026 KHÔNG còn tính là "đang nghe"), HV6 (B2, trùng tên
  // ở ndd1+ndd2 chỉ tính 1). Vậy đếm đúng = 2 (HV1 + HV6), không phải 3.
  kiem('cùng một tên ở ndd1 + ndd2 của MỘT học viên chỉ tính 1 lần',
    timTop('A Minh') === 2, JSON.stringify(top));
  kiem('học viên đã Báp-têm (BT) KHÔNG còn được tính là "đang nghe"',
    timTop('A Minh') === 2, 'thực tế: ' + timTop('A Minh'));
  kiem('học viên "Tạm nghỉ" KHÔNG được tính', timTop('C Lan') === 2, JSON.stringify(top));
  kiem('danh sách sắp xếp giảm dần theo số học viên',
    top.every((x, i) => i === 0 || top[i - 1].count >= x.count), JSON.stringify(top));

  // --- getKVTongSummary ---
  // Số TP là LŨY KẾ trong tháng: tổng tháng của 1 Khu vực = số LỚN NHẤT
  // trong 5 tuần, KHÔNG phải cộng 5 tuần lại.
  const themTP = (thang, kv, loai, t, n) =>
    sqlite.prepare('INSERT INTO tp_tho_phuong (thang, khu_vuc, loai, tuan, so_luong) VALUES (?,?,?,?,?)')
      .run(thang, kv, loai, t, n);
  themTP(TH, 'K My', '1lan', 1, 5); themTP(TH, 'K My', '1lan', 2, 9); themTP(TH, 'K My', '1lan', 3, 7);
  themTP(TH, 'K Long', '1lan', 1, 4);
  themTP(TH, 'K My', '4lan', 1, 2); themTP(TH, 'K My', '4lan', 2, 3);
  themTP(TH, 'K Long', '4lan', 1, 1);
  themTP(TRUOC, 'K My', '1lan', 1, 6); themTP(TRUOC, 'K My', '4lan', 1, 2);
  sqlite.prepare("INSERT INTO dao_tao_tien_do (khu_vuc, ten, ngay_cap_chung_chi) VALUES ('K My','A Minh','2026-05-01')").run();
  sqlite.prepare("INSERT INTO dao_tao_tien_do (khu_vuc, ten, ngay_cap_chung_chi) VALUES ('K My','Người đã rời','2026-05-01')").run();
  sqlite.prepare("INSERT INTO dao_tao_tien_do (khu_vuc, ten, ngay_cap_chung_chi) VALUES ('K Long','A Phúc','')").run();
  await goi('saveGiaoDucWeek', [TH, 'K My', 'A Minh', 2, 'Hoàn thành', 90]);
  await goi('saveGiaoDucWeek', [TH, 'K My', 'C Lan', 1, 'Đang làm', 0]);

  r = await goi('getKVTongSummary', [TH]);
  const kvt = r.result;
  kiem('TP lấy SỐ LỚN NHẤT trong 5 tuần rồi mới cộng các Khu vực',
    kvt?.tpOneLan === 13 && kvt?.tpFourLan === 4, JSON.stringify(kvt));
  kiem('TP tháng trước lấy đúng', kvt?.tpOneLanPrev === 6 && kvt?.tpFourLanPrev === 2, JSON.stringify(kvt));
  kiem('eduLmsAvg = hoanThanh / count * 100',
    kvt?.eduLmsAvg === 33.3 && kvt?.eduLmsCount === 3 && kvt?.eduLmsHoanThanh === 1, JSON.stringify(kvt));
  kiem('certCount chỉ tính người còn trong danh sách Giáo dục', kvt?.certCount === 1, JSON.stringify(kvt));

  // --- monthKey sai định dạng ở mọi hàm thống kê ---
  const cacHam = ['getMonthlySummaryByKV', 'getMonthlySummaryOverall', 'getAllKhuVucOverview',
    'getAllKhuVucWeekly', 'getTopNguoiDanDat', 'getKVTongSummary'];
  let deuBao = true;
  for (const h of cacHam) {
    const kq = await goi(h, ['8/2026']);
    if (!/Tháng không hợp lệ/.test(kq.error || '')) { deuBao = false; lech = h; }
  }
  kiem('monthKey "8/2026" → mọi hàm thống kê đều báo "Tháng không hợp lệ"', deuBao, lech);
  const kq2 = await goi('getKhuVucOverview', ['', 'K My']);
  kiem('monthKey rỗng → getKhuVucOverview báo "Tháng không hợp lệ"',
    /Tháng không hợp lệ/.test(kq2.error || ''), JSON.stringify(kq2));
}

// =====================================================================
// 7) GIÁO DỤC THÀNH VIÊN
// =====================================================================
console.log('\n7) Giáo dục thành viên');
{
  taoCSDL();

  let r = await goi('addGiaoDucMember', [{ khuVuc: 'K My', ten: 'A Minh' }]);
  kiem('thêm thành viên thành công', r.result?.success === true, JSON.stringify(r));
  r = await goi('getGiaoDucWeeklyAll', [TH]);
  const nguoiMoi = r.result?.['K My']?.[0];
  kiem('thêm xong getGiaoDucWeeklyAll thấy ngay người mới', nguoiMoi?.ten === 'A Minh', JSON.stringify(r.result));
  kiem('người mới có 5 tuần EDU LMS rỗng',
    JSON.stringify(nguoiMoi?.eduLms.weeks) === JSON.stringify(['', '', '', '', '']) &&
    nguoiMoi?.eduLms.total === '', JSON.stringify(nguoiMoi?.eduLms));
  kiem('người mới có 5 tuần Trực tuyến 127 bằng 0',
    JSON.stringify(nguoiMoi?.truc127.weeks) === JSON.stringify([0, 0, 0, 0, 0]) &&
    nguoiMoi?.truc127.total === 0, JSON.stringify(nguoiMoi?.truc127));
  kiem('Khu vực chưa có ai vẫn có key với mảng rỗng',
    Array.isArray(r.result?.['SĐ']) && r.result['SĐ'].length === 0, JSON.stringify(Object.keys(r.result || {})));

  r = await goi('addGiaoDucMember', [{ khuVuc: 'K My', ten: 'A Minh' }]);
  kiem('thêm trùng → lỗi', /đã có trong Khu vực/.test(r.error || ''), JSON.stringify(r));
  kiem('thêm trùng → không sinh thêm dòng nào',
    dem("SELECT COUNT(*) c FROM giao_duc_thanh_vien WHERE ten='A Minh'") === 1);
  r = await goi('addGiaoDucMember', [{ khuVuc: 'K My', ten: 'Người lạ' }]);
  kiem('tên không có trong danh sách Người dẫn dắt → lỗi',
    /không có trong danh sách Người dẫn dắt/.test(r.error || ''), JSON.stringify(r));
  r = await goi('addGiaoDucMember', [{ ten: 'A Minh' }]);
  kiem('thiếu Khu vực → lỗi', /Vui lòng chọn Khu vực/.test(r.error || ''), JSON.stringify(r));
  r = await goi('addGiaoDucMember', [{ khuVuc: 'K My' }]);
  kiem('thiếu Tên thành viên → lỗi', /Vui lòng chọn Tên thành viên/.test(r.error || ''), JSON.stringify(r));

  // --- Tổng tháng của EDU LMS = trạng thái CAO NHẤT trong 5 tuần ---
  await goi('saveGiaoDucWeek', [TH, 'K My', 'A Minh', 3, 'Hoàn thành', 0]);
  await goi('saveGiaoDucWeek', [TH, 'K My', 'A Minh', 1, 'Đang làm', 0]);
  r = await goi('getGiaoDucWeekly', [TH, 'K My']);
  let m = r.result?.[0];
  kiem('Tuần 3 = "Hoàn thành", Tuần 1 = "Đang làm" → total = "Hoàn thành"',
    m?.eduLms.total === 'Hoàn thành', JSON.stringify(m?.eduLms));
  kiem('weeks giữ đúng từng tuần',
    JSON.stringify(m?.eduLms.weeks) === JSON.stringify(['Đang làm', '', 'Hoàn thành', '', '']),
    JSON.stringify(m?.eduLms.weeks));

  // --- Tổng tháng của Trực tuyến 127 = SỐ LỚN NHẤT (không phải tổng) ---
  await goi('saveGiaoDucWeek', [TH, 'K My', 'A Minh', 1, 'Đang làm', 30]);
  await goi('saveGiaoDucWeek', [TH, 'K My', 'A Minh', 3, 'Hoàn thành', 90]);
  r = await goi('getGiaoDucWeekly', [TH, 'K My']);
  m = r.result?.[0];
  kiem('127 = [30,0,90,0,0] → total = 90 (LẤY MAX, không phải 120)',
    JSON.stringify(m?.truc127.weeks) === JSON.stringify([30, 0, 90, 0, 0]) && m?.truc127.total === 90,
    JSON.stringify(m?.truc127));

  // --- Xóa số liệu về ('', 0) thì thành viên KHÔNG được biến mất ---
  await goi('saveGiaoDucWeek', [TH, 'K My', 'A Minh', 1, '', 0]);
  await goi('saveGiaoDucWeek', [TH, 'K My', 'A Minh', 3, '', 0]);
  r = await goi('getGiaoDucMembers', []);
  kiem('xóa số liệu về ("",0) thì thành viên VẪN còn trong getGiaoDucMembers',
    r.result?.some((x) => x.khuVuc === 'K My' && x.ten === 'A Minh'), JSON.stringify(r.result));

  // --- eduLms rác phải được ép về '' ---
  await goi('saveGiaoDucWeek', [TH, 'K My', 'A Minh', 2, 'abc', 5]);
  kiem('eduLms rác dạng chữ ("abc") → lưu thành ""',
    dem("SELECT COUNT(*) c FROM giao_duc_thanh_vien WHERE thang=? AND ten='A Minh' AND tuan=2 AND edu_lms=''", TH) === 1,
    JSON.stringify(sqlite.prepare("SELECT edu_lms FROM giao_duc_thanh_vien WHERE thang=? AND ten='A Minh' AND tuan=2").get(TH)));
  // Con số KHÔNG phải rác: sheet cũ có thời kỳ nhập EDU LMS bằng phần trăm.
  // 50 nghĩa là đang học dở -> "Đang làm". (Trước đây bỏ trắng, làm mất 51/78 ô
  // số liệu cũ — phát hiện ngày 12/08/2026 khi đối chiếu hai hệ thống.)
  await goi('saveGiaoDucWeek', [TH, 'K My', 'A Minh', 4, 50, 5]);
  kiem('eduLms kiểu cũ dạng số (50) → hiểu là "Đang làm"',
    dem("SELECT COUNT(*) c FROM giao_duc_thanh_vien WHERE thang=? AND ten='A Minh' AND tuan=4 AND edu_lms='Đang làm'", TH) === 1,
    JSON.stringify(sqlite.prepare("SELECT edu_lms FROM giao_duc_thanh_vien WHERE thang=? AND ten='A Minh' AND tuan=4").get(TH)));
  await goi('saveGiaoDucWeek', [TH, 'K My', 'A Minh', 5, '', -8]);
  kiem('số ngày âm → ép về 0',
    dem("SELECT COUNT(*) c FROM giao_duc_thanh_vien WHERE thang=? AND ten='A Minh' AND tuan=5 AND tt127_ngay=0", TH) === 1);

  // --- prevMonthTotal lấy đúng tháng trước ---
  await goi('saveGiaoDucWeek', [TRUOC, 'K My', 'A Minh', 2, 'Hoàn thành', 15]);
  await goi('saveGiaoDucWeek', [TRUOC, 'K My', 'A Minh', 4, 'Đang làm', 11]);
  r = await goi('getGiaoDucWeekly', [TH, 'K My']);
  m = r.result?.[0];
  kiem('prevMonthTotal của EDU LMS lấy đúng tháng trước',
    m?.eduLms.prevMonthTotal === 'Hoàn thành', JSON.stringify(m?.eduLms));
  kiem('prevMonthTotal của 127 lấy đúng tháng trước (max 15 và 11)',
    m?.truc127.prevMonthTotal === 15, JSON.stringify(m?.truc127));
  // Tháng này chỉ có đúng ô Tuần 4 = "Đang làm" (từ giá trị 50 ở trên),
  // không được ăn theo "Hoàn thành" và số 15 của tháng trước.
  kiem('số liệu tháng trước KHÔNG lẫn vào tháng này',
    m?.eduLms.total === 'Đang làm' && m?.truc127.total === 5,
    JSON.stringify({ e: m?.eduLms, t: m?.truc127 }));
  r = await goi('getGiaoDucWeeklyAll', [TH]);
  kiem('getGiaoDucWeeklyAll cho kết quả giống getGiaoDucWeekly',
    JSON.stringify(r.result?.['K My']) === JSON.stringify([m]), JSON.stringify(r.result?.['K My']));

  // --- Tuần không hợp lệ ---
  for (const t of [0, 6, 'x']) {
    r = await goi('saveGiaoDucWeek', [TH, 'K My', 'A Minh', t, '', 0]);
    kiem('tuần = ' + JSON.stringify(t) + ' → lỗi "Tuần không hợp lệ"',
      /Tuần không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  }
  r = await goi('saveGiaoDucWeek', [TH, '', 'A Minh', 1, '', 0]);
  kiem('saveGiaoDucWeek thiếu Khu vực → lỗi', /Vui lòng chọn Khu vực/.test(r.error || ''), JSON.stringify(r));
  r = await goi('saveGiaoDucWeek', [TH, 'K My', '', 1, '', 0]);
  kiem('saveGiaoDucWeek thiếu tên → lỗi', /Thiếu tên thành viên/.test(r.error || ''), JSON.stringify(r));
  r = await goi('getGiaoDucWeekly', [TH, '']);
  kiem('getGiaoDucWeekly thiếu Khu vực → lỗi', /Thiếu Khu vực/.test(r.error || ''), JSON.stringify(r));

  // --- Xóa thành viên: sạch mọi tháng ---
  await goi('addGiaoDucMember', [{ khuVuc: 'K Long', ten: 'A Minh' }]);
  r = await goi('deleteGiaoDucMember', ['K My', 'A Minh']);
  kiem('xóa thành viên thành công', r.result?.success === true, JSON.stringify(r));
  kiem('deleteGiaoDucMember xóa sạch MỌI tháng',
    dem("SELECT COUNT(*) c FROM giao_duc_thanh_vien WHERE khu_vuc='K My' AND ten='A Minh'") === 0);
  r = await goi('getGiaoDucMembers', []);
  kiem('xóa xong không còn trong getGiaoDucMembers của Khu vực đó',
    !r.result?.some((x) => x.khuVuc === 'K My' && x.ten === 'A Minh'), JSON.stringify(r.result));
  kiem('KHÔNG xóa lây người cùng tên ở Khu vực khác',
    r.result?.some((x) => x.khuVuc === 'K Long' && x.ten === 'A Minh'), JSON.stringify(r.result));
  r = await goi('deleteGiaoDucMember', ['', 'A Minh']);
  kiem('deleteGiaoDucMember thiếu Khu vực → lỗi', /Thiếu Khu vực/.test(r.error || ''), JSON.stringify(r));
  r = await goi('deleteGiaoDucMember', ['K My', '']);
  kiem('deleteGiaoDucMember thiếu tên → lỗi', /Thiếu tên thành viên/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
// 8) MỤC TIÊU CÁ NHÂN
// =====================================================================
console.log('\n8) Mục tiêu cá nhân');
{
  taoCSDL();

  let r = await goi('saveGoalCaNhan', [TH, 'K My', 'A Minh', { donThuan: 1 }]);
  kiem('lưu cho người chưa có trong tab Giáo dục → lỗi có hướng dẫn',
    /chưa có trong danh sách thành viên của Khu vực "K My"/.test(r.error || '') &&
    /tab "Giáo dục"/.test(r.error || ''), JSON.stringify(r));
  kiem('lưu hỏng → KHÔNG ghi gì vào CSDL', dem('SELECT COUNT(*) c FROM muc_tieu_ca_nhan') === 0);

  await goi('addGiaoDucMember', [{ khuVuc: 'K My', ten: 'A Minh' }]);
  await goi('addGiaoDucMember', [{ khuVuc: 'K My', ten: 'C Lan' }]);
  await goi('addGiaoDucMember', [{ khuVuc: 'K Long', ten: 'A Phúc' }]);

  await goi('saveGoalCaNhan', [TH, 'K My', 'A Minh', { donThuan: 4, huuHieu: 1, bt: 1, truc127: 100 }]);
  r = await goi('saveGoalCaNhan', [TH, 'K My', 'A Minh', { donThuan: 10, huuHieu: 2, bt: 0, truc127: 127 }]);
  kiem('lưu lần 2 cùng khóa vẫn thành công', r.result?.success === true, JSON.stringify(r));
  kiem('lưu 2 lần cùng khóa → CHỈ 1 dòng (upsert, không nhân đôi)',
    dem('SELECT COUNT(*) c FROM muc_tieu_ca_nhan WHERE thang=? AND khu_vuc=? AND ten=?', TH, 'K My', 'A Minh') === 1);
  kiem('lần lưu sau đè lên lần trước',
    sqlite.prepare('SELECT mt_don_thuan d FROM muc_tieu_ca_nhan WHERE thang=? AND khu_vuc=? AND ten=?')
      .get(TH, 'K My', 'A Minh').d === 10);

  r = await goi('saveGoalCaNhan', [TH, '', 'A Minh', {}]);
  kiem('saveGoalCaNhan thiếu Khu vực → lỗi', /Vui lòng chọn Khu vực/.test(r.error || ''), JSON.stringify(r));
  r = await goi('saveGoalCaNhan', [TH, 'K My', '', {}]);
  kiem('saveGoalCaNhan thiếu Thành viên → lỗi', /Vui lòng chọn Thành viên/.test(r.error || ''), JSON.stringify(r));
  r = await goi('saveGoalCaNhan', ['2026-8', 'K My', 'A Minh', {}]);
  kiem('saveGoalCaNhan monthKey sai → lỗi', /Tháng không hợp lệ/.test(r.error || ''), JSON.stringify(r));

  // --- Thực tế của mục tiêu cá nhân ---
  // 1 học viên Hữu hiệu có cả ndd1 và ndd2 → CẢ HAI người đều +1.
  await goi('addStudent', [{
    ten: 'HV A', to: 'K My', tienDo: 'B2', ngay: '2026-08-10', ndd1: 'A Minh', ndd2: 'C Lan',
  }]);
  // Học viên BT: cộng vào ô "bt", không cộng vào "hữu hiệu".
  await goi('addStudent', [{ ten: 'HV B', to: 'K My', tienDo: 'BT', ngay: '2026-08-11', ndd1: 'A Minh' }]);
  // Cùng một tên ở ndd1 + ndd2 của MỘT học viên → chỉ +1.
  await goi('addStudent', [{
    ten: 'HV C', to: 'K My', tienDo: 'B3', ngay: '2026-08-12', ndd1: 'C Lan', ndd2: 'C Lan',
  }]);
  // Học viên có ngày thuộc tháng khác → không tính.
  await goi('addStudent', [{ ten: 'HV D', to: 'K My', tienDo: 'B2', ngay: '2026-07-30', ndd1: 'A Minh' }]);
  // Nhật ký Đơn thuần soLuong = 5 với ndd1 + ndd2 → MỖI người +5.
  await goi('addDonThuanLog', [{ ngay: '2026-08-05', khuVuc: 'K My', soLuong: 5, ndd1: 'A Minh', ndd2: 'C Lan' }]);
  await goi('addDonThuanLog', [{ ngay: '2026-07-05', khuVuc: 'K My', soLuong: 7, ndd1: 'A Minh' }]);
  // Trực tuyến 127 thực tế của A Minh = 90 ngày (max trong tháng).
  await goi('saveGiaoDucWeek', [TH, 'K My', 'A Minh', 2, 'Đang làm', 90]);

  r = await goi('getPersonalGoalsAllKhuVuc', [TH]);
  const kmy = r.result?.['K My'] || [];
  const aMinh = kmy.find((x) => x.ten === 'A Minh');
  const cLan = kmy.find((x) => x.ten === 'C Lan');
  kiem('1 học viên có cả ndd1 và ndd2 → CẢ HAI người đều +1 hữu hiệu',
    aMinh?.actual.huuHieu === 1 && cLan?.actual.huuHieu === 2,
    JSON.stringify({ aMinh: aMinh?.actual, cLan: cLan?.actual }));
  kiem('cùng một tên ở ndd1 + ndd2 của MỘT học viên chỉ +1',
    cLan?.actual.huuHieu === 2, JSON.stringify(cLan?.actual));
  kiem('học viên BT cộng vào ô "bt", không cộng vào "hữu hiệu"',
    aMinh?.actual.bt === 1 && cLan?.actual.bt === 0,
    JSON.stringify({ a: aMinh?.actual, c: cLan?.actual }));
  kiem('nhật ký Đơn thuần soLuong = 5 với ndd1 + ndd2 → mỗi người +5',
    aMinh?.actual.donThuan === 5 && cLan?.actual.donThuan === 5,
    JSON.stringify({ a: aMinh?.actual.donThuan, c: cLan?.actual.donThuan }));
  kiem('học viên / nhật ký của tháng khác → không tính vào tháng này',
    aMinh?.actual.huuHieu === 1 && aMinh?.actual.donThuan === 5, JSON.stringify(aMinh?.actual));
  kiem('EDU LMS thực tế là TRẠNG THÁI, 127 lấy tổng tháng',
    aMinh?.actual.eduLms === 'Đang làm' && aMinh?.actual.truc127 === 90, JSON.stringify(aMinh?.actual));
  kiem('percent 90/127 → 70.9', aMinh?.percent.truc127 === 70.9, JSON.stringify(aMinh?.percent));
  kiem('percent = null khi mục tiêu bằng 0',
    cLan?.percent.donThuan === null && aMinh?.percent.bt === null,
    JSON.stringify({ c: cLan?.percent, a: aMinh?.percent }));
  kiem('có trong tab Giáo dục nhưng chưa đặt mục tiêu → vẫn hiện, goal toàn 0',
    cLan && cLan.goal.donThuan === 0 && cLan.goal.huuHieu === 0 &&
    cLan.goal.bt === 0 && cLan.goal.truc127 === 0, JSON.stringify(cLan?.goal));
  kiem('Khu vực chưa có ai → vẫn có key với mảng rỗng',
    Array.isArray(r.result?.['SĐ']) && r.result['SĐ'].length === 0, JSON.stringify(Object.keys(r.result || {})));
  kiem('trả đủ 7 Khu vực', Object.keys(r.result || {}).length === 7, JSON.stringify(Object.keys(r.result || {})));
  kiem('danh sách trong Khu vực sắp theo tên tiếng Việt',
    JSON.stringify(kmy.map((x) => x.ten)) === JSON.stringify(['A Minh', 'C Lan']), JSON.stringify(kmy.map((x) => x.ten)));

  r = await goi('getPersonalGoalsAllKhuVuc', ['8/2026']);
  kiem('getPersonalGoalsAllKhuVuc monthKey sai → lỗi',
    /Tháng không hợp lệ/.test(r.error || ''), JSON.stringify(r));

  // --- Xóa mục tiêu cá nhân ---
  r = await goi('deleteGoalCaNhan', [TH, 'K My', 'A Minh']);
  kiem('xóa mục tiêu cá nhân thành công', r.result?.success === true, JSON.stringify(r));
  kiem('xóa xong không còn dòng nào',
    dem('SELECT COUNT(*) c FROM muc_tieu_ca_nhan WHERE thang=? AND khu_vuc=? AND ten=?', TH, 'K My', 'A Minh') === 0);
  r = await goi('getPersonalGoalsAllKhuVuc', [TH]);
  kiem('xóa mục tiêu rồi thì goal về 0 nhưng người vẫn còn trong bảng',
    r.result?.['K My']?.find((x) => x.ten === 'A Minh')?.goal.donThuan === 0,
    JSON.stringify(r.result?.['K My']));
  r = await goi('deleteGoalCaNhan', [TH, 'K My', 'Không tồn tại']);
  kiem('xóa mục tiêu chưa từng có → không báo lỗi', r.result?.success === true, JSON.stringify(r));
  r = await goi('deleteGoalCaNhan', [TH, '', 'A Minh']);
  kiem('deleteGoalCaNhan thiếu Khu vực → lỗi', /Vui lòng chọn Khu vực/.test(r.error || ''), JSON.stringify(r));
  r = await goi('deleteGoalCaNhan', [TH, 'K My', '']);
  kiem('deleteGoalCaNhan thiếu Thành viên → lỗi', /Vui lòng chọn Thành viên/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
// 9) MỤC TIÊU KHU VỰC (bảng lịch sử muc_tieu_kv)
// =====================================================================
console.log('\n9) Mục tiêu Khu vực');
{
  taoCSDL();
  const docMT = () => sqlite.prepare('SELECT mt_don_thuan d, mt_huu_hieu h, mt_bt b FROM muc_tieu_kv WHERE thang=? AND khu_vuc=?')
    .get(TH, 'K My') || { d: 0, h: 0, b: 0 };

  let r = await goi('saveGoalKV', [TH, 'K My', { donThuan: 20, huuHieu: 5, bt: 2 }]);
  kiem('saveGoalKV lưu thành công', r.result?.success === true, JSON.stringify(r));
  kiem('saveGoalKV ghi đúng 3 chỉ tiêu',
    docMT().d === 20 && docMT().h === 5 && docMT().b === 2, JSON.stringify(docMT()));
  await goi('saveGoalKV', [TH, 'K My', { donThuan: 30, huuHieu: 6, bt: 3 }]);
  kiem('lưu 2 lần cùng khóa → chỉ 1 dòng (upsert)',
    dem('SELECT COUNT(*) c FROM muc_tieu_kv WHERE thang=? AND khu_vuc=?', TH, 'K My') === 1);
  kiem('lần lưu sau đè lên lần trước', docMT().d === 30, JSON.stringify(docMT()));

  r = await goi('deleteGoalKV', [TH, 'K My']);
  kiem('deleteGoalKV xóa thành công', r.result?.success === true, JSON.stringify(r));
  kiem('xóa xong đọc lại về 0', docMT().d === 0 && docMT().h === 0 && docMT().b === 0, JSON.stringify(docMT()));
  r = await goi('deleteGoalKV', [TH, 'K Long']);
  kiem('xóa dòng chưa tồn tại → KHÔNG lỗi', r.result?.success === true, JSON.stringify(r));

  for (const mk of ['2026-8', '', '8/2026', null]) {
    r = await goi('saveGoalKV', [mk, 'K My', {}]);
    kiem('saveGoalKV monthKey ' + JSON.stringify(mk) + ' → lỗi "Tháng không hợp lệ"',
      /Tháng không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  }
  r = await goi('deleteGoalKV', ['2026-8', 'K My']);
  kiem('deleteGoalKV monthKey sai → lỗi', /Tháng không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await goi('saveGoalKV', [TH, '', {}]);
  kiem('saveGoalKV thiếu Khu vực → lỗi', /Thiếu Khu vực/.test(r.error || ''), JSON.stringify(r));
  r = await goi('deleteGoalKV', [TH, '']);
  kiem('deleteGoalKV thiếu Khu vực → lỗi', /Thiếu Khu vực/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
// 10) Đã chạm đủ 27 hàm của hai file chưa?
// =====================================================================
console.log('\n10) Độ phủ');
{
  const hocVien = await import(join(goc, 'src/handlers/hoc-vien.js'));
  const mucTieu = await import(join(goc, 'src/handlers/muc-tieu-giao-duc.js'));
  const canPhu = [...Object.keys(hocVien), ...Object.keys(mucTieu)];
  const thieu = canPhu.filter((t) => !daGoi.has(t));
  kiem('hai file có đúng 27 hàm', canPhu.length === 27, 'thực tế: ' + canPhu.length);
  kiem('đã kiểm thử đủ 27 hàm', thieu.length === 0, 'còn thiếu: ' + thieu.join(', '));
}

console.log('\n11) Dữ liệu EDU LMS kiểu CŨ (phần trăm) không được để mất');
{
  // Phát hiện ngày 12/08/2026 khi đối chiếu hai hệ thống: 51 trên 78 ô EDU LMS
  // của sheet cũ đang lưu bằng CON SỐ (0-100) chứ không phải trạng thái.
  // Trước khi sửa, các ô này bị bỏ trống hết -> tab Giáo dục mất sạch số liệu cũ.
  taoCSDL();
  await db.run('INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES (?,?,?)',
    ['nguoi_dan_dat', 'A Test', 99]);
  const nap = (tuan, gt) => db.run(
    'INSERT INTO giao_duc_thanh_vien (thang, khu_vuc, ten, tuan, edu_lms, tt127_ngay) VALUES (?,?,?,?,?,?)',
    [TRUOC, 'K Long', 'A Test', tuan, gt, 0]
  );
  await nap(1, '0');
  await nap(2, '45');
  await nap(3, '100');
  await nap(4, 'Đang làm');
  await nap(5, 'rác rưởi');

  const r = await goi('getGiaoDucWeeklyAll', [TRUOC]);
  const nguoi = (r.result?.['K Long'] || []).find((x) => x.ten === 'A Test');
  const w = nguoi?.eduLms?.weeks || [];
  kiem('số 0 kiểu cũ -> để trống', w[0] === '', JSON.stringify(w));
  kiem('số 45 kiểu cũ -> "Đang làm"', w[1] === 'Đang làm', JSON.stringify(w));
  kiem('số 100 kiểu cũ -> "Hoàn thành"', w[2] === 'Hoàn thành', JSON.stringify(w));
  kiem('trạng thái mới vẫn giữ nguyên', w[3] === 'Đang làm', JSON.stringify(w));
  kiem('giá trị rác vẫn bị bỏ trống', w[4] === '', JSON.stringify(w));
  kiem('tổng tháng lấy trạng thái cao nhất', nguoi?.eduLms?.total === 'Hoàn thành',
    JSON.stringify(nguoi?.eduLms));
}

console.log('\n12) Mục tiêu cá nhân giữ đủ trường như bản cũ');
{
  // Bản cũ luôn trả goal.eduLms và percent.eduLms (dù giao diện đã bỏ ô nhập).
  // Thiếu hẳn trường thì chỗ nào lỡ đọc tới sẽ ra "undefined".
  taoCSDL();
  await db.run('INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES (?,?,?)',
    ['nguoi_dan_dat', 'B Test', 99]);
  await db.run(
    'INSERT INTO giao_duc_thanh_vien (thang, khu_vuc, ten, tuan, edu_lms, tt127_ngay) VALUES (?,?,?,?,?,?)',
    [TRUOC, 'K Long', 'B Test', 1, '', 0]
  );
  const r = await goi('getPersonalGoalsAllKhuVuc', [TRUOC]);
  const p = (r.result?.['K Long'] || [])[0];
  kiem('goal có trường eduLms', p && 'eduLms' in p.goal, JSON.stringify(p?.goal));
  kiem('percent có trường eduLms', p && 'eduLms' in p.percent, JSON.stringify(p?.percent));
  kiem('goal.eduLms bằng 0 như bản cũ', p?.goal?.eduLms === 0);
  kiem('percent.eduLms bằng null như bản cũ', p?.percent?.eduLms === null);
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
process.exit(hong ? 1 : 0);
