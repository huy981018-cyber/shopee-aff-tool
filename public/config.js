// ============================================================
//  CẤU HÌNH SHOPEE AFFILIATE TOOL
//
//  Khi nào cần cập nhật file này?
//  → Khi tool báo lỗi "Cookie/token hết hạn" — thường sau 1-7 ngày
//
//  Cách lấy thông tin mới:
//  1. Đăng nhập vào https://affiliate.shopee.vn
//  2. Nhấn F12 → chọn tab "Network"
//  3. Tạo 1 link affiliate bất kỳ trên trang
//  4. Trong danh sách Network, click vào dòng "gql?q=batchCustomLink"
//  5. Chọn tab "Headers" → kéo xuống phần "Request Headers"
//  6. Copy từng giá trị tương ứng vào các trường bên dưới
// ============================================================

const CONFIG = {

  // Toàn bộ chuỗi dài ở dòng "cookie:" trong Request Headers
  cookie: "SPC_CLIENTID=U7JY15mJJTeQ70uuclsvltceclwjwkrx; _fbp=fb.1.1771903191668.503510256678002063; language=vi; _hjSessionUser_868286=eyJpZCI6ImU1YTVjYTU1LTk4MzktNTJmMy04ZWIzLTE1NTdjMzQ5NzQxZCIsImNyZWF0ZWQiOjE3NzE5MDMzMTI2OTUsImV4aXN0aW5nIjp0cnVlfQ==; _gac_UA-61914164-6=1.1772785765.Cj0KCQiAk6rNBhCxARIsAN5mQLvCOFCzAkb6UOI_QW4dSHsqmvWgHulUmcQDZVsRPO9O64_sP_2BFNgaAp6pEALw_wcB; _ga=GA1.1.1913181204.1771903193; REC_T_ID=7d833adf-54fc-11f1-b684-ba56a4d07c97; SPC_F=ZSUTd1770khyQkSqYRD5qMMy5qAl61Il; _gcl_gs=2.1.k1$i1779357897$u261188175; _gcl_aw=GCL.1779357900.EAIaIQobChMIhKOSzpDKlAMVFsM8Ah2aeQlREAQYAiABEgJvMvD_BwE; _gcl_au=1.1.1144940256.1780023837; _med=refer; language=vi; _sapid=003d94e51d3f8d8f056058e76692ac738ac8da3791f777c1b1403755; _QPWSDCXHZQA=4c7f3e5b-b0da-4c17-9441-ee50fa1e63a5; REC7iLP4Q=1a1f347e-ecbe-4966-a75a-aaa72c9cb013; _med=refer; csrftoken=P73GGWtAWXNyklqnkhkQf4Rq2EeBZJqp; SPC_SI=aIsFagAAAABHU2dzWE5CcDB03wAAAAAASEJ5bzk3Z2g=; SPC_EC=ZVNQYk4xTUM0cnJSNmF4QmIAXhbRcjL7PujHv2b2dAxhk8y6c8Yrm10VZ0HqtPwSQb3LqgYeAI71mValuWR7XiuTJc54sG2sdUZD1AmOJ99Qs7w2bU37bafCK84B/rzN1HI+ncISFfS0RdRr8SfBJapdOrg46uhWPi07DjeH/8JJPg0HVp3ExuqzMFIP/x754XrbRH1pbhDYACi2khOWgw==.AGqc4F5MI3wZTCrrzhnrZ1Nq/EBnTx+UMDFoSkMhgEJX; SPC_ST=cnZKSUhQQzRwMnlmMFoxMdaXu+O8S12fnOYV3swmJq7//5xtVXzxZpZqmyukWCeP1cTKJAJ3OPirxHCR/ea4gL+HwevTVVdBKWEQTG/AruHhd0eJH0HySXi9aACqBoKv2SxdIXN1yQg6w+BZBaVTzQzdKE+u2qvZArPI5/O8px15S22Lll/QZhZrASIc/LSkay6mcKlDdBYtol7LYMeHqA==.AMOIFxZAtrkYbQLQXnqnJcGj/MBjYjkjdkk8c01aPhTd; SPC_U=70134550; SPC_T_IV=ZXk5aVlPc0J3ZmE2Z3pKcA==; SPC_R_T_ID=iXPi8UjFrLsztTxmAp5BU5zCGWt1qj5LzotLsSigO3d/q0UL1Usld+e2hgU7+hfASxcUJqPSVQqY2zcMP+Y4wiMJh5M3+G6STDTlKl1yor+sY996lpn0mglx+tYTMBNlKnH5cisHZDh9Ull1ntJmwD0rhA7dGZq0r2F9ICEuCac=; SPC_R_T_IV=ZXk5aVlPc0J3ZmE2Z3pKcA==; SPC_T_ID=iXPi8UjFrLsztTxmAp5BU5zCGWt1qj5LzotLsSigO3d/q0UL1Usld+e2hgU7+hfASxcUJqPSVQqY2zcMP+Y4wiMJh5M3+G6STDTlKl1yor+sY996lpn0mglx+tYTMBNlKnH5cisHZDh9Ull1ntJmwD0rhA7dGZq0r2F9ICEuCac=; SPC_CDS_CHAT=31b6ab0d-69a2-4ea2-a48e-0f1d89a3f6dd; shopee_webUnique_ccd=%2BHfzJJY3On6sfZZJhtVzZQ%3D%3D%7CtGiw9nbZASqNonG0nWo9X1cK%2FMet2%2B46EHHSMr4tGjNylgy0Ljsl5xmrIIl1jb3omxWZGy8qas%2FCQyU%3D%7CZu%2B3I7vImmiwZ%2BSj%7C08%7C3; ds=f19230e54905e519c4faf4c5a32ba03c; _ga_4GPP1ZXG63=GS2.1.s1780034690$o10$g1$t1780034760$j60$l0$h1910920329",

  // Giá trị ở dòng "csrf-token:" trong Request Headers
  csrf_token: "4zKNjTKm-IJzP6sUk0XtcO-ukPJFVCuIQ8fE",

  // ── Tùy chọn ──────────────────────────────────────────────

  // Loại link đầu ra:
  //   "short"  → link ngắn dạng https://s.shopee.vn/xxxxx  (mặc định)
  //   "normal" → link đầy đủ
  link_type: "short",

  // ── Cài đặt kỹ thuật (thường không cần thay đổi) ──────────

  // Thời gian chờ tối đa mỗi request (milliseconds)
  request_timeout_ms: 10000,

  // Số link xử lý đồng thời (khuyến nghị 2, tối đa 5)
  bulk_concurrency: 2,

  // Thời gian chờ giữa các batch (ms) — giảm nếu muốn nhanh hơn
  bulk_delay_ms: 500,
};
