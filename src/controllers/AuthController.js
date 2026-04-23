import bcrypt from 'bcrypt';
import crypto from 'crypto';
import Usuarios from '../database/models/UsuariosModel.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';
import { ROLES } from '../constants/roles.js';
import {
  signAccessToken,
} from '../utils/authJwt.js';
import {
  buildMicrosoftAuthorizeUrl,
  exchangeMicrosoftAuthorizationCode,
  fetchMicrosoftGraphProfile,
  normalizeMicrosoftEmail,
} from '../utils/authMicrosoft.js';
import { sendAuthEmail } from '../utils/authMail.js';
import {
  buildProveedorResetEmail,
  buildProveedorVerifyEmail,
} from '../utils/authEmailTemplates.js';
import { env } from '../config/env.js';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const generateDbToken = () => crypto.randomBytes(32).toString('hex'); // 64 chars

const buildMicrosoftUsuarioIdFallback = (email) => {
  const localPart = String(email || '')
    .split('@')[0]
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 24);
  return localPart || 'ms_user';
};

export const registerProveedor = async (req, res) => {
  try {
    const { email, password, nombre, usuarioid } = req.body;
    const mail = String(email || '').trim().toLowerCase();
    const documento = String(usuarioid || '').trim();
    if (!emailRegex.test(mail)) {
      return sendError(res, 400, 'Correo invalido');
    }
    if (!documento) {
      return sendError(res, 400, 'El documento (usuarioid) es requerido');
    }
    if (!password || String(password).length < 8) {
      return sendError(res, 400, 'La contraseña debe tener al menos 8 caracteres');
    }
    if (!nombre || !String(nombre).trim()) {
      return sendError(res, 400, 'El nombre es requerido');
    }
    const exists = await Usuarios.findOne({ where: { email: mail } });
    if (exists) {
      return sendError(res, 409, 'El correo ya esta registrado');
    }
    const existsDoc = await Usuarios.findOne({ where: { usuarioid: documento } });
    if (existsDoc) {
      return sendError(res, 409, 'El documento ya esta registrado');
    }
    const verifyJwt = generateDbToken();
    const hash = await bcrypt.hash(String(password), 10);
    await Usuarios.create({
      email: mail,
      password: hash,
      nombre: String(nombre).trim(),
      rol: ROLES.PROVEEDOR,
      confirmado: false,
      token: verifyJwt,
      usuarioid: documento,
    });
    const verifyUrl = `${env.app.frontendUrl}/verificar-cuenta?token=${encodeURIComponent(verifyJwt)}`;
    const { html, text, attachments } = buildProveedorVerifyEmail({
      nombre: String(nombre).trim(),
      verifyUrl,
    });
    const devPayload = {};
    if (env.nodeEnv === 'development') {
      devPayload.verifyLink = verifyUrl;
    }
    try {
      await sendAuthEmail({
        to: mail,
        subject: 'Confirme su cuenta — Club Deportivo San José de Las Vegas',
        text,
        html,
        attachments,
      });
    } catch (err) {
      if (env.nodeEnv === 'development') {
        return sendSuccess(
          res,
          201,
          { ...devPayload, errorCorreo: err.message },
          'Cuenta creada; no se pudo enviar correo (revise verifyLink en desarrollo)',
        );
      }
      return sendError(res, 500, 'No se pudo enviar el correo de confirmacion', err.message);
    }
    return sendSuccess(
      res,
      201,
      devPayload,
      'Registro exitoso. Revise su correo para confirmar la cuenta.',
    );
  } catch (error) {
    return sendError(res, 500, 'Error en el registro', error.message);
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const token = req.query.token || req.body?.token;
    if (!token) {
      return sendError(res, 400, 'Token requerido (query token o body.token)');
    }
    const rawToken = String(token).trim();
    const user = await Usuarios.findOne({
      where: { token: rawToken, rol: ROLES.PROVEEDOR },
    });
    if (!user) {
      return sendError(res, 400, 'Token invalido o expirado');
    }
    await user.update({ confirmado: true, token: '' });
    return sendSuccess(res, 200, { email: user.email }, 'Cuenta confirmada');
  } catch (e) {
    return sendError(res, 400, 'Enlace invalido o expirado', e.message);
  }
};

export const loginProveedor = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) {
      return sendError(res, 400, 'Correo y contraseña requeridos');
    }
    const user = await Usuarios.findOne({ where: { email } });
    if (!user || user.rol !== ROLES.PROVEEDOR) {
      return sendError(
        res,
        403,
        'Credenciales invalidas o use inicio de sesion Microsoft (Administrador / Entrenador)',
      );
    }
    if (!user.confirmado) {
      return sendError(res, 403, 'Debe confirmar su correo antes de iniciar sesion');
    }
    const ok = await bcrypt.compare(String(password), user.password || '');
    if (!ok) {
      return sendError(res, 401, 'Credenciales incorrectas');
    }
    const accessToken = signAccessToken(user);
    return sendSuccess(
      res,
      200,
      {
        accessToken,
        tokenType: 'Bearer',
        user: {
          email: user.email,
          nombre: user.nombre,
          rol: user.rol,
          usuarioid: user.usuarioid,
        },
      },
      'Sesion iniciada',
    );
  } catch (error) {
    return sendError(res, 500, 'Error al iniciar sesion', error.message);
  }
};

