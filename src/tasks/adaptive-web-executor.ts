import { LLMProvider } from "../providers/llm.interface";
import { BrowserExecutor } from "../browser/browser-executor";

export type AdaptiveActionType =
  | "WAIT"
  | "CLICK"
  | "FILL"
  | "PRESS"
  | "OPEN"
  | "BLOCKED"
  | "DONE";

export interface AdaptiveAction {
  type: AdaptiveActionType;
  selector?: string | null;
  value?: string | null;
  key?: string | null;
  reason: string;
}

export interface InteractiveElement {
  selector: string;
  tag: string;
  type?: string | null;
  text?: string | null;
  ariaLabel?: string | null;
  placeholder?: string | null;
  name?: string | null;
  value?: string | null;
  disabled?: boolean;

  /**
   * Native checkbox/radio state.
   */
  checked?: boolean | null;

  /**
   * ARIA checkbox/switch state.
   */
  ariaChecked?: boolean | null;

  /**
   * Toggle/button pressed state.
   */
  pressed?: boolean | null;

  /**
   * ARIA pressed state.
   */
  ariaPressed?: boolean | null;
}

export interface AdaptivePageState {
  url: string;
  title: string;
  text: string;
  interactiveElements: InteractiveElement[];
}

export interface AdaptiveStepProof {
  step: number;
  action: AdaptiveAction;
  urlBefore: string;
  urlAfter: string;
  pageTitleAfter: string;
  pageTextAfter: string;
}

export interface AdaptiveWebExecutionResult {
  success: boolean;
  status: "DONE" | "BLOCKED" | "FAILED";
  output: string;
  steps: number;
  finalUrl: string;
  proof: {
    startedUrl: string;
    finalUrl: string;
    steps: AdaptiveStepProof[];
    finalPageTitle: string;
    finalPageText: string;
  };
}

export interface AdaptiveWebExecutorOptions {
  maxSteps?: number;
  maxInitialWaits?: number;
  waitAfterActionMs?: number;
}

export interface AdaptiveAccountContext {
  accountId: number;
  accountName: string;
  twitterHandle: string | null;
  walletAddress: string | null;
}

export interface AdaptiveWebExecutionContext {
  account?: AdaptiveAccountContext;

  /**
   * When true, DONE requires deterministic completion evidence
   * from the current page state.
   *
   * Used specifically for whitelist/checklist verification.
   */
  verificationMode?: boolean;
}

export class AdaptiveWebExecutor {
  private readonly llm: LLMProvider;
  private readonly browser: BrowserExecutor;
  private readonly options: Required<AdaptiveWebExecutorOptions>;

  constructor(
    llm: LLMProvider,
    browser: BrowserExecutor,
    options: AdaptiveWebExecutorOptions = {},
  ) {
    this.llm = llm;
    this.browser = browser;
    this.options = {
      maxSteps: options.maxSteps ?? 12,
      maxInitialWaits: options.maxInitialWaits ?? 3,
      waitAfterActionMs: options.waitAfterActionMs ?? 1200,
    };
  }

