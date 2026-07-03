import crypto from 'crypto';

const TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map();

const cleanupExpired = () => {
  const now = Date.now();
  for (const [state, expiresAt] of pendingStates.entries()) {
    if (expiresAt <= now) pendingStates.delete(state);
  }
};

export const createMicrosoftOAuthState = () => {
  cleanupExpired();
  const state = crypto.randomBytes(32).toString('hex');
  pendingStates.set(state, Date.now() + TTL_MS);
  return state;
};

export const consumeMicrosoftOAuthState = (state) => {
  cleanupExpired();
  const key = String(state || '').trim();
  if (!key || !pendingStates.has(key)) return false;
  pendingStates.delete(key);
  return true;
};
