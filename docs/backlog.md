# UP MARKETING backlog

Status as of 16 Nov 2026. ✅ = built, 🟡 = partly built, ⬜ = not started, ❓ = needs your decision.

## Queue (in order)

1. ✅ **Cancel / restore orders and returns.** Anyone can cancel; the entry is kept, struck through and counts for nothing. Edits already keep old → new values in Edit history.
2. ✅ **Separate item switches for Pheras, Regular orders and Party orders** (your item 2). Each item has three switches (under each price, and Pheras under the name).
3. ⬜ **Reason on corrections.** Ask for a short reason when an order or return is cancelled, or when an old entry is edited; show it in Edit history.
4. ⬜ **Search everywhere.** One search box (name, phone, an address used on any order) that opens the customer page.
5. ⬜ **Address history** on the customer page: every address used on their orders, with dates (admin only; still never suggested to staff).
6. ⬜ **"Upcoming" on Today.** Today already shows *due today* and *late*; add booked orders and returns due in the next days.
7. ⬜ **No double entries.** Block a second save from a double tap or a retry after the internet drops; warn when the same customer gets the same payment twice in one day.
8. ⬜ **Practice day.** One full simulated day (admin + 2 employees, regular and party orders, 3 rounds, part returns, cash, a mistake and its fix) before going live.
9. ⬜ **Register scan (Gujarati).** Waiting for 2–3 photos each of the order page and the return page. Every row is reviewed before saving; no customer is created from an unsure reading.
10. ⬜ **Go live.** Render + Atlas, weekly backup (`mongodump`) and a tested restore, data export (CSV) for admins.

## Review checklist (your item 1)

### Customers
- ✅ 10-digit mobile required; one number = one customer; same number always finds the same customer.
- ✅ Records are linked by an internal ID, not the phone, so an admin can change a customer's number and the ledger stays.
- ✅ Typing an existing number selects that customer instead of creating a duplicate.
- ✅ Two people sharing one number: not supported, by decision. Use a different number for the second person.
- 🟡 Address history: each order keeps its own address; a list view is item 5.

### Orders
- ✅ Bill = quantity × price, from the Regular or Party list.
- ✅ Item on/off switch; old entries with a switched-off item stay visible.
- ✅ Party address per order. Future dates ("Booked for later"). Return by = date + 1, changeable.
- ✅ Paid, part paid, unpaid; cash or UPI.
- ✅ Add or reduce quantity by editing; old and new values are kept in Edit history (not overwritten silently).
- ⬜ "20 today, +5 tomorrow" can be a second order for the next day (works now) or an edit; no link between the two orders. Add one only if you need it.

### Pheras (rounds)
- ✅ A team can do several rounds a day; one box per team, rounds numbered in time order, totals added once.
- ✅ A round is started and closed (end time + what came back); it stays "out now" until closed.
- ❓ The review suggests listing customers inside a round. Pheras were decided as prepaid token routes with no customer entries. Keep it that way unless that has changed.

### Items and returns
- ✅ Outstanding = given − returned, per item, oldest first, across many orders and days.
- ✅ A return is its own entry, never a change to the order.
- ✅ Wrong count (5 said, 4 given): edit the return. Wrong customer: cancel it and enter it again for the right customer.

### Money (Ughrani)
- ✅ Items and money are tracked separately.
- ✅ Part payment, full payment, payment before the order, overpayment: extra money becomes credit and is used by the next bill automatically.
- ✅ Correct a payment by editing it; reverse it by cancelling the entry.
- ✅ A payment that doesn't name an order clears the oldest dues first.

### Ledger and reports
- ✅ Full ledger with every entry, including closed and cancelled ones.
- ✅ Pending items and Ughrani reports; Today shows *due today* and *late* separately.
- ⬜ Upcoming (item 6).

### Admin, settings, staff
- ✅ Home: Pending items and Ughrani buttons, New order button, today's orders, returns and cash.
- ✅ Save settings; prices (regular and party); item switches; UPI ID; customer page details; teams.
- ✅ Staff: add, switch off (signed out at once; history kept), reset password; Edit history with employee changes marked.

## Decisions still open
Answers to the review questions were not in the message, so these use my recommendation until you say otherwise:

| Question | Using now |
|---|---|
| Payment that doesn't name an order | Clears the oldest dues first (already built) |
| Start/close each phera round | Yes (already built) |
| Offline entry | Online only for now |
| Who corrects old entries | Today: everyone can edit any date (audited). Recommended: employees edit only today's and yesterday's entries; admin edits older ones. Say yes and I'll add it. |
| Address history | Keep every address, admin can view (item 5) |
| Register scan | Review every row before saving |
