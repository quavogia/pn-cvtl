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
// ⚠️⚠️ NGUYÊN TẮC AN TOÀN — đọc kỹ trước khi sửa gì ở đây:
//   · Lệnh **ĐỌC** (all/first): thử lại bao nhiêu lần cũng vô hại -> LUÔN thử lại.
//   · Lệnh **GHI** (run/batch): chỉ thử lại khi **chạy 2 lần cho kết quả Y HỆT
//     chạy 1 lần**. Khi một lệnh ghi báo lỗi, KHÔNG có cách nào biết chắc nó đã
//     kịp ghi hay chưa — nên thử lại một lệnh không "ghi đè" là tự sinh dữ liệu
//     trùng, hỏng dữ liệu thật, tệ hơn hẳn việc báo lỗi cho người dùng bấm lại.
//
// Bổ sung 24/08/2026 (lần 2), anh Rise: *"không cần [báo Telegram], có lỗi tự
// fix là được"*. Bản đầu chỉ tự thử lại lệnh ĐỌC nên lúc anh Rise gõ số rồi lưu
// mà D1 trục trặc thì vẫn hiện lỗi. Nay mở rộng sang lệnh GHI, nhưng CHỈ những
// lệnh đã CHỨNG MINH được là "ghi đè" (xem `laGhiAnToanThuLai`).
//
// ⚠️ Đã soát TOÀN BỘ lệnh ghi của dự án 24/08/2026. 6 chỗ KHÔNG được thử lại
// (bảng có cột id tự tăng hoặc thêm dòng mới): `phien_dang_nhap`, `config_list`,
// `lich_lam_viec`, `dao_tao_viec_giao`, `hoc_vien`, `nhat_ky_don_thuan`.
// Và 3 chỗ dùng biểu thức `CASE`/`replace()` trên chính cột đó (bai_da_hoc,
// da_phat_bieu) — thực tế chúng vẫn ăn-ý-lặp-lại, nhưng CỐ Ý không thử lại vì
// quá tinh vi để tin. **Không chắc thì KHÔNG thử lại.**
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

/**
 * Lệnh GHI này có "ghi đè" không — tức chạy 2 lần cho kết quả y hệt 1 lần?
 * CỐ Ý viết theo kiểu DANH SÁCH TRẮNG rất chặt: chỉ khớp đúng mấy dạng đã soát
 * tay và chứng minh được. Mọi thứ khác -> trả về false -> KHÔNG thử lại.
 * Thà bỏ sót một cơ hội tự sửa còn hơn ghi trùng một dòng dữ liệu.
 */
const GHI_AN_TOAN = [
  // Xoá: xoá rồi xoá nữa vẫn thế.
  /^DELETE\s+FROM\s+\w+/i,
  // INSERT OR IGNORE / OR REPLACE: bản chất là ghi đè.
  /^INSERT\s+OR\s+(IGNORE|REPLACE)\s+INTO\s+\w+/i,
  // UPDATE mà bên phải dấu = chỉ có tham số / số / chuỗi / NULL (không có hàm,
  // không nhắc lại tên cột) -> đặt giá trị cố định, ghi đè được.
  /^UPDATE\s+\S+\s+SET\s+(?:\w+\s*=\s*(?:\?|-?\d+(?:\.\d+)?|'[^']*'|NULL)\s*,\s*)*\w+\s*=\s*(?:\?|-?\d+(?:\.\d+)?|'[^']*'|NULL)\s+WHERE\s/i,
  // Upsert kiểu "ghi đè bằng giá trị vừa gửi lên" — dạng dùng nhiều nhất khi
  // nhập liệu (Điểm danh, Thờ phượng, Điểm danh công việc...).
  /ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET\s+(?:\w+\s*=\s*(?:excluded\.\w+|\?|-?\d+(?:\.\d+)?|'[^']*'|NULL)\s*,\s*)*\w+\s*=\s*(?:excluded\.\w+|\?|-?\d+(?:\.\d+)?|'[^']*'|NULL)\s*$/i,
];

export function laGhiAnToanThuLai(sql) {
  const s = String(sql || '').replace(/\s+/g, ' ').trim();
  return GHI_AN_TOAN.some((r) => r.test(s));
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
    // ---- GHI: chỉ tự thử lại khi lệnh đó "ghi đè" ----
    async run(sql, params = []) {
      const chay = () => d1.prepare(sql).bind(...params).run();
      return laGhiAnToanThuLai(sql) ? await thuLaiNeuNhatThoi_(chay) : await chay();
    },
    async batch(danhSach) {
      const chay = () =>
        d1.batch(danhSach.map(({ sql, params = [] }) => d1.prepare(sql).bind(...params)));
      // Cả gói chỉ được thử lại khi MỌI lệnh trong gói đều "ghi đè" — một lệnh
      // không an toàn là bỏ thử lại cả gói.
      const caGoiAnToan = danhSach.length > 0 && danhSach.every((x) => laGhiAnToanThuLai(x.sql));
      return caGoiAnToan ? await thuLaiNeuNhatThoi_(chay) : await chay();
    },
  };
}
