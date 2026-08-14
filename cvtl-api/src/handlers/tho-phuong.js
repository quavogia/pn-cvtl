// =====================================================================
// Thờ phượng (TP) — bảng số liệu theo tuần + cơ chế Báo cáo T3/T7.
// =====================================================================

import { KHU_VUC_LIST, TP_NHOM_LIST, thangHopLe } from '../hang-so.js';
import { getDiemDanhTPGoiY } from './diem-danh.js';
import { guiTelegramNgam, thoatHtml } from '../telegram.js';

/** "T3" -> "Thứ 3", "T7" -> "Thứ 7" — cho tin Telegram dễ đọc hơn mã viết tắt. */
const TEN_NHOM_TP = { T3: 'Thứ 3', T7: 'Thứ 7' };

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

/** Toàn bộ số liệu TP của tất cả khu vực trong tháng. */
export async function getTPSummary({ db }, thang) {
  if (!thangHopLe(thang)) throw new Error('Tháng không hợp lệ.');
  const truoc = thangTruoc(thang);

  const [soLieu, soLieuTruoc, baoCao] = await Promise.all([
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

  return KHU_VUC_LIST.map((kv) => {
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
      oneLan: { weeks: one, total: tong(one), prevMonthTotal: tong(lay(soLieuTruoc, kv, '1lan')) },
      fourLan: { weeks: four, total: tong(four), prevMonthTotal: tong(lay(soLieuTruoc, kv, '4lan')) },
      baoCao: bc,
    };
  });
}

export async function saveTPWeek({ db }, thang, khuVuc, loai, tuan, soLuong) {
  if (!thangHopLe(thang)) throw new Error('Tháng không hợp lệ.');
  const kv = String(khuVuc || '').trim();
  const t = Number(tuan);
  if (!kv) throw new Error('Thiếu Khu vực.');
  if (!t || t < 1 || t > 5) throw new Error('Tuần không hợp lệ.');
  if (loai !== '1lan' && loai !== '4lan') throw new Error('Loại không hợp lệ.');

  await db.run(
    `INSERT INTO tp_tho_phuong (thang, khu_vuc, loai, tuan, so_luong) VALUES (?,?,?,?,?)
     ON CONFLICT (thang, khu_vuc, loai, tuan) DO UPDATE SET so_luong = excluded.so_luong`,
    [thang, kv, loai, t, Number(soLuong) || 0]
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

  // Chụp lại số liệu tại thời điểm báo cáo để sau này phát hiện "đã sửa".
  const goiY = await getDiemDanhTPGoiY(ctx, thang, kv);
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
    [thang, kv, t, n, label, ms, goiY.oneLan[t - 1] || 0, goiY.fourLan[t - 1] || 0]
  );

  const tinNhan = [
    '📋 Đã BÁO CÁO Thờ phượng:',
    '',
    '🗺️ Khu vực: ' + thoatHtml(kv),
    '📅 Tuần: ' + t,
    '🕐 Nhóm: ' + thoatHtml(TEN_NHOM_TP[n] || n),
    '📊 Số liệu: ≥1 lần: ' + (goiY.oneLan[t - 1] || 0) + ' · ≥4 lần: ' + (goiY.fourLan[t - 1] || 0),
    '⏰ Lúc: ' + label,
  ].join('\n');
  guiTelegramNgam(ctx.ctx, ctx.env, tinNhan);

  return { thoiGian: label };
}
