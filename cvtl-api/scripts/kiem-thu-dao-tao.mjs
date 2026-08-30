// =====================================================================
// BỘ KIỂM THỬ OFFLINE cho 3 nhóm hàm:
//   src/handlers/dao-tao-le-hoi.js  (14 hàm)
//   src/handlers/lich-lam-viec.js   (4 hàm)
//   src/handlers/thong-ke-tp.js     (1 hàm)
// Tổng cộng 19 hàm.
//
// Cách dựng CSDL giả giống hệt scripts/kiem-thu.mjs: SQLite trong bộ nhớ
// (node:sqlite) nạp migrations/0001_init.sql, không cần mạng, không cần
// Cloudflare.
//   node scripts/kiem-thu-dao-tao.mjs
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_KHOI_TAO = readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8');

const { DANH_MUC } = await import(join(goc, 'src/registry.js'));

// --- Dựng một CSDL giả MỚI TINH -------------------------------------
// tre = true: mỗi lời gọi CSDL đều nhường lượt cho vòng lặp sự kiện trước khi
// chạy, để giả lập D1 thật (mạng có độ trễ). Nhờ vậy hai lời gọi hàm chạy
// "cùng lúc" sẽ THỰC SỰ xen kẽ nhau — đây là cách duy nhất phát hiện kiểu
// "đọc chuỗi cũ rồi ghi đè" từng làm mất dữ liệu Lễ hội.
function moiDb(tre = false) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);
  const nhuong = () => (tre ? new Promise((r) => setTimeout(r, 0)) : null);
  const db = {
    async all(sql, p = []) { await nhuong(); return sqlite.prepare(sql).all(...p); },
    async first(sql, p = []) { await nhuong(); return sqlite.prepare(sql).get(...p) ?? null; },
    async run(sql, p = []) { await nhuong(); return sqlite.prepare(sql).run(...p); },
    async batch(ds) { for (const { sql, params = [] } of ds) { await nhuong(); sqlite.prepare(sql).run(...params); } },
  };
  return { sqlite, db };
}

// --- Bộ khung kiểm thử ----------------------------------------------
let dat = 0, hong = 0;

/** Gọi một hàm API qua đúng danh mục registry, bắt lỗi thành { error }. */
async function goi(fn, args, ctx) {
  const muc = DANH_MUC[fn];
  if (!muc) return { error: 'Không hỗ trợ hàm: ' + fn };
  try {
    // ctx.execCtx (tùy chọn): giả lập ExecutionContext của Cloudflare
    // ({ waitUntil(promise) {...} }) — dùng để kiểm thử guiTelegramNgam.
    // Không truyền thì handler nhận ctx = undefined, giống hệt trước đây.
    const r = await muc.fn(
      { db: ctx.db, env: ctx.env || ENV_TRONG, ctx: ctx.execCtx, nguoiGoi: ctx.nguoiGoi || NV },
      ...args
    );
    return { result: r };
  } catch (e) {
    return { error: e.message };
  }
}

function kiem(ten, dieuKien, chiTiet = '') {
  if (dieuKien) { dat++; console.log('  ✓', ten); }
  else { hong++; console.log('  ✗', ten, chiTiet); }
}

const NV = { email: 'nhanvien@gmail.com', ten: 'Nhan vien', laChu: false };
/** env KHÔNG có TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID — đúng như thực tế hiện nay. */
const ENV_TRONG = { GOOGLE_CLIENT_ID: 'test' };

/** Hôm nay theo giờ Việt Nam — tính đúng công thức homNay() trong tien-ich.js. */
function homNayVN() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0');
}
const HOM_NAY = homNayVN();

