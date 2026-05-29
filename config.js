// ============================================================
//  CẤU HÌNH SHOPEE AFFILIATE TOOL
//
//  Khi nào cần cập nhật?
//  → Khi bạn bật server mới với URL cloudflared mới
//
//  Cách cập nhật:
//  1. Bật server trên điện thoại (gõ: shopee)
//  2. Copy URL hiện ra (dạng https://xxx.trycloudflare.com)
//  3. Paste vào server_url bên dưới
//  4. Commit + push lên GitHub
// ============================================================

const CONFIG = {

  // URL server trên điện thoại bạn (cập nhật mỗi lần bật server)
  server_url: "",

  // Loại link đầu ra: "short" | "normal"
  link_type: "short",

  // Số link xử lý đồng thời
  bulk_concurrency: 2,

  // Delay giữa các request (ms)
  bulk_delay_ms: 600,

  // Timeout mỗi request (ms)
  request_timeout_ms: 15000,
};
