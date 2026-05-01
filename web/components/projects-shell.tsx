"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadProjectHeader, signOut } from "@/lib/actions/projects";
import { projectColorCssVar, type ProjectColorKey } from "@/lib/project-colors";

/** Must match `.app-shell--project-accent` in globals.css */
const SHELL_PROJECT_ACCENT_HEIGHT = "8px";

function HomeIcon() {
  return (
    <svg viewBox="0 0 16 16" role="img" aria-hidden="true">
      <path d="M2.5 8L8 3.5 13.5 8" />
      <path d="M4 8v5.5h8V8" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 16 16" role="img" aria-hidden="true">
      <path d="M2 5h5l1.5 2H14v6H2z" />
      <path d="M2 5V3h4l1 2" />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg viewBox="0 0 16 16" role="img" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <path d="M5 8l2 2 4-4" />
    </svg>
  );
}

function InternalIcon() {
  return (
    <svg viewBox="0 0 16 16" role="img" aria-hidden="true">
      <path d="M3 6.5h10v6H3z" />
      <path d="M5 6.5V4.5h6v2" />
      <path d="M6 9h4" />
    </svg>
  );
}

type NavEntry =
  | {
      key: string;
      label: string;
      href: string;
      icon: ReactNode;
      disabled?: false;
    }
  | {
      key: string;
      label: string;
      href?: undefined;
      icon: ReactNode;
      disabled: true;
    };

function CatalogIcon() {
  return (
    <svg viewBox="0 0 16 16" role="img" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <path d="M5 6h6M5 9h4" />
    </svg>
  );
}

const navItems: NavEntry[] = [
  { key: "home", label: "Home", href: "/home", icon: <HomeIcon /> },
  { key: "work", label: "Work", href: "/work", icon: <TasksIcon /> },
  { key: "projects", label: "Projects", href: "/projects", icon: <FolderIcon /> },
  { key: "internal", label: "Internal", href: "/internal", icon: <InternalIcon /> },
  {
    key: "integration-catalog",
    label: "Catalog",
    href: "/integrations/catalog",
    icon: <CatalogIcon />,
  },
];

function SidebarToggleChevron({ expanded }: { expanded: boolean }) {
  return expanded ? (
    <svg className="sidebar-toggle-icon" viewBox="0 0 16 16" role="img" aria-hidden="true">
      <path d="M10 12 6 8l4-4" />
    </svg>
  ) : (
    <svg className="sidebar-toggle-icon" viewBox="0 0 16 16" role="img" aria-hidden="true">
      <path d="M6 12l4-4-4-4" />
    </svg>
  );
}

