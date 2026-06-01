import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TEMPLATE_ID,
  getTemplateById,
  getTemplateStyle,
  RESUME_TEMPLATES,
} from './resumeTemplates.ts';

test('resume templates provide baseline and pro vcard options', () => {
  assert.deepEqual(RESUME_TEMPLATES.map((template) => template.id), [
    'minimal',
    'professional',
    'creative',
    'pro-vcard',
  ]);
});

test('getTemplateById falls back to the minimal default template', () => {
  assert.equal(DEFAULT_TEMPLATE_ID, 'minimal');
  assert.equal(getTemplateById(undefined).id, 'minimal');
  assert.equal(getTemplateById('unknown').id, 'minimal');
});

test('getTemplateStyle converts selected template into page style data', () => {
  const style = getTemplateStyle('pro-vcard');

  assert.equal(style.templateId, 'pro-vcard');
  assert.equal(style.sourceUrl, 'template://pro-vcard');
  assert.equal(style.cardStyle, 'pill');
  assert.equal(style.darkMode, true);
  assert.equal(style.colors.length, 5);
});
