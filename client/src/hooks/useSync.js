import { useEffect, useState, useCallback } from "react";
import { syncEngine } from "@/lib/sync/syncEngine";
import { useAuth } from "@/components/providers/AppProviders";
export function useSync() {
    const { user } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [state, setState] = useState({
        isOnline: true,
        isSyncing: false,
        pendingCount: 0,
        lastSyncTime: null,
        lastError: null,
    });
    useEffect(() => {
        const scope = { userId: user?.id ?? null, isAdmin: user?.role === "ADMIN" };
        syncEngine.setScope(scope);
        setMounted(true);
        const unsubscribe = syncEngine.subscribe((newState) => {
            setState(newState);
        });
        return () => unsubscribe();
    }, [user?.id, user?.role]);
    const syncNow = useCallback(async () => {
        return await syncEngine.triggerSync({ userId: user?.id ?? null, isAdmin: user?.role === "ADMIN" });
    }, [user?.id, user?.role]);
    return {
        ...state,
        mounted,
        syncNow,
    };
}
