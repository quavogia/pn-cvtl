// =====================================================================
// Kiểm thử OFFLINE cho Thực hiện kế hoạch theo từng mảng và từng tuần
// (src/handlers/ket-qua.js):
//     node scripts/kiem-thu-ket-qua.mjs
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_KHOI_TAO = readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8');
const { getKetQuaMuc, saveKetQuaMuc, getAllKetQuaMuc } = await import(join(goc, 'src/handlers/ket-qua.js'));
const { cacTuanCuaThang } = await import(join(goc, 'src/lich-tuan.js'));
const { DANH_MUC } = await import(join(goc, 'src/registry.js'));
const { VI_TRI_KHU_VUC } = await import(join(goc, 'src/nhat-ky.js'));

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
  const r = sqlite.prepare('SELECT COUNT(*) AS c FROM ket_qua_muc').get();
  return Number(r?.c || 0);
}

/**
 * Tạm giả lập ngày hiện tại (múi giờ Việt Nam UTC+7) bằng cách bọc Date.now,
 * luôn khôi phục Date.now gốc trong khối finally.
 */
async function voiNgayCoDinh(isoDateVN, fn) {
  const gocDateNow = Date.now;
  const mocMs = Date.parse(isoDateVN + 'T12:00:00+07:00');
  Date.now = () => mocMs;
  try {
    return await fn();
  } finally {
    Date.now = gocDateNow;
  }
}

console.log('--- KIỂM THỬ: Thực hiện kế hoạch theo mảng & tuần (ket-qua.js) ---');

// =====================================================================
// 1. Khi bảng ket_qua_muc chưa tồn tại: hàm đọc trả rỗng hợp lệ, 0 lệnh ghi
// =====================================================================
{
  const sqliteChuaCoBang = new DatabaseSync(':memory:');
  sqliteChuaCoBang.exec(SQL_KHOI_TAO);
  sqliteChuaCoBang.exec('DROP TABLE ket_qua_muc');
  const dbChuaCoBang = bocSqlite(sqliteChuaCoBang);
  const { spy, laySoLanGhi } = taoSpyDB(dbChuaCoBang);

  const r1 = await getKetQuaMuc({ db: spy }, '2026-10', 'K My', 'tp');
  assert.equal(r1.thang, '2026-10');
  assert.equal(r1.khuVuc, 'K My');
  assert.equal(r1.muc, 'tp');
  assert.equal(Array.isArray(r1.tuan), true);
  assert.equal(r1.tuan.length, 5);
  assert.equal(r1.tuan.every((w) => w.daLam === '' && w.chuaLam === ''), true);
  assert.deepEqual(r1.tongKet, { daLam: '', chuaLam: '', nguoiCapNhat: '', capNhatLuc: '' });

  const rAll = await getAllKetQuaMuc({ db: spy }, '2026-10');
  assert.deepEqual(rAll, { thang: '2026-10', danhSach: [], theoKhuVuc: {} });
  assert.equal(laySoLanGhi(), 0, 'Đọc khi chưa có bảng không được phát sinh lệnh ghi');
  console.log('✓ 1. Bảng chưa tồn tại: getKetQuaMuc & getAllKetQuaMuc trả rỗng hợp lệ, 0 lệnh ghi');
}

// =====================================================================
// 2. Danh sách tuần trả về khớp cacTuanCuaThang (cả tháng 5 tuần & tháng 6 tuần)
// =====================================================================
taoCSDL();
{
  // Tháng 2026-10 có 5 tuần
  const ds10 = cacTuanCuaThang('2026-10');
  assert.equal(ds10.length, 5);
  const kq10 = await getKetQuaMuc({ db }, '2026-10', 'K My', 'tp');
  assert.equal(kq10.tuan.length, 5);
  for (let i = 0; i < ds10.length; i++) {
    assert.equal(kq10.tuan[i].tuan, ds10[i].tuan);
    assert.equal(kq10.tuan[i].tuNgay, ds10[i].tuNgay);
    assert.equal(kq10.tuan[i].denNgay, ds10[i].denNgay);
  }

  // Tháng 2026-08 bắt đầu Thứ Bảy và có 31 ngày -> có 6 tuần (Điều kiện 3 - Tin #25)
  const ds08 = cacTuanCuaThang('2026-08');
  assert.equal(ds08.length, 6);
  const kq08 = await getKetQuaMuc({ db }, '2026-08', 'K My', 'tp');
  assert.equal(kq08.tuan.length, 6);
  assert.equal(kq08.tuan[0].tuan, 1);
  assert.equal(kq08.tuan[0].tuNgay, 1);
  assert.equal(kq08.tuan[0].denNgay, 1);
  assert.equal(kq08.tuan[5].tuan, 6);
  assert.equal(kq08.tuan[5].tuNgay, 30);
  assert.equal(kq08.tuan[5].denNgay, 31);
  for (let i = 0; i < ds08.length; i++) {
    assert.equal(kq08.tuan[i].tuan, ds08[i].tuan);
    assert.equal(kq08.tuan[i].tuNgay, ds08[i].tuNgay);
    assert.equal(kq08.tuan[i].denNgay, ds08[i].denNgay);
  }
  console.log('✓ 2. Danh sách tuần khớp cacTuanCuaThang cho cả tháng 5 tuần (2026-10) và 6 tuần (2026-08)');
}

