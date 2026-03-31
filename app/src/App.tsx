import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import SetupPage from './pages/SetupPage'
import AuditPage from './pages/AuditPage'
import DomPage from './pages/DomPage'
import StrategyPage from './pages/StrategyPage'
import ImplementationPage from './pages/ImplementationPage'
import TestingPage from './pages/TestingPage'
import ReportingPage from './pages/ReportingPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import ProjectsPage from './pages/ProjectsPage'
import ActivityPage from './pages/ActivityPage'
import ApprovalsPage from './pages/ApprovalsPage'
import GtmDocsPage from './pages/GtmDocsPage'
import RunDetailPage from './pages/RunDetailPage'
import RunsPage from './pages/RunsPage'
import StatusPage from './pages/StatusPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="setup" element={<SetupPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="dom" element={<DomPage />} />
        <Route path="strategy" element={<StrategyPage />} />
        <Route path="implementation" element={<ImplementationPage />} />
        <Route path="testing" element={<TestingPage />} />
        <Route path="reporting" element={<ReportingPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="gtm-docs" element={<GtmDocsPage />} />
        <Route path="runs/:runId" element={<RunDetailPage />} />
        <Route path="runs-overview" element={<RunsPage />} />
        <Route path="status" element={<StatusPage />} />
      </Route>
    </Routes>
  )
}
