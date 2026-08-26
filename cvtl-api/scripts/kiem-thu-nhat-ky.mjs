// =====================================================================
// Kiểm thử OFFLINE cho src/nhat-ky.js — Nhật ký thay đổi số liệu.
//     node --experimental-sqlite scripts/kiem-thu-nhat-ky.mjs
//
// Trọng tâm — bốn nguyên tắc của nhật ký (xem đầu src/nhat-ky.js):
//   1. KHÔNG BAO GIỜ làm hỏng lời gọi chính (dù CSDL hỏng, dù tham số quái)
//   2. Chỉ ghi hàm GHI, không ghi hàm ĐỌC
//   3. Không lưu token; tham số dài phải bị cắt
//   4. Ghi đúng KHU VỰC — bảng VI_TRI_KHU_VUC phải khớp chữ ký hàm thật
//
// ⚠️ Phần 6 là phần đắt nhất: nó đối chiếu VI_TRI_KHU_VUC với chữ ký THẬT
// của từng hàm trong src/handlers/*.js. Đổi thứ tự tham số của một hàm mà
// quên sửa bảng đó thì nhật ký ghi nhầm khu vực — lỗi rất khó thấy.
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_KHOI_TAO = readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8');
const { DANH_MUC } = await import(join(goc, 'src/registry.js'));
const NK = await import(join(goc, 'src/nhat-ky.js'));

let sqlite, db;
function bocSqlite(conn) {
  return {
    async all(sql, p = []) { return conn.prepare(sql).all(...p); },
    async first(sql, p = []) { return conn.prepare(sql).get(...p) ?? null; },
    async run(sql, p = []) { const r = conn.prepare(sql).run(...p); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
    async batch(ds) { for (const { sql, params = [] } of ds) conn.prepare(sql).run(...params); },
  };
}
function taoCSDL() {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);
  db = bocSqlite(sqlite);
}

let dat = 0, hong = 0;
const kiem = (ten, ok, ct = '') => { if (ok) { dat++; console.log('  ✓', ten); } else { hong++; console.log('  ✗', ten, ct); } };
const demDong = () => sqlite.prepare('SELECT count(*) c FROM nhat_ky_thay_doi').get().c;
const dongCuoi = () => sqlite.prepare('SELECT * FROM nhat_ky_thay_doi ORDER BY id DESC LIMIT 1').get();
const doc = (...a) => NK.getNhatKyThayDoi({ db }, ...a);

console.log('\n=== KIỂM THỬ NHẬT KÝ THAY ĐỔI SỐ LIỆU (offline) ===\n');

// ---------------------------------------------------------------------
console.log('1) Đăng ký hàm');
{
  taoCSDL();
  kiem('có hàm getNhatKyThayDoi', !!DANH_MUC.getNhatKyThayDoi);
  kiem('là hàm ĐỌC', DANH_MUC.getNhatKyThayDoi.doc === true);
  kiem('CHỈ Chủ/Admin xem được (chuThoi=true)', DANH_MUC.getNhatKyThayDoi.chuThoi === true);
  kiem('KHÔNG có hàm ghi nhật ký trong registry (router tự ghi)',
    !Object.keys(DANH_MUC).some((k) => /^(ghi|add|save)NhatKyThayDoi$/.test(k)));
}

// ---------------------------------------------------------------------
console.log('\n2) Ghi và đọc lại');
{
  taoCSDL();
  const ok = await NK.ghiNhatKy(db, { ham: 'saveTPWeek', khuVuc: 'K My', email: 'a@b.c', thamSo: '["2026-08","K My"]' });
  kiem('ghi được 1 dòng', ok === true && demDong() === 1);
  const d = dongCuoi();
  kiem('mặc định loai = "ghi"', d.loai === 'ghi');
  kiem('mặc định ket_qua = "ok"', d.ket_qua === 'ok');
  kiem('có mốc thời gian', Number(d.thoi_gian_ms) > 0);
  const ds = await doc(7);
  kiem('đọc lại thấy đúng 1 dòng', ds.length === 1);
  kiem('đọc trả về đúng tên hàm', ds[0].ham === 'saveTPWeek');
  kiem('đọc trả về đúng khu vực', ds[0].khuVuc === 'K My');
  kiem('đọc trả về đúng email', ds[0].email === 'a@b.c');
}