// =====================================================================
// 3. tuanHienTai với ngày cố định (giữa tháng, cuối tháng, và khác tháng)
// =====================================================================
{
  await voiNgayCoDinh('2026-10-15', async () => {
    const cungThangT3 = await getKetQuaMuc({ db }, '2026-10', 'K My', 'tp');
    assert.equal(cungThangT3.tuanHienTai, 3, 'Ngày 15/10/2026 thuộc Tuần 3 (11–17/10) của tháng 10/2026');
  });

  await voiNgayCoDinh('2026-10-18', async () => {
    const cungThang = await getKetQuaMuc({ db }, '2026-10', 'K My', 'tp');
    assert.equal(cungThang.tuanHienTai, 4, 'Ngày 18/10/2026 (Chủ Nhật) thuộc Tuần 4 (18–24/10) của tháng 10/2026');

    const thangTruoc = await getKetQuaMuc({ db }, '2026-09', 'K My', 'tp');
    assert.equal(thangTruoc.tuanHienTai, 0, 'Khác tháng hiện tại (tháng trước) phải trả tuanHienTai = 0');

    const thangSau = await getKetQuaMuc({ db }, '2026-11', 'K My', 'tp');
    assert.equal(thangSau.tuanHienTai, 0, 'Khác tháng hiện tại (tháng sau) phải trả tuanHienTai = 0');
  });

  // Ca ngày cuối tháng 2026-10-31 -> Tuần 5 (Điều kiện 3 - Tin #25)
  await voiNgayCoDinh('2026-10-31', async () => {
    const cuoiThang = await getKetQuaMuc({ db }, '2026-10', 'K My', 'tp');
    assert.equal(cuoiThang.tuanHienTai, 5, 'Ngày 31/10/2026 (cuối tháng) thuộc Tuần 5 của tháng 10/2026');
  });
  console.log('✓ 3. tuanHienTai tính chính xác ở ngày giữa tháng, cuối tháng và bằng 0 khi khác tháng');
}

// =====================================================================
// 4. Lưu dữ liệu mẫu và kiểm chứng hàm đọc KHÔNG phát sinh lệnh ghi (có đối chứng dương)
// =====================================================================
const adminCtx = { db, nguoiGoi: { email: 'rise.shine1948@gmail.com', la_chu: 1, pham_vi: null } };
{
  const { spy, laySoLanGhi, datLai } = taoSpyDB(db);

  // Đối chứng dương: gọi hàm ghi qua spy phải tăng bộ đếm
  const resLuu1 = await saveKetQuaMuc(
    { db: spy, nguoiGoi: adminCtx.nguoiGoi },
    '2026-10', 'K My', 'tp', 1,
    'Mẫu đã làm tuần 1 TP', 'Mẫu chưa làm tuần 1 TP'
  );
  assert.equal(resLuu1.success, true);
  assert.equal(resLuu1.tuan, 1);
  assert.equal(resLuu1.daLam, 'Mẫu đã làm tuần 1 TP');
  assert.equal(resLuu1.chuaLam, 'Mẫu chưa làm tuần 1 TP');
  assert.equal(resLuu1.nguoiCapNhat, 'rise.shine1948@gmail.com');
  assert.ok(resLuu1.capNhatLuc.length > 0);
  assert.ok(laySoLanGhi() > 0, 'Đối chứng dương: spy phải bắt được lệnh ghi thật của saveKetQuaMuc');

  // Đặt lại bộ đếm về 0 rồi gọi 2 hàm đọc trên bảng ĐÃ CÓ dữ liệu
  datLai();
  assert.equal(laySoLanGhi(), 0);

  const doc1 = await getKetQuaMuc({ db: spy }, '2026-10', 'K My', 'tp');
  assert.equal(doc1.tuan[0].daLam, 'Mẫu đã làm tuần 1 TP');
  assert.equal(doc1.tuan[0].chuaLam, 'Mẫu chưa làm tuần 1 TP');
  assert.equal(doc1.tuan[0].nguoiCapNhat, 'rise.shine1948@gmail.com');
  assert.equal(laySoLanGhi(), 0, 'getKetQuaMuc tuyệt đối không phát sinh lệnh ghi');

  const docAll = await getAllKetQuaMuc({ db: spy }, '2026-10');
  assert.equal(docAll.danhSach.length, 1);
  assert.equal(docAll.theoKhuVuc['K My'].tp[1].daLam, 'Mẫu đã làm tuần 1 TP');
  assert.equal(laySoLanGhi(), 0, 'getAllKetQuaMuc tuyệt đối không phát sinh lệnh ghi');
  console.log('✓ 4. Đối chứng dương & khẳng định getKetQuaMuc / getAllKetQuaMuc không phát sinh lệnh ghi');
}

