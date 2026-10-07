// =====================================================================
// Kiểm thử OFFLINE cho Kế hoạch Tin Lành theo từng mảng (src/handlers/ke-hoach.js):
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

function taoSpyDB(dbGoc) {
  let soLanGhi = 0;
  const cacLenhGhi = [];
  return {
    spy: {
      ...dbGoc,
      async run(sql, p = []) {
        soLanGhi++;
        cacLenhGhi.push({ type: 'run', sql: sql.trim().replace(/\s+/g, ' '), params: p });
        return dbGoc.run(sql, p);
      },
      async batch(ds) {
        soLanGhi += (Array.isArray(ds) ? ds.length : 1);
        cacLenhGhi.push({ type: 'batch', ds });
        return dbGoc.batch(ds);
      },
    },
    laySoLanGhi: () => soLanGhi,
    layCacLenhGhi: () => cacLenhGhi,
    datLai: () => { soLanGhi = 0; cacLenhGhi.length = 0; },
  };
}

function taoCSDL() {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);
  db = bocSqlite(sqlite);
}

function demSoDong() {
  const r = sqlite.prepare('SELECT COUNT(*) AS c FROM ke_hoach_muc').get();
  return Number(r?.c || 0);
}

console.log('--- KIỂM THỬ: Kế hoạch Tin Lành theo từng mảng (ke-hoach.js) ---');
taoCSDL();

// 1. Khi chưa có dữ liệu: getKeHoachThang trả về cấu trúc mặc định rỗng an toàn
const macDinh = await getKeHoachThang({ db }, '2026-10', 'K My', 'tp');
assert.equal(macDinh.thang, '2026-10');
assert.equal(macDinh.khuVuc, 'K My');
assert.equal(macDinh.muc, 'tp');
assert.equal(macDinh.noiDung, '');
assert.equal(macDinh.canHoTro, '');
assert.equal(macDinh.nguoiCapNhat, '');
assert.equal(macDinh.capNhatLuc, '');
console.log('✓ getKeHoachThang trả về mặc định an toàn khi chưa có dữ liệu');

// 2. Chặn tham số không hợp lệ và khẳng định số dòng không đổi
const soDongBanDau = demSoDong();
await assert.rejects(
  async () => { await getKeHoachThang({ db }, 'sai-thang', 'K My', 'tp'); },
  /Tháng không hợp lệ/,
  'Chặn tháng sai'
);
await assert.rejects(
  async () => { await getKeHoachThang({ db }, '2026-10', '', 'tp'); },
  /Khu vực/,
  'Chặn khu vực rỗng'
);
await assert.rejects(
  async () => { await getKeHoachThang({ db }, '2026-10', 'K My', ''); },
  /Thiếu mảng kế hoạch/,
  'Chặn thiếu mảng kế hoạch'
);
await assert.rejects(
  async () => { await getKeHoachThang({ db }, '2026-10', 'K My', 'chung'); },
  /Mảng kế hoạch không hợp lệ/,
  'Chặn mảng "chung"'
);
await assert.rejects(
  async () => { await getKeHoachThang({ db }, '2026-10', 'K My', 'xyz'); },
  /Mảng kế hoạch không hợp lệ/,
  'Chặn mảng lạ'
);
assert.equal(demSoDong(), soDongBanDau, 'Số dòng trong bảng không đổi sau các lần gọi đọc lỗi');
console.log('✓ Tham số đầu vào được kiểm tra chặt chẽ, số dòng không đổi');

// 3. Lưu và đọc độc lập giữa các mảng của cùng một khu vực (tp và trudo)
const adminCtx = { db, nguoiGoi: { email: 'rise.shine1948@gmail.com', la_chu: 1, pham_vi: null } };

// Lưu mảng tp
const resSaveTP = await saveKeHoachThang(adminCtx, '2026-10', 'K My', 'tp', 'Nội dung mẫu TP A1', 'Cần hỗ trợ âm thanh');
assert.equal(resSaveTP.success, true);
assert.equal(resSaveTP.thang, '2026-10');
assert.equal(resSaveTP.khuVuc, 'K My');
assert.equal(resSaveTP.muc, 'tp');
assert.equal(resSaveTP.noiDung, 'Nội dung mẫu TP A1');
assert.equal(resSaveTP.canHoTro, 'Cần hỗ trợ âm thanh');
assert.equal(resSaveTP.nguoiCapNhat, 'rise.shine1948@gmail.com');
assert.ok(resSaveTP.capNhatLuc.length > 0);