/** Cộng n ngày vào "yyyy-MM-dd". */
function congNgay(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' +
    String(t.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(t.getUTCDate()).padStart(2, '0');
}

/** Nạp danh sách Khu vực chuẩn vào Config. */
function napKhuVuc(sqlite) {
  for (const [i, kv] of ['Đ Uyên', 'K Thành', 'K Trâm', 'K My', 'K Long', 'K Đức', 'SĐ'].entries()) {
    sqlite.prepare('INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES (?,?,?)').run('khu_vuc', kv, i);
  }
}

/**
 * Nạp danh sách thành viên (roster của Đào tạo / Lễ hội lấy từ bảng Giáo dục).
 * ds = [[khuVuc, ten], ...]
 */
function napThanhVien(sqlite, ds) {
  for (const [kv, ten] of ds) {
    sqlite.prepare(
      'INSERT INTO giao_duc_thanh_vien (thang, khu_vuc, ten, tuan, edu_lms, tt127_ngay) VALUES (?,?,?,?,?,?)'
    ).run('2026-08', kv, ten, 1, '', 0);
  }
}

/** Đọc thẳng chuỗi bài đã học trong CSDL (để kiểm tra đúng từng ký tự). */
function chuoiBai(sqlite, kv, ten) {
  const r = sqlite.prepare('SELECT bai_da_hoc FROM dao_tao_tien_do WHERE khu_vuc=? AND ten=?').get(kv, ten);
  return r ? String(r.bai_da_hoc ?? '') : null;
}

/** Đọc thẳng chuỗi "đã phát biểu" của Lễ hội. */
function chuoiPhatBieu(sqlite, ma, kv, ten) {
  const r = sqlite.prepare(
    'SELECT da_phat_bieu FROM le_hoi_tien_do WHERE ma_le_hoi=? AND khu_vuc=? AND ten=?'
  ).get(ma, kv, ten);
  return r ? String(r.da_phat_bieu ?? '') : null;
}

console.log('\n=== KIỂM THỬ ĐÀO TẠO / LỄ HỘI / LỊCH / THỐNG KÊ TP (offline) ===');

// =====================================================================
// 1) ĐÀO TẠO — tích / bỏ tích một bài (toggleDaoTaoBai)
// =====================================================================
console.log('\n1) Đào tạo — tích/bỏ tích một bài');
{
  const { sqlite, db } = moiDb();
  napKhuVuc(sqlite);
  const C = { db };
  const KV = 'SĐ', TEN = 'L H Đức';

  let r = await goi('toggleDaoTaoBai', [KV, TEN, '1-1', true], C);
  kiem('tích 1 bài -> soBai=1, phanTram=1.4',
    r.result?.soBai === 1 && r.result?.phanTram === 1.4, JSON.stringify(r));
  kiem('chuỗi trong CSDL đúng "1-1"', chuoiBai(sqlite, KV, TEN) === '1-1', chuoiBai(sqlite, KV, TEN));

  r = await goi('toggleDaoTaoBai', [KV, TEN, '1-1', false], C);
  kiem('bỏ tích bài duy nhất -> soBai=0, chuỗi rỗng',
    r.result?.soBai === 0 && chuoiBai(sqlite, KV, TEN) === '', JSON.stringify(r) + '|' + chuoiBai(sqlite, KV, TEN));

  // Tích 2 lần cùng một mã -> không được sinh mã trùng.
  await goi('toggleDaoTaoBai', [KV, TEN, '2-5', true], C);
  r = await goi('toggleDaoTaoBai', [KV, TEN, '2-5', true], C);
  kiem('tích 2 lần cùng mã không sinh trùng',
    r.result?.soBai === 1 && chuoiBai(sqlite, KV, TEN) === '2-5', chuoiBai(sqlite, KV, TEN));

  // Bỏ mã ở ĐẦU / GIỮA / CUỐI chuỗi.
  const TEN2 = 'N T Huyền';
  for (const ma of ['3-1', '3-2', '3-3']) await goi('toggleDaoTaoBai', [KV, TEN2, ma, true], C);
  kiem('dựng chuỗi 3 mã', chuoiBai(sqlite, KV, TEN2) === '3-1,3-2,3-3', chuoiBai(sqlite, KV, TEN2));

  await goi('toggleDaoTaoBai', [KV, TEN2, '3-2', false], C);
  kiem('bỏ mã ở GIỮA chuỗi', chuoiBai(sqlite, KV, TEN2) === '3-1,3-3', chuoiBai(sqlite, KV, TEN2));
  await goi('toggleDaoTaoBai', [KV, TEN2, '3-1', false], C);
  kiem('bỏ mã ở ĐẦU chuỗi', chuoiBai(sqlite, KV, TEN2) === '3-3', chuoiBai(sqlite, KV, TEN2));
  await goi('toggleDaoTaoBai', [KV, TEN2, '3-3', true], C);
  await goi('toggleDaoTaoBai', [KV, TEN2, '3-4', true], C);
  await goi('toggleDaoTaoBai', [KV, TEN2, '3-4', false], C);
  kiem('bỏ mã ở CUỐI chuỗi', chuoiBai(sqlite, KV, TEN2) === '3-3', chuoiBai(sqlite, KV, TEN2));

  r = await goi('toggleDaoTaoBai', [KV, TEN2, '5-9', false], C);
  kiem('bỏ mã CHƯA CÓ -> không lỗi, chuỗi giữ nguyên',
    r.result?.success === true && chuoiBai(sqlite, KV, TEN2) === '3-3', JSON.stringify(r));

  r = await goi('toggleDaoTaoBai', [KV, TEN2, '3-3', false], C);
  kiem('bỏ hết -> chuỗi RỖNG (không còn dấu phẩy thừa)',
    chuoiBai(sqlite, KV, TEN2) === '' && r.result?.soBai === 0, JSON.stringify(chuoiBai(sqlite, KV, TEN2)));

  // ⚠️ Ca kinh điển: "1-1" không được dính nhầm "1-10".
  const TEN3 = 'N Khánh Hoàng';
  await goi('toggleDaoTaoBai', [KV, TEN3, '1-10', true], C);
  await goi('toggleDaoTaoBai', [KV, TEN3, '1-1', true], C);
  kiem('tích "1-10" rồi "1-1" -> có ĐỦ 2 mã',
    chuoiBai(sqlite, KV, TEN3) === '1-10,1-1', chuoiBai(sqlite, KV, TEN3));
  r = await goi('toggleDaoTaoBai', [KV, TEN3, '1-1', false], C);
  kiem('bỏ "1-1" KHÔNG làm mất "1-10"',
    chuoiBai(sqlite, KV, TEN3) === '1-10' && r.result?.soBai === 1, chuoiBai(sqlite, KV, TEN3));
  r = await goi('toggleDaoTaoBai', [KV, TEN3, '1-1', true], C);
  kiem('tích lại "1-1" khi đã có "1-10" -> 2 mã',
    r.result?.soBai === 2 && chuoiBai(sqlite, KV, TEN3) === '1-10,1-1', chuoiBai(sqlite, KV, TEN3));

  // Chiều ngược lại: tích "1-1" TRƯỚC rồi mới "1-10", sau đó bỏ "1-1".
  const TEN3B = 'Người Thứ Tự Ngược';
  await goi('toggleDaoTaoBai', [KV, TEN3B, '1-1', true], C);
  await goi('toggleDaoTaoBai', [KV, TEN3B, '1-10', true], C);
  await goi('toggleDaoTaoBai', [KV, TEN3B, '1-1', false], C);
  kiem('bỏ "1-1" (đứng TRƯỚC "1-10") không làm mất "1-10"',
    chuoiBai(sqlite, KV, TEN3B) === '1-10', chuoiBai(sqlite, KV, TEN3B));

  // Chuỗi cũ (nhập tay / nhập từ Sheet) có khoảng trắng thừa.
  const TEN4 = 'Người Dữ Liệu Cũ';
  sqlite.prepare('INSERT INTO dao_tao_tien_do (khu_vuc, ten, bai_da_hoc) VALUES (?,?,?)')
    .run(KV, TEN4, '2-1, 2-2 ,2-3');
  r = await goi('toggleDaoTaoBai', [KV, TEN4, '2-2', false], C);
  kiem('chuỗi cũ có khoảng trắng thừa vẫn bỏ đúng mã',
    chuoiBai(sqlite, KV, TEN4) === '2-1,2-3' && r.result?.soBai === 2, chuoiBai(sqlite, KV, TEN4));
  r = await goi('toggleDaoTaoBai', [KV, TEN4, '2-4', true], C);
  kiem('chuỗi cũ có khoảng trắng thừa vẫn thêm đúng mã',
    chuoiBai(sqlite, KV, TEN4) === '2-1,2-3,2-4', chuoiBai(sqlite, KV, TEN4));

  // Dữ liệu vào sai -> lỗi tiếng Việt rõ ràng.
  for (const ma of ['8-1', '1-11', '', '1-0', 'abc']) {
    r = await goi('toggleDaoTaoBai', [KV, TEN, ma, true], C);
    kiem('mã bài sai "' + ma + '" bị chặn', /Mã bài không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  }
  r = await goi('toggleDaoTaoBai', ['', TEN, '1-1', true], C);
  kiem('thiếu Khu vực -> lỗi tiếng Việt', /Thiếu Khu vực/.test(r.error || ''), JSON.stringify(r));
  r = await goi('toggleDaoTaoBai', [KV, '  ', '1-1', true], C);
  kiem('thiếu Tên -> lỗi tiếng Việt', /Thiếu tên thành viên/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
// 2) ĐÀO TẠO — chọn/bỏ cả quyển và cả 70 bài
// =====================================================================
console.log('\n2) Đào tạo — chọn/bỏ cả quyển, cả 70 bài');
{
  const { sqlite, db } = moiDb();
  const C = { db };
  const KV = 'K My', TEN = 'K Minh';

  // Chạy được với người CHƯA có dòng nào trong bảng.
  let r = await goi('setDaoTaoQuyenAll', [KV, TEN, 3, true], C);
  kiem('chọn cả quyển 3 cho người CHƯA có dòng nào -> 10 bài', r.result?.soBai === 10, JSON.stringify(r));
  kiem('chuỗi đúng 10 mã quyển 3',
    chuoiBai(sqlite, KV, TEN) === '3-1,3-2,3-3,3-4,3-5,3-6,3-7,3-8,3-9,3-10', chuoiBai(sqlite, KV, TEN));

  await goi('toggleDaoTaoBai', [KV, TEN, '5-5', true], C);
  await goi('toggleDaoTaoBai', [KV, TEN, '1-1', true], C);
  r = await goi('setDaoTaoQuyenAll', [KV, TEN, 3, false], C);
  kiem('BỎ cả quyển 3 giữ nguyên bài của quyển khác',
    r.result?.soBai === 2 && chuoiBai(sqlite, KV, TEN) === '5-5,1-1', chuoiBai(sqlite, KV, TEN));

  r = await goi('setDaoTaoQuyenAll', [KV, TEN, 7, true], C);
  kiem('CHỌN cả quyển 7 giữ nguyên bài của quyển khác',
    r.result?.soBai === 12 && /^5-5,1-1,7-1,/.test(chuoiBai(sqlite, KV, TEN)), chuoiBai(sqlite, KV, TEN));

  // Chọn 2 lần cùng một quyển không sinh mã trùng.
  r = await goi('setDaoTaoQuyenAll', [KV, TEN, 7, true], C);
  kiem('chọn quyển 7 lần thứ hai không sinh mã trùng', r.result?.soBai === 12, JSON.stringify(r));

  for (const q of [0, 8, 'x', null]) {
    r = await goi('setDaoTaoQuyenAll', [KV, TEN, q, true], C);
    kiem('quyển không hợp lệ (' + q + ') bị chặn', /Quyển không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  }
  r = await goi('setDaoTaoQuyenAll', ['', TEN, 3, true], C);
  kiem('setDaoTaoQuyenAll thiếu Khu vực -> lỗi', /Thiếu Khu vực/.test(r.error || ''), JSON.stringify(r));

  // Chọn cả quyển khi ĐANG CÓ SẴN vài bài của chính quyển đó, xen kẽ quyển khác
  // (dễ sinh mã trùng nếu chỉ nối thêm mà không xoá trước).
  const TEN3 = 'K Dở Dang';
  await goi('toggleDaoTaoBai', [KV, TEN3, '1-1', true], C);
  await goi('toggleDaoTaoBai', [KV, TEN3, '3-5', true], C);
  await goi('toggleDaoTaoBai', [KV, TEN3, '1-2', true], C);
  await goi('toggleDaoTaoBai', [KV, TEN3, '1-10', true], C);
  r = await goi('setDaoTaoQuyenAll', [KV, TEN3, 1, true], C);
  const dsQ1 = (chuoiBai(sqlite, KV, TEN3) || '').split(',');
  kiem('chọn quyển 1 khi đã có sẵn vài bài quyển 1 -> đúng 11 bài, không trùng',
    r.result?.soBai === 11 && new Set(dsQ1).size === 11 && dsQ1.includes('3-5'), chuoiBai(sqlite, KV, TEN3));
  r = await goi('setDaoTaoQuyenAll', [KV, TEN3, 1, false], C);
  kiem('bỏ quyển 1 -> chỉ còn bài của quyển khác',
    chuoiBai(sqlite, KV, TEN3) === '3-5', chuoiBai(sqlite, KV, TEN3));

  // Chọn hết 70 / bỏ hết.
  const TEN2 = 'K Toàn';
  r = await goi('setDaoTaoBaiAll', [KV, TEN2, true], C);
  kiem('chọn hết 70 bài -> soBai=70, phanTram=100',
    r.result?.soBai === 70 && r.result?.phanTram === 100, JSON.stringify(r));
  kiem('chuỗi 70 mã bắt đầu "1-1," và kết thúc ",7-10"',
    /^1-1,/.test(chuoiBai(sqlite, KV, TEN2)) && /,7-10$/.test(chuoiBai(sqlite, KV, TEN2)), chuoiBai(sqlite, KV, TEN2));

  r = await goi('setDaoTaoBaiAll', [KV, TEN2, false], C);
  kiem('bỏ hết -> soBai=0, phanTram=0, chuỗi rỗng',
    r.result?.soBai === 0 && r.result?.phanTram === 0 && chuoiBai(sqlite, KV, TEN2) === '', JSON.stringify(r));

  r = await goi('setDaoTaoBaiAll', [KV, '', true], C);
  kiem('setDaoTaoBaiAll thiếu Tên -> lỗi', /Thiếu tên thành viên/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
// 3) ĐÀO TẠO — cấp chứng chỉ
// =====================================================================
console.log('\n3) Đào tạo — cấp chứng chỉ "Đứng lớp"');
{
  const { sqlite, db } = moiDb();
  const C = { db };
  const KV = 'K Long', TEN = 'K Bình';

  let r = await goi('capChungChiDaoTao', [KV, 'Người Chưa Học', C], C);
  kiem('người CHƯA có tiến độ -> lỗi rõ ràng',
    /chưa có tiến độ/.test(r.error || ''), JSON.stringify(r));

  await goi('setDaoTaoBaiAll', [KV, TEN, true], C);
  await goi('toggleDaoTaoBai', [KV, TEN, '7-10', false], C);
  r = await goi('capChungChiDaoTao', [KV, TEN], C);
  kiem('69/70 bài -> bị chặn kèm "69/70"',
    /69\/70/.test(r.error || ''), JSON.stringify(r));

  await goi('toggleDaoTaoBai', [KV, TEN, '7-10', true], C);
  r = await goi('capChungChiDaoTao', [KV, TEN], C);
  kiem('đủ 70/70 -> trả ngayCap = hôm nay', r.result?.ngayCap === HOM_NAY, JSON.stringify(r));

  // Tích / bỏ tích tiếp KHÔNG được làm mất ngày cấp đã có.
  await goi('toggleDaoTaoBai', [KV, TEN, '4-4', false], C);
  await goi('toggleDaoTaoBai', [KV, TEN, '4-4', true], C);
  const ngay = sqlite.prepare('SELECT ngay_cap_chung_chi n FROM dao_tao_tien_do WHERE khu_vuc=? AND ten=?')
    .get(KV, TEN).n;
  kiem('ngày cấp vẫn còn sau khi tích/bỏ tiếp', ngay === HOM_NAY, String(ngay));

  r = await goi('capChungChiDaoTao', ['', TEN], C);
  kiem('capChungChiDaoTao thiếu Khu vực -> lỗi', /Thiếu Khu vực/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
// 4) ĐÀO TẠO — getDaoTaoTienDoAll
// =====================================================================
console.log('\n4) Đào tạo — getDaoTaoTienDoAll');
{
  const { sqlite, db } = moiDb();
  napKhuVuc(sqlite);
  napThanhVien(sqlite, [['SĐ', 'A Một'], ['SĐ', 'B Hai'], ['K My', 'C Ba']]);
  const C = { db };

  await goi('toggleDaoTaoBai', ['SĐ', 'A Một', '1-1', true], C);
  await goi('setDaoTaoBaiAll', ['K My', 'C Ba', true], C);

  const r = await goi('getDaoTaoTienDoAll', [], C);
  const kq = r.result || {};
  kiem('gom đúng theo khu vực (2 khu vực)', Object.keys(kq).length === 2, JSON.stringify(Object.keys(kq)));
  kiem('khu vực SĐ có 2 thành viên', kq['SĐ']?.length === 2, JSON.stringify(kq['SĐ']));
  const aMot = kq['SĐ']?.find((m) => m.ten === 'A Một');
  kiem('1 bài -> soBai=1, phanTram làm tròn = 1.4',
    aMot?.soBai === 1 && aMot?.phanTram === 1.4, JSON.stringify(aMot));
  kiem('baiDaHoc trả về mảng mã bài', Array.isArray(aMot?.baiDaHoc) && aMot.baiDaHoc[0] === '1-1', JSON.stringify(aMot));
  const bHai = kq['SĐ']?.find((m) => m.ten === 'B Hai');
  kiem('người CHƯA học -> 0 bài / 0% / chưa có chứng chỉ',
    bHai?.soBai === 0 && bHai?.phanTram === 0 && bHai?.ngayCapChungChi === '', JSON.stringify(bHai));
  kiem('người học đủ 70 -> 100%', kq['K My']?.[0]?.phanTram === 100, JSON.stringify(kq['K My']));

  await goi('capChungChiDaoTao', ['K My', 'C Ba'], C);
  const r2 = await goi('getDaoTaoTienDoAll', [], C);
  kiem('ngayCapChungChi hiện ra sau khi cấp',
    r2.result?.['K My']?.[0]?.ngayCapChungChi === HOM_NAY, JSON.stringify(r2.result?.['K My']));
}

// =====================================================================
// 5) ĐÀO TẠO — việc giao
// =====================================================================
console.log('\n5) Đào tạo — việc giao');
{
  const { db } = moiDb();
  const C = { db };

  const mau = (p) => Object.assign({ khuVuc: 'SĐ', ten: 'A Một', noiDung: 'Việc' }, p);

  await goi('addDaoTaoViec', [mau({ noiDung: 'Việc hạn muộn', hanHoanThanh: '2026-09-20' })], C);
  await goi('addDaoTaoViec', [mau({ noiDung: 'Việc hạn sớm', hanHoanThanh: '2026-09-01' })], C);
  await goi('addDaoTaoViec', [mau({ noiDung: 'Việc không hạn' })], C);
  await goi('addDaoTaoViec', [mau({ khuVuc: 'K My', ten: 'C Ba', noiDung: 'Việc khu khác', hanHoanThanh: '2026-08-01' })], C);

  let r = await goi('getDaoTaoViecList', [''], C);
  kiem('không lọc -> lấy tất cả 4 việc', r.result?.length === 4, JSON.stringify(r.result?.length));
  kiem('sắp theo hạn: hạn sớm nhất lên đầu',
    r.result?.[0]?.noiDung === 'Việc khu khác', JSON.stringify(r.result?.map((v) => v.noiDung)));
  kiem('việc KHÔNG có hạn bị đẩy xuống CUỐI',
    r.result?.[3]?.noiDung === 'Việc không hạn', JSON.stringify(r.result?.map((v) => v.noiDung)));

  r = await goi('getDaoTaoViecList', ['SĐ'], C);
  kiem('lọc theo khu vực SĐ -> 3 việc', r.result?.length === 3, JSON.stringify(r.result?.length));
  kiem('lọc theo khu vực chỉ trả đúng khu đó',
    r.result?.every((v) => v.khuVuc === 'SĐ'), JSON.stringify(r.result));
  kiem('trạng thái mặc định là "Chưa làm"',
    r.result?.every((v) => v.trangThai === 'Chưa làm'), JSON.stringify(r.result?.map((v) => v.trangThai)));
  kiem('row là SỐ NGUYÊN DƯƠNG',
    r.result?.every((v) => Number.isInteger(v.row) && v.row > 0), JSON.stringify(r.result?.map((v) => v.row)));

  // Sửa / xóa bằng chính `row` mà hàm đọc trả về.
  const viec = r.result[0];
  let r2 = await goi('updateDaoTaoViec', [viec.row, mau({
    noiDung: 'Đã sửa', hanHoanThanh: viec.hanHoanThanh, trangThai: 'Hoàn thành',
  })], C);
  kiem('sửa việc bằng row lấy từ hàm đọc -> success', r2.result?.success === true, JSON.stringify(r2));
  r2 = await goi('getDaoTaoViecList', ['SĐ'], C);
  const daSua = r2.result.find((v) => v.row === viec.row);
  kiem('đọc lại thấy nội dung + trạng thái mới',
    daSua?.noiDung === 'Đã sửa' && daSua?.trangThai === 'Hoàn thành', JSON.stringify(daSua));

  r2 = await goi('deleteDaoTaoViec', [viec.row], C);
  kiem('xóa việc bằng row -> success', r2.result?.success === true, JSON.stringify(r2));
  r2 = await goi('getDaoTaoViecList', ['SĐ'], C);
  kiem('sau khi xóa còn 2 việc', r2.result?.length === 2, JSON.stringify(r2.result?.length));
  r2 = await goi('deleteDaoTaoViec', [viec.row], C);
  kiem('xóa LẦN 2 không báo lỗi', r2.result?.success === true, JSON.stringify(r2));

  r2 = await goi('updateDaoTaoViec', [viec.row, mau({ noiDung: 'X' })], C);
  kiem('sửa việc ĐÃ BỊ XÓA -> lỗi tiếng Việt rõ ràng',
    /không còn nữa/.test(r2.error || ''), JSON.stringify(r2));

  for (const xau of [-1, 0, null, 'abc']) {
    r2 = await goi('updateDaoTaoViec', [xau, mau({})], C);
    kiem('sửa với row=' + xau + ' -> lỗi rõ ràng', /Không rõ việc cần sửa/.test(r2.error || ''), JSON.stringify(r2));
    r2 = await goi('deleteDaoTaoViec', [xau], C);
    kiem('xóa với row=' + xau + ' -> lỗi rõ ràng', /Không rõ việc cần xóa/.test(r2.error || ''), JSON.stringify(r2));
  }

  r2 = await goi('addDaoTaoViec', [{ khuVuc: 'SĐ', ten: 'A Một', noiDung: '   ' }], C);
  kiem('thiếu Nội dung -> bị chặn', /nhập Nội dung/.test(r2.error || ''), JSON.stringify(r2));
  r2 = await goi('addDaoTaoViec', [{ khuVuc: '', ten: 'A Một', noiDung: 'x' }], C);
  kiem('thiếu Khu vực -> bị chặn', /chọn Khu vực/.test(r2.error || ''), JSON.stringify(r2));
  r2 = await goi('addDaoTaoViec', [{ khuVuc: 'SĐ', ten: '', noiDung: 'x' }], C);
  kiem('thiếu Thành viên -> bị chặn', /chọn Thành viên/.test(r2.error || ''), JSON.stringify(r2));
  r2 = await goi('addDaoTaoViec', [mau({ trangThai: 'Lung tung' })], C);
  kiem('trạng thái lạ -> bị chặn', /Trạng thái không hợp lệ/.test(r2.error || ''), JSON.stringify(r2));

  r2 = await goi('getDaoTaoViecList', [''], C);
  kiem('các bản ghi hỏng không được ghi vào CSDL', r2.result?.length === 3, JSON.stringify(r2.result?.length));

  // Ngày nhập kiểu Việt Nam "dd/MM/yyyy" phải được chuẩn hoá về "yyyy-MM-dd"
  // (nếu không thì sắp xếp theo hạn sẽ sai bét).
  const { db: dbN } = moiDb();
  const CN2 = { db: dbN };
  await goi('addDaoTaoViec', [mau({ noiDung: 'VN muộn', ngayGiao: '01/08/2026', hanHoanThanh: '20/09/2026' })], CN2);
  await goi('addDaoTaoViec', [mau({ noiDung: 'VN sớm', hanHoanThanh: '01/09/2026' })], CN2);
  const rN = await goi('getDaoTaoViecList', [''], CN2);
  kiem('hạn "dd/MM/yyyy" được chuẩn hoá về "yyyy-MM-dd"',
    rN.result?.[0]?.hanHoanThanh === '2026-09-01' && rN.result?.[1]?.hanHoanThanh === '2026-09-20',
    JSON.stringify(rN.result?.map((v) => v.hanHoanThanh)));
  kiem('ngày kiểu Việt Nam vẫn sắp xếp đúng thứ tự',
    rN.result?.[0]?.noiDung === 'VN sớm', JSON.stringify(rN.result?.map((v) => v.noiDung)));
}

// =====================================================================
// 6) LỄ HỘI — cấu hình, banner
// =====================================================================
console.log('\n6) Lễ hội — cấu hình / banner');
{
  // 6a. Bảng cấu hình RỖNG.
  const { db } = moiDb();
  const C = { db };
  let r = await goi('getLeHoiActive', [], C);
  kiem('bảng cấu hình rỗng -> getLeHoiActive trả null, KHÔNG ném lỗi',
    r.error === undefined && r.result === null, JSON.stringify(r));
  r = await goi('getLeHoiBanner', [], C);
  kiem('bảng cấu hình rỗng -> getLeHoiBanner trả null, KHÔNG ném lỗi',
    r.error === undefined && r.result === null, JSON.stringify(r));
  r = await goi('getLeHoiTienDoAll', ['khong-co'], C);
  kiem('mã lễ hội lạ -> getLeHoiTienDoAll báo lỗi rõ ràng',
    /Không tìm thấy lễ hội/.test(r.error || ''), JSON.stringify(r));
}
{
  // 6b. Nhiều dòng: đã qua / đang diễn ra / sắp tới.
  const { sqlite, db } = moiDb();
  const C = { db };
  const themLH = (ma, ten, bd, kt, bai, soLan) =>
    sqlite.prepare(
      `INSERT INTO le_hoi_cau_hinh (ma_le_hoi, ten_le_hoi, ngay_bat_dau, ngay_ket_thuc, danh_sach_bai, so_lan_yeu_cau)
       VALUES (?,?,?,?,?,?)`
    ).run(ma, ten, bd, kt, bai, soLan);

  themLH('sap-toi-xa', 'Sắp tới xa', congNgay(HOM_NAY, 60), congNgay(HOM_NAY, 70), '1-1', 3);
  themLH('da-qua', 'Đã qua', congNgay(HOM_NAY, -30), congNgay(HOM_NAY, -20), '1-1', 3);
  themLH('dang-dien-ra', 'Đang diễn ra', congNgay(HOM_NAY, -2), congNgay(HOM_NAY, 5), '4-6,4-7', 2);
  themLH('sap-toi-gan', 'Sắp tới gần', congNgay(HOM_NAY, 10), congNgay(HOM_NAY, 20), '1-1', 3);

  let r = await goi('getLeHoiActive', [], C);
  kiem('có nhiều dòng -> chọn ĐÚNG lễ hội đang diễn ra',
    r.result?.ma === 'dang-dien-ra', JSON.stringify(r.result));
  kiem('trả đủ danhSachBai và soLanYeuCau',
    r.result?.danhSachBai?.length === 2 && r.result?.soLanYeuCau === 2, JSON.stringify(r.result));

  r = await goi('getLeHoiBanner', [], C);
  kiem('banner ưu tiên lễ hội đang diễn ra (trangThai="active")',
    r.result?.ma === 'dang-dien-ra' && r.result?.trangThai === 'active', JSON.stringify(r.result));

  // Bỏ lễ hội đang diễn ra -> banner phải lấy cái SẮP TỚI GẦN NHẤT.
  sqlite.prepare("DELETE FROM le_hoi_cau_hinh WHERE ma_le_hoi='dang-dien-ra'").run();
  r = await goi('getLeHoiActive', [], C);
  kiem('không có lễ hội nào đang diễn ra -> getLeHoiActive = null', r.result === null, JSON.stringify(r));
  r = await goi('getLeHoiBanner', [], C);
  kiem('banner "upcoming" lấy lễ hội GẦN NHẤT',
    r.result?.ma === 'sap-toi-gan' && r.result?.trangThai === 'upcoming', JSON.stringify(r.result));

  // Chỉ còn lễ hội đã qua -> không có banner.
  sqlite.prepare("DELETE FROM le_hoi_cau_hinh WHERE ma_le_hoi LIKE 'sap-toi%'").run();
  r = await goi('getLeHoiBanner', [], C);
  kiem('chỉ còn lễ hội đã qua -> banner = null', r.result === null, JSON.stringify(r));

  // Cấu hình không khai số lần yêu cầu -> hiểu là 3 lần (giống bản cũ).
  themLH('khong-khai-so-lan', 'Không khai số lần', congNgay(HOM_NAY, -1), congNgay(HOM_NAY, 3), '1-1, 1-2', 0);
  r = await goi('getLeHoiActive', [], C);
  kiem('so_lan_yeu_cau = 0 -> mặc định 3 lần', r.result?.soLanYeuCau === 3, JSON.stringify(r.result));
  kiem('danhSachBai bỏ khoảng trắng thừa trong cấu hình',
    JSON.stringify(r.result?.danhSachBai) === JSON.stringify(['1-1', '1-2']), JSON.stringify(r.result?.danhSachBai));
}
{
  // 6c. Lễ hội chỉ cần 1 bài × 1 lần -> tích 1 ô là xong luôn.
  const { sqlite, db } = moiDb();
  const C = { db };
  napThanhVien(sqlite, [['SĐ', 'A Một']]);
  sqlite.prepare(
    `INSERT INTO le_hoi_cau_hinh (ma_le_hoi, ten_le_hoi, ngay_bat_dau, ngay_ket_thuc, danh_sach_bai, so_lan_yeu_cau)
     VALUES (?,?,?,?,?,?)`
  ).run('mot-lan', 'Một lần', congNgay(HOM_NAY, -1), congNgay(HOM_NAY, 3), '9-9', 1);

  await goi('toggleLeHoiLan', ['mot-lan', 'SĐ', 'A Một', '9-9', 1, true], C);
  let r = await goi('getLeHoiTienDoAll', ['mot-lan'], C);
  let m = r.result?.['SĐ']?.[0];
  kiem('1 bài × 1 lần: tích 1 ô -> 100% và có ngày hoàn thành ngay',
    m?.phanTram === 100 && m?.ngayHoanThanh === HOM_NAY, JSON.stringify(m));
  await goi('toggleLeHoiLan', ['mot-lan', 'SĐ', 'A Một', '9-9', 1, false], C);
  r = await goi('getLeHoiTienDoAll', ['mot-lan'], C);
  m = r.result?.['SĐ']?.[0];
  kiem('1 bài × 1 lần: bỏ tích -> 0% và xoá ngày hoàn thành',
    m?.phanTram === 0 && m?.ngayHoanThanh === '', JSON.stringify(m));
}

// =====================================================================
// 7) LỄ HỘI — tiến độ, ngày hoàn thành, xếp hạng
// =====================================================================
console.log('\n7) Lễ hội — tiến độ / ngày hoàn thành / xếp hạng');
{
  const { sqlite, db } = moiDb();
  const C = { db };
  napKhuVuc(sqlite);
  napThanhVien(sqlite, [['SĐ', 'A Một'], ['SĐ', 'B Hai'], ['K My', 'C Ba']]);
  sqlite.prepare(
    `INSERT INTO le_hoi_cau_hinh (ma_le_hoi, ten_le_hoi, ngay_bat_dau, ngay_ket_thuc, danh_sach_bai, so_lan_yeu_cau)
     VALUES (?,?,?,?,?,?)`
  ).run('lh1', 'Lễ hội 1', congNgay(HOM_NAY, -1), congNgay(HOM_NAY, 10), '4-6,4-7', 2);
  const MA = 'lh1';

  let r = await goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '4-6', 1, true], C);
  kiem('tích 1 ô -> soLanDaPhat=1', r.result?.soLanDaPhat === 1, JSON.stringify(r));
  kiem('chuỗi lưu dạng "<mã>#<lần>"', chuoiPhatBieu(sqlite, MA, 'SĐ', 'A Một') === '4-6#1',
    chuoiPhatBieu(sqlite, MA, 'SĐ', 'A Một'));

  await goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '4-6', 2, true], C);
  await goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '4-7', 1, true], C);
  r = await goi('getLeHoiTienDoAll', [MA], C);
  let aMot = r.result?.['SĐ']?.find((m) => m.ten === 'A Một');
  kiem('theoBai đếm đúng số lần từng bài',
    aMot?.theoBai['4-6'] === 2 && aMot?.theoBai['4-7'] === 1, JSON.stringify(aMot?.theoBai));
  kiem('theoBaiLan liệt kê ĐÚNG các lần đã tích',
    JSON.stringify(aMot?.theoBaiLan) === JSON.stringify({ '4-6': [1, 2], '4-7': [1] }),
    JSON.stringify(aMot?.theoBaiLan));
  kiem('tongSoLanYeuCau = số bài × số lần = 4', aMot?.tongSoLanYeuCau === 4, JSON.stringify(aMot));
  kiem('chưa đủ -> chưa có ngày hoàn thành', aMot?.ngayHoanThanh === '', JSON.stringify(aMot));

  await goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '4-7', 2, true], C);
  r = await goi('getLeHoiTienDoAll', [MA], C);
  aMot = r.result?.['SĐ']?.find((m) => m.ten === 'A Một');
  kiem('tích ĐỦ HẾT -> có ngày hoàn thành + 100%',
    aMot?.ngayHoanThanh === HOM_NAY && aMot?.phanTram === 100, JSON.stringify(aMot));

  await goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '4-6', 1, false], C);
  r = await goi('getLeHoiTienDoAll', [MA], C);
  aMot = r.result?.['SĐ']?.find((m) => m.ten === 'A Một');
  kiem('bỏ 1 ô -> XÓA ngày hoàn thành',
    aMot?.ngayHoanThanh === '' && aMot?.soLanDaPhat === 3, JSON.stringify(aMot));
  kiem('bỏ ô ở giữa không làm mất ô khác',
    JSON.stringify(aMot?.theoBaiLan) === JSON.stringify({ '4-6': [2], '4-7': [1, 2] }),
    JSON.stringify(aMot?.theoBaiLan));

  await goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '4-6', 1, true], C);
  r = await goi('getLeHoiTienDoAll', [MA], C);
  aMot = r.result?.['SĐ']?.find((m) => m.ten === 'A Một');
  kiem('tích lại -> có ngày hoàn thành trở lại', aMot?.ngayHoanThanh === HOM_NAY, JSON.stringify(aMot));

  // Người chưa tích gì.
  const bHai = r.result?.['SĐ']?.find((m) => m.ten === 'B Hai');
  kiem('người chưa tích -> 0 lần, 0%, theoBaiLan rỗng',
    bHai?.soLanDaPhat === 0 && bHai?.phanTram === 0 &&
    JSON.stringify(bHai?.theoBaiLan) === JSON.stringify({ '4-6': [], '4-7': [] }), JSON.stringify(bHai));

  // Dữ liệu vào sai.
  r = await goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '9-9', 1, true], C);
  kiem('bài NGOÀI danh sách lễ hội -> bị chặn', /Bài không thuộc lễ hội/.test(r.error || ''), JSON.stringify(r));
  r = await goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '4-6', 3, true], C);
  kiem('lần > số lần yêu cầu -> bị chặn', /Lần không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '4-6', 0, true], C);
  kiem('lần = 0 -> bị chặn', /Lần không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await goi('toggleLeHoiLan', ['lh-la', 'SĐ', 'A Một', '4-6', 1, true], C);
  kiem('mã lễ hội lạ -> bị chặn', /Không tìm thấy lễ hội/.test(r.error || ''), JSON.stringify(r));
  r = await goi('toggleLeHoiLan', ['', 'SĐ', 'A Một', '4-6', 1, true], C);
  kiem('thiếu mã lễ hội -> bị chặn', /Thiếu mã lễ hội/.test(r.error || ''), JSON.stringify(r));
  r = await goi('toggleLeHoiLan', [MA, '', 'A Một', '4-6', 1, true], C);
  kiem('thiếu Khu vực -> bị chặn', /Thiếu Khu vực/.test(r.error || ''), JSON.stringify(r));

  // Xếp hạng: A Một xong (100%), C Ba 50%, B Hai 0%.
  await goi('toggleLeHoiLan', [MA, 'K My', 'C Ba', '4-6', 1, true], C);
  await goi('toggleLeHoiLan', [MA, 'K My', 'C Ba', '4-6', 2, true], C);
  r = await goi('getLeHoiXepHang', [MA], C);
  const xh = r.result || [];
  kiem('xếp hạng gộp mọi khu vực -> 3 người', xh.length === 3, JSON.stringify(xh.length));
  kiem('người HOÀN THÀNH đứng đầu', xh[0]?.ten === 'A Một' && xh[0]?.ngayHoanThanh === HOM_NAY, JSON.stringify(xh[0]));
  kiem('sau đó xếp theo % giảm dần',
    xh[1]?.ten === 'C Ba' && xh[1]?.phanTram === 50 && xh[2]?.ten === 'B Hai' && xh[2]?.phanTram === 0,
    JSON.stringify(xh));
  kiem('xếp hạng có kèm khuVuc', xh[1]?.khuVuc === 'K My', JSON.stringify(xh[1]));
}

