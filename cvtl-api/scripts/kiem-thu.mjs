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

async function goi(fn, args, nguoiGoi, moiTruong = null) {
  const muc = DANH_MUC[fn];
  if (!muc) return { error: 'Không hỗ trợ hàm: ' + fn };
  try {
    // `moiTruong` (tùy chọn): { env, ctx } — dùng để thử guiTelegramNgam
    // (báo cáo T3/T7, 14/08/2026) mà không ảnh hưởng các ca kiểm thử khác.
    const bienMoi = (moiTruong && moiTruong.env) || env;
    const execCtx = moiTruong && moiTruong.ctx;
    const r = await muc.fn({ db, env: bienMoi, ctx: execCtx, nguoiGoi }, ...args);
    return { result: r };
  } catch (e) {
    return { error: e.message };
  }
}

function kiem(ten, dieuKien, chiTiet = '') {
  if (dieuKien) { dat++; console.log('  ✓', ten); }
  else { hong++; console.log('  ✗', ten, chiTiet); }
}

/** Đếm nhanh một bảng. */
function dem(sql, ...p) { return sqlite.prepare(sql).get(...p).c; }

const CHU = { email: 'rise.shine1948@gmail.com', ten: 'Chu', laChu: true };
const NV  = { email: 'nhanvien@gmail.com', ten: 'Nhan vien', laChu: false };
const TH = '2026-08';

console.log('\n=== KIỂM THỬ BACKEND MỚI (offline) ===\n');

console.log('1) Cấu hình');
{
  const r = await goi('getDropdownOptions', [], NV);
  // Tên trường phải đúng toList / tienDoList / nddList — giao diện đọc đúng ba
  // tên này (index.html, hàm loadDropdowns). Đổi tên là dropdown trống trơn.
  kiem('getDropdownOptions trả đủ 7 khu vực', r.result?.toList?.length === 7, JSON.stringify(r));
  kiem('getDropdownOptions trả danh sách tiến độ', r.result?.tienDoList?.includes('BT'));
  kiem('getDropdownOptions có trường nddList', Array.isArray(r.result?.nddList));
}

