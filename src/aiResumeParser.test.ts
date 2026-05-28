import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiResumeParseRequest,
  extractResumeFromAiResponse,
} from './aiResumeParser.ts';

test('buildAiResumeParseRequest keeps the API key out of the request body', () => {
  const request = buildAiResumeParseRequest({
    apiKey: 'OPENAI_API_KEY_VALUE',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
  }, '姓名：王琳');

  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.headers.Authorization, 'Bearer OPENAI_API_KEY_VALUE');
  assert.equal(JSON.stringify(request.body).includes('OPENAI_API_KEY_VALUE'), false);
});

test('buildAiResumeParseRequest asks for structured resume fields', () => {
  const request = buildAiResumeParseRequest({
    apiKey: 'key',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  }, '姓名：王琳');

  assert.equal(request.url, 'https://api.deepseek.com/v1/responses');
  assert.equal(request.body.model, 'deepseek-chat');
  assert.equal(request.body.text.format.type, 'json_schema');
  assert.equal(request.body.text.format.name, 'resume_profile');
  assert.deepEqual(request.body.text.format.schema.required, [
    'name',
    'title',
    'bio',
    'skills',
    'experience',
    'education',
  ]);
});

test('extractResumeFromAiResponse reads parsed structured output text', () => {
  const resume = extractResumeFromAiResponse({
    output: [
      {
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              name: '王琳',
              title: '增长产品经理',
              bio: '负责 B 端增长。',
              skills: ['增长', '数据分析'],
              experience: [
                {
                  company: '云舟科技',
                  role: '产品经理',
                  period: '2021-至今',
                  detail: '搭建获客漏斗。',
                },
              ],
              education: '上海交通大学 · 管理科学',
            }),
          },
        ],
      },
    ],
  });

  assert.equal(resume.name, '王琳');
  assert.deepEqual(resume.skills, ['增长', '数据分析']);
});
