// =====================================================================
// KIỂM THỬ GIAO DIỆN kỳ vận động truyền đạo, bằng Chromium THẬT:
//     npm install playwright        (một lần, ở thư mục cvtl-api)
//     node scripts/giao-dien-vandong.mjs
//
// ⚠️ CỐ Ý KHÔNG đặt tên "kiem-thu-*.mjs" — vòng lặp chạy kiểm thử máy chủ
// dùng mẫu `scripts/kiem-thu*.mjs`, mà bộ này cần playwright (không nằm trong
// package.json) nên sẽ làm vòng lặp đó đỏ oan. Xem thêm bài học #46.
//
// ⚠️⚠️ HAI CA ĐẮT GIÁ NHẤT:
//   · Phần 2 — tab con 🎉 Lễ hội phục vụ HAI loại lễ hội dùng chung một khung.
//     Rẽ nhánh sai thì kỳ vận động rơi vào lưới "bài × lần" của Lễ hội Lời,
//     lưới trống trơn trông y hệt web hỏng chứ không báo lỗi gì.
//   · Phần 6 — MỞ THẬT menu 🏛️ Trudo. Ngày 30/08/2026 suýt đẩy lên một bản
//     làm chết cả menu đó (đoạn cắt ăn lan sang hàm dùng chung trong
//     trudo-ui.js) mà cả bộ kiểm thử vẫn xanh, vì không ca nào mở nó.
//
// ⭐ 30/08/2026 — màn kỳ vận động CHỈ ĐỌC và dùng CHUNG bảng xếp hạng với menu
// 🏛️ Trudo (`getXepHang`), chỉ khoá cứng khoảng ngày theo kỳ. Ba cột số web
// tự đếm; KHÔNG có điểm — điểm xem bên memo của Hội Thánh.
// =====================================================================

import { chromium } from 'playwright';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

const MA = '2026-09-thanh-linh';
const TEN = 'Vận động Thánh Linh Lễ Lều Tạm';

// ⚠️ Ngày phải tính theo HÔM NAY, không được gõ cứng '2026-09'.
// getLeHoiBanner chọn lễ hội ĐANG DIỄN RA theo ngày thật của máy chủ; gõ
// cứng thì bộ kiểm thử này chỉ xanh trong đúng tháng 9/2026 rồi đỏ mãi mãi.
// Kỳ vận động vì vậy luôn phủ trọn THÁNG HIỆN TẠI.
const HOM_NAY = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const THANG = HOM_NAY.slice(0, 7);
const BD = THANG + '-01';
const KT = THANG + '-' + String(
  new Date(Date.UTC(+THANG.slice(0, 4), +THANG.slice(5, 7), 0)).getUTCDate()).padStart(2, '0');
const KV = ['Đ Uyên', 'K Thành', 'TT Châu', 'K My'];
KV.forEach((k, i) => sqlite.prepare(
  "INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('khu_vuc',?,?)").run(k, i + 1));

// Hai lễ hội cùng tồn tại — CỐ Ý, để kiểm đúng chỗ rẽ nhánh.
sqlite.prepare(
  `INSERT INTO le_hoi_cau_hinh (ma_le_hoi,ten_le_hoi,ngay_bat_dau,ngay_ket_thuc,
                                danh_sach_bai,so_lan_yeu_cau,loai)
   VALUES (?,?,?,?,'',1,'truyen_dao')`
).run(MA, TEN, BD, KT);
// ⚠️ Lễ hội Lời để ở THÁNG SAU (sắp diễn ra): nó KHÔNG tranh mất chỗ "đang
// diễn ra" của kỳ vận động ở banner. Theo luật anh Rise chốt 30/08/2026 —
// "xếp hạng lễ hội truyền đạo chỉ xuất hiện 01/09 đến 30/09, còn lễ hội lời
// xuất hiện cho đến hết 31/08" — thẻ xếp hạng của nó phải ẨN khi chưa tới
// ngày. Phần 1b kéo nó về hiện tại một lúc để kiểm cảnh HAI KỲ GỐI NHAU rồi
// trả lại; phần 7 kéo hẳn về để kiểm bản cũ vẫn chạy y như trước.
const THANG_SAU = new Date(Date.UTC(+THANG.slice(0, 4), +THANG.slice(5, 7), 1))
  .toISOString().slice(0, 7);