// ---------------------------------------------------------------------
console.log('\n3) ⚠️ KHÔNG BAO GIỜ ném lỗi (nguyên tắc 1)');
{
  taoCSDL();
  kiem('db = null thì trả false, không ném', (await NK.ghiNhatKy(null, { ham: 'x' })) === false);
  kiem('bản ghi rỗng thì trả false, không ném', (await NK.ghiNhatKy(db, null)) === false);
  kiem('thiếu tên hàm thì trả false, không ném', (await NK.ghiNhatKy(db, { khuVuc: 'K My' })) === false);
  const dbHong = { async run() { throw new Error('D1_ERROR: giả lập hỏng'); } };
  kiem('CSDL hỏng thì trả false, KHÔNG ném ra ngoài', (await NK.ghiNhatKy(dbHong, { ham: 'saveTPWeek' })) === false);
  let nem = false;
  try { NK.ghiNhatKyNen({ db: dbHong, ctx: null }, { ham: 'saveTPWeek' }); } catch (e) { nem = true; }
  kiem('ghiNhatKyNen với CSDL hỏng KHÔNG ném', nem === false);
  nem = false;
  try { NK.ghiNhatKyNen(null, null); } catch (e) { nem = true; }
  kiem('ghiNhatKyNen(null, null) KHÔNG ném', nem === false);
  kiem('không dòng rác nào lọt vào bảng', demDong() === 0);
}

// ---------------------------------------------------------------------
console.log('\n4) Tóm tắt tham số — cắt ngắn, không ném (nguyên tắc 3)');
{
  kiem('mảng thường ra JSON', NK.tomTatThamSo(['2026-08', 'K My']) === '["2026-08","K My"]');
  kiem('undefined ra mảng rỗng', NK.tomTatThamSo(undefined) === '[]');
  const dai = NK.tomTatThamSo([('x').repeat(5000)]);
  kiem('chuỗi rất dài bị CẮT', dai.length < 400, 'dài=' + dai.length);
  kiem('chuỗi bị cắt có dấu hiệu ...(cat)', dai.endsWith('...(cat)'));
  const vong = {}; vong.tu = vong;
  kiem('tham số vòng lặp KHÔNG ném, trả rỗng', NK.tomTatThamSo([vong]) === '');
  kiem('tôn trọng giới hạn tự đặt', NK.tomTatThamSo([('y').repeat(100)], 20).length <= 30);
}

// ---------------------------------------------------------------------
console.log('\n5) Lấy đúng khu vực từ lời gọi (nguyên tắc 4)');
{
  kiem('saveTPWeek — khuVuc ở vị trí 1', NK.khuVucCuaLoiGoi('saveTPWeek', ['2026-08', 'K My', '1lan', 1, 5]) === 'K My');
  kiem('addCVNguoi — khuVuc ở vị trí 0', NK.khuVucCuaLoiGoi('addCVNguoi', ['Đ Uyên', 'Chị A']) === 'Đ Uyên');
  kiem('chotKy — khuVuc ở vị trí 3', NK.khuVucCuaLoiGoi('chotKy', ['2026-08', 'a', 'b', 'TT Châu']) === 'TT Châu');
  kiem('hàm không gắn khu vực trả rỗng', NK.khuVucCuaLoiGoi('getStats', []) === '');
  kiem('hàm lạ trả rỗng, không ném', NK.khuVucCuaLoiGoi('khongHeCoHamNay', ['K My']) === '');
  kiem('thiếu tham số trả rỗng', NK.khuVucCuaLoiGoi('saveTPWeek', ['2026-08']) === '');
  kiem('tham số không phải chuỗi trả rỗng', NK.khuVucCuaLoiGoi('addCVNguoi', [123, 'x']) === '');
  kiem('tự cắt khoảng trắng thừa', NK.khuVucCuaLoiGoi('addCVNguoi', ['  K My  ', 'x']) === 'K My');
}

