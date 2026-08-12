// =====================================================================
// Xác thực người dùng.
//
// Luồng:
//   1. Người dùng đăng nhập Google trên trình duyệt -> nhận JWT của Google.
//   2. Gửi JWT đó lên đây; máy chủ kiểm tra chữ ký thật của Google.
//   3. Nếu email đã được duyệt -> cấp "phiên đăng nhập" 30 ngày lưu trong CSDL.
//   4. Các lần gọi sau chỉ cần gửi mã phiên, không cần đăng nhập lại.
//
// Khác bản cũ: mã phiên nằm trong CSDL nên có thể thu hồi ngay lập tức
// (bản cũ dùng chữ ký tự sinh, không thu hồi được trước hạn).
// =====================================================================

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const PHIEN_HAN_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày

let jwksCache = { keys: null, hetHan: 0 };

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function layJwks() {
  const now = Date.now();
  if (jwksCache.keys && now < jwksCache.hetHan) return jwksCache.keys;
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error('Không lấy được khoá công khai của Google.');
  const data = await res.json();
  jwksCache = { keys: data.keys, hetHan: now + 60 * 60 * 1000 };
  return data.keys;
}

/** Kiểm tra JWT do Google cấp là thật và còn hạn. Trả về {email, ten}. */
export async function xacThucGoogleJwt(jwt, clientId) {
  const phan = String(jwt || '').split('.');
  if (phan.length !== 3) throw new Error('Mã đăng nhập không hợp lệ.');

  const header = b64urlToJson(phan[0]);
  const payload = b64urlToJson(phan[1]);

  const keys = await layJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Không tìm thấy khoá xác thực tương ứng.');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const dulieu = new TextEncoder().encode(phan[0] + '.' + phan[1]);
  const hopLe = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(phan[2]), dulieu);
  if (!hopLe) throw new Error('Chữ ký đăng nhập không hợp lệ.');

  const nay = Math.floor(Date.now() / 1000);
  if (payload.exp && nay > payload.exp) throw new Error('PHIEN_DANG_NHAP_HET_HAN');
  if (clientId && payload.aud !== clientId) throw new Error('Mã đăng nhập không dành cho ứng dụng này.');
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
    throw new Error('Nguồn phát hành mã đăng nhập không hợp lệ.');
  }
  if (payload.email_verified === false) throw new Error('EMAIL_CHUA_XAC_MINH');

  return { email: String(payload.email || '').toLowerCase(), ten: payload.name || '' };
}

/** Tạo phiên đăng nhập mới, trả về mã phiên. */
export async function taoPhien(db, email, ten) {
  const token = 'SESS.' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const nay = Date.now();
  await db.run(
    'INSERT INTO phien_dang_nhap (token, email, ten, tao_luc, het_han_luc) VALUES (?, ?, ?, ?, ?)',
    [token, email, ten, nay, nay + PHIEN_HAN_MS]
  );
  return token;
}

/**
 * Nhận diện người gọi từ token — chấp nhận cả mã phiên lẫn JWT Google.
 * Trả về {email, ten, laChu}. Ném lỗi nếu không hợp lệ / chưa được duyệt.
 */
export async function nhanDienNguoiGoi(db, token, clientId) {
  if (!token) throw new Error('CHUA_DANG_NHAP');

  let email, ten;

  if (token.startsWith('SESS.')) {
    const phien = await db.first('SELECT email, ten, het_han_luc FROM phien_dang_nhap WHERE token = ?', [token]);
    if (!phien) throw new Error('PHIEN_DANG_NHAP_HET_HAN');
    if (Date.now() > phien.het_han_luc) {
      await db.run('DELETE FROM phien_dang_nhap WHERE token = ?', [token]);
      throw new Error('PHIEN_DANG_NHAP_HET_HAN');
    }
    email = phien.email;
    ten = phien.ten;
  } else {
    const info = await xacThucGoogleJwt(token, clientId);
    email = info.email;
    ten = info.ten;
  }

  const quyen = await db.first('SELECT trang_thai, la_chu FROM access_control WHERE email = ?', [email]);
  if (!quyen || quyen.trang_thai !== 'da_duyet') throw new Error('CHUA_DUOC_CAP_QUYEN');

  return { email, ten, laChu: quyen.la_chu === 1 };
}
