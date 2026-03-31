import type { User } from '../types';

const TOKEN_KEY = 'agentlens_token';
const DEMO_USER: User = { id: '1', email: 'demo@agentlens.dev', name: 'Joe Driscoll' };
const DEMO_PASSWORD = 'demo';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded);
}

export function createToken(user: User): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
  const segments = [
    base64UrlEncode(JSON.stringify(header)),
    base64UrlEncode(JSON.stringify(payload)),
    base64UrlEncode('demo-signature'),
  ];
  return segments.join('.');
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    const [, payloadSegment] = token.split('.');
    if (!payloadSegment) return null;
    const payload = JSON.parse(base64UrlDecode(payloadSegment)) as JwtPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getUserFromToken(token: string): User | null {
  const payload = decodeToken(token);
  if (!payload) return null;
  return { id: payload.sub, email: payload.email, name: payload.name };
}

export function authenticate(email: string, password: string): string | null {
  if (email === DEMO_USER.email && password === DEMO_PASSWORD) {
    return createToken(DEMO_USER);
  }
  return null;
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isTokenValid(token: string): boolean {
  return decodeToken(token) !== null;
}
