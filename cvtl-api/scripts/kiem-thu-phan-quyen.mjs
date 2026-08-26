// =====================================================================
// Kiểm thử OFFLINE cho PHẠM VI KHU VỰC (bước 2 của phân quyền, 26/08/2026)
//     node --experimental-sqlite scripts/kiem-thu-phan-quyen.mjs
//
// Anh Rise: "khu vực nào chỉ nhìn được khu vực đó thôi, không nhìn khu vực
// khác được, địa vực trưởng thì có quyền nhìn toàn bộ địa vực mình".
//
// ⚠️ ĐỢT NÀY MỚI LÀ NỀN — chưa hàm nào bị chặn. Phần 9 kiểm đúng điều đó:
// nếu vô tình nối dây sớm thì kiểm thử đỏ, vì bật chặn mà chưa chạy "chế độ
// bóng tối" 1 tuần là rủi ro lớn nhất của cả kế hoạch (chặn nhầm = khu vực
// trưởng không nhập được số của CHÍNH MÌNH).
//
// ⚠️ Phần 8 là phần đáng giá nhất: mô phỏng CSDL THẬT lúc CHƯA có cột
// pham_vi (giữa lúc đẩy mã và lúc chạy /cai-dat). Nếu mã đăng nhập liệt kê
// tên cột thì cả phòng mất quyền đăng nhập trong khoảng đó.
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_KHOI_TAO = readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8');
const { DANH_MUC } = await import(join(goc, 'src/registry.js'));
const AUTH = await import(join(goc, 'src/auth.js'));
const TC = await import(join(goc, 'src/handlers/truy-cap.js'));
const { CAU_LENH_TAO_BANG, CAU_LENH_NANG_CAP } = await import(join(goc, 'src/schema-sql.js'));

let sqlite, db;
function bocSqlite(conn) {
  return {
    async all(sql, p = []) { return conn.prepare(sql).all(...p); },
    async first(sql, p = []) { return conn.prepare(sql).get(...p) ?? null; },
    async run(sql, p = []) { const r = conn.prepare(sql).run(...p); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
    async batch(ds) { for (const { sql, params = [] } of ds) conn.prepare(sql).run(...params); },
  };
}

const KHU_VUC = ['Đ Uyên', 'K Thành', 'TT Châu', 'K Trâm', 'K My', 'K Long', 'K Đức', 'SĐ'];

function taoCSDL({ coCotPhamVi = true, coConfig = true } = {}) {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);
  if (!coCotPhamVi) {
    // Mô phỏng CSDL THẬT trước khi chạy /cai-dat: dựng lại access_control
    // KHÔNG có cột pham_vi.
    sqlite.exec('DROP TABLE access_control');
    sqlite.exec(`CREATE TABLE access_control (
      email TEXT PRIMARY KEY, trang_thai TEXT NOT NULL DEFAULT 'cho_duyet', ten TEXT,
      ngay_yeu_cau TEXT, ngay_duyet TEXT, la_chu INTEGER NOT NULL DEFAULT 0)`);
  }
  if (coConfig) {
    const st = sqlite.prepare("INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('khu_vuc', ?, ?)");
    KHU_VUC.forEach((k, i) => st.run(k, i));
  }
  db = bocSqlite(sqlite);
}

function themNguoi(email, { laChu = 0, trangThai = 'da_duyet', ten = '', phamVi = null } = {}) {
  const coCot = sqlite.prepare("SELECT COUNT(*) c FROM pragma_table_info('access_control') WHERE name='pham_vi'").get().c > 0;
  if (coCot) {
    sqlite.prepare(`INSERT INTO access_control (email, trang_thai, ten, ngay_duyet, la_chu, pham_vi)
      VALUES (?,?,?,?,?,?)`).run(email, trangThai, ten, '2026-08-01T00:00:00Z', laChu, phamVi);
  } else {
    sqlite.prepare(`INSERT INTO access_control (email, trang_thai, ten, ngay_duyet, la_chu)
      VALUES (?,?,?,?,?)`).run(email, trangThai, ten, '2026-08-01T00:00:00Z', laChu);
  }
}

