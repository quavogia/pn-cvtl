// =====================================================================
// TRỢ LÝ — biến số liệu đang có thành nhận định + việc cần làm.
// Thêm 24/08/2026 theo yêu cầu anh Rise: *"tạo ra 1 trợ lý để giúp báo cáo,
// quản lý, đề xuất phương án phát triển cho công việc tin lành mà vốn là các
// chỉ số đang hiển thị trên web"*.
//
// Anh Rise đã CHỐT (AskUserQuestion, 24/08/2026), làm cả 4 việc:
//   1. Tổng hợp báo cáo      2. Cảnh báo sớm
//   3. Đề xuất kế hoạch      4. So sánh giữa các khu vực
// Đặt thành MỘT TRANG trong web CVTL. Phần "đề xuất" tính THEO LUẬT (không
// dùng AI) — chạy ngay, miễn phí, và không bao giờ nói sai số.
//
// ⚠️⚠️ BA NGUYÊN TẮC BẤT DI BẤT DỊCH CỦA FILE NÀY:
//
//   1. KHÔNG TỰ TÍNH LẠI BẤT KỲ CON SỐ NÀO. Mọi số đều lấy từ chính các hàm
//      mà trang web đang dùng ("getAllKhuVucOverview", "getTPSummary",
//      "getStats", "getMembersDecreasedTP"). Nếu tự viết lại công thức thì
//      sớm muộn trang Trợ lý sẽ nói một đằng, trang Hiện trạng nói một nẻo —
//      lúc đó anh Rise không biết tin bên nào. Đây là lỗi ĐÃ TỪNG xảy ra
//      với công thức "≥1/≥4 lần" (xem CVTL-BAN-GIAO.md).
//
//   2. KHÔNG BỊA. Thiếu dữ liệu thì nói thẳng "chưa đủ dữ liệu", không đoán.
//      Mỗi cảnh báo/đề xuất đều kèm "soLieu" là những con số THẬT đã dẫn tới
//      kết luận đó, để anh Rise tự kiểm chứng được.
//
//   3. MỌI NGƯỠNG ĐỀU ĐẶT TÊN VÀ ĐỂ MỘT CHỖ (khối NGUONG bên dưới). Muốn
//      "khó tính" hơn hay "dễ" hơn thì sửa đúng một nơi.
//
// ⚠️⚠️ HAI ĐIỀU VỀ PHỄU, SAI LÀ ĐỌC SỐ RA NGHĨA NGƯỢC — bộ kiểm thử đã bắt
// được đúng chỗ này ngày 24/08/2026:
//
//   a) Trong hệ thống này **Hữu hiệu và Báp-têm là HAI NHÓM RIÊNG, không lồng
//      nhau**: "laHuuHieu" chỉ nhận B2..B16, còn người đã Báp-têm mang tiến độ
//      "BT" nên KHÔNG được đếm vào Hữu hiệu (xem demHuuHieuVaBT ở hoc-vien.js).
//      Vì vậy phép "Báp-têm / Hữu hiệu" KHÔNG phải tỉ lệ chuyển đổi — nó là tỉ
//      lệ giữa hai nhóm rời nhau, đọc lên sẽ hiểu sai hoàn toàn. Số đúng phải
//      là "Báp-têm / (Hữu hiệu + Báp-têm)" = trong những người đã đi tiếp,
//      bao nhiêu đã tới đích.
//
//   b) Đây vẫn là tỉ lệ TRONG CÙNG MỘT THÁNG, không phải theo dõi đúng nhóm
//      người đó đi qua từng khâu — người nghe tháng 7 có thể báp-têm tháng 9.
//      Nên chỉ dùng để SO SÁNH GIỮA CÁC KHU VỰC trong cùng tháng, đừng đọc
//      thành "cứ 10 người nghe thì 3 người báp-têm".
// =====================================================================

import { kiemTraThang, thangHopLe, thangTruoc, homNay, chuoi, soNguyen, soBuoi, laBT } from '../tien-ich.js';
import { getAllKhuVucOverview, getStats } from './hoc-vien.js';
import { getTPSummary } from './tho-phuong.js';
import { getMembersDecreasedTP } from './thong-ke-tp.js';

const TAM_NGHI = 'Tạm nghỉ';

