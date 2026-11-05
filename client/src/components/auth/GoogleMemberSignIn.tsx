import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, type AuthUser } from "@/services/api";

type GoogleCredentialResponse = { credential: string };
type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }) => void;
      renderButton: (
        container: HTMLElement,
        options: {
          theme: "outline";
          size: "large";
          text: "continue_with";
          shape: "rectangular";
          width: number;
        },
      ) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let googleScriptPromise: Promise<void> | undefined;

function loadGoogleIdentityServices() {
  if (window.google) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleScriptPromise = undefined;
      reject(new Error("Google sign-in could not be loaded. Check your connection and retry."));
    };
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

export function GoogleMemberSignIn({
  invitationToken,
  phone,
  onAuthenticated,
}: {
  invitationToken?: string;
  phone?: string;
  onAuthenticated: (user: AuthUser) => void | Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthenticatedRef = useRef(onAuthenticated);
  const authParamsRef = useRef({ invitationToken, phone });
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    onAuthenticatedRef.current = onAuthenticated;
  }, [onAuthenticated]);

  useEffect(() => {
    authParamsRef.current = { invitationToken, phone };
  }, [invitationToken, phone]);

  useEffect(() => {
    if (!clientId) return;
    let active = true;

    loadGoogleIdentityServices()
      .then(() => {
        if (!active || !containerRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            if (!credential || busyRef.current) return;
            setError("");
            busyRef.current = true;
            setBusy(true);
            try {
              const { invitationToken, phone } = authParamsRef.current;
              const response = await api.auth.google({
                credential,
                ...(invitationToken ? { invitationToken } : {}),
                ...(phone ? { phone } : {}),
              });
              await onAuthenticatedRef.current(response.data.user);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Google sign-in failed. Please try again.");
            } finally {
              busyRef.current = false;
              setBusy(false);
            }
          },
        });
        const container = containerRef.current;
        container.replaceChildren();
        window.google.accounts.id.renderButton(container, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: Math.min(400, Math.max(240, container.clientWidth)),
        });
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Google sign-in could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, [clientId]);

  return (
    <div className="space-y-2">
      {clientId ? (
        <>
          <div
            ref={containerRef}
            className="flex min-h-10 justify-center"
            aria-label="Continue with Google"
          />
          {busy && (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in with Google…
            </p>
          )}
        </>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Google sign-in is unavailable until it is configured.
        </p>
      )}
      {error && <p className="text-center text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
