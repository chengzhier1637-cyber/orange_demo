import { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';
import {
  type ResumeData,
  validateResumeFile,
} from './resumeParser';
import { extractResumeFileContent, isLikelyUnreadablePdfContent } from './resumeFileReader';
import {
  addExperience,
  getCompletenessWarnings,
  moveExperience,
  polishResume,
  removeExperience,
  updateExperience,
} from './resumeEditor';
import {
  getTemplateStyle,
  RESUME_TEMPLATES,
  type TemplateStyleData as StyleData,
} from './resumeTemplates';
import {
  getModelProvider,
  inferProviderFromApiKey,
  MODEL_PROVIDERS,
} from './modelProviders';

interface ModelSettingsStatus {
  configured: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  maskedKey: string;
}

/* ===== 模拟简历数据 ===== */
const MOCK_RESUME: ResumeData = {
  name: '张明远',
  title: '资深产品设计师',
  bio: '5 年产品设计经验，擅长从 0 到 1 搭建设计系统。主导过 3 款百万用户级产品的 UX 改版，设计降本增效方案为企业节省 200 万/年。相信好的设计是让复杂变简单。',
  skills: ['Figma', 'Design Systems', '用户研究', '交互设计', 'A/B 测试', 'Framer', 'Notion'],
  experience: [
    { company: '字节跳动', role: '高级产品设计师', period: '2022.03 — 至今', detail: '负责抖音电商商家端设计系统搭建，覆盖 50 万商家用户，设计规范落地后商家操作效率提升 35%。' },
    { company: '网易', role: 'UX 设计师', period: '2020.07 — 2022.02', detail: '网易云音乐社交功能设计，主导歌单协作、一起听等功能的用户体验设计，歌单协作功能日活 200 万+。' },
    { company: '某设计咨询公司', role: '初级设计师', period: '2019.06 — 2020.06', detail: '为金融、教育行业客户提供设计咨询服务，独立完成 8 个项目交付。' },
  ],
  education: '浙江大学 · 工业设计 · 本科 · 2019',
  rawText: '示例简历：张明远，资深产品设计师，具备完整项目经历、技能与教育背景。',
  sections: [
    { title: '个人简介', content: '5 年产品设计经验，擅长从 0 到 1 搭建设计系统。' },
    { title: '工作经历', content: '字节跳动、网易、设计咨询公司相关经历。' },
  ],
};

async function saveResumeDraft(resume: ResumeData, parser: 'ai' | 'local', parseSource: string) {
  const response = await fetch('/api/resume-drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume, parser, parseSource }),
  });
  const result = await response.json() as {
    draft?: { id: string };
    error?: string;
  };

  if (!response.ok || !result.draft) {
    throw new Error(result.error ?? '保存草稿失败，请重试');
  }

  return result.draft;
}

async function updateResumeDraft(draftId: string, resume: ResumeData) {
  const response = await fetch('/api/resume-drafts/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draftId, resume }),
  });
  const result = await response.json() as {
    draft?: { id: string };
    error?: string;
  };

  if (!response.ok || !result.draft) {
    throw new Error(result.error ?? '保存草稿失败，请重试');
  }

  return result.draft;
}

async function generateHomepage(draftId: string, template: string, isLoggedIn: boolean) {
  const response = await fetch('/api/homepages/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draftId, template, isLoggedIn }),
  });
  const result = await response.json() as {
    homepage?: { id: string; publicUrl: string };
    error?: string;
    code?: string;
  };

  if (!response.ok || !result.homepage) {
    throw new Error(result.error ?? '生成主页失败，请重试');
  }

  return result.homepage;
}

async function offlineHomepage(homepageId: string) {
  const response = await fetch('/api/homepages/offline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ homepageId }),
  });
  const result = await response.json() as {
    homepage?: { id: string; status: string };
    error?: string;
  };

  if (!response.ok || !result.homepage) {
    throw new Error(result.error ?? '下线主页失败，请重试');
  }

  return result.homepage;
}

async function fetchPublicHomepage(slug: string) {
  const response = await fetch(`/api/homepages/public/${encodeURIComponent(slug)}`);
  const result = await response.json() as {
    homepage?: {
      id: string;
      publicUrl: string;
      resume: ResumeData;
      template: string;
    };
    error?: string;
  };

  if (!response.ok || !result.homepage) {
    throw new Error(result.error ?? '主页不可访问');
  }

  return result.homepage;
}

/* ===== 3 步流程 ===== */
const STEPS = [
  { label: '上传 & 风格', icon: '1' },
  { label: '预览编辑', icon: '2' },
  { label: '发布分享', icon: '3' },
];

