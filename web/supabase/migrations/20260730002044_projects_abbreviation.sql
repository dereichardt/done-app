-- Add required project abbreviation (A–Z, 1–12 chars), backfilling from customer_name.

create or replace function public.derive_project_abbreviation(project_name text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text;
  word text;
  initial char(1);
  result text := '';
  stop_words text[] := array['a', 'an', 'the', 'of', 'and', 'for', 'to', 'in', 'on', 'at', 'by'];
begin
  cleaned := coalesce(project_name, '');
  cleaned := regexp_replace(cleaned, '[^A-Za-z]+', ' ', 'g');
  cleaned := trim(both from cleaned);

  if cleaned = '' then
    return 'PROJ';
  end if;

  foreach word in array string_to_array(cleaned, ' ')
  loop
    if word = '' then
      continue;
    end if;
    if lower(word) = any (stop_words) then
      continue;
    end if;
    initial := upper(left(word, 1));
    result := result || initial;
    if length(result) >= 12 then
      return left(result, 12);
    end if;
  end loop;

  if result = '' then
    -- All words were stop words: take initials of every word.
    foreach word in array string_to_array(cleaned, ' ')
    loop
      if word = '' then
        continue;
      end if;
      result := result || upper(left(word, 1));
      if length(result) >= 12 then
        return left(result, 12);
      end if;
    end loop;
  end if;

  if result = '' then
    return 'PROJ';
  end if;

  return result;
end;
$$;

alter table public.projects
  add column if not exists abbreviation text;

update public.projects
set abbreviation = public.derive_project_abbreviation(customer_name)
where abbreviation is null or abbreviation = '';

alter table public.projects
  alter column abbreviation set not null;

alter table public.projects
  drop constraint if exists projects_abbreviation_format_check;

alter table public.projects
  add constraint projects_abbreviation_format_check
  check (abbreviation ~ '^[A-Z]{1,12}$');

drop function if exists public.derive_project_abbreviation(text);