// =====================================================================
// 8) ⚠️ CA QUAN TRỌNG NHẤT — chống mất dữ liệu khi bấm gần như đồng thời
//    (tái hiện lỗi "Lễ hội 15/15 lùi về 13/15" của hệ thống cũ)
//    CSDL ở đây được đặt ĐỘ TRỄ nên hai lời gọi thật sự xen kẽ nhau.
// =====================================================================
console.log('\n8) ⚠️ Chống mất dữ liệu khi hai ô được tích gần như đồng thời');
{
  const { sqlite, db } = moiDb(true); // db CHẬM -> các lời gọi xen kẽ nhau
  const C = { db };
  napThanhVien(sqlite, [['SĐ', 'A Một']]);
  sqlite.prepare(
    `INSERT INTO le_hoi_cau_hinh (ma_le_hoi, ten_le_hoi, ngay_bat_dau, ngay_ket_thuc, danh_sach_bai, so_lan_yeu_cau)
     VALUES (?,?,?,?,?,?)`
  ).run('lh2', 'Lễ hội 2', congNgay(HOM_NAY, -1), congNgay(HOM_NAY, 10), '5-1,5-2,5-3', 3);
  const MA = 'lh2';

  // (a) Promise.all — hai ô KHÁC NHAU của CÙNG một người.
  await Promise.all([
    goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '5-1', 1, true], C),
    goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '5-2', 1, true], C),
  ]);
  let s = chuoiPhatBieu(sqlite, MA, 'SĐ', 'A Một') || '';
  kiem('Promise.all 2 ô -> chuỗi có ĐỦ CẢ HAI mã',
    s.split(',').includes('5-1#1') && s.split(',').includes('5-2#1'), 'chuỗi: ' + s);

  // (b) Chạy 2 lệnh XEN KẼ nhau (không dùng Promise.all): khởi động lệnh 1,
  //     nhường lượt, khởi động lệnh 2, rồi mới chờ cả hai.
  const p1 = goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '5-3', 1, true], C);
  await new Promise((r) => setTimeout(r, 0));
  const p2 = goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '5-3', 2, true], C);
  await Promise.all([p1, p2]);
  s = chuoiPhatBieu(sqlite, MA, 'SĐ', 'A Một') || '';
  kiem('2 lệnh xen kẽ -> chuỗi có ĐỦ CẢ HAI mã',
    s.split(',').includes('5-3#1') && s.split(',').includes('5-3#2'), 'chuỗi: ' + s);

  // (c) Tích 9/9 ô bằng Promise.all -> phải đủ 9, không được "lùi" xuống 7-8.
  const tatCaO = [];
  for (const bai of ['5-1', '5-2', '5-3']) {
    for (const lan of [1, 2, 3]) tatCaO.push(goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', bai, lan, true], C));
  }
  await Promise.all(tatCaO);
  s = chuoiPhatBieu(sqlite, MA, 'SĐ', 'A Một') || '';
  const ma9 = s.split(',').filter(Boolean);
  kiem('tích 9 ô đồng thời -> ĐỦ 9 mã, không mất ô nào',
    ma9.length === 9 && new Set(ma9).size === 9, 'chuỗi: ' + s);
  const ngayHT = sqlite.prepare(
    'SELECT ngay_hoan_thanh n FROM le_hoi_tien_do WHERE ma_le_hoi=? AND khu_vuc=? AND ten=?'
  ).get(MA, 'SĐ', 'A Một').n;
  kiem('đủ 9/9 sau khi bấm đồng thời -> có ngày hoàn thành', ngayHT === HOM_NAY, String(ngayHT));

  // (d) Bỏ tích đồng thời 2 ô khác nhau -> chỉ mất đúng 2 ô đó.
  await Promise.all([
    goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '5-1', 1, false], C),
    goi('toggleLeHoiLan', [MA, 'SĐ', 'A Một', '5-2', 2, false], C),
  ]);
  s = chuoiPhatBieu(sqlite, MA, 'SĐ', 'A Một') || '';
  const conLai = s.split(',').filter(Boolean);
  kiem('bỏ tích đồng thời 2 ô -> còn ĐÚNG 7 mã',
    conLai.length === 7 && !conLai.includes('5-1#1') && !conLai.includes('5-2#2'), 'chuỗi: ' + s);

  // (e) Hai NGƯỜI KHÁC NHAU bấm cùng lúc -> không ai đè ai.
  await Promise.all([
    goi('toggleLeHoiLan', [MA, 'SĐ', 'Người X', '5-1', 1, true], C),
    goi('toggleLeHoiLan', [MA, 'SĐ', 'Người Y', '5-2', 1, true], C),
  ]);
  kiem('hai người bấm cùng lúc -> mỗi người giữ đúng ô của mình',
    chuoiPhatBieu(sqlite, MA, 'SĐ', 'Người X') === '5-1#1' &&
    chuoiPhatBieu(sqlite, MA, 'SĐ', 'Người Y') === '5-2#1',
    chuoiPhatBieu(sqlite, MA, 'SĐ', 'Người X') + ' | ' + chuoiPhatBieu(sqlite, MA, 'SĐ', 'Người Y'));

  // (f) Tương tự với toggleDaoTaoBai.
  await Promise.all([
    goi('toggleDaoTaoBai', ['SĐ', 'A Một', '1-1', true], C),
    goi('toggleDaoTaoBai', ['SĐ', 'A Một', '2-2', true], C),
  ]);
  let sb = chuoiBai(sqlite, 'SĐ', 'A Một') || '';
  kiem('toggleDaoTaoBai Promise.all 2 bài -> có ĐỦ CẢ HAI',
    sb.split(',').includes('1-1') && sb.split(',').includes('2-2'), 'chuỗi: ' + sb);

  const q1 = goi('toggleDaoTaoBai', ['SĐ', 'A Một', '3-3', true], C);
  await new Promise((r) => setTimeout(r, 0));
  const q2 = goi('toggleDaoTaoBai', ['SĐ', 'A Một', '4-4', true], C);
  await Promise.all([q1, q2]);
  sb = chuoiBai(sqlite, 'SĐ', 'A Một') || '';
  kiem('toggleDaoTaoBai 2 lệnh xen kẽ -> có ĐỦ CẢ HAI',
    sb.split(',').includes('3-3') && sb.split(',').includes('4-4'), 'chuỗi: ' + sb);

  const dsTich = [];
  for (let b = 1; b <= 10; b++) dsTich.push(goi('toggleDaoTaoBai', ['SĐ', 'Người Z', '6-' + b, true], C));
  await Promise.all(dsTich);
  const sz = (chuoiBai(sqlite, 'SĐ', 'Người Z') || '').split(',').filter(Boolean);
  kiem('tích 10 bài đồng thời -> ĐỦ 10 mã, không trùng',
    sz.length === 10 && new Set(sz).size === 10, 'chuỗi: ' + sz.join(','));

  // (g) Bấm CÙNG MỘT ô nhiều lần liên tiếp (bấm nhanh / mạng lặp lại lời gọi)
  //     -> không được sinh mã trùng, vì mã trùng sẽ làm số bài và % sai lệch.
  await Promise.all(Array.from({ length: 8 }, () =>
    goi('toggleDaoTaoBai', ['SĐ', 'Người W', '2-7', true], C)));
  kiem('bấm 8 lần đồng thời CÙNG một ô -> chỉ 1 mã duy nhất',
    chuoiBai(sqlite, 'SĐ', 'Người W') === '2-7', chuoiBai(sqlite, 'SĐ', 'Người W'));
  await Promise.all(Array.from({ length: 8 }, () =>
    goi('toggleLeHoiLan', [MA, 'SĐ', 'Người W', '5-1', 1, true], C)));
  kiem('bấm 8 lần đồng thời CÙNG một ô lễ hội -> chỉ 1 mã duy nhất',
    chuoiPhatBieu(sqlite, MA, 'SĐ', 'Người W') === '5-1#1', chuoiPhatBieu(sqlite, MA, 'SĐ', 'Người W'));
}

