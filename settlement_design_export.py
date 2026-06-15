"""
Generates settlement_design.docx — full offline reference for the Thean settlement design discussion.
Run: python3 settlement_design_export.py
"""

from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import datetime

doc = Document()

# ── Page margins ──────────────────────────────────────────────────────────────
for section in doc.sections:
    section.top_margin    = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin   = Cm(2.5)
    section.right_margin  = Cm(2.5)

# ── Colour palette ────────────────────────────────────────────────────────────
DARK_BLUE   = RGBColor(0x1E, 0x3A, 0x5F)
MID_BLUE    = RGBColor(0x2C, 0x5F, 0x8A)
ACCENT      = RGBColor(0x0D, 0x6E, 0xFD)
LIGHT_GREY  = RGBColor(0xF3, 0xF4, 0xF6)
DARK_GREY   = RGBColor(0x37, 0x41, 0x51)
RED         = RGBColor(0xDC, 0x26, 0x26)
GREEN       = RGBColor(0x16, 0xA3, 0x4A)
ORANGE      = RGBColor(0xD9, 0x77, 0x06)
WHITE       = RGBColor(0xFF, 0xFF, 0xFF)
TABLE_HEAD  = RGBColor(0x1E, 0x3A, 0x5F)
TABLE_ALT   = RGBColor(0xEF, 0xF6, 0xFF)

# ── Helper functions ──────────────────────────────────────────────────────────

def set_cell_bg(cell, rgb: RGBColor):
    """Set cell background shading."""
    tc   = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd  = OxmlElement('w:shd')
    hex_color = f"{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}"
    shd.set(qn('w:val'),   'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'),  hex_color)
    tcPr.append(shd)

def cell_text(cell, text, bold=False, color=None, size=10, align=None):
    """Write text into a table cell with formatting."""
    para = cell.paragraphs[0]
    para.clear()
    if align:
        para.alignment = align
    run = para.add_run(text)
    run.bold = bold
    run.font.size = Pt(size)
    if color:
        run.font.color.rgb = color

