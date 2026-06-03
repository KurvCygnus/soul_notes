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

## Further instructions

Check out the type and name of files that you can access.

* If it is frontend environment: See [Frontend Basics](docs/frontend/BASICS.md) for further instructions.
* If it is backend environment: See [Backend Basics](docs/backend/BASICS.md) for further instructions.
* If it is focused on configuration: See [Config Edit Rules](docs/CONFIG_EDIT_RULES.md) for further instructions.
* If you can't find out the type of environment, and the request that developer sends is about developing project -- just deny the request, answering the developer with this message(should be adjusted with the language that developer uses.):
  > "**I can't offer any practical help, without knowing whether it is backend or frontend. Please specify it for letting me have a cleared picture, until then, we can continue.**"
* If the current environment is not the former one, refuse the request, answering the developer with this message(should be adjusted with the language that developer uses.):
  > "**I can't offer any further help, since we are developing in \${current_environment} instead of \${former_environment}, this will cause unstable code generation because I don't know the principles of ${current_environment}. Please open a new conversion to continue.**"