export default function App() {
  const publicSlug = window.location.pathname.match(/^\/p\/([^/]+)/)?.[1] ?? '';
  const [step, setStep] = useState(0);
  const [developerAdminOpen, setDeveloperAdminOpen] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [modelStatus, setModelStatus] = useState<ModelSettingsStatus>({
    configured: false,
    provider: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    maskedKey: '',
  });

  // 简历数据
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [uploaded, setUploaded] = useState(false);

  // 风格数据
  const [style, setStyle] = useState<StyleData>(getTemplateStyle());

  const nextStep = () => setStep((s) => Math.min(s + 1, 2));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));
  const resetResume = () => {
    setResume(null);
    setUploaded(false);
    setDraftId('');
    setStep(0);
  };

  const openDeveloperAdmin = async () => {
    setModelStatus(await fetchModelSettingsStatus());
    setDeveloperAdminOpen(true);
  };

  if (publicSlug) {
    return <PublicHomepage slug={decodeURIComponent(publicSlug)} />;
  }

  return (
    <div className="app">
      {/* 顶部标题 */}
      <header className="app-header">
        <button
          className="settings-button"
          onClick={() => void openDeveloperAdmin()}
        >
          开发者后台
        </button>
        <h1>ResumePage</h1>
        <p className="subtitle">简历 → 个人主页，3 分钟上线</p>
      </header>

      {developerAdminOpen && (
        <DeveloperAdminDialog
          initialStatus={modelStatus}
          onClose={() => setDeveloperAdminOpen(false)}
        />
      )}

      {/* 步骤指示器 */}
      <div className="steps-indicator">
        {STEPS.map((s, i) => (
          <div key={s.label} className="step-column">
            <div className="step-dot">
              <div
                className={`step-circle ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
              >
                {i < step ? '✓' : s.icon}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`step-line ${i < step ? 'done' : ''}`} />
              )}
            </div>
            <div className={`step-label ${i === step ? 'active' : ''}`}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 主内容区 */}
      <main className="main-content">
        {/* Step 1 使用宽卡片容纳双栏布局 */}
        <div className="step-card" style={step === 0 ? { maxWidth: 1080 } : undefined}>
          {step === 0 && (
            <SetupStep
              resume={resume}
              uploaded={uploaded}
              style={style}
              onParsed={(parsedResume) => {
                setResume(parsedResume);
                setUploaded(true);
              }}
              onDraftSaved={setDraftId}
              onUpdateResume={setResume}
              onSelectTemplate={(s) => setStyle(s)}
              onReset={resetResume}
              onUseExample={() => {
                setResume(MOCK_RESUME);
                setUploaded(true);
                void saveResumeDraft(MOCK_RESUME, 'local', '示例简历')
                  .then((draft) => setDraftId(draft.id))
                  .catch(() => setDraftId(''));
              }}
              onNext={nextStep}
            />
          )}
          {step === 1 && (
            <PreviewStep
              resume={resume!}
              style={style}
              draftId={draftId}
              onUpdate={setResume}
              onNext={nextStep}
              onBack={prevStep}
              onReset={resetResume}
            />
          )}
          {step === 2 && (
            <PublishStep
              resume={resume!}
              style={style}
              draftId={draftId}
              onEdit={() => setStep(1)}
              onBack={prevStep}
            />
          )}
        </div>
      </main>
    </div>
  );
}

async function fetchModelSettingsStatus() {
  const response = await fetch('/api/settings/model-key');
  return await response.json() as ModelSettingsStatus;
}

function DeveloperAdminDialog({
  initialStatus,
  onClose,
}: {
  initialStatus: ModelSettingsStatus;
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState(initialStatus.provider);
  const [baseUrl, setBaseUrl] = useState(initialStatus.baseUrl);
  const [model, setModel] = useState(initialStatus.model);
  const [status, setStatus] = useState<ModelSettingsStatus>(initialStatus);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const selectedProvider = getModelProvider(provider);
  const isCustomProvider = selectedProvider.id === 'custom';
  const selectedModelExists = selectedProvider.models.some((item) => item.model === model);
  const effectiveModel = isCustomProvider || selectedModelExists ? model : selectedProvider.models[0]?.model ?? '';

  const selectProvider = (nextProvider: string) => {
    const preset = getModelProvider(nextProvider);

    setProvider(preset.provider);
    setBaseUrl(preset.baseUrl);
    setModel(preset.models[0]?.model ?? '');
    setMessage('');
  };

  const updateApiKey = (nextApiKey: string) => {
    const inferredProvider = inferProviderFromApiKey(nextApiKey);

    setApiKey(nextApiKey);

    if (!inferredProvider) {
      return;
    }

    const preset = getModelProvider(inferredProvider.providerId);
    setProvider(preset.provider);
    setBaseUrl(preset.baseUrl);
    setModel(inferredProvider.model);
    setMessage(`已根据 Key 前缀匹配到 ${preset.provider}`);
  };

  const saveApiKey = async () => {
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch('/api/settings/model-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, baseUrl, model: effectiveModel, apiKey }),
      });
      const result = await response.json() as ModelSettingsStatus & { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? '保存模型设置失败');
      }

      setStatus(result);
      setApiKey('');
      setMessage('连接测试通过，模型设置已保存');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存模型设置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-backdrop">
      <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="model-settings-title">
        <div className="settings-dialog-header">
          <div>
            <h2 id="model-settings-title">开发者后台</h2>
            <p>{status.configured ? `模型已配置：${status.provider} · ${status.model} · ${status.maskedKey}` : '未配置模型，解析会回退到本地规则'}</p>
          </div>
          <button className="settings-close" onClick={onClose} aria-label="关闭开发者后台">×</button>
        </div>

        <div className="settings-section-title">模型解析设置</div>
        <p className="settings-help">
          先选厂家和主流模型，再输入 API Key。保存前会自动测试连接；Key 只保存在服务端本地数据文件。
        </p>

        <div className="field-group">
          <label htmlFor="model-provider">模型厂家</label>
          <select
            id="model-provider"
            value={provider}
            onChange={(event) => selectProvider(event.target.value)}
          >
            {MODEL_PROVIDERS.map((preset) => (
              <option key={preset.id} value={preset.provider}>{preset.provider}</option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="model-name">模型名称</label>
          {isCustomProvider ? (
            <input
              id="model-name"
              value={model}
              placeholder="例如 gpt-4.1-mini"
              onChange={(event) => setModel(event.target.value)}
            />
          ) : (
            <select
              id="model-name"
              value={effectiveModel}
              onChange={(event) => setModel(event.target.value)}
            >
              {selectedProvider.models.map((item) => (
                <option key={item.model} value={item.model}>{item.label}</option>
              ))}
            </select>
          )}
        </div>

        <div className="field-group">
          <label htmlFor="model-base-url">Base URL</label>
          <input
            id="model-base-url"
            value={baseUrl}
            placeholder="https://api.openai.com/v1"
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </div>

        <div className="field-group">
          <label htmlFor="model-api-key">API Key</label>
          <input
            id="model-api-key"
            type="password"
            value={apiKey}
            placeholder="sk-..."
            onChange={(event) => updateApiKey(event.target.value)}
          />
          <p className="field-help">可识别 OpenRouter、Gemini、OpenAI 项目 Key；普通 sk- 前缀会保留手动选择，避免误判。</p>
        </div>

        {message && <div className="settings-message">{message}</div>}

        <div className="btn-row settings-actions">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            disabled={saving || !apiKey.trim() || !baseUrl.trim() || !effectiveModel.trim()}
            onClick={saveApiKey}
          >
            {saving ? '测试中...' : '测试并保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===================================================================
 * Step 1: 上传简历 + 提取风格（合并）
 * =================================================================== */
function SetupStep({
  resume,
  uploaded,
  style,
  onParsed,
  onDraftSaved,
  onUpdateResume,
  onSelectTemplate,
  onReset,
  onUseExample,
  onNext,
}: {
  resume: ResumeData | null;
  uploaded: boolean;
  style: StyleData;
  onParsed: (resume: ResumeData) => void;
  onDraftSaved: (draftId: string) => void;
  onUpdateResume: (r: ResumeData) => void;
  onSelectTemplate: (s: StyleData) => void;
  onReset: () => void;
  onUseExample: () => void;
  onNext: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [parseError, setParseError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parserMode, setParserMode] = useState('');
  const [parseSource, setParseSource] = useState('');
  const [draftId, setDraftId] = useState('');

  const parseAndApply = useCallback(async (content: string, source: string, clientWarning = '') => {
    setParsing(true);

    try {
      const response = await fetch('/api/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const result = await response.json() as {
        resume?: ResumeData;
        parser?: string;
        warning?: string;
        error?: string;
      };

      if (!response.ok || !result.resume) {
        throw new Error(result.error ?? '解析失败，请重试');
      }

      const parser = result.parser === 'ai' ? 'ai' : 'local';
      const draft = await saveResumeDraft(result.resume, parser, source);

      onParsed(result.resume);
      setDraftId(draft.id);
      onDraftSaved(draft.id);
      setParserMode(parser === 'ai' ? 'AI 解析' : '本地解析');
      setParseSource(source);
      setParseError([clientWarning, result.warning].filter(Boolean).join('；'));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : '解析失败，请重试');
    } finally {
      setParsing(false);
    }
  }, [onDraftSaved, onParsed]);

  const parseFile = useCallback(async (file: File) => {
    const validation = validateResumeFile(file);

    if (!validation.ok) {
      setParseError(validation.message);
      return;
    }

    const content = await extractResumeFileContent(file);

    if (!content.trim()) {
      setParseError('未识别到简历文字，请尝试上传可复制文字的 PDF/DOCX，或直接粘贴简历文本');
      return;
    }

    if (file.name.toLowerCase().endsWith('.pdf') && isLikelyUnreadablePdfContent(content)) {
      await parseAndApply(content, file.name, 'PDF 文字较少，可能是扫描版；已先按文件名生成草稿，建议粘贴简历文本补全');
      return;
    }

    await parseAndApply(content, file.name);
  }, [parseAndApply]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const [file] = Array.from(e.dataTransfer.files);

    if (file) {
      void parseFile(file);
    }
  }, [parseFile]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);

    if (file) {
      void parseFile(file);
    }

    event.target.value = '';
  };

  // 更新简历字段
  const updateField = (field: keyof ResumeData, value: string | string[]) => {
    if (resume) onUpdateResume({ ...resume, [field]: value });
  };

  const previewResume = resume ?? MOCK_RESUME;
  const canNext = uploaded;

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>上传简历 & 选择风格</h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 24 }}>
        上传简历后选择模板；不选也会默认使用「简约」并可继续生成。
      </p>

      <div className="setup-layout">
        {/* ===== 左栏：上传简历 ===== */}
        <div className="setup-column">
          <h3 className="column-title">上传简历</h3>

          {!uploaded ? (
            <>
              <div
                className={`upload-zone ${dragOver ? 'dragover' : ''}`}
                style={{ padding: '40px 20px' }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="upload-icon">📄</span>
                <h3>拖拽或点击上传</h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                  支持 PDF、DOCX、TXT，单文件不超过 50MB
                </p>
              </div>
              <input
                ref={fileInputRef}
                className="hidden-file-input"
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={handleFileChange}
              />

              <div className="paste-panel">
                <label htmlFor="resume-text">或粘贴简历文本</label>
                <textarea
                  id="resume-text"
                  value={resumeText}
                  onChange={(event) => setResumeText(event.target.value)}
                  placeholder="粘贴包含姓名、标题、简介、技能、经历、教育的简历文本"
                  rows={6}
                  disabled={parsing}
                />
                <button
                  className="btn btn-secondary"
                  disabled={parsing}
                  onClick={() => void parseAndApply(resumeText, '粘贴文本')}
                >
                  {parsing ? '解析中...' : '解析粘贴内容'}
                </button>
              </div>

              {parseError && (
                <div className="parse-error" role="alert">{parseError}</div>
              )}
              <button className="btn btn-secondary" onClick={() => {
                onUseExample();
                setResumeText('');
                setParseSource('示例简历');
                setParseError('');
                setDraftId('');
                onDraftSaved('');
              }}>
                使用示例简历
              </button>
            </>
          ) : (
            <div className="extracted-fields" style={{ marginTop: 0 }}>
              <div style={{
                background: '#ebfbee', color: '#2b8a3e', padding: '8px 14px',
                borderRadius: 8, fontSize: 13, marginBottom: 16,
              }}>
                ✓ 简历解析完成{parseSource ? ` — ${parseSource}` : ''}{parserMode ? ` · ${parserMode}` : ''}{draftId ? ' · 草稿已保存' : ''}
              </div>
              {parseError && (
                <div className="parse-warning">{parseError}</div>
              )}

              <div className="field-group">
                <label>姓名</label>
                <input value={resume!.name} onChange={(e) => updateField('name', e.target.value)} />
              </div>

              <div className="field-group">
                <label>职位</label>
                <input value={resume!.title} onChange={(e) => updateField('title', e.target.value)} />
              </div>

              <div className="field-group">
                <label>个人简介</label>
                <textarea
                  value={resume!.bio}
                  onChange={(e) => updateField('bio', e.target.value)}
                  rows={2}
                />
              </div>

              <div className="field-group">
                <label>技能标签</label>
                <div className="tags">
                  {resume!.skills.map((s) => (
                    <span key={s} className="tag">{s}</span>
                  ))}
                </div>
              </div>

              <div className="field-group">
                <label>教育背景</label>
                <input value={resume!.education} onChange={(e) => updateField('education', e.target.value)} />
              </div>

              {resume!.sections.length > 0 && (
                <div className="field-group">
                  <label>完整解析内容</label>
                  <div className="parsed-sections">
                    {resume!.sections.map((section) => (
                      <details key={section.title} open>
                        <summary>{section.title}</summary>
                        <p>{section.content}</p>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              {resume!.rawText && (
                <div className="field-group">
                  <label>原始全文</label>
                  <pre className="parsed-raw-text">{resume!.rawText}</pre>
                </div>
              )}

              <button className="btn btn-secondary" onClick={() => {
                onUseExample();
                setResumeText('');
                setParseSource('示例简历');
                setParseError('');
                setDraftId('');
                onDraftSaved('');
              }}>
                使用示例简历
              </button>
              <button className="btn btn-secondary" onClick={() => {
                onReset();
              }}>
                返回重新解析
              </button>
            </div>
          )}
        </div>

        {/* ===== 右栏：选择模板 ===== */}
        <div className="setup-column">
          <h3 className="column-title">🎨 选择模板</h3>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            点击模板即可预览，右侧效果会实时更新。
          </p>

          <div className="template-picker">
            {RESUME_TEMPLATES.map((template) => (
              <button
                key={template.id}
                className={`template-card ${style.templateId === template.id ? 'selected' : ''}`}
                onClick={() => onSelectTemplate(getTemplateStyle(template.id))}
              >
                <span className="template-card-badge">{template.badge}</span>
                <strong>{template.name}</strong>
                <span>{template.description}</span>
                <div className="template-card-swatches">
                  {template.style.colors.slice(0, 4).map((color) => (
                    <i key={color} style={{ background: color }} />
                  ))}
                </div>
              </button>
            ))}
          </div>

          <div className="template-live-preview">
            <div className="template-live-preview-header">
              <span>实时预览</span>
              <strong>{RESUME_TEMPLATES.find((template) => template.id === style.templateId)?.name}</strong>
            </div>
            <div className={`template-mini-page template-${style.templateId}`}>
              <div className="template-mini-hero">
                <div className="template-mini-avatar">{previewResume.name.charAt(0) || '简'}</div>
                <div>
                  <h4>{previewResume.name || '你的姓名'}</h4>
                  <p>{previewResume.title || '目标职位'}</p>
                </div>
              </div>
              <p className="template-mini-bio">{previewResume.bio || '解析后会在这里展示你的个人简介。'}</p>
              <div className="template-mini-tags">
                {(previewResume.skills.length ? previewResume.skills : ['技能', '成果', '项目']).slice(0, 4).map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
              <div className="template-mini-timeline">
                {previewResume.experience.slice(0, 2).map((experience, index) => (
                  <div key={`${experience.company}-${index}`}>
                    <strong>{experience.role || '经历标题'}</strong>
                    <span>{experience.company || '公司/项目'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="btn-row" style={{ marginTop: 28 }}>
        <div />
        <button
          className="btn btn-primary"
          disabled={!canNext}
          onClick={onNext}
        >
          下一步：预览编辑 →
        </button>
      </div>
    </div>
  );
}

/* ===================================================================
 * Step 2: 预览编辑
 * =================================================================== */
function PreviewStep({
  resume,
  style,
  draftId,
  onUpdate,
  onNext,
  onBack,
  onReset,
}: {
  resume: ResumeData;
  style: StyleData;
  draftId: string;
  onUpdate: (r: ResumeData) => void;
  onNext: () => void;
  onBack: () => void;
  onReset: () => void;
}) {
  const [expandedExp, setExpandedExp] = useState<number | null>(null);
  const [typingBio, setTypingBio] = useState(true);
  const [darkMode, setDarkMode] = useState(style.darkMode);
  const [pastResumes, setPastResumes] = useState<ResumeData[]>([]);
  const [futureResumes, setFutureResumes] = useState<ResumeData[]>([]);
  const [saveStatus, setSaveStatus] = useState('已自动保存');
  const [polishing, setPolishing] = useState(false);
  const completenessWarnings = getCompletenessWarnings(resume);
  const previewName = resume.name || '未填写姓名';
  const previewTitle = resume.title || '待填写职位';
  const previewBio = resume.bio || '这里会展示你的个人简介。可以在左侧补充关键经历、项目成果和职业亮点。';
  const previewSkills = resume.skills.length > 0 ? resume.skills : ['待补充技能'];
  const previewExperience = resume.experience.length > 0
    ? resume.experience
    : [{ company: '待补充公司/项目', role: '待补充经历', period: '时间待补充', detail: '在左侧新增经历后，时间轴会实时展示详情。' }];

  const commitResume = (nextResume: ResumeData) => {
    setPastResumes((items) => [...items, resume]);
    setFutureResumes([]);
    setSaveStatus(draftId ? '保存中...' : '已自动保存到当前会话');
    onUpdate(nextResume);

    if (!draftId) {
      return;
    }

    void updateResumeDraft(draftId, nextResume)
      .then(() => setSaveStatus('已自动保存到草稿'))
      .catch(() => setSaveStatus('保存失败，请稍后重试'));
  };

  const updateField = (field: keyof ResumeData, value: string | string[]) => {
    commitResume({ ...resume, [field]: value });
  };

  const undo = () => {
    const previousResume = pastResumes.at(-1);

    if (!previousResume) {
      return;
    }

    setPastResumes((items) => items.slice(0, -1));
    setFutureResumes((items) => [resume, ...items]);
    setSaveStatus('已撤销 · 已自动保存');
    onUpdate(previousResume);
  };

  const redo = () => {
    const nextResume = futureResumes[0];

    if (!nextResume) {
      return;
    }

    setFutureResumes((items) => items.slice(1));
    setPastResumes((items) => [...items, resume]);
    setSaveStatus('已重做 · 已自动保存');
    onUpdate(nextResume);
  };

  const handlePolish = () => {
    setPolishing(true);
    window.setTimeout(() => {
      commitResume(polishResume(resume));
      setPolishing(false);
    }, 450);
  };

  return (
    <div>
      <h2 style={{ marginBottom: 8 }}>预览 & 微调</h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 24 }}>
        左边编辑，右边实时预览。点击时间轴上的经历可以展开详情。
      </p>

      <div className="preview-layout">
        {/* 左侧：编辑器 */}
        <div className="preview-editor">
          <div className="editor-toolbar">
            <div className="save-status">{saveStatus}</div>
            <div className="editor-actions">
              <button className="icon-btn" onClick={undo} disabled={pastResumes.length === 0} title="撤销">↶</button>
              <button className="icon-btn" onClick={redo} disabled={futureResumes.length === 0} title="重做">↷</button>
              <button className="btn btn-secondary btn-compact" onClick={handlePolish} disabled={polishing}>
                {polishing ? '润色中...' : 'AI 润色'}
              </button>
            </div>
          </div>

          {completenessWarnings.length > 0 && (
            <div className="completeness-hints">
              {completenessWarnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          )}

          <div className="field-group">
            <label>姓名</label>
            <input value={resume.name} onChange={(e) => updateField('name', e.target.value)} />
          </div>
          <div className="field-group">
            <label>职位</label>
            <input value={resume.title} onChange={(e) => updateField('title', e.target.value)} />
          </div>
          <div className="field-group">
            <label>个人简介</label>
            <textarea
              value={resume.bio}
              onChange={(e) => updateField('bio', e.target.value)}
              rows={3}
            />
          </div>
          <div className="field-group">
            <label>教育背景</label>
            <input value={resume.education} onChange={(e) => updateField('education', e.target.value)} />
          </div>

          <div className="field-group">
            <label>技能标签</label>
            <input
              value={resume.skills.join('，')}
              onChange={(event) => updateField(
                'skills',
                event.target.value
                  .split(/[,，、]/)
                  .map((skill) => skill.trim())
                  .filter(Boolean),
              )}
              placeholder="用逗号分隔，例如 React，TypeScript，设计系统"
            />
          </div>

          {/* 经历编辑 */}
          <div className="experience-editor">
            <div className="experience-editor-header">
              <label>工作经历</label>
              <button className="btn btn-secondary btn-compact" onClick={() => commitResume(addExperience(resume))}>
                新增经历
              </button>
            </div>
            {resume.experience.map((experience, index) => (
              <div key={`${experience.company}-${experience.role}-${index}`} className="experience-card">
                <div className="experience-card-header">
                  <strong>{experience.role || '未填写职位'}</strong>
                  <div className="experience-card-actions">
                    <button
                      className="icon-btn"
                      disabled={index === 0}
                      onClick={() => commitResume(moveExperience(resume, index, -1))}
                      title="上移"
                    >
                      ↑
                    </button>
                    <button
                      className="icon-btn"
                      disabled={index === resume.experience.length - 1}
                      onClick={() => commitResume(moveExperience(resume, index, 1))}
                      title="下移"
                    >
                      ↓
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={() => commitResume(removeExperience(resume, index))}
                      title="删除"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <input
                  value={experience.company}
                  placeholder="公司"
                  onChange={(event) => commitResume(updateExperience(resume, index, 'company', event.target.value))}
                />
                <input
                  value={experience.role}
                  placeholder="职位"
                  onChange={(event) => commitResume(updateExperience(resume, index, 'role', event.target.value))}
                />
                <input
                  value={experience.period}
                  placeholder="时间，例如 2022-至今"
                  onChange={(event) => commitResume(updateExperience(resume, index, 'period', event.target.value))}
                />
                <textarea
                  value={experience.detail}
                  placeholder="职责与成果"
                  rows={3}
                  onChange={(event) => commitResume(updateExperience(resume, index, 'detail', event.target.value))}
                />
              </div>
            ))}
            {resume.experience.length === 0 && (
              <div className="empty-editor-hint">暂无经历，点击「新增经历」开始补充。</div>
            )}
          </div>

          {(resume.sections.length > 0 || resume.rawText) && (
            <div className="field-group">
              <label>完整解析内容</label>
              {resume.sections.length > 0 && (
                <div className="parsed-sections">
                  {resume.sections.map((section) => (
                    <details key={section.title} open>
                      <summary>{section.title}</summary>
                      <p>{section.content}</p>
                    </details>
                  ))}
                </div>
              )}
              {resume.rawText && (
                <pre className="parsed-raw-text">{resume.rawText}</pre>
              )}
            </div>
          )}
        </div>

        {/* 右侧：实时预览 */}
        <div
          className="preview-panel"
          style={{ position: 'relative', background: darkMode ? '#1a1a2e' : '#fff' }}
        >
          {/* 主题切换 */}
          <button
            className="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
            title="切换暗色/亮色模式"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>

          <div
            className={`resume-page resume-template-${style.templateId} card-${style.cardStyle}`}
            style={{
              color: darkMode ? '#e0e0e0' : undefined,
              fontFamily: style.bodyFont,
            }}
          >
            {/* 头像 & 基本信息 */}
            <div className="rp-header">
              <div className="rp-avatar">{previewName.charAt(0)}</div>
              <div
                className="rp-name"
                style={{
                  color: darkMode ? '#fff' : undefined,
                  fontFamily: style.headingFont,
                }}
              >
                {previewName}
              </div>
              <div className="rp-title">{previewTitle}</div>
              <div className="rp-bio">
                {previewBio}
                {typingBio && <span className="typewriter-cursor" />}
              </div>
              <button
                onClick={() => setTypingBio(!typingBio)}
                style={{
                  fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8,
                  background: 'none', textDecoration: 'underline',
                }}
              >
                {typingBio ? '显示全文' : '打字机效果'}
              </button>
            </div>

            {/* 技能标签 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {previewSkills.map((s) => (
                <span
                  key={s}
                  className="tag"
                  style={{
                    background: style.colors[2] + '20',
                    color: style.colors[2],
                  }}
                >
                  {s}
                </span>
              ))}
            </div>

            {/* 交互时间轴 */}
            <div className="rp-timeline">
              <h3 style={{
                fontSize: 16, marginBottom: 16,
                color: darkMode ? '#fff' : 'var(--color-text-heading)',
              }}>
                工作经历
              </h3>
              {previewExperience.map((exp, i) => (
                <div
                  key={i}
                  className={`timeline-item ${expandedExp === i ? 'expanded' : ''}`}
                  onClick={() => setExpandedExp(expandedExp === i ? null : i)}
                >
                  <div className="timeline-period">{exp.period}</div>
                  <div className="timeline-role" style={{ color: darkMode ? '#fff' : undefined }}>
                    {exp.role}
                  </div>
                  <div className="timeline-company">{exp.company}</div>
                  <div className="timeline-detail">{exp.detail}</div>
                  {expandedExp !== i && (
                    <div style={{ fontSize: 12, color: style.colors[2], marginTop: 4 }}>
                      点击展开详情 →
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 雷达图 */}
            <div className="skills-section">
              <h3 style={{
                fontSize: 16, marginBottom: 12,
                color: darkMode ? '#fff' : 'var(--color-text-heading)',
              }}>
                能力分布
              </h3>
              <svg width="200" height="180" viewBox="0 0 200 180">
                {[40, 70, 100].map((r) => (
                  <polygon
                    key={r}
                    points="100,30 160,65 145,125 55,125 40,65"
                    fill="none"
                    stroke={darkMode ? '#333' : '#e9ecef'}
                    strokeWidth="1"
                    transform={`scale(${r / 100})`}
                    style={{ transformOrigin: '100px 90px' }}
                  />
                ))}
                <polygon
                  points="100,42 148,72 136,120 64,120 52,72"
                  fill={style.colors[2] + '30'}
                  stroke={style.colors[2]}
                  strokeWidth="2"
                />
                <text x="100" y="20" textAnchor="middle" fontSize="10" fill={darkMode ? '#aaa' : '#868e96'}>设计</text>
                <text x="172" y="68" textAnchor="start" fontSize="10" fill={darkMode ? '#aaa' : '#868e96'}>用研</text>
                <text x="150" y="148" textAnchor="middle" fontSize="10" fill={darkMode ? '#aaa' : '#868e96'}>沟通</text>
                <text x="50" y="148" textAnchor="middle" fontSize="10" fill={darkMode ? '#aaa' : '#868e96'}>技术</text>
                <text x="18" y="68" textAnchor="end" fontSize="10" fill={darkMode ? '#aaa' : '#868e96'}>策略</text>
              </svg>
            </div>

            {/* 教育 */}
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>教育背景</div>
              <div style={{
                fontSize: 14, fontWeight: 600,
                color: darkMode ? '#fff' : 'var(--color-text-heading)',
              }}>
                {resume.education || '教育背景待补充'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="btn-row">
        <div className="btn-row-left">
          <button className="btn btn-secondary" onClick={onBack}>← 上一步</button>
          <button className="btn btn-secondary" onClick={onReset}>重新上传解析</button>
        </div>
        <button className="btn btn-primary" onClick={onNext}>
          下一步：发布 →
        </button>
      </div>
    </div>
  );
}

/* ===================================================================
 * Step 3: 发布分享
 * =================================================================== */
function PublishStep({
  resume,
  style,
  draftId,
  onEdit,
  onBack,
}: {
  resume: ResumeData;
  style: StyleData;
  draftId: string;
  onEdit: () => void;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [offlineStatus, setOfflineStatus] = useState('');
  const [offlining, setOfflining] = useState(false);
  const [homepage, setHomepage] = useState<{ id: string; publicUrl: string } | null>(null);
  const pageUrl = homepage ? new URL(homepage.publicUrl, window.location.origin).toString() : '';

  const handleGenerate = async () => {
    if (!loggedIn) {
      setGenerationError('请先登录后再生成主页');
      return;
    }

    if (!draftId) {
      setGenerationError('缺少草稿 ID，请返回上一步重新解析或保存简历');
      return;
    }

    setGenerating(true);
    setGenerationError('');
    setOfflineStatus('');

    try {
      setHomepage(await generateHomepage(draftId, style.templateId, loggedIn));
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '生成主页失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  const handleOffline = async () => {
    if (!homepage) {
      return;
    }

    setOfflining(true);
    setOfflineStatus('');

    try {
      await offlineHomepage(homepage.id);
      setOfflineStatus('主页已下线，分享链接暂不可访问');
    } catch (error) {
      setOfflineStatus(error instanceof Error ? error.message : '下线主页失败，请重试');
    } finally {
      setOfflining(false);
    }
  };

  const handleCopy = () => {
    if (!pageUrl) {
      return;
    }

    navigator.clipboard.writeText(pageUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="publish-success">
      <span className="publish-icon">{homepage ? '🚀' : '🔐'}</span>
      <h2 style={{ marginBottom: 8 }}>{homepage ? '你的个人主页已就绪！' : '登录后生成个人主页'}</h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
        {homepage ? '复制链接分享给任何人，对方打开即可看到你的专属主页' : '后端会生成稳定可访问 URL，失败时可重新生成'}
      </p>

      <div className="login-gate">
        <span>{loggedIn ? '已登录 · 可生成主页' : '未登录 · 请先登录'}</span>
        <button
          className={`btn ${loggedIn ? 'btn-secondary' : 'btn-primary'} btn-compact`}
          onClick={() => {
            setLoggedIn(true);
            setGenerationError('');
          }}
        >
          {loggedIn ? '已登录' : '演示登录'}
        </button>
      </div>

      {!homepage && (
        <div className="generation-panel">
          <button
            className="btn btn-primary"
            disabled={generating}
            onClick={() => void handleGenerate()}
          >
            {generating ? '生成中...' : '生成主页链接'}
          </button>
          {generationError && (
            <div className="generation-error" role="alert">{generationError}</div>
          )}
        </div>
      )}

      {/* 分享链接 */}
      {homepage && (
        <div className="share-url-box">
          <input type="text" value={pageUrl} readOnly />
          <button className={`btn-copy ${copied ? 'copied' : ''}`} onClick={handleCopy}>
            {copied ? '✓ 已复制' : '复制链接'}
          </button>
        </div>
      )}
      {offlineStatus && (
        <div className={offlineStatus.includes('失败') ? 'generation-error' : 'generation-success'}>
          {offlineStatus}
        </div>
      )}

      {/* 迷你预览 */}
      <div style={{
        background: 'var(--color-bg)',
        borderRadius: 'var(--radius-sm)',
        padding: 16,
        marginTop: 20,
        textAlign: 'left',
        fontSize: 14,
        borderLeft: `3px solid ${style.colors[2]}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 18,
          }}>
            {resume.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--color-text-heading)' }}>{resume.name}</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{resume.title}</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.6 }}>
          {resume.bio.slice(0, 80)}...
        </p>
      </div>

      {/* 分享按钮 */}
      <div className="share-actions">
        <button className="btn btn-secondary" style={{ fontSize: 13 }} disabled={!homepage} onClick={handleCopy}>
          🔗 复制链接
        </button>
        <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={onEdit}>
          ✏️ 再次编辑
        </button>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 13 }}
          disabled={!homepage || offlining}
          onClick={() => void handleOffline()}
        >
          {offlining ? '下线中...' : '⛔ 下线主页'}
        </button>
      </div>

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={onBack}>← 上一步</button>
        {homepage ? (
          <div className="btn-row-left">
            <button className="btn btn-secondary" disabled={generating} onClick={() => void handleGenerate()}>
              重新生成
            </button>
            <button className="btn btn-secondary" onClick={onEdit}>
              再次编辑
            </button>
            <button className="btn btn-primary" onClick={() => window.open(pageUrl, '_blank')}>
              打开我的主页 →
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" disabled={generating} onClick={() => void handleGenerate()}>
            {generating ? '生成中...' : '生成主页链接'}
          </button>
        )}
      </div>
    </div>
  );
}

