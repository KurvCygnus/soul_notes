//* 统一 SVG 图标组件 (评审裁决: UI 禁用 Unicode emoji, 一律 SVG-first).
//* 手写 stroke 路径, currentColor 继承文字色, 尺寸经 props 控制; 全部 aria-hidden —
//* 语义由宿主元素的 aria-label 或可见文本承载, 图标本身不进无障碍树.
import type { ReactElement } from 'react'

export type IconName =
    | 'sun' | 'cloud' | 'rain' | 'thunder' | 'gauge'
    | 'pen' | 'calendar' | 'cloud-sun' | 'mic'
    | 'panel' | 'buoy' | 'menu' | 'phone'

const PATHS: Record<IconName, ReactElement> = {
    sun: (
        <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7" />
        </>
    ),
    cloud: (
        <path d="M7.5 18.5h9.2a4 4 0 0 0 .6-7.96A5.8 5.8 0 0 0 6 12.1a3.4 3.4 0 0 0 1.5 6.4z" />
    ),
    rain: (
        <>
            <path d="M7.5 15.5h9.2a4 4 0 0 0 .6-7.96A5.8 5.8 0 0 0 6 9.1a3.4 3.4 0 0 0 1.5 6.4z" />
            <path d="M8.5 18.5l-1 2.5M12.5 18.5l-1 2.5M16.5 18.5l-1 2.5" />
        </>
    ),
    thunder: (
        <>
            <path d="M7.5 14.5h9.2a4 4 0 0 0 .6-7.96A5.8 5.8 0 0 0 6 8.1a3.4 3.4 0 0 0 1.5 6.4z" />
            <path d="M12.5 13.5l-2.8 4.2h3.4l-2.3 4.3" />
        </>
    ),
    gauge: (
        <>
            <path d="M4.5 15.5a7.5 7.5 0 1 1 15 0" />
            <path d="M12 15.5l3.4-4.2" />
            <circle cx="12" cy="15.5" r="0.9" />
        </>
    ),
    pen: (
        <>
            <path d="M12 20h9" />
            <path d="M16.6 3.6a2.2 2.2 0 0 1 3.1 3.1L7.5 18.9 3.5 20l1.1-4z" />
        </>
    ),
    calendar: (
        <>
            <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
            <path d="M8 3v4M16 3v4M3.5 10.5h17" />
        </>
    ),
    'cloud-sun': (
        <>
            <circle cx="7.5" cy="7.5" r="2.6" />
            <path d="M7.5 2.8v1.4M7.5 10.8v1.4M2.8 7.5h1.4M10.8 7.5h1.4M4.2 4.2l1 1M9.8 9.8l1 1M10.8 4.2l-1 1M5.2 9.8l-1 1" />
            <path d="M11 20h6.4a3.4 3.4 0 0 0 .5-6.77A5 5 0 0 0 8.6 14.7 2.9 2.9 0 0 0 11 20z" />
        </>
    ),
    mic: (
        <>
            <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5" />
        </>
    ),
    panel: (
        <>
            <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
            <path d="M9.5 4.5v15" />
        </>
    ),
    buoy: (
        <>
            <circle cx="12" cy="12" r="8.5" />
            <circle cx="12" cy="12" r="3.5" />
            <path d="M6 6l3.4 3.4M18 6l-3.4 3.4M6 18l3.4-3.4M18 18l-3.4-3.4" />
        </>
    ),
    menu: (
        <path d="M4 7h16M4 12h16M4 17h16" />
    ),
    phone: (
        <path d="M21 16.6v2.6a1.9 1.9 0 0 1-2.1 1.9 18.9 18.9 0 0 1-8.2-2.9 18.6 18.6 0 0 1-5.7-5.7A18.9 18.9 0 0 1 2.1 4.3 1.9 1.9 0 0 1 4 2.2h2.6a1.9 1.9 0 0 1 1.9 1.6c.1.9.3 1.7.6 2.5a1.9 1.9 0 0 1-.4 2L7.5 9.5a15.2 15.2 0 0 0 6.1 6.1l1.2-1.2a1.9 1.9 0 0 1 2-.4c.8.3 1.6.5 2.5.6a1.9 1.9 0 0 1 1.7 2z" />
    ),
}

export interface IIconProps
{
    name: IconName
    size?: number
    className?: string
}

export default function Icon({ name, size = 18, className }: IIconProps): ReactElement
{
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={className}
        >
            {PATHS[name]}
        </svg>
    )
}