export const microsoftAuthorizeInfo = (req, res) => {
  if (!env.microsoft.clientId || !env.microsoft.tenantId || !env.microsoft.clientSecret) {
    return sendError(res, 503, 'Microsoft OAuth no configurado en el servidor');
  }
  const url = buildMicrosoftAuthorizeUrl();
  return sendSuccess(
    res,
    200,
    {
      url,
      redirectUri: env.microsoft.redirectUri,
      instruccionesPostman: [
        '1) Abra "url" en el navegador e inicie sesion con Microsoft.',
        '2) En el redirect, copie el parametro "code" de la URL.',
        `3) POST /api/auth/microsoft/token con JSON: { "code": "<code>", "redirect_uri": "${env.microsoft.redirectUri}" }`,
      ],
    },
    'URL de autorizacion Microsoft',
  );
};

export const microsoftToken = async (req, res) => {
  try {
    const code = req.body.code;
    const redirectUri = String(req.body.redirect_uri || env.microsoft.redirectUri).trim();
    if (!code) {
      return sendError(res, 400, 'Campo code requerido');
    }
    const tokens = await exchangeMicrosoftAuthorizationCode(code, redirectUri);
    const profile = await fetchMicrosoftGraphProfile(tokens.access_token);
    const email = normalizeMicrosoftEmail(profile);
    if (!email) {
      return sendError(res, 400, 'No se pudo obtener el correo desde Microsoft');
    }
    const user = await Usuarios.findOne({ where: { email } });

    if (user?.rol === ROLES.PROVEEDOR) {
      return sendError(
        res,
        403,
        'Los proveedores deben iniciar sesion con correo y contraseña en /api/auth/login',
      );
    }

    // Solo "Administrador" depende de existir en BD. El resto entra por Microsoft como Entrenador.
    let rol = ROLES.ENTRENADOR;
    let usuarioid = buildMicrosoftUsuarioIdFallback(email);
    let nombre = String(profile.displayName || profile.givenName || '').trim() || email;

    if (user?.rol === ROLES.ADMINISTRADOR) {
      if (!user.confirmado) {
        return sendError(res, 403, 'Usuario no confirmado. Active la cuenta con el administrador.');
      }
      rol = ROLES.ADMINISTRADOR;
      usuarioid = user.usuarioid || usuarioid;
      nombre = user.nombre || nombre;
    } else if (user?.rol && user.rol !== ROLES.ENTRENADOR && user.rol !== ROLES.PROVEEDOR) {
      return sendError(res, 403, 'Rol no autorizado para acceso Microsoft');
    }

    const accessToken = signAccessToken({
      email,
      rol,
      usuarioid,
    });
    return sendSuccess(
      res,
      200,
      {
        accessToken,
        tokenType: 'Bearer',
        user: {
          email,
          nombre,
          rol,
          usuarioid,
        },
      },
      'Sesion iniciada con Microsoft',
    );
  } catch (e) {
    return sendError(res, 400, 'Error en autenticacion Microsoft', e.message);
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const msg = 'Si el correo existe, enviaremos instrucciones.';
    if (!emailRegex.test(email)) {
      return sendSuccess(res, 200, {}, msg);
    }
    const user = await Usuarios.findOne({
      where: { email, rol: ROLES.PROVEEDOR, confirmado: true },
    });
    if (!user) {
      return sendSuccess(res, 200, {}, msg);
    }
    const token = generateDbToken();
    const resetUrl = `${env.app.frontendUrl}/restablecer?token=${encodeURIComponent(token)}`;
    await user.update({ token });
    const devPayload = {};
    if (env.nodeEnv === 'development') {
      devPayload.resetLink = resetUrl;
    }
    const { html, text, attachments } = buildProveedorResetEmail({
      nombre: user.nombre || '',
      resetUrl,
    });
    try {
      await sendAuthEmail({
        to: email,
        subject: 'Restablecer contraseña — Club Deportivo San José de Las Vegas',
        text,
        html,
        attachments,
      });
    } catch (err) {
      if (env.nodeEnv === 'development') {
        return sendSuccess(
          res,
          200,
          { ...devPayload, errorCorreo: err.message },
          msg + ' (correo no enviado; use resetLink en desarrollo)',
        );
      }
      return sendError(res, 500, 'Error al enviar correo', err.message);
    }
    return sendSuccess(res, 200, devPayload, msg);
  } catch (e) {
    return sendError(res, 500, 'Error', e.message);
  }
};

export const resetPassword = async (req, res) => {
  try {
    const token = req.body.token || req.query.token;
    const password = req.body.password;
    if (!token || !password) {
      return sendError(
        res,
        400,
        'Token y nueva contraseña requeridos (body JSON: token, password)',
      );
    }
    if (String(password).length < 8) {
      return sendError(res, 400, 'La contraseña debe tener al menos 8 caracteres');
    }
    const rawToken = String(token).trim();
    const user = await Usuarios.findOne({
      where: { token: rawToken, rol: ROLES.PROVEEDOR, confirmado: true },
    });
    if (!user) {
      return sendError(res, 400, 'Token invalido o expirado');
    }
    const hash = await bcrypt.hash(String(password), 10);
    await user.update({ password: hash, token: '' });
    return sendSuccess(res, 200, {}, 'Contraseña actualizada');
  } catch (e) {
    return sendError(res, 400, 'Token invalido o expirado', e.message);
  }
};

export const me = (req, res) =>
  sendSuccess(res, 200, { user: req.user }, 'OK');
