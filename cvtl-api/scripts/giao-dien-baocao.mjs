// =====================================================================
// KIỂM THỬ GIAO DIỆN tab "📋 Báo cáo" bằng Chromium THẬT.
//
//     npm install playwright        (một lần, ở thư mục chạy)
//     node giao-dien-baocao.mjs
//
// ⚠️ CỐ Ý KHÔNG đặt tên "kiem-thu-*.mjs": vòng lặp chạy toàn bộ kiểm thử máy
// chủ dùng mẫu `scripts/kiem-thu*.mjs`, mà bộ này cần playwright (không nằm
// trong package.json của cvtl-api) nên sẽ làm vòng lặp đó đỏ oan.
//
// ⚠️⚠️ VÌ SAO FILE NÀY NẰM TRONG KHO (bài học #46): bộ kiểm thử giao diện
// trước đây chỉ để trong thư mục tạm của máy ảo và **đã mất trắng** khi máy ảo
// bị dọn giữa phiên 26/08/2026. Mọi thứ đáng giữ phải nằm trong kho.
//
// Cách làm (bài học #45): chặn thư viện Google, chặn mọi lời gọi API rồi cho
// chạy THẲNG vào DANH_MUC[fn].fn() thật với sqlite trong bộ nhớ. Đây là bài
// kiểm ĐẦU–CUỐI giao diện <-> máy chủ, bắt được cả lỗi lệch hợp đồng 2 bên.
// =====================================================================
import { chromium } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Thư mục gốc của kho (file này nằm ở cvtl-api/scripts/).
const GOC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'cvtl-api.rise-shine1948.workers.dev';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(join(GOC, 'cvtl-api/migrations/0001_init.sql'), 'utf8'));
const db = {
  async all(sql, p = []) { return sqlite.prepare(sql).all(...p); },
  async first(sql, p = []) { return sqlite.prepare(sql).get(...p) ?? null; },
  async run(sql, p = []) {
    const r = sqlite.prepare(sql).run(...p);
    return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
  },
  async batch(ds) { for (const { sql, params = [] } of ds) sqlite.prepare(sql).run(...params); },
};
const { DANH_MUC } = await import(join(GOC, 'cvtl-api/src/registry.js'));

// --- dữ liệu mẫu, chép theo số thật tháng 8/2026 ---
// ⚠️ "Đ Uyên" cố ý để ĐẦU danh sách — đó chính là cái bẫy đã bắt được ở phần 3.
const KV = ['Đ Uyên', 'K Thành', 'TT Châu', 'K My'];
KV.forEach((k, i) => sqlite.prepare("INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('khu_vuc',?,?)").run(k, i + 1));
for (const t of [1, 2, 3, 4]) sqlite.prepare('INSERT INTO tp_tho_phuong (thang,khu_vuc,loai,tuan,so_luong) VALUES (?,?,?,?,?)').run('2026-08', 'K Thành', '1lan', t, 5);
for (const t of [1, 2, 3]) sqlite.prepare('INSERT INTO giao_duc_thanh_vien (thang,khu_vuc,ten,tuan,edu_lms,tt127_ngay) VALUES (?,?,?,?,?,0)').run('2026-08', 'K Thành', 'Cô C', t, 'x');
for (const d of ['2026-08-02', '2026-08-14', '2026-08-23']) sqlite.prepare('INSERT INTO nhat_ky_don_thuan (ngay,khu_vuc,don_thuan) VALUES (?,?,?)').run(d, 'K Thành', 1);
sqlite.prepare("INSERT INTO le_hoi_cau_hinh (ma_le_hoi,ten_le_hoi,ngay_bat_dau,ngay_ket_thuc,danh_sach_bai,so_lan_yeu_cau) VALUES ('2026-08-loi','Lễ hội Lời','2026-08-01','2026-08-30','4-6,4-7',3)").run();

