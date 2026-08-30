// =====================================================================
// Kiểm thử OFFLINE cho src/handlers/tru-do.js — sổ mốc Trụ đỡ,
// công thức điểm và bảng khen thưởng:
//     node scripts/kiem-thu-tru-do.mjs
//
// Trọng tâm ba thứ dễ sai nhất:
//   1. Luật MỖI NGƯỜI CHỈ GHI SỔ MỘT LẦN cho mỗi mốc (chống thổi phồng điểm)
//   2. Điểm chia đều đúng cho số người dẫn dắt, kể cả khi trùng tên
//   3. Chốt kỳ rồi thì sửa sổ cũng không đổi được bảng đã trao giải
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

const DS_KHU_VUC = ['Đ Uyên', 'K Thành', 'K Trâm', 'K My', 'K Long', 'K Đức', 'SĐ'];
const DS_TIEN_DO = ['B1', 'B2', 'B3', 'B5', 'B10', 'BT', 'Tạm nghỉ'];
const DS_NDD = ['N Thị Ngân', 'P Ngọc Đức', 'V Hoàng Long', 'N X Kiều My', 'P Thị Thành'];

function taoCSDL() {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);
  db = bocSqlite(sqlite);
  for (const [i, kv] of DS_KHU_VUC.entries())
    sqlite.prepare('INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES (?,?,?)').run('khu_vuc', kv, i);
  for (const [i, t] of DS_TIEN_DO.entries())
    sqlite.prepare('INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES (?,?,?)').run('tien_do', t, i);
  for (const [i, n] of DS_NDD.entries())
    sqlite.prepare('INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES (?,?,?)').run('nguoi_dan_dat', n, i);
}

let dat = 0, hong = 0;
const CHU = { email: 'chu@gmail.com', ten: 'Chu', laChu: true };
const NV = { email: 'nv@gmail.com', ten: 'Nhan vien', laChu: false };

async function goi(fn, args = [], nguoiGoi = NV) {
  const muc = DANH_MUC[fn];
  if (!muc) return { error: 'Không hỗ trợ hàm: ' + fn };
  try {
    return { result: await muc.fn({ db, env: {}, nguoiGoi }, ...args) };
  } catch (e) {
    return { error: e.message };
  }
}
function kiem(ten, dieuKien, chiTiet = '') {
  if (dieuKien) { dat++; console.log('  ✓', ten); }
  else { hong++; console.log('  ✗', ten, chiTiet); }
}
function dem(sql, ...p) { return sqlite.prepare(sql).get(...p).c; }

/** Lấy điểm của một người trong bảng xếp hạng. */
function diemCua(bang, ten) {
  const x = (bang?.danhSach || []).find((y) => y.ten === ten);
  return x ? x.diem : null;
}

console.log('\n=== KIỂM THỬ TRỤ ĐỠ — sổ mốc, điểm, khen thưởng (offline) ===\n');

// =====================================================================
console.log('1) Ghi sổ và luật MỖI NGƯỜI CHỈ MỘT LẦN');
{
  taoCSDL();
  const co = { moc: 'bap_tem', ngay: '2026-08-07', ten: 'Cô Loan', khuVuc: 'Đ Uyên',
    ndd1: 'N Thị Ngân', ndd2: 'P Ngọc Đức', ndd3: 'V Hoàng Long' };

  let r = await goi('addSoMoc', [co]);
  kiem('ghi được dòng đầu tiên', r.result?.success === true, JSON.stringify(r));
  kiem('sổ có đúng 1 dòng', dem('SELECT COUNT(*) c FROM so_moc') === 1);

  r = await goi('addSoMoc', [co]);
  kiem('ghi lần hai bị chặn', /đã có trong sổ/i.test(r.error || ''), JSON.stringify(r));
  kiem('sổ VẪN chỉ 1 dòng sau lần ghi trùng', dem('SELECT COUNT(*) c FROM so_moc') === 1);
  kiem('lời báo lỗi có nhắc ngày cũ', /2026-08-07/.test(r.error || ''), r.error);

  r = await goi('addSoMoc', [{ ...co, ngay: '2026-09-01', ghiChu: 'nhập lại' }]);
  kiem('đổi ngày rồi ghi lại vẫn bị chặn', /đã có trong sổ/i.test(r.error || ''));

  r = await goi('addSoMoc', [{ ...co, khuVuc: 'K My' }]);
  kiem('cùng tên khác khu vực thì ghi được', r.result?.success === true, JSON.stringify(r));

  r = await goi('addSoMoc', [{ ...co, moc: 'huu_hieu', ngay: '2026-07-21' }]);
  kiem('cùng người khác mốc thì ghi được', r.result?.success === true, JSON.stringify(r));
  kiem('sổ có 3 dòng', dem('SELECT COUNT(*) c FROM so_moc') === 3);

  taoCSDL();
  await Promise.all(Array.from({ length: 8 }, () => goi('addSoMoc', [co])));
  kiem('8 lệnh ghi đồng thời chỉ sinh ĐÚNG 1 dòng',
    dem('SELECT COUNT(*) c FROM so_moc') === 1, 'thực tế: ' + dem('SELECT COUNT(*) c FROM so_moc'));
}

