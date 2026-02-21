import { validate } from "uuid";
import { getApiKey } from "@/lib/api-key";
import { Thread } from "@langchain/langgraph-sdk";
import { useQueryState } from "nuqs";
import {
  createContext,
  useContext,
  ReactNode,
  useCallback,
  useState,
  Dispatch,
  SetStateAction,
} from "react";
import { createClient } from "./client";

interface ThreadContextType {
  getThreads: () => Promise<Thread[]>;
  deleteThread: (threadId: string) => Promise<void>;
  deleteAllThreads: () => Promise<number>;
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  threadsLoading: boolean;
  setThreadsLoading: Dispatch<SetStateAction<boolean>>;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

function getThreadSearchMetadata(
  assistantId: string,
): { graph_id: string } | { assistant_id: string } {
  if (validate(assistantId)) {
    return { assistant_id: assistantId };
  } else {
    return { graph_id: assistantId };
  }
}

export function ThreadProvider({ children }: { children: ReactNode }) {
  const envApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId = process.env.NEXT_PUBLIC_ASSISTANT_ID;
  const [apiUrl] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [assistantId] = useQueryState("assistantId", {
    defaultValue: envAssistantId || "",
  });
  const finalApiUrl = apiUrl || envApiUrl || "";
  const finalAssistantId = assistantId || envAssistantId || "";
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const getThreads = useCallback(async (): Promise<Thread[]> => {
    if (!finalApiUrl || !finalAssistantId) return [];
    const client = createClient(finalApiUrl, getApiKey() ?? undefined);

    const threads = await client.threads.search({
      metadata: {
        ...getThreadSearchMetadata(finalAssistantId),
      },
      limit: 100,
    });

    return threads;
  }, [finalApiUrl, finalAssistantId]);

  const deleteThread = useCallback(
    async (threadId: string): Promise<void> => {
      if (!finalApiUrl || !threadId) return;
      const client = createClient(finalApiUrl, getApiKey() ?? undefined);
      await client.threads.delete(threadId);
    },
    [finalApiUrl],
  );

  const deleteAllThreads = useCallback(async (): Promise<number> => {
    if (!finalApiUrl || !finalAssistantId) return 0;

    const client = createClient(finalApiUrl, getApiKey() ?? undefined);
    const threadIds: string[] = [];
    const limit = 100;
    let offset = 0;

    while (true) {
      const page = await client.threads.search({
        metadata: {
          ...getThreadSearchMetadata(finalAssistantId),
        },
        limit,
        offset,
      });

      if (page.length === 0) break;

      threadIds.push(...page.map((thread) => thread.thread_id));
      offset += page.length;

      if (page.length < limit) break;
    }

    await Promise.all(threadIds.map((threadId) => client.threads.delete(threadId)));
    return threadIds.length;
  }, [finalApiUrl, finalAssistantId]);

  const value = {
    getThreads,
    deleteThread,
    deleteAllThreads,
    threads,
    setThreads,
    threadsLoading,
    setThreadsLoading,
  };

  return (
    <ThreadContext.Provider value={value}>{children}</ThreadContext.Provider>
  );
}

export function useThreads() {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error("useThreads must be used within a ThreadProvider");
  }
  return context;
}