// =====================================================================
// 9) LỊCH LÀM VIỆC — thêm / đọc / sửa / xóa
// =====================================================================
console.log('\n9) Lịch làm việc — thêm / đọc / sửa / xóa');
{
  const { db } = moiDb();
  const C = { db, env: ENV_TRONG }; // env KHÔNG có TELEGRAM_*
  const CN = '2026-08-09'; // Chủ nhật

  let r = await goi('addLichEvent', [{
    ngay: '2026-08-10', gioBatDau: '19:00', gioKetThuc: '21:00',
    noiDung: 'Lớp Kinh Thánh', nguoiPhuTrach: 'Chị A', khuVuc: 'SĐ',
    diaDiem: 'Zoom', nguoiThamGia: ['A', 'B'],
  }], C);
  kiem('KHÔNG có TELEGRAM_* -> THÊM vẫn success', r.result?.success === true, JSON.stringify(r));
  kiem('addLichEvent trả về row là số nguyên dương',
    Number.isInteger(r.result?.row) && r.result.row > 0, JSON.stringify(r));
  const rowMoi = r.result.row;

  r = await goi('getLichTuan', [CN], C);
  kiem('getLichTuan thấy đúng 1 việc', r.result?.length === 1, JSON.stringify(r.result?.length));
  const ev = r.result[0];
  kiem('trangThai mặc định "Chưa diễn ra"', ev.trangThai === 'Chưa diễn ra', ev.trangThai);
  kiem('nguoiThamGia là CHUỖI "A, B" khi gửi lên dạng mảng', ev.nguoiThamGia === 'A, B', JSON.stringify(ev.nguoiThamGia));
  kiem('row của getLichTuan trùng row của addLichEvent', ev.row === rowMoi, ev.row + ' vs ' + rowMoi);
  kiem('các trường khác đọc lại đúng',
    ev.ngay === '2026-08-10' && ev.gioBatDau === '19:00' && ev.gioKetThuc === '21:00' &&
    ev.noiDung === 'Lớp Kinh Thánh' && ev.nguoiPhuTrach === 'Chị A' && ev.khuVuc === 'SĐ' && ev.diaDiem === 'Zoom',
    JSON.stringify(ev));

  // Sửa bằng `row` lấy từ getLichTuan.
  r = await goi('updateLichEvent', [ev.row, {
    ngay: '2026-08-11', gioBatDau: '18:00', gioKetThuc: '',
    noiDung: 'Lớp Kinh Thánh (đổi giờ)', nguoiPhuTrach: 'Chị A', khuVuc: 'SĐ',
    diaDiem: 'Nhà nguyện', nguoiThamGia: 'A, B, C', trangThai: 'Đã diễn ra',
  }], C);
  kiem('KHÔNG có TELEGRAM_* -> SỬA vẫn success', r.result?.success === true, JSON.stringify(r));
  r = await goi('getLichTuan', [CN], C);
  const ev2 = r.result[0];
  kiem('sửa xong đọc lại đúng dữ liệu mới',
    ev2.ngay === '2026-08-11' && ev2.noiDung === 'Lớp Kinh Thánh (đổi giờ)' &&
    ev2.trangThai === 'Đã diễn ra' && ev2.nguoiThamGia === 'A, B, C', JSON.stringify(ev2));

  r = await goi('deleteLichEvent', [ev.row], C);
  kiem('KHÔNG có TELEGRAM_* -> XÓA vẫn success', r.result?.success === true, JSON.stringify(r));
  r = await goi('getLichTuan', [CN], C);
  kiem('xóa xong tuần đó không còn việc nào', r.result?.length === 0, JSON.stringify(r.result));
  r = await goi('deleteLichEvent', [ev.row], C);
  kiem('xóa LẦN 2 vẫn success (không báo lỗi)', r.result?.success === true, JSON.stringify(r));

  // id không tồn tại / null / âm.
  const duLieuOk = { ngay: '2026-08-10', noiDung: 'x' };
  r = await goi('updateLichEvent', [999999, duLieuOk], C);
  kiem('sửa với id KHÔNG tồn tại -> lỗi tiếng Việt, không sập',
    /Không tìm thấy công việc cần sửa/.test(r.error || ''), JSON.stringify(r));
  for (const xau of [null, -5, 0, 'abc', undefined]) {
    r = await goi('updateLichEvent', [xau, duLieuOk], C);
    kiem('sửa với id=' + xau + ' -> lỗi tiếng Việt',
      /Không rõ cần sửa công việc nào/.test(r.error || ''), JSON.stringify(r));
    r = await goi('deleteLichEvent', [xau], C);
    kiem('xóa với id=' + xau + ' -> lỗi tiếng Việt',
      /Không rõ cần xóa công việc nào/.test(r.error || ''), JSON.stringify(r));
  }
  r = await goi('deleteLichEvent', [999999], C);
  kiem('xóa id không tồn tại (số dương) -> coi như đã xóa, success', r.result?.success === true, JSON.stringify(r));
}

