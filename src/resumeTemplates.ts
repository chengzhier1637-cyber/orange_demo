export type ResumeTemplateId = 'minimal' | 'professional' | 'creative';

export interface TemplateStyleData {
  templateId: ResumeTemplateId;
  sourceUrl: string;
  colors: string[];
  headingFont: string;
  bodyFont: string;
  cardStyle: 'rounded' | 'sharp' | 'pill';
  darkMode: boolean;
}

export interface ResumeTemplate {
  id: ResumeTemplateId;
  name: string;
  description: string;
  badge: string;
  highlights: string[];
  style: Omit<TemplateStyleData, 'templateId' | 'sourceUrl'>;
}

export const DEFAULT_TEMPLATE_ID: ResumeTemplateId = 'minimal';

export const RESUME_TEMPLATES: ResumeTemplate[] = [
  {
    id: 'minimal',
    name: '简约',
    description: '留白充足，突出姓名、简介和关键技能。',
    badge: '默认',
    highlights: ['清爽留白', '圆角卡片', '蓝色强调'],
    style: {
      colors: ['#111827', '#f8fafc', '#4f6bed', '#64748b', '#ffffff'],
      headingFont: 'Inter',
      bodyFont: 'Inter',
      cardStyle: 'rounded',
      darkMode: false,
    },
  },
  {
    id: 'professional',
    name: '专业',
    description: '时间轴更强，适合产品、运营、技术岗位。',
    badge: '稳重',
    highlights: ['深色标题', '结构清晰', '经历优先'],
    style: {
      colors: ['#0f172a', '#eef2ff', '#2563eb', '#475569', '#ffffff'],
      headingFont: 'Georgia',
      bodyFont: 'Inter',
      cardStyle: 'sharp',
      darkMode: false,
    },
  },
  {
    id: 'creative',
    name: '创意',
    description: '更强视觉记忆点，适合设计、内容、增长方向。',
    badge: '吸睛',
    highlights: ['渐变头像', '胶囊标签', '活泼配色'],
    style: {
      colors: ['#2d1b69', '#fff7ed', '#f97316', '#7c3aed', '#ffffff'],
      headingFont: 'Trebuchet MS',
      bodyFont: 'Inter',
      cardStyle: 'pill',
      darkMode: false,
    },
  },
];

export function getTemplateById(templateId?: string) {
  return RESUME_TEMPLATES.find((template) => template.id === templateId) ?? RESUME_TEMPLATES[0];
}

export function getTemplateStyle(templateId?: string): TemplateStyleData {
  const template = getTemplateById(templateId);

  return {
    templateId: template.id,
    sourceUrl: `template://${template.id}`,
    ...template.style,
  };
}
