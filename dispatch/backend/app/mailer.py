"""Email from Smart Marketing — the sign-up confirmation code and the welcome
email. Plain SMTP, so any sender on our domain works: Azure Communication
Services Email, Microsoft 365, Resend, Brevo…

Settings (.env): SMTP_HOST, SMTP_PORT (587 = STARTTLS, 465 = SSL), SMTP_USER,
SMTP_PASSWORD, MAIL_FROM ("Smart Marketing <hello@our-domain>"), MAIL_REPLY_TO
(optional). No SMTP_HOST = email is off: new accounts count as confirmed
(nothing could reach them) and nothing is sent.

Sending runs in a background thread — a mail problem never slows a sign-up;
it's logged, and the person can press "Send a new code".
"""

from __future__ import annotations

import html
import logging
import smtplib
import ssl
import threading
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr

from app.config import get_settings

log = logging.getLogger(__name__)
BRAND = "Smart Marketing"
INK, SOFT, GREEN, CANVAS = "#0F172A", "#64748B", "#0F766E", "#F4F7F6"


def configured() -> bool:
    s = get_settings()
    return bool(s.smtp_host and (s.mail_from or s.smtp_user))


def _send(to: str, subject: str, text: str, body_html: str, attachments: list[tuple[str, bytes, str]] | None = None) -> None:
    s = get_settings()
    sender = s.mail_from or formataddr((BRAND, s.smtp_user))
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=(parseaddr(sender)[1].split("@")[-1] or None))
    if s.mail_reply_to:
        msg["Reply-To"] = s.mail_reply_to
    msg.set_content(text)
    msg.add_alternative(body_html, subtype="html")
    for filename, data, mime in attachments or []:
        main, _, sub = mime.partition("/")
        msg.add_attachment(data, maintype=main, subtype=sub, filename=filename)
    context = ssl.create_default_context()
    if int(s.smtp_port) == 465:
        server = smtplib.SMTP_SSL(s.smtp_host, 465, timeout=30, context=context)
    else:
        server = smtplib.SMTP(s.smtp_host, int(s.smtp_port), timeout=30)
        server.starttls(context=context)
    with server:
        if s.smtp_user:
            server.login(s.smtp_user, s.smtp_password)
        server.send_message(msg)


def send_later(to: str, subject: str, text: str, body_html: str, attachments: list[tuple[str, bytes, str]] | None = None) -> None:
    """Send in the background; a failure is logged, never raised.
    ``attachments``: (filename, bytes, "application/pdf") each."""
    if not configured():
        log.info("mail is off — not sent to %s: %s", to, subject)
        return

    def run() -> None:
        try:
            _send(to, subject, text, body_html, attachments)
            log.info("mail sent to %s: %s", to, subject)
        except Exception as exc:  # noqa: BLE001 — never the caller's problem
            log.warning("mail to %s not sent (%s): %s", to, subject, exc)

    threading.Thread(target=run, daemon=True, name="mail").start()


def _app_url(path: str = "") -> str:
    return get_settings().frontend_url.rstrip("/") + path


def _frame(preheader: str, inner: str) -> str:
    """The shared email look: a white card on a soft background, our logo on top."""
    logo = _app_url("/brand/logo-mark.png")
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:{CANVAS};font-family:'Google Sans',Roboto,Arial,sans-serif;color:{INK}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">{html.escape(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{CANVAS};padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="padding:28px 32px 0"><img src="{logo}" width="40" height="40" alt="{BRAND}" style="display:block;border-radius:10px">
<div style="margin-top:10px;font-size:15px;font-weight:700;color:{INK}">{BRAND}</div></td></tr>
<tr><td style="padding:8px 32px 32px;font-size:15px;line-height:1.6">{inner}</td></tr>
</table>
<div style="max-width:560px;margin-top:16px;font-size:12px;line-height:1.5;color:{SOFT}">
You get this email because an account was made with this address on {BRAND}.<br>
Questions? Just reply to this email — a real person reads it.</div>
</td></tr></table></body></html>"""


def _where(ip: str, ua: str) -> tuple[str, str]:
    """("Phnom Penh, Cambodia", "Chrome on Windows") for the "we received a request" line ("" when unknown)."""
    from app.auth import describe_device
    from app.sessions import _lookup_place

    place = ""
    if ip:
        try:
            place = _lookup_place(ip) or ""
        except Exception:  # noqa: BLE001 — the line just leaves the place out
            place = ""
    return place, (describe_device(ua) if ua else "")


def _request_line(place: str, device: str, action: str) -> tuple[str, str]:
    """The Vercel-style line, as (html, text): "We received a request from Phnom
    Penh, Cambodia (Chrome on Windows) to reset your password."""
    e = html.escape
    where_h = f" from <b>{e(place)}</b>" if place else ""
    where_t = f" from {place}" if place else ""
    dev_h = f" ({e(device)})" if device else ""
    dev_t = f" ({device})" if device else ""
    return (f"We received a request{where_h}{dev_h} to <b>{e(action)}</b>. Use this code:",
            f"We received a request{where_t}{dev_t} to {action}. Use this code:")


def _code_block(code: str) -> str:
    """The code, a digit to a box on a soft panel, with a "Copy code" button (an
    email can't run code, so it opens /copy-code, which copies it — the code after
    "#" never reaches the server), and the plain code to copy by hand."""
    url = _app_url(f"/copy-code#{code}")
    boxes = "".join(
        f'<td style="padding:0 3px"><div style="width:40px;height:50px;line-height:50px;border-radius:8px;background:#ffffff;'
        f'border:1px solid #E2E8F0;text-align:center;font-family:\'SFMono-Regular\',Consolas,Menlo,monospace;font-size:26px;'
        f'font-weight:700;color:{INK}">{html.escape(d)}</div></td>'
        for d in code
    )
    return f"""