// =====================================================================
console.log('\n2) Dữ liệu vào sổ phải hợp lệ');
{
  taoCSDL();
  let r = await goi('addSoMoc', [{ moc: 'linh_tinh', ten: 'A', khuVuc: 'K My' }]);
  kiem('mốc lạ bị từ chối', /Mốc không hợp lệ/i.test(r.error || ''), r.error);

  r = await goi('addSoMoc', [{ moc: 'bap_tem', ten: '  ', khuVuc: 'K My' }]);
  kiem('thiếu tên bị chặn', /Thiếu/i.test(r.error || ''), r.error);

  r = await goi('addSoMoc', [{ moc: 'bap_tem', ten: 'A', khuVuc: '' }]);
  kiem('thiếu khu vực bị chặn', /Thiếu/i.test(r.error || ''), r.error);
  kiem('không ghi gì vào sổ khi dữ liệu sai', dem('SELECT COUNT(*) c FROM so_moc') === 0);

  r = await goi('addSoMoc', [{ moc: 'bap_tem', ten: 'A', khuVuc: 'K My' }]);
  kiem('bỏ trống ngày thì lấy hôm nay', /^\d{4}-\d{2}-\d{2}$/.test(
    sqlite.prepare("SELECT ngay FROM so_moc WHERE ten='A'").get().ngay));
  kiem('cột tháng được tính sẵn',
    sqlite.prepare("SELECT thang FROM so_moc WHERE ten='A'").get().thang.length === 7);
}

