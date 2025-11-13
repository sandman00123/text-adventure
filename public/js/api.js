// public/js/api.js
import { supabase } from './auth.js';

// authFetch: automatically adds Authorization Bearer if user is logged in.
// If not logged in, calls as guest.
export async function authFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }
  return fetch(url, { ...options, headers });
}
