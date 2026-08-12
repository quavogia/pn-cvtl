// =====================================================================
// Kiểm chứng lời hứa quan trọng nhất:
// DÙ HỎNG KIỂU GÌ, MÁY CHỦ CŨNG KHÔNG BAO GIỜ TRẢ VỀ HTML.
// Đây chính là các tình huống sinh ra lỗi
//   "Unexpected token '<', "<!DOCTYPE "... is not valid JSON"
// ở bản Google Apps Script.
// =====================================================================

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const goc = join(dirname(fileURLToPath(import.meta.url)), '..');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(join(goc, 'migrations/0001_init.sql'), 'utf8'));

// Giả lập đối tượng D1 của Cloudflare
const D1 = {
  prepare(sql) {
    let ps = [];
    const api = {
      bind(...p) { ps = p; return api; },
      async all() { return { results: sqlite.prepare(sql).all(...ps) }; },
      async first() { return sqlite.prepare(sql).get(...ps) ?? null; },
      async run() { return sqlite.prepare(sql).run(...ps); },
    };
    return api;
  },
  async batch(ds) { return ds; },
};

const worker = (await import(join(goc, 'src/index.js'))).default;
const env = { DB: D1, GOOGLE_CLIENT_ID: 'test' };

let dat = 0, hong = 0;
async function kiem(ten, req) {
  const res = await worker.fetch(req, env);
  const ct = res.headers.get('Content-Type') || '';
  const text = await res.text();
  const laJson = (() => { try { JSON.parse(text); return true; } catch { return false; } })();
  const ok = laJson && ct.includes('application/json') && !text.trim().startsWith('<');
  if (ok) { dat++; console.log('  ✓', ten, '→', text.slice(0, 80)); }
  else { hong++; console.log('  ✗', ten, '→', text.slice(0, 120)); }
}

const U = 'https://api.example/';
console.log('\n=== KIỂM THỬ GIAO THỨC: không bao giờ trả HTML ===\n');

await kiem('args hỏng (chính là ca gây lỗi cũ)', new Request(U + '?fn=getTPSummary&args={hong'));
await kiem('thiếu tên hàm', new Request(U));
await kiem('gọi hàm không tồn tại', new Request(U + '?fn=xyz&args=[]'));
await kiem('args không phải mảng', new Request(U + '?fn=getTPSummary&args={"a":1}'));
await kiem('chưa đăng nhập', new Request(U + '?fn=getTPSummary&args=["2026-08"]'));
await kiem('token bịa', new Request(U + '?fn=getTPSummary&args=["2026-08"]&token=SESS.giamao'));
await kiem('POST body hỏng', new Request(U, { method: 'POST', body: 'khong-phai-json' }));
await kiem('POST rỗng', new Request(U, { method: 'POST', body: '{}' }));
await kiem('phương thức lạ', new Request(U, { method: 'DELETE' }));
await kiem('đường dẫn sức khoẻ', new Request(U + 'suc-khoe'));

console.log(`\n=== KẾT QUẢ: ${dat} đạt, ${hong} hỏng ===\n`);
process.exit(hong ? 1 : 0);
