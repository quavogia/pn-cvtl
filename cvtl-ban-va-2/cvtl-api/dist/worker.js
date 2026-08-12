// src/protocol.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });
}
function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}
async function parseRequest(request) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const fn = url.searchParams.get("fn") || "";
    const rawArgs = url.searchParams.get("args");
    let args = [];
    if (rawArgs) {
      try {
        args = JSON.parse(rawArgs);
      } catch {
        return { error: 'Tham s\u1ED1 "args" kh\xF4ng ph\u1EA3i JSON h\u1EE3p l\u1EC7.' };
      }
    }
    if (!Array.isArray(args)) return { error: 'Tham s\u1ED1 "args" ph\u1EA3i l\xE0 m\u1ED9t m\u1EA3ng.' };
    return { fn, args, token: url.searchParams.get("token") || "" };
  }
  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return { error: "N\u1ED9i dung g\u1EEDi l\xEAn kh\xF4ng ph\u1EA3i JSON h\u1EE3p l\u1EC7." };
    }
    if (!body || typeof body !== "object") return { error: "N\u1ED9i dung g\u1EEDi l\xEAn kh\xF4ng h\u1EE3p l\u1EC7." };
    const args = body.args ?? [];
    if (!Array.isArray(args)) return { error: 'Tham s\u1ED1 "args" ph\u1EA3i l\xE0 m\u1ED9t m\u1EA3ng.' };
    return { fn: String(body.fn || ""), args, token: String(body.token || "") };
  }
  return { error: "Ph\u01B0\u01A1ng th\u1EE9c kh\xF4ng \u0111\u01B0\u1EE3c h\u1ED7 tr\u1EE3: " + request.method };
}

// src/db.js
function bocD1(d1) {
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
    }
  };
}

// src/auth.js
var GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
var PHIEN_HAN_MS = 30 * 24 * 60 * 60 * 1e3;
var jwksCache = { keys: null, hetHan: 0 };
function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
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
  if (!res.ok) throw new Error("Kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c kho\xE1 c\xF4ng khai c\u1EE7a Google.");
  const data = await res.json();
  jwksCache = { keys: data.keys, hetHan: now + 60 * 60 * 1e3 };
  return data.keys;
}
async function xacThucGoogleJwt(jwt, clientId) {
  const phan = String(jwt || "").split(".");
  if (phan.length !== 3) throw new Error("M\xE3 \u0111\u0103ng nh\u1EADp kh\xF4ng h\u1EE3p l\u1EC7.");
  const header = b64urlToJson(phan[0]);
  const payload = b64urlToJson(phan[1]);
  const keys = await layJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Kh\xF4ng t\xECm th\u1EA5y kho\xE1 x\xE1c th\u1EF1c t\u01B0\u01A1ng \u1EE9ng.");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const dulieu = new TextEncoder().encode(phan[0] + "." + phan[1]);
  const hopLe = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(phan[2]), dulieu);
  if (!hopLe) throw new Error("Ch\u1EEF k\xFD \u0111\u0103ng nh\u1EADp kh\xF4ng h\u1EE3p l\u1EC7.");
  const nay = Math.floor(Date.now() / 1e3);
  if (payload.exp && nay > payload.exp) throw new Error("PHIEN_DANG_NHAP_HET_HAN");
  if (clientId && payload.aud !== clientId) throw new Error("M\xE3 \u0111\u0103ng nh\u1EADp kh\xF4ng d\xE0nh cho \u1EE9ng d\u1EE5ng n\xE0y.");
  if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") {
    throw new Error("Ngu\u1ED3n ph\xE1t h\xE0nh m\xE3 \u0111\u0103ng nh\u1EADp kh\xF4ng h\u1EE3p l\u1EC7.");
  }
  if (payload.email_verified === false) throw new Error("EMAIL_CHUA_XAC_MINH");
  return { email: String(payload.email || "").toLowerCase(), ten: payload.name || "" };
}
async function taoPhien(db, email, ten) {
  const token = "SESS." + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const nay = Date.now();
  await db.run(
    "INSERT INTO phien_dang_nhap (token, email, ten, tao_luc, het_han_luc) VALUES (?, ?, ?, ?, ?)",
    [token, email, ten, nay, nay + PHIEN_HAN_MS]
  );
  return token;
}
async function nhanDienNguoiGoi(db, token, clientId) {
  if (!token) throw new Error("CHUA_DANG_NHAP");
  let email, ten;
  if (token.startsWith("SESS.")) {
    const phien = await db.first("SELECT email, ten, het_han_luc FROM phien_dang_nhap WHERE token = ?", [token]);
    if (!phien) throw new Error("PHIEN_DANG_NHAP_HET_HAN");
    if (Date.now() > phien.het_han_luc) {
      await db.run("DELETE FROM phien_dang_nhap WHERE token = ?", [token]);
      throw new Error("PHIEN_DANG_NHAP_HET_HAN");
    }
    email = phien.email;
    ten = phien.ten;
  } else {
    const info = await xacThucGoogleJwt(token, clientId);
    email = info.email;
    ten = info.ten;
  }
  const quyen = await db.first("SELECT trang_thai, la_chu FROM access_control WHERE email = ?", [email]);
  if (!quyen || quyen.trang_thai !== "da_duyet") throw new Error("CHUA_DUOC_CAP_QUYEN");
  return { email, ten, laChu: quyen.la_chu === 1 };
}

