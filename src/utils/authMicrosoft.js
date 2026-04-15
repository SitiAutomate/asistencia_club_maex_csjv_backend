import { env } from '../config/env.js';

export const buildMicrosoftAuthorizeUrl = () => {
  const params = new URLSearchParams({
    client_id: env.microsoft.clientId,
    response_type: 'code',
    redirect_uri: env.microsoft.redirectUri,
    response_mode: 'query',
    scope: 'openid profile email User.Read offline_access',
  });
  return `https://login.microsoftonline.com/${env.microsoft.tenantId}/oauth2/v2.0/authorize?${params}`;
};

export const exchangeMicrosoftAuthorizationCode = async (code, redirectUri) => {
  const body = new URLSearchParams({
    client_id: env.microsoft.clientId,
    client_secret: env.microsoft.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const url = `https://login.microsoftonline.com/${env.microsoft.tenantId}/oauth2/v2.0/token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data.error_description || data.error || 'Error al intercambiar codigo con Microsoft',
    );
  }
  return data;
};

export const fetchMicrosoftGraphProfile = async (accessToken) => {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || 'Error al leer perfil en Microsoft Graph');
  }
  return data;
};

export const normalizeMicrosoftEmail = (profile) => {
  const raw = profile.mail || profile.userPrincipalName || '';
  return String(raw).trim().toLowerCase();
};
