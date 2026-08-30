
/** =========================================================
 *  TRỤ ĐỠ — gom ba chặng Đơn thuần → Hữu hiệu → Báp-têm vào một tab lớn,
 *  thêm sổ ghi mốc, bảng khen thưởng và dải chúc mừng Báp-têm.
 *  (thêm 13/08/2026)
 *
 *  CÁCH LÀM: khối này KHÔNG sửa một dòng HTML nào có sẵn. Nó dựng lại thanh
 *  bên và DI CHUYỂN nguyên vẹn hai khối "Nhập học viên" và "Đơn thuần" vào
 *  bên trong tab Trudo lúc trang chạy. Nhờ vậy toàn bộ mã cũ (vốn tìm phần
 *  tử theo id) vẫn chạy y như trước, không phải sửa gì.
 * ========================================================= */
(function () {
  // ⭐⭐ 27/08/2026 — thang điểm MỚI theo bảng Hội Thánh ban hành cho kỳ
  // "Vận động Thánh Linh Lễ Lều Tạm". Anh Rise chốt thay luôn thang cũ
  // (1/100/1000) để cả web nói cùng một con số.
  // ⚠️ PHẢI KHỚP với DIEM_MOC trong cvtl-api/src/handlers/tru-do.js — hai nơi
  // lệch nhau thì màn hình hiện một đằng, máy chủ tính một nẻo. Bộ kiểm thử
  // giao diện có ca đọc thẳng hai file và đối chiếu.
  const DIEM = {
    don_thuan: 1, huu_hieu: 50, bap_tem: 500, bap_tem_du_le: 1000, chien_bi_mat: 500,
  };
  const TEN_MOC = {
    huu_hieu: 'Hữu hiệu',
    bap_tem: 'Báp-têm',
    bap_tem_du_le: 'Báp-têm dự lễ',
    chien_bi_mat: 'Chiên bị mất',
  };
  /** Lời nhắc riêng cho từng sổ — hai mốc mới cần nói rõ nghĩa. */
  const GIAI_THICH_MOC = {
    bap_tem_du_le: 'Người đã báp-têm VÀ có dự Lễ Lều Tạm. Đây là mốc CỘNG THÊM: '
      + 'ghi ở đây không thay cho dòng trong sổ Báp-têm, một người có thể có cả hai.',
    chien_bi_mat: 'Thánh đồ đã báp-têm nhưng bỏ lễ từ 1 năm trở lên, nay đưa được trở lại. '
      + 'Máy không tự biết được điều này nên phải ghi tay.',
  };

  /** Gọi API theo kiểu Promise cho dễ đọc. */
  function goi(fn, args) {
    return new Promise(function (ok, loi) {
      const r = google.script.run.withSuccessHandler(ok).withFailureHandler(loi);
      r[fn].apply(r, args || []);
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function ngayVN(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(s || '');
  }
  function soDep(n) {
    const x = Number(n) || 0;
    return x.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function homNay() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  /** Lùi n tháng so với hôm nay, trả về yyyy-MM-dd đầu tháng đó. */
  function luiThang(n) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  }

  // --- Bộ lọc thời gian dùng chung cho cả 4 tab con -------------------
  const KHOANG = {
    thang: { nhan: 'Tháng này', tu: function () { return homNay().slice(0, 7) + '-01'; }, den: homNay },
    sau: { nhan: '6 tháng', tu: function () { return luiThang(5); }, den: homNay },
    nam: { nhan: '1 năm', tu: function () { return luiThang(11); }, den: homNay },
    tatca: { nhan: 'Tất cả', tu: function () { return ''; }, den: function () { return ''; } },
  };
  const trangThai = { khoang: 'thang', khuVuc: '', sub: 'donthuan' };

  function tuNgay() { return KHOANG[trangThai.khoang].tu(); }
  function denNgay() { return KHOANG[trangThai.khoang].den(); }

  // =====================================================================
  // 1. Dựng khung giao diện
  // =====================================================================
  function themCss() {
    const st = document.createElement('style');
    st.textContent =
      '.trudo-sub{display:none}.trudo-sub.active{display:block}' +
      '.trudo-loc{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px}' +
      '.trudo-loc .nhan{font-size:12px;color:#94a3b8}' +
      '.trudo-nut{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:6px 13px;' +
      'font-size:13px;color:#64748b;cursor:pointer}' +
      '.trudo-nut.on{background:#0f172a;border-color:#0f172a;color:#fff;font-weight:600}' +
      '.trudo-bang{width:100%;border-collapse:collapse;font-size:14px}' +
      '.trudo-bang th{text-align:left;color:#64748b;font-size:11.5px;text-transform:uppercase;' +
      'padding:0 9px 8px;border-bottom:2px solid #e2e8f0}' +
      '.trudo-bang td{padding:10px 9px;border-bottom:1px solid #f1f5f9;vertical-align:top}' +
      '.trudo-bang tr:last-child td{border-bottom:none}' +
      '.trudo-giua{text-align:center}' +
      '.trudo-tomtat{margin-top:12px;padding-top:11px;border-top:1px dashed #e2e8f0;' +
      'color:#64748b;font-size:12.5px}' +
      '.trudo-chua{background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:13px 16px;margin-bottom:14px}' +
      '.trudo-chua b{color:#b45309}' +
      '.trudo-chip{display:inline-block;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;' +
      'border-radius:999px;padding:1px 9px;font-size:12px;font-weight:600;margin:2px 4px 2px 0}' +
      '.bt-dai{background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1px solid #fcd34d;' +
      'border-radius:12px;padding:16px 20px;margin-bottom:14px}' +
      '.bt-dai .bt-tieu{font-weight:800;color:#b45309;font-size:16px;margin-bottom:12px}' +
      '.bt-nguoi{background:#fff;border:1px solid #fde68a;border-radius:10px;padding:11px 14px;margin-top:9px}' +
      '.trudo-che{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;' +
      'display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.trudo-hop{background:#fff;border-radius:14px;padding:20px 22px;max-width:520px;width:100%;' +
      'max-height:90vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.3)}' +
      '.trudo-hop h3{margin:0 0 14px}' +
      '.trudo-hop label{display:block;font-size:12.5px;color:#64748b;margin:9px 0 3px}' +
      '.trudo-hop input,.trudo-hop select{width:100%;padding:8px 10px;border:1px solid #e2e8f0;' +
      'border-radius:8px;font-size:14px;font-family:inherit}' +
      '.trudo-hop .hang{display:flex;gap:9px;justify-content:flex-end;margin-top:16px}' +
      '.trudo-nho{font-size:12px;color:#94a3b8}';
    document.head.appendChild(st);
  }

  function dungKhung() {
    // --- Thanh bên: bỏ 2 mục cũ, thêm mục Trudo ---
    const nav = document.querySelector('.nav-btn[data-panel="stats"]');
    if (!nav) return false;
    const nutAdd = document.querySelector('.nav-btn[data-panel="add"]');
    const nutDT = document.querySelector('.nav-btn[data-panel="donthuan"]');
    if (nutAdd) nutAdd.remove();
    if (nutDT) nutDT.remove();

    const nutMoi = document.createElement('button');
    nutMoi.type = 'button';
    nutMoi.className = 'nav-btn';
    nutMoi.setAttribute('data-panel', 'trudo');
    nutMoi.innerHTML = '<span class="nav-icon">🏛️</span> Trudo';
    nutMoi.onclick = function () { showPanel('trudo'); };
    nav.parentNode.insertBefore(nutMoi, nav.nextSibling);

    // --- Khung tab lớn ---
    const pAdd = document.getElementById('panel-add');
    const pDT = document.getElementById('panel-donthuan');
    if (!pAdd || !pDT) return false;

    const panel = document.createElement('div');
    panel.id = 'panel-trudo';
    panel.className = 'panel';
    panel.innerHTML =
      '<h1>Trudo</h1>' +
      '<div class="kv-pills" id="trudoPills" style="margin-bottom:14px">' +
      '<button type="button" class="kv-pill active" data-sub="donthuan">📦 Đơn thuần</button>' +
      '<button type="button" class="kv-pill" data-sub="huuhieu">🌱 Hữu hiệu</button>' +
      '<button type="button" class="kv-pill" data-sub="baptem">🕊️ Báp-têm</button>' +
      '<button type="button" class="kv-pill" data-sub="btdule">⛺ Báp-têm dự lễ</button>' +
      '<button type="button" class="kv-pill" data-sub="chien">🐑 Chiên bị mất</button>' +
      '<button type="button" class="kv-pill" data-sub="xephang">🏆 Xếp hạng chung</button>' +
      '</div>' +
      '<div id="trudo-sub-donthuan" class="trudo-sub active"></div>' +
      '<div id="trudo-sub-huuhieu" class="trudo-sub"></div>' +
      '<div id="trudo-sub-baptem" class="trudo-sub"></div>' +
      '<div id="trudo-sub-btdule" class="trudo-sub"></div>' +
      '<div id="trudo-sub-chien" class="trudo-sub"></div>' +
      '<div id="trudo-sub-xephang" class="trudo-sub"></div>';
    pAdd.parentNode.insertBefore(panel, pAdd);

    // --- Chuyển nguyên vẹn hai khối cũ vào trong ---
    pDT.classList.remove('panel', 'active');
    pAdd.classList.remove('panel', 'active');
    const h1DT = pDT.querySelector('h1'); if (h1DT) h1DT.remove();
    const h1Add = pAdd.querySelector('h1'); if (h1Add) h1Add.remove();
    document.getElementById('trudo-sub-donthuan').appendChild(pDT);
    const oHH = document.getElementById('trudo-sub-huuhieu');
    oHH.innerHTML = '<div id="trudoChuaGhi"></div>';
    oHH.appendChild(pAdd);
    const khungSo = document.createElement('div');
    khungSo.className = 'card';
    khungSo.style.marginTop = '14px';
    khungSo.id = 'trudoSoHuuHieu';
    oHH.appendChild(khungSo);

    // --- Chuyển tab con ---
    document.getElementById('trudoPills').addEventListener('click', function (e) {
      const b = e.target.closest('.kv-pill');
      if (!b) return;
      trangThai.sub = b.getAttribute('data-sub');
      document.querySelectorAll('#trudoPills .kv-pill').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      document.querySelectorAll('.trudo-sub').forEach(function (x) { x.classList.remove('active'); });
      document.getElementById('trudo-sub-' + trangThai.sub).classList.add('active');
      taiTabCon();
    });

    // --- Dải chúc mừng Báp-têm ở đầu trang Tổng quan ---
    const pStats = document.getElementById('panel-stats');
    if (pStats) {
      const dai = document.createElement('div');
      dai.id = 'btBanner';
      dai.className = 'bt-dai';
      dai.style.display = 'none';
      const h1 = pStats.querySelector('h1');
      pStats.insertBefore(dai, h1 ? h1.nextSibling : pStats.firstChild);
    }
    return true;
  }

  // =====================================================================
  // 2. Thanh lọc dùng chung
  // =====================================================================
  function htmlLoc(coXuat) {
    let h = '<div class="trudo-loc"><span class="nhan">Thời gian:</span>';
    Object.keys(KHOANG).forEach(function (k) {
      h += '<button type="button" class="trudo-nut' + (trangThai.khoang === k ? ' on' : '') +
        '" data-khoang="' + k + '">' + KHOANG[k].nhan + '</button>';
    });
    h += '<span class="nhan" style="margin-left:8px">Khu vực:</span>' +
      '<select class="trudo-kv" style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px">' +
      '<option value="">Tất cả</option>' +
      (khuVucList || []).map(function (kv) {
        return '<option value="' + esc(kv) + '"' + (trangThai.khuVuc === kv ? ' selected' : '') + '>' + esc(kv) + '</option>';
      }).join('') + '</select>';
    if (coXuat) h += '<button type="button" class="trudo-nut trudo-xuat" style="margin-left:auto">⬇ Xuất Excel</button>';
    return h + '</div>';
  }

  function nolLoc(goc, khiDoi) {
    goc.querySelectorAll('[data-khoang]').forEach(function (b) {
      b.onclick = function () { trangThai.khoang = b.getAttribute('data-khoang'); khiDoi(); };
    });
    const sel = goc.querySelector('.trudo-kv');
    if (sel) sel.onchange = function () { trangThai.khuVuc = sel.value; khiDoi(); };
  }

  /** Tải file CSV (mở được bằng Excel, có BOM để không lỗi tiếng Việt). */
  function xuatCsv(tenFile, tieuDe, dong) {
    const q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    const noi = [tieuDe.map(q).join(',')].concat(dong.map(function (d) { return d.map(q).join(','); })).join('\r\n');
    const blob = new Blob(['\ufeff' + noi], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = tenFile;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // =====================================================================
  // 3. Sổ mốc (dùng chung cho Hữu hiệu và Báp-têm)
  // =====================================================================
  async function veSo(moc, oId) {
    const o = document.getElementById(oId);
    if (!o) return;
    o.innerHTML = '<div class="trudo-nho">Đang tải…</div>';
    let ds = [];
    try {
      ds = await goi('getSoMoc', [moc, tuNgay(), denNgay(), trangThai.khuVuc]);
    } catch (e) {
      o.innerHTML = '<div style="color:#dc2626">Lỗi tải sổ: ' + esc(e.message) + '</div>';
      return;
    }
    let h = htmlLoc(true) +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
      '<h3 style="margin:0">Sổ ' + TEN_MOC[moc] + '</h3>' +
      '<span class="trudo-nho">' + ds.length + ' người · mỗi ca ' + DIEM[moc] + ' điểm chia đều cho người dẫn dắt</span>' +
      '<button type="button" class="trudo-nut trudo-them" style="margin-left:auto">+ Thêm thủ công</button>' +
      '</div>';
    if (!ds.length) {
      h += '<div class="trudo-nho" style="padding:16px 0">Chưa có ai trong sổ ở khoảng thời gian này.</div>';
    } else {
      h += '<table class="trudo-bang"><thead><tr><th>Ngày</th><th>Tên</th><th>Khu vực</th>' +
        '<th>Người dẫn dắt</th><th>Ghi chú</th><th style="width:110px"></th></tr></thead><tbody>' +
        ds.map(function (x) {
          return '<tr><td>' + ngayVN(x.ngay) + '</td><td><b>' + esc(x.ten) + '</b></td>' +
            '<td>' + esc(x.khuVuc) + '</td>' +
            '<td>' + x.nguoiDanDat.map(function (n) { return '<span class="trudo-chip">' + esc(n) + '</span>'; }).join('') + '</td>' +
            '<td class="trudo-nho">' + esc(x.ghiChu) + '</td>' +
            '<td><button type="button" class="trudo-nut" data-sua="' + x.row + '">Sửa</button> ' +
            '<button type="button" class="trudo-nut" data-xoa="' + x.row + '" style="color:#dc2626">Xoá</button></td></tr>';
        }).join('') + '</tbody></table>';
    }
    o.innerHTML = h;
    nolLoc(o, function () { veSo(moc, oId); });
    const nutXuat = o.querySelector('.trudo-xuat');
    if (nutXuat) nutXuat.onclick = function () {
      xuatCsv('so-' + moc + '.csv', ['Ngày', 'Tên', 'Khu vực', 'Người dẫn dắt', 'Ghi chú'],
        ds.map(function (x) { return [ngayVN(x.ngay), x.ten, x.khuVuc, x.nguoiDanDat.join(', '), x.ghiChu]; }));
    };
    const nutThem = o.querySelector('.trudo-them');
    if (nutThem) nutThem.onclick = function () { moHopGhiSo({ moc: moc, ngayGoiY: homNay() }, function () { veSo(moc, oId); lamMoiChuaGhi(); }); };
    o.querySelectorAll('[data-sua]').forEach(function (b) {
      const x = ds.find(function (y) { return String(y.row) === b.getAttribute('data-sua'); });
      b.onclick = function () { moHopGhiSo(Object.assign({ suaRow: x.row }, x), function () { veSo(moc, oId); }); };
    });
    o.querySelectorAll('[data-xoa]').forEach(function (b) {
      b.onclick = async function () {
        const x = ds.find(function (y) { return String(y.row) === b.getAttribute('data-xoa'); });
        if (!confirm('Xoá ' + x.ten + ' khỏi sổ ' + TEN_MOC[moc] + '?\n\nĐiểm của người dẫn dắt sẽ bị trừ theo.')) return;
        try { await goi('deleteSoMoc', [x.row]); showMsg('Đã xoá khỏi sổ.', true); veSo(moc, oId); lamMoiChuaGhi(); }
        catch (e) { showMsg('Lỗi xoá: ' + e.message, false); }
      };
    });
  }

  // =====================================================================
  // 4. Hộp ghi sổ
  // =====================================================================
  function moHopGhiSo(d, xong) {
    const laSua = !!d.suaRow;
    const che = document.createElement('div');
    che.className = 'trudo-che';
    const dsKV = (khuVucList || []);
    che.innerHTML =
      '<div class="trudo-hop">' +
      '<h3>' + (laSua ? 'Sửa dòng sổ ' : '🎉 Ghi vào sổ ') + TEN_MOC[d.moc] + '</h3>' +
      (GIAI_THICH_MOC[d.moc]
        ? '<div class="trudo-nho" style="background:#f8fafc;border-left:3px solid #94a3b8;padding:8px 10px;'
          + 'border-radius:0 6px 6px 0;margin-bottom:10px;line-height:1.6">' + GIAI_THICH_MOC[d.moc] + '</div>'
        : '') +
      '<div class="trudo-nho">Mỗi người chỉ ghi <b>một lần</b> cho mỗi mốc. ' +
      'Mốc này được <b>' + DIEM[d.moc] + ' điểm</b>, chia đều cho số người dẫn dắt.</div>' +
      '<label>Tên học viên *</label><input id="gs_ten" value="' + esc(d.ten || '') + '"' + (laSua ? ' disabled' : '') + '>' +
      '<label>Khu vực *</label><select id="gs_kv"' + (laSua ? ' disabled' : '') + '>' +
      dsKV.map(function (kv) { return '<option' + (kv === d.khuVuc ? ' selected' : '') + '>' + esc(kv) + '</option>'; }).join('') +
      '</select>' +
      '<label>Ngày đạt mốc *</label><input type="date" id="gs_ngay" value="' + esc(d.ngay || d.ngayGoiY || homNay()) + '">' +
      '<label>Người dẫn dắt 1</label><input id="gs_n1" list="nddDatalist" value="' + esc(d.ndd1 || '') + '">' +
      '<label>Người dẫn dắt 2</label><input id="gs_n2" list="nddDatalist" value="' + esc(d.ndd2 || '') + '">' +
      '<label>Người dẫn dắt 3</label><input id="gs_n3" list="nddDatalist" value="' + esc(d.ndd3 || '') + '">' +
      '<label>Ghi chú</label><input id="gs_gc" value="' + esc(d.ghiChu || '') + '">' +
      '<div class="hang"><button type="button" class="trudo-nut" id="gs_huy">Bỏ qua</button>' +
      '<button type="button" class="trudo-nut on" id="gs_luu">' + (laSua ? 'Lưu' : 'Ghi vào sổ') + '</button></div>' +
      '</div>';
    document.body.appendChild(che);
    che.querySelector('#gs_huy').onclick = function () { che.remove(); };
    che.onclick = function (e) { if (e.target === che) che.remove(); };
    che.querySelector('#gs_luu').onclick = async function () {
      const lay = function (id) { return (che.querySelector(id).value || '').trim(); };
      const goiTin = {
        moc: d.moc, ten: lay('#gs_ten'), khuVuc: che.querySelector('#gs_kv').value,
        ngay: lay('#gs_ngay'), ndd1: lay('#gs_n1'), ndd2: lay('#gs_n2'), ndd3: lay('#gs_n3'),
        ghiChu: lay('#gs_gc'),
      };
      try {
        if (laSua) await goi('updateSoMoc', [d.suaRow, goiTin]);
        else await goi('addSoMoc', [goiTin]);
        che.remove();
        showMsg(laSua ? 'Đã lưu.' : ('Đã ghi ' + goiTin.ten + ' vào sổ ' + TEN_MOC[d.moc] + '.'), true);
        if (xong) xong();
        veBanner();
      } catch (e) { showMsg(e.message, false); }
    };
  }

  // =====================================================================
  // 5. Khối "chưa ghi sổ" ở tab Hữu hiệu
  //
  // Thay cho việc bật ô hỏi ngay lúc sửa Tiến độ: ở đây liệt kê MỌI học viên
  // đã đạt mốc mà chưa có trong sổ — kể cả người đã đạt từ trước khi có tính
  // năng này. Nhờ vậy vừa không bỏ sót ca mới, vừa nhập bù được ca cũ.
  // =====================================================================
  async function lamMoiChuaGhi() {
    const o = document.getElementById('trudoChuaGhi');
    if (!o) return;
    let hv = [], so = [];
    try {
      hv = await goi('getStudents', []);
      so = await goi('getSoMoc', ['', '', '', '']);
    } catch (e) { o.innerHTML = ''; return; }
    const daCo = {};
    so.forEach(function (x) { daCo[x.moc + '|' + x.ten + '|' + x.khuVuc] = true; });

    const thieu = [];
    hv.forEach(function (x) {
      const td = String(x.tienDo || '').trim();
      const buoi = td.match(/^B(\d+)$/i);
      const laBT = td === 'BT';
      const laHH = laBT || (buoi && Number(buoi[1]) >= 2);
      if (!laHH || !x.ten || !x.to) return;
      ['huu_hieu'].concat(laBT ? ['bap_tem'] : []).forEach(function (m) {
        if (!daCo[m + '|' + x.ten + '|' + x.to]) {
          thieu.push({ moc: m, ten: x.ten, khuVuc: x.to, ndd1: x.ndd1, ndd2: x.ndd2, ndd3: x.ndd3 });
        }
      });
    });

    if (!thieu.length) { o.innerHTML = ''; return; }
    o.innerHTML = '<div class="trudo-chua"><b>⚠️ ' + thieu.length + ' mốc chưa được ghi vào sổ</b>' +
      '<div class="trudo-nho" style="margin:4px 0 10px">Chưa ghi sổ thì người dẫn dắt không được tính điểm khen thưởng.</div>' +
      thieu.map(function (x, i) {
        return '<div style="display:flex;align-items:center;gap:9px;padding:5px 0">' +
          '<b>' + esc(x.ten) + '</b><span class="trudo-nho">' + esc(x.khuVuc) + ' · ' + TEN_MOC[x.moc] + '</span>' +
          '<button type="button" class="trudo-nut on" data-ghi="' + i + '" style="margin-left:auto">Ghi sổ</button></div>';
      }).join('') + '</div>';
    o.querySelectorAll('[data-ghi]').forEach(function (b) {
      b.onclick = function () {
        const x = thieu[Number(b.getAttribute('data-ghi'))];
        moHopGhiSo(Object.assign({ ngayGoiY: homNay() }, x), function () {
          lamMoiChuaGhi(); veSo('huu_hieu', 'trudoSoHuuHieu');
        });
      };
    });
  }

  // =====================================================================
  // 6. Bảng xếp hạng chung
  // =====================================================================
  async function veXepHang() {
    const o = document.getElementById('trudo-sub-xephang');
    if (!o) return;
    o.innerHTML = '<div class="trudo-nho">Đang tải…</div>';
    let b, kyDaChot = [];
    try {
      b = await goi('getXepHang', [tuNgay(), denNgay(), trangThai.khuVuc]);
      kyDaChot = await goi('getDsChotKy', []);
    } catch (e) {
      o.innerHTML = '<div style="color:#dc2626">Lỗi tải bảng xếp hạng: ' + esc(e.message) + '</div>';
      return;
    }
    const t = b.tomTat;
    let h = htmlLoc(true) +
      '<div class="card"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
      '<h3 style="margin:0">Xếp hạng người dẫn dắt</h3>' +
      '<button type="button" class="trudo-nut" id="trudoChot" style="margin-left:auto">🔒 Chốt kỳ này</button></div>';
    if (!b.danhSach.length) {
      h += '<div class="trudo-nho" style="padding:16px 0">Chưa có dữ liệu trong khoảng thời gian này.</div>';
    } else {
      h += '<table class="trudo-bang"><thead><tr><th style="width:56px">Hạng</th><th>Người dẫn dắt</th>' +
        '<th class="trudo-giua">Đơn thuần</th><th class="trudo-giua">Hữu hiệu</th>' +
        '<th class="trudo-giua">Báp-têm</th><th class="trudo-giua">BT dự lễ</th>' +
        '<th class="trudo-giua">Chiên bị mất</th><th class="trudo-giua" style="width:110px">Tổng điểm</th>' +
        '</tr></thead><tbody>' +
        b.danhSach.map(function (x) {
          const huy = x.hang === 1 ? '🥇' : (x.hang === 2 ? '🥈' : (x.hang === 3 ? '🥉' : x.hang));
          return '<tr><td style="font-size:17px">' + huy + '</td><td><b>' + esc(x.ten) + '</b></td>' +
            '<td class="trudo-giua">' + soDep(x.donThuan) + '</td>' +
            '<td class="trudo-giua">' + x.huuHieu + '</td>' +
            '<td class="trudo-giua">' + x.bapTem + '</td>' +
            '<td class="trudo-giua">' + (x.bapTemDuLe || 0) + '</td>' +
            '<td class="trudo-giua">' + (x.chienBiMat || 0) + '</td>' +
            '<td class="trudo-giua"><b style="font-size:15px">' + soDep(x.diem) + '</b></td></tr>';
        }).join('') + '</tbody></table>';
    }
    h += '<div class="trudo-tomtat">Trong khoảng đang xem: <b>' + t.soDonThuan + '</b> đơn thuần · ' +
      '<b>' + t.soHuuHieu + '</b> hữu hiệu · <b>' + t.soBapTem + '</b> báp-têm · ' +
      '<b>' + (t.soBapTemDuLe || 0) + '</b> BT dự lễ · <b>' + (t.soChienBiMat || 0) + '</b> chiên bị mất · ' +
      'tổng <b>' + soDep(t.tongDiem) + ' điểm</b>.<br>' +
      'Cách tính: 1 đơn thuần = 1 điểm · 1 hữu hiệu = 50 điểm · 1 báp-têm = 500 điểm · ' +
      '1 báp-têm dự lễ = 1000 điểm · 1 chiên bị mất = 500 điểm, <b>chia đều</b> cho số người dẫn dắt.' +
      '<br><span style="color:#b45309">⚠️ Thang điểm đổi từ 27/08/2026 theo bảng Hội Thánh ban hành — ' +
      'số ca không đổi, chỉ điểm đổi so với trước.</span>' +
      (t.diemChuaCoNguoi > 0 ? '<br><span style="color:#b45309">⚠️ Có ' + soDep(t.diemChuaCoNguoi) +
        ' điểm chưa thuộc về ai vì dòng đó không ghi tên người dẫn dắt.</span>' : '') +
      '</div></div>';

    if (kyDaChot.length) {
      h += '<div class="card" style="margin-top:14px"><h3 style="margin:0 0 10px">Các kỳ đã chốt</h3>' +
        '<div class="trudo-nho" style="margin-bottom:8px">Bảng đã chốt giữ nguyên con số lúc trao giải, ' +
        'dù sau đó có ai sửa sổ.</div>' +
        kyDaChot.map(function (k) {
          return '<div style="display:flex;align-items:center;gap:9px;padding:5px 0">' +
            '<b>' + esc(k.ky) + '</b><span class="trudo-nho">' + ngayVN(k.tuNgay) + ' → ' + ngayVN(k.denNgay) +
            (k.khuVuc ? ' · ' + esc(k.khuVuc) : '') + '</span>' +
            '<button type="button" class="trudo-nut" data-xemky="' + esc(k.ky) + '" style="margin-left:auto">Xem</button>' +
            '<button type="button" class="trudo-nut" data-boky="' + esc(k.ky) + '" style="color:#dc2626">Bỏ chốt</button></div>';
        }).join('') + '</div>';
    }
    o.innerHTML = h;
    nolLoc(o, veXepHang);

    const nutXuat = o.querySelector('.trudo-xuat');
    if (nutXuat) nutXuat.onclick = function () {
      xuatCsv('xep-hang.csv',
        ['Hạng', 'Người dẫn dắt', 'Đơn thuần', 'Hữu hiệu', 'Báp-têm', 'BT dự lễ', 'Chiên bị mất', 'Tổng điểm'],
        b.danhSach.map(function (x) {
          return [x.hang, x.ten, x.donThuan, x.huuHieu, x.bapTem,
            x.bapTemDuLe || 0, x.chienBiMat || 0, x.diem];
        }));
    };
    o.querySelector('#trudoChot').onclick = async function () {
      const ky = prompt('Đặt tên cho kỳ này (ví dụ 2026-08 hoặc 2026-H1):',
        (tuNgay() || '').slice(0, 7) || homNay().slice(0, 7));
      if (!ky) return;
      if (!confirm('Chốt kỳ "' + ky + '"?\n\nBảng xếp hạng sẽ được đóng băng đúng như đang hiện.')) return;
      try {
        const r = await goi('chotKy', [ky, tuNgay(), denNgay(), trangThai.khuVuc]);
        showMsg('Đã chốt kỳ ' + r.ky + ' với ' + r.soNguoi + ' người.', true);
        veXepHang();
      } catch (e) { showMsg(e.message, false); }
    };
    o.querySelectorAll('[data-xemky]').forEach(function (bt) {
      bt.onclick = async function () {
        try {
          const k = await goi('getChotKy', [bt.getAttribute('data-xemky')]);
          alert('Kỳ ' + k.ky + ' (chốt bởi ' + (k.nguoiChot || '?') + ')\n\n' +
            k.danhSach.map(function (x, i) { return (i + 1) + '. ' + x.ten + ' — ' + x.diem + ' điểm'; }).join('\n'));
        } catch (e) { showMsg(e.message, false); }
      };
    });
    o.querySelectorAll('[data-boky]').forEach(function (bt) {
      bt.onclick = async function () {
        const ky = bt.getAttribute('data-boky');
        if (!confirm('Bỏ chốt kỳ "' + ky + '"? Bảng sẽ tính lại theo sổ hiện tại.')) return;
        try { await goi('xoaChotKy', [ky]); showMsg('Đã bỏ chốt.', true); veXepHang(); }
        catch (e) { showMsg(e.message, false); }
      };
    });
  }

  // =====================================================================
  // 7. Dải chúc mừng Báp-têm
  // =====================================================================
  async function veBanner() {
    const o = document.getElementById('btBanner');
    if (!o) return;
    let d;
    try { d = await goi('getBapTemBanner', [(document.getElementById('kvMonth') || {}).value || '']); }
    catch (e) { o.style.display = 'none'; return; }
    if (!d || !d.soNguoi) { o.style.display = 'none'; return; }
    const th = d.thang.split('-');
    o.innerHTML = '<div class="bt-tieu">🎉 CHÚC MỪNG BÁP-TÊM THÁNG ' + Number(th[1]) + '/' + th[0] +
      ' — ' + d.soNguoi + ' người</div>' +
      d.danhSach.map(function (x) {
        return '<div class="bt-nguoi"><div style="font-weight:700;font-size:16px">' + esc(x.ten) + '</div>' +
          '<div class="trudo-nho">Khu vực ' + esc(x.khuVuc) + ' · Báp-têm ngày ' + ngayVN(x.ngay) + '</div>' +
          (x.nguoiDanDat.length
            ? '<div style="margin-top:5px"><span class="trudo-nho">Người kết trái:</span> ' +
              x.nguoiDanDat.map(function (n) { return '<span class="trudo-chip">' + esc(n) + '</span>'; }).join('') + '</div>'
            : '') + '</div>';
      }).join('');
    o.style.display = 'block';
  }

  // =====================================================================
  // 8. Nối vào vòng đời của trang
  // =====================================================================
  function taiTabCon() {
    if (trangThai.sub === 'huuhieu') { lamMoiChuaGhi(); veSo('huu_hieu', 'trudoSoHuuHieu'); }
    else if (trangThai.sub === 'baptem') veSo('bap_tem', 'trudo-sub-baptem');
    else if (trangThai.sub === 'btdule') veSo('bap_tem_du_le', 'trudo-sub-btdule');
    else if (trangThai.sub === 'chien') veSo('chien_bi_mat', 'trudo-sub-chien');
    else if (trangThai.sub === 'xephang') veXepHang();
  }

  themCss();
  if (!dungKhung()) return;

  const _showPanelCu = showPanel;
  window.showPanel = function (name) {
    _showPanelCu(name);
    if (name === 'trudo') taiTabCon();
  };

  const _loadAllCu = loadAll;
  window.loadAll = function () {
    _loadAllCu();
    veBanner();
  };

  const oThang = document.getElementById('kvMonth');
  if (oThang) oThang.addEventListener('change', veBanner);
})();
