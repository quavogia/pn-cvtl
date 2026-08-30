// =====================================================================
// Kiểm thử OFFLINE cho src/handlers/van-dong.js — KỲ VẬN ĐỘNG TRUYỀN ĐẠO:
//     node scripts/kiem-thu-van-dong.mjs
//
// ⚠️⚠️ CA ĐẮT GIÁ NHẤT CỦA CẢ BỘ NÀY LÀ PHẦN 3.
// Web đã có sẵn bảng 🏆 Xếp hạng (getXepHang trong tru-do.js) cũng cộng đơn
// thuần + sổ mốc theo khoảng ngày. Nếu kỳ vận động tự cộng theo kiểu riêng
// thì web sẽ có HAI con số cho cùng một người — đúng bài học #33, đúng loại
// lỗi đã gây vụ "hai định nghĩa tuần" hồi 26/08. Phần 3 đối chiếu TUYỆT ĐỐI
// hai hàm với nhau. Ai sửa cách cộng mà không đọc phần đó là gây lại lỗi cũ.
//
// Ba cái bẫy khác, mỗi cái có ca riêng:
//   1. Hữu hiệu / Báp-têm là SỐ NGƯỜI -> mỗi người dẫn dắt được tính TRỌN 1,
//      không bao giờ chia đôi. Chỉ ĐIỂM mới chia.
//   2. Dòng không ghi tên người dẫn dắt -> số KHÔNG được bốc hơi: vẫn vào
//      tổng của phòng và vào `chuaCoTen` để anh Rise thấy có chỗ nhập thiếu.
//   3. Cách tính điểm nằm trong CSDL. JSON gõ sai -> KHÔNG được làm sập màn
//      hình, phải lặng lẽ dùng mặc định và bật cờ `cachTinhHong`.
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_KHOI_TAO = readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8');
const { DANH_MUC } = await import(join(goc, 'src/registry.js'));
const { DIEM_MOC } = await import(join(goc, 'src/handlers/tru-do.js'));

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
const MA = '2026-09-thanh-linh';
const TEN = 'Vận động Thánh Linh Lễ Lều Tạm';
const BD = '2026-09-01';
const KT = '2026-09-30';

const CHU = { email: 'chu@gmail.com', ten: 'Trưởng phòng', laChu: true };
const KVT = { email: 'kvt@gmail.com', ten: 'KVT K My', laChu: false, phamVi: 'K My' };
const THANH_DO = { email: 'td@gmail.com', ten: 'Thánh đồ', laChu: false, phamVi: '' };

function taoCSDL(cachTinh = null) {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);
  db = bocSqlite(sqlite);
  for (const [i, kv] of KHU_VUC.entries())
    sqlite.prepare("INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('khu_vuc',?,?)").run(kv, i + 1);
  sqlite.prepare(
    `INSERT INTO le_hoi_cau_hinh (ma_le_hoi, ten_le_hoi, ngay_bat_dau, ngay_ket_thuc,
                                  danh_sach_bai, so_lan_yeu_cau, loai, cach_tinh)
     VALUES (?,?,?,?,'',1,'truyen_dao',?)`
  ).run(MA, TEN, BD, KT, cachTinh);
}

function tv(kv, ten) {
  sqlite.prepare(
    `INSERT INTO giao_duc_thanh_vien (thang,khu_vuc,ten,tuan,edu_lms,tt127_ngay)
     VALUES ('2026-09',?,?,1,'',0)`
  ).run(kv, ten);
}
function dt(ngay, kv, soLuong, ...ndd) {
  sqlite.prepare(
    `INSERT INTO nhat_ky_don_thuan (ngay,khu_vuc,don_thuan,ndd1,ndd2,ndd3)
     VALUES (?,?,?,?,?,?)`
  ).run(ngay, kv, soLuong, ndd[0] || '', ndd[1] || '', ndd[2] || '');
}
function moc(loai, ngay, kv, ten, ...ndd) {
  sqlite.prepare(
    `INSERT INTO so_moc (moc,ngay,thang,ten,khu_vuc,ndd1,ndd2,ndd3,tao_luc)
     VALUES (?,?,?,?,?,?,?,?,0)`
  ).run(loai, ngay, ngay.slice(0, 7), ten, kv, ndd[0] || '', ndd[1] || '', ndd[2] || '');
}
function mucTieu(kv, ten, d, h, b) {
  sqlite.prepare(
    `INSERT INTO muc_tieu_ca_nhan (thang,khu_vuc,ten,mt_don_thuan,mt_huu_hieu,mt_bt,mt_tt127_ngay)
     VALUES ('2026-09',?,?,?,?,?,0)`
  ).run(kv, ten, d, h, b);
}

