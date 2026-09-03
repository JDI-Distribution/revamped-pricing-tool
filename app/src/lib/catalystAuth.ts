type CatalystWindow = Window & {
  catalyst?: {
    auth?: {
      signIn?: (elementId: string, config?: Record<string, unknown>) => void;
      signOut?: (redirectUrl: string) => void;
    };
  };
};

const getCatalystAuth = () => (window as CatalystWindow).catalyst?.auth;

export async function waitForCatalystAuth(timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const auth = getCatalystAuth();
    if (auth?.signIn) return auth;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return getCatalystAuth() || null;
}

export async function mountCatalystSignIn(elementId: string) {
  const auth = await waitForCatalystAuth();
  if (!auth?.signIn) return false;
  auth.signIn(elementId, { service_url: "/app/" });
  return true;
}

export function goToCatalystLogin() {
  window.location.assign("/__catalyst/auth/login?service_url=/app/");
}

export async function signOutOfCatalyst() {
  const auth = await waitForCatalystAuth();
  if (auth?.signOut) {
    auth.signOut("/__catalyst/auth/login");
    return true;
  }
  return false;
}
