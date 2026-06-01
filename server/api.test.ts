import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateHomepageWithAuth,
  parseResumeWithFallback,
  readPublicHomepage,
  resolveModelConfig,
} from './api.ts';

test('resolveModelConfig prefers saved developer settings over environment defaults', () => {
  const config = resolveModelConfig(
    {
      provider: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: 'saved-key',
    },
    {
      MODEL_API_KEY: 'env-key',
      MODEL_PROVIDER: 'Kimi',
      MODEL_BASE_URL: 'https://api.moonshot.cn/v1',
      MODEL_NAME: 'moonshot-v1-8k',
    },
  );

  assert.equal(config.provider, 'DeepSeek');
  assert.equal(config.apiKey, 'saved-key');
  assert.equal(config.model, 'deepseek-chat');
});

test('resolveModelConfig uses configured default model from environment', () => {
  const config = resolveModelConfig(
    {
      provider: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      apiKey: '',
    },
    {
      MODEL_API_KEY: 'env-key',
      MODEL_PROVIDER: 'DeepSeek',
      MODEL_BASE_URL: 'https://api.deepseek.com/v1',
      MODEL_NAME: 'deepseek-chat',
    },
  );

  assert.equal(config.provider, 'DeepSeek');
  assert.equal(config.apiKey, 'env-key');
  assert.equal(config.baseUrl, 'https://api.deepseek.com/v1');
  assert.equal(config.model, 'deepseek-chat');
});

test('resolveModelConfig falls back to OPENAI_API_KEY when no default model key is set', () => {
  const config = resolveModelConfig(
    {
      provider: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      apiKey: '',
    },
    {
      OPENAI_API_KEY: 'openai-env-key',
    },
  );

  assert.equal(config.provider, 'OpenAI');
  assert.equal(config.apiKey, 'openai-env-key');
  assert.equal(config.baseUrl, 'https://api.openai.com/v1');
  assert.equal(config.model, 'gpt-4.1-mini');
});

test('parseResumeWithFallback uses local parser when AI parsing fails', async () => {
  const result = await parseResumeWithFallback({
    provider: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: 'bad-key',
  }, `
    姓名：陈志强
    标题：项目经理
  `, async () => {
    throw new Error('API Key 无效，请检查模型设置');
  });

  assert.equal(result.parser, 'local');
  assert.equal(result.resume.name, '陈志强');
  assert.equal(result.warning, 'AI 解析失败，已使用本地解析');
});

test('parseResumeWithFallback enriches sparse AI output with local full parsing', async () => {
  const result = await parseResumeWithFallback({
    provider: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: 'valid-key',
  }, `
    姓名：陈志强
    标题：项目经理
    专业技能
    项目管理、需求分析、敏捷开发
    工作经历
    2021.03 - 至今  云舟科技  高级项目经理
    负责企业级 SaaS 项目交付。
    证书
    PMP
  `, async () => ({
    name: '陈志强',
    title: '',
    bio: '',
    skills: [],
    experience: [],
    education: '',
    rawText: '',
    sections: [],
  }));

  assert.equal(result.parser, 'ai');
  assert.equal(result.resume.title, '项目经理');
  assert.deepEqual(result.resume.skills, ['项目管理', '需求分析', '敏捷开发']);
  assert.equal(result.resume.experience[0].company, '云舟科技');
  assert.match(result.resume.rawText, /PMP/);
  assert.equal(result.resume.sections.some((section) => section.title === '证书' && section.content.includes('PMP')), true);
  assert.equal(result.warning, 'AI 解析内容不完整，已补充本地解析结果');
});

test('generateHomepageWithAuth blocks unauthenticated users', async () => {
  await assert.rejects(
    generateHomepageWithAuth({
      isLoggedIn: false,
      draftId: 'draft_1',
      template: 'minimal',
      generate: async () => ({
        id: 'page_1',
        publicUrl: '/p/demo',
      }),
    }),
    /请先登录后再生成主页/,
  );
});

test('generateHomepageWithAuth returns a public URL for logged-in users', async () => {
  const result = await generateHomepageWithAuth({
    isLoggedIn: true,
    draftId: 'draft_1',
    template: 'professional',
    generate: async (input) => ({
      id: 'page_1',
      publicUrl: `/p/${input.draftId}`,
    }),
  });

  assert.equal(result.publicUrl, '/p/draft_1');
});

test('generateHomepageWithAuth reports missing drafts as typed errors', async () => {
  await assert.rejects(
    generateHomepageWithAuth({
      isLoggedIn: true,
      draftId: '',
      template: 'minimal',
      generate: async () => ({
        id: 'page_1',
        publicUrl: '/p/demo',
      }),
    }),
    /缺少草稿 ID/,
  );
});

test('readPublicHomepage returns only published homepages', async () => {
  const homepage = await readPublicHomepage('demo', {
    getPublicHomepage: async (slug: string) => ({
      id: 'page_1',
      slug,
      publicUrl: `/p/${slug}`,
    }),
  });

  assert.equal(homepage.publicUrl, '/p/demo');
});

test('readPublicHomepage reports offline homepage as not accessible', async () => {
  await assert.rejects(
    readPublicHomepage('demo', {
      getPublicHomepage: async () => {
        throw new Error('主页已下线');
      },
    }),
    /主页已下线/,
  );
});
