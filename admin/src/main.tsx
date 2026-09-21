import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './Login';
import { Layout } from './Layout';
import { Dashboard } from './Dashboard';
import { Drivers } from './Drivers';
import { DriverDetail } from './DriverDetail';
import { Riders } from './Riders';
import { RiderDetail } from './RiderDetail';
import { Trips } from './Trips';
import { TripDetail } from './TripDetail';
import { Sessions } from './Sessions';
import { Settings } from './Settings';
import { Analytics } from './Analytics';
import './style.css';

function App() {
  const token = sessionStorage.getItem('token');
  if (!token) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </BrowserRouter>
    );
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="drivers" element={<Drivers />} />
          <Route path="drivers/:id" element={<DriverDetail />} />
          <Route path="riders" element={<Riders />} />
          <Route path="riders/:id" element={<RiderDetail />} />
          <Route path="trips" element={<Trips />} />
          <Route path="trips/:id" element={<TripDetail />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
