// =====================================================================
// Kiểm thử OFFLINE cho src/handlers/cong-viec.js — "Điểm danh công việc":
//     node scripts/kiem-thu-cong-viec.mjs
//
// Tính năng thêm 23/08/2026 theo yêu cầu anh Rise (chép bố cục sổ ghi chép
// của WISBranch, bỏ cột "Số sự sống", danh sách thành viên RIÊNG có ô tự
// thêm, cột "Tổng cộng" tự đếm số ô đã nhập trong tháng).
//
// Trọng tâm kiểm thử — đúng những chỗ dễ sai nhất:
//   1. Mỗi người LUÔN có đủ 3 buổi sang/chieu/toi trong kết quả trả về,
//      kể cả khi chưa nhập ô nào (giao diện luôn vẽ đủ 3 dòng).
//   2. "Tổng cộng" đếm CẢ THÁNG (mọi tuần), không phải chỉ tuần đang xem —
//      đây là chỗ rất dễ viết nhầm thành đếm theo tuần.
//   3. Gõ rỗng = XOÁ dòng, và Tổng cộng phải giảm theo.
//   4. Hai người TRÙNG TÊN vẫn là 2 dòng độc lập (khoá theo id, không theo
//      tên) — bài học từ các lỗi trùng khoá theo tên của bảng cũ.
//   5. Xoá người thì xoá luôn mọi ô đã nhập của người đó, KHÔNG đụng người khác.
//   6. Chặn tháng/tuần/buổi/ngày không hợp lệ ngay tại máy chủ.
//   7. Tổng cộng (Tháng trước) lấy đúng tháng liền trước.
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

function taoCSDL() {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);
  db = bocSqlite(sqlite);
}

let dat = 0, hong = 0;
const NGUOI = { email: 'ai_do@gmail.com', ten: 'Ai Đó', laChu: false };

