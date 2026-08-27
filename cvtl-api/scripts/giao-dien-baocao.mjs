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
kiem('Đào tạo = ❓ chứ không phải ⚠️ (chưa đủ dữ liệu)', bang[0][4] === '❓', bang[0][4]);
kiem('tuần chưa tới hạn KHÔNG có ô nào bị chấm ⚠️',
  bang[5].slice(1, 6).every((x) => x !== '⚠️'), JSON.stringify(bang[5]));
const dau = await page.evaluate(() =>
  [...document.querySelectorAll('#bc_noiDung thead th')].map((t) => t.textContent.trim()));
kiem('KHÔNG lặp tên lễ hội hai lần',
  !dau.some((x) => x.includes('Lễ hội Lời (Lễ hội Lời)')), JSON.stringify(dau));
// ⚠️⚠️ 27/08/2026 — anh Rise: "bảng điểm danh công việc đã được nhập thẳng
// trên My Memo rồi, bảng đó chỉ có để chữa cháy". Chấm ⚠️ ở cột đó là báo oan
// cả 8 khu vực mọi tuần, và vì một ô ⚠️ đủ làm đỏ cả dòng nên nó nhuộm đỏ
// luôn bảng theo dõi toàn Si-ôn. Hai ca dưới đây CẤM cột đó quay lại.
kiem('⚠️ KHÔNG còn cột "Trudo — điểm danh công việc"',
  !dau.some((x) => /điểm danh công việc/i.test(x)), JSON.stringify(dau));
kiem('bảng còn ĐÚNG 7 cột: Tuần + 5 hạng mục + Báo cáo',
  dau.length === 7, JSON.stringify(dau));
kiem('vẫn còn cột "Trudo — truyền đạo" (đừng bỏ nhầm cả nhóm Trudo)',
  dau.some((x) => x.includes('truyền đạo')), JSON.stringify(dau));

// ---------------------------------------------------------------------
// ⭐ 26/08/2026 — anh Rise: "trong tab báo cáo này làm sao để biết đã nhập hay
// chưa để ấn báo cáo?". Bảng kiểm CHẨN ĐOÁN đúng nhưng không DẪN ĐƯỜNG: thấy
// ⚠️ xong vẫn phải tự nhớ hạng mục đó nhập ở tab con nào. Nay ô còn việc bấm
// được. Các ca dưới đây giữ cho đường đi luôn đúng — sai bản đồ thì tệ hơn
// không có bản đồ.
console.log('\n4b) ⭐ Ô còn việc BẤM ĐƯỢC và nhảy đúng tab con');

const oNhay = async () => page.evaluate(() =>
  [...document.querySelectorAll('#bc_noiDung tbody tr')].map((tr) =>
    [...tr.children].map((td) => {
      const sp = td.querySelector('span.bc-nhay');
      return td.textContent.trim() + (sp ? '#NHAY' : '');
    })));
let lu = await oNhay();
kiem('ô ⚠️ bấm được', lu[0][2] === '⚠️#NHAY', lu[0][2]);
kiem('ô ⏳ bấm được', lu[4][1] === '⏳#NHAY', lu[4][1]);
kiem('ô ❓ bấm được (máy không dám chấm, nhưng người vẫn nên vào xem)',
  lu[0][4] === '❓#NHAY', lu[0][4]);
// ⚠️ Đây mới là phần quan trọng: ô ĐÃ XONG mà cũng gạch chân bấm được thì
// nhìn lướt không còn phân biệt được đâu là chỗ cần đụng tới.
kiem('⚠️ ô ✅ KHÔNG bấm được', lu[0][1] === '✅', lu[0][1]);
kiem('⚠️ ô — KHÔNG bấm được', lu[5][1] === '—', lu[5][1]);

const nhacO = (r, c) => page.evaluate(([a, b]) =>
  document.querySelectorAll('#bc_noiDung tbody tr')[a].children[b]
    .querySelector('span.bc-nhay').getAttribute('title'), [r, c]);
kiem('lời nhắc nói rõ mở tab nào', /bấm để mở tab TP nhập/.test(await nhacO(4, 1)), await nhacO(4, 1));
// ⚠️ Câu chữ đổi 27/08/2026: sổ gốc là My Memo, web chỉ là lớp con số. Nói
// "chưa nhập" nghe như khu vực đó CHƯA LÀM VIỆC — đổ oan cho người ta.
kiem('lời nhắc nói "chưa có số trên web", KHÔNG nói "chưa nhập"',
  /quá hạn chưa có số trên web/.test(await nhacO(0, 2)), await nhacO(0, 2));

