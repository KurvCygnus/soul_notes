# Soul Note — Backend Development Basics

## Tech Stack

* Java 21 - Main programming language used.
* Gradle - Build tool used.
* [Quarkus](https://quarkus.io/) - A "supersonic" Java development framework for the cloud era, natively supporting AI,
  Docker, K8s, Native Image (native binary machine code compilation, de-JVM-ification), with efficiency far exceeding
  Spring Boot in cloud deployment, cold start, performance, and memory footprint.
    * **quarkus-langchain4j-openai** - Quarkus extension for integrating AI, supporting declarative usage and highly configurable.
    * **quarkus-reactive-pg-client** - Quarkus database driver extension, used with PostgreSQL.
    * **quarkus-hibernate-reactive-panache** - ORM framework. Quarkus's exclusive Panache pattern, making reactive database operations as simple and efficient as writing Active Record.
    * **quarkus-resteasy-reactive-jackson** - Core Gateway/Router. High-performance reactive HTTP service based on Vert.x, supporting SSE (Server-Sent Events) for AI text streaming typewriter output.
    * **quarkus-websockets-next** - Bidirectional Communication. Used for voice streaming transmission or real-time notification push when strong alerts are triggered.
    * **quarkus-smallrye-jwt** - Security Authentication. Lightweight decentralized user authentication based on JWT.
    * **quarkus-redis-client** - Cache & Rate Limiting. Used for temporary storage of context, high-frequency word cloud caching, and token bucket rate limiting to prevent interfaces from being maliciously flooded.
* [Jackson](https://github.com/FasterXML/jackson) - Efficient serialization library based on compile-time processing.
* [Netty](https://netty.io/) - Efficient asynchronous network I/O library.
* [SLF4J](https://www.slf4j.org/) - Unified logging facade library.
* [JetBrains Annotations](https://github.com/JetBrains/java-annotations) - Auxiliary annotation library for uniformly
  marking data flow direction/static analysis markers in this project.
* [PostgreSQL](https://www.postgresql.org/) - Core database used. Compared with traditional MySQL, it offers stronger
  efficiency and performance.
* Redis - Database for caching and rate limiting.
* ~~Docker~~ - Because containerized deployment is achievable and there are environment images for "audio → text"
  processing, it has been taken into consideration. ***If used, PostgreSQL will also be used as the form of Docker Image.***

---

## Backend Architecture

```text
├── src/main/java/kurvcygnus/soulnotes/
│   ├── config/
│   ├── utils/
│   ├── exception/
│   │
│   ├── domain/
│   │   ├── auth/
│   │   ├── diary/
│   │   │   ├── entity/
│   │   │   ├── resource/
│   │   │   └── service/
│   │   ├── chat/
│   │   └── voice/
│   │
│   ├── ai/
│   │   ├── agent/
│   │   ├── tool/
│   │   └── retriever/
│   │
│   └── websocket/
└── src/main/resources/
    └── application.properties
```

---

## Code Styles

This project does not use a formatter. Follow this code style when writing and enforce it during review:

* Abstract class should always use `Abstract` as prefix.
* All interfaces must use `I` as a prefix.
* Prefer sealed inheritance over open inheritance. `Impl` or `Implementation` must not appear in any filename.
* Strict Allman-Style is required.\
  Example:
  ```java
  public final class Main extends IFoo
  {
      private static final Logger = PrintUtils.getLogger();
      
      //* Always mark [[NotNull]] and [[Nullable]] on params, fields, for local variables, [[Nullable]] is a must but [[NotNull]] does not.
      public static void main(@NotNull String... args)
      {
          //* For single line statements, covering the scope with `{}` is not mandatory.
          //* If `{}` is used at such a case, you should write it like this: `for(...) { ... }`
          for(final var arg: args)//* Using `final` in local varaibles(method params is not included) is recommend.
              System.out.println(PrintUtils.quickFormat("Arg \"{}\" got.\n", arg));//* When producing formatted strings, always use [[PrintUtils#quickFormat]].
          
          SomeClass.run(args);
      }
  }
  
  //* When a method's signature is too long, split it like this.
  private void bar(
      @NotNull IFoo foo,
      @NotNull List<Bar> bars,
      @Nullable Consumer<Bar> callback
  ) throws NullPointerException
  {
      //* Always do non-null assertions for [[NotNull]] params unless the source is completely reliable, just like `Main#main`'s param, `args`.
      Objects.requireNonNull(foo, "Param \"foo\" must not be null!");
      Objects.requireNonNull(bars, "Param \"bars\" must not be null!");
  
      //* Always use guard clauses.
      if(callback == null)
          return;
      
      bars.stream().
          filter(foo.bar()::baz).//* Method Reference is perfered rather than Lambda.
          forEach(callback);
  }
  
  //* Also, you should follow the usage of `[[${Ref}]]` from comments above, it can be actually a reference when some plugin is installed, `${Ref}` can be either file reference or class reference.
  ```
* About `var`: Use it only when the type is non-primitive and obvious from the right-hand side expression (e.g., `var list = new ArrayList<String>()` is OK; `var result = compute()` is not).
* JetBrains Annotations are the highest-authority lint annotations for this project. Other annotation libraries may be used as long as they do not duplicate JetBrains equivalents.

---

## Further Instructions

Consider the request of the developer:

* When it is **writing new codes**(unit tests **also counts**): See [Development Guidelines](DEVELOPMENT_GUIDELINES.md).
* When it is **refactoring codes**: See [Refactor Rules](REFACTOR_RULES.md).
* When it is **reviewing the codes**: See [Review Principles](REVIEW_PRINCIPLES.md).
* When it is **asking for guidance**: Then teach them, or explain code to them, **do not edit files, or do something else.**