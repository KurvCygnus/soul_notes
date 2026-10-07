/// <reference types="vite/client" />

//* VITE_ 环境变量的显式声明: 不补接口增强则消费端落在 vite/client 的 `[key: string]: any` 索引签名上 (any 逃逸).
interface ImportMetaEnv
{
    //* 安卓 assets 壳的构建期注入点 (Gradle -PapiBase 直通); 纯 Web 部署缺席, 消费端以空串兜底.
    readonly VITE_API_BASE?: string
}

interface ImportMeta
{
    readonly env: ImportMetaEnv
}
