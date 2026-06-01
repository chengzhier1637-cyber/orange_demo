import type { ResumeData } from './resumeParser';

export interface ProVcardProject {
  title: string;
  summary: string;
  detail: string;
}

const PROJECT_SECTION_PATTERN = /(项目|作品|案例|开源)/;

export function getProVcardProjects(resume: ResumeData): ProVcardProject[] {
  const sectionProjects = resume.sections
    .filter((section) => PROJECT_SECTION_PATTERN.test(section.title))
    .flatMap((section) => splitProjectContent(section.content).map((content, index) => ({
      title: inferProjectTitle(content, section.title, index),
      summary: content.split('\n')[0] ?? content,
      detail: content,
    })));

  if (sectionProjects.length > 0) {
    return sectionProjects.slice(0, 4);
  }

  return resume.experience.slice(0, 3).map((experience) => ({
    title: experience.role || experience.company || '代表项目',
    summary: experience.company || experience.period || '从工作经历中生成的项目卡片',
    detail: experience.detail || '该项目详情可在编辑页继续补充。',
  }));
}

function splitProjectContent(content: string) {
  return content
    .split(/\n(?=\d+[.、)]|[-•]|项目|作品|案例)/)
    .map((item) => item.trim().replace(/^[-•]\s*/, ''))
    .filter(Boolean);
}

function inferProjectTitle(content: string, sectionTitle: string, index: number) {
  const firstLine = content.split('\n')[0]?.replace(/^\d+[.、)]\s*/, '').trim() ?? '';
  const [title] = firstLine.split(/[：:|｜-]/).map((part) => part.trim());

  return title || `${sectionTitle} ${index + 1}`;
}