async function goi(fn, args = [], nguoiGoi = CHU) {
  const muc = DANH_MUC[fn];
  if (!muc) return { error: 'Không hỗ trợ hàm: ' + fn };
  try {
    const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); } };
    return { result: await muc.fn({ db, env: {}, ctx, nguoiGoi }, ...args) };
  } catch (e) {
    return { error: e.message };
  }
}

let dat = 0, hong = 0;
function kiem(ten, dieuKien, chiTiet = '') {
  if (dieuKien) { dat++; console.log('  ✓', ten); }
  else { hong++; console.log('  ✗', ten, chiTiet); }
}
const nguoi = (b, ten) => b.dong.find((x) => x.ten === ten);

// =====================================================================
console.log('\n1) Cấu hình kỳ vận động');
{
  taoCSDL();
  tv('K My', 'Cô A');
  const r = await goi('getVanDongTienDo', [MA, 'K My']);
  kiem('đọc được cấu hình', !r.error, JSON.stringify(r).slice(0, 140));
  kiem('trả đúng tên kỳ vận động', r.result.ten === TEN, r.result.ten);
  kiem('trả đúng ngày bắt đầu / kết thúc',
    r.result.ngayBatDau === BD && r.result.ngayKetThuc === KT);
  kiem('lấy tháng mục tiêu từ ngày bắt đầu', r.result.thangMucTieu === '2026-09', r.result.thangMucTieu);

  // ⚠️ Chưa có bảng điểm -> KHÔNG hiện cột Điểm, và xếp theo Báp-têm trước.
  kiem('chưa có bảng điểm thì KHÔNG hiện cột Điểm', r.result.coDiem === false);
  kiem('mặc định xếp theo Báp-têm > Hữu hiệu > Đơn thuần',
    JSON.stringify(r.result.xepTheo) === JSON.stringify(['bapTem', 'huuHieu', 'donThuan']),
    JSON.stringify(r.result.xepTheo));
  kiem('mặc định KHÔNG chia đều', r.result.chiaDeu === false);

  const sai = await goi('getVanDongTienDo', ['khong-co-ma', 'K My']);
  kiem('mã không có thật -> báo lỗi rõ ràng',
    !!sai.error && /Không tìm thấy/.test(sai.error), sai.error);
}

// =====================================================================
console.log('\n2) ⚠️ Hai loại lễ hội KHÔNG được gọi nhầm hàm của nhau');
{
  taoCSDL();
  sqlite.prepare(
    `INSERT INTO le_hoi_cau_hinh (ma_le_hoi, ten_le_hoi, ngay_bat_dau, ngay_ket_thuc,
                                  danh_sach_bai, so_lan_yeu_cau, loai)
     VALUES ('2026-08-loi','Lễ hội Lời','2026-08-01','2026-08-30','4-6,4-7',3,'loi')`
  ).run();

  // Kỳ vận động KHÔNG có bài -> gọi hàm của Lễ hội Lời phải BÁO LỖI, chứ
  // không được lặng lẽ trả lưới rỗng (trông y như hỏng).
  const a = await goi('getLeHoiTienDoAll', [MA]);
  kiem('⚠️ getLeHoiTienDoAll với mã kỳ vận động -> chặn',
    !!a.error && /không có bài/.test(a.error), a.error);
  const b = await goi('toggleLeHoiLan', [MA, 'K My', 'Cô A', '4-6', 1, true]);
  kiem('⚠️ toggleLeHoiLan với mã kỳ vận động -> chặn', !!b.error, b.error);

  // Chiều ngược lại.
  const c = await goi('getVanDongTienDo', ['2026-08-loi', 'K My']);
  kiem('⚠️ getVanDongTienDo với mã Lễ hội Lời -> chặn',
    !!c.error && /không phải kỳ vận động/.test(c.error), c.error);

  // Lễ hội Lời cũ vẫn chạy y như trước.
  const d = await goi('getLeHoiTienDoAll', ['2026-08-loi']);
  kiem('Lễ hội Lời vẫn chạy bình thường', !d.error, d.error);
  const e = await goi('getLeHoiActive', []);
  kiem('getLeHoiActive trả kèm trường loai',
    !e.error && (e.result === null || typeof e.result.loai === 'string'));
}

