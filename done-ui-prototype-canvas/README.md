# Done Prototype 2 (Canvas Tokens)

This second prototype imports Workday Canvas tokens and maps them to app-level semantic roles.

## Yes, Canvas tokens are imported

In `styles.css`:

- `@workday/canvas-tokens-web/css/base/_variables.css`
- `@workday/canvas-tokens-web/css/system/_variables.css`
- `@workday/canvas-tokens-web/css/brand/_variables.css`

## Run

From this folder:

1. `npm install`
2. Open `index.html` directly, or serve with:
   - `python3 -m http.server 5600 --directory "."`
   - visit `http://localhost:5600`

## Semantic color mapping

The prototype maps Canvas token intent to UI purpose:

- Action: `--app-action`
- Info: `--app-info`
- Success: `--app-success`
- Warning: `--app-warning`
- Danger: `--app-danger`

## Notes

- This is still a static prototype for design iteration.
- Keep accent colors sparse and purpose-driven, with neutral surfaces for layout.
