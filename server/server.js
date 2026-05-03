import express from 'express';
import cors from 'cors';
import yahooFinance from 'yahoo-finance2';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE = path.join(__dirname, 'data', 'cache.json');
const LOG_DIR = path.join(__dirname, 'session_logs');
const SESSION_LOG_FILE = path.join(LOG_DIR, `log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);

const app = express();
app.use(cors());
app.use(express.json());

// Session Logging Middleware
app.use(async (req, res, next) => {
  const logEntry = `[${new Date().toISOString()}] ${req.method} ${req.url}\n`;
  try {
    await fs.appendFile(SESSION_LOG_FILE, logEntry);
  } catch (err) {
    console.error('Logging failed:', err);
  }
  next();
});

// Initialize cache and logs
async function init() {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.appendFile(SESSION_LOG_FILE, `[${new Date().toISOString()}] Server Started\n`);
    try {
      await fs.access(CACHE_FILE);
    } catch {
      await fs.writeFile(CACHE_FILE, JSON.stringify({}));
    }
  } catch (error) {
    console.error('Error initializing data dirs:', error);
  }
}
init();

app.post('/api/market-data', async (req, res) => {
  const { tickers } = req.body;
  if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
    return res.json({});
  }

  try {
    // Read current cache
    const cacheData = await fs.readFile(CACHE_FILE, 'utf-8');
    let cache = JSON.parse(cacheData);
    let updated = false;

    const results = {};

    // First populate from cache for instant response
    for (const ticker of tickers) {
      if (cache[ticker]) {
        results[ticker] = cache[ticker];
      }
    }

    // Attempt to fetch fresh data for all requested tickers in the background
    // (We'll await it here, but we could return cache first and fetch async if we wanted to be truly "instant".
    //  However, Yahoo Finance is fast enough that awaiting it is usually fine for a local app.)
    for (const ticker of tickers) {
      try {
        const quote = await yahooFinance.quote(ticker);
        const newData = {
          name: quote.longName || quote.shortName || ticker,
          exchange: quote.exchange || 'N/A',
          type: quote.quoteType || 'Equity',
          industry: quote.industry || 'N/A',
          price: quote.regularMarketPrice || 0,
          currency: quote.currency || 'CAD'
        };
        cache[ticker] = newData;
        results[ticker] = newData;
        updated = true;
      } catch (err) {
        console.error(`Failed to fetch ${ticker}:`, err.message);
        // If it fails, we just keep what's in the cache
      }
    }

    // Save cache to disk
    if (updated) {
      await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
    }

    res.json(results);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to process market data' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Local WealthTracker backend running on http://localhost:${PORT}`);
});
