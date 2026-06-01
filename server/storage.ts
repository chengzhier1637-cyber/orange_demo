import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ResumeData } from '../src/resumeParser';
import type { AiModelConfig } from '../src/aiResumeParser';

type ParserMode = 'ai' | 'local';
type HomepageStatus = 'published' | 'offline';

export interface ResumeDraft {
  id: string;
  userId: string;
  resume: ResumeData;
  status: 'draft';
  parser: ParserMode;
  parseSource: string;
  createdAt: string;
  updatedAt: string;
}

export interface HomepageRecord {
  id: string;
  draftId: string;
  userId: string;
  resume: ResumeData;
  status: HomepageStatus;
  template: string;
  slug: string;
  publicUrl: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  offlineAt: string | null;
}

interface StoreData {
  drafts: ResumeDraft[];
  homepages: HomepageRecord[];
  settings?: {
    modelConfig?: ModelSettings;
    updatedAt?: string;
  };
}

export interface ModelSettings extends AiModelConfig {
  provider: string;
}

interface CreateDraftInput {
  resume: ResumeData;
  parser: ParserMode;
  parseSource: string;
}

interface GenerateHomepageInput {
  draftId: string;
  template: string;
}

const DEMO_USER_ID = 'demo-user';
const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  provider: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  apiKey: '',
};

export function createFileStorage(filePath = 'data/resume-store.json') {
  return {
    async createResumeDraft(input: CreateDraftInput) {
      const store = await readStore(filePath);
      const now = new Date().toISOString();
      const draft: ResumeDraft = {
        id: createId('draft'),
        userId: DEMO_USER_ID,
        resume: input.resume,
        status: 'draft',
        parser: input.parser,
        parseSource: input.parseSource,
        createdAt: now,
        updatedAt: now,
      };

      store.drafts.push(draft);
      await writeStore(filePath, store);

      return draft;
    },

    async updateResumeDraft(draftId: string, resume: ResumeData) {
      const store = await readStore(filePath);
      const draft = store.drafts.find((item) => item.id === draftId);

      if (!draft) {
        throw new Error('草稿不存在');
      }

      draft.resume = resume;
      draft.updatedAt = createNextTimestamp(draft.updatedAt);
      await writeStore(filePath, store);

      return draft;
    },

    async generateHomepage(input: GenerateHomepageInput) {
      const store = await readStore(filePath);
      const draft = store.drafts.find((item) => item.id === input.draftId);

      if (!draft) {
        throw new Error('草稿不存在');
      }

      const now = new Date().toISOString();
      const existingHomepage = store.homepages.find((item) => item.draftId === draft.id);

      if (existingHomepage) {
        existingHomepage.resume = draft.resume;
        existingHomepage.status = 'published';
        existingHomepage.template = input.template;
        existingHomepage.updatedAt = createNextTimestamp(existingHomepage.updatedAt);
        existingHomepage.publishedAt = now;
        existingHomepage.offlineAt = null;
        await writeStore(filePath, store);

        return existingHomepage;
      }

      const slug = createSlug(draft);
      const homepage: HomepageRecord = {
        id: createId('page'),
        draftId: draft.id,
        userId: draft.userId,
        resume: draft.resume,
        status: 'published',
        template: input.template,
        slug,
        publicUrl: `/p/${slug}`,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
        offlineAt: null,
      };

      store.homepages.push(homepage);
      await writeStore(filePath, store);

      return homepage;
    },

    async offlineHomepage(homepageId: string) {
      const store = await readStore(filePath);
      const homepage = store.homepages.find((item) => item.id === homepageId);

      if (!homepage) {
        throw new Error('主页不存在');
      }

      const now = new Date().toISOString();
      homepage.status = 'offline';
      homepage.updatedAt = createNextTimestamp(homepage.updatedAt);
      homepage.offlineAt = now;
      await writeStore(filePath, store);

      return homepage;
    },

    async getPublicHomepage(slug: string) {
      const store = await readStore(filePath);
      const homepage = store.homepages.find((item) => item.slug === slug);

      if (!homepage) {
        throw new Error('主页不存在');
      }

      if (homepage.status !== 'published') {
        throw new Error('主页已下线');
      }

      return homepage;
    },

    async saveModelSettings(settings: ModelSettings) {
      const store = await readStore(filePath);
      const modelConfig: ModelSettings = {
        provider: settings.provider.trim() || DEFAULT_MODEL_SETTINGS.provider,
        baseUrl: settings.baseUrl.trim() || DEFAULT_MODEL_SETTINGS.baseUrl,
        model: settings.model.trim() || DEFAULT_MODEL_SETTINGS.model,
        apiKey: settings.apiKey.trim(),
      };

      if (!modelConfig.apiKey) {
        throw new Error('请输入 API Key');
      }

      store.settings = {
        ...store.settings,
        modelConfig,
        updatedAt: new Date().toISOString(),
      };
      await writeStore(filePath, store);

      return getModelSettingsStatusFromStore(store);
    },

    async getModelSettings() {
      const store = await readStore(filePath);
      return getModelSettingsFromStore(store);
    },

    async getModelSettingsStatus() {
      const store = await readStore(filePath);
      return getModelSettingsStatusFromStore(store);
    },
  };
}

async function readStore(filePath: string): Promise<StoreData> {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content) as StoreData;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { drafts: [], homepages: [] };
    }

    throw error;
  }
}

async function writeStore(filePath: string, store: StoreData) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2));
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createSlug(draft: ResumeDraft) {
  return draft.id.replace(/^draft_/, '');
}

function createNextTimestamp(previousTimestamp: string) {
  const now = Date.now();
  const previousTime = Date.parse(previousTimestamp);

  return new Date(Number.isFinite(previousTime) ? Math.max(now, previousTime + 1) : now).toISOString();
}

function getModelSettingsStatusFromStore(store: StoreData) {
  const settings = getModelSettingsFromStore(store);

  return {
    configured: Boolean(settings.apiKey),
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    maskedKey: settings.apiKey ? `••••${settings.apiKey.slice(-4)}` : '',
  };
}

function getModelSettingsFromStore(store: StoreData): ModelSettings {
  return {
    ...DEFAULT_MODEL_SETTINGS,
    ...store.settings?.modelConfig,
  };
}
