// ============================================================
//  Content Script — chạy trong tab affiliate.shopee.vn
//  Gọi API Shopee trực tiếp (cùng domain → không bị CORS)
//  Nhận URLs từ background → trả về link aff
// ============================================================

console.log('[content] content script loaded');

if (!window.__shopeeAffToolContentInstalled) {
  window.__shopeeAffToolContentInstalled = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CONVERT_URLS') {
      console.log('[content] CONVERT_URLS received', message.urls);
      convertUrls(message.urls).then(sendResponse).catch((err) => {
        console.error('[content] convertUrls failed', err);
        sendResponse({ results: message.urls.reduce((acc, url) => ({ ...acc, [url]: { error: err.message } }), {}) });
      });
      return true;
    }
  });
}

async function convertUrls(urls) {
  const results = {};

  // Gửi tất cả cùng lúc qua batch API
  let batchMap = {};
  try {
    batchMap = await fetchBatchCustomLink(urls);
  } catch (apiError) {
    console.warn('[content] batch API failed entirely, will fallback all to page UI', apiError);
  }

  // Phân loại: thành công giữ luôn, thất bại fallback page UI
  const fallbackUrls = [];
  for (const url of urls) {
    const r = batchMap[url];
    if (r?.affLink) {
      results[url] = r;
    } else {
      fallbackUrls.push(url);
    }
  }

  for (const url of fallbackUrls) {
    try {
      results[url] = await convertViaPageUi(url);
    } catch (e) {
      console.error('[content] convertViaPageUi error for', url, e);
      results[url] = { error: e.message };
    }
    await sleep(300);
  }

  return { results };
}

