// 定义标签页信息接口
interface TabInfo {
  id: number;
  index: number;
  url: string;
  title: string;
  domain: string;
  groupId: number;
  bigTheme: string;
  smallTheme: string;
  themeWeight: number;
}

// 主题分类规则
const CATEGORY_RULES = [
  // AI 相关
  { keywords: ['chatgpt', 'claude', 'gemini', 'qwen', 'kimi', 'ernie', 'tongyi', 'openai', 'anthropic'], bigTheme: 'AI', smallTheme: '大模型', weight: 10 },
  { keywords: ['coze', 'dify', 'agent', 'fastgpt', 'autogen', 'bot', 'copilot'], bigTheme: 'AI', smallTheme: '智能体', weight: 11 },
  { keywords: ['midjourney', 'stable diffusion', 'runway', 'suno', 'civitai'], bigTheme: 'AI', smallTheme: 'AIGC', weight: 12 },

  // 娱乐相关
  { keywords: ['youtube', 'bilibili', 'netflix', 'vimeo', 'iqiyi', 'youku', 'tencent video', 'video'], bigTheme: '娱乐', smallTheme: '视频', weight: 20 },
  { keywords: ['spotify', 'music.163', 'y.qq', 'soundcloud', 'music'], bigTheme: '娱乐', smallTheme: '音乐', weight: 21 },
  { keywords: ['twitter', 'weibo', 'reddit', 'douban', 'zhihu', 'tieba', 'facebook', 'instagram', 'social'], bigTheme: '娱乐', smallTheme: '社交', weight: 22 },
  { keywords: ['game', 'steam', 'epic', 'ign', 'twitch'], bigTheme: '娱乐', smallTheme: '游戏', weight: 23 },

  // 导航/搜索相关
  { keywords: ['google', 'bing', 'baidu', 'duckduckgo', 'search'], bigTheme: '导航', smallTheme: '搜索引擎', weight: 30 },
  { keywords: ['hao123', 'navigation', 'portal', '123'], bigTheme: '导航', smallTheme: '门户', weight: 31 },

  // 工作/开发相关
  { keywords: ['github', 'gitlab', 'gitee', 'stackoverflow', 'npm', 'developer', 'mdn', 'juejin', 'csdn'], bigTheme: '开发', smallTheme: '代码', weight: 40 },
  { keywords: ['figma', 'notion', 'jira', 'trello', 'confluence', 'docs', 'office', 'excel', 'word'], bigTheme: '工作', smallTheme: '工具', weight: 41 },
  { keywords: ['mail', 'gmail', 'outlook'], bigTheme: '工作', smallTheme: '邮件', weight: 42 },

  // 购物相关
  { keywords: ['taobao', 'jd', 'amazon', 'pinduoduo', 'shopping', 'buy'], bigTheme: '购物', smallTheme: '电商', weight: 50 },
];

// 根据 URL、标题和 desc 对标签页进行分类
function categorizeTab(url: string, title: string, desc: string): { bigTheme: string, smallTheme: string, weight: number } {
  const textToSearch = `${url} ${title} ${desc}`.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(kw => textToSearch.includes(kw))) {
      return { bigTheme: rule.bigTheme, smallTheme: rule.smallTheme, weight: rule.weight };
    }
  }

  return { bigTheme: '其他', smallTheme: '未分类', weight: 999 };
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

// AI 配置接口
interface AISettings {
  useAi: boolean;
  apiUrl: string;
  apiKey: string;
  model: string;
}

// 获取 AI 配置
async function getAISettings(): Promise<AISettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get({
      useAi: false,
      apiUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: 'bigmodel.api.key',
      model: 'glm-4.7-flash'
    }, (items) => {
      resolve(items as AISettings);
    });
  });
}

// 带超时的 Promise 包装器
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMsg: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMsg));
    }, timeoutMs);
  });

  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => clearTimeout(timeoutHandle));
}

