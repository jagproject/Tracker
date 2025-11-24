
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

// Environment variables for Supabase
// We are using the provided credentials directly as requested.
const ENV_URL = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://eimbiasiarimsxfzqzsk.supabase.co";
const ENV_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpbWJpYXNpYXJpbXN4ZnpxenNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NTI5NDMsImV4cCI6MjA3OTQyODk0M30._2Me8VNWyPv6OeC_p3LHt-tcq5NcF27Fqc_78_oWuF8";

const isConfigured = !!(ENV_URL && ENV_KEY && ENV_URL.startsWith('http'));

let supabase: SupabaseClient | null = null;

if (isConfigured) {
    try {
        supabase = createClient(ENV_URL, ENV_KEY);
        console.log("Supabase Client Initialized");
    } catch (e) {
        console.error("Failed to init Supabase", e);
        supabase = null;
    }
}

export const isSupabaseEnabled = () => !!supabase;

export const loginWithEmail = async (email: string) => {
    if (supabase) {
        const { error } = await supabase.auth.signInWithOtp({ 
            email,
            options: {
                emailRedirectTo: window.location.href
            }
        });
        return { error, isMock: false };
    } else {
        // Fallback Mock Behavior
        console.warn("Supabase not configured. Using Mock Auth.");
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { error: null, isMock: true };
    }
};

export const loginWithGoogle = async () => {
    if (supabase) {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        return { data, error, isMock: false };
    } else {
        // Fallback Mock Behavior
        console.warn("Supabase not configured. Using Mock Google Auth.");
        return { data: null, error: null, isMock: true };
    }
};

export const logoutUser = async () => {
    if (supabase) {
        await supabase.auth.signOut();
    }
    // For mock, simple state clearing is handled in App.tsx
};

export const subscribeToAuthChanges = (callback: (user: User | null) => void) => {
    if (supabase) {
        // Check initial session
        supabase.auth.getSession().then(({ data }) => {
            if (data.session?.user) callback(data.session.user);
        });

        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            callback(session?.user || null);
        });
        return { unsubscribe: () => data.subscription.unsubscribe() };
    } else {
        return { unsubscribe: () => {} };
    }
};
