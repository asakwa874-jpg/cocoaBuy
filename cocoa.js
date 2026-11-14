// CocoaBuy: international cocoa reference price (ICE New York) converted to FCFA per kg.
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; CocoaBuy/1.0)' };
const XAF_PER_EUR = 655.957; // fixed peg

async function yahoo(symbol) {
  const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?range=1mo&interval=1d', { headers: UA });
  if (!r.ok) throw new Error('yahoo ' + r.status);
  const res = (((await r.json()).chart || {}).result || [])[0];
  if (!res) throw new Error('yahoo empty');
  const closes = (res.indicators.quote[0].close || []).filter(x => typeof x === 'number');
  if (closes.length < 2) throw new Error('yahoo short');
  return { closes, time: res.meta && res.meta.regularMarketTime };
}

async function stooq(symbol) {
  const r = await fetch('https://stooq.com/q/d/l/?s=' + symbol + '&i=d', { headers: UA });
  if (!r.ok) throw new Error('stooq ' + r.status);
  const rows = (await r.text()).trim().split('\n').slice(1).map(l => l.split(','));
  const closes = rows.map(c => parseFloat(c[4])).filter(x => !isNaN(x)).slice(-30);
  if (closes.length < 2) throw new Error('stooq short');
  return { closes, time: null };
}

async function get(yahooSym, stooqSym) {
  try { return { ...(await yahoo(yahooSym)), source: 'Yahoo Finance' }; }
  catch (e) { return { ...(await stooq(stooqSym)), source: 'Stooq' }; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  try {
    const [cc, fx] = await Promise.all([get('CC=F', 'cc.f'), get('EURUSD=X', 'eurusd')]);
    const c = cc.closes, n = c.length;
    const usd = c[n - 1], prev = c[n - 2], week = c[Math.max(0, n - 6)];
    const eurUsd = fx.closes[fx.closes.length - 1];
    res.status(200).json({
      usdPerTonne: usd,
      eurUsd,
      fcfaPerKg: Math.round(usd * (XAF_PER_EUR / eurUsd) / 1000),
      dayPct: (usd - prev) / prev * 100,
      weekPct: (usd - week) / week * 100,
      asOf: cc.time ? new Date(cc.time * 1000).toISOString() : new Date().toISOString(),
      source: cc.source + ' (ICE NY cocoa futures)'
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