function PublicHomepage({ slug }: { slug: string }) {
  const [homepage, setHomepage] = useState<{
    resume: ResumeData;
    template: string;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchPublicHomepage(slug)
      .then(setHomepage)
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : '主页不可访问'));
  }, [slug]);

  if (error) {
    return (
      <div className="public-page-shell">
        <div className="public-page-card">
          <span className="publish-icon">🌙</span>
          <h1>主页暂不可访问</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!homepage) {
    return (
      <div className="public-page-shell">
        <div className="public-page-card">
          <span className="publish-icon">⏳</span>
          <h1>正在打开主页...</h1>
        </div>
      </div>
    );
  }

  const publicStyle = getTemplateStyle(homepage.template);

  return (
    <div className="public-page-shell">
      <article className={`public-resume-page resume-template-${publicStyle.templateId}`}>
        <header className="public-hero" style={{ borderColor: publicStyle.colors[2] }}>
          <div className="rp-avatar">{homepage.resume.name.charAt(0) || '简'}</div>
          <h1>{homepage.resume.name || '未命名候选人'}</h1>
          <p>{homepage.resume.title || '求职者'}</p>
          <span>{homepage.resume.bio}</span>
        </header>

        <section className="public-section">
          <h2>技能</h2>
          <div className="tags">
            {homepage.resume.skills.map((skill) => (
              <span key={skill} className="tag">{skill}</span>
            ))}
          </div>
        </section>

        <section className="public-section">
          <h2>经历</h2>
          {homepage.resume.experience.map((experience, index) => (
            <div key={`${experience.company}-${experience.role}-${index}`} className="timeline-item expanded">
              <div className="timeline-period">{experience.period}</div>
              <div className="timeline-role">{experience.role}</div>
              <div className="timeline-company">{experience.company}</div>
              <div className="timeline-detail">{experience.detail}</div>
            </div>
          ))}
        </section>

        <section className="public-section">
          <h2>教育背景</h2>
          <p>{homepage.resume.education || '暂未填写'}</p>
        </section>
      </article>
    </div>
  );
}
