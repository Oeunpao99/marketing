import { lazy, Suspense, useEffect, useState } from "react";
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
import BotSetupPage from "./pages/BotSetupPage";
import CreateBrandPage from "./pages/CreateBrandPage";
import InsightsPage from "./pages/InsightsPage";
import InsightsPostPage from "./pages/InsightsPostPage";
import JoinPage from "./pages/JoinPage";
import LegalPage from "./pages/LegalPage";
import LibraryPage from "./pages/LibraryPage";
import VideoEditPage from './pages/VideoEditPage'
import EditorPage from './pages/EditorPage'
// the slide presenter: loaded only when a deck is opened (it brings the slides' icons)
const PresentPage = lazy(() => import('./pages/PresentPage'))
import LoginPage from "./pages/LoginPage";
import LandingPage from "./pages/LandingPage";
import NewPostPage from "./pages/NewPostPage";
import UpgradePage from "./pages/UpgradePage";
import ApiPage from "./pages/ApiPage";
import PostDetailPage from "./pages/PostDetailPage";
import ProductsPage from "./pages/ProductsPage";
import ReviewPage from "./pages/ReviewPage";
import TodayPage from "./pages/TodayPage";
import CommandPage from "./pages/CommandPage";
import LeadsPage from "./pages/LeadsPage";
import VideoStoryPage from "./pages/VideoStoryPage";
import WeeklyPage from "./pages/WeeklyPage";
import WebsitePage from "./pages/WebsitePage";
import TutorialsPage from "./pages/TutorialsPage";
import ActivityPage from "./pages/ActivityPage";
import AdminApp from "./pages/admin/AdminApp";
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
    <div className="grid min-h-[calc(60vh/var(--z,1))] place-items-center px-6">
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
            <Route path="/upgrade" element={<UpgradePage />} />
            <Route path="/developer" element={<ApiPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/bots" element={<BotSetupPage />} />
            <Route path="/brands/new" element={<CreateBrandPage />} />
            <Route path="/channels/add" element={<AddChannelPage />} />
            <Route path="/auto" element={<AutoPage />} />
            <Route path="/weekly" element={<WeeklyPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/website" element={<WebsitePage />} />
            <Route path="/tutorials" element={<TutorialsPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/story" element={<VideoStoryPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/ai" element={<ContentStudioPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/library/edit/:id" element={<VideoEditPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/editor/:id" element={<EditorPage />} />
            <Route path="/present/:id" element={<Suspense fallback={null}><PresentPage /></Suspense>} />
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
  // Signed out at "/": the public landing page; "Log in" / "Start free" open the
  // sign-in screen (any other address — a link into the app — goes straight there).
  // (?auth=signin / register: sent here by the tutorials page's buttons)
  const [signIn, setSignIn] = useState(() => {
    const asked = new URLSearchParams(window.location.search).get("auth");
    if (asked === "signin" || asked === "register") return asked;
    return window.location.pathname === "/" ? null : "signin";
  });

  // Launch splash (index.html) fades out once we know who's signed in.
  useEffect(() => {
    if (!loading) hideSplash();
  }, [loading]);

  if (loading) {
    return (
      // the launch screen (index.html #splash) covers this until we know who's signed in
      <div className="min-h-screen bg-canvas" />
    );
  }
  if (joinToken) return <JoinPage token={joinToken} onDone={() => setJoinToken(null)} />;
  if (user) return <Portal />;
  if (!signIn) return <LandingPage onLogin={() => setSignIn("signin")} onStart={() => setSignIn("register")} />;
  return <LoginPage key={signIn} initial={signIn} onBack={window.location.pathname === "/" ? () => setSignIn(null) : undefined} />;
}

// A page shown without the sign-in check: nothing waits for the account, so
// the launch screen (index.html #splash) is told to go here — it stayed up
// over /mkt-tutorial otherwise.
function Public({ children }) {
  useEffect(() => hideSplash(), []);
  return children;
}

// Public pages anyone can open without signing in (reviewers, search engines).
const PUBLIC_PAGES = { "/privacy": "privacy", "/terms": "terms" };

export default function App() {
  // The platform admin portal — its own login (backend .env), not a customer's.
  if (/^\/admin-mkt(\/|$)/.test(window.location.pathname)) return <AdminApp />;
  const path = window.location.pathname.replace(/\/+$/, "");
  const publicPage = PUBLIC_PAGES[path];
  if (publicPage) return <Public><LegalPage kind={publicPage} /></Public>;
  // the how-to videos for training sessions — anyone can watch, no sign-in;
  // the landing page's header and footer, "Log in" / "Start free" go to the sign-in
  // the developer docs for the API and MCP connector (pages/DevelopersPage.jsx) — public, like the tutorials
  if (path === "/developers")
    return (
      <Public>
        <LandingPage page="developers" onLogin={() => window.location.assign("/?auth=signin")} onStart={() => window.location.assign("/?auth=register")} />
      </Public>
    );
  if (path === "/mkt-tutorial")
    return (
      <Public>
        <LandingPage page="tutorials" onLogin={() => window.location.assign("/?auth=signin")} onStart={() => window.location.assign("/?auth=register")} />
      </Public>
    );
  return (
    <AuthProvider>
      <Gate />
      <MaintenanceOverlay />
    </AuthProvider>
  );
}
