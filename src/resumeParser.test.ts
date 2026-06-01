import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RESUME_FILE_SIZE,
  parseResumeContent,
  validateResumeFile,
} from './resumeParser.ts';

test('validateResumeFile accepts supported resume files under 50MB', () => {
  const result = validateResumeFile({
    name: 'resume.pdf',
    size: MAX_RESUME_FILE_SIZE,
  });

  assert.equal(result.ok, true);
});

test('validateResumeFile rejects files over 50MB', () => {
  const result = validateResumeFile({
    name: 'resume.pdf',
    size: MAX_RESUME_FILE_SIZE + 1,
  });

  assert.deepEqual(result, {
    ok: false,
    message: '文件超过 50MB，请压缩后重试',
  });
});

test('validateResumeFile rejects unsupported file types', () => {
  const result = validateResumeFile({
    name: 'resume.png',
    size: 1024,
  });

  assert.deepEqual(result, {
    ok: false,
    message: '仅支持 PDF、DOCX、TXT 格式',
  });
});

test('parseResumeContent extracts minimum resume fields while allowing empty fields', () => {
  const parsed = parseResumeContent(`
    姓名：李青
    标题：前端工程师
    简介：专注 React 与可视化体验。
    技能：React, TypeScript, CSS
    经历：
    星河科技 | 前端工程师 | 2022-至今 | 负责简历主页生成器的交互实现。
    教育：复旦大学 · 软件工程
  `);

  assert.deepEqual(parsed, {
    name: '李青',
    title: '前端工程师',
    bio: '专注 React 与可视化体验。',
    skills: ['React', 'TypeScript', 'CSS'],
    experience: [
      {
        company: '星河科技',
        role: '前端工程师',
        period: '2022-至今',
        detail: '负责简历主页生成器的交互实现。',
      },
    ],
    education: '复旦大学 · 软件工程',
    rawText: parsed.rawText,
    sections: [
      {
        title: '简介',
        content: '专注 React 与可视化体验。',
      },
      {
        title: '技能',
        content: 'React, TypeScript, CSS',
      },
      {
        title: '经历',
        content: '星河科技 | 前端工程师 | 2022-至今 | 负责简历主页生成器的交互实现。',
      },
      {
        title: '教育',
        content: '复旦大学 · 软件工程',
      },
    ],
  });
});

test('parseResumeContent fills fields from common resume section headings', () => {
  const parsed = parseResumeContent(`
    陈志强
    项目经理

    个人简介
    8 年互联网项目管理经验，擅长跨部门协作和复杂项目推进。

    专业技能
    项目管理、需求分析、敏捷开发、风险管理

    工作经历
    2021.03 - 至今  云舟科技  高级项目经理
    负责企业级 SaaS 项目交付，管理 12 人项目团队，年度交付准时率提升至 96%。

    2018.07 - 2021.02  星河互联  项目经理
    主导 CRM 系统重构，推动销售流程线上化。

    教育背景
    华南理工大学 工商管理 本科 2016
  `);

  assert.equal(parsed.name, '陈志强');
  assert.equal(parsed.title, '项目经理');
  assert.equal(parsed.bio, '8 年互联网项目管理经验，擅长跨部门协作和复杂项目推进。');
  assert.deepEqual(parsed.skills, ['项目管理', '需求分析', '敏捷开发', '风险管理']);
  assert.equal(parsed.experience.length, 2);
  assert.equal(parsed.experience[0].company, '云舟科技');
  assert.equal(parsed.experience[0].role, '高级项目经理');
  assert.equal(parsed.experience[0].detail, '负责企业级 SaaS 项目交付，管理 12 人项目团队，年度交付准时率提升至 96%。');
  assert.equal(parsed.experience[1].company, '星河互联');
  assert.equal(parsed.experience[1].role, '项目经理');
  assert.equal(parsed.education, '华南理工大学 工商管理 本科 2016');
});

test('parseResumeContent turns project section paragraphs into editable experiences', () => {
  const parsed = parseResumeContent(`
    陈志强
    项目经理

    工作经历
    2021.03 - 至今  云舟科技  高级项目经理
    负责企业级 SaaS 项目交付。

    项目经历
    CRM 系统重构：负责范围、排期、风险控制。
    数据看板建设：统一项目进度指标。
  `);

  assert.equal(parsed.experience.length, 3);
  assert.equal(parsed.experience[1].company, 'CRM 系统重构');
  assert.equal(parsed.experience[1].role, '项目经历');
  assert.equal(parsed.experience[1].detail, '负责范围、排期、风险控制。');
  assert.equal(parsed.experience[2].company, '数据看板建设');
});

test('parseResumeContent preserves full raw text and section content', () => {
  const rawContent = `
    陈志强
    项目经理
    项目经历
    CRM 系统重构：负责范围、排期、风险控制。
    证书
    PMP
  `;
  const parsed = parseResumeContent(rawContent);

  assert.match(parsed.rawText, /CRM 系统重构/);
  assert.equal(parsed.sections.some((section) => section.title === '项目经历'), true);
  assert.equal(parsed.sections.some((section) => section.title === '证书' && section.content.includes('PMP')), true);
});

test('parseResumeContent throws short error for empty text', () => {
  assert.throws(
    () => parseResumeContent(' '),
    /未识别到简历内容/,
  );
});
