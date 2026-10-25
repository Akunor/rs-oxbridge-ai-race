import { PageHeader } from "@/components/ui";
import { VerifyWallet } from "@/components/merchant/VerifyWallet";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ name?: string; address?: string; return?: string }> }) {
  const sp = await searchParams;
  const returnTo = sp.return && sp.return.startsWith("/") && !sp.return.startsWith("//") ? sp.return : undefined;
  return (
    <>
      <PageHeader eyebrow="Confirmation of Payee · proof of control" title={<>Prove you own<br />this wallet.</>}>
        Sign a one-time code with your wallet. It&apos;s free, moves no money, and only the real owner of the wallet can do it. Once signed, agents using PayeeGuard can pay
        you without a hold.
      </PageHeader>
      <VerifyWallet initialName={sp.name ?? ""} initialAddress={sp.address ?? ""} returnTo={returnTo} />
    </>
  );
}
