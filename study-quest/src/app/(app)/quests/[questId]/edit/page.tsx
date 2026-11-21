import { Suspense } from "react";
import { QuestEditView } from "@/components/quest/QuestEditView";

export default async function QuestEditPage({ params }: { params: Promise<{ questId: string }> }) {
  const { questId } = await params;
  return (
    <Suspense>
      <QuestEditView questId={questId} />
    </Suspense>
  );
}
