// =====================================================================
// CVTL — Máy chủ API mới (Cloudflare Worker)
// Thay thế Google Apps Script Web App.
//
// Địa chỉ gọi:
//   GET  /?fn=<tên hàm>&args=<JSON mảng>&token=<mã>
//   POST /   body: {"fn": "...", "args": [...], "token": "..."}
//
// Bảo đảm: KHÔNG BAO GIỜ trả về HTML. Mọi tình huống — kể cả lỗi nội bộ —
// đều trả JSON. Đây là lý do lỗi "Unexpected token '<'" sẽ không tái diễn.
// =====================================================================

import { json, preflight, parseRequest } from './protocol.js';
import { bocD1, moTaLoiTiengViet } from './db.js';
import { nhanDienNguoiGoi } from './auth.js';
import { DANH_MUC } from './registry.js';
import { CAU_LENH_TAO_BANG } from './schema-sql.js';
import { guiTelegram, thoatHtml } from './telegram.js';
import { kiemTraSucKhoeDuLieu, soanTinBatThuong } from './handlers/kiem-tra-suc-khoe.js';

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method === 'OPTIONS') return preflight();

      const url = new URL(request.url);
      if (url.pathname === '/suc-khoe') {
        return json({ ok: true, thoiGian: new Date().toISOString() });
      }

      // Cài đặt CSDL lần đầu (chạy được nhiều lần, không hỏng dữ liệu cũ).
      // Cần đúng mã bí mật nên người ngoài không gọi được.
      if (url.pathname === '/cai-dat') {
        if (!env.MA_CAI_DAT || url.searchParams.get('ma') !== env.MA_CAI_DAT) {
          return json({ error: 'Sai mã cài đặt.' }, 403);
        }
        const loi = [];
        for (const sql of CAU_LENH_TAO_BANG) {
          try {
            await env.DB.prepare(sql).run();
          } catch (e) {
            loi.push({ sql: sql.slice(0, 70), loi: e.message });
          }
        }
        const bang = await env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).all();
        return json({
          ok: loi.length === 0,
          soBang: bang.results.length,
          danhSachBang: bang.results.map((r) => r.name),
          loi,
        });
      }

      // Duyệt 1-chạm 1 yêu cầu xin quyền truy cập — bấm từ đường link trong
      // tin Telegram gửi cho anh Rise (xem requestAccess trong truy-cap.js).
      // Dùng lại MA_CAI_DAT làm mã bí mật (khỏi phải cấu hình thêm 1 biến
      // môi trường mới trên Cloudflare) — bản Apps Script cũ có
      // ADMIN_APPROVE_SECRET riêng, nhưng ở đây tận dụng luôn mã đã có sẵn
      // cho gọn, vì mã này vốn đã là mã "toàn quyền" của hệ thống rồi.
      if (url.pathname === '/duyet-truy-cap') {
        const trang = (tieuDe, noiDung) =>
          new Response(
            '<html><body style="font-family:sans-serif;text-align:center;padding:48px">' +
              '<h2>' + tieuDe + '</h2><p style="font-size:18px">' + noiDung + '</p></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        if (!env.MA_CAI_DAT || url.searchParams.get('ma') !== env.MA_CAI_DAT) {
          return trang('❌ Liên kết không hợp lệ', 'Có thể liên kết đã bị sai hoặc hết hạn.');
        }
        const email = String(url.searchParams.get('email') || '').toLowerCase().trim();
        if (!email) return trang('❌ Thiếu email', 'Đường link không có email cần cấp quyền.');

        const db = bocD1(env.DB);
        const nayDuyet = new Date().toISOString();
        await db.run(
          `INSERT INTO access_control (email, trang_thai, ten, ngay_yeu_cau, ngay_duyet) VALUES (?, 'da_duyet', '', ?, ?)
           ON CONFLICT (email) DO UPDATE SET trang_thai = 'da_duyet', ngay_duyet = excluded.ngay_duyet`,
          [email, nayDuyet, nayDuyet]
        );
        return trang('✅ Đã cấp quyền truy cập', email + '<br><br>Có thể đóng trang này.');
      }

      // Chẩn đoán Telegram — gọi thẳng Telegram Bot API và trả nguyên văn câu
      // trả lời (KHÔNG bao giờ lộ TELEGRAM_BOT_TOKEN) để biết chính xác đang
      // kẹt ở đâu khi anh Rise báo "không thấy tin Telegram" (17/08/2026: 2
      // người xin quyền trước khi có tính năng báo mà tưởng nhầm là lỗi mới).
      // Dùng xong nên xoá route này hoặc để lại cũng an toàn, luôn cần đúng
      // MA_CAI_DAT mới gọi được.
      if (url.pathname === '/thu-telegram') {
        if (!env.MA_CAI_DAT || url.searchParams.get('ma') !== env.MA_CAI_DAT) {
          return json({ error: 'Sai mã cài đặt.' }, 403);
        }
        if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
          return json({
            ok: false,
            loi: 'CHUA_CAU_HINH',
            chiTiet: 'Thiếu biến TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID trên Cloudflare.',
            coBotToken: !!env.TELEGRAM_BOT_TOKEN,
            coChatId: !!env.TELEGRAM_CHAT_ID,
          });
        }
        try {
          const r = await fetch(
            'https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: env.TELEGRAM_CHAT_ID,
                text: '🧪 Tin THỬ NGHIỆM từ CVTL — nếu anh Rise thấy tin này thì Telegram đang hoạt động bình thường. (' + new Date().toISOString() + ')',
              }),
            }
          );
          const traVe = await r.json();
          return json({ daGoiTelegram: true, maTraVe: r.status, telegramTraVe: traVe });
        } catch (e) {
          return json({ daGoiTelegram: false, loi: e.message });
        }
      }

      // Kiểm tra sức khoẻ DỮ LIỆU thủ công (mới 20/08/2026) — dùng để tự tay
      // gọi thử phép kiểm tra dùng chung với việc chạy TỰ ĐỘNG mỗi đêm (xem
      // `scheduled` bên dưới cùng file này, và handlers/kiem-tra-suc-khoe.js
      // để biết phép kiểm tra là gì). Luôn cần đúng MA_CAI_DAT mới gọi được.
      // Có bất thường thì CŨNG gửi Telegram luôn (không chỉ trả JSON) — để
      // dùng route này cũng thử được luôn đường báo Telegram có hoạt động.
      if (url.pathname === '/kiem-tra-suc-khoe') {
        if (!env.MA_CAI_DAT || url.searchParams.get('ma') !== env.MA_CAI_DAT) {
          return json({ error: 'Sai mã cài đặt.' }, 403);
        }
        const db = bocD1(env.DB);
        const ketQua = await kiemTraSucKhoeDuLieu({ db });
        if (ketQua.batThuong.length > 0) {
          await guiTelegram(env, soanTinBatThuong(ketQua, thoatHtml));
        }
        return json({ result: ketQua });
      }

      // Nhập dữ liệu từ hệ thống cũ sang. Chỉ dùng lúc chuyển đổi.
      // Body: {"bang":"diem_danh","cot":["thang",...],"dong":[[...],[...]]}
      if (url.pathname === '/nhap-du-lieu') {
        if (!env.MA_CAI_DAT || url.searchParams.get('ma') !== env.MA_CAI_DAT) {
          return json({ error: 'Sai mã cài đặt.' }, 403);
        }
        let goi;
        try {
          goi = await request.json();
        } catch {
          return json({ error: 'Nội dung gửi lên không phải JSON hợp lệ.' });
        }
        const bang = String(goi.bang || '');
        const cot = Array.isArray(goi.cot) ? goi.cot : [];
        const dong = Array.isArray(goi.dong) ? goi.dong : [];
        if (!/^[a-z_]+$/.test(bang)) return json({ error: 'Tên bảng không hợp lệ.' });
        if (!cot.length || !cot.every((c) => /^[a-z_0-9]+$/.test(c))) {
          return json({ error: 'Danh sách cột không hợp lệ.' });
        }
        if (!dong.length) return json({ result: { daNhap: 0 } });

        const sql =
          'INSERT OR REPLACE INTO ' + bang + ' (' + cot.join(',') + ') VALUES (' +
          cot.map(() => '?').join(',') + ')';

        let daNhap = 0;
        const loi = [];
        // Chia lô để tránh vượt giới hạn một lần gửi.
        for (let i = 0; i < dong.length; i += 50) {
          const lo = dong.slice(i, i + 50);
          try {
            await env.DB.batch(lo.map((d) => env.DB.prepare(sql).bind(...d)));
            daNhap += lo.length;
          } catch (e) {
            loi.push({ tuDong: i, loi: e.message });
          }
        }
        return json({ result: { bang, daNhap, tongGui: dong.length, loi } });
      }

      const yeuCau = await parseRequest(request);
      if (yeuCau.error) return json({ error: yeuCau.error });

      const { fn, args, token } = yeuCau;
      if (!fn) return json({ error: 'Thiếu tên hàm cần gọi.' });

      const muc = DANH_MUC[fn];
      if (!muc) return json({ error: 'Không hỗ trợ hàm: ' + fn });

      const db = bocD1(env.DB);

      // Xác thực (trừ các hàm đăng nhập/xin quyền)
      let nguoiGoi = null;
      if (muc.canQuyen !== false) {
        try {
          nguoiGoi = await nhanDienNguoiGoi(db, token, env.GOOGLE_CLIENT_ID);
        } catch (e) {
          return json({ error: moTaLoiTiengViet(e), authError: true });
        }
        if (muc.chuThoi && !nguoiGoi.laChu) {
          return json({ error: 'Chỉ tài khoản chủ mới được thực hiện thao tác này.' });
        }
      }

      // `ctx` (ExecutionContext của Cloudflare) đi kèm để những việc "chạy
      // ngầm sau khi đã trả lời" (như gửi Telegram) có chỗ đăng ký qua
      // ctx.waitUntil — không có nó thì Cloudflare có thể cắt ngang việc
      // đang chạy ngay sau khi trả lời xong. Xem lich-lam-viec.js.
      const boiCanh = { db, env, ctx, nguoiGoi, token };
      const ketQua = await muc.fn(boiCanh, ...args);
      return json({ result: ketQua === undefined ? null : ketQua });
    } catch (e) {
      // Lưới an toàn cuối cùng — vẫn là JSON.
      // moTaLoiTiengViet: đổi dòng đỏ khó hiểu "D1_ERROR: internal error;
      // reference = ..." thành câu tiếng Việt, giữ lại mã tra cứu. Lỗi loại
      // khác giữ NGUYÊN văn để không che mất thông tin gỡ rối.
      return json({ error: moTaLoiTiengViet(e) });
    }
  },

  // Cloudflare Cron Trigger (mới 20/08/2026, xem [triggers] trong
  // wrangler.toml + handlers/kiem-tra-suc-khoe.js) — tự chạy mỗi đêm, KHÔNG
  // cần ai bấm gì, KHÔNG cần trình duyệt/phiên đăng nhập nào. Chạy đúng
  // ngay trên máy chủ nên không bị tường lửa/giới hạn mạng nào cản (khác
  // với việc máy ảo Claude không gọi thẳng được vào máy chủ này). Chỉ gửi
  // Telegram khi THẬT SỰ có bất thường — im lặng nếu mọi thứ bình thường,
  // để khỏi làm phiền anh Rise mỗi ngày.
  async scheduled(event, env, ctx) {
    const db = bocD1(env.DB);
    const ketQua = await kiemTraSucKhoeDuLieu({ db });
    if (ketQua.batThuong.length > 0) {
      await guiTelegram(env, soanTinBatThuong(ketQua, thoatHtml));
    }
  },
};
