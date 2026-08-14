// =====================================================================
// Gửi thông báo qua Telegram — dùng CHUNG cho nhiều tính năng (Lịch làm
// việc, Học viên, Báo cáo Thờ phượng...). Tách ra file riêng 14/08/2026 khi
// thêm Telegram cho Học viên + Báo cáo TP, để khỏi chép lại 3 lần.
//
// Đọc token từ biến môi trường env.TELEGRAM_BOT_TOKEN / env.TELEGRAM_CHAT_ID
// (xem CVTL-BAN-GIAO.md mục 5 — LUÔN để loại "Secret" trên Cloudflare).
// Nếu hai biến này chưa được cấu hình -> hàm tự lặng lẽ bỏ qua, TUYỆT ĐỐI
// không ném lỗi làm hỏng việc lưu dữ liệu chính (thêm/sửa học viên, lịch,
// báo cáo... phải luôn lưu được dù Telegram có trục trặc gì đi nữa).
// =====================================================================

/** Thay dấu <, >, & để tin nhắn HTML của Telegram không bị gãy định dạng. */
export function thoatHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function guiTelegram(env, noiDung) {
  const token = env && env.TELEGRAM_BOT_TOKEN;
  const chatId = env && env.TELEGRAM_CHAT_ID;
  // Chưa khai báo token/chat id -> im lặng bỏ qua, coi như không có gì xảy ra.
  if (!token || !chatId) return;

  await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: noiDung, parse_mode: 'HTML' }),
  });
}

/**
 * Gửi thông báo CHẠY NGẦM: không await, nên người dùng không phải chờ Telegram
 * mới thấy "Đã lưu" — phản hồi trả về ngay, việc gửi tin chạy song song sau đó.
 * Mọi lỗi đều bị nuốt để không ảnh hưởng việc lưu dữ liệu chính.
 *
 * `ctx` là ExecutionContext của Cloudflare (tham số thứ 3 của fetch(), xem
 * index.js). Việc "chạy ngầm sau khi đã trả lời" BẮT BUỘC phải đăng ký qua
 * ctx.waitUntil(...) thì Cloudflare mới giữ Worker sống đủ lâu để gửi xong —
 * không đăng ký thì Cloudflare có thể cắt ngang bất cứ lúc nào ngay sau khi
 * trả lời xong, tin nhắn gửi dở có thể không tới. Có ctx thì luôn dùng.
 */
export function guiTelegramNgam(ctx, env, noiDung) {
  try {
    const viec = guiTelegram(env, noiDung).catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(viec);
  } catch {
    // Kệ — thông báo hỏng thì thôi, dữ liệu chính vẫn phải được lưu.
  }
}