<div style="margin:0 0 18px;padding:18px 20px 20px;border-radius:14px;background:{CANVAS}">
<div style="margin:0 0 12px;font-size:13px;font-weight:700;color:{SOFT}">Code requested</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 0 -3px"><tr>{boxes}</tr></table>
<div style="margin:18px 0 0"><a href="{html.escape(url)}" style="display:inline-block;padding:11px 22px;border-radius:999px;background:{GREEN};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Copy code</a></div>
</div>
<p style="margin:0 0 6px;color:{SOFT};font-size:13px">Or copy it: <span style="font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:2px;color:{INK}">{html.escape(code)}</span></p>"""


def _send_code_mail(to: str, subject: str, preheader: str, heading: str, first: str, action: str,
                    code: str, url: str, ignore: str, ip: str, ua: str) -> None:
    """Build (the place is looked up from the IP — a network call) and send, in the background."""
    if not configured():
        log.info("mail is off — not sent to %s: %s", to, subject)
        return

    def run() -> None:
        place, device = _where(ip, ua)
        line_h, line_t = _request_line(place, device, action)
        inner = f"""
<h1 style="margin:16px 0 10px;font-size:22px;line-height:1.3">{html.escape(heading)}</h1>
<p style="margin:0 0 16px">Hi {html.escape(first)}, {line_h[0].lower()}{line_h[1:]}</p>
{_code_block(code)}
<p style="margin:12px 0 0;color:{SOFT};font-size:13px">This code expires in 15 minutes. {html.escape(ignore)}</p>"""
        text = (
            f"Hi {first},\n\n{line_t}\n\n{code}\n\nCopy it: {url}\n\n"
            f"This code expires in 15 minutes. {ignore}"
        )
        send_later(to, subject, text, _frame(preheader, inner))

    threading.Thread(target=run, daemon=True, name="mail-build").start()


def send_code(to: str, name: str, code: str, ip: str = "", ua: str = "") -> None:
    """The 6-digit code that confirms a new account's email."""
    first = (name or "").split()[0] if (name or "").strip() else "there"
    _send_code_mail(
        to, f"{code} is your {BRAND} code", f"Your code: {code}", "Confirm your email", first,
        "confirm your email for a new Smart Marketing account", code, _app_url(f"/copy-code#{code}"),
        "If you didn't sign up, you can safely ignore this email — the account can't be used without the code.", ip, ua,
    )


def send_reset_code(to: str, name: str, code: str, ip: str = "", ua: str = "") -> None:
    """"Forgot password": the 6-digit code that lets them choose a new password."""
    first = (name or "").split()[0] if (name or "").strip() else "there"
    _send_code_mail(
        to, f"{code} is your {BRAND} password reset code", f"Your reset code: {code}", "Reset your password", first,
        "reset your Smart Marketing password", code, _app_url(f"/copy-code#{code}"),
        "If you didn't ask for it, you can safely ignore this email — your password stays the same.", ip, ua,
    )


def send_password_changed(to: str, name: str) -> None:
    """A heads-up after a reset — if it wasn't them, they know at once."""
    first = (name or "").split()[0] if (name or "").strip() else "there"
    inner = f"""
<h1 style="margin:16px 0 8px;font-size:22px;line-height:1.3">Your password was changed</h1>
<p style="margin:0 0 16px">Hi {html.escape(first)}, the password of your {BRAND} account was just changed, and every other device was signed out.</p>
<p style="margin:0;color:{SOFT};font-size:14px">Wasn't you? Reset it again right away from the sign-in page ("Forgot password?"), and reply to this email so we can help.</p>"""
    text = (
        f"Hi {first},\n\nThe password of your {BRAND} account was just changed, and every other device was signed out.\n"
        "Wasn't you? Reset it again from the sign-in page and reply to this email."
    )
    send_later(to, f"Your {BRAND} password was changed", text, _frame("Your password was changed.", inner))


