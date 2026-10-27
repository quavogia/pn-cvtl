// =====================================================================
// Kiểm thử OFFLINE cho T-020: Quản lý Người dẫn dắt (thêm / xoá / đếm sử dụng)
//   node scripts/kiem-thu-ndd.mjs
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_KHOI_TAO = readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8');

const { DANH_MUC } = await import(join(goc, 'src/registry.js'));
const { laHamGhi } = await import(join(goc, 'src/nhat-ky.js'));
const cauHinh = await import(join(goc, 'src/handlers/cau-hinh.js'));
const hocVien = await import(join(goc, 'src/handlers/hoc-vien.js'));
const lich = await import(join(goc, 'src/handlers/lich-lam-viec.js'));
const worker = (await import(join(goc, 'src/index.js'))).default;

let sqlite, db, D1;

function taoCSDL() {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SQL_KHOI_TAO);

  db = {
    async all(sql, p = []) { return sqlite.prepare(sql).all(...p); },
    async first(sql, p = []) { return sqlite.prepare(sql).get(...p) ?? null; },
    async run(sql, p = []) {
      const r = sqlite.prepare(sql).run(...p);
      return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    },
    async batch(ds) {
      for (const { sql, params = [] } of ds) sqlite.prepare(sql).run(...params);
    },
  };

  D1 = {
    prepare(sql) {
      let ps = [];
      const api = {
        bind(...p) { ps = p; return api; },
        async all() { return { results: sqlite.prepare(sql).all(...ps) }; },
        async first() { return sqlite.prepare(sql).get(...ps) ?? null; },
        async run() {
          const r = sqlite.prepare(sql).run(...ps);
          return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
        },
      };
      return api;
    },
    async batch(ds) { return ds; },
  };

  // Nạp dữ liệu nền: 1 chủ, 1 nhân viên, khu vực, tiến độ, 2 người dẫn dắt mẫu
  sqlite.exec(
    "INSERT INTO access_control (email, trang_thai, ten, la_chu) VALUES " +
    "('rise.shine1948@gmail.com','da_duyet','Chu',1), ('nhanvien@gmail.com','da_duyet','NV',0)"
  );
  const nay = Date.now();
  sqlite.prepare('INSERT INTO phien_dang_nhap (token, email, ten, tao_luc, het_han_luc) VALUES (?,?,?,?,?)')
    .run('SESS.chu', 'rise.shine1948@gmail.com', 'Chu', nay, nay + 999999999);
  sqlite.prepare('INSERT INTO phien_dang_nhap (token, email, ten, tao_luc, het_han_luc) VALUES (?,?,?,?,?)')
    .run('SESS.nv', 'nhanvien@gmail.com', 'NV', nay, nay + 999999999);

  for (const [i, kv] of ['Đ Uyên', 'K Thành', 'K Châu', 'K My'].entries()) {
    sqlite.prepare("INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('khu_vuc', ?, ?)").run(kv, i);
  }
  for (const [i, td] of ['B1', 'B2', 'BT', 'Tạm nghỉ'].entries()) {
    sqlite.prepare("INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('tien_do', ?, ?)").run(td, i);
  }
  for (const [i, ndd] of ['L H Đức', 'N T Huyền'].entries()) {
    sqlite.prepare("INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('nguoi_dan_dat', ?, ?)").run(ndd, i);
  }
}

let dat = 0, hong = 0;
function kiem(ten, dieuKien, chiTiet = '') {
  if (dieuKien) {
    dat++;
    console.log('  ✓', ten);
  } else {
    hong++;
    console.log('  ✗', ten, chiTiet ? '— ' + chiTiet : '');
  }
}

async function batLoi(fn) {
  try {
    await fn();
    return '';
  } catch (e) {
    return String((e && e.message) || e || '');
  }
}

async function goiHttp(fn, args, token, method = 'POST') {
  const env = { DB: D1, GOOGLE_CLIENT_ID: 'test' };
  const url = 'https://api.example/';
  const req = method === 'GET'
    ? new Request(url + '?fn=' + encodeURIComponent(fn) + '&args=' + encodeURIComponent(JSON.stringify(args)) + '&token=' + encodeURIComponent(token))
    : new Request(url, { method: 'POST', body: JSON.stringify({ fn, args, token }) });
  const res = await worker.fetch(req, env);
  return await res.json();
}

