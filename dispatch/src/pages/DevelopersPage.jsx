import { useState } from 'react'
import CodeBlock, { CopyButton as CopyBtn } from '../components/ui/CodeBlock'
import { FiArrowRight, FiBookOpen, FiCheck, FiCode, FiCopy, FiCpu, FiFilm, FiImage, FiKey, FiLayers, FiLock, FiSearch, FiShield, FiZap } from 'react-icons/fi'

// /developers — the public docs for the API and the MCP connector (app/mcp_server.py,
// keys: app/api_keys.py, Settings → API & MCP). Shown inside the landing page's
// header and footer (LandingPage page="developers"), like /mkt-tutorial. Every
// example calls the same endpoint: JSON-RPC 2.0 over HTTPS, POST /api/mcp.

const BASE = `${typeof window !== 'undefined' ? window.location.origin : 'https://mkt.chlart.org'}/api/mcp`

// ── the examples: storyboard → (show the estimate) → video → wait → link ──

const CURL = `# 1 · what the connector can do
curl ${BASE} \\
  -H "Authorization: Bearer $SMART_MARKETING_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# 2 · start a video from an idea (Khmer, Picture story, vertical)
curl ${BASE} \\
  -H "Authorization: Bearer $SMART_MARKETING_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
        "name":"make_video",
        "arguments":{"idea":"Our new iced coffee — try it this week","template":"picture","language":"Khmer","shape":"9:16"}}}'

# 3 · ask every ~20 s until "status" is "succeeded" — then "url" is the MP4
curl ${BASE} \\
  -H "Authorization: Bearer $SMART_MARKETING_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"check_job","arguments":{"job_id":1234}}}'`

const PYTHON = `# pip install requests
import os, time, requests

MCP = "${BASE}"
HEADERS = {"Authorization": f"Bearer {os.environ['SMART_MARKETING_KEY']}"}

def call(tool, **arguments):
    """Call one Smart Marketing tool; returns its result as a dict."""
    r = requests.post(MCP, headers=HEADERS, timeout=120, json={
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": tool, "arguments": arguments},
    })
    r.raise_for_status()
    result = r.json()["result"]
    if result["isError"]:
        raise RuntimeError(result["content"][0]["text"])  # a friendly reason
    return result["structuredContent"]

# 1 · the storyboard: scenes to check (and edit) before anything is made
board = call("make_storyboard", story="ហាងកាហ្វេរបស់យើងមានកាហ្វេទឹកកកថ្មី",
             language="Khmer", template="picture", shape="9:16")
while board["status"] == "writing":
    time.sleep(15)
    board = call("get_storyboard", storyboard_id=board["storyboard_id"])
print("About", board["estimate"]["credits"], "credits")

# 2 · make it, exactly as the storyboard says
job = call("make_video", storyboard=board["storyboard"])

# 3 · wait for it (2-6 minutes)
while (status := call("check_job", job_id=job["job_id"]))["status"] in ("queued", "running"):
    time.sleep(20)
print(status.get("url"), status.get("caption"))`

const NEXT = `// app/api/promo-video/route.ts — Next.js (App Router). The key stays on the server.
const MCP = "${BASE}";

async function call(tool: string, args: Record<string, unknown>) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.SMART_MARKETING_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
  });
  const { result } = await res.json();
  if (result.isError) throw new Error(result.content[0].text);
  return result.structuredContent;
}

// POST { idea } → starts the video; the page then polls GET ?job=<id>
export async function POST(req: Request) {
  const { idea } = await req.json();
  const job = await call("make_video", { idea, template: "auto", language: "Khmer", shape: "9:16" });
  return Response.json(job); // { job_id, status }
}

export async function GET(req: Request) {
  const job = Number(new URL(req.url).searchParams.get("job"));
  return Response.json(await call("check_job", { job_id: job })); // status, url, caption
}`

const NODE = `// Node.js 18+ — no packages needed
const MCP = "${BASE}";
const KEY = process.env.SMART_MARKETING_KEY;

async function call(tool, args = {}) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: { Authorization: \`Bearer \${KEY}\`, "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
  });
  const { result } = await res.json();
  if (result.isError) throw new Error(result.content[0].text);
  return result.structuredContent;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { job_id } = await call("make_image", { prompt: 'Poster: new iced coffee, "កាហ្វេទឹកកក $2.5"', shape: "4:5", logo: true });
let job;
do { await sleep(10_000); job = await call("check_job", { job_id }); } while (["queued", "running"].includes(job.status));
console.log(job.url);`