// =====================================================================
console.log('\n3) Công thức điểm — chia đều cho người dẫn dắt');
{
  taoCSDL();
  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-08-07', ten: 'Cô Loan', khuVuc: 'Đ Uyên',
    ndd1: 'N Thị Ngân', ndd2: 'P Ngọc Đức', ndd3: 'V Hoàng Long' }]);
  await goi('addSoMoc', [{ moc: 'huu_hieu', ngay: '2026-07-21', ten: 'Cô Loan', khuVuc: 'Đ Uyên',
    ndd1: 'N Thị Ngân', ndd2: 'P Ngọc Đức', ndd3: 'V Hoàng Long' }]);
  await db.run('INSERT INTO nhat_ky_don_thuan (ngay, khu_vuc, don_thuan, ndd1) VALUES (?,?,?,?)',
    ['2026-07-13', 'K My', 5, 'N X Kiều My']);
  await db.run('INSERT INTO nhat_ky_don_thuan (ngay, khu_vuc, don_thuan, ndd1, ndd2) VALUES (?,?,?,?,?)',
    ['2026-07-19', 'K Thành', 1, 'P Thị Thành', 'N Thị Ngân']);

  const b = (await goi('getXepHang', ['2026-01-01', '2026-12-31', ''])).result;
  // ⚠️ Thang điểm ĐỔI 27/08/2026 theo bảng Hội Thánh: hữu hiệu 100 -> 50,
  // báp-têm 1000 -> 500. Số ca KHÔNG đổi, chỉ điểm đổi.
  //   (500 + 50) / 3 = 183,333... -> làm tròn 183,33
  kiem('1 báp-têm + 1 hữu hiệu chia 3 -> 183,33 mỗi người',
    diemCua(b, 'P Ngọc Đức') === 183.33, JSON.stringify(b?.danhSach));
  kiem('người vừa có mốc vừa có đơn thuần cộng đúng (183,33 + 0,5)',
    diemCua(b, 'N Thị Ngân') === 183.83, 'thực tế: ' + diemCua(b, 'N Thị Ngân'));
  kiem('5 đơn thuần 1 người -> 5 điểm', diemCua(b, 'N X Kiều My') === 5);
  kiem('1 đơn thuần 2 người -> 0,5 điểm', diemCua(b, 'P Thị Thành') === 0.5);

  kiem('tổng điểm toàn phòng khớp số ca thật (500+50+5+1)',
    b.tomTat.tongDiem === 556, 'thực tế: ' + b.tomTat.tongDiem);
  kiem('đếm đúng số ca đơn thuần (5+1)', b.tomTat.soDonThuan === 6);
  kiem('đếm đúng 1 hữu hiệu', b.tomTat.soHuuHieu === 1);
  kiem('đếm đúng 1 báp-têm', b.tomTat.soBapTem === 1);

  const ngan = b.danhSach.find((x) => x.ten === 'N Thị Ngân');
  kiem('cột số ca KHÔNG chia — mỗi người vẫn tính 1 ca báp-têm', ngan.bapTem === 1);
  kiem('cột số ca hữu hiệu cũng là 1', ngan.huuHieu === 1);
  kiem('cột Đơn thuần hiện SỐ LƯỢNG đã chia (1 chia 2 = 0,5) chứ không phải số dòng',
    ngan.donThuan === 0.5, 'thực tế: ' + ngan.donThuan);
  kiem('người dẫn dắt một mình nhận trọn số lượng',
    b.danhSach.find((x) => x.ten === 'N X Kiều My').donThuan === 5);

  // Lỗi anh Rise phát hiện 13/08/2026: dòng 100 đơn thuần của 2 người hiện "1".
  await db.run('INSERT INTO nhat_ky_don_thuan (ngay, khu_vuc, don_thuan, ndd1, ndd2) VALUES (?,?,?,?,?)',
    ['2026-07-20', 'K Đức', 100, 'L H Đức', 'N Thanh Huyền']);
  const b2 = (await goi('getXepHang', ['2026-01-01', '2026-12-31', ''])).result;
  const duc = b2.danhSach.find((x) => x.ten === 'L H Đức');
  kiem('100 đơn thuần chia 2 -> cột Đơn thuần là 50', duc.donThuan === 50, 'thực tế: ' + duc.donThuan);
  kiem('100 đơn thuần chia 2 -> 50 điểm', duc.diem === 50, 'thực tế: ' + duc.diem);
  kiem('cột Đơn thuần và điểm khớp nhau (1 đơn thuần = 1 điểm)', duc.donThuan === duc.diem);
  kiem('tổng đơn thuần toàn phòng vẫn đếm đủ 106', b2.tomTat.soDonThuan === 106,
    'thực tế: ' + b2.tomTat.soDonThuan);

  // Số lẻ vô hạn phải được làm tròn 2 chữ số, không hiện 2.3333333333333335
  await db.run('INSERT INTO nhat_ky_don_thuan (ngay, khu_vuc, don_thuan, ndd1, ndd2, ndd3) VALUES (?,?,?,?,?,?)',
    ['2026-07-22', 'SĐ', 7, 'A Một', 'B Hai', 'C Ba']);
  const b3 = (await goi('getXepHang', ['2026-01-01', '2026-12-31', ''])).result;
  kiem('7 chia 3 -> làm tròn 2,33', b3.danhSach.find((x) => x.ten === 'A Một').donThuan === 2.33,
    'thực tế: ' + b3.danhSach.find((x) => x.ten === 'A Một').donThuan);
}