// =====================================================================
// 10) LỊCH LÀM VIỆC — biên tuần, thứ tự, kiểm tra dữ liệu
// =====================================================================
console.log('\n10) Lịch làm việc — biên tuần / thứ tự / kiểm tra dữ liệu');
{
  const { db } = moiDb();
  const C = { db, env: ENV_TRONG };
  const CN = '2026-08-09'; // đầu tuần

  await goi('addLichEvent', [{ ngay: congNgay(CN, -1), noiDung: 'Trước tuần' }], C);
  await goi('addLichEvent', [{ ngay: CN, noiDung: 'Ngày đầu tuần' }], C);
  await goi('addLichEvent', [{ ngay: congNgay(CN, 6), noiDung: 'Ngày cuối tuần' }], C);
  await goi('addLichEvent', [{ ngay: congNgay(CN, 7), noiDung: 'Sau tuần' }], C);

  let r = await goi('getLichTuan', [CN], C);
  const ten = (r.result || []).map((v) => v.noiDung);
  kiem('việc đúng ngayBatDau -> CÓ trong tuần', ten.includes('Ngày đầu tuần'), JSON.stringify(ten));
  kiem('việc ngày +6 -> CÓ trong tuần', ten.includes('Ngày cuối tuần'), JSON.stringify(ten));
  kiem('việc ngày -1 -> BỊ LOẠI', !ten.includes('Trước tuần'), JSON.stringify(ten));
  kiem('việc ngày +7 -> BỊ LOẠI', !ten.includes('Sau tuần'), JSON.stringify(ten));
  kiem('tuần chỉ còn đúng 2 việc', ten.length === 2, JSON.stringify(ten));

  // 3 việc cùng ngày, giờ "" / "08:00" / "19:00" -> đúng thứ tự đó.
  const { db: db2 } = moiDb();
  const C2 = { db: db2, env: ENV_TRONG };
  await goi('addLichEvent', [{ ngay: '2026-08-12', gioBatDau: '19:00', noiDung: 'Tối' }], C2);
  await goi('addLichEvent', [{ ngay: '2026-08-12', gioBatDau: '', noiDung: 'Không giờ' }], C2);
  await goi('addLichEvent', [{ ngay: '2026-08-12', gioBatDau: '08:00', noiDung: 'Sáng' }], C2);
  r = await goi('getLichTuan', [CN], C2);
  kiem('cùng ngày -> sắp theo giờ: "" rồi 08:00 rồi 19:00',
    JSON.stringify((r.result || []).map((v) => v.noiDung)) === JSON.stringify(['Không giờ', 'Sáng', 'Tối']),
    JSON.stringify((r.result || []).map((v) => v.noiDung + '@' + v.gioBatDau)));

  // Dữ liệu sai -> lỗi và KHÔNG ghi gì.
  const { db: db3, sqlite: sq3 } = moiDb();
  const C3 = { db: db3, env: ENV_TRONG };
  let r3 = await goi('addLichEvent', [{ ngay: 'khong-phai-ngay', noiDung: 'x' }], C3);
  kiem('ngày sai định dạng -> lỗi tiếng Việt', /chọn Ngày hợp lệ/.test(r3.error || ''), JSON.stringify(r3));
  r3 = await goi('addLichEvent', [{ ngay: '', noiDung: 'x' }], C3);
  kiem('thiếu ngày -> lỗi tiếng Việt', /chọn Ngày hợp lệ/.test(r3.error || ''), JSON.stringify(r3));
  r3 = await goi('addLichEvent', [{ ngay: '2026-08-12', noiDung: '   ' }], C3);
  kiem('noiDung rỗng -> lỗi tiếng Việt', /nhập Nội dung công việc/.test(r3.error || ''), JSON.stringify(r3));
  r3 = await goi('addLichEvent', [{ ngay: '2026-08-12', noiDung: 'x', trangThai: 'Lung tung' }], C3);
  kiem('trạng thái lạ -> lỗi tiếng Việt', /Trạng thái không hợp lệ/.test(r3.error || ''), JSON.stringify(r3));
  const dem = sq3.prepare('SELECT COUNT(*) c FROM lich_lam_viec').get().c;
  kiem('dữ liệu sai -> KHÔNG ghi dòng nào vào CSDL', dem === 0, 'thực tế: ' + dem + ' dòng');

  r3 = await goi('getLichTuan', ['ngay-bay-ba'], C3);
  kiem('getLichTuan với ngày sai -> lỗi tiếng Việt',
    /Ngày bắt đầu tuần không hợp lệ/.test(r3.error || ''), JSON.stringify(r3));

  // Tuần vắt qua mốc năm — dễ sai nếu tính ngày bằng chuỗi thay vì bằng lịch.
  const { db: db4 } = moiDb();
  const C4 = { db: db4, env: ENV_TRONG };
  await goi('addLichEvent', [{ ngay: '2026-12-31', noiDung: 'Cuối năm' }], C4);
  await goi('addLichEvent', [{ ngay: '2027-01-02', noiDung: 'Đầu năm' }], C4);
  await goi('addLichEvent', [{ ngay: '2027-01-04', noiDung: 'Ngoài tuần' }], C4);
  const r4 = await goi('getLichTuan', ['2026-12-28'], C4);
  kiem('tuần vắt qua mốc NĂM lấy đúng 7 ngày',
    JSON.stringify((r4.result || []).map((v) => v.noiDung)) === JSON.stringify(['Cuối năm', 'Đầu năm']),
    JSON.stringify((r4.result || []).map((v) => v.noiDung)));
}