// Bấm thử TỪNG hạng mục -> phải rơi đúng tab con của hạng mục đó.
const bamO = async (r, c) => {
  await page.evaluate(() => selectKVSubTab('baocao'));
  await page.waitForTimeout(600);
  await page.evaluate(([a, b]) =>
    document.querySelectorAll('#bc_noiDung tbody tr')[a].children[b]
      .querySelector('span.bc-nhay').click(), [r, c]);
  await page.waitForTimeout(700);
  return page.evaluate(() => kvActiveSubTab);
};
for (const [ten, r, c, tab] of [
  ['Thờ phượng', 4, 1, 'tp'],
  ['Trudo — truyền đạo', 0, 2, 'trudo'],
  ['Giáo dục', 3, 3, 'edu'],
  ['Đào tạo 70 bài', 0, 4, 'daotao'],
  ['Lễ hội Lời', 5, 5, 'lehoi'],
]) {
  const den = await bamO(r, c);
  kiem('bấm ô "' + ten + '" -> mở tab con ' + tab, den === tab, 'tới ' + den);
}

// ⚠️ Nhảy tab mà tự đổi khu vực / tháng thì người ta đang xem tháng 8 của khu
// vực mình sẽ rơi vào tháng khác và nhập nhầm chỗ.
kiem('⚠️ nhảy tab KHÔNG đổi khu vực đang xem',
  (await page.evaluate(() => selectedKV)) === 'K Thành',
  await page.evaluate(() => selectedKV));
kiem('⚠️ nhảy tab KHÔNG đổi tháng đang xem',
  (await page.evaluate(() => document.getElementById('kvMonth').value)) === '2026-08',
  await page.evaluate(() => document.getElementById('kvMonth').value));

const chuBaoCao = await page.evaluate(() =>
  document.getElementById('kvsub-baocao').textContent);
kiem('phần "Cách đọc" có nói ô gạch chân bấm được', /bấm được/.test(chuBaoCao));
kiem('⚠️ KHÔNG còn chữ "chưa nhập" (đổ oan là chưa làm việc)',
  !/chưa nhập/.test(chuBaoCao), chuBaoCao.slice(0, 200));
kiem('nói rõ sổ gốc vẫn là My Memo', /My Memo/.test(chuBaoCao));

// Trả về tab Báo cáo cho các phần sau chạy tiếp.
await page.evaluate(() => selectKVSubTab('baocao'));
await page.waitForTimeout(900);

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
console.log('\n6) 🏆 Bảng thi đua truyền đạo ở màn hình 📊 Tổng');
// ⭐ 27/08/2026 — thay lưới "Kỷ luật nhập liệu" 12 cột. Anh Rise: "con số mà
// anh muốn show nhất để các khu vực thi đua CHỈ là con số truyền đạo thôi".
await page.evaluate(() => selectKVTong());
await page.waitForTimeout(1200);
kiem('khung Thi đua hiện với Admin', await page.locator('#bcThiDuaCard').isVisible());
const td = await page.evaluate(() =>
  [...document.querySelectorAll('#bcThiDua_noiDung tbody tr')].map((tr) =>
    [...tr.children].map((x) => x.textContent.trim())));
const dauTD = await page.evaluate(() =>
  [...document.querySelectorAll('#bcThiDua_noiDung thead th')].map((x) => x.textContent.trim()));
kiem('4 khu vực + 1 dòng TỔNG', td.length === 5, String(td.length));
kiem('có cột Đơn thuần / Hữu hiệu / Báp-têm',
  dauTD.some((x) => x === 'Đơn thuần') && dauTD.some((x) => x === 'Hữu hiệu')
  && dauTD.some((x) => x === 'Báp-têm'), JSON.stringify(dauTD));

// ⚠️ Số PHẢI khớp tuyệt đối với getAllKhuVucOverview — nếu lệch nghĩa là ai
// đó đã tự cộng lại đơn thuần ở giao diện thay vì dùng chung một hàm (bài
// học #33). Đây là ca đắt giá nhất của phần này.
const goc6 = await page.evaluate(() => new Promise((ok) => {
  google.script.run.withSuccessHandler(ok).getAllKhuVucOverview('2026-08');
}));
const mongDoi = {};
goc6.forEach((x) => { mongDoi[x.khuVuc] = x.goalSummary.actual; });
let khopHet = true;
const chiTiet = [];
td.slice(0, 4).forEach((r) => {
  const m = mongDoi[r[1]];
  if (!m) { khopHet = false; chiTiet.push(r[1] + ':khong-co'); return; }
  if (String(m.donThuan) !== r[2] || String(m.huuHieu) !== r[3] || String(m.bt) !== r[4]) {
    khopHet = false;
    chiTiet.push(r[1] + ': bang=' + r.slice(2, 5).join('/') + ' nguon=' + [m.donThuan, m.huuHieu, m.bt].join('/'));
  }
});
kiem('⚠️ số khớp TUYỆT ĐỐI với getAllKhuVucOverview', khopHet, chiTiet.join(' | '));

// Xếp hạng: Đơn thuần giảm dần. Sai thứ tự thì bảng thi đua vô nghĩa.
const cotDT = td.slice(0, 4).map((r) => Number(r[2]));
kiem('xếp theo Đơn thuần GIẢM DẦN',
  cotDT.every((v, k) => k === 0 || cotDT[k - 1] >= v), JSON.stringify(cotDT));
