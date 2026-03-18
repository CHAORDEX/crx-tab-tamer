// 定义标签页信息接口
interface TabInfo {
  id: number;
  index: number;
  url: string;
  domain: string;
  groupId: number;
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

/**
 * 获取所有标签页并按域名排序
 * 排序逻辑：
 * 1. 按 groupId 分组，分组内的标签页只在分组内部排序
 * 2. 分组外的标签页在分组外排序
 * 3. 排序后保持各分组原有的相对位置（即槽位）不变，避免分组被破坏
 */
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
    const tabInfos: TabInfo[] = tabs
      .filter(tab => tab.id !== undefined && tab.url)
      .map(tab => ({
        id: tab.id!,
        index: tab.index,
        url: tab.url!,
        domain: extractMainDomain(tab.url!),
        groupId: tab.groupId !== undefined ? tab.groupId : -1
      }));

    // 1. 将标签页按 groupId 分组
    const groupMap = new Map<number, TabInfo[]>();
    for (const tab of tabInfos) {
      if (!groupMap.has(tab.groupId)) {
        groupMap.set(tab.groupId, []);
      }
      groupMap.get(tab.groupId)!.push(tab);
    }

    // 2. 对每个分组内的标签页分别按域名排序
    for (const groupTabs of groupMap.values()) {
      groupTabs.sort((a, b) => a.domain.localeCompare(b.domain));
    }

    // 3. 重组标签页，保持各个分组原有的相对位置（即原有槽位）
    const sortedTabInfos: TabInfo[] = [];
    const groupIndexMap = new Map<number, number>();
    for (const groupId of groupMap.keys()) {
      groupIndexMap.set(groupId, 0);
    }

    for (const originalTab of tabInfos) {
      const groupId = originalTab.groupId;
      const currentIndex = groupIndexMap.get(groupId)!;
      const sortedTabsForGroup = groupMap.get(groupId)!;

      sortedTabInfos.push(sortedTabsForGroup[currentIndex]);
      groupIndexMap.set(groupId, currentIndex + 1);
    }

    // 4. 一次性移动所有标签页到新的位置
    // 使用数组可以提高性能，并避免逐个移动导致的中间状态破坏分组
    const tabIds = sortedTabInfos.map(tab => tab.id);
    if (tabIds.length > 0) {
      await chrome.tabs.move(tabIds, { index: 0 });
    }
  } catch (error) {
    console.error('Error sorting tabs:', error);
  }
}

// 监听扩展图标点击事件
chrome.action.onClicked.addListener(() => {
  sortTabs();
}); 