// ---------------------------------------------------------------------
console.log('\n6) ⚠️ VI_TRI_KHU_VUC phải khớp chữ ký THẬT của từng hàm');
{
  // Đọc thẳng chữ ký hàm trong src/handlers/*.js và so lại.
  const thuMuc = join(goc, 'src/handlers');
  const chuKy = {};
  for (const f of readdirSync(thuMuc).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(thuMuc, f), 'utf8');
    for (const m of src.matchAll(/export async function (\w+)\s*\(([^)]*)\)/g)) {
      const tho = m[2].replace(/\{[^}]*\}/g, 'CTX');
      const ds = tho.split(',').map((x) => x.trim()).filter(Boolean);
      if (ds[0] === 'CTX' || ds[0] === 'ctx') ds.shift();
      chuKy[m[1]] = ds;
    }
  }
  let saiViTri = [];
  let thieu = [];
  for (const [ham, ds] of Object.entries(chuKy)) {
    if (!DANH_MUC[ham]) continue;
    const that = ds.findIndex((x) => x === 'khuVuc' || x === 'khu_vuc');
    const khai = NK.VI_TRI_KHU_VUC[ham];
    if (that >= 0 && khai !== that) {
      if (khai === undefined) thieu.push(ham + ' (đúng ra là ' + that + ')');
      else saiViTri.push(ham + ' (khai ' + khai + ', thật ' + that + ')');
    }
    if (that < 0 && khai !== undefined) saiViTri.push(ham + ' (khai ' + khai + ' nhưng hàm KHÔNG có khuVuc)');
  }
  kiem('không hàm nào bị khai SAI vị trí khuVuc', saiViTri.length === 0, saiViTri.join(' · '));
  kiem('không hàm nào có khuVuc mà bị BỎ SÓT', thieu.length === 0, thieu.join(' · '));
  const soKhai = Object.keys(NK.VI_TRI_KHU_VUC).length;
  kiem('bảng khai có ít nhất 30 hàm', soKhai >= 30, 'đang có ' + soKhai);
}

// ---------------------------------------------------------------------
console.log('\n7) Lọc khi đọc lại');
{
  taoCSDL();
  const t = Date.now();
  await NK.ghiNhatKy(db, { ham: 'saveTPWeek', khuVuc: 'K My', thoiGianMs: t });
  await NK.ghiNhatKy(db, { ham: 'saveCVCongViec', khuVuc: 'Đ Uyên', thoiGianMs: t - 1000 });
  await NK.ghiNhatKy(db, { ham: 'getCVCongViec', khuVuc: 'K My', loai: 'bong_toi', thoiGianMs: t - 2000 });
  await NK.ghiNhatKy(db, { ham: 'saveTPWeek', khuVuc: 'K My', thoiGianMs: t - 40 * 24 * 3600 * 1000 });

  kiem('7 ngày gần nhất bỏ dòng 40 ngày trước', (await doc(7)).length === 3);
  kiem('60 ngày thì lấy đủ 4 dòng', (await doc(60)).length === 4);
  kiem('lọc theo khu vực', (await doc(7, 'K My')).length === 2);
  kiem('lọc theo loai = bong_toi', (await doc(7, '', 'bong_toi')).length === 1);
  kiem('lọc theo loai = ghi', (await doc(7, '', 'ghi')).length === 2);
  kiem('lọc chồng khu vực + loai', (await doc(7, 'K My', 'ghi')).length === 1);
  const ds = await doc(7);
  kiem('sắp xếp MỚI NHẤT trước', ds[0].ham === 'saveTPWeek' && ds[0].khuVuc === 'K My');
  kiem('giới hạn số dòng', (await doc(7, '', '', 2)).length === 2);
  kiem('khu vực không tồn tại trả rỗng', (await doc(7, 'Không Có')).length === 0);
}

