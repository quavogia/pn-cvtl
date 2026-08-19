// =====================================================================
// Kiểm thử OFFLINE cho src/handlers/khu-vuc.js — "Quản lý khu vực":
//     node scripts/kiem-thu-khu-vuc.mjs
//
// Đây là tính năng để anh Rise TỰ tách/thêm Khu vực mới ngay trên web,
// không cần báo Claude (thêm 19/08/2026). Trọng tâm kiểm thử:
//   1. themKhuVucMoi chèn đúng vị trí, không trùng tên, tự khởi tạo
//      config_list từ danh sách cứng nếu còn trống.
//   2. chuyenThanhVienKhuVuc chuyển ĐỦ cả 10 bảng theo người (không đụng 6
//      bảng tổng hợp khu vực), tự tạo Khu vực mới nếu chưa khai báo, xử lý
//      đúng khi trùng khoá ở Khu vực đích (không mất dữ liệu), đánh lại thứ
//      tự roster Điểm danh.
//   3. Sau khi chuyển, getDiemDanhRoster / getTPSummary phải THẤY được Khu
//      vực mới ngay (không còn bị 2 chỗ cứng NHOM_DIEM_DANH / KHU_VUC_LIST
//      chặn — đây chính là lỗi phải sửa trước khi tính năng này chạy được).
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

function taoCSDL(khoiTaoKhuVuc = true) {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);
  db = bocSqlite(sqlite);
  if (khoiTaoKhuVuc) {
    for (const [i, kv] of DS_KHU_VUC.entries())
      sqlite.prepare('INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES (?,?,?)').run('khu_vuc', kv, i + 1);
  }
}

let dat = 0, hong = 0;
const CHU = { email: 'chu@gmail.com', ten: 'Chu', laChu: true };

async function goi(fn, args = [], nguoiGoi = CHU) {
  const muc = DANH_MUC[fn];
  if (!muc) return { error: 'Không hỗ trợ hàm: ' + fn };
  try {
    return { result: await muc.fn({ db, env: {}, ctx: {}, nguoiGoi }, ...args) };
  } catch (e) {
    return { error: e.message };
  }
}
function kiem(ten, dieuKien, chiTiet = '') {
  if (dieuKien) { dat++; console.log('  ✓', ten); }
  else { hong++; console.log('  ✗', ten, chiTiet); }
}
function dsKhuVuc() {
  return sqlite.prepare("SELECT gia_tri FROM config_list WHERE loai='khu_vuc' ORDER BY thu_tu, id").all()
    .map((r) => r.gia_tri);
}

console.log('\n=== KIỂM THỬ QUẢN LÝ KHU VỰC — tách/thêm khu vực tự phục vụ (offline) ===\n');

// =====================================================================
console.log('1) themKhuVucMoi — chèn đúng vị trí');
{
  taoCSDL();
  let r = await goi('themKhuVucMoi', ['TT Châu', 'K Thành']);
  kiem('thêm thành công', r.result?.success === true, JSON.stringify(r));
  kiem('TT Châu nằm NGAY SAU K Thành', dsKhuVuc().join(',') ===
    'Đ Uyên,K Thành,TT Châu,K Trâm,K My,K Long,K Đức,SĐ', dsKhuVuc().join(','));

  r = await goi('themKhuVucMoi', ['Khu Cuối']);
  kiem('không truyền sauKhuVuc -> thêm vào cuối', r.result?.success === true);
  kiem('Khu Cuối nằm cuối danh sách', dsKhuVuc()[dsKhuVuc().length - 1] === 'Khu Cuối', dsKhuVuc().join(','));

  r = await goi('themKhuVucMoi', ['TT Châu', 'K Trâm']);
  kiem('thêm trùng tên đã có -> báo lỗi', /đã tồn tại/.test(r.error || ''), JSON.stringify(r));
  kiem('danh sách KHÔNG đổi sau lỗi trùng tên', dsKhuVuc().filter((x) => x === 'TT Châu').length === 1);

  r = await goi('themKhuVucMoi', ['Ma Không Có', 'Khu Không Tồn Tại']);
  kiem('chèn sau khu vực không tồn tại -> báo lỗi', /Không tìm thấy khu vực/.test(r.error || ''), JSON.stringify(r));

  r = await goi('themKhuVucMoi', ['']);
  kiem('thiếu tên -> báo lỗi tiếng Việt', /Thiếu/.test(r.error || ''), JSON.stringify(r));
}

