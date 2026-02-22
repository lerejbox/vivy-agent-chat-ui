import { Message } from "@langchain/langgraph-sdk";
import { useState } from "react";
import { getContentString } from "../utils";
import { cn } from "@/lib/utils";
import { CommandBar, EditableContent } from "./shared";
import { MultimodalPreview } from "@/components/thread/MultimodalPreview";
import { isBase64ContentBlock } from "@/lib/multimodal-utils";
import { editMessage, deleteMessage } from "@/lib/message-api";
import { toast } from "sonner";

export function HumanMessage({
  message,
  allMessages,
  isLoading,
  apiUrl,
  threadId,
  onMessagesChanged,
  onResubmit,
}: {
  message: Message;
  allMessages: Message[];
  isLoading: boolean;
  apiUrl: string;
  threadId: string | null;
  onMessagesChanged: (optimistic: Message[]) => void;
  onResubmit: (messagesBefore: Message[]) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState("");
  const contentString = getContentString(message.content);

  const handleSetEditing = (editing: boolean) => {
    if (editing) setValue(contentString);
    setIsEditing(editing);
  };

  // Compute the truncated optimistic list: all messages up to and including
  // this human message, with the edited content applied.
  const buildOptimistic = (editedValue: string) => {
    const idx = allMessages.findIndex((m) => m.id === message.id);
    return [
      ...allMessages.slice(0, idx),
      { ...message, content: editedValue },
    ] as Message[];
  };

  const handleSubmitEdit = async () => {
    if (!threadId || !message.id) return;
    setIsEditing(false);
    const optimistic = buildOptimistic(value);
    onMessagesChanged(optimistic);
    try {
      await editMessage(apiUrl, threadId, message.id, value, true);
      onResubmit(optimistic);
    } catch (e) {
      console.error("Failed to edit message:", e);
      toast.error("Failed to save edit");
      onMessagesChanged(allMessages); // revert
    }
  };

  const handleSubmitEditAndTruncate = async () => {
    if (!threadId || !message.id) return;
    setIsEditing(false);
    const optimistic = buildOptimistic(value);
    onMessagesChanged(optimistic);
    try {
      await editMessage(apiUrl, threadId, message.id, value, true);
      onResubmit(optimistic);
    } catch (e) {
      console.error("Failed to edit message:", e);
      toast.error("Failed to save edit");
      onMessagesChanged(allMessages); // revert
    }
  };

  const handleDelete = async () => {
    if (!threadId || !message.id) return;
    // Apply optimistic update immediately — remove this message
    const optimistic = allMessages.filter((m) => m.id !== message.id);
    onMessagesChanged(optimistic);
    try {
      await deleteMessage(apiUrl, threadId, message.id, false);
    } catch (e) {
      console.error("Failed to delete message:", e);
      toast.error("Failed to delete message");
      onMessagesChanged(allMessages); // revert
    }
  };

  return (
    <div
      className={cn(
        "group ml-auto flex items-center gap-2",
        isEditing && "w-full max-w-xl",
      )}
    >
      <div className={cn("flex flex-col gap-2", isEditing && "w-full")}>
        {isEditing ? (
          <EditableContent
            value={value}
            setValue={setValue}
            onSubmit={handleSubmitEdit}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {/* Images / file previews */}
            {Array.isArray(message.content) && message.content.length > 0 && (
              <div className="flex flex-wrap items-end justify-end gap-2">
                {message.content.reduce<React.ReactNode[]>(
                  (acc, block, idx) => {
                    if (isBase64ContentBlock(block)) {
                      acc.push(
                        <MultimodalPreview
                          key={idx}
                          block={block}
                          size="md"
                        />,
                      );
                    }
                    return acc;
                  },
                  [],
                )}
              </div>
            )}
            {contentString ? (
              <p className="bg-muted ml-auto w-fit rounded-3xl px-4 py-2 text-right whitespace-pre-wrap">
                {contentString}
              </p>
            ) : null}
          </div>
        )}

        <div
          className={cn(
            "ml-auto flex items-center gap-2 transition-opacity",
            "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
            isEditing && "opacity-100",
          )}
        >
          <CommandBar
            isLoading={isLoading}
            content={contentString}
            isEditing={isEditing}
            setIsEditing={handleSetEditing}
            handleSubmitEdit={() => { void handleSubmitEdit(); }}
            handleSubmitEditAndTruncate={() => { void handleSubmitEditAndTruncate(); }}
            handleDelete={() => { void handleDelete(); }}
          />
        </div>
      </div>
    </div>
  );
}

