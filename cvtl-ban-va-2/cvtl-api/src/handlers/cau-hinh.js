// Cấu hình dùng chung: danh sách Khu vực / Tiến độ / Người dẫn dắt.
//
// ⚠️ TÊN TRƯỜNG PHẢI GIỮ ĐÚNG: toList / tienDoList / nddList.
// Giao diện (index.html, hàm loadDropdowns) đọc đúng ba tên này. Đặt tên khác
// đi thì mọi ô chọn Khu vực / Tiến độ / Người dẫn dắt sẽ trống trơn.

import { KHU_VUC_LIST } from '../hang-so.js';

export async function getDropdownOptions({ db }) {
  const rows = await db.all('SELECT loai, gia_tri FROM config_list ORDER BY loai, thu_tu, id');
  const gom = (loai) => rows.filter((r) => r.loai === loai).map((r) => r.gia_tri);

  const toList = gom('khu_vuc');
  return {
    // Chưa nhập Config thì vẫn có sẵn danh sách Khu vực mặc định, để giao diện
    // không bị "chết cứng" ngay lần đầu chạy.
    toList: toList.length ? toList : KHU_VUC_LIST.slice(),
    tienDoList: gom('tien_do'),
    nddList: gom('nguoi_dan_dat'),
  };
}