// =====================================================================
// 11) LỊCH LÀM VIỆC — Config nguoi_dan_dat và Telegram
// =====================================================================
console.log('\n11) Lịch làm việc — Config Người dẫn dắt / Telegram');
{
  // Config CÓ nguoi_dan_dat -> tên lạ bị chặn.
  const { db, sqlite } = moiDb();
  const C = { db, env: ENV_TRONG };
  napKhuVuc(sqlite);
  for (const [i, t] of ['Chị A', 'Anh B'].entries()) {
    sqlite.prepare('INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES (?,?,?)').run('nguoi_dan_dat', t, i);
  }

  let r = await goi('addLichEvent', [{ ngay: '2026-08-12', noiDung: 'x', nguoiPhuTrach: 'Người Lạ' }], C);
  kiem('Config có Người dẫn dắt -> nguoiPhuTrach lạ BỊ CHẶN',
    /Người phụ trách/.test(r.error || ''), JSON.stringify(r));
  r = await goi('addLichEvent', [{ ngay: '2026-08-12', noiDung: 'x', nguoiThamGia: ['Chị A', 'Người Lạ'] }], C);
  kiem('Config có Người dẫn dắt -> nguoiThamGia lạ BỊ CHẶN',
    /Người tham gia/.test(r.error || ''), JSON.stringify(r));
  r = await goi('addLichEvent', [{
    ngay: '2026-08-12', noiDung: 'x', nguoiPhuTrach: 'Chị A', nguoiThamGia: ['Anh B'],
  }], C);
  kiem('tên có trong Config -> cho qua', r.result?.success === true, JSON.stringify(r));
  r = await goi('addLichEvent', [{ ngay: '2026-08-12', noiDung: 'x', khuVuc: 'Khu Vực Lạ' }], C);
  kiem('Khu vực lạ -> bị chặn', /Khu vực không hợp lệ/.test(r.error || ''), JSON.stringify(r));

  // Config RỖNG -> cho qua mọi tên.
  const { db: db2 } = moiDb();
  const C2 = { db: db2, env: ENV_TRONG };
  r = await goi('addLichEvent', [{
    ngay: '2026-08-12', noiDung: 'x', nguoiPhuTrach: 'Ai Cũng Được', nguoiThamGia: ['Bất Kỳ Ai'],
  }], C2);
  kiem('Config Người dẫn dắt RỖNG -> cho qua tên bất kỳ', r.result?.success === true, JSON.stringify(r));
  r = await goi('addLichEvent', [{ ngay: '2026-08-12', noiDung: 'x', khuVuc: 'Khu Vực Lạ' }], C2);
  kiem('Config Khu vực RỖNG -> cho qua khu vực bất kỳ', r.result?.success === true, JSON.stringify(r));

  // fetch cố tình NÉM LỖI -> lưu lịch vẫn phải thành công.
  const fetchCu = globalThis.fetch;
  let daGoiFetch = false;
  globalThis.fetch = () => { daGoiFetch = true; throw new Error('Mạng hỏng (cố tình)'); };
  const { db: db3 } = moiDb();
  const C3 = { db: db3, env: { TELEGRAM_BOT_TOKEN: 'token-gia', TELEGRAM_CHAT_ID: '123' } };
  try {
    r = await goi('addLichEvent', [{ ngay: '2026-08-12', noiDung: 'Có Telegram' }], C3);
    kiem('fetch ném lỗi -> THÊM lịch vẫn thành công', r.result?.success === true, JSON.stringify(r));
    const idMoi = r.result.row;
    r = await goi('updateLichEvent', [idMoi, { ngay: '2026-08-13', noiDung: 'Có Telegram 2' }], C3);
    kiem('fetch ném lỗi -> SỬA lịch vẫn thành công', r.result?.success === true, JSON.stringify(r));
    r = await goi('deleteLichEvent', [idMoi], C3);
    kiem('fetch ném lỗi -> XÓA lịch vẫn thành công', r.result?.success === true, JSON.stringify(r));
    kiem('có cấu hình TELEGRAM_* thì fetch ĐƯỢC gọi (đúng luồng)', daGoiFetch === true, String(daGoiFetch));
    await new Promise((res) => setTimeout(res, 10)); // chờ xem có lỗi ngầm không
  } finally {
    globalThis.fetch = fetchCu;
  }

  // fetch trả về Promise bị từ chối (kiểu lỗi mạng thật) -> vẫn phải success.
  const fetchCu2 = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('Timeout (cố tình)'));
  const { db: db4 } = moiDb();
  const C4 = { db: db4, env: { TELEGRAM_BOT_TOKEN: 'token-gia', TELEGRAM_CHAT_ID: '123' } };
  try {
    r = await goi('addLichEvent', [{ ngay: '2026-08-12', noiDung: 'Telegram timeout' }], C4);
    kiem('fetch bị từ chối -> lưu lịch vẫn thành công', r.result?.success === true, JSON.stringify(r));
    await new Promise((res) => setTimeout(res, 10));
  } finally {
    globalThis.fetch = fetchCu2;
  }

  // Có ExecutionContext (ctx.waitUntil) -> guiTelegramNgam PHẢI đăng ký việc
  // gửi tin qua đó, để Cloudflare không cắt ngang sau khi đã trả lời (sửa
  // 14/08/2026, theo yêu cầu anh Rise sau khi bật Telegram trên máy chủ mới).
  const fetchCu3 = globalThis.fetch;
  let soLanGoiFetch = 0;
  globalThis.fetch = () => { soLanGoiFetch++; return Promise.resolve({ ok: true }); };
  const daCho = [];
  const execCtxGia = { waitUntil(p) { daCho.push(p); } };
  const { db: db5 } = moiDb();
  const C5 = {
    db: db5,
    env: { TELEGRAM_BOT_TOKEN: 'token-gia', TELEGRAM_CHAT_ID: '123' },
    execCtx: execCtxGia,
  };
  try {
    r = await goi('addLichEvent', [{ ngay: '2026-08-12', noiDung: 'Có ctx.waitUntil' }], C5);
    kiem('có ctx.waitUntil -> THÊM lịch vẫn thành công', r.result?.success === true, JSON.stringify(r));
    kiem('có ctx.waitUntil -> việc gửi Telegram ĐƯỢC đăng ký qua waitUntil',
      daCho.length === 1, 'daCho.length=' + daCho.length);
    const idMoi5 = r.result.row;
    r = await goi('updateLichEvent', [idMoi5, { ngay: '2026-08-13', noiDung: 'Có ctx.waitUntil 2' }], C5);
    r = await goi('deleteLichEvent', [idMoi5], C5);
    kiem('SỬA và XÓA cũng đăng ký qua waitUntil (3 lần thêm/sửa/xóa)',
      daCho.length === 3, 'daCho.length=' + daCho.length);
    await Promise.all(daCho); // không được ném lỗi
    kiem('mọi việc đã đăng ký qua waitUntil đều chạy xong không lỗi', true);
    kiem('fetch tới Telegram thực sự được gọi', soLanGoiFetch === 3, 'soLanGoiFetch=' + soLanGoiFetch);
  } finally {
    globalThis.fetch = fetchCu3;
  }

  // KHÔNG có ctx (như trước đây, hoặc máy chủ chưa truyền ExecutionContext
  // vào) -> vẫn phải chạy bình thường, không được ném lỗi vì thiếu ctx.
  const fetchCu4 = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve({ ok: true });
  const { db: db6 } = moiDb();
  const C6 = { db: db6, env: { TELEGRAM_BOT_TOKEN: 'token-gia', TELEGRAM_CHAT_ID: '123' } }; // execCtx: undefined
  try {
    r = await goi('addLichEvent', [{ ngay: '2026-08-12', noiDung: 'Không có ctx' }], C6);
    kiem('không có ctx (execCtx=undefined) -> vẫn lưu lịch thành công, không lỗi',
      r.result?.success === true, JSON.stringify(r));
  } finally {
    globalThis.fetch = fetchCu4;
  }
}