// ---------------------------------------------------------------------
console.log('\n8) Chặn tham số đọc quái');
{
  taoCSDL();
  for (let i = 0; i < 5; i++) await NK.ghiNhatKy(db, { ham: 'saveTPWeek', khuVuc: 'K My' });
  kiem('soNgay = 0 vẫn chạy (về mặc định)', (await doc(0)).length === 5);
  kiem('soNgay âm không làm sập', Array.isArray(await doc(-5)));
  kiem('soNgay khổng lồ bị chặn trần', Array.isArray(await doc(999999)));
  kiem('gioiHan = 0 về mặc định', (await doc(7, '', '', 0)).length === 5);
  kiem('gioiHan khổng lồ bị chặn trần 1000', (await doc(7, '', '', 999999)).length === 5);
  kiem('gioiHan = 1 trả đúng 1 dòng', (await doc(7, '', '', 1)).length === 1);
}

// ---------------------------------------------------------------------
console.log('\n9) Ghi được cả khi lỗi, và giữ đủ thông tin tra cứu');
{
  taoCSDL();
  await NK.ghiNhatKy(db, {
    ham: 'saveCVCongViec', khuVuc: 'K Trâm', email: 'kvt@x.y',
    ketQua: 'loi', ghiChu: 'Tuần không hợp lệ: "9"',
    thamSo: NK.tomTatThamSo(['K Trâm', 'Chị B', '2026-08', 9, 'sang', 'T2', '127']),
  });
  const d = (await doc(7))[0];
  kiem('ket_qua = loi được lưu', d.ketQua === 'loi');
  kiem('lời lỗi được lưu', d.ghiChu.includes('Tuần không hợp lệ'));
  kiem('vẫn biết ai làm', d.email === 'kvt@x.y');
  kiem('vẫn biết khu vực nào', d.khuVuc === 'K Trâm');
  kiem('vẫn biết tham số gì', d.thamSo.includes('K Trâm') && d.thamSo.includes('127'));
}

// ---------------------------------------------------------------------
console.log('\n10) Bảng CSDL — khớp migration và chạy lại được');
{
  taoCSDL();
  const cols = sqlite.prepare('PRAGMA table_info(nhat_ky_thay_doi)').all().map((c) => c.name);
  for (const c of ['id', 'thoi_gian_ms', 'loai', 'email', 'ham', 'khu_vuc', 'tham_so', 'ket_qua', 'ghi_chu'])
    kiem('có cột ' + c, cols.includes(c));
  const idx = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='nhat_ky_thay_doi'").all().map((r) => r.name);
  kiem('có chỉ mục theo thời gian', idx.includes('ix_nktd_thoi_gian'));
  kiem('có chỉ mục theo khu vực', idx.includes('ix_nktd_kv'));
  let nem = false;
  try { sqlite.exec(SQL_KHOI_TAO); } catch (e) { nem = true; }
  kiem('chạy lại migration lần 2 KHÔNG hỏng', nem === false);

  const { CAU_LENH_TAO_BANG } = await import(join(goc, 'src/schema-sql.js'));
  const bangMig = new Set([...SQL_KHOI_TAO.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]));
  const bangSch = new Set([...CAU_LENH_TAO_BANG.join('\n').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]));
  kiem('migration và schema-sql.js khớp nhau',
    bangMig.size === bangSch.size && [...bangMig].every((b) => bangSch.has(b)),
    'mig=' + bangMig.size + ' sch=' + bangSch.size);
  kiem('cả hai đều có nhat_ky_thay_doi', bangMig.has('nhat_ky_thay_doi') && bangSch.has('nhat_ky_thay_doi'));
}