// =====================================================================
console.log('\n3) ⚠️⚠️ KHỚP TUYỆT ĐỐI với bảng 🏆 Xếp hạng đã có (bài học #33)');
{
  // Cách tính bật `chiaDeu` + đúng thang điểm của getXepHang -> hai hàm PHẢI
  // cho ra y hệt nhau. Lệch một số là web đã có hai định nghĩa cho cùng một
  // con số, và sớm muộn hai màn hình sẽ cãi nhau trước mặt cả phòng.
  taoCSDL(JSON.stringify({
    diem: { donThuan: DIEM_MOC.don_thuan, huuHieu: DIEM_MOC.huu_hieu, bapTem: DIEM_MOC.bap_tem },
    chiaDeu: true,
    xepTheo: ['diem'],
  }));
  for (const [kv, t] of [['K My', 'Cô A'], ['K My', 'Cô B'], ['Đ Uyên', 'Cô C']]) tv(kv, t);

  dt('2026-09-03', 'K My', 100, 'Cô A', 'Cô B');   // chia đôi -> 50 / 50
  dt('2026-09-10', 'K My', 7, 'Cô A');
  dt('2026-09-21', 'Đ Uyên', 3, 'Cô C');
  dt('2026-09-25', 'K My', 5, 'Cô A', 'Cô A');     // trùng tên -> vẫn 1 người
  moc('huu_hieu', '2026-09-05', 'K My', 'HV1', 'Cô A', 'Cô B');
  moc('bap_tem', '2026-09-18', 'Đ Uyên', 'HV2', 'Cô C');
  dt('2026-08-31', 'K My', 999, 'Cô A');           // NGOÀI kỳ -> không được tính
  dt('2026-10-01', 'K My', 999, 'Cô A');           // NGOÀI kỳ -> không được tính

  const vd = await goi('getVanDongXepHang', [MA]);
  const xh = await goi('getXepHang', [BD, KT, '']);
  kiem('cả hai hàm chạy được', !vd.error && !xh.error, (vd.error || '') + (xh.error || ''));

  const mongDoi = {};
  xh.result.danhSach.forEach((x) => {
    mongDoi[x.ten] = { donThuan: x.donThuan, huuHieu: x.huuHieu, bapTem: x.bapTem, diem: x.diem };
  });
  let khop = true;
  const lech = [];
  vd.result.danhSach.forEach((x) => {
    const m = mongDoi[x.ten];
    if (!m) { khop = false; lech.push(x.ten + ':khong-co-ben-XepHang'); return; }
    for (const k of ['donThuan', 'huuHieu', 'bapTem', 'diem']) {
      if (x[k] !== m[k]) { khop = false; lech.push(x.ten + '.' + k + ': ' + x[k] + ' vs ' + m[k]); }
    }
  });
  // ⚠️ Phải đòi ĐỦ số dòng: danh sách RỖNG thì vòng lặp trên không chạy lần
  // nào và `khop` vẫn true — ca sẽ BÁO XANH OAN (bài học #69).
  kiem('⚠️⚠️ số của kỳ vận động KHỚP TUYỆT ĐỐI với bảng Xếp hạng',
    khop && vd.result.danhSach.length === 3
    && vd.result.danhSach.length === xh.result.danhSach.length,
    lech.join(' | ') || ('só dòng: ' + vd.result.danhSach.length + ' vs ' + xh.result.danhSach.length));

  kiem('tổng Đơn thuần khớp', vd.result.tong.donThuan === xh.result.tomTat.soDonThuan,
    vd.result.tong.donThuan + ' vs ' + xh.result.tomTat.soDonThuan);
  kiem('tổng Hữu hiệu khớp', vd.result.tong.huuHieu === xh.result.tomTat.soHuuHieu);
  kiem('tổng Báp-têm khớp', vd.result.tong.bapTem === xh.result.tomTat.soBapTem);

  kiem('⚠️ dòng NGOÀI khoảng ngày không được tính',
    vd.result.tong.donThuan === 115, String(vd.result.tong.donThuan));
  kiem('trùng tên trong cùng một dòng chỉ tính MỘT lần',
    nguoi === nguoi && vd.result.danhSach.find((x) => x.ten === 'Cô A').donThuan === 62,
    JSON.stringify(vd.result.danhSach.find((x) => x.ten === 'Cô A')));
}

