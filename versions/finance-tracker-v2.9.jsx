import { useState, useEffect, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCOUNTS_DEFAULT = [
  { id:"main",    name:"Main Account",    type:"current", color:"#60a5fa", icon:"🏦" },
  { id:"grocery", name:"Grocery Account", type:"current", color:"#4ade80", icon:"🛒" },
  { id:"savings", name:"Savings",         type:"savings", color:"#fbbf24", icon:"🏦" },
  { id:"credit",  name:"Credit Card",     type:"credit",  color:"#f87171", icon:"💳" },
];

const CATEGORIES = [
  "Groceries","Fuel","Parking","Eating Out","Takeaway","Subscriptions",
  "Clothing","Health","Home","Transport","Entertainment","Savings","SavingsReturn","Transfer","Other"
];

const CAT_COLORS = {
  Groceries:"#4ade80",  Fuel:"#fb923c",       Parking:"#fbbf24",
  "Eating Out":"#f472b6", Takeaway:"#e879f9", Subscriptions:"#60a5fa",
  Clothing:"#a78bfa",   Health:"#34d399",     Home:"#38bdf8",
  Transport:"#94a3b8",  Entertainment:"#f87171",
  Savings:"#fde68a",    SavingsReturn:"#4ade80", Transfer:"#6b7280", Other:"#4b5563",
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const STORAGE_KEY = "finance-tracker-v5";
const DEFAULT_CYCLE_START = 25;
const EXCLUDE_FROM_SPEND  = ["Savings","SavingsReturn","Transfer"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt       = (n) => "£" + Math.abs(Number(n)).toFixed(2);
const fmtSigned = (n) => (n >= 0 ? "+" : "-") + "£" + Math.abs(Number(n)).toFixed(2);
const todayStr  = () => new Date().toISOString().split("T")[0];
const uid       = () => Math.random().toString(36).slice(2,10);
const ordinal   = (n) => `${n}${["st","nd","rd"][n-1]||"th"}`;

// ─── Pay Cycle ────────────────────────────────────────────────────────────────

function getPeriodKey(dateStr, cycleStart) {
  const d = new Date(dateStr + "T12:00:00");
  let y = d.getFullYear(), m = d.getMonth();
  if (d.getDate() < cycleStart) { m--; if (m < 0) { m = 11; y--; } }
  const lastDay = new Date(y, m+1, 0).getDate();
  const sd = Math.min(cycleStart, lastDay);
  return `${y}-${String(m+1).padStart(2,"0")}-${String(sd).padStart(2,"0")}`;
}

function getPeriodEnd(periodKey, cycleStart) {
  const [y, m] = periodKey.split("-").map(Number);
  let ey = y, em = m + 1;
  if (em > 12) { em = 1; ey++; }
  const lastDay = new Date(ey, em, 0).getDate();
  const endDay  = Math.min(cycleStart, lastDay) - 1;
  if (endDay <= 0) { const l = new Date(y,m,0).getDate(); return `${y}-${String(m).padStart(2,"0")}-${String(l).padStart(2,"0")}`; }
  return `${ey}-${String(em).padStart(2,"0")}-${String(endDay).padStart(2,"0")}`;
}

function getPeriodLabel(pk, cycleStart) {
  const end = getPeriodEnd(pk, cycleStart);
  const s = new Date(pk  + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  const sm = MONTH_NAMES[s.getMonth()], em = MONTH_NAMES[e.getMonth()];
  if (sm === em && s.getFullYear() === e.getFullYear()) return `${sm} ${s.getFullYear()}`;
  return `${sm} ${s.getDate()} – ${em} ${e.getDate()} '${String(e.getFullYear()).slice(2)}`;
}

function getAllPeriods(transactions, cycleStart) {
  return [...new Set(transactions.map(t => getPeriodKey(t.date, cycleStart)))].sort().reverse();
}

// ─── Date Parsing ─────────────────────────────────────────────────────────────

function parseDate(s) {
  if (!s) return todayStr();
  s = s.trim();
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) { const y = m[3].length===2 ? "20"+m[3] : m[3]; return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().split("T")[0];
  return todayStr();
}

// ─── Category Guessing ────────────────────────────────────────────────────────

function guessCategory(desc) {
  const d = (desc||"").toLowerCase();
  if (/lidl|tesco|asda|aldi|sainsbury|morrisons|waitrose|spar|centra|mace|supervalu|dunnes|grocery|food/.test(d)) return "Groceries";
  if (/fuel|petrol|diesel|bp |shell|texaco|esso|applegreen/.test(d))  return "Fuel";
  if (/parking|car park|ncp|q-park/.test(d))                          return "Parking";
  if (/restaurant|cafe|coffee|starbucks|mcdonalds|mcdonald|kfc|burger|pizza|subway|nando/.test(d)) return "Eating Out";
  if (/just eat|deliveroo|uber eat|takeaway/.test(d))                  return "Takeaway";
  if (/netflix|spotify|amazon prime|disney|apple|subscription/.test(d)) return "Subscriptions";
  if (/savings|save|isa/.test(d))                                      return "Savings";
  if (/transfer|trf|tfr|sent to|received from|payment to/.test(d))    return "Transfer";
  if (/health|pharmacy|boots|chemist|doctor|dentist/.test(d))         return "Health";
  if (/clothing|h&m|zara|primark|next|tk maxx/.test(d))               return "Clothing";
  return "Other";
}

// ─── Monzo Category Map ───────────────────────────────────────────────────────

const MONZO_CAT_MAP = {
  "groceries":"Groceries","eating out":"Eating Out","transport":"Transport",
  "fuel":"Fuel","parking":"Parking","entertainment":"Entertainment",
  "shopping":"Clothing","health":"Health","bills":"Subscriptions",
  "savings":"Savings","transfers":"Transfer","personal care":"Health",
  "holidays":"Entertainment","family":"Other","general":"Other",
  "finances":"Transfer","cash":"Other",
};

// ─── Starling Category Map ────────────────────────────────────────────────────

const STARLING_CAT_MAP = {
  "groceries":"Groceries","eating out":"Eating Out","transport":"Transport",
  "fuel":"Fuel","parking":"Parking","entertainment":"Entertainment",
  "shopping":"Clothing","health":"Health","bills":"Subscriptions",
  "income":"Transfer","savings":"Savings","general":"Other",
};

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const first   = lines[0];
  const tabCount   = (first.match(/\t/g)||[]).length;
  const commaCount = (first.match(/,/g)||[]).length;
  const delim = tabCount >= commaCount ? "\t" : ",";
  const splitLine = (line) => delim === "\t"
    ? line.split("\t").map(v => v.replace(/"/g,"").trim())
    : (line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g)||[]).map(v => v.replace(/"/g,"").trim());
  const headers = splitLine(lines[0]).map(h => h.toLowerCase());
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const obj = {};
    headers.forEach((h,i) => { obj[h] = (vals[i]||"").trim(); });
    return obj;
  }).filter(r => Object.values(r).some(v => v));
}

function isMonzoCSV(keys)   { return keys.includes("transaction id") || (keys.includes("name") && keys.includes("emoji")); }
function isStarlingCSV(keys){ return keys.includes("counter party") || keys.includes("amount (gbp)") || keys.includes("spending category"); }

function normaliseRows(rows) {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]);
  const find = (...c) => keys.find(k => c.some(x => k.includes(x)))||null;

  // ── Monzo ──
  if (isMonzoCSV(keys)) {
    return rows.map(r => {
      const moneyOut = Math.abs(parseFloat((r["money out"]||"0").replace(/[£,\s]/g,""))||0);
      const moneyIn  = Math.abs(parseFloat((r["money in"] ||"0").replace(/[£,\s]/g,""))||0);
      const amount   = moneyOut > 0 ? -moneyOut : moneyIn;
      if (amount === 0) return null;
      const cat = r["category"] ? (MONZO_CAT_MAP[(r["category"]||"").toLowerCase()]||null) : null;
      return { date:parseDate(r["date"]||""), description:r["name"]||r["description"]||"", amount, balance:null, nativeCategory:cat, nativeTransferType:null };
    }).filter(Boolean);
  }

  // ── Starling ──
  if (isStarlingCSV(keys)) {
    return rows.map(r => {
      const amount = parseFloat((r["amount (gbp)"]||r["amount"]||"0").replace(/[£,\s]/g,""))||0;
      if (amount === 0) return null;
      const desc       = r["counter party"]||r["reference"]||"";
      const type       = (r["type"]||"").toLowerCase();
      const ref        = (r["reference"]||"").toLowerCase();
      const spendingCat= (r["spending category"]||"").toLowerCase();
      const descLower  = desc.toLowerCase();
      let nativeCat = null, nativeTransferType = null;
      if (Object.values(r).some(v => /easy saver|savings pot|pot transfer/i.test(v||"")) && type==="transfer") {
        nativeCat = amount > 0 ? "SavingsReturn" : "Savings";
        nativeTransferType = "savings";
      } else if (/grocery allowance/.test(ref) || /grocery allowance/.test(descLower) || /charlie devine/.test(descLower)) {
        nativeCat = "Transfer"; nativeTransferType = "grocery";
      } else if (/capital one/i.test(desc) || Object.values(r).some(v => /capital one/i.test(v||""))) {
        nativeCat = "Transfer"; nativeTransferType = "creditcard";
      } else if (/faster payment|transfer/.test(type)) {
        nativeCat = "Transfer";
      } else if (spendingCat) {
        nativeCat = STARLING_CAT_MAP[spendingCat]||null;
      }
      return {
        date:parseDate(r["date"]||""), description:desc, amount,
        balance: parseFloat((r["balance (gbp)"]||r["balance"]||"").replace(/[£,\s]/g,""))||null,
        nativeCategory:nativeCat, nativeTransferType,
      };
    }).filter(Boolean);
  }

  // ── Generic ──
  const dateCol   = find("date","txn date","transaction date","posted");
  const descCol   = find("description","details","narrative","memo","payee","reference","particulars");
  const amtCol    = find("amount","credit/debit","value","debit/credit");
  const debitCol  = find("debit","withdrawal","out");
  const creditCol = find("credit","deposit","in");
  const balCol    = find("balance","running balance");
  return rows.map(r => {
    let amount = 0;
    if (amtCol) { amount = parseFloat((r[amtCol]||"0").replace(/[£,\s]/g,""))||0; }
    else if (debitCol||creditCol) {
      const dv = parseFloat((r[debitCol]||"0").replace(/[£,\s]/g,""))||0;
      const cv = parseFloat((r[creditCol]||"0").replace(/[£,\s]/g,""))||0;
      amount = cv - dv;
    }
    return {
      date:parseDate(dateCol ? r[dateCol] : ""),
      description:descCol ? r[descCol] : Object.values(r).join(" "),
      amount, nativeCategory:null, nativeTransferType:null,
      balance:balCol ? parseFloat((r[balCol]||"0").replace(/[£,\s]/g,""))||null : null,
    };
  }).filter(r => r.amount !== 0);
}

// ─── AI Categorise ────────────────────────────────────────────────────────────

async function aiCategorise(transactions, apiKey="") {
  const sample = transactions.slice(0,80).map((t,i) => `${i}: ${t.description} (${fmt(t.amount)})`).join("\n");
  const headers = {"Content-Type":"application/json"};
  if (apiKey) { headers["x-api-key"]=apiKey.trim(); headers["anthropic-version"]="2023-06-01"; headers["anthropic-dangerous-direct-browser-access"]="true"; }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers,
    body:JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:1000,
      system:`Categorise bank transactions. Return ONLY a JSON array [{index, category}]. Category must be one of: ${CATEGORIES.join(", ")}. No markdown.`,
      messages:[{role:"user",content:`Categorise:\n${sample}`}]
    })
  });
  const data = await res.json();
  const text = data.content?.map(b=>b.text||"").join("")||"[]";
  const s=text.indexOf("["), e=text.lastIndexOf("]");
  if(s===-1||e===-1) return [];
  return JSON.parse(text.slice(s,e+1));
}

// ─── AI Receipt Extraction ───────────────────────────────────────────────────
async function aiExtractReceipt(base64, mediaType, apiKey="") {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages:[{ role:"user", content:[
        {type:"image", source:{type:"base64", media_type:mediaType, data:base64}},
        {type:"text", text:`Extract all items from this receipt and return ONLY this JSON with no extra text or markdown:
{"merchant":"name","date":"YYYY-MM-DD","total":0.00,"items":[{"name":"item","qty":1,"amount":0.00}]}
amount = price per single item.`}
      ]}]
    })
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${raw.slice(0,200)}`);
  const data = JSON.parse(raw);
  if (data.error) throw new Error(data.error.message||JSON.stringify(data.error));
  const text = data.content?.map(b=>b.text||"").join("")||"";
  if (!text) throw new Error("Empty response from API");
  const s=text.indexOf("{"), e=text.lastIndexOf("}");
  if(s===-1||e===-1) throw new Error("No JSON in response: "+text.slice(0,200));
  try { return JSON.parse(text.slice(s,e+1)); }
  catch(err) { throw new Error("JSON parse failed: "+text.slice(s,s+200)); }
}

function matchReceiptToTransaction(extracted, transactions) {
  if (!transactions.length) return [];
  const needle = (extracted.merchant||"").toLowerCase();
  const targetDate = extracted.date;
  const targetAmt  = Math.abs(extracted.total||0);
  return transactions
    .filter(t => t.amount < 0)
    .map(t => {
      let score = 0;
      const amt = Math.abs(t.amount);
      if (targetAmt > 0 && Math.abs(amt - targetAmt) / Math.max(targetAmt,1) < 0.01) score += 50;
      else if (targetAmt > 0 && Math.abs(amt - targetAmt) < 1) score += 30;
      if (targetDate && t.date) {
        const diff = Math.abs(new Date(t.date) - new Date(targetDate)) / 86400000;
        if (diff === 0) score += 30;
        else if (diff <= 1) score += 20;
        else if (diff <= 2) score += 10;
      }
      const desc = (t.description||"").toLowerCase();
      if (needle && desc.includes(needle.slice(0,4))) score += 20;
      return { ...t, score };
    })
    .filter(t => t.score > 20)
    .sort((a,b) => b.score - a.score)
    .slice(0, 5);
}

// ─── Bank API Sync ───────────────────────────────────────────────────────────
const MONZO_TOKEN_KEY   = "finance-tracker-monzo-token";
const STARLING_TOKEN_KEY = "finance-tracker-starling-token";

async function monzoGetAccountId(token) {
  const res = await fetch("https://api.monzo.com/accounts", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Monzo auth failed (${res.status}) — token may have expired`);
  const j = await res.json();
  const acc = (j.accounts || []).find(a => a.type === "uk_retail" && !a.closed);
  if (!acc) throw new Error("No active Monzo account found");
  return acc.id;
}

