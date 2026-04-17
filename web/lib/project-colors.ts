export const PROJECT_HUES = ["red", "yellow", "green", "teal", "blue", "purple"] as const;
export type ProjectHue = (typeof PROJECT_HUES)[number];

export const PROJECT_SHADES = ["dark", "medium", "light"] as const;
export type ProjectShade = (typeof PROJECT_SHADES)[number];

export type ProjectColorKey =
  | "red_dark"
  | "red_medium"
  | "red_light"
  | "yellow_dark"
  | "yellow_medium"
  | "yellow_light"
  | "green_dark"
  | "green_medium"
  | "green_light"
  | "teal_dark"
  | "teal_medium"
  | "teal_light"
  | "blue_dark"
  | "blue_medium"
  | "blue_light"
  | "purple_dark"
  | "purple_medium"
  | "purple_light";

export type ProjectColorOption = {
  key: ProjectColorKey;
  hue: ProjectHue;
  shade: ProjectShade;
  label: string;
  cssVar: string;
};

export const PROJECT_COLOR_OPTIONS: ProjectColorOption[] = [
  { key: "red_dark", hue: "red", shade: "dark", label: "Red (dark)", cssVar: "--project-color-red-dark" },
  { key: "red_medium", hue: "red", shade: "medium", label: "Red (medium)", cssVar: "--project-color-red-medium" },
  { key: "red_light", hue: "red", shade: "light", label: "Red (light)", cssVar: "--project-color-red-light" },

  {
    key: "yellow_dark",
    hue: "yellow",
    shade: "dark",
    label: "Yellow (dark)",
    cssVar: "--project-color-yellow-dark",
  },
  {
    key: "yellow_medium",
    hue: "yellow",
    shade: "medium",
    label: "Yellow (medium)",
    cssVar: "--project-color-yellow-medium",
  },
  {
    key: "yellow_light",
    hue: "yellow",
    shade: "light",
    label: "Yellow (light)",
    cssVar: "--project-color-yellow-light",
  },

  {
    key: "green_dark",
    hue: "green",
    shade: "dark",
    label: "Green (dark)",
    cssVar: "--project-color-green-dark",
  },
  {
    key: "green_medium",
    hue: "green",
    shade: "medium",
    label: "Green (medium)",
    cssVar: "--project-color-green-medium",
  },
  {
    key: "green_light",
    hue: "green",
    shade: "light",
    label: "Green (light)",
    cssVar: "--project-color-green-light",
  },

  {
    key: "teal_dark",
    hue: "teal",
    shade: "dark",
    label: "Teal (dark)",
    cssVar: "--project-color-teal-dark",
  },
  {
    key: "teal_medium",
    hue: "teal",
    shade: "medium",
    label: "Teal (medium)",
    cssVar: "--project-color-teal-medium",
  },
  {
    key: "teal_light",
    hue: "teal",
    shade: "light",
    label: "Teal (light)",
    cssVar: "--project-color-teal-light",
  },

  { key: "blue_dark", hue: "blue", shade: "dark", label: "Blue (dark)", cssVar: "--project-color-blue-dark" },
  {
    key: "blue_medium",
    hue: "blue",
    shade: "medium",
    label: "Blue (medium)",
    cssVar: "--project-color-blue-medium",
  },
  { key: "blue_light", hue: "blue", shade: "light", label: "Blue (light)", cssVar: "--project-color-blue-light" },

  {
    key: "purple_dark",
    hue: "purple",
    shade: "dark",
    label: "Purple (dark)",
    cssVar: "--project-color-purple-dark",
  },
  {
    key: "purple_medium",
    hue: "purple",
    shade: "medium",
    label: "Purple (medium)",
    cssVar: "--project-color-purple-medium",
  },
  {
    key: "purple_light",
    hue: "purple",
    shade: "light",
    label: "Purple (light)",
    cssVar: "--project-color-purple-light",
  },
];

const PROJECT_COLOR_KEY_SET = new Set<string>(PROJECT_COLOR_OPTIONS.map((o) => o.key));

export function isProjectColorKey(value: unknown): value is ProjectColorKey {
  return typeof value === "string" && PROJECT_COLOR_KEY_SET.has(value);
}

export function normalizeProjectColorKey(value: unknown): ProjectColorKey | null {
  if (value == null) return null;
  if (isProjectColorKey(value)) return value;
  if (typeof value !== "string") return null;

  // Legacy: orange was removed; map to closest yellow shade.
  if (value === "orange_dark") return "yellow_dark";
  if (value === "orange_medium") return "yellow_medium";
  if (value === "orange_light") return "yellow_light";

  return null;
}

export function projectColorCssVar(key: ProjectColorKey): string {
  const opt = PROJECT_COLOR_OPTIONS.find((o) => o.key === key);
  return opt?.cssVar ?? "--project-color-blue-medium";
}