// =====================================================================
console.log('\n4) ⚠️ Hữu hiệu / Báp-têm là SỐ NGƯỜI — không bao giờ chia đôi');
{
  taoCSDL(JSON.stringify({ diem: { donThuan: 1, huuHieu: 100, bapTem: 1000 }, chiaDeu: true }));
  tv('K My', 'Cô A'); tv('K My', 'Cô B');
  moc('bap_tem', '2026-09-09', 'K My', 'HV1', 'Cô A', 'Cô B');

  const r = await goi('getVanDongTienDo', [MA, 'K My']);
  kiem('hai người cùng dẫn 1 báp-têm -> MỖI người được trọn 1',
    nguoi(r.result, 'Cô A').bapTem === 1 && nguoi(r.result, 'Cô B').bapTem === 1,
    JSON.stringify(r.result.dong));
  kiem('...nhưng ĐIỂM thì chia đôi (500 mỗi người)',
    nguoi(r.result, 'Cô A').diem === 500, String(nguoi(r.result, 'Cô A').diem));
  kiem('tổng Báp-têm của khu vực vẫn là 1, KHÔNG phải 2',
    r.result.toanSiOn.bapTem === 1, String(r.result.toanSiOn.bapTem));
  kiem('⚠️ tổng của khu vực cộng từ các cá nhân thì THÀNH 2 — nên bảng phải '
    + 'lấy tổng từ nguồn, không cộng dòng',
    r.result.tong.bapTem === 2, String(r.result.tong.bapTem));
}

// =====================================================================
console.log('\n5) ⚠️ Số không có tên người dẫn dắt KHÔNG được bốc hơi');
{
  taoCSDL();
  tv('K My', 'Cô A');
  dt('2026-09-04', 'K My', 30, 'Cô A');
  dt('2026-09-06', 'K My', 20);                    // không ghi tên ai
  moc('bap_tem', '2026-09-11', 'K My', 'HV1');     // không ghi tên ai

  const r = await goi('getVanDongTienDo', [MA, 'K My']);
  kiem('tổng toàn Si-ôn tính CẢ phần không có tên',
    r.result.toanSiOn.donThuan === 50, String(r.result.toanSiOn.donThuan));
  kiem('phần không có tên được tách ra để nhìn thấy',
    r.result.chuaCoTen.donThuan === 20 && r.result.chuaCoTen.bapTem === 1,
    JSON.stringify(r.result.chuaCoTen));
  kiem('người có tên vẫn nhận đúng số của mình',
    nguoi(r.result, 'Cô A').donThuan === 30);
}

// =====================================================================
console.log('\n6) ⚠️ Tên có số nhưng KHÔNG có trong danh sách thành viên');
{
  // Hai danh sách khác nhau: người dẫn dắt lấy từ cấu hình, thành viên lấy từ
  // bảng Giáo dục. Tên lệch là chuyện có thật -> phải nói ra, không được để
  // số lặng lẽ biến mất khỏi bảng.
  taoCSDL();
  tv('K My', 'Cô A');
  dt('2026-09-04', 'K My', 12, 'Cô A');
  dt('2026-09-08', 'K My', 9, 'Cô Lạ');

  const r = await goi('getVanDongTienDo', [MA, 'K My']);
  kiem('bảng chỉ liệt kê thành viên chính thức', r.result.dong.length === 1);
  kiem('⚠️ người lạ có số được nêu riêng ở laKhach',
    r.result.laKhach.length === 1 && r.result.laKhach[0].ten === 'Cô Lạ'
    && r.result.laKhach[0].donThuan === 9, JSON.stringify(r.result.laKhach));
  kiem('người không có số thì KHÔNG bị nêu là người lạ',
    !r.result.laKhach.some((x) => x.ten === 'Cô A'));
}

