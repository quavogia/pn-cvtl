// =====================================================================
// Kiểm thử OFFLINE cho src/handlers/tro-ly.js — trang "Trợ lý".
//     node scripts/kiem-thu-tro-ly.mjs
//
// Trọng tâm: trợ lý ĐƯA RA KẾT LUẬN, nên sai ở đây là anh Rise ra quyết định
// sai — nguy hiểm hơn hẳn một ô hiển thị lệch. Vì vậy kiểm theo kiểu:
// dựng sẵn một tình huống có thật, rồi bắt buộc đúng cảnh báo đó phải nổi lên,
// và những cảnh báo KHÔNG đúng tình huống thì tuyệt đối không được xuất hiện.
//
//   1. Số của Trợ lý phải KHỚP TUYỆT ĐỐI với số của trang Hiện trạng khu vực
//      (cùng gọi getAllKhuVucOverview) — không được tự tính lại.
//   2. Khu vực chưa nhập gì -> báo "chưa có số liệu", KHÔNG báo "tụt".
//   3. Mục tiêu sắp trễ chỉ báo khi tháng đã đi qua đủ xa.
//   4. Đầu tháng thì KHÔNG được hù "sắp trễ".
//   5. Nghẽn khâu cuối: nhiều người đang nghe mà 0 báp-têm.
//   6. Đề xuất phải GỌI ĐÚNG TÊN người sắp tới đích, không nói chung chung.
//   7. Không có dữ liệu -> nói thẳng "chưa đủ dữ liệu", không bịa.
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_KHOI_TAO = readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8');
const { DANH_MUC } = await import(join(goc, 'src/registry.js'));

let sqlite, db;
function bocSqlite(conn) {
  return {
    async all(sql, p = []) { return conn.prepare(sql).all(...p); },
    async first(sql, p = []) { return conn.prepare(sql).get(...p) ?? null; },
    async run(sql, p = []) { const r = conn.prepare(sql).run(...p); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
    async batch(ds) { for (const { sql, params = [] } of ds) conn.prepare(sql).run(...params); },
  };
}

const KV = ['K My', 'Đ Uyên', 'TT Châu'];
function taoCSDL() {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);
  db = bocSqlite(sqlite);
  for (const [i, kv] of KV.entries())
    sqlite.prepare("INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('khu_vuc',?,?)").run(kv, i + 1);
}
// ⚠️ Mục tiêu KHU VỰC không nhập tay nữa (đổi 01/08/2026) mà TỰ CỘNG từ Mục
// tiêu CÁ NHÂN của các thành viên — xem mucTieuTheoKV trong hoc-vien.js. Nên
// muốn dựng mục tiêu cho khu vực thì phải ghi vào muc_tieu_ca_nhan.
let demNguoi = 0;
const mucTieu = (kv, thang, dt, hh, bt) =>
  sqlite.prepare('INSERT INTO muc_tieu_ca_nhan (thang, khu_vuc, ten, mt_don_thuan, mt_huu_hieu, mt_bt) VALUES (?,?,?,?,?,?)')
    .run(thang, kv, 'TV' + (++demNguoi), dt, hh, bt);
const donThuan = (kv, ngay, so) =>
  sqlite.prepare('INSERT INTO nhat_ky_don_thuan (ngay, khu_vuc, don_thuan) VALUES (?,?,?)').run(ngay, kv, so);
/** Một học viên: ngayDau quyết định tháng tính Hữu hiệu/Báp-têm. */
const hocVien = (kv, ten, ngayDau, tienDo) =>
  sqlite.prepare('INSERT INTO hoc_vien (ten, khu_vuc, ngay_dau_chia_se, ngay_chia_se_cuoi, tien_do) VALUES (?,?,?,?,?)')
    .run(ten, kv, ngayDau, ngayDau, tienDo);
const thoPhuong = (kv, thang, loai, tuan, so) =>
  sqlite.prepare('INSERT INTO tp_tho_phuong (thang, khu_vuc, loai, tuan, so_luong) VALUES (?,?,?,?,?)')
    .run(thang, kv, loai, tuan, so);

let dat = 0, hong = 0;
const kiem = (ten, ok, ct = '') => { if (ok) { dat++; console.log('  ✓', ten); } else { hong++; console.log('  ✗', ten, ct); } };
const goi = async (fn, args = []) => {
  try { return { result: await DANH_MUC[fn].fn({ db, env: {}, ctx: {}, nguoiGoi: { email: 'a@b.c', laChu: true } }, ...args) }; }
  catch (e) { return { error: e.message }; }
};
const co = (ds, loai, kv) => ds.some((x) => x.loai === loai && (!kv || x.khuVuc === kv));