// Lưu mảng trudo cho cùng khu vực và tháng
const resSaveTD = await saveKeHoachThang(adminCtx, '2026-10', 'K My', 'trudo', 'Nội dung mẫu Trudo B2', 'Cần tài liệu học');
assert.equal(resSaveTD.success, true);
assert.equal(resSaveTD.muc, 'trudo');

// Kiểm tra tính độc lập: đọc lại tp không bị trudo đè lên
const docTP = await getKeHoachThang({ db }, '2026-10', 'K My', 'tp');
assert.equal(docTP.noiDung, 'Nội dung mẫu TP A1');
assert.equal(docTP.canHoTro, 'Cần hỗ trợ âm thanh');

const docTD = await getKeHoachThang({ db }, '2026-10', 'K My', 'trudo');
assert.equal(docTD.noiDung, 'Nội dung mẫu Trudo B2');
assert.equal(docTD.canHoTro, 'Cần tài liệu học');
console.log('✓ Lưu và đọc độc lập giữa các mảng của cùng một khu vực');

// 4. Kiểm tra độc lập giữa cột noi_dung và can_ho_tro
await saveKeHoachThang(adminCtx, '2026-10', 'K My', 'tp', 'Nội dung mẫu TP cập nhật', '');
const docTP2 = await getKeHoachThang({ db }, '2026-10', 'K My', 'tp');
assert.equal(docTP2.noiDung, 'Nội dung mẫu TP cập nhật');
assert.equal(docTP2.canHoTro, '');
console.log('✓ Cột noi_dung và can_ho_tro hoạt động độc lập và cập nhật chính xác');

// 5. Phân quyền khi lưu (saveKeHoachThang)
// Tài khoản khu vực trưởng: chỉ lưu được khu vực trong phạm vi
const kvtMyCtx = { db, nguoiGoi: { email: 'my@example.com', la_chu: 0, pham_vi: 'K My' } };
const resSaveKVT = await saveKeHoachThang(kvtMyCtx, '2026-10', 'K My', 'edu', 'Kế hoạch học tập C3', '');
assert.equal(resSaveKVT.success, true);
assert.equal(resSaveKVT.nguoiCapNhat, 'my@example.com');
console.log('✓ Khu vực trưởng lưu kế hoạch của khu vực mình thành công');

// Khu vực trưởng cố sửa khu vực khác -> bị chặn VÀ số dòng không đổi
const soDongTruocChan = demSoDong();
await assert.rejects(
  async () => { await saveKeHoachThang(kvtMyCtx, '2026-10', 'K Thành', 'tp', 'Sửa trộm', ''); },
  /Bạn không có quyền sửa kế hoạch của khu vực "K Thành"/,
  'Chặn khu vực ngoài phạm vi'
);
assert.equal(demSoDong(), soDongTruocChan, 'Số dòng không đổi khi KVT sửa khu vực ngoài phạm vi');

// Tài khoản không có phạm vi nào (thánh đồ thường) -> bị chặn VÀ số dòng không đổi
const thanhDoCtx = { db, nguoiGoi: { email: 'user@example.com', la_chu: 0, pham_vi: '' } };
await assert.rejects(
  async () => { await saveKeHoachThang(thanhDoCtx, '2026-10', 'K My', 'tp', 'Thử sửa', ''); },
  /Bạn không có quyền sửa kế hoạch/,
  'Chặn người dùng không có phạm vi'
);
assert.equal(demSoDong(), soDongTruocChan, 'Số dòng không đổi khi người dùng thường cố sửa');
console.log('✓ Chặn thành công các hành vi ghi trái phép, số dòng không đổi');

// 6. getAllKeHoachThang: lấy kế hoạch toàn bộ các khu vực và mảng trong tháng
await saveKeHoachThang(adminCtx, '2026-10', 'Đ Uyên', 'daotao', 'Kế hoạch đào tạo Đ Uyên D4', 'Cần hỗ trợ giáo trình');
const allPlans = await getAllKeHoachThang({ db }, '2026-10');
assert.equal(allPlans.thang, '2026-10');
assert.equal(allPlans.danhSach.length, 4);
assert.ok(allPlans.theoKhuVuc['K My']['tp']);
assert.equal(allPlans.theoKhuVuc['K My']['tp'].noiDung, 'Nội dung mẫu TP cập nhật');
assert.ok(allPlans.theoKhuVuc['K My']['trudo']);
assert.equal(allPlans.theoKhuVuc['K My']['trudo'].noiDung, 'Nội dung mẫu Trudo B2');
assert.ok(allPlans.theoKhuVuc['Đ Uyên']['daotao']);
assert.equal(allPlans.theoKhuVuc['Đ Uyên']['daotao'].canHoTro, 'Cần hỗ trợ giáo trình');
console.log('✓ getAllKeHoachThang tổng hợp cấu trúc theoKhuVuc[khuVuc][muc] đầy đủ');

