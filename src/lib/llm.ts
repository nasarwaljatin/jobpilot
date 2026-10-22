import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import OpenAI from "openai";
import { z } from "zod";

// One interface over three providers. Whichever key is set is used; LLM_PROVIDER picks one
// explicitly when several are set. NVIDIA's API (build.nvidia.com) is OpenAI-compatible.
export type Provider = "anthropic" | "openai" | "nvidia";

const KEY_ENV: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  nvidia: "NVIDIA_API_KEY",
};

// NVIDIA lists many models, but which ones a given key may call varies by account. Without an
// explicit LLM_MODEL we try these in order and stick with the first that the key can use.
const NVIDIA_MODELS = [
  "nvidia/llama-3.1-nemotron-70b-instruct",
  "mistralai/mistral-large-2-instruct",
  "deepseek-ai/deepseek-v4.1-flash",
  "moonshotai/kimi-k2.6",
  "google/gemma-4-31b-it",
  "openai/gpt-oss-20b",
  "nvidia/nemotron-3-super-120b-a12b",
];

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-4.1-mini",
  nvidia: NVIDIA_MODELS[0],
};

// The NVIDIA model that last worked in this server instance (moved to the front of the chain).
let workingNvidiaModel: string | undefined;

export class AiError extends Error {}

const apiKey = (p: Provider) => process.env[KEY_ENV[p]];

export function activeProvider(): Provider | null {
  const forced = process.env.LLM_PROVIDER?.trim().toLowerCase() as Provider | undefined;
  if (forced && forced in KEY_ENV) return apiKey(forced) ? forced : null;
  return (["anthropic", "openai", "nvidia"] as const).find((p) => apiKey(p)) ?? null;
}

export function activeModel(p: Provider): string {
  return (
    process.env.LLM_MODEL ||
    (p === "anthropic" ? process.env.ANTHROPIC_MODEL : undefined) ||
    (p === "nvidia" ? workingNvidiaModel : undefined) ||
    DEFAULT_MODEL[p]
  );
}

/** Models to try, in order. An explicit LLM_MODEL is the only candidate. */
function candidateModels(p: "openai" | "nvidia"): string[] {
  if (process.env.LLM_MODEL) return [process.env.LLM_MODEL];
  if (p === "openai") return [DEFAULT_MODEL.openai];
  return workingNvidiaModel ? [workingNvidiaModel, ...NVIDIA_MODELS.filter((m) => m !== workingNvidiaModel)] : NVIDIA_MODELS;
}

export const aiEnabled = () => activeProvider() !== null;

type JsonRequest = { system: string; prompt: string; maxTokens: number; effort?: "low" | "medium" | "high" };

/** Runs one prompt and returns output validated against `schema`, whichever provider is active. */
export async function generateJson<S extends z.ZodType>(schema: S, req: JsonRequest): Promise<z.infer<S>> {
  const provider = activeProvider();
  if (!provider) {
    throw new AiError("AI is not configured: set OPENAI_API_KEY, NVIDIA_API_KEY or ANTHROPIC_API_KEY.");
  }
  return provider === "anthropic" ? viaAnthropic(schema, req) : viaOpenAiCompatible(provider, schema, req);
}

async function viaAnthropic<S extends z.ZodType>(schema: S, req: JsonRequest): Promise<z.infer<S>> {
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: activeModel("anthropic"),
      max_tokens: req.maxTokens,
      system: req.system,
      // Server-side fallback re-runs the request on Anthropic's recommended model if a safety classifier declines it.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: req.effort ?? "medium", format: betaZodOutputFormat(schema) },
      messages: [{ role: "user", content: req.prompt }],
    });
    if (response.stop_reason === "refusal") throw new AiError("The model declined this request. Try editing the text.");
    if (response.stop_reason === "max_tokens") throw new AiError("The response was cut off. Please try again.");
    if (!response.parsed_output) throw new AiError("Could not parse the AI response. Please try again.");
    return response.parsed_output as z.infer<S>;
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new AiError("ANTHROPIC_API_KEY is invalid.");
    if (err instanceof Anthropic.NotFoundError) throw new AiError(`Model "${activeModel("anthropic")}" not found. Check ANTHROPIC_MODEL.`);
    if (err instanceof Anthropic.RateLimitError) throw new AiError("Rate limited by Anthropic. Try again in a minute.");
    if (err instanceof Anthropic.APIError) throw new AiError(`AI request failed (${err.status ?? "network"}).`);
    throw err;
  }
}

