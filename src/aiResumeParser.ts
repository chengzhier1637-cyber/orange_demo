import type { ResumeData } from './resumeParser';

interface AiOutputContent {
  type?: string;
  text?: string;
}

interface AiChatMessage {
  content?: string | AiOutputContent[];
}

interface AiChoice {
  message?: AiChatMessage;
}

export interface AiResumeResponse {
  choices?: AiChoice[];
}

export interface AiModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function buildAiResumeParseRequest(config: AiModelConfig, resumeText: string) {
  return {
    url: `${config.baseUrl.replace(/\/$/, '')}/chat/completions`,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: config.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            '你是简历解析助手。只根据用户提供的简历文本提取字段，缺失字段返回空字符串或空数组，不要编造。',
            '只返回一个 JSON 对象，不要返回 Markdown。',
            '按常见简历栏目逐段提取：个人简介、专业技能、工作经历、项目经历、教育背景。',
            '工作经历和项目经历都合并到 experience；每段经历尽量识别公司/项目、角色、时间和成果详情。',
            '必须保留完整原文 rawText，并把所有识别到的简历栏目存入 sections 数组。',
            'JSON 字段必须包含：name、title、bio、skills、experience、education、rawText、sections。',
            'experience 是数组，每项包含 company、role、period、detail。',
            'sections 是数组，每项包含 title、content。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: resumeText,
        },
      ],
    },
  };
}

export async function parseResumeWithAi(config: AiModelConfig, resumeText: string): Promise<ResumeData> {
  const request = buildAiResumeParseRequest(config, resumeText);
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  });

  if (!response.ok) {
    throw new Error(await getAiParseErrorMessage(response));
  }

  return extractResumeFromAiResponse(await response.json() as AiResumeResponse);
}

export async function testAiModelConnection(config: AiModelConfig): Promise<void> {
  const request = buildAiResumeParseRequest(config, '请返回 {"ok": true}');
  const response = await fetch(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  });

  if (!response.ok) {
    throw new Error(await getAiParseErrorMessage(response));
  }
}

async function getAiParseErrorMessage(response: Response) {
  if (response.status === 401) {
    return 'API Key 无效，请检查模型设置';
  }

  if (response.status === 404) {
    return '模型不存在，请检查模型设置';
  }

  return 'AI 解析失败，请检查模型设置';
}

export function extractResumeFromAiResponse(response: AiResumeResponse): ResumeData {
  const outputText = extractOutputText(response);

  if (!outputText) {
    throw new Error('AI 解析失败，请重试');
  }

  try {
    return normalizeResumeData(JSON.parse(extractJsonPayload(outputText)) as Partial<ResumeData>);
  } catch {
    throw new Error('AI 解析失败，请重试');
  }
}

function extractOutputText(response: AiResumeResponse) {
  const content = response.choices?.find((choice) => choice.message?.content)?.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  return content?.find((item) => item.text)?.text ?? '';
}

function extractJsonPayload(outputText: string) {
  const trimmedText = outputText.trim();
  const fencedMatch = trimmedText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBraceIndex = trimmedText.indexOf('{');
  const lastBraceIndex = trimmedText.lastIndexOf('}');

  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return trimmedText.slice(firstBraceIndex, lastBraceIndex + 1);
  }

  return trimmedText;
}

function normalizeResumeData(data: Partial<ResumeData>): ResumeData {
  return {
    name: stringifyAiValue(data.name),
    title: stringifyAiValue(data.title),
    bio: stringifyAiValue(data.bio),
    skills: Array.isArray(data.skills) ? data.skills.map(stringifyAiValue).filter(Boolean) : [],
    experience: Array.isArray(data.experience) ? data.experience.map((experience) => ({
      company: stringifyAiValue(experience.company),
      role: stringifyAiValue(experience.role),
      period: stringifyAiValue(experience.period),
      detail: stringifyAiValue(experience.detail),
    })) : [],
    education: stringifyAiValue(data.education),
    rawText: stringifyAiValue(data.rawText),
    sections: Array.isArray(data.sections) ? data.sections.map((section) => ({
      title: stringifyAiValue(section.title),
      content: stringifyAiValue(section.content),
    })) : [],
  };
}

function stringifyAiValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(stringifyAiValue).filter(Boolean).join('\n');
  }

  if (value && typeof value === 'object') {
    return Object.values(value).map(stringifyAiValue).filter(Boolean).join(' ');
  }

  return '';
}
