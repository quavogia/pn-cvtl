// =====================================================================
// Kiểm thử OFFLINE cho src/handlers/bao-cao.js — TAB BÁO CÁO:
//     node scripts/kiem-thu-bao-cao.mjs
//
// ⭐ Mục tiêu của tab: tạo THÓI QUEN nhập đủ 5 hạng mục mỗi tuần.
//
// ⚠️⚠️ TRỌNG TÂM SỐ MỘT CỦA BỘ NÀY LÀ "KHÔNG BÁO THIẾU OAN".
// Một bảng kiểm báo thiếu oan một lần là cả phòng mất tin, rồi bỏ qua luôn
// những cảnh báo THẬT — tính năng coi như hỏng dù mã chạy đúng. Vì vậy quá
// nửa số ca dưới đây kiểm đúng một điều: những lúc nào hệ thống PHẢI IM
// LẶNG thay vì kêu "thiếu".
//
// Bốn cái bẫy đã biết, mỗi cái có ca riêng:
//   1. TUẦN 1 tháng 8/2026 chỉ có MỘT buổi (T7 ngày 1/8) nên "≥4 lần" không
//      thể khác 0 -> KHÔNG được đòi đủ cả 2 dòng Thờ phượng.
//   2. TUẦN 6 chỉ gồm ngày 30/31, không bao giờ có T3/T7, và các bảng nhập
//      tay chỉ nhận tuần 1..5 -> phải hiện "—" chứ không phải "thiếu".
//   3. BUỔI CHƯA TỚI NGÀY không phải là thiếu (hôm 26/08 là thứ Tư, T7 của
//      tuần là 29/08) -> tuần chưa hết hạn thì trạng thái là "chua".
//   4. ĐÀO TẠO / LỄ HỘI chỉ biết được qua nhật ký thay đổi, mà nhật ký bật
//      từ 26/08/2026 -> tuần kết thúc trước đó phải ra "chua_du_du_lieu".
//
// Và một cái bẫy nữa, phát hiện lúc viết mã: DẤU VẾT lúc bấm Báo cáo chỉ
// được chụp "có dữ liệu hay không", KHÔNG chụp ✅/⏳/⚠️ — vì trạng thái tự
// đổi theo ngày, chụp nó thì qua hạn là cả phòng bị gắn cờ "đã sửa sau báo
// cáo" dù không ai đụng gì.
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_KHOI_TAO = readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8');
const { DANH_MUC } = await import(join(goc, 'src/registry.js'));
const BC = await import(join(goc, 'src/handlers/bao-cao.js'));
const { cacTuanCuaThang } = await import(join(goc, 'src/lich-tuan.js'));

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

const KHU_VUC = ['Đ Uyên', 'K Thành', 'TT Châu', 'K My'];

function taoCSDL() {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);
  db = bocSqlite(sqlite);
  for (const [i, kv] of KHU_VUC.entries())
    sqlite.prepare("INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('khu_vuc',?,?)").run(kv, i + 1);
}

// --- người gọi ---
const CHU = { email: 'chu@gmail.com', ten: 'Trưởng phòng', laChu: true };
const KVT = { email: 'kvt@gmail.com', ten: 'KVT K My', laChu: false, phamVi: 'K My' };
const DVT = { email: 'dvt@gmail.com', ten: 'Địa vực', laChu: false, phamVi: 'Đ Uyên,K Thành,TT Châu' };
const THANH_DO = { email: 'td@gmail.com', ten: 'Thánh đồ', laChu: false, phamVi: '' };

let tinNhan = [];

async function goi(fn, args = [], nguoiGoi = CHU) {
  const muc = DANH_MUC[fn];
  if (!muc) return { error: 'Không hỗ trợ hàm: ' + fn };
  try {
    const env = {
      TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_CHAT_ID: 'y',
    };
    const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); } };
    return { result: await muc.fn({ db, env, ctx, nguoiGoi }, ...args) };
  } catch (e) {
    return { error: e.message };
  }
}

let dat = 0, hong = 0;
function kiem(ten, dieuKien, chiTiet = '') {
  if (dieuKien) { dat++; console.log('  ✓', ten); }
  else { hong++; console.log('  ✗', ten, chiTiet); }
}

/** Lấy trạng thái một ô trong bảng kiểm. */
function o(bang, tuan, ma) {
  const t = (bang.tuan || []).find((x) => x.tuan === tuan);
  if (!t) return '(khong co tuan)';
  const h = t.hangMuc.find((x) => x.ma === ma);
  return h ? h.trangThai : '(khong co hang muc)';
}

// --- các hàm gieo dữ liệu, viết đúng như hệ thống thật ghi ---
const gieoTP = (kv, thang, tuan, loai, sl) => sqlite.prepare(
  'INSERT INTO tp_tho_phuong (thang, khu_vuc, loai, tuan, so_luong) VALUES (?,?,?,?,?)'
).run(thang, kv, loai, tuan, sl);

const gieoGD = (kv, thang, ten, tuan, edu) => sqlite.prepare(
  'INSERT INTO giao_duc_thanh_vien (thang, khu_vuc, ten, tuan, edu_lms, tt127_ngay) VALUES (?,?,?,?,?,0)'
).run(thang, kv, ten, tuan, edu);

const gieoCV = (kv, ten, thang, tuan, buoi, ngay, v) => sqlite.prepare(
  'INSERT INTO cv_cong_viec (khu_vuc, ten, thang, tuan, buoi, ngay, gia_tri) VALUES (?,?,?,?,?,?,?)'
).run(kv, ten, thang, tuan, buoi, ngay, v);

const gieoDonThuan = (kv, ngay, n) => sqlite.prepare(
  'INSERT INTO nhat_ky_don_thuan (ngay, khu_vuc, don_thuan) VALUES (?,?,?)'
).run(ngay, kv, n);

