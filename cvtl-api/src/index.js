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
import { bocD1 } from './db.js';
import { nhanDienNguoiGoi } from './auth.js';
import { DANH_MUC } from './registry.js';
import { CAU_LENH_TAO_BANG } from './schema-sql.js';

export default {
  async fetch(request, env) {
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
          return json({ error: e.message, authError: true });
        }
        if (muc.chuThoi && !nguoiGoi.laChu) {
          return json({ error: 'Chỉ tài khoản chủ mới được thực hiện thao tác này.' });
        }
      }

      const boiCanh = { db, env, nguoiGoi, token };
      const ketQua = await muc.fn(boiCanh, ...args);
      return json({ result: ketQua === undefined ? null : ketQua });
    } catch (e) {
      // Lưới an toàn cuối cùng — vẫn là JSON.
      return json({ error: (e && e.message) || 'Lỗi không xác định phía máy chủ.' });
    }
  },
};
