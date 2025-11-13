// public/js/auth.js
// Browser-side Supabase client for optional sign-in
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// Sign up (email+password)
export async function handleSignUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

// Sign in (email+password)
export async function handleSignIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Sign out
export async function handleSignOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Get current session & user
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user || null;
}
