"""The invoice for a paid plan (app/payments.py) as a one-page A4 PDF — drawn with
Pillow (already on the server: no PDF library to install) at 300 dpi and saved as
PDF. Settings → Billing and the thank-you screen download it
(POST /api/billing/payments/{id}/invoice).

    ┌──────────────────────────────────────────┐
    │ Proseth Solutions Co., Ltd      INVOICE  │  the seller (INVOICE_* in .env)
    │ address · tax id · email          [PAID] │
    │──────────────────────────────────────────│
    │ Invoice no.   Date paid   Billed to      │
    │──────────────────────────────────────────│
    │ Smart Marketing · Pro plan     $49.00    │  the one line
    │ 24 Oct – 23 Nov 2026                     │
    │                          Total  $49.00   │
    │ Paid with KHQR (Bakong) · ref …          │
    └──────────────────────────────────────────┘
"""

from __future__ import annotations

import io
from datetime import UTC, datetime, timedelta

from PIL import Image, ImageDraw

from app.config import get_settings
from app.meme import _font

DPI = 300
W, H = 2480, 3508  # A4 at 300 dpi
M = 200  # the page margin
INK = (17, 24, 39)
SOFT = (100, 110, 125)
LINE = (226, 230, 236)
BRAND = (31, 78, 140)
GREEN = (22, 150, 90)


def number(payment_id: int, paid_at: datetime | None) -> str:
    """INV-2026-000012 — the year it was paid and the payment's own number."""
    year = (paid_at or datetime.now(UTC)).year
    return f"INV-{year}-{payment_id:06d}"


def _money(amount: float, currency: str) -> str:
    return f"{round(amount):,} KHR" if currency == "KHR" else f"${amount:,.2f}"


def _day(d: datetime | None) -> str:
    return d.astimezone(UTC).strftime("%d %b %Y") if d else "—"


def render(
    *,
    payment_id: int,
    plan_label: str,
    amount: float,
    currency: str,
    paid_at: datetime | None,
    period_end: datetime | None,
    bill_number: str,
    bakong_hash: str,
    from_account: str,
    customer_name: str,
    customer_email: str,
) -> bytes:
    """The invoice as PDF bytes."""
    s = get_settings()
    seller = (s.invoice_company or s.bakong_merchant_name or "Smart Marketing").strip()
    seller_lines = [x for x in (s.invoice_address.strip(), f"Tax ID: {s.invoice_tax_id.strip()}" if s.invoice_tax_id.strip() else "", s.invoice_email.strip()) if x]
    im = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(im)
    big, h1, h2, body, small = _font(96, "Bold"), _font(58, "Bold"), _font(44, "Bold"), _font(42, "Regular"), _font(36, "Regular")

    # the brand band at the very top
    d.rectangle((0, 0, W, 28), fill=BRAND)
    # the seller, left; INVOICE and PAID, right
    y = M
    d.text((M, y), seller, font=h1, fill=INK)
    yy = y + 90
    for ln in seller_lines:
        d.text((M, yy), ln, font=small, fill=SOFT)
        yy += 54
    d.text((W - M, y - 6), "INVOICE", font=big, fill=BRAND, anchor="ra")
    stamp = (W - M - 300, y + 130, W - M, y + 230)
    d.rounded_rectangle(stamp, radius=24, outline=GREEN, width=8)
    d.text(((stamp[0] + stamp[2]) / 2, (stamp[1] + stamp[3]) / 2), "PAID", font=h2, fill=GREEN, anchor="mm")

    # invoice no. · date paid · billed to
    y = max(yy, y + 260) + 90
    d.line((M, y, W - M, y), fill=LINE, width=4)
    y += 70
    cols = [(M, "Invoice no.", number(payment_id, paid_at)), (M + 700, "Date paid", _day(paid_at)), (M + 1300, "Billed to", customer_name or "—")]
    for x, label, value in cols:
        d.text((x, y), label.upper(), font=small, fill=SOFT)
        d.text((x, y + 56), value, font=h2, fill=INK)
    if customer_email:
        d.text((M + 1300, y + 122), customer_email, font=small, fill=SOFT)
    y += 230
    d.line((M, y, W - M, y), fill=LINE, width=4)

    # the line: what was bought, the period, the amount
    y += 80
    d.text((M, y), "DESCRIPTION", font=small, fill=SOFT)
    d.text((W - M, y), "AMOUNT", font=small, fill=SOFT, anchor="ra")
    y += 80
    start = (period_end - timedelta(days=30)) if period_end else paid_at
    d.text((M, y), f"Smart Marketing — {plan_label} plan, one month", font=h2, fill=INK)
    d.text((W - M, y), _money(amount, currency), font=h2, fill=INK, anchor="ra")
    d.text((M, y + 70), f"Service period: {_day(start)} – {_day(period_end)}", font=body, fill=SOFT)
    y += 190
    d.line((M, y, W - M, y), fill=LINE, width=4)
    y += 60
    for label, value, font, colour in (("Subtotal", _money(amount, currency), body, SOFT), ("Total paid", _money(amount, currency), h1, INK)):
        d.text((W - M - 760, y), label, font=font, fill=colour)
        d.text((W - M, y), value, font=font, fill=colour, anchor="ra")
        y += 90

    # how it was paid
    y += 80
    d.rounded_rectangle((M, y, W - M, y + 330), radius=28, fill=(246, 248, 251))
    d.text((M + 50, y + 45), "PAYMENT", font=small, fill=SOFT)
    rows = [
        ("Method", "KHQR · Bakong (National Bank of Cambodia)"),
        ("Payment reference", bill_number),
        ("Bakong transaction", (bakong_hash or "—")[:40]),
        ("Paid from", from_account or "—"),
    ]
    yy = y + 100
    for label, value in rows:
        d.text((M + 50, yy), label, font=small, fill=SOFT)
        d.text((M + 620, yy), value, font=small, fill=INK)
        yy += 54

    # the foot
    d.text((W / 2, H - M), "Thank you for choosing Smart Marketing.", font=body, fill=SOFT, anchor="mm")
    d.text((W / 2, H - M + 60), "This invoice was issued electronically and is valid without a signature.", font=small, fill=SOFT, anchor="mm")

    out = io.BytesIO()
    im.save(out, "PDF", resolution=DPI)
    return out.getvalue()