  async execute(
    url: string,
    goal: string,
    context: AdaptiveWebExecutionContext = {},
  ): Promise<AdaptiveWebExecutionResult> {
    console.log(`🤖 [AdaptiveWebExecutor] Starting adaptive task → ${url}`);

    console.log(`🎯 [AdaptiveWebExecutor] Goal: ${goal}`);

    if (context.verificationMode) {
      console.log(
        "🔐 [AdaptiveWebExecutor] Verification mode aktif → DONE membutuhkan bukti deterministic.",
      );
    }

    await this.browser.start();
    await this.browser.open(url);

    const startedUrl = await this.browser.getCurrentUrl();
    const steps: AdaptiveStepProof[] = [];

    let finalState = await this.inspectCurrentPage();
    let initialWaits = 0;

    let previousAction: AdaptiveAction | null = null;
    let previousStateBeforeAction: AdaptivePageState | null = null;

    for (let step = 1; step <= this.options.maxSteps; step++) {
      console.log(
        `\n🧠 [AdaptiveWebExecutor] Step ${step}/${this.options.maxSteps}`,
      );

      console.log(
        `🌐 [AdaptiveWebExecutor] ${finalState.title} → ${finalState.url}`,
      );

      console.log(
        `🔎 [AdaptiveWebExecutor] Interactive elements: ${finalState.interactiveElements.length}`,
      );

      /**
       * Some modern sites render their actual controls asynchronously.
       * Give the page a few chances before asking the LLM to reason about
       * an incomplete page.
       */
      if (
        finalState.interactiveElements.length === 0 &&
        initialWaits < this.options.maxInitialWaits
      ) {
        initialWaits++;

        console.log(
          `⏳ [AdaptiveWebExecutor] No interactive elements yet. Waiting for render (${initialWaits}/${this.options.maxInitialWaits})...`,
        );

        const waitAction: AdaptiveAction = {
          type: "WAIT",
          selector: null,
          value: null,
          key: null,
          reason: "Waiting for the page to finish rendering.",
        };

        const urlBefore = finalState.url;

        await this.sleep(1500);

        finalState = await this.inspectCurrentPage();

        steps.push({
          step,
          action: waitAction,
          urlBefore,
          urlAfter: finalState.url,
          pageTitleAfter: finalState.title,
          pageTextAfter: finalState.text,
        });

        previousAction = waitAction;
        previousStateBeforeAction = null;

        continue;
      }

      initialWaits = this.options.maxInitialWaits;

      const decision = await this.decideNextAction(
        finalState,
        goal,
        context,
        previousAction,
        previousStateBeforeAction,
      );

      console.log(
        `🧭 [AdaptiveWebExecutor] Decision: ${JSON.stringify(decision)}`,
      );

      this.validateDecision(decision, finalState);

      const urlBefore = finalState.url;

      if (decision.type === "DONE") {
        /**
         * IMPORTANT:
         *
         * In verification mode, the LLM is NOT trusted as the final
         * authority. We require deterministic evidence from the actual
         * current page state.
         */
        if (context.verificationMode) {
          const verification = this.verifyCompletionEvidence(finalState);

          console.log(
            `🔐 [AdaptiveWebExecutor] Verification evidence → ${JSON.stringify(
              verification,
            )}`,
          );

          if (!verification.verified) {
            const blockedReason =
              "LLM menyatakan DONE, tetapi tidak ditemukan bukti completion checklist yang cukup pada state halaman saat ini.";

            console.log(`⚠️ [AdaptiveWebExecutor] ${blockedReason}`);

            const blockedAction: AdaptiveAction = {
              type: "BLOCKED",
              selector: null,
              value: null,
              key: null,
              reason: blockedReason,
            };

            steps.push({
              step,
              action: blockedAction,
              urlBefore,
              urlAfter: finalState.url,
              pageTitleAfter: finalState.title,
              pageTextAfter: finalState.text,
            });

            return {
              success: false,
              status: "BLOCKED",
              output: JSON.stringify(
                {
                  action: "ADAPTIVE_WEB",
                  message: blockedReason,
                  llmReason: decision.reason,
                  verificationEvidence: verification,
                  finalUrl: finalState.url,
                  stepsExecuted: steps.length,
                  finalPageText: finalState.text.slice(0, 4000),
                },
                null,
                2,
              ),
              steps: steps.length,
              finalUrl: finalState.url,
              proof: {
                startedUrl,
                finalUrl: finalState.url,
                steps,
                finalPageTitle: finalState.title,
                finalPageText: finalState.text,
              },
            };
          }

          console.log(
            `✅ [AdaptiveWebExecutor] Deterministic completion evidence ditemukan.`,
          );
        }

        steps.push({
          step,
          action: decision,
          urlBefore: finalState.url,
          urlAfter: finalState.url,
          pageTitleAfter: finalState.title,
          pageTextAfter: finalState.text,
        });

        return {
          success: true,
          status: "DONE",
          output: JSON.stringify(
            {
              action: "ADAPTIVE_WEB",
              message: decision.reason,
              finalUrl: finalState.url,
              stepsExecuted: steps.length,
              verificationMode: Boolean(context.verificationMode),
            },
            null,
            2,
          ),
          steps: steps.length,
          finalUrl: finalState.url,
          proof: {
            startedUrl,
            finalUrl: finalState.url,
            steps,
            finalPageTitle: finalState.title,
            finalPageText: finalState.text,
          },
        };
      }

      if (decision.type === "BLOCKED") {
        steps.push({
          step,
          action: decision,
          urlBefore,
          urlAfter: finalState.url,
          pageTitleAfter: finalState.title,
          pageTextAfter: finalState.text,
        });

        return {
          success: false,
          status: "BLOCKED",
          output: JSON.stringify(
            {
              action: "ADAPTIVE_WEB",
              message: `Adaptive web task berhenti: ${decision.reason}`,
              finalUrl: finalState.url,
              stepsExecuted: steps.length,
              finalPageText: finalState.text.slice(0, 4000),
            },
            null,
            2,
          ),
          steps: steps.length,
          finalUrl: finalState.url,
          proof: {
            startedUrl,
            finalUrl: finalState.url,
            steps,
            finalPageTitle: finalState.title,
            finalPageText: finalState.text,
          },
        };
      }

      /**
       * Keep the state before executing the action.
       * This lets the next LLM decision understand what just happened.
       */
      const stateBeforeAction = finalState;

      await this.executeAction(decision);

      await this.sleep(this.options.waitAfterActionMs);

      finalState = await this.inspectCurrentPage();

      steps.push({
        step,
        action: decision,
        urlBefore,
        urlAfter: finalState.url,
        pageTitleAfter: finalState.title,
        pageTextAfter: finalState.text,
      });

      previousAction = decision;
      previousStateBeforeAction = stateBeforeAction;
    }

    return {
      success: false,
      status: "FAILED",
      output: JSON.stringify(
        {
          action: "ADAPTIVE_WEB",
          message: `Adaptive web task berhenti karena mencapai batas ${this.options.maxSteps} steps.`,
          finalUrl: finalState.url,
          stepsExecuted: steps.length,
          finalPageText: finalState.text.slice(0, 4000),
        },
        null,
        2,
      ),
      steps: steps.length,
      finalUrl: finalState.url,
      proof: {
        startedUrl,
        finalUrl: finalState.url,
        steps,
        finalPageTitle: finalState.title,
        finalPageText: finalState.text,
      },
    };
  }

