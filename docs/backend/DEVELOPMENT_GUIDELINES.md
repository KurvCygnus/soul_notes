# Backend Development Guidelines

## Command Permissions

These are the commands you are allowed to use:

```shell
./gradlew quarkusDev # Build and run command. You have to ask developer every time before you use this command.
```

```shell
./gradlew :test --tests "${target_test_class}" # Build and do unit tests. You can do this without developer's permission.
./gradlew :testNative --tests "${target_native_test_class}" # Build and do native unit tests, same requirement as unit tests'.
```

For other commands which excludes from reading files(reading git diff also counts), only when the developer permits, or asks you to use, then you could use.\
However, **dangerous operations like `rm -rf` is always forbidden, you should refuse to operate even if developer asks you to.**

---

## Develop Guides

### Unit Test

Always write unit tests for a function, or feature that is:

* **complex**
* **edgy**
* **SQL, I/O, reactive related**

Mock Class/DTO is allowed to create in corresponded test package.\
If unit tests are unpassable, ***DO NOT* edit CI or hard-coding to pass it, that's meaningless.**

---

### Javadoc

Write Javadoc with these rules:

1. **When the Javadoc Target is simple, just do not add any Javadoc.**
2. Using `<b>$Text</b>` to highlight important text, `<span style="color: f84b4b">$Text</span>` to stress the important and dangerous/edgey behavior-related text, `<span style="color: 95cc6d">$Text</span>` to stress the important and safe behavior-related text.
3. When writing references, if it is local, **always** use `<u>{@link $Ref $Name(Optional)}</u>` instead of `{@link $Ref $Name(Optional)}`, if it is hyper linked, use `<u><a href="$Link">$PlaceHolder_Text</a></u>`.
4. Use `<i>$Text</i>` for those *useful but not necessary knowledge.*
5. Involve
   ```java
   /**
    * <ul>
    *     <li>$Text1</li>
    *     <li>$Text2</li>
    *     <li>...</li>
    * </ul>
    */
   ```
   to explain a thing when it is complex enough.
6. When there exists a definition that is really complex(e.g. `Intermediate representation`, `Monad`), and not for everyone, leaving a link to wiki instead of explaining it is preferred.
7. Always uses Chinese to write comments and Javadocs.
8. Add `@author` and `@since` when written Javadoc's target is a top-level declaration, like `class`, `interface`, `enum`, etc. You should add yourself as an author on it. e.g. `${author_name} & ${model_name}`.

---

### Reactive Constraints

1. All logics that involves file I/O, synchronous network request, complex computations must be wrapped explicitly in worker thread pools.\
   In Quarkus, using `Uni.createFrom().item(...).runSubscriptionOn(Infrastructure.getDefaultWorkerPool())` or `@Blocking` is required.
2. No stream downgrading: `.await().indefinitely()` and `.asStream()` are banned in `Service` and `Resource`(a.k.a. `Repository`) layers.
3. Keep reactive style: The return value of reactive-related logic methods should be `Unit<T>` or `Multi<T>`.
4. Chain calling style preferred: Using `.map()` and `.flatMap()`, and handle exceptions explicitly(e.g. `onFailure().recoverWithItem()`).
5. Always grant transactional: The operations that related to multi-table editing, should be handled in methods that has `Pananche.withTransaction(() -> {...})` or annotated with `@ReactiveTransactional`, it keeps session alive.
6. DO NOT operate Entity when context is inactive.

---

### SQL

#### Current SQL Structure Design

1. Table `users`:
   * `id`(UUID, **Primary Key**)
   * `user_name`
   * `password_hash`
   * `role`(`STUDENT`/`COUNSELOR`/`ADMIN`)
2. Table `mood_diaries`:
   * `id`(`BigInt`, increment)
   * `user_id`(UUID, **Foreign Key**)
   * `content`(Text, Literal Contents)
   * `audio_url`(`Varchar`)
   * `analysis_result`(`JSONB`, **core data**. Stores structured data(e.g. `{"positive": 0.2, "negative": 0.7, "anxiety": 0.85, "weather": "thunderstorm"}`).)
   * `created_at`(Timestamp)
3. Table `ai_chat_sessions`:
   * `id`(UUID, **Primary Key**)
   * `user_id`(UUID)
   * `messages`(`JSONB`, Stores Session Data: (e.g. `[{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]`))
   * `warning_triggered`(`Boolean`, the flag represents that whether Red Alert Mechanism is enabled)
   * `updated_at`(Timestamp)

#### Standards & Constraints

1. When Table is not created, ask developer before creating it.
2. When creating a table, you should create two files at `${project_root}/sql_scripts`:
   * The first one is named `${table_name}_init.sql`, writing table initialize scripts inside it, with such a header:
     ```sql
     -- * 这是创建表 "${table_name}" 的初始化脚本.
     -- * 请在数据库开启且没有该表的时候使用.
     -- * 如果你的数据库是空白状态, 请去 [[../init_schema.sql]] 初始化.
     ```
     Also, you must use `IF NOT EXISTS` to keep script idempotent.
     After created `${table_name}_init.sql`, you should add it to [init_schema.sql](../../init_schema.sql).
   * The second one is named `${table_name}_mock_data.sql`, writing 4 ~ 5 example data inside it, with such a header:
     ```sql
     -- * 这是表 "${table_name}" 的测试数据加载脚本.
     -- * 请在数据库开启, 且需要简单测试时使用.
     ```
3. **DO NOT perform any DDL changes in code, or ORM with commands like `DROP`, `ALTER`**.
   * Use `WHERE` when performing `UPDATE` or `DELETE`.
   * All core logic mustn't use physical deletion, soft deletion is acceptable.
4. All list entities must use page(`limit`/`page`), find all querying(`findAll()`) is not allowed.
5. Index should be created explicitly for all foreign key columns.
6. For `JSONB` fields(e.g. `analysis_result`), if some of its property is the condition of high frequency querying, you should create indexes for its expression, or advices developer to extract it as an independent field.
7. Timestamp-related fields must be maintained by SQL's default value(`DEFAULT CURRENT_TIMESTAMP`), or framework's AOP, filling manually with `new Date()` is not allowed.