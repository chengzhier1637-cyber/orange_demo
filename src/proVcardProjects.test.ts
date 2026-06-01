import test from 'node:test';
import assert from 'node:assert/strict';
import { getProVcardProjects } from './proVcardProjects.ts';
import type { ResumeData } from './resumeParser.ts';

const baseResume: ResumeData = {
  name: '张明远',
  title: '产品设计师',
  bio: '',
  skills: [],
  experience: [
    {
      company: '字节跳动',
      role: '设计系统项目',
      period: '2022-至今',
      detail: '负责商家端设计系统搭建，效率提升 35%。',
    },
  ],
  education: '',
  rawText: '',
  sections: [],
};

test('getProVcardProjects extracts project cards from parsed project sections', () => {
  const projects = getProVcardProjects({
    ...baseResume,
    sections: [
      {
        title: '项目经历',
        content: '商家设计系统：覆盖 50 万商家，效率提升 35%。\n- 歌单协作项目：日活 200 万+。',
      },
    ],
  });

  assert.equal(projects.length, 2);
  assert.equal(projects[0].title, '商家设计系统');
  assert.match(projects[1].detail, /歌单协作/);
});

test('getProVcardProjects falls back to experience cards when no project sections exist', () => {
  const projects = getProVcardProjects(baseResume);

  assert.equal(projects.length, 1);
  assert.equal(projects[0].title, '设计系统项目');
  assert.match(projects[0].detail, /效率提升 35%/);
});
