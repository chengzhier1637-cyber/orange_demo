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
  });
});

test('parseResumeContent throws short error for empty text', () => {
  assert.throws(
    () => parseResumeContent(' '),
    /未识别到简历内容/,
  );
});
