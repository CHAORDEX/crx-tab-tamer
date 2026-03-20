// 获取 DOM 元素
const useAiCheckbox = document.getElementById('useAi') as HTMLInputElement;
const aiSettingsDiv = document.getElementById('aiSettings') as HTMLDivElement;
const apiUrlInput = document.getElementById('apiUrl') as HTMLInputElement;
const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const modelInput = document.getElementById('model') as HTMLInputElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;

// 切换 AI 设置面板显示状态
useAiCheckbox.addEventListener('change', () => {
  aiSettingsDiv.style.display = useAiCheckbox.checked ? 'block' : 'none';
});

// 加载保存的设置
chrome.storage.local.get({
  useAi: false,
  apiUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: '',
  model: 'glm-4.7-flash'
}, (items) => {
  useAiCheckbox.checked = items.useAi;
  apiUrlInput.value = items.apiUrl;
  apiKeyInput.value = items.apiKey;
  modelInput.value = items.model;
  
  // 初始化面板显示状态
  aiSettingsDiv.style.display = useAiCheckbox.checked ? 'block' : 'none';
});

// 保存设置
saveBtn.addEventListener('click', () => {
  const useAi = useAiCheckbox.checked;
  const apiUrl = apiUrlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim();

  chrome.storage.local.set({
    useAi,
    apiUrl,
    apiKey,
    model
  }, () => {
    // 显示保存成功提示
    statusDiv.textContent = '设置已保存！';
    setTimeout(() => {
      statusDiv.textContent = '';
    }, 2000);
  });
});