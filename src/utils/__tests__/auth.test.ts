import { describe, it, expect, beforeEach } from 'vitest';
import { createToken, decodeToken, getUserFromToken, authenticate, isTokenValid } from '../auth';
import type { User } from '../../types';

const testUser: User = { id: '1', email: 'test@example.com', name: 'Test User' };

describe('JWT auth utilities', () => {
  it('creates a valid JWT with three segments', () => {
    const token = createToken(testUser);
    const segments = token.split('.');
    expect(segments).toHaveLength(3);
  });

  it('decodes token payload correctly', () => {
    const token = createToken(testUser);
    const payload = decodeToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('1');
    expect(payload!.email).toBe('test@example.com');
    expect(payload!.name).toBe('Test User');
  });

  it('extracts user from token', () => {
    const token = createToken(testUser);
    const user = getUserFromToken(token);
    expect(user).toEqual(testUser);
  });

  it('validates non-expired tokens', () => {
    const token = createToken(testUser);
    expect(isTokenValid(token)).toBe(true);
  });

  it('returns null for malformed tokens', () => {
    expect(decodeToken('not.a.token')).toBeNull();
    expect(decodeToken('')).toBeNull();
  });

  describe('authenticate', () => {
    it('returns a token for valid demo credentials', () => {
      const token = authenticate('demo@agentlens.dev', 'demo');
      expect(token).not.toBeNull();
      expect(isTokenValid(token!)).toBe(true);
    });

    it('returns null for invalid credentials', () => {
      expect(authenticate('wrong@email.com', 'wrong')).toBeNull();
    });
  });
});

describe('token storage', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, val: string) => { store[key] = val; },
        removeItem: (key: string) => { delete store[key]; },
      },
      writable: true,
      configurable: true,
    });
  });

  it('stores and retrieves tokens from localStorage', async () => {
    const { storeToken, getStoredToken, removeToken } = await import('../auth');
    const token = createToken(testUser);

    storeToken(token);
    expect(getStoredToken()).toBe(token);

    removeToken();
    expect(getStoredToken()).toBeNull();
  });
});