sqlite.prepare(
  `INSERT INTO le_hoi_cau_hinh (ma_le_hoi,ten_le_hoi,ngay_bat_dau,ngay_ket_thuc,
                                danh_sach_bai,so_lan_yeu_cau,loai)
   VALUES ('lehoi-loi','Lễ hội Lời',?,?,'4-6,4-7',3,'loi')`
).run(THANG_SAU + '-05', THANG_SAU + '-20');

const tv = (kv, ten) => sqlite.prepare(
  `INSERT INTO giao_duc_thanh_vien (thang,khu_vuc,ten,tuan,edu_lms,tt127_ngay)
   VALUES (?,?,?,1,'',0)`).run(THANG, kv, ten);
for (const [kv, t] of [['K Thành', 'Cô A'], ['K Thành', 'Cô B'], ['Đ Uyên', 'Cô C']]) tv(kv, t);

// Số ca thật — ba cột Đơn thuần / Hữu hiệu / Báp-têm tự đếm từ đây.
sqlite.prepare(
  `INSERT INTO nhat_ky_don_thuan (ngay,khu_vuc,don_thuan,ndd1,ndd2,ndd3)
   VALUES (?,?,?,?,'','')`).run(THANG + '-04', 'K Thành', 30, 'Cô A');
sqlite.prepare(
  `INSERT INTO nhat_ky_don_thuan (ngay,khu_vuc,don_thuan,ndd1,ndd2,ndd3)
   VALUES (?,?,?,'','','')`).run(THANG + '-06', 'K Thành', 8);   // không ghi tên ai
sqlite.prepare(
  `INSERT INTO so_moc (moc,ngay,thang,ten,khu_vuc,ndd1,ndd2,ndd3,tao_luc)
   VALUES ('bap_tem',?,?,?,?,?,'','',0)`).run(THANG + '-15', THANG, 'HV1', 'Đ Uyên', 'Cô C');
sqlite.prepare(
  `INSERT INTO so_moc (moc,ngay,thang,ten,khu_vuc,ndd1,ndd2,ndd3,tao_luc)
   VALUES ('huu_hieu',?,?,?,?,?,'','',0)`).run(THANG + '-16', THANG, 'HV2', 'K Thành', 'Cô B');

const CHU = { email: 'chu@gmail.com', ten: 'Trưởng phòng', laChu: true, phamVi: '' };
const KVT = { email: 'kvt@gmail.com', ten: 'KVT K Thành', laChu: false, phamVi: 'K Thành' };
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

async function vaoVai(vai, phamVi, laChu, kv) {
  nguoiGoi = vai;
  await page.evaluate(([pv, lc, k, th]) => {
    window._laChu = lc;
    window._phamVi = pv;
    selectedKV = '';
    Object.keys(_apiCache).forEach((x) => delete _apiCache[x]);
    showPanel('kv');
    document.getElementById('kvMonth').value = th;
    khuVucList = ['Đ Uyên', 'K Thành', 'TT Châu', 'K My'];
    showUserBar_('ai@do.com');
    renderKVPills();
    selectKV(k);
    selectKVSubTab('lehoi');
  }, [phamVi, laChu, kv, THANG]);
  await page.waitForTimeout(1400);
}

console.log('\n=== KIỂM THỬ GIAO DIỆN KỲ VẬN ĐỘNG TRUYỀN ĐẠO ===\n');

// ---------------------------------------------------------------------
console.log('1) Khung kỳ vận động hiện ra ở tab con 🎉 Lễ hội');
await vaoVai(CHU, [], true, 'K Thành');
kiem('khung kỳ vận động hiện', await page.locator('#vdContent').isVisible());
kiem('tên kỳ vận động đúng',
  (await page.locator('#vd_ten').textContent()).trim() === TEN,
  await page.locator('#vd_ten').textContent());