console.log('\n=== KIỂM THỬ QUẢN LÝ NGƯỜI DẪN DẮT (T-020, offline) ===\n');

// ---------------------------------------------------------------------
console.log('1) Đăng ký hàm, phân quyền chuThoi và Nhật ký thay đổi');
{
  taoCSDL();
  kiem('có hàm getDanhSachNguoiDanDat trong DANH_MUC', !!DANH_MUC.getDanhSachNguoiDanDat);
  kiem('có hàm addNguoiDanDat trong DANH_MUC', !!DANH_MUC.addNguoiDanDat);
  kiem('có hàm deleteNguoiDanDat trong DANH_MUC', !!DANH_MUC.deleteNguoiDanDat);

  kiem('getDanhSachNguoiDanDat chỉ cho chủ (chuThoi=true)', DANH_MUC.getDanhSachNguoiDanDat.chuThoi === true);
  kiem('addNguoiDanDat chỉ cho chủ (chuThoi=true)', DANH_MUC.addNguoiDanDat.chuThoi === true);
  kiem('deleteNguoiDanDat chỉ cho chủ (chuThoi=true)', DANH_MUC.deleteNguoiDanDat.chuThoi === true);

  kiem('getDanhSachNguoiDanDat là hàm ĐỌC (doc=true, laHamGhi=false)',
    DANH_MUC.getDanhSachNguoiDanDat.doc === true && laHamGhi(DANH_MUC.getDanhSachNguoiDanDat) === false);
  kiem('addNguoiDanDat là hàm GHI (doc=false, laHamGhi=true)',
    DANH_MUC.addNguoiDanDat.doc === false && laHamGhi(DANH_MUC.addNguoiDanDat) === true);
  kiem('deleteNguoiDanDat là hàm GHI (doc=false, laHamGhi=true)',
    DANH_MUC.deleteNguoiDanDat.doc === false && laHamGhi(DANH_MUC.deleteNguoiDanDat) === true);

  // Gọi qua HTTP với nhân viên thường (la_chu = 0) -> bị từ chối cả 3 hàm
  const rDocNV = await goiHttp('getDanhSachNguoiDanDat', [], 'SESS.nv', 'GET');
  kiem('nhân viên thường gọi getDanhSachNguoiDanDat bị chặn',
    /Chỉ tài khoản chủ/.test(rDocNV.error || ''), JSON.stringify(rDocNV));

  const rThemNV = await goiHttp('addNguoiDanDat', ['Người Mới'], 'SESS.nv');
  kiem('nhân viên thường gọi addNguoiDanDat bị chặn',
    /Chỉ tài khoản chủ/.test(rThemNV.error || ''), JSON.stringify(rThemNV));

  const rXoaNV = await goiHttp('deleteNguoiDanDat', ['L H Đức'], 'SESS.nv');
  kiem('nhân viên thường gọi deleteNguoiDanDat bị chặn',
    /Chỉ tài khoản chủ/.test(rXoaNV.error || ''), JSON.stringify(rXoaNV));

  // Tài khoản chủ gọi qua HTTP -> thành công và ghi đúng nhật ký
  const nkTruocDoc = sqlite.prepare('SELECT COUNT(*) c FROM nhat_ky_thay_doi').get().c;
  const rDocChu = await goiHttp('getDanhSachNguoiDanDat', [], 'SESS.chu', 'GET');
  const nkSauDoc = sqlite.prepare('SELECT COUNT(*) c FROM nhat_ky_thay_doi').get().c;
  kiem('chủ gọi getDanhSachNguoiDanDat thành công',
    Array.isArray(rDocChu.result) && rDocChu.result.length === 2, JSON.stringify(rDocChu));
  kiem('getDanhSachNguoiDanDat KHÔNG ghi vào nhat_ky_thay_doi', nkSauDoc === nkTruocDoc);

  const rThemChu = await goiHttp('addNguoiDanDat', ['P Văn Khoa'], 'SESS.chu');
  kiem('chủ gọi addNguoiDanDat thành công', rThemChu.result?.ok === true && rThemChu.result?.ten === 'P Văn Khoa');
  const dongNkThem = sqlite.prepare("SELECT * FROM nhat_ky_thay_doi WHERE ham = 'addNguoiDanDat' ORDER BY id DESC LIMIT 1").get();
  kiem('addNguoiDanDat tự động ghi nhật ký (loai=ghi, ket_qua=ok)',
    dongNkThem?.loai === 'ghi' && dongNkThem?.ket_qua === 'ok' && dongNkThem?.email === 'rise.shine1948@gmail.com');

  const rXoaChu = await goiHttp('deleteNguoiDanDat', ['P Văn Khoa'], 'SESS.chu');
  kiem('chủ gọi deleteNguoiDanDat thành công', rXoaChu.result?.ok === true && rXoaChu.result?.daXoa === 'P Văn Khoa');
  const dongNkXoa = sqlite.prepare("SELECT * FROM nhat_ky_thay_doi WHERE ham = 'deleteNguoiDanDat' ORDER BY id DESC LIMIT 1").get();
  kiem('deleteNguoiDanDat tự động ghi nhật ký (loai=ghi, ket_qua=ok)',
    dongNkXoa?.loai === 'ghi' && dongNkXoa?.ket_qua === 'ok');
}