async function monzoFetchTransactions(token, accountId, since) {
  const params = new URLSearchParams({ account_id: accountId, "expand[]": "merchant", limit: "100" });
  if (since) params.set("since", since);
  const res = await fetch(`https://api.monzo.com/transactions?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Monzo transactions failed (${res.status})`);
  const j = await res.json();
  return j.transactions || [];
}

function monzoToInternal(tx, idx) {
  const amount = tx.amount / 100;
  if (amount === 0) return null;
  const cat = MONZO_CAT_MAP[(tx.category || "").toLowerCase()] || "Other";
  return {
    id:        tx.id,
    rowIndex:  idx,
    accountId: "grocery",
    date:      tx.created.slice(0, 10),
    description: tx.merchant?.name || tx.description || "",
    amount,
    balance:   null,
    category:  cat,
    nativeCategory: cat,
    nativeTransferType: tx.category === "transfers" ? "neutral" : null,
  };
}

// ─── GitHub Gist Sync ────────────────────────────────────────────────────────
const GIST_FILE      = "finance-tracker-sync.json";
const GIST_TOKEN_KEY = "finance-tracker-gist-token";
const GIST_ID_KEY    = "finance-tracker-gist-id";

async function gistFetch(token, gistId) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" }
  });
  if (!res.ok) throw new Error(`Gist fetch failed: ${res.status}`);
  const j = await res.json();
  const content = j.files?.[GIST_FILE]?.content;
  if (!content) throw new Error("No sync file in gist");
  return JSON.parse(content);
}