export function ProjectsShell({
  children,
  userInitial,
}: {
  children: ReactNode;
  userInitial: string;
}) {
  const pathname = usePathname();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [projectColorKey, setProjectColorKey] = useState<ProjectColorKey | null>(null);
  const [showProjectTitleInHeader, setShowProjectTitleInHeader] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDetailsElement>(null);

  const projectIdFromPath = useMemo(() => {
    if (!pathname) return null;
    if (!pathname.startsWith("/projects/")) return null;
    const parts = pathname.split("/").filter(Boolean);
    // /projects/[id]/...
    if (parts.length >= 2 && parts[0] === "projects" && parts[1] !== "new") return parts[1];
    return null;
  }, [pathname]);

  const isProjectsRoute = pathname === "/projects" || pathname?.startsWith("/projects/");
  const isTasksRoute =
    pathname === "/work" ||
    (pathname?.startsWith("/work/") ?? false) ||
    pathname === "/tasks" ||
    (pathname?.startsWith("/tasks/") ?? false);
  const isIntegrationCatalogRoute = pathname?.startsWith("/integrations/catalog") ?? false;
  const isSettingsRoute = pathname === "/settings" || (pathname?.startsWith("/settings/") ?? false);
  const isInternalRoute = pathname === "/internal" || (pathname?.startsWith("/internal/") ?? false);
  const isProjectDetailRoute = projectIdFromPath != null;

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!projectIdFromPath) {
        setProjectTitle(null);
        setProjectColorKey(null);
        setShowProjectTitleInHeader(false);
        return;
      }

      const res = await loadProjectHeader(projectIdFromPath);
      if (cancelled) return;
      if (res.project) {
        setProjectTitle(res.project.customer_name || "");
        setProjectColorKey((res.project.project_color_key as ProjectColorKey | null) ?? null);
      } else {
        setProjectTitle(null);
        setProjectColorKey(null);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [projectIdFromPath]);

  useEffect(() => {
    if (!projectIdFromPath) return;

    function onHeaderUpdated(evt: Event) {
      const e = evt as CustomEvent<{
        projectId: string;
        customer_name?: string | null;
        project_color_key?: ProjectColorKey | null;
      }>;
      if (!e.detail || e.detail.projectId !== projectIdFromPath) return;

      if (typeof e.detail.customer_name === "string") setProjectTitle(e.detail.customer_name);
      if ("project_color_key" in e.detail) setProjectColorKey(e.detail.project_color_key ?? null);
    }

    window.addEventListener("project:headerUpdated", onHeaderUpdated);
    return () => window.removeEventListener("project:headerUpdated", onHeaderUpdated);
  }, [projectIdFromPath]);

  useEffect(() => {
    if (!isProjectDetailRoute) return;

    const el = document.getElementById("project-title-sentinel");
    if (!el) {
      // Subpages typically don't render the main project title; show it immediately.
      setShowProjectTitleInHeader(true);
      return;
    }

    setShowProjectTitleInHeader(false);
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setShowProjectTitleInHeader(!entry.isIntersecting);
      },
      { root: null, threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isProjectDetailRoute, projectIdFromPath]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const menu = userMenuRef.current;
      if (!menu?.open) return;
      const target = e.target;
      if (target instanceof Node && menu.contains(target)) return;
      menu.removeAttribute("open");
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [userMenuOpen]);

  const headerLeftLabel = useMemo(() => {
    if (!pathname) return "Done";
    if (isProjectDetailRoute) return showProjectTitleInHeader ? projectTitle ?? "Project" : "Project";
    if (isSettingsRoute) return "Settings";
    if (isIntegrationCatalogRoute) return "Catalog";
    if (isInternalRoute) return "Internal";
    if (isTasksRoute) return "Work";
    if (isProjectsRoute) return "Projects";
    return "Done";
  }, [
    pathname,
    isProjectDetailRoute,
    isSettingsRoute,
    isIntegrationCatalogRoute,
    isInternalRoute,
    isTasksRoute,
    isProjectsRoute,
    showProjectTitleInHeader,
    projectTitle,
  ]);

  const headerSurfaceStyle = useMemo(
    () =>
      ({
        background: "var(--app-surface)",
        ["--shell-header-bg" as never]: "linear-gradient(90deg, var(--app-surface), var(--app-surface))",
      }) as const,
    [],
  );

  const projectAccentBarStyle = useMemo(() => {
    if (!isProjectDetailRoute || !projectColorKey) return null;
    const cssVar = projectColorCssVar(projectColorKey);
    const c = `var(${cssVar})`;
    const w = "var(--app-surface)";
    const bg = `linear-gradient(90deg,
        color-mix(in oklab, ${w} 45%, ${c} 55%) 0%,
        color-mix(in oklab, ${w} 18%, ${c} 82%) 14%,
        color-mix(in oklab, ${w} 6%, ${c} 94%) 30%,
        ${c} 52%,
        ${c} 100%)`;
    return { backgroundImage: bg, backgroundColor: c } as const;
  }, [isProjectDetailRoute, projectColorKey]);

  const showProjectAccentBar = projectAccentBarStyle != null;
  const shellClassName = [
    sidebarExpanded ? "app-shell sidebar-expanded" : "app-shell",
    showProjectAccentBar ? "app-shell--project-accent" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClassName}>
      <nav className="sidebar" aria-label="Primary">
        <div className="sidebar-top">
          <button
            type="button"
            className="icon-btn sidebar-toggle-btn"
            aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={sidebarExpanded}
            onClick={() => setSidebarExpanded((v) => !v)}
          >
            <SidebarToggleChevron expanded={sidebarExpanded} />
          </button>
        </div>

        <ul className="nav-list">
          {navItems.map((item) => {
            const active =
              !item.disabled &&
              item.href != null &&
              (pathname === item.href || pathname.startsWith(`${item.href}/`));

            const className = `nav-item${active ? " active" : ""}${item.disabled ? " nav-item-placeholder" : ""}`;

            const iconCell = (
              <span className="nav-icon-slot">
                <span className="nav-icon">{item.icon}</span>
              </span>
            );

            if (item.disabled) {
              return (
                <li key={item.key}>
                  <span className={className} aria-disabled="true">
                    {iconCell}
                    <span className="nav-text">{item.label}</span>
                  </span>
                </li>
              );
            }

            return (
              <li key={item.key}>
                <Link
                  className={className}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                >
                  {iconCell}
                  <span className="nav-text">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="dashboard-main">
        <header
          className="shell-header"
          style={{ borderColor: "var(--app-border)", ...headerSurfaceStyle }}
        >
          <div className="shell-header-inner flex w-full items-center justify-between">
            <Link
              href="/projects"
              className="text-sm font-medium"
              style={{ color: "var(--app-text)" }}
            >
              {isProjectDetailRoute ? (
                <span className="relative inline-flex min-w-0 max-w-[40vw] items-center">
                  <span
                    className="transition-[opacity,transform] duration-200 ease-out"
                    style={{
                      opacity: showProjectTitleInHeader ? 0 : 1,
                      transform: showProjectTitleInHeader ? "translateY(-2px)" : "translateY(0)",
                      position: showProjectTitleInHeader ? "absolute" : "static",
                      pointerEvents: "none",
                    }}
                    aria-hidden={showProjectTitleInHeader}
                  >
                    Project
                  </span>
                  <span
                    className="truncate transition-[opacity,transform] duration-200 ease-out"
                    style={{
                      opacity: showProjectTitleInHeader ? 1 : 0,
                      transform: showProjectTitleInHeader ? "translateY(0)" : "translateY(2px)",
                      pointerEvents: "none",
                    }}
                    aria-hidden={!showProjectTitleInHeader}
                  >
                    {projectTitle ?? "Project"}
                  </span>
                  <span className="sr-only">{headerLeftLabel}</span>
                </span>
              ) : (
                headerLeftLabel
              )}
            </Link>
            <details
              ref={userMenuRef}
              className="user-menu"
              onToggle={(e) => setUserMenuOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="user-menu-summary" aria-label="Account menu">
                <span className="user-avatar" aria-hidden="true">
                  {userInitial.slice(0, 1).toUpperCase()}
                </span>
              </summary>
              <div className="user-menu-panel">
                <Link href="/settings" className="user-menu-link">
                  Settings
                </Link>
                <form action={signOut} className="user-menu-signout-form">
                  <button type="submit" className="user-menu-signout">
                    Sign out
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>
        {showProjectAccentBar && projectAccentBarStyle ? (
          <div
            className="shell-project-accent-bar"
            aria-hidden="true"
            style={{
              ...projectAccentBarStyle,
              height: SHELL_PROJECT_ACCENT_HEIGHT,
              minHeight: SHELL_PROJECT_ACCENT_HEIGHT,
            }}
          />
        ) : null}
        <main className="dashboard-frame flex-1">
          <div className="dashboard-inner py-7">{children}</div>
        </main>
      </div>
    </div>
  );
}