function themPhien(token, email, ten = '') {
  const nay = Date.now();
  sqlite.prepare('INSERT INTO phien_dang_nhap (token, email, ten, tao_luc, het_han_luc) VALUES (?,?,?,?,?)')
    .run(token, email, ten, nay, nay + 30 * 24 * 3600 * 1000);
}

/** Bỏ hết chú thích để các phép kiểm "trong mã có/không có chữ X" không bị
 *  chính lời chú thích của mình làm nhiễu (đã dính bẫy này lúc viết bộ này). */
function boChuThich(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\n)\s*\/\/[^\n]*/g, '$1');
}
const MA_QUYEN = () => boChuThich(readFileSync(join(goc, 'src/auth.js'), 'utf8'))
  + '\n' + boChuThich(readFileSync(join(goc, 'src/handlers/truy-cap.js'), 'utf8'));

let dat = 0, hong = 0;
const kiem = (ten, ok, ct = '') => { if (ok) { dat++; console.log('  ✓', ten); } else { hong++; console.log('  ✗', ten, ct); } };
const bang = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function nem(fn) { try { await fn(); return ''; } catch (e) { return e.message || 'loi'; } }

console.log('\n=== KIỂM THỬ PHẠM VI KHU VỰC (offline) ===\n');

// ---------------------------------------------------------------------
console.log('1) Đăng ký hàm setPhamVi');
{
  kiem('có hàm setPhamVi', !!DANH_MUC.setPhamVi);
  kiem('CHỈ Chủ/Admin gọi được (chuThoi=true)', DANH_MUC.setPhamVi.chuThoi === true);
  kiem('là hàm GHI (doc=false) nên VÀO nhật ký', DANH_MUC.setPhamVi.doc === false);
  kiem('auth.js có đủ 4 hàm phạm vi',
    typeof AUTH.tachPhamVi === 'function' && typeof AUTH.gopPhamVi === 'function' &&
    typeof AUTH.phamViKhuVuc === 'function' && typeof AUTH.duocXemKhuVuc === 'function');
  kiem('CỐ Ý không có cột/hàm "vai_tro" nào (chỉ một khái niệm: phụ trách khu vực nào)',
    !/vai_tro|vaiTro/.test(MA_QUYEN()));
}

// ---------------------------------------------------------------------
console.log('\n2) tachPhamVi — đọc chuỗi thành danh sách');
{
  kiem('chuỗi 1 khu vực', bang(AUTH.tachPhamVi('K My'), ['K My']));
  kiem('chuỗi nhiều khu vực', bang(AUTH.tachPhamVi('Đ Uyên,K Thành,TT Châu'), ['Đ Uyên', 'K Thành', 'TT Châu']));
  kiem('bỏ khoảng trắng thừa', bang(AUTH.tachPhamVi('  K My ,  K Long  '), ['K My', 'K Long']));
  kiem('bỏ ô rỗng giữa chừng', bang(AUTH.tachPhamVi('K My,,K Long,'), ['K My', 'K Long']));
  kiem('rỗng -> []', bang(AUTH.tachPhamVi(''), []));
  kiem('null -> []', bang(AUTH.tachPhamVi(null), []));
  kiem('undefined -> []', bang(AUTH.tachPhamVi(undefined), []));
  kiem('nhận luôn cả mảng', bang(AUTH.tachPhamVi(['K My', ' K Long ']), ['K My', 'K Long']));
  kiem('mảng có null bên trong', bang(AUTH.tachPhamVi(['K My', null, '']), ['K My']));
  kiem('giữ nguyên dấu tiếng Việt', bang(AUTH.tachPhamVi('Đ Uyên'), ['Đ Uyên']));
}

