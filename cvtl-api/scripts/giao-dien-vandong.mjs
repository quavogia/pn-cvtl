// =====================================================================
// KIỂM THỬ GIAO DIỆN kỳ vận động truyền đạo, bằng Chromium THẬT:
//     npm install playwright        (một lần, ở thư mục cvtl-api)
//     node scripts/giao-dien-vandong.mjs
//
// ⚠️ CỐ Ý KHÔNG đặt tên "kiem-thu-*.mjs" — vòng lặp chạy kiểm thử máy chủ
// dùng mẫu `scripts/kiem-thu*.mjs`, mà bộ này cần playwright (không nằm trong
// package.json) nên sẽ làm vòng lặp đó đỏ oan. Xem thêm bài học #46.
//
// ⚠️⚠️ CA ĐẮT GIÁ NHẤT: phần 2. Tab con 🎉 Lễ hội nay phục vụ HAI loại lễ hội
// dùng chung một khung. Rẽ nhánh sai thì kỳ vận động rơi vào lưới "bài × lần"
// của Lễ hội Lời — lưới sẽ trống trơn và trông y hệt như web hỏng, chứ không
// báo lỗi gì. Đó là loại lỗi im lặng khó tìm nhất.
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
const ng = (d) => THANG + '-' + d;
const KV = ['Đ Uyên', 'K Thành', 'TT Châu', 'K My'];
KV.forEach((k, i) => sqlite.prepare(
  "INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('khu_vuc',?,?)").run(k, i + 1));

// Hai lễ hội cùng tồn tại — CỐ Ý, để kiểm đúng chỗ rẽ nhánh.
sqlite.prepare(
  `INSERT INTO le_hoi_cau_hinh (ma_le_hoi,ten_le_hoi,ngay_bat_dau,ngay_ket_thuc,
                                danh_sach_bai,so_lan_yeu_cau,loai,cach_tinh)
   VALUES (?,?,?,?,'',1,'truyen_dao',?)`
).run(MA, TEN, BD, KT, JSON.stringify({
  diem: { donThuan: 1, huuHieu: 50, bapTem: 500, bapTemDuLe: 1000, chienBiMat: 500 },
  chiaDeu: false,
  xepTheo: ['diem'],
}));
// Lễ hội Lời để ở QUÁ KHỨ xa: nó vẫn tồn tại (để kiểm phần rẽ nhánh) nhưng
// không tranh mất chỗ "đang diễn ra" của kỳ vận động. Phần 6 sẽ kéo nó về
// hiện tại để kiểm rằng bản cũ vẫn chạy y như trước.
sqlite.prepare(
  `INSERT INTO le_hoi_cau_hinh (ma_le_hoi,ten_le_hoi,ngay_bat_dau,ngay_ket_thuc,
                                danh_sach_bai,so_lan_yeu_cau,loai)
   VALUES ('2020-01-loi','Lễ hội Lời','2020-01-01','2020-01-30','4-6,4-7',3,'loi')`
).run();

const tv = (kv, ten) => sqlite.prepare(
  `INSERT INTO giao_duc_thanh_vien (thang,khu_vuc,ten,tuan,edu_lms,tt127_ngay)
   VALUES (?,?,?,1,'',0)`).run(THANG, kv, ten);
const dt = (ngay, kv, sl, ...n) => sqlite.prepare(
  `INSERT INTO nhat_ky_don_thuan (ngay,khu_vuc,don_thuan,ndd1,ndd2,ndd3) VALUES (?,?,?,?,?,?)`
).run(ngay, kv, sl, n[0] || '', n[1] || '', n[2] || '');
const moc = (loai, ngay, kv, ten, ...n) => sqlite.prepare(
  `INSERT INTO so_moc (moc,ngay,thang,ten,khu_vuc,ndd1,ndd2,ndd3,tao_luc) VALUES (?,?,?,?,?,?,?,?,0)`
).run(loai, ngay, ngay.slice(0, 7), ten, kv, n[0] || '', n[1] || '', n[2] || '');

