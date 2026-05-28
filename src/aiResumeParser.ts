import type { ResumeData } from './resumeParser';

const RESUME_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    title: { type: 'string' },
    bio: { type: 'string' },
    skills: {
      type: 'array',
      items: { type: 'string' },
    },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          company: { type: 'string' },
          role: { type: 'string' },
          period: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['company', 'role', 'period', 'detail'],
      },
    },
    education: { type: 'string' },
  },
  required: ['name', 'title', 'bio', 'skills', 'experience', 'education'],
};

interface AiOutputContent {
  type?: string;
  text?: string;
}

interface AiOutputItem {
  content?: AiOutputContent[];
}

export interface AiResumeResponse {
  output?: AiOutputItem[];
}

export interface AiModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function buildAiResumeParseRequest(config: AiModelConfig, resumeText: string) {
  return {
    url: `${config.baseUrl.replace(/\/$/, '')}/responses`,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: config.model,
      input: [
        {
          role: 'system',
          content: '你是简历解析助手。只根据用户提供的简历文本提取字段，缺失字段返回空字符串或空数组，不要编造。',
        },
        {
          role: 'user',
          content: resumeText,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'resume_profile',
          schema: RESUME_SCHEMA,
          strict: true,
        },
      },
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
    throw new Error('AI 解析失败，请重试');
  }

  return extractResumeFromAiResponse(await response.json() as AiResumeResponse);
}

export function extractResumeFromAiResponse(response: AiResumeResponse): ResumeData {
  const outputText = response.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === 'output_text' && content.text)
    ?.text;

  if (!outputText) {
    throw new Error('AI 解析失败，请重试');
  }

  return normalizeResumeData(JSON.parse(outputText) as Partial<ResumeData>);
}

function normalizeResumeData(data: Partial<ResumeData>): ResumeData {
  return {
    name: data.name ?? '',
    title: data.title ?? '',
    bio: data.bio ?? '',
    skills: Array.isArray(data.skills) ? data.skills : [],
    experience: Array.isArray(data.experience) ? data.experience.map((experience) => ({
      company: experience.company ?? '',
      role: experience.role ?? '',
      period: experience.period ?? '',
      detail: experience.detail ?? '',
    })) : [],
    education: data.education ?? '',
  };
}
