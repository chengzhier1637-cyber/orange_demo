import type { Connect } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseResumeWithAi, testAiModelConnection } from '../src/aiResumeParser.ts';
import { parseResumeContent, type ResumeData } from '../src/resumeParser.ts';
import { logger } from './logger.ts';
import { createFileStorage, type ModelSettings } from './storage.ts';

const storage = createFileStorage();

export function registerApiRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/homepages/public', async (request, response) => {
    const slug = request.url?.replace(/^\/+/, '').split('?')[0] ?? '';
    await handlePublicHomepageRequest(request, response, slug);
  });

  middlewares.use('/api/parse-resume', async (request, response) => {
    await handleParseResumeRequest(request, response);
  });

  middlewares.use('/api/resume-drafts', async (request, response) => {
    await handleCreateDraftRequest(request, response);
  });

  middlewares.use('/api/resume-drafts/update', async (request, response) => {
    await handleUpdateDraftRequest(request, response);
  });

  middlewares.use('/api/settings/model-key', async (request, response) => {
    await handleModelSettingsRequest(request, response);
  });

  middlewares.use('/api/homepages/generate', async (request, response) => {
    await handleGenerateHomepageRequest(request, response);
  });

  middlewares.use('/api/homepages/offline', async (request, response) => {
    await handleOfflineHomepageRequest(request, response);
  });
}

export async function handleApiRequest(request: IncomingMessage, response: ServerResponse, path = request.url ?? '') {
  const pathname = path.split('?')[0].replace(/^\/api/, '').replace(/^\/+/, '');

  if (pathname === 'parse-resume') {
    await handleParseResumeRequest(request, response);
    return;
  }

  if (pathname === 'resume-drafts') {
    await handleCreateDraftRequest(request, response);
    return;
  }

  if (pathname === 'resume-drafts/update') {
    await handleUpdateDraftRequest(request, response);
    return;
  }

  if (pathname === 'settings/model-key') {
    await handleModelSettingsRequest(request, response);
    return;
  }

  if (pathname === 'homepages/generate') {
    await handleGenerateHomepageRequest(request, response);
    return;
  }

  if (pathname === 'homepages/offline') {
    await handleOfflineHomepageRequest(request, response);
    return;
  }

  if (pathname.startsWith('homepages/public/')) {
    await handlePublicHomepageRequest(request, response, pathname.replace(/^homepages\/public\//, ''));
    return;
  }

  sendJson(response, 404, { error: '接口不存在' });
}

async function handlePublicHomepageRequest(request: IncomingMessage, response: ServerResponse, slug: string) {
  if (!ensureMethod(request.method, response, 'GET')) {
    return;
  }

  logger.info('homepage.public.read', { slug });

  try {
    const homepage = await readPublicHomepage(slug, {
      getPublicHomepage: storage.getPublicHomepage,
    });

    logger.info('homepage.public.success', { slug, publicUrl: homepage.publicUrl });
    sendJson(response, 200, { homepage });
  } catch (error) {
    logger.warn('homepage.public.failed', { slug, error });
    sendJson(response, 404, {
      error: error instanceof Error ? error.message : '主页不可访问',
    });
  }
}

async function handleParseResumeRequest(request: IncomingMessage, response: ServerResponse) {
  if (!ensureMethod(request.method, response, 'POST')) {
    return;
  }

  try {
    const body = await readJsonBody<{ content?: string }>(request);
    const content = body.content?.trim() ?? '';
    const modelConfig = resolveModelConfig(await storage.getModelSettings(), process.env);
    logger.info('resume.parse.start', {
      content,
      hasModelKey: Boolean(modelConfig.apiKey),
      provider: modelConfig.provider,
      model: modelConfig.model,
    });

    if (!content) {
      logger.warn('resume.parse.failed', { reason: 'empty_content' });
      sendJson(response, 400, { error: '未识别到简历内容' });
      return;
    }

    const parseResult = await parseResumeWithFallback(modelConfig, content);

    logger.info('resume.parse.success', {
      parser: parseResult.parser,
      warning: parseResult.warning,
      sectionCount: parseResult.resume.sections.length,
      experienceCount: parseResult.resume.experience.length,
    });
    sendJson(response, 200, {
      ...parseResult,
    });
  } catch (error) {
    logger.error('resume.parse.failed', { error });
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : '解析失败，请重试',
    });
  }
}

async function handleCreateDraftRequest(request: IncomingMessage, response: ServerResponse) {
  if (!ensureMethod(request.method, response, 'POST')) {
    return;
  }

  try {
    const body = await readJsonBody<{
      resume?: ResumeData;
      parser?: 'ai' | 'local';
      parseSource?: string;
    }>(request);

    if (!body.resume) {
      sendJson(response, 400, { error: '缺少简历内容' });
      return;
    }

    const draft = await storage.createResumeDraft({
      resume: body.resume,
      parser: body.parser ?? 'local',
      parseSource: body.parseSource ?? '未知来源',
    });

    logger.info('resume.draft.create', { draftId: draft.id, parser: draft.parser });
    sendJson(response, 200, { draft });
  } catch (error) {
    logger.error('resume.draft.create.failed', { error });
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : '保存草稿失败，请重试',
    });
  }
}

