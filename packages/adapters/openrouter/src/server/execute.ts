import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  UsageSummary,
} from "@paperclipai/adapter-utils";
import { renderPaperclipWakePrompt } from "@paperclipai/adapter-utils/server-utils";
import {
  OPENROUTER_CHAT_ENDPOINT,
  type OpenRouterConfig,
} from "../index.js";
import { PaperclipApi } from "./paperclip-api.js";
import { loadSkills, renderSkillsForPrompt } from "./skills.js";
import { emitAssistant, emitInit, emitResult, emitSystem, emitToolCall, emitToolResult } from "./transcript.js";
import { buildTools, findTool, toolSchemas } from "./tools.js";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || value.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readToolCallId(value: unknown): string {
  return typeof value === "string" && value.length > 0
    ? value
    : `tool-${Math.random().toString(36).slice(2)}`;
}

function normalizeOpenRouterModel(model: string): string {
  const trimmed = model.trim();
  if (trimmed.startsWith("openrouter/") && trimmed !== "openrouter/auto") {
    return trimmed.slice("openrouter/".length);
  }
  return trimmed;
}

function readIssueId(ctx: AdapterExecutionContext): string | null {
  const c = ctx.context ?? {};
  const direct = asString(c.issueId);
  if (direct) return direct;

  const wake = c.paperclipWake;
  if (wake && typeof wake === "object") {
    const w = wake as Record<string, unknown>;
    const id = asString(w.issueId) || asString(w.taskId);
    if (id) return id;
    const issue = w.issue;
    if (issue && typeof issue === "object") {
      const i = issue as Record<string, unknown>;
      return asString(i.id) || asString(i.key);
    }
  }

  return null;
}

function readWakePrompt(ctx: AdapterExecutionContext, skillsPrompt: string): string {
  const wake = ctx.context?.paperclipWake;
  if (wake) {
    try {
      return renderPaperclipWakePrompt(wake, {});
    } catch {
      return JSON.stringify(wake, null, 2);
    }
  }
  return [
    skillsPrompt,
    typeof ctx.context?.prompt === "string" ? ctx.context.prompt : "",
    typeof ctx.context?.instruction === "string" ? ctx.context.instruction : "",
  ].filter(Boolean).join("\n\n");
}

function buildApi(ctx: AdapterExecutionContext): PaperclipApi | null {
  if (!ctx.authToken) return null;
  return new PaperclipApi({
    authToken: ctx.authToken,
    baseUrl: asString(process.env.PAPERCLIP_API_URL, "http://localhost:3100"),
  });
}

async function addComment(api: PaperclipApi | null, issueId: string | null, body: string) {
  if (!api || !issueId || !body.trim()) return;
  await api.addIssueComment(issueId, { body });
}