// =====================================================================
// 5. Chặn tham số sai (tháng, khu vực, mảng, tuần) và khẳng định số hàng không đổi
// =====================================================================
{
  const soDongTruoc = demSoDong();
  assert.ok(soDongTruoc > 0, 'Bảng phải đang có dữ liệu thật trước khi thử các ca từ chối');

  // Tháng sai định dạng hoặc tháng 13 / tháng 00
  for (const thangSai of ['', 'sai-thang', '2026/10', '2026-13', '2026-00', '2026-99']) {
    await assert.rejects(
      async () => { await getKetQuaMuc({ db }, thangSai, 'K My', 'tp'); },
      /Tháng không hợp lệ/
    );
    await assert.rejects(
      async () => { await saveKetQuaMuc(adminCtx, thangSai, 'K My', 'tp', 1, 'A', 'B'); },
      /Tháng không hợp lệ/
    );
    await assert.rejects(
      async () => { await getAllKetQuaMuc({ db }, thangSai); },
      /Tháng không hợp lệ/
    );
  }

  // Khu vực rỗng
  for (const kvSai of ['', '   ']) {
    await assert.rejects(
      async () => { await getKetQuaMuc({ db }, '2026-10', kvSai, 'tp'); },
      /Khu vực/
    );
    await assert.rejects(
      async () => { await saveKetQuaMuc(adminCtx, '2026-10', kvSai, 'tp', 1, 'A', 'B'); },
      /Khu vực/
    );
  }

  // Mảng rỗng, 'chung', mảng lạ
  await assert.rejects(
    async () => { await getKetQuaMuc({ db }, '2026-10', 'K My', ''); },
    /Thiếu mảng công việc/
  );
  for (const mucSai of ['chung', 'xyz', 'baocao', 'muctieu']) {
    await assert.rejects(
      async () => { await getKetQuaMuc({ db }, '2026-10', 'K My', mucSai); },
      /Mảng công việc không hợp lệ/
    );
    await assert.rejects(
      async () => { await saveKetQuaMuc(adminCtx, '2026-10', 'K My', mucSai, 1, 'A', 'B'); },
      /Mảng công việc không hợp lệ/
    );
  }

  // Tuần âm, tuần 7, tuần 99, không phải số nguyên, hoặc tuần 6 trong tháng chỉ có 5 tuần (2026-10)
  for (const tuanSai of [-1, -5, 6, 7, 99, 'abc', '', '   ', 1.5, true, false, null, undefined, {}, []]) {
    await assert.rejects(
      async () => { await saveKetQuaMuc(adminCtx, '2026-10', 'K My', 'tp', tuanSai, 'A', 'B'); },
      /Tuần không hợp lệ/
    );
  }

  assert.equal(demSoDong(), soDongTruoc, 'Số hàng trong bảng không được đổi sau mọi ca tham số bị từ chối');
  console.log('✓ 5. Chặn chặt mọi tham số sai (tháng 13, mảng chung/lạ, tuần âm/6/7/99/chữ), số hàng không đổi');
}