console.log('\n2) themKhuVucMoi — config_list còn trống (mới cài đặt)');
{
  taoCSDL(false);
  kiem('config_list chưa có khu_vuc nào', dsKhuVuc().length === 0);
  const r = await goi('themKhuVucMoi', ['TT Châu', 'K Thành']);
  kiem('vẫn thêm được', r.result?.success === true, JSON.stringify(r));
  kiem('tự khởi tạo đủ 7 khu vực cũ + 1 khu vực mới, đúng thứ tự',
    dsKhuVuc().join(',') === 'Đ Uyên,K Thành,TT Châu,K Trâm,K My,K Long,K Đức,SĐ', dsKhuVuc().join(','));
}

// =====================================================================
console.log('\n3) chuyenThanhVienKhuVuc — chuyển đủ dữ liệu 1 người qua nhiều bảng');
{
  taoCSDL();
  await goi('themKhuVucMoi', ['TT Châu', 'K Thành']);

  const ten = 'L N Bảo Châu';
  const kvCu = 'K Thành';
  const kvMoi = 'TT Châu';

  // Gieo dữ liệu ở NHIỀU bảng khác nhau cho người này ở Khu vực cũ.
  sqlite.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, phu_huynh, thu_tu) VALUES (?,?,?,?)')
    .run(kvCu, ten, '', 3);
  sqlite.prepare('INSERT INTO diem_danh (thang, khu_vuc, ten, tuan, buoi, gia_tri) VALUES (?,?,?,?,?,?)')
    .run('2026-08', kvCu, ten, 1, 'CNsang', 'x');
  sqlite.prepare('INSERT INTO diem_danh (thang, khu_vuc, ten, tuan, buoi, gia_tri) VALUES (?,?,?,?,?,?)')
    .run('2026-08', kvCu, ten, 2, 'CNsang', 'x');
  sqlite.prepare('INSERT INTO hoc_vien (ten, khu_vuc, tien_do) VALUES (?,?,?)').run(ten, kvCu, 'B5');
  sqlite.prepare('INSERT INTO muc_tieu_ca_nhan (thang, khu_vuc, ten, mt_don_thuan) VALUES (?,?,?,?)')
    .run('2026-08', kvCu, ten, 4);
  sqlite.prepare('INSERT INTO giao_duc_thanh_vien (thang, khu_vuc, ten, tuan, edu_lms) VALUES (?,?,?,?,?)')
    .run('2026-08', kvCu, ten, 1, 'Đang làm');
  sqlite.prepare('INSERT INTO diem_danh_ghi_chu (khu_vuc, ten, ma_cap_do, ghi_chu) VALUES (?,?,?,?)')
    .run(kvCu, ten, 'C2', 'ghi chú cũ');
  sqlite.prepare('INSERT INTO dao_tao_tien_do (khu_vuc, ten, bai_da_hoc) VALUES (?,?,?)')
    .run(kvCu, ten, 'Q1-01,Q1-02');
  sqlite.prepare('INSERT INTO dao_tao_viec_giao (khu_vuc, ten, noi_dung) VALUES (?,?,?)')
    .run(kvCu, ten, 'việc A');
  sqlite.prepare("INSERT INTO le_hoi_cau_hinh (ma_le_hoi, ten_le_hoi) VALUES ('lh1','Lễ hội 1')").run();
  sqlite.prepare('INSERT INTO le_hoi_tien_do (ma_le_hoi, khu_vuc, ten, da_phat_bieu) VALUES (?,?,?,?)')
    .run('lh1', kvCu, ten, 'Q1-01#1');
  sqlite.prepare('INSERT INTO so_moc (moc, ngay, thang, ten, khu_vuc, tao_luc) VALUES (?,?,?,?,?,?)')
    .run('huu_hieu', '2026-08-01', '2026-08', ten, kvCu, Date.now());

  // Kèm 1 người KHÁC không được chọn — phải KHÔNG bị đụng tới.
  const tenKhac = 'Người Khác';
  sqlite.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, phu_huynh, thu_tu) VALUES (?,?,?,?)')
    .run(kvCu, tenKhac, '', 1);
  sqlite.prepare('INSERT INTO hoc_vien (ten, khu_vuc, tien_do) VALUES (?,?,?)').run(tenKhac, kvCu, 'B2');

  // Gieo dữ liệu Ở BẢNG TỔNG HỢP KHU VỰC (không gắn riêng ai) — PHẢI giữ
  // nguyên, không được đụng tới khi chuyển thành viên.
  sqlite.prepare('INSERT INTO tp_tho_phuong (thang, khu_vuc, loai, tuan, so_luong) VALUES (?,?,?,?,?)')
    .run('2026-08', kvCu, '1lan', 1, 9);
  sqlite.prepare('INSERT INTO nhat_ky_don_thuan (ngay, khu_vuc, don_thuan) VALUES (?,?,?)')
    .run('2026-08-05', kvCu, 3);

  const r = await goi('chuyenThanhVienKhuVuc', [kvCu, [ten], kvMoi]);
  kiem('chuyển thành công', r.result?.success === true, JSON.stringify(r));

  kiem('diem_danh_roster: đã chuyển sang TT Châu',
    dem_(`SELECT khu_vuc FROM diem_danh_roster WHERE ten=?`, ten) === kvMoi);
  kiem('diem_danh: cả 2 dòng đều chuyển',
    demSo_(`SELECT COUNT(*) c FROM diem_danh WHERE ten=? AND khu_vuc=?`, ten, kvMoi) === 2);
  kiem('diem_danh: không còn dòng nào ở Khu vực cũ',
    demSo_(`SELECT COUNT(*) c FROM diem_danh WHERE ten=? AND khu_vuc=?`, ten, kvCu) === 0);
  kiem('hoc_vien: đã chuyển, giữ nguyên tiến độ B5',
    dem_(`SELECT tien_do FROM hoc_vien WHERE ten=? AND khu_vuc=?`, ten, kvMoi) === 'B5');
  kiem('muc_tieu_ca_nhan: đã chuyển',
    demSo_(`SELECT COUNT(*) c FROM muc_tieu_ca_nhan WHERE ten=? AND khu_vuc=?`, ten, kvMoi) === 1);
  kiem('giao_duc_thanh_vien: đã chuyển',
    demSo_(`SELECT COUNT(*) c FROM giao_duc_thanh_vien WHERE ten=? AND khu_vuc=?`, ten, kvMoi) === 1);
  kiem('diem_danh_ghi_chu: đã chuyển, giữ nguyên ghi chú',
    dem_(`SELECT ghi_chu FROM diem_danh_ghi_chu WHERE ten=? AND khu_vuc=?`, ten, kvMoi) === 'ghi chú cũ');
  kiem('dao_tao_tien_do: đã chuyển',
    demSo_(`SELECT COUNT(*) c FROM dao_tao_tien_do WHERE ten=? AND khu_vuc=?`, ten, kvMoi) === 1);
  kiem('dao_tao_viec_giao: đã chuyển',
    demSo_(`SELECT COUNT(*) c FROM dao_tao_viec_giao WHERE ten=? AND khu_vuc=?`, ten, kvMoi) === 1);
  kiem('le_hoi_tien_do: đã chuyển',
    demSo_(`SELECT COUNT(*) c FROM le_hoi_tien_do WHERE ten=? AND khu_vuc=?`, ten, kvMoi) === 1);
  kiem('so_moc: đã chuyển',
    demSo_(`SELECT COUNT(*) c FROM so_moc WHERE ten=? AND khu_vuc=?`, ten, kvMoi) === 1);

  kiem('người KHÁC không bị chuyển (vẫn còn ở K Thành)',
    dem_(`SELECT khu_vuc FROM diem_danh_roster WHERE ten=?`, tenKhac) === kvCu);

  kiem('BẢNG TỔNG HỢP tp_tho_phuong CỦA KHU VỰC CŨ không bị đụng tới',
    demSo_(`SELECT COUNT(*) c FROM tp_tho_phuong WHERE khu_vuc=?`, kvCu) === 1);
  kiem('BẢNG TỔNG HỢP nhat_ky_don_thuan CỦA KHU VỰC CŨ không bị đụng tới',
    demSo_(`SELECT COUNT(*) c FROM nhat_ky_don_thuan WHERE khu_vuc=?`, kvCu) === 1);

  kiem('roster K Thành đánh lại thu_tu liền mạch (1)',
    dem_(`SELECT thu_tu FROM diem_danh_roster WHERE ten=?`, tenKhac) === 1);
  kiem('roster TT Châu đánh lại thu_tu liền mạch (1)',
    dem_(`SELECT thu_tu FROM diem_danh_roster WHERE ten=?`, ten) === 1);
}