// ---------------------------------------------------------------------
console.log('\n2) Đọc không ghi — getDanhSachNguoiDanDat không làm thay đổi bất kỳ bảng nào');
{
  taoCSDL();
  const chupBang = () => {
    const bang = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return JSON.stringify(bang.map((b) => ({
      ten: b.name,
      dong: sqlite.prepare(`SELECT * FROM ${b.name}`).all(),
    })));
  };
  const truoc = chupBang();
  const ds = await cauHinh.getDanhSachNguoiDanDat({ db });
  const sau = chupBang();
  kiem('getDanhSachNguoiDanDat trả đúng 2 người theo thu_tu',
    ds.length === 2 && ds[0].ten === 'L H Đức' && ds[1].ten === 'N T Huyền');
  kiem('toàn bộ CSDL trước và sau khi gọi getDanhSachNguoiDanDat giống hệt 100%', truoc === sau);
}

// ---------------------------------------------------------------------
console.log('\n3) Chuẩn hoá tên & Chặn dữ liệu không hợp lệ khi thêm');
{
  taoCSDL();

  // Khoảng trắng thừa đầu/cuối/giữa
  const kq1 = await cauHinh.addNguoiDanDat({ db }, '   Nguyễn    Văn   An   ');
  kiem('tự cắt khoảng trắng đầu/cuối và gộp khoảng trắng giữa',
    kq1.ten === 'Nguyễn Văn An', kq1.ten);
  kiem('thu_tu mới = max + 1 (0, 1 -> 2)', kq1.thuTu === 2, 'thuTu=' + kq1.thuTu);

  // Chuẩn hoá Unicode NFD -> NFC
  const tenNFD = 'Nguy\u0065\u0302\u0303n V\u0103n B\u00ecnh'.normalize('NFD');
  const tenNFC = tenNFD.normalize('NFC');
  kiem('dữ liệu thử nghiệm thật sự khác độ dài giữa NFD và NFC', tenNFD !== tenNFC && tenNFD.length > tenNFC.length);
  const kq2 = await cauHinh.addNguoiDanDat({ db }, tenNFD);
  kiem('tên NFD được chuẩn hoá về đúng NFC trước khi lưu',
    kq2.ten === tenNFC && kq2.ten.length === tenNFC.length);
  const dongDb = sqlite.prepare("SELECT gia_tri FROM config_list WHERE loai='nguoi_dan_dat' AND gia_tri=?").get(tenNFC);
  kiem('trong CSDL lưu đúng chuỗi NFC', dongDb?.gia_tri === tenNFC);

  // Xuất hiện ngay trong getDropdownOptions().nddList và thêm được học viên
  const dd = await cauHinh.getDropdownOptions({ db });
  kiem('getDropdownOptions().nddList có ngay 2 tên mới ở cuối',
    dd.nddList.includes('Nguyễn Văn An') && dd.nddList.includes('Nguyễn Văn Bình') && dd.nddList[3] === 'Nguyễn Văn Bình');

  const hvRes = await hocVien.addStudent({ db }, {
    ten: 'Học Viên Thử',
    ngay: '2026-10-27',
    diaChi: 'Q10',
    ndd1: 'Nguyễn Văn An',
    ndd2: 'Nguyễn Văn Bình',
    ndd3: '',
    to: 'K Châu',
    tienDo: 'B1',
    danhGia: 'Tốt',
  });
  kiem('dùng tên vừa thêm để lưu học viên mới thành công ngay', hvRes?.success === true, JSON.stringify(hvRes));

  // Chặn rỗng / khoảng trắng
  kiem('chặn tên rỗng ""', /Vui lòng nhập tên/.test(await batLoi(() => cauHinh.addNguoiDanDat({ db }, ''))));
  kiem('chặn tên toàn khoảng trắng', /Vui lòng nhập tên/.test(await batLoi(() => cauHinh.addNguoiDanDat({ db }, '     '))));
  kiem('chặn tên null', /Vui lòng nhập tên/.test(await batLoi(() => cauHinh.addNguoiDanDat({ db }, null))));

  // Chỉnh sửa bắt buộc #2: Cấm dấu phẩy và xuống dòng / tab
  const loiPhay = await batLoi(() => cauHinh.addNguoiDanDat({ db }, 'Nguyễn Văn A, Trần B'));
  kiem('chặn tên có dấu phẩy (vì lich_lam_viec tách bằng dấu phẩy)',
    /Tên không được chứa dấu phẩy/.test(loiPhay), loiPhay);
  const loiXuongDong = await batLoi(() => cauHinh.addNguoiDanDat({ db }, 'Nguyễn Văn\nAn'));
  kiem('chặn tên có ký tự xuống dòng \\n',
    /xuống dòng hoặc tab/.test(loiXuongDong), loiXuongDong);
  const loiTab = await batLoi(() => cauHinh.addNguoiDanDat({ db }, 'Nguyễn Văn\tAn'));
  kiem('chặn tên có ký tự tab \\t',
    /xuống dòng hoặc tab/.test(loiTab), loiTab);

  // Giới hạn độ dài <= 60 ký tự
  const ten60 = 'A'.repeat(60);
  const ten61 = 'A'.repeat(61);
  const kq60 = await cauHinh.addNguoiDanDat({ db }, ten60);
  kiem('tên đúng 60 ký tự được phép thêm', kq60.ten.length === 60);
  const loi61 = await batLoi(() => cauHinh.addNguoiDanDat({ db }, ten61));
  kiem('tên 61 ký tự bị chặn', /quá 60 ký tự/.test(loi61), loi61);
}

