import { useState, useEffect } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { PanelLeft, Settings, History, Tag, FolderOpen, ChevronDown, Activity, CheckSquare, BarChart2, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PIPELINE_STEPS } from '@/lib/constants'
import { useSession } from '@/context/SessionContext'
import { api } from '@/lib/api'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const { session, loading, isSkillComplete, isSkillUnlocked } = useSession()
  const location = useLocation()
  const navigate = useNavigate()

  const completedCount = session?.completedSkills.length ?? 0
  const total = PIPELINE_STEPS.length
  const projectName = session?.name ?? session?.projectPath?.split(/[\\/]/).filter(Boolean).pop() ?? null

  useEffect(() => {
    if (!session?.id) return
    api.getApprovals(session.id).then(approvals => {
      setPendingApprovals(approvals.filter(a => a.status === 'pending').length)
    }).catch(() => {})
  }, [session?.id])

  return (
    <div className="bg-background text-foreground flex h-dvh flex-col overflow-hidden">
      <div className="min-h-0 flex-1 flex overflow-hidden">

        {/* Icon Rail */}
        <div className="w-12 h-full border-r border-border flex flex-col items-center py-3 gap-1 shrink-0 bg-sidebar">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Toggle sidebar"
          >
            <PanelLeft size={16} />
          </button>

          <div className="my-1 w-6 border-t border-border" />

          <NavLink
            to="/projects"
            className={({ isActive }) => cn(
              "w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
              isActive && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary"
            )}
            aria-label="Projects"
          >
            <FolderOpen size={16} />
          </NavLink>

          <NavLink
            to="/history"
            className={({ isActive }) => cn(
              "w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
              isActive && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary"
            )}
            aria-label="History"
          >
            <History size={16} />
          </NavLink>

          <NavLink
            to="/activity"
            className={({ isActive }) => cn(
              "w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
              isActive && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary"
            )}
            aria-label="Activity"
          >
            <Activity size={16} />
          </NavLink>

          <NavLink
            to="/runs-overview"
            className={({ isActive }) => cn(
              "w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
              isActive && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary"
            )}
            aria-label="Runs"
          >
            <BarChart2 size={16} />
          </NavLink>

          <NavLink
            to="/approvals"
            className={({ isActive }) => cn(
              "w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors relative",
              isActive && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary"
            )}
            aria-label="Approvals"
          >
            <CheckSquare size={16} />
            {pendingApprovals > 0 && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-[oklch(0.45_0.1_25)] text-white text-[8px] font-bold flex items-center justify-center rounded-full">
                {pendingApprovals}
              </span>
            )}
          </NavLink>

          <div className="flex-1" />

          <NavLink
            to="/status"
            className={({ isActive }) => cn(
              "w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
              isActive && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary"
            )}
            aria-label="System Status"
          >
            <Shield size={16} />
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) => cn(
              "w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
              isActive && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary"
            )}
            aria-label="Settings"
          >
            <Settings size={16} />
          </NavLink>
        </div>

        {/* Sidebar */}
        <div className={cn(
          "overflow-hidden transition-[width] duration-100 ease-out h-full shrink-0",
          sidebarOpen ? "w-60" : "w-0"
        )}>
          <div className="w-60 h-full border-r border-sidebar-border bg-sidebar flex flex-col">

            {/* App title */}
            <div className="px-3 py-3 border-b border-sidebar-border">
              <Link to="/" className="flex items-center gap-2">
                <Tag size={14} className="shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold truncate leading-tight">Google Tag Manager Automation Engine</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">AI-powered GTM instrumentation</p>
                </div>
              </Link>
            </div>

            {/* Project switcher */}
            <div className="px-3 py-2.5 border-b border-sidebar-border">
              {projectName ? (
                <button
                  onClick={() => navigate('/projects')}
                  className="w-full flex items-center gap-2 text-left hover:bg-sidebar-accent px-2 py-1.5 -mx-2 transition-colors group"
                  title="Switch project"
                >
                  <FolderOpen size={12} className="text-muted-foreground shrink-0" />
                  <span className="text-[12px] font-medium truncate flex-1">{projectName}</span>
                  <ChevronDown size={11} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ) : (
                <button
                  onClick={() => navigate('/projects')}
                  className="w-full flex items-center gap-2 text-left text-muted-foreground hover:text-foreground transition-colors"
                >
                  <FolderOpen size={12} className="shrink-0" />
                  <span className="text-[12px]">All Projects</span>
                </button>
              )}
            </div>

            {/* Progress bar */}
            {session && (
              <div className="px-3 py-2.5 border-b border-sidebar-border">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-muted-foreground">{completedCount} of {total} steps</span>
                  <span className="text-[11px] text-muted-foreground">{Math.round((completedCount / total) * 100)}%</span>
                </div>
                <div className="w-full h-1 bg-muted overflow-hidden">
                  <div
                    className="h-full bg-foreground transition-all duration-500"
                    style={{ width: `${(completedCount / total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Pipeline nav */}
            <nav className="flex-1 overflow-y-auto py-2">
              <div className="px-3 py-1.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Pipeline</span>
              </div>
              {PIPELINE_STEPS.map((step, idx) => {
                const complete = isSkillComplete(step.name)
                const unlocked = isSkillUnlocked(step.name)
                const active = location.pathname === step.route
                const prevStep = idx > 0 ? PIPELINE_STEPS[idx - 1] : null

                return (
                  <div key={step.name} className="relative group">
                    <NavLink
                      to={step.route}
                      className={cn(
                        "flex items-start gap-2.5 px-3 py-2 transition-colors w-full border-l-2",
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground border-l-foreground"
                          : unlocked
                          ? "text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border-l-transparent"
                          : "text-muted-foreground cursor-default pointer-events-none border-l-transparent opacity-50"
                      )}
                      onClick={e => !unlocked && e.preventDefault()}
                    >
                      {/* Step number */}
                      <span className="text-[10px] font-mono mt-0.5 shrink-0 w-4 opacity-60">
                        {String(idx + 1).padStart(2, '0')}
                      </span>

                      {/* Dot */}
                      <span className={cn(
                        "w-2 h-2 mt-1 shrink-0",
                        complete && !active ? "bg-[oklch(0.55_0.12_150)]" :
                        active ? "bg-sidebar-primary-foreground animate-pulse" :
                        unlocked ? "border border-current" :
                        "border border-muted-foreground opacity-40"
                      )} />

                      {/* Label + description */}
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium leading-tight truncate">{step.label}</p>
                        <p className={cn(
                          "text-[11px] leading-tight mt-0.5 truncate",
                          active ? "opacity-70" : "text-muted-foreground"
                        )}>
                          {step.shortDescription}
                        </p>
                      </div>

                      {/* Complete check */}
                      {complete && !active && (
                        <span className="text-[oklch(0.55_0.12_150)] text-[11px] shrink-0 mt-0.5">✓</span>
                      )}
                    </NavLink>

                    {/* Locked tooltip */}
                    {!unlocked && prevStep && (
                      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 hidden group-hover:block">
                        <div className="bg-foreground text-background text-[11px] px-2 py-1 whitespace-nowrap">
                          Complete {prevStep.label} first
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>

            {/* Footer */}
            <div className="border-t border-sidebar-border px-3 py-2 flex flex-col gap-0.5">
              <NavLink
                to="/projects"
                className={({ isActive }) => cn(
                  "flex items-center gap-2 px-0 py-1.5 text-[12px] font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="w-1 h-1 bg-current rounded-full opacity-60" />
                All Projects
              </NavLink>
              <NavLink
                to="/setup"
                className={({ isActive }) => cn(
                  "flex items-center gap-2 px-0 py-1.5 text-[12px] font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="w-1 h-1 bg-current rounded-full opacity-60" />
                Setup
              </NavLink>
              <NavLink
                to="/activity"
                className={({ isActive }) => cn(
                  "flex items-center gap-2 px-0 py-1.5 text-[12px] font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="w-1 h-1 bg-current rounded-full opacity-60" />
                Activity
              </NavLink>
              <NavLink
                to="/runs-overview"
                className={({ isActive }) => cn(
                  "flex items-center gap-2 px-0 py-1.5 text-[12px] font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="w-1 h-1 bg-current rounded-full opacity-60" />
                Runs
              </NavLink>
              <NavLink
                to="/approvals"
                className={({ isActive }) => cn(
                  "flex items-center gap-2 px-0 py-1.5 text-[12px] font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="w-1 h-1 bg-current rounded-full opacity-60" />
                Approvals
                {pendingApprovals > 0 && (
                  <span className="ml-auto text-[10px] font-semibold text-[oklch(0.45_0.1_25)]">{pendingApprovals}</span>
                )}
              </NavLink>
              <NavLink
                to="/gtm-docs"
                className={({ isActive }) => cn(
                  "flex items-center gap-2 px-0 py-1.5 text-[12px] font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="w-1 h-1 bg-current rounded-full opacity-60" />
                GTM Docs
              </NavLink>
              <NavLink
                to="/status"
                className={({ isActive }) => cn(
                  "flex items-center gap-2 px-0 py-1.5 text-[12px] font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="w-1 h-1 bg-current rounded-full opacity-60" />
                System Status
              </NavLink>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex min-w-0 flex-col h-full flex-1">
          {/* Breadcrumb bar */}
          <div className="h-12 border-b border-border flex items-center px-4 gap-2 shrink-0 sticky top-0 z-20 bg-background">
            <Link to="/" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
              Google Tag Manager Automation Engine
            </Link>
            {projectName && location.pathname !== '/' && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="text-[13px] text-muted-foreground">{projectName}</span>
              </>
            )}
            {location.pathname !== '/' && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="text-[13px] font-medium">{getPageLabel(location.pathname)}</span>
              </>
            )}
          </div>

          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                Loading...
              </div>
            ) : (
              <Outlet />
            )}
          </main>
        </div>

      </div>
    </div>
  )
}

function getPageLabel(pathname: string): string {
  const map: Record<string, string> = {
    '/projects': 'Projects',
    '/setup': 'Setup',
    '/audit': 'Audit',
    '/dom': 'Prepare Elements',
    '/strategy': 'Strategy',
    '/implementation': 'Implementation',
    '/testing': 'Testing',
    '/reporting': 'Reporting',
    '/history': 'History',
    '/settings': 'Settings',
    '/activity': 'Activity',
    '/runs-overview': 'Runs',
    '/approvals': 'Approvals',
    '/gtm-docs': 'GTM Docs',
    '/status': 'System Status',
  }
  return map[pathname] ?? 'Google Tag Manager Automation Engine'
}