const moTa = await page.locator('#vd_moTa').textContent();
kiem('nói rõ kỳ hạn', moTa.includes(BD) && moTa.includes(KT), moTa);
kiem('có đếm ngày còn lại', /Còn \d+ ngày|Đã kết thúc|Chưa bắt đầu/.test(moTa), moTa);
kiem('⚠️ nói rõ số lấy từ đâu, KHÔNG phải nhập lại ở đây',
  /Nhật ký đơn thuần/.test(moTa) && /không phải nhập lại/.test(moTa), moTa);

// ---------------------------------------------------------------------
console.log('\n1b) ⭐ Bảng xếp hạng phải hiện NGAY ĐẦU trang Tổng quan');
{
  // Anh Rise chốt 30/08/2026: không bắt phải vào tab mới thấy bảng.
  await page.evaluate(() => {
    Object.keys(_apiCache).forEach((x) => delete _apiCache[x]);
    showPanel('stats');
    loadStatsPanel();
  });
  await page.waitForTimeout(1600);

  kiem('⭐ thẻ xếp hạng kỳ vận động hiện ở Tổng quan',
    await page.locator('#vdXepHangCard').isVisible());
  // ⚠️ Lễ hội Lời còn ở THÁNG SAU -> thẻ xếp hạng của nó phải ẨN. Anh Rise chốt
  // 30/08/2026: mỗi bảng chỉ sống đúng bằng kỳ của nó, không xem trước số liệu
  // của một kỳ chưa bắt đầu (bảng rỗng trông y như "cả tháng không ai làm gì").
  kiem('⚠️ Lễ hội Lời chưa tới ngày -> thẻ xếp hạng của nó ẨN',
    !(await page.locator('#lehoiXepHangCard').isVisible()));
  kiem('banner vẫn ưu tiên kỳ vận động (cái ĐANG diễn ra)',
    (await page.locator('#lehoiBannerTitle').textContent()).indexOf(TEN) >= 0,
    await page.locator('#lehoiBannerTitle').textContent());
  kiem('tên kỳ vận động đúng',
    (await page.locator('#vdxh_ten').textContent()).trim() === TEN);
  kiem('câu mời của banner đổi theo loại — không nói "nhập tiến độ phát biểu"',
    !/nhập tiến độ phát biểu/.test(await page.locator('#lehoiBannerSub').textContent()),
    await page.locator('#lehoiBannerSub').textContent());
  kiem('nút banner đổi thành "Xem chi tiết"',
    /Xem chi tiết/.test(await page.locator('#lehoiBannerNut').textContent()));

  // ⚠️⚠️ Bảng ở Tổng quan phải là CÙNG MỘT bảng với màn kỳ vận động — cùng hàm
  // máy chủ, cùng hàm vẽ. Chép lại một bảng riêng là mở đường cho hai con số.
  const b = await page.evaluate(() =>
    [...document.querySelectorAll('#vdxh_bang tbody tr')].map((tr) =>
      [...tr.children].map((td) => td.textContent.trim())));
  kiem('⚠️⚠️ bảng ở Tổng quan GIỐNG HỆT bảng ở màn kỳ vận động',
    JSON.stringify(b) === JSON.stringify(await page.evaluate(() =>
      [...document.querySelectorAll('#vd_bang tbody tr')].map((tr) =>
        [...tr.children].map((td) => td.textContent.trim())))),
    JSON.stringify(b));
  kiem('người có Báp-têm đứng đầu', b[0][1] === 'Cô C', JSON.stringify(b[0]));
  kiem('⚠️ KHÔNG có cột Điểm',
    !/Điểm/.test(await page.locator('#vdxh_bang thead').textContent()));

  // ⚠️⚠️ CẢNH HAI KỲ GỐI NHAU — đây chính là con bọ ngày 30/08/2026: vừa tạo kỳ
  // vận động là bảng xếp hạng Lễ hội Lời BIẾN MẤT khỏi Tổng quan, vì thẻ bám
  // theo lễ hội mà banner chọn (banner chỉ chọn được MỘT). Kéo Lễ hội Lời về
  // trùng ngày với kỳ vận động: hai thẻ phải cùng hiện, không cái nào chiếm chỗ.
  sqlite.prepare(
    'UPDATE le_hoi_cau_hinh SET ngay_bat_dau = ?, ngay_ket_thuc = ? WHERE ma_le_hoi = ?'
  ).run(BD, KT, 'lehoi-loi');
  await page.evaluate(() => {
    Object.keys(_apiCache).forEach((x) => delete _apiCache[x]);
    showPanel('stats');
    loadStatsPanel();
  });
  await page.waitForTimeout(1600);
  kiem('⚠️⚠️ hai kỳ cùng chạy -> thẻ Lễ hội Lời KHÔNG bị kỳ vận động chiếm chỗ',
    await page.locator('#lehoiXepHangCard').isVisible());
  kiem('...và đúng tên Lễ hội Lời, không phải tên kỳ vận động',
    /Lễ hội Lời/.test(await page.locator('#lhxh_tenLeHoi').textContent()),
    await page.locator('#lhxh_tenLeHoi').textContent());
  kiem('...thẻ kỳ vận động vẫn còn nguyên bên cạnh',
    await page.locator('#vdXepHangCard').isVisible());

  // Trả Lễ hội Lời về tháng sau để các phần sau chạy đúng bối cảnh ban đầu.
  sqlite.prepare(
    'UPDATE le_hoi_cau_hinh SET ngay_bat_dau = ?, ngay_ket_thuc = ? WHERE ma_le_hoi = ?'
  ).run(THANG_SAU + '-05', THANG_SAU + '-20', 'lehoi-loi');

  // Trả về tab con Lễ hội cho các phần sau chạy tiếp.
  await page.evaluate(() => {
    Object.keys(_apiCache).forEach((x) => delete _apiCache[x]);
    showPanel('kv'); selectKVSubTab('lehoi');
  });
  await page.waitForTimeout(1200);
}