async function handleUpdateDraftRequest(request: IncomingMessage, response: ServerResponse) {
  if (!ensureMethod(request.method, response, 'POST')) {
    return;
  }

  try {
    const body = await readJsonBody<{
      draftId?: string;
      resume?: ResumeData;
    }>(request);

    if (!body.draftId || !body.resume) {
      sendJson(response, 400, { error: '缺少草稿 ID 或简历内容' });
      return;
    }

    const draft = await storage.updateResumeDraft(body.draftId, body.resume);
    logger.info('resume.draft.update', { draftId: draft.id });
    sendJson(response, 200, { draft });
  } catch (error) {
    logger.error('resume.draft.update.failed', { error });
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : '保存草稿失败，请重试',
    });
  }
}

async function handleModelSettingsRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.method === 'GET') {
    try {
      sendJson(response, 200, await storage.getModelSettingsStatus());
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : '读取模型设置失败',
      });
    }
    return;
  }

  if (!ensureMethod(request.method, response, 'POST')) {
    return;
  }

  try {
    const body = await readJsonBody<{
      provider?: string;
      baseUrl?: string;
      model?: string;
      apiKey?: string;
    }>(request);

    if (!body.apiKey?.trim()) {
      sendJson(response, 400, { error: '请输入 API Key' });
      return;
    }

    const settings = {
      provider: body.provider ?? 'OpenAI',
      baseUrl: body.baseUrl ?? 'https://api.openai.com/v1',
      model: body.model ?? 'gpt-4.1-mini',
      apiKey: body.apiKey,
    };

    await testAiModelConnection(settings);
    logger.info('model.settings.save', {
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      model: settings.model,
      hasApiKey: Boolean(settings.apiKey),
    });
    sendJson(response, 200, await storage.saveModelSettings(settings));
  } catch (error) {
    logger.error('model.settings.save.failed', { error });
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : '保存模型设置失败',
    });
  }
}

async function handleGenerateHomepageRequest(request: IncomingMessage, response: ServerResponse) {
    if (!ensureMethod(request.method, response, 'POST')) {
      return;
    }

    try {
      const body = await readJsonBody<{ draftId?: string; template?: string; isLoggedIn?: boolean }>(request);
      logger.info('homepage.generate.start', {
        draftId: body.draftId,
        template: body.template ?? 'minimal',
        isLoggedIn: Boolean(body.isLoggedIn),
      });

      const homepage = await generateHomepageWithAuth({
        isLoggedIn: Boolean(body.isLoggedIn),
        draftId: body.draftId ?? '',
        template: body.template ?? 'minimal',
        generate: storage.generateHomepage,
      });

      logger.info('homepage.generate.success', {
        homepageId: homepage.id,
        publicUrl: homepage.publicUrl,
      });
      sendJson(response, 200, { homepage });
    } catch (error) {
      const apiError = toHomepageGenerationError(error);

      logger.error('homepage.generate.failed', { error, code: apiError.body.code });
      sendJson(response, apiError.statusCode, apiError.body);
    }
}

async function handleOfflineHomepageRequest(request: IncomingMessage, response: ServerResponse) {
    if (!ensureMethod(request.method, response, 'POST')) {
      return;
    }

    try {
      const body = await readJsonBody<{ homepageId?: string }>(request);

      if (!body.homepageId) {
        sendJson(response, 400, { error: '缺少主页 ID' });
        return;
      }

      logger.info('homepage.offline.start', { homepageId: body.homepageId });
      const homepage = await storage.offlineHomepage(body.homepageId);
      logger.info('homepage.offline.success', {
        homepageId: homepage.id,
        slug: homepage.slug,
        status: homepage.status,
      });
      sendJson(response, 200, { homepage });
    } catch (error) {
      logger.error('homepage.offline.failed', { error });
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : '下线主页失败，请重试',
      });
    }
}

export function resolveModelConfig(
  savedSettings: ModelSettings,
  env: NodeJS.ProcessEnv,
): ModelSettings {
  if (savedSettings.apiKey) {
    return savedSettings;
  }

  if (env.MODEL_API_KEY) {
    return {
      provider: env.MODEL_PROVIDER ?? savedSettings.provider,
      baseUrl: env.MODEL_BASE_URL ?? savedSettings.baseUrl,
      model: env.MODEL_NAME ?? savedSettings.model,
      apiKey: env.MODEL_API_KEY,
    };
  }

  return {
    ...savedSettings,
    provider: 'OpenAI',
    apiKey: env.OPENAI_API_KEY ?? '',
  };
}

interface GenerateHomepageWithAuthInput {
  isLoggedIn: boolean;
  draftId: string;
  template: string;
  generate: (input: { draftId: string; template: string }) => Promise<{ id: string; publicUrl: string }>;
}

