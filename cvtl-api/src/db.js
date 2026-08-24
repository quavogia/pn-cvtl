// =====================================================================
// Lớp truy cập CSDL.
// Cùng một bộ mã chạy được ở 2 nơi:
//   - Trên Cloudflare (D1)            -> bocD1(env.DB)
//   - Trên máy ảo để chạy thử offline -> bocSqliteCucBo(...)  [xem scripts/]
// Nhờ vậy em test kỹ trước rồi mới đưa lên mạng.
//
// ⭐ BỔ SUNG 24/08/2026 — TỰ THỬ LẠI KHI D1 TRỤC TRẶC NHẤT THỜI.
// Bối cảnh: sáng 24/08/2026 một thành viên không đăng nhập được, màn hình
// hiện đúng dòng đỏ "D1_ERROR: internal error; reference = rhe134pisfbr...".
// Điều tra: máy chủ sống, CSDL sạch, mọi hạn mức còn cách rất xa (12.8k/5tr
// dòng đọc, 19/100k dòng ghi, 471kB/5GB), Cloudflare không báo sự cố, và mã
// đăng nhập KHÔNG hề bị sửa trong lần đẩy trước đó. => Trục trặc nhất thời
// phía D1. Đây là loại lỗi chỉ cần thử lại sau vài trăm mili-giây là qua.
//
// ⚠️⚠️ CHỈ THỬ LẠI LỆNH **ĐỌC** (all/first), TUYỆT ĐỐI KHÔNG THỬ LẠI LỆNH
// **GHI** (run/batch). Lý do: khi một lệnh ghi báo lỗi, không có cách nào
// biết chắc nó đã kịp ghi hay chưa. Thử lại một lệnh INSERT có cột id tự
// tăng (nhat_ky_don_thuan, lich_lam_viec, dao_tao_viec_giao) sẽ sinh dòng
// TRÙNG — hỏng dữ liệu thật, tệ hơn hẳn việc báo lỗi cho người dùng bấm lại.
// Đọc thì thử lại bao nhiêu lần cũng vô hại.
// =====================================================================

/** Thử lại tối đa 2 lần (tổng cộng 3 lượt), chờ 150ms rồi 400ms. */
const CHO_MS = [150, 400];

/**
 * Có phải lỗi NHẤT THỜI của D1 không? Chỉ những lỗi này mới đáng thử lại.
 * Lỗi câu lệnh sai (no such table, syntax error...) thì thử lại vô ích —
 * cố ý KHÔNG bắt, để hỏng là biết ngay chứ không bị che mất.
 */
export function laLoiD1NhatThoi(loi) {
  const s = String((loi && loi.message) || loi || '');
  return /D1_ERROR|internal error|Network connection lost|storage caused object to be reset|Cannot resolve|reset because its code was updated/i.test(s);
}

/**
 * Đổi lỗi kỹ thuật khó hiểu thành câu tiếng Việt người thường đọc được.
 * Giữ lại mã tra cứu của Cloudflare (reference = ...) vì đó là thứ duy nhất
 * tra được đúng sự cố nếu sau này phải báo hỗ trợ.
 */
export function moTaLoiTiengViet(loi) {
  const s = String((loi && loi.message) || loi || 'Lỗi không xác định phía máy chủ.');
  if (!laLoiD1NhatThoi(s)) return s;
  const m = s.match(/reference\s*=\s*([a-z0-9]+)/i);
  return 'Máy chủ dữ liệu đang bận nhất thời. Xin bấm lại sau vài giây — '
    + 'dữ liệu KHÔNG bị mất gì cả.'
    + (m ? ' (mã tra cứu: ' + m[1] + ')' : '');
}

async function thuLaiNeuNhatThoi_(viec) {
  let loiCuoi;
  for (let lan = 0; lan <= CHO_MS.length; lan++) {
    try {
      return await viec();
    } catch (e) {
      loiCuoi = e;
      // Hết lượt, hoặc lỗi không thuộc loại nhất thời -> ném ra ngay.
      if (lan === CHO_MS.length || !laLoiD1NhatThoi(e)) break;
      await new Promise((r) => setTimeout(r, CHO_MS[lan]));
    }
  }
  throw loiCuoi;
}

export function bocD1(d1) {
  return {
    // ---- ĐỌC: có tự thử lại ----
    async all(sql, params = []) {
      const r = await thuLaiNeuNhatThoi_(() => d1.prepare(sql).bind(...params).all());
      return r.results || [];
    },
    async first(sql, params = []) {
      return await thuLaiNeuNhatThoi_(() => d1.prepare(sql).bind(...params).first());
    },
    // ---- GHI: KHÔNG tự thử lại (xem lời cảnh báo ở đầu file) ----
    async run(sql, params = []) {
      return await d1.prepare(sql).bind(...params).run();
    },
    async batch(danhSach) {
      return await d1.batch(danhSach.map(({ sql, params = [] }) => d1.prepare(sql).bind(...params)));
    },
  };
}