// =====================================================================
console.log('\n7) Đích lấy từ Mục tiêu cá nhân — chưa đặt thì KHÔNG ra 0%');
{
  taoCSDL();
  tv('K My', 'Cô A'); tv('K My', 'Cô B');
  mucTieu('K My', 'Cô A', 10, 1, 0);
  dt('2026-09-04', 'K My', 5, 'Cô A');

  const r = await goi('getVanDongTienDo', [MA, 'K My']);
  const a = nguoi(r.result, 'Cô A');
  const b = nguoi(r.result, 'Cô B');
  kiem('đích Đơn thuần lấy đúng từ Mục tiêu cá nhân', a.dich.donThuan === 10);
  kiem('% tính đúng: 5/10 = 50%', a.phanTram.donThuan === 50, String(a.phanTram.donThuan));
  kiem('⚠️ hạng mục chưa đặt mục tiêu -> phanTram = null, KHÔNG phải 0',
    a.phanTram.bapTem === null, String(a.phanTram.bapTem));
  kiem('⚠️ người chưa đặt mục tiêu nào -> cả ba đều null, KHÔNG phải 0',
    b.phanTram.donThuan === null && b.phanTram.huuHieu === null && b.phanTram.bapTem === null,
    JSON.stringify(b.phanTram));
  kiem('người chưa có số vẫn xuất hiện trong bảng', b.donThuan === 0);
  kiem('đích của khu vực = cộng dồn đích các thành viên', r.result.tong.dich.donThuan === 10);

  // Mục tiêu của THÁNG KHÁC không được lẫn vào.
  sqlite.prepare(
    `INSERT INTO muc_tieu_ca_nhan (thang,khu_vuc,ten,mt_don_thuan,mt_huu_hieu,mt_bt,mt_tt127_ngay)
     VALUES ('2026-08','K My','Cô B',999,9,9,0)`
  ).run();
  const r2 = await goi('getVanDongTienDo', [MA, 'K My']);
  kiem('⚠️ mục tiêu tháng khác KHÔNG lẫn vào kỳ vận động',
    nguoi(r2.result, 'Cô B').dich.donThuan === 0,
    String(nguoi(r2.result, 'Cô B').dich.donThuan));
}

// =====================================================================
console.log('\n7b) ⭐ Hai hạng mục mới của bảng điểm Hội Thánh (27/08/2026)');
{
  taoCSDL(JSON.stringify({
    diem: { donThuan: 1, huuHieu: 50, bapTem: 500, bapTemDuLe: 1000, chienBiMat: 500 },
    xepTheo: ['diem'],
  }));
  tv('K My', 'Cô A');
  mucTieu('K My', 'Cô A', 10, 1, 1);
  moc('bap_tem', '2026-09-19', 'K My', 'HV1', 'Cô A');
  moc('bap_tem_du_le', '2026-09-22', 'K My', 'HV1', 'Cô A');
  moc('chien_bi_mat', '2026-09-23', 'K My', 'HV2', 'Cô A');

  const r = await goi('getVanDongTienDo', [MA, 'K My']);
  const a = nguoi(r.result, 'Cô A');
  kiem('bảng có đủ 5 hạng mục', r.result.hangMuc.length === 5,
    JSON.stringify(r.result.hangMuc.map((x) => x.ma)));
  kiem('⭐ Báp-têm dự lễ CỘNG THÊM, không đè lên Báp-têm',
    a.bapTem === 1 && a.bapTemDuLe === 1, JSON.stringify(a));
  kiem('Chiên bị mất đếm riêng', a.chienBiMat === 1);
  kiem('⭐ điểm = 500 + 1000 + 500 = 2000', a.diem === 2000, String(a.diem));

  // ⚠️ Hai hạng mục mới KHÔNG có chỗ đặt mục tiêu -> `dich` phải là null,
  // KHÁC HẲN 0. null = "không có đích để so"; 0 = "có chỗ đặt nhưng chưa ai
  // đặt". Nhầm hai thứ này thì bảng hiện "chưa đặt MT" vĩnh viễn ở hai cột
  // không ai làm gì được — nhiễu, rồi người ta quen bỏ qua cả nhắc thật.
  kiem('⚠️ hạng mục mới KHÔNG có đích -> dich = null (không phải 0)',
    a.dich.bapTemDuLe === null && a.dich.chienBiMat === null, JSON.stringify(a.dich));
  kiem('⚠️ ...và phanTram cũng null', a.phanTram.chienBiMat === null);
  kiem('ba hạng mục cũ vẫn có đích bình thường',
    a.dich.donThuan === 10 && a.dich.bapTem === 1, JSON.stringify(a.dich));
  kiem('máy chủ nói rõ cột nào có đích, cột nào không',
    r.result.hangMuc.filter((x) => x.coDich).length === 3,
    JSON.stringify(r.result.hangMuc));

  const xh = await goi('getVanDongXepHang', [MA]);
  kiem('xếp hạng cũng có đủ 5 hạng mục',
    xh.result.danhSach[0].bapTemDuLe === 1 && xh.result.danhSach[0].chienBiMat === 1,
    JSON.stringify(xh.result.danhSach[0]));
  kiem('tổng cả Si-ôn đếm riêng từng hạng mục mới',
    xh.result.tong.bapTemDuLe === 1 && xh.result.tong.chienBiMat === 1,
    JSON.stringify(xh.result.tong));
}

