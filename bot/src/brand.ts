// Central brand identity for Novarys / Novus.
// All new user-facing text should consume these constants so future features
// never reintroduce legacy names. Existing DB columns, setting keys, env vars
// and function names intentionally keep their previous identifiers to avoid
// breaking production data.
export const BRAND = {
  ecosystem: 'Novarys',
  agent: 'Novus',
  agentRole: 'AI Community Manager',
  currency: 'PULSE',
  tagline: 'Community Operations',
} as const;

// Contextual channel-style labels for embeds/messages.
export const NOVUS = {
  system: 'NOVUS // SYSTEM',
  security: 'NOVUS // SECURITY',
  community: 'NOVUS // COMMUNITY',
  mission: 'NOVUS // MISSION',
  pulsar: 'NOVUS // PULSAR',
  event: 'NOVUS // EVENT',
} as const;