  /**
   * Deterministic completion verification.
   *
   * This method does NOT ask the LLM whether the task is complete.
   * It inspects the actual page state collected from the browser.
   *
   * Strong signals:
   * - native checkbox checked
   * - aria-checked=true
   * - aria-pressed=true
   * - disabled control with explicit completion wording
   * - interactive element with explicit completed/done/verified/checked wording
   */
  private verifyCompletionEvidence(state: AdaptivePageState): {
    verified: boolean;
    signals: string[];
    elements: Array<{
      selector: string;
      text: string;
      ariaLabel: string | null;
      checked: boolean | null;
      ariaChecked: boolean | null;
      pressed: boolean | null;
      ariaPressed: boolean | null;
      disabled: boolean;
    }>;
  } {
    const signals: string[] = [];

    const evidenceElements: Array<{
      selector: string;
      text: string;
      ariaLabel: string | null;
      checked: boolean | null;
      ariaChecked: boolean | null;
      pressed: boolean | null;
      ariaPressed: boolean | null;
      disabled: boolean;
    }> = [];

    const completionPattern =
      /\b(completed|complete|done|verified|verify|checked|fulfilled|passed)\b|[✓✔☑]/i;

    for (const element of state.interactiveElements) {
      const text = (element.text ?? "").trim();
      const ariaLabel = (element.ariaLabel ?? "").trim();

      const combinedText = `${text} ${ariaLabel}`.trim();

      const nativeChecked = element.checked === true;
      const ariaChecked = element.ariaChecked === true;
      const pressed = element.pressed === true;
      const ariaPressed = element.ariaPressed === true;

      const explicitCompletionText = completionPattern.test(combinedText);

      const strongStateSignal =
        nativeChecked || ariaChecked || pressed || ariaPressed;

      const disabledCompletedControl =
        element.disabled === true && explicitCompletionText;

      const explicitCompletedInteractive =
        explicitCompletionText &&
        (element.tag === "button" ||
          element.tag === "input" ||
          element.tag === "a" ||
          element.tag === "select" ||
          element.tag === "textarea" ||
          element.type === "checkbox" ||
          element.type === "radio");

      if (
        strongStateSignal ||
        disabledCompletedControl ||
        explicitCompletedInteractive
      ) {
        evidenceElements.push({
          selector: element.selector,
          text,
          ariaLabel: ariaLabel || null,
          checked: element.checked === undefined ? null : element.checked,
          ariaChecked:
            element.ariaChecked === undefined ? null : element.ariaChecked,
          pressed: element.pressed === undefined ? null : element.pressed,
          ariaPressed:
            element.ariaPressed === undefined ? null : element.ariaPressed,
          disabled: Boolean(element.disabled),
        });

        if (nativeChecked) {
          signals.push(
            `Native checkbox/radio checked=true → ${element.selector}`,
          );
        }

        if (ariaChecked) {
          signals.push(`aria-checked=true → ${element.selector}`);
        }

        if (pressed) {
          signals.push(`pressed=true → ${element.selector}`);
        }

        if (ariaPressed) {
          signals.push(`aria-pressed=true → ${element.selector}`);
        }

        if (disabledCompletedControl) {
          signals.push(
            `Disabled control with completion wording → ${element.selector}`,
          );
        }

        if (explicitCompletedInteractive) {
          signals.push(
            `Interactive element contains explicit completion wording → ${element.selector}`,
          );
        }
      }
    }

    return {
      verified: evidenceElements.length > 0,
      signals,
      elements: evidenceElements,
    };
  }

