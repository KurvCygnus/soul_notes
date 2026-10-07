import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

//region 前端 bundle 注入 (spec §2): frontend dist → build/generated/frontendAssets → assets
//* 位置说明: 置于 android {} 之前 — Kotlin DSL 顶层 val 不可被先执行的 android 块前向引用.
val frontendDir = rootDir.parentFile.resolve("frontend")
val frontendAssetsDir = layout.buildDirectory.dir("generated/frontendAssets")

//* API 基址 (D4): debug 缺省模拟器环回; release 必须 -PapiBase=<生产地址>, 缺席即失败 —
//* 防止"忘了配地址"的 APK 静默发往 appassets 假域. pnpm build 本身含 tsc --noEmit 门禁 (package.json).
val apiBase = (project.findProperty("apiBase") as String?) ?: "http://10.0.2.2:8080"

val bundleFrontend = tasks.register<Exec>("bundleFrontend") {
    group = "build"
    description = "构建前端 dist 并注入 VITE_API_BASE"
    workingDir(frontendDir)
    environment("VITE_API_BASE", apiBase)
    if(org.gradle.internal.os.OperatingSystem.current().isWindows)
        commandLine("cmd", "/c", "pnpm", "build")
    else
        commandLine("pnpm", "build")
    inputs.dir(frontendDir.resolve("src"))
    inputs.files(frontendDir.resolve("package.json"), frontendDir.resolve("vite.config.ts"))
    //* index.html 是 Vite 变换入口 (直进 dist/APK), tsconfig.json 影响 tsc 门禁与编译结果 —
    //! 二者漏进指纹则改动后 bundleFrontend 仍 UP-TO-DATE, 静默打包陈旧前端 (评审 Important 修复).
    //* frontend 当前无 public/ 目录; 若后续引入静态资源目录, 此处必须同步补 inputs.dir.
    inputs.file(frontendDir.resolve("index.html"))
    inputs.file(frontendDir.resolve("tsconfig.json"))
    //* apiBase 必须参与增量判定 (实测): Exec 的 environment 不进 up-to-date 指纹, 漏加则 debug 构建后
    //* 换 -PapiBase 跑 release 会静默复用旧 dist, 把模拟器地址打进生产包 — 正是 D4 要防的事故形态.
    inputs.property("apiBase", apiBase)
    outputs.dir(frontendDir.resolve("dist"))
}

val syncFrontend = tasks.register<Copy>("syncFrontend") {
    group = "build"
    description = "dist → 生成 assets 目录 (先清防陈旧文件残留)"
    dependsOn(bundleFrontend)
    from(frontendDir.resolve("dist"))
    into(frontendAssetsDir)
    doFirst { delete(frontendAssetsDir) }
    doLast {
        //* 打包前完整性卫兵 (实测缺陷): 目录枚举曾瞬时漏报 dist 的 JS 条目 (IDE 并发活动期, 复现于
        //* Copy 静默产出缺 JS 的 assets — 构建照常报绿, 发布即白屏级残包). 故以 index.html 的实际
        //! 引用为清单逐项断言落盘, 把"静默残包"前置成"响亮失败"; 复现时直接重跑构建即可.
        val root = frontendAssetsDir.get().asFile
        val refs = Regex("""(?:src|href)="(/?assets/[^"]+)"""")
            .findAll(root.resolve("index.html").readText())
            .map { it.groupValues[1].removePrefix("/") }
            .toList()
        val missing = refs.filter { !root.resolve(it).isFile }
        if(missing.isNotEmpty())
            throw GradleException("前端产物不完整: index.html 引用的 $missing 未进入 assets 目录 (疑目录枚举瞬时缺失) — 直接重跑构建")
    }
}

tasks.named("preBuild") { dependsOn(syncFrontend) }

//* release 无 -PapiBase 时快速失败 (D4): 提示信息指明补救命令.
//! 必须按任务图判定而非放 buildTypes.release 配置闭包: DSL 闭包在配置期对一切调用求值 (实测,
//! 放闭包里连 assembleDebug 都会被误杀); taskGraph 只含本次请求的任务, debug 不受影响.
gradle.taskGraph.whenReady {
    if(project.findProperty("apiBase") == null && allTasks.any { it.name.contains("Release") })
        throw GradleException("release 构建必须携带 -PapiBase=<生产后端地址> (D4)")
}
//endregion

android {
    namespace = "dev.kurvcygnus.soulnotes"
    compileSdk = 35

    //* release 签名 (spec §8): 真件 keystore.properties (rootDir, gitignore 覆盖) 存在才注册 release 签名配置 —
    //* 模板见 keystore.properties.example; 真件缺席时 buildTypes.release 回落 debug 签名, 本地试构建可跑,
    //* 分发前必须补真件 (storeFile 相对 app 模块目录解析, "../soulnotes-release.jks" 即 rootDir 下的 jks).
    //! brief 片段的两处编译修正 (实测): (1) android 块内 `java` 标识符被接收者成员遮蔽, 全限定名不可达 —
    //! 改脚本顶部 `import java.util.Properties`; (2) `use(::load)` 的裸成员引用无法绑定 apply 接收者 — 改 lambda 形式.
    val keystoreProps = Properties().apply {
        val f = rootDir.resolve("keystore.properties")
        if(f.exists())
            f.inputStream().use { load(it) }
    }
    signingConfigs {
        if(keystoreProps.isNotEmpty())
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
    }

    //? buildFeatures.buildConfig 必须保持缺省关闭 (曾有临时开启又拆除): 开启即生成 BuildConfig.java,
    //? 令 compileJavaWithJavac 脱离 NO-SOURCE 并强制解析 androidJdkImage (JdkImageTransform → jlink) —
    //? GraalVM JDK 21.0.7 的 jlink 处理 AGP 合成 java.base 必失败 ("Module jdk.internal.vm.ci not
    //? found", 实测定罪; 合成模块描述符本身健康, 系 GraalVM JVMCI 补丁行为), 而 openjdk-26 无法承载
    //? Gradle 8.10.2 daemon, graalvm-ce-25 与目标 class 版本不匹配, 本机无解. debug 门禁已改走
    //? ApplicationInfo.FLAG_DEBUGGABLE (见 MainActivity); 未来需要真正的 Java 源或 BuildConfig 时,
    //? 须先为安卓构建换装非 GraalVM 的 JDK 21 (如 Temurin).
    defaultConfig {
        applicationId = "dev.kurvcygnus.soulnotes"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "2.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if(keystoreProps.isNotEmpty())
                signingConfigs.getByName("release")
            else
                signingConfigs.getByName("debug")  //* 无真件时的回落位 (D4 同款"可本地构建"哲学), 分发前必须补
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets["main"].assets.srcDir(frontendAssetsDir)
}

dependencies {
    //* 返回键路由 (Task 7): OnBackPressedCallback/OnBackPressedDispatcher 在 androidx.activity:activity —
    //* core-ktx/webkit 均不传递携带 (实测 classpath 无此库), brief 注记预授权按需追加.
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
