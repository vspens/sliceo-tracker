create table if not exists public.tracking_links (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  label text,
  partner_slug text not null references public.partners(slug) on update cascade,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists tracking_links_partner_slug_idx
  on public.tracking_links(partner_slug);
