//* 构建产物 Mock 剔除断言 (homepage-v2 Task 13, D10 衍生约定: Mock 仅开发构建):
//* vite build 后扫描 dist/assets/*.js, 一旦出现 'mock-timetable' 标识即失败退出 —
//* 该字符串是 Mock 扩展的注册 id (src/extensions/mocks), prod 下 registry 经 import.meta.env.PROD
//* 常量折叠 + 摇树应整体剔除; 断言失效说明剔除链被破坏 (如改为运行期条件), 禁止发布.
//* dev 构建包含 Mock 属预期, 此断言只辖 dist (dev 侧由 registry.test 的 PROD 分支断言覆盖).
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MARKER = 'mock-timetable'
const assetsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets')

let files
try
{
    files = readdirSync(assetsDir).filter(f => f.endsWith('.js'))
}
catch
{
    console.error(`[check-prod-mocks] 读不到 ${assetsDir}: 请先执行 vite build 再跑本断言.`)
    process.exit(1)
}

if(files.length === 0)
{
    console.error('[check-prod-mocks] dist/assets 下没有 .js 产物, 构建疑似不完整.')
    process.exit(1)
}

const offenders = files.filter(f => readFileSync(join(assetsDir, f), 'utf8').includes(MARKER))
if(offenders.length > 0)
{
    console.error(`[check-prod-mocks] 产物含 Mock 残留: ${offenders.join(', ')} — registry 的 PROD 剔除失效, 禁止发布.`)
    process.exit(1)
}
console.log(`[check-prod-mocks] ${files.length} 个产物文件无 Mock 残留, 通过.`)