// Thử tháng khác chưa có kế hoạch nào -> trả danh sách rỗng
const allNov = await getAllKeHoachThang({ db }, '2026-11');
assert.equal(allNov.danhSach.length, 0);
assert.deepEqual(allNov.theoKhuVuc, {});
console.log('✓ getAllKeHoachThang tháng chưa có dữ liệu trả về rỗng an toàn');

// 7. Kiểm tra tính thuần đọc bằng spy bọc cả run và batch
const spyObj = taoSpyDB(db);

// 7.1. Đối chứng dương: hàm ghi saveKeHoachThang phải phát sinh lệnh ghi > 0
const resSpySave = await saveKeHoachThang({ db: spyObj.spy, nguoiGoi: adminCtx.nguoiGoi }, '2026-10', 'K My', 'lehoi', 'KH Lễ hội E5', '');
assert.equal(resSpySave.success, true);
assert.ok(spyObj.laySoLanGhi() > 0, `Spy bắt được lệnh ghi khi gọi saveKeHoachThang (thực tế: ${spyObj.laySoLanGhi()} lệnh)`);
console.log(`✓ Đối chứng dương: Spy bắt được ${spyObj.laySoLanGhi()} lệnh ghi khi gọi saveKeHoachThang`);

// 7.2. Đối chứng âm: getKeHoachThang phát sinh 0 lệnh ghi và trả về dữ liệu thật
spyObj.datLai();
const docSpySingle = await getKeHoachThang({ db: spyObj.spy }, '2026-10', 'K My', 'lehoi');
assert.equal(docSpySingle.noiDung, 'KH Lễ hội E5', 'Dữ liệu trả về đúng nội dung thật');
assert.equal(spyObj.laySoLanGhi(), 0, 'getKeHoachThang không được phát sinh lệnh ghi');

// 7.3. Đối chứng âm: getAllKeHoachThang phát sinh 0 lệnh ghi và trả về dữ liệu thật
spyObj.datLai();
const docSpyAll = await getAllKeHoachThang({ db: spyObj.spy }, '2026-10');
assert.ok(docSpyAll.danhSach.length >= 5, 'Dữ liệu trả về danh sách thật');
assert.equal(spyObj.laySoLanGhi(), 0, 'getAllKeHoachThang không được phát sinh lệnh ghi');
console.log('✓ getKeHoachThang và getAllKeHoachThang là hàm thuần đọc (0 lệnh run, 0 lệnh batch)');

// 8. Khả năng chịu lỗi khi bảng ke_hoach_muc chưa tồn tại (Condition 4)
sqlite.exec('DROP TABLE IF EXISTS ke_hoach_muc');

const spyNoTable = taoSpyDB(db);
const docNoTable = await getKeHoachThang({ db: spyNoTable.spy }, '2026-10', 'K My', 'tp');
assert.equal(docNoTable.noiDung, '', 'Bảng chưa có -> trả về cấu trúc rỗng');
assert.equal(docNoTable.canHoTro, '', 'Bảng chưa có -> canHoTro rỗng');
assert.equal(spyNoTable.laySoLanGhi(), 0, 'Không phát sinh lệnh ghi khi bảng chưa tồn tại');

const docAllNoTable = await getAllKeHoachThang({ db: spyNoTable.spy }, '2026-10');
assert.equal(docAllNoTable.danhSach.length, 0, 'Bảng chưa có -> danhSach rỗng');
assert.deepEqual(docAllNoTable.theoKhuVuc, {}, 'Bảng chưa có -> theoKhuVuc rỗng');
assert.equal(spyNoTable.laySoLanGhi(), 0, 'getAllKeHoachThang không phát sinh lệnh ghi khi bảng chưa tồn tại');
console.log('✓ Chịu lỗi an toàn khi bảng ke_hoach_muc chưa tồn tại (0 lệnh ghi, trả rỗng an toàn)');

console.log('\n=== TẤT CẢ KIỂM THỬ KẾ HOẠCH THEO MẢNG ĐÃ ĐẠT 100% ===\n');
