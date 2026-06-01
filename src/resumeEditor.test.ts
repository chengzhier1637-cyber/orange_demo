import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addExperience,
  getCompletenessWarnings,
  moveExperience,
  polishResume,
  removeExperience,
  updateExperience,
} from './resumeEditor.ts';
import type { ResumeData } from './resumeParser.ts';

const resume: ResumeData = {
  name: '林夏',
  title: '产品设计师',
  bio: '负责复杂 B 端体验。',
  skills: ['Figma'],
  experience: [
    {
      company: '甲公司',
      role: '设计师',
      period: '2022-2023',
      detail: '负责设计系统。',
    },
    {
      company: '乙公司',
      role: '实习设计师',
      period: '2021-2022',
      detail: '支持用研。',
    },
  ],
  education: '同济大学',
  rawText: '林夏 产品设计师',
  sections: [],
};

test('getCompletenessWarnings returns non-blocking missing field hints', () => {
  assert.deepEqual(getCompletenessWarnings({
    ...resume,
    name: '',
    skills: [],
    experience: [],
  }), ['缺少姓名', '缺少技能标签', '缺少工作经历']);
});

test('updateExperience edits one experience item without changing others', () => {
  const updated = updateExperience(resume, 0, 'role', '高级设计师');

  assert.equal(updated.experience[0].role, '高级设计师');
  assert.equal(updated.experience[1].role, '实习设计师');
});

test('addExperience appends an empty editable item', () => {
  const updated = addExperience(resume);

  assert.equal(updated.experience.length, 3);
  assert.deepEqual(updated.experience[2], {
    company: '',
    role: '',
    period: '',
    detail: '',
  });
});

test('removeExperience deletes the selected item', () => {
  const updated = removeExperience(resume, 0);

  assert.equal(updated.experience.length, 1);
  assert.equal(updated.experience[0].company, '乙公司');
});

test('moveExperience reorders items within bounds', () => {
  const moved = moveExperience(resume, 1, -1);
  const unchanged = moveExperience(resume, 0, -1);

  assert.deepEqual(moved.experience.map((item) => item.company), ['乙公司', '甲公司']);
  assert.deepEqual(unchanged.experience.map((item) => item.company), ['甲公司', '乙公司']);
});

test('polishResume improves bio and experience detail without removing user data', () => {
  const polished = polishResume(resume);

  assert.match(polished.bio, /亮点/);
  assert.match(polished.experience[0].detail, /成果/);
  assert.equal(polished.name, '林夏');
});