// src/handlers/truy-cap.js
async function checkAccess({ db, env }, jwt) {
  let info;
  try {
    info = await xacThucGoogleJwt(jwt, env.GOOGLE_CLIENT_ID);
  } catch (e) {
    return { authorized: false, error: e.message };
  }
  const quyen = await db.first("SELECT trang_thai, ten FROM access_control WHERE email = ?", [info.email]);
  if (!quyen) {
    return { authorized: false, email: info.email, ten: info.ten, trangThai: "chua_dang_ky" };
  }
  if (quyen.trang_thai !== "da_duyet") {
    return { authorized: false, email: info.email, ten: info.ten, trangThai: quyen.trang_thai };
  }
  const token = await taoPhien(db, info.email, info.ten || quyen.ten || "");
  return { authorized: true, email: info.email, ten: info.ten, sessionToken: token };
}
async function requestAccess({ db, env }, jwt) {
  const info = await xacThucGoogleJwt(jwt, env.GOOGLE_CLIENT_ID);
  await db.run(
    `INSERT INTO access_control (email, trang_thai, ten, ngay_yeu_cau) VALUES (?, 'cho_duyet', ?, ?)
     ON CONFLICT (email) DO UPDATE SET ten = excluded.ten`,
    [info.email, info.ten || "", (/* @__PURE__ */ new Date()).toISOString()]
  );
  return { success: true, trangThai: "cho_duyet" };
}

// src/handlers/cau-hinh.js
async function getDropdownOptions({ db }) {
  const rows = await db.all("SELECT loai, gia_tri FROM config_list ORDER BY loai, thu_tu, id");
  const gom = (loai) => rows.filter((r) => r.loai === loai).map((r) => r.gia_tri);
  return {
    khuVuc: gom("khu_vuc"),
    tienDo: gom("tien_do"),
    nguoiDanDat: gom("nguoi_dan_dat")
  };
}

// src/hang-so.js
var KHU_VUC_LIST = ["\u0110 Uy\xEAn", "K Th\xE0nh", "K Tr\xE2m", "K My", "K Long", "K \u0110\u1EE9c", "S\u0110"];
var DD_BUOI_LIST = ["T3toi", "CNsang", "CNchieu", "CNtoi"];
var TP_NHOM_LIST = ["T3", "T7"];
var NHOM_DIEM_DANH = [
  { nhom: "K \u0110\u1EE9c", gioiTinh: "Nam", nhomTuoi: "Tr\xE1ng ni\xEAn", isTreEm: false },
  { nhom: "K Long", gioiTinh: "Nam", nhomTuoi: "Thanh ni\xEAn", isTreEm: false },
  { nhom: "S\u0110", gioiTinh: "Nam", nhomTuoi: "", isTreEm: false },
  { nhom: "\u0110 Uy\xEAn", gioiTinh: "N\u1EEF", nhomTuoi: "Ph\u1EE5 n\u1EEF", isTreEm: false },
  { nhom: "K Th\xE0nh", gioiTinh: "N\u1EEF", nhomTuoi: "Ph\u1EE5 n\u1EEF", isTreEm: false },
  { nhom: "K Tr\xE2m", gioiTinh: "N\u1EEF", nhomTuoi: "Thanh ni\xEAn", isTreEm: false },
  { nhom: "K My", gioiTinh: "N\u1EEF", nhomTuoi: "Thanh ni\xEAn", isTreEm: false },
  { nhom: "H\u1ECDc sinh Ti\u1EC3u h\u1ECDc", gioiTinh: "Nam", nhomTuoi: "Thi\u1EBFu nhi", isTreEm: true },
  { nhom: "Ti\u1EC3u h\u1ECDc", gioiTinh: "N\u1EEF", nhomTuoi: "Thi\u1EBFu nhi", isTreEm: true }
];
function nhomCuaBuoi(buoi) {
  return buoi === "T3toi" ? "T3" : "T7";
}
function thangHopLe(s) {
  return /^\d{4}-\d{2}$/.test(String(s || ""));
}