// =====================================================================
console.log('\n3b) ⭐ HAI MỐC MỚI — Báp-têm dự lễ & Chiên bị mất (27/08/2026)');
{
  // Bảng điểm Hội Thánh ban hành cho kỳ "Vận động Thánh Linh Lễ Lều Tạm":
  //   đơn thuần 1 · hữu hiệu 50 · báp-têm 500 · BT dự lễ 1000 · chiên bị mất 500
  taoCSDL();
  const { DIEM_MOC } = await import(join(goc, 'src/handlers/tru-do.js'));
  kiem('thang điểm đúng bảng Hội Thánh ban hành',
    DIEM_MOC.don_thuan === 1 && DIEM_MOC.huu_hieu === 50 && DIEM_MOC.bap_tem === 500
    && DIEM_MOC.bap_tem_du_le === 1000 && DIEM_MOC.chien_bi_mat === 500,
    JSON.stringify(DIEM_MOC));

  kiem('ghi được mốc "Báp-têm dự lễ"',
    !(await goi('addSoMoc', [{ moc: 'bap_tem_du_le', ngay: '2026-09-20', ten: 'Cô M',
      khuVuc: 'K My', ndd1: 'Chị Một' }])).error);
  kiem('ghi được mốc "Chiên bị mất"',
    !(await goi('addSoMoc', [{ moc: 'chien_bi_mat', ngay: '2026-09-21', ten: 'Cô N',
      khuVuc: 'K My', ndd1: 'Chị Hai' }])).error);
  kiem('mốc bịa vẫn bị chặn',
    !!(await goi('addSoMoc', [{ moc: 'khong_co_that', ten: 'X', khuVuc: 'K My' }])).error);

  // ⭐ Anh Rise chốt: "Báp-têm dự lễ CỘNG THÊM vào báp-têm" — một người vừa
  // báp-têm vừa dự lễ được 500 + 1000 = 1500, ghi HAI dòng sổ riêng.
  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-09-19', ten: 'Cô P',
    khuVuc: 'K My', ndd1: 'Chị Ba' }]);
  await goi('addSoMoc', [{ moc: 'bap_tem_du_le', ngay: '2026-09-22', ten: 'Cô P',
    khuVuc: 'K My', ndd1: 'Chị Ba' }]);

  const b = (await goi('getXepHang', ['2026-09-01', '2026-09-30', ''])).result;
  kiem('⭐ vừa báp-têm vừa dự lễ -> 500 + 1000 = 1500 điểm',
    diemCua(b, 'Chị Ba') === 1500, 'thực tế: ' + diemCua(b, 'Chị Ba'));
  const ba = b.danhSach.find((x) => x.ten === 'Chị Ba');
  kiem('...và hiện thành HAI cột riêng, không đè nhau',
    ba.bapTem === 1 && ba.bapTemDuLe === 1, JSON.stringify(ba));
  kiem('Chiên bị mất được 500 điểm', diemCua(b, 'Chị Hai') === 500,
    'thực tế: ' + diemCua(b, 'Chị Hai'));
  kiem('BT dự lễ một mình được 1000 điểm', diemCua(b, 'Chị Một') === 1000,
    'thực tế: ' + diemCua(b, 'Chị Một'));
  kiem('tóm tắt đếm riêng hai mốc mới',
    b.tomTat.soBapTemDuLe === 2 && b.tomTat.soChienBiMat === 1, JSON.stringify(b.tomTat));

  // Mỗi người mỗi mốc chỉ một dòng — nhưng hai mốc KHÁC nhau thì vẫn ghi được.
  kiem('⚠️ ghi lại cùng mốc cho cùng người -> chặn',
    !!(await goi('addSoMoc', [{ moc: 'bap_tem_du_le', ngay: '2026-09-23', ten: 'Cô P',
      khuVuc: 'K My', ndd1: 'Chị Ba' }])).error);

  // ⚠️⚠️ Thang điểm được KHAI HAI NƠI: máy chủ (tru-do.js) để tính, và giao
  // diện (trudo-ui.js) để hiện chữ "mỗi ca N điểm". Lệch nhau thì màn hình
  // nói một đằng, máy chủ tính một nẻo — người dùng không có cách nào biết.
  const nguonUI = readFileSync(join(goc, '..', 'trudo-ui.js'), 'utf8');
  const khoiDiem = (nguonUI.match(/const DIEM = \{[\s\S]*?\};/) || [''])[0];
  let khopUI = true;
  const lechUI = [];
  for (const [k, v] of Object.entries(DIEM_MOC)) {
    if (!new RegExp(k + ':\\s*' + v + '\\b').test(khoiDiem)) { khopUI = false; lechUI.push(k + '=' + v); }
  }
  kiem('⚠️⚠️ thang điểm ở trudo-ui.js KHỚP với DIEM_MOC của máy chủ',
    khopUI && khoiDiem !== '', lechUI.join(', ') || 'không tìm thấy khối DIEM trong trudo-ui.js');
}

// =====================================================================
console.log('\n4) Người dẫn dắt bị điền trùng tên trong 2 ô');
{
  taoCSDL();
  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-08-07', ten: 'X', khuVuc: 'K My',
    ndd1: 'P Ngọc Đức', ndd2: 'P Ngọc Đức' }]);
  const b = (await goi('getXepHang', ['2026-01-01', '2026-12-31', ''])).result;
  kiem('trùng tên chỉ tính 1 người -> nhận trọn 500 điểm',
    diemCua(b, 'P Ngọc Đức') === 500, 'thực tế: ' + diemCua(b, 'P Ngọc Đức'));
  kiem('chỉ có 1 người trong bảng', b.danhSach.length === 1);
  kiem('số ca vẫn là 1, không phải 2', b.danhSach[0].bapTem === 1);

  taoCSDL();
  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-08-07', ten: 'Y', khuVuc: 'K My',
    ndd1: 'P Ngọc Đức', ndd2: '  p ngọc đức  ' }]);
  const b2 = (await goi('getXepHang', ['2026-01-01', '2026-12-31', ''])).result;
  kiem('khác hoa thường vẫn coi là một người', b2.danhSach.length === 1, JSON.stringify(b2.danhSach));
}