kiem('khu vực dẫn đầu có huy chương 🥇', td[0][0] === '🥇', td[0][0]);
kiem('dòng cuối là TỔNG cả Si-ôn', td[4][1] === 'Cả Si-ôn', td[4][1]);
kiem('tổng Đơn thuần = cộng các khu vực',
  Number(td[4][2]) === cotDT.reduce((a, b) => a + b, 0),
  td[4][2] + ' vs ' + cotDT.reduce((a, b) => a + b, 0));

// ⚠️ Hữu hiệu và Báp-têm là HAI NHÓM RIÊNG — không nói ra thì người đọc cộng
// nhầm hoặc tưởng hữu hiệu bị tụt khi có người báp-têm.
const chuTD = await page.evaluate(() => document.getElementById('bcThiDuaCard').textContent);
kiem('có giải thích Hữu hiệu và Báp-têm là hai nhóm riêng', /hai nhóm riêng/.test(chuTD));
kiem('nói rõ chưa đặt mục tiêu thì hiện — chứ không phải 0%', /không phải 0%/.test(chuTD));
kiem('khung này là bảng Thi đua, không phải lưới Kỷ luật',
  /Thi đua truyền đạo/.test(chuTD) && !/Kỷ luật nhập liệu/.test(chuTD), chuTD.slice(0, 90));
// ⚠️⚠️ Bảng thi đua đếm những gì ĐÃ NHẬP TRÊN WEB. Khu vực ghi ở My Memo mà
// chưa chép số sang web sẽ hiện 0 — không nói ra thì người đọc tưởng khu vực
// đó không truyền đạo, và đem xếp hạng như vậy là oan cho người làm thật.
kiem('⚠️ nói rõ số chỉ đếm cái ĐÃ NHẬP TRÊN WEB', /ĐÃ NHẬP TRÊN WEB/.test(chuTD));
kiem('⚠️ nói rõ 0 nghĩa là chưa nhập, KHÔNG phải chưa truyền đạo',
  /KHÔNG có nghĩa là chưa truyền đạo/.test(chuTD));

// ---------------------------------------------------------------------
console.log('\n6b) 📋 Lưới Kỷ luật nhập liệu — ĐÃ ĐƯA TRỞ LẠI');
// ⭐⭐ Anh Rise chốt 27/08/2026 việc DUY NHẤT của web: "ở web chúng ta chỉ giải
// quyết bài toán sao cho kiểm soát được là các khu vực đã nhập trên web hàng
// tuần là được". Lưới này là màn hình DUY NHẤT làm được việc đó trên cả 8 khu
// vực — nên nó phải tồn tại. Đã từng bị gỡ vài giờ vì cột "Điểm danh công
// việc" báo oan làm nó đỏ đều; bỏ cột đó xong thì nó phân biệt được.
kiem('khung Kỷ luật hiện với Admin', await page.locator('#bcLuoiCard').isVisible());
const luoi = await page.evaluate(() =>
  [...document.querySelectorAll('#bcLuoi_noiDung tbody tr')].map((tr) =>
    [...tr.children].map((x) => x.textContent.trim())));
kiem('đủ 4 khu vực', luoi.length === 4, String(luoi.length));
kiem('mỗi dòng 1 + 6 tuần + 5 hạng mục = 12 ô', luoi[0].length === 12, String(luoi[0].length));
kiem('K Thành: Thờ phượng 4/5', luoi.find((r) => r[0] === 'K Thành')[7] === '4/5',
  JSON.stringify(luoi.find((r) => r[0] === 'K Thành')));
const dauLuoi = await page.evaluate(() =>
  [...document.querySelectorAll('#bcLuoi_noiDung thead th')].map((x) => x.textContent.trim()));
kiem('⚠️ lưới cũng KHÔNG còn cột "Điểm danh công việc"',
  !dauLuoi.some((x) => /điểm danh công việc/i.test(x)), JSON.stringify(dauLuoi));
const chuLuoi = await page.evaluate(() => document.getElementById('bcLuoiCard').textContent);
kiem('⚠️ lưới KHÔNG dùng chữ "chưa nhập" (đổ oan là chưa làm việc)',
  !/chưa nhập(?! liệu)/.test(chuLuoi), chuLuoi.slice(0, 160));
kiem('lưới nói "chưa có số trên web"', /chưa có số trên web/.test(chuLuoi));

// Người chưa gán khu vực -> GIẤU HẲN khung, không hiện dòng đỏ (họ đâu có sai).
await vaoVai(THANH_DO, [], false);
await page.evaluate(() => { selectKVTong(); });
await page.waitForTimeout(900);
kiem('người chưa gán khu vực: khung Thi đua bị GIẤU HẲN',
  !(await page.locator('#bcThiDuaCard').isVisible()));
kiem('người chưa gán khu vực: khung Kỷ luật cũng bị GIẤU HẲN',
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