const gieoMoc = (kv, moc, ngay, ten) => sqlite.prepare(
  'INSERT INTO so_moc (moc, ngay, thang, ten, khu_vuc, tao_luc) VALUES (?,?,?,?,?,?)'
).run(moc, ngay, ngay.slice(0, 7), ten, kv, Date.now());

const gieoNhatKy = (ham, kv, ms, ketQua) => sqlite.prepare(
  "INSERT INTO nhat_ky_thay_doi (thoi_gian_ms, loai, email, ham, khu_vuc, ket_qua) VALUES (?,'ghi','ai@do.com',?,?,?)"
).run(ms, ham, kv, ketQua || 'ok');

const gieoLeHoi = (ma, ten, tu, den) => sqlite.prepare(
  'INSERT INTO le_hoi_cau_hinh (ma_le_hoi, ten_le_hoi, ngay_bat_dau, ngay_ket_thuc, danh_sach_bai, so_lan_yeu_cau)'
  + " VALUES (?,?,?,?,'4-6,4-7',3)"
).run(ma, ten, tu, den);

/** 'yyyy-MM-dd' 12:00 giờ VN -> mili-giây (giữa ngày cho chắc, khỏi lệch múi giờ). */
function msGiuaNgayVN(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 12) - 7 * 3600 * 1000;
}

console.log('\n=== KIỂM THỬ TAB BÁO CÁO (offline) ===\n');

// =====================================================================
console.log('1) Đăng ký hàm + phân quyền khai trong danh mục');
{
  kiem('có getBaoCaoTuan', !!DANH_MUC.getBaoCaoTuan);
  kiem('có getBaoCaoLuoi', !!DANH_MUC.getBaoCaoLuoi);
  kiem('có saveBaoCaoTuan', !!DANH_MUC.saveBaoCaoTuan);
  kiem('có huyBaoCaoTuan', !!DANH_MUC.huyBaoCaoTuan);
  kiem('getBaoCaoTuan là hàm ĐỌC', DANH_MUC.getBaoCaoTuan.doc === true);
  kiem('getBaoCaoLuoi là hàm ĐỌC', DANH_MUC.getBaoCaoLuoi.doc === true);
  kiem('saveBaoCaoTuan là hàm GHI', DANH_MUC.saveBaoCaoTuan.doc !== true);
  // ⚠️ Ba hàm này KHÔNG được đặt chuThoi — khu vực trưởng phải gọi được cho
  // khu vực của mình. Chặn nằm TRONG hàm, bằng phạm vi khu vực.
  kiem('getBaoCaoTuan KHÔNG chuThoi (KVT phải xem được)', !DANH_MUC.getBaoCaoTuan.chuThoi);
  kiem('getBaoCaoLuoi KHÔNG chuThoi', !DANH_MUC.getBaoCaoLuoi.chuThoi);
  kiem('saveBaoCaoTuan KHÔNG chuThoi (KVT phải bấm được)', !DANH_MUC.saveBaoCaoTuan.chuThoi);
  // Gỡ báo cáo thì chỉ Trưởng phòng / Admin, giống nút "Hủy báo cáo" cũ.
  kiem('huyBaoCaoTuan CHỈ chủ/Admin', DANH_MUC.huyBaoCaoTuan.chuThoi === true);
}

// =====================================================================
console.log('\n2) Bảng bao_cao_tuan có thật trong migration');
{
  taoCSDL();
  const b = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='bao_cao_tuan'"
  ).get();
  kiem('migration tạo được bảng bao_cao_tuan', !!b);
  const cols = sqlite.prepare('PRAGMA table_info(bao_cao_tuan)').all().map((x) => x.name);
  kiem('đủ 6 cột', ['thang', 'khu_vuc', 'tuan', 'snap_json', 'nguoi_bao_cao', 'thoi_gian_ms']
    .every((c) => cols.includes(c)), cols.join(','));
  // schema-sql.js phải khớp migration, nếu không /cai-dat sẽ không tạo bảng
  // trên CSDL thật (bài học #22).
  const sql = readFileSync(join(goc, 'src/schema-sql.js'), 'utf8');
  kiem('schema-sql.js CŨNG có bao_cao_tuan (nếu không thì /cai-dat vô dụng)',
    sql.includes('bao_cao_tuan'));
}

// =====================================================================
console.log('\n3) ⚠️ BẪY 1 — Tuần 1 tháng 8/2026 chỉ có MỘT buổi');
{
  const t1 = cacTuanCuaThang('2026-08').find((x) => x.tuan === 1);
  kiem('tuần 1 tháng 8/2026 chỉ gồm ngày 1', t1.tuNgay === 1 && t1.denNgay === 1);
  kiem('tuần 1 KHÔNG có Thứ Ba', t1.ngayT3 === 0);
  kiem('tuần 1 CÓ Thứ Bảy (ngày 1)', t1.ngayT7 === 1);

  taoCSDL();
  // Chỉ có dòng '1lan' — đúng như 7/8 khu vực trên số thật ngày 26/08/2026.
  gieoTP('K My', '2026-08', 1, '1lan', 2);
  const r = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  kiem('chỉ có dòng 1lan mà vẫn tính là ĐÃ NHẬP Thờ phượng',
    o(r.result, 1, 'tho_phuong') === 'du', o(r.result, 1, 'tho_phuong'));
}

