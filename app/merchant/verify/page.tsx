import { PageHeader } from "@/components/ui";
import { VerifyWallet } from "@/components/merchant/VerifyWallet";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; address?: string; return?: string }>;
}) {
  const sp = await searchParams;
  const returnTo = sp.return && sp.return.startsWith("/") && !sp.return.startsWith("//") ? sp.return : undefined;
  return (
    <>
      <PageHeader eyebrow="HOLD path · unknown payees" title={<>Prove you own this wallet.</>}>
        For payees not yet in the directory: sign a one-time code with the wallet. This does not let a scam site
        impersonate a known brand — lookalikes of onboarded merchants still block. Known vendors are trusted via
        out-of-band onboarding, not a badge on their page.
      </PageHeader>
      <VerifyWallet initialName={sp.name ?? ""} initialAddress={sp.address ?? ""} returnTo={returnTo} />
    </>
  );
}
