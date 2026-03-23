# Naqdi (نقدي) — User Manual v2.6

## Quick Start
1. Open app → goes directly to dashboard (no lock screen on first launch)
2. Settings → Business Info → enter shop name and VAT number
3. Add products (manual or Excel import)
4. Start selling from POS
5. Lock screen appears only after admin creates users with PINs (Settings → Users)

## POS Layouts
- **Grid** (default): product grid on left, cart on right
- **Cart-Left**: cart on left, products on right
- **Top-Bottom**: products on top, cart on bottom
- **List**: scan/search only — type product name, barcode, or SKU and results appear in dropdown

## Keyboard Shortcuts
F5=Cash, F6=Card, F7=Split, F8=Hold, F9=Discount, ↑↓=navigate cart, +/-=qty, Delete=remove, Ctrl+K=search, Escape=close

## Payment Methods
- **Cash (F5)**: enter received amount, auto-calculates change
- **Card (F6)**: sends to terminal or manual proceed
- **Split (F7)**: cash + card combined — enter cash amount, card auto-calculated
- **Gift Card**: enter code at checkout, deducts balance
- **Partial**: customer pays part — rest tracked on account (requires customer)
- **Coupon**: discount code at checkout
- **Store Credit**: if customer has credit (from credit notes), checkbox to use it
- **Loyalty Points**: if customer has enough points, option to redeem

## Price Lists (Customer Groups)
Settings → Price Lists → create groups (Retail, Wholesale, VIP):
- Each group has per-product custom prices
- Assign customers to a group in Customer form → "Price Group" dropdown
- At POS: when customer is selected, prices auto-switch to their group's pricing
- Default: Retail (standard price) and Wholesale (pre-created)

## Tier/Quantity Pricing
Products → edit product → "Quantity Tier Pricing" section:
- Add quantity breaks: "From 10 units → 8 SAR" instead of 10 SAR
- Multiple tiers: 1-9 = 10, 10-49 = 8, 50+ = 6
- POS: price updates automatically when cashier changes quantity with +/- buttons

## Subscription Packages
Settings → Packages → create service packages:
- Example: "10 Car Washes = 200 SAR, valid 90 days"
- POS: sell package to customer (add as product, or from customer packages)
- When customer returns: select customer → see active packages → click "📦 Use" to deduct 1 use
- Tracks remaining uses and expiry date per customer

## Staff Commission
Settings → Users → set commission rate per cashier:
- Each cashier can have a different % rate
- Products → edit product → set per-product commission override
- Commission calculated automatically at each sale
- Reports → By Cashier shows commission column

## Returns & Exchange
- **Return**: POS → ↩ Return → find invoice → select items → reason → restock/write-off → refund
- **Exchange**: POS → 🔄 Exchange → return item → credit applied → select new item → pay difference
- Return reasons: defective (restocked), wrong item (restocked), not needed (restocked), damaged (written off), expired (written off), other (restocked)
- Manager approval required when return amount exceeds configured threshold

## Debit/Credit Notes
- **Credit Note (CN)**: Invoices → invoice → 📄 Credit Note → amount → reason → store credit or cash refund
- **Debit Note (DN)**: Invoices → invoice → 📄 Debit Note → amount → reason
- **Supplier Notes**: Purchases → PO → Supplier Credit/Debit Note
- Credit notes auto-sync to Qoyod and ZATCA when integrations are enabled

## Supplier Payments
Purchases → open PO → "💰 Payments" section:
- See total, paid, and remaining balance
- "Record Payment" → enter amount, method (cash/transfer/cheque), reference
- Supplier list shows: Total Purchases | Paid | Balance Due columns

## Expiry Date Alerts
- Set expiry dates on products in the product form
- Dashboard shows notification: "📅 X products expiring soon"
- Configure alert threshold in Settings → Returns & Discounts → "Expiry Alerts" (default 30 days)

## Promotions
- **Buy X Get Y**: Settings → Promotions → auto-applies when items added to cart
- **Auto Discount**: automatic % or fixed discount on specific product
- **Timed**: set start/end dates for seasonal offers

## Gift Cards
- Settings → Gift Cards → bulk issue, enable/disable
- POS: enter code at checkout, deducts from balance

## Qoyod Accounting Integration
Settings → Accounting (Qoyod):
1. Sign up at qoyod.com with API-enabled plan
2. Paste API key → Test → Fetch accounts → Select mappings → Save
3. New sales auto-sync as invoices + payments in Qoyod
4. Customers and products auto-created in Qoyod (togglable)
5. Credit notes and returns sync as Qoyod credit notes
6. Each sync toggle (sales, customers, products, notes, returns) independent
7. Invoice-level discounts, coupons, loyalty, and gift card deductions are automatically distributed across line items in Qoyod
8. Cash payments send the correct sale amount (excluding change) to Qoyod
9. "Push All" sends all unsynced data; "Retry Failed" re-attempts failed items
10. "Test with 1 invoice" sends the latest sale for verification

## Printers
- **Browser**: standard print dialog (default)
- **USB (Silent)**: auto-detects Windows printers, prints silently
- **Network**: ESC/POS thermal printer via IP:9100, auto-scan subnet

## Customer Display
Settings → Display → Enable Customer Display:
- Shows items + total live as cashier scans
- Shows thank you message after payment

## Security
- 23+ permissions per user, assignable by admin
- Session timeout, NFC card login, kiosk mode
- Manager PIN required for sensitive operations (returns, discounts)

## Cash Sessions
- Open session with opening amount before selling
- Close session → enter counted cash → system calculates expected vs actual
- Expected = opening + cash sales (minus change given) - cash refunds
- Difference shown as surplus or shortage
- Full session history with filter by date

## Reports (11 types)
- **Sales Report**: summary cards, daily chart, payment breakdown
- **Returns Report**: return history, reasons, amounts
- **By Product**: quantity sold, revenue, tax per product
- **By Category**: revenue breakdown by product category
- **By Cashier**: orders, revenue, discounts, commission per cashier
- **P&L (Profit & Loss)**: revenue - VAT - COGS - expenses = net profit
- **VAT Report**: output VAT (sales) vs input VAT (purchases), net payable
- **Inventory**: stock quantity, cost value, retail value (excl. VAT), margin %
- **Customers**: top customers by revenue
- **Z-Report**: end-of-day summary
- **Credit/Debit Notes**: note history and amounts
- All reports support date filtering, printing, and CSV export

## License
- 14-day free trial on first launch
- Buy license at essentialsmarket.online → enter key in Settings → License
- All data preserved after activation
- One license = one computer

## Data Management
Settings → Data Management:
- Clear Sales, Products, Customers, Expenses, Gift Cards
- Reset Stock, Clear Everything
- All include Qoyod sync cleanup

## Backup
Settings → Backup — creates full database + settings backup

## ZATCA Compliance
- **Phase 1**: QR code (TLV format, tags 1-5) on every invoice
- **Phase 2**: Full API integration with ZATCA Fatoora platform
  - Onboarding: OTP → CSR → Compliance CSID → 3 compliance checks → Production CSID
  - Reporting: B2C simplified invoices reported within 24 hours (async background queue)
  - Clearance: B2B standard invoices cleared before sharing with buyer
  - Credit notes (type 381) and debit notes (type 383) supported
  - Hash chain maintained across all documents (including rejected)
  - Supports 3 environments: Developer Portal (sandbox), Simulation (UAT), Production
  - QR code with 9 TLV tags including cryptographic stamp

## Support
Email: info@asassearch.com