// =====================================================================
console.log('\n4) ⚠️ BẪY 2 — Tuần 6 phải là "—", tuyệt đối không phải "thiếu"');
{
  const ds = cacTuanCuaThang('2026-08');
  const t6 = ds.find((x) => x.tuan === 6);
  kiem('tháng 8/2026 có đúng 6 tuần', ds.length === 6, String(ds.length));
  kiem('tuần 6 gồm ngày 30–31', t6.tuNgay === 30 && t6.denNgay === 31);
  kiem('tuần 6 KHÔNG có T3 lẫn T7', t6.ngayT3 === 0 && t6.ngayT7 === 0);

  taoCSDL();
  const r = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  kiem('tuần 6: Thờ phượng = không áp dụng',
    o(r.result, 6, 'tho_phuong') === 'khong_ap_dung', o(r.result, 6, 'tho_phuong'));
  kiem('tuần 6: Giáo dục = không áp dụng (bảng nhập tay chỉ có tuần 1..5)',
    o(r.result, 6, 'giao_duc') === 'khong_ap_dung', o(r.result, 6, 'giao_duc'));
  const t = r.result.tuan.find((x) => x.tuan === 6);
  kiem('tuần 6 vẫn CÓ trong bảng (không bị gộp vào tuần 5)', !!t);
  kiem('tuần 6 KHÔNG có ô nào bị chấm "trễ"',
    t.hangMuc.every((x) => x.trangThai !== 'tre'),
    JSON.stringify(t.hangMuc.map((x) => x.ma + '=' + x.trangThai)));
}

// =====================================================================
console.log('\n5) ⚠️ BẪY 3 — chưa tới hạn thì KHÔNG phải "thiếu"');
{
  taoCSDL();
  // Tháng rất xa trong tương lai: chưa tuần nào tới hạn.
  const r = await goi('getBaoCaoTuan', ['2099-01', 'K My'], KVT);
  const moO = r.result.tuan.flatMap((t) => t.hangMuc.map((x) => x.trangThai));
  kiem('tháng tương lai: KHÔNG ô nào bị chấm "trễ"',
    moO.every((x) => x !== 'tre'), JSON.stringify(moO.slice(0, 12)));
  kiem('tháng tương lai: mọi tuần đều "chưa tới"',
    r.result.tuan.every((t) => t.thoiDiem === 'chua_toi'));

  // Tháng đã qua từ lâu: mọi tuần đều quá hạn -> phải chấm "trễ" thật sự,
  // nếu không thì bảng kiểm chẳng nhắc được ai.
  const r2 = await goi('getBaoCaoTuan', ['2020-01', 'K My'], KVT);
  kiem('tháng đã qua: có ô bị chấm "trễ"',
    r2.result.tuan.some((t) => t.soTre > 0));
  kiem('tháng đã qua: mọi tuần đều "đã qua"',
    r2.result.tuan.every((t) => t.thoiDiem === 'da_qua'));
}

// =====================================================================
console.log('\n6) ⚠️ BẪY 3b — ân hạn ĐÚNG 2 ngày, không hơn không kém');
{
  kiem('hằng số ân hạn = 2 ngày', BC.AN_HAN_NGAY === 2);
  // Tự dựng lại phép tính hạn chót để chắc chắn "hết tuần + 2 ngày".
  taoCSDL();
  const r = await goi('getBaoCaoTuan', ['2020-01', 'K My'], KVT);
  const t1 = r.result.tuan[0];
  const cuoi = Number(String(t1.hanChot).slice(8, 10));
  kiem('hạn chót = ngày cuối tuần + 2', cuoi === t1.denNgay + 2,
    t1.hanChot + ' vs denNgay=' + t1.denNgay);
}

// =====================================================================
console.log('\n7) ⚠️ BẪY 4 — Đào tạo / Lễ hội trước khi có nhật ký = ❓, KHÔNG phải ⚠️');
{
  taoCSDL();
  gieoLeHoi('2026-08-loi', 'Lễ hội Lời', '2026-08-01', '2026-08-30');
  // Nhật ký chỉ bắt đầu từ 26/08 — y như thật.
  gieoNhatKy('toggleDaoTaoBai', 'Đ Uyên', msGiuaNgayVN('2026-08-26'));

  const r = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  kiem('tuần 1 (kết thúc 1/8, trước nhật ký): Đào tạo = chưa đủ dữ liệu',
    o(r.result, 1, 'dao_tao') === 'chua_du_du_lieu', o(r.result, 1, 'dao_tao'));
  kiem('tuần 1: Lễ hội = chưa đủ dữ liệu',
    o(r.result, 1, 'le_hoi') === 'chua_du_du_lieu', o(r.result, 1, 'le_hoi'));
  kiem('tuần 3 (kết thúc 15/8, vẫn trước nhật ký): Đào tạo = chưa đủ dữ liệu',
    o(r.result, 3, 'dao_tao') === 'chua_du_du_lieu', o(r.result, 3, 'dao_tao'));
  // Không có dòng nhật ký nào -> không có cơ sở gì cả, phải im lặng hoàn toàn.
  taoCSDL();
  gieoLeHoi('2026-08-loi', 'Lễ hội Lời', '2026-08-01', '2026-08-30');
  const r2 = await goi('getBaoCaoTuan', ['2020-01', 'K My'], KVT);
  kiem('CSDL chưa có dòng nhật ký nào: Đào tạo không bị chấm trễ ở mọi tuần',
    r2.result.tuan.every((t) => o(r2.result, t.tuan, 'dao_tao') === 'chua_du_du_lieu'));
}

