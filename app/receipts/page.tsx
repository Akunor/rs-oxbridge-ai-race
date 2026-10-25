import { redirect } from "next/navigation";

/** Receipts list retired — in-memory KV made the audit trail empty across instances. */
export default function ReceiptsPage() {
  redirect("/demo");
}
