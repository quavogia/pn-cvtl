// =====================================================================
// Lớp giao thức — giữ NGUYÊN định dạng {fn, args, token} của bản cũ,
// nhờ vậy frontend chỉ cần đổi đúng 1 dòng địa chỉ máy chủ.
//
// NGUYÊN TẮC BẤT DI BẤT DỊCH: mọi phản hồi đều là JSON hợp lệ.
// Đây là thứ diệt tận gốc lỗi "Unexpected token '<', <!DOCTYPE ..."
// — vì lỗi đó sinh ra khi máy chủ trả về trang HTML thay vì JSON.
// =====================================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * Đọc yêu cầu từ cả GET lẫn POST về cùng một dạng {fn, args, token}.
 * Mọi lỗi phân tích dữ liệu đều được bắt và trả JSON, không bao giờ ném ra ngoài.
 */
export async function parseRequest(request) {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const fn = url.searchParams.get('fn') || '';
    const rawArgs = url.searchParams.get('args');
    let args = [];
    if (rawArgs) {
      try {
        args = JSON.parse(rawArgs);
      } catch {
        return { error: 'Tham số "args" không phải JSON hợp lệ.' };
      }
    }
    if (!Array.isArray(args)) return { error: 'Tham số "args" phải là một mảng.' };
    return { fn, args, token: url.searchParams.get('token') || '' };
  }

  if (request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return { error: 'Nội dung gửi lên không phải JSON hợp lệ.' };
    }
    if (!body || typeof body !== 'object') return { error: 'Nội dung gửi lên không hợp lệ.' };
    const args = body.args ?? [];
    if (!Array.isArray(args)) return { error: 'Tham số "args" phải là một mảng.' };
    return { fn: String(body.fn || ''), args, token: String(body.token || '') };
  }

  return { error: 'Phương thức không được hỗ trợ: ' + request.method };
}
