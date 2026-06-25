import nodemailer from 'nodemailer';

const parseBool = (value) => {
  if (!value) return false;
  return value === 'true' || value === '1';
};

const emailFrom = process.env.EMAIL_FROM || 'ZygAI <zygai@zygvlogs.site>';
let cachedTransporter = null;
let cachedConfigKey = '';

const getTransporter = () => {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpSecure = parseBool(process.env.SMTP_SECURE);
  const configKey = [
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass ? 'set' : 'missing',
    smtpSecure
  ].join('|');

  if (!smtpHost) {
    cachedTransporter = null;
    cachedConfigKey = configKey;
    return null;
  }

  if (!cachedTransporter || cachedConfigKey !== configKey) {
    cachedTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined
    });
    cachedConfigKey = configKey;
  }

  return cachedTransporter;
};

const buildVerifyUrl = (token) => {
  const baseUrl =
    process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || 'https://zygai.app';
  return `${String(baseUrl).replace(/\/$/, '')}/verify?token=${encodeURIComponent(token)}`;
};

export const sendEmail = async ({ to, subject, text, html }) => {
  const transporter = getTransporter();
  if (!transporter) {
    console.log('Email not configured. Skipping send to:', to);
    console.log('Subject:', subject);
    console.log(text);
    return { sent: false, reason: 'not_configured' };
  }
  const info = await transporter.sendMail({
    from: emailFrom,
    to,
    subject,
    text,
    html
  });
  return { sent: true, info };
};

export const sendEmailWithConfig = async ({ config, to, subject, text, html }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined
    });

    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to,
      subject,
      text,
      html
    });

    return { sent: true, info };
  } catch (error) {
    console.error('Failed to send email with custom config:', error);
    return { sent: false, error: error.message };
  }
};

export const sendVerificationEmail = async (email, token) => {
  const verifyUrl = buildVerifyUrl(token);
  const subject = 'Verify your ZygAI email';
  const text = `Welcome to ZygAI.\n\nVerify your email to activate your account:\n${verifyUrl}\n\nIf you did not create an account, you can ignore this email.`;
  const html = `
    <p>Welcome to ZygAI.</p>
    <p>Verify your email to activate your account:</p>
    <p><a href="${verifyUrl}">${verifyUrl}</a></p>
    <p>If you did not create an account, you can ignore this email.</p>
  `;
  return sendEmail({ to: email, subject, text, html });
};

export const getVerificationUrl = buildVerifyUrl;

const buildResetUrl = (token) => {
  const baseUrl =
    process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || 'https://zygai.app';
  return `${String(baseUrl).replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
};

export const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = buildResetUrl(token);
  const subject = 'Reset your ZygAI password';
  const text = `You requested a password reset.\n\nClick the link to set a new password:\n${resetUrl}\n\nThis link will expire in 24 hours.\n\nIf you did not request a password reset, you can safely ignore this email.`;
  const html = `
    <p>You requested a password reset.</p>
    <p>Click the button below to set a new password:</p>
    <p><a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #f59e0b; color: #000; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a></p>
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all;">${resetUrl}</p>
    <p>This link will expire in 24 hours.</p>
    <p>If you did not request a password reset, you can safely ignore this email.</p>
  `;
  return sendEmail({ to: email, subject, text, html });
};

export const getResetUrl = buildResetUrl;