// =====================================================================
// 6. Lưu tuần 6 ở tháng có 6 tuần (2026-08) thành công (Điều kiện 3 - Tin #25)
// =====================================================================
{
  const soDongTruoc = demSoDong();
  const resT6 = await saveKetQuaMuc(
    adminCtx, '2026-08', 'K My', 'tp', 6,
    'Mẫu đã làm tuần 6 tháng 8', 'Mẫu chưa làm tuần 6 tháng 8'
  );
  assert.equal(resT6.success, true);
  assert.equal(resT6.tuan, 6);
  assert.equal(demSoDong(), soDongTruoc + 1);

  const doc08 = await getKetQuaMuc({ db }, '2026-08', 'K My', 'tp');
  assert.equal(doc08.tuan[5].tuan, 6);
  assert.equal(doc08.tuan[5].daLam, 'Mẫu đã làm tuần 6 tháng 8');
  assert.equal(doc08.tuan[5].chuaLam, 'Mẫu chưa làm tuần 6 tháng 8');
  console.log('✓ 6. Lưu và đọc tuần 6 ở tháng 6 tuần (2026-08) thành công');
}

// =====================================================================
// 7. Lưu riêng từng tuần (1, 2) và Tổng kết tháng (0) của cùng mảng: không đè nhau
// =====================================================================
{
  await saveKetQuaMuc(adminCtx, '2026-10', 'K My', 'tp', 2, 'Đã làm tuần 2 TP', 'Chưa làm tuần 2 TP');
  await saveKetQuaMuc(adminCtx, '2026-10', 'K My', 'tp', 0, 'Tổng kết tháng TP đã làm', 'Tổng kết tháng TP chưa làm');

  const docTP = await getKetQuaMuc({ db }, '2026-10', 'K My', 'tp');
  assert.equal(docTP.tuan[0].daLam, 'Mẫu đã làm tuần 1 TP');
  assert.equal(docTP.tuan[0].chuaLam, 'Mẫu chưa làm tuần 1 TP');
  assert.equal(docTP.tuan[1].daLam, 'Đã làm tuần 2 TP');
  assert.equal(docTP.tuan[1].chuaLam, 'Chưa làm tuần 2 TP');
  assert.equal(docTP.tuan[2].daLam, '');
  assert.equal(docTP.tongKet.daLam, 'Tổng kết tháng TP đã làm');
  assert.equal(docTP.tongKet.chuaLam, 'Tổng kết tháng TP chưa làm');
  console.log('✓ 7. Lưu tuần 1, tuần 2 và Tổng kết tháng (tuan=0) của cùng mảng giữ riêng, không đè nhau');
}

// =====================================================================
// 8. Lưu cùng tuần của 5 mảng khác nhau và khu vực khác nhau: không đè nhau
// =====================================================================
{
  await saveKetQuaMuc(adminCtx, '2026-10', 'K My', 'trudo', 1, 'Đã làm Trudo T1', 'Chưa làm Trudo T1');
  await saveKetQuaMuc(adminCtx, '2026-10', 'K My', 'edu', 1, 'Đã làm Edu T1', 'Chưa làm Edu T1');
  await saveKetQuaMuc(adminCtx, '2026-10', 'K My', 'daotao', 1, 'Đã làm Đào tạo T1', 'Chưa làm Đào tạo T1');
  await saveKetQuaMuc(adminCtx, '2026-10', 'K My', 'lehoi', 1, 'Đã làm Lễ hội T1', 'Chưa làm Lễ hội T1');
  await saveKetQuaMuc(adminCtx, '2026-10', 'K Long', 'tp', 1, 'Đã làm K Long TP T1', 'Chưa làm K Long TP T1');

  const docTrudo = await getKetQuaMuc({ db }, '2026-10', 'K My', 'trudo');
  const docEdu = await getKetQuaMuc({ db }, '2026-10', 'K My', 'edu');
  const docDaoTao = await getKetQuaMuc({ db }, '2026-10', 'K My', 'daotao');
  const docLeHoi = await getKetQuaMuc({ db }, '2026-10', 'K My', 'lehoi');
  const docKLong = await getKetQuaMuc({ db }, '2026-10', 'K Long', 'tp');

  assert.equal(docTrudo.tuan[0].daLam, 'Đã làm Trudo T1');
  assert.equal(docEdu.tuan[0].daLam, 'Đã làm Edu T1');
  assert.equal(docDaoTao.tuan[0].daLam, 'Đã làm Đào tạo T1');
  assert.equal(docLeHoi.tuan[0].daLam, 'Đã làm Lễ hội T1');
  assert.equal(docKLong.tuan[0].daLam, 'Đã làm K Long TP T1');
  console.log('✓ 8. Lưu 5 mảng khác nhau và các khu vực khác nhau hoàn toàn độc lập');
}

