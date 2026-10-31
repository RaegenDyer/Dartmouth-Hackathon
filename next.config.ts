import type { NextConfig } from "next";
import { publicEnvironmentSchema } from "./src/lib/env/public";

const publicSettings = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

// Keep the preparation app credential-free, but reject partial or privileged
// public configuration before Next.js can inline it into browser artifacts.
if (Object.values(publicSettings).some((value) => value?.trim())) {
  const parsed = publicEnvironmentSchema.safeParse(publicSettings);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Missing or invalid application settings: ${fields.join(", ")}`);
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
