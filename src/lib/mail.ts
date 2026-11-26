import "server-only";

/**
 * Envoi d'e-mails transactionnels (invitations, réinitialisation).
 * Fournisseur : Resend (https://resend.com) si RESEND_API_KEY et MAIL_FROM sont définis.
 * Sans configuration, aucun e-mail n'est envoyé : l'administrateur copie le lien depuis les Paramètres.
 */
export function isMailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail(to: string, subject: string, html: string): Promise<{ sent: boolean; error?: string }> {
  if (!isMailConfigured()) return { sent: false, error: "E-mail non configuré" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject, html }),
    });
    if (!res.ok) return { sent: false, error: `Resend ${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}

export function mailLayout(title: string, body: string, cta?: { label: string; url: string }) {
  return `<div style="background:#000;padding:32px;font-family:Helvetica,Arial,sans-serif;color:#F5F4F0">
  <div style="font-weight:900;letter-spacing:.02em;font-size:18px">DE L'OMBRE À LA <span style="color:#DFC662">LUMIÈRE</span></div>
  <h1 style="font-size:20px;margin:24px 0 12px">${title}</h1>
  <div style="color:#bdb8ad;line-height:1.6;font-size:15px">${body}</div>
  ${cta ? `<p style="margin:28px 0"><a href="${cta.url}" style="background:#DFC662;color:#000;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">${cta.label}</a></p>` : ""}
  <p style="color:#8F8A80;font-size:12px">Message automatique du quartier général — ne pas répondre.</p></div>`;
}

export function appUrl(path = "") {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + path;
}
