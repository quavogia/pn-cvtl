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

import { VI_TRI_KHU_VUC } from './nhat-ky.js';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const PHIEN_HAN_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày

// Mail chủ gốc — LUÔN được coi là Admin (la_chu=1) dù cột la_chu trong CSDL
// lỡ là 0/NULL vì lý do gì đó — tấm lưới an toàn cuối cùng để không bao giờ
// tự khoá mất quyền của chính chủ khi bắt đầu có nhiều Admin (mới 21/08/2026,
// theo yêu cầu anh Rise thêm nút cấp/gỡ quyền Admin). Dùng chung ở đây và ở
// handlers/truy-cap.js (getApprovedAccess/revokeAccess/revokeAdmin).
export const CHU_VINH_VIEN = 'rise.shine1948@gmail.com';

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

  // ⚠️ Cố ý dùng SELECT * chứ không liệt kê tên cột: cột pham_vi mới thêm
  // 26/08/2026 và chỉ có mặt SAU khi chạy GET /cai-dat. Nếu liệt kê tên cột
  // thì trong khoảng thời gian giữa lúc đẩy mã mới và lúc chạy /cai-dat,
  // câu lệnh sẽ báo "no such column" và CẢ PHÒNG KHÔNG ĐĂNG NHẬP ĐƯỢC.
  // Với SELECT * thì cột chưa có chỉ đơn giản là undefined -> phamVi = [].
  // Bảng này chỉ hơn chục dòng nên SELECT * không tốn kém gì.
  const quyen = await db.first('SELECT * FROM access_control WHERE email = ?', [email]);
  if (!quyen || quyen.trang_thai !== 'da_duyet') throw new Error('CHUA_DUOC_CAP_QUYEN');

  return {
    email,
    ten,
    laChu: quyen.la_chu === 1 || email === CHU_VINH_VIEN,
    phamVi: tachPhamVi(quyen.pham_vi),
  };
}

// =====================================================================
// PHẠM VI KHU VỰC  (thêm 26/08/2026 — bước 2 của CVTL-KE-HOACH-PHAN-QUYEN.md)
//
// Anh Rise: "khu vực nào chỉ nhìn được khu vực đó thôi, không nhìn khu vực
// khác được, địa vực trưởng thì có quyền nhìn toàn bộ địa vực mình".
//
// ⚠️ CỐ Ý KHÔNG tạo cột "vai_tro". Một khái niệm duy nhất — "phụ trách khu
// vực nào" — diễn đạt được cả khu vực trưởng (1 khu vực) lẫn địa vực trưởng
// (nhiều khu vực). Thêm địa vực mới, hay ai kiêm hai khu vực, chỉ cần tick
// thêm trên màn hình 🔑 Duyệt truy cập, KHÔNG phải sửa mã.
//
// ⚠️ Ở đợt này BA hàm dưới đây MỚI CHỈ ĐƯỢC KHAI BÁO, CHƯA NỐI VÀO HÀM NÀO
// CẢ — nên chưa ai bị chặn. Việc áp luật là bước 4, và phải chạy ở "chế độ
// bóng tối" 1 tuần trước khi bật thật. Lý do: chặn nhầm một hàm thì khu vực
// trưởng không nhập được số của CHÍNH MÌNH, tệ hơn nhiều so với rò rỉ.
// =====================================================================

