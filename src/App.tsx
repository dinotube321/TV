import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { TopNav } from "./components/TopNav/TopNav";
import { HomePage } from "./pages/HomePage";
import { MoviesPage } from "./pages/MoviesPage";
import { TVShowsPage } from "./pages/TVShowsPage";
import { SearchPage } from "./pages/SearchPage";
import { DetailPage } from "./pages/DetailPage";
import { WatchPage } from "./pages/WatchPage";
import { CategoryPage } from "./pages/CategoryPage";
import { ShelfPage } from "./pages/ShelfPage";
import { WatchlistPage } from "./pages/WatchlistPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LegalHubPage } from "./pages/legal/LegalHubPage";
import { DmcaPage } from "./pages/legal/DmcaPage";
import { PrivacyPage } from "./pages/legal/PrivacyPage";
import { TermsPage } from "./pages/legal/TermsPage";
import { peekBrowseReturn } from "./lib/browseReturn";
import { AuthProvider } from "./hooks/useAuth";

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    const state = location.state as { restoreBrowse?: boolean } | null;
    const ret = peekBrowseReturn();
    const here = `${location.pathname}${location.search}`;
    // Returning from a shelf/category “see all” — page will restore scroll.
    if (state?.restoreBrowse && ret && ret.path === here) return;
    window.scrollTo(0, 0);
  }, [location.pathname, location.search, location.state]);

  return null;
}

function AppRoutes() {
  const location = useLocation();
  // Only the player at /watch/:id — not /watchlist
  const isWatch = location.pathname.startsWith("/watch/");

  return (
    <>
      <ScrollToTop />
      {!isWatch && <TopNav />}
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<HomePage />} />
          <Route path="/movies" element={<MoviesPage />} />
          <Route path="/tv" element={<TVShowsPage />} />
          <Route path="/category/:id" element={<CategoryPage />} />
          <Route path="/shelf/:id" element={<ShelfPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/title/:id" element={<DetailPage />} />
          <Route path="/watch/:id" element={<WatchPage />} />
          <Route path="/legal" element={<LegalHubPage />} />
          <Route path="/dmca" element={<DmcaPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