console.log('\n1b) Đăng nhập — mã Google nằm ở ô "token", KHÔNG nằm trong args');
{
  // Giao diện gọi checkAccess() rỗng tay, mã đăng nhập đi ở ô token.
  // Nếu handler chỉ đọc tham số thứ nhất thì luôn báo "Mã đăng nhập không hợp
  // lệ." và KHÔNG AI ĐĂNG NHẬP ĐƯỢC. Đã xảy ra thật ngày 12/08/2026.
  const { DANH_MUC: DM } = await import(join(goc, 'src/registry.js'));
  const chay = async (token) => {
    try {
      return { result: await DM.checkAccess.fn({ db, env, nguoiGoi: null, token }) };
    } catch (e) {
      return { error: e.message };
    }
  };

  const khongCoGi = await chay('');
  kiem('không có mã nào thì báo lỗi rõ ràng',
    /không hợp lệ/i.test(khongCoGi.result?.error || khongCoGi.error || ''),
    JSON.stringify(khongCoGi));

  // Mã có đủ 3 phần -> phải đi tiếp tới bước kiểm chữ ký (lỗi khác), chứng tỏ
  // handler ĐÃ đọc được mã từ ô token.
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const giaMa = b64({ alg: 'RS256', kid: 'test' }) + '.' + b64({ email: 'a@b.c' }) + '.chuky';
  const coMa = await chay(giaMa);
  const loiCoMa = coMa.result?.error || coMa.error || '';
  kiem('mã ở ô token ĐƯỢC đọc (không còn báo "không hợp lệ")',
    loiCoMa !== '' && !/không hợp lệ/i.test(loiCoMa), 'thực tế: ' + loiCoMa);

  kiem('luôn có trường pending cho giao diện',
    khongCoGi.result?.pending === false, JSON.stringify(khongCoGi));

  // ------------------------------------------------------------------
  // VÀO LẠI BẰNG MÃ PHIÊN ĐÃ LƯU — đây là đường đi khi người dùng bấm F5.
  // Nếu checkAccess không nhận mã "SESS." thì CỨ F5 LÀ BỊ BẮT ĐĂNG NHẬP LẠI.
  // Đã xảy ra thật ngày 13/08/2026.
  // ------------------------------------------------------------------
  const NAY = Date.now();
  const MA_PHIEN = 'SESS.kiemthu0001';
  db.run('INSERT INTO phien_dang_nhap (token, email, ten, tao_luc, het_han_luc) VALUES (?,?,?,?,?)',
    [MA_PHIEN, 'nhanvien@gmail.com', 'Nhan vien', NAY, NAY + 86400000]);

  const vaoLai = await chay(MA_PHIEN);
  kiem('F5: mã phiên còn hạn thì vào thẳng, KHÔNG bắt đăng nhập lại',
    vaoLai.result?.authorized === true, JSON.stringify(vaoLai));
  kiem('F5: trả lại ĐÚNG mã phiên cũ, không sinh mã mới',
    vaoLai.result?.sessionToken === MA_PHIEN, JSON.stringify(vaoLai.result?.sessionToken));
  kiem('F5: trả đúng email của người dùng',
    vaoLai.result?.email === 'nhanvien@gmail.com', JSON.stringify(vaoLai));
  kiem('F5: không sinh thêm dòng rác trong bảng phiên',
    dem('SELECT COUNT(*) c FROM phien_dang_nhap') === 1);
  kiem('F5: hạn dùng được đẩy ra xa (gia hạn 30 ngày)',
    sqlite.prepare('SELECT het_han_luc h FROM phien_dang_nhap WHERE token=?').get(MA_PHIEN).h > NAY + 86400000);

  // Mã phiên đã hết hạn -> phải báo hết hạn VÀ dọn dòng đó đi
  const HET_HAN = 'SESS.kiemthu0002';
  db.run('INSERT INTO phien_dang_nhap (token, email, ten, tao_luc, het_han_luc) VALUES (?,?,?,?,?)',
    [HET_HAN, 'nhanvien@gmail.com', 'Nhan vien', NAY - 200000, NAY - 100000]);
  const hetHan = await chay(HET_HAN);
  kiem('mã phiên hết hạn thì bắt đăng nhập lại',
    hetHan.result?.authorized === false, JSON.stringify(hetHan));
  kiem('mã phiên hết hạn bị dọn khỏi CSDL',
    dem('SELECT COUNT(*) c FROM phien_dang_nhap WHERE token=?', HET_HAN) === 0);

  // Mã phiên bịa ra -> từ chối, không sập
  const bia = await chay('SESS.khongcothat123');
  kiem('mã phiên bịa ra bị từ chối', bia.result?.authorized === false, JSON.stringify(bia));

  // Quyền bị thu hồi mà mã phiên còn hạn -> phải chặn và huỷ luôn mã phiên
  const BI_THU_HOI = 'SESS.kiemthu0003';
  db.run("INSERT INTO access_control (email, trang_thai, ten) VALUES ('nghi@gmail.com','tu_choi','Da nghi')");
  db.run('INSERT INTO phien_dang_nhap (token, email, ten, tao_luc, het_han_luc) VALUES (?,?,?,?,?)',
    [BI_THU_HOI, 'nghi@gmail.com', 'Da nghi', NAY, NAY + 86400000]);
  const thuHoi = await chay(BI_THU_HOI);
  kiem('quyền bị thu hồi thì mã phiên cũ hết tác dụng ngay',
    thuHoi.result?.authorized === false, JSON.stringify(thuHoi));
  kiem('mã phiên của người bị thu hồi quyền bị huỷ',
    dem('SELECT COUNT(*) c FROM phien_dang_nhap WHERE token=?', BI_THU_HOI) === 0);
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

console.log('\n7) Đã chuyển xong toàn bộ — không còn hàm nào báo "chưa được chuyển"');
{
  const { DANH_MUC: DM } = await import(join(goc, 'src/registry.js'));
  const ten = Object.keys(DM);
  // 60 hàm chuyển từ bản Apps Script cũ + 11 hàm mới của nhóm Trụ đỡ
  // (sổ mốc Hữu hiệu / Báp-têm, điểm và khen thưởng — thêm 13/08/2026)
  // + huyTPBaoCao (Hủy báo cáo, chỉ tài khoản chủ — thêm 16/08/2026).
  kiem('danh mục đủ 72 hàm', ten.length === 72, 'thực tế: ' + ten.length);
  const chuaNoi = ten.filter((t) => typeof DM[t].fn !== 'function' || DM[t].chuaChuyen);
  kiem('mọi hàm đều đã nối vào mã thật', chuaNoi.length === 0, chuaNoi.join(', '));

  const r = await goi('getStudents', [], NV);
  kiem('getStudents chạy thật, không còn báo "chưa được chuyển"', Array.isArray(r.result), JSON.stringify(r));
  const r2 = await goi('hamKhongTonTai', [], NV);
  kiem('hàm lạ bị từ chối', /Không hỗ trợ hàm/.test(r2.error || ''));
}

console.log('\n8) Telegram khi bấm nút "Báo cáo" T3/T7 (14/08/2026, theo yêu cầu anh Rise)');
{
  const fetchCu = globalThis.fetch;
  let soLanGoiFetch = 0;
  const tinDaGui = [];
  globalThis.fetch = (url, opt) => {
    soLanGoiFetch++;
    tinDaGui.push(JSON.parse(opt.body).text);
    return Promise.resolve({ ok: true });
  };
  const daCho = [];
  const execCtxGia = { waitUntil(p) { daCho.push(p); } };
  const moiTruong = {
    env: { TELEGRAM_BOT_TOKEN: 'token-gia', TELEGRAM_CHAT_ID: '123' },
    ctx: execCtxGia,
  };
  try {
    // Anh Rise phát hiện (14/08/2026): số liệu trong tin Telegram bị lệch với
    // số ĐANG hiển thị trong ô "Nhập số liệu theo tuần" — vì máy chủ trước đó
    // tính lại từ Điểm danh (gợi ý) thay vì đọc đúng số đã lưu. Ở đây KHÔNG có
    // dữ liệu Điểm danh nào cho "K My" (gợi ý sẽ ra 0/0) nhưng ta tự nhập tay
    // 9 và 3 — nếu lỗi tái diễn, tin sẽ báo "0" thay vì "9"/"3".
    await goi('saveTPWeek', [TH, 'K My', '1lan', 2, 9], CHU);
    await goi('saveTPWeek', [TH, 'K My', '4lan', 2, 3], CHU);

    const r = await goi('saveTPBaoCao', [TH, 'K My', 2, 'T7'], NV, moiTruong);
    kiem('saveTPBaoCao vẫn thành công khi có cấu hình Telegram', !!r.result?.thoiGian, JSON.stringify(r));
    kiem('bấm Báo cáo -> có đăng ký gửi Telegram qua waitUntil', daCho.length === 1, 'daCho.length=' + daCho.length);

    await Promise.all(daCho); // không được ném lỗi
    kiem('việc đã đăng ký qua waitUntil chạy xong không lỗi', true);
    kiem('fetch tới Telegram thực sự được gọi', soLanGoiFetch === 1, 'soLanGoiFetch=' + soLanGoiFetch);
    kiem('tin nhắn có Khu vực + Tuần + Thứ 7',
      tinDaGui[0].includes('K My') && tinDaGui[0].includes('Thứ 7'), tinDaGui[0]);
    kiem('tin nhắn báo ĐÚNG số đã lưu trong bảng (9 và 3), không phải số gợi ý từ Điểm danh',
      tinDaGui[0].includes('≥1 lần: 9') && tinDaGui[0].includes('≥4 lần: 3'), tinDaGui[0]);
  } finally {
    globalThis.fetch = fetchCu;
  }

  // Không cấu hình Telegram -> vẫn phải báo cáo thành công bình thường.
  const fetchCu2 = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('KHÔNG được gọi fetch khi chưa cấu hình Telegram'); };
  try {
    const r = await goi('saveTPBaoCao', [TH, 'K Long', 1, 'T3'], NV);
    kiem('chưa cấu hình Telegram -> vẫn báo cáo thành công, không lỗi', !!r.result?.thoiGian, JSON.stringify(r));
  } finally {
    globalThis.fetch = fetchCu2;
  }
}

