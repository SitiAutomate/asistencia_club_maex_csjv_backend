import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const TYP_VERIFY = 'email_verify';
const TYP_RESET = 'pwd_reset';

export const signAccessToken = (user) =>
  jwt.sign(
    {
      email: user.email,
      rol: user.rol,
      usuarioid: user.usuarioid,
    },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn },
  );

export const verifyAccessToken = (token) => {
  const p = jwt.verify(token, env.jwt.secret);
  return {
    email: p.email,
    rol: p.rol,
    usuarioid: p.usuarioid,
  };
};

export const signEmailVerificationToken = (email) =>
  jwt.sign({ email, typ: TYP_VERIFY }, env.jwt.secret, { expiresIn: '7d' });

export const verifyEmailVerificationToken = (token) => {
  const p = jwt.verify(token, env.jwt.secret);
  if (p.typ !== TYP_VERIFY) throw new Error('Token de verificacion invalido');
  return { email: p.email };
};

export const signPasswordResetToken = (email) =>
  jwt.sign({ email, typ: TYP_RESET }, env.jwt.secret, { expiresIn: '1h' });

export const verifyPasswordResetToken = (token) => {
  const p = jwt.verify(token, env.jwt.secret);
  if (p.typ !== TYP_RESET) throw new Error('Token de restablecimiento invalido');
  return { email: p.email };
};
