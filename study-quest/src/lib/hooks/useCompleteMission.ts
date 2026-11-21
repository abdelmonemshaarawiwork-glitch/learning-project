"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { useI18n } from "@/components/providers/I18nProvider";
import { actions, type CompletionResult } from "@/lib/client/actions";
import { apiErrorMessage } from "@/lib/client/errors";

export function useCompleteMission() {
  const { t } = useI18n();
  const { celebrate } = useFeedback();
  const [pending, setPending] = useState<string | null>(null);
  const complete = useCallback(
    async (questId: string, missionId: string): Promise<CompletionResult | null> => {
      setPending(missionId);
      try {
        const r = await actions.completeMission(questId, missionId);
        celebrate(r);
        return r;
      } catch (e) {
        toast.error(apiErrorMessage(t, e));
        return null;
      } finally {
        setPending(null);
      }
    },
    [celebrate, t],
  );
  return { complete, pending };
}