// =====================================================================
// 12) THỐNG KÊ TP — thành viên giảm thờ phượng
// =====================================================================
console.log('\n12) Thống kê TP — thành viên giảm thờ phượng');
{
  const { sqlite, db } = moiDb();
  const C = { db };
  const NAY = '2026-08', TRUOC = '2026-07';

  const themRoster = (kv, ten, i) =>
    sqlite.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, thu_tu) VALUES (?,?,?)').run(kv, ten, i);
  const themDD = (thang, kv, ten, tuan, buoi, giaTri) =>
    sqlite.prepare('INSERT INTO diem_danh (thang, khu_vuc, ten, tuan, buoi, gia_tri) VALUES (?,?,?,?,?,?)')
      .run(thang, kv, ten, tuan, buoi, giaTri);
  const BUOI = ['T3toi', 'CNsang', 'CNchieu', 'CNtoi'];
  /** Ghi n buổi có mặt cho một người trong một tháng (rải theo tuần/buổi). */
  const ghiNBuoi = (thang, kv, ten, n) => {
    for (let i = 0; i < n; i++) themDD(thang, kv, ten, Math.floor(i / 4) + 1, BUOI[i % 4], '211');
  };

  // Người GIẢM 5 -> 2.
  themRoster('SĐ', 'Giảm Ba', 1);
  ghiNBuoi(TRUOC, 'SĐ', 'Giảm Ba', 5);
  ghiNBuoi(NAY, 'SĐ', 'Giảm Ba', 2);

  // Người GIỮ NGUYÊN 3 -> 3.
  themRoster('SĐ', 'Giữ Nguyên', 2);
  ghiNBuoi(TRUOC, 'SĐ', 'Giữ Nguyên', 3);
  ghiNBuoi(NAY, 'SĐ', 'Giữ Nguyên', 3);

  // Người TĂNG 2 -> 4.
  themRoster('SĐ', 'Tăng Lên', 3);
  ghiNBuoi(TRUOC, 'SĐ', 'Tăng Lên', 2);
  ghiNBuoi(NAY, 'SĐ', 'Tăng Lên', 4);

  // Tháng trước có đi, tháng này 0 buổi, VẪN còn trong roster.
  themRoster('SĐ', 'Vắng Hẳn', 4);
  ghiNBuoi(TRUOC, 'SĐ', 'Vắng Hẳn', 3);

  // Tháng trước có đi, tháng này 0 buổi, KHÔNG còn trong roster (đã rời).
  ghiNBuoi(TRUOC, 'SĐ', 'Đã Rời Danh Sách', 4);

  // Người GIẢM 4 (6 -> 2) để kiểm tra thứ tự so với "Giảm Ba".
  themRoster('K My', 'Giảm Bốn', 1);
  ghiNBuoi(TRUOC, 'K My', 'Giảm Bốn', 6);
  ghiNBuoi(NAY, 'K My', 'Giảm Bốn', 2);

  // Ô gia_tri toàn khoảng trắng KHÔNG được tính là có mặt:
  // tháng trước 3 buổi thật; tháng này 2 buổi thật + 1 ô "   ".
  themRoster('K Long', 'Ô Trắng', 1);
  ghiNBuoi(TRUOC, 'K Long', 'Ô Trắng', 3);
  ghiNBuoi(NAY, 'K Long', 'Ô Trắng', 2);
  themDD(NAY, 'K Long', 'Ô Trắng', 1, 'CNchieu', '   ');

  const r = await goi('getMembersDecreasedTP', [NAY], C);
  const ds = r.result || [];
  const tim = (t) => ds.find((x) => x.ten === t);

  kiem('người giảm 5->2 hiện ra với chenhLech = -3',
    tim('Giảm Ba')?.thangNay === 2 && tim('Giảm Ba')?.thangTruoc === 5 && tim('Giảm Ba')?.chenhLech === -3,
    JSON.stringify(tim('Giảm Ba')));
  kiem('người GIỮ NGUYÊN không hiện', !tim('Giữ Nguyên'), JSON.stringify(ds));
  kiem('người TĂNG không hiện', !tim('Tăng Lên'), JSON.stringify(ds));
  kiem('tháng này 0 buổi mà VẪN trong roster -> hiện thangNay=0',
    tim('Vắng Hẳn')?.thangNay === 0 && tim('Vắng Hẳn')?.thangTruoc === 3 && tim('Vắng Hẳn')?.chenhLech === -3,
    JSON.stringify(tim('Vắng Hẳn')));
  kiem('tháng này 0 buổi và KHÔNG còn trong roster -> KHÔNG hiện',
    !tim('Đã Rời Danh Sách'), JSON.stringify(ds));
  kiem('giảm 4 xếp TRƯỚC giảm 3', ds[0]?.ten === 'Giảm Bốn' && ds[0]?.chenhLech === -4,
    JSON.stringify(ds.map((x) => x.ten + ':' + x.chenhLech)));
  kiem('ô gia_tri toàn khoảng trắng KHÔNG tính là có mặt',
    tim('Ô Trắng')?.thangNay === 2 && tim('Ô Trắng')?.chenhLech === -1, JSON.stringify(tim('Ô Trắng')));
  kiem('kết quả có kèm khuVuc', tim('Giảm Bốn')?.khuVuc === 'K My', JSON.stringify(tim('Giảm Bốn')));
  kiem('mọi chenhLech đều là số ÂM', ds.every((x) => x.chenhLech < 0), JSON.stringify(ds));
  kiem('danh sách đúng 4 người giảm', ds.length === 4, JSON.stringify(ds.map((x) => x.ten)));

  // Mốc năm: '2026-01' phải so với '2025-12'.
  const { sqlite: sq2, db: db2 } = moiDb();
  const C2 = { db: db2 };
  sq2.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, thu_tu) VALUES (?,?,?)').run('SĐ', 'Qua Năm', 1);
  for (let i = 0; i < 4; i++) {
    sq2.prepare('INSERT INTO diem_danh (thang, khu_vuc, ten, tuan, buoi, gia_tri) VALUES (?,?,?,?,?,?)')
      .run('2025-12', 'SĐ', 'Qua Năm', 1, BUOI[i], '211');
  }
  sq2.prepare('INSERT INTO diem_danh (thang, khu_vuc, ten, tuan, buoi, gia_tri) VALUES (?,?,?,?,?,?)')
    .run('2026-01', 'SĐ', 'Qua Năm', 1, 'T3toi', '211');
  const r2 = await goi('getMembersDecreasedTP', ['2026-01'], C2);
  kiem("tháng '2026-01' so với '2025-12' (qua mốc năm)",
    r2.result?.[0]?.thangTruoc === 4 && r2.result?.[0]?.thangNay === 1 && r2.result?.[0]?.chenhLech === -3,
    JSON.stringify(r2.result));

  for (const xau of ['2026-8', '202608', '', null, 'thang-8']) {
    const rx = await goi('getMembersDecreasedTP', [xau], C);
    kiem('tháng sai định dạng (' + xau + ') -> lỗi tiếng Việt',
      /Tháng không hợp lệ/.test(rx.error || ''), JSON.stringify(rx));
  }
}

