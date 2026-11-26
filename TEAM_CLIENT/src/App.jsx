import { Navigate, Route, Routes } from 'react-router'
import ProtectedRoute from './routes/ProtectedRoute'
import GuestRoute from './routes/GuestRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import UsersPage from './pages/users/UsersPage'
import UserFormPage from './pages/users/UserFormPage'
import RolesPage from './pages/roles/RolesPage'
import RoleFormPage from './pages/roles/RoleFormPage'
import ChatPage from './pages/chat/ChatPage'
import NotFoundPage from './pages/NotFoundPage'
import ToastStack from './components/notifications/ToastStack'
import RealtimeNotifier from './socket/RealtimeNotifier'

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />

            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/new" element={<UserFormPage />} />
            <Route path="/users/:id/edit" element={<UserFormPage />} />

            <Route path="/roles" element={<RolesPage />} />
            <Route path="/roles/new" element={<RoleFormPage />} />
            <Route path="/roles/:id/edit" element={<RoleFormPage />} />

            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:conversationId" element={<ChatPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <RealtimeNotifier />
      <ToastStack />
    </>
  )
}