// ---------------------------------------------------------------------
console.log('\n3) gopPhamVi — ghi danh sách thành chuỗi');
{
  kiem('nối bằng dấu phẩy', AUTH.gopPhamVi(['K My', 'K Long']) === 'K My,K Long');
  kiem('bỏ trùng', AUTH.gopPhamVi(['K My', 'K My', 'K Long']) === 'K My,K Long');
  kiem('giữ đúng thứ tự người chọn', AUTH.gopPhamVi(['SĐ', 'Đ Uyên']) === 'SĐ,Đ Uyên');
  kiem('rỗng -> chuỗi rỗng', AUTH.gopPhamVi([]) === '');
  kiem('đi vòng tách->gộp không đổi', AUTH.gopPhamVi(AUTH.tachPhamVi('Đ Uyên,K Thành')) === 'Đ Uyên,K Thành');
}

// ---------------------------------------------------------------------
console.log('\n4) phamViKhuVuc — ai xem được những khu vực nào');
{
  const chu = { email: 'rise@x.com', laChu: true, phamVi: [] };
  const kvt = { email: 'my@x.com', laChu: false, phamVi: ['K My'] };
  const dvt = { email: 'uyen@x.com', laChu: false, phamVi: ['Đ Uyên', 'K Thành', 'TT Châu'] };
  const chuaGan = { email: 'moi@x.com', laChu: false, phamVi: [] };

  kiem('Chủ/Admin thấy TOÀN BỘ', bang(AUTH.phamViKhuVuc(chu, KHU_VUC), KHU_VUC));
  kiem('Chủ thấy hết dù phamVi rỗng', AUTH.phamViKhuVuc(chu, KHU_VUC).length === 8);
  kiem('Khu vực trưởng chỉ thấy 1', bang(AUTH.phamViKhuVuc(kvt, KHU_VUC), ['K My']));
  kiem('Địa vực trưởng thấy cả 3', bang(AUTH.phamViKhuVuc(dvt, KHU_VUC), ['Đ Uyên', 'K Thành', 'TT Châu']));
  kiem('⚠️ CHƯA gán phạm vi -> KHÔNG thấy gì (không phải thấy hết)',
    bang(AUTH.phamViKhuVuc(chuaGan, KHU_VUC), []));
  kiem('người gọi null -> không thấy gì', bang(AUTH.phamViKhuVuc(null, KHU_VUC), []));
  kiem('giữ THỨ TỰ của danh sách gốc, không theo thứ tự gán',
    bang(AUTH.phamViKhuVuc({ laChu: false, phamVi: ['SĐ', 'Đ Uyên'] }, KHU_VUC), ['Đ Uyên', 'SĐ']));
  kiem('khu vực đã bị xoá khỏi Si-ôn thì tự rụng',
    bang(AUTH.phamViKhuVuc({ laChu: false, phamVi: ['K My', 'KV Cũ'] }, KHU_VUC), ['K My']));
  kiem('nhận cả phamVi dạng chuỗi',
    bang(AUTH.phamViKhuVuc({ laChu: false, phamVi: 'K My,K Long' }, KHU_VUC), ['K My', 'K Long']));
  kiem('danh sách khu vực rỗng -> []', bang(AUTH.phamViKhuVuc(kvt, []), []));
  kiem('KHÔNG sửa mảng gốc truyền vào', (() => {
    const ds = KHU_VUC.slice(); AUTH.phamViKhuVuc(kvt, ds); return ds.length === 8;
  })());
}

