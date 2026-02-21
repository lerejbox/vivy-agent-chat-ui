import { Button } from "@/components/ui/button";
import { useThreads } from "@/providers/Thread";
import { Thread } from "@langchain/langgraph-sdk";
import { useEffect, useState } from "react";

import { getContentString } from "../utils";
import { useQueryState, parseAsBoolean } from "nuqs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, PanelRightOpen, PanelRightClose, Trash2, X } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { toast } from "sonner";

function ThreadList({
  threads,
  onThreadClick,
  onThreadDelete,
  deletingThreadIds,
  disableActions,
}: {
  threads: Thread[];
  onThreadClick?: (threadId: string) => void;
  onThreadDelete?: (threadId: string) => void;
  deletingThreadIds: Set<string>;
  disableActions: boolean;
}) {
  const [threadId, setThreadId] = useQueryState("threadId");
  const [confirmDeleteThreadId, setConfirmDeleteThreadId] = useState<string | null>(
    null,
  );

  return (
    <div className="flex h-full w-full flex-col items-start justify-start gap-2 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent">
      {threads.map((t) => {
        let itemText = t.thread_id;
        if (
          typeof t.values === "object" &&
          t.values &&
          "messages" in t.values &&
          Array.isArray(t.values.messages) &&
          t.values.messages?.length > 0
        ) {
          const firstMessage = t.values.messages[0];
          itemText = getContentString(firstMessage.content);
        }
        return (
          <div
            key={t.thread_id}
            className="flex w-full items-center gap-1 px-1"
          >
            <Button
              variant="ghost"
              className="w-[244px] items-start justify-start text-left font-normal"
              onClick={(e) => {
                e.preventDefault();
                onThreadClick?.(t.thread_id);
                if (confirmDeleteThreadId === t.thread_id) {
                  setConfirmDeleteThreadId(null);
                }
                if (t.thread_id === threadId) return;
                setThreadId(t.thread_id);
              }}
            >
              <p className="truncate text-ellipsis">{itemText}</p>
            </Button>
            {confirmDeleteThreadId === t.thread_id ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-500 hover:text-slate-800"
                  aria-label={`Cancel delete for thread ${t.thread_id}`}
                  disabled={disableActions || deletingThreadIds.has(t.thread_id)}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setConfirmDeleteThreadId(null);
                  }}
                >
                  <X className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-500 hover:text-green-600"
                  aria-label={`Confirm delete thread ${t.thread_id}`}
                  disabled={disableActions || deletingThreadIds.has(t.thread_id)}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setConfirmDeleteThreadId(null);
                    onThreadDelete?.(t.thread_id);
                  }}
                >
                  <Check className="size-4" />
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-500 hover:text-red-600"
                aria-label={`Delete thread ${t.thread_id}`}
                disabled={disableActions || deletingThreadIds.has(t.thread_id)}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setConfirmDeleteThreadId(t.thread_id);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ThreadHistoryLoading() {
  return (
    <div className="flex h-full w-full flex-col items-start justify-start gap-2 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent">
      {Array.from({ length: 30 }).map((_, i) => (
        <Skeleton
          key={`skeleton-${i}`}
          className="h-10 w-[280px]"
        />
      ))}
    </div>
  );
}

export default function ThreadHistory() {
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const [threadId, setThreadId] = useQueryState("threadId");
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    "chatHistoryOpen",
    parseAsBoolean.withDefault(false),
  );
  const [deletingThreadIds, setDeletingThreadIds] = useState<Set<string>>(
    new Set(),
  );
  const [deletingAllThreads, setDeletingAllThreads] = useState(false);

  const {
    getThreads,
    deleteThread,
    deleteAllThreads,
    threads,
    setThreads,
    threadsLoading,
    setThreadsLoading,
  } = useThreads();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setThreadsLoading(true);
    getThreads()
      .then(setThreads)
      .catch(console.error)
      .finally(() => setThreadsLoading(false));
  }, [getThreads, setThreads, setThreadsLoading]);

  const handleDeleteThread = async (targetThreadId: string) => {
    if (deletingAllThreads || deletingThreadIds.has(targetThreadId)) return;

    setDeletingThreadIds((previous) => {
      const next = new Set(previous);
      next.add(targetThreadId);
      return next;
    });

    try {
      await deleteThread(targetThreadId);
      setThreads((previous) =>
        previous.filter((thread) => thread.thread_id !== targetThreadId),
      );
      if (threadId === targetThreadId) {
        setThreadId(null);
      }
      toast.success("Thread deleted");
    } catch {
      toast.error("Failed to delete thread");
    } finally {
      setDeletingThreadIds((previous) => {
        const next = new Set(previous);
        next.delete(targetThreadId);
        return next;
      });
    }
  };

  const handleDeleteAllThreads = async () => {
    if (deletingAllThreads || threads.length === 0) return;

    const confirmed = window.confirm(
      "Delete all threads? This action cannot be undone.",
    );
    if (!confirmed) return;

    setDeletingAllThreads(true);
    try {
      const deletedCount = await deleteAllThreads();
      setThreads([]);
      setThreadId(null);
      toast.success(
        deletedCount > 0
          ? `Deleted ${deletedCount} thread${deletedCount === 1 ? "" : "s"}`
          : "No threads to delete",
      );
    } catch {
      toast.error("Failed to delete all threads");
    } finally {
      setDeletingAllThreads(false);
      setDeletingThreadIds(new Set());
    }
  };

  return (
    <>
      <div className="shadow-inner-right hidden h-screen w-[300px] shrink-0 flex-col items-start justify-start gap-6 border-r-[1px] border-slate-300 lg:flex">
        <div className="flex w-full items-center justify-between px-4 pt-1.5">
          <div className="flex items-center gap-2">
            <Button
              className="hover:bg-gray-100"
              variant="ghost"
              onClick={() => setChatHistoryOpen((p) => !p)}
            >
              {chatHistoryOpen ? (
                <PanelRightOpen className="size-5" />
              ) : (
                <PanelRightClose className="size-5" />
              )}
            </Button>
            <h1 className="text-xl font-semibold tracking-tight">
              Thread History
            </h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-600 hover:text-red-600"
            disabled={threadsLoading || deletingAllThreads || threads.length === 0}
            onClick={handleDeleteAllThreads}
          >
            <Trash2 className="size-4" />
            Delete All
          </Button>
        </div>
        {threadsLoading ? (
          <ThreadHistoryLoading />
        ) : (
          <ThreadList
            threads={threads}
            onThreadDelete={handleDeleteThread}
            deletingThreadIds={deletingThreadIds}
            disableActions={deletingAllThreads}
          />
        )}
      </div>
      <div className="lg:hidden">
        <Sheet
          open={!!chatHistoryOpen && !isLargeScreen}
          onOpenChange={(open) => {
            if (isLargeScreen) return;
            setChatHistoryOpen(open);
          }}
        >
          <SheetContent
            side="left"
            className="flex lg:hidden"
          >
            <SheetHeader>
              <SheetTitle>Thread History</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-2">
              <Button
                variant="ghost"
                className="w-full justify-center text-slate-600 hover:text-red-600"
                disabled={threadsLoading || deletingAllThreads || threads.length === 0}
                onClick={handleDeleteAllThreads}
              >
                <Trash2 className="size-4" />
                Delete All
              </Button>
            </div>
            <ThreadList
              threads={threads}
              onThreadClick={() => setChatHistoryOpen((o) => !o)}
              onThreadDelete={handleDeleteThread}
              deletingThreadIds={deletingThreadIds}
              disableActions={deletingAllThreads}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