/** 'Đ Uyên, K Thành' -> ['Đ Uyên','K Thành']. Rỗng/hỏng -> []. */
export function tachPhamVi(chuoi) {
  if (Array.isArray(chuoi)) {
    return chuoi.map((x) => String(x == null ? '' : x).trim()).filter(Boolean);
  }
  return String(chuoi == null ? '' : chuoi)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** ['A','B'] -> 'A,B'. Bỏ trùng, giữ nguyên thứ tự người dùng chọn. */
export function gopPhamVi(ds) {
  const ra = [];
  for (const x of tachPhamVi(ds)) if (!ra.includes(x)) ra.push(x);
  return ra.join(',');
}

/**
 * Danh sách khu vực người gọi ĐƯỢC XEM.
 *   - Chủ tài khoản / Admin  -> toàn bộ dsKhuVuc
 *   - Người khác             -> phần giao giữa phạm vi của họ và dsKhuVuc,
 *                               giữ đúng thứ tự của dsKhuVuc (để bảng hiển
 *                               thị không bị xáo trộn so với chỗ khác)
 * Chưa được gán phạm vi -> mảng RỖNG (không phải "thấy hết").
 */
export function phamViKhuVuc(nguoiGoi, dsKhuVuc) {
  const tatCa = Array.isArray(dsKhuVuc) ? dsKhuVuc.slice() : [];
  if (nguoiGoi && nguoiGoi.laChu) return tatCa;
  const cua = tachPhamVi(nguoiGoi && nguoiGoi.phamVi);
  if (!cua.length) return [];
  return tatCa.filter((k) => cua.includes(k));
}

/** Người gọi có được xem/sửa khu vực này không. */
export function duocXemKhuVuc(nguoiGoi, khuVuc) {
  if (nguoiGoi && nguoiGoi.laChu) return true;
  const k = String(khuVuc == null ? '' : khuVuc).trim();
  if (!k) return false;
  return tachPhamVi(nguoiGoi && nguoiGoi.phamVi).includes(k);
}

// =====================================================================
// CHẶN THEO KHU VỰC Ở TẦNG ROUTER  (bước 4 — thêm 26/08/2026)
//
// ⭐ Vì sao làm ở ROUTER chứ không sửa 29 hàm: bảng `VI_TRI_KHU_VUC` (làm ở
// đợt 1, trong src/nhat-ky.js) đã khai sẵn "khuVuc là tham số thứ mấy" của
// từng hàm. Router biết tên hàm + danh sách tham số, nên rút ra được khu vực
// mà KHÔNG phải đụng vào một dòng nào của các hàm nghiệp vụ.
// → Sửa 1 chỗ thay vì 29 chỗ, và không có chuyện "sót một hàm".
//
// ⚠️ Hệ quả: bảng VI_TRI_KHU_VUC nay KHÔNG CÒN chỉ dùng cho nhật ký nữa —
// nó là LUẬT PHÂN QUYỀN. Khai sai một vị trí = chặn nhầm người. Bộ kiểm thử
// kiem-thu-nhat-ky.mjs phần 6 đối chiếu bảng này với chữ ký hàm thật.
// =====================================================================

/**
 * Hàm có tham số khuVuc nhưng CỐ Ý KHÔNG chặn.
 * `getXepHang` nằm trong nhóm CÔNG KHAI — anh Rise chốt 25/08/2026:
 * "xếp hạng vẫn công khai toàn Si-ôn" (xếp hạng là để khích lệ nhau).
 */
export const MIEN_CHAN_KHU_VUC = ['getXepHang'];

/**
 * Lời gọi này có vi phạm phạm vi khu vực không?
 * Trả về:
 *   ''            -> không vi phạm, cho qua
 *   '<tên khu vực>' -> gọi vào khu vực NGOÀI phạm vi
 *   '(trống)'     -> hàm có tham số khuVuc nhưng gọi với giá trị rỗng, tức
 *                    đang hỏi TẤT CẢ khu vực. Đây là lỗ hổng còn lại, phải
 *                    xử bằng cách LỌC kết quả (bước 4b) chứ chặn thẳng thì
 *                    hỏng việc. Ghi vào nhật ký bóng tối để biết nó có thật
 *                    sự xảy ra không, và xảy ra ở hàm nào.
 */
export function khuVucBiChan(fn, args, nguoiGoi) {
  if (!nguoiGoi || nguoiGoi.laChu) return '';
  if (MIEN_CHAN_KHU_VUC.indexOf(fn) >= 0) return '';
  const i = VI_TRI_KHU_VUC[fn];
  if (i === undefined) return '';
  const v = (args || [])[i];
  const k = typeof v === 'string' ? v.trim() : '';
  if (!k) return '(trống)';
  return duocXemKhuVuc(nguoiGoi, k) ? '' : k;
}

/** Câu báo lỗi cho người dùng — phải dễ hiểu, KHÔNG dùng từ kỹ thuật. */
export function loiNgoaiPhamVi(khuVuc, nguoiGoi) {
  const cua = tachPhamVi(nguoiGoi && nguoiGoi.phamVi);
  if (!cua.length) {
    return 'Tài khoản của bạn chưa được gán khu vực phụ trách. '
      + 'Xin báo Trưởng phòng vào mục "Duyệt truy cập" để gán giúp.';
  }
  return 'Bạn không phụ trách khu vực "' + khuVuc + '". '
    + 'Bạn đang phụ trách: ' + cua.join(', ') + '.';
}
