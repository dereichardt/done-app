-- Integration ID (integration_code) is not unique per owner; allow duplicate codes across integrations.
drop index if exists integrations_owner_integration_code_key;
