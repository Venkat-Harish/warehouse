import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Scan from './pages/Scan';
import History from './pages/History';
import Reports from './pages/Reports';
import Upload from './pages/Upload';
import Navbar from './components/Navbar';
import './index.css';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#f1f5f9' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#f1f5f9' } },
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <div className="app-shell">
                <Navbar />
                <main className="main-content">
                  <Routes>
                    <Route path="/" element={<Navigate to="/scan" replace />} />
                    <Route path="/scan" element={<Scan />} />
                    <Route path="/history" element={<History />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/upload" element={<Upload />} />
                  </Routes>
                </main>
              </div>
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
