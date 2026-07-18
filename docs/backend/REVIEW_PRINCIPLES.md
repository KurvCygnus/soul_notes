# Backend Review Principles

> **Prerequisite:** Read [BASICS.md](./BASICS.md) for shared project context and universal principles before applying these backend-specific rules.

This document defines the project's code review standard.
Review only the diff (new changes) unless the developer requests a full review. In that case, review one core package according to the architecture.

Complete the checklist once the review range is confirmed:

## CheckList

### Architecture & Package Layout

* [ ] -- Comparing to the designed architecture, has the current one created new top-level packages (e.g., `config`, `utils`, `domain`)? If it has, ask the developer to explain and discuss with other developers. **This review is marked as a failure.**
* [ ] -- Do a quick check on all directories and files:
    * [ ] -- Is the directory tree deeply nested (standard starts from `java/kurvcygnus/soulnotes`, layers should  strictly be in the range of `1 ~ 5`)?
    * [ ] -- Does the name of the directory match the standard of **lowercase**?
    * [ ] -- Does the name of files match the **naming styles** (e.g. `Abstract` prefix for abstract classes, `I` prefix for interfaces, no `Impl` or `Implementation` suffixes)?
    * [ ] -- Does the access level of a class seem appropriate (too open, or too closed)?

---

### Code Style & Formatting Compliance

* [ ] -- Now check each file:
    * [ ] -- Does it have strict adherence to JetBrains annotations? (Are `@NotNull` and `@Nullable` explicitly used on parameters and fields? Is `@Nullable` used for local variables?)
    * [ ] -- Does its style strictly follow **Allman-Style** (braces `{` on a new line)?
    * [ ] -- Does it keep the exact naming rules and defensive `Objects.requireNonNull` assertions well for `@NotNull` parameters?
    * [ ] -- Are guard clauses utilized effectively to flatten nested `if` statements?
    * [ ] -- Are method references preferred over lambdas where applicable?
    * [ ] -- Is the use of `var` restricted *only* to non-primitive types where the type can be easily deduced?
    * [ ] -- Is the code structured using `//region` and `//endregion` comments where complexity justifies it?

---

### Comments & Documentation Standards

* [ ] -- Are single-line prefixes correctly utilized for critical info (`//*`), potential errors (`//!`), and todo/build logs (`//?`)?
* [ ] -- Do comments avoid explaining "what" the code does, focusing exclusively on **"why"** instead?
* [ ] -- Are all comments and Javadocs written entirely in **Chinese**?
* [ ] -- If Javadocs are written, do they follow the custom styling requirements (e.g., `<b>` for highlight, red/green span tags for dangerous/safe behaviors, and `<u>{@link ...}</u>` for local references)?
* [ ] -- For new top-level declarations (`class`, `interface`), are `@author` and `@since` tags properly populated (including the model name if AI-generated)?

---

### Dependencies, Warnings & Modern API Usage

* [ ] -- Are there any new dependencies introduced or existing ones updated? (Remember: *Introducing new dependencies is forbidden unless explicitly coordinated with the team*).
* [ ] -- Is the code completely free of compiler warnings? If a warning is unavoidable, is it suppressed using `@SuppressWarnings` accompanied by a clear `//! Reason...` comment?
* [ ] -- Are there **zero** instances of deprecated APIs being called?

---

### Reactive Concurrency Constraints

* [ ] -- Are blocking operations (file I/O, synchronous network requests, complex computations) properly wrapped inside worker thread pools using `Uni.createFrom().item(...)` or `@Blocking`?
* [ ] -- Is there any reactive stream downgrading? Check for and ban **`.await().indefinitely()`** and **`.asStream()`** inside the `Service` and `Resource` layers.
* [ ] -- Are method signatures maintaining native reactive types (`Uni<T>` or `Multi<T>`) alongside a fluent pipeline calling style (`.map()`, `.flatMap()`)?
* [ ] -- Are multi-table write/edit operations safely wrapped in a transactional context via `Panache.withTransaction()` or `@ReactiveTransactional`?

---

### Database & SQL Correctness

* [ ] -- Are there any raw DDL statements (`DROP`, `ALTER`) running through the ORM layer? (Banned).
* [ ] -- Do all `UPDATE` and `DELETE` queries contain explicit `WHERE` filtering logic?
* [ ] -- Is the database clear of physical deletion patterns? (Ensure soft deletion is used instead).
* [ ] -- Are query endpoints retrieving collections implementing pagination limits (`limit`/`page`) instead of calling unbounded methods like `findAll()`?
* [ ] -- Are explicit indexes accounted for on all foreign key columns, as well as expression-based indexes for
  high-frequency JSONB querying properties?
* [ ] -- Are temporal attributes exclusively relying on SQL `DEFAULT CURRENT_TIMESTAMP` or framework AOP instead of explicit `new Date()` allocations?

---

### Core Business Logic Alignment

Cross-check all changes against the four business requirements defined in [docs/BASICS.md](../BASICS.md):

* [ ] — Multimodal Input Handling (`Voice -> Text -> LLM -> Sentiment Analysis`)
* [ ] — Sentiment Analysis & Visualization (valence, anxiety, "Emotion Weather Forecast")
* [ ] — Empathetic & Non-Medicalized Response Style
* [ ] — High-Risk Alert (Online popup + Offline fallback hotline)

---

## Further Instructions

If nothing is wrong, and developer also asks about **generating commit message**, then summary the changes with [this file](COMMIT_TEMPLATES.md)'s format, and in Chinese.