console.log('\n9) Hủy báo cáo T3/T7 — chỉ tài khoản chủ (16/08/2026, theo yêu cầu anh Rise)');
{
  const { DANH_MUC: DM } = await import(join(goc, 'src/registry.js'));
  kiem('huyTPBaoCao chỉ dành cho tài khoản chủ (chuThoi=true, chặn ở router)',
    DM.huyTPBaoCao.chuThoi === true);

  // "K Long" Tuần 1 T3 đã được báo cáo ở mục 8 phía trên.
  let r = await goi('getTPSummary', [TH], NV);
  let kl = r.result.find((x) => x.khuVuc === 'K Long');
  kiem('trước khi hủy: Tuần 1 T3 của K Long đang có nhãn đã báo cáo',
    !!kl.baoCao[0].T3.label, JSON.stringify(kl.baoCao[0]));

  r = await goi('huyTPBaoCao', [TH, 'K Long', 1, 'T3'], CHU);
  kiem('huyTPBaoCao chạy thành công', r.result?.success === true, JSON.stringify(r));

  r = await goi('getTPSummary', [TH], NV);
  kl = r.result.find((x) => x.khuVuc === 'K Long');
  kiem('sau khi hủy: Tuần 1 T3 của K Long quay lại "chưa báo cáo"',
    kl.baoCao[0].T3.label === '', JSON.stringify(kl.baoCao[0]));

  r = await goi('saveDiemDanhCell', [TH, 'K Long', 'Ai đó không có thật', 1, 'T3toi', '211'], NV);
  kiem('hủy báo cáo xong -> ô Điểm danh liên quan được mở khóa lại cho nhân viên',
    !/đã báo cáo/.test(r.error || ''), JSON.stringify(r));

  // Hủy một mục CHƯA từng báo cáo -> không lỗi, không có gì để xóa (dễ đoán,
  // an toàn khi bấm nhầm/bấm 2 lần).
  r = await goi('huyTPBaoCao', [TH, 'K Long', 5, 'T7'], CHU);
  kiem('hủy báo cáo một mục chưa từng báo cáo -> vẫn thành công, không lỗi',
    r.result?.success === true, JSON.stringify(r));

  r = await goi('huyTPBaoCao', [TH, 'K Long', 99, 'T3'], CHU);
  kiem('hủy báo cáo với Tuần không hợp lệ -> báo lỗi tiếng Việt',
    /Tuần không hợp lệ/.test(r.error || ''), JSON.stringify(r));
}

