import { useState, useCallback, useRef } from 'react';
import { Analytics } from '@vercel/analytics/react';
import './App.css';
import {
  type ResumeData,
  validateResumeFile,
} from './resumeParser';

interface StyleData {
  sourceUrl: string;
  colors: string[];
  headingFont: string;
  bodyFont: string;
  cardStyle: 'rounded' | 'sharp' | 'pill';
  darkMode: boolean;
}

interface ModelSettingsStatus {
  configured: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  maskedKey: string;
}

const MODEL_PROVIDER_PRESETS = [
  { provider: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  { provider: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { provider: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { provider: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { provider: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini' },
  { provider: '自定义', baseUrl: '', model: '' },
];

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

function createPrototypeFileContent(file: File) {
  const fallbackName = file.name.replace(/\.(pdf|docx)$/i, '').replace(/[-_]/g, ' ').trim();

  return `
    姓名：${fallbackName || '未命名候选人'}
    标题：
    简介：
    技能：
    经历：
    教育：
  `;
}

/* ===== 3 步流程 ===== */
const STEPS = [
  { label: '上传 & 风格', icon: '1' },
  { label: '预览编辑', icon: '2' },
  { label: '发布分享', icon: '3' },
];

export default function App() {
  const [step, setStep] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [style, setStyle] = useState<StyleData | null>(null);

  const nextStep = () => setStep((s) => Math.min(s + 1, 2));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const openSettings = async () => {
    setModelStatus(await fetchModelSettingsStatus());
    setSettingsOpen(true);
  };

  return (
    <div className="app">
      {/* 顶部标题 */}
      <header className="app-header">
        <button
          className="settings-button"
          onClick={() => void openSettings()}
        >
          模型设置
        </button>
        <h1>ResumePage</h1>
        <p className="subtitle">简历 → 个人主页，3 分钟上线</p>
      </header>

      {settingsOpen && (
        <ModelSettingsDialog
          initialStatus={modelStatus}
          onClose={() => setSettingsOpen(false)}
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
        <div className="step-card" style={step === 0 ? { maxWidth: 880 } : undefined}>
          {step === 0 && (
            <SetupStep
              resume={resume}
              uploaded={uploaded}
              style={style}
              onParsed={(parsedResume) => {
                setResume(parsedResume);
                setUploaded(true);
              }}
              onUpdateResume={setResume}
              onExtractStyle={(s) => setStyle(s)}
              onNext={nextStep}
            />
          )}
          {step === 1 && (
            <PreviewStep
              resume={resume!}
              style={style!}
              onUpdate={setResume}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {step === 2 && (
            <PublishStep
              resume={resume!}
              style={style!}
              onBack={prevStep}
            />
          )}
        </div>
      </main>
      <Analytics />
    </div>
  );
}

async function fetchModelSettingsStatus() {
  const response = await fetch('/api/settings/model-key');
  return await response.json() as ModelSettingsStatus;
}

function ModelSettingsDialog({
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

  const selectProvider = (nextProvider: string) => {
    const preset = MODEL_PROVIDER_PRESETS.find((item) => item.provider === nextProvider);

    setProvider(nextProvider);
    setBaseUrl(preset?.baseUrl ?? '');
    setModel(preset?.model ?? '');
  };

  const saveApiKey = async () => {
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch('/api/settings/model-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, baseUrl, model, apiKey }),
      });
      const result = await response.json() as ModelSettingsStatus & { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? '保存模型设置失败');
      }

      setStatus(result);
      setApiKey('');
      setMessage('模型设置已保存');
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
            <h2 id="model-settings-title">模型设置</h2>
            <p>{status.configured ? `已配置 ${status.provider} · ${status.model} · ${status.maskedKey}` : '未配置模型'}</p>
          </div>
          <button className="settings-close" onClick={onClose} aria-label="关闭模型设置">×</button>
        </div>

        <div className="field-group">
          <label htmlFor="model-provider">模型厂家</label>
          <select
            id="model-provider"
            value={provider}
            onChange={(event) => selectProvider(event.target.value)}
          >
            {MODEL_PROVIDER_PRESETS.map((preset) => (
              <option key={preset.provider} value={preset.provider}>{preset.provider}</option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="model-name">模型名称</label>
          <input
            id="model-name"
            value={model}
            placeholder="gpt-4.1-mini"
            onChange={(event) => setModel(event.target.value)}
          />
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
            onChange={(event) => setApiKey(event.target.value)}
          />
        </div>

        {message && <div className="settings-message">{message}</div>}

        <div className="btn-row settings-actions">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            disabled={saving || !apiKey.trim() || !baseUrl.trim() || !model.trim()}
            onClick={saveApiKey}
          >
            {saving ? '保存中...' : '保存设置'}
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
  onUpdateResume,
  onExtractStyle,
  onNext,
}: {
  resume: ResumeData | null;
  uploaded: boolean;
  style: StyleData | null;
  onParsed: (resume: ResumeData) => void;
  onUpdateResume: (r: ResumeData) => void;
  onExtractStyle: (s: StyleData) => void;
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
  const [url, setUrl] = useState('https://apple.com');
  const [extracting, setExtracting] = useState(false);
  const [extractStep, setExtractStep] = useState(0);

  const parseAndApply = useCallback(async (content: string, source: string) => {
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
        error?: string;
      };

      if (!response.ok || !result.resume) {
        throw new Error(result.error ?? '解析失败，请重试');
      }

      const parser = result.parser === 'ai' ? 'ai' : 'local';
      const draft = await saveResumeDraft(result.resume, parser, source);

      onParsed(result.resume);
      setDraftId(draft.id);
      setParserMode(parser === 'ai' ? 'AI 解析' : '本地解析');
      setParseSource(source);
      setParseError('');
    } catch (error) {
      setParseError(error instanceof Error ? error.message : '解析失败，请重试');
    } finally {
      setParsing(false);
    }
  }, [onParsed]);

  const parseFile = useCallback(async (file: File) => {
    const validation = validateResumeFile(file);

    if (!validation.ok) {
      setParseError(validation.message);
      return;
    }

    if (file.name.toLowerCase().endsWith('.txt')) {
      await parseAndApply(await file.text(), file.name);
      return;
    }

    await parseAndApply(createPrototypeFileContent(file), file.name);
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

  // 模拟提取流程
  const handleExtract = () => {
    if (!url.trim()) return;
    setExtracting(true);
    setExtractStep(0);
    setTimeout(() => setExtractStep(1), 1000);
    setTimeout(() => setExtractStep(2), 2000);
    setTimeout(() => {
      setExtractStep(3);
      setExtracting(false);
      onExtractStyle({
        sourceUrl: url,
        colors: ['#1d1d1f', '#f5f5f7', '#0071e3', '#86868b', '#ffffff'],
        headingFont: 'SF Pro Display',
        bodyFont: 'SF Pro Text',
        cardStyle: 'rounded',
        darkMode: false,
      });
    }, 3000);
  };

  // 是否可以进入下一步：简历上传完毕 + 风格已提取
  const canNext = uploaded && style;

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>上传简历 & 选择风格</h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 24 }}>
        上传简历并粘贴一个你喜欢的网站 URL，一次性完成内容和风格的准备
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
            </>
          ) : (
            <div className="extracted-fields" style={{ marginTop: 0 }}>
              <div style={{
                background: '#ebfbee', color: '#2b8a3e', padding: '8px 14px',
                borderRadius: 8, fontSize: 13, marginBottom: 16,
              }}>
                ✓ 简历解析完成{parseSource ? ` — ${parseSource}` : ''}{parserMode ? ` · ${parserMode}` : ''}{draftId ? ' · 草稿已保存' : ''}
              </div>

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

              <button className="btn btn-secondary" onClick={() => {
                onParsed(MOCK_RESUME);
                setParseSource('示例简历');
                setParseError('');
                setDraftId('');
              }}>
                使用示例简历
              </button>
            </div>
          )}
        </div>

        {/* ===== 右栏：提取风格 ===== */}
        <div className="setup-column">
          <h3 className="column-title">🎨 提取风格</h3>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            粘贴任意网站 URL，自动提取配色和版式
          </p>

          {/* URL 输入 */}
          <div className="url-input-row" style={{ flexDirection: 'column', gap: 8 }}>
            <input
              type="url"
              placeholder="粘贴网站 URL，例如 https://apple.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
            />
            <button
              className="btn btn-primary"
              onClick={handleExtract}
              disabled={extracting}
              style={{ width: '100%' }}
            >
              {extracting ? '提取中...' : '提取风格'}
            </button>
          </div>

          {/* 提取动画 */}
          {extracting && (
            <div className="extracting-animation">
              <div className="spinner" />
              <div className="extracting-steps">
                <span className={extractStep >= 1 ? 'done' : ''}>
                  {extractStep >= 1 ? '✓' : '○'} 抓取页面样式
                </span>
                <span className={extractStep >= 2 ? 'done' : ''}>
                  {extractStep >= 2 ? '✓' : '○'} 分析视觉特征
                </span>
                <span className={extractStep >= 3 ? 'done' : ''}>
                  {extractStep >= 3 ? '✓' : '○'} 生成模板参数
                </span>
              </div>
            </div>
          )}

          {/* 提取结果 */}
          {style && !extracting && (
            <div className="style-result" style={{ marginTop: 20 }}>
              <div style={{
                background: '#ebfbee', color: '#2b8a3e', padding: '8px 14px',
                borderRadius: 8, fontSize: 13, marginBottom: 16,
              }}>
                ✓ 风格提取完成 — {new URL(style.sourceUrl).hostname}
              </div>

              {/* 配色 */}
              <div className="color-palette">
                {style.colors.map((c) => (
                  <div key={c} className="color-swatch" style={{ background: c, width: 36, height: 36 }} title={c} />
                ))}
              </div>

              {/* 字体 */}
              <div style={{ fontSize: 13, marginTop: 12 }}>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>标题: </span>
                  <span style={{ fontFamily: style.headingFont, fontWeight: 600 }}>{style.headingFont}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)' }}>正文: </span>
                  <span style={{ fontFamily: style.bodyFont }}>{style.bodyFont}</span>
                </div>
              </div>
            </div>
          )}
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
  onUpdate,
  onNext,
  onBack,
}: {
  resume: ResumeData;
  style: StyleData;
  onUpdate: (r: ResumeData) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [expandedExp, setExpandedExp] = useState<number | null>(null);
  const [typingBio, setTypingBio] = useState(true);
  const [darkMode, setDarkMode] = useState(style.darkMode);

  // 更新字段
  const updateField = (field: keyof ResumeData, value: string) => {
    onUpdate({ ...resume, [field]: value });
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

          {/* 经历编辑 */}
          <div className="field-group">
            <label>工作经历（点击右侧时间轴展开）</label>
            {resume.experience.map((exp, i) => (
              <div key={i} style={{
                background: 'var(--color-bg)', padding: '10px 12px',
                borderRadius: 8, marginBottom: 8, fontSize: 13,
              }}>
                <strong>{exp.role}</strong> @ {exp.company}
                <br />
                <span style={{ color: 'var(--color-text-muted)' }}>{exp.period}</span>
              </div>
            ))}
          </div>
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

          <div className="resume-page" style={{ color: darkMode ? '#e0e0e0' : undefined }}>
            {/* 头像 & 基本信息 */}
            <div className="rp-header">
              <div className="rp-avatar">{resume.name.charAt(0)}</div>
              <div
                className="rp-name"
                style={{ color: darkMode ? '#fff' : undefined }}
              >
                {resume.name}
              </div>
              <div className="rp-title">{resume.title}</div>
              <div className="rp-bio">
                {resume.bio}
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
              {resume.skills.map((s) => (
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
              {resume.experience.map((exp, i) => (
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
                {resume.education}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={onBack}>← 上一步</button>
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
  onBack,
}: {
  resume: ResumeData;
  style: StyleData;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const pageUrl = `https://resumepage.com/@${resume.name.toLowerCase().replace(/\s/g, '')}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(pageUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="publish-success">
      <span className="publish-icon">🚀</span>
      <h2 style={{ marginBottom: 8 }}>你的个人主页已就绪！</h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
        复制链接分享给任何人，对方打开即可看到你的专属主页
      </p>

      {/* 分享链接 */}
      <div className="share-url-box">
        <input type="text" value={pageUrl} readOnly />
        <button className={`btn-copy ${copied ? 'copied' : ''}`} onClick={handleCopy}>
          {copied ? '✓ 已复制' : '复制链接'}
        </button>
      </div>

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
        <button className="btn btn-secondary" style={{ fontSize: 13 }}>
          💬 微信
        </button>
        <button className="btn btn-secondary" style={{ fontSize: 13 }}>
          🐦 推特
        </button>
        <button className="btn btn-secondary" style={{ fontSize: 13 }}>
          💼 领英
        </button>
      </div>

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={onBack}>← 上一步</button>
        <button className="btn btn-primary" onClick={() => window.open(pageUrl, '_blank')}>
          打开我的主页 →
        </button>
      </div>
    </div>
  );
}
