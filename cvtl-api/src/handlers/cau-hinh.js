// Cấu hình dùng chung: danh sách Khu vực / Tiến độ / Người dẫn dắt.

export async function getDropdownOptions({ db }) {
  const rows = await db.all('SELECT loai, gia_tri FROM config_list ORDER BY loai, thu_tu, id');
  const gom = (loai) => rows.filter((r) => r.loai === loai).map((r) => r.gia_tri);
  return {
    khuVuc: gom('khu_vuc'),
    tienDo: gom('tien_do'),
    nguoiDanDat: gom('nguoi_dan_dat'),
  };
}
