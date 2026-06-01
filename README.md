# Resume Homepage Generator

把传统静态简历解析成结构化内容，再生成有设计感、可交互、可分享的个人主页。

## V1 定位

V1 的目标是跑通求职者从“上传简历”到“发布主页”的完整链路：

```text
上传/粘贴简历 → 解析简历 → 编辑内容 → 选择模板 → 登录生成 → 分享/下线主页
```

产品面向求职者，解决传统简历文本单一、不够生动、难以吸引面试官的问题。V1 重点保证核心流程可用、发布链接稳定、失败时有明确提示。

## 已支持功能

- **简历输入**：支持 PDF、DOCX、TXT、粘贴文本。
- **上传限制**：单文件最大 50MB。
- **简历解析**：支持 AI 大模型解析；AI 不可用时回退本地解析。
- **字段编辑**：支持姓名、职位、简介、技能、经历、教育等字段编辑。
- **经历管理**：每段经历可新增、编辑、删除、排序。
- **自动保存**：编辑后实时保存草稿状态。
- **撤销/重做**：编辑页支持 Undo / Redo。
- **完整度提示**：提示缺失字段，但不阻塞继续发布。
- **AI 润色入口**：提供一键润色入口，失败不影响手动编辑。
- **模板选择**：内置简约、专业、创意模板，并支持实时预览。
- **高级实验模板**：包含 Pro vCard 交互模板，用于探索 V2 方向。
- **主页生成**：登录后由后端生成稳定公开链接。
- **发布管理**：支持重新生成、覆盖原链接内容、下线主页。
- **分享动作**：成功页支持复制链接、再次编辑、下线、打开主页。
- **开发者模型设置**：可在开发者后台配置模型厂家、模型名、Base URL、API Key。
- **日志**：后端输出结构化 JSON 日志，并对 API Key、token、简历正文等敏感内容脱敏。

## V1 不做

- 不做 AI 机器人。
- 不做模板市场。
- 不做复杂样式参数编辑。
- 不做桌面/手机多端预览切换。
- 不做支付。
- 不做完整后台管理系统。
- 不做多用户复杂权限。

## 技术栈

- React 19
- TypeScript
- Vite
- Node.js Vite middleware API
- `pdfjs-dist`：PDF 文本提取
- `mammoth`：DOCX 文本提取
- 本地 JSON 文件存储：`data/resume-store.json`

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务

```bash
npm run dev
```

启动后打开终端中显示的本地地址，例如：

```text
http://localhost:5173/
```

### 3. 运行测试

```bash
npm test
```

### 4. 代码检查

```bash
npm run lint
```

### 5. 生产构建

```bash
npm run build
```

## 模型配置

推荐在页面右上角打开「开发者后台」，选择模型厂家并填写 API Key。

- API Key 只保存在服务端本地的 `data/resume-store.json`。
- 前端只展示脱敏状态，不展示完整 Key。
- 日志不会输出完整 Key、token、authorization 或简历正文。

也可以通过环境变量配置默认模型：

```bash
MODEL_API_KEY=your_key
MODEL_PROVIDER=DeepSeek
MODEL_BASE_URL=https://api.deepseek.com/v1
MODEL_NAME=deepseek-chat
npm run dev
```

如果只配置 `OPENAI_API_KEY`，系统会默认使用 OpenAI + `gpt-4.1-mini`：

```bash
OPENAI_API_KEY=your_key npm run dev
```

## 核心目录

```text
src/
  App.tsx                 # 主界面、编辑、发布、公开主页
  resumeParser.ts         # 本地简历解析
  resumeFileReader.ts     # PDF/DOCX/TXT 文件读取
  aiResumeParser.ts       # AI 简历解析与模型测试
  resumeEditor.ts         # 经历编辑、完整度、润色辅助
  resumeTemplates.ts      # 模板定义
  modelProviders.ts       # 模型厂家与默认模型

server/
  api.ts                  # Vite 中间件 API
  storage.ts              # 本地草稿、主页、模型设置存储
  logger.ts               # JSON 日志与敏感信息脱敏

data/
  resume-store.json       # 本地运行时数据，首次写入后生成
```

## 用户流程

1. 上传 PDF / DOCX / TXT，或直接粘贴简历文本。
2. 系统提取文本并解析为结构化简历。
3. 用户确认并编辑姓名、职位、简介、技能、经历、教育。
4. 用户选择模板并查看实时预览。
5. 用户演示登录后生成主页链接。
6. 用户复制链接分享，或返回编辑后覆盖原链接内容。
7. 用户可将主页下线，公开链接变为不可访问。

## API 能力概览

- `POST /api/parse-resume`：解析粘贴或文件提取后的简历文本。
- `POST /api/resume-drafts`：保存解析后的简历草稿。
- `POST /api/resume-drafts/update`：实时更新草稿。
- `GET /api/settings/model-key`：读取模型配置状态。
- `POST /api/settings/model-key`：保存并测试模型配置。
- `POST /api/homepages/generate`：登录后生成或覆盖主页。
- `POST /api/homepages/offline`：下线主页。
- `GET /api/homepages/public/:slug`：读取公开主页。

## 日志与排错

开发服务启动后，后端日志会输出在终端中，格式为 JSON：

```json
{
  "timestamp": "2026-06-01T08:57:30.212Z",
  "level": "info",
  "event": "homepage.generate.success",
  "meta": {
    "homepageId": "page_xxx",
    "publicUrl": "/p/xxx"
  }
}
```

常见事件包括：

- `resume.parse.start`
- `resume.parse.success`
- `resume.parse.failed`
- `resume.draft.create`
- `resume.draft.update`
- `homepage.generate.start`
- `homepage.generate.success`
- `homepage.generate.failed`
- `homepage.public.read`
- `homepage.public.success`
- `homepage.offline.success`

敏感字段会自动脱敏：

- `apiKey`
- `token`
- `secret`
- `password`
- `authorization`
- `content`
- `rawText`
- `resumeText`

## 部署说明

当前项目适合先作为 Vite 应用原型运行。部署到 Vercel 等平台时，需要注意：

- 本地 JSON 文件存储不适合无状态 Serverless 长期保存数据。
- 生产环境建议替换为数据库或对象存储。
- 需要通过环境变量配置模型 Key，不要把 Key 写入代码。
- 公开主页依赖后端接口读取发布数据，部署时要保证 API 路由可用。

## V2 方向

V2 主题：从“能跑通”升级为“可信、好用、可交付”。

已规划的 V2 用户故事见：

- `/Users/mac/Documents/小程序/docs/prd/PRD-002.md`

重点包括：

- 解析质量报告
- 原文对照编辑
- 每个编辑框 AI 分段润色
- 发布前检查与分享增强
- 开发者诊断后台