interface PublicHomepageReader {
  getPublicHomepage: (slug: string) => Promise<{ publicUrl: string }>;
}

export async function readPublicHomepage(slug: string, reader: PublicHomepageReader) {
  if (!slug) {
    throw new Error('主页不存在');
  }

  return await reader.getPublicHomepage(slug);
}

export async function generateHomepageWithAuth(input: GenerateHomepageWithAuthInput) {
  if (!input.isLoggedIn) {
    throw new HomepageGenerationError('auth', '请先登录后再生成主页', 401);
  }

  if (!input.draftId) {
    throw new HomepageGenerationError('missing_draft', '缺少草稿 ID', 400);
  }

  try {
    return await withTimeout(input.generate({
      draftId: input.draftId,
      template: input.template,
    }), 15000);
  } catch (error) {
    if (error instanceof HomepageGenerationError) {
      throw error;
    }

    if (error instanceof Error && error.message.includes('草稿不存在')) {
      throw new HomepageGenerationError('missing_draft', '草稿不存在，请返回上一步重新保存', 404);
    }

    throw new HomepageGenerationError('server', '生成失败，请稍后重试', 500);
  }
}

class HomepageGenerationError extends Error {
  readonly code: 'auth' | 'missing_draft' | 'timeout' | 'server';
  readonly statusCode: number;

  constructor(
    code: 'auth' | 'missing_draft' | 'timeout' | 'server',
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new HomepageGenerationError('timeout', '生成超时，请重试', 408));
    }, timeoutMs);

    promise
      .then(resolve, reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

function toHomepageGenerationError(error: unknown) {
  if (error instanceof HomepageGenerationError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.message,
        code: error.code,
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: '生成主页失败，请重试',
      code: 'server',
    },
  };
}

export async function parseResumeWithFallback(
  modelConfig: ModelSettings,
  content: string,
  aiParser = parseResumeWithAi,
): Promise<{ resume: ResumeData; parser: 'ai' | 'local'; warning?: string }> {
  if (!modelConfig.apiKey) {
    return {
      resume: parseResumeContent(content),
      parser: 'local',
    };
  }

  try {
    const localResume = parseResumeContent(content);
    const aiResume = await aiParser(modelConfig, content);
    const mergedResume = mergeResumeData(aiResume, localResume);

    return {
      resume: mergedResume,
      parser: 'ai',
      warning: isResumeSparse(aiResume, localResume)
        ? 'AI 解析内容不完整，已补充本地解析结果'
        : undefined,
    };
  } catch {
    return {
      resume: parseResumeContent(content),
      parser: 'local',
      warning: 'AI 解析失败，已使用本地解析',
    };
  }
}

function mergeResumeData(primary: ResumeData, fallback: ResumeData): ResumeData {
  return {
    name: primary.name || fallback.name,
    title: primary.title || fallback.title,
    bio: primary.bio || fallback.bio,
    skills: primary.skills.length > 0 ? primary.skills : fallback.skills,
    experience: primary.experience.length > 0 ? primary.experience : fallback.experience,
    education: primary.education || fallback.education,
    rawText: primary.rawText || fallback.rawText,
    sections: mergeResumeSections(primary.sections, fallback.sections),
  };
}

function mergeResumeSections(primarySections: ResumeData['sections'], fallbackSections: ResumeData['sections']) {
  const sectionsByTitle = new Map<string, { title: string; content: string }>();

  fallbackSections.forEach((section) => {
    if (section.title || section.content) {
      sectionsByTitle.set(normalizeSectionTitle(section.title), section);
    }
  });

  primarySections.forEach((section) => {
    if (section.title || section.content) {
      sectionsByTitle.set(normalizeSectionTitle(section.title), section);
    }
  });

  return Array.from(sectionsByTitle.values());
}

function normalizeSectionTitle(title: string) {
  return title.replace(/\s/g, '').toLowerCase();
}

function isResumeSparse(primary: ResumeData, fallback: ResumeData) {
  return (
    (!primary.title && !!fallback.title)
    || (!primary.bio && !!fallback.bio)
    || (primary.skills.length === 0 && fallback.skills.length > 0)
    || (primary.experience.length === 0 && fallback.experience.length > 0)
    || (!primary.education && !!fallback.education)
    || (!primary.rawText && !!fallback.rawText)
    || (primary.sections.length < fallback.sections.length)
  );
}

function ensureMethod(method: string | undefined, response: ServerResponse, expectedMethod: string) {
  if (method === expectedMethod) {
    return true;
  }

  sendJson(response, 405, { error: `仅支持 ${expectedMethod} 请求` });
  return false;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

function readJsonBody<T>(request: Connect.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let rawBody = '';

    request.on('data', (chunk: Buffer) => {
      rawBody += chunk.toString('utf8');
    });

    request.on('end', () => {
      try {
        resolve(JSON.parse(rawBody) as T);
      } catch {
        reject(new Error('解析失败，请重试'));
      }
    });

    request.on('error', reject);
  });
}
