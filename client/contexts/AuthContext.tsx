import React, { createContext, useContext, useState, useEffect } from "react";

interface AuthContextType {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  getTokens: () => { idToken: string; wBh?: string };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    const shipoxToken = localStorage.getItem("shipox_token");
    if (shipoxToken) {
      setIsAuthenticated(true);
    }
  }, []);

  const getTokens = () => {
    const idToken = localStorage.getItem("shipox_token") || "";
    const wBh = localStorage.getItem("w_bh_token") || undefined;
    return { idToken, wBh };
  };

  const login = async (
    username: string,
    password: string,
  ): Promise<boolean> => {
    try {
      // Step 1: Authenticate with Shipox API
      const response = await fetch(
        "https://prodapi.shipox.com/api/v1/authenticate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json;charset=utf-8",
          },
          body: JSON.stringify({
            username,
            password,
            remember_me: false,
          }),
        },
      );

      if (!response.ok) {
        return false;
      }

      const data = await response.json();

      if (!data.data?.id_token) {
        return false;
      }

      const idToken = data.data.id_token;
      localStorage.setItem("shipox_token", idToken);

      // Step 2: Get w-bh token from server endpoint
      try {
        await fetchWBhToken(idToken);
      } catch (fargoError) {
        console.warn(
          "Failed to get w-bh token, PDF generation may not work:",
          fargoError,
        );
        // Don't fail the entire login if w-bh fetch fails
      }

      setIsAuthenticated(true);
      return true;
    } catch (error) {
      return false;
    }
  };

  /**
   * Fetch w-bh token from server endpoint
   * This ensures PDF generation will work without manual cookie setup
   */
  const fetchWBhToken = async (idToken: string): Promise<void> => {
    try {
      const response = await fetch("/api/auth/fargo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Token": idToken,
        },
        body: JSON.stringify({ action: "get_w_bh" }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.wBh) {
          localStorage.setItem("w_bh_token", data.wBh);
          console.log("✅ Successfully obtained w-bh token from server");
        } else {
          console.warn("⚠️ Server did not return w-bh token");
        }
      } else {
        console.warn(
          "⚠️ Failed to get w-bh token from server:",
          response.status,
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to fetch w-bh token: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem("shipox_token");
    localStorage.removeItem("w_bh_token");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, getTokens }}>
      {children}
    </AuthContext.Provider>
  );
};
