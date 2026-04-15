import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const getTransport = () => {
  const { host, port, user, pass, secure } = env.email;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass != null && pass !== '' ? { user, pass } : undefined,
  });
};

export const sendAuthEmail = async ({ to, subject, text, html, attachments }) => {
  if (!env.email.host || !env.email.user) {
    throw new Error('Correo no configurado (EMAIL_HOST / EMAIL_USER)');
  }
  const transporter = getTransport();
  await transporter.sendMail({
    from: env.email.from || env.email.user,
    to,
    subject,
    text,
    html: html || text.replace(/\n/g, '<br/>'),
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
  });
};
