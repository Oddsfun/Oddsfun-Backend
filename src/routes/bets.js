import express from 'express';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { createBet, getMarket, markBetConfirmed, markBetFailed, listBetsForWallet } from '../db.js';
import { buildSolTransferTx, verifySolTransfer } from '../solana.js';
import { assert, parseAmountSol } from '../utils/validate.js';

const router = express.Router();

/**
 * POST /api/bets/initiate
 * Body: { marketId, side: 'YES'|'NO', amountSol, wallet }
 * Returns: { betId, txBase64 }
 *
 * Flow:
 *  1) Validate request & market
 *  2) Create DB bet with status=PENDING
 *  3) Build a Solana transfer TX (user -> TREASURY_PUBKEY)
 *  4) Return base64 TX for Phantom to sign+send client-side
 */
router.post('/initiate', async (req, res, next) => {
  try {
    const { marketId, side, amountSol, wallet } = req.body || {};
    assert(marketId && typeof marketId === 'string', 'marketId is required');
    assert(side === 'YES' || side === 'NO', 'side must be YES or NO');
    const amt = parseAmountSol(amountSol);
    assert(amt && amt >= 0.01, 'Minimum amount is 0.01 SOL');

    // Validate market exists
    const market = getMarket(marketId);
    assert(market, 'Unknown market');

    // Wallet format sanity
    assert(/^([1-9A-HJ-NP-Za-km-z]{32,44})$/.test(wallet), 'Invalid Solana wallet');

    // Create bet row (pending)
    const betId = createBet({
      market_id: marketId,
      side,
      amount_sol: amt,
      wallet,
      chain: 'solana',
      status: 'PENDING',
    });

    // Build TX to treasury
    const { TREASURY_PUBKEY, SOLANA_RPC } = process.env;
    assert(TREASURY_PUBKEY, 'TREASURY_PUBKEY not set', 500);
    new PublicKey(TREASURY_PUBKEY); // throws if invalid

    const { txBase64 } = await buildSolTransferTx({
      rpc: SOLANA_RPC,
      fromPubkey: wallet,
      treasuryPubkey: TREASURY_PUBKEY,
      amountSol: amt,
    });

    return res.json({ ok: true, betId, txBase64 });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/bets/confirm
 * Body: { betId, txSignature, wallet }
 * Verifies on-chain transfer == expected, then marks CONFIRMED.
 */
router.post('/confirm', async (req, res, next) => {
  try {
    const { betId, txSignature, wallet } = req.body || {};
    assert(betId && txSignature && wallet, 'betId, txSignature, wallet are required');

    // Load bet (we need amount & market)
    // We keep it simple: re-query via small helper inline to avoid circular import
    const bet = req.app.locals.db.prepare(`SELECT * FROM bets WHERE id=?`).get(betId);
    assert(bet, 'Bet not found');
    assert(bet.wallet === wallet, 'Wallet mismatch');

    const { SOLANA_RPC, TREASURY_PUBKEY } = process.env;
    const lamports = Math.round(bet.amount_sol * LAMPORTS_PER_SOL);

    const v = await verifySolTransfer({
      rpc: SOLANA_RPC,
      signature: txSignature,
      fromPubkey: wallet,
      toPubkey: TREASURY_PUBKEY,
      expectedLamports: lamports,
    });

    if (!v.ok) {
      markBetFailed({ id: betId, tx: txSignature, reason: v.reason });
      return res.status(400).json({ ok: false, reason: v.reason });
    }

    // Success. In a real ZK flow, produce a receipt/commitment hash here.
    const proof = `bet:${betId}:sig:${txSignature}`;
    markBetConfirmed({ id: betId, tx: txSignature, proof });

    return res.json({ ok: true, betId, txSignature, proof });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/bets/evm-receipt
 * Body: { marketId, side, amount, address, message, signature }
 * Verifies EVM personal_sign; records RECEIPT_ONLY (no on-chain transfer verification).
 */
router.post('/evm-receipt', async (req, res, next) => {
  try {
    const { marketId, side, amount, address, message, signature } = req.body || {};
    assert(marketId && side && amount && address && message && signature, 'Missing fields');
    assert(side === 'YES' || side === 'NO', 'Invalid side');

    // Verify signature with ethers
    const { verifyMessage, getAddress } = await import('ethers');
    const recovered = getAddress(verifyMessage(message, signature));
    assert(recovered.toLowerCase() === address.toLowerCase(), 'Invalid signature');

    const betId = createBet({
      market_id: marketId,
      side,
      amount_sol: Number(amount), // semantic only
      wallet: address,
      chain: 'evm',
      status: 'RECEIPT_ONLY',
    });

    return res.json({ ok: true, betId, recovered });
  } catch (e) {
    next(e);
  }
});

/** GET /api/bets/by/:wallet — list bets for a wallet (solana or evm) */
router.get('/by/:wallet', (req, res) => {
  const items = listBetsForWallet(req.params.wallet);
  res.json({ ok: true, bets: items });
});

export default router;
