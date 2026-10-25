"""The invoice for a paid plan (app/payments.py) as a one-page A4 PDF — drawn with
Pillow (already on the server: no PDF library to install) at 300 dpi and saved as
PDF. Settings → Billing and the thank-you screen download it
(POST /api/billing/payments/{id}/invoice). Laid out like a standard SaaS invoice:

    Invoice                                   [logo]
    Invoice number  INV-2026-000018
    Date of issue   October 25, 2026
    Date paid       October 25, 2026

    Proseth Solutions Co., Ltd     Bill to
    address lines                  name · workspace
    email                          email

    $0.10 USD paid October 25, 2026

    Description              Qty   Unit price   Amount
    ─────────────────────────────────────────────────
    Smart Marketing — Starter  1        $0.10    $0.10
    Oct 25 – Nov 24, 2026
                                Subtotal          $0.10
                                Total             $0.10
                                Amount paid       $0.10

    Payment: KHQR · Bakong · reference · transaction · paid from
"""

from __future__ import annotations

import io
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

from PIL import Image, ImageDraw

from app.config import get_settings
from app.meme import _font

DPI = 300
W, H = 2480, 3508  # A4 at 300 dpi
M = 190  # the page margin
INK = (17, 24, 39)
SOFT = (95, 104, 118)
LINE = (220, 224, 230)
DARK_LINE = (40, 46, 56)
GREEN = (22, 150, 90)
LOGO = Path(__file__).parent / "assets" / "logo-mark.png"


def number(payment_id: int, paid_at: datetime | None) -> str:
    """INV-2026-000012 — the year it was paid and the payment's own number."""
    year = (paid_at or datetime.now(UTC)).year
    return f"INV-{year}-{payment_id:06d}"


def _money(amount: float, currency: str) -> str:
    return f"{round(amount):,} KHR" if currency == "KHR" else f"${amount:,.2f}"


def _long(d: datetime | None) -> str:
    """October 25, 2026"""
    if not d:
        return "—"
    d = d.astimezone(UTC)
    return f"{d:%B} {d.day}, {d.year}"


def _short(d: datetime | None) -> str:
    """Oct 25, 2026"""
    if not d:
        return "—"
    d = d.astimezone(UTC)
    return f"{d:%b} {d.day}, {d.year}"