// ---------------------------------------------------------------------
console.log('\n4) Chặn trùng tên (hoa/thường, khoảng trắng, NFD/NFC) & Bấm đúp đồng thời');
{
  taoCSDL();
  await cauHinh.addNguoiDanDat({ db }, 'Nguyễn Văn An');

  // Gọi addNguoiDanDat lần 2 liên tiếp cùng tên
  const loiTrung1 = await batLoi(() => cauHinh.addNguoiDanDat({ db }, 'Nguyễn Văn An'));
  kiem('gọi addNguoiDanDat lần 2 cùng tên -> báo "đã có trong danh sách"',
    /đã có trong danh sách/.test(loiTrung1), loiTrung1);

  // Khác hoa/thường
  const loiTrung2 = await batLoi(() => cauHinh.addNguoiDanDat({ db }, 'nguyễn văn an'));
  kiem('trùng khác hoa/thường ("nguyễn văn an") -> bị chặn và nêu đúng tên gốc "Nguyễn Văn An"',
    loiTrung2.includes('"Nguyễn Văn An"') && /đã có trong danh sách/.test(loiTrung2), loiTrung2);

  // Khác khoảng trắng
  const loiTrung3 = await batLoi(() => cauHinh.addNguoiDanDat({ db }, '  NGUYỄN   VĂN   AN '));
  kiem('trùng khác khoảng trắng + hoa/thường -> bị chặn',
    /đã có trong danh sách/.test(loiTrung3), loiTrung3);

  // Khác dạng Unicode NFD vs NFC
  const loiTrung4 = await batLoi(() => cauHinh.addNguoiDanDat({ db }, 'Nguyễn Văn An'.normalize('NFD')));
  kiem('trùng dạng NFD so với NFC đã lưu -> bị chặn',
    /đã có trong danh sách/.test(loiTrung4), loiTrung4);

  const soDongAn = sqlite.prepare(
    "SELECT COUNT(*) c FROM config_list WHERE loai='nguoi_dan_dat' AND gia_tri='Nguyễn Văn An'"
  ).get().c;
  kiem('chỉ có đúng 1 dòng "Nguyễn Văn An" trong config_list', soDongAn === 1, 'thực tế: ' + soDongAn);

  // Mô phỏng race điều kiện UNIQUE ở tầng CSDL (2 request vượt qua bước SELECT cùng lúc)
  const dbGiaLapRace = {
    async all(sql, p = []) { return db.all(sql, p); },
    async run() {
      throw new Error('UNIQUE constraint failed: config_list.loai, config_list.gia_tri');
    },
  };
  const loiRace = await batLoi(() => cauHinh.addNguoiDanDat({ db: dbGiaLapRace }, 'Tên Chưa Có'));
  kiem('khi INSERT đụng UNIQUE do bấm đúp đồng thời -> đổi sang thông điệp thân thiện "đã có trong danh sách"',
    loiRace === 'Tên "Tên Chưa Có" đã có trong danh sách Người dẫn dắt.', loiRace);
}

