// ============================================================
//  Content Script — chạy trong tab affiliate.shopee.vn
//  Gọi API Shopee trực tiếp (cùng domain → không bị CORS)
//  Nhận URLs từ background → trả về link aff
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONVERT_URLS') {
    convertUrls(message.urls).then(sendResponse);
    return true;
  }
});

async function convertUrls(urls) {
  const results = {};

  for (const url of urls) {
    try {
      results[url] = await convertOne(url);
    } catch (e) {
      results[url] = { error: e.message };
    }
    // Delay nhỏ tránh rate limit
    await sleep(300);
  }

  return { results };
}

async function convertOne(url) {
  const body = JSON.stringify({
    operationName: 'batchGetCustomLink',
    query: `
      query batchGetCustomLink($linkParams: [CustomLinkParam!], $sourceCaller: SourceCaller){
        batchCustomLink(linkParams: $linkParams, sourceCaller: $sourceCaller){
          shortLink
          longLink
          failCode
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

  // Lấy csrf token từ cookie
  const csrfToken = getCsrfToken();

  const resp = await fetch('https://affiliate.shopee.vn/api/v3/gql?q=batchCustomLink', {
    method: 'POST',
    headers: {
      'Content-Type':           'application/json; charset=UTF-8',
      'Accept':                 'application/json, text/plain, */*',
      'Csrf-Token':             csrfToken,
      'Affiliate-Program-Type': '1',
      'Origin':                 'https://affiliate.shopee.vn',
      'Referer':                'https://affiliate.shopee.vn/offer/custom_link',
    },
    credentials: 'include', // Tự động gửi cookie đã đăng nhập
    body,
  });

  const json = await resp.json();

  if (json?.error || json?.is_login === false) {
    throw new Error('Chưa đăng nhập hoặc session hết hạn');
  }

  const item = json?.data?.batchCustomLink?.[0];
  if (!item)               throw new Error('Không nhận được link');
  if (item.failCode !== 0) throw new Error('Shopee lỗi: ' + item.failCode);

  return { affLink: item.shortLink || item.longLink };
}

// Lấy csrftoken từ cookie của trang
function getCsrfToken() {
  return document.cookie
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('csrftoken='))
    ?.replace('csrftoken=', '') || '';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
