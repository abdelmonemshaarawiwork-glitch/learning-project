import { QuestView } from "@/components/quest/QuestView";

export default async function QuestPage({ params }: { params: Promise<{ questId: string }> }) {
  const { questId } = await params;
  return <QuestView questId={questId} />;
}