// ---------------------------------------------------------------------
console.log('\n2) ⚠️⚠️ RẼ NHÁNH — kỳ vận động KHÔNG rơi vào lưới của Lễ hội Lời');
kiem('⚠️ khung Lễ hội Lời bị ẩn hẳn',
  !(await page.locator('#lhContent').isVisible()));
kiem('⚠️ KHÔNG có ô tích nào của Lễ hội Lời',
  (await page.locator('#lhLessonGrid .lh-check').count()) === 0);
kiem('KHÔNG hiện câu "không có lễ hội nào"',
  !(await page.locator('#lhNoneCard').isVisible()));
// ⚠️ Đây là điều làm kỳ vận động khác hẳn Lễ hội Lời: KHÔNG có gì để bấm.

// ---------------------------------------------------------------------
console.log('\n3) Bảng xếp hạng — MỘT bảng duy nhất, ba cột số, KHÔNG có điểm');
{
  const b = await page.evaluate(() =>
    [...document.querySelectorAll('#vd_bang tbody tr')].map((tr) =>
      [...tr.children].map((td) => td.textContent.trim())));
  kiem('3 người + 1 dòng tổng', b.length === 4, JSON.stringify(b));
  kiem('5 cột: Hạng · Người · Đơn thuần · Hữu hiệu · Báp-têm',
    b[0].length === 5, JSON.stringify(b[0]));
  const dau = await page.locator('#vd_bang thead').textContent();
  kiem('⚠️⚠️ KHÔNG có cột Điểm nào', !/Điểm/.test(dau), dau);
  kiem('tiêu đề nói rõ đang xếp theo cột nào', /xếp theo cột này/.test(dau));

  // ⚠️ Xếp bậc thang: Cô C có 1 báp-têm nên đứng đầu, dù Cô A có tới 30 đơn
  // thuần còn Cô C thì 0. Đây CHÍNH LÀ điều anh Rise chốt 30/08/2026, và cũng
  // chính là chỗ thứ hạng ở web khác thứ hạng theo điểm của memo.
  kiem('⚠️ người có Báp-têm đứng đầu dù ít đơn thuần hơn hẳn',
    b[0][0] === '🥇' && b[0][1] === 'Cô C' && b[0][4] === '1' && b[0][2] === '0',
    JSON.stringify(b[0]));
  kiem('⚠️ 0 báp-têm thì xét tiếp Hữu hiệu — Cô B (1 hữu hiệu) trên Cô A (0)',
    b[1][1] === 'Cô B' && b[1][3] === '1', JSON.stringify(b[1]));
  kiem('⚠️ Cô A 30 đơn thuần vẫn xếp cuối vì thua ở hai nấc trên',
    b[2][1] === 'Cô A' && b[2][2] === '30', JSON.stringify(b[2]));

  kiem('dòng cuối là tổng cả Si-ôn', b[3][1] === 'Cả Si-ôn', b[3][1]);
  kiem('⚠️ tổng Đơn thuần lấy từ nguồn (30 + 8 chưa ghi tên = 38)',
    b[3][2] === '38', b[3][2]);

  const chu = await page.locator('#vd_bang').textContent();
  kiem('⚠️ chú thích nói rõ web KHÔNG có điểm, điểm xem bên memo',
    /không có điểm/i.test(chu) && /memo/i.test(chu), chu.slice(0, 240));
  kiem('⚠️ ...và nói rõ thứ hạng ở đây CÓ THỂ KHÁC bên memo', /có thể khác/.test(chu));
  kiem('⚠️ chú thích cảnh báo dòng tổng không phải cộng các dòng trên',
    /không phải cộng các dòng trên/.test(chu));
  kiem('⚠️ cảnh báo 8 đơn thuần chưa ghi tên người dẫn dắt',
    /8 đơn thuần/.test(chu) && /chưa ghi tên/.test(chu), chu.slice(-260));
}

