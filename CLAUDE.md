# Finance Tracker — Project Context

## Project Overview
A personal finance tracking web app built in React/JSX. Currently runs as a standalone HTML file and Claude.ai artifact. Next step is migrating to GitHub Pages for proper hosting, live bank API sync, and full AI functionality.

## Current Version — v1.9.5
Latest stable version. Single JSX file, compiled to HTML via esbuild.

### Accounts
- Main Account (Starling) — primary current account, salary paid here, id: "main"
- Grocery Account (Monzo) — £400/month allocated for groceries, id: "grocery"
- Savings (Starling Easy Saver pot) — id: "savings"
- Credit Card (Capital One) — fuel and parking only ~£250/month, id: "credit"

### Features
- CSV import — Starling (TSV) and Monzo (CSV) auto-detected
- Pay cycle periods — default 25th to 24th (paid on 25th)
- Spending breakdown — category → merchant → transactions → receipt items
- Merchant rules — contains matching, display name grouping, localStorage
- Default rules: Asda, Spar, Lidl, Tesco, Centra, Mace, Sainsbury's, SuperValu, Dunnes, Aldi, McDonald's, mcbride→Spar
- Transfer classification — savings, grocery, credit card, neutral
- KPI cards: Spent, In, Net, To Savings, To Grocery, Credit Card
- Period balance from Starling balance column
- Compare periods side by side
- Insights tab: spend trend (6 periods), biggest movers, recurring transactions
- Notes on transactions
- Receipt scanning — photo → AI extraction → match to transaction → item storage
- Item drill-down in Spending tab — tap merchant to see aggregated items from receipts
- Receipts tab — all receipts with line items
- AI categorisation — claude-haiku-4-5-20251001
- Merchant rules modal, Settings modal (pay cycle, API key)
- Add custom accounts

### Key Technical Details
- Storage key: "finance-tracker-v5" — DO NOT CHANGE (wipes user data)
- Single JSX file, no build process needed for development
- Compiled to HTML via: esbuild --jsx=transform --jsx-factory=React.createElement --target=es2015
- Monzo CSV: "money out" values are already negative — use Math.abs() before negating
- Starling CSV: tab-separated, has balance column
- Pay cycle functions: getPeriodKey(), getPeriodEnd(), getPeriodLabel()
- EXCLUDE_FROM_SPEND = ["Savings", "SavingsReturn", "Transfer"]
- Receipt scanning works in normal browser but blocked in Claude.ai sandbox

## What We Are Building Next
1. GitHub Pages hosting — permanent URL, add to iPhone home screen
2. Live bank sync — Monzo direct API, Starling direct API (no more CSV exports)
3. Supabase for data persistence across devices (free tier)
4. Push notifications via Cloudflare Workers
5. TrueLayer for Capital One integration
6. Budget targets per category with progress bars
7. Payday countdown
8. Allocation status checker (has grocery/savings gone out this month?)
9. Weekly email summary (Python on free tier)

## Bank API Details
- Monzo: direct API via developers.monzo.com — Charlie has a token
- Starling: direct API via developer.starlingbank.com — token in progress
- Capital One: via TrueLayer (future)
- Danske: via TrueLayer (future)

## File Structure
```
finance-tracker/
├── index.html              # Compiled app (open this in browser)
├── app.jsx                 # Source — edit this
├── CLAUDE.md               # This file
└── versions/
    ├── finance-tracker-v1.9.5.jsx
    └── finance-tracker-v1.9.5.html
```

## Version History
- v1.0 — clean rebuild, core features
- v1.1 — removed mcbride default rule
- v1.2 — mcbride maps to Spar
- v1.3 — total spend in spending tab
- v1.4 — total spend more prominent
- v1.5 — export HTML button
- v1.6 — clipboard copy export
- v1.7 — publish version
- v1.8 — Insights tab, notes, merchant transaction drill-down
- v1.9 — all features stable
- v1.9.5 — receipt scanning, item drill-down in spending tab ← CURRENT

## Important Rules
- Never change storage key "finance-tracker-v5"
- Always save new versions with incremented number before making changes
- Monzo money out is already negative — Math.abs() before negating
- Receipt scanning needs Anthropic API key in Settings to work
- Keep changes incremental, one feature at a time
- Charlie prefers honest assessments over validation
