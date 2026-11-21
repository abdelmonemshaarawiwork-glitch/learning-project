"use client";

import { Allow, parse as parsePartial } from "partial-json";
import { useCallback, useRef, useState } from "react";
import { ApiClientError, apiStream } from "@/lib/client/api";
import type { PlanDraft } from "@/lib/domain/plan";

export interface PlannerRequest {
  topic: string;
  deadline?: string | null;
  minutesPerDay?: number | null;
  familiarity?: "new" | "some" | "confident" | null;
  feedback?: string;
  completed?: string[];
  locale: "en" | "ar";
}

/** Loosely-typed view of a plan while it is still being written. */
export interface PartialPlan {
  title?: string;
  stages?: { title?: string; levels?: { title?: string; missions?: { title?: string }[] }[] }[];
}

export type GenerationStatus = "idle" | "generating" | "done" | "error";

export function usePlanGeneration() {
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [partial, setPartial] = useState<PartialPlan | null>(null);
  const [plan, setPlan] = useState<PlanDraft | null>(null);
  const [provider, setProvider] = useState<"ai" | "mock" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [charCount, setCharCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (req: PlannerRequest): Promise<{ plan: PlanDraft | null; error: string | null; provider: "ai" | "mock" | null }> => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus("generating");
    setPartial(null);
    setPlan(null);
    setError(null);
    setCharCount(0);
    let text = "";
    let result: PlanDraft | null = null;
    let resultProvider: "ai" | "mock" | null = null;
    let lastParse = 0;
    try {
      await apiStream(
        "/api/planner/generate",
        req,
        (ev) => {
          if (ev.type === "start") setProvider(ev.provider as "ai" | "mock");
          if (ev.type === "delta" && typeof ev.text === "string") {
            text += ev.text;
            setCharCount(text.length);
            const now = Date.now();
            if (now - lastParse > 120) {
              lastParse = now;
              try {
                setPartial(parsePartial(text, Allow.ALL) as PartialPlan);
              } catch {
                /* not parseable yet */
              }
            }
          }
          if (ev.type === "result") {
            result = ev.plan as PlanDraft;
            resultProvider = ev.provider as "ai" | "mock";
            setProvider(resultProvider);
          }
          if (ev.type === "error") throw new ApiClientError(String(ev.code ?? "ai_unavailable"), 502);
        },
        ac.signal,
      );
      if (!result) throw new ApiClientError("network", 0);
      setPlan(result);
      setStatus("done");
      return { plan: result, error: null, provider: resultProvider };
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setStatus("idle");
        return { plan: null, error: null, provider: null };
      }
      const code = e instanceof ApiClientError ? e.code : "ai_unavailable";
      setError(code);
      setStatus("error");
      return { plan: null, error: code, provider: null };
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setPartial(null);
    setPlan(null);
    setError(null);
  }, []);

  return { status, partial, plan, provider, error, charCount, generate, cancel, reset, setPlan };
}