/**
 * ⚠️ "kiemTraThang" dùng chung CHỈ kiểm ĐỊNH DẠNG yyyy-MM, không kiểm số tháng
 * có nằm trong 01..12 — nên "2026-13" vẫn lọt (đúng cái bẫy đã bắt được ở
 * cong-viec.js ngày 23/08/2026). Kiểm chặt thêm ở đây, cố ý KHÔNG sửa hàm dùng
 * chung để không ảnh hưởng các phần đang chạy ổn định.
 */
function kiemThangChat(thang) {
  const t = chuoi(thang);
  const so = Number(t.slice(5, 7));
  if (!thangHopLe(t) || !(so >= 1 && so <= 12)) {
    throw new Error('Tháng không hợp lệ: "' + t + '" (phải dạng yyyy-MM, tháng từ 01 đến 12).');
  }
  return kiemTraThang(t);
}

/** Tất cả ngưỡng phán đoán — sửa ở đây là đổi độ "khó tính" của trợ lý. */
const NGUONG = {
  TUT_MANH: 0.30,        // giảm ≥30% so tháng trước -> cảnh báo
  DA_QUA_THANG: 0.70,    // đã đi qua ≥70% số ngày trong tháng...
  MA_MOI_DAT: 0.60,      // ...mà mới đạt <60% mục tiêu -> sắp trễ
  DAT_TOT: 1.00,         // đạt ≥100% mục tiêu -> điểm sáng, đáng học hỏi
  GAN_DICH: 14,          // học viên từ B14 trở lên = sắp tới Báp-têm
  TON_DONG_NHIEU: 5,     // ≥5 người đang nghe mà tháng này 0 báp-têm -> nghẽn
};

const MUC_DO = { CAO: 'cao', VUA: 'vua', THAP: 'thap' };