for (const [kv, t] of [['K Thành', 'Cô A'], ['K Thành', 'Cô B'], ['Đ Uyên', 'Cô C']]) tv(kv, t);
sqlite.prepare(
  `INSERT INTO muc_tieu_ca_nhan (thang,khu_vuc,ten,mt_don_thuan,mt_huu_hieu,mt_bt,mt_tt127_ngay)
   VALUES (?,'K Thành','Cô A',10,1,0,0)`).run(THANG);
dt(ng('04'), 'K Thành', 5, 'Cô A');
dt(ng('09'), 'K Thành', 3, 'Cô Lạ');          // tên không có trong danh sách thành viên
dt(ng('12'), 'K Thành', 8);                    // không ghi tên ai
moc('bap_tem', ng('15'), 'Đ Uyên', 'HV1', 'Cô C');
moc('huu_hieu', ng('16'), 'K Thành', 'HV2', 'Cô B');
// Hai mốc mới theo bảng điểm Hội Thánh ban hành 27/08/2026.
moc('bap_tem_du_le', ng('18'), 'Đ Uyên', 'HV1', 'Cô C');
moc('chien_bi_mat', ng('19'), 'K Thành', 'HV3', 'Cô A');

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
kiem('⚠️ nói rõ KHÔNG phải nhập lại ở đây', /không phải nhập lại/.test(moTa), moTa);

// ---------------------------------------------------------------------
console.log('\n2) ⚠️⚠️ RẼ NHÁNH — kỳ vận động KHÔNG rơi vào lưới của Lễ hội Lời');
kiem('⚠️ khung Lễ hội Lời bị ẩn hẳn',
  !(await page.locator('#lhContent').isVisible()));
kiem('⚠️ KHÔNG có ô tích nào của Lễ hội Lời',
  (await page.locator('#lhLessonGrid .lh-check').count()) === 0);
kiem('KHÔNG hiện câu "không có lễ hội nào"',
  !(await page.locator('#lhNoneCard').isVisible()));
// ⚠️ Đây là điều làm kỳ vận động khác hẳn Lễ hội Lời: KHÔNG có gì để bấm.
kiem('⚠️ trong khung kỳ vận động KHÔNG có nút/ô nhập nào',
  (await page.locator('#vdContent button, #vdContent input').count()) === 0);

// ---------------------------------------------------------------------
console.log('\n3) Bảng theo dõi của khu vực');
const bang = await page.evaluate(() =>
  [...document.querySelectorAll('#vd_bangKV tbody tr')].map((tr) =>
    [...tr.children].map((td) => {
      const so = td.querySelector('.td-so');
      return (so ? so.textContent : td.textContent).trim();
    })));
kiem('2 thành viên + 1 dòng tổng', bang.length === 3, JSON.stringify(bang));
// Tên + 5 hạng mục + Điểm = 7 cột.
kiem('⭐ đủ 5 hạng mục theo bảng điểm Hội Thánh + cột Điểm',
  bang[0].length === 7, JSON.stringify(bang[0]));
kiem('Cô A có 5 đơn thuần', bang[0][0] === 'Cô A' && bang[0][1] === '5', JSON.stringify(bang[0]));
// 5 đơn thuần (5 điểm) + 1 chiên bị mất (500 điểm) = 505.
kiem('⭐ Cô A: 5 đơn thuần + 1 chiên bị mất -> 505 điểm',
  bang[0][5] === '1' && bang[0][6] === '505', JSON.stringify(bang[0]));
kiem('Cô B có 1 hữu hiệu', bang[1][0] === 'Cô B' && bang[1][2] === '1', JSON.stringify(bang[1]));
kiem('dòng cuối là tổng khu vực', bang[2][0] === 'Cả khu vực', bang[2][0]);

