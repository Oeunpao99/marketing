"""KHQR — Cambodia's national QR payment code (Bakong, the National Bank of
Cambodia), an EMVCo merchant-presented QR: a string of ID · length · value
fields with a CRC at the end. Any Cambodian bank app scans it and pays the
amount into our Bakong account (app/payments.py).

    00 01            payload format
    01 12            dynamic (one payment, a fixed amount)
    29 / 30          our Bakong account (29 individual, 30 merchant — with its merchant id)
    52 5999          merchant category
    53 840 | 116     USD | KHR
    54 9.00          the amount
    58 KH, 59 name, 60 city
    62               bill number (our payment's reference)
    99               created + expires (ms)
    63 CRC16         CCITT-FALSE over everything before it, "6304" included

Bakong finds the payment by the md5 of the whole string (app/bakong.py), so
each code is unique: the bill number and the timestamps differ every time.
"""

from __future__ import annotations

import hashlib

CURRENCY_CODE = {"USD": "840", "KHR": "116"}


def _f(tag: str, value: str) -> str:
    if len(value) > 99:
        raise ValueError(f"KHQR field {tag} is too long ({len(value)} characters)")
    return f"{tag}{len(value):02d}{value}"


def crc16(data: str) -> str:
    """CRC-16/CCITT-FALSE (poly 0x1021, start 0xFFFF), 4 upper-case hex digits."""
    crc = 0xFFFF
    for byte in data.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else (crc << 1)
            crc &= 0xFFFF
    return f"{crc:04X}"


def amount_text(amount: float, currency: str) -> str:
    """As the official KHQR library writes it: a whole USD amount bare ("9"),
    else with cents ("12.50"); KHR whole riel ("36000")."""
    if currency == "USD":
        cents = round(amount * 100)
        return str(cents // 100) if cents % 100 == 0 else f"{cents / 100:.2f}"
    return str(int(round(amount)))


def build(
    *,
    account_id: str,
    merchant_name: str,
    merchant_city: str,
    amount: float,
    currency: str,
    bill_number: str,
    created_ms: int,
    expires_ms: int,
    merchant_id: str = "",
    acquiring_bank: str = "",
    store_label: str = "",
) -> str:
    """One dynamic KHQR string for ``amount`` in ``currency`` paid to ``account_id``."""
    if currency not in CURRENCY_CODE:
        raise ValueError("currency must be USD or KHR")
    if amount <= 0:
        raise ValueError("amount must be more than 0")
    if merchant_id:  # a merchant account: its Bakong id, merchant id and bank
        account = _f("30", _f("00", account_id) + _f("01", merchant_id) + _f("02", acquiring_bank or "Bakong"))
    else:  # an individual account
        account = _f("29", _f("00", account_id) + (_f("02", acquiring_bank) if acquiring_bank else ""))
    extra = _f("01", bill_number[:25]) + (_f("03", store_label[:25]) if store_label else "")
    body = (
        _f("00", "01")
        + _f("01", "12")
        + account
        # the official library's order
        + _f("52", "5999")
        + _f("53", CURRENCY_CODE[currency])
        + _f("54", amount_text(amount, currency))
        + _f("58", "KH")
        + _f("59", merchant_name[:25])
        + _f("60", merchant_city[:15])
        + _f("62", extra)
        + _f("99", _f("00", str(created_ms)) + _f("01", str(expires_ms)))
        + "6304"
    )
    return body + crc16(body)


def md5(qr: str) -> str:
    """What Bakong looks a payment up by."""
    return hashlib.md5(qr.encode("utf-8")).hexdigest()


def parse(qr: str) -> dict[str, str]:
    """Top-level fields of a KHQR string (for tests and the admin view)."""
    out, i = {}, 0
    while i + 4 <= len(qr):
        tag, n = qr[i : i + 2], int(qr[i + 2 : i + 4])
        out[tag] = qr[i + 4 : i + 4 + n]
        i += 4 + n
    return out


def valid(qr: str) -> bool:
    """The CRC at the end matches the rest."""
    return len(qr) > 8 and qr[-8:-4] == "6304" and crc16(qr[:-4]) == qr[-4:]
