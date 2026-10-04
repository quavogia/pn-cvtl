// =====================================================================
// Kiểm thử OFFLINE cho Kế hoạch Tin Lành tháng (src/handlers/ke-hoach.js):
//     node scripts/kiem-thu-ke-hoach.mjs
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_KHOI_TAO = readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8');
const { getKeHoachThang, saveKeHoachThang, getAllKeHoachThang } = await import(join(goc, 'src/handlers/ke-hoach.js'));

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

console.log('--- KIỂM THỬ: Kế hoạch Tin Lành tháng (ke-hoach.js) ---');
taoCSDL();

// 1. Khi chưa có dữ liệu: getKeHoachThang trả về cấu trúc mặc định rỗng
const macDinh = await getKeHoachThang({ db }, '2026-10', 'K My');
assert.equal(macDinh.thang, '2026-10');
assert.equal(macDinh.khuVuc, 'K My');
assert.equal(macDinh.noiDung, '');
assert.equal(macDinh.nguoiCapNhat, '');
assert.equal(macDinh.capNhatLuc, '');
console.log('✓ getKeHoachThang trả về mặc định an toàn khi chưa có dữ liệu');

// 2. Chặn tháng không hợp lệ hoặc thiếu khu vực
await assert.rejects(
  async () => { await getKeHoachThang({ db }, 'sai-thang', 'K My'); },
  /Tháng không hợp lệ/,
  'Chặn tháng sai'
);
await assert.rejects(
  async () => { await getKeHoachThang({ db }, '2026-10', ''); },
  /Khu vực/,
  'Chặn khu vực rỗng'
);
console.log('✓ Tham số đầu vào được kiểm tra chặt chẽ');

// 3. Phân quyền khi lưu (saveKeHoachThang)
// Tài khoản admin chủ: sửa được mọi khu vực
const adminCtx = { db, nguoiGoi: { email: 'rise.shine1948@gmail.com', la_chu: 1, pham_vi: null } };
const resSave1 = await saveKeHoachThang(adminCtx, '2026-10', 'K My', '1. Thăm viếng 5 thánh đồ yếu đuối\n2. Mở 2 lớp học Kinh Thánh');
assert.equal(resSave1.success, true);
assert.equal(resSave1.thang, '2026-10');
assert.equal(resSave1.khuVuc, 'K My');
assert.ok(resSave1.noiDung.includes('Thăm viếng'));
assert.equal(resSave1.nguoiCapNhat, 'rise.shine1948@gmail.com');
assert.ok(resSave1.capNhatLuc.length > 0);
console.log('✓ Admin lưu kế hoạch tháng thành công');

// Đọc lại kiểm tra
const docLai = await getKeHoachThang({ db }, '2026-10', 'K My');
assert.equal(docLai.noiDung, '1. Thăm viếng 5 thánh đồ yếu đuối\n2. Mở 2 lớp học Kinh Thánh');
assert.equal(docLai.nguoiCapNhat, 'rise.shine1948@gmail.com');
console.log('✓ Đọc lại đúng nội dung vừa lưu');

// Tài khoản khu vực trưởng: chỉ lưu được khu vực trong phạm vi
const kvtMyCtx = { db, nguoiGoi: { email: 'my@example.com', la_chu: 0, pham_vi: 'K My' } };
const resSaveKVT = await saveKeHoachThang(kvtMyCtx, '2026-10', 'K My', 'Kế hoạch bổ sung tuần 2');
assert.equal(resSaveKVT.success, true);
assert.equal(resSaveKVT.noiDung, 'Kế hoạch bổ sung tuần 2');
assert.equal(resSaveKVT.nguoiCapNhat, 'my@example.com');
console.log('✓ Khu vực trưởng lưu kế hoạch của khu vực mình thành công');

// Khu vực trưởng cố sửa khu vực khác -> bị chặn
await assert.rejects(
  async () => { await saveKeHoachThang(kvtMyCtx, '2026-10', 'K Thành', 'Sửa trộm'); },
  /Bạn không có quyền sửa kế hoạch của khu vực "K Thành"/,
  'Chặn khu vực ngoài phạm vi'
);
console.log('✓ Chặn thành công khu vực trưởng sửa khu vực không thuộc phạm vi');

// Tài khoản không có phạm vi nào (thánh đồ thường) -> bị chặn
const thanhDoCtx = { db, nguoiGoi: { email: 'user@example.com', la_chu: 0, pham_vi: '' } };
await assert.rejects(
  async () => { await saveKeHoachThang(thanhDoCtx, '2026-10', 'K My', 'Thử sửa'); },
  /Bạn không có quyền sửa kế hoạch/,
  'Chặn người dùng không có phạm vi'
);
console.log('✓ Chặn thành công tài khoản thường không có quyền');

// 4. getAllKeHoachThang: lấy kế hoạch toàn bộ các khu vực trong tháng
// Thêm kế hoạch cho thêm 1 khu vực nữa
await saveKeHoachThang(adminCtx, '2026-10', 'Đ Uyên', 'Kế hoạch Đ Uyên tháng 10');
const allPlans = await getAllKeHoachThang({ db }, '2026-10');
assert.equal(allPlans.thang, '2026-10');
assert.equal(allPlans.danhSach.length, 2);
assert.equal(allPlans.theoKhuVuc['K My'].noiDung, 'Kế hoạch bổ sung tuần 2');
assert.equal(allPlans.theoKhuVuc['Đ Uyên'].noiDung, 'Kế hoạch Đ Uyên tháng 10');
console.log('✓ getAllKeHoachThang tổng hợp đầy đủ theo từng khu vực');

// 5. Thử tháng khác chưa có kế hoạch nào -> trả danh sách rỗng
const allNov = await getAllKeHoachThang({ db }, '2026-11');
assert.equal(allNov.danhSach.length, 0);
assert.deepEqual(allNov.theoKhuVuc, {});
console.log('✓ getAllKeHoachThang tháng chưa có dữ liệu trả về rỗng an toàn');

console.log('\n=== TẤT CẢ KIỂM THỬ KẾ HOẠCH THÁNG ĐÃ ĐẠT 100% ===\n');