// ---------------------------------------------------------------------
console.log('\n5) duocXemKhuVuc — chặn/cho từng khu vực');
{
  const chu = { laChu: true, phamVi: [] };
  const kvt = { laChu: false, phamVi: ['K My'] };
  const dvt = { laChu: false, phamVi: ['Đ Uyên', 'K Thành', 'TT Châu'] };

  kiem('Chủ xem được mọi khu vực', KHU_VUC.every((k) => AUTH.duocXemKhuVuc(chu, k)));
  kiem('KVT xem được khu vực MÌNH', AUTH.duocXemKhuVuc(kvt, 'K My') === true);
  kiem('KVT KHÔNG xem được khu vực khác', AUTH.duocXemKhuVuc(kvt, 'K Long') === false);
  kiem('Địa vực trưởng xem được cả 3 khu vực trong địa vực',
    ['Đ Uyên', 'K Thành', 'TT Châu'].every((k) => AUTH.duocXemKhuVuc(dvt, k)));
  kiem('Địa vực trưởng KHÔNG xem được ngoài địa vực', AUTH.duocXemKhuVuc(dvt, 'K My') === false);
  kiem('chưa gán -> chặn hết', AUTH.duocXemKhuVuc({ laChu: false, phamVi: [] }, 'K My') === false);
  kiem('khu vực rỗng -> chặn', AUTH.duocXemKhuVuc(kvt, '') === false);
  kiem('khu vực null -> chặn', AUTH.duocXemKhuVuc(kvt, null) === false);
  kiem('bỏ khoảng trắng thừa vẫn nhận đúng', AUTH.duocXemKhuVuc(kvt, '  K My  ') === true);
  kiem('sai hoa/thường thì KHÔNG nhận (tên khu vực phải khớp đúng)',
    AUTH.duocXemKhuVuc(kvt, 'k my') === false);
  kiem('người gọi null -> chặn', AUTH.duocXemKhuVuc(null, 'K My') === false);
  kiem('Chủ vẫn qua kể cả khu vực rỗng', AUTH.duocXemKhuVuc(chu, '') === true);
}

// ---------------------------------------------------------------------
console.log('\n6) setPhamVi — gán khu vực (chạy thật trên CSDL)');
{
  taoCSDL();
  themNguoi('rise.shine1948@gmail.com', { laChu: 1, ten: 'Rise' });
  themNguoi('my@x.com', { ten: 'K My' });
  themNguoi('uyen@x.com', { ten: 'Đ Uyên' });
  themNguoi('cho@x.com', { ten: 'Chờ duyệt', trangThai: 'cho_duyet' });

  const r1 = await TC.setPhamVi({ db }, 'my@x.com', ['K My']);
  kiem('gán 1 khu vực -> ok', r1.ok === true && bang(r1.phamVi, ['K My']));
  kiem('lưu đúng vào CSDL',
    sqlite.prepare('SELECT pham_vi p FROM access_control WHERE email=?').get('my@x.com').p === 'K My');

  await TC.setPhamVi({ db }, 'uyen@x.com', ['Đ Uyên', 'K Thành', 'TT Châu']);
  kiem('gán nhiều khu vực (địa vực trưởng)',
    sqlite.prepare('SELECT pham_vi p FROM access_control WHERE email=?').get('uyen@x.com').p === 'Đ Uyên,K Thành,TT Châu');

  kiem('gán khu vực KHÔNG tồn tại -> báo lỗi rõ tên',
    (await nem(() => TC.setPhamVi({ db }, 'my@x.com', ['K Mỹ']))).includes('K Mỹ'));
  kiem('gán sai KHÔNG làm hỏng giá trị cũ',
    sqlite.prepare('SELECT pham_vi p FROM access_control WHERE email=?').get('my@x.com').p === 'K My');
  kiem('TT Châu (chỉ có trong Cấu hình, không có trong hằng số) vẫn hợp lệ',
    (await nem(() => TC.setPhamVi({ db }, 'my@x.com', ['TT Châu']))) === '');
  kiem('gán cho người CHƯA được duyệt -> chặn',
    (await nem(() => TC.setPhamVi({ db }, 'cho@x.com', ['K My']))).includes('duyệt'));
  kiem('email không có trong hệ thống -> chặn',
    (await nem(() => TC.setPhamVi({ db }, 'ai@do.com', ['K My']))).length > 0);
  kiem('thiếu email -> chặn', (await nem(() => TC.setPhamVi({ db }, '', ['K My']))).includes('Thiếu'));

  await TC.setPhamVi({ db }, 'my@x.com', []);
  kiem('gán danh sách RỖNG = bỏ phụ trách',
    sqlite.prepare('SELECT pham_vi p FROM access_control WHERE email=?').get('my@x.com').p === '');
  await TC.setPhamVi({ db }, 'MY@X.COM', ['K My']);
  kiem('email viết HOA vẫn gán đúng người',
    sqlite.prepare('SELECT pham_vi p FROM access_control WHERE email=?').get('my@x.com').p === 'K My');
  await TC.setPhamVi({ db }, 'my@x.com', ['K My', 'K My', 'K Long']);
  kiem('gán trùng tên -> tự bỏ trùng',
    sqlite.prepare('SELECT pham_vi p FROM access_control WHERE email=?').get('my@x.com').p === 'K My,K Long');
  kiem('gán lại KHÔNG đụng tới cột la_chu',
    sqlite.prepare('SELECT la_chu c FROM access_control WHERE email=?').get('my@x.com').c === 0);
  kiem('gán lại KHÔNG đụng tới trang_thai',
    sqlite.prepare("SELECT trang_thai t FROM access_control WHERE email=?").get('my@x.com').t === 'da_duyet');
}