const JAVA = `// Java 11+ (java.net.http) with Jackson for JSON
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.*;

public class SmartMarketing {
  static final String MCP = "${BASE}";
  static final HttpClient http = HttpClient.newHttpClient();
  static final ObjectMapper json = new ObjectMapper();

  static JsonNode call(String tool, ObjectNode args) throws Exception {
    ObjectNode body = json.createObjectNode().put("jsonrpc", "2.0").put("id", 1).put("method", "tools/call");
    body.putObject("params").put("name", tool).set("arguments", args);
    HttpRequest req = HttpRequest.newBuilder(URI.create(MCP))
        .header("Authorization", "Bearer " + System.getenv("SMART_MARKETING_KEY"))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
        .build();
    JsonNode result = json.readTree(http.send(req, HttpResponse.BodyHandlers.ofString()).body()).get("result");
    if (result.get("isError").asBoolean()) throw new RuntimeException(result.at("/content/0/text").asText());
    return result.get("structuredContent");
  }

  public static void main(String[] a) throws Exception {
    ObjectNode args = json.createObjectNode()
        .put("idea", "Our new iced coffee — try it this week").put("template", "picture").put("language", "Khmer");
    long jobId = call("make_video", args).get("job_id").asLong();
    JsonNode job;
    do {
      Thread.sleep(20_000);
      job = call("check_job", json.createObjectNode().put("job_id", jobId));
    } while (job.get("status").asText().matches("queued|running"));
    System.out.println(job.path("url").asText());
  }
}`

const PHP = `<?php
// PHP 7.4+ with curl
function smart_marketing(string $tool, array $args = []): array {
    $ch = curl_init("${BASE}");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_HTTPHEADER => ["Authorization: Bearer " . getenv("SMART_MARKETING_KEY"), "Content-Type: application/json"],
        CURLOPT_POSTFIELDS => json_encode(["jsonrpc" => "2.0", "id" => 1, "method" => "tools/call",
                                           "params" => ["name" => $tool, "arguments" => (object) $args]]),
    ]);
    $result = json_decode(curl_exec($ch), true)["result"];
    if ($result["isError"]) throw new Exception($result["content"][0]["text"]);
    return $result["structuredContent"];
}

$job = smart_marketing("make_video", ["idea" => "Our new iced coffee", "template" => "auto", "language" => "Khmer"]);
do { sleep(20); $status = smart_marketing("check_job", ["job_id" => $job["job_id"]]); }
while (in_array($status["status"], ["queued", "running"]));
echo $status["url"];`

const LANGS = [
  ['python', 'Python', PYTHON],
  ['next', 'Next.js', NEXT],
  ['node', 'Node.js', NODE],
  ['java', 'Java', JAVA],
  ['php', 'PHP', PHP],
  ['curl', 'cURL', CURL],
]

const ASSISTANTS = [
  ['Claude', ['Settings → Connectors → Add custom connector. Paste the link with your key.', 'Settings → Connectors → Add custom connector។ បិទភ្ជាប់តំណដែលមាន Key របស់បង។'], `${BASE}/YOUR_API_KEY`],
  ['ChatGPT', ['Settings → Apps & Connectors → Advanced → Developer mode → Create. Paste the same link.', 'Settings → Apps & Connectors → Advanced → Developer mode → Create។ បិទភ្ជាប់តំណដដែល។'], `${BASE}/YOUR_API_KEY`],
  ['Claude Code', ['In a terminal:', 'ក្នុង Terminal៖'], `claude mcp add --transport http smart-marketing ${BASE} --header "Authorization: Bearer YOUR_API_KEY"`],
  ['Cursor · others', ['Add an MCP server (Streamable HTTP) with this URL and header:', 'បន្ថែម MCP server (Streamable HTTP) ជាមួយ URL និង Header នេះ៖'], `{ "mcpServers": { "smart-marketing": { "url": "${BASE}", "headers": { "Authorization": "Bearer YOUR_API_KEY" } } } }`],
]

