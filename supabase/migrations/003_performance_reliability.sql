create index if not exists click_events_created_at_idx
  on public.click_events(created_at desc);

create index if not exists click_events_session_id_idx
  on public.click_events(session_id);

create index if not exists click_events_partner_slug_idx
  on public.click_events(partner_slug);

create index if not exists click_events_utm_combo_idx
  on public.click_events(utm_source, utm_medium, utm_campaign);

create index if not exists click_events_referrer_idx
  on public.click_events(referrer);

create index if not exists leads_session_id_idx
  on public.leads(session_id);

create index if not exists leads_created_at_idx
  on public.leads(created_at desc);

create index if not exists lead_attributions_click_event_id_idx
  on public.lead_attributions(click_event_id);

create index if not exists lead_attributions_lead_id_idx
  on public.lead_attributions(lead_id);

create index if not exists webhook_deliveries_created_at_idx
  on public.webhook_deliveries(created_at desc);

alter table public.webhook_deliveries
  add column if not exists attempt_count integer not null default 1,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_error text;
