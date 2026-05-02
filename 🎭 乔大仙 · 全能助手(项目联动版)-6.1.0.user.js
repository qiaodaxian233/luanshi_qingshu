// ==UserScript==
// @name         🎭 乔大仙 · 全能助手(项目联动版)
// @namespace    luanshi_qingshu
// @version      6.1.0
// @description  v6.1.0:配置导入/导出(整体备份+跨设备同步) / v6.0.2:上传的TXT剧本也作为附件传给GPT / v6.0.1:项目tab风格提示词支持自定义 / v6.0:TXT剧本→自动提取人名→匹配角色图+提示词,一键应用
// @author       乱世情书 Project
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://gpt.aimonkey.plus/*
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  //   STORAGE
  // ═══════════════════════════════════════════════════════════════════════
  const STORE_KEY = 'luanshi_combined_v5'; // 沿用旧 key,平滑迁移
  const DEFAULT = {
    activeTab: 'prompt',          // 'prompt' | 'image' | 'role' | 'project'
    minimized: false,

    // ── prompt 模块 ──
    promptFavorites: [],
    promptCustoms: [],
    promptInsertMode: 'replace',
    promptCategory: 'all',
    promptSearch: '',

    // ── image 模块 · 下载 ──
    shotPrefix: '杏花十八',
    shotIndex: 1,
    autoWatch: true,
    downloadedUrls: [],

    // ── image 模块 · 上传 ──
    uploadPrompt: '高清修复 人脸修复,细节修复 16比9',

    // ── 角色参考图(多张库 + 多选) ──
    roleImages: [],               // [{id, name, type, dataUrl, addedAt}]
    roleSelectedIds: [],

    // ── ★ v6.0 项目模块 ──
    projectScript: '',            // TXT 原文
    projectStylePromptId: 'img_09', // 默认绑定一条风格提示词
    projectExtraPrompt: '',       // 用户在项目里追加的额外提示词
    projectMatchedIds: [],        // TXT 解析后自动勾选的角色 id
    projectStyles: [],            // ★ v6.0.1 用户自定义的项目风格 [{id,label,text}]
    // ★ v6.0.2 新增
    projectAttachScript: true,    // 应用时是否把 TXT 作为附件上传给 GPT
    projectScriptFileName: '',    // 上传的 TXT 文件名(用于重建 File)
  };
  let S = Object.assign({}, DEFAULT, GM_getValue(STORE_KEY, {}));

  // ── 旧版本字段迁移:roleImage(单张) → roleImages(多张) ──
  if (S.roleImage && S.roleImage.dataUrl && (!Array.isArray(S.roleImages) || !S.roleImages.length)) {
    const id = 'role_' + Date.now() + '_mig';
    S.roleImages = [{
      id,
      name: S.roleImage.name || '迁移角色图',
      type: S.roleImage.type || 'image/png',
      dataUrl: S.roleImage.dataUrl,
      addedAt: Date.now()
    }];
    S.roleSelectedIds = [id];
  }
  delete S.roleImage;
  if (!Array.isArray(S.roleImages)) S.roleImages = [];

  // ── v5.2 → v5.3 迁移:roleSelectedId(单) → roleSelectedIds(数组) ──
  if (S.roleSelectedId && !Array.isArray(S.roleSelectedIds)) {
    S.roleSelectedIds = [S.roleSelectedId];
  } else if (S.roleSelectedId && Array.isArray(S.roleSelectedIds) && !S.roleSelectedIds.length) {
    S.roleSelectedIds = [S.roleSelectedId];
  }
  delete S.roleSelectedId;
  if (!Array.isArray(S.roleSelectedIds)) S.roleSelectedIds = [];
  S.roleSelectedIds = S.roleSelectedIds.filter(id => S.roleImages.some(r => r.id === id));

  // ── v6.0 字段补齐 ──
  if (typeof S.projectScript !== 'string') S.projectScript = '';
  if (typeof S.projectExtraPrompt !== 'string') S.projectExtraPrompt = '';
  if (!Array.isArray(S.projectMatchedIds)) S.projectMatchedIds = [];
  if (typeof S.projectStylePromptId !== 'string') S.projectStylePromptId = 'img_09';
  // ── v6.0.1 字段补齐 ──
  if (!Array.isArray(S.projectStyles)) S.projectStyles = [];
  // ── v6.0.2 字段补齐 ──
  if (typeof S.projectAttachScript !== 'boolean') S.projectAttachScript = true;
  if (typeof S.projectScriptFileName !== 'string') S.projectScriptFileName = '';

  const save = () => GM_setValue(STORE_KEY, S);
  save();

  // ═══════════════════════════════════════════════════════════════════════
  //   BUILTIN PROMPTS
  // ═══════════════════════════════════════════════════════════════════════
  const BUILTIN = [
    { id: 'img_01', cat: 'image', label: '高清写实人像', text: '超写实摄影风格,8K HDR,电影级打光,浅景深虚化背景,柯达胶片色调,人物五官精致细腻,眼神有神,皮肤质感真实,专业摄影师构图' },
    { id: 'img_02', cat: 'image', label: '赛博朋克城市', text: '赛博朋克2077风格城市夜景,霓虹灯反光湿地,高楼大厦全息广告,雨雾迷蒙,超广角构图,电影级色彩分级,蓝紫品配色,极度细节' },
    { id: 'img_03', cat: 'image', label: '新海诚动漫风', text: '新海诚动画风格,精细背景,丁达尔光效,积雨云,蓝天白云,夏日气息,柔和暖色调,细腻草地与建筑,空气透视感强,高质量插画' },
    { id: 'img_04', cat: 'image', label: '油画古典肖像', text: '16世纪荷兰油画大师风格,伦勃朗用光,黑暗背景聚焦人物,古典布料质感,金色与暗棕色调,厚重笔触感可见,历史肖像氛围' },
    { id: 'img_05', cat: 'image', label: '极简水墨国风', text: '中国工笔水墨画风格,留白构图,淡雅墨色,山水意境,宣纸纹理,文人画气韵,简洁线条,墨色浓淡层次,传统美学意境悠远' },
    { id: 'img_06', cat: 'image', label: '商业产品摄影', text: '高端商业产品摄影,纯白/纯黑无缝背景,环形补光,产品细节清晰,材质质感突出,阴影柔和自然,电商主图风格,专业调色' },
    { id: 'img_07', cat: 'image', label: '修复高清16:9', text: '高清修复 人脸修复 细节修复 16比9' },
    { id: 'img_08', cat: 'image', label: '奇幻场景概念图', text: '史诗奇幻概念艺术,艺术站风格,魔幻光效,宏大壮丽场景,细节丰富环境设计,超高清渲染,电影预告片质感,冷暖色对比戏剧性' },

    // ★ v6.0 新增:GPT-image-2 暗黑硬派青年漫画风(单图)
    { id: 'img_09', cat: 'image', label: 'GPT-image2 · 暗黑硬派漫画', text: 'Dark seinen manga illustration in the style of Inio Asano crossed with Takehiko Inoue, semi-realistic anime, cinematic noir lighting, single hard rim light from streetlamp, crushed blacks and deep shadows, desaturated cool grey-blue palette with selective deep crimson blood accents as the only warm color, gritty rain-soaked urban back alley at night, wet asphalt with mirror-like reflections, scattered trash bags and cardboard boxes, weathered concrete walls with cracks and stains, atmospheric haze and steam, hard-edged masculine character design, short cropped black hair, sharp thick brows, square jawline, weathered black leather jacket with realistic wrinkles and sheen, painterly shading with visible thick ink linework, high contrast chiaroscuro, ultra-detailed textures, 16:9 cinematic frame, raw and visceral mood, GPT-image quality' },

    // ★ v6.0 新增:GPT-image-2 分镜九宫格漫画页(图里那种)
    { id: 'img_10', cat: 'image', label: 'GPT-image2 · 分镜九宫格漫画页', text: 'A single manga storyboard page composed of multiple panels arranged in a 2x3 or 3x3 grid layout, thin black gutter lines separating each panel, each panel showing a different cinematic shot of the same continuous dark alley scene at night (establishing wide shot, medium shot, close-up of bloody knife in hand, intense close-up of the protagonist face with blood splatter, low angle full body, back view walking away with blood dripping), dark seinen manga style fusing Inio Asano and Takehiko Inoue aesthetics, semi-realistic anime, cinematic noir lighting with single rim light source, crushed black shadows, desaturated cool grey-blue palette with selective deep crimson blood as the only warm accent, gritty wet urban alley with reflective puddles trash bags concrete walls, hard-edged masculine character with cropped hair sharp brows leather jacket, painterly thick ink linework, high contrast chiaroscuro, ultra detailed textures, 16:9 page ratio, raw visceral mood, professional manga page composition, GPT-image quality' },

    { id: 'wrt_01', cat: 'write', label: '爆款小红书文案', text: '请帮我写一篇小红书风格的种草笔记,要求:标题含emoji吸睛,开头直击痛点,中间真实体验感强,结尾有互动引导,全文500字以内,语气真诚活泼,多分段多emoji' },
    { id: 'wrt_02', cat: 'write', label: '公众号深度长文', text: '请以深度媒体人视角写一篇公众号文章,要求:标题悬念感强,开篇故事切入,中部有数据与案例支撑,结尾引发思考共鸣,配小标题分段,约1500字,语言流畅不说教' },
    { id: 'wrt_03', cat: 'write', label: '演讲稿框架', text: '请帮我写一篇演讲稿,主题是[填入主题],要求:开场金句抓人,主体分三个层次展开,有真实故事/数据支撑,结尾升华有号召力,语言有节奏感,适合5分钟演讲' },
    { id: 'wrt_04', cat: 'write', label: '改写-提升文笔', text: '请将以下文字改写得更精炼优美,保留核心意思,删除冗余,用词更精准有力,句式更有节奏感,整体提升文学质感:\n\n[在此粘贴原文]' },
    { id: 'wrt_05', cat: 'write', label: '朋友圈文案', text: '帮我写3个版本的朋友圈文案,风格分别是:①简洁克制有格调 ②温暖治愈感人 ③幽默自嘲接地气,都控制在80字以内,关于:[填入内容]' },
    { id: 'wrt_06', cat: 'write', label: '故事创作提纲', text: '请为我构建一个短篇故事大纲,类型:[填入类型],要求有清晰的主角弧线、核心冲突、三幕式结构,并列出5个关键转折点,风格可以是悬疑/温情/科幻/现实主义' },

    { id: 'code_01', cat: 'code', label: 'Code Review', text: '请对以下代码进行 Code Review,重点关注:①逻辑漏洞与边界情况 ②性能瓶颈 ③可维护性与命名规范 ④安全风险,并给出修改建议和优化后的代码:\n\n```\n[粘贴代码]\n```' },
    { id: 'code_02', cat: 'code', label: '解释这段代码', text: '请用通俗易懂的语言解释以下代码的功能、执行流程和核心逻辑,假设读者是初学者,并指出其中值得注意的技术点:\n\n```\n[粘贴代码]\n```' },
    { id: 'code_03', cat: 'code', label: 'Bug 修复', text: '以下代码存在 bug,请帮我找出所有问题,说明原因,并给出修复后的完整代码:\n\n```\n[粘贴代码]\n```\n\n错误信息:[填入报错]' },
    { id: 'code_04', cat: 'code', label: '写单元测试', text: '请为以下函数/模块编写完整的单元测试,覆盖正常情况、边界值和异常情况,使用 [Jest/pytest/填入框架] 框架:\n\n```\n[粘贴代码]\n```' },
    { id: 'code_05', cat: 'code', label: 'SQL 优化', text: '请优化以下 SQL 查询,分析慢查询原因,提出索引建议,并给出优化后的版本,说明每处改动的原因:\n\n```sql\n[粘贴SQL]\n```' },
    { id: 'code_06', cat: 'code', label: 'README 生成', text: '请根据以下代码/项目描述,生成一份专业的 README.md,包含:项目简介、功能特性、安装方式、使用示例、API文档、贡献指南:\n\n[填入项目描述或代码]' },

    { id: 'trans_01', cat: 'translate', label: '中→英(正式)', text: '请将以下中文翻译成正式英文,语言精准专业,适合商务邮件/学术论文风格,保留原文逻辑结构:\n\n[填入中文]' },
    { id: 'trans_02', cat: 'translate', label: '英→中(地道)', text: '请将以下英文翻译成地道流畅的中文,不要直译腔,符合中文表达习惯,专业术语给出原文注释:\n\n[填入英文]' },
    { id: 'trans_03', cat: 'translate', label: '学术摘要润色', text: '请对以下学术论文摘要进行英文润色,提升学术表达的规范性和流畅度,保持原意不变,修改后标注改动之处:\n\n[填入摘要]' },
    { id: 'trans_04', cat: 'translate', label: '口语→书面语', text: '请将以下口语化表达改写为正式书面语,适合用于公文/报告/正式信函场景,保留核心信息:\n\n[填入口语文字]' },

    { id: 'anal_01', cat: 'analyze', label: 'SWOT 分析', text: '请对以下主题/公司/方案进行 SWOT 分析(优势、劣势、机会、威胁),每项给出3-5个具体要点,并在最后给出综合战略建议:\n\n分析对象:[填入]' },
    { id: 'anal_02', cat: 'analyze', label: '深度拆解', text: '请用第一性原理思维对以下问题进行深度拆解,从底层逻辑出发,逐层分析,找出核心假设,并提出你的结论与建议:\n\n问题:[填入]' },
    { id: 'anal_03', cat: 'analyze', label: '总结提炼要点', text: '请阅读以下内容,提炼核心观点,以"要点1/2/3…"分条列出,每条一句话,最后用一段话给出总结性结论:\n\n[粘贴文章/内容]' },
    { id: 'anal_04', cat: 'analyze', label: '利弊分析', text: '请从多个角度分析以下方案/决策的利与弊,考虑短期与长期影响,并给出你的推荐意见与注意事项:\n\n[填入方案]' },

    { id: 'role_01', cat: 'role', label: '资深产品经理', text: '请扮演一位拥有10年经验的互联网产品经理,用产品思维帮我分析以下需求,输出包括:用户洞察、核心功能优先级、潜在风险、成功指标:\n\n需求:[填入]' },
    { id: 'role_02', cat: 'role', label: '苏格拉底式提问', text: '请扮演苏格拉底,用启发式提问而非直接给答案的方式,帮助我深入思考以下问题,每次只提一个问题,引导我自己发现答案:\n\n我想思考的问题:[填入]' },
    { id: 'role_03', cat: 'role', label: '毒舌评论家', text: '请扮演一位不留情面的毒舌评论家,对以下内容给出犀利真实的批评,指出最大的问题和槽点,语气可以尖锐但需有理有据:\n\n[填入要评论的内容]' },
    { id: 'role_04', cat: 'role', label: '投资人视角', text: '请扮演一位硅谷顶级风险投资人,从投资价值角度评估以下创业项目,重点看:市场规模、差异化壁垒、团队潜力、商业模式、最大风险:\n\n项目介绍:[填入]' },
  ];

  // ═══════════════════════════════════════════════════════════════════════
  //   CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════
  const CATEGORIES = [
    { id: 'all',       label: '全部',     icon: '⬡'  },
    { id: 'favorite',  label: '收藏',     icon: '⭐' },
    { id: 'image',     label: '图像',     icon: '🎨' },
    { id: 'write',     label: '写作',     icon: '✍'  },
    { id: 'code',      label: '代码',     icon: '💻' },
    { id: 'translate', label: '翻译',     icon: '🌐' },
    { id: 'analyze',   label: '分析',     icon: '🔬' },
    { id: 'role',      label: '角色',     icon: '🎭' },
    { id: 'custom',    label: '自定义',   icon: '📝' },
  ];

  // ═══════════════════════════════════════════════════════════════════════
  //   STYLES
  // ═══════════════════════════════════════════════════════════════════════
  GM_addStyle(`
    @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    :root {
      --p-bg:#0d0b0e; --p-panel:#131018; --p-border:rgba(180,130,80,0.22);
      --p-gold:#c9a45a; --p-gold2:#e8c87a; --p-red:#c05050;
      --p-green:#5cac7a; --p-blue:#5888c0; --p-purple:#9070c8;
      --p-text:#d8cfc0; --p-muted:#7a7068; --p-glow:rgba(201,164,90,0.12);
      --p-r:8px; --p-r-sm:5px;
    }

    /* ════════ 主面板 ════════ */
    #ls-panel {
      position:fixed; top:70px; right:16px; width:400px;
      max-height:calc(100vh - 90px);
      display:flex; flex-direction:column;
      background:var(--p-panel);
      border:1px solid var(--p-border);
      border-radius:14px;
      box-shadow:0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(201,164,90,0.06);
      font-family:'Noto Serif SC',serif; color:var(--p-text);
      z-index:999998; overflow:hidden; user-select:none;
    }
    #ls-header {
      display:flex; align-items:center; padding:0 13px; height:46px; flex-shrink:0;
      background:linear-gradient(135deg,#1c1626 0%,#110f15 100%);
      border-bottom:1px solid var(--p-border); cursor:move; gap:9px;
    }
    .ls-h-icon { font-size:17px; flex-shrink:0; }
    .ls-h-title { flex:1; font-size:13px; font-weight:700; color:var(--p-gold); letter-spacing:0.06em; white-space:nowrap; }
    .ls-h-sub { font-size:9px; color:var(--p-muted); margin-left:4px; letter-spacing:0.04em; }
    #ls-btn-min {
      background:none; border:none; color:var(--p-muted); cursor:pointer;
      font-size:18px; padding:0 4px; line-height:1; transition:color 0.15s; font-weight:600;
    }
    #ls-btn-min:hover { color:var(--p-gold); }

    /* ════════ Tab 切换 ════════ */
    #ls-tabs {
      display:flex; border-bottom:1px solid var(--p-border);
      background:rgba(0,0,0,0.25); flex-shrink:0;
    }
    .ls-tab {
      flex:1; padding:10px 2px; background:none; border:none; cursor:pointer;
      color:var(--p-muted); font-family:'Noto Serif SC',serif; font-size:11px;
      font-weight:600; letter-spacing:0.02em; transition:all 0.15s;
      border-bottom:2px solid transparent; white-space:nowrap;
    }
    .ls-tab:hover { color:var(--p-text); background:rgba(255,255,255,0.03); }
    .ls-tab.active {
      color:var(--p-gold2); border-bottom-color:var(--p-gold);
      background:linear-gradient(180deg,rgba(201,164,90,0.08) 0%,transparent 100%);
    }

    /* ════════ Tab 内容容器(可滚) ════════ */
    .ls-pane { display:none; flex:1; flex-direction:column; overflow-y:auto; min-height:0; }
    .ls-pane.active { display:flex; }
    .ls-pane::-webkit-scrollbar { width:4px; }
    .ls-pane::-webkit-scrollbar-thumb { background:var(--p-border); border-radius:3px; }

    /* ════════════════════════════════════════════════════════════════════
       提示词 PANE
       ════════════════════════════════════════════════════════════════════ */
    #lsp-search-wrap {
      display:flex; align-items:center; gap:7px;
      padding:9px 12px 7px; border-bottom:1px solid var(--p-border);
      background:rgba(0,0,0,0.2);
    }
    #lsp-search {
      flex:1; background:rgba(0,0,0,0.4); border:1px solid var(--p-border);
      border-radius:20px; color:var(--p-text); font-size:11px;
      font-family:'JetBrains Mono',monospace; padding:5px 11px; outline:none;
      transition:border-color 0.15s;
    }
    #lsp-search:focus { border-color:var(--p-gold); }
    #lsp-search::placeholder { color:var(--p-muted); }
    #lsp-search-clear {
      background:none; border:none; color:var(--p-muted); cursor:pointer; font-size:13px;
      padding:0; opacity:0; pointer-events:none; transition:opacity 0.15s;
    }
    #lsp-search-clear.visible { opacity:1; pointer-events:auto; }

    #lsp-cats {
      display:flex; flex-wrap:wrap; gap:5px;
      padding:8px 10px;
      border-bottom:1px solid var(--p-border); background:rgba(0,0,0,0.15);
    }
    .lsp-cat {
      padding:3px 9px; border-radius:12px; font-size:10px;
      background:rgba(255,255,255,0.04); border:1px solid rgba(180,130,80,0.12);
      color:var(--p-muted); cursor:pointer; transition:all 0.14s; white-space:nowrap;
    }
    .lsp-cat:hover { border-color:var(--p-gold); color:var(--p-text); }
    .lsp-cat.active {
      background:linear-gradient(135deg,rgba(201,164,90,0.2) 0%,rgba(201,164,90,0.08) 100%);
      border-color:var(--p-gold); color:var(--p-gold2); font-weight:600;
    }

    #lsp-list {
      max-height:300px; overflow-y:auto; padding:8px 9px;
      display:flex; flex-direction:column; gap:4px;
    }
    #lsp-list::-webkit-scrollbar { width:3px; }
    #lsp-list::-webkit-scrollbar-thumb { background:var(--p-border); border-radius:3px; }
    .lsp-item {
      display:flex; align-items:flex-start; gap:7px; padding:8px 9px;
      border-radius:var(--p-r-sm); background:rgba(0,0,0,0.25);
      border:1px solid rgba(180,130,80,0.08); cursor:pointer;
      transition:all 0.14s; position:relative;
    }
    .lsp-item:hover { background:var(--p-glow); border-color:var(--p-border); }
    .lsp-item-cat {
      flex-shrink:0; width:5px; align-self:stretch; border-radius:3px; margin-top:1px;
    }
    .cat-image     .lsp-item-cat { background:#9070c8; }
    .cat-write     .lsp-item-cat { background:#c9a45a; }
    .cat-code      .lsp-item-cat { background:#5888c0; }
    .cat-translate .lsp-item-cat { background:#5cac7a; }
    .cat-analyze   .lsp-item-cat { background:#c07850; }
    .cat-role      .lsp-item-cat { background:#c05050; }
    .cat-custom    .lsp-item-cat { background:#e8c87a; }
    .lsp-item-main { flex:1; min-width:0; }
    .lsp-item-label {
      font-size:11px; font-weight:600; color:var(--p-text); white-space:nowrap;
      overflow:hidden; text-overflow:ellipsis; line-height:1.3;
    }
    .lsp-item:hover .lsp-item-label { color:var(--p-gold2); }
    .lsp-item-preview {
      font-size:9.5px; color:var(--p-muted); line-height:1.4; margin-top:2px;
      overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
      font-family:'JetBrains Mono',monospace;
    }
    .lsp-item-actions { display:flex; align-items:center; gap:4px; flex-shrink:0; }
    .lsp-btn-fav, .lsp-btn-del {
      background:none; border:none; cursor:pointer; font-size:12px; padding:0;
      opacity:0.3; transition:opacity 0.14s, transform 0.14s; line-height:1;
    }
    .lsp-btn-fav:hover { opacity:1; transform:scale(1.25); }
    .lsp-btn-del:hover { opacity:1; color:var(--p-red); }
    .lsp-btn-fav.starred { opacity:1; }
    .lsp-empty {
      text-align:center; color:var(--p-muted); font-size:11px; padding:28px 8px;
    }

    #lsp-actions-bar {
      display:flex; align-items:center; gap:6px; padding:8px 10px;
      border-top:1px solid var(--p-border); background:rgba(0,0,0,0.18);
    }
    .lsp-mode-btn {
      padding:4px 9px; border-radius:10px; font-size:10px;
      border:1px solid var(--p-border); background:rgba(255,255,255,0.03);
      color:var(--p-muted); cursor:pointer; transition:all 0.14s;
    }
    .lsp-mode-btn.active {
      border-color:var(--p-gold); color:var(--p-gold); background:rgba(201,164,90,0.1);
    }
    #lsp-mode-label { font-size:9px; color:var(--p-muted); margin-right:auto; }

    #lsp-add-section {
      border-top:1px solid var(--p-border); padding:10px 11px;
      background:rgba(0,0,0,0.15); display:flex; flex-direction:column; gap:7px;
    }
    .lsp-sec-title {
      font-size:10px; color:var(--p-gold); font-weight:600; letter-spacing:0.1em;
      display:flex; align-items:center; gap:6px;
    }
    .lsp-sec-title::after { content:''; flex:1; height:1px; background:var(--p-border); }
    #lsp-add-label, #lsp-add-text {
      background:rgba(0,0,0,0.4); border:1px solid var(--p-border);
      border-radius:var(--p-r-sm); color:var(--p-text); font-size:11px;
      font-family:'JetBrains Mono',monospace; outline:none; padding:6px 9px;
      transition:border-color 0.15s; width:100%; box-sizing:border-box;
    }
    #lsp-add-label:focus, #lsp-add-text:focus { border-color:var(--p-gold); }
    #lsp-add-text { resize:vertical; min-height:52px; max-height:120px; font-size:10px; line-height:1.5; }
    #lsp-add-btn {
      padding:6px; border-radius:var(--p-r-sm);
      background:linear-gradient(135deg,#7a5018,#5a3a10);
      border:1px solid var(--p-gold); color:var(--p-gold2); font-size:11px;
      font-family:'Noto Serif SC',serif; cursor:pointer; font-weight:600;
      transition:all 0.15s; text-align:center;
    }
    #lsp-add-btn:hover { background:linear-gradient(135deg,#9a6828,#7a4a18); }
    .lsp-highlight { color:var(--p-gold2); background:rgba(201,164,90,0.18); border-radius:2px; }

    /* ════════════════════════════════════════════════════════════════════
       图片 PANE
       ════════════════════════════════════════════════════════════════════ */
    #ls-img-body { padding:12px; display:flex; flex-direction:column; gap:10px; }
    .ls-section {
      background:rgba(255,255,255,0.03); border:1px solid rgba(180,130,80,0.12);
      border-radius:var(--p-r); padding:10px;
    }
    .ls-section-title {
      font-size:10px; font-weight:600; color:var(--p-gold); letter-spacing:0.12em;
      text-transform:uppercase; margin-bottom:8px; display:flex; align-items:center; gap:6px;
    }
    .ls-section-title::after { content:''; flex:1; height:1px; background:var(--p-border); }
    #ls-stats { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
    .ls-stat {
      background:rgba(0,0,0,0.3); border:1px solid var(--p-border);
      border-radius:6px; padding:6px 4px; text-align:center;
    }
    .ls-stat-num { font-size:20px; font-weight:700; font-family:'JetBrains Mono',monospace; line-height:1; }
    .ls-stat-num.gold  { color:var(--p-gold2); }
    .ls-stat-num.green { color:var(--p-green); }
    .ls-stat-num.blue  { color:var(--p-blue); }
    .ls-stat-label { font-size:9px; color:var(--p-muted); margin-top:2px; letter-spacing:0.05em; }
    #ls-grid {
      display:grid; grid-template-columns:repeat(4,1fr); gap:4px;
      max-height:200px; overflow-y:auto;
    }
    #ls-grid::-webkit-scrollbar { width:3px; }
    #ls-grid::-webkit-scrollbar-thumb { background:var(--p-border); border-radius:3px; }
    .ls-thumb {
      position:relative; aspect-ratio:1; border-radius:4px; overflow:hidden;
      cursor:pointer; border:2px solid transparent; transition:border-color 0.15s,transform 0.15s;
    }
    .ls-thumb:hover { transform:scale(1.04); }
    .ls-thumb.gpt { border-color:rgba(92,172,122,0.5); }
    .ls-thumb.upload { border-color:rgba(88,136,192,0.5); }
    .ls-thumb.downloaded::after {
      content:'✓'; position:absolute; top:2px; right:2px; width:14px; height:14px;
      border-radius:50%; background:var(--p-green); color:#fff; font-size:9px;
      display:flex; align-items:center; justify-content:center; font-weight:bold;
    }
    .ls-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
    .ls-thumb-badge {
      position:absolute; bottom:0; left:0; right:0; padding:2px 3px; font-size:8px;
      font-family:'JetBrains Mono',monospace; background:rgba(0,0,0,0.7);
      color:var(--p-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .ls-thumb-badge.gpt { color:var(--p-green); }
    .ls-thumb-badge.upload { color:var(--p-blue); }
    .ls-empty-grid {
      grid-column:1/-1; text-align:center; color:var(--p-muted); font-size:11px; padding:20px 0;
    }
    .ls-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
    .ls-row:last-child { margin-bottom:0; }
    .ls-label { font-size:10px; color:var(--p-muted); min-width:52px; letter-spacing:0.04em; }
    .ls-input {
      flex:1; background:rgba(0,0,0,0.4); border:1px solid var(--p-border);
      border-radius:5px; color:var(--p-text); font-size:11px;
      font-family:'JetBrains Mono',monospace; padding:4px 7px; outline:none; transition:border-color 0.15s;
    }
    .ls-input:focus { border-color:var(--p-gold); }
    .ls-input-num { width:48px; flex:0 0 auto; text-align:center; }
    .ls-btn-row { display:flex; gap:5px; }
    .ls-btn {
      flex:1; padding:7px 6px; border:1px solid var(--p-border); border-radius:6px;
      background:rgba(255,255,255,0.04); color:var(--p-text); font-size:11px;
      font-family:'Noto Serif SC',serif; cursor:pointer; transition:all 0.15s;
      white-space:nowrap; text-align:center;
    }
    .ls-btn:hover { background:var(--p-glow); border-color:var(--p-gold); color:var(--p-gold); }
    .ls-btn.primary {
      background:linear-gradient(135deg,#7a5018 0%,#5a3a10 100%);
      border-color:var(--p-gold); color:var(--p-gold2); font-weight:600;
    }
    .ls-btn.primary:hover { background:linear-gradient(135deg,#9a6828 0%,#7a4a18 100%); }
    .ls-btn.danger { border-color:rgba(192,80,80,0.4); color:var(--p-red); }
    .ls-btn.danger:hover { background:rgba(192,80,80,0.1); border-color:var(--p-red); }
    .ls-btn.success { border-color:rgba(92,172,122,0.4); color:var(--p-green); }
    .ls-btn.success:hover { background:rgba(92,172,122,0.1); border-color:var(--p-green); }
    .ls-btn:disabled { opacity:0.4; cursor:not-allowed; }
    #ls-upload-zone {
      border:1.5px dashed var(--p-border); border-radius:var(--p-r);
      padding:14px; text-align:center; cursor:default; transition:all 0.2s;
    }
    #ls-upload-zone.dragover { border-color:var(--p-gold); background:var(--p-glow); }
    #ls-upload-text { font-size:11px; color:var(--p-muted); line-height:1.5; }
    .ls-qitem {
      display:flex; align-items:center; gap:7px; padding:4px 6px; border-radius:5px;
      margin-bottom:3px; background:rgba(0,0,0,0.25); border:1px solid rgba(180,130,80,0.08);
      font-size:10px; font-family:'JetBrains Mono',monospace; color:var(--p-muted);
    }
    .ls-qitem.active { border-color:var(--p-gold); color:var(--p-gold); background:var(--p-glow); }
    .ls-qitem.sending { border-color:var(--p-blue); color:var(--p-blue); background:rgba(88,136,192,0.1); }
    .ls-qitem.waiting { border-color:var(--p-muted); color:var(--p-muted); background:rgba(255,255,255,0.02); }
    .ls-qitem.done { color:var(--p-green); opacity:0.7; }
    .ls-qitem.error { color:var(--p-red); opacity:0.8; }
    .ls-qitem-icon { font-size:12px; flex-shrink:0; }
    .ls-qitem-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ls-qitem-size { flex-shrink:0; opacity:0.6; }
    .ls-qitem-del {
      flex-shrink:0; cursor:pointer; opacity:0.4; font-size:11px; line-height:1;
      background:none; border:none; color:inherit; padding:0;
    }
    .ls-qitem-del:hover { opacity:1; color:var(--p-red); }
    #ls-progress-wrap {
      background:rgba(0,0,0,0.4); border-radius:4px; height:6px; overflow:hidden; display:none;
    }
    #ls-progress-wrap.visible { display:block; }
    #ls-progress-bar {
      height:100%; background:linear-gradient(90deg,var(--p-gold) 0%,var(--p-gold2) 100%);
      border-radius:4px; transition:width 0.3s ease; width:0%;
    }
    #ls-log {
      background:rgba(0,0,0,0.5); border:1px solid rgba(180,130,80,0.1); border-radius:6px;
      padding:6px 8px; font-size:10px; font-family:'JetBrains Mono',monospace;
      color:var(--p-muted); max-height:80px; overflow-y:auto; line-height:1.6;
    }
    #ls-log::-webkit-scrollbar { width:2px; }
    #ls-log::-webkit-scrollbar-thumb { background:var(--p-border); }
    .ls-log-line { display:block; }
    .ls-log-line.ok   { color:var(--p-green); }
    .ls-log-line.err  { color:var(--p-red); }
    .ls-log-line.info { color:var(--p-gold); }
    .ls-toggle-wrap { display:flex; align-items:center; gap:8px; }
    .ls-toggle { position:relative; width:28px; height:15px; flex-shrink:0; }
    .ls-toggle input { opacity:0; width:0; height:0; }
    .ls-toggle-slider {
      position:absolute; inset:0; background:rgba(255,255,255,0.1);
      border-radius:15px; cursor:pointer; transition:background 0.2s;
    }
    .ls-toggle-slider::before {
      content:''; position:absolute; width:11px; height:11px; left:2px; top:2px;
      background:var(--p-muted); border-radius:50%; transition:transform 0.2s,background 0.2s;
    }
    .ls-toggle input:checked + .ls-toggle-slider { background:rgba(92,172,122,0.3); }
    .ls-toggle input:checked + .ls-toggle-slider::before { transform:translateX(13px); background:var(--p-green); }
    .ls-gpt-ring    { outline:2px solid rgba(92,172,122,0.6) !important; outline-offset:2px; }
    .ls-upload-ring { outline:2px solid rgba(88,136,192,0.5) !important; outline-offset:2px; }

    /* ════════════════════════════════════════════════════════════════════
       角色参考图 PANE
       ════════════════════════════════════════════════════════════════════ */
    #ls-role-body {
      padding:12px; display:flex; flex-direction:column; gap:10px;
    }
    #ls-role-preview {
      min-height:60px;
    }
    #ls-role-preview img.ls-role-single {
      width:100%; max-height:200px; object-fit:contain;
      border-radius:6px; background:rgba(0,0,0,0.4); display:block;
      box-shadow:0 2px 12px rgba(0,0,0,0.4);
    }
    #ls-role-preview .ls-role-meta {
      font-size:10px; color:var(--p-muted); margin-top:6px;
      font-family:'JetBrains Mono',monospace; text-align:center;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    #ls-role-preview .ls-role-meta .name { color:var(--p-gold2); }

    .ls-role-multi-preview {
      display:grid; grid-template-columns:repeat(auto-fill, minmax(72px, 1fr));
      gap:5px; max-height:170px; overflow-y:auto; padding:2px;
      background:rgba(0,0,0,0.3); border-radius:6px;
    }
    .ls-role-multi-preview::-webkit-scrollbar { width:3px; }
    .ls-role-multi-preview::-webkit-scrollbar-thumb { background:var(--p-border); border-radius:3px; }
    .ls-role-multi-item {
      position:relative; aspect-ratio:1; border-radius:5px; overflow:hidden;
      background:rgba(0,0,0,0.4); border:1.5px solid var(--p-gold);
      box-shadow:0 0 0 1px rgba(201,164,90,0.25);
    }
    .ls-role-multi-item img {
      width:100%; height:100%; object-fit:cover; display:block;
    }
    .ls-role-multi-name {
      position:absolute; bottom:0; left:0; right:0; padding:2px 4px;
      font-size:8px; font-family:'JetBrains Mono',monospace;
      background:linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 60%);
      color:var(--p-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .ls-role-multi-num {
      position:absolute; top:2px; left:2px;
      width:16px; height:16px; border-radius:50%;
      background:var(--p-gold); color:#0d0b0e;
      font-size:9px; font-weight:bold;
      display:flex; align-items:center; justify-content:center;
      font-family:'JetBrains Mono',monospace;
      box-shadow:0 1px 3px rgba(0,0,0,0.5);
    }

    .ls-role-empty {
      border:1.5px dashed var(--p-border); border-radius:6px; padding:24px;
      text-align:center; color:var(--p-muted); font-size:11px; line-height:1.7;
    }
    .ls-role-empty span { font-size:9px; opacity:0.6; display:block; margin-top:4px; }

    #ls-role-quicktools {
      display:flex; align-items:center; gap:8px; margin-bottom:6px;
      font-size:10px; color:var(--p-muted);
    }
    #ls-role-quicktools .qt-link {
      color:var(--p-gold); cursor:pointer; text-decoration:underline dotted;
      text-underline-offset:2px;
    }
    #ls-role-quicktools .qt-link:hover { color:var(--p-gold2); }
    #ls-role-quicktools .qt-link.muted { color:var(--p-muted); cursor:default; text-decoration:none; }
    #ls-role-quicktools .qt-sep { opacity:0.4; }

    #ls-role-grid {
      display:grid; grid-template-columns:repeat(4,1fr); gap:5px;
      max-height:240px; overflow-y:auto; padding:2px;
    }
    #ls-role-grid::-webkit-scrollbar { width:3px; }
    #ls-role-grid::-webkit-scrollbar-thumb { background:var(--p-border); border-radius:3px; }
    .ls-role-thumb {
      position:relative; aspect-ratio:1; border-radius:5px; overflow:hidden;
      cursor:pointer; border:2px solid transparent; transition:all 0.15s;
      background:rgba(0,0,0,0.35);
    }
    .ls-role-thumb:hover {
      transform:scale(1.05);
      border-color:var(--p-border);
      box-shadow:0 4px 12px rgba(0,0,0,0.4);
    }
    .ls-role-thumb.selected {
      border-color:var(--p-gold);
      box-shadow:0 0 0 1px var(--p-gold), 0 4px 14px rgba(201,164,90,0.35);
    }
    .ls-role-thumb.selected::after {
      content:'✓'; position:absolute; top:2px; right:2px;
      width:16px; height:16px; border-radius:50%;
      background:var(--p-gold); color:#0d0b0e;
      font-size:11px; font-weight:bold;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    }
    .ls-role-thumb .ls-role-thumb-num {
      position:absolute; top:2px; left:2px;
      width:16px; height:16px; border-radius:50%;
      background:rgba(201,164,90,0.95); color:#0d0b0e;
      font-size:9px; font-weight:bold;
      display:flex; align-items:center; justify-content:center;
      font-family:'JetBrains Mono',monospace;
      box-shadow:0 1px 3px rgba(0,0,0,0.5);
    }
    .ls-role-thumb img {
      width:100%; height:100%; object-fit:cover; display:block;
    }
    .ls-role-thumb-name {
      position:absolute; bottom:0; left:0; right:0; padding:2px 4px;
      font-size:8.5px; font-family:'JetBrains Mono',monospace;
      background:linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 60%);
      color:var(--p-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .ls-role-empty-grid {
      grid-column:1/-1; text-align:center; color:var(--p-muted);
      font-size:10.5px; padding:24px 0; line-height:1.6;
    }
    #ls-role-count {
      font-size:9px; color:var(--p-muted); font-weight:normal;
      letter-spacing:0; text-transform:none; margin-left:4px;
    }
    .ls-role-tip {
      font-size:10px; color:var(--p-muted); line-height:1.7;
      background:rgba(255,255,255,0.02); border-left:2px solid var(--p-gold);
      padding:8px 10px; border-radius:4px;
    }
    .ls-role-tip b { color:var(--p-gold2); font-weight:600; }

    /* ════════════════════════════════════════════════════════════════════
       ★ v6.0 项目 PANE
       ════════════════════════════════════════════════════════════════════ */
    #ls-proj-body { padding:12px; display:flex; flex-direction:column; gap:10px; }

    #ls-proj-script {
      width:100%; box-sizing:border-box;
      background:rgba(0,0,0,0.4); border:1px solid var(--p-border);
      border-radius:var(--p-r-sm); color:var(--p-text);
      font-size:11px; line-height:1.6;
      font-family:'JetBrains Mono',monospace;
      padding:8px 10px; outline:none; resize:vertical;
      min-height:90px; max-height:240px;
      transition:border-color 0.15s;
    }
    #ls-proj-script:focus { border-color:var(--p-gold); }
    #ls-proj-script::placeholder { color:var(--p-muted); }

    #ls-proj-script-stats {
      display:flex; gap:10px; align-items:center;
      font-size:9.5px; color:var(--p-muted);
      font-family:'JetBrains Mono',monospace;
      margin-top:4px;
    }
    #ls-proj-script-stats .num { color:var(--p-gold2); font-weight:600; }

    #ls-proj-names {
      display:flex; flex-wrap:wrap; gap:5px;
      max-height:120px; overflow-y:auto; padding:2px;
    }
    #ls-proj-names::-webkit-scrollbar { width:3px; }
    #ls-proj-names::-webkit-scrollbar-thumb { background:var(--p-border); border-radius:3px; }
    .ls-proj-name-chip {
      display:inline-flex; align-items:center; gap:5px;
      padding:4px 8px; border-radius:14px;
      background:rgba(0,0,0,0.35); border:1px solid var(--p-border);
      color:var(--p-text); font-size:10.5px;
      font-family:'JetBrains Mono',monospace;
      cursor:pointer; transition:all 0.14s;
    }
    .ls-proj-name-chip:hover { border-color:var(--p-gold); }
    .ls-proj-name-chip.matched {
      background:linear-gradient(135deg, rgba(201,164,90,0.18) 0%, rgba(201,164,90,0.06) 100%);
      border-color:var(--p-gold); color:var(--p-gold2);
    }
    .ls-proj-name-chip.unmatched { opacity:0.55; border-style:dashed; }
    .ls-proj-name-chip .chip-icon { font-size:10px; }
    .ls-proj-name-chip .chip-count {
      font-size:8.5px; opacity:0.7;
      padding:1px 4px; background:rgba(0,0,0,0.4);
      border-radius:6px;
    }

    #ls-proj-matched-grid {
      display:grid; grid-template-columns:repeat(5,1fr); gap:4px;
      max-height:160px; overflow-y:auto; padding:2px;
    }
    #ls-proj-matched-grid::-webkit-scrollbar { width:3px; }
    #ls-proj-matched-grid::-webkit-scrollbar-thumb { background:var(--p-border); border-radius:3px; }
    .ls-proj-mthumb {
      position:relative; aspect-ratio:1; border-radius:5px; overflow:hidden;
      cursor:pointer; border:2px solid transparent; transition:all 0.15s;
      background:rgba(0,0,0,0.35);
    }
    .ls-proj-mthumb:hover { transform:scale(1.04); border-color:var(--p-border); }
    .ls-proj-mthumb.selected {
      border-color:var(--p-gold);
      box-shadow:0 0 0 1px var(--p-gold), 0 3px 10px rgba(201,164,90,0.3);
    }
    .ls-proj-mthumb img { width:100%; height:100%; object-fit:cover; display:block; }
    .ls-proj-mthumb .ls-proj-mthumb-name {
      position:absolute; bottom:0; left:0; right:0;
      padding:2px 4px; font-size:8px;
      font-family:'JetBrains Mono',monospace;
      background:linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 60%);
      color:var(--p-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .ls-proj-mthumb.selected::after {
      content:'✓'; position:absolute; top:2px; right:2px;
      width:14px; height:14px; border-radius:50%;
      background:var(--p-gold); color:#0d0b0e;
      font-size:9px; font-weight:bold;
      display:flex; align-items:center; justify-content:center;
    }

    #ls-proj-style-select {
      width:100%; box-sizing:border-box;
      background:rgba(0,0,0,0.4); border:1px solid var(--p-border);
      border-radius:var(--p-r-sm); color:var(--p-text);
      font-size:11px; padding:6px 8px;
      font-family:'Noto Serif SC',serif; outline:none;
      cursor:pointer;
    }
    #ls-proj-style-select:focus { border-color:var(--p-gold); }
    #ls-proj-style-preview {
      margin-top:6px; padding:7px 9px;
      background:rgba(0,0,0,0.4); border:1px solid rgba(180,130,80,0.1);
      border-radius:var(--p-r-sm);
      font-size:9.5px; line-height:1.6; color:var(--p-muted);
      font-family:'JetBrains Mono',monospace;
      max-height:80px; overflow-y:auto;
    }
    #ls-proj-style-preview::-webkit-scrollbar { width:2px; }
    #ls-proj-style-preview::-webkit-scrollbar-thumb { background:var(--p-border); }

    /* ★ v6.0.1 自定义风格编辑器 */
    #ls-proj-style-editor {
      margin-top:8px; padding:10px;
      background:rgba(0,0,0,0.3); border:1px dashed var(--p-gold);
      border-radius:var(--p-r-sm);
    }
    #ls-proj-style-label {
      width:100%; box-sizing:border-box; margin-bottom:6px;
    }
    #ls-proj-style-text {
      width:100%; box-sizing:border-box;
      background:rgba(0,0,0,0.4); border:1px solid var(--p-border);
      border-radius:var(--p-r-sm); color:var(--p-text);
      font-size:11px; line-height:1.5;
      font-family:'JetBrains Mono',monospace;
      padding:6px 9px; outline:none; resize:vertical;
      min-height:90px; max-height:240px;
      transition:border-color 0.15s;
    }
    #ls-proj-style-text:focus { border-color:var(--p-gold); }

    #ls-proj-extra {
      width:100%; box-sizing:border-box;
      background:rgba(0,0,0,0.4); border:1px solid var(--p-border);
      border-radius:var(--p-r-sm); color:var(--p-text);
      font-size:11px; line-height:1.5;
      font-family:'JetBrains Mono',monospace;
      padding:6px 9px; outline:none; resize:vertical;
      min-height:50px; max-height:150px;
      transition:border-color 0.15s;
    }
    #ls-proj-extra:focus { border-color:var(--p-gold); }
    #ls-proj-extra::placeholder { color:var(--p-muted); }

    .ls-proj-tip {
      font-size:10px; color:var(--p-muted); line-height:1.7;
      background:rgba(255,255,255,0.02); border-left:2px solid var(--p-gold);
      padding:8px 10px; border-radius:4px;
    }
    .ls-proj-tip b { color:var(--p-gold2); font-weight:600; }
    .ls-proj-tip code {
      background:rgba(0,0,0,0.4); padding:1px 4px; border-radius:3px;
      font-size:9.5px; color:var(--p-gold);
    }

    /* ════════ 圆形最小化按钮 ════════ */
    #ls-round {
      position:fixed; right:22px; bottom:90px;
      width:56px; height:56px; border-radius:50%;
      background:linear-gradient(135deg,#7a5018 0%,#5a3a10 100%);
      border:2px solid var(--p-gold); color:var(--p-gold2);
      font-size:24px; display:none;
      align-items:center; justify-content:center;
      cursor:pointer; z-index:999998;
      box-shadow:0 6px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,164,90,0.1);
      transition:transform 0.18s, box-shadow 0.18s, background 0.18s;
      user-select:none;
    }
    #ls-round:hover {
      transform:scale(1.08);
      box-shadow:0 8px 32px rgba(201,164,90,0.4);
      background:linear-gradient(135deg,#9a6828 0%,#7a4a18 100%);
    }
    #ls-round:active { transform:scale(0.95); }
    #ls-round-dot {
      position:absolute; top:4px; right:4px; width:11px; height:11px;
      border-radius:50%; background:var(--p-green); border:2px solid var(--p-panel);
    }
    #ls-round-badge {
      position:absolute; top:-4px; right:-4px;
      min-width:20px; height:20px; padding:0 5px;
      border-radius:10px; background:var(--p-red); color:#fff;
      font-size:11px; font-family:'JetBrains Mono',monospace; font-weight:700;
      display:none; align-items:center; justify-content:center;
      border:2px solid var(--p-panel);
    }
    #ls-round-badge.visible { display:flex; }

    /* ════════ Toast ════════ */
    #ls-toast {
      position:fixed; bottom:22px; left:50%; transform:translateX(-50%) translateY(12px);
      background:#1a1420; border:1px solid var(--p-gold); color:var(--p-gold2);
      font-family:'Noto Serif SC',serif; font-size:12px; padding:9px 18px;
      border-radius:8px; z-index:9999999; opacity:0; transition:opacity 0.22s, transform 0.22s;
      pointer-events:none; white-space:nowrap; box-shadow:0 4px 20px rgba(0,0,0,0.6);
    }
    #ls-toast.show { opacity:1; transform:translateX(-50%) translateY(0); }
  `);

  // ═══════════════════════════════════════════════════════════════════════
  //   STATE & UTIL
  // ═══════════════════════════════════════════════════════════════════════
  let imageRegistry = [];
  let observer = null;
  let uploadQueue = [];
  let uploadRunning = false;
  let uploadStopped = false;

  // ★ v6.0 项目模块运行时状态
  let projectExtractedNames = []; // [{name, count, matchedRoleIds:[]}]

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const allPrompts = () => [
    ...BUILTIN,
    ...(S.promptCustoms || []).map(c => ({ ...c, cat: 'custom' }))
  ];
  const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('读取失败'));
      r.readAsDataURL(file);
    });
  }
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('读取失败'));
      r.readAsText(file, 'UTF-8');
    });
  }

  function getSelectedRoleImages() {
    if (!S.roleImages.length || !S.roleSelectedIds.length) return [];
    return S.roleSelectedIds
      .map(id => S.roleImages.find(r => r.id === id))
      .filter(Boolean);
  }

  // ★ v6.0.1 合并内置 image 风格 + 用户自定义项目风格
  function getAllStyles() {
    const builtin = BUILTIN.filter(p => p.cat === 'image').map(p => ({
      id: p.id, label: p.label, text: p.text, builtin: true
    }));
    const custom = (S.projectStyles || []).map(p => ({
      id: p.id, label: p.label, text: p.text, builtin: false
    }));
    return [...builtin, ...custom];
  }
  function getStyleById(id) {
    return getAllStyles().find(s => s.id === id) || null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   ★ v6.0 角色名提取 & 模糊匹配
  // ═══════════════════════════════════════════════════════════════════════
  // 常见中文姓氏(覆盖度 95%+)
  const CN_SURNAMES = '王李张刘陈杨黄赵吴周徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段漕钱汤尹黎易常武乔贺赖龚文庞樊兰殷施陶洪翟安颜倪严牛温芦季俞章鲁葛伍韦申尤毕聂丛焦向柳邢路岳齐沿梅莫庄辛管祝左涂谷祁时舒耿牟卜路詹关苗凌费纪靳盛童欧甄项曲成游阳裴席卫查屈鲍位覃霍翁隋植甘景薄单包司柏宁柯阮桂闵欧阳解强柴华车冉房边辜吉饶刁瞿戚丘古米池滕晋苑邬臧畅宫来嵺苟全褚廉简娄盖符奚木穆党燕郎邸冀谈姬屠连郜晏栾郁商蒙计喻揭窦迟宇敖糜鄢冷卓花艾蓝都巩稽井练仲乐虞卞封竺冼原官衣楚佟栗匡宗应台巫鞠僧桑荆谌银扬明沙薄伏岑习胥保和蔺水云苻';
  const SURNAME_SET = new Set([...CN_SURNAMES]);

  // 不能出现在中文人名里的字(动词/虚词/形容词后缀等)。
  const NAME_END_BLOCK = new Set([...'的地得了着过啊呢吧呀也是有在和与就只都还又再很太更最非已未常将刚才便又另而但因为所以然后于是看见说出听到想到觉得知道认为以为站坐走跑跳来去回到从向往对待让被把将给于以而且并且或者已经曾经正在准备打算决定开始结束完成发现遇到碰到注意发觉感觉觉醒醒过来转身回头抬头低头点头摇头握紧松开抓住拉住推开站立坐下起来放下拿起拿出穿上脱下戴上摘下笑哭怒喊叫骂闹想念思考考虑思索询问回答告诉解释强调突然忽然立刻马上瞬间一下顿时随即随后接着接下来继续不断渐渐慢慢逐渐悄悄默默静静轻轻重重狠狠死死紧紧深深浅浅快快慢慢急急匆匆没问的等说道']);

  // 主入口:从剧本提取人名
  function extractNamesFromScript(text) {
    if (!text || !text.trim()) return [];
    const counter = new Map();

    const bump = (name) => {
      const n = (name || '').trim();
      if (!n) return;
      if (n.length < 2 || n.length > 4) return;
      if (/^(我们|他们|你们|什么|怎么|为什么|因为|所以|然后|这个|那个|一个|这些|那些|可以|可能|不要|没有|这样|那样)$/.test(n)) return;
      if (/^[\u4e00-\u9fa5]+$/.test(n) && [...n].some(c => NAME_END_BLOCK.has(c))) return;
      counter.set(n, (counter.get(n) || 0) + 1);
    };

    // 1) 引号包裹的名字
    const quoted = text.match(/[「『""〝][\u4e00-\u9fa5A-Za-z·\-]{2,8}[」』""〞]/g) || [];
    quoted.forEach(q => {
      const inner = q.slice(1, -1);
      if (/^[\u4e00-\u9fa5]{2,4}$/.test(inner)) bump(inner);
    });

    // 2) 「角色:XX」 / 「XX:」对话标签
    const dialogTags = text.match(/(?:^|\n)\s*([\u4e00-\u9fa5]{2,4}|[A-Z][a-zA-Z]{1,15})\s*[::]/g) || [];
    dialogTags.forEach(d => {
      const m = d.match(/([\u4e00-\u9fa5]{2,4}|[A-Z][a-zA-Z]{1,15})/);
      if (m) bump(m[1]);
    });

    // 3) XX说/道
    const verbRe = /([\u4e00-\u9fa5]{2,4})(?=(?:说道|说|道|答|喊道|怒道|低声道|轻声道|笑道|嘀咕|开口|低吼))/g;
    let vm;
    while ((vm = verbRe.exec(text)) !== null) {
      const cand = vm[1];
      if (!SURNAME_SET.has(cand[0])) continue;
      bump(cand);
    }

    // 4) 姓氏滑窗
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (!SURNAME_SET.has(ch)) { i++; continue; }
      const prev = text[i - 1];
      if (prev && /[\u4e00-\u9fa5]/.test(prev)) { i++; continue; }

      let bestLen = 0;
      for (let len = 2; len <= 4; len++) {
        const cand = text.slice(i, i + len);
        if (cand.length !== len) break;
        if (!/^[\u4e00-\u9fa5]+$/.test(cand)) break;
        if ([...cand].some(c => NAME_END_BLOCK.has(c))) break;
        const next = text[i + len] || '';
        if (NAME_END_BLOCK.has(next) ||
            ',.。?!,;: \n\t、"\'』」'.includes(next) ||
            '说道答喊叫笑望看想哭'.includes(next)) {
          bestLen = len;
          break;
        }
        if (!/[\u4e00-\u9fa5]/.test(next)) {
          bestLen = len;
          break;
        }
        bestLen = len;
      }
      if (bestLen > 0) {
        bump(text.slice(i, i + bestLen));
        i += bestLen;
      } else {
        i++;
      }
    }

    // 5) 英文人名
    const enNames = text.match(/\b[A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,15})?\b/g) || [];
    enNames.forEach(n => {
      if (/^(The|This|That|These|Those|And|But|For|With|From|However|Although|Because|Therefore|Chapter|Section|Part)\b/.test(n)) return;
      bump(n);
    });

    return [...counter.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }

  // 模糊匹配:把名字 → 角色库 id
  function fuzzyMatchRoles(name) {
    if (!name || !S.roleImages.length) return [];
    const normName = name.toLowerCase().trim();
    const hits = [];
    for (const r of S.roleImages) {
      const raw = (r.name || '').toLowerCase();
      const cleaned = raw
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/^[\d_\-\s]+/, '')
        .replace(/[_\-\s]+/g, '')
        .trim();
      if (!cleaned) continue;
      if (cleaned.includes(normName) || normName.includes(cleaned)) {
        hits.push(r.id);
      }
    }
    return hits;
  }

  function recomputeProjectMatches() {
    projectExtractedNames = extractNamesFromScript(S.projectScript || '').map(n => ({
      ...n,
      matchedRoleIds: fuzzyMatchRoles(n.name)
    }));
    const seen = new Set();
    const merged = [];
    for (const n of projectExtractedNames) {
      for (const id of n.matchedRoleIds) {
        if (!seen.has(id)) { seen.add(id); merged.push(id); }
      }
    }
    S.projectMatchedIds = merged;
    save();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   PANEL BUILD
  // ═══════════════════════════════════════════════════════════════════════
  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'ls-panel';
    panel.innerHTML = `
      <div id="ls-header">
        <span class="ls-h-icon">🎭</span>
        <span class="ls-h-title">乔大仙 · 全能助手<span class="ls-h-sub">  v6.1.0 · ALT+SHIFT+Q</span></span>
        <button id="ls-btn-min" title="最小化为圆形按钮">─</button>
      </div>
      <div id="ls-tabs">
        <button class="ls-tab" data-tab="prompt">✍ 提示词</button>
        <button class="ls-tab" data-tab="image">🎵 图片</button>
        <button class="ls-tab" data-tab="role">🎭 角色库</button>
        <button class="ls-tab" data-tab="project">📋 项目</button>
      </div>
      ${promptPaneHTML()}
      ${imagePaneHTML()}
      ${rolePaneHTML()}
      ${projectPaneHTML()}
    `;
    document.body.appendChild(panel);

    const round = document.createElement('div');
    round.id = 'ls-round';
    round.innerHTML = '🎭<span id="ls-round-dot"></span><span id="ls-round-badge">0</span>';
    round.title = '展开助手 (Alt+Shift+Q)';
    document.body.appendChild(round);

    const toast = document.createElement('div');
    toast.id = 'ls-toast';
    document.body.appendChild(toast);

    initDrag(panel);
    bindHeaderEvents(panel);
    bindPromptEvents(panel);
    bindImageEvents(panel);
    bindRoleEvents(panel);
    bindProjectEvents(panel);

    switchTab(S.activeTab || 'prompt');
    applyMinState();

    renderPromptList();
    renderImageGrid();
    updateImageStats();
    renderRoleImage();
    renderProjectAll();
  }

  function promptPaneHTML() {
    const catHtml = CATEGORIES.map(c =>
      `<span class="lsp-cat${S.promptCategory === c.id ? ' active' : ''}" data-cat="${c.id}">${c.icon} ${c.label}</span>`
    ).join('');
    return `
      <div id="ls-pane-prompt" class="ls-pane">
        <div id="lsp-search-wrap">
          <input id="lsp-search" placeholder="🔍 搜索提示词…" value="${escHtml(S.promptSearch || '')}" autocomplete="off" spellcheck="false"/>
          <button id="lsp-search-clear" class="${S.promptSearch ? 'visible' : ''}">✕</button>
        </div>
        <div id="lsp-cats">${catHtml}</div>
        <div id="lsp-list"></div>
        <div id="lsp-actions-bar">
          <span id="lsp-mode-label">写入模式:</span>
          <button class="lsp-mode-btn${S.promptInsertMode==='replace'?' active':''}" data-mode="replace">替换</button>
          <button class="lsp-mode-btn${S.promptInsertMode==='append'?' active':''}" data-mode="append">追加</button>
          <button class="lsp-mode-btn${S.promptInsertMode==='prepend'?' active':''}" data-mode="prepend">前置</button>
        </div>
        <div id="lsp-add-section">
          <div class="lsp-sec-title">＋ 保存自定义提示词</div>
          <input id="lsp-add-label" placeholder="名称(如:我的风格指令)" maxlength="30"/>
          <textarea id="lsp-add-text" placeholder="提示词正文…"></textarea>
          <button id="lsp-add-btn">💾 保存到「自定义」</button>
        </div>
      </div>
    `;
  }

  function imagePaneHTML() {
    return `
      <div id="ls-pane-image" class="ls-pane">
        <div id="ls-img-body">
          <div id="ls-stats">
            <div class="ls-stat"><div class="ls-stat-num gold"  id="ls-count-total">0</div><div class="ls-stat-label">全部图</div></div>
            <div class="ls-stat"><div class="ls-stat-num green" id="ls-count-gpt">0</div><div class="ls-stat-label">GPT生图</div></div>
            <div class="ls-stat"><div class="ls-stat-num blue"  id="ls-count-upload">0</div><div class="ls-stat-label">上传图</div></div>
          </div>
          <div class="ls-section">
            <div class="ls-section-title">📷 识别预览</div>
            <div id="ls-grid"><div class="ls-empty-grid">等待图片扫描…</div></div>
          </div>
          <div class="ls-section">
            <div class="ls-section-title">🏷 下载命名</div>
            <div class="ls-row">
              <span class="ls-label">前缀</span>
              <input class="ls-input" id="ls-input-prefix" value="${escHtml(S.shotPrefix)}" placeholder="杏花十八" />
            </div>
            <div class="ls-row">
              <span class="ls-label">起始序号</span>
              <input class="ls-input ls-input-num" id="ls-input-index" type="number" min="1" value="${S.shotIndex}" />
              <span style="font-size:10px;color:var(--p-muted)">→ 01_前缀_1.png</span>
            </div>
            <div class="ls-row ls-toggle-wrap">
              <label class="ls-toggle">
                <input type="checkbox" id="ls-chk-watch" ${S.autoWatch ? 'checked' : ''} />
                <span class="ls-toggle-slider"></span>
              </label>
              <span style="font-size:10px;color:var(--p-muted)">自动扫描新图(3s 轮询)</span>
            </div>
          </div>
          <div id="ls-progress-wrap"><div id="ls-progress-bar"></div></div>
          <div class="ls-btn-row">
            <button class="ls-btn primary" id="ls-btn-dl-gpt">⬇ 下载GPT图</button>
            <button class="ls-btn" id="ls-btn-dl-all">⬇ 全部</button>
          </div>
          <div class="ls-btn-row">
            <button class="ls-btn success" id="ls-btn-scan">🔍 重新扫描</button>
            <button class="ls-btn" id="ls-btn-copy-urls">📋 复制URL</button>
            <button class="ls-btn danger" id="ls-btn-clear">🗑</button>
          </div>

          <div class="ls-section">
            <div class="ls-section-title">📤 逐张上传队列</div>
            <input type="file" id="ls-file-input" accept="image/*" multiple style="display:none" />
            <input type="file" id="ls-folder-input" accept="image/*" multiple webkitdirectory mozdirectory style="display:none" />
            <div id="ls-upload-zone">
              <div id="ls-upload-text">拖拽图片 / 文件夹到这里<br><span style="font-size:9px;opacity:0.5">v6.0.1 · 严格串行 / 三重兜底</span></div>
            </div>
            <div class="ls-row" style="margin-top:8px;">
              <span class="ls-label">提示词</span>
              <input class="ls-input" id="ls-upload-prompt" value="${escHtml(S.uploadPrompt || '')}" placeholder="高清修复 人脸修复,细节修复 16比9" />
            </div>
            <div class="ls-btn-row" style="margin-top:6px;">
              <button class="ls-btn" id="ls-btn-pick-files">🖼 选图片</button>
              <button class="ls-btn" id="ls-btn-pick-folder">📁 选文件夹</button>
            </div>
            <div id="ls-queue-list" style="display:none;margin-top:8px;max-height:140px;overflow-y:auto;"></div>
            <div class="ls-btn-row" style="margin-top:6px;display:none;" id="ls-queue-controls">
              <button class="ls-btn primary" id="ls-btn-upload-now">▶ 开始上传</button>
              <button class="ls-btn danger" id="ls-btn-upload-stop">⏹ 停止</button>
              <button class="ls-btn" id="ls-btn-upload-clear">🗑 清空</button>
            </div>
          </div>
          <div class="ls-section">
            <div class="ls-section-title">📋 日志</div>
            <div id="ls-log"><span class="ls-log-line info">· 全能助手 v6.1.0 已加载(配置导入导出)</span></div>
          </div>
        </div>
      </div>
    `;
  }

  function rolePaneHTML() {
    return `
      <div id="ls-pane-role" class="ls-pane">
        <div id="ls-role-body">
          <div class="ls-section">
            <div class="ls-section-title">🎯 当前选中</div>
            <div id="ls-role-preview"></div>
          </div>

          <div class="ls-btn-row">
            <button class="ls-btn primary" id="ls-btn-role-upload">📤 上传选中</button>
            <button class="ls-btn danger" id="ls-btn-role-delete" style="flex:0 0 auto;padding:7px 12px;" title="删除当前选中">🗑</button>
          </div>

          <div class="ls-section">
            <div class="ls-section-title">📚 我的角色库<span id="ls-role-count">(0)</span></div>
            <div id="ls-role-quicktools">
              <span>多选:</span>
              <span class="qt-link" id="ls-role-sel-all">全选</span>
              <span class="qt-sep">·</span>
              <span class="qt-link" id="ls-role-sel-invert">反选</span>
              <span class="qt-sep">·</span>
              <span class="qt-link" id="ls-role-sel-none">全不选</span>
            </div>
            <div id="ls-role-grid"></div>
            <input type="file" id="ls-role-input" accept="image/*" multiple style="display:none" />
            <div class="ls-btn-row" style="margin-top:8px;">
              <button class="ls-btn" id="ls-btn-role-import">📥 导入新角色图(可多选)</button>
              <button class="ls-btn danger" id="ls-btn-role-clear-all" style="flex:0 0 auto;padding:7px 12px;" title="清空全部">全清</button>
            </div>
          </div>

          <div class="ls-role-tip">
            <b>💡 多选用法:</b><br>
            · 库里可保存任意多张角色参考图,长期复用<br>
            · 点击下方缩略图 = <b>切换选中</b>(可多选,选中带金边和 ✓)<br>
            · 同一场景多个角色?<b>挨个点选</b>,然后「上传选中」一次性附加<br>
            · 缩略图左上角的 <b>① ② ③</b> 显示选中顺序<br>
            · 写好提示词后手动点发送即可
          </div>
        </div>
      </div>
    `;
  }

  // ★ v6.0.1 项目 PANE
  function projectPaneHTML() {
    return `
      <div id="ls-pane-project" class="ls-pane">
        <div id="ls-proj-body">
          <div class="ls-section">
            <div class="ls-section-title">📜 剧本/提示文本</div>
            <input type="file" id="ls-proj-file" accept=".txt,text/plain,.md" style="display:none" />
            <div class="ls-btn-row" style="margin-bottom:6px;">
              <button class="ls-btn" id="ls-btn-proj-load">📥 上传 TXT</button>
              <button class="ls-btn" id="ls-btn-proj-paste">📋 从剪贴板粘贴</button>
              <button class="ls-btn danger" id="ls-btn-proj-clear" style="flex:0 0 auto;padding:7px 12px;">清空</button>
            </div>
            <textarea id="ls-proj-script" placeholder="把剧本/对话/分镜文本贴在这里,或上传 TXT…&#10;脚本会自动从中提取角色名,然后在角色库里找匹配的图。">${escHtml(S.projectScript || '')}</textarea>
            <div id="ls-proj-script-stats">
              <span>字数: <span class="num" id="ls-proj-charlen">0</span></span>
              <span>·</span>
              <span>识别角色: <span class="num" id="ls-proj-namecount">0</span></span>
              <span>·</span>
              <span>命中角色图: <span class="num" id="ls-proj-hitcount">0</span></span>
            </div>
          </div>

          <div class="ls-section">
            <div class="ls-section-title">👥 提取的角色名(点击 chip 复制名字)</div>
            <div id="ls-proj-names"></div>
          </div>

          <div class="ls-section">
            <div class="ls-section-title">🖼 自动勾选的角色图<span id="ls-proj-hit-count" style="font-size:9px;color:var(--p-muted);font-weight:normal;letter-spacing:0;text-transform:none;margin-left:4px;">(0)</span></div>
            <div id="ls-proj-matched-grid"></div>
            <div class="ls-btn-row" style="margin-top:6px;">
              <button class="ls-btn" id="ls-btn-proj-rematch">🔄 重新匹配</button>
              <button class="ls-btn" id="ls-btn-proj-sel-all-hit">全选命中</button>
              <button class="ls-btn" id="ls-btn-proj-sel-none">全不选</button>
            </div>
          </div>

          <div class="ls-section">
            <div class="ls-section-title">🎨 风格提示词模板</div>
            <select id="ls-proj-style-select"></select>
            <div id="ls-proj-style-preview"></div>
            <div class="ls-btn-row" style="margin-top:6px;">
              <button class="ls-btn" id="ls-btn-style-edit" title="编辑当前选中的风格(内置会转为另存为新风格)">✏ 编辑</button>
              <button class="ls-btn" id="ls-btn-style-new" title="新建一个空白自定义风格">＋ 新建</button>
              <button class="ls-btn danger" id="ls-btn-style-del" style="flex:0 0 auto;padding:7px 12px;" title="删除当前自定义风格">🗑</button>
            </div>
            <div id="ls-proj-style-editor" style="display:none;">
              <input id="ls-proj-style-label" class="ls-input" placeholder="风格名称(如:我的暗黑漫画风)" maxlength="40"/>
              <textarea id="ls-proj-style-text" placeholder="风格提示词正文…"></textarea>
              <div class="ls-btn-row" style="margin-top:6px;">
                <button class="ls-btn primary" id="ls-btn-style-save">💾 保存</button>
                <button class="ls-btn" id="ls-btn-style-cancel">取消</button>
              </div>
            </div>
          </div>

          <div class="ls-section">
            <div class="ls-section-title">✏ 项目额外提示词(追加在风格之后)</div>
            <textarea id="ls-proj-extra" placeholder="可选:角色描述、镜头要求、附加约束…&#10;比如:画面分6格,每格一个不同镜头;主角穿黑色皮夹克;血迹要刺眼一点">${escHtml(S.projectExtraPrompt || '')}</textarea>
          </div>

          <div class="ls-row ls-toggle-wrap" style="margin:2px 2px 4px;">
            <label class="ls-toggle">
              <input type="checkbox" id="ls-proj-attach-script" ${S.projectAttachScript ? 'checked' : ''} />
              <span class="ls-toggle-slider"></span>
            </label>
            <span style="font-size:10px;color:var(--p-muted)">应用时同时把 TXT 作为附件传给 GPT <span id="ls-proj-attach-filename" style="color:var(--p-gold2);"></span></span>
          </div>
          <div class="ls-btn-row">
            <button class="ls-btn primary" id="ls-btn-proj-apply">🚀 应用到 ChatGPT 输入框</button>
          </div>

          <div class="ls-proj-tip">
            <b>💡 项目工作流:</b><br>
            1. 上传 TXT 剧本(或直接粘贴文本)<br>
            2. 脚本自动提取人名,在角色库里匹配同名图<br>
            3. 匹配上的图自动勾选,可手动取消<br>
            4. 选风格模板;<b>v6.0.1</b> 起支持「✏ 编辑 / ＋ 新建」自己的风格(★ 标记为自定义)<br>
            5. <b>v6.0.2</b> 起默认会把 TXT 一起作为附件传给 GPT(可在按钮上方关掉)<br>
            6. 点「🚀 应用」= 角色图+TXT附加 + 提示词写入,检查后自己点发送
          </div>

          <div class="ls-section">
            <div class="ls-section-title">💾 配置管理(v6.1.0)</div>
            <div class="ls-btn-row">
              <button class="ls-btn primary" id="ls-btn-cfg-export">📤 导出全部配置</button>
              <button class="ls-btn" id="ls-btn-cfg-import">📥 导入配置</button>
            </div>
            <div class="ls-btn-row" style="margin-top:6px;">
              <button class="ls-btn" id="ls-btn-cfg-export-light" title="不含角色图的轻量配置(仅风格+提示词+设置)">📤 导出(无角色图)</button>
              <button class="ls-btn danger" id="ls-btn-cfg-reset" style="flex:0 0 auto;padding:7px 12px;" title="重置全部配置">⚠ 重置</button>
            </div>
            <input type="file" id="ls-cfg-file" accept=".json,application/json" style="display:none" />
            <div class="ls-proj-tip" style="margin-top:8px;">
              <b>📦 导出/导入说明:</b><br>
              · <b>完整导出</b>:含角色图(base64),文件较大(几 MB~几十 MB),可换设备完整恢复<br>
              · <b>无角色图导出</b>:仅含风格、提示词、设置,文件小(几 KB),适合分享配置<br>
              · 导入时会<b>合并</b>到当前配置(同 ID 覆盖,不影响其他数据)<br>
              · <b>⚠ 重置</b> = 清空所有数据回到初始状态(慎用)
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   DRAG / TAB / MIN
  // ═══════════════════════════════════════════════════════════════════════
  function initDrag(panel) {
    const header = panel.querySelector('#ls-header');
    let dragging = false, ox = 0, oy = 0;
    header.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      ox = e.clientX - panel.offsetLeft;
      oy = e.clientY - panel.offsetTop;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', () => { dragging = false; }, { once: true });
    });
    function onMove(e) {
      if (!dragging) return;
      panel.style.left = (e.clientX - ox) + 'px';
      panel.style.top  = (e.clientY - oy) + 'px';
      panel.style.right = 'auto';
    }
  }

  function switchTab(tab) {
    S.activeTab = tab; save();
    document.querySelectorAll('.ls-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.ls-pane').forEach(p =>
      p.classList.toggle('active', p.id === `ls-pane-${tab}`));
  }

  function setMinimized(min) {
    S.minimized = min; save();
    applyMinState();
  }
  function applyMinState() {
    const panel = document.getElementById('ls-panel');
    const round = document.getElementById('ls-round');
    if (!panel || !round) return;
    if (S.minimized) {
      panel.style.display = 'none';
      round.style.display = 'flex';
    } else {
      panel.style.display = 'flex';
      round.style.display = 'none';
    }
  }
  function updateRoundBadge() {
    const badge = document.getElementById('ls-round-badge');
    if (!badge) return;
    const n = imageRegistry.filter(r => r.type === 'gpt' && !r.downloaded).length;
    badge.textContent = n;
    badge.classList.toggle('visible', n > 0);
  }

  function bindHeaderEvents(panel) {
    panel.querySelector('#ls-btn-min').onclick = () => setMinimized(true);
    panel.querySelectorAll('.ls-tab').forEach(t => {
      t.onclick = () => switchTab(t.dataset.tab);
    });
    document.getElementById('ls-round').onclick = () => setMinimized(false);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   PROMPT 模块
  // ═══════════════════════════════════════════════════════════════════════
  function bindPromptEvents(panel) {
    const searchEl = panel.querySelector('#lsp-search');
    const clearEl  = panel.querySelector('#lsp-search-clear');
    searchEl.addEventListener('input', () => {
      S.promptSearch = searchEl.value;
      clearEl.classList.toggle('visible', !!S.promptSearch);
      renderPromptList(); save();
    });
    clearEl.onclick = () => {
      S.promptSearch = ''; searchEl.value = '';
      clearEl.classList.remove('visible');
      renderPromptList(); save();
    };

    panel.querySelector('#lsp-cats').addEventListener('click', e => {
      const cat = e.target.closest('.lsp-cat');
      if (!cat) return;
      S.promptCategory = cat.dataset.cat;
      panel.querySelectorAll('.lsp-cat').forEach(c =>
        c.classList.toggle('active', c.dataset.cat === S.promptCategory));
      renderPromptList(); save();
    });

    panel.querySelector('#lsp-actions-bar').addEventListener('click', e => {
      const btn = e.target.closest('.lsp-mode-btn');
      if (!btn) return;
      S.promptInsertMode = btn.dataset.mode;
      panel.querySelectorAll('.lsp-mode-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === S.promptInsertMode));
      save();
      const tip = S.promptInsertMode === 'replace' ? '替换' :
                  S.promptInsertMode === 'append'  ? '末尾追加' : '开头前置';
      showToast(`写入模式:${tip}`);
    });

    panel.querySelector('#lsp-add-btn').onclick = () => {
      const label = panel.querySelector('#lsp-add-label').value.trim();
      const text  = panel.querySelector('#lsp-add-text').value.trim();
      if (!label || !text) { showToast('请填写名称和提示词内容'); return; }
      const id = 'custom_' + Date.now();
      S.promptCustoms.push({ id, label, text });
      save();
      panel.querySelector('#lsp-add-label').value = '';
      panel.querySelector('#lsp-add-text').value  = '';
      showToast(`✓ 已保存「${label}」`);
      renderPromptList();
    };
  }

  function renderPromptList() {
    const list = document.getElementById('lsp-list');
    if (!list) return;
    const q   = (S.promptSearch || '').toLowerCase();
    const cat = S.promptCategory;

    let items = allPrompts().filter(p => {
      if (cat === 'all')      return true;
      if (cat === 'favorite') return S.promptFavorites.includes(p.id);
      if (cat === 'custom')   return p.cat === 'custom';
      return p.cat === cat;
    });

    if (q) {
      items = items.filter(p =>
        p.label.toLowerCase().includes(q) || p.text.toLowerCase().includes(q)
      );
    }

    if (!items.length) {
      const hint = cat === 'favorite'
        ? '暂无收藏的提示词<br>点击列表里的 ☆ 把它加到收藏'
        : '没有匹配的提示词<br>换个关键词试试,或者去「自定义」保存';
      list.innerHTML = `<div class="lsp-empty">${hint}</div>`;
      return;
    }

    const hl = str => {
      if (!q) return escHtml(str);
      const idx = str.toLowerCase().indexOf(q);
      if (idx < 0) return escHtml(str);
      return escHtml(str.slice(0, idx))
        + `<span class="lsp-highlight">${escHtml(str.slice(idx, idx + q.length))}</span>`
        + escHtml(str.slice(idx + q.length));
    };

    list.innerHTML = items.map(p => {
      const faved = S.promptFavorites.includes(p.id);
      const isCustom = p.cat === 'custom';
      return `
        <div class="lsp-item cat-${p.cat}" data-id="${p.id}">
          <div class="lsp-item-cat"></div>
          <div class="lsp-item-main">
            <div class="lsp-item-label">${hl(p.label)}</div>
            <div class="lsp-item-preview">${hl(p.text)}</div>
          </div>
          <div class="lsp-item-actions">
            <button class="lsp-btn-fav ${faved ? 'starred' : ''}" data-id="${p.id}" title="${faved ? '取消收藏' : '收藏'}">${faved ? '★' : '☆'}</button>
            ${isCustom ? `<button class="lsp-btn-del" data-id="${p.id}" title="删除">✕</button>` : ''}
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.lsp-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.lsp-btn-fav') || e.target.closest('.lsp-btn-del')) return;
        const id = el.dataset.id;
        const prompt = allPrompts().find(p => p.id === id);
        if (prompt) insertPromptIntoEditor(prompt.text);
      });
    });

    list.querySelectorAll('.lsp-btn-fav').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (S.promptFavorites.includes(id)) {
          S.promptFavorites = S.promptFavorites.filter(x => x !== id);
          showToast('已取消收藏');
        } else {
          S.promptFavorites.push(id);
          showToast('已收藏 ★');
        }
        save(); renderPromptList();
      };
    });

    list.querySelectorAll('.lsp-btn-del').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        S.promptCustoms = S.promptCustoms.filter(c => c.id !== id);
        S.promptFavorites = S.promptFavorites.filter(x => x !== id);
        save(); renderPromptList();
        showToast('已删除');
      };
    });
  }

  async function insertPromptIntoEditor(text) {
    const area = findEditArea();
    if (!area) { showToast('⚠ 找不到输入框,请先点击聊天输入栏'); return; }
    area.focus(); await sleep(60);

    if (area.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      const cur = area.value;
      let next = text;
      if (S.promptInsertMode === 'append')  next = cur ? cur + '\n' + text : text;
      if (S.promptInsertMode === 'prepend') next = cur ? text + '\n' + cur : text;
      setter.call(area, next);
      area.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const cur = area.textContent || '';
      let next = text;
      if (S.promptInsertMode === 'append')  next = cur ? cur + '\n' + text : text;
      if (S.promptInsertMode === 'prepend') next = cur ? text + '\n' + cur : text;
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      const ok = document.execCommand('insertText', false, next);
      if (!ok) {
        area.textContent = next;
        area.dispatchEvent(new InputEvent('input', { bubbles: true, data: next }));
      }
    }
    showToast('✓ 提示词已写入输入框');
    area.focus();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   IMAGE 模块
  // ═══════════════════════════════════════════════════════════════════════
  function bindImageEvents(panel) {
    panel.querySelector('#ls-input-prefix').oninput = e => {
      S.shotPrefix = e.target.value.trim() || '镜头'; save();
    };
    panel.querySelector('#ls-input-index').oninput = e => {
      S.shotIndex = parseInt(e.target.value) || 1; save();
    };
    panel.querySelector('#ls-chk-watch').onchange = e => {
      S.autoWatch = e.target.checked; save();
      if (S.autoWatch) startWatcher();
    };

    const upPromptEl = panel.querySelector('#ls-upload-prompt');
    if (upPromptEl) upPromptEl.oninput = e => { S.uploadPrompt = e.target.value; save(); };

    panel.querySelector('#ls-btn-scan').onclick   = () => fullScan();
    panel.querySelector('#ls-btn-dl-gpt').onclick = () => downloadImages('gpt');
    panel.querySelector('#ls-btn-dl-all').onclick = () => downloadImages('all');
    panel.querySelector('#ls-btn-clear').onclick  = () => {
      imageRegistry = []; S.downloadedUrls = []; save();
      renderImageGrid(); updateImageStats(); addLog('· 已清空记录', 'info');
    };
    panel.querySelector('#ls-btn-copy-urls').onclick = () => {
      const urls = imageRegistry.filter(r => r.type === 'gpt').map(r => r.url);
      if (!urls.length) { showToast('没有 GPT 图片 URL'); return; }
      navigator.clipboard.writeText(urls.join('\n'));
      showToast(`✓ 已复制 ${urls.length} 条 URL`);
    };

    const zone        = panel.querySelector('#ls-upload-zone');
    const fileInput   = panel.querySelector('#ls-file-input');
    const folderInput = panel.querySelector('#ls-folder-input');

    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('dragover'); });
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('dragover');
      const items = e.dataTransfer.items ? Array.from(e.dataTransfer.items) : [];
      const files = [];
      const promises = items.map(item => {
        if (item.kind !== 'file') return Promise.resolve();
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry && entry.isDirectory) return readDirRecursive(entry).then(fs => files.push(...fs));
        else { const f = item.getAsFile(); if (f && f.type.startsWith('image/')) files.push(f); return Promise.resolve(); }
      });
      Promise.all(promises).then(() => { if (files.length) enqueueFiles(sortImageFiles(files)); });
    });

    panel.querySelector('#ls-btn-pick-files').onclick = () => { fileInput.value = ''; fileInput.click(); };
    fileInput.onchange = () => {
      const files = sortImageFiles(Array.from(fileInput.files).filter(f => f.type.startsWith('image/')));
      if (files.length) enqueueFiles(files);
      fileInput.value = '';
    };
    panel.querySelector('#ls-btn-pick-folder').onclick = () => { folderInput.value = ''; folderInput.click(); };
    folderInput.onchange = () => {
      const files = sortImageFiles(Array.from(folderInput.files).filter(f => f.type.startsWith('image/')));
      if (files.length) enqueueFiles(files);
      folderInput.value = '';
    };

    panel.querySelector('#ls-btn-upload-now').onclick = () => {
      if (!uploadRunning && uploadQueue.some(i => i.status === 'pending')) {
        uploadStopped = false;
        runUploadQueue();
      }
    };
    panel.querySelector('#ls-btn-upload-stop').onclick = () => {
      uploadStopped = true; uploadRunning = false;
      addLog('· 用户已停止上传队列', 'err');
      updateQueueUI();
    };
    panel.querySelector('#ls-btn-upload-clear').onclick = () => {
      uploadQueue = []; uploadStopped = false;
      renderQueueList(); updateQueueUI();
      addLog('· 上传队列已清空', 'info');
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   ROLE 模块
  // ═══════════════════════════════════════════════════════════════════════
  function bindRoleEvents(panel) {
    const roleInput = panel.querySelector('#ls-role-input');

    panel.querySelector('#ls-btn-role-import').onclick = () => {
      roleInput.value = '';
      roleInput.click();
    };

    roleInput.onchange = async () => {
      const files = Array.from(roleInput.files || []);
      if (!files.length) return;
      let added = 0, failed = 0;
      const newIds = [];
      for (const f of files) {
        if (!f.type.startsWith('image/')) { failed++; continue; }
        if (f.size > 10 * 1024 * 1024) {
          addLog(`⚠ 跳过过大文件 ${f.name}(${(f.size/1024/1024).toFixed(1)}MB)`, 'err');
          failed++; continue;
        }
        try {
          const dataUrl = await readFileAsDataUrl(f);
          const id = 'role_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
          S.roleImages.push({
            id,
            name: f.name,
            type: f.type || 'image/png',
            dataUrl,
            addedAt: Date.now(),
          });
          newIds.push(id);
          added++;
          addLog(`📥 角色图已入库:${f.name} (${(f.size/1024).toFixed(0)}KB)`, 'ok');
        } catch (e) {
          addLog(`✗ 导入失败 ${f.name}:${e.message}`, 'err');
          failed++;
        }
      }
      if (newIds.length) {
        const have = new Set(S.roleSelectedIds);
        newIds.forEach(id => { if (!have.has(id)) S.roleSelectedIds.push(id); });
      }
      try { save(); }
      catch (e) {
        addLog(`✗ 持久化失败,可能图库过大:${e.message}`, 'err');
        showToast('存储失败,角色库过大');
      }
      renderRoleImage();
      recomputeProjectMatches();
      renderProjectAll();
      if (added) showToast(`✓ 已导入 ${added} 张并加入选中${failed ? `,${failed} 张失败` : ''}`);
      else if (failed) showToast(`✗ 导入失败 (${failed})`);
      roleInput.value = '';
    };

    panel.querySelector('#ls-btn-role-upload').onclick = async () => {
      const sel = getSelectedRoleImages();
      if (!sel.length) {
        showToast('请先在下方角色库选中至少一张图');
        return;
      }
      addLog(`📤 注入角色图(${sel.length} 张):${sel.map(s => s.name).join(' / ')}`, 'info');
      try {
        const files = [];
        for (const r of sel) {
          const blob = await (await fetch(r.dataUrl)).blob();
          files.push(new File([blob], r.name, { type: r.type || blob.type }));
        }
        const ok = await injectFiles(files);
        if (ok) {
          const tip = sel.length === 1
            ? `✓ 已附加「${sel[0].name}」(1 张),写完提示词手动发送`
            : `✓ 已附加 ${sel.length} 张角色图,写完提示词手动发送`;
          showToast(tip);
          addLog(`✓ ${sel.length} 张角色图已附加到输入框`, 'ok');
          waitForFilePreview(5000);
        } else {
          showToast('✗ 附加失败,请先点一下聊天输入框再试');
          addLog(`✗ 角色图附加失败`, 'err');
        }
      } catch (e) {
        addLog(`✗ 上传出错:${e.message}`, 'err');
        showToast('上传出错');
      }
    };

    panel.querySelector('#ls-btn-role-delete').onclick = () => {
      const sel = getSelectedRoleImages();
      if (!sel.length) { showToast('没有选中可删除的角色图'); return; }
      const tip = sel.length === 1
        ? `确认从角色库删除「${sel[0].name}」?`
        : `确认从角色库删除选中的 ${sel.length} 张角色图?`;
      if (!confirm(tip)) return;
      const delIds = new Set(S.roleSelectedIds);
      S.roleImages = S.roleImages.filter(r => !delIds.has(r.id));
      S.roleSelectedIds = [];
      save();
      renderRoleImage();
      recomputeProjectMatches();
      renderProjectAll();
      showToast(`已删除 ${sel.length} 张`);
      addLog(`· 已删除 ${sel.length} 张角色图`, 'info');
    };

    panel.querySelector('#ls-btn-role-clear-all').onclick = () => {
      if (!S.roleImages.length) { showToast('角色库已是空的'); return; }
      if (!confirm(`确定清空全部 ${S.roleImages.length} 张角色图?此操作不可恢复。`)) return;
      S.roleImages = [];
      S.roleSelectedIds = [];
      save();
      renderRoleImage();
      recomputeProjectMatches();
      renderProjectAll();
      showToast('已清空角色库');
      addLog('· 角色库已全部清空', 'info');
    };

    panel.querySelector('#ls-role-sel-all').onclick = () => {
      if (!S.roleImages.length) return;
      S.roleSelectedIds = S.roleImages.map(r => r.id);
      save(); renderRoleImage();
    };
    panel.querySelector('#ls-role-sel-none').onclick = () => {
      if (!S.roleSelectedIds.length) return;
      S.roleSelectedIds = [];
      save(); renderRoleImage();
    };
    panel.querySelector('#ls-role-sel-invert').onclick = () => {
      if (!S.roleImages.length) return;
      const cur = new Set(S.roleSelectedIds);
      S.roleSelectedIds = S.roleImages.filter(r => !cur.has(r.id)).map(r => r.id);
      save(); renderRoleImage();
    };
  }

  function renderRoleImage() {
    const preview = document.getElementById('ls-role-preview');
    const grid = document.getElementById('ls-role-grid');
    const count = document.getElementById('ls-role-count');
    const btnUpload = document.getElementById('ls-btn-role-upload');
    const btnDelete = document.getElementById('ls-btn-role-delete');
    if (!preview || !grid) return;

    if (count) count.textContent = `(${S.roleImages.length})`;

    const selected = getSelectedRoleImages();
    const selN = selected.length;

    if (selN === 0) {
      preview.innerHTML = `
        <div class="ls-role-empty">
          ${S.roleImages.length ? '尚未选中任何角色图' : '尚未导入角色参考图'}
          <span>${S.roleImages.length
            ? '点击下方缩略图选中(支持多选 / 一个场景多个角色)'
            : '点击下方「导入新角色图」开始(支持多选)'}</span>
        </div>`;
    } else if (selN === 1) {
      const cur = selected[0];
      const sizeKB = cur.dataUrl ? Math.round(cur.dataUrl.length * 0.75 / 1024) : 0;
      preview.innerHTML = `
        <img class="ls-role-single" src="${cur.dataUrl}" />
        <div class="ls-role-meta">
          <span class="name">${escHtml(cur.name)}</span>
          <span style="opacity:0.5"> · ~${sizeKB}KB</span>
        </div>`;
    } else {
      preview.innerHTML = `
        <div class="ls-role-multi-preview">
          ${selected.map((r, i) => `
            <div class="ls-role-multi-item" title="${escHtml(r.name)}">
              <img src="${r.dataUrl}" />
              <div class="ls-role-multi-num">${i + 1}</div>
              <div class="ls-role-multi-name">${escHtml(r.name)}</div>
            </div>
          `).join('')}
        </div>
        <div class="ls-role-meta" style="margin-top:6px;">
          <span class="name">已选 ${selN} 张</span>
          <span style="opacity:0.5"> · 点上传一次性全部附加</span>
        </div>`;
    }

    if (btnUpload) {
      btnUpload.disabled = selN === 0;
      btnUpload.textContent = selN === 0 ? '📤 上传选中' : `📤 上传选中(${selN} 张)`;
    }
    if (btnDelete) {
      btnDelete.disabled = selN === 0;
      btnDelete.title = selN > 1 ? `删除选中的 ${selN} 张` : '删除当前选中';
    }

    if (!S.roleImages.length) {
      grid.innerHTML = `<div class="ls-role-empty-grid">角色库为空<br>导入后可在此选中(支持多选)</div>`;
    } else {
      const orderMap = new Map();
      S.roleSelectedIds.forEach((id, i) => orderMap.set(id, i + 1));
      grid.innerHTML = S.roleImages.map(r => {
        const sel = orderMap.has(r.id) ? 'selected' : '';
        const num = orderMap.get(r.id);
        const numBadge = (sel && S.roleSelectedIds.length > 1)
          ? `<div class="ls-role-thumb-num">${num}</div>` : '';
        return `<div class="ls-role-thumb ${sel}" data-id="${r.id}" title="${escHtml(r.name)}">
          <img src="${r.dataUrl}" loading="lazy" />
          ${numBadge}
          <div class="ls-role-thumb-name">${escHtml(r.name)}</div>
        </div>`;
      }).join('');
      grid.querySelectorAll('.ls-role-thumb').forEach(el => {
        el.onclick = () => {
          const id = el.dataset.id;
          const idx = S.roleSelectedIds.indexOf(id);
          if (idx >= 0) S.roleSelectedIds.splice(idx, 1);
          else          S.roleSelectedIds.push(id);
          save();
          renderRoleImage();
        };
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   ★ v6.0.1 PROJECT 模块
  // ═══════════════════════════════════════════════════════════════════════
  function bindProjectEvents(panel) {
    const scriptEl = panel.querySelector('#ls-proj-script');
    const fileEl   = panel.querySelector('#ls-proj-file');
    const styleSel = panel.querySelector('#ls-proj-style-select');
    const extraEl  = panel.querySelector('#ls-proj-extra');

    // 剧本输入(防抖重算)
    let typingTimer = null;
    scriptEl.addEventListener('input', () => {
      S.projectScript = scriptEl.value;
      save();
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        recomputeProjectMatches();
        renderProjectAll();
      }, 280);
    });

    // 上传 TXT
    panel.querySelector('#ls-btn-proj-load').onclick = () => {
      fileEl.value = '';
      fileEl.click();
    };
    fileEl.onchange = async () => {
      const f = fileEl.files && fileEl.files[0];
      if (!f) return;
      try {
        const txt = await readFileAsText(f);
        S.projectScript = txt || '';
        S.projectScriptFileName = f.name || 'script.txt';   // ★ 新增
        scriptEl.value = S.projectScript;
        save();
        recomputeProjectMatches();
        renderProjectAll();
        updateAttachFilenameLabel();                         // ★ 新增
        showToast(`✓ 已读取 ${f.name}(${(f.size/1024).toFixed(1)}KB)`);
        addLog(`📥 项目剧本已加载:${f.name}`, 'ok');
      } catch (e) {
        showToast('读取失败');
        addLog(`✗ 读取剧本失败:${e.message}`, 'err');
      }
      fileEl.value = '';
    };

    // 粘贴
    panel.querySelector('#ls-btn-proj-paste').onclick = async () => {
      try {
        const txt = await navigator.clipboard.readText();
        if (!txt) { showToast('剪贴板是空的'); return; }
        S.projectScript = txt;
        S.projectScriptFileName = S.projectScriptFileName || 'pasted_script.txt';  // ★ 新增
        scriptEl.value = txt;
        save();
        recomputeProjectMatches();
        renderProjectAll();
        updateAttachFilenameLabel();                         // ★ 新增
        showToast(`✓ 已粘贴 ${txt.length} 字`);
      } catch (e) {
        showToast('剪贴板读取失败,可能没有授权');
      }
    };

    // 清空剧本
    panel.querySelector('#ls-btn-proj-clear').onclick = () => {
      if (!S.projectScript) { showToast('剧本已是空的'); return; }
      if (!confirm('清空当前剧本和提取结果?')) return;
      S.projectScript = '';
      S.projectScriptFileName = '';                          // ★ 新增
      scriptEl.value = '';
      projectExtractedNames = [];
      S.projectMatchedIds = [];
      save();
      renderProjectAll();
      updateAttachFilenameLabel();                           // ★ 新增
      showToast('已清空');
    };

    // 重新匹配
    panel.querySelector('#ls-btn-proj-rematch').onclick = () => {
      recomputeProjectMatches();
      renderProjectAll();
      showToast(`✓ 重新匹配,命中 ${S.projectMatchedIds.length} 张`);
    };

    // 全选命中
    panel.querySelector('#ls-btn-proj-sel-all-hit').onclick = () => {
      const allMatched = new Set();
      projectExtractedNames.forEach(n => n.matchedRoleIds.forEach(id => allMatched.add(id)));
      S.projectMatchedIds = [...allMatched];
      save();
      renderProjectMatchedGrid();
      renderProjectStats();
    };

    // 全不选
    panel.querySelector('#ls-btn-proj-sel-none').onclick = () => {
      S.projectMatchedIds = [];
      save();
      renderProjectMatchedGrid();
      renderProjectStats();
    };

    // 风格选择
    styleSel.onchange = () => {
      S.projectStylePromptId = styleSel.value;
      save();
      renderProjectStylePreview();
      // 切换风格后,刷新删除按钮的可用状态
      const cur = getStyleById(S.projectStylePromptId);
      const btnDel = document.getElementById('ls-btn-style-del');
      if (btnDel) btnDel.disabled = !cur || cur.builtin;
    };

    // 额外提示词
    extraEl.addEventListener('input', () => {
      S.projectExtraPrompt = extraEl.value;
      save();
    });

    // 一键应用
    panel.querySelector('#ls-btn-proj-apply').onclick = () => applyProject();

    // ★ v6.0.1 自定义风格:编辑 / 新建 / 保存 / 取消 / 删除
    const editor   = panel.querySelector('#ls-proj-style-editor');
    const labelEl  = panel.querySelector('#ls-proj-style-label');
    const textEl   = panel.querySelector('#ls-proj-style-text');

    const openEditor = (mode) => {
      // mode: 'edit' | 'new'
      editor.style.display = 'block';
      editor.dataset.mode = mode;
      delete editor.dataset.editId;
      if (mode === 'edit') {
        const cur = getStyleById(S.projectStylePromptId);
        if (!cur) {
          showToast('没有选中可编辑的风格');
          editor.style.display = 'none';
          return;
        }
        if (cur.builtin) {
          // 内置不让原地改 → 自动转为「另存为新自定义」
          editor.dataset.mode = 'new';
          labelEl.value = cur.label + ' (副本)';
          textEl.value = cur.text;
          showToast('内置风格不可改,已转为「另存为新风格」');
        } else {
          editor.dataset.editId = cur.id;
          labelEl.value = cur.label;
          textEl.value = cur.text;
        }
      } else {
        labelEl.value = '';
        textEl.value = '';
      }
      labelEl.focus();
    };
    const closeEditor = () => {
      editor.style.display = 'none';
      delete editor.dataset.editId;
      delete editor.dataset.mode;
      labelEl.value = '';
      textEl.value = '';
    };

    panel.querySelector('#ls-btn-style-edit').onclick   = () => openEditor('edit');
    panel.querySelector('#ls-btn-style-new').onclick    = () => openEditor('new');
    panel.querySelector('#ls-btn-style-cancel').onclick = closeEditor;

    panel.querySelector('#ls-btn-style-save').onclick = () => {
      const label = labelEl.value.trim();
      const text  = textEl.value.trim();
      if (!label || !text) { showToast('名称和正文都不能为空'); return; }
      const mode = editor.dataset.mode || 'new';
      if (mode === 'edit' && editor.dataset.editId) {
        const idx = S.projectStyles.findIndex(s => s.id === editor.dataset.editId);
        if (idx >= 0) {
          S.projectStyles[idx] = { ...S.projectStyles[idx], label, text };
          save();
          showToast(`✓ 已更新「${label}」`);
        }
      } else {
        const id = 'pstyle_' + Date.now();
        S.projectStyles.push({ id, label, text });
        S.projectStylePromptId = id;
        save();
        showToast(`✓ 已新建「${label}」并选中`);
      }
      closeEditor();
      renderProjectStyleSelect();
      renderProjectStylePreview();
    };

    panel.querySelector('#ls-btn-style-del').onclick = () => {
      const cur = getStyleById(S.projectStylePromptId);
      if (!cur || cur.builtin) { showToast('内置风格不可删'); return; }
      if (!confirm(`确认删除自定义风格「${cur.label}」?`)) return;
      S.projectStyles = S.projectStyles.filter(s => s.id !== cur.id);
      S.projectStylePromptId = 'img_09'; // 回退到默认
      save();
      renderProjectStyleSelect();
      renderProjectStylePreview();
      showToast('已删除');
    };

    // ★ v6.0.2 TXT 附件开关
    const attachChk = panel.querySelector('#ls-proj-attach-script');
    if (attachChk) {
      attachChk.onchange = e => {
        S.projectAttachScript = e.target.checked;
        save();
      };
    }
    updateAttachFilenameLabel();

    // ═══ ★ v6.1.0 配置导入/导出 ═══
    const cfgFileInput = panel.querySelector('#ls-cfg-file');

    panel.querySelector('#ls-btn-cfg-export').onclick = () => {
      exportConfig(true);
    };
    panel.querySelector('#ls-btn-cfg-export-light').onclick = () => {
      exportConfig(false);
    };
    panel.querySelector('#ls-btn-cfg-import').onclick = () => {
      cfgFileInput.value = '';
      cfgFileInput.click();
    };
    cfgFileInput.onchange = async () => {
      const f = cfgFileInput.files && cfgFileInput.files[0];
      if (!f) return;
      try {
        const txt = await readFileAsText(f);
        const data = JSON.parse(txt);
        importConfig(data);
      } catch (e) {
        showToast('✗ 导入失败:文件格式错误');
        addLog(`✗ 配置导入失败:${e.message}`, 'err');
      }
      cfgFileInput.value = '';
    };
    panel.querySelector('#ls-btn-cfg-reset').onclick = () => {
      if (!confirm('⚠ 危险操作\n\n这会清空所有配置,包括:\n· 全部角色图(' + S.roleImages.length + ' 张)\n· 自定义风格(' + S.projectStyles.length + ' 个)\n· 自定义提示词(' + S.promptCustoms.length + ' 个)\n· 收藏 / 项目剧本 / 设置\n\n确定要重置吗?(此操作不可恢复)')) return;
      if (!confirm('再次确认:真的要重置全部?')) return;
      GM_setValue(STORE_KEY, {});
      showToast('✓ 已重置,刷新页面生效');
      addLog('· 配置已重置,请 F5 刷新', 'info');
      setTimeout(() => location.reload(), 1500);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   ★ v6.1.0 配置导入/导出
  // ═══════════════════════════════════════════════════════════════════════
  function exportConfig(includeRoleImages) {
    const exportData = {
      _meta: {
        app: '乔大仙·全能助手',
        version: '6.1.0',
        exportedAt: new Date().toISOString(),
        includeRoleImages: !!includeRoleImages,
      },
      // 提示词模块
      promptFavorites: S.promptFavorites || [],
      promptCustoms:   S.promptCustoms   || [],
      promptInsertMode: S.promptInsertMode,
      promptCategory:   S.promptCategory,

      // 图片模块设置
      shotPrefix:    S.shotPrefix,
      shotIndex:     S.shotIndex,
      autoWatch:     S.autoWatch,
      uploadPrompt:  S.uploadPrompt,

      // 角色库(可选)
      roleImages:       includeRoleImages ? (S.roleImages || []) : [],
      roleSelectedIds:  includeRoleImages ? (S.roleSelectedIds || []) : [],

      // 项目模块
      projectScript:        S.projectScript || '',
      projectStylePromptId: S.projectStylePromptId,
      projectExtraPrompt:   S.projectExtraPrompt || '',
      projectStyles:        S.projectStyles || [],
      projectAttachScript:  S.projectAttachScript,
      projectScriptFileName:S.projectScriptFileName || '',

      // UI 设置
      activeTab: S.activeTab,
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // 文件名包含日期、是否含图、大小
    const date = new Date().toISOString().slice(0, 10);
    const tag = includeRoleImages ? 'full' : 'light';
    const sizeKB = (blob.size / 1024).toFixed(0);
    const fname = `qiaodaxian_config_${tag}_${date}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    const cnt = (S.roleImages || []).length;
    const tip = includeRoleImages
      ? `✓ 已导出完整配置(${sizeKB}KB,含 ${cnt} 张角色图)`
      : `✓ 已导出轻量配置(${sizeKB}KB,不含角色图)`;
    showToast(tip);
    addLog(`📤 导出 ${fname} (${sizeKB}KB)`, 'ok');
  }

  function importConfig(data) {
    if (!data || typeof data !== 'object') {
      showToast('✗ 配置文件无效');
      return;
    }
    if (!data._meta || data._meta.app !== '乔大仙·全能助手') {
      if (!confirm('⚠ 这个文件不像是乔大仙助手的配置导出文件。\n\n仍然尝试导入吗?(可能会失败)')) return;
    }

    // 统计变化
    const beforeRoles    = (S.roleImages || []).length;
    const beforeStyles   = (S.projectStyles || []).length;
    const beforePrompts  = (S.promptCustoms || []).length;
    const beforeFavs     = (S.promptFavorites || []).length;

    // 合并策略:数组按 id 合并,标量直接覆盖
    const mergeArrayById = (oldArr, newArr) => {
      if (!Array.isArray(newArr)) return oldArr;
      if (!Array.isArray(oldArr)) oldArr = [];
      const map = new Map();
      oldArr.forEach(item => item && item.id && map.set(item.id, item));
      newArr.forEach(item => item && item.id && map.set(item.id, item)); // 新覆盖旧
      return [...map.values()];
    };
    const mergeArrayUnique = (oldArr, newArr) => {
      if (!Array.isArray(newArr)) return oldArr || [];
      const set = new Set([...(oldArr || []), ...newArr]);
      return [...set];
    };

    // 提示词
    if (data.promptCustoms) {
      S.promptCustoms = mergeArrayById(S.promptCustoms, data.promptCustoms);
    }
    if (data.promptFavorites) {
      S.promptFavorites = mergeArrayUnique(S.promptFavorites, data.promptFavorites);
    }
    if (typeof data.promptInsertMode === 'string') S.promptInsertMode = data.promptInsertMode;
    if (typeof data.promptCategory === 'string')   S.promptCategory = data.promptCategory;

    // 图片设置
    if (typeof data.shotPrefix === 'string')   S.shotPrefix   = data.shotPrefix;
    if (typeof data.shotIndex === 'number')    S.shotIndex    = data.shotIndex;
    if (typeof data.autoWatch === 'boolean')   S.autoWatch    = data.autoWatch;
    if (typeof data.uploadPrompt === 'string') S.uploadPrompt = data.uploadPrompt;

    // 角色库(若导出时未带角色图,这里就是空数组,不会清掉旧的)
    if (Array.isArray(data.roleImages) && data.roleImages.length > 0) {
      S.roleImages = mergeArrayById(S.roleImages, data.roleImages);
    }
    if (Array.isArray(data.roleSelectedIds) && data.roleSelectedIds.length > 0) {
      // 校验 id 真实存在
      S.roleSelectedIds = data.roleSelectedIds.filter(id =>
        S.roleImages.some(r => r.id === id)
      );
    }

    // 项目
    if (typeof data.projectScript === 'string')         S.projectScript         = data.projectScript;
    if (typeof data.projectStylePromptId === 'string')  S.projectStylePromptId  = data.projectStylePromptId;
    if (typeof data.projectExtraPrompt === 'string')    S.projectExtraPrompt    = data.projectExtraPrompt;
    if (typeof data.projectAttachScript === 'boolean')  S.projectAttachScript   = data.projectAttachScript;
    if (typeof data.projectScriptFileName === 'string') S.projectScriptFileName = data.projectScriptFileName;
    if (Array.isArray(data.projectStyles)) {
      S.projectStyles = mergeArrayById(S.projectStyles, data.projectStyles);
    }

    // UI
    if (typeof data.activeTab === 'string') S.activeTab = data.activeTab;

    // 持久化 + 重新渲染所有面板
    try { save(); }
    catch (e) {
      showToast('✗ 持久化失败:数据可能过大');
      addLog(`✗ 持久化失败:${e.message}`, 'err');
      return;
    }

    const afterRoles   = (S.roleImages || []).length;
    const afterStyles  = (S.projectStyles || []).length;
    const afterPrompts = (S.promptCustoms || []).length;
    const afterFavs    = (S.promptFavorites || []).length;

    const summary = [
      `角色图 ${beforeRoles} → ${afterRoles}`,
      `自定义风格 ${beforeStyles} → ${afterStyles}`,
      `自定义提示词 ${beforePrompts} → ${afterPrompts}`,
      `收藏 ${beforeFavs} → ${afterFavs}`,
    ].join(' | ');

    addLog(`📥 配置导入完成:${summary}`, 'ok');
    showToast(`✓ 导入完成,3秒后刷新…`);

    // 全部刷新
    renderPromptList();
    renderRoleImage();
    recomputeProjectMatches();
    renderProjectAll();
    updateAttachFilenameLabel();

    // 同步页面输入框的值
    setTimeout(() => {
      const scriptEl = document.getElementById('ls-proj-script');
      if (scriptEl) scriptEl.value = S.projectScript || '';
      const extraEl = document.getElementById('ls-proj-extra');
      if (extraEl) extraEl.value = S.projectExtraPrompt || '';
      const prefixEl = document.getElementById('ls-input-prefix');
      if (prefixEl) prefixEl.value = S.shotPrefix || '';
      const indexEl = document.getElementById('ls-input-index');
      if (indexEl) indexEl.value = S.shotIndex || 1;
      const upPromptEl = document.getElementById('ls-upload-prompt');
      if (upPromptEl) upPromptEl.value = S.uploadPrompt || '';
    }, 100);
  }

  // ★ v6.0.2 显示当前会被附加的 TXT 文件名
  function updateAttachFilenameLabel() {
    const lab = document.getElementById('ls-proj-attach-filename');
    if (!lab) return;
    if (S.projectScript && S.projectScriptFileName) {
      lab.textContent = `· ${S.projectScriptFileName}`;
    } else if (S.projectScript) {
      lab.textContent = `· script.txt`;
    } else {
      lab.textContent = '';
    }
  }

  function renderProjectAll() {
    renderProjectStats();
    renderProjectNames();
    renderProjectMatchedGrid();
    renderProjectStyleSelect();
    renderProjectStylePreview();
  }

  function renderProjectStats() {
    const cl = document.getElementById('ls-proj-charlen');
    const nc = document.getElementById('ls-proj-namecount');
    const hc = document.getElementById('ls-proj-hitcount');
    const hcSub = document.getElementById('ls-proj-hit-count');
    if (cl) cl.textContent = (S.projectScript || '').length;
    if (nc) nc.textContent = projectExtractedNames.length;
    if (hc) hc.textContent = S.projectMatchedIds.length;
    if (hcSub) hcSub.textContent = `(${S.projectMatchedIds.length})`;
  }

  function renderProjectNames() {
    const wrap = document.getElementById('ls-proj-names');
    if (!wrap) return;
    if (!projectExtractedNames.length) {
      wrap.innerHTML = `<div style="color:var(--p-muted);font-size:10.5px;padding:10px 4px;line-height:1.6;">
        ${S.projectScript ? '没识别到角色名(剧本可能太短或没有典型人名结构)' : '上传或粘贴剧本后,人名会自动出现在这里'}
      </div>`;
      return;
    }
    wrap.innerHTML = projectExtractedNames.map(n => {
      const matched = n.matchedRoleIds.length > 0;
      const cls = matched ? 'matched' : 'unmatched';
      const icon = matched ? '✓' : '○';
      return `<span class="ls-proj-name-chip ${cls}" data-name="${escHtml(n.name)}" title="出现 ${n.count} 次,匹配到 ${n.matchedRoleIds.length} 张图">
        <span class="chip-icon">${icon}</span>
        <span>${escHtml(n.name)}</span>
        <span class="chip-count">×${n.count}</span>
      </span>`;
    }).join('');
    wrap.querySelectorAll('.ls-proj-name-chip').forEach(el => {
      el.onclick = () => {
        const name = el.dataset.name;
        navigator.clipboard.writeText(name).then(
          () => showToast(`✓ 已复制「${name}」`),
          () => showToast('复制失败')
        );
      };
    });
  }

  function renderProjectMatchedGrid() {
    const grid = document.getElementById('ls-proj-matched-grid');
    if (!grid) return;
    if (!S.roleImages.length) {
      grid.innerHTML = `<div class="ls-role-empty-grid" style="grid-column:1/-1;">角色库还是空的<br>去「角色库」tab 先导入图片</div>`;
      return;
    }
    const allMatched = new Set();
    projectExtractedNames.forEach(n => n.matchedRoleIds.forEach(id => allMatched.add(id)));
    S.projectMatchedIds.forEach(id => allMatched.add(id));
    const showIds = [...allMatched];

    if (!showIds.length) {
      grid.innerHTML = `<div class="ls-role-empty-grid" style="grid-column:1/-1;">还没匹配到任何角色图<br><span style="font-size:9.5px;opacity:0.7;">提示:角色库的文件名要包含人名,比如 <code>张三.png</code> 或 <code>01_张三_背面.png</code></span></div>`;
      return;
    }

    grid.innerHTML = showIds.map(id => {
      const r = S.roleImages.find(x => x.id === id);
      if (!r) return '';
      const sel = S.projectMatchedIds.includes(id);
      return `<div class="ls-proj-mthumb ${sel ? 'selected' : ''}" data-id="${id}" title="${escHtml(r.name)}">
        <img src="${r.dataUrl}" loading="lazy" />
        <div class="ls-proj-mthumb-name">${escHtml(r.name)}</div>
      </div>`;
    }).join('');

    grid.querySelectorAll('.ls-proj-mthumb').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.id;
        const idx = S.projectMatchedIds.indexOf(id);
        if (idx >= 0) S.projectMatchedIds.splice(idx, 1);
        else          S.projectMatchedIds.push(id);
        save();
        renderProjectMatchedGrid();
        renderProjectStats();
      };
    });
  }

  // ★ v6.0.1 渲染下拉选项
  function renderProjectStyleSelect() {
    const sel = document.getElementById('ls-proj-style-select');
    const btnDel = document.getElementById('ls-btn-style-del');
    if (!sel) return;
    const all = getAllStyles();
    // 校正:如果当前选中的 id 不存在了,回退到 img_09
    if (!all.find(s => s.id === S.projectStylePromptId)) {
      S.projectStylePromptId = 'img_09';
      save();
    }
    const builtinOpts = all.filter(s => s.builtin).map(s =>
      `<option value="${s.id}" ${S.projectStylePromptId === s.id ? 'selected' : ''}>${escHtml(s.label)}</option>`
    ).join('');
    const customOpts = all.filter(s => !s.builtin).map(s =>
      `<option value="${s.id}" ${S.projectStylePromptId === s.id ? 'selected' : ''}>★ ${escHtml(s.label)}</option>`
    ).join('');
    sel.innerHTML = `
      <optgroup label="── 内置 ──">${builtinOpts}</optgroup>
      ${customOpts ? `<optgroup label="── 自定义 ──">${customOpts}</optgroup>` : ''}
    `;
    // 删除按钮只对自定义风格可用
    const cur = getStyleById(S.projectStylePromptId);
    if (btnDel) btnDel.disabled = !cur || cur.builtin;
  }

  function renderProjectStylePreview() {
    const box = document.getElementById('ls-proj-style-preview');
    if (!box) return;
    const p = getStyleById(S.projectStylePromptId);
    if (!p) { box.textContent = '(未选择)'; return; }
    box.textContent = p.text;
  }

  // 拼装最终提示词:风格 + 项目额外
  function buildProjectFinalPrompt() {
    const style = getStyleById(S.projectStylePromptId);
    const styleText = style ? style.text : '';
    const extra = (S.projectExtraPrompt || '').trim();
    return [styleText, extra].filter(Boolean).join('\n\n');
  }

  async function applyProject() {
    const ids = S.projectMatchedIds.slice();
    const finalPrompt = buildProjectFinalPrompt();
    const willAttachScript = !!(S.projectAttachScript && S.projectScript && S.projectScript.trim());

    if (!ids.length && !finalPrompt && !willAttachScript) {
      showToast('既没勾选角色图、也没提示词、也没 TXT,无可应用');
      return;
    }

    addLog(`🚀 项目应用 → 角色图 ${ids.length} 张 / 提示词 ${finalPrompt.length} 字 / TXT ${willAttachScript ? '附加' : '不附加'}`, 'info');

    // 1) 准备所有要附加的文件:角色图 + (可选)TXT 剧本
    const files = [];
    try {
      for (const id of ids) {
        const r = S.roleImages.find(x => x.id === id);
        if (!r) continue;
        const blob = await (await fetch(r.dataUrl)).blob();
        files.push(new File([blob], r.name, { type: r.type || blob.type }));
      }
    } catch (e) {
      addLog(`✗ 角色图准备异常:${e.message}`, 'err');
      showToast('角色图准备出错');
      return;
    }

    if (willAttachScript) {
      try {
        const fname = (S.projectScriptFileName && S.projectScriptFileName.trim()) || 'script.txt';
        // 加 BOM,避免 GPT 端读 UTF-8 中文 TXT 偶发乱码
        const blob = new Blob(['\uFEFF' + S.projectScript], { type: 'text/plain;charset=utf-8' });
        files.push(new File([blob], fname, { type: 'text/plain' }));
        addLog(`📎 已准备 TXT 附件:${fname}(${(S.projectScript.length)} 字)`, 'info');
      } catch (e) {
        addLog(`✗ TXT 附件准备失败:${e.message}`, 'err');
      }
    }

    // 2) 一次性附加所有文件
    if (files.length) {
      const ok = await injectFiles(files);
      if (ok) {
        addLog(`✓ ${files.length} 个文件已附加(图${ids.length} + 文本${willAttachScript ? 1 : 0})`, 'ok');
        await waitForFilePreview(6000);
      } else {
        addLog(`✗ 文件附加失败,请先点 ChatGPT 输入框再重试`, 'err');
        showToast('附加失败,请先聚焦输入框');
        return;
      }
    }

    // 3) 写入提示词(强制 replace)
    if (finalPrompt) {
      const prevMode = S.promptInsertMode;
      S.promptInsertMode = 'replace';
      await insertPromptIntoEditor(finalPrompt);
      S.promptInsertMode = prevMode;
      save();
    }

    showToast(`✓ 已就绪:${ids.length} 图${willAttachScript ? ' + TXT' : ''} + 提示词,检查后手动发送`);
    addLog(`✓ 项目已应用,等你手动点发送`, 'ok');
  }

  // ─── 图片识别 / 下载 / 上传队列 ────────────────────────────────────
  function classifyImage(img) {
    const src = img.src || img.getAttribute('src') || '';
    if (!src || src.startsWith('data:') || src.length < 10) return null;
    const gptDomains = ['oaidalleapiprodscus.blob.core.windows.net', 'files.oaiusercontent.com', 'oaistatics.com'];
    if (gptDomains.some(d => src.includes(d))) return 'gpt';
    let el = img;
    for (let i = 0; i < 12; i++) {
      el = el.parentElement; if (!el) break;
      const role = el.getAttribute('data-message-author-role');
      if (role === 'assistant') return 'gpt';
      if (role === 'user') return 'upload';
      const cls = el.className || '';
      if (cls.includes('agent') || cls.includes('assistant') || cls.includes('bot-message')) return 'gpt';
      if (cls.includes('user-message') || cls.includes('human')) return 'upload';
    }
    if (img.naturalWidth > 256 && src.includes('openai')) return 'gpt';
    return null;
  }

  function processImage(img) {
    const src = img.src;
    if (!src || imageRegistry.some(r => r.url === src)) return false;
    const type = classifyImage(img);
    if (!type) return false;
    const entry = { url: src, type, el: img, downloaded: S.downloadedUrls.includes(src) };
    imageRegistry.push(entry);
    img.classList.add(type === 'gpt' ? 'ls-gpt-ring' : 'ls-upload-ring');
    return true;
  }

  function fullScan() {
    addLog('· 开始全量扫描…', 'info');
    const imgs = document.querySelectorAll('img');
    let added = 0;
    imgs.forEach(img => processImage(img) && added++);
    updateImageStats(); renderImageGrid();
    addLog(`· 扫描完成,新增 ${added} 张`, added > 0 ? 'ok' : '');
    showToast(`扫描完成:发现 ${imageRegistry.length} 张图`);
  }

  function startWatcher() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(mutations => {
      let changed = false;
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          const imgs = node.tagName === 'IMG' ? [node] : Array.from(node.querySelectorAll('img'));
          imgs.forEach(img => {
            if (img.complete) { processImage(img) && (changed = true); }
            else { img.addEventListener('load', () => {
              if (processImage(img)) { updateImageStats(); renderImageGrid(); }
            }, { once: true }); }
          });
        });
      });
      if (changed) { updateImageStats(); renderImageGrid(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    addLog('· 自动监听已启动', 'ok');
  }

  async function downloadImages(mode) {
    const targets = mode === 'gpt'
      ? imageRegistry.filter(r => r.type === 'gpt' && !r.downloaded)
      : imageRegistry.filter(r => !r.downloaded);
    if (!targets.length) { showToast(mode === 'gpt' ? '没有新的 GPT 图片可下载' : '没有新图可下载'); return; }
    const progressWrap = document.getElementById('ls-progress-wrap');
    const progressBar  = document.getElementById('ls-progress-bar');
    progressWrap.classList.add('visible');
    let idx = S.shotIndex, done = 0;
    for (const entry of targets) {
      const paddedNum = String(idx).padStart(2, '0');
      const filename = `${paddedNum}_${S.shotPrefix}_${idx}.png`;
      addLog(`↓ 下载: ${filename}`, 'info');
      try {
        await downloadOne(entry.url, filename);
        entry.downloaded = true;
        S.downloadedUrls.push(entry.url);
        addLog(`✓ ${filename}`, 'ok'); idx++; done++;
      } catch (e) {
        addLog(`✗ 下载失败: ${entry.url.slice(-30)}`, 'err');
      }
      progressBar.style.width = Math.round((done / targets.length) * 100) + '%';
      renderImageGrid();
      await sleep(200);
    }
    S.shotIndex = idx;
    document.getElementById('ls-input-index').value = idx;
    save();
    progressWrap.classList.remove('visible'); progressBar.style.width = '0%';
    showToast(`✓ 下载完成:${done} 张`);
    addLog(`✓ 全部完成,共 ${done} 张`, 'ok');
    updateImageStats();
  }
  function downloadOne(url, name) {
    return new Promise((resolve, reject) => {
      GM_download({ url, name, onerror: reject, onload: resolve, saveAs: false });
    });
  }

  function sortImageFiles(files) {
    return files.slice().sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  }
  function readDirRecursive(dirEntry) {
    return new Promise(resolve => {
      const results = [];
      const reader = dirEntry.createReader();
      function readBatch() {
        reader.readEntries(entries => {
          if (!entries.length) return resolve(results);
          const ps = entries.map(entry => {
            if (entry.isFile) return new Promise(res => entry.file(f => {
              if (f.type.startsWith('image/')) results.push(f); res();
            }));
            else if (entry.isDirectory) return readDirRecursive(entry).then(fs => results.push(...fs));
            return Promise.resolve();
          });
          Promise.all(ps).then(readBatch);
        });
      }
      readBatch();
    });
  }
  function enqueueFiles(files) {
    const sorted = sortImageFiles(files);
    for (const f of sorted) uploadQueue.push({ file: f, status: 'pending' });
    renderQueueList(); updateQueueUI();
    addLog(`· 加入队列 ${sorted.length} 张`, 'info');
    showToast(`已加入 ${sorted.length} 张到队列`);
  }
  function renderQueueList() {
    const list = document.getElementById('ls-queue-list');
    if (!list) return;
    if (!uploadQueue.length) { list.style.display = 'none'; list.innerHTML = ''; return; }
    list.style.display = 'block';
    const ICON = { active:'⬆', sending:'📨', waiting:'⏳', done:'✓', error:'✗', pending:'·' };
    list.innerHTML = uploadQueue.map((item, i) => {
      const sizeKB = (item.file.size / 1024).toFixed(0);
      const del = item.status === 'pending' ? `<button class="ls-qitem-del" data-i="${i}">✕</button>` : '';
      return `<div class="ls-qitem ${item.status}">
        <span class="ls-qitem-icon">${ICON[item.status] || '·'}</span>
        <span class="ls-qitem-name">${escHtml(item.file.name)}</span>
        <span class="ls-qitem-size">${sizeKB}K</span>
        ${del}
      </div>`;
    }).join('');
    list.querySelectorAll('.ls-qitem-del').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.i);
        if (uploadQueue[idx]?.status === 'pending') {
          uploadQueue.splice(idx, 1);
          renderQueueList(); updateQueueUI();
        }
      };
    });
    const activeEl = list.querySelector('.ls-qitem.active, .ls-qitem.sending, .ls-qitem.waiting');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }
  function updateQueueUI() {
    const controls = document.getElementById('ls-queue-controls');
    const btnStart = document.getElementById('ls-btn-upload-now');
    const btnStop  = document.getElementById('ls-btn-upload-stop');
    if (!controls) return;
    controls.style.display = uploadQueue.length ? 'flex' : 'none';
    if (btnStart) {
      const hasPending = uploadQueue.some(i => i.status === 'pending');
      btnStart.disabled = uploadRunning || !hasPending;
      btnStart.textContent = uploadRunning ? '⬆ 运行中…' : '▶ 开始上传';
    }
    if (btnStop) btnStop.disabled = !uploadRunning;
  }

  function isGptBusy() {
    return !!(document.querySelector('[data-testid="stop-button"]')
          || document.querySelector('button[aria-label="Stop generating"]')
          || document.querySelector('button[aria-label="停止生成"]')
          || document.querySelector('button[aria-label*="Stop streaming"]')
          || document.querySelector('button[aria-label*="停止"]'));
  }
  function waitForGptStopped(timeout = 60000) {
    return new Promise(resolve => {
      if (!isGptBusy()) return resolve(true);
      const obs = new MutationObserver(() => {
        if (!isGptBusy()) { obs.disconnect(); clearTimeout(timer); resolve(true); }
      });
      obs.observe(document.body, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['data-testid', 'aria-label', 'disabled', 'aria-disabled']
      });
      const timer = setTimeout(() => { obs.disconnect(); resolve(false); }, timeout);
    });
  }

  async function runUploadQueue() {
    const next = uploadQueue.find(i => i.status === 'pending');
    if (!next || uploadStopped) {
      uploadRunning = false;
      updateQueueUI();
      if (!uploadStopped && !uploadQueue.find(i => i.status === 'pending')) {
        showToast('✓ 全部图片已上传并发送');
        addLog('✓ 队列全部完成', 'ok');
      }
      return;
    }
    uploadRunning = true;

    if (isGptBusy()) {
      addLog(`⏸ GPT 仍在工作,等空闲再开始 ${next.file.name}`, 'info');
      next.status = 'waiting'; renderQueueList(); updateQueueUI();
      const idle = await waitForGptStopped(300000);
      if (!idle) {
        addLog(`⚠ GPT 5 分钟未停,跳过此张`, 'err');
        next.status = 'error'; renderQueueList();
        await sleep(2000); runUploadQueue(); return;
      }
      addLog(`✓ GPT 已空闲`, 'ok'); await sleep(800);
    }

    next.status = 'active'; renderQueueList(); updateQueueUI();
    addLog(`↑ [1/5] 注入文件:${next.file.name}`, 'info');

    const ok = await injectFile(next.file);
    if (!ok) {
      next.status = 'error';
      addLog(`✗ 文件注入失败:${next.file.name}`, 'err');
      renderQueueList(); await sleep(1500); runUploadQueue(); return;
    }

    addLog(`⌛ [2/5] 等待文件预览…`, 'info'); renderQueueList();
    const previewed = await waitForFilePreview(8000);
    addLog(previewed ? `✓ [2/5] 文件预览已出现` : `⚠ 未检测到预览,继续`,
           previewed ? 'ok' : 'err');

    const prompt = S.uploadPrompt || '高清修复 人脸修复,细节修复 16比9';
    addLog(`✏ [3/5] 写入提示词:${prompt}`, 'info');
    await typePromptIntoEditor(prompt);
    await sleep(400);

    addLog(`📨 [4/5] 等待发送按钮…`, 'info');
    next.status = 'sending'; renderQueueList();
    const sent = await clickSendButton(30000);
    if (!sent) {
      next.status = 'error';
      addLog(`✗ 30s 内未找到可用发送按钮,跳过`, 'err');
      renderQueueList();
      if (isGptBusy()) {
        addLog(`⌛ 等 GPT 停下…`, 'info');
        await waitForGptStopped(180000);
      }
      await sleep(2000); runUploadQueue(); return;
    }
    addLog(`✓ [4/5] 已点击发送`, 'ok');

    const initialMarker = countImageCreatedMarkers();
    addLog(`⌛ [5/5] 等生图(当前「图片已创建」=${initialMarker})`, 'info');
    next.status = 'waiting'; renderQueueList();

    const markerOk = await waitForImageCreated(initialMarker, 240000);
    if (markerOk) addLog(`✓ 第 ${initialMarker + 1} 张「图片已创建」出现`, 'ok');
    else          addLog(`⚠ 240s 未检测到,继续等停止按钮`, 'err');

    if (isGptBusy()) {
      addLog(`⌛ 等待 GPT 完全停止…`, 'info');
      const stopped = await waitForGptStopped(120000);
      addLog(stopped ? `✓ GPT 已完全停止` : `⚠ stop 按钮 120s 未消失`,
             stopped ? 'ok' : 'err');
    }

    next.status = 'done';
    addLog(`✓ 完成:${next.file.name}`, 'ok');
    renderQueueList();
    await sleep(2500); runUploadQueue();
  }

  async function injectFile(file) { return injectFiles([file]); }

  async function injectFiles(files) {
    if (!files || !files.length) return false;
    let input = findFileInput();
    if (input) {
      const ok = doInjectMulti(input, files);
      if (ok) return true;
    }
    const attachBtn = findAttachButton();
    if (attachBtn) {
      attachBtn.click(); await sleep(500);
      input = await waitForElement(
        'input[type="file"]:not(#ls-file-input):not(#ls-folder-input):not(#ls-role-input):not(#ls-proj-file)', 3000
      );
      if (input) {
        const ok = doInjectMulti(input, files);
        if (ok) return true;
      }
    }
    const editArea = findEditArea();
    if (editArea) {
      try {
        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));
        const ev = new ClipboardEvent('paste', { bubbles:true, cancelable:true, clipboardData:dt });
        editArea.focus(); editArea.dispatchEvent(ev);
        await sleep(500);
        if (document.querySelector('[data-testid*="file-preview"], .file-preview, [class*="attachment"], [class*="upload"]')) return true;
      } catch(e){}
    }
    return false;
  }

  function findFileInput() {
    const chatInput = document.querySelector('#upload-files');
    if (chatInput && chatInput.type === 'file') return chatInput;
    // ★ v6.0.2:先找通用 input(可同时收图+文档),再退到只接受 image 的
    return document.querySelector('input[type="file"][multiple]:not(#ls-file-input):not(#ls-folder-input):not(#ls-role-input):not(#ls-proj-file)')
        || document.querySelector('input[type="file"]:not([accept]):not(#ls-file-input):not(#ls-folder-input):not(#ls-role-input):not(#ls-proj-file)')
        || document.querySelector('input[type="file"][accept*="image"]:not(#ls-file-input):not(#ls-folder-input):not(#ls-role-input):not(#ls-proj-file)')
        || document.querySelector('input[type="file"]:not(#ls-file-input):not(#ls-folder-input):not(#ls-role-input):not(#ls-proj-file)');
  }

  function doInjectMulti(input, files) {
    try {
      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      try { input.files = dt.files; }
      catch { Object.defineProperty(input, 'files', { value: dt.files, configurable:true, writable:true }); }
      input.dispatchEvent(new Event('change', { bubbles:true }));
      input.dispatchEvent(new Event('input',  { bubbles:true }));
      return true;
    } catch (e) { addLog(`✗ doInjectMulti 报错: ${e.message}`, 'err'); return false; }
  }

  function waitForFilePreview(timeout = 8000) {
    return new Promise(resolve => {
      const sels = [
        '[data-testid*="file-preview"]', '[data-testid*="attachment"]',
        '.file-preview', '[class*="attachment"]', '[class*="filePreview"]',
        '[class*="upload-preview"]', 'div[class*="ImageAttachment"]',
        'div[class*="image-attachment"]', 'img[alt*="uploaded"]'
      ];
      const check = () => sels.some(s => document.querySelector(s));
      if (check()) return resolve(true);
      const obs = new MutationObserver(() => {
        if (check()) { obs.disconnect(); clearTimeout(t); resolve(true); }
      });
      obs.observe(document.body, { childList:true, subtree:true, attributes:true });
      const t = setTimeout(() => { obs.disconnect(); resolve(false); }, timeout);
    });
  }
  async function typePromptIntoEditor(text) {
    const area = findEditArea();
    if (!area) { addLog('⚠ 找不到输入框,跳过提示词', 'err'); return; }
    area.focus();
    if (area.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(area, text);
      area.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      area.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      const inserted = document.execCommand('insertText', false, text);
      if (!inserted || !area.textContent.trim()) {
        area.textContent = text;
        area.dispatchEvent(new InputEvent('input', { bubbles:true, data:text }));
      }
    }
    addLog(`✓ 提示词写入完成`, 'ok');
  }
  async function clickSendButton(timeout = 30000) {
    const start = Date.now(); await sleep(400);
    while (Date.now() - start < timeout && !uploadStopped) {
      if (isGptBusy()) { await sleep(500); continue; }
      const btn = findSendButton();
      if (btn && !btn.disabled) { btn.click(); return true; }
      await sleep(500);
    }
    return false;
  }
  function findSendButton() {
    return document.querySelector('[data-testid="send-button"]')
        || document.querySelector('button[aria-label="Send message"]')
        || document.querySelector('button[aria-label="发送消息"]')
        || document.querySelector('button[aria-label="Send"]')
        || document.querySelector('button[data-testid="fruitjuice-send-button"]')
        || [...document.querySelectorAll('button')].find(b => {
             const svg = b.querySelector('svg'); if (!svg) return false;
             const path = svg.querySelector('path'); if (!path) return false;
             const d = path.getAttribute('d') || '';
             return (d.includes('M12 2') || d.includes('M2 12') || d.includes('M22 2')) && !b.disabled;
           });
  }
  function countImageCreatedMarkers() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let count = 0, node;
    while (node = walker.nextNode()) {
      const text = node.nodeValue || ''; if (!text) continue;
      const matches = text.match(/图片已创建/g);
      if (matches) count += matches.length;
    }
    return count;
  }
  function waitForImageCreated(initialCount, timeout = 240000) {
    return new Promise(resolve => {
      const target = initialCount + 1;
      const check = () => countImageCreatedMarkers() >= target;
      if (check()) return resolve(true);
      let lastSeen = initialCount;
      const obs = new MutationObserver(() => {
        const cur = countImageCreatedMarkers();
        if (cur > lastSeen) {
          lastSeen = cur;
          if (cur < target) addLog(`🖼 中间标记 ${cur},目标 ${target}`, 'info');
        }
        if (cur >= target) { obs.disconnect(); clearTimeout(t); resolve(true); }
      });
      obs.observe(document.body, { childList:true, subtree:true, characterData:true });
      const t = setTimeout(() => { obs.disconnect(); resolve(false); }, timeout);
    });
  }
  function findAttachButton() {
    return document.querySelector('[aria-label="Attach files"]')
        || document.querySelector('[aria-label="附加文件"]')
        || document.querySelector('[data-testid="attach-file-button"]')
        || document.querySelector('[data-testid="composer-attachment-button"]')
        || document.querySelector('button[aria-label*="Attach"]')
        || document.querySelector('button[aria-label*="Upload"]')
        || document.querySelector('button[aria-label*="上传"]')
        || document.querySelector('button[aria-label*="attach"]');
  }
  function findEditArea() {
    return document.querySelector('#prompt-textarea')
        || document.querySelector('textarea[data-id="root"]')
        || document.querySelector('[contenteditable="true"][data-testid]')
        || document.querySelector('[contenteditable="true"]')
        || document.querySelector('textarea');
  }
  function waitForElement(selector, timeout = 2000) {
    return new Promise(resolve => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const f = document.querySelector(selector);
        if (f) { obs.disconnect(); resolve(f); }
      });
      obs.observe(document.body, { childList:true, subtree:true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
    });
  }

  function renderImageGrid() {
    const grid = document.getElementById('ls-grid');
    if (!grid) return;
    if (!imageRegistry.length) {
      grid.innerHTML = '<div class="ls-empty-grid">暂无识别到的图片<br>点击「重新扫描」开始</div>';
      return;
    }
    grid.innerHTML = imageRegistry.map((entry, i) => {
      const cls = ['ls-thumb', entry.type, entry.downloaded ? 'downloaded' : ''].filter(Boolean).join(' ');
      const label = entry.type === 'gpt' ? '🤖GPT' : '📤上传';
      return `<div class="${cls}" data-index="${i}" title="${escHtml(entry.url)}">
        <img src="${entry.url}" loading="lazy" onerror="this.style.opacity=0.2" />
        <div class="ls-thumb-badge ${entry.type}">${label}</div>
      </div>`;
    }).join('');
    grid.querySelectorAll('.ls-thumb').forEach(thumb => {
      thumb.onclick = () => {
        const idx = parseInt(thumb.dataset.index);
        const entry = imageRegistry[idx];
        if (entry?.el) {
          entry.el.scrollIntoView({ behavior:'smooth', block:'center' });
          entry.el.style.transition = 'outline 0.3s';
          entry.el.style.outline = '3px solid #c9a45a';
          setTimeout(() => { entry.el.style.outline = ''; }, 1500);
        }
      };
    });
  }
  function updateImageStats() {
    const total  = imageRegistry.length;
    const gpt    = imageRegistry.filter(r => r.type === 'gpt').length;
    const upload = imageRegistry.filter(r => r.type === 'upload').length;
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setEl('ls-count-total', total);
    setEl('ls-count-gpt', gpt);
    setEl('ls-count-upload', upload);
    updateRoundBadge();
  }
  function addLog(msg, type = '') {
    const log = document.getElementById('ls-log');
    if (!log) return;
    const span = document.createElement('span');
    span.className = `ls-log-line ${type}`;
    span.textContent = msg;
    log.appendChild(span);
    while (log.children.length > 60) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   Toast
  // ═══════════════════════════════════════════════════════════════════════
  let toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById('ls-toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //   Hotkey
  // ═══════════════════════════════════════════════════════════════════════
  document.addEventListener('keydown', e => {
    if (!e.altKey || !e.shiftKey) return;
    if (e.code === 'KeyQ') { e.preventDefault(); setMinimized(!S.minimized); }
    else if (e.code === 'KeyP') {
      e.preventDefault();
      if (S.minimized) setMinimized(false);
      switchTab('prompt');
    }
    else if (e.code === 'KeyL') {
      e.preventDefault();
      if (S.minimized) setMinimized(false);
      switchTab('image');
    }
    else if (e.code === 'KeyR') {
      e.preventDefault();
      if (S.minimized) setMinimized(false);
      switchTab('role');
    }
    else if (e.code === 'KeyJ') {
      e.preventDefault();
      if (S.minimized) setMinimized(false);
      switchTab('project');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //   SPA-SAFE INIT
  // ═══════════════════════════════════════════════════════════════════════
  let watchdogTimer = null;
  let bodyObserver = null;
  let pollTimer = null;

  function isPanelAlive() {
    return !!(document.getElementById('ls-panel') && document.getElementById('ls-round'));
  }

  function destroyPanel() {
    ['ls-panel', 'ls-round', 'ls-toast'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
    if (observer) { try { observer.disconnect(); } catch(e){} observer = null; }
  }

  function safeInit() {
    if (isPanelAlive()) return;
    destroyPanel();
    try {
      imageRegistry = [];
      buildPanel();
      // 项目模块首次匹配
      recomputeProjectMatches();
      renderProjectAll();
      if (S.autoWatch) startWatcher();
      setTimeout(() => { try { fullScan(); } catch(e){} }, 1500);
    } catch (e) {
      console.warn('[乔大仙] 注入失败,2s 后重试:', e);
      setTimeout(safeInit, 2000);
    }
  }

  function hookHistory() {
    const fire = () => window.dispatchEvent(new Event('lsRouteChange'));
    ['pushState', 'replaceState'].forEach(m => {
      const orig = history[m];
      history[m] = function() {
        const r = orig.apply(this, arguments);
        fire();
        return r;
      };
    });
    window.addEventListener('popstate', fire);
    window.addEventListener('lsRouteChange', () => {
      setTimeout(safeInit, 300);
      setTimeout(safeInit, 1200);
    });
  }

  function hookBodyWatchdog() {
    const start = () => {
      if (!document.body) { setTimeout(start, 200); return; }
      if (bodyObserver) bodyObserver.disconnect();
      bodyObserver = new MutationObserver(() => {
        if (!isPanelAlive()) safeInit();
      });
      bodyObserver.observe(document.body, { childList: true });
    };
    start();

    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
      if (!isPanelAlive()) safeInit();
    }, 4000);
  }

  function bootstrap() {
    safeInit();
    hookHistory();
    hookBodyWatchdog();

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!isPanelAlive() || !S.autoWatch) return;
      const newImgs = document.querySelectorAll('img:not(.ls-gpt-ring):not(.ls-upload-ring)');
      let changed = false;
      newImgs.forEach(img => img.complete && processImage(img) && (changed = true));
      if (changed) { updateImageStats(); renderImageGrid(); }
    }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    setTimeout(bootstrap, 600);
  }

})();