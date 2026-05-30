// ============================================================
//  Background Service Worker
//  Nhận request từ web GitHub → chuyển cho content script
//  → content script gọi API Shopee → trả kết quả về web
// ============================================================

// Lắng nghe message từ web GitHub Pages qua externally_connectable
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONVERT_LINKS') {
    handleConvert(message.urls, sendResponse);
    return true; // Giữ channel mở để trả về async
  }
  if (message.type === 'PING') {
    console.log('[background] PING received', { sender });
    sendResponse({ ok: true });
    return true;
  }
});

async function handleConvert(urls, sendResponse) {
  console.log('[background] CONVERT_LINKS received', urls);
  try {
    const normalizedUrls = [];
    const results = {};

    for (const originalUrl of urls) {
      const parsed = parseShopeeUrl(originalUrl);
      if (parsed.type === 'short') {
        const resolved = await resolveShortLink(originalUrl);
        const nextParsed = parseShopeeUrl(resolved);
        if (nextParsed.type !== 'ok') {
          results[originalUrl] = { error: 'Không giải được short link' };
          continue;
        }
        normalizedUrls.push({ originalUrl, normalizedUrl: `https://shopee.vn/product/${nextParsed.shopId}/${nextParsed.itemId}` });
      } else if (parsed.type === 'ok') {
        normalizedUrls.push({ originalUrl, normalizedUrl: `https://shopee.vn/product/${parsed.shopId}/${parsed.itemId}` });
      } else {
        results[originalUrl] = { error: parsed.msg };
      }
    }

    console.log('[background] normalizedUrls', normalizedUrls);

    const productUrls = normalizedUrls.map(u => u.normalizedUrl);
    if (productUrls.length) {
      // Lấy tab đang mở affiliate.shopee.vn
      const tabs = await chrome.tabs.query({ url: 'https://affiliate.shopee.vn/*' });
      console.log('[background] affiliate tabs', tabs.map(t => ({ id: t.id, url: t.url })));

      if (!tabs.length) {
        const tab = await chrome.tabs.create({
          url: 'https://affiliate.shopee.vn/offer/custom_link',
          active: false
        });
        await waitForTab(tab.id);
        tabs.push(tab);
      }

      const tabId = tabs[0].id;
      console.log('[background] sending message to tab', tabId);

      await injectContentScript(tabId);

      const result = await sendMessageToTabWithRetry(tabId, {
        type: 'CONVERT_URLS',
        urls: productUrls,
      });

      console.log('[background] received result', result);
      for (const item of normalizedUrls) {
        const linkResult = result?.results?.[item.normalizedUrl];
        if (linkResult) {
          results[item.originalUrl] = linkResult;
        } else {
          results[item.originalUrl] = { error: 'Không nhận được kết quả từ content script' };
        }
      }
    }

    sendResponse({ results });
  } catch (e) {
    console.error('[background] error in handleConvert', e);
    sendResponse({ error: e.message });
  }
}

function parseShopeeUrl(url) {
  try {
    const u = new URL(url.trim()), host = u.hostname.replace('www.', '');
    if (host === 's.shopee.vn' || host === 'shp.ee') return { type: 'short', url };
    if (!host.includes('shopee.')) return { type: 'error', msg: 'Không phải link Shopee' };
    const byPath = u.pathname.match(/\/product\/(\d+)\/(\d+)/);
    if (byPath) return { type: 'ok', shopId: byPath[1], itemId: byPath[2] };
    const bySlug = u.pathname.match(/-i\.(\d+)\.(\d+)(?:$|[?#])/);
    if (bySlug) return { type: 'ok', shopId: bySlug[1], itemId: bySlug[2] };
    const byAlias = u.pathname.match(/^\/[^/]+\/(\d+)\/(\d+)(?:$|[?#])/);
    if (byAlias) return { type: 'ok', shopId: byAlias[1], itemId: byAlias[2] };
    const shopId = u.searchParams.get('shopid') || u.searchParams.get('shopId');
    const itemId = u.searchParams.get('itemid') || u.searchParams.get('itemId');
    if (shopId && itemId) return { type: 'ok', shopId, itemId };
    return { type: 'error', msg: 'Không tìm thấy ID sản phẩm' };
  } catch { return { type: 'error', msg: 'URL không hợp lệ' }; }
}

async function resolveShortLink(shortUrl) {
  console.log('[background] resolveShortLink', shortUrl);
  const resp = await fetch(shortUrl, { method: 'GET', redirect: 'follow' });
  if (!resp.ok) {
    throw new Error(`Không resolve được short link (HTTP ${resp.status})`);
  }
  console.log('[background] resolveShortLink final url', resp.url);
  return resp.url;
}

function waitForTab(tabId) {
  return new Promise(resolve => {
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1000); // Đợi thêm 1s cho page load xong
      }
    });
  });
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    console.log('[background] injected content script into tab', tabId);
  } catch (e) {
    console.warn('[background] injectContentScript failed', e);
  }
}

function sendMessageToTabWithRetry(tabId, message, retries = 2) {
  return new Promise(async (resolve, reject) => {
    let attempt = 0;
    let lastError;

    while (attempt <= retries) {
      attempt += 1;
      try {
        const response = await new Promise((resolveMessage, rejectMessage) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
              rejectMessage(new Error(chrome.runtime.lastError.message));
            } else {
              resolveMessage(response);
            }
          });
        });
        return resolve(response);
      } catch (err) {
        lastError = err;
        console.warn(`[background] sendMessage attempt ${attempt} failed`, err.message);
        if (attempt > retries) break;
        await sleep(500);
        await injectContentScript(tabId);
      }
    }

    reject(lastError);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
