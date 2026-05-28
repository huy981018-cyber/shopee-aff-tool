// ============================================================
//  CẤU HÌNH SHOPEE AFFILIATE API
//  Điền thông tin của bạn vào đây.
//  Lấy App ID và Secret tại: https://affiliate.shopee.vn/open-api
// ============================================================

const CONFIG = {

  // ----------------------------------------------------------
  //  THÔNG TIN TÀI KHOẢN AFFILIATE
  // ----------------------------------------------------------

  // App ID từ Shopee Affiliate Portal (chuỗi số)
  app_id: "",

  // Secret Key từ Shopee Affiliate Portal
  secret: "",

  // Sub ID để theo dõi nguồn traffic (tùy chọn, để trống nếu không dùng)
  // Ví dụ: "facebook", "telegram", "group1"
  sub_id: "",

  // ----------------------------------------------------------
  //  TÙY CHỌN LINK ĐẦU RA
  // ----------------------------------------------------------

  // Loại link tạo ra: "short" (s.shopee.vn/xxx) | "normal" (link đầy đủ)
  link_type: "short",

  // ----------------------------------------------------------
  //  CÀI ĐẶT KỸ THUẬT (thường không cần thay đổi)
  // ----------------------------------------------------------

  // Endpoint GraphQL của Shopee Affiliate Open API
  api_endpoint: "https://open-api.affiliate.shopee.vn/graphql",

  // Timeout cho mỗi request (milliseconds)
  request_timeout_ms: 10000,

  // Số link xử lý đồng thời trong bulk mode (1-5)
  bulk_concurrency: 2,

  // Delay giữa các request (ms) để tránh rate limit
  bulk_delay_ms: 500,
};