const dauKV = await page.evaluate(() =>
  [...document.querySelectorAll('#vd_bangKV thead th')].map((x) => x.textContent.trim()));
kiem('tiêu đề có đủ Báp-têm dự lễ và Chiên bị mất',
  dauKV.includes('Báp-têm dự lễ') && dauKV.includes('Chiên bị mất'), JSON.stringify(dauKV));

// ⚠️ Hai hạng mục mới KHÔNG có chỗ đặt mục tiêu -> ô của chúng chỉ hiện con
// số, KHÔNG được hiện "chưa đặt MT". Nhắc một điều không ai làm gì được là
// nhiễu, và người ta sẽ quen bỏ qua cả những lời nhắc thật.
const soODong0 = await page.evaluate(() =>
  [...document.querySelectorAll('#vd_bangKV tbody tr')[0].children]
    .map((td) => (td.querySelector('.td-mt') ? 'CO' : 'KHONG')));
kiem('⚠️ hai cột mới KHÔNG có dòng "chưa đặt MT"',
  soODong0[4] === 'KHONG' && soODong0[5] === 'KHONG', JSON.stringify(soODong0));
kiem('...nhưng ba cột cũ thì CÓ',
  soODong0[1] === 'CO' && soODong0[2] === 'CO' && soODong0[3] === 'CO', JSON.stringify(soODong0));

const mt = await page.evaluate(() =>
  [...document.querySelectorAll('#vd_bangKV tbody tr')[0].querySelectorAll('.td-mt')]
    .map((x) => x.textContent.trim().replace(/\s+/g, ' ')));
kiem('đích + % hiện đúng: 5 / 10 · 50%', mt[0] === '/ 10 · 50%', JSON.stringify(mt));
kiem('⚠️ hạng mục chưa đặt mục tiêu ghi "chưa đặt MT", KHÔNG phải 0%',
  mt[2] === 'chưa đặt MT' && !mt.includes('0%'), JSON.stringify(mt));

const chu3 = await page.locator('#vd_bangKV').textContent();
kiem('⚠️ có cảnh báo người có số nhưng chưa trong danh sách thành viên',
  /Cô Lạ/.test(chu3) && /chưa có trong danh sách thành viên/.test(chu3));
kiem('⚠️ có cảnh báo số chưa ghi tên người dẫn dắt',
  /chưa ghi tên người dẫn dắt/.test(chu3) && /8 đơn thuần/.test(chu3));
kiem('⚠️ chú thích CẤM cộng / trung bình ba cột %',
  /ĐỪNG cộng hay lấy trung bình/.test(chu3));
kiem('⚠️ nói rõ Hữu hiệu và Báp-têm đếm theo NGƯỜI',
  /đếm theo NGƯỜI/.test(chu3));
kiem('⚠️ nói rõ số có thể KHÁC bảng Thi đua vì đọc Sổ mốc',
  /Sổ mốc/.test(chu3) && /Thi đua/.test(chu3));

// ---------------------------------------------------------------------
console.log('\n4) Bảng xếp hạng cả Si-ôn');
const xh = await page.evaluate(() =>
  [...document.querySelectorAll('#vd_xepHang tbody tr')].map((tr) =>
    [...tr.children].map((td) => td.textContent.trim())));
// ⚠️ 4 người chứ không phải 3: "Cô Lạ" có số nhưng chưa có trong danh sách
// thành viên. Bảng xếp hạng CỐ Ý vẫn hiện cô ấy (khu vực để "—") — số của ai
// thì phải thuộc về người đó, giấu đi là làm mất công sức của người thật.
kiem('4 người + 1 dòng tổng', xh.length === 5, JSON.stringify(xh));
kiem('⭐ Cô C: 1 báp-têm + 1 BT dự lễ = 500 + 1000 = 1500 điểm',
  xh[0][1] === 'Cô C' && xh[0][xh[0].length - 1] === '1500', JSON.stringify(xh[0]));