// ---------------------------------------------------------------------
console.log('\n11) laHamGhi — chỉ hàm GHI mới vào nhật ký (nguyên tắc 2)');
{
  kiem('doc: true  -> KHÔNG ghi', NK.laHamGhi({ doc: true }) === false);
  kiem('doc: false -> CÓ ghi', NK.laHamGhi({ doc: false }) === true);
  kiem('không khai doc -> CÓ ghi', NK.laHamGhi({}) === true);
  kiem('null -> KHÔNG ghi, không ném', NK.laHamGhi(null) === false);
  kiem('getStats (hàm ĐỌC) không vào nhật ký', NK.laHamGhi(DANH_MUC.getStats) === false);
  kiem('saveTPWeek (hàm GHI) vào nhật ký', NK.laHamGhi(DANH_MUC.saveTPWeek) === true);
  kiem('getNhatKyThayDoi tự nó KHÔNG vào nhật ký', NK.laHamGhi(DANH_MUC.getNhatKyThayDoi) === false);
  kiem('checkAccess (chạy mỗi lần tải trang) KHÔNG vào nhật ký',
    NK.laHamGhi(DANH_MUC.checkAccess) === false);
  const soGhi = Object.values(DANH_MUC).filter((m) => NK.laHamGhi(m)).length;
  const soDoc = Object.values(DANH_MUC).filter((m) => !NK.laHamGhi(m)).length;
  kiem('tổng ghi + đọc = tổng hàm', soGhi + soDoc === Object.keys(DANH_MUC).length);
  kiem('số hàm ĐỌC nhiều hơn 30 (nếu ghi hết thì bảng sẽ ngập)', soDoc > 30, 'đọc=' + soDoc);
}

// ---------------------------------------------------------------------
console.log('\n12) ⚠️ Router phải nối dây ĐÚNG (đọc thẳng src/index.js)');
{
  // Không giả được phiên đăng nhập để chạy router thật (quy tắc an toàn của
  // dự án), nên kiểm bằng cách soi mã: bảo đảm cả nhánh THÀNH CÔNG lẫn nhánh
  // LỖI đều có ghi nhật ký, và lời gọi chính vẫn được bọc try/catch.
  const src = readFileSync(join(goc, 'src/index.js'), 'utf8');
  kiem('index.js có nạp module nhật ký', /import\s*\{[^}]*ghiNhatKyNen[^}]*\}\s*from\s*'\.\/nhat-ky\.js'/.test(src));
  kiem('dùng laHamGhi chứ không tự chế điều kiện', src.includes('laHamGhi(muc)'));
  kiem('gọi ghiNhatKyNen ĐÚNG 2 lần (thành công + lỗi)',
    (src.match(/ghiNhatKyNen\(/g) || []).length === 2,
    'đếm được ' + (src.match(/ghiNhatKyNen\(/g) || []).length);
  kiem('có ghi ket_qua "loi" ở nhánh lỗi', /ketQua:\s*'loi'/.test(src));
  kiem('có ghi ket_qua "ok" ở nhánh thành công', /ketQua:\s*'ok'/.test(src));
  kiem('nhánh lỗi NÉM LẠI để người dùng vẫn thấy lỗi', /catch \(e\) \{[\s\S]{0,600}?throw e;/.test(src));
  kiem('có cắt tham số trước khi lưu', src.includes('tomTatThamSo(args)'));
  kiem('có lấy khu vực từ lời gọi', src.includes('khuVucCuaLoiGoi(fn, args)'));
  kiem('KHÔNG lưu token vào nhật ký', !/thamSo:\s*token|token:\s*token/.test(src));
}

console.log('\n=== KẾT QUẢ: ' + dat + ' đạt, ' + hong + ' hỏng ===\n');
process.exit(hong ? 1 : 0);