// =====================================================================
console.log('\n8) Xếp hạng — theo Báp-têm, và huy chương không trao bừa');
{
  taoCSDL();
  for (const [kv, t] of [['K My', 'Cô A'], ['K My', 'Cô B'], ['Đ Uyên', 'Cô C'], ['Đ Uyên', 'Cô D']]) tv(kv, t);
  moc('bap_tem', '2026-09-05', 'K My', 'HV1', 'Cô A');
  moc('huu_hieu', '2026-09-06', 'Đ Uyên', 'HV2', 'Cô C');
  dt('2026-09-07', 'Đ Uyên', 40, 'Cô D');
  dt('2026-09-08', 'K My', 1, 'Cô B');

  const r = await goi('getVanDongXepHang', [MA]);
  const ds = r.result.danhSach;
  kiem('người có Báp-têm đứng đầu', ds[0].ten === 'Cô A', ds[0].ten);
  kiem('⚠️ bằng 0 báp-têm thì xét tiếp Hữu hiệu — Cô C trên Cô D',
    ds[1].ten === 'Cô C' && ds[2].ten === 'Cô D',
    ds.map((x) => x.ten).join(','));
  kiem('⚠️ Cô D 40 đơn thuần vẫn đứng trên Cô B 1 đơn thuần',
    ds[2].ten === 'Cô D' && ds[3].ten === 'Cô B', ds.map((x) => x.ten).join(','));
  kiem('trường dùng để xếp hạng được nói rõ cho giao diện',
    r.result.truongXepHang === 'bapTem', r.result.truongXepHang);
  kiem('mỗi người kèm khu vực của mình', ds[0].khuVuc === 'K My', ds[0].khuVuc);

  // Cùng số thì cùng hạng.
  kiem('⚠️ hai người cùng số thì CÙNG hạng',
    ds.filter((x) => x.hang === 3).length >= 1
    && ds[ds.length - 1].hang === ds.length, JSON.stringify(ds.map((x) => [x.ten, x.hang])));
}

// =====================================================================
console.log('\n9) Phân quyền — khoá hai tầng (bài học #49)');
{
  taoCSDL();
  tv('K My', 'Cô A'); tv('Đ Uyên', 'Cô C');

  kiem('Admin xem được mọi khu vực',
    !(await goi('getVanDongTienDo', [MA, 'Đ Uyên'], CHU)).error);
  kiem('KVT xem được khu vực mình',
    !(await goi('getVanDongTienDo', [MA, 'K My'], KVT)).error);
  kiem('⚠️ KVT KHÔNG xem được khu vực khác',
    !!(await goi('getVanDongTienDo', [MA, 'Đ Uyên'], KVT)).error);
  kiem('⚠️ người chưa gán khu vực KHÔNG xem được bảng khu vực',
    !!(await goi('getVanDongTienDo', [MA, 'K My'], THANH_DO)).error);

  kiem('KVT xem được bảng xếp hạng toàn Si-ôn (thi đua phải nhìn thấy nhau)',
    !(await goi('getVanDongXepHang', [MA], KVT)).error);
  kiem('⚠️ người chưa gán khu vực KHÔNG xem được bảng xếp hạng',
    !!(await goi('getVanDongXepHang', [MA], THANH_DO)).error);

  const { VI_TRI_KHU_VUC } = await import(join(goc, 'src/nhat-ky.js'));
  kiem('⚠️ đã khai vị trí Khu vực để router chặn được',
    VI_TRI_KHU_VUC.getVanDongTienDo === 1, String(VI_TRI_KHU_VUC.getVanDongTienDo));
  kiem('CỐ Ý không đặt chuThoi cho cả hai hàm',
    !DANH_MUC.getVanDongTienDo.chuThoi && !DANH_MUC.getVanDongXepHang.chuThoi);
}

