//* 校园扩展注册处 (P3 去 mock 转正): 三详情页 + 课表总览. id 与后端扩展名严格同名 —
//* /extensions/:id 详情路由与 PUT /api/v1/ext/{name}/notify 开关端点共用该标识, 两处改名必须同步.
import { AgendaPage, ExamsPage, TimetableOverview, TimetablePage } from './pages'
import type { IExtensionPoint } from '../types'

export const campusExtensions: IExtensionPoint[] = [
    {
        id: 'timetable',
        name: '课表',
        icon: 'calendar',
        page: TimetablePage,
        overview: TimetableOverview,  //* 总览由课表独占注册 (校园风味聚合, D9 首注册语义).
    },
    {
        id: 'exams',
        name: '考试',
        icon: 'calendar',
        page: ExamsPage,  //* 仅页面: 不注册 overview/homeChips, 保持总览单提供者.
    },
    {
        id: 'agenda',
        name: '日程',
        icon: 'calendar',
        page: AgendaPage,
    },
]
