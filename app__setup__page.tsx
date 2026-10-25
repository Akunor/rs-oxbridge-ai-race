import { PageHeader } from "@/components/ui";
import { SetupPanel } from "@/components/setup/SetupPanel";
import { ChallengesPanel } from "@/components/setup/ChallengesPanel";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  return (
    <>
      <PageHeader eyebrow="Team only" title="Setup & challenges">
        Check what&apos;s configured, make the team wallet, and run the on-chain bonus challenges with one click each.
      </PageHeader>
      <SetupPanel />
      <ChallengesPanel />
    </>
  );
}
