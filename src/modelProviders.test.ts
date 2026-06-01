import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultModelForProvider,
  getModelProvider,
  inferProviderFromApiKey,
  MODEL_PROVIDERS,
} from './modelProviders.ts';

test('model providers include mainstream OpenAI-compatible vendors', () => {
  assert.deepEqual(MODEL_PROVIDERS.map((provider) => provider.id), [
    'openai',
    'deepseek',
    'qwen',
    'kimi',
    'gemini',
    'openrouter',
    'siliconflow',
    'custom',
  ]);
});

test('getDefaultModelForProvider returns vendor mainstream model', () => {
  assert.equal(getDefaultModelForProvider('deepseek')?.model, 'deepseek-chat');
  assert.equal(getDefaultModelForProvider('gemini')?.model, 'gemini-2.5-flash');
});

test('inferProviderFromApiKey recognizes unique key prefixes only', () => {
  assert.equal(inferProviderFromApiKey('sk-or-v1-abc')?.providerId, 'openrouter');
  assert.equal(inferProviderFromApiKey('AIzaSyabc')?.providerId, 'gemini');
  assert.equal(inferProviderFromApiKey('sk-proj-abc')?.providerId, 'openai');
  assert.equal(inferProviderFromApiKey('sk-ambiguous'), null);
});

test('getModelProvider falls back to custom provider', () => {
  assert.equal(getModelProvider('unknown').id, 'custom');
});
