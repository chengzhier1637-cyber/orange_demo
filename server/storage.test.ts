import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFileStorage } from './storage.ts';

const resume = {
  name: '测试用户',
  title: '前端工程师',
  bio: '负责交互体验。',
  skills: ['React', 'TypeScript'],
  experience: [
    {
      company: '测试公司',
      role: '工程师',
      period: '2024-至今',
      detail: '构建简历主页。',
    },
  ],
  education: '测试大学',
  rawText: '测试用户 前端工程师',
  sections: [],
};

test('createResumeDraft stores parsed resume as a draft record', async () => {
  const { storage, cleanup } = await createTempStorage();

  try {
    const draft = await storage.createResumeDraft({
      resume,
      parser: 'local',
      parseSource: '粘贴文本',
    });

    assert.equal(draft.status, 'draft');
    assert.equal(draft.userId, 'demo-user');
    assert.equal(draft.resume.name, '测试用户');
    assert.equal(draft.parser, 'local');
    assert.equal(draft.parseSource, '粘贴文本');
    assert.ok(draft.createdAt);
    assert.ok(draft.updatedAt);
  } finally {
    await cleanup();
  }
});

test('updateResumeDraft persists edited resume content', async () => {
  const { storage, cleanup } = await createTempStorage();

  try {
    const draft = await storage.createResumeDraft({
      resume,
      parser: 'local',
      parseSource: '粘贴文本',
    });
    const updatedDraft = await storage.updateResumeDraft(draft.id, {
      ...resume,
      title: '高级前端工程师',
    });

    assert.equal(updatedDraft.id, draft.id);
    assert.equal(updatedDraft.resume.title, '高级前端工程师');
    assert.notEqual(updatedDraft.updatedAt, draft.updatedAt);
  } finally {
    await cleanup();
  }
});

test('updateResumeDraft fails when draft does not exist', async () => {
  const { storage, cleanup } = await createTempStorage();

  try {
    await assert.rejects(
      storage.updateResumeDraft('missing-draft', resume),
      /草稿不存在/,
    );
  } finally {
    await cleanup();
  }
});

test('generateHomepage creates a stable public URL for the same draft', async () => {
  const { storage, cleanup } = await createTempStorage();

  try {
    const draft = await storage.createResumeDraft({
      resume,
      parser: 'local',
      parseSource: '粘贴文本',
    });
    const firstHomepage = await storage.generateHomepage({
      draftId: draft.id,
      template: 'minimal',
    });
    const secondHomepage = await storage.generateHomepage({
      draftId: draft.id,
      template: 'creative',
    });

    assert.equal(firstHomepage.id, secondHomepage.id);
    assert.equal(secondHomepage.status, 'published');
    assert.equal(secondHomepage.template, 'creative');
    assert.equal(secondHomepage.publicUrl, `/p/${firstHomepage.slug}`);
  } finally {
    await cleanup();
  }
});

test('offlineHomepage marks a published homepage offline', async () => {
  const { storage, cleanup } = await createTempStorage();

  try {
    const draft = await storage.createResumeDraft({
      resume,
      parser: 'local',
      parseSource: '粘贴文本',
    });
    const homepage = await storage.generateHomepage({
      draftId: draft.id,
      template: 'minimal',
    });
    const offlineHomepage = await storage.offlineHomepage(homepage.id);

    assert.equal(offlineHomepage.status, 'offline');
    assert.ok(offlineHomepage.offlineAt);
  } finally {
    await cleanup();
  }
});

test('getPublicHomepage returns published homepage by slug', async () => {
  const { storage, cleanup } = await createTempStorage();

  try {
    const draft = await storage.createResumeDraft({
      resume,
      parser: 'local',
      parseSource: '粘贴文本',
    });
    const homepage = await storage.generateHomepage({
      draftId: draft.id,
      template: 'minimal',
    });
    const publicHomepage = await storage.getPublicHomepage(homepage.slug);

    assert.equal(publicHomepage.publicUrl, homepage.publicUrl);
    assert.equal(publicHomepage.resume.name, '测试用户');
  } finally {
    await cleanup();
  }
});

test('getPublicHomepage rejects offline homepage', async () => {
  const { storage, cleanup } = await createTempStorage();

  try {
    const draft = await storage.createResumeDraft({
      resume,
      parser: 'local',
      parseSource: '粘贴文本',
    });
    const homepage = await storage.generateHomepage({
      draftId: draft.id,
      template: 'minimal',
    });
    await storage.offlineHomepage(homepage.id);

    await assert.rejects(
      storage.getPublicHomepage(homepage.slug),
      /主页已下线/,
    );
  } finally {
    await cleanup();
  }
});

test('generateHomepage keeps URL stable while publishing latest draft content', async () => {
  const { storage, cleanup } = await createTempStorage();

  try {
    const draft = await storage.createResumeDraft({
      resume,
      parser: 'local',
      parseSource: '粘贴文本',
    });
    const firstHomepage = await storage.generateHomepage({
      draftId: draft.id,
      template: 'minimal',
    });

    await storage.updateResumeDraft(draft.id, {
      ...resume,
      title: '高级前端工程师',
    });
    const updatedHomepage = await storage.generateHomepage({
      draftId: draft.id,
      template: 'professional',
    });
    const publicHomepage = await storage.getPublicHomepage(firstHomepage.slug);

    assert.equal(updatedHomepage.publicUrl, firstHomepage.publicUrl);
    assert.equal(publicHomepage.resume.title, '高级前端工程师');
    assert.equal(publicHomepage.template, 'professional');
  } finally {
    await cleanup();
  }
});

test('model settings store provider config while exposing only masked status', async () => {
  const { storage, cleanup } = await createTempStorage();

  try {
    const statusBeforeSave = await storage.getModelSettingsStatus();

    assert.deepEqual(statusBeforeSave, {
      configured: false,
      provider: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      maskedKey: '',
    });

    const savedStatus = await storage.saveModelSettings({
      provider: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: 'sk-test-1234567890',
    });
    const statusAfterSave = await storage.getModelSettingsStatus();
    const modelSettings = await storage.getModelSettings();

    assert.deepEqual(savedStatus, {
      configured: true,
      provider: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      maskedKey: '••••7890',
    });
    assert.deepEqual(statusAfterSave, savedStatus);
    assert.deepEqual(modelSettings, {
      provider: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: 'sk-test-1234567890',
    });
  } finally {
    await cleanup();
  }
});

async function createTempStorage() {
  const directory = await mkdtemp(join(tmpdir(), 'resume-homepage-'));

  return {
    storage: createFileStorage(join(directory, 'store.json')),
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