  private async inspectCurrentPage(): Promise<AdaptivePageState> {
    const page = await this.browser.getPageResult();

    const interactiveElements = await this.collectInteractiveElements();

    return {
      url: page.url,
      title: page.title,
      text: page.text.slice(0, 12000),
      interactiveElements,
    };
  }

  private async collectInteractiveElements(): Promise<InteractiveElement[]> {
    const script = `
      (() => {
        const results = [];

        const escapeCss = (value) => {
          if (
            window.CSS &&
            typeof window.CSS.escape === "function"
          ) {
            return window.CSS.escape(value);
          }

          return String(value).replace(
            /[^a-zA-Z0-9_-]/g,
            "\\\\$&"
          );
        };

        const selectorIsUnique = (selector, element) => {
          try {
            const matches =
              document.querySelectorAll(selector);

            return (
              matches.length === 1 &&
              matches[0] === element
            );
          } catch {
            return false;
          }
        };

        const getStructuralSelector = (element) => {
          const parts = [];
          let current = element;
          let depth = 0;

          while (
            current &&
            current.nodeType === 1 &&
            current !== document.body &&
            depth < 6
          ) {
            let part =
              current.tagName.toLowerCase();

            if (current.id) {
              const idSelector =
                "#" + escapeCss(current.id);

              if (
                selectorIsUnique(
                  idSelector,
                  current
                )
              ) {
                return idSelector;
              }
            }

            const parent =
              current.parentElement;

            if (parent) {
              const siblings =
                Array.from(
                  parent.children
                ).filter(
                  (child) =>
                    child.tagName ===
                    current.tagName
                );

              if (siblings.length > 1) {
                const index =
                  siblings.indexOf(current) + 1;

                part +=
                  ":nth-of-type(" +
                  index +
                  ")";
              }
            }

            parts.unshift(part);

            const candidate =
              parts.join(" > ");

            if (
              selectorIsUnique(
                candidate,
                element
              )
            ) {
              return candidate;
            }

            current =
              current.parentElement;

            depth++;
          }

          return parts.join(" > ");
        };

        const getUniqueSelector = (element) => {
          const candidates = [];

          if (element.id) {
            candidates.push(
              "#" + escapeCss(element.id)
            );
          }

          for (const attr of [
            "data-testid",
            "data-test-id",
            "name",
            "aria-label",
            "placeholder",
          ]) {
            const value =
              element.getAttribute(attr);

            if (value) {
              const escapedValue =
                String(value).replace(
                  /"/g,
                  '\\"'
                );

              candidates.push(
                element.tagName.toLowerCase() +
                  "[" +
                  attr +
                  '="' +
                  escapedValue +
                  '"]'
              );

              candidates.push(
                "[" +
                  attr +
                  '="' +
                  escapedValue +
                  '"]'
              );
            }
          }

          for (const candidate of candidates) {
            if (
              selectorIsUnique(
                candidate,
                element
              )
            ) {
              return candidate;
            }
          }

          return getStructuralSelector(
            element
          );
        };

        const isVisible = (element) => {
          const style =
            window.getComputedStyle(
              element
            );

          const rect =
            element.getBoundingClientRect();

          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || 1) > 0 &&
            rect.width > 0 &&
            rect.height > 0
          );
        };

        const getCheckedState = (element) => {
          const tag =
            element.tagName.toLowerCase();

          const type =
            String(
              element.getAttribute("type") ||
                ""
            ).toLowerCase();

          if (
            tag === "input" &&
            (
              type === "checkbox" ||
              type === "radio"
            )
          ) {
            return Boolean(element.checked);
          }

          return null;
        };

        const getAriaCheckedState =
          (element) => {
            const value =
              element.getAttribute(
                "aria-checked"
              );

            if (value === null) {
              return null;
            }

            if (value === "true") {
              return true;
            }

            if (value === "false") {
              return false;
            }

            return null;
          };

        const getPressedState =
          (element) => {
            const value =
              element.getAttribute(
                "aria-pressed"
              );

            if (value === "true") {
              return true;
            }

            if (value === "false") {
              return false;
            }

            return null;
          };

        const addElement = (element) => {
          if (
            !element ||
            !isVisible(element)
          ) {
            return;
          }

          const tag =
            element.tagName.toLowerCase();

          const isInteractive =
            [
              "button",
              "input",
              "textarea",
              "select",
              "a",
            ].includes(tag) ||
            element.getAttribute("role") ===
              "button" ||
            element.getAttribute(
              "contenteditable"
            ) === "true";

          if (!isInteractive) {
            return;
          }

          const selector =
            getUniqueSelector(element);

          if (!selector) {
            return;
          }

          const existing =
            results.find(
              (item) =>
                item.selector ===
                selector
            );

          if (existing) {
            return;
          }

          results.push({
            selector,
            tag,

            type:
              element.getAttribute(
                "type"
              ),

            text: (
              element.innerText ||
              element.textContent ||
              ""
            )
              .trim()
              .slice(0, 300),

            ariaLabel:
              element.getAttribute(
                "aria-label"
              ),

            placeholder:
              element.getAttribute(
                "placeholder"
              ),

            name:
              element.getAttribute(
                "name"
              ),

            value:
              "value" in element
                ? String(
                    element.value || ""
                  )
                : null,

            disabled:
              element.hasAttribute(
                "disabled"
              ) ||
              element.getAttribute(
                "aria-disabled"
              ) === "true",

            checked:
              getCheckedState(element),

            ariaChecked:
              getAriaCheckedState(
                element
              ),

            pressed:
              getPressedState(element),

            ariaPressed:
              getPressedState(element),
          });
        };

        const walk = (root) => {
          if (!root) {
            return;
          }

          if (root.querySelectorAll) {
            for (
              const element of
              root.querySelectorAll("*")
            ) {
              addElement(element);

              if (element.shadowRoot) {
                walk(element.shadowRoot);
              }
            }
          }
        };

        walk(document);

        return results.slice(0, 80);
      })()
    `;

    const result = await this.browser.evaluate(script);

    if (!Array.isArray(result)) {
      return [];
    }

    return result as InteractiveElement[];
  }

