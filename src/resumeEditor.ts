import type { ResumeData } from './resumeParser';

type Experience = ResumeData['experience'][number];

export function getCompletenessWarnings(resume: ResumeData) {
  const warnings: string[] = [];

  if (!resume.name.trim()) {
    warnings.push('缺少姓名');
  }

  if (!resume.title.trim()) {
    warnings.push('缺少职位标题');
  }

  if (!resume.bio.trim()) {
    warnings.push('缺少个人简介');
  }

  if (resume.skills.length === 0) {
    warnings.push('缺少技能标签');
  }

  if (resume.experience.length === 0) {
    warnings.push('缺少工作经历');
  }

  if (!resume.education.trim()) {
    warnings.push('缺少教育背景');
  }

  return warnings;
}

export function updateExperience(
  resume: ResumeData,
  index: number,
  field: keyof Experience,
  value: string,
) {
  return {
    ...resume,
    experience: resume.experience.map((experience, currentIndex) => (
      currentIndex === index ? { ...experience, [field]: value } : experience
    )),
  };
}

export function addExperience(resume: ResumeData) {
  return {
    ...resume,
    experience: [
      ...resume.experience,
      {
        company: '',
        role: '',
        period: '',
        detail: '',
      },
    ],
  };
}

export function removeExperience(resume: ResumeData, index: number) {
  return {
    ...resume,
    experience: resume.experience.filter((_, currentIndex) => currentIndex !== index),
  };
}

export function moveExperience(resume: ResumeData, index: number, direction: -1 | 1) {
  const targetIndex = index + direction;

  if (targetIndex < 0 || targetIndex >= resume.experience.length) {
    return resume;
  }

  const nextExperience = [...resume.experience];
  const [movedItem] = nextExperience.splice(index, 1);
  nextExperience.splice(targetIndex, 0, movedItem);

  return {
    ...resume,
    experience: nextExperience,
  };
}

export function polishResume(resume: ResumeData) {
  return {
    ...resume,
    bio: resume.bio.includes('亮点')
      ? resume.bio
      : `${resume.bio} 核心亮点：能将复杂问题拆解为可落地方案，并持续关注业务结果。`,
    experience: resume.experience.map((experience) => ({
      ...experience,
      detail: experience.detail.includes('成果')
        ? experience.detail
        : `${experience.detail} 重点成果：提升协作效率，沉淀可复用方法。`,
    })),
  };
}
