//* 构建产物扩展注册断言 (原 check-prod-mocks, P3 去 mock 转正改造):
//* P3 起注册表不分构建形态 (旧 "import.meta.env.PROD ? [] : mockExtensions" 剔除分支已随 mocks 目录退役),
//* vite build 后扫描 dist/assets/*.js, 必须找到全部真实扩展注册标识 ('timetable'/'exams'/'agenda') —
//! 与旧门 "Mock 不得入 prod" 方向相反的正向断言: 若有人重新引入构建形态门控, 扩展子树会被常量折叠 + 摇树
//! 整体剔除, 字符串字面量随之消失, 本断言即失败退出, 禁止发布 (vitest 跑在 PROD=false, 测试侧测不出该回归,
//! dist 扫描是唯一守卫 — 与旧门同源的理由, 见 registry.ts 注释).
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MARKERS = ['timetable', 'exams', 'agenda']
const assetsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets')

let files
try
{
    files = readdirSync(assetsDir).filter(f => f.endsWith('.js'))
}
catch
{
    console.error(`[check-prod-extensions] 读不到 ${assetsDir}: 请先执行 vite build 再跑本断言.`)
    process.exit(1)
}

if(files.length === 0)
{
    console.error('[check-prod-extensions] dist/assets 下没有 .js 产物, 构建疑似不完整.')
    process.exit(1)
}

const bundle = files.map(f => readFileSync(join(assetsDir, f), 'utf8')).join('\n')
const missing = MARKERS.filter(marker => !bundle.includes(marker))
if(missing.length > 0)
{
    console.error(`[check-prod-extensions] 产物缺扩展注册标识: ${missing.join(', ')} — 扩展子树被剔除 (疑似重新引入 PROD 门控), 禁止发布.`)
    process.exit(1)
}
console.log(`[check-prod-extensions] ${files.length} 个产物文件均含扩展注册标识 (${MARKERS.join('/')}), 通过.`)