const TOOLS = [
  ['list_brands', '—', 'brands: id, name, language'],
  ['list_templates', '—', 'every video template, what it is good for, its shapes'],
  ['my_credits', '—', 'credits_left, plan, refills_at'],
  ['make_storyboard', 'story*, template, language, voice, length, shape, brand_id', 'storyboard (scenes), estimate (credits), storyboard_id — waits up to ~45 s'],
  ['get_storyboard', 'storyboard_id*', 'the same, once it is written'],
  ['make_video', 'storyboard or idea*, template, language, voice, shape, music, brand_id', 'job_id'],
  ['make_image', 'prompt*, shape, logo, brand_id', 'job_id'],
  ['check_job', 'job_id*', 'status, stage, percent — then url (MP4 / image), caption, credits_used'],
]

// Everything on this page as one Markdown file — "Copy skill": hand it to an AI agent
// (Claude, Cursor…) building on the API, and it has the whole reference.
function skillText() {
  return `# Smart Marketing API — skill

Make Khmer / English marketing videos and posters for a business, from code or an AI assistant.
Endpoint: POST ${BASE} — JSON-RPC 2.0 over HTTPS (MCP Streamable HTTP; answered as JSON).
Auth: header "Authorization: Bearer <key>" (keys start with sm_), or the key in the link: ${BASE}/<key>.
Keys: made on the API & MCP page in the app. A key acts as its maker and spends the workspace's credits.

## Calling a tool
POST {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}
The answer: result.structuredContent (the data), result.isError (true = result.content[0].text is a reason to show the person).
Also: "initialize", "tools/list", "ping".

## Tools (* = required)
${TOOLS.map(([n, a, r]) => `- ${n}(${a === '—' ? '' : a}) → ${r}`).join('\n')}

## The usual flow
1. list_templates (or template "auto").
2. make_storyboard(story, language, template, shape) → if status is "writing", get_storyboard(storyboard_id) every ~15 s.
3. Show the person the scenes and estimate.credits. Edit scene "say" (spoken) or on-screen text if they ask.
4. make_video(storyboard) → job_id. (Or make_video(idea) to skip the storyboard.)
5. check_job(job_id) every ~20 s until status is "succeeded" (url = the MP4, caption) or "failed" (error). Videos take 2-6 minutes.
Pictures: make_image(prompt, shape, logo) → check_job. Khmer words on a picture are drawn correctly.

## Limits & errors
- 60 calls a minute per key (HTTP 429). Videos are made one at a time per workspace.
- HTTP 401 = a wrong or revoked key.
- Out of credits, busy, a missing field → isError: true with a friendly reason.
- my_credits → credits_left, plan, refills_at.

## Python example
\`\`\`python
${PYTHON}
\`\`\`
`
}

const SECTIONS = [
  ['Getting started', [['intro', 'Introduction', FiBookOpen], ['quick', 'Quick start', FiZap], ['auth', 'Authentication', FiLock]]],
  ['Connect', [['mcp', 'AI assistants (MCP)', FiCpu]]],
  ['Reference', [['tools', 'Tools', FiLayers], ['flow', 'Storyboard → video', FiFilm], ['limits', 'Errors & limits', FiShield], ['credits', 'Credits', FiKey]]],
  ['Examples', [['code', 'Python · Next.js · Java · PHP · cURL', FiCode]]],
]

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-ink-200/70 pt-10 first:border-t-0 first:pt-0">
      <h2 className="text-[22px] font-bold text-ink-900">{title}</h2>
      <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-ink-600">{children}</div>
    </section>
  )
}

