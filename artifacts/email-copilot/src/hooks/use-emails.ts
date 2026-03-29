import { useQueryClient } from "@tanstack/react-query";
import { 
  useLogAction, 
  useTriggerSync, 
  useCreateDecision,
  getGetEmailsQueryKey,
  getGetInboxSummaryQueryKey,
  getGetEmailQueryKey,
  getGetSyncStatusQueryKey
} from "@workspace/api-client-react";

export function useEmailActions() {
  const queryClient = useQueryClient();

  const logAction = useLogAction({
    mutation: {
      onSuccess: () => {
        // Optimistically invalidating cache to keep UI snappy
        queryClient.invalidateQueries({ queryKey: getGetEmailsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetInboxSummaryQueryKey() });
      }
    }
  });

  const triggerSync = useTriggerSync({
    mutation: {
      onSuccess: () => {
        // Only refresh sync status — the actual Gmail fetch is async on the server.
        // Email list invalidation happens in Sidebar once sync status goes idle.
        queryClient.invalidateQueries({ queryKey: getGetSyncStatusQueryKey() });
      }
    }
  });

  const createDecision = useCreateDecision({
    mutation: {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: getGetEmailQueryKey(variables.data.emailId) });
        queryClient.invalidateQueries({ queryKey: getGetEmailsQueryKey() });
      }
    }
  });

  return {
    logAction,
    triggerSync,
    createDecision,
  };
}