const CHU = { email: 'chu@gmail.com', ten: 'Trưởng phòng', laChu: true, phamVi: '' };
const KVT = { email: 'kvt@gmail.com', ten: 'KVT K Thành', laChu: false, phamVi: 'K Thành' };
const THANH_DO = { email: 'td@gmail.com', ten: 'Thánh đồ', laChu: false, phamVi: '' };
let nguoiGoi = CHU;

let dat = 0, hong = 0;
function kiem(ten, dk, chiTiet = '') {
  if (dk) { dat++; console.log('  ✓', ten); }
  else { hong++; console.log('  ✗', ten, chiTiet); }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
const loiJS = [];
page.on('pageerror', (e) => loiJS.push(String(e)));
page.on('dialog', (d) => d.accept());

await page.route('**/accounts.google.com/**', (r) => r.abort());
await page.route('**/cdnjs.cloudflare.com/**', (r) => r.abort());
await page.route(new RegExp(API.replace(/\./g, '\\.')), async (route) => {
  const req = route.request();
  let fn, args;
  if (req.method() === 'POST') {
    const b = JSON.parse(req.postData() || '{}');
    fn = b.fn; args = b.args || [];
  } else {
    const u = new URL(req.url());
    fn = u.searchParams.get('fn');
    args = JSON.parse(u.searchParams.get('args') || '[]');
  }
  const muc = DANH_MUC[fn];
  let body;
  if (!muc) body = { error: 'Không hỗ trợ hàm: ' + fn };
  else {
    try { body = { result: await muc.fn({ db, env: {}, ctx: {}, nguoiGoi }, ...args) }; }
    catch (e) { body = { error: e.message }; }
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});

await page.goto('file://' + join(GOC, 'index.html'));
await page.evaluate(() => {
  window._authToken = 'TEST';
  hideAuthOverlay_();
  const lo = document.getElementById('loadingOverlay');
  if (lo) lo.style.display = 'none';
});

/** Đăng nhập giả bằng một vai, rồi mở màn hình Hiện trạng khu vực. */
async function vaoVai(vai, phamVi, laChu) {
  nguoiGoi = vai;
  await page.evaluate(([pv, lc]) => {
    window._laChu = lc;
    window._phamVi = pv;
    selectedKV = '';                 // ép tính lại khu vực mặc định
    Object.keys(_apiCache).forEach((k) => delete _apiCache[k]);
    showPanel('kv');
    document.getElementById('kvMonth').value = '2026-08';
    khuVucList = ['Đ Uyên', 'K Thành', 'TT Châu', 'K My'];
    showUserBar_('ai@do.com');
    renderKVPills();
  }, [phamVi, laChu]);
  await page.waitForTimeout(300);
}

console.log('\n=== KIỂM THỬ GIAO DIỆN TAB BÁO CÁO ===\n');

// ---------------------------------------------------------------------
console.log('1) Ai thấy tab con 📋 Báo cáo');
await vaoVai(CHU, [], true);
kiem('Admin THẤY tab', await page.locator('#kvSubBaoCao').isVisible());
await vaoVai(KVT, ['K Thành'], false);
kiem('Khu vực trưởng THẤY tab', await page.locator('#kvSubBaoCao').isVisible());
await vaoVai(THANH_DO, [], false);
kiem('Thánh đồ chưa gán khu vực KHÔNG thấy tab',
  !(await page.locator('#kvSubBaoCao').isVisible()));

// ---------------------------------------------------------------------
console.log('\n2) ⚠️ Chip khu vực NGOÀI phạm vi bị làm mờ');
await vaoVai(KVT, ['K Thành'], false);
let chip = await page.evaluate(() => [...document.querySelectorAll('#kvPills .kv-pill')]
  .map((b) => b.textContent.trim() + (b.classList.contains('kv-ngoai') ? ':MO' : ':RO')));
kiem('khu vực của mình KHÔNG mờ', chip.includes('K Thành:RO'), JSON.stringify(chip));
kiem('khu vực người khác BỊ MỜ',
  chip.filter((x) => x.endsWith(':MO')).length === 3, JSON.stringify(chip));
kiem('chip 📊 Tổng không bị mờ', chip[0].endsWith(':RO'), chip[0]);
kiem('chip mờ có lời giải thích khi rê chuột',
  /không phụ trách/.test(await page.locator('#kvPills .kv-ngoai').first().getAttribute('title') || ''));
// ⚠️ Mờ nhưng VẪN BẤM ĐƯỢC — chặn cứng là cắt việc của người đang nhập hộ.
kiem('chip mờ VẪN bấm được (cố ý)',
  !(await page.locator('#kvPills .kv-ngoai').first().isDisabled()));

await vaoVai(CHU, [], true);
chip = await page.evaluate(() => [...document.querySelectorAll('#kvPills .kv-ngoai')].length);
kiem('Admin: KHÔNG chip nào bị mờ', chip === 0, String(chip));

await vaoVai(THANH_DO, [], false);
chip = await page.evaluate(() => [...document.querySelectorAll('#kvPills .kv-ngoai')].length);
kiem('⚠️ người CHƯA gán khu vực: cũng KHÔNG mờ (mờ hết trông như bị cấm sạch)',
  chip === 0, String(chip));

// ---------------------------------------------------------------------
console.log('\n3) ⭐ Khu vực mở SẴN phải là khu vực CỦA MÌNH');
// Đây là lỗi thật bắt được từ nhật ký bóng tối 26/08/2026: khu vực trưởng
// K Long vào web bị ném thẳng vào "Đ Uyên" (khu vực đầu danh sách) rồi mở tab
// Báo cáo và nhận "bạn không phụ trách khu vực này" — 3 lần.
await vaoVai(KVT, ['K Thành'], false);
kiem('KVT vào web là đứng sẵn ở khu vực MÌNH, không phải khu vực đầu danh sách',
  (await page.evaluate(() => selectedKV)) === 'K Thành',
  await page.evaluate(() => selectedKV));
await vaoVai({ ...KVT, phamVi: 'K My' }, ['K My'], false);
kiem('KVT khu vực CUỐI danh sách cũng vào đúng khu vực mình',
  (await page.evaluate(() => selectedKV)) === 'K My',
  await page.evaluate(() => selectedKV));
await vaoVai(CHU, [], true);
kiem('Admin thì vẫn mở khu vực đầu danh sách (xem toàn Si-ôn)',
  (await page.evaluate(() => selectedKV)) === 'Đ Uyên',
  await page.evaluate(() => selectedKV));
await vaoVai(THANH_DO, [], false);
kiem('người chưa gán: mở khu vực đầu danh sách',
  (await page.evaluate(() => selectedKV)) === 'Đ Uyên');

// ---------------------------------------------------------------------
console.log('\n4) Bảng kiểm vẽ đúng + 5 trạng thái');
await vaoVai(KVT, ['K Thành'], false);
await page.evaluate(() => selectKVSubTab('baocao'));
await page.waitForTimeout(900);
const bang = await page.evaluate(() =>
  [...document.querySelectorAll('#bc_noiDung tbody tr')].map((tr) =>
    [...tr.children].map((td) => td.textContent.trim())));
kiem('đủ 6 dòng tuần', bang.length === 6, 'thực tế ' + bang.length);
kiem('tuần 1 có nhãn ngày "(1/08)"', bang[0][0].includes('1/08'), bang[0][0]);
kiem('tuần 6 hiện "30–31/08"', bang[5][0].includes('30–31/08'), bang[5][0]);
kiem('Thờ phượng tuần 1 = ✅ (chỉ có dòng 1lan vẫn tính là đã nhập)', bang[0][1] === '✅', bang[0][1]);
kiem('Thờ phượng tuần 6 = — (không áp dụng)', bang[5][1] === '—', bang[5][1]);
kiem('Trudo tuần 5 = ✅ (23/08 là tuần 5 theo LỊCH THẬT)', bang[4][2] === '✅', bang[4][2]);
kiem('Trudo tuần 4 KHÔNG phải ✅', bang[3][2] !== '✅', bang[3][2]);
kiem('Đào tạo = ❓ chứ không phải ⚠️ (chưa đủ dữ liệu)', bang[0][5] === '❓', bang[0][5]);
kiem('tuần chưa tới hạn KHÔNG có ô nào bị chấm ⚠️',
  bang[5].slice(1, 7).every((x) => x !== '⚠️'), JSON.stringify(bang[5]));
const dau = await page.evaluate(() =>
  [...document.querySelectorAll('#bc_noiDung thead th')].map((t) => t.textContent.trim()));
kiem('KHÔNG lặp tên lễ hội hai lần',
  !dau.some((x) => x.includes('Lễ hội Lời (Lễ hội Lời)')), JSON.stringify(dau));

// ---------------------------------------------------------------------
console.log('\n5) Bấm Báo cáo + Gỡ');
await page.locator('#bc_noiDung button:has-text("Báo cáo")').first().click();
await page.waitForTimeout(900);
kiem('bấm xong CSDL có 1 dòng báo cáo',
  sqlite.prepare('SELECT COUNT(*) n FROM bao_cao_tuan').get().n === 1);
const snap = sqlite.prepare('SELECT snap_json FROM bao_cao_tuan').get().snap_json;
// ⚠️ Dấu vết chỉ được chụp CÓ/KHÔNG dữ liệu. Chụp trạng thái ✅⏳⚠️ thì cứ qua
// hạn là mọi khu vực bị gắn cờ 🔁 "đã sửa sau báo cáo" — báo oan cả phòng.
kiem('dấu vết chỉ ghi 0/1, KHÔNG ghi trạng thái', /^([a-z_]+=[01];?)+$/.test(snap), snap);
await vaoVai(CHU, [], true);
await page.evaluate(() => { selectKV('K Thành'); selectKVSubTab('baocao'); });
await page.waitForTimeout(1000);
await page.locator('#bc_noiDung button:has-text("Gỡ")').first().click();
await page.waitForTimeout(900);
kiem('Admin gỡ được báo cáo',
  sqlite.prepare('SELECT COUNT(*) n FROM bao_cao_tuan').get().n === 0);

// ---------------------------------------------------------------------
console.log('\n6) Lưới toàn Si-ôn ở màn hình 📊 Tổng');
await page.evaluate(() => selectKVTong());
await page.waitForTimeout(1000);
kiem('khung lưới hiện với Admin', await page.locator('#bcLuoiCard').isVisible());
const luoi = await page.evaluate(() =>
  [...document.querySelectorAll('#bcLuoi_noiDung tbody tr')].map((tr) =>
    [...tr.children].map((td) => td.textContent.trim())));
kiem('đủ 4 khu vực', luoi.length === 4, String(luoi.length));
kiem('mỗi dòng 1 + 6 tuần + 6 hạng mục = 13 ô', luoi[0].length === 13, String(luoi[0].length));
kiem('K Thành: Thờ phượng 4/5', luoi.find((r) => r[0] === 'K Thành')[7] === '4/5');
kiem('Đào tạo = — (chưa đủ dữ liệu, không tính vào mẫu số)',
  luoi.find((r) => r[0] === 'K Thành')[11] === '—');
// Người chưa gán khu vực -> GIẤU HẲN khung, không hiện dòng đỏ (họ đâu có sai).
await vaoVai(THANH_DO, [], false);
await page.evaluate(() => { selectKVTong(); });
await page.waitForTimeout(900);
kiem('người chưa gán khu vực: khung lưới bị GIẤU HẲN',
  !(await page.locator('#bcLuoiCard').isVisible()));

// ---------------------------------------------------------------------
console.log('\n7) ⚠️ ĐÃ GỠ hai nút "Báo cáo T3/T7" và cơ chế KHOÁ Ô XÁM');
const nguon = readFileSync(join(GOC, 'index.html'), 'utf8');
for (const [ten, re] of [
  ['tpBaoCaoRowHtml_', /function tpBaoCaoRowHtml_/],
  ['saveTPBaoCaoClick', /function saveTPBaoCaoClick/],
  ['huyTPBaoCaoClick', /function huyTPBaoCaoClick/],
  ['markTPBaoCaoStale_', /function markTPBaoCaoStale_/],
  ['CSS .dd-cell-locked', /^\s*\.dd-cell-locked\{/m],
  ['biến isLocked_', /const isLocked_/],
]) kiem('mã nguồn KHÔNG còn ' + ten, !re.test(nguon));

await vaoVai(CHU, [], true);
await page.evaluate(() => { selectKV('K Thành'); selectKVSubTab('tp'); });
await page.waitForTimeout(1600);
const hangTP = await page.evaluate(() =>
  [...document.querySelectorAll('#tpEditTable tbody tr')].map((tr) => tr.children[0].textContent.trim()));
kiem('bảng TP chỉ còn 2 hàng, KHÔNG còn hàng "Báo cáo"',
  hangTP.length === 2 && !hangTP.includes('Báo cáo'), JSON.stringify(hangTP));
kiem('KHÔNG còn ô Điểm danh nào bị khoá xám',
  (await page.evaluate(() =>
    document.querySelectorAll('#tpddTable input[disabled], #tpddTable td.dd-cell-locked').length)) === 0);

// ---------------------------------------------------------------------
console.log('\n8) Khối nhắc thay chỗ hai nút cũ');
kiem('khối nhắc hiện ra', await page.locator('#tpNhacBaoCao').isVisible());
let nhac = await page.evaluate(() => document.getElementById('tpNhacBaoCao').textContent);
kiem('nói rõ đang nhắc tuần nào', /Tuần \d/.test(nhac), nhac.slice(0, 120));
kiem('có link sang tab Báo cáo',
  (await page.locator('#tpNhacBaoCao a:has-text("Báo cáo")').count()) > 0, nhac);
await page.locator('#tpNhacBaoCao a').first().click();
await page.waitForTimeout(900);
kiem('bấm link nhảy đúng sang tab 📋 Báo cáo',
  await page.locator('#kvsub-baocao').evaluate((el) => el.classList.contains('active')));

// ⚠️ Người KHÔNG có quyền: câu chữ TUYỆT ĐỐI không được chỉ họ tới tab 📋 Báo
// cáo — chính họ không nhìn thấy tab đó (anh Rise bắt được lỗi này 26/08/2026
// khi thử bằng tài khoản thường). Chỉ đường tới chỗ vô hình = bắt đi tìm mỏi mắt.
await vaoVai(THANH_DO, [], false);
await page.evaluate(() => { selectKVSubTab('tp'); });
await page.waitForTimeout(900);
nhac = await page.evaluate(() => document.getElementById('tpNhacBaoCao').textContent);
kiem('người không có quyền: ghi rõ ai mới bấm được',
  /khu vực trưởng/i.test(nhac) && /Admin/.test(nhac), nhac.slice(0, 200));
kiem('⚠️ và KHÔNG chỉ họ tới tab mà chính họ không nhìn thấy',
  !/nằm ở tab con/.test(nhac), nhac.slice(0, 200));
kiem('có trấn an "không cần làm gì"', /không cần làm gì/.test(nhac), nhac.slice(0, 200));

// ---------------------------------------------------------------------
console.log('\n9) Không có lỗi JavaScript nào trên trang');
const loiThat = loiJS.filter((x) => !/ERR_FAILED|accounts\.google|cdnjs/.test(x));
kiem('trang chạy sạch, không lỗi JS', loiThat.length === 0, loiThat.join(' | '));

await browser.close();
console.log(`\n=== KẾT QUẢ GIAO DIỆN: ${dat} đạt, ${hong} hỏng ===\n`);
process.exit(hong ? 1 : 0);
