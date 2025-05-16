// 定义标签页信息接口
interface TabInfo {
  id: number;
  index: number;
  url: string;
  domain: string;
}

// 从URL中提取主域名
function extractMainDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostParts = urlObj.hostname.split('.');
    if (hostParts.length > 2) {
      return hostParts.slice(-2).join('.');
    }
    return urlObj.hostname;
  } catch (e) {
    return url;
  }
}

// 获取所有标签页并按域名排序
async function sortTabs() {
  try {
    // 获取当前窗口
    const currentWindow = await chrome.windows.getCurrent();
    if (!currentWindow.id) {
      throw new Error('Could not get current window id');
    }
    
    // 获取当前窗口的所有标签页
    const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
    
    // 将标签页信息转换为可排序的数组，并提取域名
    const tabInfos = tabs
      .filter(tab => tab.id !== undefined && tab.url)
      .map(tab => ({
        id: tab.id!,
        index: tab.index,
        url: tab.url!,
        domain: extractMainDomain(tab.url!)
      }));

    // 按域名排序
    tabInfos.sort((a, b) => a.domain.localeCompare(b.domain));

    // 移动标签页到新的位置
    for (let i = 0; i < tabInfos.length; i++) {
      await chrome.tabs.move(tabInfos[i].id, { index: i });
    }
  } catch (error) {
    console.error('Error sorting tabs:', error);
  }
}

// 监听扩展图标点击事件
chrome.action.onClicked.addListener(() => {
  sortTabs();
}); 