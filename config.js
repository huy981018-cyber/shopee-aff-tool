// ============================================================
//  CẤU HÌNH SHOPEE AFF TOOL
//
//  Sau khi cài Extension lên Chrome:
//  1. Vào chrome://extensions → bật Developer mode
//  2. Load unpacked → chọn thư mục extension/
//  3. Copy Extension ID hiện ra → paste vào extension_id bên dưới
//  4. Commit + push lên GitHub
// ============================================================

const CONFIG = {

  // ID của Chrome Extension (lấy từ chrome://extensions sau khi cài)
  extension_id: "gmfngolmhfkcmjankdbpihmcpdhiimap",

  // Số link xử lý đồng thời
  bulk_concurrency: 2,

  // Delay giữa các batch (ms)
  bulk_delay_ms: 500,
};