// ---------------------------------------------------------------------
console.log('\n7) getApprovedAccess / checkAccess phải TRẢ VỀ phạm vi');
{
  taoCSDL();
  themNguoi('rise.shine1948@gmail.com', { laChu: 1, ten: 'Rise' });
  themNguoi('my@x.com', { ten: 'K My', phamVi: 'K My' });
  themNguoi('uyen@x.com', { ten: 'Đ Uyên', phamVi: 'Đ Uyên,K Thành,TT Châu' });
  themNguoi('moi@x.com', { ten: 'Chưa gán' });

  const ds = await TC.getApprovedAccess({ db });
  const tim = (e) => ds.find((x) => x.email === e);
  kiem('danh sách đủ 4 người', ds.length === 4);
  kiem('KVT trả về đúng 1 khu vực', bang(tim('my@x.com').phamVi, ['K My']));
  kiem('Địa vực trưởng trả về đủ 3', bang(tim('uyen@x.com').phamVi, ['Đ Uyên', 'K Thành', 'TT Châu']));
  kiem('người chưa gán -> mảng rỗng', bang(tim('moi@x.com').phamVi, []));
  kiem('mọi dòng đều CÓ trường phamVi (giao diện khỏi phải kiểm null)',
    ds.every((x) => Array.isArray(x.phamVi)));
  kiem('vẫn giữ nguyên cờ chủ tài khoản gốc', tim('rise.shine1948@gmail.com').laChuVinhVien === true);

  themPhien('SESS.abc', 'my@x.com', 'K My');
  const ck = await TC.checkAccess({ db, env: {}, token: 'SESS.abc' });
  kiem('checkAccess cho vào', ck.authorized === true);
  kiem('checkAccess trả kèm phamVi', bang(ck.phamVi, ['K My']));
  kiem('checkAccess vẫn trả laChu', ck.laChu === false);

  themPhien('SESS.chu', 'rise.shine1948@gmail.com', 'Rise');
  const ck2 = await TC.checkAccess({ db, env: {}, token: 'SESS.chu' });
  kiem('chủ tài khoản: laChu = true', ck2.laChu === true);
  kiem('chủ tài khoản: phamVi rỗng nhưng KHÔNG sao (xem toàn Si-ôn)', bang(ck2.phamVi, []));

  const ng = await AUTH.nhanDienNguoiGoi(db, 'SESS.abc', '');
  kiem('nhanDienNguoiGoi trả kèm phamVi', bang(ng.phamVi, ['K My']));
  kiem('nhanDienNguoiGoi trả đúng email', ng.email === 'my@x.com');
  kiem('ghép được thẳng vào phamViKhuVuc', bang(AUTH.phamViKhuVuc(ng, KHU_VUC), ['K My']));
}