kiem('⚠️ người chưa có trong danh sách thành viên VẪN được xếp hạng',
  xh.some((r) => r[1] === 'Cô Lạ' && r[2] === '—'), JSON.stringify(xh));
kiem('dòng cuối là tổng cả Si-ôn', xh[4][1] === 'Cả Si-ôn', xh[4][1]);
// ⚠️ Tìm cột theo TÊN chứ không đếm vị trí: thứ tự cột đổi theo `xepTheo`
// (cột đang dùng để xếp hạng được đưa lên trước), gõ cứng chỉ số là ca này
// sẽ đỏ oan ngay lần đầu anh Rise đổi bảng điểm.
const cotDT = (await page.evaluate(() =>
  [...document.querySelectorAll('#vd_xepHang thead th')].map((x) => x.textContent.trim())
)).indexOf('Đơn thuần');
kiem('⚠️ tổng Đơn thuần lấy từ nguồn (16 = 5+3+8), tính cả phần chưa ghi tên',
  cotDT > 0 && xh[4][cotDT] === '16', JSON.stringify(xh[4]));
kiem('người điểm cao nhất đứng đầu và được 🥇',
  xh[0][1] === 'Cô C' && xh[0][0] === '🥇', JSON.stringify(xh[0]));
const dauXH = await page.evaluate(() =>
  [...document.querySelectorAll('#vd_xepHang thead th')].map((x) => x.textContent.trim()));
kiem('có cột Điểm khi bảng điểm đã khai', dauXH.includes('Điểm'), JSON.stringify(dauXH));
kiem('tiêu đề có đủ 5 hạng mục', dauXH.length === 9, JSON.stringify(dauXH));
const chu4 = await page.locator('#vd_xepHang').textContent();
kiem('⚠️ nói rõ dòng Cả Si-ôn KHÔNG phải cộng các dòng trên',
  /không phải cộng các dòng trên/.test(chu4));

// ---------------------------------------------------------------------
console.log('\n5) Phân quyền');
await vaoVai(KVT, ['K Thành'], false, 'K Thành');
kiem('KVT xem được bảng khu vực mình',
  /Cô A/.test(await page.locator('#vd_bangKV').textContent()));
kiem('KVT vẫn xem được bảng xếp hạng cả Si-ôn (thi đua phải nhìn thấy nhau)',
  /Cô C/.test(await page.locator('#vd_xepHang').textContent()));

// ---------------------------------------------------------------------
console.log('\n6) Lễ hội Lời cũ KHÔNG bị ảnh hưởng');
{
  // Xoá kỳ vận động đi để getLeHoiBanner rơi về Lễ hội Lời.
  sqlite.prepare('DELETE FROM le_hoi_cau_hinh WHERE ma_le_hoi = ?').run(MA);
  sqlite.prepare(
    'UPDATE le_hoi_cau_hinh SET ngay_bat_dau = ?, ngay_ket_thuc = ? WHERE ma_le_hoi = ?'
  ).run(BD, KT, '2020-01-loi');
  await vaoVai(CHU, [], true, 'K Thành');
  kiem('⚠️ khung kỳ vận động bị ẩn', !(await page.locator('#vdContent').isVisible()));
  kiem('khung Lễ hội Lời hiện lại bình thường', await page.locator('#lhContent').isVisible());
  kiem('bảng tiến độ Lễ hội Lời có thành viên',
    /Cô A/.test(await page.locator('#lhTienDoBody').textContent()));
}

// ---------------------------------------------------------------------
console.log('\n7) Không có lỗi JavaScript nào trên trang');
{
  const that = loiJS.filter((x) => !/ERR_FAILED|net::/.test(x));
  kiem('trang chạy sạch, không lỗi JS', that.length === 0, that.join(' | '));
}

await browser.close();
console.log(`\n=== KẾT QUẢ GIAO DIỆN: ${dat} đạt, ${hong} hỏng ===\n`);
if (hong) process.exitCode = 1;