// ---------------------------------------------------------------------
console.log('\n4) ⚠️⚠️ MÀN HÌNH KỲ VẬN ĐỘNG CHỈ ĐỌC — không có gì để nhập');
{
  // Số đã nhập ở Nhật ký đơn thuần + Sổ mốc rồi. Thêm ô nhập ở đây là bắt cả
  // phòng nhập lại lần thứ hai — anh Rise chốt: "web chỉ chép con số một lần".
  kiem('⚠️ KHÔNG có nút nào trong khung kỳ vận động',
    (await page.locator('#vdContent button').count()) === 0);
  kiem('⚠️ KHÔNG có ô nhập nào',
    (await page.locator('#vdContent input, #vdContent textarea').count()) === 0);
}

// ---------------------------------------------------------------------
console.log('\n5) KVT xem được bảng xếp hạng cả Si-ôn (thi đua phải nhìn thấy nhau)');
await vaoVai(KVT, ['K Thành'], false, 'K Thành');
{
  const chu = await page.locator('#vd_bang').textContent();
  kiem('KVT xem được người của khu vực khác', /Cô C/.test(chu));
  kiem('...và số ca vẫn hiện đầy đủ', /30/.test(chu));
  kiem('⚠️ KVT cũng không có gì để nhập',
    (await page.locator('#vdContent button, #vdContent input').count()) === 0);
}

