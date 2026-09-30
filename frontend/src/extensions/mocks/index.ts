//* Mock 扩展注册处: 仅开发构建打包 (registry 按 import.meta.env.PROD 剔除), Release 零残留.
//* 决策引用勘正 (T3 评审): 打包剔除是 "D10 衍生约定: Mock 仅开发构建" — D10 本体是页面必填的编译期契约,
//* 二者是派生关系而非同一决策, 注释不得再以 D10 直指剔除行为.
import { MockAgendaPage, MockTimetableOverview, MockTimetablePage } from './timetable'
import type { IExtensionPoint } from '../types'

export const mockExtensions: IExtensionPoint[] = [
    {
        id: 'mock-timetable',
        name: '课表',
        icon: 'calendar',
        mock: true,  //* mock 标注即归置契约: registry 测试断言全部 Mock 条目必带此标志.
        page: MockTimetablePage,
        overview: MockTimetableOverview,  //* 总览由课表 Mock 独占注册 (校园风味聚合, D9 首注册语义).
    },
    {
        id: 'mock-agenda',
        name: '日程',
        icon: 'calendar',
        mock: true,
        page: MockAgendaPage,  //* 仅页面: 不注册 overview/homeChips, 保持总览单提供者.
    },
]