// ---------------------------------------------------------------------
console.log('\n8) ⚠️ TƯƠNG THÍCH NGƯỢC — CSDL CHƯA có cột pham_vi');
{
  // Đây là khoảng thời gian giữa lúc đẩy mã mới lên và lúc gọi /cai-dat.
  // Nếu mã đăng nhập liệt kê tên cột thì CẢ PHÒNG mất quyền đăng nhập.
  taoCSDL({ coCotPhamVi: false });
  themNguoi('my@x.com', { ten: 'K My' });
  themPhien('SESS.cu', 'my@x.com', 'K My');

  const coCot = sqlite.prepare("SELECT COUNT(*) c FROM pragma_table_info('access_control') WHERE name='pham_vi'").get().c;
  kiem('đã dựng đúng bảng KIỂU CŨ (không có pham_vi)', coCot === 0);

  const loi = await nem(async () => {
    const ng = await AUTH.nhanDienNguoiGoi(db, 'SESS.cu', '');
    if (!bang(ng.phamVi, [])) throw new Error('phamVi phải là []');
  });
  kiem('⚠️ nhanDienNguoiGoi VẪN CHẠY, phamVi = []', loi === '', loi);

  const ck = await TC.checkAccess({ db, env: {}, token: 'SESS.cu' });
  kiem('⚠️ checkAccess VẪN cho đăng nhập', ck.authorized === true);
  kiem('checkAccess trả phamVi = []', bang(ck.phamVi, []));

  const ds = await TC.getApprovedAccess({ db });
  kiem('getApprovedAccess vẫn chạy', ds.length === 1 && bang(ds[0].phamVi, []));

  // Lưới an toàn cho chính bài học trên: cấm hẳn kiểu SELECT liệt kê tên cột
  // trên bảng access_control — chỉ được SELECT * hoặc SELECT các cột CŨ.
  kiem('KHÔNG câu SELECT nào trên access_control liệt kê cột pham_vi',
    !/SELECT\s+[^*][^']*\bpham_vi\b[^']*FROM\s+access_control/i.test(MA_QUYEN()));
}

// ---------------------------------------------------------------------
console.log('\n9) ⚠️ CHẶN THEO KHU VỰC Ở ROUTER — khuVucBiChan');
{
  const NK = await import(join(goc, 'src/nhat-ky.js'));
  const chu = { laChu: true, phamVi: [] };
  const kvt = { laChu: false, phamVi: ['K My'] };
  const dvt = { laChu: false, phamVi: ['Đ Uyên', 'K Thành', 'TT Châu'] };
  const chuaGan = { laChu: false, phamVi: [] };
  // saveTPWeek(thang, khuVuc, ...) -> khuVuc ở vị trí 1
  const viTri = NK.VI_TRI_KHU_VUC;
  const goi = (fn, kv, ai) => {
    const a = []; a[viTri[fn]] = kv; return AUTH.khuVucBiChan(fn, a, ai);
  };

  kiem('KVT gọi ĐÚNG khu vực mình -> cho qua', goi('saveTPWeek', 'K My', kvt) === '');
  kiem('KVT gọi khu vực KHÁC -> chặn, nêu đúng tên', goi('saveTPWeek', 'K Long', kvt) === 'K Long');
  kiem('Địa vực trưởng gọi trong địa vực -> cho qua', goi('getKhuVucOverview', 'K Thành', dvt) === '');
  kiem('Địa vực trưởng gọi NGOÀI địa vực -> chặn', goi('getKhuVucOverview', 'K My', dvt) === 'K My');
  kiem('Chủ/Admin gọi khu vực nào cũng qua',
    ['K My', 'K Long', 'SĐ'].every((k) => goi('saveCVCongViec', k, chu) === ''));
  kiem('CHƯA gán phạm vi -> chặn', goi('saveTPWeek', 'K My', chuaGan) === 'K My');
  kiem('hàm KHÔNG có khuVuc -> không đụng tới', AUTH.khuVucBiChan('getStats', ['2026-08'], kvt) === '');
  kiem('hàm lạ không có trong bảng -> không đụng tới', AUTH.khuVucBiChan('linhTinh', ['x'], kvt) === '');
  kiem('người gọi null (chưa đăng nhập) -> để router xử, không chặn ở đây',
    goi('saveTPWeek', 'K My', null) === '');
  kiem('gọi với khu vực RỖNG -> đánh dấu "(trống)" chứ không chặn thẳng',
    goi('saveTPWeek', '', kvt) === '(trống)');
  kiem('tham số không phải chuỗi -> cũng là "(trống)"',
    AUTH.khuVucBiChan('saveTPWeek', ['2026-08', 123], kvt) === '(trống)');
  kiem('⚠️ getXepHang được MIỄN chặn (xếp hạng công khai toàn Si-ôn)',
    goi('getXepHang', 'K Long', kvt) === '');
  kiem('danh sách miễn chặn có đúng getXepHang',
    AUTH.MIEN_CHAN_KHU_VUC.length === 1 && AUTH.MIEN_CHAN_KHU_VUC[0] === 'getXepHang');
  kiem('mọi hàm trong VI_TRI_KHU_VUC đều CHẶN được KVT lạ',
    Object.keys(viTri).filter((f) => AUTH.MIEN_CHAN_KHU_VUC.indexOf(f) < 0)
      .every((f) => goi(f, 'K Long', kvt) === 'K Long'));
  kiem('bảng luật phủ ít nhất 30 hàm', Object.keys(viTri).length >= 30);
}