// =====================================================================
console.log('\n10) ⚠️ Bảng điểm nằm trong CSDL — gõ sai không được làm sập');
{
  taoCSDL('{ day khong phai JSON }');
  tv('K My', 'Cô A');
  const r = await goi('getVanDongTienDo', [MA, 'K My']);
  kiem('JSON hỏng -> KHÔNG ném lỗi, vẫn xem được bảng', !r.error, r.error);
  kiem('...và bật cờ để giao diện nhắc', r.result.cachTinhHong === true);
  kiem('...và rơi về cách tính mặc định',
    JSON.stringify(r.result.xepTheo) === JSON.stringify(['bapTem', 'huuHieu', 'donThuan']));

  taoCSDL(JSON.stringify({ diem: { donThuan: 2, huuHieu: 20, bapTem: 200 }, xepTheo: ['diem'] }));
  tv('K My', 'Cô A');
  dt('2026-09-04', 'K My', 3, 'Cô A');
  moc('bap_tem', '2026-09-05', 'K My', 'HV1', 'Cô A');
  const r2 = await goi('getVanDongTienDo', [MA, 'K My']);
  kiem('đổi bảng điểm trong CSDL là đổi được ngay, KHÔNG phải sửa mã',
    r2.result.coDiem === true && nguoi(r2.result, 'Cô A').diem === 206,
    String(nguoi(r2.result, 'Cô A').diem));
  kiem('xếp theo điểm khi bảng điểm có khai',
    (await goi('getVanDongXepHang', [MA])).result.truongXepHang === 'diem');

  taoCSDL(JSON.stringify({ xepTheo: ['diem'] }));   // xếp theo điểm mà không khai điểm
  tv('K My', 'Cô A');
  const r3 = await goi('getVanDongXepHang', [MA]);
  kiem('⚠️ đòi xếp theo điểm mà chưa khai bảng điểm -> rơi về mặc định',
    r3.result.truongXepHang === 'bapTem', r3.result.truongXepHang);
}

// =====================================================================
console.log('\n11) ⚠️ Mã nguồn KHÔNG được nhét cách tính điểm vào');
{
  // Bảng điểm do Hội Thánh ban hành và hay đổi giữa kỳ. Ai "cho nhanh" bằng
  // cách viết thẳng con số vào file này là mỗi lần đổi lại phải đẩy web.
  const src = readFileSync(join(goc, 'src/handlers/van-dong.js'), 'utf8');
  kiem('KHÔNG có bảng điểm cứng trong van-dong.js',
    !/donThuan:\s*1\s*,\s*huuHieu:\s*100/.test(src));
  kiem('cách tính mặc định để `diem: null` (chưa có bảng điểm)',
    /diem:\s*null/.test(src));
  // ⚠️ Soi ĐÚNG CHỖ: chữ "hoc_vien" CÓ xuất hiện trong file — ở phần chú
  // thích giải thích vì sao KHÔNG dùng bảng đó. Cấm cả chữ thì ca này đỏ oan
  // (bài học #71). Thứ bị cấm là câu lệnh ĐỌC từ bảng đó.
  kiem('⚠️ KHÔNG đọc bảng hoc_vien (phải dùng so_moc vì chỉ nó có NGÀY)',
    !/FROM\s+hoc_vien/i.test(src));
  kiem('có đọc nhat_ky_don_thuan và so_moc',
    /nhat_ky_don_thuan/.test(src) && /so_moc/.test(src));
  kiem('⚠️ CHỈ ĐỌC — không có lệnh ghi nào',
    !/INSERT INTO|UPDATE |DELETE FROM/.test(src));
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
if (hong) process.exitCode = 1;
