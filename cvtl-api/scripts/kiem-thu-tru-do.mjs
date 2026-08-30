// =====================================================================
// Kiểm thử OFFLINE cho src/handlers/tru-do.js — sổ mốc Trụ đỡ và
// bảng xếp hạng:
//     node scripts/kiem-thu-tru-do.mjs
//
// ⭐⭐ 30/08/2026 — WEB KHÔNG CÒN ĐIỂM, KHÔNG CÒN CÔNG THỨC NÀO. Điểm xem bên
// memo của Hội Thánh. Phần 3b canh không cho ai khai lại một thang điểm —
// xem lý do ở đầu src/handlers/tru-do.js.
//
// Trọng tâm ba thứ dễ sai nhất:
//   1. Luật MỖI NGƯỜI CHỈ GHI SỔ MỘT LẦN cho mỗi mốc (chống thổi phồng số ca)
//   2. Cột Đơn thuần chia đều cho người dẫn dắt, Hữu hiệu/Báp-têm thì KHÔNG
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
console.log('\n3) Đếm số ca — cột Đơn thuần chia đều, Hữu hiệu/Báp-têm thì không');
{
  // ⭐⭐ 30/08/2026 — WEB KHÔNG CÒN TÍNH ĐIỂM. Anh Rise chốt: memo của Hội
  // Thánh đã có công thức và là sổ chính thức. Cả phần kiểm thử công thức
  // điểm cũ (1/100/1000 rồi 1/50/500) đã bỏ theo.
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
  kiem('đếm đúng số ca đơn thuần (5+1)', b.tomTat.soDonThuan === 6);
  kiem('đếm đúng 1 hữu hiệu', b.tomTat.soHuuHieu === 1);
  kiem('đếm đúng 1 báp-têm', b.tomTat.soBapTem === 1);

  const ngan = b.danhSach.find((x) => x.ten === 'N Thị Ngân');
  kiem('⚠️ cột số ca KHÔNG chia — mỗi người dẫn dắt vẫn tính trọn 1 báp-têm', ngan.bapTem === 1);
  kiem('cột số ca hữu hiệu cũng là 1', ngan.huuHieu === 1);
  kiem('⚠️ cột Đơn thuần hiện SỐ LƯỢNG đã chia (1 chia 2 = 0,5) chứ không phải số dòng',
    ngan.donThuan === 0.5, 'thực tế: ' + ngan.donThuan);
  kiem('người dẫn dắt một mình nhận trọn số lượng',
    b.danhSach.find((x) => x.ten === 'N X Kiều My').donThuan === 5);

  // ⚠️⚠️ KHÔNG CÒN ĐIỂM Ở BẤT KỲ ĐÂU. Bảng chỉ đếm số ca.
  kiem('⚠️⚠️ KHÔNG có trường điểm nào trong từng dòng',
    b.danhSach.every((x) => x.diem === undefined), JSON.stringify(b.danhSach[0]));
  kiem('⚠️⚠️ tóm tắt cũng KHÔNG có tổng điểm', b.tomTat.tongDiem === undefined,
    JSON.stringify(b.tomTat));
  kiem('⚠️ xếp theo Báp-têm > Hữu hiệu > Đơn thuần',
    b.danhSach[0].bapTem === 1, JSON.stringify(b.danhSach.map((x) => x.ten)));
  kiem('...bằng báp-têm thì mới xét tiếp Hữu hiệu rồi Đơn thuần',
    b.danhSach[3].ten === 'N X Kiều My' && b.danhSach[3].donThuan === 5,
    JSON.stringify(b.danhSach.map((x) => [x.ten, x.bapTem, x.huuHieu, x.donThuan])));

  // Lỗi anh Rise phát hiện 13/08/2026: dòng 100 đơn thuần của 2 người hiện "1".
  await db.run('INSERT INTO nhat_ky_don_thuan (ngay, khu_vuc, don_thuan, ndd1, ndd2) VALUES (?,?,?,?,?)',
    ['2026-07-20', 'K Đức', 100, 'L H Đức', 'N Thanh Huyền']);
  const b2 = (await goi('getXepHang', ['2026-01-01', '2026-12-31', ''])).result;
  const duc = b2.danhSach.find((x) => x.ten === 'L H Đức');
  kiem('100 đơn thuần chia 2 -> cột Đơn thuần là 50', duc.donThuan === 50, 'thực tế: ' + duc.donThuan);
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
console.log('\n3b) ⚠️⚠️ MÃ NGUỒN: không thang điểm, và giao diện không mất hàm');
{
  // Anh Rise chốt bỏ hẳn công thức điểm khỏi web. Ca này canh không cho ai
  // lặng lẽ khai lại — web tự tính mà lệch memo thì web luôn là bên sai, và
  // cả phòng mất thời gian cãi xem tin bảng nào (bài học #33).
  const src = readFileSync(join(goc, 'src/handlers/tru-do.js'), 'utf8');
  const ui = readFileSync(join(goc, '..', 'trudo-ui.js'), 'utf8');
  // ⚠️ Soi ĐÚNG CHỖ (bài học #71): chữ "DIEM_MOC" CÓ trong file — ở chú thích
  // kể lại nó đã bị xoá. Cấm cả chữ thì ca này đỏ oan. Thứ bị cấm là KHAI lại.
  kiem('⚠️⚠️ KHÔNG khai lại bảng DIEM_MOC', !/(const|let|var)\s+DIEM_MOC/.test(src));
  // ⚠️ Chỉ cấm số KHÁC 0: `soCa: { don_thuan: 0, huu_hieu: 0, bap_tem: 0 }` là ô
  // ĐẾM, hoàn toàn hợp lệ. Cấm cả số 0 thì ca này đỏ oan (bài học #71).
  kiem('⚠️ KHÔNG có thang điểm cứng nào trong mã',
    !/huu_hieu:\s*[1-9]/.test(src) && !/bap_tem:\s*[1-9]/.test(src));
  kiem('⚠️ KHÔNG còn đọc bảng điểm nào — web không có điểm', !/van_dong_diem/.test(src));
  kiem('⚠️⚠️ giao diện Trudo cũng KHÔNG khai lại bảng DIEM', !/const DIEM = \{/.test(ui));
  kiem('⚠️ giao diện không còn câu "mỗi ca N điểm"', !/điểm chia đều cho người dẫn dắt/.test(ui));

  // ⚠️⚠️ BÀI HỌC 30/08/2026 — SUÝT ĐẨY LÊN MỘT BẢN LÀM CHẾT CẢ MENU TRUDO.
  // Lúc gỡ khối thang điểm, đoạn cắt ăn lan sang mấy hàm dùng chung ngay bên
  // dưới (goi/esc/ngayVN). Cả bộ kiểm thử vẫn XANH vì không ca nào mở menu
  // Trudo, mà `esc` thì trùng tên với một hàm toàn cục của index.html nên
  // càng khó lộ. Ba ca dưới đây canh đúng chỗ đó.
  for (const ham of ['goi', 'esc', 'ngayVN', 'soDep']) {
    kiem('⚠️⚠️ trudo-ui.js còn hàm dùng chung `' + ham + '` (thiếu là chết cả menu Trudo)',
      new RegExp('function\\s+' + ham + '\\s*\\(').test(ui));
  }

  // Hai mốc thêm 27/08 đã gỡ 30/08 — sổ chỉ còn Hữu hiệu và Báp-têm.
  taoCSDL();
  kiem('⚠️ mốc "bap_tem_du_le" bị chặn khi ghi sổ',
    !!(await goi('addSoMoc', [{ moc: 'bap_tem_du_le', ten: 'X', khuVuc: 'K My', ndd1: 'Y' }])).error);
  kiem('⚠️ mốc "chien_bi_mat" bị chặn khi ghi sổ',
    !!(await goi('addSoMoc', [{ moc: 'chien_bi_mat', ten: 'X', khuVuc: 'K My', ndd1: 'Y' }])).error);
  kiem('hai mốc cũ vẫn ghi được bình thường',
    !(await goi('addSoMoc', [{ moc: 'huu_hieu', ngay: '2026-07-01', ten: 'Z',
      khuVuc: 'K My', ndd1: 'Y' }])).error);
  kiem('⚠️ giao diện không còn hai tab con đó',
    !/data-sub="btdule"/.test(ui) && !/data-sub="chien"/.test(ui));

  // ⚠️ Dòng cũ còn sót trong CSDL (nếu ai đã ghi hồi 27–29/08) KHÔNG được làm
  // hỏng bảng — chỉ lặng lẽ bị bỏ qua, chứ không ném lỗi.
  await db.run(
    `INSERT INTO so_moc (moc,ngay,thang,ten,khu_vuc,ndd1,ndd2,ndd3,tao_luc)
     VALUES ('chien_bi_mat','2026-07-05','2026-07','Cũ','K My','Y','','',0)`);
  const b = await goi('getXepHang', ['2026-01-01', '2026-12-31', '']);
  kiem('⚠️ dòng mốc cũ còn sót -> bỏ qua, KHÔNG làm hỏng bảng', !b.error, b.error);
  kiem('...và không bị đếm vào cột nào',
    b.result.tomTat.soHuuHieu === 1 && b.result.tomTat.soBapTem === 0,
    JSON.stringify(b.result.tomTat));
}



// =====================================================================
console.log('\n4) Người dẫn dắt bị điền trùng tên trong 2 ô');
{
  taoCSDL();
  await goi('addSoMoc', [{ moc: 'bap_tem', ngay: '2026-08-07', ten: 'X', khuVuc: 'K My',
    ndd1: 'P Ngọc Đức', ndd2: 'P Ngọc Đức' }]);
  const b = (await goi('getXepHang', ['2026-01-01', '2026-12-31', ''])).result;
  kiem('trùng tên chỉ tính 1 người -> nhận trọn 1 ca, không phải 2',
    b.danhSach[0].soCa === 1, JSON.stringify(b.danhSach));
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
  kiem('không dòng nào thuộc về ai', b.danhSach.length === 0, JSON.stringify(b.danhSach));
  // ⚠️ Số KHÔNG được bốc hơi: vẫn vào tổng của phòng để anh Rise nhìn ra là
  // có chỗ nhập thiếu tên người dẫn dắt, chứ không phải chưa có ca nào.
  kiem('⚠️ số vẫn vào tổng của phòng', b.tomTat.soBapTem === 1 && b.tomTat.soDonThuan === 3,
    JSON.stringify(b.tomTat));
  kiem('⚠️ báo rõ phần đơn thuần chưa có người nhận', b.tomTat.soChuaCoNguoi === 3,
    'thực tế: ' + b.tomTat.soChuaCoNguoi);
  kiem('không bị chia cho 0 sinh ra NaN', Number.isFinite(b.tomTat.soDonThuan));
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
  kiem('⚠️ xếp theo Báp-têm trước', b.danhSach[0].bapTem === 1,
    JSON.stringify(b.danhSach.map((x) => [x.ten, x.bapTem])));
  kiem('ba người cùng số cùng hạng 1',
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
  // ⚠️ 30/08/2026 — bỏ hẳn trường `diem` khỏi gợi ý ghi sổ: web không còn
  // thang điểm nào để nói "mốc này được N điểm".
  kiem('⚠️ KHÔNG còn kèm số điểm của mốc', r.result.ghiSo[0].diem === undefined);

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
  kiem('chốt đúng 2 người có ca lúc đó', daChot.danhSach.length === 2);
  kiem('lưu cả tóm tắt', daChot.tomTat?.soBapTem === 1);
  kiem('ghi lại ai chốt', daChot.nguoiChot === 'chu@gmail.com');

  const idDong = sqlite.prepare("SELECT id FROM so_moc WHERE ten='Cô Loan'").get().id;
  await goi('updateSoMoc', [idDong, { ndd1: 'N Thị Ngân', ndd2: 'P Ngọc Đức', ndd3: 'V Hoàng Long' }]);
  const bangMoi = (await goi('getXepHang', ['2026-08-01', '2026-08-31', ''])).result;
  kiem('bảng tính lại ĐÃ đổi theo sổ (thêm người dẫn dắt thứ ba)',
    bangMoi.danhSach.length === 3, 'thực tế: ' + bangMoi.danhSach.length);
  const daChot2 = (await goi('getChotKy', ['2026-08'])).result;
  kiem('bảng ĐÃ CHỐT vẫn giữ nguyên 2 người — đây là điều quan trọng nhất',
    daChot2.danhSach.length === 2, 'thực tế: ' + daChot2.danhSach.length);

  r = await goi('getDsChotKy', []);
  kiem('liệt kê được các kỳ đã chốt', r.result?.length === 1 && r.result[0].ky === '2026-08');

  r = await goi('chotKy', ['2026-08', '2026-08-01', '2026-08-31', ''], CHU);
  const daChot3 = (await goi('getChotKy', ['2026-08'])).result;
  kiem('chốt lại thì cập nhật theo sổ mới', daChot3.danhSach.length === 3,
    'thực tế: ' + daChot3.danhSach.length);
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
  kiem('danh mục có đủ 97 hàm', trongDanhMuc.length === 97, 'thực tế: ' + trongDanhMuc.length);
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
process.exit(hong ? 1 : 0);
