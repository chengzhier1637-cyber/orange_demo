import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiResumeParseRequest,
  parseResumeWithAi,
  testAiModelConnection,
  extractResumeFromAiResponse,
} from './aiResumeParser.ts';

test('buildAiResumeParseRequest keeps the API key out of the request body', () => {
  const request = buildAiResumeParseRequest({
    apiKey: 'OPENAI_API_KEY_VALUE',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
  }, '姓名：王琳');

  assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(request.headers.Authorization, 'Bearer OPENAI_API_KEY_VALUE');
  assert.equal(JSON.stringify(request.body).includes('OPENAI_API_KEY_VALUE'), false);
});

test('buildAiResumeParseRequest uses OpenAI-compatible chat completions for model providers', () => {
  const request = buildAiResumeParseRequest({
    apiKey: 'key',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  }, '姓名：王琳');

  assert.equal(request.url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(request.body.model, 'deepseek-chat');
  assert.equal(request.body.response_format.type, 'json_object');
  assert.equal(request.body.messages[0].role, 'system');
  assert.equal(request.body.messages[0].content.includes('个人简介、专业技能、工作经历、项目经历、教育背景'), true);
  assert.equal(request.body.messages[1].content, '姓名：王琳');
});

test('extractResumeFromAiResponse reads parsed chat completion content', () => {
  const resume = extractResumeFromAiResponse({
    choices: [
      {
        message: {
          content: JSON.stringify({
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
      },
    ],
  });

  assert.equal(resume.name, '王琳');
  assert.deepEqual(resume.skills, ['增长', '数据分析']);
});

test('extractResumeFromAiResponse tolerates fenced json output', () => {
  const resume = extractResumeFromAiResponse({
    choices: [
      {
        message: {
          content: '```json\n{"name":"王琳","skills":["增长"],"experience":[]}\n```',
        },
      },
    ],
  });

  assert.equal(resume.name, '王琳');
  assert.equal(resume.title, '');
  assert.deepEqual(resume.skills, ['增长']);
});

test('extractResumeFromAiResponse converts nested model fields into readable text', () => {
  const resume = extractResumeFromAiResponse({
    choices: [
      {
        message: {
          content: JSON.stringify({
            name: '陈志强',
            education: {
              school: '华南理工大学',
              major: '工商管理',
              degree: '本科',
              year: '2016',
            },
            skills: ['项目管理', { name: '敏捷开发' }],
            experience: [
              {
                company: { name: '云舟科技' },
                role: '高级项目经理',
                period: '2021.03 - 至今',
                detail: ['负责企业级 SaaS 项目交付', '管理 12 人项目团队'],
              },
            ],
            sections: [
              {
                title: '教育背景',
                content: { school: '华南理工大学', major: '工商管理' },
              },
            ],
          }),
        },
      },
    ],
  });

  assert.equal(resume.education, '华南理工大学 工商管理 本科 2016');
  assert.deepEqual(resume.skills, ['项目管理', '敏捷开发']);
  assert.equal(resume.experience[0].company, '云舟科技');
  assert.equal(resume.experience[0].detail, '负责企业级 SaaS 项目交付\n管理 12 人项目团队');
  assert.equal(resume.sections[0].content, '华南理工大学 工商管理');
});

test('parseResumeWithAi returns a clear message when api key is invalid', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: { message: 'Authentication Fails, api key is invalid' },
  }), { status: 401 })) as typeof fetch;

  await assert.rejects(
    parseResumeWithAi({
      apiKey: 'bad-key',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    }, '姓名：王琳'),
    /API Key 无效，请检查模型设置/,
  );

  globalThis.fetch = originalFetch;
});

test('testAiModelConnection sends a small json probe', async () => {
  const originalFetch = globalThis.fetch;
  let requestedBody = '';
  globalThis.fetch = (async (_url, init) => {
    requestedBody = String(init?.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200 });
  }) as typeof fetch;

  await testAiModelConnection({
    apiKey: 'valid-key',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  });

  assert.equal(JSON.parse(requestedBody).messages[1].content, '请返回 {"ok": true}');
  globalThis.fetch = originalFetch;
});
