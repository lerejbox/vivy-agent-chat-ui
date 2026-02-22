import { parsePartialJson } from "@langchain/core/output_parsers";
import { useStreamContext } from "@/providers/Stream";
import { AIMessage, Message } from "@langchain/langgraph-sdk";
import { getContentString } from "../utils";
import { CommandBar, EditableContent, Volume2 } from "./shared";
import { MarkdownText } from "../markdown-text";
import { LoadExternalComponent } from "@langchain/langgraph-sdk/react-ui";
import { cn } from "@/lib/utils";
import { ToolCalls, ToolResult } from "./tool-calls";
import { MessageContentComplex } from "@langchain/core/messages";
import { Fragment, useState } from "react";
import { isAgentInboxInterruptSchema } from "@/lib/agent-inbox-interrupt";
import { ThreadView } from "../agent-inbox";
import { useQueryState, parseAsBoolean } from "nuqs";
import { GenericInterruptView } from "./generic-interrupt";
import { useArtifact } from "../artifact";
import { editMessage, deleteMessage, sayText } from "@/lib/message-api";
import { toast } from "sonner";

function CustomComponent({
  message,
  thread,
}: {
  message: Message;
  thread: ReturnType<typeof useStreamContext>;
}) {
  const artifact = useArtifact();
  const { values } = useStreamContext();
  const customComponents = values.ui?.filter(
    (ui) => ui.metadata?.message_id === message.id,
  );

  if (!customComponents?.length) return null;
  return (
    <Fragment key={message.id}>
      {customComponents.map((customComponent) => (
        <LoadExternalComponent
          key={customComponent.id}
          stream={thread}
          message={customComponent}
          meta={{ ui: customComponent, artifact }}
        />
      ))}
    </Fragment>
  );
}

function parseAnthropicStreamedToolCalls(
  content: MessageContentComplex[],
): AIMessage["tool_calls"] {
  const toolCallContents = content.filter((c) => c.type === "tool_use" && c.id);

  return toolCallContents.map((tc) => {
    const toolCall = tc as Record<string, any>;
    let json: Record<string, any> = {};
    if (toolCall?.input) {
      try {
        json = parsePartialJson(toolCall.input) ?? {};
      } catch {
        // Pass
      }
    }
    return {
      name: toolCall.name ?? "",
      id: toolCall.id ?? "",
      args: json,
      type: "tool_call",
    };
  });
}

interface InterruptProps {
  interrupt?: unknown;
  isLastMessage: boolean;
  hasNoAIOrToolMessages: boolean;
}

function Interrupt({
  interrupt,
  isLastMessage,
  hasNoAIOrToolMessages,
}: InterruptProps) {
  const fallbackValue = Array.isArray(interrupt)
    ? (interrupt as Record<string, any>[])
    : (((interrupt as { value?: unknown } | undefined)?.value ??
      interrupt) as Record<string, any>);

  return (
    <>
      {isAgentInboxInterruptSchema(interrupt) &&
        (isLastMessage || hasNoAIOrToolMessages) && (
          <ThreadView interrupt={interrupt} />
        )}
      {interrupt &&
        !isAgentInboxInterruptSchema(interrupt) &&
        (isLastMessage || hasNoAIOrToolMessages) ? (
        <GenericInterruptView interrupt={fallbackValue} />
      ) : null}
    </>
  );
}

