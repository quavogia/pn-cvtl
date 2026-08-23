// =====================================================================
// Kiểm thử OFFLINE cho src/handlers/cong-viec.js — "Điểm danh công việc":
//     node scripts/kiem-thu-cong-viec.mjs
//
// Bảng này nằm TRONG tab con "Trudo" của từng Khu vực, chép đúng sheet
// "CVTL PN" của anh Rise: mỗi người 3 dòng Sáng/Chiều/Tối, 6 Tuần × 7 ngày
// hiện cùng lúc, danh sách người DÙNG CHUNG bảng Điểm danh của khu vực.
//
// Trọng tâm kiểm thử — đúng những chỗ dễ sai nhất:
//   1. Danh sách người lấy ĐÚNG từ `diem_danh_roster` của khu vực đang xem,
//      ĐÚNG thứ tự đang hiển thị ở bảng Điểm danh (thu_tu, id).
//   2. Khu vực này KHÔNG thấy dữ liệu của khu vực kia.
//   3. Mỗi người LUÔN có đủ 3 buổi, kể cả chưa nhập ô nào.
//   4. Ô của 6 tuần nằm đúng khoá "<tuần>-<ngày>", tuần này không lẫn tuần kia.
//   5. "Tổng" mỗi dòng = đếm ô của BUỔI đó trong CẢ THÁNG; tổng người = cộng
//      3 buổi — đúng như sheet thật (đã đối chiếu: NT Ngân 4/4/6 -> 14).
//   6. Tháng khác không cộng lẫn vào.
//   7. Gõ rỗng = xoá; gõ đè không sinh dòng trùng; ô nhận cả CHỮ.
//   8. Chặn tháng/tuần/buổi/ngày không hợp lệ ngay tại máy chủ.
//   9. Xoá người khỏi bảng Điểm danh thì dòng cũ KHÔNG mất (chỉ tạm ẩn) —
//      cố ý như vậy để không mất số liệu khi lỡ tay.
//  10. Chuyển người sang khu vực khác thì số liệu ĐI THEO (cv_cong_viec đã
//      nằm trong BANG_THEO_NGUOI của khu-vuc.js).
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_KHOI_TAO = readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8');
const { DANH_MUC } = await import(join(goc, 'src/registry.js'));

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

// Dựng sẵn 2 khu vực có người trong bảng Điểm danh, giống thật.
function taoCSDL() {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);
  db = bocSqlite(sqlite);
  for (const [i, kv] of ['Đ Uyên', 'K Thành', 'TT Châu'].entries())
    sqlite.prepare("INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('khu_vuc',?,?)").run(kv, i + 1);
  const them = (kv, ten, thuTu) =>
    sqlite.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, thu_tu) VALUES (?,?,?)').run(kv, ten, thuTu);
  them('Đ Uyên', 'Đ T Ngọc Uyên', 1);
  them('Đ Uyên', 'N Thị Ngân', 2);
  them('Đ Uyên', 'N Thị Hiệu', 3);
  them('K Thành', 'P Thị Thành', 1);
  them('K Thành', 'T Thị Thanh Nguyên', 2);
}

let dat = 0, hong = 0;
const NGUOI = { email: 'ai_do@gmail.com', ten: 'Ai Đó', laChu: false };
const CHU = { email: 'chu@gmail.com', ten: 'Chủ', laChu: true };

async function goi(fn, args = [], nguoiGoi = NGUOI) {
  const muc = DANH_MUC[fn];
  if (!muc) return { error: 'Không hỗ trợ hàm: ' + fn };
  try {
    return { result: await muc.fn({ db, env: {}, ctx: {}, nguoiGoi }, ...args) };
  } catch (e) {
    return { error: e.message };
  }
}
function kiem(ten, dieuKien, chiTiet = '') {
  if (dieuKien) { dat++; console.log('  ✓', ten); }
  else { hong++; console.log('  ✗', ten, chiTiet); }
}
const luu = (kv, ten, thang, tuan, buoi, ngay, v) =>
  goi('saveCVCongViec', [kv, ten, thang, tuan, buoi, ngay, v]);

console.log('\n=== KIỂM THỬ ĐIỂM DANH CÔNG VIỆC (offline) ===\n');