console.log('\n=== KIỂM THỬ TRANG TRỢ LÝ (offline) ===\n');

console.log('1) Đăng ký hàm');
{
  kiem('có hàm getTroLy', !!DANH_MUC.getTroLy);
  kiem('getTroLy là hàm ĐỌC', DANH_MUC.getTroLy.doc === true);
  kiem('cả phòng xem được, không giới hạn tài khoản chủ', !DANH_MUC.getTroLy.chuThoi);
}

console.log('\n2) ⭐ Số của Trợ lý phải KHỚP số của trang Hiện trạng khu vực');
{
  taoCSDL();
  mucTieu('K My', '2026-08', 10, 5, 3);
  donThuan('K My', '2026-08-05', 7);
  hocVien('K My', 'HV1', '2026-08-02', 'B5');    // Hữu hiệu
  hocVien('K My', 'HV2', '2026-08-03', 'BT');    // Báp-têm
  const tl = (await goi('getTroLy', ['2026-08', '2026-08-20'])).result;
  const ov = (await goi('getAllKhuVucOverview', ['2026-08'])).result.find((x) => x.khuVuc === 'K My');
  const k = tl.khuVuc.find((x) => x.khuVuc === 'K My');
  kiem('Đơn thuần khớp', k.thucTe.donThuan === ov.goalSummary.actual.donThuan,
    k.thucTe.donThuan + ' vs ' + ov.goalSummary.actual.donThuan);
  kiem('Hữu hiệu khớp', k.thucTe.huuHieu === ov.goalSummary.actual.huuHieu,
    k.thucTe.huuHieu + ' vs ' + ov.goalSummary.actual.huuHieu);
  kiem('Báp-têm khớp', k.thucTe.bt === ov.goalSummary.actual.bt,
    k.thucTe.bt + ' vs ' + ov.goalSummary.actual.bt);
  kiem('Mục tiêu khớp', k.mucTieu.donThuan === 10 && k.mucTieu.bt === 3);
  kiem('có cờ coDuLieu = true', tl.coDuLieu === true);
}

console.log('\n3) Khu vực chưa nhập gì -> báo "chưa có số liệu", KHÔNG báo "tụt"');
{
  taoCSDL();
  donThuan('K My', '2026-08-05', 5);
  const tl = (await goi('getTroLy', ['2026-08', '2026-08-28'])).result;   // đã qua ~90% tháng
  kiem('Đ Uyên bị báo "chưa có số liệu"', co(tl.canhBao, 'chua_co_so_lieu', 'Đ Uyên'),
    JSON.stringify(tl.canhBao.map((x) => x.loai + '/' + x.khuVuc)));
  kiem('⭐ và KHÔNG bị báo "tụt so tháng trước" (vô nghĩa khi chưa có số)',
    !co(tl.canhBao.filter((x) => x.khuVuc === 'Đ Uyên'), 'tut_so_thang_truoc'));
  kiem('cảnh báo này ở mức CAO', tl.canhBao.find((x) => x.loai === 'chua_co_so_lieu').mucDo === 'cao');
  kiem('có đề xuất hỏi lại khu vực đó',
    tl.deXuat.some((x) => x.khuVuc === 'Đ Uyên' && /nhập số liệu/.test(x.viec)),
    JSON.stringify(tl.deXuat.map((x) => x.viec)));
}

console.log('\n4) ⭐ Đầu tháng thì KHÔNG được hù "sắp trễ"');
{
  taoCSDL();
  mucTieu('K My', '2026-08', 100, 50, 20);
  donThuan('K My', '2026-08-02', 1);          // mới đạt 1/100
  const dauThang = (await goi('getTroLy', ['2026-08', '2026-08-03'])).result;
  kiem('ngày 3 -> KHÔNG báo sắp trễ', !co(dauThang.canhBao, 'muc_tieu_sap_tre'),
    JSON.stringify(dauThang.canhBao.map((x) => x.loai)));
  const cuoiThang = (await goi('getTroLy', ['2026-08', '2026-08-29'])).result;
  kiem('ngày 29 -> CÓ báo sắp trễ', co(cuoiThang.canhBao, 'muc_tieu_sap_tre', 'K My'));
  const cb = cuoiThang.canhBao.find((x) => x.loai === 'muc_tieu_sap_tre' && x.soLieu.chiSo === 'donThuan');
  kiem('nói đúng còn thiếu bao nhiêu', cb.soLieu.conThieu === 99, JSON.stringify(cb.soLieu));
}

