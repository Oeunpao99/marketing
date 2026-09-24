import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { openCreateBrand } from "../components/layout/CreateBrandDrawer";

/** /brands/new is now a slide-over, not a page — land on Channels with it open. */
export default function CreateBrandPage() {
  useEffect(() => {
    openCreateBrand();
  }, []);
  return <Navigate to="/channels" replace />;
}