// =====================================================================
console.log('\n5) Dòng không ghi người dẫn dắt nào');
{
  taoCSDL();
  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-08-07', ten: 'Z', khuVuc: 'K My' }]);
  await db.run('INSERT INTO nhat_ky_don_thuan (ngay, khu_vuc, don_thuan) VALUES (?,?,?)',
    ['2026-08-01', 'K My', 3]);
  const b = (await goi('getXepHang', ['2026-01-01', '2026-12-31', ''])).result;
  kiem('không ai được điểm', b.danhSach.length === 0, JSON.stringify(b.danhSach));
  kiem('điểm vẫn vào tổng của phòng', b.tomTat.tongDiem === 503);
  kiem('báo rõ phần điểm chưa có người nhận', b.tomTat.diemChuaCoNguoi === 503,
    'thực tế: ' + b.tomTat.diemChuaCoNguoi);
  kiem('không bị chia cho 0 sinh ra NaN', Number.isFinite(b.tomTat.tongDiem));
}

// =====================================================================
console.log('\n6) Lọc theo thời gian và khu vực');
{
  taoCSDL();
  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-06-30', ten: 'Thang6', khuVuc: 'K My', ndd1: 'A' }]);
  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-07-01', ten: 'Thang7', khuVuc: 'K My', ndd1: 'B' }]);
  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-08-31', ten: 'Thang8', khuVuc: 'Đ Uyên', ndd1: 'C' }]);
  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-09-01', ten: 'Thang9', khuVuc: 'K My', ndd1: 'D' }]);

  let r = await goi('getSoMoc', ['bap_tem', '2026-07-01', '2026-08-31', '']);
  kiem('lọc khoảng ngày lấy đúng 2 dòng', r.result?.length === 2, JSON.stringify(r.result?.map(x => x.ten)));
  kiem('biên đầu khoảng được tính vào', r.result.some((x) => x.ten === 'Thang7'));
  kiem('biên cuối khoảng được tính vào', r.result.some((x) => x.ten === 'Thang8'));

  r = await goi('getSoMoc', ['bap_tem', '2026-07-01', '2026-08-31', 'K My']);
  kiem('lọc thêm khu vực còn 1 dòng', r.result?.length === 1 && r.result[0].ten === 'Thang7');

  r = await goi('getSoMoc', ['', '', '', '']);
  kiem('bỏ trống hết thì lấy toàn bộ sổ', r.result?.length === 4);

  const b = (await goi('getXepHang', ['2026-07-01', '2026-08-31', ''])).result;
  kiem('xếp hạng cũng chỉ tính trong khoảng', b.tomTat.soBapTem === 2, JSON.stringify(b.tomTat));
  kiem('xếp hạng lọc khu vực',
    (await goi('getXepHang', ['2026-07-01', '2026-08-31', 'Đ Uyên'])).result.tomTat.soBapTem === 1);
}

// =====================================================================
console.log('\n7) Thứ hạng — cùng điểm thì cùng hạng');
{
  taoCSDL();
  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-08-07', ten: 'Cô Loan', khuVuc: 'Đ Uyên',
    ndd1: 'N Thị Ngân', ndd2: 'P Ngọc Đức', ndd3: 'V Hoàng Long' }]);
  await db.run('INSERT INTO nhat_ky_don_thuan (ngay, khu_vuc, don_thuan, ndd1) VALUES (?,?,?,?)',
    ['2026-08-01', 'K My', 5, 'N X Kiều My']);

  const b = (await goi('getXepHang', ['2026-01-01', '2026-12-31', ''])).result;
  kiem('người điểm cao đứng đầu (500 chia 3 = 166,67)', b.danhSach[0].diem === 166.67);
  kiem('ba người cùng điểm cùng hạng 1',
    b.danhSach.slice(0, 3).every((x) => x.hang === 1), JSON.stringify(b.danhSach.map(x => [x.ten, x.hang])));
  kiem('người thứ tư nhảy sang hạng 4', b.danhSach[3].hang === 4);
  kiem('người ít điểm xếp cuối', b.danhSach[3].ten === 'N X Kiều My');
}