  private async decideNextAction(
    state: AdaptivePageState,
    goal: string,
    context: AdaptiveWebExecutionContext,
    previousAction: AdaptiveAction | null,
    previousStateBeforeAction: AdaptivePageState | null,
  ): Promise<AdaptiveAction> {
    const account = context.account;

    const accountContext = account
      ? {
          accountId: account.accountId,
          accountName: account.accountName,
          twitterHandle: account.twitterHandle,
          walletAddress: account.walletAddress,
        }
      : null;

    const previousActionContext =
      previousAction && previousStateBeforeAction
        ? {
            action: previousAction,

            stateBeforeAction: {
              url: previousStateBeforeAction.url,
              title: previousStateBeforeAction.title,
              text: previousStateBeforeAction.text.slice(0, 8000),
            },

            importantInstruction:
              "The current page is the result of this previous action. Determine whether that action already completed the goal before performing another action.",
          }
        : null;

    const prompt = `
You are an adaptive web task executor.

Your job is to determine the SINGLE safest next action
on the current webpage.

GOAL:

${goal}

ACCOUNT CONTEXT:

${JSON.stringify(accountContext, null, 2)}

CURRENT PAGE:

${JSON.stringify(
  {
    url: state.url,
    title: state.title,
    text: state.text.slice(0, 10000),
  },
  null,
  2,
)}

INTERACTIVE ELEMENTS:

${JSON.stringify(state.interactiveElements, null, 2)}

PREVIOUS ACTION CONTEXT:

${JSON.stringify(previousActionContext, null, 2)}

VERIFICATION MODE:

${Boolean(context.verificationMode)}

AVAILABLE ACTIONS:

- WAIT
- CLICK
- FILL
- PRESS
- OPEN
- BLOCKED
- DONE

RULES:

1. Only use selectors from the INTERACTIVE ELEMENTS list.

2. Never invent a selector.

3. Every selector in the list has already been verified as unique.

4. For CLICK, selector must identify the intended visible interactive element.

5. For FILL, selector must identify an input, textarea, or other text-entry element.

6. For FILL, choose the value from ACCOUNT CONTEXT when the page asks for:
   - X/Twitter username → account.twitterHandle
   - wallet address → account.walletAddress

7. Never fabricate account data.

8. Never fabricate wallet addresses.

9. Never fabricate X usernames.

10. Do not expose or request private keys.

11. Do not perform wallet signing.

12. Do not bypass CAPTCHA, anti-bot systems, rate limits, authentication restrictions, or access controls.

13. If authentication/login is required and cannot be safely completed with the available session, return BLOCKED.

14. If wallet connection is required but not currently possible with the available browser capabilities, return BLOCKED.

15. If wallet signing/message signing/transaction signing is requested, return BLOCKED.

16. If a manual approval is clearly required, return BLOCKED.

17. Prefer the minimum number of actions needed to advance the flow.

18. If the page is still rendering, use WAIT.

19. IMPORTANT:
    After an action has already been executed, inspect the CURRENT PAGE
    for its result before repeating that action.

20. A generic success message alone does NOT automatically prove
    that a checklist or whitelist task is complete.

21. If the GOAL is specifically checking whether a whitelist/project
    checklist item is completed, look for explicit completion evidence.

22. For checklist items, consider these strong completion signals:
    - native checkbox with checked=true
    - aria-checked=true
    - aria-pressed=true
    - visible text explicitly saying completed/done/verified/checked
    - a project-specific checklist item visibly changing into a completed state

23. If a checklist item is still unchecked, uncompleted, or ambiguous,
    do NOT return DONE.

24. If the page shows a generic "success" or "completed" message but
    the relevant checklist item is visibly unchecked, continue inspecting
    or return BLOCKED rather than claiming completion.

25. If the relevant checklist state is ambiguous and cannot be verified
    from the current page, do NOT guess. Return BLOCKED.

26. A button remaining visible does NOT mean it must be clicked again.

27. Do NOT repeat the exact same CLICK merely because the same button is still visible.

28. If the previous action changed the page state and the current page
    already shows the expected result, return DONE only when the actual
    GOAL is satisfied.

29. If the previous action did not visibly change the page and another
    action is genuinely necessary, reason from the current page before continuing.

30. If the goal has been completed and the page provides sufficient evidence
    of completion, use DONE.

31. If there is no safe next action, use BLOCKED.

32. Do not guess what a button does when the page text does not provide
    enough evidence.

33. Do not use project-specific knowledge or hardcoded project behavior.

34. The current page state is more authoritative than assumptions about
    what should happen next.

35. When VERIFICATION MODE is true, DONE is only a candidate decision.
    The execution system will independently verify completion evidence
    from the actual page state.

36. Never claim checklist completion merely because the URL changed,
    a redirect occurred, or a generic success message appeared.

IMPORTANT:

The ACCOUNT CONTEXT is authoritative for account identity.

Use it when the page asks for account-specific values.

The PREVIOUS ACTION CONTEXT exists specifically to prevent
blindly repeating an action that has already produced a result.

Before choosing CLICK, ask:

"Has this action already been performed and has the page
already shown the expected result?"

If yes, choose DONE only if the actual GOAL has been satisfied.

Return ONLY valid JSON:

{
  "type": "WAIT | CLICK | FILL | PRESS | OPEN | BLOCKED | DONE",
  "selector": "selector or null",
  "value": "value or null",
  "key": "key or null",
  "reason": "short explanation"
}
`;

    const response = await this.llm.generate({
      systemInstruction:
        "You are a cautious browser agent. Return only valid JSON.",

      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text = response.text?.trim();

    if (!text) {
      throw new Error("LLM returned no adaptive action.");
    }

    return this.parseDecision(text);
  }

  private parseDecision(text: string): AdaptiveAction {
    let cleaned = text.trim();

    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);

      if (!match) {
        throw new Error(`Unable to parse adaptive action JSON: ${cleaned}`);
      }

      parsed = JSON.parse(match[0]);
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Adaptive action must be an object.");
    }

    const action = parsed as Record<string, unknown>;

    const type = action.type;

    if (
      type !== "WAIT" &&
      type !== "CLICK" &&
      type !== "FILL" &&
      type !== "PRESS" &&
      type !== "OPEN" &&
      type !== "BLOCKED" &&
      type !== "DONE"
    ) {
      throw new Error(`Unknown adaptive action type: ${String(type)}`);
    }

    return {
      type,

      selector: typeof action.selector === "string" ? action.selector : null,

      value: typeof action.value === "string" ? action.value : null,

      key: typeof action.key === "string" ? action.key : null,

      reason:
        typeof action.reason === "string"
          ? action.reason
          : "No reason provided.",
    };
  }