/** Số ngày của một tháng "yyyy-MM". */
function soNgayTrongThang(thang) {
  const [y, m] = String(thang).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Đã đi qua bao nhiêu phần của tháng đang xem (0..1).
 * Tháng trong quá khứ -> 1 (đã hết). Tháng tương lai -> 0.
 */
function phanThangDaQua(thang, ngay) {
  const thangCuaNgay = chuoi(ngay).slice(0, 7);
  if (thangCuaNgay > thang) return 1;
  if (thangCuaNgay < thang) return 0;
  return Number(chuoi(ngay).slice(8, 10)) / soNgayTrongThang(thang);
}

/** Chênh lệch so tháng trước, kèm % (tháng trước = 0 thì không có %). */
function soSanh(nay, truoc) {
  const a = soNguyen(nay), b = soNguyen(truoc);
  return {
    nay: a,
    truoc: b,
    chenh: a - b,
    phanTramDoi: b > 0 ? Math.round(((a - b) / b) * 100) : null,
  };
}

/** Tỉ lệ a/b theo %, b = 0 thì trả null (KHÔNG trả 0 — "không có" khác "bằng 0"). */
function tyLe(a, b) {
  return soNguyen(b) > 0 ? Math.round((soNguyen(a) / soNguyen(b)) * 100) : null;
}

/**
 * Học viên "đang nghe" mà đã sắp tới đích (B14..B16), gom theo Khu vực.
 * ⚠️ Dùng ĐÚNG định nghĩa "đang nghe" của getStats (có Tiến độ, khác
 * "Tạm nghỉ", chưa Báp-têm) để hai nơi không bao giờ lệch nhau.
 */
async function nguoiGanDich(db) {
  const rows = await db.all(
    'SELECT khu_vuc, ten, tien_do FROM hoc_vien ' +
    "WHERE TRIM(COALESCE(ten,'')) <> '' AND TRIM(COALESCE(khu_vuc,'')) <> ''"
  );
  const theoKV = {};
  for (const r of rows) {
    const td = chuoi(r.tien_do);
    if (!td || td === TAM_NGHI || laBT(td)) continue;
    const n = soBuoi(td);
    if (n === null || n < NGUONG.GAN_DICH) continue;
    const kv = chuoi(r.khu_vuc);
    (theoKV[kv] = theoKV[kv] || []).push({ ten: chuoi(r.ten), tienDo: td });
  }
  // Ai gần đích nhất xếp trước.
  for (const kv of Object.keys(theoKV)) {
    theoKV[kv].sort((a, b) => (soBuoi(b.tienDo) || 0) - (soBuoi(a.tienDo) || 0));
  }
  return theoKV;
}

/**
 * Toàn bộ nội dung trang Trợ lý cho MỘT tháng.
 * "ngayHomNay" chỉ để bộ kiểm thử cố định được ngày — thực tế luôn để trống.
 */
export async function getTroLy({ db }, thang, ngayHomNay) {
  const t = kiemThangChat(thang);
  const truoc = thangTruoc(t);
  const ngay = chuoi(ngayHomNay) || homNay();
  const daQua = phanThangDaQua(t, ngay);

  const [overview, tpTong, dangNghe, giamTP, ganDich] = await Promise.all([
    getAllKhuVucOverview({ db }, t),
    getTPSummary({ db }, t),
    getStats({ db }),
    getMembersDecreasedTP({ db }, t),
    nguoiGanDich(db),
  ]);

  const dangNgheTheoKV = {};
  for (const r of dangNghe) if (r.to !== 'Tổng') dangNgheTheoKV[chuoi(r.to)] = soNguyen(r.dangNghe);
  const tpTheoKV = {};
  for (const r of tpTong) tpTheoKV[chuoi(r.khuVuc)] = r;
  const giamTheoKV = {};
  for (const r of (giamTP || [])) {
    const kv = chuoi(r.khuVuc || r.khu_vuc);
    (giamTheoKV[kv] = giamTheoKV[kv] || []).push(r);
  }

  // ---------- 1. Từng khu vực (dùng cho phần So sánh) ----------
  const khuVuc = overview.map((o) => {
    const a = o.goalSummary.actual, g = o.goalSummary.goal, p = o.goalSummary.percent;
    const at = o.prevGoalSummary.actual;
    const tp = tpTheoKV[o.khuVuc] || { oneLan: {}, fourLan: {} };
    return {
      khuVuc: o.khuVuc,
      thucTe: { donThuan: a.donThuan, huuHieu: a.huuHieu, bt: a.bt },
      mucTieu: { donThuan: g.donThuan, huuHieu: g.huuHieu, bt: g.bt },
      phanTramDat: { donThuan: p.donThuan, huuHieu: p.huuHieu, bt: p.bt },
      soVoiThangTruoc: {
        donThuan: soSanh(a.donThuan, at.donThuan),
        huuHieu: soSanh(a.huuHieu, at.huuHieu),
        bt: soSanh(a.bt, at.bt),
      },
      // Xem lời cảnh báo (a) và (b) ở đầu file trước khi đọc hai số này.
      // "Đi tiếp" = Hữu hiệu + Báp-têm, vì hai nhóm này RỜI NHAU.
      tyLeTrongThang: {
        diTiepTrenDonThuan: tyLe(a.huuHieu + a.bt, a.donThuan),
        btTrenDiTiep: tyLe(a.bt, a.huuHieu + a.bt),
      },
      dangNghe: dangNgheTheoKV[o.khuVuc] || 0,
      ganDich: (ganDich[o.khuVuc] || []).length,
      thoPhuong: {
        motLan: soSanh(tp.oneLan?.total, tp.oneLan?.prevMonthTotal),
        bonLan: soSanh(tp.fourLan?.total, tp.fourLan?.prevMonthTotal),
      },
      soNguoiGiamDiNhom: (giamTheoKV[o.khuVuc] || []).length,
    };
  });

  // ---------- 2. Bức tranh toàn phòng ----------
  const cong = (lay) => khuVuc.reduce((s, k) => s + soNguyen(lay(k)), 0);
  const tongQuan = {
    donThuan: soSanh(cong((k) => k.thucTe.donThuan), cong((k) => k.soVoiThangTruoc.donThuan.truoc)),
    huuHieu: soSanh(cong((k) => k.thucTe.huuHieu), cong((k) => k.soVoiThangTruoc.huuHieu.truoc)),
    bt: soSanh(cong((k) => k.thucTe.bt), cong((k) => k.soVoiThangTruoc.bt.truoc)),
    mucTieu: {
      donThuan: { dat: cong((k) => k.thucTe.donThuan), muc: cong((k) => k.mucTieu.donThuan) },
      huuHieu: { dat: cong((k) => k.thucTe.huuHieu), muc: cong((k) => k.mucTieu.huuHieu) },
      bt: { dat: cong((k) => k.thucTe.bt), muc: cong((k) => k.mucTieu.bt) },
    },
    thoPhuong: {
      motLan: soSanh(cong((k) => k.thoPhuong.motLan.nay), cong((k) => k.thoPhuong.motLan.truoc)),
      bonLan: soSanh(cong((k) => k.thoPhuong.bonLan.nay), cong((k) => k.thoPhuong.bonLan.truoc)),
    },
    dangNghe: cong((k) => k.dangNghe),
    ganDich: cong((k) => k.ganDich),
    soKhuVuc: khuVuc.length,
    phanTramThangDaQua: Math.round(daQua * 100),
  };
  for (const m of ['donThuan', 'huuHieu', 'bt']) {
    const x = tongQuan.mucTieu[m];
    x.phanTram = tyLe(x.dat, x.muc);
  }

  // ---------- 3. Cảnh báo sớm ----------
  const canhBao = [];
  const them = (mucDo, loai, kv, tieuDe, chiTiet, soLieu) =>
    canhBao.push({ mucDo, loai, khuVuc: kv, tieuDe, chiTiet, soLieu: soLieu || {} });

  const TEN_CHI_SO = { donThuan: 'Đơn thuần', huuHieu: 'Hữu hiệu', bt: 'Báp-têm' };

  for (const k of khuVuc) {
    const chuaNhap = k.thucTe.donThuan === 0 && k.thucTe.huuHieu === 0 && k.thucTe.bt === 0;

    // (a) Cả tháng chưa có số nào — thường là quên nhập, chứ không hẳn là không làm.
    if (chuaNhap && daQua >= NGUONG.DA_QUA_THANG) {
      them(MUC_DO.CAO, 'chua_co_so_lieu', k.khuVuc,
        k.khuVuc + ' chưa có số liệu nào trong tháng',
        'Đã qua ' + tongQuan.phanTramThangDaQua + '% tháng mà Đơn thuần / Hữu hiệu / Báp-têm đều bằng 0. '
        + 'Nhiều khả năng là chưa nhập chứ không phải chưa làm — nên hỏi lại khu vực trước khi kết luận.',
        { daQuaPhanTram: tongQuan.phanTramThangDaQua });
      continue;   // chưa có số thì mọi so sánh bên dưới đều vô nghĩa
    }

    // (a2) Có làm việc nhưng chưa ai trong khu vực đặt Mục tiêu cá nhân.
    // ⚠️ Mục tiêu khu vực TỰ CỘNG từ Mục tiêu cá nhân (đổi 01/08/2026), nên
    // khu vực không ai đặt mục tiêu thì mọi phép "đạt bao nhiêu %" đều vô
    // nghĩa. Phải nói thẳng ra, chứ hiện 0% là vu oan cho họ.
    const tongMucTieu = k.mucTieu.donThuan + k.mucTieu.huuHieu + k.mucTieu.bt;
    if (tongMucTieu === 0) {
      them(MUC_DO.VUA, 'chua_dat_muc_tieu', k.khuVuc,
        k.khuVuc + ' chưa ai đặt Mục tiêu cá nhân tháng này',
        'Mục tiêu khu vực được cộng từ Mục tiêu cá nhân của các thành viên. '
        + 'Chưa ai đặt thì không chấm được tiến độ của khu vực này.',
        { thucTe: k.thucTe });
    }

    // (b) Tụt mạnh so tháng trước.
    for (const m of ['donThuan', 'huuHieu', 'bt']) {
      const s = k.soVoiThangTruoc[m];
      if (s.truoc > 0 && s.phanTramDoi !== null && s.phanTramDoi <= -NGUONG.TUT_MANH * 100) {
        them(MUC_DO.VUA, 'tut_so_thang_truoc', k.khuVuc,
          k.khuVuc + ' — ' + TEN_CHI_SO[m] + ' giảm ' + Math.abs(s.phanTramDoi) + '% so tháng trước',
          'Tháng trước ' + s.truoc + ', tháng này ' + s.nay + '.',
          { chiSo: m, nay: s.nay, truoc: s.truoc, phanTramDoi: s.phanTramDoi });
      }
    }

    // (c) Mục tiêu sắp trễ: tháng đã đi quá xa mà còn cách đích quá nhiều.
    if (daQua >= NGUONG.DA_QUA_THANG) {
      for (const m of ['donThuan', 'huuHieu', 'bt']) {
        const muc = k.mucTieu[m], dat = k.thucTe[m];
        if (muc > 0 && dat / muc < NGUONG.MA_MOI_DAT) {
          them(MUC_DO.CAO, 'muc_tieu_sap_tre', k.khuVuc,
            k.khuVuc + ' — ' + TEN_CHI_SO[m] + ' mới đạt ' + dat + '/' + muc
            + ' (' + Math.round((dat / muc) * 100) + '%)',
            'Đã qua ' + tongQuan.phanTramThangDaQua + '% tháng. Còn thiếu ' + (muc - dat) + '.',
            { chiSo: m, dat, muc, conThieu: muc - dat, daQuaPhanTram: tongQuan.phanTramThangDaQua });
        }
      }
    }

    // (d) Nghẽn khâu cuối: nhiều người đang nghe nhưng tháng này chưa ai báp-têm.
    if (k.dangNghe >= NGUONG.TON_DONG_NHIEU && k.thucTe.bt === 0) {
      them(MUC_DO.VUA, 'nghen_khau_cuoi', k.khuVuc,
        k.khuVuc + ' — ' + k.dangNghe + ' người đang nghe nhưng tháng này chưa có Báp-têm nào',
        k.ganDich > 0
          ? 'Trong đó ' + k.ganDich + ' người đã ở mức B' + NGUONG.GAN_DICH + ' trở lên.'
          : 'Chưa ai tới mức B' + NGUONG.GAN_DICH + ' — khâu nghẽn nằm ở giữa chứ không phải ở cuối.',
        { dangNghe: k.dangNghe, ganDich: k.ganDich });
    }

    // (e) Thờ phượng đi xuống.
    const bl = k.thoPhuong.bonLan;
    if (bl.truoc > 0 && bl.chenh < 0) {
      them(MUC_DO.VUA, 'tho_phuong_giam', k.khuVuc,
        k.khuVuc + ' — Thờ phượng ≥4 lần giảm ' + Math.abs(bl.chenh) + ' người',
        'Tháng trước ' + bl.truoc + ', tháng này ' + bl.nay + '.'
        + (k.soNguoiGiamDiNhom > 0 ? ' Có ' + k.soNguoiGiamDiNhom + ' người đi ít hơn hẳn tháng trước.' : ''),
        { nay: bl.nay, truoc: bl.truoc, soNguoiGiam: k.soNguoiGiamDiNhom });
    }
  }

  // Nặng trước nhẹ sau.
  const thuTuMucDo = { cao: 0, vua: 1, thap: 2 };
  canhBao.sort((a, b) => thuTuMucDo[a.mucDo] - thuTuMucDo[b.mucDo]);

  // ---------- 4. Điểm sáng (để học hỏi, không phải để khen suông) ----------
  const diemSang = [];
  for (const k of khuVuc) {
    for (const m of ['donThuan', 'huuHieu', 'bt']) {
      const muc = k.mucTieu[m], dat = k.thucTe[m];
      if (muc > 0 && dat / muc >= NGUONG.DAT_TOT) {
        diemSang.push({
          khuVuc: k.khuVuc, chiSo: m, tenChiSo: TEN_CHI_SO[m],
          dat, muc, phanTram: Math.round((dat / muc) * 100),
        });
      }
    }
  }
  diemSang.sort((a, b) => b.phanTram - a.phanTram);

  // ---------- 5. Đề xuất việc cần làm ----------
  // Mỗi đề xuất phải: (1) chỉ đúng khu vực, (2) nói việc CỤ THỂ làm được ngay,
  // (3) dẫn ra con số đã dẫn tới đề xuất đó.
  const deXuat = [];
  const themDX = (uuTien, khuVuc, viec, viSao, soLieu) =>
    deXuat.push({ uuTien, khuVuc, viec, viSao, soLieu: soLieu || {} });

  for (const c of canhBao) {
    const k = khuVuc.find((x) => x.khuVuc === c.khuVuc);
    if (c.loai === 'chua_co_so_lieu') {
      themDX(1, c.khuVuc, 'Hỏi lại ' + c.khuVuc + ' xem đã nhập số liệu tháng này chưa',
        'Cả 3 chỉ số đều bằng 0 khi tháng đã đi qua ' + tongQuan.phanTramThangDaQua + '%.', c.soLieu);
    } else if (c.loai === 'chua_dat_muc_tieu') {
      themDX(2, c.khuVuc, 'Nhắc ' + c.khuVuc + ' đặt Mục tiêu cá nhân cho tháng này',
        'Chưa có mục tiêu thì trợ lý không chấm được khu vực này đang nhanh hay chậm.', c.soLieu);
    } else if (c.loai === 'muc_tieu_sap_tre' && c.soLieu.chiSo === 'bt') {
      const ds = (ganDich[c.khuVuc] || []).slice(0, 5);
      themDX(1, c.khuVuc,
        ds.length
          ? 'Ưu tiên ' + ds.length + ' người sắp tới đích ở ' + c.khuVuc + ': '
            + ds.map((x) => x.ten + ' (' + x.tienDo + ')').join(' · ')
          : 'Rà lại danh sách đang nghe của ' + c.khuVuc + ' — chưa ai tới mức B' + NGUONG.GAN_DICH,
        'Còn thiếu ' + c.soLieu.conThieu + ' Báp-têm và tháng đã đi qua '
          + tongQuan.phanTramThangDaQua + '%.',
        { conThieu: c.soLieu.conThieu, danhSach: ds });
    } else if (c.loai === 'muc_tieu_sap_tre') {
      themDX(2, c.khuVuc,
        'Bàn với ' + c.khuVuc + ' cách bù ' + c.soLieu.conThieu + ' ' + TEN_CHI_SO[c.soLieu.chiSo]
          + ' trong thời gian còn lại',
        'Mới đạt ' + c.soLieu.dat + '/' + c.soLieu.muc + ' khi tháng đã qua '
          + tongQuan.phanTramThangDaQua + '%.', c.soLieu);
    } else if (c.loai === 'nghen_khau_cuoi') {
      const ds = (ganDich[c.khuVuc] || []).slice(0, 5);
      themDX(2, c.khuVuc,
        ds.length
          ? 'Xem lại ' + ds.length + ' người sắp tới đích ở ' + c.khuVuc + ': '
            + ds.map((x) => x.ten + ' (' + x.tienDo + ')').join(' · ')
          : 'Xem khâu giữa của ' + c.khuVuc + ' — người đang nghe nhiều nhưng chưa ai tiến gần đích',
        c.soLieu.dangNghe + ' người đang nghe mà tháng này chưa có Báp-têm nào.',
        { dangNghe: c.soLieu.dangNghe, danhSach: ds });
    } else if (c.loai === 'tho_phuong_giam') {
      themDX(2, c.khuVuc,
        'Gọi lại những người đi ít hơn hẳn tháng trước ở ' + c.khuVuc
          + (c.soLieu.soNguoiGiam > 0 ? ' (' + c.soLieu.soNguoiGiam + ' người)' : ''),
        'Thờ phượng ≥4 lần giảm từ ' + c.soLieu.truoc + ' xuống ' + c.soLieu.nay + '.', c.soLieu);
    } else if (c.loai === 'tut_so_thang_truoc' && k) {
      themDX(3, c.khuVuc,
        'Hỏi ' + c.khuVuc + ' xem tháng này có gì khác thường không',
        TEN_CHI_SO[c.soLieu.chiSo] + ' giảm ' + Math.abs(c.soLieu.phanTramDoi)
          + '% (' + c.soLieu.truoc + ' → ' + c.soLieu.nay + ').', c.soLieu);
    }
  }

  // Có khu vực làm tốt hẳn thì đề xuất nhân rộng cách làm.
  if (diemSang.length && canhBao.length) {
    const top = diemSang[0];
    themDX(3, top.khuVuc,
      'Hỏi ' + top.khuVuc + ' về cách làm ' + top.tenChiSo + ' rồi chia sẻ lại cho khu vực đang chậm',
      top.khuVuc + ' đạt ' + top.dat + '/' + top.muc + ' (' + top.phanTram + '% mục tiêu).',
      { dat: top.dat, muc: top.muc, phanTram: top.phanTram });
  }

  deXuat.sort((a, b) => a.uuTien - b.uuTien);

  return {
    thang: t, thangTruoc: truoc, ngayTinh: ngay,
    tongQuan, khuVuc, canhBao, diemSang, deXuat,
    // Để giao diện nói rõ "chưa đủ dữ liệu" thay vì hiện bảng trống khó hiểu.
    coDuLieu: khuVuc.some((k) => k.thucTe.donThuan || k.thucTe.huuHieu || k.thucTe.bt),
  };
}
