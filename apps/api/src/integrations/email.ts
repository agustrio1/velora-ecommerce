import type { Env, RuntimeFlags } from '../env';
import { logIntegration } from '../lib/log';

/**
 * Transactional email.
 *
 * Only the providers we can actually speak to are implemented. `EMAIL_PROVIDER=log`
 * (the default in development) records the message into `notification_logs` and never
 * pretends a mail left the building.
 *
 * Resend: POST https://api.resend.com/emails  · Authorization: Bearer <key>
 *         { from, to, subject, html } -> 200 { id }
 */

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | null;
}

export interface MailResult {
  ok: boolean;
  provider: string;
  skipped: boolean;
  message: string | null;
}

export async function sendEmail(env: Env, f: RuntimeFlags, mail: MailInput): Promise<MailResult> {
  const provider = f.email.provider || 'log';

  if (!f.email.configured || provider === 'log') {
    await logIntegration(env.DB, {
      provider: provider === 'resend' ? 'resend' : 'system',
      endpoint: 'email/send',
      reference: mail.to,
      success: false,
      message: 'Email tidak dikirim (EMAIL_API_KEY/EMAIL_FROM kosong) — dicatat sebagai log',
      payload: { subject: mail.subject, to: mail.to },
    });
    return { ok: false, provider, skipped: true, message: 'Provider email belum dikonfigurasi' };
  }

  if (provider !== 'resend') {
    return { ok: false, provider, skipped: true, message: `Provider email '${provider}' belum didukung` };
  }

  const started = Date.now();
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${f.email.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: f.email.from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text ?? stripHtml(mail.html),
        reply_to: mail.replyTo ?? undefined,
      }),
    });
    const text = await res.text();
    const ok = res.ok;
    await logIntegration(env.DB, {
      provider: 'resend',
      endpoint: 'POST /emails',
      reference: mail.to,
      statusCode: res.status,
      success: ok,
      message: ok ? null : text.slice(0, 300),
      payload: { subject: mail.subject },
      durationMs: Date.now() - started,
    });
    return { ok, provider, skipped: false, message: ok ? null : text.slice(0, 200) };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Email gagal dikirim';
    await logIntegration(env.DB, {
      provider: 'resend',
      endpoint: 'POST /emails',
      reference: mail.to,
      success: false,
      message,
      payload: { subject: mail.subject },
      durationMs: Date.now() - started,
    });
    return { ok: false, provider, skipped: false, message };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
}

/** Small, consistent wrapper so every order mail looks the same. */
export function mailTemplate(opts: {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  storeName: string;
}): string {
  const cta =
    opts.ctaLabel && opts.ctaHref
      ? `<p><a href="${escapeAttr(opts.ctaHref)}">${escapeHtml(opts.ctaLabel)}</a></p>`
      : '';
  return [
    `<html><body style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#191919;background:#F7F6F2;padding:24px">`,
    `<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E6E0;padding:28px">`,
    `<p style="letter-spacing:.18em;font-size:12px;text-transform:uppercase;color:#74634F;margin:0 0 16px">${escapeHtml(opts.storeName)}</p>`,
    `<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(opts.title)}</h1>`,
    `<p style="font-size:15px;line-height:1.6;margin:0 0 16px">${escapeHtml(opts.body)}</p>`,
    cta,
    `<p style="font-size:12px;color:#777777;margin:24px 0 0">Email otomatis. Jangan balas pesan ini.</p>`,
    `</div></body></html>`,
  ].join('');
}

const escapeHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (v: string) => escapeHtml(v).replace(/"/g, '&quot;');