  private validateDecision(
    action: AdaptiveAction,
    state: AdaptivePageState,
  ): void {
    if (
      action.type === "CLICK" ||
      action.type === "FILL" ||
      action.type === "PRESS"
    ) {
      if (!action.selector) {
        throw new Error(`${action.type} action requires a selector.`);
      }

      const exists = state.interactiveElements.some(
        (element) => element.selector === action.selector,
      );

      if (!exists) {
        throw new Error(
          `LLM selected selector that is not in the current interactive element list: ${action.selector}`,
        );
      }
    }

    if (action.type === "FILL" && action.value === null) {
      throw new Error("FILL action requires a value.");
    }

    if (action.type === "PRESS" && action.key === null) {
      throw new Error("PRESS action requires a key.");
    }

    if (action.type === "OPEN" && !action.value) {
      throw new Error("OPEN action requires a URL in value.");
    }
  }

  private async executeAction(action: AdaptiveAction): Promise<void> {
    switch (action.type) {
      case "WAIT":
        await this.sleep(1500);
        return;

      case "CLICK":
        if (!action.selector) {
          throw new Error("CLICK selector missing.");
        }

        console.log(`🖱️ [AdaptiveWebExecutor] CLICK ${action.selector}`);

        await this.browser.click(action.selector);

        return;

      case "FILL": {
        const selector = action.selector;

        const value = action.value;

        if (!selector) {
          throw new Error("FILL selector missing.");
        }

        if (value === null || value === undefined) {
          throw new Error("FILL value missing.");
        }

        console.log(`⌨️ [AdaptiveWebExecutor] FILL ${selector}`);

        await this.browser.fill(selector, value);

        return;
      }

      case "PRESS":
        if (!action.selector) {
          throw new Error("PRESS selector missing.");
        }

        if (!action.key) {
          throw new Error("PRESS key missing.");
        }

        console.log(
          `⌨️ [AdaptiveWebExecutor] PRESS ${action.key} → ${action.selector}`,
        );

        await this.browser.press(action.selector, action.key);

        return;

      case "OPEN":
        if (!action.value) {
          throw new Error("OPEN URL missing.");
        }

        console.log(`🌐 [AdaptiveWebExecutor] OPEN ${action.value}`);

        await this.browser.open(action.value);

        return;

      case "BLOCKED":
      case "DONE":
        return;

      default:
        throw new Error(`Unsupported adaptive action: ${action.type}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