function dem_(sql, ...p) { const r = sqlite.prepare(sql).get(...p); return r ? Object.values(r)[0] : null; }
function demSo_(sql, ...p) { return sqlite.prepare(sql).get(...p).c; }

// =====================================================================
console.log('\n4) chuyenThanhVienKhuVuc — tự tạo Khu vực mới nếu chưa khai báo');
{
  taoCSDL();
  sqlite.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, thu_tu) VALUES (?,?,?)')
    .run('K Thành', 'Cô A', 1);

  kiem('TT Mới CHƯA có trong danh sách khu vực', !dsKhuVuc().includes('TT Mới'));
  const r = await goi('chuyenThanhVienKhuVuc', ['K Thành', ['Cô A'], 'TT Mới']);
  kiem('chuyển thành công dù chưa khai báo Khu vực đích trước', r.result?.success === true, JSON.stringify(r));
  kiem('TT Mới đã TỰ ĐỘNG được thêm vào danh sách khu vực', dsKhuVuc().includes('TT Mới'), dsKhuVuc().join(','));
  kiem('dữ liệu đã chuyển sang TT Mới',
    dem_(`SELECT khu_vuc FROM diem_danh_roster WHERE ten=?`, 'Cô A') === 'TT Mới');
}

// =====================================================================
console.log('\n5) chuyenThanhVienKhuVuc — nhiều người cùng lúc');
{
  taoCSDL();
  await goi('themKhuVucMoi', ['TT Châu', 'K Thành']);
  const ds = ['Chị B', 'Chị C', 'Chị D'];
  for (const [i, ten] of ds.entries())
    sqlite.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, thu_tu) VALUES (?,?,?)').run('K Thành', ten, i + 1);

  const r = await goi('chuyenThanhVienKhuVuc', ['K Thành', ds, 'TT Châu']);
  kiem('chuyển 3 người cùng lúc thành công', r.result?.success === true, JSON.stringify(r));
  kiem('kết quả trả về đủ 3 người', (r.result?.ketQua || []).length === 3, JSON.stringify(r.result?.ketQua));
  kiem('cả 3 đều đã ở TT Châu',
    demSo_(`SELECT COUNT(*) c FROM diem_danh_roster WHERE khu_vuc='TT Châu'`) === 3);
}