// =====================================================================
console.log('1) Đăng ký hàm trong danh mục');
{
  kiem('có hàm getCVCongViec', !!DANH_MUC.getCVCongViec);
  kiem('có hàm saveCVCongViec', !!DANH_MUC.saveCVCongViec);
  kiem('getCVCongViec là hàm ĐỌC (doc:true)', DANH_MUC.getCVCongViec.doc === true);
  kiem('saveCVCongViec là hàm GHI', DANH_MUC.saveCVCongViec.doc !== true);
  // Cả phòng cùng nhập được, giống bảng Điểm danh.
  kiem('getCVCongViec KHÔNG giới hạn riêng tài khoản chủ', !DANH_MUC.getCVCongViec.chuThoi);
  kiem('saveCVCongViec KHÔNG giới hạn riêng tài khoản chủ', !DANH_MUC.saveCVCongViec.chuThoi);
  // KHÔNG còn hàm quản lý danh sách riêng nữa (đã bỏ 23/08/2026).
  for (const f of ['addCVThanhVien', 'deleteCVThanhVien', 'moveCVThanhVien', 'updateCVThanhVien', 'getCVDiemDanh'])
    kiem('đã BỎ hàm cũ ' + f, !DANH_MUC[f]);
}

// =====================================================================
console.log('\n2) Danh sách người lấy từ bảng Điểm danh của ĐÚNG khu vực');
{
  taoCSDL();
  let r = await goi('getCVCongViec', ['Đ Uyên', '2026-08']);
  const ds = r.result.thanhVien;
  kiem('Đ Uyên có đúng 3 người', ds.length === 3, JSON.stringify(ds.map(x => x.ten)));
  kiem('đúng thứ tự như bảng Điểm danh',
    ds.map(x => x.ten).join(',') === 'Đ T Ngọc Uyên,N Thị Ngân,N Thị Hiệu', ds.map(x => x.ten).join(','));
  kiem('người chưa nhập gì vẫn có đủ 3 buổi sang/chieu/toi',
    !!ds[0].o.sang && !!ds[0].o.chieu && !!ds[0].o.toi, JSON.stringify(ds[0].o));
  kiem('chưa nhập gì -> mọi Tổng = 0',
    ds[0].tongNguoi === 0 && ds[0].tongBuoi.sang === 0 && ds[0].tongBuoi.chieu === 0 && ds[0].tongBuoi.toi === 0);

  r = await goi('getCVCongViec', ['K Thành', '2026-08']);
  kiem('K Thành có đúng 2 người', r.result.thanhVien.length === 2);
  kiem('K Thành KHÔNG thấy người của Đ Uyên',
    !r.result.thanhVien.some(x => x.ten === 'N Thị Ngân'), JSON.stringify(r.result.thanhVien.map(x => x.ten)));

  r = await goi('getCVCongViec', ['TT Châu', '2026-08']);
  kiem('khu vực chưa có ai -> danh sách rỗng, không báo lỗi',
    Array.isArray(r.result?.thanhVien) && r.result.thanhVien.length === 0, JSON.stringify(r));

  r = await goi('getCVCongViec', ['', '2026-08']);
  kiem('thiếu Khu vực -> báo lỗi rõ ràng', /Khu vực/i.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
console.log('\n3) "Tổng" mỗi dòng đếm CẢ THÁNG — đối chiếu đúng sheet thật của anh Rise');
{
  taoCSDL();
  const KV = 'Đ Uyên', TEN = 'N Thị Ngân', TH = '2026-08';
  // Chép đúng dòng "NT Ngân" trong ảnh chụp sheet: Sáng 4 ô (tuần 1),
  // Chiều 4 ô (tuần 4 + 5), Tối 6 ô (tuần 4 + 5) -> tổng người 14.
  for (const [t, n] of [[1, 'CN'], [1, 'T2'], [1, 'T4'], [1, 'T5']]) await luu(KV, TEN, TH, t, 'sang', n, '105');
  for (const [t, n] of [[4, 'T4'], [4, 'T6'], [4, 'T7'], [5, 'CN']]) await luu(KV, TEN, TH, t, 'chieu', n, '127');
  let r;
  for (const [t, n] of [[4, 'T4'], [4, 'T5'], [4, 'T6'], [4, 'T7'], [5, 'CN'], [5, 'T2']])
    r = await luu(KV, TEN, TH, t, 'toi', n, '124');

  kiem('Sáng = 4', r.result.tongBuoi.sang === 4, JSON.stringify(r.result.tongBuoi));
  kiem('Chiều = 4', r.result.tongBuoi.chieu === 4, JSON.stringify(r.result.tongBuoi));
  kiem('Tối = 6', r.result.tongBuoi.toi === 6, JSON.stringify(r.result.tongBuoi));
  kiem('Tổng của người = 14 (4+4+6, đúng số đỏ trong sheet)', r.result.tongNguoi === 14, String(r.result.tongNguoi));

  r = await goi('getCVCongViec', [KV, TH]);
  const m = r.result.thanhVien.find(x => x.ten === TEN);
  kiem('đọc lại bảng cũng ra đúng 4/4/6 và 14',
    m.tongBuoi.sang === 4 && m.tongBuoi.chieu === 4 && m.tongBuoi.toi === 6 && m.tongNguoi === 14,
    JSON.stringify(m.tongBuoi) + ' ' + m.tongNguoi);
  kiem('ô nằm đúng khoá "<tuần>-<ngày>"', m.o.sang['1-CN'] === '105' && m.o.chieu['4-T4'] === '127' && m.o.toi['5-T2'] === '124', JSON.stringify(m.o));
  kiem('tuần 1 KHÔNG lẫn ô của tuần 4', m.o.sang['4-CN'] === undefined, JSON.stringify(m.o.sang));
  kiem('người khác trong cùng khu vực vẫn = 0',
    r.result.thanhVien.find(x => x.ten === 'N Thị Hiệu').tongNguoi === 0);

  // Tháng khác không cộng lẫn vào
  await luu(KV, TEN, '2026-09', 1, 'sang', 'CN', '999');
  r = await goi('getCVCongViec', [KV, TH]);
  kiem('ô của THÁNG KHÁC không cộng vào tháng 8 (vẫn 14)',
    r.result.thanhVien.find(x => x.ten === TEN).tongNguoi === 14);
  r = await goi('getCVCongViec', [KV, '2026-09']);
  kiem('tháng 9 tính riêng (= 1)', r.result.thanhVien.find(x => x.ten === TEN).tongNguoi === 1);
}

// =====================================================================
console.log('\n4) Sửa ô / gõ rỗng để xoá / gõ chữ');
{
  taoCSDL();
  const KV = 'K Thành', TEN = 'P Thị Thành', TH = '2026-08';
  await luu(KV, TEN, TH, 2, 'sang', 'CN', '127');
  let r = await luu(KV, TEN, TH, 2, 'sang', 'CN', '203');
  kiem('gõ đè lên ô cũ -> KHÔNG sinh dòng trùng, Tổng vẫn 1', r.result.tongNguoi === 1, JSON.stringify(r.result));

  r = await goi('getCVCongViec', [KV, TH]);
  kiem('ô đã đổi thành giá trị mới',
    r.result.thanhVien.find(x => x.ten === TEN).o.sang['2-CN'] === '203');

  r = await luu(KV, TEN, TH, 2, 'sang', 'CN', '');
  kiem('gõ rỗng -> Tổng về 0', r.result.tongNguoi === 0, JSON.stringify(r.result));
  r = await goi('getCVCongViec', [KV, TH]);
  kiem('ô rỗng bị xoá hẳn khỏi bảng',
    r.result.thanhVien.find(x => x.ten === TEN).o.sang['2-CN'] === undefined);

  r = await luu(KV, TEN, TH, 2, 'sang', 'CN', '   ');
  kiem('gõ toàn dấu cách cũng coi như rỗng', r.result.tongNguoi === 0, JSON.stringify(r.result));

  r = await luu(KV, TEN, TH, 2, 'sang', 'CN', 'đi truyền đạo');
  kiem('ô nhận CHỮ tự do (không bắt buộc là số)', r.result.tongNguoi === 1, JSON.stringify(r.result));
}

// =====================================================================
console.log('\n5) Chặn dữ liệu không hợp lệ ngay tại máy chủ');
{
  taoCSDL();
  const KV = 'Đ Uyên', TEN = 'N Thị Hiệu';
  let r = await luu(KV, TEN, '2026-8', 1, 'sang', 'CN', 'x');
  kiem('tháng sai định dạng bị chặn', /Tháng không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await luu(KV, TEN, '2026-13', 1, 'sang', 'CN', 'x');
  kiem('tháng 13 bị chặn', /Tháng không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await luu(KV, TEN, '2026-08', 0, 'sang', 'CN', 'x');
  kiem('tuần 0 bị chặn', /Tuần không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await luu(KV, TEN, '2026-08', 7, 'sang', 'CN', 'x');
  kiem('tuần 7 bị chặn (sheet chỉ có Tuần 1..6)', /Tuần không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await luu(KV, TEN, '2026-08', 1, 'trua', 'CN', 'x');
  kiem('buổi lạ ("trua") bị chặn', /Buổi không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await luu(KV, TEN, '2026-08', 1, 'sang', 'T8', 'x');
  kiem('ngày lạ ("T8") bị chặn', /Ngày không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await luu('', TEN, '2026-08', 1, 'sang', 'CN', 'x');
  kiem('thiếu Khu vực bị chặn', /Khu vực/i.test(r.error || ''), JSON.stringify(r));
  r = await luu(KV, '', '2026-08', 1, 'sang', 'CN', 'x');
  kiem('thiếu Tên bị chặn', /Tên thành viên/i.test(r.error || ''), JSON.stringify(r));
  r = await goi('getCVCongViec', [KV, '2026-13']);
  kiem('xem tháng 13 bị chặn', /Tháng không hợp lệ/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
console.log('\n6) Hai khu vực hoàn toàn độc lập (kể cả trùng tên người)');
{
  taoCSDL();
  sqlite.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, thu_tu) VALUES (?,?,?)')
    .run('K Thành', 'N Thị Ngân', 3);   // trùng tên với người bên Đ Uyên
  await luu('Đ Uyên', 'N Thị Ngân', '2026-08', 1, 'sang', 'CN', 'AAA');
  const r2 = await luu('K Thành', 'N Thị Ngân', '2026-08', 1, 'sang', 'CN', 'BBB');
  kiem('người trùng tên ở khu vực khác lưu riêng (Tổng = 1)', r2.result.tongNguoi === 1);

  let r = await goi('getCVCongViec', ['Đ Uyên', '2026-08']);
  kiem('Đ Uyên giữ đúng giá trị của mình',
    r.result.thanhVien.find(x => x.ten === 'N Thị Ngân').o.sang['1-CN'] === 'AAA');
  r = await goi('getCVCongViec', ['K Thành', '2026-08']);
  kiem('K Thành giữ đúng giá trị của mình',
    r.result.thanhVien.find(x => x.ten === 'N Thị Ngân').o.sang['1-CN'] === 'BBB');
}

// =====================================================================
console.log('\n7) Xoá người khỏi bảng Điểm danh -> dòng cũ chỉ ẩn, KHÔNG mất');
{
  taoCSDL();
  await luu('Đ Uyên', 'N Thị Hiệu', '2026-08', 3, 'toi', 'T7', '111');
  sqlite.prepare('DELETE FROM diem_danh_roster WHERE khu_vuc=? AND ten=?').run('Đ Uyên', 'N Thị Hiệu');

  let r = await goi('getCVCongViec', ['Đ Uyên', '2026-08']);
  kiem('người bị xoá khỏi Điểm danh thì không hiện trong bảng nữa',
    !r.result.thanhVien.some(x => x.ten === 'N Thị Hiệu'), JSON.stringify(r.result.thanhVien.map(x => x.ten)));
  kiem('nhưng dữ liệu cũ VẪN CÒN trong CSDL (không mất)',
    Number(sqlite.prepare('SELECT COUNT(*) c FROM cv_cong_viec WHERE ten=?').get('N Thị Hiệu').c) === 1);

  sqlite.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, thu_tu) VALUES (?,?,?)').run('Đ Uyên', 'N Thị Hiệu', 9);
  r = await goi('getCVCongViec', ['Đ Uyên', '2026-08']);
  kiem('thêm lại vào Điểm danh thì số cũ hiện lại đầy đủ',
    r.result.thanhVien.find(x => x.ten === 'N Thị Hiệu')?.o.toi['3-T7'] === '111');
}

// =====================================================================
console.log('\n8) Chuyển khu vực thì số liệu công việc ĐI THEO người');
{
  taoCSDL();
  await luu('Đ Uyên', 'N Thị Ngân', '2026-08', 4, 'chieu', 'T3', '127');
  await luu('Đ Uyên', 'N Thị Ngân', '2026-08', 5, 'toi', 'CN', '203');

  const r = await goi('chuyenThanhVienKhuVuc', ['Đ Uyên', ['N Thị Ngân'], 'TT Châu'], CHU);
  kiem('chuyển sang TT Châu thành công', r.result?.success === true, JSON.stringify(r));

  const chiTiet = r.result?.ketQua?.[0]?.chiTiet?.find((x) => x.bang === 'cv_cong_viec');
  kiem('cv_cong_viec nằm trong danh sách bảng được chuyển', !!chiTiet, JSON.stringify(r.result?.ketQua?.[0]?.chiTiet?.map(x => x.bang)));
  kiem('đã chuyển đúng 2 dòng', chiTiet?.daChuyen === 2, JSON.stringify(chiTiet));

  let g = await goi('getCVCongViec', ['TT Châu', '2026-08']);
  const m = g.result.thanhVien.find(x => x.ten === 'N Thị Ngân');
  kiem('sang khu vực mới vẫn thấy đủ số liệu cũ',
    m && m.o.chieu['4-T3'] === '127' && m.o.toi['5-CN'] === '203', JSON.stringify(m && m.o));
  kiem('Tổng người vẫn đúng = 2', m?.tongNguoi === 2, String(m?.tongNguoi));

  g = await goi('getCVCongViec', ['Đ Uyên', '2026-08']);
  kiem('khu vực cũ không còn người đó', !g.result.thanhVien.some(x => x.ten === 'N Thị Ngân'));
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
