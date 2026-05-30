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
    let tabs = await chrome.tabs.query({ url: 'https://affiliate.shopee.vn/*' });
    if (!tabs.length) {
      const tab = await chrome.tabs.create({ url: 'https://affiliate.shopee.vn/offer/custom_link', active: false });
      await waitForTab(tab.id);
      tabs = [tab];
    }

    const tabId = tabs[0].id;
    await injectContentScript(tabId);

    const result = await sendMessageToTabWithRetry(tabId, { type: 'CONVERT_URLS', urls });
    console.log('[background] received result', result);

    const results = {};
    for (const url of urls) {
      results[url] = result?.results?.[url] ?? { error: 'Không nhận được kết quả từ content script' };
    }
    sendResponse({ results });
  } catch (e) {
    console.error('[background] error in handleConvert', e);
    sendResponse({ error: e.message });
  }
}

function waitForTab(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab không load xong sau ' + timeout / 1000 + 's'));
    }, timeout);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        setTimeout(resolve, 1000);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
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

async function sendMessageToTabWithRetry(tabId, message, retries = 2) {
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    } catch (err) {
      lastError = err;
      console.warn(`[background] sendMessage attempt ${attempt} failed`, err.message);
      if (attempt <= retries) {
        await sleep(500);
        await injectContentScript(tabId);
      }
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
//  Relay polling — cho điện thoại dùng qua ngrok
// ============================================================

const RELAY = 'http://localhost:8080';

async function pollRelay() {
  try {
    const resp = await fetch(`${RELAY}/api/jobs`);
    if (!resp.ok) return;
    const jobs = await resp.json();
    for (const [jobId, urls] of Object.entries(jobs)) {
      processRelayJob(jobId, urls);
    }
  } catch {}
}

async function processRelayJob(jobId, urls) {
  try {
    let tabs = await chrome.tabs.query({ url: 'https://affiliate.shopee.vn/*' });
    if (!tabs.length) {
      const tab = await chrome.tabs.create({ url: 'https://affiliate.shopee.vn/offer/custom_link', active: false });
      await waitForTab(tab.id);
      tabs = [tab];
    }
    const tabId = tabs[0].id;
    await injectContentScript(tabId);
    const result = await sendMessageToTabWithRetry(tabId, { type: 'CONVERT_URLS', urls });
    const results = {};
    for (const url of urls) {
      results[url] = result?.results?.[url] ?? { error: 'Không nhận được kết quả' };
    }
    await fetch(`${RELAY}/api/result/${jobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results }),
    });
  } catch (e) {
    await fetch(`${RELAY}/api/result/${jobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message }),
    }).catch(() => {});
  }
}

setInterval(pollRelay, 2000);
