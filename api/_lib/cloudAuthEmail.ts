import { IncomingMessage } from "node:http";
import { Resend } from "resend";

type ConfigError = Error & {
  code?: string;
  statusCode?: number;
};

type EmailSendError = Error & {
  code?: string;
  statusCode?: number;
};

interface SendCloudVerificationEmailOptions {
  to: string;
  confirmationUrl: string;
  req?: IncomingMessage;
}

interface SendCloudPasswordResetEmailOptions {
  to: string;
  recoveryUrl: string;
  req?: IncomingMessage;
}

interface AuthEmailTemplateOptions {
  subject: string;
  preheader: string;
  badge: string;
  title: string;
  intro: string;
  body: string;
  ctaLabel: string;
  wrappedUrl: string;
  supportEmail: string | null;
  logoUrl: string;
  footerLine: string;
}

const VERIFICATION_SUBJECT = "Verify your LabTracker account";
const VERIFICATION_PREHEADER = "Confirm your email to enable secure cloud sync.";
const PASSWORD_RESET_SUBJECT = "Reset your LabTracker password";
const PASSWORD_RESET_PREHEADER = "Use this secure link to choose a new password.";

const createConfigError = (message: string): ConfigError => {
  const error = new Error(message) as ConfigError;
  error.code = "RESEND_NOT_CONFIGURED";
  error.statusCode = 500;
  return error;
};

const createEmailSendError = (message: string): EmailSendError => {
  const error = new Error(message) as EmailSendError;
  error.code = "EMAIL_SEND_FAILED";
  error.statusCode = 502;
  return error;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeBaseUrl = (value: string): string => {
  const parsed = new URL(value);
  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = normalizedPath || "/";
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/$/, normalizedPath ? "" : "/").replace(/\/$/, "");
};

const joinPublicUrl = (baseUrl: string, pathname: string): string => {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const base = normalizedBase.endsWith("/") ? normalizedBase : `${normalizedBase}/`;
  return new URL(pathname.replace(/^\/+/, ""), base).toString();
};

const resolveRequestOrigin = (req?: IncomingMessage): string => {
  const hostHeader = req?.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!host) {
    return "http://localhost:3000";
  }
  const forwardedProtoHeader = req?.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : forwardedProtoHeader;
  const proto =
    typeof forwardedProto === "string" && forwardedProto.trim().length > 0
      ? forwardedProto.trim().split(",")[0]
      : host.includes("localhost") || host.includes("127.0.0.1")
        ? "http"
        : "https";
  return `${proto}://${host}`;
};

const resolveAuthSender = (): string => {
  const preferred = process.env.LABTRACKER_AUTH_FROM?.trim();
  if (preferred) {
    return preferred;
  }

  if (process.env.NODE_ENV === "production") {
    throw createConfigError("LABTRACKER_AUTH_FROM must be configured for production auth emails.");
  }

  const fallback =
    process.env.LABTRACKER_REPORTS_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM?.trim();
  return fallback || "LabTracker Security <onboarding@resend.dev>";
};

const resolveReplyTo = (): string | undefined =>
  process.env.LABTRACKER_AUTH_REPLY_TO?.trim() ||
  process.env.LABTRACKER_SUPPORT_EMAIL?.trim() ||
  undefined;

const resolveSupportEmail = (): string | null =>
  process.env.LABTRACKER_SUPPORT_EMAIL?.trim() || resolveReplyTo() || null;

export const resolveAppPublicOrigin = (req?: IncomingMessage): string => {
  const configuredOrigin =
    process.env.APP_PUBLIC_ORIGIN?.trim() ||
    process.env.SHARE_PUBLIC_ORIGIN?.trim() ||
    process.env.VITE_SHARE_PUBLIC_ORIGIN?.trim();
  return normalizeBaseUrl(configuredOrigin || resolveRequestOrigin(req));
};

export const buildVerifiedRedirectUrl = (publicOrigin: string): string =>
  joinPublicUrl(publicOrigin, "/auth/verified");

export const buildPasswordResetRedirectUrl = (publicOrigin: string): string =>
  joinPublicUrl(publicOrigin, "/auth/reset");

export const buildWrappedVerificationUrl = (
  publicOrigin: string,
  confirmationUrl: string
): string => {
  const wrapperUrl = new URL(joinPublicUrl(publicOrigin, "/auth/confirm"));
  wrapperUrl.searchParams.set("confirmation_url", confirmationUrl);
  return wrapperUrl.toString();
};

export const buildWrappedPasswordResetUrl = (
  publicOrigin: string,
  recoveryUrl: string
): string => {
  const wrapperUrl = new URL(joinPublicUrl(publicOrigin, "/auth/reset"));
  wrapperUrl.searchParams.set("recovery_url", recoveryUrl);
  return wrapperUrl.toString();
};

const buildEmailLogoUrl = (publicOrigin: string): string =>
  joinPublicUrl(publicOrigin, "/labtracker-email-logo.svg");

