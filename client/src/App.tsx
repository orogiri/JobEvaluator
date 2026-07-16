import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { EvaluatePage } from './pages/Evaluate';
import { ArchivePage } from './pages/Archive';
import { AiComparePage } from './pages/AiCompare';
import { BenchmarkingPage } from './pages/Benchmarking';
import { BenchmarkImportsPage } from './pages/BenchmarkImports';
import { FieldComparisonPage } from './pages/FieldComparison';
import { AiChatPage } from './pages/AiChat';
import { AnalyticsPage } from './pages/Analytics';
import { CoverLettersPage } from './pages/CoverLetters';
import { SettingsPage } from './pages/Settings';
import { ChevronDown } from 'lucide-react';

const navCls = ({ isActive }: { isActive: boolean }) =>
  `px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
    isActive
      ? 'bg-blue-600 text-white'
      : 'text-gray-600 hover:bg-gray-100'
  }`;

const dropdownItemCls = ({ isActive }: { isActive: boolean }) =>
  `block px-4 py-2 text-sm transition-colors ${
    isActive
      ? 'bg-blue-50 text-blue-700 font-medium'
      : 'text-gray-600 hover:bg-gray-50'
  }`;

// Less-frequently-used tabs, tucked behind the "More" dropdown to keep the main bar uncrowded.
const MORE_LINKS = [
  { to: '/ai-compare',          label: 'AI Compare' },
  { to: '/field-comparison',    label: 'Field Comparison' },
  { to: '/benchmarking-import', label: 'Benchmarking Archive Import' },
];

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isActive = MORE_LINKS.some(l => l.to === location.pathname);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(ev: MouseEvent) {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
          isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        More
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
          {MORE_LINKS.map(l => (
            <NavLink key={l.to} to={l.to} className={dropdownItemCls} onClick={() => setOpen(false)}>
              {l.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-6">
            <span className="text-base font-bold text-gray-900 mr-2">JobEvaluator</span>
            <nav className="flex gap-1 flex-1 min-w-0 overflow-x-auto">
              <NavLink to="/" end className={navCls}>Evaluate</NavLink>
              <NavLink to="/archive" className={navCls}>Archive</NavLink>
              <NavLink to="/benchmarking" className={navCls}>Benchmarking</NavLink>
              <NavLink to="/analytics" className={navCls}>Analytics</NavLink>
              <NavLink to="/cover-letters" className={navCls}>Cover Letters</NavLink>
              <NavLink to="/ai-chat" className={navCls}>AI Chat</NavLink>
              <NavLink to="/settings" className={navCls}>Settings</NavLink>
            </nav>
            <MoreMenu />
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<EvaluatePage />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="/ai-compare" element={<AiComparePage />} />
            <Route path="/field-comparison" element={<FieldComparisonPage />} />
            <Route path="/benchmarking" element={<BenchmarkingPage />} />
            <Route path="/benchmarking-import" element={<BenchmarkImportsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/cover-letters" element={<CoverLettersPage />} />
            <Route path="/ai-chat" element={<AiChatPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