// =====================================================================
console.log('\n8) Đào tạo / Lễ hội có nhật ký thì chấm ĐÚNG TUẦN');
{
  taoCSDL();
  gieoLeHoi('2026-08-loi', 'Lễ hội Lời', '2026-08-01', '2026-08-30');
  gieoNhatKy('toggleDaoTaoBai', 'K My', msGiuaNgayVN('2026-08-01'));   // tuần 1
  gieoNhatKy('capChungChiDaoTao', 'K My', msGiuaNgayVN('2026-08-25')); // tuần 5
  gieoNhatKy('toggleLeHoiLan', 'K My', msGiuaNgayVN('2026-08-11'));    // tuần 3

  const r = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  kiem('Đào tạo tuần 1 = đủ', o(r.result, 1, 'dao_tao') === 'du');
  kiem('Đào tạo tuần 5 = đủ', o(r.result, 5, 'dao_tao') === 'du');
  kiem('Đào tạo tuần 3 KHÔNG bị lây từ tuần khác', o(r.result, 3, 'dao_tao') !== 'du');
  kiem('Lễ hội tuần 3 = đủ', o(r.result, 3, 'le_hoi') === 'du');
  kiem('Lễ hội tuần 1 KHÔNG bị lây', o(r.result, 1, 'le_hoi') !== 'du');

  // Dòng nhật ký của khu vực KHÁC không được tính sang.
  kiem('khu vực khác không ăn ké dòng nhật ký của K My',
    o((await goi('getBaoCaoTuan', ['2026-08', 'Đ Uyên'], CHU)).result, 1, 'dao_tao') !== 'du');

  // Lệnh bị LỖI thì không tính là đã nhập.
  taoCSDL();
  gieoNhatKy('toggleDaoTaoBai', 'K My', msGiuaNgayVN('2026-08-04'), 'loi');
  const r3 = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  kiem('dòng nhật ký ket_qua=loi KHÔNG tính là đã nhập',
    o(r3.result, 2, 'dao_tao') !== 'du', o(r3.result, 2, 'dao_tao'));
}

// =====================================================================
console.log('\n9) Lễ hội: tháng không có lễ hội thì để "—"');
{
  taoCSDL();
  const r = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  kiem('không có lễ hội nào: mọi tuần đều "—"',
    r.result.tuan.every((t) => o(r.result, t.tuan, 'le_hoi') === 'khong_ap_dung'));
  kiem('leHoi trả về null', r.result.leHoi === null);

  // Lễ hội kết thúc 30/8 -> tuần 6 (30–31) VẪN còn giao, phải áp dụng.
  taoCSDL();
  gieoLeHoi('2026-08-loi', 'Lễ hội Lời', '2026-08-01', '2026-08-30');
  const r2 = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  kiem('có lễ hội: nhận đúng tên', r2.result.leHoi?.ten === 'Lễ hội Lời');
  kiem('tuần 6 vẫn trong khoảng lễ hội (30/8) nên KHÔNG phải "—"',
    o(r2.result, 6, 'le_hoi') !== 'khong_ap_dung', o(r2.result, 6, 'le_hoi'));

  // Lễ hội chỉ diễn ra tuần 2 -> các tuần khác phải là "—".
  taoCSDL();
  gieoLeHoi('x', 'Lễ hội ngắn', '2026-08-03', '2026-08-07');
  const r3 = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  kiem('lễ hội ngắn: tuần 2 có áp dụng', o(r3.result, 2, 'le_hoi') !== 'khong_ap_dung');
  kiem('lễ hội ngắn: tuần 1 là "—"', o(r3.result, 1, 'le_hoi') === 'khong_ap_dung');
  kiem('lễ hội ngắn: tuần 5 là "—"', o(r3.result, 5, 'le_hoi') === 'khong_ap_dung');
}

// =====================================================================
console.log('\n10) ⭐ Định nghĩa "đã nhập" của từng hạng mục');
{
  taoCSDL();
  const TH = '2026-08';
  gieoTP('K My', TH, 2, '1lan', 4);                       // Thờ phượng tuần 2
  gieoGD('K My', TH, 'Cô A', 3, 'x');                     // Giáo dục tuần 3
  gieoCV('K My', 'Cô A', TH, 4, 'sang', 'T5', '127');     // Công việc tuần 4
  gieoDonThuan('K My', '2026-08-23', 6);                  // Đơn thuần tuần 5
  const r = await goi('getBaoCaoTuan', [TH, 'K My'], KVT);

  kiem('Thờ phượng chấm đúng tuần 2', o(r.result, 2, 'tho_phuong') === 'du');
  kiem('Thờ phượng tuần 3 chưa có', o(r.result, 3, 'tho_phuong') !== 'du');
  kiem('Giáo dục chấm đúng tuần 3', o(r.result, 3, 'giao_duc') === 'du');
  // ⚠️⚠️ 27/08/2026 — "Trudo — điểm danh công việc" ĐÃ BỊ BỎ khỏi bảng kiểm.
  // Anh Rise nói rõ việc đó nhập thẳng trên My Memo; bảng cv_cong_viec trên
  // web chỉ để chữa cháy khi nhập muộn. Bảng trống là BÌNH THƯỜNG, chấm ⚠️ ở
  // đó là báo oan cả 8 khu vực mọi tuần. Ca dưới đây CẤM nó quay lại.
  kiem('⚠️ KHÔNG còn hạng mục "trudo_cong_viec" (nhập ở My Memo, không chấm ở web)',
    o(r.result, 4, 'trudo_cong_viec') === '(khong co hang muc)',
    String(o(r.result, 4, 'trudo_cong_viec')));
  kiem('bảng kiểm còn ĐÚNG 5 hạng mục',
    r.result.tuan[0].hangMuc.length === 5,
    r.result.tuan[0].hangMuc.map((x) => x.ma).join(','));
  kiem('vẫn có dòng "trudo_truyen_dao" (đừng bỏ nhầm cả nhóm Trudo)',
    r.result.tuan[0].hangMuc.some((x) => x.ma === 'trudo_truyen_dao'));
  // ⭐ 23/08 là tuần 5 theo LỊCH THẬT (sửa 26/08/2026). Cách chia cũ
  // ceil(ngày/7) cho ra tuần 4 — nếu ca này đỏ nghĩa là ai đó vừa quay lại
  // cách chia tuần cũ.
  kiem('Đơn thuần ngày 23/08 rơi vào TUẦN 5 (lịch thật, không phải tuần 4)',
    o(r.result, 5, 'trudo_truyen_dao') === 'du', o(r.result, 5, 'trudo_truyen_dao'));
  kiem('và KHÔNG rơi vào tuần 4', o(r.result, 4, 'trudo_truyen_dao') !== 'du');

  // Giáo dục: có dòng nhưng EDU LMS TRỐNG thì chưa tính là đã nhập —
  // dòng có thể sinh ra khi chỉ lưu Trực 127.
  taoCSDL();
  gieoGD('K My', TH, 'Cô B', 2, '');
  const r2 = await goi('getBaoCaoTuan', [TH, 'K My'], KVT);
  kiem('Giáo dục: có dòng nhưng EDU LMS trống -> CHƯA tính là đã nhập',
    o(r2.result, 2, 'giao_duc') !== 'du', o(r2.result, 2, 'giao_duc'));
}