async function updateStatus(api: PaperclipApi | null, issueId: string | null, status: string) {
  if (!api || !issueId) return;
  await api.updateIssue(issueId, { status });
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = ctx.config as unknown as OpenRouterConfig;
  const model = normalizeOpenRouterModel(asString(config.model, "openai/gpt-4o-mini"));
  const maxTokens = asNumber(config.maxTokens, 4096);
  const apiKey = asString(config.apiKey) || asString(process.env.OPENROUTER_API_KEY);
  const issueId = readIssueId(ctx);
  const api = buildApi(ctx);

  emitInit(ctx.onLog, { model, sessionId: ctx.runtime.sessionDisplayId ?? ctx.runtime.sessionId ?? ctx.runId });

  if (!apiKey) {
    const errorMessage = "OPENROUTER_API_KEY is not configured.";
    emitSystem(ctx.onLog, errorMessage);
    await addComment(api, issueId, errorMessage);
    await updateStatus(api, issueId, "blocked");
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage,
      provider: "openrouter",
      model,
      billingType: "api",
      summary: errorMessage,
    };
  }

  let prompt = readWakePrompt(ctx, "");

  if (api && issueId) {
    try {
      const issue = await api.getIssue(issueId);
      const title = typeof issue.title === "string" ? issue.title : "";
      const description = typeof issue.description === "string" ? issue.description : "";
      const key = typeof issue.key === "string" ? issue.key : issueId;

      const issuePrompt = [
        "Paperclip issue instruction. Follow this instruction exactly.",
        "",
        `Issue: ${key}`,
        title ? `Title: ${title}` : "",
        description ? `Description:\n${description}` : "",
      ].filter(Boolean).join("\n");

      prompt = `${issuePrompt}\n\nAdditional wake context:\n${prompt}`;
    } catch (err) {
      emitSystem(ctx.onLog, `Could not load issue details, continuing with wake context only: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!prompt.trim()) {
    prompt = "Complete the assigned Paperclip issue. If no details are available, reply with a brief status.";
  }

  const systemPrompt = asString(
    config.systemPrompt,
    "You are a concise Paperclip agent. Follow the issue instructions exactly. Return only the user-facing answer. Do not output API calls, HTTP methods, JSON patches, tool-call descriptions, or status-update instructions. Use available tools when you need to comment, update status, inspect the issue, or create follow-up work."
  );

  const messages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  const tools = api
    ? buildTools({
        api,
        agentId: ctx.agent.id,
        companyId: ctx.agent.companyId,
        currentIssueId: issueId,
        autoApprove: config.autoApprove === true,
      })
    : [];

  let finalText = "";
  let usage: UsageSummary | undefined;
  let costUsd: number | null = null;
  let commentPostedByTool = false;
  let statusUpdatedByTool = false;

  try {
    const maxTurns = Math.max(1, Math.min(asNumber(config.maxTurns, 8), 25));

    for (let turn = 0; turn < maxTurns; turn += 1) {
      const requestBody: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        temperature: typeof config.temperature === "number" ? config.temperature : 0.2,
        messages,
      };

      if (tools.length > 0) {
        requestBody.tools = toolSchemas(tools);
        requestBody.tool_choice = "auto";
      }

      const res = await fetch(OPENROUTER_CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": asString(config.httpReferer, "https://paperclip.local"),
          "X-Title": asString(config.xTitle, "Paperclip OpenRouter Adapter"),
        },
        body: JSON.stringify(requestBody),
      });

      const json = await res.json() as any;

      if (!res.ok) {
        const msg = typeof json?.error?.message === "string" ? json.error.message : `OpenRouter HTTP ${res.status}`;
        throw new Error(msg);
      }

      const inputTokens = Number(json?.usage?.prompt_tokens ?? 0);
      const outputTokens = Number(json?.usage?.completion_tokens ?? 0);
      usage = {
        inputTokens: (usage?.inputTokens ?? 0) + inputTokens,
        outputTokens: (usage?.outputTokens ?? 0) + outputTokens,
      };

      if (typeof json?.usage?.cost === "number") {
        costUsd = (costUsd ?? 0) + json.usage.cost;
      }

      const message = json?.choices?.[0]?.message ?? {};
      const content = typeof message.content === "string" ? message.content.trim() : "";
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

      if (toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: content || null,
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          const toolCallId = readToolCallId(toolCall?.id);
          const functionName = typeof toolCall?.function?.name === "string" ? toolCall.function.name : "";
          const tool = findTool(tools, functionName);
          const args = parseToolArguments(toolCall?.function?.arguments);

          await emitToolCall(ctx.onLog, {
            name: functionName || "unknown_tool",
            input: args,
            toolUseId: toolCallId,
          });

          const result = tool
            ? await tool.execute(args)
            : { content: JSON.stringify({ error: `Unknown tool: ${functionName}` }), isError: true };

          await emitToolResult(ctx.onLog, {
            toolUseId: toolCallId,
            toolName: functionName || "unknown_tool",
            content: result.content,
            isError: result.isError,
          });

          if (!result.isError && functionName === "add_comment") {
            commentPostedByTool = true;
          }
          if (!result.isError && functionName === "update_issue_status") {
            statusUpdatedByTool = true;
          }

          messages.push({
            role: "tool",
            tool_call_id: toolCallId,
            name: functionName,
            content: result.content,
          });
        }

        continue;
      }

      if (content) {
        finalText = content;
      }

      break;
    }

    if (!finalText && !commentPostedByTool) {
      finalText = "_(No output from OpenRouter model)_";
    }

    if (finalText && !commentPostedByTool) {
      await emitAssistant(ctx.onLog, finalText);
      await addComment(api, issueId, finalText);
    } else if (finalText) {
      await emitAssistant(ctx.onLog, finalText);
    }

    if (!statusUpdatedByTool) {
      await updateStatus(api, issueId, "done");
    }

    emitResult(ctx.onLog, {
      text: finalText.slice(0, 500),
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      costUsd: costUsd ?? undefined,
    });

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      usage,
      provider: "openrouter",
      model,
      billingType: "api",
      costUsd,
      summary: finalText.slice(0, 500),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    emitSystem(ctx.onLog, `OpenRouter adapter failed: ${errorMessage}`);
    await addComment(api, issueId, `OpenRouter adapter failed: ${errorMessage}`);
    await updateStatus(api, issueId, "blocked");

    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage,
      provider: "openrouter",
      model,
      billingType: "api",
      summary: errorMessage,
    };
  }
}
