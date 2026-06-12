import { useEffect, useState } from "react";
import AnalysisMaterialPage from "./pages/AnalysisMaterialPage";
import DashboardPage from "./pages/DashboardPage";
import ExDataPage from "./pages/ExDataPage";
import MobileDashboardPage from "./pages/MobileDashboardPage";
import MonthlyReviewPage from "./pages/MonthlyReviewPage";
import PlayersPage from "./pages/PlayersPage";
import PredictionPage from "./pages/PredictionPage";
import RacesPage from "./pages/RacesPage";
import ReviewPage from "./pages/ReviewPage";
import VenueFeaturesPage from "./pages/VenueFeaturesPage";

const normalizeHashRoute = (hash: string) => {
  const value = hash.replace(/^#/, "").trim();
  if (!value) return "dashboard";
  return value;
};

function useAutoRefreshAtDateChange() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const getDateKey = () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    const initialDateKey = getDateKey();

    const scheduleReloadAtNextMidnight = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 3, 0);
      const ms = next.getTime() - now.getTime();

      return window.setTimeout(() => {
        window.location.reload();
      }, ms);
    };

    const timeoutId = scheduleReloadAtNextMidnight();

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (getDateKey() !== initialDateKey) {
        window.location.reload();
      }
    };

    const handleFocus = () => {
      if (getDateKey() !== initialDateKey) {
        window.location.reload();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);
}

export default function App() {
  useAutoRefreshAtDateChange();
  const [route, setRoute] = useState(() => normalizeHashRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setRoute(normalizeHashRoute(window.location.hash));
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route.startsWith("mobile-dashboard")) {
    return <MobileDashboardPage />;
  }

  if (route.startsWith("players-page")) {
    return <PlayersPage />;
  }

  if (route.startsWith("ex-data-page")) {
    return <ExDataPage />;
  }

  if (route.startsWith("monthly-review-page")) {
    return <MonthlyReviewPage />;
  }

  if (route.startsWith("races-page")) {
    return <RacesPage />;
  }

  if (route.startsWith("prediction-page")) {
    return <PredictionPage />;
  }

  if (route.startsWith("review-page")) {
    return <ReviewPage />;
  }

  if (route.startsWith("analysis-material-page")) {
    return <AnalysisMaterialPage />;
  }

  if (route.startsWith("venue-features-page")) {
    return <VenueFeaturesPage />;
  }

  return <DashboardPage />;
}
