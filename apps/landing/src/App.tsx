import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Legal from './pages/Legal';
import { LEGAL_PAGES } from './legal';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        {LEGAL_PAGES.map((page) => (
          <Route key={page.path} path={page.path} element={<Legal page={page} />} />
        ))}
        {/* Future: <Route path="/signup" element={<Signup />} /> */}
        {/* Future: <Route path="/login"  element={<Login />} /> */}
      </Routes>
    </BrowserRouter>
  );
}
