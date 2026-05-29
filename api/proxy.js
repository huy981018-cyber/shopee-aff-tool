// ============================================================
//  Vercel Serverless Function — Proxy tới Shopee Affiliate API
//
//  Tại sao cần file này?
//  → Trình duyệt không thể gọi thẳng tới affiliate.shopee.vn
//    vì Shopee chặn request từ domain khác (CORS policy).
//  → File này chạy trên server Vercel, đóng vai trò trung gian:
//    Trình duyệt → /api/proxy (Vercel) → affiliate.shopee.vn
//
//  File này KHÔNG cần chỉnh sửa.
// ============================================================

export default async function handler(req, res) {

  // Cho phép trình duyệt gọi tới endpoint này từ bất kỳ domain nào
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cookie, X-Csrf-Token, X-Af-Enc-Token, X-Af-Enc-Dat');

  // Trình duyệt gửi OPTIONS trước khi gửi POST thật — trả lời ngay
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end('Method not allowed');

  // Nhận credentials từ tool (đặt tên X- vì browser chặn gửi Cookie trực tiếp)
  const cookie     = req.headers['x-cookie']       || '';
  const csrfToken  = req.headers['x-csrf-token']   || '';
  const afEncToken = req.headers['x-af-enc-token'] || '';
  const afEncDat   = req.headers['x-af-enc-dat']   || '';

  // Vercel tự parse JSON body thành object — stringify lại để forward sang Shopee
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  try {
    const shopeeResp = await fetch('https://affiliate.shopee.vn/api/v3/gql?q=batchCustomLink', {
      method: 'POST',
      headers: {
        'Content-Type':           'application/json; charset=UTF-8',
        'Cookie':                 cookie,
        'Csrf-Token':             csrfToken,
        'Af-Ac-Enc-Sz-Token':    afEncToken,
        'Af-Ac-Enc-Dat':         afEncDat,
        'Affiliate-Program-Type': '1',
        'Origin':  'https://affiliate.shopee.vn',
        'Referer': 'https://affiliate.shopee.vn/',
      },
      body,
    });

    const text = await shopeeResp.text();
    console.log('Shopee response status:', shopeeResp.status);
    console.log('Shopee response body:', text);

    res.status(shopeeResp.status)
       .setHeader('Content-Type', 'application/json')
       .end(text);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
