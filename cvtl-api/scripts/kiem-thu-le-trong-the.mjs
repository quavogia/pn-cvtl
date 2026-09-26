// =====================================================================
// Kiểm thử OFFLINE cho src/handlers/le-trong-the.js:
//     node scripts/kiem-thu-le-trong-the.mjs
//
// Xác minh việc loại bỏ cột 26/9 Mai cho toàn bộ khu vực.
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_KHOI_TAO = readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8');
const { getLeTrongThe, saveLeTrongThe, getLeTrongTheMuaList } = await import(join(goc, 'src/handlers/le-trong-the.js'));

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

  // Thêm thành viên vào 2 khu vực: SĐ và Đ Uyên
  const themRoster = (kv, ten, thuTu) =>
    sqlite.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, thu_tu) VALUES (?,?,?)').run(kv, ten, thuTu);
  themRoster('SĐ', 'L H Đức', 1);
  themRoster('SĐ', 'N T Huyền', 2);
  themRoster('Đ Uyên', 'Đ T Ngọc Uyên', 1);

  // Thêm các buổi cấu hình mẫu cho Mùa Thu 2026
  const themBuoi = (maBuoi, thuTu, cum, tenCum, ngay, nhan) =>
    sqlite.prepare(
      `INSERT INTO le_trong_the_cau_hinh (ma_mua, ten_mua, ma_buoi, thu_tu, ma_su_kien, ten_su_kien, cum, ten_cum, ngay, nhan, gio)
       VALUES ('2026_thu', 'Mùa Thu 2026', ?, ?, 'sk1', 'Sự kiện 1', ?, ?, ?, ?, '09:00')`
    ).run(maBuoi, thuTu, cum, tenCum, ngay, nhan);

  themBuoi('buoi_21_09_sang', 1, 'dai_le', 'Đại Lễ Chuộc Tội', '2026-09-21', 'Sáng');
  themBuoi('buoi_26_09_mai', 2, 'dau_tien', 'Ngày đầu tiên', '2026-09-26', 'Mai');
  themBuoi('buoi_26_09_sang', 3, 'dau_tien', 'Ngày đầu tiên', '2026-09-26', 'Sáng');
  themBuoi('buoi_26_09_chieu', 4, 'dau_tien', 'Ngày đầu tiên', '2026-09-26', 'Chiều');
  themBuoi('buoi_26_09_toi', 5, 'dau_tien', 'Ngày đầu tiên', '2026-09-26', 'Tối');
  themBuoi('buoi_27_09_mai', 6, 'tuan_le', 'Tuần lễ cầu nguyện', '2026-09-27', 'Mai');
}

console.log('--- KIỂM THỬ: Điểm danh Lễ Trọng Thể & Loại bỏ cột 26/9 Mai ---');
taoCSDL();

// 1. getLeTrongThe cho khu vực SĐ: không chứa 26/9 Mai
const resSD = await getLeTrongThe({ db }, 'SĐ', '2026_thu');
assert.equal(resSD.coDuLieu, true, 'Có dữ liệu mùa');
assert.equal(resSD.buoi.length, 5, 'Chỉ còn 5 buổi (đã loại 26/9 Mai trong tổng số 6 buổi ban đầu)');
assert.equal(resSD.tongSoBuoi, 5, 'tongSoBuoi phải bằng 5');
assert.ok(!resSD.buoi.some(b => b.ngay === '2026-09-26' && b.nhan === 'Mai'), 'Buổi 26/9 Mai không được xuất hiện');
assert.ok(resSD.buoi.some(b => b.ngay === '2026-09-26' && b.nhan === 'Sáng'), 'Buổi 26/9 Sáng vẫn còn');
assert.ok(resSD.buoi.some(b => b.ngay === '2026-09-26' && b.nhan === 'Chiều'), 'Buổi 26/9 Chiều vẫn còn');
assert.ok(resSD.buoi.some(b => b.ngay === '2026-09-26' && b.nhan === 'Tối'), 'Buổi 26/9 Tối vẫn còn');
console.log('✓ Khu vực SĐ: Cột 26/9 Mai đã bị loại bỏ thành công');

// 2. getLeTrongThe cho khu vực Đ Uyên: cũng không chứa 26/9 Mai (toàn bộ khu vực)
const resDU = await getLeTrongThe({ db }, 'Đ Uyên', '2026_thu');
assert.equal(resDU.buoi.length, 5, 'Đ Uyên cũng chỉ còn 5 buổi');
assert.ok(!resDU.buoi.some(b => b.ngay === '2026-09-26' && b.nhan === 'Mai'), 'Buổi 26/9 Mai không có ở Đ Uyên');
console.log('✓ Khu vực Đ Uyên: Cột 26/9 Mai cũng bị loại bỏ (áp dụng toàn bộ khu vực)');

// 3. saveLeTrongThe: buổi hợp lệ lưu bình thường
const saveSang = await saveLeTrongThe({ db }, 'SĐ', 'L H Đức', '2026_thu', 'buoi_26_09_sang', '211');
assert.equal(saveSang.success, true);
assert.equal(saveSang.tong, 1);
assert.equal(saveSang.tongSoBuoi, 5);
console.log('✓ Lưu điểm danh cho 26/9 Sáng thành công');

// 4. saveLeTrongThe: buổi 26/9 Mai bị chặn (báo lỗi không hợp lệ)
await assert.rejects(
  async () => {
    await saveLeTrongThe({ db }, 'SĐ', 'L H Đức', '2026_thu', 'buoi_26_09_mai', '211');
  },
  /không có trong lịch mùa/,
  'Chặn lưu điểm danh cho 26/9 Mai'
);
console.log('✓ Chặn lưu điểm danh vào buổi 26/9 Mai thành công');

// 5. Kiểm tra danh sách mùa getLeTrongTheMuaList
const muaList = await getLeTrongTheMuaList({ db });
assert.equal(muaList.danhSach[0].so_buoi, 5, 'Số buổi trong mùa là 5');
console.log('✓ getLeTrongTheMuaList đếm đúng số buổi (5 buổi)');

console.log('=== KẾT QUẢ: TẤT CẢ KIỂM THỬ ĐIỂM DANH LỄ TRỌNG THỂ ĐẠT 100% ===');