def add_title(doc, text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(24)
    run.font.color.rgb = DARK_BLUE
    p.paragraph_format.space_after = Pt(4)

def add_subtitle(doc, text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.font.size = Pt(11)
    run.font.color.rgb = DARK_GREY
    p.paragraph_format.space_after = Pt(24)

def add_h1(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(16)
    run.font.color.rgb = DARK_BLUE
    p.paragraph_format.space_before = Pt(20)
    p.paragraph_format.space_after  = Pt(6)
    # Bottom border
    pPr  = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'),   'single')
    bottom.set(qn('w:sz'),    '6')
    bottom.set(qn('w:space'), '4')
    bottom.set(qn('w:color'), '1E3A5F')
    pBdr.append(bottom)
    pPr.append(pBdr)

def add_h2(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(13)
    run.font.color.rgb = MID_BLUE
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after  = Pt(4)

def add_h3(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(11)
    run.font.color.rgb = DARK_GREY
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after  = Pt(3)

def add_body(doc, text, space_after=6):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.size = Pt(10.5)
    run.font.color.rgb = DARK_GREY
    p.paragraph_format.space_after = Pt(space_after)

def add_bullet(doc, text, level=0, bold_prefix=None):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.left_indent  = Inches(0.3 + level * 0.25)
    p.paragraph_format.space_after  = Pt(3)
    if bold_prefix:
        run = p.add_run(bold_prefix)
        run.bold = True
        run.font.size = Pt(10.5)
        run.font.color.rgb = DARK_GREY
        run2 = p.add_run(text)
        run2.font.size = Pt(10.5)
        run2.font.color.rgb = DARK_GREY
    else:
        run = p.add_run(text)
        run.font.size = Pt(10.5)
        run.font.color.rgb = DARK_GREY

def add_code(doc, lines):
    """Add a code block (monospaced, light grey background)."""
    for line in lines:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent  = Inches(0.3)
        p.paragraph_format.space_before = Pt(1)
        p.paragraph_format.space_after  = Pt(1)
        run = p.add_run(line if line else " ")
        run.font.name = 'Courier New'
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(0x1F, 0x2D, 0x3D)
        # light background on paragraph
        pPr  = p._p.get_or_add_pPr()
        shd  = OxmlElement('w:shd')
        shd.set(qn('w:val'),   'clear')
        shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'),  'F0F4F8')
        pPr.append(shd)

def add_warning(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.3)
    p.paragraph_format.space_after = Pt(8)
    run = p.add_run("⚠  " + text)
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(0x92, 0x40, 0x09)
    run.bold = True

def add_note(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.3)
    p.paragraph_format.space_after = Pt(8)
    run = p.add_run("ℹ  " + text)
    run.font.size = Pt(10)
    run.font.color.rgb = MID_BLUE

def simple_table(doc, headers, rows, col_widths=None):
    """Create a styled table with header row and alternating row colours."""
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.LEFT

    # Header row
    hdr_row = t.rows[0]
    for i, h in enumerate(headers):
        cell = hdr_row.cells[i]
        set_cell_bg(cell, TABLE_HEAD)
        cell_text(cell, h, bold=True, color=WHITE, size=10)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

    # Data rows
    for r_idx, row_data in enumerate(rows):
        row = t.rows[r_idx + 1]
        bg = TABLE_ALT if r_idx % 2 == 0 else WHITE
        for c_idx, val in enumerate(row_data):
            cell = row.cells[c_idx]
            set_cell_bg(cell, bg)
            cell_text(cell, val, size=9.5)

    # Column widths
    if col_widths:
        for r in t.rows:
            for i, w in enumerate(col_widths):
                r.cells[i].width = Inches(w)

    doc.add_paragraph()  # spacing after table

def add_divider(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after  = Pt(4)
    pPr  = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'),   'single')
    bottom.set(qn('w:sz'),    '4')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), 'CBD5E1')
    pBdr.append(bottom)
    pPr.append(pBdr)

# ══════════════════════════════════════════════════════════════════════════════
# COVER
# ══════════════════════════════════════════════════════════════════════════════
doc.add_paragraph()
doc.add_paragraph()
add_title(doc, "Thean Platform")
add_title(doc, "Settlement Architecture")
add_subtitle(doc, "Complete Design Reference  ·  Prepared " + datetime.date.today().strftime("%d %B %Y"))
add_divider(doc)
doc.add_paragraph()

# ══════════════════════════════════════════════════════════════════════════════
# 1. PURPOSE & SCOPE
# ══════════════════════════════════════════════════════════════════════════════
add_h1(doc, "1. Purpose & Scope")
add_body(doc, "This document captures every design decision made during the Thean settlement architecture discussion. It covers:")
add_bullet(doc, "Core financial data model (ledger tables, settlement batches, payment events)")
add_bullet(doc, "Opening balance and closing balance capture")
add_bullet(doc, "Core architectural requirements: double-entry ledger, idempotency, state machine")
add_bullet(doc, "Digital proof capture for inward and outward payments")
add_bullet(doc, "Reconciliation module design")
add_bullet(doc, "Maker-Checker (split controls) for high-risk actions")
add_bullet(doc, "Super-admin role model required to support Maker-Checker")
add_body(doc, "All designs are forward-compatible: COD-only today, online payments and multi-sector in future.")

# ══════════════════════════════════════════════════════════════════════════════
# 2. SETTLEMENT GOALS
# ══════════════════════════════════════════════════════════════════════════════
add_h1(doc, "2. Settlement Goals")
add_bullet(doc, "Daily settlement — today's transactions settled by tomorrow (T+1).")
add_bullet(doc, "COD first, online payment mode added later without schema changes.")
add_bullet(doc, "Multi-sector ready — pharmacy today, other sectors added by inserting new sector rows.")
add_bullet(doc, "Every money movement is traceable back to a source order.")
add_bullet(doc, "Idempotent — retrying any operation never creates a double-payment.")

# ══════════════════════════════════════════════════════════════════════════════
# 3. CORE DATA MODEL
# ══════════════════════════════════════════════════════════════════════════════
add_h1(doc, "3. Core Settlement Data Model")

add_h2(doc, "3.1  order_financials")
add_body(doc, "One row per completed order. Records every financial component at the moment the order is finalised. Immutable once written.")
add_code(doc, [
    "order_financials",
    "  order_id            UUID  PK  (FK → source order)",
    "  sector              TEXT      (pharmacy | grocery | ...)",
    "  payment_mode        TEXT      (cod | online)",
    "  settlement_date     DATE      (T+1 from order completion)",
    "  customer_paid       DECIMAL   (total collected from customer)",
    "  merchant_revenue    DECIMAL   (pharmacist's share)",
    "  delivery_earning    DECIMAL   (delivery boy's share)",
    "  platform_fee        DECIMAL   (Thean's net fee)",
    "  gst_amount          DECIMAL",
    "  is_locked           BOOLEAN   (set true when nightly cron locks the batch)",
])

add_h2(doc, "3.2  settlement_batches")
add_body(doc, "One batch per day per sector. The nightly cron at 23:59 creates this row and locks all order_financials for that date.")
add_code(doc, [
    "settlement_batches",
    "  batch_id            UUID  PK",
    "  settlement_date     DATE",
    "  sector              TEXT",
    "  status              ENUM: OPEN | LOCKED | PROCESSING | SETTLED | PARTIAL | CANCELLED",
    "  created_at          TIMESTAMP",
    "  processed_at        TIMESTAMP  NULL",
])

add_h2(doc, "3.3  settlement_lines")
add_body(doc, "One row per stakeholder per batch. Records what is owed to or from each party, plus the opening and closing balance for that settlement period.")
add_code(doc, [
    "settlement_lines",
    "  line_id             UUID  PK",
    "  batch_id            UUID  FK → settlement_batches",
    "  stakeholder_type    ENUM: DELIVERY_BOY | MERCHANT | PLATFORM",
    "  stakeholder_id      UUID",
    "  order_count         INT",
    "  gross_amount        DECIMAL   (sum of COD collected / revenue for the period)",
    "  adjustments         DECIMAL   (manual corrections, penalties, bonuses)",
    "  net_amount          DECIMAL   (gross_amount + adjustments)",
    "",
    "  opening_balance     DECIMAL   (snapshot of balance BEFORE this batch)",
    "  closing_balance     DECIMAL   (updated as payments arrive)",
    "",
    "  payout_method       TEXT      (upi | neft | cash | hold)",
    "  payout_reference    TEXT      (UTR / UPI transaction ID)",
    "  status              ENUM: PENDING | PAID | PARTIAL | DISPUTED | CANCELLED",
    "  notes               TEXT",
])

add_h2(doc, "3.4  delivery_boy_payments  (inward cash)")
add_body(doc, "Records every instance of a delivery boy handing cash back to the platform. These are inward payment events — money flowing from field to platform.")
add_code(doc, [
    "delivery_boy_payments",
    "  payment_id          UUID  PK",
    "  delivery_boy_id     UUID  FK → delivery_accounts",
    "  collected_by        UUID  FK → super_admins   (admin who received the cash)",
    "  amount              DECIMAL",
    "  payment_date        DATE",
    "  payment_mode        ENUM: cash | upi | bank_deposit",
    "  reference           TEXT   (UPI transaction ID or deposit slip number)",
    "  settlement_line_id  UUID   NULL  FK → settlement_lines",
    "  notes               TEXT",
    "  created_at          TIMESTAMP",
])

add_h2(doc, "3.5  merchant_payouts  (outward payments)")
add_body(doc, "Records every payment from platform to merchant. Symmetric to delivery_boy_payments but for outward money flow.")
add_code(doc, [
    "merchant_payouts",
    "  payout_id           UUID  PK",
    "  merchant_id         UUID  FK → pharmacy_accounts",
    "  initiated_by        UUID  FK → super_admins",
    "  amount              DECIMAL",
    "  payment_date        DATE",
    "  payment_mode        ENUM: upi | neft | cheque | cash",
    "  utr_number          TEXT",
    "  settlement_line_id  UUID  NULL  FK → settlement_lines",
    "  status              ENUM: PENDING | SENT | CONFIRMED | RETURNED | FAILED",
    "  notes               TEXT",
    "  created_at          TIMESTAMP",
])

# ══════════════════════════════════════════════════════════════════════════════
# 4. OPENING AND CLOSING BALANCE
# ══════════════════════════════════════════════════════════════════════════════
add_h1(doc, "4. Opening Balance & Closing Balance")

add_h2(doc, "4.1  Why a live balance column is not enough")
add_body(doc, "The delivery_accounts table has a cod_balance column that tracks the current outstanding amount. This single number cannot answer historical questions:")
add_bullet(doc, "What did this delivery boy owe at the start of last Tuesday?")
add_bullet(doc, "A merchant claims they were underpaid last week — what was their balance on that date?")
add_bullet(doc, "The nightly cron crashed mid-run — what was the state before it started?")
add_body(doc, "Without snapshotting, cod_balance changes live and history is unrecoverable.")

add_h2(doc, "4.2  Snapshot on settlement_lines")
add_body(doc, "When the nightly cron creates a settlement_line, it reads the stakeholder's current balance and freezes it:")
add_code(doc, [
    "opening_balance = last settlement_line.closing_balance for this stakeholder",
    "                  (or 0 if first ever settlement)",
    "",
    "closing_balance = opening_balance + net_amount   (updated as payments arrive)",
    "",
    "Example — Delivery boy:",
    "  opening_balance = ₹460   (carried from previous day)",
    "  net_amount      = ₹500   (new COD collected today)",
    "  closing_balance = ₹960   (total outstanding before today's payment)",
    "",
    "  After payment of ₹960 is recorded:",
    "  closing_balance = ₹0",
    "  settlement_line.status = PAID",
])

add_h2(doc, "4.3  stakeholder_ledger  (append-only event log)")
add_body(doc, "Gives balance at any arbitrary point in time. Every financial event writes one immutable row.")
add_code(doc, [
    "stakeholder_ledger",
    "  ledger_id           UUID  PK",
    "  stakeholder_type    ENUM: DELIVERY_BOY | MERCHANT | PLATFORM",
    "  stakeholder_id      UUID",
    "  entry_date          DATE",
    "  entry_type          ENUM: COD_COLLECTED | EARNING_CREDITED |",
    "                            PAYMENT_RECEIVED | MERCHANT_PAYOUT |",
    "                            ADJUSTMENT | REFUND | PENALTY | ...",
    "  direction           ENUM: DEBIT | CREDIT   (from platform's perspective)",
    "  amount              DECIMAL",
    "  running_balance     DECIMAL   (denormalised — balance after this entry)",
    "  reference_type      ENUM: ORDER | PAYMENT | SETTLEMENT_LINE | MANUAL",
    "  reference_id        TEXT",
    "  description         TEXT",
    "  created_by          UUID  NULL  FK → super_admins  (null = system)",
    "  created_at          TIMESTAMP",
])
add_note(doc, "running_balance is denormalised for query speed. Balance at any date = last ledger row for that stakeholder WHERE entry_date <= target_date ORDER BY created_at DESC LIMIT 1.")

add_h2(doc, "4.4  Direction conventions")
simple_table(doc,
    ["Stakeholder", "DEBIT means", "CREDIT means"],
    [
        ["Delivery boy", "They owe platform (COD collected)", "Platform owes them (earning, payment received)"],
        ["Merchant",     "Platform collected their revenue", "Platform paid them out"],
        ["Platform",     "Paid out to stakeholder",         "Received from stakeholder"],
    ],
    col_widths=[1.8, 2.8, 2.8]
)

add_h2(doc, "4.5  Full COD loop example")
add_code(doc, [
    "Day 1 — order completed, ₹500 COD collected",
    "",
    "  stakeholder_ledger entry 1:",
    "    entry_type    = COD_COLLECTED",
    "    direction     = DEBIT   (delivery boy owes platform ₹500)",
    "    amount        = ₹500",
    "    running_balance = ₹500",
    "",
    "  stakeholder_ledger entry 2:",
    "    entry_type    = EARNING_CREDITED",
    "    direction     = CREDIT  (platform owes him ₹40 back)",
    "    amount        = ₹40",
    "    running_balance = ₹460",
    "",
    "Day 2 — settlement batch runs",
    "",
    "  settlement_line created:",
    "    opening_balance  = ₹460",
    "    net_amount       = ₹460",
    "    closing_balance  = ₹460   (no payment yet)",
    "    status           = PENDING",
    "",
    "Day 2 — admin records ₹460 cash received",
    "",
    "  delivery_boy_payments row created",
    "",
    "  stakeholder_ledger entry 3:",
    "    entry_type    = PAYMENT_RECEIVED",
    "    direction     = CREDIT",
    "    amount        = ₹460",
    "    running_balance = ₹0",
    "",
    "  settlement_line updated:",
    "    closing_balance = ₹0",
    "    status          = PAID",
])

# ══════════════════════════════════════════════════════════════════════════════
# 5. CORE ARCHITECTURE
# ══════════════════════════════════════════════════════════════════════════════
add_h1(doc, "5. Core Architectural Requirements")

add_h2(doc, "5.1  Immutable Double-Entry Ledger")
add_body(doc, "The proposed stakeholder_ledger is append-only (rows are never updated or deleted), but it is not a true double-entry system. True double-entry requires every transaction to produce two journal lines that sum to zero.")

add_h3(doc, "Virtual accounts required")
add_code(doc, [
    "ledger_accounts",
    "  HOLDING_POOL             — platform holds COD cash collected in the field",
    "  DELIVERY_BOY_RECEIVABLE  — what each delivery boy owes platform (COD)",
    "  DELIVERY_BOY_PAYABLE     — what platform owes each delivery boy (earnings)",
    "  MERCHANT_PAYABLE         — what platform owes each merchant",
    "  PLATFORM_REVENUE         — platform's net fee earnings",
])

add_h3(doc, "Journal entries (always balanced)")
add_code(doc, [
    "journal_entries",
    "  entry_id          UUID  PK",
    "  idempotency_key   TEXT  UNIQUE  NOT NULL   ← solves Req 5.2 simultaneously",
    "  entry_type        TEXT  (ORDER_COMPLETE | COD_REMITTANCE | PAYOUT | ADJUSTMENT)",
    "  reference_type    TEXT",
    "  reference_id      UUID",
    "  created_at        TIMESTAMP",
    "",
    "journal_lines   (always inserted as pairs — SUM(amount) per entry = 0)",
    "  line_id           UUID  PK",
    "  entry_id          UUID  FK → journal_entries",
    "  ledger_account_id UUID  FK → ledger_accounts",
    "  direction         ENUM: DEBIT | CREDIT",
    "  amount            DECIMAL  (always positive)",
])

add_h3(doc, "Example: delivery boy collects ₹500, earns ₹40")
add_code(doc, [
    "Entry: ORDER_COMPLETE / order_id = X",
    "  DEBIT  DELIVERY_BOY_RECEIVABLE   ₹500  (he owes us ₹500)",
    "  CREDIT HOLDING_POOL              ₹500  (we hold it conceptually)",
    "  DEBIT  DELIVERY_BOY_PAYABLE      ₹40   (we owe him ₹40)",
    "  CREDIT PLATFORM_REVENUE          ₹40   (our gross fee is ₹40)",
    "",
    "Sum of all four lines = 0  ✓  (accounting invariant enforced by DB trigger)",
])

add_h2(doc, "5.2  Idempotency Engine")
add_body(doc, "Without idempotency keys, network retries cause double-payouts. Every write that moves money must carry an idempotency_key.")
add_bullet(doc, "The idempotency_key column on journal_entries has a UNIQUE constraint.")
add_bullet(doc, "Key format:  sha256(entry_type + stakeholder_id + reference_id + date)  or a UUID generated by the caller.")
add_bullet(doc, "Service function checks for an existing row before inserting. If found, returns the original result (safe retry).")
add_bullet(doc, "Also needed on DeliveryCodPayout and merchant_payouts tables.")

add_h3(doc, "Service pattern")
add_code(doc, [
    "async def clear_cod(db, account_id, amount, idempotency_key):",
    "    existing = await db.scalar(",
    "        select(DeliveryCodPayout)",
    "        .where(DeliveryCodPayout.idempotency_key == idempotency_key)",
    "    )",
    "    if existing:",
    "        return existing   # safe retry — return original result",
    "",
    "    payout = DeliveryCodPayout(",
    "        account_id=account_id,",
    "        amount=amount,",
    "        idempotency_key=idempotency_key,",
    "    )",
    "    db.add(payout)",
    "    await db.commit()",
    "    return payout",
])

add_h2(doc, "5.3  State Machine")
add_body(doc, "Status columns exist but transitions are not enforced. Any code can write any status, making crashed cron jobs impossible to safely resume.")

add_h3(doc, "settlement_batch valid transitions")
simple_table(doc,
    ["From", "To", "Trigger"],
    [
        ["OPEN",       "LOCKED",     "Nightly cron at 23:59"],
        ["LOCKED",     "PROCESSING", "Payout cron at 09:00"],
        ["LOCKED",     "CANCELLED",  "Super admin manual override"],
        ["PROCESSING", "SETTLED",    "All lines paid"],
        ["PROCESSING", "PARTIAL",    "Some lines failed"],
        ["PARTIAL",    "SETTLED",    "Retry completed"],
    ],
    col_widths=[1.5, 1.8, 4.1]
)

add_h3(doc, "Enforcement pattern (Python)")
add_code(doc, [
    "VALID_TRANSITIONS = {",
    "    'OPEN':       ['LOCKED'],",
    "    'LOCKED':     ['PROCESSING', 'CANCELLED'],",
    "    'PROCESSING': ['SETTLED', 'PARTIAL'],",
    "    'PARTIAL':    ['SETTLED'],",
    "}",
    "",
    "async def advance_batch_status(batch_id, new_status, db):",
    "    batch = await db.scalar(",
    "        select(SettlementBatch)",
    "        .where(SettlementBatch.batch_id == batch_id)",
    "        .with_for_update()   # row lock prevents concurrent transitions",
    "    )",
    "    if new_status not in VALID_TRANSITIONS.get(batch.status, []):",
    "        raise InvalidTransitionError(",
    "            f'Cannot move {batch.status!r} → {new_status!r}'",
    "        )",
    "    batch.status = new_status",
    "    await db.commit()",
])

# ══════════════════════════════════════════════════════════════════════════════
# 6. DIGITAL PROOF CAPTURE
# ══════════════════════════════════════════════════════════════════════════════
add_h1(doc, "6. Digital Proof Capture")
add_body(doc, "The model captures that money moved but has no evidence trail. Every payment event — inward and outward — needs attached proof.")

add_h2(doc, "6.1  What proof means per direction")
simple_table(doc,
    ["Direction", "Payment mode", "Proof required"],
    [
        ["Inward (delivery boy → platform)", "Cash",  "Photo of cash count + admin acknowledgement + timestamp + GPS"],
        ["Inward (delivery boy → platform)", "UPI",   "UPI transaction ID + screenshot"],
        ["Outward (platform → merchant)",    "UPI",   "UPI transaction ID + screenshot"],
        ["Outward (platform → merchant)",    "NEFT",  "UTR number + bank name + value date"],
        ["Outward (platform → delivery boy)","Cash",  "Receipt photo + receiver OTP confirmation"],
        ["Outward (platform → delivery boy)","Cheque","Cheque number + bank + date + scan"],
    ],
    col_widths=[2.5, 1.3, 3.6]
)

add_h2(doc, "6.2  payment_proofs table")
add_code(doc, [
    "payment_proofs",
    "  proof_id              UUID  PK",
    "  proof_type            ENUM: INWARD_CASH | INWARD_UPI |",
    "                              OUTWARD_UPI | OUTWARD_BANK_TRANSFER |",
    "                              OUTWARD_CASH | OUTWARD_CHEQUE",
    "  reference_table       ENUM: delivery_cod_payouts | merchant_payouts |",
    "                              delivery_boy_payments",
    "  reference_id          UUID   FK into whichever table above",
    "  recorded_by           UUID   FK → super_admins",
    "  recorded_at           TIMESTAMP",
    "",
    "  -- Structured proof fields (filled based on proof_type)",
    "  upi_transaction_id    TEXT   NULL",
    "  utr_number            TEXT   NULL",
    "  cheque_number         TEXT   NULL",
    "  bank_name             TEXT   NULL",
    "  payment_date          DATE   NULL",
    "",
    "  -- GPS for inward cash collection",
    "  collection_lat        DECIMAL NULL",
    "  collection_lng        DECIMAL NULL",
    "",
    "  -- File attachments (S3 or local storage paths)",
    "  attachment_1_path     TEXT   NULL   (photo, screenshot, scan)",
    "  attachment_1_type     TEXT   NULL   (image/jpeg | application/pdf | ...)",
    "  attachment_2_path     TEXT   NULL   (optional second file)",
    "  attachment_2_type     TEXT   NULL",
    "",
    "  -- Receiver acknowledgement",
    "  receiver_otp          TEXT   NULL",
    "  receiver_otp_verified BOOLEAN DEFAULT false",
    "  receiver_verified_at  TIMESTAMP NULL",
    "",
    "  notes                 TEXT   NULL",
    "  created_at            TIMESTAMP",
])

add_h2(doc, "6.3  Receiver acknowledgement for inward cash")
add_body(doc, "When an admin records that a delivery boy handed over cash, there is currently no way for the delivery boy to confirm or dispute it. Two options:")
add_bullet(doc, "OTP acknowledgement (Option A — implementable today): System sends a 6-digit OTP to delivery boy's phone when admin initiates the COD clear. Delivery boy reads it back; admin enters it. receiver_otp_verified = true becomes implicit sign-off.", bold_prefix="Option A — ")
add_bullet(doc, "In-app confirmation (Option B — stronger): Delivery boy app shows a pending confirmation screen. Boy taps 'Confirm ₹X received by [admin name]' or disputes. Uses existing WebSocket infrastructure.", bold_prefix="Option B — ")

add_h2(doc, "6.4  State machine guard")
add_warning(doc, "A settlement_line must NOT be allowed to move to SETTLED status unless at least one payment_proofs row exists for its associated payment. Enforce in the state machine service, not just the UI.")

add_h2(doc, "6.5  Components to build")
simple_table(doc,
    ["Component", "Location"],
    [
        ["payment_proofs table + migration",                      "delivery schema"],
        ["File upload endpoint for proof attachments",            "New /admin/proofs/upload"],
        ["OTP acknowledgement on COD clear",                      "Extend /delivery/admin/cod-clear"],
        ["Proof entry UI on COD clear screen",                    "super-admin DeliveryBoysPage"],
        ["Proof entry UI on merchant payout",                     "super-admin MerchantsPage"],
        ["Guard: block SETTLED if no proof",                      "settlement_service.py state machine"],
        ["Delivery boy view own payment history + proof",         "delivery-frontend EarningsPage"],
    ],
    col_widths=[4.0, 3.4]
)

# ══════════════════════════════════════════════════════════════════════════════
# 7. RECONCILIATION MODULE
# ══════════════════════════════════════════════════════════════════════════════
add_h1(doc, "7. Reconciliation Module (The Safety Net)")
add_body(doc, "The current model has no reconciliation capability. The three-way match (internal ledger vs processor logs vs bank statement) is a critical safety net once real money flows.")

add_h2(doc, "7.1  Current state vs requirement")
simple_table(doc,
    ["Layer", "Current state", "What reconciliation needs"],
    [
        ["Internal ledger",  "cod_balance (mutable column)",  "Immutable journal entries"],
        ["Processor logs",   "Nothing — no gateway integrated", "Gateway webhook receiver + transaction log"],
        ["Bank statements",  "Nothing",                       "Bank feed import or MT940 parser"],
        ["Mismatch detection","Nothing",                      "Automated nightly comparison job"],
        ["Exception workflow","Nothing",                      "Ops UI with investigation tools"],
    ],
    col_widths=[1.8, 2.4, 3.2]
)

add_h2(doc, "7.2  Three layers and when each becomes relevant")

add_h3(doc, "Layer 1 — Internal ledger vs payment processor")
add_body(doc, "Relevant when: online payments go live (Razorpay / PhonePe integration).")
add_body(doc, "The reconciliation job compares Razorpay's settlement report against your journal_entries. Every row in the processor report must have a matching internal entry. Unmatched rows are exceptions.")

add_h3(doc, "Layer 2 — Internal ledger vs bank statement")
add_body(doc, "Relevant when: bulk payouts (NEFT / UPI) to merchants and delivery boys begin.")
add_body(doc, "Scenario: your system records payout P001 as SENT, but the bank returns it due to an invalid IFSC. Without importing the bank statement, the system shows SETTLED while the merchant was never paid.")
add_body(doc, "Indian banks export MT940 or CSV. Import to bank_statement_lines, run a nightly matching job against merchant_payouts.")

add_h3(doc, "Layer 3 — Exception handling UI")
add_body(doc, "Relevant when: Layers 1 and 2 are running and producing exceptions.")
add_code(doc, [
    "Exception types:",
    "  MISSING_IN_LEDGER    — bank/processor has it, your system doesn't",
    "  MISSING_IN_BANK      — your system has it, bank doesn't (silent failure)",
    "  AMOUNT_MISMATCH      — same reference, different amounts",
    "  DUPLICATE_SETTLEMENT — same transaction settled twice",
    "  STATUS_MISMATCH      — system says SETTLED, bank says RETURNED",
    "",
    "Resolution options per exception:",
    "  MATCHED_MANUALLY     — ops team confirms it matches, adds a note",
    "  REVERSAL_NEEDED      — triggers a correcting journal entry",
    "  ESCALATED            — passed to finance team for investigation",
])

add_h2(doc, "7.3  The single most important step to take right now")
add_warning(doc, "Store every external event raw before processing it. If your parser has a bug, you can re-run against the original data. Without raw storage, reconciliation is impossible retroactively.")
add_code(doc, [
    "gateway_events",
    "  event_id          UUID  PK",
    "  gateway           TEXT  (razorpay | phonepe | paytm)",
    "  event_type        TEXT  (payment.captured | settlement.processed | refund.created)",
    "  gateway_event_id  TEXT  UNIQUE   ← prevents duplicate processing",
    "  payload           JSONB  ← entire raw webhook body, never delete",
    "  received_at       TIMESTAMP",
    "  processed_at      TIMESTAMP  NULL   (null = not yet processed)",
    "  processing_error  TEXT  NULL",
])

add_h2(doc, "7.4  Build order")
simple_table(doc,
    ["Phase", "When to build", "What to build"],
    [
        ["Now (before settlement ships)",
         "Immediately",
         "Immutable journal ledger + bank_statement_lines table + CSV import endpoint + basic matching query"],
        ["Online payments go live",
         "Before first online transaction",
         "gateway_events table + webhook receiver + nightly gateway vs ledger comparison"],
        ["Payout volume grows",
         "When manual review is impractical",
         "Exception queue UI in super-admin app + resolution workflow (match / reverse / escalate)"],
    ],
    col_widths=[1.8, 1.8, 3.8]
)

# ══════════════════════════════════════════════════════════════════════════════
# 8. MAKER-CHECKER (SPLIT CONTROLS)
# ══════════════════════════════════════════════════════════════════════════════
add_h1(doc, "8. Maker-Checker (Split Controls)")
add_body(doc, "Currently every admin action is single-actor. One admin can create and immediately execute any adjustment with no independent authorisation. This must change for high-risk actions.")

add_h2(doc, "8.1  What Maker-Checker means")
add_bullet(doc, "Maker submits a request — action is NOT executed yet, status = PENDING_APPROVAL.")
add_bullet(doc, "Checker reviews and either APPROVES or REJECTS.")
add_bullet(doc, "On approval, the system executes the action atomically in the same DB transaction.")
add_bullet(doc, "CRITICAL: the Maker and Checker must be different users. Self-approval is blocked at the service layer.")

add_h2(doc, "8.2  approval_requests table")
add_code(doc, [
    "approval_requests",
    "  request_id          UUID  PK",
    "  request_type        ENUM:",
    "                        COD_CLEAR",
    "                        MANUAL_LEDGER_ADJUSTMENT",
    "                        ACCOUNT_STATUS_CHANGE",
    "                        SECTOR_FEE_CHANGE",
    "                        DELIVERY_RATE_CHANGE",
    "                        PAYOUT_OVERRIDE",
    "                        SETTLEMENT_CANCELLATION",
    "",
    "  payload             JSONB  (what the action will do)",
    "  requested_by        UUID   FK → super_admins",
    "  requested_at        TIMESTAMP",
    "",
    "  status              ENUM: PENDING_APPROVAL | APPROVED | REJECTED |",
    "                            EXECUTED | CANCELLED",
    "",
    "  reviewed_by         UUID   NULL  FK → super_admins",
    "  reviewed_at         TIMESTAMP NULL",
    "  reviewer_note       TEXT   NULL",
    "",
    "  executed_at         TIMESTAMP NULL",
    "  execution_result    JSONB  NULL",
    "  execution_error     TEXT   NULL",
    "",
    "  idempotency_key     TEXT   UNIQUE  (prevents double-execution on retry)",
])

add_h2(doc, "8.3  Risk tiers — not everything needs Maker-Checker")
simple_table(doc,
    ["Action", "Risk level", "Control"],
    [
        ["COD clear > ₹5,000",          "High",   "Maker-Checker required"],
        ["COD clear ≤ ₹5,000",          "Medium", "Single admin + audit log"],
        ["Manual ledger adjustment",    "High",   "Maker-Checker required"],
        ["Sector fee change",           "High",   "Maker-Checker required"],
        ["Delivery rate change",        "High",   "Maker-Checker required"],
        ["Account block / unblock",     "Medium", "Single admin + audit log"],
        ["View-only operations",        "None",   "No control needed"],
    ],
    col_widths=[2.8, 1.3, 3.3]
)
add_note(doc, "The ₹5,000 threshold should be stored in the sector fees config table, not hardcoded.")

add_h2(doc, "8.4  Approval state machine")
simple_table(doc,
    ["From", "To", "Who can trigger"],
    [
        ["PENDING_APPROVAL", "APPROVED",   "Any admin except the Maker"],
        ["PENDING_APPROVAL", "REJECTED",   "Any admin except the Maker"],
        ["PENDING_APPROVAL", "CANCELLED",  "The Maker only (withdraws own request)"],
        ["APPROVED",         "EXECUTED",   "System (fires automatically on approval)"],
        ["APPROVED",         "APPROVED",   "Retry allowed if execution failed"],
        ["REJECTED",         "—",          "Terminal state"],
        ["EXECUTED",         "—",          "Terminal state"],
    ],
    col_widths=[1.8, 1.5, 4.1]
)

add_h2(doc, "8.5  Super-admin UI required")
add_bullet(doc, "Pending approvals queue (/dashboard/approvals) — shows all PENDING_APPROVAL requests NOT created by the current user. Approve / Reject buttons with mandatory note on rejection.")
add_bullet(doc, "My requests tab — requests the current admin created, their current status, and Cancel button while still PENDING.")
add_bullet(doc, "Notification — when a Maker submits a request, all other admins receive a WebSocket push. Existing services/realtime.py infrastructure supports this.")

# ══════════════════════════════════════════════════════════════════════════════
# 9. SUPER-ADMIN ROLE MODEL
# ══════════════════════════════════════════════════════════════════════════════
add_h1(doc, "9. Super-Admin Role Model")
add_body(doc, "Currently there is one SuperAdmin table with no role column. Every admin is identical. Maker-Checker requires at least two distinct admin users.")

add_h2(doc, "9.1  Role column to add")
add_code(doc, [
    "ALTER TABLE super_admins ADD COLUMN role TEXT NOT NULL DEFAULT 'operator';",
    "",
    "Valid values:",
    "  SUPER    — can do anything, including creating other admins (founder / CTO)",
    "  MAKER    — can initiate any action, cannot approve own requests",
    "  CHECKER  — can approve/reject requests, can also initiate (becomes MAKER for that request)",
    "  AUDITOR  — read-only, no write access anywhere",
])
add_note(doc, "CHECKER can also initiate requests. When they do, a different CHECKER must approve. The rule is always: you cannot approve your own request, regardless of role.")

add_h2(doc, "9.2  Minimum viable setup")
add_body(doc, "At least 2 active admin accounts are required for the system to be operational:")
add_bullet(doc, "Admin 1: role = MAKER  (e.g. operations executive)")
add_bullet(doc, "Admin 2: role = CHECKER  (e.g. finance manager or founder)")
add_body(doc, "If only 1 admin exists and they submit a request, it will sit in the PENDING queue forever because they cannot self-approve.")

add_h2(doc, "9.3  Admin management")
add_bullet(doc, "Seed script: INSERT the first SUPER admin directly into the DB. That admin creates others via the UI.", bold_prefix="Bootstrap: ")
add_bullet(doc, "/dashboard/admins page visible only to SUPER role. Shows list of admins, add/deactivate form.", bold_prefix="UI: ")
add_bullet(doc, "SUPER role bypasses Maker-Checker for admin management only (creating/deactivating admins). All financial actions still require Maker-Checker.", bold_prefix="SUPER bypass: ")

add_h2(doc, "9.4  JWT changes required")
add_code(doc, [
    "# After OTP verification, include role in the JWT payload:",
    "{",
    '    "sub": str(admin.admin_id),',
    '    "role": admin.role,    # ← add this field',
    '    "exp": ...',
    "}",
    "",
    "# Dependency for role enforcement on endpoints:",
    "def require_role(*allowed_roles):",
    "    def dependency(current_admin = Depends(get_current_admin)):",
    "        if current_admin.role not in allowed_roles:",
    "            raise HTTPException(403, 'Insufficient permissions')",
    "        return current_admin",
    "    return dependency",
    "",
    "# Usage:",
    "@router.post('/approve/{request_id}')",
    "async def approve_request(",
    "    request_id: UUID,",
    "    admin: SuperAdmin = Depends(require_role('CHECKER', 'SUPER'))",
    "):",
    "    ...",
])

add_h2(doc, "9.5  Frontend role-based rendering")
simple_table(doc,
    ["Role", "What they see"],
    [
        ["MAKER",   "Action buttons (create requests) + My requests tab"],
        ["CHECKER", "Approval queue + action buttons + My requests tab"],
        ["AUDITOR", "Read-only views only, all action buttons hidden"],
        ["SUPER",   "Everything above + Admin management page"],
    ],
    col_widths=[1.5, 5.9]
)

add_h2(doc, "9.6  Critical prerequisite")
add_warning(doc, "The cleared_by column on DeliveryCodPayout is currently a free-text String, not a FK to super_admins. This must be changed to cleared_by_admin_id UUID FK → super_admins on every table that records admin actions before Maker-Checker is meaningful.")

# ══════════════════════════════════════════════════════════════════════════════
# 10. BUILD ORDER
# ══════════════════════════════════════════════════════════════════════════════
add_h1(doc, "10. Recommended Build Order")
add_body(doc, "All items are additive — no existing tables are destroyed. Each phase is independently shippable.")

simple_table(doc,
    ["Phase", "Items", "Prerequisite"],
    [
        ["Phase 1\nFoundation",
         "• Add role column to super_admins\n• Seed second admin account\n• Include role in JWT\n• Add require_role dependency to endpoints",
         "None — start here"],
        ["Phase 2\nLedger",
         "• ledger_accounts table\n• journal_entries + journal_lines tables\n• idempotency_key on cod payouts\n• stakeholder_ledger table\n• opening/closing balance on settlement_lines",
         "Phase 1"],
        ["Phase 3\nSettlement flow",
         "• order_financials table\n• settlement_batches + settlement_lines tables\n• State machine service (advance_batch_status)\n• Nightly cron (lock at 23:59, process at 09:00)",
         "Phase 2"],
        ["Phase 4\nProof & controls",
         "• payment_proofs table\n• File upload endpoint\n• OTP acknowledgement on COD clear\n• approval_requests table\n• Maker-Checker flow wired to COD clear + fee changes\n• Approval queue UI in super-admin app",
         "Phase 3"],
        ["Phase 5\nReconciliation",
         "• bank_statement_lines table + CSV import\n• gateway_events table (raw webhook storage)\n• Nightly matching job\n• Exception queue UI in super-admin app",
         "Phase 4 + payment gateway integration"],
    ],
    col_widths=[1.3, 3.8, 2.3]
)

# ══════════════════════════════════════════════════════════════════════════════
# 11. GAPS SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
add_h1(doc, "11. Gaps in Current Model — Quick Reference")
simple_table(doc,
    ["Gap", "Risk if unaddressed", "Fix"],
    [
        ["No double-entry ledger",        "Cannot produce trial balance, cannot detect data corruption",      "journal_entries + journal_lines + virtual accounts"],
        ["No idempotency keys",           "Network retries cause double-payouts",                             "idempotency_key UNIQUE on all payment tables"],
        ["No state machine enforcement",  "Crashed cron leaves batches in inconsistent state",               "State machine service + FOR UPDATE row locks"],
        ["No opening/closing balance",    "Cannot reconstruct historical balance for any settlement date",    "Snapshot on settlement_lines + stakeholder_ledger"],
        ["No proof capture",              "No evidence trail — disputes unresolvable",                        "payment_proofs table + file upload + receiver OTP"],
        ["No reconciliation",             "Silent payout failures go undetected",                             "bank_statement_lines + gateway_events + matching job"],
        ["No Maker-Checker",              "Single compromised admin can execute any financial action",        "approval_requests table + role-based enforcement"],
        ["No admin roles",                "Maker-Checker impossible — no concept of second approver",         "role column on super_admins + role in JWT"],
        ["cleared_by is free text",       "Audit trail cannot prove who performed an action",                "Change to FK → super_admins on all payment tables"],
    ],
    col_widths=[2.1, 2.8, 2.5]
)

# ══════════════════════════════════════════════════════════════════════════════
# FOOTER
# ══════════════════════════════════════════════════════════════════════════════
doc.add_paragraph()
add_divider(doc)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run(f"Thean Platform  ·  Settlement Architecture  ·  {datetime.date.today().strftime('%d %B %Y')}  ·  Confidential")
run.font.size = Pt(9)
run.font.color.rgb = RGBColor(0x9C, 0xA3, 0xAF)

# ── Save ──────────────────────────────────────────────────────────────────────
output_path = "/Users/arunaravind/Documents/Thean/Thean_Settlement_Architecture.docx"
doc.save(output_path)
print(f"Saved: {output_path}")
