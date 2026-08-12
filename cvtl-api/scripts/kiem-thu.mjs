// =====================================================================
// Chạy thử backend mới NGAY TRÊN MÁY, không cần mạng, không cần Cloudflare.
// Dùng SQLite trong bộ nhớ để giả lập CSDL D1.
//   node scripts/kiem-thu.mjs
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- Giả lập D1 bằng node:sqlite ------------------------------------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8'));

const db = {
  async all(sql, p = []) { return sqlite.prepare(sql).all(...p); },
  async first(sql, p = []) { return sqlite.prepare(sql).get(...p) ?? null; },
  async run(sql, p = []) { return sqlite.prepare(sql).run(...p); },
  async batch(ds) { for (const { sql, params = [] } of ds) sqlite.prepare(sql).run(...params); },
};

const env = { GOOGLE_CLIENT_ID: 'test', DB: null };

// --- Nạp dữ liệu mẫu -------------------------------------------------
db.run("INSERT INTO access_control (email, trang_thai, ten, la_chu) VALUES ('rise.shine1948@gmail.com','da_duyet','Chu',1)");
db.run("INSERT INTO access_control (email, trang_thai, ten, la_chu) VALUES ('nhanvien@gmail.com','da_duyet','Nhan vien',0)");
for (const [i, kv] of ['Đ Uyên','K Thành','K Trâm','K My','K Long','K Đức','SĐ'].entries()) {
  db.run('INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES (?,?,?)', ['khu_vuc', kv, i]);
}
for (const [i, t] of ['B1','B2','BT','Tạm nghỉ'].entries()) {
  db.run('INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES (?,?,?)', ['tien_do', t, i]);
}
for (const [i, ten] of ['L H Đức','N T Huyền','N Khánh Hoàng'].entries()) {
  db.run('INSERT INTO diem_danh_roster (khu_vuc, ten, thu_tu) VALUES (?,?,?)', ['SĐ', ten, i + 1]);
}

// --- Bộ khung kiểm thử ----------------------------------------------
const { DANH_MUC } = await import(join(goc, 'src/registry.js'));
let dat = 0, hong = 0;

async function goi(fn, args, nguoiGoi) {
  const muc = DANH_MUC[fn];
  if (!muc) return { error: 'Không hỗ trợ hàm: ' + fn };
  try {
    const r = await muc.fn({ db, env, nguoiGoi }, ...args);
    return { result: r };
  } catch (e) {
    return { error: e.message };
  }
}

function kiem(ten, dieuKien, chiTiet = '') {
  if (dieuKien) { dat++; console.log('  ✓', ten); }
  else { hong++; console.log('  ✗', ten, chiTiet); }
}

const CHU = { email: 'rise.shine1948@gmail.com', ten: 'Chu', laChu: true };
const NV  = { email: 'nhanvien@gmail.com', ten: 'Nhan vien', laChu: false };
const TH = '2026-08';

console.log('\n=== KIỂM THỬ BACKEND MỚI (offline) ===\n');

console.log('1) Cấu hình');
{
  const r = await goi('getDropdownOptions', [], NV);
  kiem('getDropdownOptions trả đủ 7 khu vực', r.result?.khuVuc?.length === 7, JSON.stringify(r));
  kiem('getDropdownOptions trả danh sách tiến độ', r.result?.tienDo?.includes('BT'));
}

console.log('\n2) Điểm danh — ghi và đọc');
{
  let r = await goi('saveDiemDanhCell', [TH, 'SĐ', 'L H Đức', 3, 'T3toi', '211'], NV);
  kiem('nhân viên ghi được ô chưa báo cáo', r.result?.success === true, JSON.stringify(r));

  r = await goi('getDiemDanhRoster', [TH], NV);
  const nhomSD = r.result?.find((g) => g.nhom === 'SĐ');
  kiem('roster trả đúng 9 nhóm', r.result?.length === 9);
  kiem('roster SĐ có 3 thành viên', nhomSD?.thanhVien.length === 3);
  kiem('ô vừa ghi đọc lại đúng', nhomSD?.thanhVien[0]?.diemDanh?.[3]?.T3toi === '211');
  kiem('tổng kết đếm đúng 1 buổi', nhomSD?.thanhVien[0]?.tongKet === 1);
}

