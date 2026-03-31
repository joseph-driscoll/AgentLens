import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { LangSmithProvider } from './contexts/LangSmithContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { TracesPage } from './pages/TracesPage';
import { EvalsPage } from './pages/EvalsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ChatPage } from './pages/ChatPage';
import { DatasetsPage } from './pages/DatasetsPage';

export default function App() {
  return (
    <AuthProvider>
      <LangSmithProvider>
        <BrowserRouter>
          <Toaster
            position="top-right"
            theme="dark"
            toastOptions={{
              style: {
                background: '#0f172a',
                border: '1px solid #1e293b',
                color: '#e2e8f0',
              },
              descriptionClassName: 'text-slate-400',
              duration: 5000,
            }}
          />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/traces" element={<TracesPage />} />
              <Route path="/evaluations" element={<EvalsPage />} />
              <Route path="/datasets" element={<DatasetsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/chat" element={<ChatPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </LangSmithProvider>
    </AuthProvider>
  );
}
