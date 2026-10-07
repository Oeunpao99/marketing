# Sending Chumnouykar leads to ContentFlow

When the Chumnouykar chatbot has talked with a customer, send the conversation to
ContentFlow. It becomes a lead in **Leads & hand-off**: scored, routed to the right
sales rep, posted in the sales team's Telegram group, and linked to the social post
that started the chat.

This is one HTTPS call. No login, no SDK.

---

## 1. Get the key and address

A ContentFlow owner or admin opens **Setup → Channels → "Chatbots → leads"** and
presses **Make a key**. The card shows:

- the key — `cfk_…` (shown once; store it like a password)
- the address to call — `https://<contentflow-address>/api/intake/leads`
- the `brand_id` of each brand, if the workspace has more than one

A new key replaces the old one immediately. **Turn off** disables intake.

## 2. Send a lead

```
POST https://<contentflow-address>/api/intake/leads
Content-Type: application/json
X-ContentFlow-Key: cfk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```json
{
  "external_id": "tg-58210931",
  "brand_id": 2,
  "ref": "P123",
  "source": "Telegram bot",
  "name": "Sokha Mart · 3 branches",
  "industry": "Retail",
  "contact_name": "Owner",
  "phone": "012 345 678",
  "email": "",
  "need": "Bot that checks stock in 3 branches and answers price questions",
  "volume": "~150 chats / day",
  "timeline": "Before November",
  "summary": "",
  "score": null,
  "messages": [
    { "from": "customer", "text": "Can it check stock before answering? We have 3 branches." },
    { "from": "bot", "text": "Yes — it reads stock per branch. How many chats a day do you get?" },
    { "from": "customer", "text": "Around 150. How much? We want to start before November." }
  ]
}
```

Only `external_id` is required. Send whatever else the bot knows.

| Field | What to send |
|---|---|
| `external_id` | **Required.** Your own id for this conversation (max 120). Sending the same id again **updates** that lead instead of adding a new one. |
| `brand_id` | Which brand the chat belongs to. Leave it out only if the workspace has one brand. |
| `ref` | The post code from the link the customer came through, e.g. `P123` (see section 3). Leave empty if unknown. |
| `source` | Where the chat happened: `Telegram bot`, `Messenger bot`, `Instagram DM bot`, `Website chat`, `TikTok comment`… |
| `name` | Company, or the person if no company. Defaults to `contact_name`, then `Chat <external_id>`. |
| `industry` | e.g. `Retail`, `Healthcare`, `Banking & finance`. **This picks the sales rep** — use the same words as the reps' industries in ContentFlow. |
| `contact_name`, `phone`, `email` | How to reach them. A lead is only ready for a rep once it has a phone or email. |
| `need` | What they need, in one or two sentences. |
| `volume`, `timeline` | e.g. `~150 chats / day`, `this week`. Both raise the score. |
| `summary` | One line for the list. Empty = taken from `need`. |
| `score` | 0–100 if your bot scores leads itself. `null` = ContentFlow scores it. |
| `messages` | Up to 60; ContentFlow keeps the last 30. `from` is `customer`, `bot` or `rep`; `text` max 1,000 characters. |

Text can be Khmer or English.

### Reply

```json
{ "id": 41, "created": true, "status": "qualifying", "score": 40, "temperature": "warm", "post_id": 123 }
```

- `created` — `true` for a new lead, `false` when `external_id` updated an existing one
- `status` — `qualifying` (still being qualified), `ready` (waiting for a rep), `handed_off`, or `closed`
- `post_id` — the post the lead was linked to, or `null`

### Errors

| Code | Meaning |
|---|---|
| `401` | Missing, wrong or replaced key |
| `422` | Bad data — e.g. `brand_id` isn't one of this workspace's brands, or it's missing and there are several brands. The `detail` field says which. |

## 3. Which post did the customer come from?

Every ContentFlow post has a code like **`P123`** (shown on the post's page —
"Post code"). Put the code in the post's chat link, and send it back as `ref`:

| Channel | Link in the post | Where the bot finds the code |
|---|---|---|
| Telegram | `https://t.me/<YourBot>?start=P123` | The first message is `/start P123` |
| Messenger | `https://m.me/<YourPage>?ref=P123` | The `ref` in Meta's referral / postback event |
| Instagram | `https://ig.me/m/<YourAccount>?ref=P123` | The `ref` in Meta's referral event, if your Instagram setup receives one — otherwise send no `ref` |
| Website | `https://<site>/?ref=P123` | Read `ref` from the page URL when the chat opens |

An unknown or wrong code is ignored — the lead still arrives, just without a post.

## 4. When to send

Send when the bot has learned something useful, and again when it learns more:

1. When the customer first states a need → the lead appears as **Bot qualifying**.
2. When they give a phone or email → it usually becomes **Ready for hand-off**.
3. Any later update with the same `external_id` adds to the same lead. Empty fields
   never wipe what was sent before, and a lead already with a rep keeps its rep.

How ContentFlow scores (when `score` is `null`): need +20, volume +15, timeline +15,
phone or email +20, contact name +5, buying words such as *price / how much / demo /
តម្លៃ* +20, urgent words such as *today / this week / ស្អែក* +10.
**70+ = Hot, 40–69 = Warm, under 40 = Cold.** Ready for hand-off needs 60+ and a phone
or email; under 25 is closed as not worth a rep.

## 5. Try it

```bash
curl -X POST "https://<contentflow-address>/api/intake/leads" \
  -H "Content-Type: application/json" \
  -H "X-ContentFlow-Key: cfk_xxxxxxxx" \
  -d '{"external_id":"test-1","source":"Telegram bot","name":"Test shop","need":"Testing the connection","phone":"012 000 000"}'
```

The lead shows up in **Leads & hand-off** within a minute, and Setup shows
**Connected** with the time of the last lead. Delete the test lead there afterwards.
