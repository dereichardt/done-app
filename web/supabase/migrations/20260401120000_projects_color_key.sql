-- Add optional project color (UI-defined choices)

alter table public.projects
add column if not exists project_color_key text;