// =====================================================================
console.log('\n⭐ KỲ VẬN ĐỘNG TRUYỀN ĐẠO — hai loại lễ hội dùng chung bảng cấu hình');
{
  // ⭐ 30/08/2026 — cột `le_hoi_cau_hinh.loai` rẽ hai đường:
  //   'loi'        Lễ hội Lời — bài × lần, người tự tích ô (nếp cũ, mặc định)
  //   'truyen_dao' Kỳ vận động — KHÔNG có bài; tab con 🎉 Lễ hội hiện thẳng
  //                bảng 🏆 Xếp hạng, lọc theo khoảng ngày của kỳ.
  //
  // ⚠️⚠️ CA ĐẮT GIÁ: gọi nhầm hàm của Lễ hội Lời vào một kỳ vận động phải BÁO
  // LỖI. Không chặn thì `danhSachBai` rỗng cho ra tổng số lần yêu cầu = 0, và
  // màn hình hiện một lưới trống trơn trông y như web hỏng — chứ không báo gì.
  // Đó là loại lỗi im lặng khó tìm nhất.
  const { sqlite, db } = moiDb();
  const C = { db };
  napThanhVien(sqlite, [['SĐ', 'A Một']]);
  sqlite.prepare(
    `INSERT INTO le_hoi_cau_hinh (ma_le_hoi, ten_le_hoi, ngay_bat_dau, ngay_ket_thuc,
                                  danh_sach_bai, so_lan_yeu_cau, loai)
     VALUES (?,?,?,?,'',1,'truyen_dao')`
  ).run('vd-thanh-linh', 'Vận động Thánh Linh Lễ Lều Tạm',
    congNgay(HOM_NAY, -1), congNgay(HOM_NAY, 5));
  sqlite.prepare(
    `INSERT INTO le_hoi_cau_hinh (ma_le_hoi, ten_le_hoi, ngay_bat_dau, ngay_ket_thuc,
                                  danh_sach_bai, so_lan_yeu_cau)
     VALUES (?,?,?,?,?,?)`
  ).run('le-hoi-loi', 'Lễ hội Lời', congNgay(HOM_NAY, -10), congNgay(HOM_NAY, -5), '4-6,4-7', 3);

  let r = await goi('getLeHoiTienDoAll', ['vd-thanh-linh'], C);
  kiem('⚠️⚠️ getLeHoiTienDoAll với mã kỳ vận động -> CHẶN, không trả lưới rỗng',
    /không có bài/.test(r.error || ''), JSON.stringify(r));
  kiem('⚠️ câu lỗi chỉ sang hàm CÓ THẬT trong danh mục',
    /getXepHang/.test(r.error || '') && !!DANH_MUC.getXepHang, r.error);

  r = await goi('toggleLeHoiLan', ['vd-thanh-linh', 'SĐ', 'A Một', '4-6', 1, true], C);
  kiem('⚠️ toggleLeHoiLan với mã kỳ vận động -> CHẶN', !!r.error, JSON.stringify(r));

  // Chiều ngược lại: bản cũ phải chạy y như trước, không được vạ lây.
  r = await goi('getLeHoiTienDoAll', ['le-hoi-loi'], C);
  kiem('Lễ hội Lời vẫn chạy bình thường', !r.error, r.error);
  r = await goi('toggleLeHoiLan', ['le-hoi-loi', 'SĐ', 'A Một', '4-6', 1, true], C);
  kiem('...và vẫn tích ô được', !r.error, r.error);

  // Dòng cũ không có cột `loai` -> mặc định 'loi', mọi lễ hội đang chạy giữ
  // nguyên hành vi. Đây là thứ khiến bản nâng cấp không phá gì.
  const cu = sqlite.prepare("SELECT loai FROM le_hoi_cau_hinh WHERE ma_le_hoi='le-hoi-loi'").get();
  kiem('⚠️ dòng không khai loai -> mặc định "loi", bản cũ không đổi nghĩa',
    cu.loai === 'loi', JSON.stringify(cu));

  r = await goi('getLeHoiBanner', [], C);
  kiem('banner trả kèm trường loai để giao diện rẽ nhánh',
    !r.error && r.result && r.result.loai === 'truyen_dao', JSON.stringify(r.result));
  kiem('banner kèm luôn ngày bắt đầu/kết thúc để lọc bảng xếp hạng',
    !!r.result.ngayBatDau && !!r.result.ngayKetThuc, JSON.stringify(r.result));

  // Kỳ vận động lấy số từ bảng xếp hạng chung, lọc theo đúng khoảng ngày.
  sqlite.prepare(
    `INSERT INTO nhat_ky_don_thuan (ngay,khu_vuc,don_thuan,ndd1,ndd2,ndd3) VALUES (?,?,?,?,'','')`
  ).run(HOM_NAY, 'SĐ', 12, 'A Một');
  sqlite.prepare(
    `INSERT INTO nhat_ky_don_thuan (ngay,khu_vuc,don_thuan,ndd1,ndd2,ndd3) VALUES (?,?,?,?,'','')`
  ).run(congNgay(HOM_NAY, -30), 'SĐ', 999, 'A Một');
  r = await goi('getXepHang', [r.result.ngayBatDau, r.result.ngayKetThuc, ''], C);
  kiem('⚠️ bảng xếp hạng lọc ĐÚNG khoảng ngày của kỳ, dòng ngoài kỳ không lọt',
    r.result.tomTat.soDonThuan === 12, JSON.stringify(r.result.tomTat));
  kiem('⚠️ KHÔNG còn cột điểm nào trong kết quả',
    r.result.danhSach[0].diem === undefined && r.result.tomTat.tongDiem === undefined,
    JSON.stringify(r.result.danhSach[0]));
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
process.exit(hong ? 1 : 0);
