import { useEffect, useState } from "react";
import { hideSplash } from "./lib/splash";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Shell from "./components/layout/Shell";
import MaintenanceOverlay from "./components/ui/MaintenanceOverlay";
import Toast from "./components/ui/Toast";
import AddChannelPage from "./pages/AddChannelPage";
import ContentStudioPage from "./pages/ContentStudioPage";
import AutoPage from "./pages/AutoPage";
import CalendarPage from "./pages/CalendarPage";
import ChannelsPage from "./pages/ChannelsPage";
import CreateBrandPage from "./pages/CreateBrandPage";
import InsightsPage from "./pages/InsightsPage";
import InsightsPostPage from "./pages/InsightsPostPage";
import JoinPage from "./pages/JoinPage";
import LegalPage from "./pages/LegalPage";
import LibraryPage from "./pages/LibraryPage";
import LoginPage from "./pages/LoginPage";
import NewPostPage from "./pages/NewPostPage";
import PostDetailPage from "./pages/PostDetailPage";
import ProductsPage from "./pages/ProductsPage";
import ReviewPage from "./pages/ReviewPage";
import TodayPage from "./pages/TodayPage";
import CommandPage from "./pages/CommandPage";
import LeadsPage from "./pages/LeadsPage";
import VideoStoryPage from "./pages/VideoStoryPage";
import WeeklyPage from "./pages/WeeklyPage";
import WebsitePage from "./pages/WebsitePage";
import ActivityPage from "./pages/ActivityPage";
import { StoreProvider, useStore } from "./store";
import { canOpen } from "./lib/access";

function ToastHost() {
  const { toast } = useStore();
  return <Toast message={toast} />;
}

// A page this person's access doesn't include (Settings → Team) — say so
// instead of a page full of errors. The server refuses those calls anyway.
function NoAccess() {
  const navigate = useNavigate();
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="max-w-sm text-center">
        <div className="text-[17px] font-bold text-ink-900">This part isn’t in your access</div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
          A workspace owner or admin can add it for you under Settings → Team.
        </p>
        <button type="button" onClick={() => navigate("/")} className="btn-primary mt-5">
          Go to the Dashboard
        </button>
      </div>
    </div>
  );
}

function Guarded({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  return canOpen(user, pathname) ? children : <NoAccess />;
}

function Portal() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Shell>
          <Guarded>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/command" element={<CommandPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/new" element={<NewPostPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/brands/new" element={<CreateBrandPage />} />
            <Route path="/channels/add" element={<AddChannelPage />} />
            <Route path="/auto" element={<AutoPage />} />
            <Route path="/weekly" element={<WeeklyPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/website" element={<WebsitePage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/story" element={<VideoStoryPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/ai" element={<ContentStudioPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/insights/:targetId" element={<InsightsPostPage />} />
            <Route path="/post/:index" element={<PostDetailPage />} />
          </Routes>
          </Guarded>
        </Shell>
        <ToastHost />
      </BrowserRouter>
    </StoreProvider>
  );
}

const JOIN_RE = /^\/join\/([A-Za-z0-9_-]+)\/?$/;

function Gate() {
  const { user, loading } = useAuth();
  // An invite link (/join/<token>) — shown until they join or leave it.
  const [joinToken, setJoinToken] = useState(() => window.location.pathname.match(JOIN_RE)?.[1] || null);

  // Launch splash (index.html) fades out once we know who's signed in.
  useEffect(() => {
    if (!loading) hideSplash();
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-ink-50 text-ink-400 text-[12px]">
        Loading…
      </div>
    );
  }
  if (joinToken) return <JoinPage token={joinToken} onDone={() => setJoinToken(null)} />;
  return user ? <Portal /> : <LoginPage />;
}

// Public pages anyone can open without signing in (reviewers, search engines).
const PUBLIC_PAGES = { "/privacy": "privacy", "/terms": "terms" };

export default function App() {
  const publicPage = PUBLIC_PAGES[window.location.pathname.replace(/\/+$/, "")];
  if (publicPage) return <LegalPage kind={publicPage} />;
  return (
    <AuthProvider>
      <Gate />
      <MaintenanceOverlay />
    </AuthProvider>
  );
}