// src/handlers/diem-danh.js
async function getDiemDanhRoster({ db }, thang) {
  if (!thangHopLe(thang)) throw new Error("Th\xE1ng kh\xF4ng h\u1EE3p l\u1EC7.");
  const [roster, oCell] = await Promise.all([
    db.all("SELECT khu_vuc, ten, phu_huynh FROM diem_danh_roster ORDER BY khu_vuc, thu_tu, id"),
    db.all("SELECT khu_vuc, ten, tuan, buoi, gia_tri FROM diem_danh WHERE thang = ?", [thang])
  ]);
  const bang = /* @__PURE__ */ new Map();
  for (const c of oCell) {
    const k = c.khu_vuc + "|" + c.ten;
    if (!bang.has(k)) bang.set(k, {});
    const o = bang.get(k);
    if (!o[c.tuan]) o[c.tuan] = {};
    if (String(c.gia_tri || "").trim()) o[c.tuan][c.buoi] = c.gia_tri;
  }
  const theoKV = /* @__PURE__ */ new Map();
  for (const r of roster) {
    if (!theoKV.has(r.khu_vuc)) theoKV.set(r.khu_vuc, []);
    theoKV.get(r.khu_vuc).push(r);
  }
  return NHOM_DIEM_DANH.map((g) => ({
    nhom: g.nhom,
    gioiTinh: g.gioiTinh,
    nhomTuoi: g.nhomTuoi,
    isTreEm: g.isTreEm,
    thanhVien: (theoKV.get(g.nhom) || []).map((tv) => {
      const dd = bang.get(g.nhom + "|" + tv.ten) || {};
      let tongKet = 0;
      for (const tuan of Object.keys(dd)) tongKet += Object.keys(dd[tuan]).length;
      return { ten: tv.ten, phuHuynh: tv.phu_huynh || "", diemDanh: dd, tongKet };
    })
  }));
}
async function getDiemDanhTPGoiY({ db }, thang, khuVuc) {
  if (!thangHopLe(thang)) throw new Error("Th\xE1ng kh\xF4ng h\u1EE3p l\u1EC7.");
  const rows = await db.all(
    `SELECT tuan, ten, COUNT(*) AS soBuoi
       FROM diem_danh
      WHERE thang = ? AND khu_vuc = ? AND TRIM(gia_tri) <> ''
      GROUP BY tuan, ten`,
    [thang, String(khuVuc || "").trim()]
  );
  const oneLan = [0, 0, 0, 0, 0];
  const fourLan = [0, 0, 0, 0, 0];
  for (const r of rows) {
    const i = Number(r.tuan) - 1;
    if (i < 0 || i > 4) continue;
    if (r.soBuoi >= 1) oneLan[i]++;
    if (r.soBuoi >= 4) fourLan[i]++;
  }
  return { oneLan, fourLan };
}
async function saveDiemDanhCell({ db, nguoiGoi }, thang, khuVuc, ten, tuan, buoi, giaTri) {
  if (!thangHopLe(thang)) throw new Error("Th\xE1ng kh\xF4ng h\u1EE3p l\u1EC7.");
  const kv = String(khuVuc || "").trim();
  const tv = String(ten || "").trim();
  const t = Number(tuan);
  const b = String(buoi || "").trim();
  if (!kv) throw new Error("Thi\u1EBFu Khu v\u1EF1c.");
  if (!tv) throw new Error("Thi\u1EBFu T\xEAn.");
  if (!t || t < 1 || t > 5) throw new Error("Tu\u1EA7n kh\xF4ng h\u1EE3p l\u1EC7.");
  if (!DD_BUOI_LIST.includes(b)) throw new Error("Bu\u1ED5i kh\xF4ng h\u1EE3p l\u1EC7.");
  if (!nguoiGoi?.laChu) {
    const daBaoCao = await db.first(
      "SELECT 1 AS co FROM tp_bao_cao WHERE thang = ? AND khu_vuc = ? AND tuan = ? AND nhom = ?",
      [thang, kv, t, nhomCuaBuoi(b)]
    );
    if (daBaoCao) throw new Error("Tu\u1EA7n n\xE0y \u0111\xE3 b\xE1o c\xE1o \u2014 ch\u1EC9 t\xE0i kho\u1EA3n ch\u1EE7 m\u1EDBi \u0111\u01B0\u1EE3c s\u1EEDa.");
  }
  const gt = String(giaTri ?? "").trim();
  if (gt === "") {
    await db.run(
      "DELETE FROM diem_danh WHERE thang=? AND khu_vuc=? AND ten=? AND tuan=? AND buoi=?",
      [thang, kv, tv, t, b]
    );
  } else {
    await db.run(
      `INSERT INTO diem_danh (thang, khu_vuc, ten, tuan, buoi, gia_tri) VALUES (?,?,?,?,?,?)
       ON CONFLICT (thang, khu_vuc, ten, tuan, buoi) DO UPDATE SET gia_tri = excluded.gia_tri`,
      [thang, kv, tv, t, b, gt]
    );
  }
  return { success: true };
}
async function addDiemDanhTreEm({ db }, khuVuc, ten, phuHuynh) {
  const kv = String(khuVuc || "").trim();
  const tv = String(ten || "").trim();
  if (!kv) throw new Error("Thi\u1EBFu Khu v\u1EF1c.");
  if (!tv) throw new Error("Thi\u1EBFu T\xEAn.");
  const max = await db.first("SELECT COALESCE(MAX(thu_tu), 0) AS m FROM diem_danh_roster WHERE khu_vuc = ?", [kv]);
  await db.run(
    `INSERT INTO diem_danh_roster (khu_vuc, ten, phu_huynh, thu_tu) VALUES (?,?,?,?)
     ON CONFLICT (khu_vuc, ten) DO UPDATE SET phu_huynh = excluded.phu_huynh`,
    [kv, tv, String(phuHuynh || "").trim(), (max?.m || 0) + 1]
  );
  return { success: true };
}
async function deleteDiemDanhTreEm({ db }, khuVuc, ten) {
  const kv = String(khuVuc || "").trim();
  const tv = String(ten || "").trim();
  await db.run("DELETE FROM diem_danh_roster WHERE khu_vuc = ? AND ten = ?", [kv, tv]);
  return { success: true };
}
async function moveDiemDanhTreEm({ db }, khuVuc, ten, huong) {
  const kv = String(khuVuc || "").trim();
  const tv = String(ten || "").trim();
  const ds = await db.all("SELECT id, ten FROM diem_danh_roster WHERE khu_vuc = ? ORDER BY thu_tu, id", [kv]);
  const i = ds.findIndex((x) => x.ten === tv);
  if (i < 0) throw new Error("Kh\xF4ng t\xECm th\u1EA5y th\xE0nh vi\xEAn.");
  const j = i + (Number(huong) < 0 ? -1 : 1);
  if (j < 0 || j >= ds.length) return { success: true };
  [ds[i], ds[j]] = [ds[j], ds[i]];
  await db.batch(
    ds.map((x, k) => ({ sql: "UPDATE diem_danh_roster SET thu_tu = ? WHERE id = ?", params: [k + 1, x.id] }))
  );
  return { success: true };
}
async function getDiemDanhGhiChuAll({ db }) {
  const rows = await db.all("SELECT khu_vuc, ten, ma_cap_do, ghi_chu FROM diem_danh_ghi_chu");
  const out = {};
  for (const r of rows) {
    out[r.khu_vuc + "|" + r.ten] = { maCapDo: r.ma_cap_do || "", ghiChu: r.ghi_chu || "" };
  }
  return out;
}
async function saveDiemDanhGhiChu({ db }, khuVuc, ten, maCapDo, ghiChu) {
  const kv = String(khuVuc || "").trim();
  const tv = String(ten || "").trim();
  if (!kv || !tv) throw new Error("Thi\u1EBFu Khu v\u1EF1c ho\u1EB7c T\xEAn.");
  await db.run(
    `INSERT INTO diem_danh_ghi_chu (khu_vuc, ten, ma_cap_do, ghi_chu, ngay_cap_nhat) VALUES (?,?,?,?,?)
     ON CONFLICT (khu_vuc, ten) DO UPDATE SET
       ma_cap_do = excluded.ma_cap_do,
       ghi_chu = excluded.ghi_chu,
       ngay_cap_nhat = excluded.ngay_cap_nhat`,
    [kv, tv, String(maCapDo || "").trim(), String(ghiChu || "").trim(), (/* @__PURE__ */ new Date()).toISOString()]
  );
  return { success: true };
}

