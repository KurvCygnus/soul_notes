//? 协议全文常量: 文案逐句摘录自旧前端 git 历史 `git show main:frontend/src/components/auth/AgreementModal.tsx`
//? (仅文本, 旧组件已随旧应用删除); 句读按项目半角规范归一化 (。 -> .), 措辞未做任何改动.
//* 单一职责: 只存文案与结构, 渲染归 [[LoginSheet]]; 改协议 = 只改本文件.

//region 协议数据结构

export interface IAgreementSection
{
    //* 锚点 id: 供浮层内链接定位 (不导航离开, 同页展开).
    id: string
    heading: string
    //* 普通段落 (按序渲染为 p); 与 points 可并存, paragraphs 在前.
    paragraphs?: readonly string[]
    //* 要点列表 (渲染为 ul/li).
    points?: readonly string[]
}

export interface IAgreement
{
    title: string
    meta: string
    sections: readonly IAgreementSection[]
}

//endregion

export const AGREEMENT: IAgreement = {
    title: 'AI 服务使用协议与免责声明',
    meta: '版本 v1.0 · 生效日期 2026-09-20',
    sections: [
        {
            id: 'agreement-nature',
            heading: '一、服务性质与说明',
            paragraphs: [
                '心灵札记提供 AI 对话、情绪天气分析等功能, 用于日常情绪记录与自我觉察.',
                'AI 功能输出由大语言模型自动生成, 不代表任何个人或机构的专业意见.',
            ],
        },
        {
            id: 'agreement-boundary',
            heading: '二、AI 工具边界(请务必了解)',
            points: [
                'AI 不是心理咨询师、精神科医生或任何持证专业人员, 不提供诊断、治疗、用药建议.',
                'AI 不了解你的真实处境, 输出可能存在不准确、不完整或不恰当之处, 仅供参考.',
                '请勿将 AI 输出作为医疗、用药、法律或其他专业决策的依据.',
            ],
        },
        {
            id: 'agreement-crisis',
            heading: '三、危机情形处理',
            paragraphs: [
                'AI 无法处理危机情形. 如你有自伤、自杀或伤害他人的想法, 或处于任何紧急危险中, 请立即拨打 110(报警)或 120(急救), 或通过"需要帮助"页面使用 24 小时心理援助热线.',
                '请优先联系现实中的家人、朋友或专业机构, 不要依赖 AI 应对危机.',
            ],
        },
        {
            id: 'agreement-privacy',
            heading: '四、隐私与数据',
            points: [
                '为提供服务, 你的账号信息、日记与 AI 对话内容将被存储和处理.',
                '请勿在对话中主动发送身份证号、家庭住址、银行卡号等敏感个人信息.',
                '平台将以合理的技术与管理措施保护数据安全.',
            ],
        },
        {
            id: 'agreement-responsibility',
            heading: '五、用户责任',
            points: [
                '你应自行判断 AI 输出的适用性, 并对采纳后的行为及后果负责.',
                '你不得利用本服务从事违法活动, 或诱导 AI 生成违法违规内容.',
            ],
        },
        {
            id: 'agreement-disclaimer',
            heading: '六、免责声明',
            points: [
                '在法律允许的最大范围内, 平台对因使用或无法使用本服务(含 AI 功能)产生的直接或间接损失不承担责任.',
                '平台不对 AI 输出的准确性、完整性与可用性作任何明示或默示保证.',
            ],
        },
        {
            id: 'agreement-updates',
            heading: '七、协议的更新与接受',
            points: [
                '平台可能修订本协议; 重大修订时将再次提示阅读与同意, 继续使用即视为接受更新后的协议.',
                '不同意本协议将无法登录使用本服务.',
            ],
        },
    ],
}
