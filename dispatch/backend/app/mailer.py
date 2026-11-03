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


def send_code(to: str, name: str, code: str) -> None:
    """The 6-digit code that confirms a new account's email."""
    first = (name or "").split()[0] if (name or "").strip() else "there"
    spaced = " ".join(code)
    inner = f"""
<h1 style="margin:16px 0 8px;font-size:22px;line-height:1.3">Confirm your email</h1>
<p style="margin:0 0 20px;color:{SOFT}">Hi {html.escape(first)}, enter this code in {BRAND} to finish making your account.</p>
<div style="margin:0 0 20px;padding:18px;border-radius:12px;background:{CANVAS};text-align:center;font-size:32px;font-weight:800;letter-spacing:6px;color:{INK}">{spaced}</div>
<p style="margin:0;color:{SOFT};font-size:13px">The code works for 15 minutes. If you didn't sign up, you can ignore this email — the account can't be used without the code.</p>"""
    text = (
        f"Hi {first},\n\nYour {BRAND} code: {code}\n\nEnter it in {BRAND} to confirm your email. "
        "It works for 15 minutes.\nIf you didn't sign up, ignore this email."
    )
    send_later(to, f"{code} is your {BRAND} code", text, _frame(f"Your code: {code}", inner))


def send_reset_code(to: str, name: str, code: str) -> None:
    """"Forgot password": the 6-digit code that lets them choose a new password."""
    first = (name or "").split()[0] if (name or "").strip() else "there"
    spaced = " ".join(code)
    inner = f"""
<h1 style="margin:16px 0 8px;font-size:22px;line-height:1.3">Reset your password</h1>
<p style="margin:0 0 20px;color:{SOFT}">Hi {html.escape(first)}, enter this code in {BRAND}, then choose your new password.</p>
<div style="margin:0 0 20px;padding:18px;border-radius:12px;background:{CANVAS};text-align:center;font-size:32px;font-weight:800;letter-spacing:6px;color:{INK}">{spaced}</div>
<p style="margin:0;color:{SOFT};font-size:13px">The code works for 15 minutes. If you didn't ask for it, ignore this email — your password stays the same.</p>"""
    text = (
        f"Hi {first},\n\nYour {BRAND} password reset code: {code}\n\nEnter it in {BRAND}, then choose a new password. "
        "It works for 15 minutes.\nIf you didn't ask for it, ignore this email — your password stays the same."
    )
    send_later(to, f"{code} is your {BRAND} password reset code", text, _frame(f"Your reset code: {code}", inner))


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
