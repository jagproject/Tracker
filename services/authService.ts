import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

// ------------------------------------------------------------------
// CONFIGURACIÓN DE SUPABASE (BASE DE DATOS)
// ------------------------------------------------------------------
// INSTRUCCIONES:
// 1. Ve a tu Dashboard de Supabase -> Settings -> API.
// 2. Copia la "Project URL" y pégala en MANUAL_URL.
// 3. Copia la "anon public key" y pégala en MANUAL_KEY.
// ------------------------------------------------------------------

const MANUAL_URL = "https://jnauwnljmlurqtziqqch.supabase.co"; 
const MANUAL_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuYXV3bmxqbWx1cnF0emlxcWNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwMjA3OTQsImV4cCI6MjA3OTU5Njc5NH0.x2AUqWSlAnsyMuiqQ4eHPr4czpwh0W978ZQOWuMIhnk";

// Intentamos leer de variables de entorno primero (Best Practice), si no, usamos las manuales.
const ENV_URL = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || MANUAL_URL;
const ENV_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || MANUAL_KEY;

const isConfigured = !!(ENV_URL && ENV_KEY && ENV_URL.startsWith('http'));

// Exporting supabase instance for use in storageService
export let supabase: SupabaseClient | null = null;

if (isConfigured) {
    try {
        supabase = createClient(ENV_URL, ENV_KEY);
        console.log(`✅ Supabase Initialized for Project: ${new URL(ENV_URL).hostname.split('.')[0]}. Connection Ready.`);
    } catch (e) {
        console.error("❌ Failed to init Supabase", e);
        supabase = null;
    }
} else {
    console.warn("⚠️ Supabase Credentials missing. App running in Offline/Mock mode.");
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