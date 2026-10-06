import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { PageLoading } from '@/components/States';
import Home from '@/pages/Home';

const Schedule = lazy(() => import('@/pages/Schedule'));
const Matchups = lazy(() => import('@/pages/Matchups'));
const Game = lazy(() => import('@/pages/Game'));
const GameDay = lazy(() => import('@/pages/GameDay'));
const Players = lazy(() => import('@/pages/Players'));
const PlayerProfile = lazy(() => import('@/pages/PlayerProfile'));
const TeamsIndex = lazy(() => import('@/pages/Teams').then((m) => ({ default: m.TeamsIndex })));
const TeamPage = lazy(() => import('@/pages/Teams').then((m) => ({ default: m.TeamPage })));
const AdminData = lazy(() => import('@/pages/AdminData'));
const DataSources = lazy(() => import('@/pages/DataSources'));
const NotFound = lazy(() => import('@/pages/NotFound'));

// HashRouter: GitHub Pages serves static files only, so deep links use #/route.
export default function App() {
  return (
    <HashRouter>
      <AppShell>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/matchups" element={<Matchups />} />
            <Route path="/game/:id" element={<Game />} />
            <Route path="/game/:id/gameday" element={<GameDay />} />
            <Route path="/players" element={<Players />} />
            <Route path="/player/:id" element={<PlayerProfile />} />
            <Route path="/teams" element={<TeamsIndex />} />
            <Route path="/team/:abbr" element={<TeamPage />} />
            <Route path="/admin/data" element={<AdminData />} />
            <Route path="/data-sources" element={<DataSources />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AppShell>
    </HashRouter>
  );
}
