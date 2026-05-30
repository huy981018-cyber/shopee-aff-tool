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
        setTimeout(resolve, 500);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function injectContentScript(tabId) {
  if (injectedTabs.has(tabId)) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    injectedTabs.add(tabId);
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
        await sleep(200);
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
const activeJobs = new Set();
const injectedTabs = new Set();

// Xóa cache khi tab navigate hoặc đóng
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') injectedTabs.delete(tabId);
});
chrome.tabs.onRemoved.addListener(tabId => injectedTabs.delete(tabId));

async function relayLoop() {
  while (true) {
    try {
      const resp = await fetch(`${RELAY}/api/jobs`);
      if (!resp.ok) { await sleep(1000); continue; }
      const jobs = await resp.json();
      for (const [jobId, job] of Object.entries(jobs)) {
        if (!activeJobs.has(jobId)) {
          activeJobs.add(jobId);
          await processRelayJob(jobId, job.urls ?? job); // tuần tự — không spawn song song
        }
      }
    } catch {
      await sleep(1000);
    }
  }
}

async function processRelayJob(jobId, urls) {
  let payload;
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
    payload = { results };
  } catch (e) {
    payload = { error: e.message };
  } finally {
    activeJobs.delete(jobId);
  }
  await fetch(`${RELAY}/api/result/${jobId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

relayLoop();

// Heartbeat mỗi 5s để relay biết extension còn sống
async function heartbeatLoop() {
  while (true) {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://affiliate.shopee.vn/*' });
      const affiliateTab = tabs.length > 0;
      await fetch(`${RELAY}/api/heartbeat`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ affiliate_tab: affiliateTab }),
      });
    } catch {}
    await sleep(5000);
  }
}
heartbeatLoop();
