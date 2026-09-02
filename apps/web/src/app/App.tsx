import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { NewEnquiryModal } from '@/features/leads/NewEnquiryModal';
import { LeadDetailPage } from '@/features/leads/LeadDetailPage';
import { LeadsPage } from '@/features/leads/LeadsPage';
import { TasksPage } from '@/features/leads/TasksPage';

export function App() {
  const { user, initialising } = useAuth();
  const [enquiryOpen, setEnquiryOpen] = useState(false);

  // Hold the UI until the silent refresh settles, so an authenticated user
  // never sees the login screen flash on reload.
  if (initialising) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-50">
        <LoadingState label="Starting Lemuria Travel AI" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <AppShell onNewEnquiry={() => setEnquiryOpen(true)}>
        <Routes>
          <Route path="/" element={<DashboardPage onNewEnquiry={() => setEnquiryOpen(true)} />} />
          <Route path="/leads" element={<LeadsPage onNewEnquiry={() => setEnquiryOpen(true)} />} />
          <Route path="/leads/:id" element={<LeadDetailPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>

      <NewEnquiryModal open={enquiryOpen} onClose={() => setEnquiryOpen(false)} />
    </>
  );
}