const buildAuthEmailHtml = ({
  subject,
  preheader,
  badge,
  title,
  intro,
  body,
  ctaLabel,
  wrappedUrl,
  supportEmail,
  logoUrl,
  footerLine
}: AuthEmailTemplateOptions): string => {
  const escapedUrl = escapeHtml(wrappedUrl);
  const escapedLogoUrl = escapeHtml(logoUrl);
  const supportLine = supportEmail
    ? `<p style="margin:18px 0 0;color:#94a3b8;font-size:12px;line-height:18px;">Need help? Reply to this email or contact <a href="mailto:${escapeHtml(
        supportEmail
      )}" style="color:#67e8f9;text-decoration:none;">${escapeHtml(supportEmail)}</a>.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#020617;color:#e2e8f0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#020617;background-image:radial-gradient(circle at top right, rgba(34,211,238,0.18), transparent 42%), linear-gradient(180deg, #020617 0%, #071225 100%);">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;">
            <tr>
              <td style="padding:0 0 18px;">
                <img src="${escapedLogoUrl}" width="200" alt="LabTracker" style="display:block;height:auto;border:0;outline:none;text-decoration:none;" />
              </td>
            </tr>
            <tr>
              <td style="border:1px solid rgba(103,232,249,0.22);border-radius:24px;background:rgba(2,6,23,0.92);padding:32px 28px;box-shadow:0 24px 80px rgba(8,47,73,0.45);">
                <div style="display:inline-block;border:1px solid rgba(103,232,249,0.22);border-radius:999px;padding:7px 12px;color:#67e8f9;font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;background:rgba(6,182,212,0.08);">
                  ${escapeHtml(badge)}
                </div>
                <h1 style="margin:20px 0 12px;font-size:30px;line-height:36px;font-weight:650;color:#f8fafc;">
                  ${escapeHtml(title)}
                </h1>
                <p style="margin:0 0 12px;color:#cbd5e1;font-size:16px;line-height:26px;">
                  ${escapeHtml(intro)}
                </p>
                <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:24px;">
                  ${escapeHtml(body)}
                </p>
                <a href="${escapedUrl}" style="display:inline-block;border-radius:14px;background:#0891b2;color:#ecfeff;text-decoration:none;font-size:15px;line-height:15px;font-weight:700;padding:15px 22px;">
                  ${escapeHtml(ctaLabel)}
                </a>
                <p style="margin:24px 0 10px;color:#94a3b8;font-size:13px;line-height:20px;">
                  If the button does not work, use the fallback link below:
                </p>
                <p style="margin:0;padding:14px 16px;border-radius:16px;background:#0f172a;border:1px solid rgba(148,163,184,0.18);font-size:12px;line-height:20px;word-break:break-all;">
                  <a href="${escapedUrl}" style="color:#67e8f9;text-decoration:none;">Open secure fallback link</a>
                </p>
                <p style="margin:18px 0 0;color:#94a3b8;font-size:12px;line-height:20px;">
                  If you do not see this message in your inbox, also check spam, junk, or promotions.
                </p>
                <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:20px;">
                  ${escapeHtml(footerLine)}
                </p>
                ${supportLine}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const buildAuthEmailText = ({
  subject,
  title,
  intro,
  body,
  ctaLabel,
  wrappedUrl,
  supportEmail,
  footerLine
}: AuthEmailTemplateOptions): string =>
  [
    "LabTracker",
    "",
    subject,
    "",
    title,
    "",
    intro,
    body,
    "",
    `${ctaLabel}: ${wrappedUrl}`,
    "",
    "If you do not see this message in your inbox, also check spam, junk, or promotions.",
    "",
    footerLine,
    supportEmail ? `Support: ${supportEmail}` : null
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");

const sendAuthEmail = async (
  to: string,
  template: AuthEmailTemplateOptions
): Promise<void> => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw createConfigError("RESEND_API_KEY is not configured.");
  }

  const resend = new Resend(apiKey);
  const replyTo = resolveReplyTo();
  const result = await resend.emails.send({
    from: resolveAuthSender(),
    to,
    subject: template.subject,
    html: buildAuthEmailHtml(template),
    text: buildAuthEmailText(template),
    ...(replyTo ? { replyTo } : {})
  });

  if (result.error) {
    throw createEmailSendError(result.error.message || "Resend rejected the auth email.");
  }
};

export const sendCloudVerificationEmail = async ({
  to,
  confirmationUrl,
  req
}: SendCloudVerificationEmailOptions): Promise<void> => {
  const publicOrigin = resolveAppPublicOrigin(req);
  const wrappedUrl = buildWrappedVerificationUrl(publicOrigin, confirmationUrl);
  await sendAuthEmail(to, {
    subject: VERIFICATION_SUBJECT,
    preheader: VERIFICATION_PREHEADER,
    badge: "Cloud security",
    title: "Confirm your email",
    intro: "Finish setting up your LabTracker Cloud account.",
    body: "This verification link helps protect your account and secure your sync access.",
    ctaLabel: "Verify email",
    wrappedUrl,
    supportEmail: resolveSupportEmail(),
    logoUrl: buildEmailLogoUrl(publicOrigin),
    footerLine: "If you did not create this account, you can ignore this email."
  });
};

export const sendCloudPasswordResetEmail = async ({
  to,
  recoveryUrl,
  req
}: SendCloudPasswordResetEmailOptions): Promise<void> => {
  const publicOrigin = resolveAppPublicOrigin(req);
  const wrappedUrl = buildWrappedPasswordResetUrl(publicOrigin, recoveryUrl);
  await sendAuthEmail(to, {
    subject: PASSWORD_RESET_SUBJECT,
    preheader: PASSWORD_RESET_PREHEADER,
    badge: "Cloud security",
    title: "Reset your password",
    intro: "Use this secure link to choose a new password for your LabTracker Cloud account.",
    body: "This also helps you regain access if your account was temporarily locked after too many failed sign-in attempts.",
    ctaLabel: "Reset password",
    wrappedUrl,
    supportEmail: resolveSupportEmail(),
    logoUrl: buildEmailLogoUrl(publicOrigin),
    footerLine: "If you did not request this reset, you can ignore this email."
  });
};
