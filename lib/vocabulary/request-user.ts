const AUTHENTICATED_USER_EMAIL_HEADER = "oai-authenticated-user-email";
const AUTHENTICATED_USER_ID_HEADER = "oai-authenticated-user-id";

export type AuthenticatedUser = { userId: string; email: string | null };

export function authenticatedUser(headers: Headers): AuthenticatedUser | null {
  const stableId = headers.get(AUTHENTICATED_USER_ID_HEADER)?.trim();
  const email = headers.get(AUTHENTICATED_USER_EMAIL_HEADER)?.trim().toLocaleLowerCase("en-US") || null;
  if (stableId) return { userId: stableId, email };
  return email ? { userId: email, email } : null;
}

export function authenticatedUserId(headers: Headers): string | null {
  return authenticatedUser(headers)?.userId ?? null;
}

export function authenticationRequiredBody() {
  return {
    error: "Sign in with ChatGPT to use your vocabulary collection.",
    code: "authentication_required",
    signInUrl: "/signin-with-chatgpt?return_to=%2F",
  };
}
