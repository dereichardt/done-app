# Implementation Notes

## Delivered MVP Scope

- Single Expo codebase for iOS + web in `apps/client`.
- Supabase schema and RLS policies in `supabase/migrations`.
- Receipt ingestion endpoint in `supabase/functions/ingest-receipt`.
- Review/edit receipt fields and save expenses in client.
- Searchable ledger with status filters.
- CSV export and print-to-PDF guidance for HSA submissions.

## Next Hardening Steps

- Replace mock extraction with OCR provider integration.
- Persist upload files to Supabase Storage bucket `receipts`.
- Add Supabase auth screens and enforce login before app use.
- Implement server-side export generation and signed download links.
