import "server-only";
import { createHash } from "node:crypto";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getAddressDecoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  getUtf8Encoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { findAssociatedTokenPda, getTransferCheckedInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { kvGet, kvSet } from "@/lib/guard/kv";
import { loadAgentSigner } from "@/lib/payments/client";

// The optional on-chain challenges (Operation 30/50/70 + Minesweeper 90/80/30 = 350 points),
// solved with the team wallet (AGENT_PRIVATE_KEY, registered on the team page).
//   Operation:   one transaction with the exact fee AND the right memo passes all three tiers.
//   Minesweeper: mint a code, read it, present it within ~1 minute: passes all three tiers.

export const BUREAU = {
  programId: process.env.BUREAU_PROGRAM_ID || "H2wWqEUUbQ3LJGWLAYyLK8vop4zxeX69r1cXeNpY4XXk",
  credMint: process.env.CRED_MINT || "AwPoLn4inVqixYn9Uab2JonLBqdKZDC6poXHtjWcBnG3",
  presentation: process.env.PRESENTATION_ACCOUNT || "HdMsqBdAW8mbrhJzHztqr1XVP1km3fXWHm7u8DpJeD9e",
  salt: process.env.BUREAU_SALT || "830797a34fd3",
  rpcUrl: process.env.BUREAU_RPC_URL || "https://devnet.helius-rpc.com/?api-key=20933d58-7daa-4b04-af3b-32f24c16409e",
  credDecimals: 6,
};

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const INSTRUCTIONS_SYSVAR = "Sysvar1nstructions1111111111111111111111111";
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const rpc = () => createSolanaRpc(BUREAU.rpcUrl);
const utf8 = getUtf8Encoder();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function challengeId(): string {
  const id = process.env.CHALLENGE_ID?.trim();
  if (!id) throw new Error("CHALLENGE_ID is not set. Copy your Challenge ID from your team page into the environment.");
  return id;
}

export async function pda(seeds: string[]): Promise<Address> {
  const [p] = await getProgramDerivedAddress({ programAddress: address(BUREAU.programId), seeds: seeds.map((s) => utf8.encode(s)) });
  return p;
}

async function accountBytes(account: string): Promise<Buffer | null> {
  const { value } = await rpc().getAccountInfo(address(account), { encoding: "base64", commitment: "confirmed" }).send();
  return value ? Buffer.from(value.data[0], "base64") : null;
}

// ---------------------------------------------------------------- decoding (same layout the verifier reads)

export function operationMemo(id: string, nonce: bigint): string {
  const n = Buffer.alloc(8);
  n.writeBigUInt64LE(nonce);
  return createHash("sha256").update(Buffer.concat([Buffer.from(id, "utf8"), n])).digest("hex").slice(0, 16);
}

export function decodeClaim(data: Buffer): { nonce: bigint; clearanceAccount: string } | null {
  if (data.length < 81) return null;
  return { nonce: data.readBigUInt64LE(41), clearanceAccount: getAddressDecoder().decode(data.subarray(49, 81)) };
}

export function decodeDeed(data: Buffer): { operative: string; code: string; issuedSlot: bigint; presented: boolean } | null {
  if (data.length < 12) return null;
  const len = data.readUInt32LE(8);
  const start = 12;
  if (len > 64 || data.length < start + len + 16) return null;
  return {
    operative: data.subarray(start, start + len).toString("utf8"),
    code: data.subarray(start + len, start + len + 8).toString("utf8"),
    issuedSlot: data.readBigUInt64LE(start + len + 8),
    presented: data.length > start + len + 16 ? data[start + len + 16] === 1 : false,
  };
}

export const operationFee = (nonce: bigint) => BigInt(1000) + (nonce % BigInt(9000));
export const memoHash = (id: string) => createHash("sha256").update(Buffer.concat([Buffer.from(id, "utf8"), Buffer.from(BUREAU.salt, "utf8")])).digest();
const discriminator = (name: string) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
const borshString = (s: string) => {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(Buffer.byteLength(s));
  return Buffer.concat([len, Buffer.from(s, "utf8")]);
};

const memoIx = (text: string): Instruction => ({ programAddress: address(MEMO_PROGRAM), accounts: [], data: new Uint8Array(utf8.encode(text)) });

// ---------------------------------------------------------------- sending

async function buildTx(signer: KeyPairSigner, instructions: Instruction[]) {
  const { value: blockhash } = await rpc().getLatestBlockhash({ commitment: "confirmed" }).send();
  return signTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(signer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    ),
  );
}