// =====================================================================
console.log('\n8) Tự động phát hiện vừa vượt mốc');
{
  taoCSDL();
  let r = await goi('addStudent', [{ ten: 'HV Một', to: 'K My', tienDo: 'B1', ndd1: 'N Thị Ngân' }]);
  const id1 = r.result?.row;
  kiem('học viên B1 chưa vượt mốc nào', (r.result?.ghiSo || []).length === 0, JSON.stringify(r));

  r = await goi('updateStudent', [id1, { ten: 'HV Một', to: 'K My', tienDo: 'B2', ndd1: 'N Thị Ngân' }]);
  kiem('B1 lên B2 -> hỏi ghi sổ Hữu hiệu',
    (r.result?.ghiSo || []).length === 1 && r.result.ghiSo[0].moc === 'huu_hieu', JSON.stringify(r));
  kiem('đã điền sẵn người dẫn dắt', r.result.ghiSo[0].nguoiDanDat[0] === 'N Thị Ngân');
  kiem('có gợi ý ngày hôm nay', /^\d{4}-\d{2}-\d{2}$/.test(r.result.ghiSo[0].ngayGoiY));
  kiem('kèm luôn số điểm của mốc (hữu hiệu nay là 50)', r.result.ghiSo[0].diem === 50);

  r = await goi('updateStudent', [id1, { ten: 'HV Một', to: 'K My', tienDo: 'B10', ndd1: 'N Thị Ngân' }]);
  kiem('B2 lên B10 -> KHÔNG hỏi lại', (r.result?.ghiSo || []).length === 0, JSON.stringify(r.result?.ghiSo));

  r = await goi('updateStudent', [id1, { ten: 'HV Một', to: 'K My', tienDo: 'BT', ndd1: 'N Thị Ngân' }]);
  kiem('lên BT -> hỏi ghi sổ Báp-têm',
    (r.result?.ghiSo || []).some((x) => x.moc === 'bap_tem'), JSON.stringify(r.result?.ghiSo));

  r = await goi('addStudent', [{ ten: 'HV Hai', to: 'K My', tienDo: 'B1', ndd1: 'P Ngọc Đức' }]);
  const id2 = r.result?.row;
  kiem('thêm được học viên thứ hai', Number.isInteger(id2), JSON.stringify(r));
  r = await goi('updateStudent', [id2, { ten: 'HV Hai', to: 'K My', tienDo: 'BT', ndd1: 'P Ngọc Đức' }]);
  kiem('nhảy thẳng B1 -> BT thì hỏi cả Hữu hiệu lẫn Báp-têm',
    (r.result?.ghiSo || []).length === 2, JSON.stringify(r));

  r = await goi('addStudent', [{ ten: 'HV Ba', to: 'K Long', tienDo: 'BT', ndd1: 'V Hoàng Long' }]);
  kiem('thêm mới thẳng ở mức BT cũng hỏi cả hai mốc',
    (r.result?.ghiSo || []).length === 2, JSON.stringify(r));

  await goi('addSoMoc', [{ moc: 'huu_hieu', ten: 'HV Bốn', khuVuc: 'K My', ndd1: 'N X Kiều My' }]);
  r = await goi('addStudent', [{ ten: 'HV Bốn', to: 'K My', tienDo: 'B5', ndd1: 'N X Kiều My' }]);
  kiem('người đã có trong sổ thì không hỏi lại',
    (r.result?.ghiSo || []).length === 0, JSON.stringify(r));

  r = await goi('updateStudent', [id1, { ten: 'HV Một', to: 'K My', tienDo: 'B1', ndd1: 'N Thị Ngân' }]);
  kiem('tụt về B1 không hỏi gì', (r.result?.ghiSo || []).length === 0);
  await goi('addSoMoc', [{ moc: 'huu_hieu', ten: 'HV Một', khuVuc: 'K My', ndd1: 'N Thị Ngân' }]);
  r = await goi('updateStudent', [id1, { ten: 'HV Một', to: 'K My', tienDo: 'B2', ndd1: 'N Thị Ngân' }]);
  kiem('lên lại B2 mà đã ghi sổ rồi thì không hỏi nữa',
    (r.result?.ghiSo || []).length === 0, JSON.stringify(r.result?.ghiSo));
}

