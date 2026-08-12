// =====================================================================
// Lớp truy cập CSDL.
// Cùng một bộ mã chạy được ở 2 nơi:
//   - Trên Cloudflare (D1)            -> boc(env.DB)
//   - Trên máy ảo để chạy thử offline -> bocSqliteCucBo(...)  [xem scripts/]
// Nhờ vậy em test kỹ trước rồi mới đưa lên mạng.
// =====================================================================

export function bocD1(d1) {
  return {
    async all(sql, params = []) {
      const r = await d1.prepare(sql).bind(...params).all();
      return r.results || [];
    },
    async first(sql, params = []) {
      return await d1.prepare(sql).bind(...params).first();
    },
    async run(sql, params = []) {
      return await d1.prepare(sql).bind(...params).run();
    },
    async batch(danhSach) {
      return await d1.batch(danhSach.map(({ sql, params = [] }) => d1.prepare(sql).bind(...params)));
    },
  };
}
