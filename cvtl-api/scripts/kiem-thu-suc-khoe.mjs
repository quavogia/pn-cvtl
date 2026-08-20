// =====================================================================
// Kiểm thử OFFLINE cho src/handlers/kiem-tra-suc-khoe.js — "Agent phát
// hiện lỗi" tự động (mới, 20/08/2026, theo yêu cầu anh Rise).
//     node scripts/kiem-thu-suc-khoe.mjs
//
// Phép kiểm tra: số ≥1/≥4 lần đang lưu (tp_tho_phuong) không được lớn hơn
// số thành viên HIỆN TẠI của khu vực đó (diem_danh_roster) — xem giải
// thích đầy đủ trong file handler.
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_KHOI_TAO = readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8');
const { kiemTraSucKhoeDuLieu, soanTinBatThuong } = await import(
  join(goc, 'src/handlers/kiem-tra-suc-khoe.js')
);

let sqlite = null;
let db = null;

function bocSqlite(conn) {
  return {
    async all(sql, p = []) { return conn.prepare(sql).all(...p); },
    async first(sql, p = []) { return conn.prepare(sql).get(...p) ?? null; },
    async run(sql, p = []) {
      const r = conn.prepare(sql).run(...p);
      return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    },
    async batch(ds) { for (const { sql, params = [] } of ds) conn.prepare(sql).run(...params); },
  };
}

function taoCSDL() {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);
  db = bocSqlite(sqlite);
}

function themRoster(kv, ten) {
  sqlite.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, thu_tu) VALUES (?,?,?)').run(
    kv, ten, 0
  );
}
function themTP(thang, kv, loai, tuan, soLuong) {
  sqlite.prepare(
    'INSERT INTO tp_tho_phuong (thang, khu_vuc, loai, tuan, so_luong) VALUES (?,?,?,?,?)'
  ).run(thang, kv, loai, tuan, soLuong);
}

let dat = 0, hong = 0;
function kiem(ten, dieuKien, chiTiet = '') {
  if (dieuKien) { dat++; console.log('  ✓', ten); }
  else { hong++; console.log('  ✗', ten, chiTiet); }
}

console.log('\n=== KIỂM THỬ KIỂM TRA SỨC KHOẺ DỮ LIỆU (agent phát hiện lỗi, offline) ===\n');

// =====================================================================
console.log('1) Không có gì bất thường — số đang lưu ≤ số thành viên hiện tại');
{
  taoCSDL();
  themRoster('K Thành', 'A'); themRoster('K Thành', 'B'); themRoster('K Thành', 'C');
  themRoster('K Thành', 'D'); themRoster('K Thành', 'E');
  themTP('2026-08', 'K Thành', '1lan', 1, 5); // = đúng bằng số thành viên, KHÔNG bất thường
  themTP('2026-08', 'K Thành', '4lan', 1, 3); // < số thành viên, bình thường
  const kq = await kiemTraSucKhoeDuLieu({ db });
  kiem('không báo bất thường nào', kq.batThuong.length === 0, JSON.stringify(kq.batThuong));
  kiem('vẫn đếm đúng số khu vực/dòng đã kiểm tra', kq.soKhuVucKiemTra === 1 && kq.soDongTPKiemTra === 2);
}

// =====================================================================
console.log('\n2) Đúng kiểu lỗi "K Thành" thật đã gặp — số lưu > số thành viên hiện tại');
{
  taoCSDL();
  // K Thành trước đây có 9 người, sau khi tách TT Châu chỉ còn 5 — nhưng
  // số TP vẫn kẹt ở 9 (đúng lỗi thật đã gặp ngày 20/08/2026).
  for (const ten of ['A', 'B', 'C', 'D', 'E']) themRoster('K Thành', ten);
  themTP('2026-08', 'K Thành', '1lan', 1, 9);
  themTP('2026-08', 'K Thành', '1lan', 2, 9);
  const kq = await kiemTraSucKhoeDuLieu({ db });
  kiem('phát hiện đúng 2 dòng bất thường', kq.batThuong.length === 2, JSON.stringify(kq.batThuong));
  kiem('đúng tên khu vực', kq.batThuong[0].khuVuc === 'K Thành');
  kiem('đúng số đang lưu / số thành viên hiện tại', kq.batThuong[0].soDangLuu === 9 && kq.batThuong[0].soThanhVienHienTai === 5);
  kiem('đúng nhãn "≥1 lần"', kq.batThuong[0].loai === '≥1 lần');
}