// =====================================================================
console.log('\n9) getMocDaGhi');
{
  taoCSDL();
  await goi('addSoMoc', [{ moc: 'huu_hieu', ngay: '2026-07-21', ten: 'Cô Loan', khuVuc: 'Đ Uyên', ndd1: 'A' }]);
  const r = await goi('getMocDaGhi', ['Cô Loan', 'Đ Uyên']);
  kiem('trả về mốc đã ghi kèm ngày', r.result?.huu_hieu === '2026-07-21', JSON.stringify(r.result));
  kiem('mốc chưa ghi thì không có trong kết quả', r.result?.bap_tem === undefined);
  const r2 = await goi('getMocDaGhi', ['Ai Đó', 'K My']);
  kiem('người chưa có trong sổ trả về rỗng', Object.keys(r2.result || {}).length === 0);
}

// =====================================================================
console.log('\n10) Dải chúc mừng Báp-têm ở trang Tổng quan');
{
  taoCSDL();
  let r = await goi('getBapTemBanner', ['2026-08']);
  kiem('tháng chưa có ai thì danh sách rỗng', r.result?.soNguoi === 0, JSON.stringify(r.result));

  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-08-07', ten: 'Cô Loan', khuVuc: 'Đ Uyên',
    ndd1: 'N Thị Ngân', ndd2: 'P Ngọc Đức', ndd3: 'V Hoàng Long' }]);
  await goi('addSoMoc', [{ moc: 'huu_hieu', ngay: '2026-08-10', ten: 'Cô Thương', khuVuc: 'K Trâm', ndd1: 'A' }]);
  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-07-05', ten: 'Cô Cũ', khuVuc: 'K My', ndd1: 'B' }]);

  r = await goi('getBapTemBanner', ['2026-08']);
  kiem('đúng 1 người báp-têm trong tháng 8', r.result?.soNguoi === 1, JSON.stringify(r.result));
  kiem('không lẫn người Hữu hiệu vào dải chúc mừng',
    r.result.danhSach.every((x) => x.moc === 'bap_tem'));
  kiem('không lẫn tháng khác', r.result.danhSach[0].ten === 'Cô Loan');
  kiem('kèm đủ danh sách người kết trái',
    r.result.danhSach[0].nguoiDanDat.length === 3, JSON.stringify(r.result.danhSach[0].nguoiDanDat));
  kiem('kèm khu vực để hiển thị', r.result.danhSach[0].khuVuc === 'Đ Uyên');
}

// =====================================================================
console.log('\n11) Sửa và xoá dòng sổ');
{
  taoCSDL();
  let r = await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-08-07', ten: 'Cô Loan',
    khuVuc: 'Đ Uyên', ndd1: 'A', ghiChu: 'ban đầu' }]);
  const id = r.result.row;
  kiem('trả về mã dòng vừa ghi', Number.isInteger(id) && id > 0, String(id));

  r = await goi('updateSoMoc', [id, { ngay: '2026-08-09', ghiChu: 'sửa lại' }]);
  kiem('sửa được ngày và ghi chú', r.result?.success === true, JSON.stringify(r));
  const sau = sqlite.prepare('SELECT * FROM so_moc WHERE id=?').get(id);
  kiem('ngày đã đổi', sau.ngay === '2026-08-09');
  kiem('cột tháng cũng cập nhật theo', sau.thang === '2026-08');
  kiem('ghi chú đã đổi', sau.ghi_chu === 'sửa lại');
  kiem('không đụng tới người dẫn dắt khi không gửi lên', sau.ndd1 === 'A');

  r = await goi('updateSoMoc', [999999, { ngay: '2026-01-01' }]);
  kiem('sửa dòng không tồn tại báo lỗi rõ', /không còn trong sổ/i.test(r.error || ''), r.error);

  r = await goi('deleteSoMoc', [id]);
  kiem('xoá được', r.result?.success === true);
  kiem('sổ trống sau khi xoá', dem('SELECT COUNT(*) c FROM so_moc') === 0);
  r = await goi('deleteSoMoc', [id]);
  kiem('xoá lần hai không báo lỗi', r.result?.success === true);

  r = await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-08-07', ten: 'Cô Loan', khuVuc: 'Đ Uyên' }]);
  kiem('xoá nhầm rồi ghi lại được', r.result?.success === true, JSON.stringify(r));
}

