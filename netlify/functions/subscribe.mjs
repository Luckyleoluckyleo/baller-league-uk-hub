// Netlify Function: newsletter signup → MailerLite.
// Required env var (Netlify → Site configuration → Environment variables):
//   MAILERLITE_API_KEY  (secret — the only secret; keep it in Netlify only)
const MAILERLITE_API = "https://connect.mailerlite.com/api/subscribers";

// MailerLite "Newsletter" group ID. Group IDs are not secret, so it lives here.
// Update this constant if you ever switch to a different group.
const MAILERLITE_GROUP_ID = "205204446769054925";

function redirect(location) {
  return { statusCode: 303, headers: { Location: location }, body: "" };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { Allow: "POST" }, body: "Method Not Allowed" };
  }

  let params;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";
    params = new URLSearchParams(raw);
  } catch {
    return redirect("/newsletter/?error=1");
  }

  const email = (params.get("email") || "").trim().toLowerCase();
  const consent = params.get("consent") === "yes";
  const honeypot = params.get("company");

  // Bots fill the hidden "company" field: pretend success, do nothing.
  if (honeypot) return redirect("/newsletter/thanks/");

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!validEmail || !consent) return redirect("/newsletter/?error=1");

  const key = process.env.MAILERLITE_API_KEY;
  if (!key) {
    console.error("Newsletter: missing MAILERLITE_API_KEY");
    return redirect("/newsletter/?error=server");
  }

  try {
    const res = await fetch(MAILERLITE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
      },
      // status "unconfirmed" triggers MailerLite's double opt-in confirmation email.
      body: JSON.stringify({ email, groups: [MAILERLITE_GROUP_ID], status: "unconfirmed" }),
    });

    // Create is an upsert (existing emails return 200), so any non-2xx is a real
    // error (e.g. an invalid group ID). Surface it instead of faking success.
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Newsletter: MailerLite error", res.status, detail.slice(0, 300));
      return redirect("/newsletter/?error=server");
    }
  } catch (err) {
    console.error("Newsletter: MailerLite request failed");
    return redirect("/newsletter/?error=server");
  }

  return redirect("/newsletter/thanks/");
}
