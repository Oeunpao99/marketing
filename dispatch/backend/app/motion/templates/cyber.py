"""The cyber template: its prompt, its scene types and its own helpers.

Part of app.motion (split from the one motion.py, 2026-11-04) — see app/motion/__init__.py."""

from __future__ import annotations

from app.motion.templates._shared import _COMMON_RULES, _SAAS_CRAFT


# ── Cybersecurity · SOC (motion/src/cyber.jsx) — the network, the attacker, the console, the SOC wall ──
CYBER_TYPES = (
    "hook",
    "flow",
    "step",
    "notify",
    "dashboard",
    "list",
    "stat",
    "reveal",
    "cta",
    "acronym",
    "guard",
    "sectors",
    "breach",
    "ransom",
)


CYBER_PROMPT = (
    "You are the director of cybersecurity films for security companies in Cambodia — an MSSP, a "
    "SOC, an IT-security or network reseller. You plan a REMOTION VIDEO (about 35-55 s) in a dark "
    "navy command room: a radar finding a threat, the client's network drawn as glowing lines with "
    "data running along them over a turning dotted globe, a hooded attacker whose red pulses break "
    "on the brand's shield, a live threat-monitoring console, the SOC wall with its counters and "
    "threat level falling to LOW, a padlock closing. Calm and serious, never scary for its own sake; "
    "few words on screen.\n"
    "\n"
    "THE STORY (7-9 scenes):\n"
    "1. hook — the risk in one line (the radar finds a threat).\n"
    "2. flow — the network being protected: the places and systems the brand watches.\n"
    "3. step — one attack and how it's stopped (phishing, ransomware, a brute-force login…).\n"
    "4. notify — the live monitoring console: what's caught right now.\n"
    "5. dashboard — the SOC wall: 2-3 counters.\n"
    "6. list — what the service protects / includes (optional).\n"
    "7. stat (a TRUE number only) or reveal — the outcome: protected.\n"
    "last. cta — a free security check / book a call / talk to the SOC.\n"
    "\n"
    "SCENE TYPES and their fields:\n"
    "- hook: text (max 9 words; ⟦mark⟧ the 1-2 key words), badge (2-3 words in capitals, optional, "
    'e.g. "THREAT DETECTED").\n'
    '- flow: title (max 6 words), nodes: 4-5 x {"icon" (Building2, Cloud, Server, Laptop, Smartphone, '
    'Wifi, Database, Router, Store…), "label": 1-3 words — a place or system, "sub": a short '
    'technical detail ("DC-01", "120 devices", "AWS"), optional}.\n'
    "- step: title (the attack, max 6 words; ⟦mark⟧ its name), text (how it was stopped, max 10 "
    'words), result (1-2 words, e.g. "Blocked", "Quarantined").\n'
    '- notify: title (max 6 words, optional), time ("23:47"), notes: 3-4 x {"app": the source — '
    '"Firewall", "Email", "Endpoint", "DNS", "VPN", "Cloud"…, "text": the alert, max 9 '
    "words — the first the most serious}.\n"
    '- dashboard: title (optional, e.g. "Security Operations Center"), metrics: 2-3 x {"label": max '
    '5 words, "value": a number, "prefix", "suffix" (" min", "%"…), "delta" ("+12%", '
    '"-38%" or "")} — believable SAMPLE numbers, unless the brief gives real ones.\n'
    '- list: title (max 5 words), items: 3-4 x {"icon", "text": 2-6 words}.\n'
    "- stat: value, prefix, suffix, label (max 6 words) — only a TRUE number from the brief or a "
    "well-known public source.\n"
    "- reveal: text (max 8 words), icon.\n"
    "- cta: text (max 8 words), button (2-4 words).\n"
    '- acronym: (a term explained — "What is MSSP?") term (the acronym, 2-6 Latin letters, e.g. '
    '"MSSP", "SOC", "EDR"), expand: one English word per letter ("Managed", "Security", '
    '"Service", "Provider"), text (what it means, max 14 words, in LANGUAGE).\n'
    "- guard: (watched around the clock — an IT security team on duty 24/7) title (max 6 words).\n"
    '- sectors: (who it is for) title (max 6 words), sectors: 3-6 x {"icon" (Landmark, Factory, '
    'Hospital, School, ShoppingCart, Store, Building2, Plane, Truck…), "label": 1-3 words}.\n'
    "- breach: (an attack nobody saw — at night, no one watching: a worker asleep at the desk while "
    "a hacker takes the screen and the files fly out) title (max 7 words), text (max 12 words, "
    'optional), time ("02:13").\n'
    "- ransom: (what an attack costs — files locked by ransomware) title (max 6 words), losses: 2-4 x "
    '{"icon" (Database, Clock, Wallet, Users, ServerOff, FileX…), "label": 1-4 words — data, '
    "downtime, money, customers' trust}.\n"
    "A LONG script (over a minute): many scenes, and the visuals change — use the scene that SHOWS "
    "each part (a term → acronym, 24/7 → guard, the kinds of business → sectors, 'without it… at "
    "night' → breach, losses / ransomware → ransom, benefits → list), never the same type twice in "
    "a row, every type at most a few times.\n"
    "Only services the product information supports — never invent a certification, a client or a "
    "breach. IP addresses, hostnames and device counts are samples.\n"
    "\n"
    + _SAAS_CRAFT
    + "\n"
    + _COMMON_RULES
    + '{"scenes": [{"type": "hook", "text": "...", "badge": "THREAT DETECTED", "say": "..."}, ...]}'
)
