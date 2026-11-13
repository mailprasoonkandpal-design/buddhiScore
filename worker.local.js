// LOCAL TESTING ONLY. Never deploy this file.
// Wraps worker.js and fakes Razorpay, so the full report can be unlocked without real keys.
// Run: npx wrangler dev -c wrangler.local.jsonc
// Tapping Unlock shows a "pretend to pay" box instead of Razorpay checkout. OK pays; Cancel closes without paying.
// Whimsi talks to the real Claude when .dev.vars has a real ANTHROPIC_API_KEY, otherwise it sends canned test replies.

import Anthropic from "@anthropic-ai/sdk";
import site from "./worker.js";
import { whimsiReply } from "./whimsi.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const rand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

// Order id -> { code, paid }. Kept in memory while the local server runs.
const orders = new Map();

// Stands in for Razorpay's checkout.js. The page skips loading the real one when window.Razorpay already exists.
const FAKE_CHECKOUT = `<script>window.Razorpay=function(o){this.open=function(){
  if(confirm("LOCAL TEST CHECKOUT\\n\\nPretend to pay \\u20B9"+o.amount/100+"?\\nOK = payment succeeds. Cancel = close without paying."))
    o.handler({razorpay_order_id:o.order_id,razorpay_payment_id:"pay_local"+Date.now().toString(36),razorpay_signature:"local"});
  else if(o.modal&&o.modal.ondismiss)o.modal.ondismiss();
}}</script>`;
const BANNER = `<div style="position:fixed;left:8px;bottom:8px;z-index:99999;pointer-events:none;background:#C2412D;color:#fff;font:700 12px system-ui,sans-serif;padding:6px 10px;border-radius:8px">LOCAL TEST MODE · payments are fake</div>`;

// Stands in for the Claude Messages API: streams a canned reply as the same server-sent events the real API sends.
function fakeClaude(url, init) {
  const req = JSON.parse(init.body);
  const last = req.messages[req.messages.length - 1].content;
  const reply = /puzzle|practice|paheli|पहेली/i.test(last)
    ? "Here's a Memory warm-up. Look at these numbers for five seconds, then cover them:\n7  2  9  4\nWhich number came third?\nA) 2\nB) 9\nC) 4\nD) 7"
    : `This is a local test reply, so Claude was not called. Put a real ANTHROPIC_API_KEY in .dev.vars and restart to chat with the real Whimsi.\n\nYou asked: "${last.slice(0, 80)}"`;
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const parts = [
    ev("message_start", { message: { id: "msg_local", type: "message", role: "assistant", model: req.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } }),
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
    ...reply.match(/[\s\S]{1,12}/g).map((t) => ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: t } })),
    ev("content_block_stop", { index: 0 }),
    ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 40 } }),
    ev("message_stop", {}),
  ];
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async pull(c) {
      if (!parts.length) return c.close();
      await new Promise((r) => setTimeout(r, 25));
      c.enqueue(enc.encode(parts.shift()));
    },
  });
  return Promise.resolve(new Response(body, { headers: { "Content-Type": "text/event-stream" } }));
}

async function fakeApi(path, b, env, ctx) {
  if (path === "/api/create-order") {
    const id = "order_local" + rand(10);
    orders.set(id, { code: b.code || null, paid: false });
    return json({ ok: true, order_id: id, amount: b.code ? 2900 : parseInt(env.PRICE_PAISE || "4900", 10), key_id: "rzp_test_local" });
  }
  if (path === "/api/verify") {
    const id = String(b.razorpay_order_id || "");
    const o = orders.get(id) || { code: null, paid: false };
    if (b.razorpay_signature === "local") orders.set(id, Object.assign(o, { paid: true }));
    if (!o.paid) return json({ ok: false, error: "This order has not been paid." }, 402);
    // Same order always gets the same sample code, so reloading the report does not change it.
    return json({ ok: true, code: "BS-" + id.slice(-8, -4) + "-" + id.slice(-4), code_expires: new Date(Date.now() + 60 * 864e5).toISOString(), demo: true, redeemed: o.code || undefined });
  }
  if (path === "/api/check-code") {
    const code = String(b.code || "").trim().toUpperCase();
    if (/^BS-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json({ ok: true, code, amount: 2900 });
    return json({ ok: false, error: "That code is not valid." }, 400);
  }
  if (path === "/api/whimsi") {
    const p = b.pay || {};
    const o = orders.get(String(p.razorpay_order_id || ""));
    if (!(o && o.paid) && p.razorpay_signature !== "local") return json({ ok: false, error: "Whimsi comes with the full report. Unlock it to chat." }, 402);
    const key = env.ANTHROPIC_API_KEY || "";
    const client = key && !key.includes("REPLACE_ME") ? undefined : new Anthropic({ apiKey: "local-test", fetch: fakeClaude });
    return whimsiReply(b, env, ctx, client);
  }
  return json({ ok: false, error: "Not found." }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
      return fakeApi(url.pathname, await request.json().catch(() => ({})), env, ctx);
    }
    const res = await site.fetch(request, env, ctx);
    if (!(res.headers.get("Content-Type") || "").includes("text/html")) return res;
    return new HTMLRewriter()
      .on("head", { element: (e) => e.append(FAKE_CHECKOUT, { html: true }) })
      .on("body", { element: (e) => e.append(BANNER, { html: true }) })
      .transform(res);
  },
};
