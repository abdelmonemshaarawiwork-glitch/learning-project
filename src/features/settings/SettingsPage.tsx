import { Archive, BookOpen, Database, Droplets, Flag, Gauge, Info, Settings2, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AboutTab, FlagsTab, PreferencesTab } from './GeneralTabs';
import { ReferencesTab } from './ReferencesTab';
import { ProtocolsTab } from './ProtocolsTab';
import { UrineTargetsTab } from './UrineTargetsTab';
import { ThresholdsTab } from './ThresholdsTab';
import { BackupTab } from './backup/BackupTab';
import { DataTab } from './DataTab';
import { AccountTab } from '@/features/auth/AccountTab';

const TABS = [
  { id: 'preferences', label: 'Preferences', icon: Settings2 },
  { id: 'references', label: 'Clinical references', icon: BookOpen },
  { id: 'protocols', label: 'Fluid protocols', icon: Droplets },
  { id: 'urine', label: 'Urine targets', icon: Gauge },
  { id: 'thresholds', label: 'Warning thresholds', icon: SlidersHorizontal },
  { id: 'flags', label: 'Attention flags', icon: Flag },
  { id: 'backup', label: 'Backup & restore', icon: Archive },
  { id: 'data', label: 'Data management', icon: Database },
  { id: 'about', label: 'Privacy & about', icon: Info },
  { id: 'account', label: 'Account', icon: UserRound },
] as const;

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab')! : 'preferences';
  return (
    <>
      <PageHeader title="Settings" description="Preferences, clinical reference configuration, backup, data management and your account." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              <t.icon /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>
        <TabsContent value="references">
          <ReferencesTab />
        </TabsContent>
        <TabsContent value="protocols">
          <ProtocolsTab />
        </TabsContent>
        <TabsContent value="urine">
          <UrineTargetsTab />
        </TabsContent>
        <TabsContent value="thresholds">
          <ThresholdsTab />
        </TabsContent>
        <TabsContent value="flags">
          <FlagsTab />
        </TabsContent>
        <TabsContent value="backup">
          <BackupTab />
        </TabsContent>
        <TabsContent value="data">
          <DataTab />
        </TabsContent>
        <TabsContent value="about">
          <AboutTab />
        </TabsContent>
        <TabsContent value="account">
          <AccountTab />
        </TabsContent>
      </Tabs>
      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" /> Settings are stored locally on this device, separately for each account.
      </p>
    </>
  );
}