async function goi(fn, args = [], nguoiGoi = NGUOI) {
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

console.log('\n=== KIỂM THỬ ĐIỂM DANH CÔNG VIỆC (offline) ===\n');

// =====================================================================
console.log('1) Đăng ký hàm trong danh mục');
{
  const can = ['getCVDiemDanh', 'addCVThanhVien', 'updateCVThanhVien',
               'deleteCVThanhVien', 'moveCVThanhVien', 'saveCVCell'];
  for (const f of can) kiem('có hàm ' + f, !!DANH_MUC[f]);
  kiem('getCVDiemDanh là hàm ĐỌC (doc:true, được gọi bằng GET + lưu đệm)',
    DANH_MUC.getCVDiemDanh.doc === true);
  kiem('saveCVCell là hàm GHI (doc khác true)', DANH_MUC.saveCVCell.doc !== true);
  // Cố ý KHÔNG chuThoi: cả phòng cùng nhập được, giống bảng Điểm danh cũ.
  for (const f of can) kiem(f + ' KHÔNG giới hạn riêng tài khoản chủ', !DANH_MUC[f].chuThoi);
}

// =====================================================================
console.log('\n2) Thêm thành viên + danh sách trả về');
{
  taoCSDL();
  let r = await goi('getCVDiemDanh', ['2026-08', 4]);
  kiem('chưa có ai -> danh sách rỗng, không báo lỗi', Array.isArray(r.result?.thanhVien) && r.result.thanhVien.length === 0, JSON.stringify(r));

  r = await goi('addCVThanhVien', [{ ten: 'Võ Thị Hồng Gấm', gioiTinh: 'Nữ', banNganh: 'Tráng niên', diaVuc: '1', khuVuc: '3' }]);
  kiem('thêm người thứ nhất được', r.result?.success === true && r.result.id > 0, JSON.stringify(r));
  const id1 = r.result.id;

  r = await goi('addCVThanhVien', [{ ten: 'Võ Hoàng Long', gioiTinh: 'Nam', banNganh: 'Thanh niên', chucTrach: 'Khu vực trưởng' }]);
  const id2 = r.result.id;
  kiem('thêm người thứ hai được', r.result?.success === true && id2 !== id1);

  r = await goi('addCVThanhVien', [{}]);
  kiem('thiếu Tên -> báo lỗi rõ ràng', /Tên thành viên/i.test(r.error || ''), JSON.stringify(r));

  r = await goi('getCVDiemDanh', ['2026-08', 4]);
  const ds = r.result.thanhVien;
  kiem('danh sách có đúng 2 người', ds.length === 2, JSON.stringify(ds.map(x => x.ten)));
  kiem('đúng thứ tự thêm vào', ds[0].ten === 'Võ Thị Hồng Gấm' && ds[1].ten === 'Võ Hoàng Long');
  kiem('giữ đủ các cột thông tin (giới tính/ban ngành/địa vực/khu vực)',
    ds[0].gioiTinh === 'Nữ' && ds[0].banNganh === 'Tráng niên' && ds[0].diaVuc === '1' && ds[0].khuVuc === '3',
    JSON.stringify(ds[0]));
  kiem('giữ đúng Chức trách', ds[1].chucTrach === 'Khu vực trưởng');
  kiem('người CHƯA nhập ô nào vẫn có đủ 3 buổi sang/chieu/toi',
    !!ds[0].o.sang && !!ds[0].o.chieu && !!ds[0].o.toi, JSON.stringify(ds[0].o));
  kiem('chưa nhập gì -> Tổng cộng = 0', ds[0].tongCong === 0 && ds[1].tongCong === 0);
  kiem('trả về đúng tháng trước để hiện cột "Tổng cộng (Tháng trước)"', r.result.thangTruoc === '2026-07', r.result.thangTruoc);
}

// =====================================================================
console.log('\n3) Lưu ô + Tổng cộng đếm CẢ THÁNG (không phải chỉ 1 tuần)');
{
  taoCSDL();
  const id = (await goi('addCVThanhVien', [{ ten: 'Le Ngoc Bao Chau' }])).result.id;

  let r = await goi('saveCVCell', [id, '2026-08', 4, 'sang', 'CN', '123']);
  kiem('lưu 1 ô được', r.result?.success === true, JSON.stringify(r));
  kiem('trả về Tổng cộng mới ngay sau khi lưu (=1)', r.result.tongCong === 1, JSON.stringify(r.result));

  await goi('saveCVCell', [id, '2026-08', 4, 'sang', 'T2', '127']);
  await goi('saveCVCell', [id, '2026-08', 4, 'chieu', 'T5', '203']);
  r = await goi('saveCVCell', [id, '2026-08', 4, 'toi', 'CN', '207']);
  kiem('4 ô trong TUẦN 4 -> Tổng cộng = 4', r.result.tongCong === 4, JSON.stringify(r.result));

  // Nhập thêm ở TUẦN 1 và TUẦN 5 của CÙNG THÁNG
  await goi('saveCVCell', [id, '2026-08', 1, 'sang', 'T3', '102']);
  r = await goi('saveCVCell', [id, '2026-08', 5, 'toi', 'T7', '202']);
  kiem('ô ở tuần KHÁC cũng cộng vào Tổng cộng (=6)', r.result.tongCong === 6, JSON.stringify(r.result));

  // Tháng khác KHÔNG được tính vào
  await goi('saveCVCell', [id, '2026-09', 1, 'sang', 'CN', '111']);
  r = await goi('getCVDiemDanh', ['2026-08', 4]);
  kiem('ô của THÁNG KHÁC không cộng vào Tổng cộng tháng 8 (vẫn = 6)',
    r.result.thanhVien[0].tongCong === 6, JSON.stringify(r.result.thanhVien[0].tongCong));

  const o = r.result.thanhVien[0].o;
  kiem('bảng tuần 4 hiện đúng ô đã nhập', o.sang.CN === '123' && o.sang.T2 === '127' && o.chieu.T5 === '203' && o.toi.CN === '207', JSON.stringify(o));
  kiem('tuần 4 KHÔNG lẫn ô của tuần 1/tuần 5', o.sang.T3 === undefined && o.toi.T7 === undefined, JSON.stringify(o));

  r = await goi('getCVDiemDanh', ['2026-08', 1]);
  kiem('xem tuần 1 thì hiện đúng ô của tuần 1', r.result.thanhVien[0].o.sang.T3 === '102', JSON.stringify(r.result.thanhVien[0].o));
  kiem('Tổng cộng giữ nguyên dù đang xem tuần nào (=6)', r.result.thanhVien[0].tongCong === 6);

  r = await goi('getCVDiemDanh', ['2026-09', 1]);
  kiem('Tổng cộng (Tháng trước) của tháng 9 = số ô tháng 8 (=6)',
    r.result.thanhVien[0].tongThangTruoc === 6, JSON.stringify(r.result.thanhVien[0]));
}

// =====================================================================
console.log('\n4) Sửa ô / gõ rỗng để xoá');
{
  taoCSDL();
  const id = (await goi('addCVThanhVien', [{ ten: 'Trần Thị Thanh Nguyên' }])).result.id;
  await goi('saveCVCell', [id, '2026-08', 2, 'sang', 'CN', '127']);
  let r = await goi('saveCVCell', [id, '2026-08', 2, 'sang', 'CN', '203']);
  kiem('gõ đè lên ô cũ -> KHÔNG sinh dòng trùng, Tổng cộng vẫn = 1', r.result.tongCong === 1, JSON.stringify(r.result));

  r = await goi('getCVDiemDanh', ['2026-08', 2]);
  kiem('ô đã đổi thành giá trị mới', r.result.thanhVien[0].o.sang.CN === '203');

  r = await goi('saveCVCell', [id, '2026-08', 2, 'sang', 'CN', '']);
  kiem('gõ rỗng -> Tổng cộng giảm về 0', r.result.tongCong === 0, JSON.stringify(r.result));
  r = await goi('getCVDiemDanh', ['2026-08', 2]);
  kiem('ô rỗng bị xoá hẳn khỏi bảng', r.result.thanhVien[0].o.sang.CN === undefined, JSON.stringify(r.result.thanhVien[0].o));

  r = await goi('saveCVCell', [id, '2026-08', 2, 'sang', 'CN', '   ']);
  kiem('gõ toàn dấu cách cũng coi như rỗng (Tổng cộng = 0)', r.result.tongCong === 0, JSON.stringify(r.result));

  r = await goi('saveCVCell', [id, '2026-08', 2, 'sang', 'CN', 'đi truyền đạo']);
  kiem('ô nhận CHỮ tự do (không bắt buộc là số)', r.result.tongCong === 1, JSON.stringify(r.result));
}

// =====================================================================
console.log('\n5) Chặn dữ liệu không hợp lệ ngay tại máy chủ');
{
  taoCSDL();
  const id = (await goi('addCVThanhVien', [{ ten: 'A' }])).result.id;
  let r = await goi('saveCVCell', [id, '2026-8', 1, 'sang', 'CN', 'x']);
  kiem('tháng sai định dạng bị chặn', /Tháng không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await goi('saveCVCell', [id, '2026-08', 0, 'sang', 'CN', 'x']);
  kiem('tuần 0 bị chặn', /Tuần không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await goi('saveCVCell', [id, '2026-08', 7, 'sang', 'CN', 'x']);
  kiem('tuần 7 bị chặn (chỉ có Tuần 1..6)', /Tuần không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await goi('saveCVCell', [id, '2026-08', 1, 'trua', 'CN', 'x']);
  kiem('buổi lạ ("trua") bị chặn', /Buổi không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await goi('saveCVCell', [id, '2026-08', 1, 'sang', 'T8', 'x']);
  kiem('ngày lạ ("T8") bị chặn', /Ngày không hợp lệ/.test(r.error || ''), JSON.stringify(r));
  r = await goi('saveCVCell', [999999, '2026-08', 1, 'sang', 'CN', 'x']);
  kiem('lưu cho người không tồn tại bị chặn', /Không tìm thấy thành viên/.test(r.error || ''), JSON.stringify(r));
  r = await goi('getCVDiemDanh', ['2026-13', 1]);
  kiem('xem tháng 13 bị chặn', /Tháng không hợp lệ/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
console.log('\n6) Hai người TRÙNG TÊN vẫn hoàn toàn độc lập');
{
  taoCSDL();
  const a = (await goi('addCVThanhVien', [{ ten: 'Nguyễn Văn A', khuVuc: '1' }])).result.id;
  const b = (await goi('addCVThanhVien', [{ ten: 'Nguyễn Văn A', khuVuc: '3' }])).result.id;
  kiem('thêm được 2 người trùng tên (id khác nhau)', a !== b && a > 0 && b > 0);

  await goi('saveCVCell', [a, '2026-08', 1, 'sang', 'CN', '111']);
  const r2 = await goi('saveCVCell', [b, '2026-08', 1, 'sang', 'CN', '222']);
  kiem('người B lưu ô riêng, Tổng cộng của B = 1', r2.result.tongCong === 1);

  const r = await goi('getCVDiemDanh', ['2026-08', 1]);
  const [ta, tb] = r.result.thanhVien;
  kiem('ô của A không bị B ghi đè', ta.o.sang.CN === '111', JSON.stringify(ta.o));
  kiem('ô của B đúng giá trị riêng', tb.o.sang.CN === '222', JSON.stringify(tb.o));
  kiem('Tổng cộng tính riêng từng người', ta.tongCong === 1 && tb.tongCong === 1);
}

// =====================================================================
console.log('\n7) Sửa thông tin thành viên');
{
  taoCSDL();
  const id = (await goi('addCVThanhVien', [{ ten: 'Cũ', gioiTinh: 'Nữ', khuVuc: '1' }])).result.id;
  let r = await goi('updateCVThanhVien', [id, { ten: 'Mới', chucTrach: 'Vợ người quản nhiệm' }]);
  kiem('sửa được tên + chức trách', r.result?.success === true, JSON.stringify(r));

  r = await goi('getCVDiemDanh', ['2026-08', 1]);
  const tv = r.result.thanhVien[0];
  kiem('tên đã đổi', tv.ten === 'Mới', tv.ten);
  kiem('chức trách đã đổi', tv.chucTrach === 'Vợ người quản nhiệm');
  kiem('trường KHÔNG gửi lên thì GIỮ NGUYÊN (giới tính vẫn Nữ)', tv.gioiTinh === 'Nữ', tv.gioiTinh);
  kiem('trường KHÔNG gửi lên thì GIỮ NGUYÊN (khu vực vẫn 1)', tv.khuVuc === '1', tv.khuVuc);

  r = await goi('updateCVThanhVien', [id, { ten: '' }]);
  kiem('không cho xoá trắng Tên', /không được để trống/i.test(r.error || ''), JSON.stringify(r));
  r = await goi('updateCVThanhVien', [id, { khuVuc: '' }]);
  kiem('CHO PHÉP xoá trắng các cột khác (khu vực)', r.result?.success === true, JSON.stringify(r));
  r = await goi('updateCVThanhVien', [999999, { ten: 'X' }]);
  kiem('sửa người không tồn tại bị chặn', /Không tìm thấy thành viên/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
console.log('\n8) Xoá thành viên — xoá luôn ô đã nhập, không đụng người khác');
{
  taoCSDL();
  const a = (await goi('addCVThanhVien', [{ ten: 'Người A' }])).result.id;
  const b = (await goi('addCVThanhVien', [{ ten: 'Người B' }])).result.id;
  await goi('saveCVCell', [a, '2026-08', 1, 'sang', 'CN', 'a1']);
  await goi('saveCVCell', [a, '2026-09', 2, 'toi', 'T7', 'a2']);
  await goi('saveCVCell', [b, '2026-08', 1, 'sang', 'CN', 'b1']);

  let r = await goi('deleteCVThanhVien', [a]);
  kiem('xoá được người A', r.result?.success === true && r.result.ten === 'Người A', JSON.stringify(r));

  const conLai = sqlite.prepare('SELECT COUNT(*) AS n FROM cv_diem_danh WHERE thanh_vien_id = ?').get(a).n;
  kiem('mọi ô đã nhập của A bị xoá theo (mọi tháng)', Number(conLai) === 0, String(conLai));

  r = await goi('getCVDiemDanh', ['2026-08', 1]);
  kiem('danh sách chỉ còn 1 người', r.result.thanhVien.length === 1);
  kiem('dữ liệu của B còn nguyên', r.result.thanhVien[0].o.sang.CN === 'b1', JSON.stringify(r.result.thanhVien[0].o));

  r = await goi('deleteCVThanhVien', [a]);
  kiem('xoá lại lần nữa -> báo không tìm thấy', /Không tìm thấy thành viên/.test(r.error || ''), JSON.stringify(r));
}

// =====================================================================
console.log('\n9) Đổi thứ tự lên/xuống');
{
  taoCSDL();
  const a = (await goi('addCVThanhVien', [{ ten: 'A' }])).result.id;
  const b = (await goi('addCVThanhVien', [{ ten: 'B' }])).result.id;
  const c = (await goi('addCVThanhVien', [{ ten: 'C' }])).result.id;
  const ten = async () => (await goi('getCVDiemDanh', ['2026-08', 1])).result.thanhVien.map(x => x.ten).join(',');
  kiem('thứ tự ban đầu A,B,C', (await ten()) === 'A,B,C', await ten());

  await goi('moveCVThanhVien', [c, 'len']);
  kiem('C lên 1 bậc -> A,C,B', (await ten()) === 'A,C,B', await ten());

  await goi('moveCVThanhVien', [a, 'xuong']);
  kiem('A xuống 1 bậc -> C,A,B', (await ten()) === 'C,A,B', await ten());

  let r = await goi('moveCVThanhVien', [c, 'len']);
  kiem('người đầu bảng bấm "lên" -> không đổi gì, không báo lỗi', r.result?.khongDoi === true, JSON.stringify(r));
  kiem('thứ tự giữ nguyên C,A,B', (await ten()) === 'C,A,B', await ten());

  r = await goi('moveCVThanhVien', [b, 'xuong']);
  kiem('người cuối bảng bấm "xuống" -> không đổi gì', r.result?.khongDoi === true, JSON.stringify(r));

  r = await goi('moveCVThanhVien', [b, 'ngang']);
  kiem('hướng lạ bị chặn', /Hướng không hợp lệ/.test(r.error || ''), JSON.stringify(r));

  await goi('saveCVCell', [a, '2026-08', 1, 'sang', 'CN', 'x']);
  await goi('moveCVThanhVien', [a, 'len']);
  r = await goi('getCVDiemDanh', ['2026-08', 1]);
  kiem('đổi thứ tự KHÔNG làm mất ô đã nhập',
    r.result.thanhVien.find(x => x.ten === 'A').o.sang.CN === 'x', JSON.stringify(r.result.thanhVien));
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
