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

const BATCH_SIZE = 5;

async function convertUrls(urls) {
  const results = {};

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    console.log(`[content] batch ${Math.floor(i / BATCH_SIZE) + 1}`, batch);

    let batchResults;
    try {
      const batchMap = await fetchBatchCustomLink(batch);
      if (batch.every(url => batchMap[url]?.affLink)) {
        batchResults = batchMap;
      }
    } catch (e) {
      console.warn('[content] batch API failed, falling back to page UI', e.message);
    }

    if (!batchResults) {
      const ui = await convertAllViaPageUi(batch);
      batchResults = ui.results;
    }

    Object.assign(results, batchResults);

    if (i + BATCH_SIZE < urls.length) await sleep(1000);
  }

  return { results };
}

// ============================================================
//  Batch API
// ============================================================

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

  if (json?.error || json?.is_login === false) throw new Error('Chưa đăng nhập hoặc session hết hạn');

  const items = json?.data?.batchCustomLink;
  if (!items) throw new Error('Không nhận được kết quả từ API');

  const resultMap = {};
  urls.forEach((url, i) => {
    const item = items[i];
    if (!item || item.failCode !== 0) {
      resultMap[url] = { error: item ? 'Shopee lỗi: ' + item.failCode : 'Không nhận được link' };
    } else {
      resultMap[url] = { affLink: item.shortLink || item.longLink };
    }
  });
  return resultMap;
}

// ============================================================
//  Page UI — submit tất cả URLs 1 lần, đọc kết quả theo thứ tự
// ============================================================

async function convertAllViaPageUi(urls) {
  const inputField = findAffiliateInputField();
  const button = findAffiliateSubmitButton();

  if (!inputField || !button) throw new Error('Không tìm thấy form chuyển đổi trên trang affiliate');

  // Ghi nhớ các short link đã có trên trang + chính các link input để loại trừ
  const existingLinks = new Set(collectAllShortLinks());
  urls.forEach(u => existingLinks.add(u));

  inputField.focus();
  inputField.value = urls.join('\n');
  inputField.dispatchEvent(new Event('input', { bubbles: true }));
  inputField.dispatchEvent(new Event('change', { bubbles: true }));
  button.click();

  // Chờ đủ N link mới xuất hiện (không tính link cũ)
  const newLinks = await waitForNewLinks(urls.length, existingLinks);
  console.log('[content] page UI got new links', newLinks);

  // Map theo thứ tự
  const results = {};
  urls.forEach((url, i) => {
    if (newLinks[i]) {
      results[url] = { affLink: newLinks[i] };
    } else {
      results[url] = { error: 'Không nhận được kết quả' };
    }
  });

  // Reset input
  inputField.value = '';
  inputField.dispatchEvent(new Event('input', { bubbles: true }));

  return { results };
}

async function waitForNewLinks(count, existingLinks) {
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const all = collectAllShortLinks().filter(l => !existingLinks.has(l));
    if (all.length >= count) return all.slice(0, count);
    await sleep(500);
  }
  // Trả về những gì thu thập được dù chưa đủ
  return collectAllShortLinks().filter(l => !existingLinks.has(l));
}

function collectAllShortLinks() {
  const pattern = /https?:\/\/s\.shopee\.vn\/[A-Za-z0-9]+/g;
  const seen = new Set();
  const links = [];
  for (const el of document.querySelectorAll('input, textarea, div, span, p, label, a')) {
    const text = getCleanText(el).trim();
    if (!text) continue;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      if (!seen.has(m[0])) { seen.add(m[0]); links.push(m[0]); }
    }
    pattern.lastIndex = 0;
  }
  return links;
}

// ============================================================
//  Helpers
// ============================================================

function findAffiliateInputField() {
  const fields = Array.from(document.querySelectorAll('textarea, input[type=text], input:not([type])'));
  const isUsable = el => !el.disabled && !el.readOnly && el.offsetParent !== null;
  const isModal = el => !!el.closest('div[role="dialog"], .modal, .ant-modal');
  const isSubId = el => /sub[_-]?id/i.test((el.id || el.name || el.getAttribute('aria-label') || ''));
  const kw = /lấy link|link rút gọn|link|url|đường dẫn|custom link|original/i;

  return fields.find(el => isUsable(el) && !isModal(el) && !isSubId(el) && kw.test(el.placeholder || ''))
    || fields.find(el => isUsable(el) && !isModal(el) && !isSubId(el) && kw.test(el.getAttribute('aria-label') || el.name || el.id || ''))
    || fields.find(el => isUsable(el) && !isModal(el) && el.tagName === 'TEXTAREA')
    || fields.find(el => isUsable(el) && !isModal(el) && !isSubId(el));
}

function findAffiliateSubmitButton() {
  const buttons = Array.from(document.querySelectorAll('button, input[type=button], input[type=submit]'));
  return buttons.find(b => /chuyển đổi|lấy link|tạo link|sao chép|copy/i.test(b.textContent || b.value || ''))
    || buttons.find(b => /submit|convert|tạo|generate/i.test(b.textContent || b.value || ''));
}

function getCleanText(el) {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value;
  return Array.from(el.childNodes)
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .map(n => n.textContent)
    .join(' ');
}

function getCsrfToken() {
  return document.cookie.split(';').map(c => c.trim())
    .find(c => c.startsWith('csrftoken='))?.replace('csrftoken=', '') || '';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
