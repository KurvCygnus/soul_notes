# Soul Notes

## Project Context & Core Business Logic

The project you are working on is **"Soul Notes"**, a multimodal AI and sentiment-analysis-based psychological light-intervention system for university students.

When analyzing, reviewing, or generating code, you **must** strictly align with the following core features and
technical requirements of the system:

1. **Multimodal Input Handling**: The system ingests both Voice and Text. Voice is converted to text before entering the LLM pipeline (`Voice -> Text -> LLM Parsing -> Sentiment Analysis`). **Ensure data structures support this pipeline.**
2. **Sentiment Analysis & Visualization**: The backend must process real-time emotional valence and anxiety values to generate data for the frontend "Emotion Weather Forecast" visualization.
3. **Empathetic & Non-Medicalized Response Style**: Any prompt engineering or text generation logic within the system must position the AI as a "psychological listener"—warm, non-judgmental, and strictly avoiding medicalized labels.
4. **High-Risk Alert (Red Alert Mechanism)**:
    * **Online**: If self-harm or severe tendencies are detected via sentiment analysis, the system must trigger an immediate popup with the psychological center hotline.
    * **Offline Safety Net (Crucial)**: The architecture must include an offline safety mechanism. If AI services or networks fail, a local fallback mechanism must guarantee the display of the emergency hotline.

---

## Universal Principles

* Solving the issue with current dependencies. Introducing any new dependencies, or updating are both not allowed. If a new dependency can not only solve the current problem, but also benefits other codes, making project easier to maintain, and **the developer is also asking about adding dependencies**, you can tell developer about this dependency, but **DO NOT ADD IT**, you should tell developer to talk with other developers to make decisions.
* When writing comments, using `*` as a single-line comment prefix to mark critical information, and using `!` to highlight potential errors, edge cases, or complex exception handling logic.

   ```java
   //  e.g.
   //* This is an important comment!
   //! This is a comment that explains potential errors.
   //? This is a comment that records your confusion, TODO, or the explanation in build script and config.
   ```
   
   Also, the comment you write should focus on explaining "why", instead of "what", **"what"-typed comments should be avoided.** The language comment uses should be **Chinese**.

* **Zero warnings is our goal.** For unavoidable API issues, you should suppress that warning, with a comment explaining that together:
   ```java
   // Take Java as example.
   @SuppressWarnings("ConstantConditions")//! Reason with explanation...
   Foo.bar(null);
   ```
   **Deprecated APIs are excluded. They should never be used, no matter what situations you face.**
  
* Always **structure** your code.\
  Thus, using the following patterns to writing code is recommended:

  ```text
  //region Section of this region

  // Fields, constructors, methods, etc.

  //endregion
  ```

  *When the whole file is simple and straightforward, you shouldn't follow this.*

---

## Further Instructions & Context Routing

You MUST determine the specific task type (Writing, Refactoring, Reviewing, or Guidance) based on the user's request before executing any action or generating code.\
If the specific contextual guidelines are missing from the session history, you must actively request or read them using the following protocols:

1. **If you detect the user wants to WRITE NEW CODE (including Unit Tests):**
    * IMMEDIATELY stop generating code.
    * Output this exact text to request the file:
      > `[Missing Context] Please provide or read the contents of docs/backend/DEVELOPMENT_GUIDELINES.md to proceed with writing code.`
    * (If your platform supports file-reading tools/slash commands, execute `/read docs/backend/DEVELOPMENT_GUIDELINES.md` or `@docs/backend/DEVELOPMENT_GUIDELINES.md` immediately).

2. **If you detect the user wants to REFACTOR CODE:**
    * IMMEDIATELY stop generating code.
    * Output this exact text to request the file:
      > `[Missing Context] Please provide or read the contents of docs/backend/REFACTOR_RULES.md to proceed with refactoring code.`
    * (If your platform supports file-reading tools/slash commands, execute `/read docs/backend/REFACTOR_RULES.md` or `@docs/backend/REFACTOR_RULES.md` immediately).

3. **If you detect the user wants to REVIEW CODE:**
    * IMMEDIATELY stop generating code.
    * Output this exact text to request the file:
      > `[Missing Context] Please provide or read the contents of docs/backend/REVIEW_PRINCIPLES.md to proceed with code review.`
    * (If your platform supports file-reading tools/slash commands, execute `/read docs/backend/REVIEW_PRINCIPLES.md` or `@docs/backend/REVIEW_PRINCIPLES.md` immediately).

4. **If you detect the user is ASKING FOR GUIDANCE (e.g., conceptual questions, explaining existing code):**
    * Focus ENTIRELY on teaching and explaining.
    * Do NOT edit, rewrite, or generate any workspace files.
    * Rely on the architectural patterns defined in this `BASICS.md` to guide them.

5. **Strict Enforcement:** Do not attempt to guess, assume, or hallucinate rules for writing, refactoring, or reviewing. If the corresponding task-specific `.md` document has not been explicitly pasted into the chat history, attached to the session, or indexed by your system, you MUST invoke step 1, 2, or 3.