console.log('\n4b) ⭐ Khu vực chưa ai đặt Mục tiêu cá nhân -> phải nói rõ là KHÔNG chấm được');
{
  taoCSDL();
  donThuan('K My', '2026-08-05', 5);           // có làm việc, nhưng không ai đặt mục tiêu
  const tl = (await goi('getTroLy', ['2026-08', '2026-08-28'])).result;
  kiem('có cảnh báo "chưa đặt mục tiêu"', co(tl.canhBao, 'chua_dat_muc_tieu', 'K My'),
    JSON.stringify(tl.canhBao.map((x) => x.loai + '/' + x.khuVuc)));
  kiem('⭐ và KHÔNG báo "sắp trễ" (không có mục tiêu thì lấy gì mà trễ)',
    !co(tl.canhBao, 'muc_tieu_sap_tre'));
  kiem('% đạt = null chứ không phải 0%',
    tl.khuVuc.find((x) => x.khuVuc === 'K My').phanTramDat.donThuan === null,
    String(tl.khuVuc.find((x) => x.khuVuc === 'K My').phanTramDat.donThuan));
  kiem('có đề xuất nhắc đặt mục tiêu',
    tl.deXuat.some((x) => x.khuVuc === 'K My' && /[Mm]ục tiêu cá nhân/.test(x.viec)),
    JSON.stringify(tl.deXuat.map((x) => x.viec)));
}

console.log('\n5) Tụt mạnh so tháng trước');
{
  taoCSDL();
  donThuan('K My', '2026-07-10', 20);
  donThuan('K My', '2026-08-10', 5);           // giảm 75%
  donThuan('Đ Uyên', '2026-07-10', 10);
  donThuan('Đ Uyên', '2026-08-10', 9);         // giảm 10% -> chưa đáng báo
  const tl = (await goi('getTroLy', ['2026-08', '2026-08-15'])).result;
  kiem('K My giảm 75% -> có báo', co(tl.canhBao, 'tut_so_thang_truoc', 'K My'));
  kiem('⭐ Đ Uyên giảm 10% -> KHÔNG báo (tránh làm phiền vì dao động nhỏ)',
    !co(tl.canhBao.filter((x) => x.khuVuc === 'Đ Uyên'), 'tut_so_thang_truoc'));
  const cb = tl.canhBao.find((x) => x.loai === 'tut_so_thang_truoc');
  kiem('dẫn đúng số cũ và số mới', cb.soLieu.truoc === 20 && cb.soLieu.nay === 5, JSON.stringify(cb.soLieu));
}

console.log('\n6) ⭐ Nghẽn khâu cuối + đề xuất phải GỌI ĐÚNG TÊN người sắp tới đích');
{
  taoCSDL();
  mucTieu('K My', '2026-08', 0, 0, 4);
  for (let i = 1; i <= 6; i++) hocVien('K My', 'Người ' + i, '2026-08-0' + i, 'B' + (10 + i));
  // B11..B16, trong đó B14/B15/B16 là "gần đích"
  const tl = (await goi('getTroLy', ['2026-08', '2026-08-28'])).result;
  const k = tl.khuVuc.find((x) => x.khuVuc === 'K My');
  kiem('đếm đúng 6 người đang nghe', k.dangNghe === 6, String(k.dangNghe));
  kiem('đếm đúng 3 người gần đích (B14-B16)', k.ganDich === 3, String(k.ganDich));
  kiem('có cảnh báo nghẽn khâu cuối', co(tl.canhBao, 'nghen_khau_cuoi', 'K My'));
  const dx = tl.deXuat.find((x) => /sắp tới đích/.test(x.viec));
  kiem('có đề xuất về người sắp tới đích', !!dx, JSON.stringify(tl.deXuat.map((x) => x.viec)));
  kiem('⭐ đề xuất GỌI ĐÚNG TÊN, không nói chung chung',
    /Người 6 \(B16\)/.test(dx.viec) && /Người 5 \(B15\)/.test(dx.viec), dx.viec);
  kiem('người gần đích nhất xếp trước', dx.soLieu.danhSach[0].tienDo === 'B16', JSON.stringify(dx.soLieu.danhSach));
  kiem('đề xuất có dẫn lý do bằng số thật', /Còn thiếu 4 Báp-têm|chưa có Báp-têm nào/.test(dx.viSao), dx.viSao);
}

