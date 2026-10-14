import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/auth';
import AdminLogin from './pages/AdminLogin';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import ShiftsManagement from './pages/ShiftsManagement';
import CreateShift from './pages/CreateShift';
import ShiftDetails from './pages/ShiftDetails';
import StaffDatabase from './pages/StaffDatabase';
import StaffProfile from './pages/StaffProfile';
import AddStaff from './pages/AddStaff';
import Bookings from './pages/Bookings';
import BookingDetails from './pages/BookingDetails';
import DocumentVerification from './pages/DocumentVerification';
import Reports from './pages/Reports';
import CalendarView from './pages/CalendarView';
import NotificationsCenter from './pages/NotificationsCenter';
import Messages from './pages/Messages';
import AdminSettings from './pages/AdminSettings';
import AddAdminUser from './pages/AddAdminUser';
import ActivityLog from './pages/ActivityLog';
import SADashboard from './pages/superadmin/SADashboard';
import SAUserManagement from './pages/superadmin/SAUserManagement';
import SAAddEditUser from './pages/superadmin/SAAddEditUser';
import SARolesPermissions from './pages/superadmin/SARolesPermissions';
import SAFacilities from './pages/superadmin/SAFacilities';
import SAFacilityDetail from './pages/superadmin/SAFacilityDetail';
import SAReports from './pages/superadmin/SAReports';
import SAActivityLog from './pages/superadmin/SAActivityLog';
import SASettings from './pages/superadmin/SASettings';
import SAProfile from './pages/superadmin/SAProfile';
import AcceptInvitation from './pages/AcceptInvitation';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { accessToken, isLoading } = useAuth();
  if (isLoading) return null;
  return accessToken ? <>{children}</> : <Navigate to="/login" replace />;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { accessToken, role, isLoading } = useAuth();
  if (isLoading) return null;
  if (!accessToken) return <Navigate to="/login" replace />;
  if (role !== 'super_admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { accessToken, role, isLoading } = useAuth();
  if (isLoading) return null;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          accessToken
            ? <Navigate to={role === 'super_admin' ? '/superadmin/dashboard' : '/dashboard'} replace />
            : <AdminLogin />
        }
      />
      <Route path="/accept-invitation" element={<AcceptInvitation />} />
      <Route path="/forgot-password"   element={<ForgotPassword />} />

      {/* Facility Admin routes */}
      <Route path="/dashboard"         element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/shifts"            element={<PrivateRoute><ShiftsManagement /></PrivateRoute>} />
      <Route path="/shifts/new"        element={<PrivateRoute><CreateShift /></PrivateRoute>} />
      <Route path="/shifts/:id"        element={<PrivateRoute><ShiftDetails /></PrivateRoute>} />
      <Route path="/staff"             element={<PrivateRoute><StaffDatabase /></PrivateRoute>} />
      <Route path="/staff/new"         element={<PrivateRoute><AddStaff /></PrivateRoute>} />
      <Route path="/staff/:id"         element={<PrivateRoute><StaffProfile /></PrivateRoute>} />
      <Route path="/bookings"          element={<PrivateRoute><Bookings /></PrivateRoute>} />
      <Route path="/bookings/:id"      element={<PrivateRoute><BookingDetails /></PrivateRoute>} />
      <Route path="/documents"         element={<PrivateRoute><DocumentVerification /></PrivateRoute>} />
      <Route path="/reports"           element={<PrivateRoute><Reports /></PrivateRoute>} />
      <Route path="/calendar"          element={<PrivateRoute><CalendarView /></PrivateRoute>} />
      <Route path="/notifications"     element={<PrivateRoute><NotificationsCenter /></PrivateRoute>} />
      <Route path="/messages"          element={<PrivateRoute><Messages /></PrivateRoute>} />
      <Route path="/settings"          element={<PrivateRoute><AdminSettings /></PrivateRoute>} />
      <Route path="/settings/add-user" element={<PrivateRoute><AddAdminUser /></PrivateRoute>} />
      <Route path="/activity-log"      element={<PrivateRoute><ActivityLog /></PrivateRoute>} />

      {/* Super Admin routes */}
      <Route path="/superadmin/dashboard"      element={<SuperAdminRoute><SADashboard /></SuperAdminRoute>} />
      <Route path="/superadmin/users"          element={<SuperAdminRoute><SAUserManagement /></SuperAdminRoute>} />
      <Route path="/superadmin/users/new"      element={<SuperAdminRoute><SAAddEditUser /></SuperAdminRoute>} />
      <Route path="/superadmin/users/:id/edit" element={<SuperAdminRoute><SAAddEditUser /></SuperAdminRoute>} />
      <Route path="/superadmin/roles"          element={<SuperAdminRoute><SARolesPermissions /></SuperAdminRoute>} />
      <Route path="/superadmin/facilities"      element={<SuperAdminRoute><SAFacilities /></SuperAdminRoute>} />
      <Route path="/superadmin/facilities/:id" element={<SuperAdminRoute><SAFacilityDetail /></SuperAdminRoute>} />
      <Route path="/superadmin/reports"        element={<SuperAdminRoute><SAReports /></SuperAdminRoute>} />
      <Route path="/superadmin/activity-log"   element={<SuperAdminRoute><SAActivityLog /></SuperAdminRoute>} />
      <Route path="/superadmin/settings"       element={<SuperAdminRoute><SASettings /></SuperAdminRoute>} />
      <Route path="/superadmin/profile"        element={<SuperAdminRoute><SAProfile /></SuperAdminRoute>} />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
