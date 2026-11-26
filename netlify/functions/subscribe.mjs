// Netlify Function: newsletter signup → MailerLite.
// Env vars required (Netlify → Site configuration → Environment variables):
//   MAILERLITE_API_KEY   (secret)
//   MAILERLITE_GROUP_ID  (numeric group id)
const MAILERLITE_API = "https://connect.mailerlite.com/api/subscribers";

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
  const groupId = process.env.MAILERLITE_GROUP_ID;
  if (!key || !groupId) {
    console.error("Newsletter: missing MAILERLITE_API_KEY or MAILERLITE_GROUP_ID");
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
      body: JSON.stringify({ email, groups: [String(groupId)], status: "unconfirmed" }),
    });

    // 422 usually means "already subscribed" — treat as success so the user isn't confused.
    if (!res.ok && res.status !== 422) {
      console.error("Newsletter: MailerLite responded", res.status);
      return redirect("/newsletter/?error=server");
    }
  } catch (err) {
    console.error("Newsletter: MailerLite request failed");
    return redirect("/newsletter/?error=server");
  }

  return redirect("/newsletter/thanks/");
}
