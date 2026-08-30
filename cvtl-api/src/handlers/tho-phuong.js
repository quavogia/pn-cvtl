// =====================================================================
// Thờ phượng (TP) — bảng số liệu theo tuần + cơ chế Báo cáo T3/T7.
// =====================================================================

import { KHU_VUC_LIST, TP_NHOM_LIST, thangHopLe } from '../hang-so.js';
import { guiTelegramNgam, thoatHtml } from '../telegram.js';

/** "T3" -> "Thứ 3", "T7" -> "Thứ 7" — cho tin Telegram dễ đọc hơn mã viết tắt. */
const TEN_NHOM_TP = { T3: 'Thứ 3', T7: 'Thứ 7' };

/**
 * Danh sách Khu vực theo đúng thứ tự hiển thị.
 * Ưu tiên bảng cấu hình (config_list, loại 'khu_vuc') — đây là nơi Trưởng
 * phòng tự thêm/tách Khu vực mới qua trang "Quản lý khu vực"; nếu bảng cấu
 * hình chưa có gì thì dùng danh sách cứng trong hang-so.js để khỏi trống
 * trơn (giống hệt cách hoc-vien.js / muc-tieu-giao-duc.js đang làm — thêm
 * 19/08/2026, để trang "Nhập số liệu theo tuần" thấy được Khu vực mới tách).
 */
async function layDanhSachKhuVuc(db) {
  const rows = await db.all(
    "SELECT gia_tri FROM config_list WHERE loai = 'khu_vuc' ORDER BY thu_tu, id"
  );
  const ds = rows.map((r) => String(r.gia_tri || '').trim()).filter(Boolean);
  return ds.length ? ds : KHU_VUC_LIST.slice();
}