// =====================================================================
console.log('\n11) ⭐ Hữu hiệu / Báp-têm lấy từ sổ mốc, chia tuần chính xác');
{
  taoCSDL();
  // Số thật tháng 8/2026: K Trâm hữu hiệu 13/8, báp-têm 15/8 -> đều tuần 3.
  gieoMoc('K My', 'huu_hieu', '2026-08-13', 'Cô Thương');
  const r = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  kiem('mốc hữu hiệu 13/08 tính vào Trudo tuần 3',
    o(r.result, 3, 'trudo_truyen_dao') === 'du');
  kiem('không lây sang tuần 2', o(r.result, 2, 'trudo_truyen_dao') !== 'du');

  taoCSDL();
  gieoMoc('K My', 'bap_tem', '2026-08-15', 'Cô Thương');
  const r2 = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  kiem('mốc báp-têm 15/08 cũng tính vào Trudo tuần 3',
    o(r2.result, 3, 'trudo_truyen_dao') === 'du');
}

// =====================================================================
console.log('\n12) Khu vực này KHÔNG thấy dữ liệu khu vực kia');
{
  taoCSDL();
  gieoTP('Đ Uyên', '2026-08', 2, '1lan', 5);
  gieoDonThuan('Đ Uyên', '2026-08-07', 3);
  const a = await goi('getBaoCaoTuan', ['2026-08', 'Đ Uyên'], CHU);
  const b = await goi('getBaoCaoTuan', ['2026-08', 'K My'], CHU);
  kiem('Đ Uyên thấy số của mình', o(a.result, 2, 'tho_phuong') === 'du');
  kiem('K My KHÔNG thấy số của Đ Uyên', o(b.result, 2, 'tho_phuong') !== 'du');
  kiem('K My KHÔNG thấy đơn thuần của Đ Uyên', o(b.result, 2, 'trudo_truyen_dao') !== 'du');
}

// =====================================================================
console.log('\n13) ⚠️ PHÂN QUYỀN — khoá ở MÁY CHỦ, không chỉ giấu nút (bài học #49)');
{
  taoCSDL();
  kiem('KVT xem được khu vực MÌNH',
    !!(await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT)).result);
  const r = await goi('getBaoCaoTuan', ['2026-08', 'Đ Uyên'], KVT);
  kiem('KVT KHÔNG xem được khu vực khác', !!r.error, JSON.stringify(r).slice(0, 90));
  kiem('lời báo lỗi nói rõ mình đang phụ trách khu vực nào',
    String(r.error).includes('K My'), r.error);

  kiem('địa vực trưởng xem được cả 3 khu vực của mình',
    !!(await goi('getBaoCaoTuan', ['2026-08', 'TT Châu'], DVT)).result);
  kiem('địa vực trưởng KHÔNG xem được ngoài địa vực',
    !!(await goi('getBaoCaoTuan', ['2026-08', 'K My'], DVT)).error);
  kiem('Trưởng phòng / Admin xem được mọi khu vực',
    !!(await goi('getBaoCaoTuan', ['2026-08', 'K My'], CHU)).result);

  // Anh Rise chốt: 9 tài khoản chưa gán khu vực thì KHÔNG cần tab này.
  const t = await goi('getBaoCaoTuan', ['2026-08', 'K My'], THANH_DO);
  kiem('chưa được gán khu vực -> bị chặn', !!t.error);
  kiem('và lời nhắc chỉ đúng chỗ cần làm (Duyệt truy cập)',
    String(t.error).includes('Duyệt truy cập'), t.error);
  kiem('lời nhắc KHÔNG dùng từ kỹ thuật',
    !/error|null|undefined|SQL/i.test(String(t.error)), t.error);

  const l = await goi('getBaoCaoLuoi', ['2026-08'], THANH_DO);
  kiem('lưới toàn Si-ôn cũng chặn người chưa gán khu vực', !!l.error);
  kiem('nhưng KVT thì xem được lưới', !!(await goi('getBaoCaoLuoi', ['2026-08'], KVT)).result);

  // ⚠️ Phải khai trong VI_TRI_KHU_VUC, nếu không luật chặn ở router (bước 4)
  // sẽ bỏ sót đúng 3 hàm này.
  const NK = await import(join(goc, 'src/nhat-ky.js'));
  kiem('getBaoCaoTuan khai đúng vị trí khuVuc', NK.VI_TRI_KHU_VUC.getBaoCaoTuan === 1);
  kiem('saveBaoCaoTuan khai đúng vị trí khuVuc', NK.VI_TRI_KHU_VUC.saveBaoCaoTuan === 1);
  kiem('huyBaoCaoTuan khai đúng vị trí khuVuc', NK.VI_TRI_KHU_VUC.huyBaoCaoTuan === 1);
}