// =====================================================================
console.log('\n6) chuyenThanhVienKhuVuc — trùng khoá ở Khu vực đích: BỎ QUA, không mất dữ liệu');
{
  taoCSDL();
  const ten = 'Cô Trùng';
  // Đã có sẵn 1 dòng CÙNG TÊN ở Khu vực đích (VD: đã lỡ nhập tay ở đó trước).
  sqlite.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, phu_huynh, thu_tu) VALUES (?,?,?,?)')
    .run('K Trâm', ten, 'phụ huynh Ở ĐÍCH', 1);
  sqlite.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, phu_huynh, thu_tu) VALUES (?,?,?,?)')
    .run('K Thành', ten, 'phụ huynh Ở NGUỒN', 1);

  const r = await goi('chuyenThanhVienKhuVuc', ['K Thành', [ten], 'K Trâm']);
  kiem('không lỗi, vẫn trả success', r.result?.success === true, JSON.stringify(r));
  const chiTiet = r.result?.ketQua?.[0]?.chiTiet?.find((x) => x.bang === 'diem_danh_roster');
  kiem('diem_danh_roster báo có 1 dòng bị bỏ qua vì trùng', chiTiet?.boQuaTrungLap === 1, JSON.stringify(chiTiet));
  kiem('dòng Ở ĐÍCH được giữ nguyên, không bị ghi đè',
    dem_(`SELECT phu_huynh FROM diem_danh_roster WHERE khu_vuc='K Trâm' AND ten=?`, ten) === 'phụ huynh Ở ĐÍCH');
  kiem('dòng CŨ ở K Thành KHÔNG bị xoá (chuyển thất bại thì phải giữ nguyên bản gốc)',
    demSo_(`SELECT COUNT(*) c FROM diem_danh_roster WHERE khu_vuc='K Thành' AND ten=?`, ten) === 1);
}