function thangTruoc(thang) {
  const [y, m] = thang.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

function dinhDangThoiGian(ms) {
  const d = new Date(ms + 7 * 3600 * 1000); // giờ Việt Nam
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// Số TP là số LŨY KẾ trong tháng — không thể tuần sau lại THẤP hơn tuần
// trước. Tuần nào chưa ai nhập tay (hoặc lỡ nhập thấp hơn tuần trước) thì
// HIỂN THỊ theo mức CAO NHẤT đã ghi nhận từ đầu tháng tới tuần đó, để không
// tuần nào bị "tụt" xuống 0/thấp hơn khi chưa kịp nhập số mới (thêm
// 18/08/2026, theo yêu cầu anh Rise). CHỈ áp dụng cho mảng "weeksHienThi"
// dùng để hiện ô nhập + biểu đồ — mảng "weeks" gốc GIỮ NGUYÊN y hệt số đã
// gõ tay từng tuần, vì còn dùng để so khớp "đã sửa sau báo cáo" (daSua ở
// dưới) và tính năng tự động điền từ Điểm danh — cả hai chỗ đó cần biết
// đúng ô nào THẬT SỰ có người gõ tay, không được nhầm với số đã cộng dồn.
function prefixMax_(arr) {
  const out = [];
  let m = 0;
  for (let i = 0; i < arr.length; i++) { m = Math.max(m, Number(arr[i]) || 0); out.push(m); }
  return out;
}

/** Toàn bộ số liệu TP của tất cả khu vực trong tháng. */
export async function getTPSummary({ db }, thang) {
  if (!thangHopLe(thang)) throw new Error('Tháng không hợp lệ.');
  const truoc = thangTruoc(thang);

  const [dsKV, soLieu, soLieuTruoc, baoCao] = await Promise.all([
    layDanhSachKhuVuc(db),
    db.all('SELECT khu_vuc, loai, tuan, so_luong FROM tp_tho_phuong WHERE thang = ?', [thang]),
    db.all('SELECT khu_vuc, loai, tuan, so_luong FROM tp_tho_phuong WHERE thang = ?', [truoc]),
    db.all('SELECT khu_vuc, tuan, nhom, thoi_gian, thoi_gian_ms, snap_1lan, snap_4lan FROM tp_bao_cao WHERE thang = ?', [thang]),
  ]);

  const lay = (ds, kv, loai) => {
    const weeks = [0, 0, 0, 0, 0];
    for (const r of ds) {
      if (r.khu_vuc === kv && r.loai === loai) {
        const i = Number(r.tuan) - 1;
        if (i >= 0 && i < 5) weeks[i] = Number(r.so_luong) || 0;
      }
    }
    return weeks;
  };
  // ⚠️ "Tổng" của TP KHÔNG phải cộng 5 tuần.
  // Số TP là số LŨY KẾ (tuần sau đã bao gồm tuần trước), nên tổng tháng chính
  // là con số LỚN NHẤT trong 5 tuần. Bản cũ (tpMetricFromMap_) làm đúng như
  // vậy, và giao diện cũng tự tính lại bằng Math.max — cộng dồn sẽ cho ra số
  // to gấp mấy lần thực tế.
  const tong = (w) => Math.max(0, ...w);

  return dsKV.map((kv) => {
    const one = lay(soLieu, kv, '1lan');
    const four = lay(soLieu, kv, '4lan');

    const bc = [];
    for (let tuan = 1; tuan <= 5; tuan++) {
      const muc = { T3: { label: '', edited: false }, T7: { label: '', edited: false } };
      for (const nhom of TP_NHOM_LIST) {
        const r = baoCao.find((x) => x.khu_vuc === kv && Number(x.tuan) === tuan && x.nhom === nhom);
        if (!r) continue;
        const daSua = one[tuan - 1] !== r.snap_1lan || four[tuan - 1] !== r.snap_4lan;
        muc[nhom] = { label: r.thoi_gian, edited: daSua };
      }
      // Đã báo cáo T7 thì bỏ cảnh báo "đã sửa" của T3 (T7 bao trùm T3).
      if (muc.T7.label) muc.T3.edited = false;
      bc.push(muc);
    }

    return {
      khuVuc: kv,
      oneLan: { weeks: one, weeksHienThi: prefixMax_(one), total: tong(one), prevMonthTotal: tong(lay(soLieuTruoc, kv, '1lan')) },
      fourLan: { weeks: four, weeksHienThi: prefixMax_(four), total: tong(four), prevMonthTotal: tong(lay(soLieuTruoc, kv, '4lan')) },
      baoCao: bc,
    };
  });
}

/**
 * ⚠️ 30/08/2026 — tham số `tuDong` đánh dấu ô này là do MÁY tự điền (gợi ý từ
 * Điểm danh) hay do CHÍNH TAY Trưởng phòng/nhân viên gõ. Cột `tu_dong` lưu lại
 * lâu dài trong CSDL (không như `window._tpAutoTrack_` cũ — chỉ sống trong bộ
 * nhớ 1 lần tải trang, mất ngay khi tải lại trang, nên KHÔNG đủ để tự sửa số
 * liệu cũ khi Điểm danh thay đổi sau đó — đây chính là gốc của lỗi K Đức
 * "≥4 lần" kẹt ở 6 dù Điểm danh mới đã lên 7). Ô nào `tu_dong=1` thì về sau
 * `dongBoTPTuDiemDanh` (diem-danh.js) được phép tự cập nhật lại; ô đã gõ tay
 * (`tu_dong=0`) thì mãi mãi không bị đụng tới nữa trừ khi tự tay gõ lại.
 */
export async function saveTPWeek({ db }, thang, khuVuc, loai, tuan, soLuong, tuDong) {
  if (!thangHopLe(thang)) throw new Error('Tháng không hợp lệ.');
  const kv = String(khuVuc || '').trim();
  const t = Number(tuan);
  if (!kv) throw new Error('Thiếu Khu vực.');
  if (!t || t < 1 || t > 5) throw new Error('Tuần không hợp lệ.');
  if (loai !== '1lan' && loai !== '4lan') throw new Error('Loại không hợp lệ.');
  const td = tuDong ? 1 : 0;

  await db.run(
    `INSERT INTO tp_tho_phuong (thang, khu_vuc, loai, tuan, so_luong, tu_dong) VALUES (?,?,?,?,?,?)
     ON CONFLICT (thang, khu_vuc, loai, tuan) DO UPDATE SET so_luong = excluded.so_luong, tu_dong = excluded.tu_dong`,
    [thang, kv, loai, t, Number(soLuong) || 0, td]
  );
  return { success: true };
}

/** Đánh dấu đã báo cáo cho một nhóm buổi (T3 hoặc T7) của một tuần. */
export async function saveTPBaoCao(ctx, thang, khuVuc, tuan, nhom) {
  const { db } = ctx;
  if (!thangHopLe(thang)) throw new Error('Tháng không hợp lệ.');
  const kv = String(khuVuc || '').trim();
  const t = Number(tuan);
  const n = String(nhom || '').trim();
  if (!kv) throw new Error('Thiếu Khu vực.');
  if (!t || t < 1 || t > 5) throw new Error('Tuần không hợp lệ.');
  if (!TP_NHOM_LIST.includes(n)) throw new Error('Nhóm báo cáo không hợp lệ.');

  // Lấy đúng số liệu ĐANG NẰM trong bảng "Nhập số liệu theo tuần" (Sheet TP) —
  // KHÔNG dùng lại số gợi ý tính từ Điểm danh (getDiemDanhTPGoiY), vì Trưởng
  // phòng có thể đã tự sửa tay khác đi. Trước bản sửa 14/08/2026, tin Telegram
  // + snapshot "đã sửa" dùng số gợi ý nên báo sai lệch với số thật hiển thị
  // trên màn hình (anh Rise phát hiện: ô Tuần hiện 9/3 nhưng tin báo 6/0).
  const rows = await db.all(
    'SELECT loai, so_luong FROM tp_tho_phuong WHERE thang = ? AND khu_vuc = ? AND tuan = ?',
    [thang, kv, t]
  );
  let soLieu1Lan = 0;
  let soLieu4Lan = 0;
  for (const r of rows) {
    if (r.loai === '1lan') soLieu1Lan = Number(r.so_luong) || 0;
    else if (r.loai === '4lan') soLieu4Lan = Number(r.so_luong) || 0;
  }

  const ms = Date.now();
  const label = dinhDangThoiGian(ms);

  await db.run(
    `INSERT INTO tp_bao_cao (thang, khu_vuc, tuan, nhom, thoi_gian, thoi_gian_ms, snap_1lan, snap_4lan)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT (thang, khu_vuc, tuan, nhom) DO UPDATE SET
       thoi_gian = excluded.thoi_gian,
       thoi_gian_ms = excluded.thoi_gian_ms,
       snap_1lan = excluded.snap_1lan,
       snap_4lan = excluded.snap_4lan`,
    [thang, kv, t, n, label, ms, soLieu1Lan, soLieu4Lan]
  );

  const tinNhan = [
    '📋 Đã BÁO CÁO Thờ phượng:',
    '',
    '🗺️ Khu vực: ' + thoatHtml(kv),
    '📅 Tuần: ' + t,
    '🕐 Nhóm: ' + thoatHtml(TEN_NHOM_TP[n] || n),
    '📊 Số liệu: ≥1 lần: ' + soLieu1Lan + ' · ≥4 lần: ' + soLieu4Lan,
    '⏰ Lúc: ' + label,
  ].join('\n');
  guiTelegramNgam(ctx.ctx, ctx.env, tinNhan);

  return { thoiGian: label };
}

/**
 * (Chỉ tài khoản chủ — chặn ở registry.js bằng `chuThoi: true`) Hủy trạng thái
 * "đã báo cáo" của một nhóm buổi (T3 hoặc T7) của một tuần — dùng khi bấm
 * Báo cáo nhầm hoặc số liệu sai, để báo cáo lại từ đầu (16/08/2026, theo yêu
 * cầu anh Rise). Chỉ xóa dòng đánh dấu trong `tp_bao_cao`, KHÔNG đụng tới số
 * liệu ≥1/≥4 lần đã nhập trong `tp_tho_phuong` — hủy xong bảng số liệu vẫn
 * còn nguyên, chỉ có cột "Báo cáo" quay về trạng thái "Chưa báo cáo" và các ô
 * Điểm danh liên quan được mở khóa lại cho nhân viên khác.
 */
export async function huyTPBaoCao({ db }, thang, khuVuc, tuan, nhom) {
  if (!thangHopLe(thang)) throw new Error('Tháng không hợp lệ.');
  const kv = String(khuVuc || '').trim();
  const t = Number(tuan);
  const n = String(nhom || '').trim();
  if (!kv) throw new Error('Thiếu Khu vực.');
  if (!t || t < 1 || t > 5) throw new Error('Tuần không hợp lệ.');
  if (!TP_NHOM_LIST.includes(n)) throw new Error('Nhóm báo cáo không hợp lệ.');

  await db.run(
    'DELETE FROM tp_bao_cao WHERE thang = ? AND khu_vuc = ? AND tuan = ? AND nhom = ?',
    [thang, kv, t, n]
  );
  return { success: true };
}