// ---------------------------------------------------------------------
console.log('\n5) Đếm số lần đang dùng & Rào chặn xoá Phương án R1 (hoc_vien + lich_lam_viec)');
{
  taoCSDL();
  await cauHinh.addNguoiDanDat({ db }, 'Trần Minh Tâm');
  await cauHinh.addNguoiDanDat({ db }, 'Lê Thu Hà');
  await cauHinh.addNguoiDanDat({ db }, 'Phạm Quốc Bảo');

  // 5a) Đang dùng ở hoc_vien (ndd1, ndd2, ndd3)
  await hocVien.addStudent({ db }, {
    ten: 'HV 1', ngay: '2026-10-20', diaChi: 'Q1',
    ndd1: 'Trần Minh Tâm', ndd2: 'Lê Thu Hà', ndd3: '',
    to: 'Đ Uyên', tienDo: 'B1', danhGia: '',
  });
  await hocVien.addStudent({ db }, {
    ten: 'HV 2', ngay: '2026-10-21', diaChi: 'Q2',
    ndd1: 'L H Đức', ndd2: '', ndd3: 'Trần Minh Tâm',
    to: 'K Thành', tienDo: 'B2', danhGia: '',
  });
  // Trường hợp 1 học viên ghi trùng cùng 1 người ở cả ndd1 và ndd2 -> chỉ đếm là 1 học viên
  sqlite.prepare(
    "INSERT INTO hoc_vien (ten, ngay_chia_se_cuoi, dia_chi, ndd1, ndd2, ndd3, khu_vuc, tien_do) VALUES (?,?,?,?,?,?,?,?)"
  ).run('HV 3', '2026-10-22', 'Q3', 'Lê Thu Hà', 'Lê Thu Hà', '', 'K Châu', 'B1');

  // 5b) Đang dùng ở lich_lam_viec (nguoi_phu_trach và nguoi_tham_gia danh sách phẩy)
  await lich.addLichEvent({ db }, {
    ngay: '2026-10-27', gioBatDau: '09:00', gioKetThuc: '10:00',
    noiDung: 'Học nhóm', nguoiPhuTrach: 'Lê Thu Hà',
    nguoiThamGia: ['Trần Minh Tâm', 'N T Huyền'],
    khuVuc: 'Đ Uyên', diaDiem: 'P1', trangThai: 'Chưa diễn ra',
  });

  // 5c) Đang dùng ở lịch sử (nhat_ky_don_thuan, so_moc, giao_duc_thanh_vien) cho "Phạm Quốc Bảo"
  sqlite.prepare(
    "INSERT INTO nhat_ky_don_thuan (ngay, khu_vuc, don_thuan, ndd1, ndd2, ndd3) VALUES ('2026-10-15','K My',3,'Phạm Quốc Bảo','','')"
  ).run();
  sqlite.prepare(
    "INSERT INTO so_moc (moc, ngay, thang, ten, khu_vuc, ndd1, ndd2, ndd3, tao_luc) VALUES ('huu_hieu','2026-10-16','2026-10','HV Cũ','K My','Phạm Quốc Bảo','','',1000)"
  ).run();
  sqlite.prepare(
    "INSERT INTO giao_duc_thanh_vien (thang, khu_vuc, ten, tuan, edu_lms, tt127_ngay) VALUES ('2026-10','K My','Phạm Quốc Bảo',1,'Hoàn thành',50)"
  ).run();

  const ds = await cauHinh.getDanhSachNguoiDanDat({ db });
  const tam = ds.find((x) => x.ten === 'Trần Minh Tâm');
  const ha = ds.find((x) => x.ten === 'Lê Thu Hà');
  const bao = ds.find((x) => x.ten === 'Phạm Quốc Bảo');

  kiem('đếm đúng cho Trần Minh Tâm: 2 học viên (ndd1 + ndd3), 1 lịch làm việc (nguoi_tham_gia)',
    tam?.soHocVien === 2 && tam?.soLichLamViec === 1 && tam?.soDangDung === 3, JSON.stringify(tam));
  kiem('đếm đúng cho Lê Thu Hà: 2 học viên (HV 3 trùng 2 cột vẫn đếm 1), 1 lịch làm việc (nguoi_phu_trach)',
    ha?.soHocVien === 2 && ha?.soLichLamViec === 1 && ha?.soDangDung === 3, JSON.stringify(ha));
  kiem('đếm đúng cho Phạm Quốc Bảo: 0 học viên, 0 lịch (soDangDung=0), nhưng có 1 đơn thuần, 1 sổ mốc, 1 giáo dục',
    bao?.soHocVien === 0 && bao?.soLichLamViec === 0 && bao?.soDangDung === 0 &&
    bao?.soDonThuan === 1 && bao?.soSoMoc === 1 && bao?.soGiaoDuc === 1, JSON.stringify(bao));

  // Chặn xoá Trần Minh Tâm (vướng cả học viên lẫn lịch làm việc)
  const loiXoaTam = await batLoi(() => cauHinh.deleteNguoiDanDat({ db }, 'Trần Minh Tâm'));
  kiem('chặn xoá khi còn học viên và lịch làm việc, báo rõ số lượng',
    loiXoaTam.includes('2 học viên') && loiXoaTam.includes('1 lịch làm việc'), loiXoaTam);

  // Phương án R1: Phạm Quốc Bảo chỉ có ở lịch sử (nhat_ky_don_thuan, so_moc, giao_duc_thanh_vien) -> CHO PHÉP XOÁ
  const kqXoaBao = await cauHinh.deleteNguoiDanDat({ db }, 'Phạm Quốc Bảo');
  kiem('Phương án R1: cho phép xoá người chỉ còn trong lịch sử (không còn ở hoc_vien / lich_lam_viec)',
    kqXoaBao.ok === true && kqXoaBao.daXoa === 'Phạm Quốc Bảo');
  const conNkDt = sqlite.prepare("SELECT COUNT(*) c FROM nhat_ky_don_thuan WHERE ndd1='Phạm Quốc Bảo'").get().c;
  const conSoMoc = sqlite.prepare("SELECT COUNT(*) c FROM so_moc WHERE ndd1='Phạm Quốc Bảo'").get().c;
  kiem('xoá khỏi config_list KHÔNG làm mất dữ liệu lịch sử trong nhat_ky_don_thuan và so_moc',
    conNkDt === 1 && conSoMoc === 1);

  // Gỡ Trần Minh Tâm khỏi học viên và lịch làm việc -> xoá thành công
  sqlite.prepare("UPDATE hoc_vien SET ndd1='L H Đức' WHERE ndd1='Trần Minh Tâm'").run();
  sqlite.prepare("UPDATE hoc_vien SET ndd3='' WHERE ndd3='Trần Minh Tâm'").run();
  const loiConLich = await batLoi(() => cauHinh.deleteNguoiDanDat({ db }, 'Trần Minh Tâm'));
  kiem('gỡ hết học viên nhưng còn 1 lịch làm việc -> vẫn chặn xoá và chỉ báo "1 lịch làm việc"',
    loiConLich.includes('1 lịch làm việc') && !loiConLich.includes('học viên'), loiConLich);

  sqlite.prepare("UPDATE lich_lam_viec SET nguoi_tham_gia='N T Huyền'").run();
  const kqXoaTam = await cauHinh.deleteNguoiDanDat({ db }, 'Trần Minh Tâm');
  kiem('sau khi gỡ nốt khỏi lịch làm việc -> xoá Trần Minh Tâm thành công',
    kqXoaTam.ok === true && !kqXoaTam.danhSach.some((x) => x.ten === 'Trần Minh Tâm'));

  // Xoá lại tên không còn tồn tại -> báo lỗi thân thiện
  const loiKhongThay = await batLoi(() => cauHinh.deleteNguoiDanDat({ db }, 'Trần Minh Tâm'));
  kiem('xoá tên không tồn tại -> báo "Không tìm thấy"',
    /Không tìm thấy/.test(loiKhongThay), loiKhongThay);

  // Thêm học viên mới với tên vừa xoá -> bị từ chối
  const loiHvSauXoa = await batLoi(() => hocVien.addStudent({ db }, {
    ten: 'HV 4', ngay: '2026-10-25', diaChi: 'Q4',
    ndd1: 'Trần Minh Tâm', ndd2: '', ndd3: '',
    to: 'Đ Uyên', tienDo: 'B1', danhGia: '',
  }));
  kiem('sau khi xoá tên khỏi danh sách, thêm học viên mới với tên đó bị từ chối',
    /Người dẫn dắt .* không hợp lệ/.test(loiHvSauXoa), loiHvSauXoa);
}