// =====================================================================
console.log('\n14) ⚠️ Lưới toàn Si-ôn CỐ Ý cho thấy đủ mọi khu vực');
{
  taoCSDL();
  gieoTP('Đ Uyên', '2026-08', 2, '1lan', 5);
  const r = await goi('getBaoCaoLuoi', ['2026-08'], KVT);
  const ten = r.result.dong.map((x) => x.khuVuc);
  kiem('KVT vẫn thấy ĐỦ 4 khu vực (chỉ có dấu tick, không có con số)',
    ten.length === 4, ten.join(','));
  kiem('thứ tự khu vực đúng như cấu hình', ten.join(',') === KHU_VUC.join(','));
  kiem('đánh dấu được dòng nào là của mình',
    r.result.dong.find((x) => x.khuVuc === 'K My').laCuaToi === true);
  kiem('và dòng của người khác thì không',
    r.result.dong.find((x) => x.khuVuc === 'Đ Uyên').laCuaToi === false);
  kiem('lưới trả đúng số tuần thật của tháng', r.result.soTuan === 6);
  kiem('mỗi dòng có đủ 6 tuần', r.result.dong.every((x) => x.tuan.length === 6));
  // ⚠️ Lưới KHÔNG được lộ con số nào — đó là lý do anh Rise cho công khai.
  const chuoiJson = JSON.stringify(r.result.dong[0]);
  kiem('lưới không chứa số liệu chi tiết (chỉ đếm ô)',
    !chuoiJson.includes('so_luong') && !chuoiJson.includes('giaTri'));
}

// =====================================================================
console.log('\n15) Bấm Báo cáo — lưu, đếm, và CỐ Ý không chặn khi còn thiếu');
{
  taoCSDL();
  const r = await goi('saveBaoCaoTuan', ['2026-08', 'K My', 3], KVT);
  kiem('KVT bấm được Báo cáo cho khu vực mình', r.result?.success === true, JSON.stringify(r));
  kiem('⚠️ CỐ Ý cho bấm dù còn hạng mục chưa nhập (cảnh báo mềm, không khoá cứng)',
    r.result?.success === true);
  kiem('lần đầu thì có gửi Telegram', r.result?.daGuiTin === true);

  const g = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  const t3 = g.result.tuan.find((x) => x.tuan === 3);
  kiem('bảng kiểm ghi nhận đã báo cáo', t3.baoCao.daBaoCao === true);
  kiem('lưu đúng người bấm', t3.baoCao.nguoi === 'kvt@gmail.com');
  kiem('có nhãn thời gian dạng dd/MM/yyyy HH:mm',
    /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(t3.baoCao.nhan), t3.baoCao.nhan);
  kiem('tuần khác KHÔNG bị đánh dấu lây',
    g.result.tuan.filter((x) => x.baoCao.daBaoCao).length === 1);

  // Bấm lại thì KHÔNG gửi tin nữa (anh Rise chốt: chỉ gửi lần đầu).
  const r2 = await goi('saveBaoCaoTuan', ['2026-08', 'K My', 3], KVT);
  kiem('bấm lại vẫn thành công', r2.result?.success === true);
  kiem('⭐ nhưng KHÔNG gửi Telegram lần hai (khỏi spam nhóm chat)',
    r2.result?.daGuiTin === false);

  const so = sqlite.prepare('SELECT COUNT(*) n FROM bao_cao_tuan').get().n;
  kiem('bấm 2 lần chỉ sinh 1 dòng', so === 1, String(so));

  // Chặn tuần không có thật trong tháng.
  const x = await goi('saveBaoCaoTuan', ['2026-08', 'K My', 7], KVT);
  kiem('chặn báo cáo Tuần 7 (tháng 8/2026 chỉ có 6 tuần)', !!x.error, JSON.stringify(x));
  const y = await goi('saveBaoCaoTuan', ['2026-02', 'K My', 6], CHU);
  kiem('tháng 2/2026 không có tuần 6 -> chặn', !!y.error, JSON.stringify(y));

  // Người ngoài phạm vi thì không bấm hộ được.
  kiem('KVT KHÔNG bấm được cho khu vực khác',
    !!(await goi('saveBaoCaoTuan', ['2026-08', 'Đ Uyên', 3], KVT)).error);
}

