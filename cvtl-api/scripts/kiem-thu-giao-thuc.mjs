// =====================================================================
// Kiểm chứng lời hứa quan trọng nhất:
// DÙ HỎNG KIỂU GÌ, MÁY CHỦ CŨNG KHÔNG BAO GIỜ TRẢ VỀ HTML.
// Đây chính là các tình huống sinh ra lỗi
//   "Unexpected token '<', "<!DOCTYPE "... is not valid JSON"
// ở bản Google Apps Script.
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8'));

// Giả lập đối tượng D1 của Cloudflare
const D1 = {
  prepare(sql) {
    let ps = [];
    const api = {
      bind(...p) { ps = p; return api; },
      async all() { return { results: sqlite.prepare(sql).all(...ps) }; },
      async first() { return sqlite.prepare(sql).get(...ps) ?? null; },
      async run() { return sqlite.prepare(sql).run(...ps); },
    };
    return api;
  },
  async batch(ds) { return ds; },
};

const worker = (await import(join(goc, 'src/index.js'))).default;
const env = { DB: D1, GOOGLE_CLIENT_ID: 'test' };

let dat = 0, hong = 0;
async function kiem(ten, req) {
  const res = await worker.fetch(req, env);
  const ct = res.headers.get('Content-Type') || '';
  const text = await res.text();
  const laJson = (() => { try { JSON.parse(text); return true; } catch { return false; } })();
  const ok = laJson && ct.includes('application/json') && !text.trim().startsWith('<');
  if (ok) { dat++; console.log('  ✓', ten, '→', text.slice(0, 80)); }
  else { hong++; console.log('  ✗', ten, '→', text.slice(0, 120)); }
}

const U = 'https://api.example/';
console.log('\n=== KIỂM THỬ GIAO THỨC: không bao giờ trả HTML ===\n');

await kiem('args hỏng (chính là ca gây lỗi cũ)', new Request(U + '?fn=getTPSummary&args={hong'));
await kiem('thiếu tên hàm', new Request(U));
await kiem('gọi hàm không tồn tại', new Request(U + '?fn=xyz&args=[]'));
await kiem('args không phải mảng', new Request(U + '?fn=getTPSummary&args={"a":1}'));
await kiem('chưa đăng nhập', new Request(U + '?fn=getTPSummary&args=["2026-08"]'));
await kiem('token bịa', new Request(U + '?fn=getTPSummary&args=["2026-08"]&token=SESS.giamao'));
await kiem('POST body hỏng', new Request(U, { method: 'POST', body: 'khong-phai-json' }));
await kiem('POST rỗng', new Request(U, { method: 'POST', body: '{}' }));
await kiem('phương thức lạ', new Request(U, { method: 'DELETE' }));
await kiem('đường dẫn sức khoẻ', new Request(U + 'suc-khoe'));