// =====================================================================
// 9. Ghi đè cùng (thang, khu_vuc, muc, tuan): cập nhật đúng, không sinh dòng trùng
// =====================================================================
{
  const soDongTruoc = demSoDong();
  const kvtMyCtx = { db, nguoiGoi: { email: 'kvt.my@example.com', la_chu: 0, pham_vi: 'K My' } };

  const resDe = await saveKetQuaMuc(
    kvtMyCtx, '2026-10', 'K My', 'tp', 1,
    'Mẫu đã làm tuần 1 TP (đã cập nhật)', 'Mẫu chưa làm tuần 1 TP (đã cập nhật)'
  );
  assert.equal(resDe.success, true);
  assert.equal(resDe.nguoiCapNhat, 'kvt.my@example.com');
  assert.equal(demSoDong(), soDongTruoc, 'Ghi đè cùng khóa chính không được tăng số dòng');

  const docLai = await getKetQuaMuc({ db }, '2026-10', 'K My', 'tp');
  assert.equal(docLai.tuan[0].daLam, 'Mẫu đã làm tuần 1 TP (đã cập nhật)');
  assert.equal(docLai.tuan[0].chuaLam, 'Mẫu chưa làm tuần 1 TP (đã cập nhật)');
  assert.equal(docLai.tuan[0].nguoiCapNhat, 'kvt.my@example.com');
  console.log('✓ 9. Ghi đè cùng (thang, khu_vuc, muc, tuan) cập nhật đúng, không sinh dòng trùng');
}

// =====================================================================
// 10. Phân quyền ghi: Chủ/Admin, KVT đúng khu vực, KVT khác khu vực, chưa gán quyền
// =====================================================================
{
  const kvtMyCtx = { db, nguoiGoi: { email: 'kvt.my@example.com', la_chu: 0, pham_vi: 'K My' } };
  const dvtCtx = { db, nguoiGoi: { email: 'dvt@example.com', la_chu: 0, pham_vi: 'Đ Uyên,K Thành,TT Châu' } };
  const thuongCtx = { db, nguoiGoi: { email: 'thanhdo@example.com', la_chu: 0, pham_vi: '' } };

  // Địa vực trưởng sửa được khu vực trong phạm vi
  const rDvt = await saveKetQuaMuc(dvtCtx, '2026-10', 'K Thành', 'edu', 2, 'K Thành Edu T2', 'Khó khăn mẫu');
  assert.equal(rDvt.success, true);

  const soDongTruocKhiChan = demSoDong();

  // KVT K My sửa K Long -> bị từ chối
  await assert.rejects(
    async () => { await saveKetQuaMuc(kvtMyCtx, '2026-10', 'K Long', 'tp', 1, 'Sửa trái phép', 'X'); },
    /không có quyền chỉnh sửa/
  );
  assert.equal(demSoDong(), soDongTruocKhiChan, 'KVT sửa khu vực khác bị chặn, số dòng không đổi');

  // Địa vực trưởng sửa K My (ngoài phạm vi) -> bị từ chối
  await assert.rejects(
    async () => { await saveKetQuaMuc(dvtCtx, '2026-10', 'K My', 'tp', 1, 'Sửa trái phép', 'X'); },
    /không có quyền chỉnh sửa/
  );
  assert.equal(demSoDong(), soDongTruocKhiChan, 'ĐVT sửa ngoài phạm vi bị chặn, số dòng không đổi');

  // Người chưa phân quyền -> bị từ chối
  await assert.rejects(
    async () => { await saveKetQuaMuc(thuongCtx, '2026-10', 'K My', 'tp', 1, 'Sửa trái phép', 'X'); },
    /không có quyền chỉnh sửa/
  );
  assert.equal(demSoDong(), soDongTruocKhiChan, 'Người chưa phân quyền bị chặn, số dòng không đổi');

  // Không có nguoiGoi -> bị từ chối
  await assert.rejects(
    async () => { await saveKetQuaMuc({ db, nguoiGoi: null }, '2026-10', 'K My', 'tp', 1, 'X', 'Y'); },
    /không có quyền chỉnh sửa/
  );
  assert.equal(demSoDong(), soDongTruocKhiChan, 'Thiếu nguoiGoi bị chặn, số dòng không đổi');

  // Dữ liệu gốc của K Long vẫn nguyên vẹn
  const docKLong = await getKetQuaMuc({ db }, '2026-10', 'K Long', 'tp');
  assert.equal(docKLong.tuan[0].daLam, 'Đã làm K Long TP T1');
  console.log('✓ 10. Phân quyền ghi chặt chẽ (Chủ, KVT, ĐVT, người thường), số dòng không đổi khi bị chặn');
}