def _lines(value: str) -> list[str]:
    """A setting written on one line: "|" starts a new one."""
    return [x.strip() for x in (value or "").split("|") if x.strip()]


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
    customer_workspace: str = "",
    top_up_credits: int | None = None,
) -> bytes:
    """The invoice as PDF bytes."""
    s = get_settings()
    seller = (s.invoice_company or s.bakong_merchant_name or "Smart Marketing").strip()
    seller_lines = _lines(s.invoice_address) + ([f"VAT TIN: {s.invoice_tax_id.strip()}"] if s.invoice_tax_id.strip() else []) + _lines(s.invoice_email)

    im = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(im)
    title, head, bold, body, small = _font(104, "Bold"), _font(66, "Bold"), _font(42, "Bold"), _font(42, "Regular"), _font(38, "Regular")
    lh = 62  # a body line's height

    # ── "Invoice" and our logo ────────────────────────────────────────────
    d.text((M, M), "Invoice", font=title, fill=INK)
    try:
        logo = Image.open(LOGO).convert("RGBA")
        logo.thumbnail((200, 200))
        im.paste(logo, (W - M - logo.width, M - 10), logo)
    except OSError:
        pass  # no logo file — the invoice is fine without it

    # ── the invoice's details ─────────────────────────────────────────────
    y = M + 190
    for label, value in (("Invoice number", number(payment_id, paid_at)), ("Date of issue", _long(paid_at)), ("Date paid", _long(paid_at))):
        d.text((M, y), label, font=bold, fill=INK)
        d.text((M + 430, y), value, font=body, fill=INK)
        y += lh

    # ── who it's from · who it's to ───────────────────────────────────────
    y += 90
    col2 = W // 2 + 40
    d.text((M, y), seller, font=bold, fill=INK)
    d.text((col2, y), "Bill to", font=bold, fill=INK)
    left = seller_lines
    right = [x for x in (customer_name, customer_workspace if customer_workspace != customer_name else "", customer_email) if x]
    for i in range(max(len(left), len(right))):
        yy = y + lh * (i + 1)
        if i < len(left):
            d.text((M, yy), left[i], font=body, fill=INK)
        if i < len(right):
            d.text((col2, yy), right[i], font=body, fill=INK)
    y += lh * (max(len(left), len(right)) + 1) + 100

    # ── the headline: how much, paid when ─────────────────────────────────
    d.text((M, y), f"{_money(amount, currency)}{' USD' if currency == 'USD' else ''} paid {_long(paid_at)}", font=head, fill=INK)
    tag = (W - M - 230, y + 4, W - M, y + 84)
    d.rounded_rectangle(tag, radius=40, fill=(232, 247, 239))
    d.text(((tag[0] + tag[2]) / 2, (tag[1] + tag[3]) / 2), "PAID", font=bold, fill=GREEN, anchor="mm")
    y += 170

    # ── the table ─────────────────────────────────────────────────────────
    qty_x, unit_x, amount_x = W - M - 640, W - M - 300, W - M  # right edges
    d.text((M, y), "Description", font=small, fill=SOFT)
    d.text((qty_x, y), "Qty", font=small, fill=SOFT, anchor="ra")
    d.text((unit_x, y), "Unit price", font=small, fill=SOFT, anchor="ra")
    d.text((amount_x, y), "Amount", font=small, fill=SOFT, anchor="ra")
    y += 64
    d.line((M, y, W - M, y), fill=DARK_LINE, width=4)
    y += 34
    if top_up_credits:  # extra credits: they last until the month ends (period_end = the 1st after)
        item = f"Smart Marketing — {top_up_credits:,} AI credits"
        # the month ends at midnight Phnom Penh time — its last day, as a date there
        last = (period_end.astimezone(timezone(timedelta(hours=7))) - timedelta(days=1)) if period_end else None
        detail = f"Credit top-up · use by {f'{last:%b} {last.day}, {last.year}' if last else '—'}"
    else:
        item = f"Smart Marketing — {plan_label} plan"
        detail = f"{_short((period_end - timedelta(days=30)) if period_end else paid_at)} – {_short(period_end)}"
    d.text((M, y), item, font=body, fill=INK)
    d.text((qty_x, y), "1", font=body, fill=INK, anchor="ra")
    d.text((unit_x, y), _money(amount, currency), font=body, fill=INK, anchor="ra")
    d.text((amount_x, y), _money(amount, currency), font=body, fill=INK, anchor="ra")
    d.text((M, y + lh), detail, font=body, fill=SOFT)
    y += lh * 2 + 60

    # ── the totals, on the right ──────────────────────────────────────────
    tx = W - M - 850
    for label, font in (("Subtotal", body), ("Total", body), ("Amount paid", bold)):
        d.line((tx, y, W - M, y), fill=LINE, width=3)
        y += 22
        d.text((tx, y), label, font=font, fill=INK)
        d.text((W - M, y), _money(amount, currency) + (" USD" if label == "Amount paid" and currency == "USD" else ""), font=font, fill=INK, anchor="ra")
        y += lh + 8

    # ── how it was paid ───────────────────────────────────────────────────
    y += 110
    rows = [
        ("Payment method", "KHQR · Bakong (National Bank of Cambodia)"),
        ("Payment reference", bill_number),
        ("Bakong transaction", (bakong_hash or "—")[:44]),
        ("Paid from", from_account or "—"),
    ]
    box_h = 70 + len(rows) * 58 + 40
    d.rounded_rectangle((M, y, W - M, y + box_h), radius=26, fill=(247, 248, 250))
    d.text((M + 50, y + 40), "Payment", font=bold, fill=INK)
    yy = y + 110
    for label, value in rows:
        d.text((M + 50, yy), label, font=small, fill=SOFT)
        d.text((M + 620, yy), value, font=small, fill=INK)
        yy += 58

    # ── the foot ──────────────────────────────────────────────────────────
    d.line((M, H - M - 90, W - M, H - M - 90), fill=LINE, width=3)
    d.text((M, H - M - 50), f"{seller} · Smart Marketing", font=small, fill=SOFT)
    d.text((W - M, H - M - 50), "Issued electronically — valid without a signature", font=small, fill=SOFT, anchor="ra")

    out = io.BytesIO()
    im.save(out, "PDF", resolution=DPI)
    return out.getvalue()
