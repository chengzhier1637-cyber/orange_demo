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
  rawText: string;
  sections: {
    title: string;
    content: string;
  }[];
}

export interface ResumeFileLike {
  name: string;
  size: number;
}

export const MAX_RESUME_FILE_SIZE = 50 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'txt'];
const SECTION_LABELS = {
  bio: ['简介', '个人简介', '自我评价', '职业总结', 'Profile', 'Summary', 'Bio'],
  skills: ['技能', '专业技能', '技能标签', '核心能力', 'Skills'],
  experience: ['经历', '工作经历', '项目经历', '实习经历', 'Experience', 'Work Experience'],
  education: ['教育', '教育背景', 'Education'],
};
const EXTRA_SECTION_LABELS = [
  '个人信息',
  '联系方式',
  '项目',
  '项目经验',
  '证书',
  '资格证书',
  '专业证书',
  '荣誉',
  '奖项',
  '获奖经历',
  '语言',
  '语言能力',
  '校园经历',
  '社团经历',
  '培训经历',
  '作品集',
  '开源项目',
];
const ALL_SECTION_LABELS = [...Object.values(SECTION_LABELS).flat(), ...EXTRA_SECTION_LABELS];

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
  const sections = parseSections(lines);

  const parsed: ResumeData = {
    name: readField(lines, ['姓名', 'Name']) || inferName(lines),
    title: readField(lines, ['标题', '职位', '求职意向', 'Title']) || inferTitle(lines),
    bio: readField(lines, ['简介', '个人简介', 'Bio']) || readSectionText(sections, SECTION_LABELS.bio),
    skills: parseSkills(readField(lines, ['技能', '专业技能', 'Skills']) || readSectionText(sections, SECTION_LABELS.skills)),
    experience: parseExperience(lines, sections),
    education: readField(lines, ['教育', '教育背景', 'Education']) || readSectionText(sections, SECTION_LABELS.education),
    rawText: content,
    sections: Array.from(sections.entries()).map(([title, sectionLines]) => ({
      title: restoreSectionTitle(title),
      content: sectionLines.join('\n').trim(),
    })),
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

function normalizeLabel(label: string) {
  return label.replace(/\s/g, '').toLowerCase();
}

function restoreSectionTitle(normalizedLabel: string) {
  return ALL_SECTION_LABELS.find((label) => normalizeLabel(label) === normalizedLabel) ?? normalizedLabel;
}

function isSectionLabel(line: string, labels = ALL_SECTION_LABELS) {
  const [label] = splitFieldLine(line);
  const normalizedLine = normalizeLabel(label.replace(/[：:]/g, ''));

  return labels.some((item) => normalizeLabel(item) === normalizedLine);
}

function parseSections(lines: string[]) {
  const sections = new Map<string, string[]>();
  let activeLabel = '';

  lines.forEach((line) => {
    if (isSectionLabel(line)) {
      activeLabel = normalizeLabel(splitFieldLine(line)[0]);
      sections.set(activeLabel, []);
      const inlineValue = splitFieldLine(line)[1];

      if (inlineValue) {
        sections.get(activeLabel)?.push(inlineValue);
      }
      return;
    }

    if (activeLabel) {
      sections.get(activeLabel)?.push(line);
    }
  });

  return sections;
}

function readSectionText(sections: Map<string, string[]>, labels: string[]) {
  const matchedLabel = labels.map(normalizeLabel).find((label) => sections.has(label));

  return matchedLabel ? sections.get(matchedLabel)?.join('\n').trim() ?? '' : '';
}

function inferName(lines: string[]) {
  const firstContentLine = lines.find((line) => !isSectionLabel(line) && !line.includes('：') && !line.includes(':'));
  return firstContentLine && firstContentLine.length <= 12 ? firstContentLine : '';
}

function inferTitle(lines: string[]) {
  const name = inferName(lines);
  const nameIndex = name ? lines.indexOf(name) : -1;
  const titleCandidate = lines.slice(nameIndex + 1).find((line) => (
    !isSectionLabel(line) && !line.includes('：') && !line.includes(':') && line.length <= 30
  ));

  return titleCandidate ?? '';
}

function parseSkills(value: string) {
  return value
    .split(/[,，、\n]/)
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function parseExperience(lines: string[], sections = parseSections(lines)) {
  return SECTION_LABELS.experience.flatMap((label) => {
    const sectionLines = readSectionText(sections, [label]).split('\n').filter(Boolean);
    const parsedExperience = parsePipeExperience(sectionLines);
    const experiences = parsedExperience.length > 0 ? parsedExperience : parseParagraphExperience(sectionLines);

    if (experiences.length > 0) {
      return experiences;
    }

    return parseProjectExperience(label, sectionLines);
  });
}

function parsePipeExperience(experienceLines: string[]) {
  return experienceLines
    .filter((line) => line.includes('|'))
    .map((line) => {
      const [company = '', role = '', period = '', detail = ''] = line.split('|').map((part) => part.trim());
      return { company, role, period, detail };
    });
}

function parseParagraphExperience(experienceLines: string[]) {
  const experiences: ResumeData['experience'] = [];

  experienceLines.forEach((line) => {
    const periodMatch = line.match(/(\d{4}[./-]\d{1,2}\s*[-—至到]+\s*(?:\d{4}[./-]\d{1,2}|至今|现在|今))/);

    if (periodMatch) {
      const afterPeriod = line.slice(periodMatch.index! + periodMatch[0].length).trim();
      const [company = '', role = ''] = afterPeriod.split(/\s{2,}|\s+/).filter(Boolean);

      experiences.push({
        company,
        role,
        period: periodMatch[0].trim(),
        detail: '',
      });
      return;
    }

    const lastExperience = experiences.at(-1);

    if (lastExperience) {
      lastExperience.detail = [lastExperience.detail, line].filter(Boolean).join('\n');
    }
  });

  return experiences.filter((experience) => experience.company || experience.role || experience.period || experience.detail);
}

function parseProjectExperience(sectionTitle: string, experienceLines: string[]) {
  if (!experienceLines.length || !normalizeLabel(sectionTitle).includes('项目')) {
    return [];
  }

  return experienceLines.map((line) => {
    const [projectName, ...detailParts] = line.split(/[：:]/);

    return {
      company: projectName.trim(),
      role: restoreSectionTitle(normalizeLabel(sectionTitle)),
      period: '',
      detail: detailParts.join(':').trim(),
    };
  }).filter((experience) => experience.company || experience.detail);
}