async function send(signer: KeyPairSigner, instructions: Instruction[]): Promise<{ signature: string; slot: number | null }> {
  const tx = await buildTx(signer, instructions);
  const signature = getSignatureFromTransaction(tx);
  await rpc().sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", preflightCommitment: "confirmed" }).send();
  for (let i = 0; i < 40; i++) {
    const { value } = await rpc().getSignatureStatuses([signature]).send();
    const s = value[0];
    if (s?.err) throw new Error(`Transaction failed on chain: ${JSON.stringify(s.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))} (${signature})`);
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") return { signature, slot: s.slot !== undefined ? Number(s.slot) : null };
    await sleep(700);
  }
  throw new Error(`Not confirmed in time: ${signature}`);
}

async function simulate(signer: KeyPairSigner, instructions: Instruction[]): Promise<{ ok: boolean; logs: string[]; err: unknown }> {
  const tx = await buildTx(signer, instructions);
  const { value } = await rpc()
    .simulateTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" })
    .send();
  return { ok: value.err === null, logs: (value.logs ?? []) as string[], err: value.err };
}

// ---------------------------------------------------------------- status

export interface BureauStatus {
  challengeId: string;
  wallet: string;
  sol: number;
  cred: string;
  operation: { recordFound: boolean; nonce?: string; clearanceAccount?: string; fee?: string; memo?: string };
  minesweeper: { holdingsFound: boolean; registrar?: string; deed?: { code: string; issuedSlot: string; presented: boolean } | null; layoutKnown: boolean };
  slot: string;
}