// Gửi nhiều URLs cùng lúc, trả về map { url → { affLink } | { error } }
async function fetchBatchCustomLink(urls) {
  const csrfToken = getCsrfToken();
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
      linkParams: urls.map(url => ({
        originalLink:       url,
        advancedLinkParams: {},
        sourceCaller:       'CUSTOM_LINK_CALLER',
      })),
      sourceCaller: 'CUSTOM_LINK_CALLER',
    }
  });

  console.log('[content] fetchBatchCustomLink start', { count: urls.length, csrfToken: csrfToken ? 'yes' : 'no' });
  const resp = await fetch('/api/v3/gql?q=batchCustomLink', {
    method: 'POST',
    headers: {
      'Content-Type':           'application/json; charset=UTF-8',
      'Accept':                 'application/json, text/plain, */*',
      'Csrf-Token':             csrfToken,
      'x-csrftoken':            csrfToken,
      'Affiliate-Program-Type': '1',
      'X-Requested-With':       'XMLHttpRequest',
      'Referer':                'https://affiliate.shopee.vn/offer/custom_link',
    },
    credentials: 'include',
    body,
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  const json = await resp.json();
  console.log('[content] fetchBatchCustomLink body', json);

  if (json?.error || json?.is_login === false) {
    throw new Error('Chưa đăng nhập hoặc session hết hạn');
  }

  const items = json?.data?.batchCustomLink;
  if (!items) throw new Error('Không nhận được kết quả từ API');

  // Map kết quả theo thứ tự linkParams
  const resultMap = {};
  urls.forEach((url, i) => {
    const item = items[i];
    if (!item) {
      resultMap[url] = { error: 'Không nhận được link' };
    } else if (item.failCode !== 0) {
      resultMap[url] = { error: 'Shopee lỗi: ' + item.failCode };
    } else {
      resultMap[url] = { affLink: item.shortLink || item.longLink };
    }
  });
  return resultMap;
}

async function convertViaPageUi(url) {
  console.log('[content] convertViaPageUi start', url);
  const inputField = findAffiliateInputField();
  const button = findAffiliateSubmitButton();

  if (!inputField || !button) {
    console.error('[content] affiliate form missing', { inputField, button });
    throw new Error('Không tìm thấy form chuyển đổi trên trang affiliate');
  }

  const previousValue = inputField.value;
  inputField.focus();
  inputField.value = url;
  inputField.dispatchEvent(new Event('input', { bubbles: true }));
  inputField.dispatchEvent(new Event('change', { bubbles: true }));
  button.click();

  const result = await waitForAffiliateResult(url);

  inputField.value = previousValue;
  inputField.dispatchEvent(new Event('input', { bubbles: true }));
  inputField.dispatchEvent(new Event('change', { bubbles: true }));

  if (!result) {
    throw new Error('Không tìm thấy kết quả chuyển link trên trang');
  }
  return { affLink: result };
}

function findAffiliateInputField() {
  const fields = Array.from(document.querySelectorAll('textarea, input[type=text], input:not([type])'));
  const isUsable = el => !el.disabled && !el.readOnly && el.offsetParent !== null;
  const isResultModal = el => !!el.closest('div[role="dialog"], .modal, .ant-modal');
  const isSubIdField = el => /sub[_-]?id/i.test((el.id || el.name || el.getAttribute('aria-label') || '').toLowerCase());
  const keywords = /lấy link|link rút gọn|link|url|đường dẫn|custom link|original/i;

  const byPlaceholder = fields.find(el => isUsable(el) && !isResultModal(el) && !isSubIdField(el) && keywords.test((el.placeholder || '').toLowerCase()));
  if (byPlaceholder) return byPlaceholder;

  const byLabel = fields.find(el => isUsable(el) && !isResultModal(el) && !isSubIdField(el) && keywords.test((el.getAttribute('aria-label') || el.name || el.id || '').toLowerCase()));
  if (byLabel) return byLabel;

  const textarea = fields.find(el => isUsable(el) && !isResultModal(el) && el.tagName.toLowerCase() === 'textarea');
  if (textarea) return textarea;

  return fields.find(el => isUsable(el) && !isResultModal(el) && !isSubIdField(el));
}

function findAffiliateSubmitButton() {
  const buttons = Array.from(document.querySelectorAll('button, input[type=button], input[type=submit]'));
  return buttons.find(btn => /chuyển đổi|lấy link|tạo link|sao chép|copy/i.test((btn.textContent || btn.value || '').trim()))
    || buttons.find(btn => /submit|convert|tạo|generate/i.test((btn.textContent || btn.value || '').trim()));
}

async function waitForAffiliateResult(originalUrl) {
  const start = Date.now();
  while (Date.now() - start < 25000) {
    const result = findAffiliateResultLinkInDialog() || findShortLinkAnywhere(originalUrl);
    if (result) {
      console.log('[content] waitForAffiliateResult found', result);
      return result;
    }
    await sleep(500);
  }
  return null;
}

function getCleanText(el) {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value;
  return Array.from(el.childNodes)
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .map(n => n.textContent)
    .join(' ');
}

function findShortLinkAnywhere(excludeUrl) {
  const pattern = /https?:\/\/s\.shopee\.vn\/[A-Za-z0-9]+/;
  const elements = Array.from(document.querySelectorAll('input, textarea, div, span, p, label, a'));
  for (const el of elements) {
    const text = getCleanText(el).trim();
    if (!text) continue;
    const match = text.match(pattern);
    if (match && match[0] !== excludeUrl) return match[0];
  }
  return null;
}


function findAffiliateResultLinkInDialog() {
  const patterns = [/https?:\/\/s\.shopee\.vn\/[A-Za-z0-9]+/, /https?:\/\/shopee\.vn\/[^\s"'<>]+/];
  const dialog = document.querySelector('div[role="dialog"], .modal, .ant-modal, .shopee-modal, [class*="dialog"], [class*="modal"]');
  if (!dialog) return null;

  const candidates = Array.from(dialog.querySelectorAll('input, textarea, div, span, p, label'));
  for (const el of candidates) {
    const text = getCleanText(el).trim();
    if (!text) continue;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
  }

  const copyTarget = dialog.querySelector('[data-clipboard-text], [data-clipboard-target], .copy-text, .copy-link, .copy-btn');
  if (copyTarget) {
    const text = (copyTarget.getAttribute('data-clipboard-text') || copyTarget.getAttribute('data-clipboard-target') || copyTarget.textContent || '').trim();
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
  }

  return null;
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