// =====================================================================
console.log('\n7) chuyenThanhVienKhuVuc — kiểm tra đầu vào');
{
  taoCSDL();
  let r = await goi('chuyenThanhVienKhuVuc', ['K Thành', [], 'TT Châu']);
  kiem('danh sách rỗng -> báo lỗi', /Chưa chọn thành viên/.test(r.error || ''), JSON.stringify(r));

  r = await goi('chuyenThanhVienKhuVuc', ['K Thành', ['Ai đó'], 'K Thành']);
  kiem('khu vực cũ = khu vực mới -> báo lỗi', /phải khác nhau/.test(r.error || ''), JSON.stringify(r));

  r = await goi('chuyenThanhVienKhuVuc', ['', ['Ai đó'], 'TT Châu']);
  kiem('thiếu khu vực cũ -> báo lỗi', /Thiếu/.test(r.error || ''), JSON.stringify(r));

  r = await goi('chuyenThanhVienKhuVuc', ['K Thành', ['Người không tồn tại'], 'TT Châu']);
  kiem('tên không có dữ liệu nào -> vẫn thành công (0 dòng ở mọi bảng), không lỗi',
    r.result?.success === true, JSON.stringify(r));
}

// =====================================================================
console.log('\n8) Tích hợp: sau khi chuyển, getDiemDanhRoster / getTPSummary THẤY được Khu vực mới');
{
  taoCSDL();
  await goi('themKhuVucMoi', ['TT Châu', 'K Thành']);
  const ten = 'L N Bảo Châu';
  sqlite.prepare('INSERT INTO diem_danh_roster (khu_vuc, ten, thu_tu) VALUES (?,?,?)').run('K Thành', ten, 1);
  sqlite.prepare('INSERT INTO diem_danh (thang, khu_vuc, ten, tuan, buoi, gia_tri) VALUES (?,?,?,?,?,?)')
    .run('2026-08', 'K Thành', ten, 1, 'CNsang', 'x');
  await goi('chuyenThanhVienKhuVuc', ['K Thành', [ten], 'TT Châu']);

  const roster = (await goi('getDiemDanhRoster', ['2026-08'])).result;
  const nhomTTChau = roster.find((g) => g.nhom === 'TT Châu');
  kiem('getDiemDanhRoster CÓ nhóm TT Châu (trước đây bị NHOM_DIEM_DANH cứng chặn mất)',
    !!nhomTTChau, JSON.stringify(roster.map((g) => g.nhom)));
  kiem('TT Châu có đúng 1 thành viên vừa chuyển sang',
    nhomTTChau?.thanhVien?.length === 1 && nhomTTChau.thanhVien[0].ten === ten,
    JSON.stringify(nhomTTChau));
  const nhomKThanh = roster.find((g) => g.nhom === 'K Thành');
  kiem('K Thành không còn thành viên đó nữa',
    !(nhomKThanh?.thanhVien || []).some((tv) => tv.ten === ten), JSON.stringify(nhomKThanh));

  const tp = (await goi('getTPSummary', ['2026-08'])).result;
  kiem('getTPSummary CÓ khu vực TT Châu (trước đây bị KHU_VUC_LIST cứng chặn mất)',
    tp.some((x) => x.khuVuc === 'TT Châu'), JSON.stringify(tp.map((x) => x.khuVuc)));
}

// =====================================================================
console.log('\n9) Phân quyền — chỉ tài khoản chủ');
{
  kiem('themKhuVucMoi chỉ dành cho tài khoản chủ', DANH_MUC.themKhuVucMoi.chuThoi === true);
  kiem('chuyenThanhVienKhuVuc chỉ dành cho tài khoản chủ', DANH_MUC.chuyenThanhVienKhuVuc.chuThoi === true);
  kiem('cả 2 đều là hàm ghi (doc: false)',
    DANH_MUC.themKhuVucMoi.doc === false && DANH_MUC.chuyenThanhVienKhuVuc.doc === false);
}

// =====================================================================
console.log('\n10) Độ phủ — mọi hàm export của khu-vuc.js đều đã nối vào danh mục');
{
  const khuVuc = await import(join(goc, 'src/handlers/khu-vuc.js'));
  const canPhu = Object.keys(khuVuc).filter((k) => typeof khuVuc[k] === 'function');
  const trongDanhMuc = Object.keys(DANH_MUC);
  const thieu = canPhu.filter((t) => !trongDanhMuc.includes(t));
  kiem('mọi hàm export đều đã nối vào danh mục', thieu.length === 0, 'còn thiếu: ' + thieu.join(', '));
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
if (hong > 0) process.exit(1);