console.log('\n7) Thờ phượng giảm');
{
  taoCSDL();
  donThuan('K My', '2026-08-05', 3);
  thoPhuong('K My', '2026-07', '4lan', 1, 12);
  thoPhuong('K My', '2026-08', '4lan', 1, 8);
  const tl = (await goi('getTroLy', ['2026-08', '2026-08-20'])).result;
  kiem('có cảnh báo Thờ phượng giảm', co(tl.canhBao, 'tho_phuong_giam', 'K My'));
  const cb = tl.canhBao.find((x) => x.loai === 'tho_phuong_giam');
  kiem('nói đúng 12 -> 8', cb.soLieu.truoc === 12 && cb.soLieu.nay === 8, JSON.stringify(cb.soLieu));
  kiem('có đề xuất gọi lại người vắng', tl.deXuat.some((x) => /Gọi lại/.test(x.viec)));
}

console.log('\n8) Điểm sáng + nhân rộng cách làm');
{
  taoCSDL();
  mucTieu('Đ Uyên', '2026-08', 5, 0, 0);
  donThuan('Đ Uyên', '2026-08-05', 12);        // 240% mục tiêu
  mucTieu('K My', '2026-08', 20, 0, 0);
  donThuan('K My', '2026-08-05', 2);           // 10% mục tiêu
  const tl = (await goi('getTroLy', ['2026-08', '2026-08-28'])).result;
  kiem('Đ Uyên vào danh sách điểm sáng', tl.diemSang.some((x) => x.khuVuc === 'Đ Uyên'),
    JSON.stringify(tl.diemSang));
  kiem('tính đúng 240%', tl.diemSang.find((x) => x.khuVuc === 'Đ Uyên').phanTram === 240);
  kiem('có đề xuất hỏi cách làm để chia sẻ lại',
    tl.deXuat.some((x) => x.khuVuc === 'Đ Uyên' && /cách làm/.test(x.viec)),
    JSON.stringify(tl.deXuat.map((x) => x.viec)));
}

console.log('\n9) ⭐ Không có dữ liệu -> nói thẳng, KHÔNG bịa');
{
  taoCSDL();
  const tl = (await goi('getTroLy', ['2026-08', '2026-08-15'])).result;
  kiem('coDuLieu = false', tl.coDuLieu === false);
  kiem('không bịa ra điểm sáng', tl.diemSang.length === 0);
  kiem('tổng quan trả về 0 chứ không phải null/NaN',
    tl.tongQuan.donThuan.nay === 0 && tl.tongQuan.bt.nay === 0, JSON.stringify(tl.tongQuan.donThuan));
  kiem('% đạt mục tiêu = null khi CHƯA ĐẶT mục tiêu (không phải 0%)',
    tl.tongQuan.mucTieu.bt.phanTram === null, String(tl.tongQuan.mucTieu.bt.phanTram));
}

console.log('\n10) Tỉ lệ trong tháng + chặn tháng sai');
{
  taoCSDL();
  donThuan('K My', '2026-08-05', 10);
  hocVien('K My', 'A', '2026-08-02', 'B5');
  hocVien('K My', 'B', '2026-08-03', 'B6');
  hocVien('K My', 'C', '2026-08-04', 'BT');
  const tl = (await goi('getTroLy', ['2026-08', '2026-08-20'])).result;
  const k = tl.khuVuc.find((x) => x.khuVuc === 'K My');
  // ⭐ A(B5) + B(B6) = Hữu hiệu 2; C(BT) = Báp-têm 1. Hai nhóm RỜI NHAU.
  kiem('đếm đúng Hữu hiệu 2, Báp-têm 1 (không lồng nhau)',
    k.thucTe.huuHieu === 2 && k.thucTe.bt === 1, JSON.stringify(k.thucTe));
  kiem('"đi tiếp"/Đơn thuần = (2+1)/10 = 30%', k.tyLeTrongThang.diTiepTrenDonThuan === 30,
    String(k.tyLeTrongThang.diTiepTrenDonThuan));
  kiem('⭐ Báp-têm/"đi tiếp" = 1/3 = 33% (KHÔNG phải 1/2 = 50%)',
    k.tyLeTrongThang.btTrenDiTiep === 33, String(k.tyLeTrongThang.btTrenDiTiep));
  kiem('⭐ mẫu số = 0 thì trả null chứ không phải 0%',
    tl.khuVuc.find((x) => x.khuVuc === 'TT Châu').tyLeTrongThang.btTrenDiTiep === null);
  const r = await goi('getTroLy', ['2026-13']);
  kiem('chặn tháng không hợp lệ', !!r.error, JSON.stringify(r));
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
process.exit(hong ? 1 : 0);
