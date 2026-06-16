interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const res = await fetch('https://www.warcraftlogs.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.WCL_CLIENT_ID!,
      client_secret: process.env.WCL_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WCL auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return tokenCache.token;
}

export async function wclQuery<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const token = await getAccessToken();

  const res = await fetch('https://www.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WCL API HTTP error: ${res.status} ${text}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`WCL GraphQL errors: ${json.errors.map((e: { message: string }) => e.message).join('; ')}`);
  }
  return json.data as T;
}

// Small helper to avoid hammering the API — waits between batched calls
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
