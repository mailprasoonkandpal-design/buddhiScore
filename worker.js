// Buddhi Score server code for Cloudflare Workers.
// Handles the payment calls and the Whimsi chat, and serves every other request from the site's files.
// Needs two secrets set in the Cloudflare dashboard: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.
// Whimsi also needs the secret ANTHROPIC_API_KEY and the WHIMSI KV namespace (see wrangler.jsonc).
// Optional: PRICE_PAISE (defaults to 4900, which is ₹49).

import { whimsiReply } from "./whimsi.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const auth = (env) => "Basic " + btoa(env.RAZORPAY_KEY_ID + ":" + env.RAZORPAY_KEY_SECRET);

async function hmacHex(secret, text) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameString(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function createOrder(env) {
  const amount = parseInt(env.PRICE_PAISE || "4900", 10);
  const r = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: auth(env), "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency: "INR", receipt: "bs_" + Date.now().toString(36), notes: { product: "full_report" } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) return json({ ok: false, error: "Could not start the payment. Please try again." }, 502);
  return json({ ok: true, order_id: j.id, amount: j.amount, key_id: env.RAZORPAY_KEY_ID });
}

// Returns null when the order is paid, or [error message, HTTP status] when it is not.
async function unpaid(b, env) {
  const orderId = b.razorpay_order_id, payId = b.razorpay_payment_id, sig = b.razorpay_signature;
  if (!/^order_[A-Za-z0-9]{6,40}$/.test(orderId || "")) return ["Invalid order.", 400];

  // Normal path: Razorpay's signature proves this payment belongs to this order.
  if (payId && sig) {
    if (!/^pay_[A-Za-z0-9]{6,40}$/.test(payId)) return ["Invalid payment.", 400];
    const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, orderId + "|" + payId);
    return sameString(expected, String(sig)) ? null : ["Payment could not be verified.", 400];
  }

  // Recovery path: the page was closed or reloaded mid-payment, so ask Razorpay whether the order was paid.
  const r = await fetch("https://api.razorpay.com/v1/orders/" + orderId, { headers: { Authorization: auth(env) } });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.status === "paid" && j.amount_paid >= j.amount ? null : ["This order has not been paid.", 402];
}

async function verify(request, env) {
  const bad = await unpaid(await request.json().catch(() => ({})), env);
  return bad ? json({ ok: false, error: bad[0] }, bad[1]) : json({ ok: true });
}

async function whimsi(request, env, ctx) {
  if (!env.ANTHROPIC_API_KEY || !env.WHIMSI) return json({ ok: false, error: "Whimsi is not set up yet." }, 500);
  const b = await request.json().catch(() => ({}));
  if (!b.pay || (await unpaid(b.pay, env))) return json({ ok: false, error: "Whimsi comes with the full report. Unlock it to chat." }, 402);
  return whimsiReply(b, env, ctx);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
      if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return json({ ok: false, error: "Payments are not set up yet." }, 500);
      try {
        if (url.pathname === "/api/create-order") return await createOrder(env);
        if (url.pathname === "/api/verify") return await verify(request, env);
        if (url.pathname === "/api/whimsi") return await whimsi(request, env, ctx);
      } catch (e) {
        return json({ ok: false, error: "Something went wrong. Please try again." }, 500);
      }
      return json({ ok: false, error: "Not found." }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