console.log('\n=== KIỂM THỬ /duyet-truy-cap — link "Cấp quyền 1-chạm" gửi trong tin Telegram (16/08/2026) ===\n');
{
  // Đường dẫn này KHÔNG thuộc giao thức JSON fn=... — người dùng (anh Rise)
  // bấm thẳng vào link từ điện thoại nên phải trả về HTML đọc được, khác
  // với lời hứa "không bao giờ trả HTML" ở trên (lời hứa đó chỉ áp dụng cho
  // các lệnh gọi fn=... qua giao diện web).
  const envDuyet = { DB: D1, GOOGLE_CLIENT_ID: 'test', MA_CAI_DAT: 'bi-mat-kiem-thu' };
  const ktraHtml = (ten, dieuKien, chiTiet = '') => {
    if (dieuKien) { dat++; console.log('  ✓', ten); } else { hong++; console.log('  ✗', ten, chiTiet); }
  };

  let res = await worker.fetch(new Request(U + 'duyet-truy-cap?email=ai%40gmail.com&ma=SAI'), envDuyet);
  let text = await res.text();
  ktraHtml('mã bí mật sai bị từ chối', text.includes('Liên kết không hợp lệ'), text);

  res = await worker.fetch(new Request(U + 'duyet-truy-cap?ma=bi-mat-kiem-thu'), envDuyet);
  text = await res.text();
  ktraHtml('thiếu email bị từ chối', text.includes('Thiếu email'), text);

  res = await worker.fetch(new Request(U + 'duyet-truy-cap?email=nguoimoi%40gmail.com&ma=bi-mat-kiem-thu'), envDuyet);
  text = await res.text();
  ktraHtml('bấm link hợp lệ -> báo đã cấp quyền', text.includes('Đã cấp quyền'), text);
  let hang = sqlite.prepare("SELECT trang_thai FROM access_control WHERE email='nguoimoi@gmail.com'").get();
  ktraHtml('CSDL cập nhật đúng trạng thái da_duyet', hang?.trang_thai === 'da_duyet', JSON.stringify(hang));

  // Bấm lại link cũ lần 2 (ví dụ mở nhầm, hoặc mạng lag bấm 2 lần) -> vẫn báo
  // đã cấp quyền, không lỗi, không sinh dòng trùng.
  await worker.fetch(new Request(U + 'duyet-truy-cap?email=nguoimoi%40gmail.com&ma=bi-mat-kiem-thu'), envDuyet);
  const demTrung = sqlite.prepare("SELECT COUNT(*) c FROM access_control WHERE email='nguoimoi@gmail.com'").get().c;
  ktraHtml('bấm lại link cũ không sinh dòng trùng', demTrung === 1, 'thực tế: ' + demTrung);

  // Chưa cấu hình MA_CAI_DAT trên Cloudflare (quên set) -> từ chối an toàn,
  // không được lỡ tay cấp quyền bừa cho ai gọi cũng được.
  res = await worker.fetch(
    new Request(U + 'duyet-truy-cap?email=ai2%40gmail.com&ma=gi-cung-duoc'),
    { DB: D1, GOOGLE_CLIENT_ID: 'test' }
  );
  text = await res.text();
  ktraHtml('chưa cấu hình MA_CAI_DAT -> từ chối an toàn, không cấp quyền bừa',
    text.includes('Liên kết không hợp lệ'), text);
}

