import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp, DollarSign, Activity, Upload, ArrowUpRight,
  ArrowDownRight, BarChart3, PieChart, Wallet, ShieldCheck, Landmark
} from 'lucide-react';

// --- Configuration ---
// Using local backend for API calls

const formatCurrency = (value, currency = 'CAD') =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(value || 0);

// --- CSV Row Parser Utility ---
function parseCSVRow(row) {
  let insideQuote = false;
  let entries = [];
  let entry = [];
  for (let i = 0; i < row.length; i++) {
    let char = row[i];
    if (char === '"') insideQuote = !insideQuote;
    else if (char === ',' && !insideQuote) {
      entries.push(entry.join('').trim());
      entry = [];
    } else { entry.push(char); }
  }
  entries.push(entry.join('').trim());
  return entries;
}

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [marketPrices, setMarketPrices] = useState({});
  const [securityMetadata, setSecurityMetadata] = useState({});
  const [activeTab, setActiveTab] = useState('summary');
  const [notification, setNotification] = useState(null);
  const fileInputRef = useRef(null);

  // --- Market Data Fetching (Local Backend) ---
  const fetchMarketData = async (tickers) => {
    if (!tickers || tickers.length === 0) return;
    try {
      const response = await fetch('http://localhost:3001/api/market-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers })
      });
      const data = await response.json();
      
      const newMeta = {};
      const newPrices = {};
      for (const [ticker, info] of Object.entries(data)) {
        newMeta[ticker] = { name: info.name, exchange: info.exchange, type: info.type, industry: info.industry };
        newPrices[ticker] = info.price;
      }
      setSecurityMetadata(prev => ({ ...prev, ...newMeta }));
      setMarketPrices(prev => ({ ...prev, ...newPrices }));
    } catch (err) {
      console.error("Market data fetch failed", err);
    }
  };

  // --- 10 Minute Polling ---
  useEffect(() => {
    const uniqueTickers = [...new Set(transactions.map(t => t.ticker))].filter(Boolean);
    if (uniqueTickers.length === 0) return;

    const intervalId = setInterval(() => {
      fetchMarketData(uniqueTickers);
    }, 600000); // 10 minutes

    return () => clearInterval(intervalId);
  }, [transactions]);

  // --- Wealthsimple CSV Parser Logic ---
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.split('\n');
      const headers = parseCSVRow(lines[0].toLowerCase());

      const idx = {
        date: headers.findIndex(h => h.includes('transaction_date')),
        activityType: headers.findIndex(h => h.includes('activity_type')),
        activity: headers.findIndex(h => h === 'activity'),
        symbol: headers.findIndex(h => h.includes('symbol')),
        qty: headers.findIndex(h => h.includes('quantity')),
        price: headers.findIndex(h => h.includes('unit_price')),
        account: headers.findIndex(h => h.includes('account_type')),
        amount: headers.findIndex(h => h.includes('net_cash_amount')),
        currency: headers.findIndex(h => h.includes('currency'))
      };

      const imported = lines.slice(1).filter(l => l.trim()).map(line => {
        const row = parseCSVRow(line);
        const actType = (row[idx.activityType] || '').toLowerCase();
        const act = (row[idx.activity] || '').toLowerCase();
        const actionStr = actType + ' ' + act;
        const netAmt = parseFloat(row[idx.amount]) || 0;

        let type = 'other';
        if (actionStr.includes('buy')) type = 'buy';
        else if (actionStr.includes('sell')) type = 'sell';
        else if (actionStr.includes('moneymovement') || actionStr.includes('eft')) {
          type = netAmt >= 0 ? 'deposit' : 'withdrawal';
        }

        if (type === 'other') return null;

        const ticker = (row[idx.symbol] || '').toUpperCase();
        return {
          id: Math.random().toString(36).substr(2, 9),
          date: row[idx.date],
          type,
          ticker,
          shares: (type === 'buy' || type === 'sell') ? Math.abs(parseFloat(row[idx.qty]) || 0) : 0,
          price: (type === 'deposit' || type === 'withdrawal') ? Math.abs(netAmt) : parseFloat(row[idx.price]) || 0,
          account: row[idx.account] || 'Personal',
          currency: row[idx.currency] || 'CAD'
        };
      }).filter(Boolean);

      setTransactions(prev => [...prev, ...imported]);

      const uniqueTickers = [...new Set(imported.map(i => i.ticker))].filter(Boolean);
      fetchMarketData(uniqueTickers);

      if (imported.length === 0) {
        setNotification(`Error: No valid records found. Make sure it is a Wealthsimple CSV.`);
      } else {
        setNotification(`Imported ${imported.length} supported records.`);
      }
      setTimeout(() => setNotification(null), 4000);
      event.target.value = ''; // Reset input so the same file can be re-imported if needed
    };
    reader.readAsText(file);
  };

  // --- Portfolio Calculations ---
  const holdings = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      if (!t.ticker) return;
      const key = `${t.ticker}-${t.account}`;
      if (!map[key]) map[key] = { ticker: t.ticker, account: t.account, shares: 0, cost: 0, currency: t.currency };

      if (t.type === 'buy') {
        map[key].shares += t.shares;
        map[key].cost += t.shares * t.price;
      } else if (t.type === 'sell') {
        const avg = map[key].shares > 0 ? map[key].cost / map[key].shares : 0;
        map[key].shares -= t.shares;
        map[key].cost -= t.shares * avg;
      }
    });

    return Object.values(map).filter(h => Math.abs(h.shares) > 0.0001).map(h => {
      const meta = securityMetadata[h.ticker] || { name: h.ticker, industry: 'Fetching...' };
      const currentPrice = marketPrices[h.ticker] || (h.shares > 0 ? h.cost / h.shares : 0);
      return {
        ...h, ...meta, currentPrice,
        marketValue: h.shares * currentPrice,
        unrealizedGain: (h.shares * currentPrice) - h.cost,
        avgCost: h.shares > 0 ? h.cost / h.shares : 0
      };
    });
  }, [transactions, securityMetadata, marketPrices]);

  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-6 font-sans">
      <nav className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-2 text-indigo-400 font-black text-2xl tracking-tighter">
          <Activity size={28} /> WealthLogic
        </div>
        <div className="flex items-center gap-3">
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
          <button
            onClick={() => fileInputRef.current.click()}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-xs font-bold transition-all border border-slate-700 shadow-lg"
          >
            <Upload size={14} /> Import Wealthsimple CSV
          </button>
          <div className="h-8 w-[1px] bg-slate-800 mx-2 hidden md:block"></div>
          <div className="flex bg-slate-900 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-4 py-2 rounded-lg text-[10px] uppercase tracking-widest font-black transition-all ${activeTab === 'summary' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Summary
            </button>
            <button
              onClick={() => setActiveTab('holdings')}
              className={`px-4 py-2 rounded-lg text-[10px] uppercase tracking-widest font-black transition-all ${activeTab === 'holdings' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Holdings
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto space-y-8">
        {activeTab === 'summary' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-indigo-600 p-8 rounded-3xl shadow-2xl shadow-indigo-500/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Wallet size={120} /></div>
              <p className="text-xs uppercase font-black text-indigo-100 tracking-widest mb-2">Portfolio Value (CAD)</p>
              <p className="text-4xl font-black text-white tracking-tight">{formatCurrency(totalValue)}</p>
            </div>
            <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-xl">
              <p className="text-xs uppercase font-black text-slate-500 tracking-widest mb-2">Total Gain/Loss</p>
              <p className={`text-3xl font-black ${holdings.reduce((s, h) => s + h.unrealizedGain, 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(holdings.reduce((s, h) => s + h.unrealizedGain, 0))}
              </p>
            </div>
            <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-xl">
              <p className="text-xs uppercase font-black text-slate-500 tracking-widest mb-2">Open Positions</p>
              <p className="text-3xl font-black text-white">{holdings.length}</p>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/50 text-[10px] uppercase font-black text-slate-500 tracking-widest">
                  <tr>
                    <th className="px-6 py-5">Symbol</th>
                    <th className="px-6 py-5">Industry</th>
                    <th className="px-6 py-5 text-center">Curr</th>
                    <th className="px-6 py-5 text-right">Account</th>
                    <th className="px-6 py-5 text-right">Market Value</th>
                    <th className="px-6 py-5 text-right">Gain</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {holdings.map((h, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="px-6 py-4 font-black text-indigo-400">{h.ticker}</td>
                      <td className="px-6 py-4 text-xs text-slate-400 font-medium">{h.industry}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-[10px] font-bold bg-slate-800 px-2 py-1 rounded text-slate-400 border border-slate-700">{h.currency}</span>
                      </td>
                      <td className="px-6 py-4 text-right text-xs text-slate-500 font-bold">{h.account}</td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-white">{formatCurrency(h.marketValue, h.currency)}</td>
                      <td className={`px-6 py-4 text-right font-mono font-bold ${h.unrealizedGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {h.unrealizedGain >= 0 ? '+' : ''}{formatCurrency(h.unrealizedGain, h.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {notification && (
        <div className="fixed bottom-8 right-8 bg-indigo-600 text-white px-6 py-4 rounded-2xl shadow-2xl font-bold flex items-center gap-3 animate-bounce">
          <ShieldCheck size={20} /> {notification}
        </div>
      )}
    </div>
  );
}