export function AssistantMessage({
  message,
  allMessages,
  isLoading,
  handleRegenerate,
  apiUrl,
  threadId,
  onMessagesChanged,
}: {
  message: Message | undefined;
  allMessages: Message[];
  isLoading: boolean;
  /** Optional: called when the user clicks the regenerate button. */
  handleRegenerate?: () => void;
  apiUrl: string;
  threadId: string | null;
  onMessagesChanged: (optimistic: Message[]) => void;
}) {
  const content = message?.content ?? [];
  const contentString = getContentString(content);
  const [hideToolCalls] = useQueryState(
    "hideToolCalls",
    parseAsBoolean.withDefault(false),
  );

  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState("");

  const thread = useStreamContext();
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  const lastMessage = messages[messages.length - 1];
  const isLastMessage = lastMessage?.id === message?.id;
  const hasNoAIOrToolMessages = !messages.find(
    (m) => m.type === "ai" || m.type === "tool",
  );
  const threadInterrupt = thread.interrupt;

  const anthropicStreamedToolCalls = Array.isArray(content)
    ? parseAnthropicStreamedToolCalls(content)
    : undefined;

  const hasToolCalls =
    message &&
    "tool_calls" in message &&
    message.tool_calls &&
    message.tool_calls.length > 0;
  const toolCallsHaveContents =
    hasToolCalls &&
    message.tool_calls?.some(
      (tc) => tc.args && Object.keys(tc.args).length > 0,
    );
  const hasAnthropicToolCalls = !!anthropicStreamedToolCalls?.length;
  const isToolResult = message?.type === "tool";

  if (isToolResult && hideToolCalls) {
    return null;
  }

  const handleSetEditing = (editing: boolean) => {
    if (editing) setValue(contentString);
    setIsEditing(editing);
  };

  const handleSubmitEdit = async () => {
    if (!threadId || !message?.id) return;
    setIsEditing(false);
    const optimistic = allMessages.map((m) =>
      m.id === message.id ? { ...m, content: value } : m,
    );
    onMessagesChanged(optimistic);
    try {
      await editMessage(apiUrl, threadId, message.id, value, false);
    } catch (e) {
      console.error("Failed to edit message:", e);
      toast.error("Failed to save edit");
      onMessagesChanged(allMessages);
    }
  };

  const handleSubmitEditAndPlay = async () => {
    if (!threadId || !message?.id) return;
    setIsEditing(false);
    // Optimistic: replace content in-place (no truncation)
    const optimistic = allMessages.map((m) =>
      m.id === message.id ? { ...m, content: value } : m,
    );
    onMessagesChanged(optimistic);
    try {
      await editMessage(apiUrl, threadId, message.id, value, false);
    } catch (e) {
      console.error("Failed to edit message:", e);
      toast.error("Failed to save edit");
      onMessagesChanged(allMessages);
      return;
    }
    try {
      await sayText(apiUrl, value);
    } catch (e) {
      console.error("Failed to play audio:", e);
      toast.error("Failed to play audio");
    }
  };

  const handleDelete = async () => {
    if (!threadId || !message?.id) return;
    const optimistic = allMessages.filter((m) => m.id !== message.id);
    onMessagesChanged(optimistic);
    try {
      await deleteMessage(apiUrl, threadId, message.id, false);
    } catch (e) {
      console.error("Failed to delete message:", e);
      toast.error("Failed to delete message");
      onMessagesChanged(allMessages);
    }
  };

  return (
    <div className="group mr-auto flex w-full items-start gap-2">
      <div className="flex w-full flex-col gap-2">
        {isToolResult ? (
          <>
            <ToolResult message={message} />
            <Interrupt
              interrupt={threadInterrupt}
              isLastMessage={isLastMessage}
              hasNoAIOrToolMessages={hasNoAIOrToolMessages}
            />
            {/* Delete available for tool results */}
            {message && (
              <div
                className={cn(
                  "mr-auto flex items-center gap-2 transition-opacity",
                  "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
                )}
              >
                <CommandBar
                  content={contentString}
                  isLoading={isLoading}
                  isEditing={isEditing}
                  setIsEditing={handleSetEditing}
                  handleSubmitEdit={() => { void handleSubmitEdit(); }}
                  handleSubmitEditAndTruncate={() => { void handleSubmitEditAndPlay(); }}
                  editSecondaryIcon={<Volume2 />}
                  editSecondaryTooltip="Save edit and play audio"
                  editSecondaryRequiresConfirm={false}
                  handleDelete={() => { void handleDelete(); }}
                />
              </div>
            )}
          </>
        ) : (
          <>
            {isEditing ? (
              <div className="py-1">
                <EditableContent
                  value={value}
                  setValue={setValue}
                  onSubmit={() => { void handleSubmitEdit(); }}
                />
              </div>
            ) : (
              contentString.length > 0 && (
                <div className="py-1">
                  <MarkdownText>{contentString}</MarkdownText>
                </div>
              )
            )}

            {!hideToolCalls && (
              <>
                {(hasToolCalls && toolCallsHaveContents && (
                  <ToolCalls toolCalls={message.tool_calls} />
                )) ||
                  (hasAnthropicToolCalls && (
                    <ToolCalls toolCalls={anthropicStreamedToolCalls} />
                  )) ||
                  (hasToolCalls && (
                    <ToolCalls toolCalls={message.tool_calls} />
                  ))}
              </>
            )}

            {message && (
              <CustomComponent
                message={message}
                thread={thread}
              />
            )}
            <Interrupt
              interrupt={threadInterrupt}
              isLastMessage={isLastMessage}
              hasNoAIOrToolMessages={hasNoAIOrToolMessages}
            />
            {message && (
              <div
                className={cn(
                  "mr-auto flex items-center gap-2 transition-opacity",
                  "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
                  isEditing && "opacity-100",
                )}
              >
                <CommandBar
                  content={contentString}
                  isLoading={isLoading}
                  isEditing={isEditing}
                  setIsEditing={handleSetEditing}
                  handleSubmitEdit={() => { void handleSubmitEdit(); }}
                  handleSubmitEditAndTruncate={() => { void handleSubmitEditAndPlay(); }}
                  editSecondaryIcon={<Volume2 />}
                  editSecondaryTooltip="Save edit and play audio"
                  editSecondaryRequiresConfirm={false}
                  handleRegenerate={handleRegenerate}
                  handleDelete={() => { void handleDelete(); }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function AssistantMessageLoading() {
  return (
    <div className="mr-auto flex items-start gap-2">
      <div className="bg-muted flex h-8 items-center gap-1 rounded-2xl px-4 py-2">
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full"></div>
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_0.5s_infinite] rounded-full"></div>
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_1s_infinite] rounded-full"></div>
      </div>
    </div>
  );
}