console.log('\n=== KIỂM THỬ màn hình "Duyệt truy cập" trong web (17/08/2026) ===\n');
{
  // Tạo sẵn 1 tài khoản chủ + 1 nhân viên thường, kèm phiên đăng nhập (SESS.)
  // để gọi thẳng qua giao thức fn=... như giao diện web thật sự làm — cách
  // này đơn giản hơn nhiều so với dựng JWT Google giả cho từng ca kiểm thử.
  sqlite.exec(
    "INSERT INTO access_control (email, trang_thai, ten, la_chu) VALUES " +
    "('chu-thu@gmail.com','da_duyet','Chu Thu',1), ('nv-thu@gmail.com','da_duyet','NV Thu',0)"
  );
  const luc = Date.now();
  sqlite.prepare('INSERT INTO phien_dang_nhap (token, email, ten, tao_luc, het_han_luc) VALUES (?,?,?,?,?)')
    .run('SESS.chuthu', 'chu-thu@gmail.com', 'Chu Thu', luc, luc + 999999999);
  sqlite.prepare('INSERT INTO phien_dang_nhap (token, email, ten, tao_luc, het_han_luc) VALUES (?,?,?,?,?)')
    .run('SESS.nvthu', 'nv-thu@gmail.com', 'NV Thu', luc, luc + 999999999);

  const ktraHtml = (ten, dieuKien, chiTiet = '') => {
    if (dieuKien) { dat++; console.log('  ✓', ten); } else { hong++; console.log('  ✗', ten, chiTiet); }
  };
  const goiFn = (fn, args, token) =>
    worker.fetch(new Request(U + '?fn=' + fn + '&args=' + encodeURIComponent(JSON.stringify(args)) + '&token=' + token), env)
      .then((r) => r.json());

  let j = await goiFn('getPendingAccess', [], 'SESS.nvthu');
  ktraHtml('nhân viên thường KHÔNG gọi được getPendingAccess', !!j.error, JSON.stringify(j));

  // 2 người xin quyền, cùng dữ liệu nhưng ngày xin khác nhau (cho1 xin trước).
  sqlite.exec(
    "INSERT INTO access_control (email, trang_thai, ten, ngay_yeu_cau) VALUES " +
    "('cho1@gmail.com','cho_duyet','Chờ Một','2026-08-15T00:00:00.000Z'), " +
    "('cho2@gmail.com','cho_duyet','Chờ Hai','2026-08-16T00:00:00.000Z')"
  );

  j = await goiFn('getPendingAccess', [], 'SESS.chuthu');
  ktraHtml('tài khoản chủ xem được danh sách chờ duyệt, đủ 2 người', Array.isArray(j.result) && j.result.length === 2, JSON.stringify(j));
  ktraHtml('danh sách xếp cũ nhất (xin trước) lên đầu', j.result?.[0]?.email === 'cho1@gmail.com', JSON.stringify(j.result));

  j = await goiFn('approveAccessRequest', ['cho1@gmail.com'], 'SESS.nvthu');
  ktraHtml('nhân viên thường KHÔNG duyệt được', !!j.error, JSON.stringify(j));

  j = await goiFn('approveAccessRequest', ['cho1@gmail.com'], 'SESS.chuthu');
  ktraHtml('tài khoản chủ duyệt thành công', j.result?.ok === true, JSON.stringify(j));
  let hang = sqlite.prepare("SELECT trang_thai FROM access_control WHERE email='cho1@gmail.com'").get();
  ktraHtml('CSDL cập nhật da_duyet sau khi duyệt trong web', hang?.trang_thai === 'da_duyet', JSON.stringify(hang));

  j = await goiFn('getPendingAccess', [], 'SESS.chuthu');
  ktraHtml('sau khi duyệt, danh sách chờ chỉ còn đúng người kia',
    j.result?.length === 1 && j.result[0].email === 'cho2@gmail.com', JSON.stringify(j.result));

  j = await goiFn('denyAccessRequest', ['cho2@gmail.com'], 'SESS.nvthu');
  ktraHtml('nhân viên thường KHÔNG từ chối được', !!j.error, JSON.stringify(j));

  j = await goiFn('denyAccessRequest', ['cho2@gmail.com'], 'SESS.chuthu');
  ktraHtml('tài khoản chủ từ chối thành công', j.result?.ok === true, JSON.stringify(j));
  hang = sqlite.prepare("SELECT trang_thai FROM access_control WHERE email='cho2@gmail.com'").get();
  ktraHtml('CSDL cập nhật tu_choi sau khi từ chối', hang?.trang_thai === 'tu_choi', JSON.stringify(hang));

  j = await goiFn('getPendingAccess', [], 'SESS.chuthu');
  ktraHtml('sau khi từ chối, danh sách chờ trống', Array.isArray(j.result) && j.result.length === 0, JSON.stringify(j.result));

  // ===================================================================
  // Danh sách "Đã cấp quyền" + gỡ quyền + cấp/gỡ quyền Admin (mới
  // 21/08/2026, theo yêu cầu anh Rise: "anh cần hiện lại những mail đã cấp
  // quyền, bên cạnh đó cũng có thêm cả nút gỡ quyền và cấp quyền admin
  // nữa"). Tại điểm này CSDL đã có 4 người 'da_duyet' cộng dồn từ các khối
  // kiểm thử phía trên trong CÙNG 1 CSDL: chu-thu@gmail.com (la_chu=1),
  // nv-thu@gmail.com (la_chu=0, cả hai có sẵn từ đầu block này),
  // nguoimoi@gmail.com (duyệt qua link Telegram) và cho1@gmail.com (duyệt
  // qua approveAccessRequest) — dùng .find() theo email thay vì giả định
  // đúng vị trí trong mảng, để không phụ thuộc thứ tự các khối kiểm thử
  // khác chạy trước.
  // ===================================================================
  j = await goiFn('getApprovedAccess', [], 'SESS.nvthu');
  ktraHtml('nhân viên thường KHÔNG xem được danh sách đã cấp quyền', !!j.error, JSON.stringify(j));

  j = await goiFn('getApprovedAccess', [], 'SESS.chuthu');
  ktraHtml('tài khoản chủ xem được danh sách đã cấp quyền, đủ 4 người',
    Array.isArray(j.result) && j.result.length === 4, JSON.stringify(j.result));
  ktraHtml('Admin (la_chu=1) xếp lên đầu danh sách',
    j.result?.[0]?.email === 'chu-thu@gmail.com' && j.result[0].laChu === true, JSON.stringify(j.result));
  ktraHtml('người thường (la_chu=0) laChu = false',
    j.result?.find((x) => x.email === 'nv-thu@gmail.com')?.laChu === false, JSON.stringify(j.result));

  j = await goiFn('grantAdmin', ['nv-thu@gmail.com'], 'SESS.nvthu');
  ktraHtml('nhân viên thường KHÔNG tự cấp Admin cho ai được', !!j.error, JSON.stringify(j));

  j = await goiFn('grantAdmin', ['nguoi-la@gmail.com'], 'SESS.chuthu');
  ktraHtml('KHÔNG cấp được Admin cho email chưa được duyệt truy cập', !!j.error, JSON.stringify(j));

  j = await goiFn('grantAdmin', ['nv-thu@gmail.com'], 'SESS.chuthu');
  ktraHtml('tài khoản chủ cấp Admin cho nhân viên thường thành công', j.result?.ok === true, JSON.stringify(j));
  hang = sqlite.prepare("SELECT la_chu FROM access_control WHERE email='nv-thu@gmail.com'").get();
  ktraHtml('CSDL cập nhật la_chu=1 sau khi cấp Admin', hang?.la_chu === 1, JSON.stringify(hang));

  j = await goiFn('getApprovedAccess', [], 'SESS.chuthu');
  ktraHtml('sau khi cấp, nv-thu@gmail.com hiện laChu=true trong danh sách',
    j.result?.find((x) => x.email === 'nv-thu@gmail.com')?.laChu === true, JSON.stringify(j.result));

  j = await goiFn('revokeAdmin', ['nv-thu@gmail.com'], 'SESS.chuthu');
  ktraHtml('tài khoản chủ gỡ Admin của nv-thu thành công', j.result?.ok === true, JSON.stringify(j));
  hang = sqlite.prepare("SELECT la_chu, trang_thai FROM access_control WHERE email='nv-thu@gmail.com'").get();
  ktraHtml('CSDL cập nhật la_chu=0 sau khi gỡ Admin, vẫn còn da_duyet (chỉ mất Admin, không mất quyền truy cập)',
    hang?.la_chu === 0 && hang?.trang_thai === 'da_duyet', JSON.stringify(hang));

  // Tài khoản chủ GỐC (CHU_VINH_VIEN) không ai gỡ được Admin, kể cả Admin khác.
  sqlite.exec("INSERT INTO access_control (email, trang_thai, ten, la_chu) VALUES ('rise.shine1948@gmail.com','da_duyet','Rise',0)");
  j = await goiFn('revokeAdmin', ['rise.shine1948@gmail.com'], 'SESS.chuthu');
  ktraHtml('KHÔNG ai gỡ được quyền Admin của tài khoản chủ gốc', !!j.error, JSON.stringify(j));

  j = await goiFn('revokeAccess', ['nv-thu@gmail.com'], 'SESS.nvthu');
  ktraHtml('nhân viên thường KHÔNG tự gỡ quyền của ai được', !!j.error, JSON.stringify(j));

  j = await goiFn('revokeAccess', ['rise.shine1948@gmail.com'], 'SESS.chuthu');
  ktraHtml('KHÔNG ai gỡ được quyền truy cập của tài khoản chủ gốc', !!j.error, JSON.stringify(j));

  j = await goiFn('revokeAccess', ['nv-thu@gmail.com'], 'SESS.chuthu');
  ktraHtml('tài khoản chủ gỡ quyền truy cập của nv-thu thành công', j.result?.ok === true, JSON.stringify(j));
  hang = sqlite.prepare("SELECT trang_thai, la_chu FROM access_control WHERE email='nv-thu@gmail.com'").get();
  ktraHtml('CSDL cập nhật tu_choi + la_chu=0 sau khi gỡ quyền truy cập',
    hang?.trang_thai === 'tu_choi' && hang?.la_chu === 0, JSON.stringify(hang));

  // Sau khi bị gỡ quyền, phiên đăng nhập cũ của nv-thu không còn dùng được nữa
  // NGAY LẬP TỨC ở lần gọi kế tiếp (router kiểm tra access_control mỗi lần gọi,
  // không chỉ lúc đăng nhập) — kiểm bằng checkAccess với đúng mã phiên cũ.
  j = await goiFn('checkAccess', [], 'SESS.nvthu');
  ktraHtml('phiên đăng nhập cũ của người vừa bị gỡ quyền không còn hiệu lực',
    j.result?.authorized === false, JSON.stringify(j));

  j = await goiFn('getApprovedAccess', [], 'SESS.chuthu');
  ktraHtml('sau khi gỡ quyền, nv-thu@gmail.com không còn trong danh sách "đã cấp quyền"',
    Array.isArray(j.result) && j.result.length === 4 && !j.result.some((x) => x.email === 'nv-thu@gmail.com'),
    JSON.stringify(j.result));
}