def send_invoice(to: str, name: str, *, what: str, amount: str, until: str, top_up: bool, number: str, pdf: bytes) -> None:
    """After a payment is confirmed: thank you, what they got, and the invoice PDF attached.
    ``what``: "Starter plan" or "10 videos"; ``until``: when the plan runs to / the extras last."""
    first = (name or "").split()[0] if (name or "").strip() else "there"
    e = html.escape
    lasts = (f"Your extras are ready to use until {until}." if top_up else f"Your plan is on until {until}.") if until else ""
    rows = [("Invoice", number), ("For", what), ("Paid", amount + " · KHQR")]
    table = "".join(
        f'<tr><td style="padding:6px 0;color:{SOFT};font-size:14px">{e(k)}</td>'
        f'<td style="padding:6px 0;text-align:right;font-weight:700;font-size:14px">{e(v)}</td></tr>'
        for k, v in rows
    )
    inner = f"""
<h1 style="margin:16px 0 8px;font-size:22px;line-height:1.3">Payment received — thank you!</h1>
<p style="margin:0 0 18px">Hi {e(first)}, we've received your payment for <b>{e(what)}</b>. {e(lasts)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;padding:12px 16px;border-radius:12px;background:{CANVAS}">{table}</table>
<p style="margin:0 0 20px;color:{SOFT};font-size:14px">Your invoice is attached as a PDF. You can also download it any time from Settings → Billing.</p>
<div style="margin:0 0 8px"><a href="{_app_url('/?settings=billing')}" style="display:inline-block;padding:12px 22px;border-radius:12px;background:{GREEN};color:#ffffff;font-weight:700;text-decoration:none">Open billing</a></div>"""
    text = (
        f"Hi {first},\n\nWe've received your payment for {what}. {lasts}\n\n"
        f"Invoice: {number}\nFor: {what}\nPaid: {amount} · KHQR\n\n"
        f"Your invoice is attached as a PDF — also in Settings → Billing: {_app_url('/?settings=billing')}\n\nThank you,\nThe {BRAND} team"
    )
    send_later(
        to,
        f"Payment received — your {BRAND} invoice {number}",
        text,
        _frame(f"Payment received — {what}, {amount}.", inner),
        [(f"{number}.pdf", pdf, "application/pdf")],
    )


def send_welcome(to: str, name: str) -> None:
    """Welcome to Smart Marketing — sent once the email is confirmed (or right after a Google sign-up)."""
    first = (name or "").split()[0] if (name or "").strip() else "there"
    steps = [
        ("Connect your pages", "Facebook, Instagram, TikTok, LinkedIn, YouTube and Telegram — post to all of them from one place.", "/channels"),
        ("Make your first video", "Tell the AI your idea or paste your story. It writes the storyboard, the Khmer voice-over and the video.", "/ai"),
        ("Get your weekly plan", "A week of posts written for your brand, each at its best time — check them, then let them go out.", "/weekly"),
        ("Watch what works", "Every post's reach and engagement in one view, and which ones are worth a boost.", "/insights"),
    ]
    rows = "".join(
        f"""<tr><td style="padding:0 0 14px;vertical-align:top;width:34px">
<div style="width:26px;height:26px;border-radius:13px;background:{GREEN};color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:26px">{i}</div></td>
<td style="padding:0 0 14px"><a href="{_app_url(path)}" style="color:{INK};font-weight:700;text-decoration:none">{html.escape(title)}</a>
<div style="color:{SOFT};font-size:14px">{html.escape(body)}</div></td></tr>"""
        for i, (title, body, path) in enumerate(steps, 1)
    )
    inner = f"""
<h1 style="margin:16px 0 8px;font-size:24px;line-height:1.3">Welcome to {BRAND}, {html.escape(first)} 👋</h1>
<p style="margin:0 0 8px">Your AI marketing team is ready. Plan, write, design and post — in Khmer and English — and see what really brings you customers.</p>
<p style="margin:0 0 22px;color:{SOFT}">Here's where to start, and what's beyond:</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">{rows}</table>
<div style="margin:10px 0 22px"><a href="{_app_url('/')}" style="display:inline-block;padding:12px 22px;border-radius:12px;background:{GREEN};color:#ffffff;font-weight:700;text-decoration:none">Open {BRAND}</a></div>
<p style="margin:0;color:{SOFT};font-size:14px">New to it? Short video lessons show every step: <a href="{_app_url('/tutorials')}" style="color:{GREEN}">Watch the tutorials</a>.</p>
<p style="margin:16px 0 0">Glad to have you,<br><b>The {BRAND} team</b></p>"""
    text = (
        f"Welcome to {BRAND}, {first}!\n\nYour AI marketing team is ready. Where to start:\n"
        + "".join(f"{i}. {t} — {b} {_app_url(p)}\n" for i, (t, b, p) in enumerate(steps, 1))
        + f"\nOpen {BRAND}: {_app_url('/')}\nTutorials: {_app_url('/tutorials')}\n\nGlad to have you,\nThe {BRAND} team"
    )
    send_later(to, f"Welcome to {BRAND} — let's make your first post", text, _frame("Your AI marketing team is ready.", inner))
