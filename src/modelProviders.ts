export interface ModelOption {
  model: string;
  label: string;
}

export interface ModelProvider {
  id: string;
  provider: string;
  baseUrl: string;
  models: ModelOption[];
  keyPrefixes?: string[];
}

export interface InferredProvider {
  providerId: string;
  model: string;
}

export const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: 'openai',
    provider: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { model: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { model: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    ],
    keyPrefixes: ['sk-proj-'],
  },
  {
    id: 'deepseek',
    provider: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { model: 'deepseek-chat', label: 'DeepSeek Chat' },
      { model: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
    ],
  },
  {
    id: 'qwen',
    provider: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { model: 'qwen-plus', label: 'Qwen Plus' },
      { model: 'qwen-turbo', label: 'Qwen Turbo' },
    ],
  },
  {
    id: 'kimi',
    provider: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { model: 'moonshot-v1-8k', label: 'Moonshot v1 8K' },
      { model: 'moonshot-v1-32k', label: 'Moonshot v1 32K' },
    ],
  },
  {
    id: 'gemini',
    provider: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      { model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { model: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
    keyPrefixes: ['AIza'],
  },
  {
    id: 'openrouter',
    provider: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { model: 'openai/gpt-4.1-mini', label: 'OpenAI GPT-4.1 Mini' },
      { model: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
      { model: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
    keyPrefixes: ['sk-or-v1-'],
  },
  {
    id: 'siliconflow',
    provider: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      { model: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
      { model: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5 72B' },
    ],
  },
  {
    id: 'custom',
    provider: '自定义',
    baseUrl: '',
    models: [
      { model: '', label: '手动输入模型名' },
    ],
  },
];

export function getModelProvider(providerIdOrName?: string) {
  return MODEL_PROVIDERS.find((provider) => (
    provider.id === providerIdOrName || provider.provider === providerIdOrName
  )) ?? MODEL_PROVIDERS[MODEL_PROVIDERS.length - 1];
}

export function getDefaultModelForProvider(providerIdOrName?: string) {
  return getModelProvider(providerIdOrName).models[0];
}

export function inferProviderFromApiKey(apiKey: string): InferredProvider | null {
  const trimmedKey = apiKey.trim();

  if (!trimmedKey) {
    return null;
  }

  const matchedProvider = MODEL_PROVIDERS.find((provider) => (
    provider.keyPrefixes?.some((prefix) => trimmedKey.startsWith(prefix))
  ));

  if (!matchedProvider) {
    return null;
  }

  return {
    providerId: matchedProvider.id,
    model: getDefaultModelForProvider(matchedProvider.id)?.model ?? '',
  };
}