// =====================================================================
// 11. getAllKetQuaMuc gom đúng cấu trúc theoKhuVuc[khuVuc][muc][tuan]
// =====================================================================
{
  const all10 = await getAllKetQuaMuc({ db }, '2026-10');
  assert.equal(all10.thang, '2026-10');
  assert.equal(all10.danhSach.length, 9);
  assert.equal(all10.theoKhuVuc['K My'].tp[1].daLam, 'Mẫu đã làm tuần 1 TP (đã cập nhật)');
  assert.equal(all10.theoKhuVuc['K My'].tp[2].daLam, 'Đã làm tuần 2 TP');
  assert.equal(all10.theoKhuVuc['K My'].tp[0].daLam, 'Tổng kết tháng TP đã làm');
  assert.equal(all10.theoKhuVuc['K My'].trudo[1].daLam, 'Đã làm Trudo T1');
  assert.equal(all10.theoKhuVuc['K Long'].tp[1].daLam, 'Đã làm K Long TP T1');
  assert.equal(all10.theoKhuVuc['K Thành'].edu[2].daLam, 'K Thành Edu T2');

  const allRong = await getAllKetQuaMuc({ db }, '2026-12');
  assert.deepEqual(allRong, { thang: '2026-12', danhSach: [], theoKhuVuc: {} });
  console.log('✓ 11. getAllKetQuaMuc gom đúng theoKhuVuc[khuVuc][muc][tuan]');
}

// =====================================================================
// 12. Đăng ký trong registry.js (chuThoi, doc) và VI_TRI_KHU_VUC trong nhat-ky.js
// =====================================================================
{
  assert.ok(DANH_MUC.getKetQuaMuc, 'Phải có getKetQuaMuc trong DANH_MUC');
  assert.equal(DANH_MUC.getKetQuaMuc.doc, true, 'getKetQuaMuc là hàm ĐỌC');
  assert.equal(!!DANH_MUC.getKetQuaMuc.chuThoi, false, 'getKetQuaMuc không đặt chuThoi (KVT phải đọc được)');

  assert.ok(DANH_MUC.saveKetQuaMuc, 'Phải có saveKetQuaMuc trong DANH_MUC');
  assert.equal(DANH_MUC.saveKetQuaMuc.doc, false, 'saveKetQuaMuc là hàm GHI');
  assert.equal(!!DANH_MUC.saveKetQuaMuc.chuThoi, false, 'saveKetQuaMuc không đặt chuThoi (KVT phải lưu được)');

  assert.ok(DANH_MUC.getAllKetQuaMuc, 'Phải có getAllKetQuaMuc trong DANH_MUC');
  assert.equal(DANH_MUC.getAllKetQuaMuc.doc, true, 'getAllKetQuaMuc là hàm ĐỌC');
  assert.equal(DANH_MUC.getAllKetQuaMuc.chuThoi, true, 'getAllKetQuaMuc CHỈ dành cho Chủ/Admin (chuThoi: true)');

  assert.equal(VI_TRI_KHU_VUC.getKetQuaMuc, 1, 'getKetQuaMuc có khuVuc ở vị trí 1');
  assert.equal(VI_TRI_KHU_VUC.saveKetQuaMuc, 1, 'saveKetQuaMuc có khuVuc ở vị trí 1');
  assert.equal(VI_TRI_KHU_VUC.getAllKetQuaMuc, undefined, 'getAllKetQuaMuc không có tham số khuVuc');
  console.log('✓ 12. Đăng ký registry.js (doc, chuThoi) và VI_TRI_KHU_VUC trong nhat-ky.js chính xác');
}

console.log('=== TẤT CẢ KIỂM THỬ THỰC HIỆN KẾ HOẠCH (ket-qua.js) ĐẠT 100% ===');
