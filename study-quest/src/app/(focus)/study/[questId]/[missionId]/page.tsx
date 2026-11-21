import { SessionView } from "@/components/session/SessionView";

export const metadata = { title: "Focus" };

export default async function StudyPage({ params }: { params: Promise<{ questId: string; missionId: string }> }) {
  const { questId, missionId } = await params;
  return <SessionView questId={questId} missionId={missionId} />;
}
