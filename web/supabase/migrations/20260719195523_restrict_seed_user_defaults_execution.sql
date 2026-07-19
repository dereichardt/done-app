-- This trigger function is invoked by the auth.users signup trigger and is not
-- an application RPC. Restrict direct Data API execution to trusted services.
revoke all on function public.seed_user_defaults() from public, anon, authenticated;
grant execute on function public.seed_user_defaults() to service_role;
