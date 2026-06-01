import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogEntry, sanitizeLogMeta } from './logger.ts';

test('sanitizeLogMeta redacts secrets and resume content', () => {
  const sanitized = sanitizeLogMeta({
    apiKey: 'sk-secret',
    content: '这是一整段简历正文',
    draftId: 'draft_123',
    nested: {
      token: 'private-token',
      provider: 'DeepSeek',
    },
  });

  assert.deepEqual(sanitized, {
    apiKey: '[redacted]',
    contentLength: 9,
    draftId: 'draft_123',
    nested: {
      token: '[redacted]',
      provider: 'DeepSeek',
    },
  });
});

test('createLogEntry formats level event and sanitized meta', () => {
  const entry = createLogEntry('info', 'resume.parse.success', {
    parser: 'local',
    content: '简历正文',
  });

  assert.equal(entry.level, 'info');
  assert.equal(entry.event, 'resume.parse.success');
  assert.deepEqual(entry.meta, {
    parser: 'local',
    contentLength: 4,
  });
  assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});