// ---------------------------------------------------------------------
console.log('\n6) Chỉnh sửa bắt buộc #3: Dòng cũ trong CSDL lưu dạng Unicode NFD vẫn đếm và xoá đúng');
{
  taoCSDL();
  const tenGocNFD = 'Trần Thị Hồng'.normalize('NFD');
  const tenGoiNFC = 'Trần Thị Hồng'.normalize('NFC');
  sqlite.prepare("INSERT INTO config_list (loai, gia_tri, thu_tu) VALUES ('nguoi_dan_dat', ?, 99)").run(tenGocNFD);

  // Học viên lưu tên dạng NFC trong khi config_list lưu dạng NFD
  sqlite.prepare(
    "INSERT INTO hoc_vien (ten, ngay_chia_se_cuoi, dia_chi, ndd1, khu_vuc, tien_do) VALUES ('HV NFD','2026-10-27','Q1',?,'Đ Uyên','B1')"
  ).run(tenGoiNFC);

  const ds1 = await cauHinh.getDanhSachNguoiDanDat({ db });
  const mucHong = ds1.find((x) => x.ten === tenGocNFD);
  kiem('dòng config_list lưu NFD vẫn đếm được học viên lưu NFC (soHocVien = 1)',
    mucHong?.soHocVien === 1, JSON.stringify(mucHong));

  const loiChanNFD = await batLoi(() => cauHinh.deleteNguoiDanDat({ db }, tenGoiNFC));
  kiem('gọi deleteNguoiDanDat bằng chuỗi NFC vẫn tìm thấy dòng NFD và chặn xoá khi còn học viên',
    loiChanNFD.includes('1 học viên'), loiChanNFD);

  // Xoá học viên rồi gọi deleteNguoiDanDat bằng chuỗi NFC
  sqlite.prepare("DELETE FROM hoc_vien WHERE ten='HV NFD'").run();
  const kqXoaNFD = await cauHinh.deleteNguoiDanDat({ db }, tenGoiNFC);
  const conTrongDb = sqlite.prepare("SELECT COUNT(*) c FROM config_list WHERE loai='nguoi_dan_dat' AND gia_tri=?").get(tenGocNFD).c;
  kiem('gọi deleteNguoiDanDat bằng chuỗi NFC xoá sạch dòng NFD gốc trong config_list',
    kqXoaNFD.ok === true && conTrongDb === 0, 'conTrongDb=' + conTrongDb);
}

