/**
 * In-memory token store for OAuth2 access tokens.
 * Tokens survive for the lifetime of the server process.
 * In production, consider persisting to the database for multi-instance setups.
 */

export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // Unix ms
}

class TokenStore {
  private store = new Map<string, StoredToken>();

  set(provider: string, token: StoredToken): void {
    this.store.set(provider, token);
  }

  get(provider: string): StoredToken | undefined {
    const token = this.store.get(provider);
    if (!token) return undefined;
    // Treat as expired if within 60 seconds of expiry
    if (token.expiresAt && Date.now() > token.expiresAt - 60_000) {
      this.store.delete(provider);
      return undefined;
    }
    return token;
  }

  has(provider: string): boolean {
    return this.get(provider) !== undefined;
  }

  delete(provider: string): void {
    this.store.delete(provider);
  }

  /** Returns which providers currently have valid tokens. */
  connectedProviders(): string[] {
    return ['teamsnap', 'playmetrics'].filter((p) => this.has(p));
  }
}

export const tokenStore = new TokenStore();