export default function Developers({ t, me, onStart }) {
  const [lang, setLang] = useState('python')
  const [assistant, setAssistant] = useState('Claude')
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState(false)
  const code = LANGS.find(([id]) => id === lang)
  const a = ASSISTANTS.find(([name]) => name === assistant)
  const getKey = () => (me ? window.location.assign('/developer') : onStart())
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const copySkill = () =>
    navigator.clipboard?.writeText(skillText()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  const saveSkill = () => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([skillText()], { type: 'text/markdown;charset=utf-8' }))
    link.download = 'smart-marketing.SKILL.md'
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 2000)
  }
  const match = (label) => !q.trim() || label.toLowerCase().includes(q.trim().toLowerCase())
  const keyBtn = (
    <button type="button" onClick={getKey} className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-white shadow-glow-lg transition-transform hover:-translate-y-px">
      <FiKey size={15} /> {me ? t('Get your API key', 'យក API Key') : t('Start free — get a key', 'ចាប់ផ្ដើមឥតគិតថ្លៃ — យក Key')}
    </button>
  )

  return (
    <div className="pt-24 sm:pt-28">
      {/* ── the title band ── */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-[12.5px] text-ink-500">
          <a href="/" className="hover:text-brand">{t('Home', 'ទំព័រដើម')}</a> <span className="mx-1.5 text-ink-300">›</span> <span className="font-semibold text-ink-800">{t('Documentation', 'ឯកសារ')}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <h1 className="text-[36px] font-bold leading-tight tracking-tight text-ink-900 sm:text-[46px]">{t('Smart Marketing API', 'Smart Marketing API')}</h1>
            <p className="mt-3 text-[15.5px] leading-relaxed text-ink-600">
              {t('Make Khmer marketing videos and posters from your code or your AI assistant — our templates, Khmer subtitles and voice, and Khmer drawn correctly on pictures.', 'បង្កើតវីដេអូ និងប៉ូស្ទ័រទីផ្សារជាភាសាខ្មែរ ពីកូដ ឬ AI របស់បង — គំរូរបស់យើង អក្សររត់ និងសំឡេងខ្មែរ និងអក្សរខ្មែរត្រឹមត្រូវលើរូបភាព។')}
            </p>
          </div>
          <label className="flex w-full items-center gap-2 rounded-2xl border border-ink-200 bg-white px-3.5 py-2.5 sm:w-72">
            <FiSearch size={15} className="text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search documentation…', 'ស្វែងរកឯកសារ…')} className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink-900 outline-none placeholder:text-ink-400" />
          </label>
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-6xl gap-8 px-4 pb-24 sm:px-6 lg:grid-cols-[230px_1fr]">
        {/* ── the sidebar ── */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav className="space-y-5">
            {SECTIONS.map(([group, items]) => {
              const shown = items.filter(([, label]) => match(label) || match(group))
              if (!shown.length) return null
              return (
                <div key={group}>
                  <div className="px-3 text-[12px] font-semibold text-ink-400">{group}</div>
                  <div className="mt-1.5 space-y-0.5 rounded-2xl bg-ink-50 p-1.5">
                    {shown.map(([id, label, Icon]) => (
                      <button key={id} type="button" onClick={() => go(id)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] font-medium text-ink-700 transition-colors hover:bg-white hover:text-ink-900">
                        <Icon size={14} className="flex-none text-ink-400" /> {label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            {SECTIONS.every(([g, items]) => !items.some(([, l]) => match(l) || match(g))) && <p className="px-3 text-[12.5px] text-ink-400">{t('Nothing matches.', 'រកមិនឃើញ។')}</p>}
          </nav>
        </aside>

        <main className="min-w-0 space-y-10">
          {/* ── introduction ── */}
          <Section id="intro" title={t('Introduction', 'សេចក្ដីផ្ដើម')}>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['quick', FiZap, t('Quick start', 'ចាប់ផ្ដើមរហ័ស'), t('Your first video from code in minutes', 'វីដេអូដំបូងពីកូដ ក្នុងរយៈពេលប៉ុន្មាននាទី')],
                ['auth', FiLock, t('Authentication', 'ការផ្ទៀងផ្ទាត់'), t('API keys and how to keep them safe', 'API Key និងរបៀបរក្សាវាឱ្យមានសុវត្ថិភាព')],
                ['tools', FiLayers, t('Tools reference', 'ឯកសារ Tools'), t('Every tool, its arguments and answer', 'Tool នីមួយៗ arguments និងចម្លើយ')],
                ['code', FiCode, t('Examples', 'ឧទាហរណ៍'), t('Python, Next.js, Node, Java, PHP, cURL', 'Python, Next.js, Node, Java, PHP, cURL')],
              ].map(([id, Icon, head, body]) => (
                <button key={id} type="button" onClick={() => go(id)} className="rounded-2xl border border-ink-200 bg-white p-5 text-left shadow-card transition-transform hover:-translate-y-0.5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-ink-100 text-ink-700">
                    <Icon size={16} />
                  </span>
                  <div className="mt-3 text-[16px] font-bold text-ink-900">{head}</div>
                  <div className="mt-1 text-[13px] text-ink-500">{body}</div>
                </button>
              ))}
            </div>
            {/* the whole docs for an AI agent, in one file */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-brand-soft text-brand">
                <FiCpu size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-ink-900">{t('Building with an AI agent?', 'កំពុងបង្កើតជាមួយ AI Agent?')}</div>
                <div className="text-[12.5px] text-ink-500">{t('Hand it smart-marketing.SKILL.md — these whole docs in one file.', 'ឱ្យវា smart-marketing.SKILL.md — ឯកសារទាំងមូលក្នុងឯកសារតែមួយ។')}</div>
              </div>
              <button type="button" onClick={copySkill} className="inline-flex items-center gap-1.5 rounded-xl bg-ink-900 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:opacity-90">
                {copied ? <FiCheck size={13} /> : <FiCopy size={13} />} {copied ? t('Copied', 'បានចម្លង') : t('Copy skill', 'ចម្លង Skill')}
              </button>
              <button type="button" onClick={saveSkill} className="rounded-xl border border-ink-200 px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50">
                {t('Download', 'ទាញយក')}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                [FiFilm, t('Template videos', 'វីដេអូតាមគំរូ'), t('47 templates — Picture story, Presenter, Slides, Podcast…', 'គំរូ ៤៧ — Picture story, Presenter, Slides, Podcast…')],
                [FiImage, t('Khmer posters', 'ប៉ូស្ទ័រខ្មែរ'), t('Khmer words drawn correctly on every picture', 'អក្សរខ្មែរត្រឹមត្រូវលើរូបភាពគ្រប់សន្លឹក')],
                [FiLayers, t('Storyboard first', 'Storyboard មុន'), t('See and edit the scenes — and the credits — before it’s made', 'មើល និងកែឈុត — និងក្រេឌីត — មុនពេលធ្វើ')],
                [FiCpu, t('MCP connector', 'MCP Connector'), t('Claude, ChatGPT and Cursor call it directly', 'Claude, ChatGPT និង Cursor ហៅវាផ្ទាល់')],
              ].map(([Icon, head, body]) => (
                <div key={head} className="flex gap-3 rounded-2xl bg-ink-50 p-4">
                  <Icon size={17} className="mt-0.5 flex-none text-brand" />
                  <div>
                    <div className="text-[14px] font-bold text-ink-900">{head}</div>
                    <div className="mt-0.5 text-[12.5px] text-ink-500">{body}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── quick start ── */}
          <Section id="quick" title={t('Quick start', 'ចាប់ផ្ដើមរហ័ស')}>
            <ol className="space-y-2.5">
              {[
                t('Sign in and open API & MCP in the sidebar. Create a key — it’s shown once.', 'ចូលគណនី ហើយបើក API & MCP នៅរបារចំហៀង។ បង្កើត Key — វាបង្ហាញតែម្តង។'),
                t('Put it on your server as SMART_MARKETING_KEY (never in a web page).', 'ដាក់វានៅលើ Server ជា SMART_MARKETING_KEY (កុំដាក់ក្នុងគេហទំព័រ)។'),
                t('Call make_video, then check_job until it’s done — the MP4 link comes back, and the video is in your Library too.', 'ហៅ make_video បន្ទាប់មក check_job រហូតដល់រួច — តំណ MP4 ត្រឡប់មកវិញ ហើយវីដេអូក៏នៅក្នុង Library ដែរ។'),
              ].map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-brand text-[11.5px] font-bold text-white">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink-200 bg-white px-4 py-3">
              <span className="text-[12.5px] font-semibold text-ink-500">Endpoint</span>
              <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-ink-900">POST {BASE}</code>
              <CopyBtn text={BASE} />
            </div>
            <CodeBlock code={CURL} label="cURL" />
            <div className="pt-1">{keyBtn}</div>
          </Section>

          {/* ── authentication ── */}
          <Section id="auth" title={t('Authentication', 'ការផ្ទៀងផ្ទាត់')}>
            <p>{t('Send your key as a Bearer token. Keys start with sm_. A key acts as the person who made it, in their workspace, and spends its credits.', 'ផ្ញើ Key ជា Bearer token។ Key ចាប់ផ្ដើមដោយ sm_។ Key ធ្វើការជាអ្នកបង្កើតវា ក្នុង Workspace របស់គេ ហើយប្រើក្រេឌីតរបស់វា។')}</p>
            <CodeBlock code={'Authorization: Bearer sm_YOUR_KEY'} label="Header" />
            <p>{t('Apps that only take a URL (Claude, ChatGPT connectors) can put the key in the link instead. That link is a password — don’t share it.', 'កម្មវិធីដែលទទួលតែ URL (Claude, ChatGPT) អាចដាក់ Key ក្នុងតំណ។ តំណនោះគឺដូចពាក្យសម្ងាត់ — កុំចែករំលែក។')}</p>
            <CodeBlock code={`${BASE}/sm_YOUR_KEY`} label="Key in the link" />
            <p>{t('Rotate a key (a new secret, same name) or revoke it any time on the API & MCP page — the old secret stops at once.', 'Rotate Key (secret ថ្មី ឈ្មោះដដែល) ឬលុបវាបានគ្រប់ពេលនៅទំព័រ API & MCP — secret ចាស់ឈប់ដំណើរការភ្លាម។')}</p>
          </Section>

          {/* ── MCP ── */}
          <Section id="mcp" title={t('AI assistants (MCP)', 'AI Assistants (MCP)')}>
            <p>{t('Smart Marketing is an MCP server, so Claude, ChatGPT, Cursor and other AI apps can use it as a tool. Then just ask: “Make a 1-minute Khmer Picture story video about our new iced coffee.” It writes the storyboard, tells you the credits, makes the video and gives you the link.', 'Smart Marketing គឺជា MCP server ដូច្នេះ Claude, ChatGPT, Cursor អាចប្រើវាជា Tool។ បន្ទាប់មកគ្រាន់តែសួរ៖ «ធ្វើវីដេអូ Picture story ១ នាទី ជាភាសាខ្មែរ អំពីកាហ្វេទឹកកកថ្មីរបស់យើង»។')}</p>
            <div className="flex flex-wrap gap-1 rounded-xl bg-ink-100 p-1 sm:inline-flex">
              {ASSISTANTS.map(([name]) => (
                <button key={name} type="button" onClick={() => setAssistant(name)} className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${assistant === name ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}>
                  {name}
                </button>
              ))}
            </div>
            <p className="text-ink-700">{t(a[1][0], a[1][1])}</p>
            <CodeBlock code={a[2]} label={assistant} />
            <p className="text-[12.5px] text-ink-500">{t('Replace YOUR_API_KEY with your key.', 'ប្ដូរ YOUR_API_KEY ជា Key របស់បង។')}</p>
          </Section>

          {/* ── tools ── */}
          <Section id="tools" title={t('Tools', 'Tools')}>
            <p>{t('Call them with tools/call. * = required. A brand_id left out means the workspace’s first brand.', 'ហៅវាដោយ tools/call។ * = ចាំបាច់។ បើគ្មាន brand_id ប្រើម៉ាកដំបូងរបស់ Workspace។')}</p>
            <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="border-b border-ink-200 bg-ink-50 text-[11.5px] uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Tool</th>
                    <th className="px-4 py-2.5 font-semibold">Arguments</th>
                    <th className="px-4 py-2.5 font-semibold">{t('Returns', 'ផ្ដល់មកវិញ')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {TOOLS.map(([name, args, ret]) => (
                    <tr key={name}>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12.5px] font-semibold text-ink-900">{name}</td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-ink-600">{args}</td>
                      <td className="px-4 py-2.5 text-ink-600">{ret}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── the flow ── */}
          <Section id="flow" title={t('Storyboard → video', 'Storyboard → វីដេអូ')}>
            <ol className="space-y-2">
              {[
                ['list_templates', t('pick a template, or use “auto” and the AI picks', 'ជ្រើសគំរូ ឬប្រើ “auto” ឱ្យ AI ជ្រើស')],
                ['make_storyboard', t('the scenes and the credit estimate (if status is “writing”, call get_storyboard every ~15 s)', 'ឈុត និងការប៉ាន់ស្មានក្រេឌីត (បើ status “writing” ហៅ get_storyboard រៀងរាល់ ~15 វិនាទី)')],
                ['', t('show the person the scenes and credits; edit any line they want', 'បង្ហាញឈុត និងក្រេឌីត កែបន្ទាត់ណាដែលគេចង់')],
                ['make_video', t('with that storyboard — made exactly as it is', 'ជាមួយ Storyboard នោះ — ធ្វើតាមវាទាំងស្រុង')],
                ['check_job', t('every ~20 s until “succeeded” (the MP4 url and caption) — videos take 2-6 minutes', 'រៀងរាល់ ~20 វិនាទី រហូតដល់ “succeeded” — វីដេអូចំណាយ ២-៦ នាទី')],
              ].map(([tool, what], i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-ink-100 text-[11.5px] font-bold text-ink-700">{i + 1}</span>
                  <span>
                    {tool && <code className="mr-1.5 rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[12.5px] text-ink-900">{tool}</code>}
                    {what}
                  </span>
                </li>
              ))}
            </ol>
          </Section>

          {/* ── limits ── */}
          <Section id="limits" title={t('Errors & limits', 'កំហុស និងដែនកំណត់')}>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>{t('60 calls a minute per key — more answers HTTP 429. Videos are made one at a time per workspace.', '៦០ ដងក្នុងមួយនាទី សម្រាប់ Key នីមួយៗ — លើសនេះឆ្លើយ HTTP 429។ វីដេអូធ្វើម្តងមួយៗ ក្នុង Workspace នីមួយៗ។')}</li>
              <li>{t('HTTP 401 — a wrong, rotated or revoked key.', 'HTTP 401 — Key ខុស ត្រូវ Rotate ឬត្រូវលុប។')}</li>
              <li>{t('A tool that can’t run answers isError: true with a reason to show the person — out of credits, busy, a missing field.', 'Tool ដែលមិនអាចដំណើរការ ឆ្លើយ isError: true ជាមួយហេតុផល — អស់ក្រេឌីត រវល់ ឬខ្វះទិន្នន័យ។')}</li>
              <li>{t('Every call is in Request Logs on the API & MCP page (the tool, OK or error, how long — never your text).', 'ការហៅទាំងអស់នៅក្នុង Request Logs (Tool, OK ឬ Error, រយៈពេល — មិនដែលរក្សាអត្ថបទរបស់បងទេ)។')}</li>
            </ul>
          </Section>

          {/* ── credits ── */}
          <Section id="credits" title={t('Credits', 'ក្រេឌីត')}>
            <p>{t('The API uses your workspace’s credits, the same as the app: a video’s voice and its AI pictures. make_storyboard gives the estimate before anything is made; check_job says what it used; my_credits shows what’s left.', 'API ប្រើក្រេឌីត Workspace ដូចក្នុងកម្មវិធី៖ សំឡេង និងរូបភាព AI។ make_storyboard ផ្ដល់ការប៉ាន់ស្មានមុន check_job ប្រាប់ចំនួនដែលបានប្រើ my_credits បង្ហាញអ្វីដែលនៅសល់។')}</p>
            <a href="/upgrade" className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline">
              {t('Plans & credits', 'គម្រោង និងក្រេឌីត')} <FiArrowRight size={14} />
            </a>
          </Section>

          {/* ── code ── */}
          <Section id="code" title={t('Examples', 'ឧទាហរណ៍')}>
            <p>{t('Plain HTTPS and JSON — no SDK needed. Put your key in SMART_MARKETING_KEY on your server.', 'គ្រាន់តែ HTTPS និង JSON — មិនចាំបាច់ SDK។ ដាក់ Key ក្នុង SMART_MARKETING_KEY លើ Server។')}</p>
            <div className="flex flex-wrap gap-1 rounded-xl bg-ink-100 p-1 sm:inline-flex">
              {LANGS.map(([id, label]) => (
                <button key={id} type="button" onClick={() => setLang(id)} className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${lang === id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}>
                  {label}
                </button>
              ))}
            </div>
            <CodeBlock code={code[2]} label={code[1]} />
          </Section>

          <div className="flex flex-col items-center gap-3 rounded-3xl bg-brand-soft px-6 py-10 text-center">
            <h3 className="text-[22px] font-bold text-ink-900">{t('Make your first video from code today', 'ធ្វើវីដេអូដំបូងពីកូដថ្ងៃនេះ')}</h3>
            {keyBtn}
          </div>
        </main>
      </div>
    </div>
  )
}
