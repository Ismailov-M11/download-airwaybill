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

      // Step 2: Authenticate with admin.fargo.uz to get w-bh cookie
      try {
        await authenticateWithFargo(idToken);
      } catch (fargoError) {
        console.warn("Failed to authenticate with Fargo admin, PDF generation may not work:", fargoError);
        // Don't fail the entire login if Fargo auth fails
      }

      setIsAuthenticated(true);
      return true;
    } catch (error) {
      return false;
    }
  };

  /**
   * Authenticate with admin.fargo.uz to capture the w-bh cookie
   * This ensures PDF generation will work without manual cookie setup
   */
  const authenticateWithFargo = async (idToken: string): Promise<void> => {
    try {
      // Create a hidden iframe to visit admin.fargo.uz with the token
      // This will set the required cookies in the browser
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.style.width = '1px';
      iframe.style.height = '1px';

      // Set up promise to wait for iframe load
      const loadPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Fargo authentication timeout'));
        }, 10000); // 10 second timeout

        const cleanup = () => {
          clearTimeout(timeout);
          iframe.removeEventListener('load', onLoad);
          iframe.removeEventListener('error', onError);
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        };

        const onLoad = () => {
          // Try to read cookies after iframe loads
          setTimeout(() => {
            try {
              // Extract w-bh cookie and store it
              const wBhCookie = document.cookie
                .split('; ')
                .find(row => row.startsWith('w-bh='))
                ?.split('=')[1];

              if (wBhCookie) {
                localStorage.setItem('w_bh_token', wBhCookie);
                console.log('✅ Successfully captured w-bh cookie from admin.fargo.uz');
              } else {
                console.warn('⚠️ Could not find w-bh cookie after Fargo authentication');
              }
            } catch (cookieError) {
              console.warn('⚠️ Error reading cookies from Fargo iframe:', cookieError);
            }

            cleanup();
            resolve();
          }, 1000); // Wait 1 second for cookies to be set
        };

        const onError = () => {
          cleanup();
          reject(new Error('Failed to load Fargo admin page'));
        };

        iframe.addEventListener('load', onLoad);
        iframe.addEventListener('error', onError);
      });

      // Navigate iframe to admin.fargo.uz with authentication
      // This should set the required cookies
      iframe.src = `https://admin.fargo.uz/login?token=${encodeURIComponent(idToken)}`;
      document.body.appendChild(iframe);

      await loadPromise;
    } catch (error) {
      throw new Error(`Fargo authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
