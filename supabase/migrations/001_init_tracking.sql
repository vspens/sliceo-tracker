create extension if not exists pgcrypto;

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  destination_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text unique not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  total_clicks integer not null default 0,
  first_utm_source text,
  first_utm_campaign text
);

create table if not exists public.click_events (
  id uuid primary key default gen_random_uuid(),
  partner_slug text not null,
  destination_url text not null,
  session_id text not null,
  fingerprint_hash text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referrer text,
  user_agent text,
  ip_address text,
  is_bot boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  email text not null,
  phone text,
  company text,
  consent boolean not null default false,
  session_id text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.lead_attributions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  click_event_id uuid not null references public.click_events(id) on delete cascade,
  attribution_type text not null default 'multi_touch',
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  target_url text not null,
  payload jsonb not null,
  status text not null default 'pending',
  response_code integer,
  response_body text,
  created_at timestamptz not null default now()
);