// 使用 AI 对标签页进行批量分类
async function categorizeTabsWithAI(tabsData: any[], settings: AISettings, existingGroups: any[]): Promise<Map<number, { bigTheme: string, smallTheme: string, weight: number, suggestedGroupId?: number }>> {
  const result = new Map();
  if (tabsData.length === 0) return result;

  const groupsInfo = existingGroups.map(g => `ID: ${g.id}, 标题(Title): ${g.title || '未命名'}, 颜色: ${g.color}`).join('\n');
  const groupsPrompt = existingGroups.length > 0
    ? `\n此外，当前窗口已经存在以下标签组(Tab Groups)：\n${groupsInfo}\n请检查每个未分组(groupId为-1)的标签页，如果它的内容非常适合放入上述某个现有的标签组中，请在返回的JSON中增加一个字段 "suggestedGroupId" 并填入对应的标签组 ID。如果不适合任何组，或者该标签页已经有分组，请不要返回此字段。`
    : '';

  const prompt = `请作为浏览器标签页分类助手，根据以下提供的标签页列表(JSON格式，包含id, url, title, desc, groupId)，为每个标签页分配大主题(bigTheme)和小主题(smallTheme)。
大主题必须是以下之一：['AI', '娱乐', '导航', '开发', '工作', '购物', '学习', '资讯', '其他']。
并给出大主题权重(themeWeight)：AI(10), 娱乐(20), 导航(30), 开发(40), 工作(50), 购物(60), 学习(70), 资讯(80), 其他(999)。${groupsPrompt}
请严格返回JSON格式数组，格式如下：
[
  { "id": 1, "bigTheme": "AI", "smallTheme": "大模型", "themeWeight": 10, "suggestedGroupId": 12345 }
]
标签页列表：
${JSON.stringify(tabsData)}`;

  console.log('--- AI Prompt ---');
  console.log(prompt);
  console.log('-----------------');

  try {
    const fetchPromise = fetch(`${settings.apiUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: "system", content: "你是一个精准的网页分类助手，只能返回合法的JSON数组，不要包含任何额外的文字说明和Markdown标记。" },
          { role: "user", content: prompt }
        ],
        temperature: 0.1
      })
    });

    // 为 AI 请求设置 15 秒超时
    const response = await withTimeout(fetchPromise, 15000, "AI Request Timeout");

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content;

    // 清理可能存在的 markdown code block 标记
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    console.log('--- AI Response ---');
    console.log(content);
    console.log('-------------------');

    const parsedData = JSON.parse(content);
    for (const item of parsedData) {
      if (item.id && item.bigTheme && item.smallTheme && typeof item.themeWeight === 'number') {
        result.set(item.id, {
          bigTheme: item.bigTheme,
          smallTheme: item.smallTheme,
          weight: item.themeWeight,
          suggestedGroupId: item.suggestedGroupId
        });
      }
    }
  } catch (e) {
    console.error("AI categorization failed:", e);
  }

  return result;
}

// 从标签页中提取 desc (meta description)
async function getTabDescription(tabId: number): Promise<string> {
  try {
    // 再次确认 tab 的状态，如果遇到正在 loading 或者异常状态，尽量缩短超时
    const scriptPromise = chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const meta = document.querySelector('meta[name="description"]');
        return meta ? meta.getAttribute('content') || '' : '';
      }
    });

    // 缩短超时时间到 500ms (0.5秒)。因为获取 DOM 是非常快的，如果 500ms 拿不到，说明页面可能卡住了或者有跨域限制
    const results = await withTimeout(scriptPromise, 500, "Script injection timeout");

    if (results && results.length > 0) {
      return results[0].result as string;
    }
  } catch (e) {
    // 降级日志级别，不要报 Error 吓人，这是正常现象
    // console.debug(`Skipped description for tab ${tabId}:`, e);
  }
  return '';
}

/**
 * 获取所有标签页并按主题分类排序
 * 排序逻辑：
 * 1. 按 groupId 分组，分组内的标签页只在分组内部排序
 * 2. 尝试获取每个标签页的 desc
 * 3. 根据 url、title 和 desc 将其归类为大主题和小主题
 * 4. 排序：大主题权重 -> 小主题字母 -> URL字母
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

    // 获取 AI 配置
    const aiSettings = await getAISettings();

    // 获取当前窗口已有的 Tab Groups 信息
    let existingGroups: chrome.tabGroups.TabGroup[] = [];
    try {
      existingGroups = await chrome.tabGroups.query({ windowId: currentWindow.id });
    } catch (e) {
      console.error("Failed to fetch tab groups:", e);
    }

    // 尝试获取未休眠标签页的 desc 并转换标签页信息
    const tabInfos: TabInfo[] = [];
    const validTabs = tabs.filter(tab => tab.id !== undefined && tab.url);

    // 并发获取 desc，但限制对于被丢弃/休眠的标签页跳过，避免唤醒它们
    // 为了防止过多的 Promise.all 卡死，添加最大并发数限制
    const tabsWithDesc = [];
    const BATCH_SIZE = 5; // 降低批处理大小，避免瞬间并发过高

    for (let i = 0; i < validTabs.length; i += BATCH_SIZE) {
      const batch = validTabs.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async tab => {
        let desc = '';
        // 只有开启了 AI 分类，才去尝试提取网页描述（节省大量时间）
        if (aiSettings.useAi && aiSettings.apiKey && !tab.discarded && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
          desc = await getTabDescription(tab.id!);
        }
        return { tab, desc };
      });

      const batchResults = await Promise.all(batchPromises);
      tabsWithDesc.push(...batchResults);
    }

    // 尝试进行 AI 分类
    const aiCategories = new Map<number, { bigTheme: string, smallTheme: string, weight: number, suggestedGroupId?: number }>();

    if (aiSettings.useAi && aiSettings.apiKey) {
      console.log('Using AI for sorting with settings:', aiSettings);
      const tabsDataForAI = tabsWithDesc.map(t => ({
        id: t.tab.id,
        url: t.tab.url,
        title: t.tab.title || '',
        groupId: t.tab.groupId,
        desc: t.desc.substring(0, 200) // 限制长度，节省 token 并提高速度
      }));

      console.log('Preparing data for AI:', tabsDataForAI);

      try {
        const aiResultMap = await categorizeTabsWithAI(tabsDataForAI, aiSettings, existingGroups);
        for (const [id, category] of aiResultMap.entries()) {
          aiCategories.set(id, category);
        }
      } catch (e) {
        console.error("AI categorization process failed, falling back to rule-based:", e);
      }
    } else {
      console.log('AI sorting disabled or API key missing, using rule-based sorting.');
    }

    console.log('--- Sorting Results ---');
    for (const { tab, desc } of tabsWithDesc) {
      const title = tab.title || '';
      const url = tab.url!;

      // 优先使用 AI 分类结果，如果没有则回退到规则分类
      let category = aiCategories.get(tab.id!);
      let targetGroupId = tab.groupId !== undefined ? tab.groupId : -1;
      let source = 'AI';

      if (!category) {
        category = categorizeTab(url, title, desc);
        source = 'Rule';
      } else if (targetGroupId === -1 && category.suggestedGroupId) {
        // 如果标签原本没有分组，且大模型推荐了一个分组，就采纳大模型的建议
        // 检查这个 suggestedGroupId 是否真实存在于当前窗口
        if (existingGroups.some(g => g.id === category!.suggestedGroupId)) {
          targetGroupId = category.suggestedGroupId;
          source = 'AI (Group Assigned)';
        }
      }

      console.log(`Tab: ${title} (${url}) -> Theme: ${category.bigTheme}/${category.smallTheme}, Group: ${targetGroupId}, Source: ${source}`);

      tabInfos.push({
        id: tab.id!,
        index: tab.index,
        url: url,
        title: title,
        domain: extractMainDomain(url),
        groupId: targetGroupId,
        bigTheme: category.bigTheme,
        smallTheme: category.smallTheme,
        themeWeight: category.weight
      });
    }
    console.log('-----------------------');

    // 1. 将标签页按 groupId 分组
    const groupMap = new Map<number, TabInfo[]>();
    for (const tab of tabInfos) {
      if (!groupMap.has(tab.groupId)) {
        groupMap.set(tab.groupId, []);
      }
      groupMap.get(tab.groupId)!.push(tab);
    }

    // 2. 对每个分组内的标签页进行排序：
    // 大主题权重 -> 小主题字母 -> 域名字母 -> URL字母
    for (const groupTabs of groupMap.values()) {
      groupTabs.sort((a, b) => {
        // 先按大主题权重排序
        if (a.themeWeight !== b.themeWeight) {
          return a.themeWeight - b.themeWeight;
        }

        // 大主题相同，按小主题排序
        const smallThemeCompare = a.smallTheme.localeCompare(b.smallTheme);
        if (smallThemeCompare !== 0) {
          return smallThemeCompare;
        }

        // 小主题相同，按域名字母排序 (恢复原来的排序逻辑)
        const domainCompare = a.domain.localeCompare(b.domain);
        if (domainCompare !== 0) {
          return domainCompare;
        }

        // 域名相同，按完整网址字母排序
        return a.url.localeCompare(b.url);
      });
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
    // ⚠️ 警告：chrome.tabs.move 会将被移动的标签页移出它们原有的 group。
    // 因此，在移动后，必须重新将它们添加回原来的 group 中。
    const tabIds = sortedTabInfos.map(tab => tab.id);
    if (tabIds.length > 0) {
      // 第一步：移动标签页
      await chrome.tabs.move(tabIds, { index: 0 });

      // 第二步：恢复标签页的 Group 归属
      // 收集每个 group 包含哪些 tab
      const tabsToGroup = new Map<number, number[]>();
      for (const tab of sortedTabInfos) {
        if (tab.groupId !== -1) {
          if (!tabsToGroup.has(tab.groupId)) {
            tabsToGroup.set(tab.groupId, []);
          }
          tabsToGroup.get(tab.groupId)!.push(tab.id);
        }
      }

      // 批量将标签页重新放回它们对应的 group 中
      for (const [groupId, ids] of tabsToGroup.entries()) {
        try {
          await chrome.tabs.group({ tabIds: ids, groupId: groupId });
        } catch (groupError) {
          console.error(`Failed to restore tabs to group ${groupId}:`, groupError);
        }
      }
    }
  } catch (error) {
    console.error('Error sorting tabs:', error);
  }
}

// 监听扩展图标点击事件
chrome.action.onClicked.addListener(async () => {
  // 设置状态提示 - 处理中
  await chrome.action.setBadgeText({ text: '...' });
  await chrome.action.setBadgeBackgroundColor({ color: '#F39C12' }); // 橙色

  try {
    await sortTabs();
    // 处理成功，绿色勾勾，2秒后清除
    await chrome.action.setBadgeText({ text: 'OK' });
    await chrome.action.setBadgeBackgroundColor({ color: '#27AE60' }); // 绿色
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 2000);
  } catch (error) {
    console.error('Unhandled error during sortTabs:', error);
    // 处理失败，红色感叹号
    await chrome.action.setBadgeText({ text: 'ERR' });
    await chrome.action.setBadgeBackgroundColor({ color: '#E74C3C' }); // 红色
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 5000);
  }
}); 