import { useEffect } from "react";
import { hideSplash } from "./lib/splash";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Shell from "./components/layout/Shell";
import MaintenanceOverlay from "./components/ui/MaintenanceOverlay";
import Toast from "./components/ui/Toast";
import AddChannelPage from "./pages/AddChannelPage";
import AIPromptPage from "./pages/AIPromptPage";
import AutoPage from "./pages/AutoPage";
import CalendarPage from "./pages/CalendarPage";
import ChannelsPage from "./pages/ChannelsPage";
import CreateBrandPage from "./pages/CreateBrandPage";
import InsightsPage from "./pages/InsightsPage";
import InsightsPostPage from "./pages/InsightsPostPage";
import LibraryPage from "./pages/LibraryPage";
import LoginPage from "./pages/LoginPage";
import NewPostPage from "./pages/NewPostPage";
import PostDetailPage from "./pages/PostDetailPage";
import ProductsPage from "./pages/ProductsPage";
import ReviewPage from "./pages/ReviewPage";
import TodayPage from "./pages/TodayPage";
import { StoreProvider, useStore } from "./store";

function ToastHost() {
  const { toast } = useStore();
  return <Toast message={toast} />;
}

function Portal() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Shell>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/new" element={<NewPostPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/brands/new" element={<CreateBrandPage />} />
            <Route path="/channels/add" element={<AddChannelPage />} />
            <Route path="/auto" element={<AutoPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/ai" element={<AIPromptPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/insights/:targetId" element={<InsightsPostPage />} />
            <Route path="/post/:index" element={<PostDetailPage />} />
          </Routes>
        </Shell>
        <ToastHost />
      </BrowserRouter>
    </StoreProvider>
  );
}

function Gate() {
  const { user, loading } = useAuth();

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
  return user ? <Portal /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
      <MaintenanceOverlay />
    </AuthProvider>
  );
}