console.log('\n10) Ghi chú thành viên (Mã cấp độ + Ghi chú) — sửa lỗi biến mất sau khi lưu (16/08/2026)');
{
  // Anh Rise phát hiện: bấm tên thành viên, lưu Ghi chú, thấy lên ngay nhưng
  // "được 1 lát rồi biến mất". Nguyên nhân: getDiemDanhGhiChuAll() trả về một
  // OBJECT (khoá "khu_vuc|ten") trong khi index.html gọi `list.forEach(...)`
  // (chỉ MẢNG mới có .forEach) rồi đọc r.khuVuc/r.capDo — khác cả hình dạng
  // lẫn tên trường (bản cũ trả `maCapDo`). Lỗi ném ra âm thầm, ddGhiChuMap
  // không bao giờ tải lại được nên mỗi lần tải lại danh sách Điểm danh là
  // ghi chú vừa lưu "biến mất". Bài kiểm thử dưới đây mô phỏng đúng cách
  // index.html dùng kết quả trả về, để bắt lại lỗi hình dạng/tên trường.
  let r = await goi('saveDiemDanhGhiChu', ['K Đức', 'P Ngọc Đức', 'TDM', 'Ghi chú thử nghiệm'], CHU);
  kiem('saveDiemDanhGhiChu chạy thành công', r.result?.success === true, JSON.stringify(r));
  kiem('saveDiemDanhGhiChu trả kèm ngayCapNhat (index.html đọc res.ngayCapNhat)',
    !!r.result?.ngayCapNhat, JSON.stringify(r));

  r = await goi('getDiemDanhGhiChuAll', [], NV);
  kiem('getDiemDanhGhiChuAll trả về MẢNG (index.html gọi list.forEach)',
    Array.isArray(r.result), 'thực tế kiểu: ' + typeof r.result + ' — ' + JSON.stringify(r.result));

  // Mô phỏng CHÍNH XÁC vòng lặp trong index.html (loadDiemDanhGhiChu_):
  //   list.forEach(function(r){ ddGhiChuMap[r.khuVuc + '||' + r.ten] = r; });
  const ddGhiChuMap = {};
  (r.result || []).forEach((row) => { ddGhiChuMap[row.khuVuc + '||' + row.ten] = row; });
  const rec = ddGhiChuMap['K Đức||P Ngọc Đức'];
  kiem('sau khi mô phỏng vòng lặp giao diện, tìm đúng bản ghi theo khuVuc+ten',
    !!rec, JSON.stringify(ddGhiChuMap));
  kiem('trường "capDo" đọc đúng giá trị vừa lưu (không phải "maCapDo")',
    rec && rec.capDo === 'TDM', JSON.stringify(rec));
  kiem('trường "ghiChu" đọc đúng giá trị vừa lưu',
    rec && rec.ghiChu === 'Ghi chú thử nghiệm', JSON.stringify(rec));

  // Lưu đè lên cùng một người -> vẫn chỉ 1 dòng (ON CONFLICT), không sinh
  // dòng trùng.
  await goi('saveDiemDanhGhiChu', ['K Đức', 'P Ngọc Đức', 'TDM2', 'Ghi chú đã sửa'], CHU);
  r = await goi('getDiemDanhGhiChuAll', [], NV);
  const trungTen = (r.result || []).filter((row) => row.khuVuc === 'K Đức' && row.ten === 'P Ngọc Đức');
  kiem('lưu đè ghi chú cùng 1 người không sinh dòng trùng', trungTen.length === 1, JSON.stringify(trungTen));
  kiem('lưu đè cập nhật đúng giá trị mới', trungTen[0]?.capDo === 'TDM2', JSON.stringify(trungTen[0]));
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
process.exit(hong ? 1 : 0);