export async function bureauStatus(): Promise<BureauStatus> {
  const id = challengeId();
  const signer = await loadAgentSigner();
  const [teamCred] = await findAssociatedTokenPda({ owner: signer.address, mint: address(BUREAU.credMint), tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const [lamports, credBal, claimBytes, holdingsBytes, deedBytes, slot, layout] = await Promise.all([
    rpc().getBalance(signer.address, { commitment: "confirmed" }).send().then((r) => Number(r.value)),
    rpc().getTokenAccountBalance(teamCred, { commitment: "confirmed" }).send().then((r) => r.value.uiAmountString ?? "0").catch(() => "0 (no CRED account yet)"),
    pda(["claim", id.toLowerCase()]).then(accountBytes),
    pda(["holdings", id]).then(accountBytes),
    pda(["deed", id]).then(accountBytes),
    rpc().getSlot({ commitment: "confirmed" }).send(),
    kvGet<number>(LAYOUT_KEY),
  ]);
  const claim = claimBytes ? decodeClaim(claimBytes) : null;
  const deed = deedBytes ? decodeDeed(deedBytes) : null;
  return {
    challengeId: id,
    wallet: signer.address,
    sol: lamports / 1e9,
    cred: credBal,
    operation: claim
      ? { recordFound: true, nonce: claim.nonce.toString(), clearanceAccount: claim.clearanceAccount, fee: operationFee(claim.nonce).toString(), memo: operationMemo(id, claim.nonce) }
      : { recordFound: false },
    minesweeper: {
      holdingsFound: !!holdingsBytes,
      registrar: holdingsBytes && holdingsBytes.length >= 40 ? getAddressDecoder().decode(holdingsBytes.subarray(8, 40)) : undefined,
      deed: deed ? { code: deed.code, issuedSlot: deed.issuedSlot.toString(), presented: deed.presented } : null,
      layoutKnown: layout !== null,
    },
    slot: slot.toString(),
  };
}

// ---------------------------------------------------------------- Operation (tiers 1–3 in one transaction)

export async function runOperation(): Promise<{ signature: string; fee: string; memo: string; clearanceAccount: string }> {
  const id = challengeId();
  const signer = await loadAgentSigner();
  const claimBytes = await accountBytes(await pda(["claim", id.toLowerCase()]));
  const claim = claimBytes ? decodeClaim(claimBytes) : null;
  if (!claim) throw new Error("Your verification record isn't on chain yet. Register the team wallet on your team page, then ask an organiser to run the challenge setup (seed) for your team.");
  const fee = operationFee(claim.nonce);
  const memo = operationMemo(id, claim.nonce);
  const mint = address(BUREAU.credMint);
  const [source] = await findAssociatedTokenPda({ owner: signer.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  // The clearance account is a CRED token account: pay it directly.
  const { signature } = await send(signer, [
    getTransferCheckedInstruction({ source, mint, destination: address(claim.clearanceAccount), authority: signer, amount: fee, decimals: BUREAU.credDecimals }),
    memoIx(memo),
  ]);
  return { signature, fee: fee.toString(), memo, clearanceAccount: claim.clearanceAccount };
}

// ---------------------------------------------------------------- Minesweeper

// mint_code has no published IDL, so the order of its accounts isn't documented. We try likely
// layouts with free simulations (nothing is sent) and remember the one the program accepts.
type Slot = "config" | "holdings" | "deed" | "instructions" | "system";
const LAYOUT_KEY = "pg:bureau:mint-layout";

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

/** Candidate layouts, most likely first. Each: account order after the signer + where the memo goes. */
export function candidateLayouts(): { order: Slot[]; memoFirst: boolean }[] {
  const seen = new Set<string>();
  const out: { order: Slot[]; memoFirst: boolean }[] = [];
  const add = (order: Slot[]) => {
    for (const memoFirst of [false, true]) {
      const key = `${order.join(",")}|${memoFirst}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ order, memoFirst });
      }
    }
  };
  const records: Slot[] = ["config", "holdings", "deed"];
  // 1) record accounts first (any order), then the two sysvars/programs.
  for (const p of permutations(records)) {
    add([...p, "instructions", "system"]);
    add([...p, "system", "instructions"]);
  }
  // 2) without the config account.
  for (const p of permutations<Slot>(["holdings", "deed"])) {
    add([...p, "instructions", "system"]);
    add([...p, "system", "instructions"]);
  }
  // 3) everything else.
  for (const p of permutations<Slot>(["config", "holdings", "deed", "instructions", "system"])) add(p);
  return out;
}

async function mintInstructions(signer: KeyPairSigner, id: string, layout: { order: Slot[]; memoFirst: boolean }): Promise<Instruction[]> {
  const holdingsAddr = await pda(["holdings", id]);
  const holdings = await accountBytes(holdingsAddr);
  if (!holdings || holdings.length < 40) throw new Error("Your holdings record isn't on chain yet. Ask an organiser to run the challenge setup (seed) for your team.");
  const registrar = getAddressDecoder().decode(holdings.subarray(8, 40));
  const hash = memoHash(id);
  const addresses: Record<Slot, { address: Address; role: AccountRole }> = {
    config: { address: await pda(["config"]), role: AccountRole.WRITABLE },
    holdings: { address: holdingsAddr, role: AccountRole.WRITABLE },
    deed: { address: await pda(["deed", id]), role: AccountRole.WRITABLE },
    instructions: { address: address(INSTRUCTIONS_SYSVAR), role: AccountRole.READONLY },
    system: { address: address(SYSTEM_PROGRAM), role: AccountRole.READONLY },
  };
  const accounts = [
    { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
    ...layout.order.map((slot) => addresses[slot]),
    // The registrar key as the first extra ("remaining") account.
    { address: address(registrar), role: registrar === signer.address ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY, ...(registrar === signer.address ? { signer } : {}) },
  ];
  const mint: Instruction = {
    programAddress: address(BUREAU.programId),
    accounts: accounts as never,
    data: new Uint8Array(Buffer.concat([discriminator("mint_code"), borshString(id), hash])),
  };
  const memo = memoIx(hash.toString("hex"));
  return layout.memoFirst ? [memo, mint] : [mint, memo];
}

/** Tries up to `batch` layouts starting at `from`. Returns the working index once found. */
export async function discoverMintLayout(from = 0, batch = 10): Promise<{ found: number | null; tried: number; total: number; next: number; lastLogs: string[] }> {
  const known = await kvGet<number>(LAYOUT_KEY);
  const layouts = candidateLayouts();
  if (known !== null && from === 0) return { found: known, tried: 0, total: layouts.length, next: known, lastLogs: [] };
  const id = challengeId();
  const signer = await loadAgentSigner();
  let lastLogs: string[] = [];
  let tried = 0;
  for (let i = from; i < Math.min(layouts.length, from + batch); i++) {
    const sim = await simulate(signer, await mintInstructions(signer, id, layouts[i]));
    tried++;
    if (sim.ok) {
      await kvSet(LAYOUT_KEY, i);
      return { found: i, tried, total: layouts.length, next: i, lastLogs: sim.logs.slice(-6) };
    }
    lastLogs = sim.logs.slice(-6);
  }
  return { found: null, tried, total: layouts.length, next: from + tried, lastLogs };
}

/** Mint → read → present, as fast as possible (all three Minesweeper tiers). */
export async function runMinesweeper(layoutIndex?: number): Promise<{ mintSignature: string; presentSignature: string; code: string; issuedSlot: string; presentedSlot: number | null; slotsAfterMint: number | null }> {
  const id = challengeId();
  const signer = await loadAgentSigner();
  const index = layoutIndex ?? (await kvGet<number>(LAYOUT_KEY));
  if (index === null || index === undefined) throw new Error("Run 'Find the mint_code layout' first.");
  const layout = candidateLayouts()[index];
  if (!layout) throw new Error("Unknown layout. Run the layout search again.");

  const mint = await send(signer, await mintInstructions(signer, id, layout));
  const deedAddr = await pda(["deed", id]);
  let deed: ReturnType<typeof decodeDeed> = null;
  for (let i = 0; i < 20 && !deed; i++) {
    const bytes = await accountBytes(deedAddr);
    const d = bytes ? decodeDeed(bytes) : null;
    if (d && d.operative === id && (mint.slot === null || d.issuedSlot >= BigInt(mint.slot) - BigInt(5))) deed = d;
    else await sleep(500);
  }
  if (!deed) throw new Error(`Minted (${mint.signature}) but couldn't read the code record yet. Run "Present code" in a few seconds.`);
  const present = await presentCode(signer, id, deed.code);
  return {
    mintSignature: mint.signature,
    presentSignature: present.signature,
    code: deed.code,
    issuedSlot: deed.issuedSlot.toString(),
    presentedSlot: present.slot,
    slotsAfterMint: present.slot !== null ? present.slot - Number(deed.issuedSlot) : null,
  };
}

async function presentCode(signer: KeyPairSigner, id: string, code: string) {
  const mint = address(BUREAU.credMint);
  const [source] = await findAssociatedTokenPda({ owner: signer.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  return send(signer, [
    getTransferCheckedInstruction({ source, mint, destination: address(BUREAU.presentation), authority: signer, amount: BigInt(1), decimals: BUREAU.credDecimals }),
    memoIx(`${id}:${code}`),
  ]);
}

/** Presents the code already on chain (if the full run was interrupted after minting). */
export async function presentExisting(): Promise<{ signature: string; code: string; slotsAfterMint: number | null }> {
  const id = challengeId();
  const signer = await loadAgentSigner();
  const bytes = await accountBytes(await pda(["deed", id]));
  const deed = bytes ? decodeDeed(bytes) : null;
  if (!deed || deed.operative !== id) throw new Error("No code minted yet.");
  const p = await presentCode(signer, id, deed.code);
  return { signature: p.signature, code: deed.code, slotsAfterMint: p.slot !== null ? p.slot - Number(deed.issuedSlot) : null };
}
