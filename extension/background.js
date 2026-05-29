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
    sendResponse({ ok: true });
    return true;
  }
});

async function handleConvert(urls, sendResponse) {
  try {
    // Lấy tab đang mở affiliate.shopee.vn
    const tabs = await chrome.tabs.query({ url: 'https://affiliate.shopee.vn/*' });

    if (!tabs.length) {
      // Mở tab affiliate nếu chưa mở
      const tab = await chrome.tabs.create({
        url: 'https://affiliate.shopee.vn/offer/custom_link',
        active: false
      });
      // Chờ tab load xong
      await waitForTab(tab.id);
      tabs.push(tab);
    }

    const tabId = tabs[0].id;

    // Gửi request cho content script trong tab affiliate
    const result = await chrome.tabs.sendMessage(tabId, {
      type:  'CONVERT_URLS',
      urls,
    });

    sendResponse(result);
  } catch (e) {
    sendResponse({ error: e.message });
  }
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