// =====================================================================
console.log('\n16) ⭐ Dấu vết "đã sửa sau báo cáo" — và KHÔNG báo oan theo ngày');
{
  taoCSDL();
  await goi('saveBaoCaoTuan', ['2026-08', 'K My', 3], KVT);
  let g = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  kiem('vừa báo cáo xong: chưa có cờ "đã sửa sau"',
    g.result.tuan.find((x) => x.tuan === 3).baoCao.daSuaSau === false);

  // Nhập thêm số cho CHÍNH tuần đó -> phải bật cờ.
  gieoTP('K My', '2026-08', 3, '1lan', 9);
  g = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  kiem('nhập thêm số cho tuần đã báo cáo -> bật cờ 🔁',
    g.result.tuan.find((x) => x.tuan === 3).baoCao.daSuaSau === true);

  // ⚠️⚠️ CA QUAN TRỌNG NHẤT CỦA PHẦN NÀY: dấu vết chỉ chụp CÓ/KHÔNG dữ liệu.
  // Nếu ai đó đổi nó thành chụp trạng thái ✅⏳⚠️ thì mọi báo cáo sẽ tự bật
  // cờ "đã sửa" khi qua hạn, dù không ai đụng gì — báo oan cả phòng.
  taoCSDL();
  await goi('saveBaoCaoTuan', ['2026-08', 'K My', 3], KVT);
  const snap = sqlite.prepare('SELECT snap_json FROM bao_cao_tuan').get().snap_json;
  kiem('dấu vết chỉ ghi 0/1, KHÔNG ghi "tre"/"chua"/"du"',
    /^([a-z_]+=[01];?)+$/.test(snap) && !/tre|chua|du/.test(snap.replace(/[a-z_]+=/g, '')),
    snap);
  kiem('dấu vết có đủ 5 hạng mục', snap.split(';').length === 5, snap);

  // ⚠️⚠️ 27/08/2026 — SO DẤU VẾT PHẢI THEO TỪNG HẠNG MỤC, KHÔNG SO CHUỖI THÔ.
  // Hôm nay bỏ "trudo_cong_viec" khỏi bảng kiểm. Dấu vết đã lưu từ hôm trước
  // vẫn còn khoá đó, nên so chuỗi thô là MỌI tuần đã báo cáo đều bị gắn cờ 🔁
  // "đã sửa sau báo cáo" — báo oan cả phòng vì phần mềm đổi, không phải họ.
  const { daSuaSauKhiBaoCao } = await import(join(goc, 'src/handlers/bao-cao.js'));
  kiem('⚠️ dấu vết CŨ còn hạng mục đã bỏ -> KHÔNG bật cờ 🔁',
    daSuaSauKhiBaoCao('tho_phuong=1;trudo_cong_viec=0;giao_duc=1',
      'tho_phuong=1;giao_duc=1') === false);
  kiem('⚠️ hạng mục MỚI thêm (dấu vết cũ chưa có) -> cũng KHÔNG bật cờ',
    daSuaSauKhiBaoCao('tho_phuong=1', 'tho_phuong=1;hang_muc_moi=0') === false);
  kiem('số của hạng mục CÓ Ở CẢ HAI mà đổi -> VẪN bật cờ',
    daSuaSauKhiBaoCao('tho_phuong=0;giao_duc=1',
      'tho_phuong=1;giao_duc=1') === true);
  kiem('chưa có dấu vết (chuỗi rỗng) -> không kết luận gì',
    daSuaSauKhiBaoCao('', 'tho_phuong=1') === false);
  kiem('dấu vết y hệt -> không bật cờ',
    daSuaSauKhiBaoCao('tho_phuong=1;giao_duc=0', 'tho_phuong=1;giao_duc=0') === false);
}

// =====================================================================
console.log('\n17) Hủy báo cáo');
{
  taoCSDL();
  await goi('saveBaoCaoTuan', ['2026-08', 'K My', 3], KVT);
  const h = await goi('huyBaoCaoTuan', ['2026-08', 'K My', 3], CHU);
  kiem('Trưởng phòng gỡ được báo cáo', h.result?.success === true, JSON.stringify(h));
  const g = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  kiem('sau khi gỡ thì tuần đó về "chưa báo cáo"',
    g.result.tuan.find((x) => x.tuan === 3).baoCao.daBaoCao === false);
  // ⚠️ Gỡ rồi bấm lại KHÔNG được gửi Telegram lần nữa? — KHÔNG, gỡ xong là
  // dòng biến mất nên bấm lại được coi là lần đầu. Ghi rõ ở đây để sau này
  // không ai tưởng là lỗi: anh Rise chốt "bấm lại / hủy: không gửi", nhưng
  // ý là không spam khi bấm ĐI BẤM LẠI; hủy hẳn rồi báo cáo lại là việc mới.
  const r = await goi('saveBaoCaoTuan', ['2026-08', 'K My', 3], KVT);
  kiem('gỡ hẳn rồi báo cáo lại thì tính là lần đầu (có tin)', r.result?.daGuiTin === true);
}

// =====================================================================
console.log('\n18) Chặn tháng hỏng — và KHÔNG được để màn hình trắng');
{
  taoCSDL();
  kiem('tháng sai định dạng -> lỗi tiếng Việt',
    /Tháng/.test((await goi('getBaoCaoTuan', ['thang-8', 'K My'], CHU)).error || ''));
  // ⚠️ '2026-13' lọt qua thangHopLe dùng chung (bắt được khi làm trang Trợ lý).
  kiem('⚠️ tháng 2026-13 phải bị chặn (thangHopLe dùng chung KHÔNG bắt được)',
    !!(await goi('getBaoCaoTuan', ['2026-13', 'K My'], CHU)).error);
  kiem('tháng 2026-00 cũng bị chặn',
    !!(await goi('getBaoCaoTuan', ['2026-00', 'K My'], CHU)).error);
  kiem('thiếu khu vực -> lỗi rõ ràng',
    /Khu vực/.test((await goi('getBaoCaoTuan', ['2026-08', ''], CHU)).error || ''));

  // Tháng hợp lệ mà chưa có dữ liệu gì thì vẫn phải trả bảng đầy đủ,
  // KHÔNG được trả rỗng (bài học #34: "chưa có" khác "màn hình trắng").
  const r = await goi('getBaoCaoTuan', ['2026-09', 'K My'], KVT);
  kiem('tháng chưa nhập gì vẫn trả đủ tuần', r.result.tuan.length >= 4);
  kiem('và mỗi tuần vẫn đủ 5 dòng hạng mục',
    r.result.tuan.every((t) => t.hangMuc.length === 5));
}

