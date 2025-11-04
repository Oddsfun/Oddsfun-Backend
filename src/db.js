import Database from 'better-sqlite3';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', 10);
export const db = new Database('odds.db');

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS markets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    yes INTEGER NOT NULL DEFAULT 50,
    no INTEGER NOT NULL DEFAULT 50,
    status TEXT NOT NULL DEFAULT 'LIVE',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bets (
    id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('YES','NO')),
    amount_sol REAL NOT NULL,
    wallet TEXT NOT NULL,
    chain TEXT NOT NULL, -- 'solana' | 'evm'
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL, -- 'PENDING','CONFIRMED','FAILED','RECEIPT_ONLY'
    tx TEXT,     -- on-chain signature / tx hash
    proof TEXT,  -- any zk/receipt hash placeholder
    FOREIGN KEY (market_id) REFERENCES markets(id)
  );
`);

export function seedIfEmpty() {
  const count = db.prepare(`SELECT COUNT(*) as c FROM markets`).get().c;
  if (count > 0) return;

  const now = Date.now();
  const data = [
    ['New York City Mayoral Election','Politics',62,38],
    ['New Jersey Governor Election 2025','Politics',74,26],
    ['Democratic sweep in Congress?','Politics',41,59],
    ['Zohra Mamdani margin > 10%','Politics',28,72],
    ['Heat vs Clippers — Heat win','Sports',46,54],
    ['Kraken beat Blackhawks','Sports',64,36],
    ['Canucks beat Predators','Sports',58,42],
    ['Seattle vs Minnesota — Seattle win','Sports',62,38],
    ['US Gov shutdown ends by next week','Macro',14,86],
    ['Fed rate cut in December','Macro',35,65],
    ['BTC > $100k by EOY','Crypto',22,78],
    ['SOL > $400 by Q4','Crypto',31,69],
    ['ETH ETF approved this quarter','Crypto',27,73],
    ['Israel–Hamas ceasefire this month','Politics',18,82],
    ['Maduro out by year end','Politics',21,79],
    ['US CPI MoM < 0.1% next print','Macro',44,56],
    ['OpenAI releases new flagship model','Tech',52,48],
    ['Apple headset > 5M shipments in 2026','Tech',19,81],
    ['Bitcoin dominance > 60% this year','Crypto',33,67],
    ['S&P 500 makes new ATH this quarter','Macro',48,52],
  ];

  const stmt = db.prepare(`
    INSERT INTO markets (id,name,category,yes,no,status,created_at)
    VALUES (@id,@name,@category,@yes,@no,'LIVE',@created_at)
  `);

  const insertMany = db.transaction((rows) => {
    for (const [name,category,yes,no] of rows) {
      stmt.run({ id: nanoid(), name, category, yes, no, created_at: now });
    }
  });

  insertMany(data);
}

export function createBet({ market_id, side, amount_sol, wallet, chain, status }) {
  const id = nanoid();
  db.prepare(`
    INSERT INTO bets (id,market_id,side,amount_sol,wallet,chain,created_at,status)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(id, market_id, side, amount_sol, wallet, chain, Date.now(), status);
  return id;
}

export function markBetConfirmed({ id, tx, proof }) {
  db.prepare(`UPDATE bets SET status='CONFIRMED', tx=?, proof=? WHERE id=?`)
    .run(tx, proof ?? null, id);
}

export function markBetFailed({ id, tx, reason }) {
  db.prepare(`UPDATE bets SET status='FAILED', tx=? WHERE id=?`).run(tx ?? null, id);
}

export function listMarkets() {
  return db.prepare(`SELECT * FROM markets WHERE status='LIVE' ORDER BY created_at ASC`).all();
}

export function getBet(id) {
  return db.prepare(`SELECT * FROM bets WHERE id=?`).get(id);
}

export function listBetsForWallet(wallet) {
  return db.prepare(`SELECT * FROM bets WHERE wallet=? ORDER BY created_at DESC`).all(wallet);
}

export function getMarket(id) {
  return db.prepare(`SELECT * FROM markets WHERE id=?`).get(id);
}