// =====================================================================
console.log('\n12) Chốt kỳ khen thưởng');
{
  taoCSDL();
  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-08-07', ten: 'Cô Loan', khuVuc: 'Đ Uyên',
    ndd1: 'N Thị Ngân', ndd2: 'P Ngọc Đức' }]);

  let r = await goi('getChotKy', ['2026-08']);
  kiem('kỳ chưa chốt trả về rỗng', r.result === null, JSON.stringify(r));

  r = await goi('chotKy', ['2026-08', '2026-08-01', '2026-08-31', ''], CHU);
  kiem('chốt kỳ thành công', r.result?.success === true, JSON.stringify(r));
  kiem('chốt đúng 2 người', r.result?.soNguoi === 2);

  const daChot = (await goi('getChotKy', ['2026-08'])).result;
  kiem('đọc lại được bảng đã chốt', daChot?.danhSach?.length === 2, JSON.stringify(daChot));
  kiem('điểm lúc chốt là 250 mỗi người (500 chia 2)', daChot.danhSach[0].diem === 250);
  kiem('lưu cả tóm tắt', daChot.tomTat?.soBapTem === 1);
  kiem('ghi lại ai chốt', daChot.nguoiChot === 'chu@gmail.com');

  const idDong = sqlite.prepare("SELECT id FROM so_moc WHERE ten='Cô Loan'").get().id;
  await goi('updateSoMoc', [idDong, { ndd1: 'N Thị Ngân', ndd2: 'P Ngọc Đức', ndd3: 'V Hoàng Long' }]);
  const bangMoi = (await goi('getXepHang', ['2026-08-01', '2026-08-31', ''])).result;
  kiem('bảng tính lại ĐÃ đổi theo sổ (500 chia 3 = 166,67)', bangMoi.danhSach[0].diem === 166.67,
    'thực tế: ' + bangMoi.danhSach[0].diem);
  const daChot2 = (await goi('getChotKy', ['2026-08'])).result;
  kiem('bảng ĐÃ CHỐT vẫn giữ nguyên 250 — đây là điều quan trọng nhất',
    daChot2.danhSach[0].diem === 250, 'thực tế: ' + daChot2.danhSach[0].diem);

  r = await goi('getDsChotKy', []);
  kiem('liệt kê được các kỳ đã chốt', r.result?.length === 1 && r.result[0].ky === '2026-08');

  r = await goi('chotKy', ['2026-08', '2026-08-01', '2026-08-31', ''], CHU);
  const daChot3 = (await goi('getChotKy', ['2026-08'])).result;
  kiem('chốt lại thì cập nhật theo sổ mới', daChot3.danhSach[0].diem === 166.67);
  kiem('không sinh thêm dòng kỳ mới', dem('SELECT COUNT(*) c FROM chot_ky') === 1);

  r = await goi('xoaChotKy', ['2026-08'], CHU);
  kiem('bỏ chốt được', r.result?.success === true);
  kiem('kỳ đã bỏ chốt trả về rỗng', (await goi('getChotKy', ['2026-08'])).result === null);

  r = await goi('chotKy', ['', '2026-08-01', '2026-08-31', ''], CHU);
  kiem('thiếu tên kỳ bị chặn', /Thiếu/i.test(r.error || ''), r.error);
}

// =====================================================================
console.log('\n13) Phân quyền và phân loại hàm');
{
  kiem('chotKy chỉ dành cho tài khoản chủ', DANH_MUC.chotKy.chuThoi === true);
  kiem('xoaChotKy chỉ dành cho tài khoản chủ', DANH_MUC.xoaChotKy.chuThoi === true);
  kiem('getXepHang là hàm đọc', DANH_MUC.getXepHang.doc === true);
  kiem('addSoMoc là hàm ghi', DANH_MUC.addSoMoc.doc === false);
}

// =====================================================================
console.log('\n14) Độ phủ — chạm hết các hàm của tru-do.js');
{
  const truDo = await import(join(goc, 'src/handlers/tru-do.js'));
  const canPhu = Object.keys(truDo).filter((k) => typeof truDo[k] === 'function' && k !== 'dsNguoiDanDat');
  const trongDanhMuc = Object.keys(DANH_MUC);
  const thieu = canPhu.filter((t) => t !== 'mocVuaDat' && !trongDanhMuc.includes(t));
  kiem('mọi hàm đều đã nối vào danh mục (trừ hàm nội bộ)',
    thieu.length === 0, 'còn thiếu: ' + thieu.join(', '));
  kiem('danh mục có đủ 98 hàm', trongDanhMuc.length === 98, 'thực tế: ' + trongDanhMuc.length);
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
process.exit(hong ? 1 : 0);