// =====================================================================
console.log('\n19) Lịch tuần dùng CHUNG với cả web — không tự chia lại');
{
  const src = readFileSync(join(goc, 'src/handlers/bao-cao.js'), 'utf8');
  // ⚠️ Cả dự án chỉ được có MỘT cách chia tuần. Ngày 26/08/2026 đã sửa một
  // lỗi số liệu thật do có HAI cách chia (xem CVTL-KE-HOACH-BAO-CAO.md mục
  // 16). Nếu file này tự tính tuần bằng ceil/Math.min thì lỗi đó quay lại.
  kiem('bao-cao.js dùng lich-tuan.js', src.includes("from '../lich-tuan.js'"));
  kiem('⚠️ bao-cao.js KHÔNG tự chia tuần bằng ceil(ngày/7)',
    !/Math\.ceil\s*\([^)]*\/\s*7/.test(src));
  kiem('⚠️ và KHÔNG kẹp cứng 5 tuần bằng Math.min(5', !src.includes('Math.min(5'));

  // Tháng có 5 tuần cũng phải chạy đúng, không chỉ tháng 6 tuần.
  taoCSDL();
  const r = await goi('getBaoCaoTuan', ['2026-09', 'K My'], KVT);
  kiem('tháng 9/2026 có 5 tuần', r.result.tuan.length === 5, String(r.result.tuan.length));
  kiem('tuần cuối tháng 9 không bị chấm "—" oan cho Thờ phượng',
    o(r.result, 5, 'tho_phuong') !== 'khong_ap_dung', o(r.result, 5, 'tho_phuong'));
}

// =====================================================================
console.log('\n20) Nhãn tuần đọc được bằng mắt người');
{
  taoCSDL();
  const r = await goi('getBaoCaoTuan', ['2026-08', 'K My'], KVT);
  const nhan = r.result.tuan.map((t) => t.nhan);
  kiem('tuần 1 chỉ 1 ngày -> nhãn "1/08"', nhan[0] === '1/08', nhan[0]);
  kiem('tuần 2 -> "2–8/08"', nhan[1] === '2–8/08', nhan[1]);
  kiem('tuần 6 -> "30–31/08"', nhan[5] === '30–31/08', nhan[5]);
  kiem('mọi tuần đều có nhãn', nhan.every(Boolean));
  kiem('có trả về ngày hôm nay để giao diện tô tuần hiện tại',
    /^\d{4}-\d{2}-\d{2}$/.test(r.result.homNay), r.result.homNay);
}

// =====================================================================
console.log('\n21) Tổng theo hạng mục trong lưới');
{
  taoCSDL();
  gieoTP('K My', '2026-08', 1, '1lan', 2);
  gieoTP('K My', '2026-08', 2, '1lan', 3);
  const r = await goi('getBaoCaoLuoi', ['2026-08'], KVT);
  const d = r.result.dong.find((x) => x.khuVuc === 'K My');
  kiem('Thờ phượng: đếm đúng 2 tuần đã nhập', d.theoHangMuc.tho_phuong.du === 2,
    JSON.stringify(d.theoHangMuc.tho_phuong));
  // Tuần 6 không áp dụng Thờ phượng nên chỉ có 5 tuần được tính.
  kiem('Thờ phượng: chỉ tính 5 tuần áp dụng (tuần 6 không có T3/T7)',
    d.theoHangMuc.tho_phuong.apDung === 5, JSON.stringify(d.theoHangMuc.tho_phuong));
  kiem('đủ + trễ + chưa = số tuần áp dụng',
    d.theoHangMuc.tho_phuong.du + d.theoHangMuc.tho_phuong.tre + d.theoHangMuc.tho_phuong.chua
      === d.theoHangMuc.tho_phuong.apDung);
  kiem('Đào tạo chưa có nhật ký -> KHÔNG tuần nào bị tính là áp dụng',
    d.theoHangMuc.dao_tao.apDung === 0, JSON.stringify(d.theoHangMuc.dao_tao));
  kiem('lưới liệt kê đủ 5 hạng mục', r.result.hangMuc.length === 5);
}

// =====================================================================
console.log('\n22) Số liệu THẬT của tháng 8/2026 — chép nguyên từ CSDL (26/08/2026)');
{
  // Đây là bản chép ĐÚNG số thật đã đọc bằng SELECT ngày 26/08/2026, để nếu
  // sau này ai sửa định nghĩa "đã nhập" thì ca này đỏ ngay.
  taoCSDL();
  const TH = '2026-08';
  // Thờ phượng K Thành: có tuần 1,2,3,4 — KHÔNG có tuần 5.
  for (const t of [1, 2, 3, 4]) gieoTP('K Thành', TH, t, '1lan', 5);
  // Giáo dục K Thành: tuần 1,2,3.
  for (const t of [1, 2, 3]) gieoGD('K Thành', TH, 'Cô C', t, 'x');
  // Đơn thuần K Thành: 02/08 (tuần 2), 14/08 (tuần 3), 23/08 (tuần 5).
  for (const d of ['2026-08-02', '2026-08-14', '2026-08-23']) gieoDonThuan('K Thành', d, 1);

  const r = await goi('getBaoCaoTuan', [TH, 'K Thành'], CHU);
  kiem('TP: tuần 4 đủ', o(r.result, 4, 'tho_phuong') === 'du');
  kiem('TP: tuần 5 CHƯA có (đúng số thật)', o(r.result, 5, 'tho_phuong') !== 'du');
  kiem('Giáo dục: tuần 3 đủ, tuần 4 chưa',
    o(r.result, 3, 'giao_duc') === 'du' && o(r.result, 4, 'giao_duc') !== 'du');
  kiem('Đơn thuần: tuần 2, 3, 5 đủ',
    ['2', '3', '5'].every((t) => o(r.result, Number(t), 'trudo_truyen_dao') === 'du'));
  kiem('Đơn thuần: tuần 4 KHÔNG có (23/08 là tuần 5 chứ không phải tuần 4)',
    o(r.result, 4, 'trudo_truyen_dao') !== 'du');
  // ⚠️ cv_cong_viec rỗng hoàn toàn trên số thật — cả phòng chưa ai dùng bảng
  // Điểm danh công việc. Bảng kiểm PHẢI nói ra chuyện đó, đó là việc của nó.
  kiem('Điểm danh công việc: chưa ai nhập -> không tuần nào "đủ"',
    r.result.tuan.every((t) => o(r.result, t.tuan, 'trudo_cong_viec') !== 'du'));
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