// ---------------------------------------------------------------------
console.log('\n9b) Câu báo lỗi phải DỄ HIỂU (người dùng đọc câu này)');
{
  const kvt = { laChu: false, phamVi: ['K My'] };
  const chuaGan = { laChu: false, phamVi: [] };
  const c1 = AUTH.loiNgoaiPhamVi('K Long', kvt);
  kiem('nêu rõ khu vực bị chặn', c1.includes('K Long'));
  kiem('nói luôn mình đang phụ trách gì', c1.includes('K My'));
  kiem('không có từ kỹ thuật', !/error|undefined|null|SQL/i.test(c1));
  const c2 = AUTH.loiNgoaiPhamVi('K My', chuaGan);
  kiem('chưa gán -> chỉ đường đi hỏi ai', c2.includes('Trưởng phòng') && c2.includes('Duyệt truy cập'));
  kiem('chưa gán -> KHÔNG đổ lỗi cho người dùng', !/không được phép|cấm/i.test(c2));
}

// ---------------------------------------------------------------------
console.log('\n9c) ⚠️ ROUTER phải nối dây ĐÚNG chế độ BÓNG TỐI');
{
  const nguon = readFileSync(join(goc, 'src/index.js'), 'utf8');
  kiem('router có gọi khuVucBiChan', /const viPham = khuVucBiChan\(fn, args, nguoiGoi\)/.test(nguon));
  kiem('đặt SAU khi đã xác thực người gọi',
    nguon.indexOf('nhanDienNguoiGoi(db, token') < nguon.indexOf('khuVucBiChan(fn, args'));
  kiem('đặt TRƯỚC khi chạy hàm nghiệp vụ',
    nguon.indexOf('khuVucBiChan(fn, args') < nguon.indexOf('await muc.fn(boiCanh'));
  kiem('mọi vi phạm đều ghi nhật ký bóng tối', /loai: 'bong_toi'/.test(nguon));
  kiem('⚠️ MẶC ĐỊNH là bóng tối (env thiếu -> "0")', /env\.PHAN_QUYEN_THAT \|\| '0'/.test(nguon));
  kiem('chỉ chặn thật khi công tắc = "1"', /=== '1'/.test(nguon));
  kiem('⚠️ khu vực RỖNG thì KHÔNG BAO GIỜ chặn thật', /viPham !== '\(trống\)'/.test(nguon));
  kiem('câu báo lỗi lấy từ loiNgoaiPhamVi', /loiNgoaiPhamVi\(viPham, nguoiGoi\)/.test(nguon));
  kiem('KHÔNG ghi token vào nhật ký', !/token: token|thamSo: token/.test(nguon));

  const wr = readFileSync(join(goc, 'wrangler.toml'), 'utf8');
  kiem('⚠️ PHAN_QUYEN_THAT có khai trong wrangler.toml (Cạm bẫy #1)',
    /PHAN_QUYEN_THAT\s*=\s*"0"/.test(wr));
  kiem('wrangler.toml đang để BÓNG TỐI, chưa bật thật', /PHAN_QUYEN_THAT\s*=\s*"0"/.test(wr));
  kiem('vẫn giữ [observability] (đừng xoá)', /\[observability\]/.test(wr));
  kiem('vẫn giữ cron kiểm tra sức khoẻ', /crons = \["0 23 \* \* \*"\]/.test(wr));
}

