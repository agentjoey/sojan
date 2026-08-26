export const zh = {
  common: {
    back: "返回",
    loading: "加载中…",
    cancel: "取消",
    confirm: "确认",
    casting: "排 盘 中",
    save: "保存",
    delete: "删除",
    edit: "编辑",
    close: "关闭",
    sending: "发送中…",
    signingIn: "登录中…",
    brand: "照见",
    listSeparator: "、",
    // TodayCard（今日卡）是卷首/运势页共用组件的 UI chrome 文案（终审必修 5：
    // 此前写死在组件里，绕过了全站 i18n），放在 common 而非 home/calendar
    // 任一页命名空间下——两处消费方地位相同，不存在归属关系。
    todayCard: {
      label: "今 日",
      expand: "展开今日日签 →",
      // WindBell 图上的字固定烧死是「谨」，与当日实际判词（{verdict}）可能不同，
      // alt 文案必须诚实地说清楚这一点（见 WindBell.tsx 顶部注释）。
      //
      // ⚠️ 复审 Minor M2：此前措辞是「今日判词另见右栏：{verdict}」——首页没有
      // 「右栏」这个东西（首页插进去的是空态记号「—」，读屏会念出「今日判词
      // 另见右栏：—」，自相矛盾）；运势页也只是勉强对，判词其实在卡片**下方**
      // 的强调块里，不在「右栏」。理想修法是拆两条 key（首页用纯描述图片的
      // 版本，运势页用带 {verdict} 且措辞为「见下方」的版本），但首页那条已被
      // `app/__tests__/page.test.tsx`「无档案态用空态记号「—」」这条终审必修 8
      // 的既有断言钉死为必须含 {verdict} 插值结果——按本波全局约束该文件既有
      // 断言不许改。所以退一步：去掉「另见右栏」这个虚假的方位声称，改成不含
      // 方位信息、对两个消费方都成立的措辞，`{verdict}` 插值继续保留（首页仍
      // 传空态记号「—」，运势页传真实判词）。
      bellAlt: "风铃图，幡面刻「谨」字（固定字样，非当日判词——当日判词为「{verdict}」）",
    },
  },
  nav: {
    home: "首页",
    calendar: "运势",
    chart: "命盘",
    spirit: "问事",
    fengshui: "风水",
    dream: "解梦",
    profiles: "我的",
    account: "账号",
    start: "起盘",
    menu: "菜单",
    close: "关闭",
  },
  account: {
    title: "账号",
    entry: "账号与登录",
    kicker: "账 户",
    sectionSubscription: "订 阅",
    sectionBinding: "绑 定",
    sectionLogin: "登 录",
    sectionData: "数 据",
    saveYourSojan: "保存你的照见",
    signIn: "登录",
    signOut: "登出",
    email: "邮箱",
    emailAddress: "邮箱地址",
    loginWithTelegram: "用 Telegram 登录",
    sendMagicLink: "发送登录链接",
    linked: "已绑定",
    notLinked: "未绑定",
    mergedProfiles: "已合并 {count} 个本地档案到你的账号",
    tierMember: "会员",
    tierFree: "免费",
    expiresOn: "到期 {date}",
    usageThisMonth: "本月已用 {used}/{free}",
    loggedInViaTelegram: "已通过 Telegram 登录",
    linkEmailLabel: "绑定邮箱",
    linkEmailSent: "确认邮件已发送，请查收后点击链接完成绑定",
    linkEmailInUse: "该邮箱已被占用",
    linkEmailConflict: "本账号已绑定其他已验证邮箱，如需更换请先联系支持",
    bindConfirmTitle: "确认绑定邮箱",
    bindConfirmBody: "你正要把 {email} 绑定到当前这个照见账号。如果这不是你发起的，请点取消——绑定后这个邮箱将成为该账号的登录与找回方式。",
    bindConfirmAction: "确认绑定",
    bindCancel: "取消",
    bindExpired: "这个绑定链接已失效或已被使用，请回到账号页重新发起。",
    bindFailed: "绑定失败，请稍后重试。",
    linkFailed: "绑定失败，请重试",
    tgAlreadyLinked: "该 Telegram 已绑定其他账号，请改用登录并合并",
    invalidEmail: "请输入有效的邮箱地址",
    anonymousDescription:
      "当前为本地匿名模式，登录后可在不同设备间同步你的档案与解读记录。",
    magicLinkSent: "已发送，请查收邮件中的登录链接",
    dangerZone: "危险区 · 注销账号",
    deleteWarning:
      "此操作不可逆。注销后，你的账号、所有档案、对话记录、会员权益与 Telegram 绑定将被永久删除，无法恢复。",
    deleteAccount: "注销账号",
    confirmDelete: "确认注销",
    deleting: "注销中…",
    deleteFailed: "注销失败，请重试",
    deleteAcknowledge:
      "我明白此操作不可逆，将永久删除我的所有档案与数据",
    language: "语言",
  },
  paywall: {
    title: "升级会员，解锁无限",
    upgrade: "升级会员",
    monthly: "$9/月",
    yearly: "$99/年",
    comingSoon: "支付即将开放，敬请期待",
    telegramIAP: "Telegram 内购即将开放",
    // 曾有 subtitleLimit（"已达免费版上限，升级会员后可继续保存"）。它唯一的调用点是
    // /fengshui/dwellings 的新增居所位，那道闸门在最终评审 I2 里被撤除（第 2 套居所
    // 不被任何东西读取），随之删除——留着一条没有调用点的文案，只会让引用它的反向
    // 断言变成恒真（见 components/Paywall.tsx 的说明）。
    subtitleQuota: "免费额度已用尽，升级会员后可继续对话。",
    // reason="member"（Task 10 修复单 Important 5）：用在「这块内容本身属于会员功能」
    // 的位置（如 /fengshui 的宅八方），那里既没有"档案"也没有要"保存"的东西——
    // 复用 subtitleLimit 的「已达上限」措辞是错的，不只是不精确。
    subtitleMember: "这块内容属于会员功能，升级后即可解锁。",
  },
  home: {
    heroTitle1: "你的命盘，",
    kickerHero: "卷 首",
    kickerToc: "目 录",
    footerBrand: "照 见 · 东 方 命 理",
    ctaSecondary: "先看看流日 →",
    heroTitle2: "是一面镜子",
    heroSubtitle: "紫微 · 八字 × 深层心理。观照自身，而非预言吉凶。",
    ctaButton: "为我起盘 · 即时生成",
    entries: {
      calendar: { title: "今日运势", sub: "流日 · 每日一推" },
      annual: { title: "本年时序", sub: "流年 · 大限四化" },
      chart: { title: "我的命盘", sub: "命理 + 心理解读" },
      spirit: { title: "本命之灵", sub: "守护灵与年度指引" },
      reading: { title: "起盘建档", sub: "出生信息即时排盘" },
      dream: { title: "解梦", sub: "梦的映照 · 心理解读" },
    },
    // 卷首今日卡（TodayCard）的通用（非按档案个性化）文案——首页匿名可见，
    // 具体到人的判词/润色句/元数据仍在 /calendar 由 LLM 按档案生成。
    today: {
      weekday: "周{day}",
      // 终审必修 8：无档案态不算真判词（展示层零推算），但同一张卡的
      // meta 已经在说「你还没建档」，若在这里塞一个像判词的字（旧值「观」），
      // 用户会误以为它是设计包四档（吉/顺/平/谨）之外的第五档。改成明确的
      // 空态记号——不是「观」的翻译，是「此处无值」的通用符号。
      emptyVerdict: "—",
      polish: "先观其时，未必急于行动——完整流日解读，一点即达。",
      meta: "登记出生信息，解锁你的专属流日解读",
    },
    cards: {
      east: {
        label: "命理结构",
        text: "紫微十二宫、八字四柱、生年四化——开源引擎精确计算，可审计、不臆造。",
      },
      west: {
        label: "心理映照",
        text: "太阳月亮上升、土星课题、内在张力——以荣格原型读命盘为心象。",
      },
      resonance: {
        label: "共振",
        text: "仅在内在世界轴等高置信处东西互证，给出克制、非决定论的成长之言。",
      },
    },
    disclaimer:
      "本产品为传统文化与心理学的自我探索工具，所有解读仅供自我反思，不构成医疗、法律、财务或心理诊断建议。",
    tg: {
      tagline: "你的命盘，是一面镜子",
      entries: {
        calendar: { title: "今日运势", subtitle: "流日 · 每日一推" },
        chart: { title: "我的命盘", subtitle: "命理 + 心理解读" },
        spirit: { title: "本命之灵", subtitle: "守护灵与年度指引" },
        fengshui: { title: "居家风水", subtitle: "本命方位 · 居所实盘" },
        dream: { title: "解梦", subtitle: "梦的映照 · 心理解读" },
        reading: { title: "起盘建档", subtitle: "出生信息即时排盘" },
        profiles: { title: "我的档案", subtitle: "已保存的命盘档案" },
      },
    },
  },
  reading: {
    heroTitle1: "告诉我，",
    kicker: "起 盘",
    heroTitle2: "你何时来到这世间。",
    intro:
      "我们即时推算你的八字、紫微斗数与西方本命盘。出生地用于校正真太阳时；若缺出生时辰，将略去心理（西方）层，仅呈现命理。",
    disclaimerStart: "出生信息属敏感个人信息。命盘",
    disclaimerHighlight: "存于你的私人档案",
    disclaimerEnd:
      "（匿名、按设备隔离，仅你可见），可随时在「档案」中删除。仅供自我观照。",
    nicknameLabel: "称 呼",
    nicknamePlaceholder: "希望我如何称呼你？",
    birthDateLabel: "出生日期",
    lunarCheckbox: "我填的是农历",
    birthTimeLabel: "出生时辰",
    timeKnownHint: "时辰决定时柱与上升星座，越准越好。",
    timeUnknownLabel: "不知道出生时辰",
    timeUnknownHint: "将略去西方星盘与心理映照层，仅呈现命理。",
    birthplaceLabel: "出生地（用于校正真太阳时与西方星盘）",
    birthplacePlaceholder: "输入城市/地名，如 上海、北京朝阳、New York",
    search: "查找",
    searching: "查找…",
    reselect: "重选",
    geoCoords: "经 {lon}° · 纬 {lat}° · {timezone}",
    noBirthplaceHint: "不填出生地则不做真太阳时校正、并略去西方星盘。",
    genderLabel: "性 别",
    male: "乾 · 男",
    female: "坤 · 女",
    castMyChart: "为我起盘",
    submit: "排我的盘",
    submitting: "正在为你起盘…",
    saveProfileError: "建档失败：{message}",
    saveChartError: "存档失败：{message}",
  },
  chart: {
    title: "命盘",
    kicker: "命 盘",
    wuxingTitle: "五 行",
    loadingProfile: "正在读取档案…",
    noProfile: "尚无命盘档案。",
    goCast: "去起盘",
    share: "分享 →",
    shareText: "照见 · 东方命理 × 西方心理的自我观照",
    todayFortune: "今日运势 →",

    baziTitle: "八字四柱",
    ziweiTitle: "紫微斗数 · 十二宫",
    westernTitle: "西方本命盘 · 心理映照",
    westernMissing: "缺出生时辰或出生地，已略去西方星盘与心理层。补全后可解锁。",
    readingTitle: "三段式解读",

    castForMe: "为我照见",
    generating: "正在为你照见…",
    generateReading: "为我照见 · 生成完整解读",
    generateReadingSub: "命盘已就位 —— 用命理结构 + 深层心理，读出你的核心自我、成长课题与一句此刻之言",

    timelineTitle: "当下时序",
    timelineDisclaimer: "时序按当前年份（{year}）的大限/流年推算，随年更新；仅供自我观照，非事件预测。",

    pageDisclaimer: "命盘为建档时一次推算并冻结。所有解读仅供自我观照，不构成医疗、法律、财务或心理诊断建议。",

    tabMingli: "命理",
    tabPsych: "心理",
    tabResonance: "共振",
    kickerMingli: "命理结构",
    kickerPsych: "心理映照",
    kickerResonance: "共振",
    readingSaved: "此解读已为你保存，下次回到命盘可直接查看。",
    resonanceNote: "※ 仅在「内在世界」高置信锚点谈共振，非硬等价。",
    resonanceExampleChip: "福德宫 ↔ 月亮 · 土星",

    pillarYear: "年",
    pillarMonth: "月",
    pillarDay: "日",
    pillarHour: "时",
    dayMaster: "日主",
    strength: "旺衰",
    fiveElements: "五行",
    strengthStrong: "身强",
    strengthWeak: "身弱",
    strengthBalanced: "中和",
    strengthUnknown: "—",
    dayMasterLine: "{stem}{element}日主",
    strengthTagStrong: "【偏强型】",
    strengthTagWeak: "【偏弱型】",
    strengthTagBalanced: "【中和型】",
    zodiacChip: "属{animal}",
    ageChip: "{age} 岁",

    luckTitle: "大运",
    luckPrev: "前一运",
    luckCurrent: "现行",
    luckNext: "下一运",
    luckRange: "{startAge} 岁起 · {startYear}",
    flowYearTitle: "流年",

    soulPalace: "命宫",
    bodyPalace: "身宫",
    fiveElementBureau: "五行局",
    birthMutagens: "生年四化",
    bodyPalaceSuffix: "身",

    palaceDetailStars: "主星：{stars}",
    palaceDetailEmpty: "本宫无主星，借三方四正（{palaces}）之星：{stars}",
    mutagenLegendTitle: "四化",
    ziweiBoardAria: "紫微命盘十二宫，可选择宫位查看详情",

    radarAria: "五行雷达图",
    missingCaption: "五行缺{elements}，喜用或在此方向",
    weakCaption: "{elements}偏弱，或可于此处着力",

    elementWood: "木",
    elementFire: "火",
    elementEarth: "土",
    elementMetal: "金",
    elementWater: "水",

    natalAria: "西方本命盘",
    houseUnit: "{n}宫",

    selfPortraitTitle: "自我画像 · Self-Portrait",
    selfPortraitSubtitle: "由命盘结构与自我自陈合成的内在侧写",
  },
  calendar: {
    kicker: "流 日",
    dimsTitle: "五 维",
    title: "运势日历",
    loadingProfile: "正在读取档案…",
    noProfileForFortune: "尚无命盘档案，无法生成每日运势。",
    goCast: "去起盘",
    dayMasterLabel: "命主",
    today: "今日",
    calculating: "正在推算当日流日…",
    disclaimer:
      "每日运势为流日命理的启发性参照，非吉凶预言。请结合现实理性判断。",

    decadal: "本限",
    yearly: "流年",
    yearlyJi: "流年化忌",
    thisYearLesson: "今年功课",
    yearlyLu: "化禄",
    favorable: "顺势",
    toTimeline: "本年时序 →",

    scoreLabel: "{grade} · {today}",
    todayVerdict: "今日运势",
    moodLabel: "{today} · {mood}",
    grade: {
      auspicious: "吉",
      smooth: "顺",
      neutral: "平",
      cautious: "谨",
      advance: "宜进取",
      proceed: "可推进",
      steady: "守稳健",
      still: "宜守静",
    },

    yi: "宜",
    ji: "忌",
    favorableToday: "今日喜用",
    interaction: "流日{kind}命{withPillar}支",
    todayYi: "今日宜",
    todayJi: "今日忌",
    auspiciousYi: "趋吉 · 宜",
    cautionJi: "避祸 · 忌",

    almanac: "黄历",
    none: "—",

    dims: {
      career: "事业",
      wealth: "财运",
      love: "感情",
      health: "健康",
      travel: "出行",
    },

    spiritCardLabel: "本命之灵 · 问今日",
    spiritLoading: "本命之灵正在感应今日…",
    talkToSpirit: "与本命之灵详谈 →",

    weekDays: "日,一,二,三,四,五,六",
  },
  spirit: {
    notEnabled: "本命之灵尚未开启。",
    loadingProfile: "正在读取档案…",
    noProfile: "尚无命盘档案。",
    goCast: "去起盘",
    title: "本命之灵",
    subtitle: "从你自己的命盘里走出来的那个声音 —— 陪你照见，而非预言。",
    disclaimer: "本命之灵基于你的冻结命盘对话；所有内容仅供自我观照，非预测、非诊断。",

    // EP-jiao 最终评审 C2+I4：send/writing/emptyPrompt/inputPlaceholder 四键随
    // SpiritPanel 改写而清空——组件现在专职承载掷筊追问，对应文案已改用
    // jiao.followUpSubmit/jiao.reading/jiao.youAsked/jiao.followUpPlaceholder
    // （这几个键此前定义了却无人使用，见 jiao 命名空间那几行的注释）。
    unavailable: "本命之灵暂时无法回应",
    quickPrompts: ["该不该换工作", "这段关系要不要继续", "现在适合搬家吗", "要不要开始这件事"],
    quickPromptsLabel: "想继续问：",
    online: "在线",
    talkAboutPortrait: "和本命之灵聊聊这个",
    portraitNoteTitle: "本命之灵的观察",

    archetypeAlt: "本命之灵 · {archetype}",
    natalSpirit: "本命之灵 · Natal Spirit",

    questionnaireTitle: "自我自陈 · A few questions",
    questionnaireIntro:
      "几道主观自陈题，让本命之灵更懂你的心境与倾向。答案没有对错，只用于深化对话与画像，不参与命盘排算。",
    saving: "保存中…",
    complete: "完成 · 让本命之灵更懂你",
  },
  dream: {
    kicker: "解 梦",
    title: "说说你的梦",
    subtitle: "梦是潜意识的信。灵替你读它——观照，不预言。",
    placeholder: "比如：我梦见自己在一片很清的水面上走……",
    submit: "解这个梦",
    interpreting: "解梦中…",
    errorTooLong: "梦太长了，先讲最清晰的那段（2000 字以内）。",
    noProfile: "尚无命盘档案——先起盘，灵才认得你。",
    notEnabled: "「解梦」尚未开启。",
    needLogin: "解梦需要先确认身份——去账号页登录，或先绑定邮箱。",
    needLoginCta: "去登录",
    castingTitle: "正在为你解梦",
    youSaid: "你说",
    followUpPlaceholder: "还想问点什么？",
    followUpSubmit: "追问",
    historyTitle: "最近的梦",
  },
  jiao: {
    kicker: "掷 筊",
    title: "为一件事问一卦",
    subtitle: "筊象是一面镜子，不是答案——留意你看到它时的第一反应。",
    placeholder: "比如：我该不该接这个 offer？（问一件具体的事）",
    throwCta: "掷筊",
    throwing: "掷筊中…",
    reading: "灵在看这一卦…",
    omenSheng: "圣筊",
    omenXiao: "笑筊",
    omenYin: "阴筊",
    omenShengDesc: "一俯一仰为圣筊，传统释义为「允」。",
    omenXiaoDesc: "两仰为笑筊，传统释义是神明发笑——这个问题问得还不够清楚。",
    omenYinDesc: "两俯为阴筊，传统释义为「不允」。",
    revealContinue: "继续",
    xiaoHint: "笑筊——神明发笑，意思是这个问题还问得不够清楚。把它问得更具体些，再掷一次。",
    xiaoRethrow: "再掷一次",
    throwsLeft: "还可以掷 {n} 次",
    errorTooLong: "问题太长了，说得再具体简短些（500 字以内）。",
    noProfile: "尚无命盘档案——先起盘，灵才认得你。",
    needLogin: "问卦需要先确认身份——去账号页登录，或先绑定邮箱。",
    needLoginCta: "去登录",
    youAsked: "你问",
    followUpPlaceholder: "还想接着问点什么？",
    followUpSubmit: "接着问",
    historyTitle: "最近问过的",
    newThrow: "换一件事问",
    // 危机前置拦截（EP-jiao 最终评审补项，见 lib/jiao-crisis.ts）：命中最窄一层
    // 自伤/医疗急症词表时，不掷筊，直接换成这三个键渲染的求助引导屏。文案克制、
    // 不说教，热线信息只给确知准确、长期稳定的号码（120/110 是中国大陆通用应急
    // 号码；988/Samaritans 是国际广知的心理危机热线），没有把握的号码一律不写。
    crisisTitle: "先别急着掷这一卦",
    crisisBody:
      "这件事听起来比一卦能承住的更重。如果你正被伤害自己的念头困扰，或正身处医疗紧急情况，请现在就联系身边可信任的人，或拨打 120（急救）/ 110（报警）寻求即时帮助；如果暂时安全但仍然难受，可以联系你所在地区的心理援助热线或专业机构。你的安全比任何一卦都重要。",
    crisisBack: "我知道了",
  },
  fengshui: {
    kicker: "境",
    title: "境",
    subtitle: "本命方位 · 人与空间",
    // 以居所为主视觉时的页头文案（评审后续 #4：登记了朝向已知的居所时，
    // 页面主标题与主视觉从「本命八方」倒向「居所的方位」——但只在有居所可看
    // 时才这样倒，没有居所的用户仍看「境」这个通用标题，见 claude 判断记录）。
    dwellingHeroTitle: "居所的方位",
    dwellingHeroSubtitle: "坐{sitting}朝{facing} · {gua}宅",
    dwellingHeroSubtitlePending: "居所信息核对中…",
    expandNarrative: "展开完整解读 →",
    collapseNarrative: "收起 ↑",
    notEnabled: "「境」尚未开启。",
    loadingProfile: "读取档案中…",
    noProfile: "还没有命盘档案，先起一个盘。",
    goCast: "去起盘",
    mingGua: "本命卦",
    group: { east: "东四命", west: "西四命" },
    bestDirection: "生气方",
    tabs: { chart: "盘", remedy: "化解", object: "添置" },
    directionsTitle: "八方吉凶",
    affinityTitle: "宜用色与材",
    remedyTitle: "可做的事",
    // Task 9（EP-fs-15）：宅八方 + 合看 chips。dwellingTitle/personalTitle 分开标注
    // 「本命八方」与「房屋八方」两套独立的八方吉凶，页面上永不混用（同 llm 侧的约束）。
    personalTitle: "本命八方",
    dwellingTitle: "房屋八方",
    cohabitantsTitle: "同住人对照",
    viewAs: "以谁的视角看",
    viewAsSelf: "我",
    sharedGoodNote: "对你和{name}都吉的方位：{directions}",
    conflictsNote: "对你吉、对{name}凶的方位：{directions}",
    noDwelling: "还没登记居所——填一个大门朝向，就能看到这套房子对你的八方吉凶。",
    addDwelling: "登记居所",
    facingUnknownNote: "这个居所的朝向未确定，下面只按你的本命方位给建议。",
    // 复审必修2：居所读取失败 ≠ 确认为空。前者是「暂时不知道」，后者是「还没登记」，
    // 对用户是完全不同的意思——绝不能把一次网络抖动误判成后者，诱导重复登记。
    dwellingsError: "居所读取失败——不代表你还没登记，请重试。",
    retryDwellings: "重试",
    // Task 10 修复单 Critical 1：会员状态「探测失败」≠「确认为非会员」。前者是
    // 「暂时不知道」，此时给付费墙等于在向可能已经拥有该内容的用户推销——尤其
    // BILLING_ENABLED 关闭（默认）时根本不该有任何限制。措辞必须明说这不是判定结果。
    entitlementUnknown: "会员状态暂时确认不了，这块内容先不展示——不代表你没有权限。",
    retryEntitlement: "重新确认",
    // 复审必修3：命卦（东四命/西四命）与宅卦（东四宅/西四宅）是否同组的判语，按
    // matchWithPerson 的字面值（"相配"/"相冲"）取键——与 effortLabel 同一手法。
    // 措辞非决定论：「相冲」不代表这房子不能住，只是把重点放回自己的四吉方。
    matchNote: {
      相配: "你的本命卦与这套宅子同组，整体气场比较合拍。",
      相冲: "你的本命卦与这套宅子不同组，不必因此忧虑——把重点放在你自己的四吉方即可。",
    },
    // 叙述三分节的标题。与上面几个键不同：那些描述确定性区块，这三个描述 LLM 叙述分节，
    // 语义不可互借（见 packages/llm/src/fengshui/prompt.ts 的输出契约）
    narrativeSections: {
      situation: "形势",
      youAndSpace: "境与你",
      actions: "可做的事",
    },
    effortLabel: { 零成本: "零成本", 挪动: "挪动", 添置: "添置", 装修: "装修" },
    evidenceSymbolic: "传统象征",
    evidenceBoth: "传统 + 现代",
    modernLabel: "现代机制",
    traditionalLabel: "传统依据",
    askSojan: "就这条问一卦",
    narrativeFailed: "叙述暂时生成不出来，下面的盘与建议不受影响。",
    narrativeDegraded: "本次叙述中有方位判断被系统纠正，可信度不足，已不展示；下面的盘与建议不受影响。",
    regenerate: "重新生成叙述",
    castingTitle: "正在起你的八方盘",
    filterByDirection: "只看{direction}方",
    filterClear: "清除筛选",
    filterEmpty: "这个方位暂时没有对应的化解。",
    generalRemedies: "不限方位",
    disclaimer: "以上用于自我觉察与居住体验改善，不构成专业建议。",
    object: {
      kicker: "物 件",
      title: "我想添置…",
      subtitle: "说说物件，给你落位建议",
      category: "品类",
      material: "材质",
      shape: "造型",
      intendedDirection: "打算放在",
      unspecified: "不指定",
      submit: "看看放哪儿好",
      elementOf: "物件五行",
      recommended: "推荐方位",
      avoid: "不宜方位",
      rules: "这类物件的讲究",
      fit: "与你的关系",
      intended: "你想放的位置",
      // Task 11（EP-fs-18）强版：命卦吉方与宅卦吉方交集为空时，core 的
      // `adviseObject` 会把原因写进 `dwellingNote`。**正文来自 core，不在这里**——
      // 这里只提供小标题（正文是随命宅组合变化的解释性文字，不是可枚举的 UI 文案，
      // 塞进字典等于把引擎结论抄第二份，改一处必漏另一处）。
      dwellingNoteTitle: "关于这套房子",
      // 有居所、但会员状态没探测出来（网络抖动/冷启动）时的说明。与
      // `fengshui.entitlementUnknown` 语义不同、不可互借：那句说的是「这块内容先不
      // 展示」，而本页无论如何都会给出完整的落位建议，只是没能叠加宅卦那一层。
      dwellingUnknown: "会员状态暂时确认不了，下面先只按你的本命方位给建议——不代表你没有权限。",
    },
    dwelling: {
      kicker: "居 所",
      title: "我的居所",
      add: "添加居所",
      editTitle: "编辑居所",
      nameLabel: "名称",
      namePlaceholder: "家 / 办公室",
      kindLabel: "类型",
      kindHome: "住宅",
      kindOffice: "办公",
      tenancyLabel: "租售",
      tenancyRent: "租住",
      tenancyOwn: "自有",
      facingLabel: "大门朝向",
      facingHint: "站在屋内、面朝大门，你面对的方向。不确定就选「不确定」——我们会只按你的本命方位给建议，不猜。",
      facingUnknown: "不确定",
      save: "保存",
      saving: "保存中…",
      empty: "还没有登记居所。填一个朝向，就能看到这套房子对你的八方吉凶。",
      deleteConfirm: "删除这个居所？相关报告也会一并失效。",
      deleteFailed: "删除失败，请重试",
      membersLabel: "同住人",
      membersHint: "同一套房子对每个人的吉凶不同——加进来可以看对照。",
      // 最终评审 I1：同住人上限此前只存在于服务端。勾满之后必须当场说清楚，
      // 而不是让用户在另一个页面上撞 400。{max} 由 MAX_COHABITANTS 注入，
      // 不写死数字——上限改一处，文案跟着走。
      membersLimitNote: "最多只能选 {max} 位同住人。想换人的话，先取消一位。",
      // 最终评审 I3：合看是会员功能（spec §11），但选择器此前对非会员完全开放，
      // 勾完存下之后什么都不会出现。措辞要说清「现在勾了也没有产出」，
      // 而不只是含糊地提一句会员。
      membersMemberOnly: "同住人对照是会员功能，升级后才能看到这套房子对每个人的吉凶差异。",
    },
  },
  profiles: {
    title: "我的档案",
    kicker: "档 案",
    create: "新建档案",
    addNew: "＋ 新建档案",
    solarPrefix: "阳历",
    loading: "正在读取档案…",
    empty: "尚无档案。建档后命盘一次生成并冻结，不再更改。",
    current: "当前",
    rename: "重命名",
    confirmDelete: "确认删除?",
    nicknameLengthError: "昵称长度应为 1-24 字符",
    renameFailed: "重命名失败",
    privacyNotice:
      "档案存于你的私人空间（匿名、按设备隔离，仅你可见），可随时删除。命盘建档时一次推算并冻结，不再更改。",
  },
} as const;

type DeepStringify<T> = T extends string ? string : { [K in keyof T]: DeepStringify<T[K]> };

export type Messages = DeepStringify<typeof zh>;
