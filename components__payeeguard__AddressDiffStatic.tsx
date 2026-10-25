import { shortAddress } from "@/lib/guard/address";

/** What a person sees at a glance: the two short forms look identical. */
export function AddressDiffStatic({ candidate, genuine }: { candidate: string; genuine: string }) {
  return (
    <table className="table">
      <tbody>
        <tr><th>Wallet in this request</th><td className="mono">{shortAddress(candidate)}</td></tr>
        <tr><th>Shop&apos;s verified wallet</th><td className="mono">{shortAddress(genuine)}</td></tr>
      </tbody>
    </table>
  );
}
