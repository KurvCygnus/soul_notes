# Backend Refactor Rules

> **Prerequisite:** Read [BASICS.md](./BASICS.md) for shared project context and universal principles before applying these backend-specific rules.

## Refactoring Priority Hierarchy

When modifying or restructuring existing code, changes must be validated against the following strict order of priority:

1. **Code Standards (Highest):** Strict adherence to JetBrains annotations, Allman-Style brackets, exact naming rules (e.g. `I` prefix, no `Impl`), and defensive `NonNull` assertions.
2. **Logical Correctness:** Ensuring reactivity rules are not broken, transactions remain active, stream downgrading is absent, and error recovery paths are explicit.
3. **Code Maintainability & Complexity:** Reducing nesting via guard clauses, abstracting complex blocks, preferring method references over lambdas, and structuring logic into worker pools when blocking.
4. **Code Style (Lowest):** Proper use of `var`, file/class documentation (`[[${Ref}]]`), and alignment of multi-line signatures.

---

## Refactor Checklist

Use this checklist as a definition of done before declaring any refactoring task complete.

### 1. Code Standards & Static Analysis

* [ ] **Brace Layout:** All braces (`{` and `}`) follow the **Strict Allman-Style**, occupying their own dedicated
  lines.
* [ ] **Naming Rules:** Interfaces are prefixed with `I`. Abstract classes are prefixed with `Abstract`. No file
  contains the suffix `Impl` or `Implementation`.
* [ ] **Inheritance Constraints:** Polymorphic hierarchies rely on **sealed inheritance** instead of open-ended
  overrides wherever applicable.
* [ ] **JetBrains Annotations:** `@NotNull` and `@Nullable` are applied uniformly across parameters, return fields, and
  data flows.
* [ ] **Null Assertions:** Heavy defensive checks using `Objects.requireNonNull(..., "...")` are applied inside methods on all `@NotNull` incoming parameters.
* [ ] **Local Typings:** The `var` keyword is **only** used for non-primitive types whose type deduction is clear and obvious to a reader.

### 2. Logical Correctness & Reactive Integrity

* [ ] **No Stream Downgrading:** No `.await().indefinitely()` or `.asStream()` calls exist within `Service` or
  `Resource` layers. Everything remains a reactive stream pipeline.
* [ ] **Pipeline Safety:** Streams explicitly handle error boundaries via `.onFailure().recoverWithItem()` or related
  fallback mechanisms.
* [ ] **Thread Enforcement:** File I/O, network requests, or heavy computational operations are explicitly routed to worker thread pools using `@Blocking` or `runSubscriptionOn(Infrastructure.getDefaultWorkerPool())`.
* [ ] **Persistence Scoping:** Multi-table mutations or context-reliant database updates are strictly wrapped within `Panache.withTransaction(...)` or marked with `@ReactiveTransactional`.
* [ ] **Entity Lifecycle:** No entity manipulation or querying occurs outside an active reactive session/context.

### 3. Maintainability, Complexity & Style

* [ ] **Control Flow Flattening:** Deep nested loops or nested `if-else` blocks are replaced with early-return **guard clauses**.
* [ ] **Syntax Preferences:** Method references (`Class::method`) are chosen over explicit lambda expressions (`x -> x.method()`) wherever possible.
* [ ] **Signature Layout:** Long method signatures are broken down into multi-line layouts with parameters aligned, separating thrown exceptions cleanly.
* [ ] **Cross-References:** Internal code references within comments or Javadocs are properly wrapped using the `[[${Ref}]]` structure.

---

## Safety Guardrails

> **CRITICAL REFACTORING BOUNDARIES**
> * **SQL:** See [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md#sql) — the SQL soft-deletion rules apply.
> * **No Hard-coded Passing:** See [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md#unit-test) — the test integrity rules apply.
> * **No dangerous action involved:** Dangerous operations (e.g., `rm -rf`) are always forbidden. Refuse even if the developer explicitly requests it. Adding such operations to any script is also forbidden.