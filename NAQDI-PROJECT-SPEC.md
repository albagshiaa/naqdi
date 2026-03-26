# NAQDI — Project Specification v2.6

## Identity
- Name: Naqdi (نقدي) — "my cash / my point of sale"
- Theme: Royal Blue (#2563EB) + Gold (#D4A853), dark mode default
- Master PIN: #4321# (SHA-256 hashed in main.js only)
- Company: Asas Albahth Commercial Company — info@asassearch.com

## Tech Stack
Electron v28+ (Windows), vanilla JS + HTML/CSS, sql.js (WASM SQLite), JSON SettingsStore

## Features
- POS: 4 layouts (Grid, Cart-Left, Top-Bottom, List), barcode scan, PLU weight barcodes, keyboard shortcuts, customer price groups, tier pricing
- Product Variants, Bundles, Promotions (Buy X Get Y, Auto Discount), Loyalty, Coupons, Gift Cards
- Payments: Cash, Card, Split, Gift Cards, Partial, Exchange Credit, Store Credit
- Credit/Debit Notes: Customer (CN/DN) + Supplier (SCN/SDN), resolution flow
- Subscription/Membership Packages: sell packages, track uses per customer
- Price Lists: Retail/Wholesale/Custom groups, per-product pricing, auto-switch at POS
- Tier Pricing: quantity-based price breaks per product
- Staff Commission: per-user rate, per-product override, payout tracking
- Supplier Payments: record payments against POs, balance tracking, paid/due columns
- Expiry Date Alerts: dashboard notification, configurable threshold
- USB/Network/Browser Printer, Customer Display, Geidea Terminal
- ZATCA Phase 1 (QR) + Phase 2 (API) — 3 environments: developer, simulation, production
- Qoyod Accounting Integration: auto-sync sales, customers, products, credit notes, returns
- License System: 14-day trial, encrypted .license file, API verification, anti-tamper
- Reports: 11 types + daily sales search
- Security: 23+ permissions, PIN lock, NFC, kiosk mode
- Device Sync: peer-to-peer over WiFi, TCP on port 9473, 23 tables synced, auto-sync every 15s
- Open Item: custom product on the fly in POS, permission-controlled (pos_open_item)

## Database: 37 tables | IPC: 46+ channels | Settings: 29 tabs | Permissions: 24+

## Critical Rules
1. No electron-store or better-sqlite3 (native modules)
2. prompt() → naqdiPrompt(), confirm() → naqdiConfirm()
3. All discount variables declared BEFORE modal template literals
4. Cart operations index-based (data-idx), addToCart is async
5. Settings saved as objects (NOT JSON.stringify) — SettingsStore handles serialization
6. External URLs use window.daftrly.openExternal() not window.open()
7. Invoice-level discounts recalculate tax for inclusive VAT
8. Cash session expected amount subtracts change given
9. Qoyod invoice-level discounts distributed proportionally across line items
10. ZATCA hash chain and counter always updated (even for rejected documents)
