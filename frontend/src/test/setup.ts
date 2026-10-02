import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { installMatchMediaStub } from './matchMedia'

//* 缺省恒亮桩: theme.ts 的 system 档会调 matchMedia, jsdom 无此 API — 不装桩则一切挂载设置页的用例崩在 effect 里.
//* 装在 beforeEach 而非模块顶层: 壳级用例 (App.test) 的 afterEach 会 unstubAllGlobals, 逐用例重装才能保证桩常在;
//* 需要翻转语义的用例 (主题模块/设置页) 在用例体内再装可控桩, 后装先赢.
beforeEach(() =>
{
    installMatchMediaStub(false)
})

//* 主题/外观用例会改写 <html data-theme/data-mode>, 全局复位防同文件用例串扰 (跨文件隔离由 runner 保证).
afterEach(() =>
{
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-mode')
})
