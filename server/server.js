require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const app     = express();

app.use(cors());
app.use(express.json());

// ============================================================
//  Quản lý session Shopee
// ============================================================

let session = {
  cookie:    '',
  csrfToken: '',
  expiresAt: 0,
};

// Đăng nhập Shopee Affiliate, lấy cookie và csrf-token
async function login() {
  console.log('Đang đăng nhập Shopee Affiliate...');

  const resp = await fetch('https://affiliate.shopee.vn/api/v1/login/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':   'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      'Origin':       'https://affiliate.shopee.vn',
      'Referer':      'https://affiliate.shopee.vn/login',
    },
    body: JSON.stringify({
      username: process.env.SHOPEE_USER,
      password: process.env.SHOPEE_PASS,
    }),
  });

  // Lấy cookie từ response headers
  const setCookies = resp.headers.raw()['set-cookie'] || [];
  const cookieStr  = setCookies.map(c => c.split(';')[0]).join('; ');
  const csrfToken  = setCookies
    .map(c => c.split(';')[0])
    .find(c => c.startsWith('csrftoken='))
    ?.replace('csrftoken=', '') || '';

  const json = await resp.json();
  if (json.code !== 0 && json.code !== undefined) {
    throw new Error('Đăng nhập thất bại: ' + (json.message || json.code));
  }

  session = {
    cookie:    cookieStr,
    csrfToken: csrfToken,
    expiresAt: Date.now() + 6 * 60 * 60 * 1000, // 6 giờ
  };

  console.log('Đăng nhập thành công!');
}

// Tự động đăng nhập lại khi session hết hạn
async function ensureSession() {
  if (!session.cookie || Date.now() > session.expiresAt) {
    await login();
  }
}

// ============================================================
//  API endpoint: chuyển đổi 1 link
// ============================================================

app.post('/convert', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Thiếu URL' });

  try {
    await ensureSession();

    const body = JSON.stringify({
      operationName: 'batchGetCustomLink',
      query: `
        query batchGetCustomLink($linkParams: [CustomLinkParam!], $sourceCaller: SourceCaller){
          batchCustomLink(linkParams: $linkParams, sourceCaller: $sourceCaller){
            shortLink longLink failCode
          }
        }
      `,
      variables: {
        linkParams: [{
          originalLink:       url,
          advancedLinkParams: {},
          sourceCaller:       'CUSTOM_LINK_CALLER',
        }],
        sourceCaller: 'CUSTOM_LINK_CALLER',
      }
    });

    const shopeeResp = await fetch('https://affiliate.shopee.vn/api/v3/gql?q=batchCustomLink', {
      method: 'POST',
      headers: {
        'Content-Type':           'application/json; charset=UTF-8',
        'Accept':                 'application/json, text/plain, */*',
        'Accept-Language':        'vi-VN,vi;q=0.9',
        'User-Agent':             'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
        'Cookie':                 session.cookie,
        'Csrf-Token':             session.csrfToken,
        'Affiliate-Program-Type': '1',
        'Origin':                 'https://affiliate.shopee.vn',
        'Referer':                'https://affiliate.shopee.vn/',
      },
      body,
    });

    const json = await shopeeResp.json();

    // Nếu session hết hạn → đăng nhập lại và thử lại 1 lần
    if (json?.error === 90309999 || json?.is_login === false) {
      session.expiresAt = 0;
      await ensureSession();
      return res.status(401).json({ error: 'Session hết hạn, thử lại' });
    }

    const item = json?.data?.batchCustomLink?.[0];
    if (!item)               return res.status(401).json({ error: 'Đăng nhập thất bại' });
    if (item.failCode !== 0) return res.status(400).json({ error: 'failCode ' + item.failCode });

    res.json({ affLink: item.shortLink || item.longLink });

  } catch (e) {
    console.error('Lỗi:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Kiểm tra server còn sống không
app.get('/ping', (req, res) => res.json({ ok: true }));

// Khởi động
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server chạy tại port ${PORT}`);
  try { await login(); }
  catch (e) { console.error('Lỗi đăng nhập:', e.message); }
});