// src/handlers/tho-phuong.js
function thangTruoc(thang) {
  const [y, m] = thang.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}
function dinhDangThoiGian(ms) {
  const d = new Date(ms + 7 * 3600 * 1e3);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
async function getTPSummary({ db }, thang) {
  if (!thangHopLe(thang)) throw new Error("Th\xE1ng kh\xF4ng h\u1EE3p l\u1EC7.");
  const truoc = thangTruoc(thang);
  const [soLieu, soLieuTruoc, baoCao] = await Promise.all([
    db.all("SELECT khu_vuc, loai, tuan, so_luong FROM tp_tho_phuong WHERE thang = ?", [thang]),
    db.all("SELECT khu_vuc, loai, tuan, so_luong FROM tp_tho_phuong WHERE thang = ?", [truoc]),
    db.all("SELECT khu_vuc, tuan, nhom, thoi_gian, thoi_gian_ms, snap_1lan, snap_4lan FROM tp_bao_cao WHERE thang = ?", [thang])
  ]);
  const lay = (ds, kv, loai) => {
    const weeks = [0, 0, 0, 0, 0];
    for (const r of ds) {
      if (r.khu_vuc === kv && r.loai === loai) {
        const i = Number(r.tuan) - 1;
        if (i >= 0 && i < 5) weeks[i] = Number(r.so_luong) || 0;
      }
    }
    return weeks;
  };
  const tong = (w) => w.reduce((a, b) => a + b, 0);
  return KHU_VUC_LIST.map((kv) => {
    const one = lay(soLieu, kv, "1lan");
    const four = lay(soLieu, kv, "4lan");
    const bc = [];
    for (let tuan = 1; tuan <= 5; tuan++) {
      const muc = { T3: { label: "", edited: false }, T7: { label: "", edited: false } };
      for (const nhom of TP_NHOM_LIST) {
        const r = baoCao.find((x) => x.khu_vuc === kv && Number(x.tuan) === tuan && x.nhom === nhom);
        if (!r) continue;
        const daSua = one[tuan - 1] !== r.snap_1lan || four[tuan - 1] !== r.snap_4lan;
        muc[nhom] = { label: r.thoi_gian, edited: daSua };
      }
      if (muc.T7.label) muc.T3.edited = false;
      bc.push(muc);
    }
    return {
      khuVuc: kv,
      oneLan: { weeks: one, total: tong(one), prevMonthTotal: tong(lay(soLieuTruoc, kv, "1lan")) },
      fourLan: { weeks: four, total: tong(four), prevMonthTotal: tong(lay(soLieuTruoc, kv, "4lan")) },
      baoCao: bc
    };
  });
}
async function saveTPWeek({ db }, thang, khuVuc, loai, tuan, soLuong) {
  if (!thangHopLe(thang)) throw new Error("Th\xE1ng kh\xF4ng h\u1EE3p l\u1EC7.");
  const kv = String(khuVuc || "").trim();
  const t = Number(tuan);
  if (!kv) throw new Error("Thi\u1EBFu Khu v\u1EF1c.");
  if (!t || t < 1 || t > 5) throw new Error("Tu\u1EA7n kh\xF4ng h\u1EE3p l\u1EC7.");
  if (loai !== "1lan" && loai !== "4lan") throw new Error("Lo\u1EA1i kh\xF4ng h\u1EE3p l\u1EC7.");
  await db.run(
    `INSERT INTO tp_tho_phuong (thang, khu_vuc, loai, tuan, so_luong) VALUES (?,?,?,?,?)
     ON CONFLICT (thang, khu_vuc, loai, tuan) DO UPDATE SET so_luong = excluded.so_luong`,
    [thang, kv, loai, t, Number(soLuong) || 0]
  );
  return { success: true };
}
async function saveTPBaoCao(ctx, thang, khuVuc, tuan, nhom) {
  const { db } = ctx;
  if (!thangHopLe(thang)) throw new Error("Th\xE1ng kh\xF4ng h\u1EE3p l\u1EC7.");
  const kv = String(khuVuc || "").trim();
  const t = Number(tuan);
  const n = String(nhom || "").trim();
  if (!kv) throw new Error("Thi\u1EBFu Khu v\u1EF1c.");
  if (!t || t < 1 || t > 5) throw new Error("Tu\u1EA7n kh\xF4ng h\u1EE3p l\u1EC7.");
  if (!TP_NHOM_LIST.includes(n)) throw new Error("Nh\xF3m b\xE1o c\xE1o kh\xF4ng h\u1EE3p l\u1EC7.");
  const goiY = await getDiemDanhTPGoiY(ctx, thang, kv);
  const ms = Date.now();
  const label = dinhDangThoiGian(ms);
  await db.run(
    `INSERT INTO tp_bao_cao (thang, khu_vuc, tuan, nhom, thoi_gian, thoi_gian_ms, snap_1lan, snap_4lan)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT (thang, khu_vuc, tuan, nhom) DO UPDATE SET
       thoi_gian = excluded.thoi_gian,
       thoi_gian_ms = excluded.thoi_gian_ms,
       snap_1lan = excluded.snap_1lan,
       snap_4lan = excluded.snap_4lan`,
    [thang, kv, t, n, label, ms, goiY.oneLan[t - 1] || 0, goiY.fourLan[t - 1] || 0]
  );
  return { thoiGian: label };
}

// src/registry.js
var DANH_MUC = {
  // --- Đăng nhập / phân quyền (không yêu cầu đã duyệt) ---
  checkAccess: { doc: true, canQuyen: false, fn: checkAccess },
  requestAccess: { doc: false, canQuyen: false, fn: requestAccess },
  // --- Cấu hình dùng chung ---
  getDropdownOptions: { doc: true, fn: getDropdownOptions },
  // --- Điểm danh ---
  getDiemDanhRoster: { doc: true, fn: getDiemDanhRoster },
  getDiemDanhTPGoiY: { doc: true, fn: getDiemDanhTPGoiY },
  saveDiemDanhCell: { doc: false, fn: saveDiemDanhCell },
  addDiemDanhTreEm: { doc: false, fn: addDiemDanhTreEm },
  deleteDiemDanhTreEm: { doc: false, fn: deleteDiemDanhTreEm },
  moveDiemDanhTreEm: { doc: false, fn: moveDiemDanhTreEm },
  getDiemDanhGhiChuAll: { doc: true, fn: getDiemDanhGhiChuAll },
  saveDiemDanhGhiChu: { doc: false, fn: saveDiemDanhGhiChu },
  // --- Thờ phượng (TP) ---
  getTPSummary: { doc: true, fn: getTPSummary },
  saveTPWeek: { doc: false, fn: saveTPWeek },
  saveTPBaoCao: { doc: false, fn: saveTPBaoCao },
  // --- Các hàm còn lại: sẽ chuyển ở các bước kế tiếp ---
  ...taoChoTrong([
    "getStudents",
    "getStats",
    "getProgressBreakdown",
    "getMonthlySummaryByKV",
    "getMonthlySummaryOverall",
    "getKhuVucOverview",
    "getAllKhuVucOverview",
    "getAllKhuVucWeekly",
    "getDonThuanLogs",
    "getTopNguoiDanDat",
    "getKVTongSummary",
    "getGiaoDucMembers",
    "getGiaoDucWeekly",
    "getGiaoDucWeeklyAll",
    "getPersonalGoalsAllKhuVuc",
    "getLichTuan",
    "getDaoTaoTienDoAll",
    "getDaoTaoViecList",
    "getLeHoiActive",
    "getLeHoiTienDoAll",
    "getLeHoiBanner",
    "getLeHoiXepHang",
    "getMembersDecreasedTP"
  ], true),
  ...taoChoTrong([
    "addStudent",
    "updateStudent",
    "deleteStudent",
    "saveGoalKV",
    "deleteGoalKV",
    "addDonThuanLog",
    "deleteDonThuanLog",
    "addGiaoDucMember",
    "deleteGiaoDucMember",
    "saveGiaoDucWeek",
    "saveGoalCaNhan",
    "deleteGoalCaNhan",
    "addLichEvent",
    "updateLichEvent",
    "deleteLichEvent",
    "toggleDaoTaoBai",
    "setDaoTaoBaiAll",
    "setDaoTaoQuyenAll",
    "capChungChiDaoTao",
    "addDaoTaoViec",
    "updateDaoTaoViec",
    "deleteDaoTaoViec",
    "toggleLeHoiLan"
  ], false)
};
function taoChoTrong(ten, doc) {
  const o = {};
  for (const t of ten) {
    o[t] = {
      doc,
      chuaChuyen: true,
      fn: async () => {
        throw new Error('Ch\u1EE9c n\u0103ng "' + t + '" ch\u01B0a \u0111\u01B0\u1EE3c chuy\u1EC3n sang h\u1EC7 th\u1ED1ng m\u1EDBi.');
      }
    };
  }
  return o;
}
var DANH_SACH_DOC = new Set(
  Object.entries(DANH_MUC).filter(([, v]) => v.doc).map(([k]) => k)
);

// src/schema-sql.js
var CAU_LENH_TAO_BANG = [
  "CREATE TABLE IF NOT EXISTS access_control ( email TEXT PRIMARY KEY, trang_thai TEXT NOT NULL DEFAULT 'cho_duyet', ten TEXT, ngay_yeu_cau TEXT, ngay_duyet TEXT, la_chu INTEGER NOT NULL DEFAULT 0 )",
  "CREATE TABLE IF NOT EXISTS config_list ( id INTEGER PRIMARY KEY AUTOINCREMENT, loai TEXT NOT NULL, gia_tri TEXT NOT NULL, thu_tu INTEGER NOT NULL DEFAULT 0, UNIQUE (loai, gia_tri) )",
  "CREATE INDEX IF NOT EXISTS ix_config_loai ON config_list (loai, thu_tu)",
  "CREATE TABLE IF NOT EXISTS hoc_vien ( id INTEGER PRIMARY KEY AUTOINCREMENT, ten TEXT NOT NULL, ngay_chia_se_cuoi TEXT, ngay_dau_chia_se TEXT, dia_chi TEXT, ndd1 TEXT, ndd2 TEXT, ndd3 TEXT, khu_vuc TEXT, tien_do TEXT, danh_gia TEXT, cap_nhat_luc TEXT )",
  "CREATE INDEX IF NOT EXISTS ix_hv_khuvuc ON hoc_vien (khu_vuc)",
  "CREATE INDEX IF NOT EXISTS ix_hv_tiendo ON hoc_vien (tien_do)",
  "CREATE INDEX IF NOT EXISTS ix_hv_ten ON hoc_vien (ten)",
  "CREATE TABLE IF NOT EXISTS nhat_ky_don_thuan ( id INTEGER PRIMARY KEY AUTOINCREMENT, ngay TEXT NOT NULL, khu_vuc TEXT NOT NULL, don_thuan INTEGER NOT NULL DEFAULT 0, ghi_chu TEXT, ndd1 TEXT, ndd2 TEXT, ndd3 TEXT )",
  "CREATE INDEX IF NOT EXISTS ix_nkdt_ngay ON nhat_ky_don_thuan (ngay, khu_vuc)",
  "CREATE TABLE IF NOT EXISTS muc_tieu_kv ( thang TEXT NOT NULL, khu_vuc TEXT NOT NULL, mt_don_thuan INTEGER NOT NULL DEFAULT 0, mt_huu_hieu INTEGER NOT NULL DEFAULT 0, mt_bt INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (thang, khu_vuc) )",
  "CREATE TABLE IF NOT EXISTS muc_tieu_ca_nhan ( thang TEXT NOT NULL, khu_vuc TEXT NOT NULL, ten TEXT NOT NULL, mt_don_thuan INTEGER NOT NULL DEFAULT 0, mt_huu_hieu INTEGER NOT NULL DEFAULT 0, mt_bt INTEGER NOT NULL DEFAULT 0, mt_tt127_ngay INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (thang, khu_vuc, ten) )",
  "CREATE TABLE IF NOT EXISTS tp_tho_phuong ( thang TEXT NOT NULL, khu_vuc TEXT NOT NULL, loai TEXT NOT NULL, tuan INTEGER NOT NULL, so_luong INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (thang, khu_vuc, loai, tuan) )",
  "CREATE TABLE IF NOT EXISTS tp_bao_cao ( thang TEXT NOT NULL, khu_vuc TEXT NOT NULL, tuan INTEGER NOT NULL, nhom TEXT NOT NULL, thoi_gian TEXT NOT NULL, thoi_gian_ms INTEGER NOT NULL, snap_1lan INTEGER NOT NULL DEFAULT 0, snap_4lan INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (thang, khu_vuc, tuan, nhom) )",
  "CREATE TABLE IF NOT EXISTS giao_duc_thanh_vien ( thang TEXT NOT NULL, khu_vuc TEXT NOT NULL, ten TEXT NOT NULL, tuan INTEGER NOT NULL, edu_lms TEXT, tt127_ngay INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (thang, khu_vuc, ten, tuan) )",
  "CREATE INDEX IF NOT EXISTS ix_gdtv_thang_kv ON giao_duc_thanh_vien (thang, khu_vuc)",
  "CREATE TABLE IF NOT EXISTS diem_danh ( thang TEXT NOT NULL, khu_vuc TEXT NOT NULL, ten TEXT NOT NULL, tuan INTEGER NOT NULL, buoi TEXT NOT NULL, gia_tri TEXT NOT NULL, PRIMARY KEY (thang, khu_vuc, ten, tuan, buoi) )",
  "CREATE INDEX IF NOT EXISTS ix_dd_thang_kv ON diem_danh (thang, khu_vuc)",
  "CREATE TABLE IF NOT EXISTS diem_danh_roster ( id INTEGER PRIMARY KEY AUTOINCREMENT, khu_vuc TEXT NOT NULL, ten TEXT NOT NULL, phu_huynh TEXT, thu_tu INTEGER NOT NULL DEFAULT 0, UNIQUE (khu_vuc, ten) )",
  "CREATE INDEX IF NOT EXISTS ix_ddr_kv ON diem_danh_roster (khu_vuc, thu_tu)",
  "CREATE TABLE IF NOT EXISTS diem_danh_ghi_chu ( khu_vuc TEXT NOT NULL, ten TEXT NOT NULL, ma_cap_do TEXT, ghi_chu TEXT, ngay_cap_nhat TEXT, PRIMARY KEY (khu_vuc, ten) )",
  "CREATE TABLE IF NOT EXISTS lich_lam_viec ( id INTEGER PRIMARY KEY AUTOINCREMENT, ngay TEXT NOT NULL, gio_bat_dau TEXT, gio_ket_thuc TEXT, noi_dung TEXT NOT NULL, nguoi_phu_trach TEXT, khu_vuc TEXT, dia_diem TEXT, trang_thai TEXT, nguoi_tham_gia TEXT )",
  "CREATE INDEX IF NOT EXISTS ix_lich_ngay ON lich_lam_viec (ngay)",
  "CREATE TABLE IF NOT EXISTS dao_tao_tien_do ( khu_vuc TEXT NOT NULL, ten TEXT NOT NULL, bai_da_hoc TEXT, ngay_cap_chung_chi TEXT, PRIMARY KEY (khu_vuc, ten) )",
  "CREATE TABLE IF NOT EXISTS dao_tao_viec_giao ( id INTEGER PRIMARY KEY AUTOINCREMENT, khu_vuc TEXT NOT NULL, ten TEXT NOT NULL, noi_dung TEXT NOT NULL, ngay_giao TEXT, han_hoan_thanh TEXT, trang_thai TEXT )",
  "CREATE INDEX IF NOT EXISTS ix_dtvg_kv ON dao_tao_viec_giao (khu_vuc, ten)",
  "CREATE TABLE IF NOT EXISTS le_hoi_cau_hinh ( ma_le_hoi TEXT PRIMARY KEY, ten_le_hoi TEXT NOT NULL, ngay_bat_dau TEXT, ngay_ket_thuc TEXT, danh_sach_bai TEXT, so_lan_yeu_cau INTEGER NOT NULL DEFAULT 1 )",
  "CREATE TABLE IF NOT EXISTS le_hoi_tien_do ( ma_le_hoi TEXT NOT NULL, khu_vuc TEXT NOT NULL, ten TEXT NOT NULL, da_phat_bieu TEXT, ngay_hoan_thanh TEXT, PRIMARY KEY (ma_le_hoi, khu_vuc, ten) )",
  "CREATE TABLE IF NOT EXISTS phien_dang_nhap ( token TEXT PRIMARY KEY, email TEXT NOT NULL, ten TEXT, tao_luc INTEGER NOT NULL, het_han_luc INTEGER NOT NULL )",
  "CREATE INDEX IF NOT EXISTS ix_phien_email ON phien_dang_nhap (email)"
];

// src/index.js
var index_default = {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") return preflight();
      const url = new URL(request.url);
      if (url.pathname === "/suc-khoe") {
        return json({ ok: true, thoiGian: (/* @__PURE__ */ new Date()).toISOString() });
      }
      if (url.pathname === "/cai-dat") {
        if (!env.MA_CAI_DAT || url.searchParams.get("ma") !== env.MA_CAI_DAT) {
          return json({ error: "Sai m\xE3 c\xE0i \u0111\u1EB7t." }, 403);
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
          loi
        });
      }
      const yeuCau = await parseRequest(request);
      if (yeuCau.error) return json({ error: yeuCau.error });
      const { fn, args, token } = yeuCau;
      if (!fn) return json({ error: "Thi\u1EBFu t\xEAn h\xE0m c\u1EA7n g\u1ECDi." });
      const muc = DANH_MUC[fn];
      if (!muc) return json({ error: "Kh\xF4ng h\u1ED7 tr\u1EE3 h\xE0m: " + fn });
      const db = bocD1(env.DB);
      let nguoiGoi = null;
      if (muc.canQuyen !== false) {
        try {
          nguoiGoi = await nhanDienNguoiGoi(db, token, env.GOOGLE_CLIENT_ID);
        } catch (e) {
          return json({ error: e.message, authError: true });
        }
        if (muc.chuThoi && !nguoiGoi.laChu) {
          return json({ error: "Ch\u1EC9 t\xE0i kho\u1EA3n ch\u1EE7 m\u1EDBi \u0111\u01B0\u1EE3c th\u1EF1c hi\u1EC7n thao t\xE1c n\xE0y." });
        }
      }
      const boiCanh = { db, env, nguoiGoi, token };
      const ketQua = await muc.fn(boiCanh, ...args);
      return json({ result: ketQua === void 0 ? null : ketQua });
    } catch (e) {
      return json({ error: e && e.message || "L\u1ED7i kh\xF4ng x\xE1c \u0111\u1ECBnh ph\xEDa m\xE1y ch\u1EE7." });
    }
  }
};
export {
  index_default as default
};