/** Pulls the JSON object out of a chat reply that may include reasoning tags or prose around it. */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Statuses meaning "this model can't serve this key right now", so the next candidate is tried:
// not found / not enabled for the account (404, 403), retired (410), or down (5xx).
const tryNextModel = (err: unknown) =>
  err instanceof OpenAI.APIError && err.status !== undefined && [403, 404, 410, 500, 502, 503].includes(err.status);

async function viaOpenAiCompatible<S extends z.ZodType>(provider: "openai" | "nvidia", schema: S, req: JsonRequest): Promise<z.infer<S>> {
  const models = candidateModels(provider);
  const unavailable: string[] = [];
  for (const model of models) {
    try {
      const out = await completeWithModel(provider, model, schema, req);
      if (provider === "nvidia") workingNvidiaModel = model;
      return out;
    } catch (err) {
      if (!tryNextModel(err)) throw mapOpenAiError(err, provider, model);
      unavailable.push(`${model} (${(err as InstanceType<typeof OpenAI.APIError>).status})`);
    }
  }
  throw new AiError(
    models.length === 1
      ? `Model "${models[0]}" isn't available to your ${KEY_ENV[provider]}. Pick another model for LLM_MODEL.`
      : `None of the default ${provider} models are available to your key (${unavailable.join(", ")}). Set LLM_MODEL to a model your account can use.`,
  );
}

function mapOpenAiError(err: unknown, provider: "openai" | "nvidia", model: string): unknown {
  if (err instanceof AiError) return err;
  const keyName = KEY_ENV[provider];
  if (err instanceof OpenAI.AuthenticationError) return new AiError(`${keyName} is invalid.`);
  if (err instanceof OpenAI.RateLimitError) return new AiError(`Rate limited by ${provider}. Try again in a minute.`);
  if (err instanceof OpenAI.APIError) {
    return new AiError(`AI request to ${model} failed (${err.status ?? "network"}): ${err.message.slice(0, 160)}`);
  }
  return err;
}

/** One model: request, validate against the schema, and retry once with the validation error. */
async function completeWithModel<S extends z.ZodType>(
  provider: "openai" | "nvidia",
  model: string,
  schema: S,
  req: JsonRequest,
): Promise<z.infer<S>> {
  const client = new OpenAI({
    apiKey: apiKey(provider),
    // OPENAI_BASE_URL also lets any OpenAI-compatible host (Groq, OpenRouter, a local server) stand in.
    baseURL:
      provider === "nvidia"
        ? process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1"
        : process.env.OPENAI_BASE_URL || undefined,
  });
  // Not every hosted model supports strict JSON-schema mode, so the schema goes in the prompt
  // and the reply is validated here, with one retry that shows the model its mistake.
  const system = `${req.system}\n\nReply with only a JSON object (no markdown, no commentary) that matches this JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`;
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: req.prompt },
  ];

  for (let attempt = 1; attempt <= 2; attempt++) {
    // API errors propagate to the caller, which decides whether to try the next model.
    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.4,
      ...(provider === "openai"
        ? { max_completion_tokens: req.maxTokens, response_format: { type: "json_object" as const } }
        : // Several NVIDIA-hosted models reject large max_tokens; 4096 covers these JSON replies.
          { max_tokens: Math.min(req.maxTokens, 4096) }),
    });
    const reply = completion.choices[0]?.message?.content ?? "";
    if (completion.choices[0]?.finish_reason === "length") throw new AiError("The response was cut off. Please try again.");

    let problem: string;
    try {
      const parsed = schema.safeParse(extractJson(reply));
      if (parsed.success) return parsed.data;
      problem = parsed.error.message;
    } catch (e) {
      problem = (e as Error).message;
    }
    messages.push(
      { role: "assistant", content: reply },
      { role: "user", content: `That reply was not valid (${problem.slice(0, 300)}). Reply again with only the corrected JSON object.` },
    );
  }
  throw new AiError("The AI reply wasn't in the expected format. Please try again.");
}