async function gistSave(token, gistId, data) {
  const body = { files: { [GIST_FILE]: { content: JSON.stringify(data, null, 2) } } };
  if (gistId) {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH",
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Gist update failed: ${res.status}`);
    return gistId;
  } else {
    const res = await fetch("https://api.github.com/gists", {
      method: "POST",
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, description: "Finance Tracker Sync", public: false })
    });
    if (!res.ok) throw new Error(`Gist create failed: ${res.status}`);
    const j = await res.json();
    return j.id;
  }
}

async function gistFindExisting(token) {
  const res = await fetch("https://api.github.com/gists?per_page=100", {
    headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" }
  });
  if (!res.ok) return null;
  const list = await res.json();
  return list.find(g => g.files?.[GIST_FILE]) || null;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [accounts, setAccounts]             = useState(ACCOUNTS_DEFAULT);
  const [transactions, setTransactions]     = useState([]);
  const [cycleStart, setCycleStart]         = useState(DEFAULT_CYCLE_START);
  const [view, setView]                     = useState("dashboard");
  const [activeAccounts, setActiveAccounts] = useState(["main","grocery","savings","credit"]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [comparePeriod, setComparePeriod]   = useState(null);
  const [toast, setToast]                   = useState(null);
  const [modal, setModal]                   = useState(null);
  const [loading, setLoading]               = useState(false);
  const [importState, setImportState]       = useState({step:"upload", accountId:"", rows:[], preview:[], isMonzo:false});
  const [manualBalances, setManualBalances] = useState({});
  const [merchantRules, setMerchantRules]   = useState({});
  const [apiKey, setApiKey]                 = useState("");
  const [receipts, setReceipts]             = useState({});
  const [receiptModal, setReceiptModal]     = useState(null);
  const [gistToken, setGistToken]           = useState("");
  const [gistId, setGistId]                 = useState("");
  const [syncStatus, setSyncStatus]         = useState("idle"); // "idle"|"syncing"|"synced"|"error"
  const syncTimer                           = useRef(null);
  const syncReady                           = useRef(false);
  const [monzoToken, setMonzoToken]         = useState("");
  const [starlingToken, setStarlingToken]   = useState("");
  const [bankSyncing, setBankSyncing]       = useState(false);
  const fileRef     = useRef();
  const receiptRef  = useRef();

  // ── Storage ──
const DEFAULT_RULES = {
  "asda":       { displayName:"Asda",          category:"Groceries"  },
  "spar":       { displayName:"Spar",          category:"Groceries"  },
  "lidl":       { displayName:"Lidl",          category:"Groceries"  },
  "tesco":      { displayName:"Tesco",         category:"Groceries"  },
  "centra":     { displayName:"Centra",        category:"Groceries"  },
  "mace":       { displayName:"Mace",          category:"Groceries"  },
  "sainsbury":  { displayName:"Sainsbury's",   category:"Groceries"  },
  "supervalu":  { displayName:"SuperValu",     category:"Groceries"  },
  "dunnes":     { displayName:"Dunnes Stores", category:"Groceries"  },
  "aldi":       { displayName:"Aldi",          category:"Groceries"  },
  "mcdonald":   { displayName:"McDonald's",    category:"Eating Out" },
  "mcbride":    { displayName:"Spar",           category:"Groceries"  },
};

  useEffect(() => {
    const load = async () => {
      let raw = null;
      try { raw = localStorage.getItem(STORAGE_KEY); } catch {}
      if (!raw && window.storage) { try { const r = await window.storage.get(STORAGE_KEY); raw = r?.value; } catch {} }
      if (!raw) { setMerchantRules(DEFAULT_RULES); }
      if (raw) {
        const s = JSON.parse(raw);
        if (s.accounts)       setAccounts(s.accounts);
        if (s.transactions)   setTransactions(s.transactions);
        if (s.activeAccounts) setActiveAccounts(s.activeAccounts);
        if (s.cycleStart)     setCycleStart(s.cycleStart);
        if (s.manualBalances) setManualBalances(s.manualBalances);
        if (s.merchantRules)  setMerchantRules({...DEFAULT_RULES, ...s.merchantRules});
        if (s.apiKey)         setApiKey(s.apiKey);
        if (s.receipts)       setReceipts(s.receipts);
      }
      // Load bank tokens (stored separately, never exported or synced)
      const monzoTok = localStorage.getItem(MONZO_TOKEN_KEY) || "";
      const starlingTok = localStorage.getItem(STARLING_TOKEN_KEY) || "";
      if (monzoTok) setMonzoToken(monzoTok);
      if (starlingTok) setStarlingToken(starlingTok);

      // Load Gist credentials (stored separately, never exported)
      const tok = localStorage.getItem(GIST_TOKEN_KEY) || "";
      const gid = localStorage.getItem(GIST_ID_KEY) || "";
      if (tok) setGistToken(tok);
      if (gid) setGistId(gid);
      // Fetch from Gist and merge (remote wins for rules + receipts)
      if (tok && gid) {
        try {
          setSyncStatus("syncing");
          const remote = await gistFetch(tok, gid);
          if (remote.merchantRules) setMerchantRules(r => ({ ...r, ...remote.merchantRules }));
          if (remote.receipts)      setReceipts(r => ({ ...r, ...remote.receipts }));
          if (remote.accounts)      setAccounts(remote.accounts);
          if (remote.cycleStart)    setCycleStart(remote.cycleStart);
          setSyncStatus("synced");
        } catch(e) {
          console.warn("Gist load failed:", e);
          setSyncStatus("error");
        }
      }
      syncReady.current = true;
    };
    load();
  }, []);

  useEffect(() => {
    const data = JSON.stringify({accounts, transactions, activeAccounts, cycleStart, manualBalances, merchantRules, apiKey, receipts});
    try { localStorage.setItem(STORAGE_KEY, data); } catch {}
    if (window.storage) window.storage.set(STORAGE_KEY, data).catch(()=>{});
  }, [accounts, transactions, activeAccounts, cycleStart, manualBalances, merchantRules, apiKey]);

  // Debounced Gist sync — fires 2s after any change to syncable data
  useEffect(() => {
    if (!syncReady.current || !gistToken) return;
    setSyncStatus("syncing");
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      try {
        const data = { version: "2.1", merchantRules, receipts, accounts, cycleStart };
        const newId = await gistSave(gistToken, gistId, data);
        if (newId !== gistId) {
          setGistId(newId);
          localStorage.setItem(GIST_ID_KEY, newId);
        }
        setSyncStatus("synced");
      } catch(e) {
        console.warn("Gist sync failed:", e);
        setSyncStatus("error");
      }
    }, 2000);
  }, [merchantRules, receipts, accounts, cycleStart, gistToken, gistId]);

  // ── Derived ──
  const periods       = getAllPeriods(transactions, cycleStart);
  const displayPeriod = selectedPeriod || periods[0] || getPeriodKey(todayStr(), cycleStart);
  const periodLabel   = (pk) => getPeriodLabel(pk, cycleStart);

  const applyRules = (txns) => txns.map(t => {
    const desc = (t.description||"").toLowerCase().trim();
    let rule = merchantRules[desc];
    if (!rule) { const k = Object.keys(merchantRules).find(k => desc.includes(k.toLowerCase())); if (k) rule = merchantRules[k]; }
    if (!rule) return t;
    return { ...t, category:rule.category||t.category, description:rule.displayName||t.description };
  });

  const visibleTxns = applyRules(transactions.filter(t =>
    activeAccounts.includes(t.accountId) && getPeriodKey(t.date, cycleStart) === displayPeriod
  ));
  const compareTxns = comparePeriod
    ? applyRules(transactions.filter(t => activeAccounts.includes(t.accountId) && getPeriodKey(t.date, cycleStart) === comparePeriod))
    : [];

  const getSpend = (txns) => {
    const out = {};
    txns.forEach(t => { if (t.amount<0 && !EXCLUDE_FROM_SPEND.includes(t.category||"Other")) { const c=t.category||"Other"; out[c]=(out[c]||0)+Math.abs(t.amount); } });
    return out;
  };

  const getAccountBalance = (id) => {
    if (manualBalances[id] != null) return manualBalances[id];
    const txns = transactions.filter(t => t.accountId===id);
    if (!txns.length) return null;
    const periodEnd = getPeriodEnd(displayPeriod, cycleStart);
    const withBal = txns.filter(t => t.balance!=null && t.date<=periodEnd)
      .sort((a,b) => { if (b.date!==a.date) return b.date>a.date?1:-1; return (b.rowIndex??0)-(a.rowIndex??0); });
    if (withBal.length) return withBal[0].balance;
    const upTo = txns.filter(t => t.date<=periodEnd);
    if (!upTo.length) return null;
    return upTo.reduce((s,t) => s+t.amount, 0);
  };

  const getSavingsAllocated = () => {
    const out = transactions.filter(t => t.category==="Savings"||(t.category==="Transfer"&&t.transferType==="savings")).reduce((s,t)=>s+Math.abs(t.amount),0);
    const ret = transactions.filter(t => t.category==="SavingsReturn").reduce((s,t)=>s+Math.abs(t.amount),0);
    return Math.max(0, out-ret);
  };

  const spending     = getSpend(visibleTxns);
  const compareSpend = getSpend(compareTxns);
  const totalSpend   = Object.values(spending).reduce((s,v)=>s+v,0);
  const totalIncome  = visibleTxns.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  function exportHTML() {
    const data = JSON.stringify({accounts, transactions, activeAccounts, cycleStart, manualBalances, merchantRules, apiKey, receipts});
    const src = document.currentScript?.src || "";
    const scripts = Array.from(document.querySelectorAll("script")).map(s => s.outerHTML).join("\n");
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Finance">
<title>Finance Tracker</title>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{background:#0a0b0f;color:#e2e4ec;font-family:'DM Mono','Courier New',monospace;-webkit-text-size-adjust:100%;}input,textarea,button{font-family:inherit;}::-webkit-scrollbar{display:none;}</style>
</head>
<body>
<div id="root"></div>
<script>
// Pre-load saved data
localStorage.setItem("${STORAGE_KEY}", JSON.stringify(${JSON.stringify(JSON.parse(data))}));
</script>
<script type="text/babel" data-presets="react">
${document.querySelector('script[type="module"]')?.textContent || "// source not available"}
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
</script>
</body>
</html>`;
    navigator.clipboard.writeText(html)
      .then(()=>showToast("HTML copied — paste into a .html file"))
      .catch(()=>showToast("Copy failed — try on desktop","error"));
  }

  // ── Import ──
  async function handleCSVFile(file) {
    if (!file) return;
    const rows = normaliseRows(parseCSV(await file.text()));
    if (!rows.length) { showToast("Couldn't parse CSV","error"); return; }
    const withCats = rows.map((r,i) => ({
      ...r, id:uid(), rowIndex:i,
      transferType: r.nativeTransferType||null,
      accountId: importState.accountId,
      category: r.nativeCategory||guessCategory(r.description),
    }));
    const isMonzo = isMonzoCSV(Object.keys(rows[0]||{}));
    setImportState(s => ({...s, step:"preview", rows:withCats, preview:withCats.slice(0,10), isMonzo}));
  }

  async function runAICategorise() {
    setLoading(true);
    try {
      const results = await aiCategorise(importState.rows, apiKey);
      const map = {}; results.forEach(r => { map[r.index]=r.category; });
      setImportState(s => ({
        ...s,
        rows:    s.rows.map((r,i)    => ({...r, category:map[i]||r.category})),
        preview: s.rows.slice(0,10).map((r,i) => ({...r, category:map[i]||r.category})),
      }));
      showToast("AI categorisation done");
    } catch { showToast("AI failed — using smart defaults","error"); }
    setLoading(false);
  }

  function confirmImport() {
    setTransactions(prev => {
      const existing = new Set(prev.map(t=>`${t.accountId}-${t.date}-${t.amount}`));
      const fresh = importState.rows.filter(r=>!existing.has(`${r.accountId}-${r.date}-${r.amount}`));
      return [...prev,...fresh].sort((a,b) => { if(b.date!==a.date) return b.date>a.date?1:-1; return (b.rowIndex??0)-(a.rowIndex??0); });
    });
    setModal(null);
    setImportState({step:"upload",accountId:"",rows:[],preview:[],isMonzo:false});
    showToast(`Imported ${importState.rows.length} transactions`);
  }

  async function syncMonzo() {
    if (!monzoToken || bankSyncing) return;
    setBankSyncing(true);
    try {
      const accId = await monzoGetAccountId(monzoToken);
      // Find most recent existing Monzo transaction to avoid re-fetching
      const existing = transactions.filter(t => t.accountId === "grocery" && t.id.startsWith("tx_"));
      const lastDate = existing.sort((a,b) => b.date.localeCompare(a.date))[0]?.date;
      const since = lastDate
        ? new Date(new Date(lastDate).getTime() - 24*60*60*1000).toISOString() // 1 day overlap
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();       // 90 days first run
      const raw = await monzoFetchTransactions(monzoToken, accId, since);
      const existingIds = new Set(transactions.map(t => t.id));
      const fresh = raw.map((tx, i) => monzoToInternal(tx, i)).filter(t => t && !existingIds.has(t.id));
      if (!fresh.length) { showToast("Monzo — already up to date"); return; }
      setTransactions(prev =>
        [...prev, ...fresh].sort((a,b) => { if(b.date!==a.date) return b.date>a.date?1:-1; return (b.rowIndex??0)-(a.rowIndex??0); })
      );
      showToast(`Synced ${fresh.length} new transaction${fresh.length===1?"":"s"} from Monzo`);
    } catch(e) {
      showToast(e.message, "error");
    } finally {
      setBankSyncing(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"#0a0b0f",color:"#e2e4ec",fontFamily:"'DM Mono','Fira Mono',monospace",paddingBottom:80}}>

      {/* Header */}
      <div style={{background:"#0f1117",borderBottom:"1px solid #1c1f2e",padding:"18px 16px 0",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div>
            <div style={{fontSize:10,letterSpacing:4,color:"#60a5fa",textTransform:"uppercase",fontWeight:700}}>Finance</div>
            <div style={{fontSize:20,fontWeight:700,letterSpacing:-0.5,marginTop:1}}>Overview</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setModal({type:"rules"})} style={{background:"#1c1f2e",border:"1px solid #2a2d3a",color:"#94a3b8",borderRadius:8,padding:"8px 10px",fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:1}}>RULES</button>
            <button onClick={exportHTML} style={{background:"#1c1f2e",border:"1px solid #2a2d3a",color:"#94a3b8",borderRadius:8,padding:"8px 10px",fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:1}}>↓ HTML</button>
            <button onClick={()=>setModal({type:"settings"})} style={{background:"#1c1f2e",border:"1px solid #2a2d3a",color:"#94a3b8",borderRadius:8,padding:"8px 12px",fontSize:14,cursor:"pointer"}}>
              ⚙{gistToken&&<span style={{fontSize:8,marginLeft:4,color:syncStatus==="synced"?"#4ade80":syncStatus==="error"?"#f87171":"#fbbf24",verticalAlign:"middle"}}>{syncStatus==="syncing"?"⟳":"●"}</span>}
            </button>
            {monzoToken&&<button onClick={syncMonzo} disabled={bankSyncing} style={{background:bankSyncing?"#1c1f2e":"#4ade8015",border:`1px solid ${bankSyncing?"#2a2d3a":"#4ade8040"}`,color:bankSyncing?"#4b5563":"#4ade80",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:bankSyncing?"default":"pointer",letterSpacing:1}}>{bankSyncing?"⟳":"↓"} SYNC</button>}
            <button onClick={()=>setModal({type:"import"})} style={{background:"#60a5fa15",border:"1px solid #60a5fa40",color:"#60a5fa",borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:"pointer",letterSpacing:1}}>+ CSV</button>
          </div>
        </div>

        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:10,scrollbarWidth:"none"}}>
          {accounts.map(a => (
            <button key={a.id} onClick={()=>setActiveAccounts(prev=>prev.includes(a.id)?prev.filter(x=>x!==a.id):[...prev,a.id])} style={{
              background:activeAccounts.includes(a.id)?a.color+"22":"#1c1f2e",
              border:`1.5px solid ${activeAccounts.includes(a.id)?a.color:"#1c1f2e"}`,
              color:activeAccounts.includes(a.id)?a.color:"#4b5563",
              borderRadius:20,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,
            }}>{a.icon} {a.name}</button>
          ))}
          <button onClick={()=>setModal({type:"addAccount"})} style={{background:"transparent",border:"1.5px dashed #2a2d3a",color:"#4b5563",borderRadius:20,padding:"5px 12px",fontSize:11,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>+ Add</button>
        </div>

        <div style={{display:"flex",gap:2}}>
          {[["dashboard","Overview"],["spend","Spending"],["transactions","Transactions"],["insights","Insights"],["receipts","Receipts"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{
              background:view===v?"#60a5fa":"transparent",color:view===v?"#0a0b0f":"#4b5563",
              border:"none",borderRadius:"6px 6px 0 0",padding:"8px 16px",fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:1,textTransform:"uppercase",
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px",maxWidth:640,margin:"0 auto"}}>
        {periods.length>0&&(
          <div style={{marginBottom:16}}>
            <div style={{fontSize:9,color:"#4b5563",letterSpacing:3,textTransform:"uppercase",marginBottom:6}}>Pay period · starts {ordinal(cycleStart)} of each month</div>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
              {periods.slice(0,12).map(pk=>(
                <button key={pk} onClick={()=>setSelectedPeriod(pk)} style={{
                  background:displayPeriod===pk?"#60a5fa":"#1c1f2e",color:displayPeriod===pk?"#0a0b0f":"#4b5563",
                  border:"none",borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,
                }}>{periodLabel(pk)}</button>
              ))}
            </div>
          </div>
        )}

        {transactions.length===0 ? (
          <div style={{textAlign:"center",marginTop:60}}>
            <div style={{fontSize:48}}>📂</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:12}}>No transactions yet</div>
            <div style={{fontSize:13,color:"#4b5563",marginTop:6,lineHeight:1.6}}>Export a CSV from your bank app<br/>and import it here</div>
            <button onClick={()=>setModal({type:"import"})} style={{marginTop:20,background:"#60a5fa",color:"#0a0b0f",border:"none",borderRadius:8,padding:"12px 28px",fontWeight:700,fontSize:14,cursor:"pointer",letterSpacing:1}}>IMPORT CSV</button>
          </div>
        ) : (
          <>
            {view==="dashboard" && <Dashboard
              accounts={accounts} activeAccounts={activeAccounts} periods={periods}
              displayPeriod={displayPeriod} comparePeriod={comparePeriod} setComparePeriod={setComparePeriod}
              visibleTxns={visibleTxns} spending={spending} totalSpend={totalSpend} totalIncome={totalIncome}
              getAccountBalance={getAccountBalance} getSavingsAllocated={getSavingsAllocated} periodLabel={periodLabel} />}
            {view==="spend" && <SpendView
              spending={spending} compareSpend={compareSpend} totalSpend={totalSpend}
              displayPeriod={displayPeriod} comparePeriod={comparePeriod} periods={periods}
              setComparePeriod={setComparePeriod} visibleTxns={visibleTxns} periodLabel={periodLabel}
              receipts={receipts} onAddReceipt={(txId)=>setReceiptModal({step:"upload",pinnedTxId:txId})}
              allTransactions={applyRules(transactions.filter(t => activeAccounts.includes(t.accountId)))} />}
            {view==="transactions" && <TxList
              txns={visibleTxns} accounts={accounts}
              onCatChange={(id,cat)=>setTransactions(prev=>prev.map(t=>t.id===id?{...t,category:cat}:t))}
              onTransferTypeChange={(id,tt)=>setTransactions(prev=>prev.map(t=>t.id===id?{...t,transferType:tt}:t))}
              onNoteChange={(id,note)=>setTransactions(prev=>prev.map(t=>t.id===id?{...t,note}:t))}
              merchantRules={merchantRules} setMerchantRules={setMerchantRules}
              receipts={receipts} onAddReceipt={(txId)=>setReceiptModal({step:"upload",pinnedTxId:txId})} />}
            {view==="receipts" && <ReceiptsView
              transactions={visibleTxns} receipts={receipts}
              onAdd={()=>setReceiptModal({step:"upload",pinnedTxId:null})} />}
            {view==="insights" && <InsightsView
              transactions={transactions} periods={periods} activeAccounts={activeAccounts}
              cycleStart={cycleStart} periodLabel={periodLabel} displayPeriod={displayPeriod}
              merchantRules={merchantRules} />}
          </>
        )}
      </div>

      {modal?.type==="settings"  && <SettingsModal cycleStart={cycleStart} apiKey={apiKey} onApiKeySave={setApiKey}
          gistToken={gistToken} syncStatus={syncStatus}
          onGistTokenSave={async tok=>{
            const trimmed=tok.trim();
            setGistToken(trimmed);
            localStorage.setItem(GIST_TOKEN_KEY, trimmed);
            if (trimmed) {
              setSyncStatus("syncing");
              try {
                const existing = await gistFindExisting(trimmed);
                if (existing) { setGistId(existing.id); localStorage.setItem(GIST_ID_KEY, existing.id); showToast("Sync connected — existing data found"); }
                else { showToast("Sync ready — will create gist on next save"); }
              } catch(e) { setSyncStatus("error"); showToast("Could not connect to GitHub","error"); }
            } else { setGistId(""); localStorage.removeItem(GIST_ID_KEY); setSyncStatus("idle"); }
          }}
          monzoToken={monzoToken} onMonzoTokenSave={tok=>{const t=tok.trim();setMonzoToken(t);t?localStorage.setItem(MONZO_TOKEN_KEY,t):localStorage.removeItem(MONZO_TOKEN_KEY);showToast(t?"Monzo token saved":"Monzo token cleared");}}
          starlingToken={starlingToken} onStarlingTokenSave={tok=>{const t=tok.trim();setStarlingToken(t);t?localStorage.setItem(STARLING_TOKEN_KEY,t):localStorage.removeItem(STARLING_TOKEN_KEY);showToast(t?"Starling token saved":"Starling token cleared");}}
          onSave={v=>{setCycleStart(v);setSelectedPeriod(null);setComparePeriod(null);setModal(null);showToast(`Pay cycle: ${ordinal(v)} of month`);}} onClose={()=>setModal(null)} />}
      {modal?.type==="import"    && <ImportModal importState={importState} setImportState={setImportState} accounts={accounts} fileRef={fileRef} onFile={handleCSVFile} onAI={runAICategorise} onConfirm={confirmImport} onClose={()=>{setModal(null);setImportState({step:"upload",accountId:"",rows:[],preview:[],isMonzo:false});}} loading={loading} onClearAccount={(id)=>{setTransactions(prev=>prev.filter(t=>t.accountId!==id));showToast("Cleared");}} />}
      {modal?.type==="addAccount"&& <AddAccountModal onSave={a=>{setAccounts(prev=>[...prev,a]);setActiveAccounts(prev=>[...prev,a.id]);setModal(null);showToast("Account added");}} onClose={()=>setModal(null)} />}
      {modal?.type==="rules"     && <RulesModal merchantRules={merchantRules} setMerchantRules={setMerchantRules} onClose={()=>setModal(null)} />}
      <input ref={fileRef} type="file" accept=".csv,text/csv" style={{display:"none"}} onChange={e=>handleCSVFile(e.target.files[0])} />
      <input ref={receiptRef} type="file" accept="image/*" style={{display:"none"}}
        onChange={async e=>{
          const file=e.target.files[0]; if(!file) return; e.target.value="";
          const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
          setReceiptModal(s=>({...s,step:"extracting",base64:b64,mediaType:file.type}));
        }} />
      {receiptModal && <ReceiptModal
        state={receiptModal} setState={setReceiptModal}
        transactions={transactions} fileRef={receiptRef} apiKey={apiKey}
        onSave={(txId,data)=>{setReceipts(prev=>({...prev,[txId]:data}));setReceiptModal(null);showToast("Receipt saved");}}
        onClose={()=>setReceiptModal(null)} />}

      {toast && <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:toast.type==="error"?"#f87171":"#4ade80",color:"#0a0b0f",borderRadius:8,padding:"10px 20px",fontWeight:700,fontSize:13,zIndex:200,letterSpacing:0.5,boxShadow:"0 8px 32px rgba(0,0,0,.5)",whiteSpace:"nowrap"}}>{toast.msg}</div>}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({accounts,activeAccounts,periods,displayPeriod,comparePeriod,setComparePeriod,visibleTxns,spending,totalSpend,totalIncome,getAccountBalance,getSavingsAllocated,periodLabel}) {
  const topCats    = Object.entries(spending).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const net        = totalIncome - totalSpend;
  const toSavings  = visibleTxns.filter(t=>t.category==="Savings"&&t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0) - visibleTxns.filter(t=>t.category==="SavingsReturn").reduce((s,t)=>s+Math.abs(t.amount),0);
  const toGrocery  = visibleTxns.filter(t=>t.category==="Transfer"&&t.transferType==="grocery"&&t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
  const toCreditCard = visibleTxns.filter(t=>t.category==="Transfer"&&t.transferType==="creditcard"&&t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[["Spent",fmt(totalSpend),"#f87171"],["In",fmt(totalIncome),"#4ade80"],
          ["Net",fmtSigned(net),net>=0?"#4ade80":"#f87171"],
          ["To Savings",fmt(toSavings),"#fbbf24"],
          ["To Grocery",fmt(toGrocery),"#4ade80"],
          ["Credit Card",fmt(toCreditCard),"#f87171"],
        ].map(([label,val,col])=>(
          <div key={label} style={{background:"#0f1117",border:"1px solid #1c1f2e",borderRadius:10,padding:"14px 16px"}}>
            <div style={{fontSize:10,color:"#4b5563",letterSpacing:2,textTransform:"uppercase"}}>{label}</div>
            <div style={{fontSize:20,fontWeight:700,color:col,marginTop:4}}>{val}</div>
          </div>
        ))}
      </div>

      <SectionLabel>Period Balance — {periodLabel(displayPeriod)}</SectionLabel>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
        {accounts.filter(a=>activeAccounts.includes(a.id)).map(a=>{
          const bal = getAccountBalance(a.id);
          return (
            <div key={a.id} style={{background:"#0f1117",border:"1px solid #1c1f2e",borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:a.color,flexShrink:0}}/>
              <div style={{flex:1,fontSize:13,fontWeight:700}}>{a.name}</div>
              <div style={{fontSize:16,fontWeight:700,color:bal==null?"#4b5563":bal>=0?a.color:"#f87171"}}>{bal==null?"—":fmtSigned(bal)}</div>
            </div>
          );
        })}
      </div>

      {topCats.length>0&&<>
        <SectionLabel>Top Spend — {periodLabel(displayPeriod)}</SectionLabel>
        <div style={{marginBottom:16}}>
          {topCats.map(([cat,val])=>(
            <div key={cat} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:CAT_COLORS[cat]||"#94a3b8",display:"inline-block"}}/>
                  {cat}
                </span>
                <span style={{fontSize:12,color:CAT_COLORS[cat]||"#94a3b8",fontWeight:700}}>{fmt(val)}</span>
              </div>
              <div style={{background:"#1c1f2e",borderRadius:4,height:6}}>
                <div style={{height:"100%",borderRadius:4,background:CAT_COLORS[cat]||"#94a3b8",width:`${(val/totalSpend)*100}%`,transition:"width .4s"}}/>
              </div>
            </div>
          ))}
        </div>
      </>}

      <SectionLabel>Compare with</SectionLabel>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <button onClick={()=>setComparePeriod(null)} style={{background:!comparePeriod?"#60a5fa":"#1c1f2e",color:!comparePeriod?"#0a0b0f":"#4b5563",border:"none",borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>NONE</button>
        {periods.filter(p=>p!==displayPeriod).slice(0,6).map(pk=>(
          <button key={pk} onClick={()=>setComparePeriod(pk)} style={{background:comparePeriod===pk?"#60a5fa":"#1c1f2e",color:comparePeriod===pk?"#0a0b0f":"#4b5563",border:"none",borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{periodLabel(pk)}</button>
        ))}
      </div>
    </div>
  );
}

// Merchants that should never appear in subscription detection
// (retailers where regular spending looks like a subscription pattern)
const SUB_BLACKLIST = new Set(["next"]);

// ─── Subscription Detection ───────────────────────────────────────────────────

// Normalise merchant name to a grouping key.
// "apple.com/bill", "Apple", "APPLE SERVICES" all → "apple"
// This handles variations between CSV imports and API sync from the same merchant.
function merchantKey(name) {
  return name
    .toLowerCase()
    .replace(/\.com(\/[^\s]*)?/, '') // strip .com/bill, .com/uk etc.
    .replace(/\.co\.uk/, '')
    .replace(/\.net/, '')
    .replace(/\.org/, '')
    .replace(/\b(uk|ltd|limited|plc|payments|services|store|bill)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')     // strip non-alphanumeric
    .trim();
}

function detectSubscriptions(allTxns) {
  const today = new Date(todayStr());
  const spending = allTxns.filter(t => t.amount < 0 && !EXCLUDE_FROM_SPEND.includes(t.category || "Other"));

  // Group by normalised key, tracking most-common display name per group
  const byKey = {};
  spending.forEach(t => {
    const k = merchantKey(t.description || "Unknown");
    if (!k) return;
    if (!byKey[k]) byKey[k] = { txns: [], nameCounts: {} };
    byKey[k].txns.push(t);
    const n = t.description || "Unknown";
    byKey[k].nameCounts[n] = (byKey[k].nameCounts[n] || 0) + 1;
  });

  const subs = [];

  Object.entries(byKey).forEach(([key, { txns, nameCounts }]) => {
    if (SUB_BLACKLIST.has(key)) return;
    if (txns.length < 2) return;

    // Display name = most frequent original name in the group
    const displayName = Object.entries(nameCounts).sort((a, b) => b[1] - a[1])[0][0];

    // Find largest cluster of similarly-priced transactions (ignores one-off outliers)
    let bestCluster = [];
    txns.forEach(candidate => {
      const centre = Math.abs(candidate.amount);
      const cluster = txns.filter(t => Math.abs(Math.abs(t.amount) - centre) / centre < 0.15);
      if (cluster.length > bestCluster.length) bestCluster = cluster;
    });

    if (bestCluster.length < 2) return;

    const sorted = [...bestCluster].sort((a, b) => a.date.localeCompare(b.date));
    const intervals = [];
    for (let i = 1; i < sorted.length; i++)
      intervals.push((new Date(sorted[i].date) - new Date(sorted[i-1].date)) / 86400000);

    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;

    // All gaps within 30% of average (handles month length variation)
    if (!intervals.every(d => Math.abs(d - avgInterval) / avgInterval < 0.30)) return;

    let frequency = null;
    if      (avgInterval >=  6 && avgInterval <=  10) frequency = "Weekly";
    else if (avgInterval >= 13 && avgInterval <=  17) frequency = "Fortnightly";
    else if (avgInterval >= 25 && avgInterval <=  35) frequency = "Monthly";
    else if (avgInterval >= 85 && avgInterval <= 100) frequency = "Quarterly";
    else if (avgInterval >= 350 && avgInterval <= 380) frequency = "Yearly";
    if (!frequency) return;

    const avgAmount = sorted.reduce((s, t) => s + Math.abs(t.amount), 0) / sorted.length;
    const last = sorted[sorted.length - 1];
    const nextDate = new Date(new Date(last.date).getTime() + avgInterval * 86400000);
    const daysUntil = Math.round((nextDate - today) / 86400000);
    const daysSince = Math.round((today - new Date(last.date)) / 86400000);

    // Flag short-cycle subscriptions that haven't paid in 3× their expected interval
    // (e.g. monthly = 90 days). Yearly/Quarterly excluded — long gaps are normal.
    const longCycle = frequency === "Yearly" || frequency === "Quarterly";
    const possiblyEnded = !longCycle && daysSince > avgInterval * 3;

    subs.push({ name: displayName, amount: avgAmount, frequency, lastPaid: last.date, daysSince, nextDue: nextDate.toISOString().slice(0, 10), daysUntil, category: last.category || "Other", count: sorted.length, possiblyEnded });
  });

  return subs.sort((a, b) => a.daysUntil - b.daysUntil);
}

// ─── Spend View ───────────────────────────────────────────────────────────────
function SpendView({spending,compareSpend,totalSpend,displayPeriod,comparePeriod,visibleTxns,periodLabel,receipts,onAddReceipt,allTransactions}) {
  const [expandedCat, setExpandedCat]           = useState(null);
  const [expandedMerchant, setExpandedMerchant] = useState(null);
  const [showSubs, setShowSubs]                 = useState(true);
  const allCats = [...new Set([...Object.keys(spending),...Object.keys(compareSpend)])].sort((a,b)=>(spending[b]||0)-(spending[a]||0));
  const subs = detectSubscriptions(allTransactions || []).filter(s => !s.possiblyEnded);
  const ccTotal = visibleTxns.filter(t=>["Fuel","Parking"].includes(t.category)&&t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);

  function getMerchantBreakdown(cat) {
    const map = {};
    visibleTxns.filter(t=>t.category===cat&&t.amount<0).forEach(t=>{ const k=t.description||"Unknown"; map[k]=(map[k]||0)+Math.abs(t.amount); });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  }

  function getMerchantTransactions(cat, merchant) {
    return visibleTxns.filter(t=>t.category===cat&&t.amount<0&&(t.description||"Unknown")===merchant)
      .sort((a,b)=>b.date>a.date?1:-1);
  }

  // Aggregate receipt items across all transactions for a merchant
  function getMerchantItems(cat, merchant) {
    const txns = getMerchantTransactions(cat, merchant);
    const itemMap = {};
    txns.forEach(t => {
      const r = receipts[t.id];
      if (!r?.items?.length) return;
      r.items.forEach(item => {
        const k = item.name;
        if (!itemMap[k]) itemMap[k] = 0;
        itemMap[k] += item.amount * (item.qty||1);
      });
    });
    return Object.entries(itemMap).sort((a,b)=>b[1]-a[1]);
  }

  function hasSomeReceipt(cat, merchant) {
    return getMerchantTransactions(cat, merchant).some(t => receipts[t.id]?.items?.length > 0);
  }

  return (
    <div>
      {ccTotal>0&&(
        <div style={{background:"#0f1117",border:"1px solid #f8717130",borderRadius:10,padding:"14px 16px",marginBottom:16}}>
          <div style={{fontSize:10,color:"#f87171",letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>💳 Credit Card Spend</div>
          {["Fuel","Parking"].map(cat=>{
            const v=visibleTxns.filter(t=>t.category===cat&&t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
            return v>0?(<div key={cat} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:"#94a3b8"}}>{cat}</span><span style={{fontSize:13,fontWeight:700,color:CAT_COLORS[cat]}}>{fmt(v)}</span></div>):null;
          })}
          <div style={{borderTop:"1px solid #1c1f2e",marginTop:8,paddingTop:8,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#4b5563"}}>Total</span><span style={{fontSize:14,fontWeight:700,color:"#f87171"}}>{fmt(ccTotal)}</span></div>
        </div>
      )}

      {subs.length>0&&(
        <div style={{marginBottom:16}}>
          <div onClick={()=>setShowSubs(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,cursor:"pointer"}}>
            <div style={{fontSize:10,color:"#a78bfa",letterSpacing:3,textTransform:"uppercase",fontWeight:700}}>Subscriptions ({subs.length})</div>
            <span style={{fontSize:10,color:"#4b5563"}}>{showSubs?"▲":"▼"}</span>
          </div>
          {showSubs&&(
            <div style={{background:"#0f1117",border:"1px solid #a78bfa30",borderRadius:10,overflow:"hidden"}}>
              {subs.map((s,i)=>{
                const overdue  = !s.possiblyEnded && s.daysUntil < 0;
                const soon     = !s.possiblyEnded && s.daysUntil >= 0 && s.daysUntil <= 5;
                const dotColor = s.possiblyEnded ? "#4b5563" : overdue ? "#f87171" : soon ? "#fbbf24" : "#a78bfa";
                const dueLabel = s.possiblyEnded
                  ? `Possibly cancelled — last paid ${s.daysSince}d ago`
                  : overdue ? `Overdue by ${Math.abs(s.daysUntil)} day${Math.abs(s.daysUntil)===1?"":"s"}`
                  : s.daysUntil === 0 ? "Due today"
                  : `Due in ${s.daysUntil} day${s.daysUntil===1?"":"s"}`;
                const lastLabel = s.daysSince === 0 ? "Paid today" : `Paid ${s.daysSince}d ago`;
                return (
                  <div key={s.name} style={{padding:"10px 14px",borderBottom:i<subs.length-1?"1px solid #1c1f2e":"none",opacity:s.possiblyEnded?0.5:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:dotColor,flexShrink:0}}/>
                      <span style={{fontSize:13,fontWeight:700,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:s.possiblyEnded?"line-through":"none",color:s.possiblyEnded?"#4b5563":"#e2e4ec"}}>{s.name}</span>
                      <span style={{fontSize:11,color:"#4b5563",marginRight:8}}>{s.frequency}</span>
                      <span style={{fontSize:14,fontWeight:700,color:s.possiblyEnded?"#4b5563":"#a78bfa"}}>{fmt(s.amount)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:4,paddingLeft:15}}>
                      <span style={{fontSize:10,color:"#4b5563"}}>{lastLabel} · {s.lastPaid}</span>
                      <span style={{fontSize:10,fontWeight:700,color:dotColor}}>{dueLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <SectionLabel>{periodLabel(displayPeriod)}{comparePeriod?` vs ${periodLabel(comparePeriod)}`:" breakdown"}</SectionLabel>
      <div style={{background:"#0f1117",border:"1px solid #f8717140",borderRadius:10,padding:"14px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:12,color:"#94a3b8",fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Total Spend</div>
        <div style={{fontSize:26,fontWeight:700,color:"#f87171"}}>{fmt(totalSpend)}</div>
      </div>
      {allCats.map(cat=>{
        const a=spending[cat]||0, b=compareSpend[cat]||0, delta=a-b;
        const isOpen=expandedCat===cat;
        const merchants=isOpen?getMerchantBreakdown(cat):[];
        return (
          <div key={cat} style={{background:"#0f1117",border:`1px solid ${isOpen?(CAT_COLORS[cat]||"#60a5fa")+"60":"#1c1f2e"}`,borderRadius:8,marginBottom:6,overflow:"hidden"}}>
            <div onClick={()=>{setExpandedCat(isOpen?null:cat);setExpandedMerchant(null);}} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",cursor:"pointer"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:CAT_COLORS[cat]||"#4b5563",flexShrink:0}}/>
              <span style={{fontSize:13,fontWeight:700,flex:1}}>{cat}</span>
              {comparePeriod&&b>0&&<span style={{fontSize:11,fontWeight:700,color:delta>0?"#f87171":"#4ade80",marginRight:4}}>{delta>0?"▲":"▼"}{fmt(Math.abs(delta))}</span>}
              <span style={{fontSize:14,fontWeight:700,color:CAT_COLORS[cat]||"#94a3b8"}}>{fmt(a)}</span>
              <span style={{fontSize:11,color:"#4b5563",marginLeft:2}}>{isOpen?"▲":"▼"}</span>
            </div>
            {comparePeriod&&b>0&&!isOpen&&<div style={{display:"flex",justifyContent:"space-between",padding:"0 14px 8px",paddingLeft:30}}><span style={{fontSize:11,color:"#4b5563"}}>{periodLabel(comparePeriod)}: {fmt(b)}</span></div>}
            {isOpen&&(
              <div style={{borderTop:`1px solid ${CAT_COLORS[cat]||"#60a5fa"}30`,background:"#0a0b0f"}}>
                {merchants.length===0
                  ? <div style={{padding:"10px 14px",fontSize:12,color:"#4b5563"}}>No transactions</div>
                  : merchants.map(([merchant,total],i)=>{
                    const mKey=`${cat}::${merchant}`;
                    const isMOpen=expandedMerchant===mKey;
                    const mTxns=isMOpen?getMerchantTransactions(cat,merchant):[];
                    return (
                      <div key={merchant} style={{borderBottom:i<merchants.length-1?"1px solid #1c1f2e":"none"}}>
                        <div onClick={()=>setExpandedMerchant(isMOpen?null:mKey)}
                          style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px 8px 28px",cursor:"pointer",background:isMOpen?"#111318":"transparent"}}>
                          <span style={{fontSize:12,color:isMOpen?"#e2e4ec":"#94a3b8",fontWeight:isMOpen?700:400,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:8}}>{merchant}</span>
                          <span style={{fontSize:13,fontWeight:700,color:CAT_COLORS[cat]||"#94a3b8",flexShrink:0,marginRight:6}}>{fmt(total)}</span>
                          <span style={{fontSize:10,color:"#4b5563"}}>{isMOpen?"▲":"▼"}</span>
                        </div>
                        {isMOpen&&(
                          <div style={{background:"#0d0e13",padding:"6px 14px 8px 40px"}}>
                            {/* Receipt items if available */}
                            {(()=>{
                              const items = getMerchantItems(cat, merchant);
                              const hasReceipt = hasSomeReceipt(cat, merchant);
                              return items.length > 0 ? (
                                <div style={{marginBottom:8}}>
                                  <div style={{fontSize:9,color:"#fbbf24",letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>🧾 Items</div>
                                  {items.map(([name,amt])=>(
                                    <div key={name} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #1c1f2e30"}}>
                                      <span style={{fontSize:11,color:"#94a3b8",flex:1,paddingRight:8}}>{name}</span>
                                      <span style={{fontSize:11,fontWeight:700,color:"#e2e4ec"}}>{fmt(amt)}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{fontSize:10,color:"#4b5563",marginBottom:6}}>
                                  No receipt attached
                                  <button onClick={e=>{e.stopPropagation();onAddReceipt(getMerchantTransactions(cat,merchant)[0]?.id);}}
                                    style={{marginLeft:8,background:"#fbbf2415",border:"1px solid #fbbf2440",color:"#fbbf24",borderRadius:5,padding:"2px 8px",fontSize:9,fontWeight:700,cursor:"pointer"}}>
                                    + ADD
                                  </button>
                                </div>
                              );
                            })()}
                            <div style={{fontSize:9,color:"#4b5563",letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Transactions</div>
                            {mTxns.map((t,j)=>(
                              <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:j<mTxns.length-1?"1px solid #1c1f2e30":"none"}}>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:11,color:"#6b7280"}}>{t.date}{receipts[t.id]?.items?.length>0&&<span style={{color:"#fbbf24",marginLeft:4}}>🧾</span>}</div>
                                  {t.note&&<div style={{fontSize:10,color:"#4b5563",fontStyle:"italic",marginTop:1}}>{t.note}</div>}
                                </div>
                                <span style={{fontSize:12,fontWeight:700,color:"#f87171",flexShrink:0}}>{fmt(t.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                }
                {comparePeriod&&b>0&&<div style={{padding:"8px 14px",borderTop:"1px solid #1c1f2e",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,color:"#4b5563"}}>{periodLabel(comparePeriod)}</span><span style={{fontSize:12,fontWeight:700,color:delta>0?"#f87171":"#4ade80"}}>{fmt(b)} {delta>0?"▲":"▼"} {fmt(Math.abs(delta))}</span></div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Transaction List ─────────────────────────────────────────────────────────
function TxList({txns,accounts,onCatChange,onTransferTypeChange,onNoteChange,merchantRules,setMerchantRules,receipts,onAddReceipt}) {
  const [expanded,setExpanded]=useState(null);
  const [rulePrompt,setRulePrompt]=useState(null);
  const sorted=[...txns].sort((a,b)=>{ if(b.date!==a.date) return b.date>a.date?1:-1; return (b.rowIndex??0)-(a.rowIndex??0); });

  function handleCatChange(t,cat) {
    onCatChange(t.id,cat);
    setRulePrompt({rawDesc:t.description, category:cat});
  }

  function saveRule(rawDesc,category,displayName) {
    setMerchantRules(prev=>({...prev,[rawDesc.toLowerCase().trim()]:{category,displayName:displayName||rawDesc}}));
    setRulePrompt(null);
  }

  return (
    <div>
      <SectionLabel>{txns.length} transactions</SectionLabel>
      {txns.length===0&&<div style={{color:"#4b5563",fontSize:13,textAlign:"center",marginTop:20}}>No transactions for this period</div>}
      {sorted.map(t=>{
        const a=accounts.find(ac=>ac.id===t.accountId);
        const isOpen=expanded===t.id;
        return (
          <div key={t.id} style={{background:"#0f1117",border:"1px solid #1c1f2e",borderRadius:8,marginBottom:6,overflow:"hidden"}}>
            <div onClick={()=>setExpanded(isOpen?null:t.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:CAT_COLORS[t.category]||"#4b5563",flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</div>
                <div style={{fontSize:10,color:"#4b5563",marginTop:2}}>{t.date} · {a?.name||t.accountId} · {t.category}{t.note&&<span style={{color:"#6b7280"}}> · {t.note}</span>}</div>
              </div>
              <div style={{fontSize:14,fontWeight:700,color:t.amount>=0?"#4ade80":"#f87171",flexShrink:0}}>{t.amount>=0?"+":"-"}{fmt(t.amount)}</div>
            </div>
            {isOpen&&(
              <div style={{background:"#0a0b0f",padding:"10px 14px",borderTop:"1px solid #1c1f2e"}}>
                <RenameInline t={t} merchantRules={merchantRules} onSave={displayName=>{
                  const key=(t.description||"").toLowerCase().trim();
                  setMerchantRules(prev=>({...prev,[key]:{...prev[key],category:t.category,displayName}}));
                }}/>
                <div style={{fontSize:10,color:"#4b5563",letterSpacing:2,marginBottom:6}}>CATEGORY</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
                  {CATEGORIES.map(c=>(
                    <button key={c} onClick={()=>handleCatChange(t,c)} style={{
                      background:t.category===c?(CAT_COLORS[c]||"#60a5fa")+"30":"#1c1f2e",
                      border:`1px solid ${t.category===c?(CAT_COLORS[c]||"#60a5fa"):"#2a2d3a"}`,
                      color:t.category===c?(CAT_COLORS[c]||"#60a5fa"):"#4b5563",
                      borderRadius:5,padding:"4px 9px",fontSize:10,cursor:"pointer",fontWeight:700,
                    }}>{c}</button>
                  ))}
                </div>
                {t.category==="Transfer"&&(
                  <div>
                    <div style={{fontSize:10,color:"#4b5563",letterSpacing:2,marginBottom:6}}>TRANSFER TYPE</div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {[["neutral","Neutral"],["savings","To savings"],["grocery","To grocery"],["creditcard","Credit card"],["spending","Counts as spend"]].map(([v,l])=>(
                        <button key={v} onClick={()=>onTransferTypeChange(t.id,v)} style={{
                          background:t.transferType===v?"#60a5fa20":"#1c1f2e",
                          border:`1px solid ${t.transferType===v?"#60a5fa":"#2a2d3a"}`,
                          color:t.transferType===v?"#60a5fa":"#4b5563",
                          borderRadius:5,padding:"4px 9px",fontSize:10,cursor:"pointer",fontWeight:700,
                        }}>{l}</button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Notes */}
                <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #1c1f2e"}}>
                  <div style={{fontSize:10,color:"#4b5563",letterSpacing:2,marginBottom:6}}>NOTE</div>
                  <input
                    value={t.note||""}
                    onChange={e=>onNoteChange(t.id,e.target.value)}
                    placeholder="Add a note e.g. one-off payment"
                    style={{width:"100%",background:"#1c1f2e",border:"1px solid #2a2d3a",borderRadius:6,padding:"7px 10px",color:"#e2e4ec",fontSize:12,outline:"none",boxSizing:"border-box"}}
                  />
                </div>
                {/* Receipt */}
                <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #1c1f2e",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:10,color:"#4b5563",letterSpacing:2}}>RECEIPT</div>
                  {receipts[t.id]?.items?.length>0
                    ? <span style={{fontSize:11,color:"#fbbf24"}}>🧾 {receipts[t.id].items.length} items</span>
                    : <span style={{fontSize:11,color:"#4b5563"}}>None</span>}
                  <button onClick={()=>onAddReceipt(t.id)} style={{
                    background:"#fbbf2415",border:"1px solid #fbbf2440",color:"#fbbf24",
                    borderRadius:6,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:"pointer",letterSpacing:1,
                  }}>+ ADD</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {rulePrompt&&<RulePrompt rawDesc={rulePrompt.rawDesc} category={rulePrompt.category} merchantRules={merchantRules} onSave={displayName=>saveRule(rulePrompt.rawDesc,rulePrompt.category,displayName)} onDismiss={()=>setRulePrompt(null)}/>}
    </div>
  );
}

// ─── Rename Inline ────────────────────────────────────────────────────────────
function RenameInline({t,merchantRules,onSave}) {
  const existingRule=merchantRules[(t.description||"").toLowerCase().trim()];
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(existingRule?.displayName||t.description);
  return (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:10,color:"#4b5563",letterSpacing:2,marginBottom:6}}>DISPLAY NAME</div>
      {editing?(
        <div style={{display:"flex",gap:6}}>
          <input autoFocus value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){onSave(val);setEditing(false);}if(e.key==="Escape")setEditing(false);}}
            style={{flex:1,background:"#1c1f2e",border:"1.5px solid #60a5fa",borderRadius:6,padding:"6px 10px",color:"#e2e4ec",fontSize:13,outline:"none"}}/>
          <button onClick={()=>{onSave(val);setEditing(false);}} style={{background:"#60a5fa",border:"none",color:"#0a0b0f",borderRadius:6,padding:"0 12px",fontWeight:700,fontSize:11,cursor:"pointer"}}>Save</button>
          <button onClick={()=>setEditing(false)} style={{background:"#1c1f2e",border:"none",color:"#6b7280",borderRadius:6,padding:"0 10px",fontWeight:700,fontSize:11,cursor:"pointer"}}>✕</button>
        </div>
      ):(
        <div onClick={()=>{setVal(existingRule?.displayName||t.description);setEditing(true);}} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",background:"#1c1f2e",borderRadius:6,padding:"7px 10px"}}>
          <span style={{flex:1,fontSize:13,color:"#e2e4ec"}}>{existingRule?.displayName||t.description}</span>
          <span style={{fontSize:10,color:"#60a5fa",fontWeight:700,letterSpacing:1}}>EDIT</span>
        </div>
      )}
    </div>
  );
}

// ─── Rule Prompt ──────────────────────────────────────────────────────────────
function RulePrompt({rawDesc,category,merchantRules,onSave,onDismiss}) {
  const existing=merchantRules[(rawDesc||"").toLowerCase().trim()];
  const [name,setName]=useState(existing?.displayName||rawDesc);
  return (
    <div style={{position:"fixed",bottom:80,left:16,right:16,background:"#1c1f2e",border:"1px solid #60a5fa40",borderRadius:12,padding:16,zIndex:50,boxShadow:"0 8px 32px rgba(0,0,0,.6)"}}>
      <div style={{fontSize:11,color:"#60a5fa",fontWeight:700,letterSpacing:2,marginBottom:8}}>SAVE AS RULE?</div>
      <div style={{fontSize:12,color:"#94a3b8",marginBottom:10}}>Always categorise as <strong style={{color:"#e2e4ec"}}>{category}</strong>. Set display name to group similar merchants:</div>
      <input value={name} onChange={e=>setName(e.target.value)} style={{width:"100%",background:"#0a0b0f",border:"1.5px solid #60a5fa",borderRadius:7,padding:"8px 10px",color:"#e2e4ec",fontSize:13,marginBottom:10,boxSizing:"border-box",outline:"none"}}/>
      <div style={{display:"flex",gap:8}}>
        <button onClick={onDismiss} style={{flex:1,background:"#0a0b0f",border:"1px solid #2a2d3a",color:"#6b7280",borderRadius:7,padding:10,fontWeight:700,fontSize:12,cursor:"pointer"}}>Skip</button>
        <button onClick={()=>onSave(name)} style={{flex:2,background:"#60a5fa",border:"none",color:"#0a0b0f",borderRadius:7,padding:10,fontWeight:700,fontSize:12,cursor:"pointer"}}>Save Rule</button>
      </div>
    </div>
  );
}

// ─── Rules Modal ──────────────────────────────────────────────────────────────
function RulesModal({merchantRules,setMerchantRules,onClose}) {
  const [editing,setEditing]=useState(null);
  const [editName,setEditName]=useState("");
  const [editCat,setEditCat]=useState("");
  const rules=Object.entries(merchantRules);
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:100,display:"flex",alignItems:"flex-end"}}>
      <div style={{background:"#0f1117",border:"1px solid #1c1f2e",borderRadius:"16px 16px 0 0",width:"100%",maxHeight:"85vh",overflowY:"auto",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{fontSize:14,fontWeight:700,letterSpacing:1}}>MERCHANT RULES</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#4b5563",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{fontSize:11,color:"#4b5563",marginBottom:16,lineHeight:1.6}}>Rules automatically categorise and rename merchants. Set them by re-categorising any transaction.</div>
        {rules.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:"#4b5563",fontSize:13}}>No rules yet — re-categorise a transaction to create one</div>}
        {rules.map(([key,rule])=>(
          <div key={key} style={{background:"#1c1f2e",borderRadius:8,padding:"10px 14px",marginBottom:8}}>
            {editing===key?(
              <div>
                <input value={editName} onChange={e=>setEditName(e.target.value)} style={{width:"100%",background:"#0a0b0f",border:"1.5px solid #60a5fa",borderRadius:6,padding:"7px 10px",color:"#e2e4ec",fontSize:13,marginBottom:8,boxSizing:"border-box",outline:"none"}}/>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
                  {CATEGORIES.map(c=>(
                    <button key={c} onClick={()=>setEditCat(c)} style={{background:editCat===c?(CAT_COLORS[c]||"#60a5fa")+"30":"#0a0b0f",border:`1px solid ${editCat===c?(CAT_COLORS[c]||"#60a5fa"):"#2a2d3a"}`,color:editCat===c?(CAT_COLORS[c]||"#60a5fa"):"#4b5563",borderRadius:5,padding:"4px 8px",fontSize:10,cursor:"pointer",fontWeight:700}}>{c}</button>
                  ))}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>setEditing(null)} style={{flex:1,background:"#0a0b0f",border:"1px solid #2a2d3a",color:"#6b7280",borderRadius:6,padding:8,fontWeight:700,fontSize:11,cursor:"pointer"}}>Cancel</button>
                  <button onClick={()=>{setMerchantRules(prev=>({...prev,[key]:{category:editCat,displayName:editName}}));setEditing(null);}} style={{flex:2,background:"#4ade80",border:"none",color:"#0a0b0f",borderRadius:6,padding:8,fontWeight:700,fontSize:11,cursor:"pointer"}}>Save</button>
                </div>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{rule.displayName||key}</div>
                  <div style={{fontSize:10,color:"#4b5563",marginTop:2}}>Matches: <span style={{color:"#6b7280"}}>{key}</span></div>
                  <div style={{fontSize:10,marginTop:2}}><span style={{color:CAT_COLORS[rule.category]||"#94a3b8",fontWeight:700}}>{rule.category}</span></div>
                </div>
                <button onClick={()=>{setEditing(key);setEditName(rule.displayName||key);setEditCat(rule.category);}} style={{background:"#0a0b0f",border:"1px solid #2a2d3a",color:"#94a3b8",borderRadius:6,padding:"6px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>Edit</button>
                <button onClick={()=>setMerchantRules(prev=>{const n={...prev};delete n[key];return n;})} style={{background:"#f8717115",border:"1px solid #f8717130",color:"#f87171",borderRadius:6,padding:"6px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>✕</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────
function ImportModal({importState,setImportState,accounts,fileRef,onFile,onAI,onConfirm,onClose,loading,onClearAccount}) {
  const {step,accountId,rows,preview,isMonzo}=importState;
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:100,display:"flex",alignItems:"flex-end"}}>
      <div style={{background:"#0f1117",border:"1px solid #1c1f2e",borderRadius:"16px 16px 0 0",width:"100%",maxHeight:"85vh",overflowY:"auto",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,letterSpacing:1}}>{step==="upload"?"IMPORT CSV":`PREVIEW (${rows.length} rows)`}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#4b5563",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        {step==="upload"&&<>
          <div style={{fontSize:10,color:"#4b5563",letterSpacing:2,marginBottom:8}}>SELECT ACCOUNT</div>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
            {accounts.map(a=>(
              <div key={a.id} style={{display:"flex",gap:6,alignItems:"center"}}>
                <button onClick={()=>setImportState(s=>({...s,accountId:a.id}))} style={{flex:1,background:accountId===a.id?a.color+"20":"#1c1f2e",border:`1.5px solid ${accountId===a.id?a.color:"#2a2d3a"}`,color:accountId===a.id?a.color:"#6b7280",borderRadius:8,padding:"10px 14px",fontSize:13,fontWeight:700,cursor:"pointer",textAlign:"left"}}>{a.icon} {a.name}</button>
                <button onClick={()=>onClearAccount(a.id)} style={{background:"#f8717115",border:"1px solid #f8717130",color:"#f87171",borderRadius:8,padding:"10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🗑</button>
              </div>
            ))}
          </div>
          <div style={{fontSize:10,color:"#4b5563",letterSpacing:2,marginBottom:8}}>CSV FILE</div>
          <div onClick={()=>accountId&&fileRef.current?.click()} style={{border:`2px dashed ${accountId?"#60a5fa":"#2a2d3a"}`,borderRadius:10,padding:"28px 16px",textAlign:"center",background:accountId?"#60a5fa08":"#1c1f2e",cursor:accountId?"pointer":"not-allowed"}}>
            <div style={{fontSize:28}}>📄</div>
            <div style={{fontSize:13,fontWeight:700,marginTop:8,color:accountId?"#e2e4ec":"#4b5563"}}>{accountId?"Tap to select CSV":"Select an account first"}</div>
            <div style={{fontSize:11,color:"#4b5563",marginTop:4}}>Export from your bank app as CSV</div>
          </div>
          <div style={{marginTop:12,padding:12,background:"#1c1f2e",borderRadius:8,fontSize:11,color:"#6b7280",lineHeight:1.6}}>
            <strong style={{color:"#94a3b8"}}>Tip:</strong> Works with Starling (TSV) and Monzo (CSV). In your banking app → Statements → Export.
          </div>
        </>}
        {step==="preview"&&<>
          {isMonzo&&<div style={{background:"#4ade8015",border:"1px solid #4ade8040",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:11,color:"#4ade80",fontWeight:700,letterSpacing:1}}>✓ MONZO FORMAT DETECTED</div>}
          <button onClick={onAI} disabled={loading} style={{width:"100%",background:"#60a5fa15",border:"1px solid #60a5fa40",color:"#60a5fa",borderRadius:8,padding:10,fontSize:12,fontWeight:700,cursor:"pointer",letterSpacing:1,marginBottom:14}}>{loading?"⏳ CATEGORISING…":"✦ AI AUTO-CATEGORISE"}</button>
          <div style={{marginBottom:12}}>
            {preview.map((r,i)=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1c1f2e"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.description}</div>
                  <div style={{fontSize:10,color:"#4b5563",marginTop:2}}>{r.date}</div>
                </div>
                <div style={{fontSize:12,fontWeight:700,color:r.amount>=0?"#4ade80":"#f87171",flexShrink:0}}>{r.amount>=0?"+":""}{fmt(r.amount)}</div>
                <div style={{fontSize:10,color:CAT_COLORS[r.category]||"#94a3b8",fontWeight:700,flexShrink:0,maxWidth:80,textAlign:"right"}}>{r.category}</div>
              </div>
            ))}
            {rows.length>10&&<div style={{fontSize:11,color:"#4b5563",textAlign:"center",paddingTop:8}}>…and {rows.length-10} more</div>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setImportState(s=>({...s,step:"upload"}))} style={{flex:1,background:"#1c1f2e",border:"none",color:"#6b7280",borderRadius:8,padding:12,fontWeight:700,cursor:"pointer",fontSize:12}}>← BACK</button>
            <button onClick={onConfirm} style={{flex:2,background:"#4ade80",border:"none",color:"#0a0b0f",borderRadius:8,padding:12,fontWeight:700,cursor:"pointer",fontSize:13,letterSpacing:1}}>IMPORT {rows.length}</button>
          </div>
        </>}
      </div>
    </div>
  );
}

// ─── Settings Modal ───────────────────────────────────────────────────────────
function SettingsModal({cycleStart,onSave,onClose,apiKey,onApiKeySave,gistToken,onGistTokenSave,syncStatus,monzoToken,onMonzoTokenSave,starlingToken,onStarlingTokenSave}) {
  const [val,setVal]=useState(cycleStart);
  const [keyInput,setKeyInput]=useState(apiKey||"");
  const [keyVisible,setKeyVisible]=useState(false);
  const [gistInput,setGistInput]=useState(gistToken||"");
  const [gistVisible,setGistVisible]=useState(false);
  const [monzoInput,setMonzoInput]=useState(monzoToken||"");
  const [monzoVisible,setMonzoVisible]=useState(false);
  const [starlingInput,setStarlingInput]=useState(starlingToken||"");
  const [starlingVisible,setStarlingVisible]=useState(false);
  const days=Array.from({length:28},(_,i)=>i+1);
  const endDay=val===1?31:val-1;
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:100,display:"flex",alignItems:"flex-end"}}>
      <div style={{background:"#0f1117",border:"1px solid #1c1f2e",borderRadius:"16px 16px 0 0",width:"100%",maxHeight:"85vh",overflowY:"auto",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,letterSpacing:1}}>SETTINGS</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#4b5563",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{marginBottom:20,paddingBottom:20,borderBottom:"1px solid #1c1f2e"}}>
          <div style={{fontSize:10,color:"#fbbf24",letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>ANTHROPIC API KEY</div>
          <div style={{fontSize:11,color:"#4b5563",marginBottom:10,lineHeight:1.6}}>Optional — for AI auto-categorisation. Get one at platform.anthropic.com → API Keys.</div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <input type={keyVisible?"text":"password"} value={keyInput} onChange={e=>setKeyInput(e.target.value)} placeholder="sk-ant-..." style={{flex:1,background:"#1c1f2e",border:`1.5px solid ${keyInput?"#fbbf24":"#2a2d3a"}`,borderRadius:7,padding:"9px 10px",color:"#e2e4ec",fontSize:12,outline:"none"}}/>
            <button onClick={()=>setKeyVisible(v=>!v)} style={{background:"#1c1f2e",border:"1px solid #2a2d3a",color:"#6b7280",borderRadius:7,padding:"0 12px",fontSize:12,cursor:"pointer"}}>{keyVisible?"Hide":"Show"}</button>
          </div>
          <button onClick={()=>onApiKeySave(keyInput.trim())} style={{width:"100%",background:keyInput?"#fbbf24":"#1c1f2e",border:"none",color:keyInput?"#0a0b0f":"#4b5563",borderRadius:7,padding:"9px",fontWeight:700,fontSize:12,cursor:keyInput?"pointer":"default",letterSpacing:1}}>SAVE KEY</button>
          {apiKey&&<div style={{fontSize:10,color:"#4ade80",marginTop:6,textAlign:"center"}}>✓ Key saved</div>}
        </div>
        <div style={{marginBottom:20,paddingBottom:20,borderBottom:"1px solid #1c1f2e"}}>
          <div style={{fontSize:10,color:"#60a5fa",letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>GITHUB SYNC</div>
          <div style={{fontSize:11,color:"#4b5563",marginBottom:10,lineHeight:1.6}}>
            Syncs merchant rules &amp; receipts across devices via a private GitHub Gist.
            Create a token at <span style={{color:"#94a3b8"}}>github.com → Settings → Developer settings → Personal access tokens</span> with <strong style={{color:"#94a3b8"}}>gist</strong> scope only.
          </div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <input type={gistVisible?"text":"password"} value={gistInput} onChange={e=>setGistInput(e.target.value)} placeholder="ghp_..." style={{flex:1,background:"#1c1f2e",border:`1.5px solid ${gistInput?"#60a5fa":"#2a2d3a"}`,borderRadius:7,padding:"9px 10px",color:"#e2e4ec",fontSize:12,outline:"none"}}/>
            <button onClick={()=>setGistVisible(v=>!v)} style={{background:"#1c1f2e",border:"1px solid #2a2d3a",color:"#6b7280",borderRadius:7,padding:"0 12px",fontSize:12,cursor:"pointer"}}>{gistVisible?"Hide":"Show"}</button>
          </div>
          <button onClick={()=>onGistTokenSave(gistInput)} style={{width:"100%",background:gistInput?"#60a5fa":"#1c1f2e",border:"none",color:gistInput?"#0a0b0f":"#4b5563",borderRadius:7,padding:"9px",fontWeight:700,fontSize:12,cursor:gistInput?"pointer":"default",letterSpacing:1}}>SAVE &amp; CONNECT</button>
          {gistToken&&<div style={{fontSize:10,marginTop:6,textAlign:"center",color:syncStatus==="synced"?"#4ade80":syncStatus==="error"?"#f87171":"#fbbf24"}}>
            {syncStatus==="synced"?"✓ Synced":syncStatus==="error"?"✗ Sync error — check token":"⟳ Syncing..."}
          </div>}
        </div>
        <div style={{marginBottom:20,paddingBottom:20,borderBottom:"1px solid #1c1f2e"}}>
          <div style={{fontSize:10,color:"#4ade80",letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>MONZO — GROCERY ACCOUNT</div>
          <div style={{fontSize:11,color:"#4b5563",marginBottom:10,lineHeight:1.6}}>Personal access token from <span style={{color:"#94a3b8"}}>developers.monzo.com</span>. Tap ↓ SYNC in the header to pull transactions. Tokens expire — regenerate if sync fails.</div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <input type={monzoVisible?"text":"password"} value={monzoInput} onChange={e=>setMonzoInput(e.target.value)} placeholder="eyJ..." style={{flex:1,background:"#1c1f2e",border:`1.5px solid ${monzoInput?"#4ade80":"#2a2d3a"}`,borderRadius:7,padding:"9px 10px",color:"#e2e4ec",fontSize:12,outline:"none"}}/>
            <button onClick={()=>setMonzoVisible(v=>!v)} style={{background:"#1c1f2e",border:"1px solid #2a2d3a",color:"#6b7280",borderRadius:7,padding:"0 12px",fontSize:12,cursor:"pointer"}}>{monzoVisible?"Hide":"Show"}</button>
          </div>
          <button onClick={()=>onMonzoTokenSave(monzoInput)} style={{width:"100%",background:monzoInput?"#4ade80":"#1c1f2e",border:"none",color:monzoInput?"#0a0b0f":"#4b5563",borderRadius:7,padding:"9px",fontWeight:700,fontSize:12,cursor:monzoInput?"pointer":"default",letterSpacing:1}}>SAVE TOKEN</button>
          {monzoToken&&<div style={{fontSize:10,color:"#4ade80",marginTop:6,textAlign:"center"}}>✓ Token saved — use ↓ SYNC in header</div>}
        </div>
        <div style={{marginBottom:20,paddingBottom:20,borderBottom:"1px solid #1c1f2e"}}>
          <div style={{fontSize:10,color:"#60a5fa",letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>STARLING — MAIN ACCOUNT</div>
          <div style={{fontSize:11,color:"#4b5563",marginBottom:10,lineHeight:1.6}}>Personal access token from <span style={{color:"#94a3b8"}}>developer.starlingbank.com</span>. Save your token now — sync will be enabled in the next update.</div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <input type={starlingVisible?"text":"password"} value={starlingInput} onChange={e=>setStarlingInput(e.target.value)} placeholder="eyJ..." style={{flex:1,background:"#1c1f2e",border:`1.5px solid ${starlingInput?"#60a5fa":"#2a2d3a"}`,borderRadius:7,padding:"9px 10px",color:"#e2e4ec",fontSize:12,outline:"none"}}/>
            <button onClick={()=>setStarlingVisible(v=>!v)} style={{background:"#1c1f2e",border:"1px solid #2a2d3a",color:"#6b7280",borderRadius:7,padding:"0 12px",fontSize:12,cursor:"pointer"}}>{starlingVisible?"Hide":"Show"}</button>
          </div>
          <button onClick={()=>onStarlingTokenSave(starlingInput)} style={{width:"100%",background:starlingInput?"#60a5fa":"#1c1f2e",border:"none",color:starlingInput?"#0a0b0f":"#4b5563",borderRadius:7,padding:"9px",fontWeight:700,fontSize:12,cursor:starlingInput?"pointer":"default",letterSpacing:1}}>SAVE TOKEN</button>
          {starlingToken&&<div style={{fontSize:10,color:"#60a5fa",marginTop:6,textAlign:"center"}}>✓ Token saved — sync coming soon</div>}
        </div>
        <div style={{fontSize:10,color:"#4b5563",letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>PAY CYCLE</div>
        <div style={{fontSize:11,color:"#4b5563",marginBottom:12,lineHeight:1.6}}>Period runs from the <strong style={{color:"#94a3b8"}}>{ordinal(val)}</strong> to the <strong style={{color:"#94a3b8"}}>{ordinal(endDay)}</strong> of the following month.</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
          {days.map(d=>(
            <button key={d} onClick={()=>setVal(d)} style={{width:44,height:36,background:val===d?"#60a5fa":"#1c1f2e",color:val===d?"#0a0b0f":"#6b7280",border:`1px solid ${val===d?"#60a5fa":"#2a2d3a"}`,borderRadius:6,fontSize:12,fontWeight:700,cursor:"pointer"}}>{d}</button>
          ))}
        </div>
        <button onClick={()=>onSave(val)} style={{width:"100%",background:"#4ade80",border:"none",color:"#0a0b0f",borderRadius:8,padding:14,fontWeight:700,fontSize:13,cursor:"pointer",letterSpacing:1}}>SAVE — {ordinal(val)} TO {ordinal(endDay)}</button>
      </div>
    </div>
  );
}

// ─── Add Account Modal ────────────────────────────────────────────────────────
function AddAccountModal({onSave,onClose}) {
  const [name,setName]=useState(""); const [type,setType]=useState("current");
  const [color,setColor]=useState("#60a5fa"); const [icon,setIcon]=useState("🏦");
  const colors=["#60a5fa","#4ade80","#fbbf24","#f87171","#e879f9","#fb923c","#34d399","#a78bfa"];
  const icons=["🏦","💳","🛒","💰","🏠","🚗","📱","💼"];
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:100,display:"flex",alignItems:"flex-end"}}>
      <div style={{background:"#0f1117",border:"1px solid #1c1f2e",borderRadius:"16px 16px 0 0",width:"100%",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,letterSpacing:1}}>ADD ACCOUNT</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#4b5563",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Account name" style={{width:"100%",background:"#1c1f2e",border:"1.5px solid #2a2d3a",borderRadius:8,padding:"10px 12px",color:"#e2e4ec",fontSize:13,marginBottom:12,boxSizing:"border-box",outline:"none"}}/>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
          {["current","savings","credit","cash"].map(t=>(
            <button key={t} onClick={()=>setType(t)} style={{background:type===t?"#60a5fa20":"#1c1f2e",border:`1px solid ${type===t?"#60a5fa":"#2a2d3a"}`,color:type===t?"#60a5fa":"#4b5563",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",textTransform:"uppercase"}}>{t}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {colors.map(c=>(<button key={c} onClick={()=>setColor(c)} style={{width:28,height:28,borderRadius:"50%",background:c,border:`2px solid ${color===c?"#fff":"transparent"}`,cursor:"pointer"}}/>))}
        </div>
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {icons.map(ic=>(<button key={ic} onClick={()=>setIcon(ic)} style={{width:36,height:36,borderRadius:8,background:icon===ic?"#60a5fa20":"#1c1f2e",border:`1px solid ${icon===ic?"#60a5fa":"#2a2d3a"}`,fontSize:18,cursor:"pointer"}}>{ic}</button>))}
        </div>
        <button onClick={()=>name&&onSave({id:uid(),name,type,color,icon})} style={{width:"100%",background:name?"#4ade80":"#1c1f2e",border:"none",color:name?"#0a0b0f":"#4b5563",borderRadius:8,padding:14,fontWeight:700,fontSize:13,cursor:name?"pointer":"default",letterSpacing:1}}>ADD ACCOUNT</button>
      </div>
    </div>
  );
}


// ─── Insights View ────────────────────────────────────────────────────────────
function InsightsView({transactions, periods, activeAccounts, cycleStart, periodLabel, displayPeriod, merchantRules}) {

  // Apply rules helper
  function applyRules(txns) {
    return txns.map(t => {
      const desc = (t.description||"").toLowerCase().trim();
      let rule = merchantRules[desc];
      if (!rule) { const k = Object.keys(merchantRules).find(k => desc.includes(k.toLowerCase())); if (k) rule = merchantRules[k]; }
      if (!rule) return t;
      return { ...t, category:rule.category||t.category, description:rule.displayName||t.description };
    });
  }

  function getPeriodSpend(pk) {
    const txns = applyRules(transactions.filter(t => activeAccounts.includes(t.accountId) && getPeriodKey(t.date, cycleStart) === pk));
    return txns.filter(t => t.amount < 0 && !EXCLUDE_FROM_SPEND.includes(t.category||"Other")).reduce((s,t) => s+Math.abs(t.amount), 0);
  }

  function getCatSpend(txns) {
    const out = {};
    txns.filter(t => t.amount<0 && !EXCLUDE_FROM_SPEND.includes(t.category||"Other")).forEach(t => { const c=t.category||"Other"; out[c]=(out[c]||0)+Math.abs(t.amount); });
    return out;
  }

  // ── Trend data (last 6 periods) ──
  const trendPeriods = periods.slice(0,6).reverse();
  const trendData    = trendPeriods.map(pk => ({ label: periodLabel(pk), spend: getPeriodSpend(pk) }));
  const maxSpend     = Math.max(...trendData.map(d => d.spend), 1);

  // ── Biggest movers (vs previous period) ──
  const prevPeriod   = periods[1];
  const currTxns     = applyRules(transactions.filter(t => activeAccounts.includes(t.accountId) && getPeriodKey(t.date, cycleStart) === displayPeriod));
  const prevTxns     = prevPeriod ? applyRules(transactions.filter(t => activeAccounts.includes(t.accountId) && getPeriodKey(t.date, cycleStart) === prevPeriod)) : [];
  const currCats     = getCatSpend(currTxns);
  const prevCats     = getCatSpend(prevTxns);
  const allCats      = [...new Set([...Object.keys(currCats), ...Object.keys(prevCats)])];
  const movers       = allCats.map(cat => ({ cat, delta: (currCats[cat]||0) - (prevCats[cat]||0) }))
    .filter(m => Math.abs(m.delta) > 1)
    .sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);

  // ── Recurring transactions ──
  function detectRecurring() {
    const descMap = {};
    transactions.filter(t => activeAccounts.includes(t.accountId) && t.amount < 0).forEach(t => {
      const key = (t.description||"").toLowerCase().trim();
      if (!descMap[key]) descMap[key] = [];
      descMap[key].push({ date: t.date, amount: t.amount });
    });
    return Object.entries(descMap)
      .filter(([,txns]) => txns.length >= 2)
      .map(([desc, txns]) => {
        const sorted  = [...txns].sort((a,b) => a.date > b.date ? 1 : -1);
        const amounts = txns.map(t => Math.abs(t.amount));
        const avgAmt  = amounts.reduce((s,v)=>s+v,0) / amounts.length;
        const priceChange = amounts.length >= 2 && Math.abs(amounts[amounts.length-1] - amounts[0]) > 0.5;
        return { desc, count: txns.length, avgAmt, lastDate: sorted[sorted.length-1].date, priceChange, latestAmt: Math.abs(sorted[sorted.length-1].amount), firstAmt: Math.abs(sorted[0].amount) };
      })
      .filter(r => r.count >= 2)
      .sort((a,b) => b.avgAmt - a.avgAmt)
      .slice(0, 10);
  }

  const recurring = detectRecurring();

  return (
    <div>
      {/* Month on month trend */}
      <SectionLabel>Spend Trend — last {trendData.length} periods</SectionLabel>
      <div style={{background:"#0f1117",border:"1px solid #1c1f2e",borderRadius:10,padding:"16px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"flex-end",gap:6,height:80}}>
          {trendData.map((d,i) => (
            <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <div style={{fontSize:9,color:"#60a5fa",fontWeight:700}}>{d.spend>0?fmt(d.spend):""}</div>
              <div style={{
                width:"100%", borderRadius:"4px 4px 0 0",
                background: d.label===periodLabel(displayPeriod) ? "#60a5fa" : "#2a2d3a",
                height: `${Math.max((d.spend/maxSpend)*60,2)}px`,
                transition:"height .4s",
              }}/>
              <div style={{fontSize:8,color:"#4b5563",textAlign:"center",lineHeight:1.2}}>{d.label.split(" ")[0]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Biggest movers */}
      {movers.length > 0 && <>
        <SectionLabel>Biggest Movers vs last period</SectionLabel>
        <div style={{marginBottom:16}}>
          {movers.map(({cat,delta}) => (
            <div key={cat} style={{background:"#0f1117",border:"1px solid #1c1f2e",borderRadius:8,padding:"10px 14px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:CAT_COLORS[cat]||"#4b5563",flexShrink:0}}/>
              <span style={{flex:1,fontSize:13,fontWeight:700}}>{cat}</span>
              <span style={{fontSize:13,fontWeight:700,color:delta>0?"#f87171":"#4ade80"}}>
                {delta>0?"▲":"▼"} {fmt(Math.abs(delta))}
              </span>
            </div>
          ))}
        </div>
      </>}

      {/* Recurring transactions */}
      {recurring.length > 0 && <>
        <SectionLabel>Recurring Transactions</SectionLabel>
        <div style={{marginBottom:16}}>
          {recurring.map(r => (
            <div key={r.desc} style={{background:"#0f1117",border:`1px solid ${r.priceChange?"#fbbf2440":"#1c1f2e"}`,borderRadius:8,padding:"10px 14px",marginBottom:6}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.desc}</div>
                  <div style={{fontSize:10,color:"#4b5563",marginTop:2}}>
                    {r.count} payments · last {r.lastDate}
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#94a3b8"}}>{fmt(r.latestAmt)}</div>
                  {r.priceChange && <div style={{fontSize:9,color:"#fbbf24",fontWeight:700,letterSpacing:1}}>PRICE CHANGED</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}


// ─── Receipts View ────────────────────────────────────────────────────────────
function ReceiptsView({transactions, receipts, onAdd}) {
  const withReceipts = transactions.filter(t => receipts[t.id]?.items?.length > 0)
    .sort((a,b) => b.date > a.date ? 1 : -1);
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <SectionLabel>{withReceipts.length} receipts</SectionLabel>
        <button onClick={onAdd} style={{background:"#fbbf2415",border:"1px solid #fbbf2440",color:"#fbbf24",borderRadius:8,padding:"6px 14px",fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:1}}>+ ADD RECEIPT</button>
      </div>
      {withReceipts.length===0&&(
        <div style={{textAlign:"center",marginTop:40,color:"#4b5563"}}>
          <div style={{fontSize:36}}>🧾</div>
          <div style={{fontSize:15,fontWeight:700,marginTop:12}}>No receipts yet</div>
          <div style={{fontSize:12,marginTop:6,lineHeight:1.6}}>Add a receipt photo to see<br/>item-level spending breakdown</div>
        </div>
      )}
      {withReceipts.map(t=>{
        const r=receipts[t.id];
        return (
          <div key={t.id} style={{background:"#0f1117",border:"1px solid #1c1f2e",borderRadius:10,marginBottom:10,overflow:"hidden"}}>
            <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #1c1f2e"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700}}>{t.description}</div>
                <div style={{fontSize:10,color:"#4b5563",marginTop:2}}>{t.date} · {fmt(Math.abs(t.amount))}</div>
              </div>
              <span style={{fontSize:10,color:"#fbbf24",fontWeight:700}}>{r.items.length} ITEMS</span>
            </div>
            {r.items.map((item,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 14px",borderBottom:i<r.items.length-1?"1px solid #1c1f2e":"none"}}>
                <span style={{fontSize:12,color:"#94a3b8",flex:1}}>{item.qty>1?`${item.qty}× `:""}{item.name}</span>
                <span style={{fontSize:12,fontWeight:700,color:"#e2e4ec"}}>{fmt(item.amount*(item.qty||1))}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Receipt Modal ────────────────────────────────────────────────────────────
function ReceiptModal({state, setState, transactions, fileRef, onSave, onClose, apiKey}) {
  const [loading, setLoading]       = useState(false);
  const [editItems, setEditItems]   = useState(null);
  const [selectedTxId, setSelectedTxId] = useState(state.pinnedTxId||null);

  useEffect(()=>{
    if(state.step==="extracting"&&state.base64){
      const key=(apiKey||"").trim();
      if(!key){ setState(s=>({...s,step:"error",errorMsg:"No API key — add one in ⚙ Settings"})); return; }
      aiExtractReceipt(state.base64, state.mediaType, key)
        .then(extracted=>{
          const candidates=matchReceiptToTransaction(extracted,transactions);
          const bestMatch=state.pinnedTxId?state.pinnedTxId:(candidates[0]?.id||null);
          setSelectedTxId(bestMatch);
          setEditItems(extracted.items?.length>0?extracted.items:[{name:"",amount:0,qty:1}]);
          setState(s=>({...s,step:"confirm",extracted,candidates}));
        })
        .catch(e=>setState(s=>({...s,step:"error",errorMsg:e.message||"Extraction failed"})));
    }
  },[state.step]);

  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:100,display:"flex",alignItems:"flex-end"}}>
      <div style={{background:"#0f1117",border:"1px solid #1c1f2e",borderRadius:"16px 16px 0 0",width:"100%",maxHeight:"88vh",overflowY:"auto",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,letterSpacing:1}}>
            {state.step==="confirm"?"CONFIRM RECEIPT":"ADD RECEIPT"}
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#4b5563",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>

        {state.step==="upload"&&(
          <div>
            {!apiKey&&<div style={{background:"#f8717120",border:"1px solid #f8717140",borderRadius:8,padding:12,marginBottom:14,fontSize:12,color:"#f87171",lineHeight:1.5}}>⚠️ No API key — go to ⚙ Settings to add your Anthropic key first.</div>}
            <div onClick={()=>fileRef.current?.click()} style={{border:`2px dashed ${apiKey?"#fbbf2460":"#2a2d3a"}`,borderRadius:12,padding:"36px 20px",textAlign:"center",cursor:"pointer",background:apiKey?"#fbbf2408":"#1c1f2e"}}>
              <div style={{fontSize:36}}>📷</div>
              <div style={{fontSize:14,fontWeight:700,marginTop:10,color:apiKey?"#e2e4ec":"#6b7280"}}>Tap to photograph or upload receipt</div>
              <div style={{fontSize:12,color:"#6b7280",marginTop:4}}>AI extracts items and matches to transaction</div>
            </div>
            <button onClick={()=>{setEditItems([{name:"",amount:0,qty:1}]);setState(s=>({...s,step:"confirm",extracted:{merchant:"",date:null,total:null},candidates:[]}));}}
              style={{width:"100%",marginTop:10,background:"transparent",border:"1px dashed #2a2d3a",color:"#4b5563",borderRadius:8,padding:10,fontWeight:700,fontSize:12,cursor:"pointer"}}>
              Enter Manually Instead
            </button>
          </div>
        )}

        {state.step==="extracting"&&(
          <div style={{textAlign:"center",padding:"40px 0"}}>
            <div style={{fontSize:36}}>⏳</div>
            <div style={{fontSize:14,fontWeight:700,marginTop:12,color:"#fbbf24"}}>Reading receipt…</div>
            <div style={{fontSize:12,color:"#6b7280",marginTop:4}}>Extracting items and matching transaction</div>
          </div>
        )}

        {state.step==="error"&&(
          <div>
            <div style={{textAlign:"center",padding:"20px 0 16px"}}>
              <div style={{fontSize:32}}>⚠️</div>
              <div style={{fontSize:14,fontWeight:700,marginTop:8}}>Scan failed</div>
              <div style={{fontSize:12,color:"#f87171",marginTop:6,padding:"8px 12px",background:"#f8717115",borderRadius:8,wordBreak:"break-word",lineHeight:1.5}}>{state.errorMsg||"Unknown error"}</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setState(s=>({...s,step:"upload",errorMsg:null}))} style={{flex:1,background:"#1c1f2e",border:"none",color:"#6b7280",borderRadius:8,padding:12,fontWeight:700,fontSize:12,cursor:"pointer"}}>← Back</button>
              <button onClick={()=>{setEditItems([{name:"",amount:0,qty:1}]);setState(s=>({...s,step:"confirm",extracted:{merchant:"",date:null,total:null},candidates:[]}));}}
                style={{flex:2,background:"#fbbf24",border:"none",color:"#0a0b0f",borderRadius:8,padding:12,fontWeight:700,fontSize:12,cursor:"pointer"}}>Enter Manually</button>
            </div>
          </div>
        )}

        {state.step==="confirm"&&editItems&&(
          <>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:"#4b5563",letterSpacing:2,marginBottom:8}}>MATCHED TRANSACTION</div>
              {[...(state.pinnedTxId?transactions.filter(t=>t.id===state.pinnedTxId):[]),
                ...(state.candidates||[]).filter(t=>t.id!==state.pinnedTxId).slice(0,3)
              ].map(t=>(
                <button key={t.id} onClick={()=>setSelectedTxId(t.id)} style={{
                  display:"flex",width:"100%",alignItems:"center",gap:10,
                  background:selectedTxId===t.id?"#fbbf2420":"#1c1f2e",
                  border:`1.5px solid ${selectedTxId===t.id?"#fbbf24":"#2a2d3a"}`,
                  borderRadius:8,padding:"9px 12px",marginBottom:6,cursor:"pointer",textAlign:"left",
                }}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:selectedTxId===t.id?"#fbbf24":"#e2e4ec",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</div>
                    <div style={{fontSize:10,color:"#4b5563",marginTop:2}}>{t.date} · {fmt(Math.abs(t.amount))}</div>
                  </div>
                  {selectedTxId===t.id&&<span style={{fontSize:14}}>✓</span>}
                </button>
              ))}
              {(state.candidates||[]).length===0&&!state.pinnedTxId&&<div style={{fontSize:12,color:"#f87171",marginBottom:8}}>No close match — select a transaction above or skip</div>}
            </div>

            {state.extracted?.merchant&&<div style={{background:"#1c1f2e",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:"#6b7280"}}>
              Receipt: <strong style={{color:"#94a3b8"}}>{state.extracted.merchant}</strong>
              {state.extracted.date&&<> · {state.extracted.date}</>}
              {state.extracted.total&&<> · {fmt(state.extracted.total)}</>}
            </div>}

            <div style={{fontSize:10,color:"#4b5563",letterSpacing:2,marginBottom:8}}>ITEMS</div>
            {editItems.map((item,i)=>(
              <div key={i} style={{display:"flex",gap:6,alignItems:"center",marginBottom:6}}>
                <input value={item.name} onChange={e=>setEditItems(prev=>prev.map((it,j)=>j===i?{...it,name:e.target.value}:it))}
                  placeholder="Item name" style={{flex:2,background:"#1c1f2e",border:"1px solid #2a2d3a",borderRadius:6,padding:"6px 8px",color:"#e2e4ec",fontSize:12,outline:"none"}}/>
                <input value={item.qty} type="number" onChange={e=>setEditItems(prev=>prev.map((it,j)=>j===i?{...it,qty:parseInt(e.target.value)||1}:it))}
                  style={{width:44,background:"#1c1f2e",border:"1px solid #2a2d3a",borderRadius:6,padding:"6px 8px",color:"#e2e4ec",fontSize:12,outline:"none"}}/>
                <input value={item.amount} type="number" step="0.01" onChange={e=>setEditItems(prev=>prev.map((it,j)=>j===i?{...it,amount:parseFloat(e.target.value)||0}:it))}
                  style={{width:64,background:"#1c1f2e",border:"1px solid #2a2d3a",borderRadius:6,padding:"6px 8px",color:"#e2e4ec",fontSize:12,outline:"none"}}/>
                <button onClick={()=>setEditItems(prev=>prev.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#4b5563",fontSize:16,cursor:"pointer",padding:"0 4px"}}>✕</button>
              </div>
            ))}
            <button onClick={()=>setEditItems(prev=>[...prev,{name:"",amount:0,qty:1}])} style={{background:"transparent",border:"1px dashed #2a2d3a",color:"#4b5563",borderRadius:6,padding:"6px 12px",fontSize:11,cursor:"pointer",width:"100%",marginBottom:14}}>+ Add item</button>

            <button onClick={()=>{
              if(!selectedTxId) return;
              onSave(selectedTxId,{items:editItems,extractedMerchant:state.extracted?.merchant,extractedDate:state.extracted?.date,extractedTotal:state.extracted?.total});
            }} disabled={!selectedTxId} style={{
              width:"100%",background:selectedTxId?"#fbbf24":"#1c1f2e",border:"none",
              color:selectedTxId?"#0a0b0f":"#4b5563",borderRadius:8,padding:14,
              fontWeight:700,fontSize:13,cursor:selectedTxId?"pointer":"default",letterSpacing:1,
            }}>SAVE RECEIPT</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Misc ─────────────────────────────────────────────────────────────────────
function SectionLabel({children}) {
  return <div style={{fontSize:10,color:"#4b5563",letterSpacing:3,textTransform:"uppercase",marginBottom:10,marginTop:4}}>{children}</div>;
}