// =====================================================================
console.log('\n3) Khu vực chưa có thành viên nào trong roster (mới tạo, chưa ai chuyển vào)');
{
  taoCSDL();
  // TT Châu mới tạo, roster rỗng, nhưng lỡ có dòng TP > 0 sót lại thì vẫn phải bắt được.
  themTP('2026-08', 'TT Châu', '1lan', 1, 3);
  const kq = await kiemTraSucKhoeDuLieu({ db });
  kiem('phát hiện bất thường khi roster rỗng nhưng có số TP > 0', kq.batThuong.length === 1);
  kiem('số thành viên hiện tại = 0', kq.batThuong[0].soThanhVienHienTai === 0);
}

// =====================================================================
console.log('\n4) Nhiều khu vực cùng lúc, chỉ 1 khu vực có vấn đề');
{
  taoCSDL();
  themRoster('K Thành', 'A'); themRoster('K Thành', 'B'); themRoster('K Thành', 'C');
  themRoster('Đ Uyên', 'X'); themRoster('Đ Uyên', 'Y');
  themTP('2026-08', 'K Thành', '1lan', 1, 3); // đúng
  themTP('2026-08', 'Đ Uyên', '1lan', 1, 5); // sai — chỉ có 2 người
  const kq = await kiemTraSucKhoeDuLieu({ db });
  kiem('chỉ báo đúng 1 dòng bất thường (Đ Uyên)', kq.batThuong.length === 1);
  kiem('đúng khu vực bị báo', kq.batThuong[0].khuVuc === 'Đ Uyên');
}

// =====================================================================
console.log('\n5) so_luong = 0 thì không tính (đã lọc ở câu SQL, tránh nhiễu)');
{
  taoCSDL();
  themTP('2026-08', 'K Trâm', '1lan', 1, 0); // không có thành viên nào, số 0 — không phải bất thường
  const kq = await kiemTraSucKhoeDuLieu({ db });
  kiem('số 0 không bị báo bất thường', kq.batThuong.length === 0);
  kiem('không tính dòng so_luong=0 vào tổng số dòng đã kiểm tra', kq.soDongTPKiemTra === 0);
}

// =====================================================================
console.log('\n6) Sắp xếp: lệch nhiều nhất lên đầu');
{
  taoCSDL();
  themRoster('A', 'x1');
  themRoster('B', 'y1'); themRoster('B', 'y2');
  themTP('2026-08', 'A', '1lan', 1, 8); // lệch 7 (8 - 1)
  themTP('2026-08', 'B', '1lan', 1, 5); // lệch 3 (5 - 2)
  const kq = await kiemTraSucKhoeDuLieu({ db });
  kiem('khu vực lệch NHIỀU HƠN lên đầu', kq.batThuong[0].khuVuc === 'A');
}

// =====================================================================
console.log('\n7) soanTinBatThuong — dựng đúng nội dung tin Telegram, có thoát HTML');
{
  taoCSDL();
  for (const ten of ['A', 'B']) themRoster('K Thành', ten);
  themTP('2026-08', 'K Thành', '1lan', 3, 5);
  const kq = await kiemTraSucKhoeDuLieu({ db });
  const thoatHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tin = soanTinBatThuong(kq, thoatHtml);
  kiem('có nêu đúng khu vực', tin.includes('K Thành'));
  kiem('có nêu đúng số đang lưu (5) và số thành viên hiện tại (2)', tin.includes('5') && tin.includes('2'));
  kiem('có hướng dẫn cách sửa (nút Dọn dẹp)', tin.includes('Dọn dẹp'));
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
process.exit(hong > 0 ? 1 : 0);
