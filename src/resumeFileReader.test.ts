import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFallbackResumeContent,
  extractResumeFileContent,
  isLikelyUnreadablePdfContent,
  rebuildPdfPageText,
} from './resumeFileReader.ts';

test('createFallbackResumeContent infers name and title from resume file name', () => {
  const content = createFallbackResumeContent('陈志强-项目经理简历.pdf');

  assert.match(content, /姓名：陈志强/);
  assert.match(content, /标题：项目经理/);
});

test('extractResumeFileContent falls back for empty text files', async () => {
  const file = new File(['   '], '陈志强-项目经理简历.txt', { type: 'text/plain' });
  const content = await extractResumeFileContent(file);

  assert.match(content, /姓名：陈志强/);
  assert.match(content, /标题：项目经理/);
});

test('rebuildPdfPageText restores line order from positioned PDF text items', () => {
  const content = rebuildPdfPageText([
    { str: '项目经理', transform: [1, 0, 0, 1, 86, 760], width: 48 },
    { str: '技能：', transform: [1, 0, 0, 1, 40, 730], width: 36 },
    { str: '姓名：', transform: [1, 0, 0, 1, 40, 780], width: 36 },
    { str: '陈志强', transform: [1, 0, 0, 1, 82, 780], width: 48 },
    { str: '标题：', transform: [1, 0, 0, 1, 40, 760], width: 36 },
    { str: '项目管理', transform: [1, 0, 0, 1, 82, 730], width: 64 },
  ]);

  assert.equal(content, '姓名：陈志强\n标题：项目经理\n技能：项目管理');
});

test('isLikelyUnreadablePdfContent detects fallback-only PDF extraction', () => {
  assert.equal(isLikelyUnreadablePdfContent(createFallbackResumeContent('简历.pdf')), true);
  assert.equal(isLikelyUnreadablePdfContent('姓名：陈志强\n项目经理\n8 年项目管理经验，负责企业级 SaaS 项目交付。'), false);
});
