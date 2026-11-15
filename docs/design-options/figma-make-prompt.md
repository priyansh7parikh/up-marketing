# Figma Make prompt

Paste everything below the line into Figma Make.

---

Design a responsive web app called **UP MARKETING**. It is an internal tool for a business in Gujarat, India that sells water in returnable vessels. Staff use it on Android phones in the field; the owner and manager use it on a laptop. Make it work at 390px, 768px and 1440px.

**Visual direction ("Aqua")**
- Fresh water-blue. Page background #eef4fb, cards white with a 1px #dbe6f2 border and 16px radius, soft blue shadow.
- Primary colour #0b63ce. Header uses a gradient from #0b63ce to #0aa5c2 with white text.
- Text #0e2238, secondary text #5c7189.
- Status colours: late #d1343f on #fde7e9, due today #a86a00 on #fff0cf, paid or clear #12805c on #dcf5ea.
- Font: Plus Jakarta Sans. Numbers large and bold.
- Pills are fully rounded. Buttons are at least 44px tall.
- Phone: gradient header, bottom tab bar with icons and labels, a floating "+ New order" button.
- Laptop: left sidebar with the same sections, content in a centred column up to 1150px, lists become tables.
- Currency is Indian rupees (₹). Dates look like "15 Nov". Use Indian names and 10-digit phone numbers in sample data.

**Products (all four are returnable vessels)**
Small jar, Big jar, Small bottle, Big bottle. Each has a price. A customer can hold several types at once, shown on one line, for example "2 Big jar, 2 Small jar".

**Roles**
Admin (owner, manager) sees everything. Employee can add and edit orders, returns and pheras but cannot delete, change prices or see weekly reports. Every record shows "added by Ravi · edited by Priyansh".

**Screens**

1. **Sign in.** Username and password on a card.

2. **Today (home).** A "Today / This week" switch at the top.
   - Three numbers: Vessels out, Late (customers), To collect (₹).
   - "Pending from earlier days": one card per customer, oldest first. Each card shows the name, a "late 2 days" or "due today" tag, "Taken 13 Nov" and phone, pills for vessels held and money pending or "cash paid", and three buttons: Call, WhatsApp, Returned.
   - Below: "Team sales today" (one row per delivery team with vessels sold) and today's cash and UPI collected.
   - "This week" shows the same list for everything still pending, plus week totals: delivered, returned, billed, collected.

3. **Orders.** A date range and search. A summary strip for the period: sold count for each of the four vessels, billed, received in cash, received by UPI, not paid. Under it, the order list: customer, items and total, paid or amount due, return-by date, customer status (Clear, Out, Due today, Overdue).

4. **New order.** Customer name with suggestions (a new name creates the customer on save), phone, address, date. Four +/− counters for vessels given and four for empties taken back. Delivery: Our delivery or Self pickup, plus delivery charge. Return by date, pre-filled with the next day. Large total. Payment choice: Not paid, Cash, UPI.

5. **UPI payment.** Full screen after saving a UPI order: customer name, large amount, a QR code, the UPI ID, and three buttons: Received ✓, Send on WhatsApp, Later (keep pending).

6. **Returns.** "Record return" form: pick a customer (shows what they hold and owe), four +/− counters pre-filled with what they hold, money received with Cash or UPI, collected by (staff name), date. Below, a list of returns for the chosen dates: "10 Small jar · Priyansh Parikh · collected by Ravi · 15 Nov", with period totals.

7. **Pheras (daily delivery rounds).** 3 to 5 teams each run rounds. A phera card shows team name, start time and end time, and for each vessel: filled out, filled back, empties back, and **sold = filled out − filled back**. A "Start phera" form (team, time, filled out) and a "Close phera" form (end time, filled back, empties back). A day summary of sold per team.

8. **Customers.** Search and a "pending only" filter. Cards with name, phone, vessels held, money pending or credit, and due or late tag.

9. **Customer ledger.** Customer details with Call, WhatsApp, New order and Record return. Then a statement table: date, entry type (Order, Return / cash, Settled), vessels (+2 Big jar, −1 Small jar), billed, paid, running balance, entered by.

10. **Scan register page.** Take a photo of a handwritten Gujarati register page. Show the photo beside an editable table of the rows read from it. Rows the scanner could not read are highlighted and empty, with a note "10 rows found, 8 filled. Rows 4 and 7 need you". Buttons: + Add row, Save all.

11. **Admin.** Tabs for Users (add or disable staff), Teams, Prices (four products), Payment (UPI ID), and Audit (a list of changes: who, when, what changed, with employee edits highlighted).

Use realistic sample data on every screen. Keep the layout simple enough for someone using it one-handed on a phone.
