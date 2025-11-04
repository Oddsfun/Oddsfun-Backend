import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

const commitment = 'confirmed';

export function connection(rpc) {
  return new Connection(rpc, commitment);
}

/**
 * Build a transaction that transfers `amountSol` from `fromPubkey` to `treasuryPubkey`.
 * Caller (frontend) will sign & send with Phantom.
 */
export async function buildSolTransferTx({ rpc, fromPubkey, treasuryPubkey, amountSol }) {
  const conn = connection(rpc);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash({ commitment });

  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: new PublicKey(fromPubkey),
  }).add(
    SystemProgram.transfer({
      fromPubkey: new PublicKey(fromPubkey),
      toPubkey: new PublicKey(treasuryPubkey),
      lamports: Math.round(amountSol * LAMPORTS_PER_SOL),
    })
  );

  // serialize without requiring all signatures so the client can sign
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return { txBase64: Buffer.from(serialized).toString('base64'), lastValidBlockHeight };
}

/**
 * Verify a confirmed transaction actually moved the expected lamports to treasury from user.
 */
export async function verifySolTransfer({ rpc, signature, fromPubkey, toPubkey, expectedLamports }) {
  const conn = connection(rpc);

  const parsed = await conn.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment,
  });

  if (!parsed) return { ok: false, reason: 'TX_NOT_FOUND' };

  // Look through parsed instructions for a SystemProgram transfer
  const ix = (parsed.transaction.message.instructions || [])
    .find(i => i.program === 'system' && i.parsed?.type === 'transfer');

  if (!ix) return { ok: false, reason: 'NO_TRANSFER_IN_TX' };

  const info = ix.parsed.info;
  const actualFrom = info.source;
  const actualTo = info.destination;
  const actualLamports = Number(info.lamports);

  const ok =
    actualFrom === fromPubkey &&
    actualTo === toPubkey &&
    actualLamports === expectedLamports;

  return ok
    ? { ok: true }
    : { ok: false, reason: `MISMATCH from=${actualFrom} to=${actualTo} lamports=${actualLamports}` };
}
