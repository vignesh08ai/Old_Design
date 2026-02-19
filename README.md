# 💼 Investment Portfolio Dashboard
**Live, auto-updating portfolio tracker — hosted free on GitHub Pages**

🌐 **Your site will be live at:** `https://vignesh08ai.github.io/InvestmentPortfolio_Vignesh`

---

## 📁 File Structure

```
InvestmentPortfolio_Vignesh/
├── index.html              ← Main dashboard (don't edit)
├── assets/
│   ├── style.css           ← Styles (don't edit)
│   └── app.js              ← All logic + API calls (don't edit)
├── data/
│   └── portfolio.json      ← ✅ YOUR DATA FILE — edit this to update holdings
└── README.md               ← This guide
```

---

## 🚀 Step-by-Step: Go Live in 10 Minutes

### Step 1 — Upload files to your GitHub repo

1. Go to **https://github.com/vignesh08ai/InvestmentPortfolio_Vignesh**
2. Click **"Add file" → "Upload files"**
3. Drag and drop ALL the files/folders:
   - `index.html`
   - `assets/` folder (with `style.css` and `app.js`)
   - `data/` folder (with `portfolio.json`)
   - `README.md`
4. Scroll down, click **"Commit changes"**

### Step 2 — Enable GitHub Pages

1. In your repo, click **"Settings"** (top tab)
2. Scroll down to **"Pages"** in the left sidebar
3. Under **"Source"**, select:
   - Branch: **`main`**
   - Folder: **`/ (root)`**
4. Click **"Save"**
5. Wait ~2 minutes, then visit: `https://vignesh08ai.github.io/InvestmentPortfolio_Vignesh`

✅ **Your portfolio is now live!**

---

## 📊 Live Data Sources

| Asset Class | Data Source | Update Frequency |
|---|---|---|
| Mutual Fund NAVs | AMFI India (official) | On page load (daily after 9 PM) |
| NSE/BSE Stocks | Yahoo Finance API | On page load (real-time) |
| NASDAQ Stocks | Yahoo Finance API | On page load (real-time) |
| Gold / SGB | Yahoo Finance (GOLDBEES.NS) | On page load |
| Fixed Deposits | Calculated (compound interest) | On page load |

---

## ✏️ How to Update Your Holdings

**All your portfolio data is in `data/portfolio.json`.**

### Add a new Mutual Fund:
```json
{
  "name": "HDFC Flexi Cap Fund",
  "schemeCode": "100179",
  "units": 500.000,
  "purchaseNAV": 45.23,
  "invested": 22615.00,
  "owner": "Mahesh"
}
```
> **Find scheme codes:** Go to https://www.amfiindia.com/nav-history-download and search for your fund.

### Add a new Stock (NSE):
```json
{
  "name": "Infosys",
  "symbol": "INFY.NS",
  "exchange": "NSE",
  "units": 10,
  "avgPrice": 1450.00,
  "invested": 14500.00
}
```
> **Symbol format:** For NSE add `.NS` suffix (e.g. `RELIANCE.NS`), for BSE add `.BO` (e.g. `RELIANCE.BO`), for NASDAQ use plain symbol (e.g. `AAPL`).

### Add a new Fixed Deposit:
```json
{
  "bank": "SBI",
  "fdNumber": "12345",
  "invested": 100000,
  "rate": 7.1,
  "startDate": "2026-01-01",
  "maturityDate": "2027-01-01",
  "daysLeft": 300,
  "maturityValue": 107100,
  "status": "Active"
}
```

### After editing `portfolio.json`:
1. Go to your GitHub repo
2. Click on `data/portfolio.json`
3. Click the **pencil icon ✏️** to edit
4. Make your changes
5. Click **"Commit changes"**
6. Reload your website — changes appear immediately!

---

## 🔄 Keeping NAVs Updated (Automatic)

The website fetches **live NAVs automatically** every time you open the page. No manual updates needed for prices!

For **units and investment amounts** (when you buy more), simply edit `portfolio.json`.

---

## 🔍 Finding Your Mutual Fund Scheme Codes

1. Visit: **https://mfapi.in/**
2. Search for your fund name
3. Copy the `schemeCode` number
4. Update `portfolio.json`

---

## 🛠 Troubleshooting

| Issue | Fix |
|---|---|
| Site shows 404 | Wait 2-3 minutes after enabling GitHub Pages |
| Live prices not loading | CORS proxy may be slow — click "Refresh Prices" |
| Fund NAV shows "cached" | Scheme code may be wrong — verify at mfapi.in |
| Stock price not updating | Check Yahoo Finance symbol (add .NS for NSE) |

---

## 📱 Mobile Friendly
The dashboard works on mobile — the sidebar collapses automatically on small screens.

---

*Built with AMFI India API + Yahoo Finance API + Chart.js · Hosted free on GitHub Pages*