console.log('\n3) Gợi ý số liệu TP từ Điểm danh');
{
  await goi('saveDiemDanhCell', [TH, 'SĐ', 'N T Huyền', 3, 'T3toi', '211'], NV);
  await goi('saveDiemDanhCell', [TH, 'SĐ', 'N T Huyền', 3, 'CNsang', '211'], NV);
  await goi('saveDiemDanhCell', [TH, 'SĐ', 'N T Huyền', 3, 'CNchieu', '211'], NV);
  await goi('saveDiemDanhCell', [TH, 'SĐ', 'N T Huyền', 3, 'CNtoi', '211'], NV);
  const r = await goi('getDiemDanhTPGoiY', [TH, 'SĐ'], NV);
  kiem('≥1 lần tuần 3 = 2 người', r.result?.oneLan[2] === 2, JSON.stringify(r.result));
  kiem('≥4 lần tuần 3 = 1 người', r.result?.fourLan[2] === 1, JSON.stringify(r.result));
}

console.log('\n4) Báo cáo T3/T7 và khoá ô');
{
  let r = await goi('saveTPBaoCao', [TH, 'SĐ', 3, 'T3'], NV);
  kiem('báo cáo T3 thành công', !!r.result?.thoiGian, JSON.stringify(r));

  r = await goi('saveDiemDanhCell', [TH, 'SĐ', 'L H Đức', 3, 'T3toi', '999'], NV);
  kiem('nhân viên BỊ CHẶN sửa ô đã báo cáo', /đã báo cáo/.test(r.error || ''), JSON.stringify(r));

  r = await goi('saveDiemDanhCell', [TH, 'SĐ', 'L H Đức', 3, 'T3toi', '999'], CHU);
  kiem('tài khoản chủ VẪN sửa được', r.result?.success === true, JSON.stringify(r));

  r = await goi('saveDiemDanhCell', [TH, 'SĐ', 'L H Đức', 3, 'CNsang', '211'], NV);
  kiem('buổi Thứ 7 chưa báo cáo thì vẫn ghi được', r.result?.success === true, JSON.stringify(r));

  r = await goi('saveDiemDanhCell', [TH, 'SĐ', 'L H Đức', 2, 'T3toi', '211'], NV);
  kiem('tuần khác không bị khoá lây', r.result?.success === true, JSON.stringify(r));
}

console.log('\n5) Bảng TP tổng hợp');
{
  await goi('saveTPWeek', [TH, 'SĐ', '1lan', 3, 9], CHU);
  await goi('saveTPWeek', [TH, 'SĐ', '4lan', 3, 3], CHU);
  const r = await goi('getTPSummary', [TH], NV);
  const sd = r.result?.find((x) => x.khuVuc === 'SĐ');
  kiem('trả đủ 7 khu vực', r.result?.length === 7);
  kiem('số liệu tuần 3 đúng', sd?.oneLan.weeks[2] === 9 && sd?.fourLan.weeks[2] === 3);
  kiem('có 5 tuần báo cáo', sd?.baoCao.length === 5);
  kiem('tuần 3 có nhãn báo cáo T3', !!sd?.baoCao[2].T3.label, JSON.stringify(sd?.baoCao[2]));
  kiem('phát hiện "đã sửa sau báo cáo"', sd?.baoCao[2].T3.edited === true, JSON.stringify(sd?.baoCao[2]));
}

console.log('\n6) Chống ghi trùng (điểm yếu chí mạng của bản Google Sheets)');
{
  await Promise.all(Array.from({ length: 20 }, (_, i) =>
    goi('saveDiemDanhCell', [TH, 'SĐ', 'N Khánh Hoàng', 4, 'T3toi', String(i)], NV)
  ));
  const n = sqlite.prepare(
    "SELECT COUNT(*) c FROM diem_danh WHERE thang=? AND khu_vuc='SĐ' AND ten='N Khánh Hoàng' AND tuan=4 AND buoi='T3toi'"
  ).get(TH).c;
  kiem('20 lần ghi đồng thời chỉ sinh ĐÚNG 1 dòng', n === 1, 'thực tế: ' + n + ' dòng');
}

console.log('\n7) Hàm chưa chuyển phải báo lỗi rõ ràng, không trả HTML');
{
  const r = await goi('getStudents', [], NV);
  kiem('báo lỗi tiếng Việt rõ ràng', /chưa được chuyển/.test(r.error || ''), JSON.stringify(r));
  const r2 = await goi('hamKhongTonTai', [], NV);
  kiem('hàm lạ bị từ chối', /Không hỗ trợ hàm/.test(r2.error || ''));
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
process.exit(hong ? 1 : 0);
