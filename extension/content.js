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

  for (const url of urls) {
    try {
      results[url] = await convertOne(url);
    } catch (e) {
      console.error('[content] convertOne error for', url, e);
      results[url] = { error: e.message };
    }
    // Delay nhỏ tránh rate limit
    await sleep(300);
  }

  return { results };
}

async function convertOne(url) {
  try {
    return await fetchBatchCustomLink(url);
  } catch (apiError) {
    console.warn('[content] batch custom link API failed, fallback to page UI', apiError);
    return await convertViaPageUi(url);
  }
}

async function fetchBatchCustomLink(url) {
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

  console.log('[content] fetchBatchCustomLink start', { url, csrfToken: csrfToken ? 'yes' : 'no' });
  const resp = await fetch('/api/v3/gql?q=batchCustomLink', {
    method: 'POST',
    headers: {
      'Content-Type':           'application/json; charset=UTF-8',
      'Accept':                 'application/json, text/plain, */*',
      'Csrf-Token':             csrfToken,
      'x-csrftoken':           csrfToken,
      'Affiliate-Program-Type': '1',
      'X-Requested-With':      'XMLHttpRequest',
      'Referer':                'https://affiliate.shopee.vn/offer/custom_link',
    },
    credentials: 'include',
    body,
  });

  console.log('[content] fetchBatchCustomLink response', { status: resp.status, statusText: resp.statusText });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  }
  const json = await resp.json();
  console.log('[content] fetchBatchCustomLink body', json);

  if (json?.error || json?.is_login === false) {
    throw new Error('Chưa đăng nhập hoặc session hết hạn');
  }

  const item = json?.data?.batchCustomLink?.[0];
  if (!item) throw new Error('Không nhận được link');
  if (item.failCode !== 0) throw new Error('Shopee lỗi: ' + item.failCode);

  return { affLink: item.shortLink || item.longLink };
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

function findShortLinkAnywhere(excludeUrl) {
  const pattern = /https?:\/\/s\.shopee\.vn\/[A-Za-z0-9]+/;
  const elements = Array.from(document.querySelectorAll('input, textarea, div, span, p, label, a'));
  for (const el of elements) {
    const text = (el.value || el.textContent || '').trim();
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
    const text = (el.value || el.textContent || '').trim();
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