// ---------------------------------------------------------------------
console.log('\n10) Nâng cấp bảng cũ — CAU_LENH_NANG_CAP');
{
  kiem('schema-sql.js có xuất CAU_LENH_NANG_CAP', Array.isArray(CAU_LENH_NANG_CAP));
  kiem('có đúng câu ALTER thêm cột pham_vi',
    CAU_LENH_NANG_CAP.some((s) => /ALTER TABLE access_control ADD COLUMN pham_vi/i.test(s)));
  kiem('CREATE TABLE trong schema-sql.js cũng đã có pham_vi',
    CAU_LENH_TAO_BANG.some((s) => /access_control/.test(s) && /pham_vi/.test(s)));
  kiem('migrations/0001_init.sql cũng đã có pham_vi',
    /CREATE TABLE IF NOT EXISTS access_control[\s\S]*?pham_vi[\s\S]*?\);/.test(SQL_KHOI_TAO));
  kiem('⚠️ migrations KHÔNG chứa ALTER (chạy lại nhiều lần sẽ hỏng)',
    !/ALTER TABLE/i.test(SQL_KHOI_TAO.replace(/--[^\n]*/g, '')));

  // Chạy thật câu ALTER lên bảng kiểu CŨ, rồi chạy lại lần 2.
  taoCSDL({ coCotPhamVi: false });
  let l1 = '', l2 = '';
  try { sqlite.exec(CAU_LENH_NANG_CAP[0]); } catch (e) { l1 = e.message; }
  try { sqlite.exec(CAU_LENH_NANG_CAP[0]); } catch (e) { l2 = e.message; }
  kiem('lần 1 thêm được cột', l1 === '' &&
    sqlite.prepare("SELECT COUNT(*) c FROM pragma_table_info('access_control') WHERE name='pham_vi'").get().c === 1);
  kiem('lần 2 báo đúng "duplicate column name"', /duplicate column name/i.test(l2), l2);

  const nguon = readFileSync(join(goc, 'src/index.js'), 'utf8');
  kiem('/cai-dat có chạy CAU_LENH_NANG_CAP', /for \(const sql of CAU_LENH_NANG_CAP/.test(nguon));
  kiem('/cai-dat COI TRÙNG CỘT là bình thường', /duplicate column name/i.test(nguon));
  kiem('/cai-dat vẫn trả về danh sách bảng', /danhSachBang/.test(nguon));
}

// ---------------------------------------------------------------------
console.log('\n11) Nhật ký (đợt 1) phải ghi lại việc gán quyền');
{
  const NK = await import(join(goc, 'src/nhat-ky.js'));
  kiem('setPhamVi được coi là hàm GHI -> vào nhật ký', NK.laHamGhi(DANH_MUC.setPhamVi) === true);
  kiem('setPhamVi KHÔNG khai trong VI_TRI_KHU_VUC (tham số là DANH SÁCH khu vực)',
    NK.VI_TRI_KHU_VUC.setPhamVi === undefined);
  kiem('khuVucCuaLoiGoi với mảng -> chuỗi rỗng, không hỏng',
    NK.khuVucCuaLoiGoi('setPhamVi', ['my@x.com', ['K My']]) === '');
  kiem('tham số gán quyền vẫn tóm tắt được',
    NK.tomTatThamSo(['my@x.com', ['K My']]).includes('K My'));
}

console.log('\n=== KẾT QUẢ: ' + dat + ' đạt, ' + hong + ' hỏng ===\n');
process.exit(hong ? 1 : 0);
