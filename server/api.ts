import type { Connect } from 'vite';
import type { ServerResponse } from 'node:http';
import { parseResumeWithAi } from '../src/aiResumeParser';
import { parseResumeContent, type ResumeData } from '../src/resumeParser';
import { createFileStorage } from './storage';

const storage = createFileStorage();

export function registerApiRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/parse-resume', async (request, response) => {
    if (!ensureMethod(request.method, response, 'POST')) {
      return;
    }

    try {
      const body = await readJsonBody<{ content?: string }>(request);
      const content = body.content?.trim() ?? '';

      if (!content) {
        sendJson(response, 400, { error: '未识别到简历内容' });
        return;
      }

      const configuredModel = await storage.getModelSettings();
      const modelConfig = configuredModel.apiKey
        ? configuredModel
        : {
          ...configuredModel,
          provider: 'OpenAI',
          apiKey: process.env.OPENAI_API_KEY ?? '',
        };
      const resume = modelConfig.apiKey
        ? await parseResumeWithAi(modelConfig, content)
        : parseResumeContent(content);

      sendJson(response, 200, {
        resume,
        parser: modelConfig.apiKey ? 'ai' : 'local',
      });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : '解析失败，请重试',
      });
    }
  });

  middlewares.use('/api/resume-drafts', async (request, response) => {
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

      sendJson(response, 200, { draft });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : '保存草稿失败，请重试',
      });
    }
  });

  middlewares.use('/api/settings/model-key', async (request, response) => {
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

      sendJson(response, 200, await storage.saveModelSettings({
        provider: body.provider ?? 'OpenAI',
        baseUrl: body.baseUrl ?? 'https://api.openai.com/v1',
        model: body.model ?? 'gpt-4.1-mini',
        apiKey: body.apiKey,
      }));
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : '保存模型设置失败',
      });
    }
  });

  middlewares.use('/api/homepages/generate', async (request, response) => {
    if (!ensureMethod(request.method, response, 'POST')) {
      return;
    }

    try {
      const body = await readJsonBody<{ draftId?: string; template?: string }>(request);

      if (!body.draftId) {
        sendJson(response, 400, { error: '缺少草稿 ID' });
        return;
      }

      const homepage = await storage.generateHomepage({
        draftId: body.draftId,
        template: body.template ?? 'minimal',
      });

      sendJson(response, 200, { homepage });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : '生成主页失败，请重试',
      });
    }
  });

  middlewares.use('/api/homepages/offline', async (request, response) => {
    if (!ensureMethod(request.method, response, 'POST')) {
      return;
    }

    try {
      const body = await readJsonBody<{ homepageId?: string }>(request);

      if (!body.homepageId) {
        sendJson(response, 400, { error: '缺少主页 ID' });
        return;
      }

      const homepage = await storage.offlineHomepage(body.homepageId);
      sendJson(response, 200, { homepage });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : '下线主页失败，请重试',
      });
    }
  });
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