// ---------------------------------------------------------------------
console.log('\n7) Kiểm tra giao diện index.html nối đủ hàm và bảo vệ quyền Chủ');
{
  const html = readFileSync(join(goc, '..', 'index.html'), 'utf8');
  kiem('API_READ_FNS có khai báo getDanhSachNguoiDanDat',
    /API_READ_FNS\s*=\s*new Set\(\[[^\]]*'getDanhSachNguoiDanDat'/.test(html));
  kiem('panel-khuvuc có thẻ #nddManageCard, #nddNew_ten, #nddNew_btn, #nddManageBox',
    html.includes('id="nddManageCard"') &&
    html.includes('id="nddNew_ten"') &&
    html.includes('id="nddNew_btn"') &&
    html.includes('id="nddManageBox"'));
  kiem('capNhatNddToanTrang_ làm mới ngay cả nddList lẫn #nddDatalist',
    /function capNhatNddToanTrang_[\s\S]*?nddList\s*=[\s\S]*?fillDatalist\(dl,\s*nddList\)/.test(html));
  kiem('showUserBar_ đẩy người không phải Chủ ra khỏi panel-khuvuc và xoá nội dung #nddManageBox',
    /if\s*\(pKhuVuc\s*&&\s*pKhuVuc\.classList\.contains\('active'\)\)\s*showPanel\('stats'\)/.test(html));
}

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
process.exit(hong ? 1 : 0);
