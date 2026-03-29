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
        queryClient.invalidateQueries({ queryKey: getGetSyncStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetEmailsQueryKey() });
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
