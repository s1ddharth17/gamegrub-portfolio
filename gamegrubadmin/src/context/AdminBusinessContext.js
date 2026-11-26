import { createContext, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";

import { getAdminToken } from "../config/adminSession";
import { API_BASE_URL } from "../config/api";

const STORAGE_KEY = "gg_admin_business_id";
const AdminBusinessContext = createContext(null);

function normalizeBusinessId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getStoredBusinessId() {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeBusinessId(window.sessionStorage.getItem(STORAGE_KEY));
}

export function withBusinessParams(businessId, extraParams = {}) {
  if (!businessId) {
    return { ...extraParams };
  }

  return {
    ...extraParams,
    business_id: businessId,
  };
}

export function AdminBusinessProvider({ children }) {
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState(getStoredBusinessId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshBusinesses = async () => {
    const token = getAdminToken();

    if (!token) {
      setBusinesses([]);
      setSelectedBusinessId(null);
      setLoading(false);
      setError("");
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/business/admin/access`);
      const nextBusinesses = Array.isArray(response.data) ? response.data : [];
      const storedBusinessId = getStoredBusinessId();
      const nextSelectedBusinessId =
        nextBusinesses.find((business) => business.business_id === storedBusinessId)?.business_id ||
        nextBusinesses[0]?.business_id ||
        null;

      setBusinesses(nextBusinesses);
      setSelectedBusinessId(nextSelectedBusinessId);
      setError("");
    } catch (requestError) {
      setBusinesses([]);
      setSelectedBusinessId(null);
      setError(requestError.response?.data?.error || "Unable to load business access.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshBusinesses();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (selectedBusinessId) {
      window.sessionStorage.setItem(STORAGE_KEY, String(selectedBusinessId));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [selectedBusinessId]);

  const selectedBusiness = useMemo(
    () =>
      businesses.find((business) => business.business_id === selectedBusinessId) ||
      businesses[0] ||
      null,
    [businesses, selectedBusinessId]
  );

  const selectBusiness = (businessId) => {
    setSelectedBusinessId(normalizeBusinessId(businessId));
  };

  return (
    <AdminBusinessContext.Provider
      value={{
        businesses,
        selectedBusiness,
        selectedBusinessId: selectedBusiness?.business_id || null,
        loading,
        error,
        refreshBusinesses,
        selectBusiness,
      }}
    >
      {children}
    </AdminBusinessContext.Provider>
  );
}

export function useAdminBusiness() {
  const context = useContext(AdminBusinessContext);

  if (!context) {
    throw new Error("useAdminBusiness must be used inside AdminBusinessProvider.");
  }

  return context;
}