// ---------------------------------------------------------------------
console.log('\n6) ⚠️⚠️ MỞ THẬT menu 🏛️ Trudo — bảng xếp hạng CHUNG phải vẽ được');
await vaoVai(CHU, [], true, 'K Thành');
{
  // ⚠️⚠️ BÀI HỌC 30/08/2026: bản trước suýt đẩy lên đã vô tình cắt mất mấy hàm
  // dùng chung trong trudo-ui.js (goi/esc/ngayVN) khi gỡ khối thang điểm. Cả
  // bộ kiểm thử vẫn XANH vì không ca nào mở menu Trudo. Ca dưới đây mở THẬT.
  await page.evaluate(() => {
    Object.keys(_apiCache).forEach((x) => delete _apiCache[x]);
    showPanel('trudo');
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const n = [...document.querySelectorAll('#trudoPills .kv-pill')]
      .find((x) => x.getAttribute('data-sub') === 'xephang');
    if (n) n.click();
  });
  await page.waitForTimeout(1400);

  const loi = loiJS.filter((x) => !/ERR_FAILED|net::/.test(x));
  kiem('⚠️⚠️ mở menu Trudo KHÔNG sinh lỗi JavaScript nào', loi.length === 0, loi.join(' | '));

  const bang = await page.evaluate(() =>
    [...document.querySelectorAll('#trudo-sub-xephang table tbody tr')].map((tr) =>
      [...tr.children].map((td) => td.textContent.trim())));
  kiem('bảng 🏆 Xếp hạng chung vẽ được và có người', bang.length >= 1, JSON.stringify(bang));
  kiem('⚠️ đúng 5 cột — KHÔNG còn cột Tổng điểm', bang[0].length === 5, JSON.stringify(bang[0]));
  const dau = await page.locator('#trudo-sub-xephang thead').textContent();
  kiem('⚠️⚠️ tiêu đề KHÔNG có chữ "điểm"', !/[Đđ]iểm/.test(dau), dau);
  kiem('...và nói rõ xếp theo Báp-têm', /xếp theo cột này/.test(dau), dau);
  kiem('⚠️ KHÔNG còn hai tab con Báp-têm dự lễ / Chiên bị mất',
    (await page.locator('#trudoPills [data-sub="btdule"], #trudoPills [data-sub="chien"]').count()) === 0);

  const chu = await page.locator('#trudo-sub-xephang').textContent();
  kiem('chú thích nói rõ web không có điểm', /không có điểm/i.test(chu), chu.slice(0, 200));
}

// ---------------------------------------------------------------------
console.log('\n7) Lễ hội Lời cũ KHÔNG bị ảnh hưởng');
{
  // Xoá kỳ vận động đi để getLeHoiBanner rơi về Lễ hội Lời.
  sqlite.prepare('DELETE FROM le_hoi_cau_hinh WHERE ma_le_hoi = ?').run(MA);
  sqlite.prepare(
    'UPDATE le_hoi_cau_hinh SET ngay_bat_dau = ?, ngay_ket_thuc = ? WHERE ma_le_hoi = ?'
  ).run(BD, KT, 'lehoi-loi');
  await vaoVai(CHU, [], true, 'K Thành');
  kiem('⚠️ khung kỳ vận động bị ẩn', !(await page.locator('#vdContent').isVisible()));
  kiem('khung Lễ hội Lời hiện lại bình thường', await page.locator('#lhContent').isVisible());
  kiem('bảng tiến độ Lễ hội Lời có thành viên',
    /Cô A/.test(await page.locator('#lhTienDoBody').textContent()));

  // ⚠️ Chiều ngược lại ở Tổng quan: Lễ hội Lời phải lấy lại thẻ xếp hạng của
  // mình, và thẻ kỳ vận động phải biến mất — nếu không thì trang Tổng quan sẽ
  // hiện bảng của một kỳ đã hết, trông y như số liệu thật.
  await page.evaluate(() => {
    Object.keys(_apiCache).forEach((x) => delete _apiCache[x]);
    showPanel('stats');
    loadStatsPanel();
  });
  await page.waitForTimeout(1600);
  kiem('⚠️ Tổng quan: thẻ kỳ vận động bị ẩn khi đang là Lễ hội Lời',
    !(await page.locator('#vdXepHangCard').isVisible()));
  kiem('...và thẻ xếp hạng Lễ hội Lời hiện lại',
    await page.locator('#lehoiXepHangCard').isVisible());
  kiem('nút banner trở lại "Vào nhập liệu"',
    /Vào nhập liệu/.test(await page.locator('#lehoiBannerNut').textContent()));
}

// ---------------------------------------------------------------------
console.log('\n8) Không có lỗi JavaScript nào trên trang');
{
  const that = loiJS.filter((x) => !/ERR_FAILED|net::/.test(x));
  kiem('trang chạy sạch, không lỗi JS', that.length === 0, that.join(' | '));
}

await browser.close();
console.log(`\n=== KẾT QUẢ GIAO DIỆN: ${dat} đạt, ${hong} hỏng ===\n`);
if (hong) process.exitCode = 1;
