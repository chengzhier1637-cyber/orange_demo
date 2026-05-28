export interface ResumeData {
  name: string;
  title: string;
  bio: string;
  skills: string[];
  experience: {
    company: string;
    role: string;
    period: string;
    detail: string;
  }[];
  education: string;
}

export interface ResumeFileLike {
  name: string;
  size: number;
}

export const MAX_RESUME_FILE_SIZE = 50 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'txt'];

export function validateResumeFile(file: ResumeFileLike) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    return {
      ok: false,
      message: '仅支持 PDF、DOCX、TXT 格式',
    };
  }

  if (file.size > MAX_RESUME_FILE_SIZE) {
    return {
      ok: false,
      message: '文件超过 50MB，请压缩后重试',
    };
  }

  return { ok: true, message: '' };
}

export function parseResumeContent(rawContent: string): ResumeData {
  const content = rawContent.trim();

  if (!content) {
    throw new Error('未识别到简历内容');
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: ResumeData = {
    name: readField(lines, ['姓名', 'Name']),
    title: readField(lines, ['标题', '职位', 'Title']),
    bio: readField(lines, ['简介', '个人简介', 'Bio']),
    skills: parseSkills(readField(lines, ['技能', 'Skills'])),
    experience: parseExperience(lines),
    education: readField(lines, ['教育', '教育背景', 'Education']),
  };

  if (!parsed.name && !parsed.title && !parsed.bio && parsed.skills.length === 0 && parsed.experience.length === 0 && !parsed.education) {
    throw new Error('未识别到简历内容');
  }

  return parsed;
}

function readField(lines: string[], labels: string[]) {
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  const targetLine = lines.find((line) => {
    const [label] = splitFieldLine(line);
    return normalizedLabels.includes(label.toLowerCase());
  });

  if (!targetLine) {
    return '';
  }

  return splitFieldLine(targetLine)[1] ?? '';
}

function splitFieldLine(line: string) {
  const [label, ...rest] = line.split(/[：:]/);

  return [label.trim(), rest.join(':').trim()];
}

function parseSkills(value: string) {
  return value
    .split(/[,，、]/)
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function parseExperience(lines: string[]) {
  const startIndex = lines.findIndex((line) => {
    const [label] = splitFieldLine(line);
    return ['经历', '工作经历', 'Experience'].includes(label);
  });

  if (startIndex === -1) {
    return [];
  }

  const nextSectionIndex = lines.findIndex((line, index) => {
    if (index <= startIndex) {
      return false;
    }

    const [label] = splitFieldLine(line);
    return ['教育', '教育背景', 'Education', '技能', 'Skills'].includes(label);
  });

  const experienceLines = lines.slice(startIndex + 1, nextSectionIndex === -1 ? undefined : nextSectionIndex);

  return experienceLines
    .map((line) => {
      const [company = '', role = '', period = '', detail = ''] = line
        .split('|')
        .map((part) => part.trim());

      return { company, role, period, detail };
    })
    .filter((experience) => experience.company || experience.role || experience.period || experience.detail);
}
