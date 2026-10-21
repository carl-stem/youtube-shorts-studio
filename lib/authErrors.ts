// Fixed `?auth_error=` codes used by the OAuth callbacks. Upstream error text is
// logged server-side only; the URL carries a code the client maps to a message.

export const AUTH_ERROR_CODES = [
  'denied',
  'missing_code',
  'state_mismatch',
  'not_configured',
  'provider_error',
  'token_encryption_not_configured',
  'kv_unavailable',
] as const;

export type AuthErrorCode = typeof AUTH_ERROR_CODES[number];

const MESSAGES: Record<AuthErrorCode, string> = {
  denied: 'Access was not granted. Connect again and approve the requested permissions.',
  missing_code: 'Sign-in did not complete. Please try connecting again.',
  state_mismatch: 'Sign-in expired or was started in another tab. Please try connecting again.',
  not_configured: 'This account connection is not set up on the server yet.',
  provider_error: 'The provider could not complete sign-in. Please try again in a moment.',
  token_encryption_not_configured: 'Account connections are disabled until secure token storage is configured on the server.',
  kv_unavailable: 'Account storage is unavailable right now. Please try again later.',
};

function isAuthErrorCode(value: string): value is AuthErrorCode {
  return (AUTH_ERROR_CODES as readonly string[]).includes(value);
}

/** Plain-language message for an `auth_error` query value; unknown values get a generic message. */
export function authErrorMessage(code: string | null): string | null {
  if (code === null) return null;
  return MESSAGES[isAuthErrorCode(code) ? code : 'provider_error'];
}

/** Maps the provider's `?error=` callback parameter (OAuth 2.0 §4.1.2.1) to a code. */
export function authErrorFromProviderParam(error: string | null): AuthErrorCode {
  if (!error) return 'missing_code';
  return error === 'access_denied' ? 'denied' : 'provider_error';
}

export type ConnectedProvider = 'google' | 'tiktok';

/**
 * Reads the `?auth_error=` / `?connected=` values the OAuth callbacks redirect with
 * and returns the query string without them, so the page can show one toast and
 * then clean the URL (a reload must not repeat the message).
 */
export function readAuthRedirect(search: string): { errorCode: string | null; connected: ConnectedProvider | null; cleanedSearch: string } {
  const params = new URLSearchParams(search);
  const errorCode = params.get('auth_error');
  const rawConnected = params.get('connected');
  const connected = rawConnected === 'google' || rawConnected === 'tiktok' ? rawConnected : null;
  params.delete('auth_error');
  params.delete('connected');
  const rest = params.toString();
  return { errorCode, connected, cleanedSearch: rest ? `?${rest}` : '' };
}