// =====================================================================
// ⭐ TỰ THỬ LẠI KHI D1 TRỤC TRẶC NHẤT THỜI (thêm 24/08/2026, sau sự cố
// "D1_ERROR: internal error" khiến một thành viên không đăng nhập được).
//
// TRỌNG TÂM: lệnh ĐỌC phải tự thử lại, lệnh GHI TUYỆT ĐỐI KHÔNG —
// thử lại một lệnh INSERT có id tự tăng sẽ sinh dòng TRÙNG.
// =====================================================================
console.log('\n--- Tự thử lại khi D1 trục trặc nhất thời ---');
{
  const { bocD1, laLoiD1NhatThoi, moTaLoiTiengViet, laGhiAnToanThuLai } =
    await import(join(goc, 'src/db.js'));

  // D1 giả: hỏng đúng `soLanHong` lượt đầu rồi mới chạy được.
  function d1Hong(soLanHong, thongBao = 'D1_ERROR: internal error; reference = abc123xyz') {
    const dem = { all: 0, first: 0, run: 0 };
    const tao = (loai, ketQua) => async () => {
      dem[loai]++;
      if (dem[loai] <= soLanHong) throw new Error(thongBao);
      return ketQua;
    };
    return {
      dem,
      d1: {
        prepare() {
          const api = {
            bind() { return api; },
            all: tao('all', { results: [{ x: 1 }] }),
            first: tao('first', { x: 1 }),
            run: tao('run', { success: true }),
          };
          return api;
        },
        async batch(ds) { return ds; },
      },
    };
  }

  const ktra = (ten, ok, ct = '') => { if (ok) { dat++; console.log('  ✓', ten); } else { hong++; console.log('  ✗', ten, ct); } };

  // --- Nhận diện đúng loại lỗi ---
  ktra('nhận ra D1_ERROR là lỗi nhất thời', laLoiD1NhatThoi(new Error('D1_ERROR: internal error; reference = x')));
  ktra('nhận ra "Network connection lost" là lỗi nhất thời', laLoiD1NhatThoi(new Error('Network connection lost')));
  ktra('KHÔNG coi lỗi câu lệnh sai là nhất thời (phải hỏng ngay để còn biết)',
    !laLoiD1NhatThoi(new Error('no such table: abc')));
  ktra('KHÔNG coi lỗi nghiệp vụ là nhất thời', !laLoiD1NhatThoi(new Error('Thiếu Khu vực.')));

  // --- ĐỌC: tự thử lại ---
  {
    const { d1, dem } = d1Hong(2);
    const db = bocD1(d1);
    const r = await db.all('SELECT 1');
    ktra('all(): hỏng 2 lượt đầu vẫn ra kết quả đúng', JSON.stringify(r) === '[{"x":1}]', JSON.stringify(r));
    ktra('all(): đã thử đúng 3 lượt', dem.all === 3, 'thực tế: ' + dem.all);
  }
  {
    const { d1, dem } = d1Hong(2);
    const db = bocD1(d1);
    const r = await db.first('SELECT 1');
    ktra('first(): hỏng 2 lượt đầu vẫn ra kết quả đúng', JSON.stringify(r) === '{"x":1}', JSON.stringify(r));
    ktra('first(): đã thử đúng 3 lượt', dem.first === 3, 'thực tế: ' + dem.first);
  }
  {
    // Hỏng cả 3 lượt -> phải chịu thua, KHÔNG thử vô hạn.
    const { d1, dem } = d1Hong(99);
    const db = bocD1(d1);
    let loi = null;
    try { await db.all('SELECT 1'); } catch (e) { loi = e; }
    ktra('all(): hỏng mãi thì chịu thua chứ không lặp vô hạn', dem.all === 3, 'thực tế: ' + dem.all);
    ktra('all(): vẫn ném đúng lỗi gốc ra ngoài', /D1_ERROR/.test(loi?.message || ''), String(loi?.message));
  }
  {
    // Lỗi KHÔNG nhất thời -> hỏng ngay lượt đầu, không thử lại.
    const { d1, dem } = d1Hong(99, 'no such table: khong_co');
    const db = bocD1(d1);
    let loi = null;
    try { await db.first('SELECT 1'); } catch (e) { loi = e; }
    ktra('⭐ lỗi câu lệnh sai thì hỏng NGAY lượt đầu, không thử lại',
      dem.first === 1, 'thực tế: ' + dem.first);
    ktra('và giữ nguyên văn lỗi để còn gỡ rối', /no such table/.test(loi?.message || ''));
  }

  // --- GHI: phân loại "ghi đè" hay không (24/08/2026 lần 2) ---
  // ⚠️ Đây là phần dễ gây HỎNG DỮ LIỆU THẬT nhất của cả dự án: phân loại sai
  // một lệnh thành "an toàn" là có ngày sinh dòng trùng. Kiểm bằng ĐÚNG các câu
  // lệnh thật đang chạy trong các handler.
  {
    const PHAI_THU_LAI = [
      ['xoá 1 ô công việc', 'DELETE FROM cv_cong_viec WHERE khu_vuc=? AND ten=? AND thang=?'],
      ['INSERT OR IGNORE (sổ mốc)', "INSERT OR IGNORE INTO so_moc (moc, ten) VALUES (?,?)"],
      ['gia hạn phiên đăng nhập', 'UPDATE phien_dang_nhap SET het_han_luc = ?, ten = ? WHERE token = ?'],
      ['cấp quyền Admin', 'UPDATE access_control SET la_chu = 1 WHERE lower(email) = lower(?)'],
      ['đổi thứ tự thành viên', 'UPDATE diem_danh_roster SET thu_tu = ? WHERE id = ?'],
      ['lưu 1 ô Điểm danh (upsert ghi đè)',
       'INSERT INTO diem_danh (thang,khu_vuc,ten,tuan,buoi,gia_tri) VALUES (?,?,?,?,?,?) ' +
       'ON CONFLICT (thang,khu_vuc,ten,tuan,buoi) DO UPDATE SET gia_tri = excluded.gia_tri'],
      ['ẩn người khỏi bảng công việc',
       "INSERT INTO cv_nguoi (khu_vuc,ten,kieu,thu_tu) VALUES (?,?,'an',?) " +
       "ON CONFLICT (khu_vuc,ten) DO UPDATE SET kieu = 'an'"],
      ['ghi ngày cấp chứng chỉ (hàm chỉ nằm ở WHERE)',
       'UPDATE dao_tao_tien_do SET ngay_cap_chung_chi = ? WHERE khu_vuc = ? ' +
       "AND (length(trim(x))-length(replace(x,',',''))+1) >= ?"],
    ];
    // ⚠️⚠️ Sáu bảng dưới đây có cột id TỰ TĂNG hoặc luôn thêm dòng mới —
    // thử lại là SINH DÒNG TRÙNG. Đã soát tay toàn bộ dự án 24/08/2026.
    const KHONG_DUOC_THU_LAI = [
      ['nhật ký Đơn thuần', 'INSERT INTO nhat_ky_don_thuan (ngay,khu_vuc,don_thuan) VALUES (?,?,?)'],
      ['lịch làm việc', 'INSERT INTO lich_lam_viec (ngay,noi_dung) VALUES (?,?)'],
      ['học viên', 'INSERT INTO hoc_vien (ten) VALUES (?)'],
      ['việc giao đào tạo', 'INSERT INTO dao_tao_viec_giao (khu_vuc,ten) VALUES (?,?)'],
      ['thêm khu vực mới', 'INSERT INTO config_list (loai,gia_tri,thu_tu) VALUES (?,?,?)'],
      ['tạo phiên đăng nhập', 'INSERT INTO phien_dang_nhap (token,email,ten,tao_luc,het_han_luc) VALUES (?,?,?,?,?)'],
      ['upsert có biểu thức CASE trên chính cột đó (quá tinh vi -> không tin)',
       'INSERT INTO dao_tao_tien_do (khu_vuc,ten,bai_da_hoc) VALUES (?,?,?) ' +
       'ON CONFLICT (khu_vuc,ten) DO UPDATE SET bai_da_hoc = CASE WHEN instr(x,?)>0 THEN trim(x) ELSE trim(x||?) END'],
      ['upsert có replace() lồng trên chính cột đó',
       'INSERT INTO le_hoi_tien_do (ma_le_hoi,khu_vuc,ten,da_phat_bieu) VALUES (?,?,?,?) ' +
       "ON CONFLICT (ma_le_hoi,khu_vuc,ten) DO UPDATE SET da_phat_bieu = trim(replace(x,?,','),',')"],
    ];
    for (const [ten, sql] of PHAI_THU_LAI)
      ktra('ghi đè được -> PHẢI thử lại: ' + ten, laGhiAnToanThuLai(sql) === true, sql.slice(0, 80));
    for (const [ten, sql] of KHONG_DUOC_THU_LAI)
      ktra('⭐ KHÔNG ghi đè -> TUYỆT ĐỐI không thử lại: ' + ten,
        laGhiAnToanThuLai(sql) === false, sql.slice(0, 80));
    ktra('câu lệnh rỗng/không rõ -> mặc định KHÔNG thử lại',
      !laGhiAnToanThuLai('') && !laGhiAnToanThuLai(null) && !laGhiAnToanThuLai('BLAH BLAH'));
  }

  // --- GHI: hành vi thật của run() ---
  {
    // Lệnh KHÔNG ghi đè -> chỉ chạy đúng 1 lượt rồi báo lỗi.
    const { d1, dem } = d1Hong(1);
    const db = bocD1(d1);
    let loi = null;
    try { await db.run('INSERT INTO nhat_ky_don_thuan (ngay) VALUES (?)', ['x']); } catch (e) { loi = e; }
    ktra('⭐⭐ run() lệnh KHÔNG ghi đè: chạy ĐÚNG 1 lượt, không thử lại',
      dem.run === 1, 'thực tế: ' + dem.run);
    ktra('và báo lỗi ra ngoài để người dùng tự bấm lại', !!loi, String(loi));
  }
  {
    // Lệnh ghi đè -> tự thử lại và thành công, người dùng không thấy lỗi gì.
    const { d1, dem } = d1Hong(2);
    const db = bocD1(d1);
    let loi = null;
    try {
      await db.run('DELETE FROM cv_cong_viec WHERE khu_vuc=? AND ten=?', ['A', 'B']);
    } catch (e) { loi = e; }
    ktra('⭐⭐ run() lệnh GHI ĐÈ: hỏng 2 lượt đầu vẫn tự chữa xong', !loi, String(loi));
    ktra('và đã thử đúng 3 lượt', dem.run === 3, 'thực tế: ' + dem.run);
  }
  {
    // Lệnh ghi đè nhưng hỏng mãi -> vẫn phải chịu thua, không lặp vô hạn.
    const { d1, dem } = d1Hong(99);
    const db = bocD1(d1);
    let loi = null;
    try { await db.run('DELETE FROM cv_nguoi WHERE khu_vuc=?', ['A']); } catch (e) { loi = e; }
    ktra('run() ghi đè mà hỏng mãi thì chịu thua sau 3 lượt', dem.run === 3, 'thực tế: ' + dem.run);
    ktra('và vẫn báo lỗi ra ngoài', !!loi);
  }
  {
    // batch: cả gói toàn lệnh ghi đè -> thử lại được.
    let lan = 0;
    const d1 = { prepare(){ const a={bind(){return a;}}; return a; },
      async batch(){ lan++; if (lan <= 2) throw new Error('D1_ERROR: internal error'); return []; } };
    const db = bocD1(d1);
    let loi = null;
    try {
      await db.batch([
        { sql: 'UPDATE diem_danh_roster SET thu_tu = ? WHERE id = ?', params: [1, 2] },
        { sql: 'UPDATE diem_danh_roster SET thu_tu = ? WHERE id = ?', params: [2, 3] },
      ]);
    } catch (e) { loi = e; }
    ktra('batch(): cả gói toàn lệnh ghi đè -> tự chữa xong', !loi && lan === 3, 'lượt: ' + lan);
  }
  {
    // batch: chỉ cần MỘT lệnh không an toàn là bỏ thử lại CẢ GÓI.
    let lan = 0;
    const d1 = { prepare(){ const a={bind(){return a;}}; return a; },
      async batch(){ lan++; throw new Error('D1_ERROR: internal error'); } };
    const db = bocD1(d1);
    try {
      await db.batch([
        { sql: 'UPDATE diem_danh_roster SET thu_tu = ? WHERE id = ?', params: [1, 2] },
        { sql: 'INSERT INTO hoc_vien (ten) VALUES (?)', params: ['x'] },
      ]);
    } catch (e) { /* mong đợi */ }
    ktra('⭐ batch(): 1 lệnh không ghi đè là bỏ thử lại CẢ GÓI', lan === 1, 'lượt: ' + lan);
  }
  {
    // batch rỗng -> không thử lại (không có gì chứng minh được là an toàn).
    let lan = 0;
    const d1 = { prepare(){ const a={bind(){return a;}}; return a; },
      async batch(){ lan++; throw new Error('D1_ERROR: internal error'); } };
    try { await bocD1(d1).batch([]); } catch (e) { /* mong đợi */ }
    ktra('batch rỗng -> không thử lại', lan === 1, 'lượt: ' + lan);
  }

  // --- Câu báo lỗi tiếng Việt ---
  {
    const t = moTaLoiTiengViet(new Error('D1_ERROR: internal error; reference = rhe134pisfbr25lspci1gh2t'));
    ktra('đổi lỗi D1 sang tiếng Việt dễ hiểu', /Máy chủ dữ liệu đang bận nhất thời/.test(t), t);
    ktra('nói rõ dữ liệu KHÔNG bị mất', /KHÔNG bị mất/.test(t), t);
    ktra('giữ lại mã tra cứu của Cloudflare', /rhe134pisfbr25lspci1gh2t/.test(t), t);
    ktra('KHÔNG còn chữ "D1_ERROR" khó hiểu trên màn hình', !/D1_ERROR/.test(t), t);
    const t2 = moTaLoiTiengViet(new Error('Thiếu Khu vực.'));
    ktra('lỗi nghiệp vụ giữ NGUYÊN văn, không bị đổi lung tung', t2 === 'Thiếu Khu vực.', t2);
  }
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
process.exit(hong ? 1 : 0);
