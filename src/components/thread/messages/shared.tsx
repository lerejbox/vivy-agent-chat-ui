import {
  XIcon,
  SendHorizontal,
  RefreshCcw,
  Pencil,
  Copy,
  CopyCheck,
  ArrowDown,
  Trash2,
  Check,
  Volume2,
} from "lucide-react";
export { ArrowDown, Volume2 };
import { TooltipIconButton } from "../tooltip-icon-button";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

// ---------------------------------------------------------------------------
// EditableContent – shared between HumanMessage and AssistantMessage
// ---------------------------------------------------------------------------

export function EditableContent({
  value,
  setValue,
  onSubmit,
}: {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  onSubmit: () => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <Textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      className="focus-visible:ring-0"
    />
  );
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function ContentCopyable({
  content,
  disabled,
}: {
  content: string;
  disabled: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TooltipIconButton
      onClick={(e) => handleCopy(e)}
      variant="ghost"
      tooltip="Copy content"
      disabled={disabled}
    >
      <AnimatePresence
        mode="wait"
        initial={false}
      >
        {copied ? (
          <motion.div
            key="check"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <CopyCheck className="text-green-500" />
          </motion.div>
        ) : (
          <motion.div
            key="copy"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <Copy />
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipIconButton>
  );
}

// ---------------------------------------------------------------------------
// CommandBar
// ---------------------------------------------------------------------------

/**
 * Action bar rendered below each message bubble (human or AI).
 *
 * States:
 *  · idle        – Copy | Refresh (AI) | Edit | Delete
 *  · editing     – Cancel | Save-edit | Save-edit+truncate
 *  · truncateConfirm – Cancel | Confirm (while textarea still visible)
 *  · deleteConfirm   – Cancel | Confirm
 */
export function CommandBar({
  content,
  isEditing,
  setIsEditing,
  handleSubmitEdit,
  handleSubmitEditAndTruncate,
  editSecondaryIcon,
  editSecondaryTooltip,
  editSecondaryRequiresConfirm = true,
  handleRegenerate,
  handleDelete,
  isLoading,
}: {
  content: string;
  isEditing: boolean;
  /** Called with true when edit starts, false when it ends. */
  setIsEditing: (editing: boolean) => void;
  handleSubmitEdit: () => void;
  handleSubmitEditAndTruncate: () => void;
  /** Icon for the secondary edit-submit button. Defaults to ArrowDown. */
  editSecondaryIcon?: React.ReactNode;
  /** Tooltip for the secondary edit-submit button. */
  editSecondaryTooltip?: string;
  /**
   * Whether the secondary edit-submit button requires a confirmation step.
   * Defaults to true (safe for destructive actions like truncate).
   * Set to false for non-destructive actions like "play audio".
   */
  editSecondaryRequiresConfirm?: boolean;
  /** When set, a Refresh button is shown (AI messages only). */
  handleRegenerate?: () => void;
  handleDelete: () => void;
  isLoading: boolean;
}) {
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [truncateConfirming, setTruncateConfirming] = useState(false);

  const resolvedSecondaryIcon = editSecondaryIcon ?? <ArrowDown />;
  const resolvedSecondaryTooltip =
    editSecondaryTooltip ?? "Save edit and delete all subsequent messages";

  const handleCancelEdit = () => {
    setIsEditing(false);
    setTruncateConfirming(false);
  };

  // ------------------------------------------------------------------
  // Editing mode
  // ------------------------------------------------------------------
  if (isEditing) {
    if (truncateConfirming) {
      // Second step: confirm "save edit AND delete subsequent"
      return (
        <div className="flex items-center gap-2">
          <TooltipIconButton
            disabled={isLoading}
            tooltip="Cancel"
            variant="ghost"
            onClick={() => setTruncateConfirming(false)}
          >
            <XIcon />
          </TooltipIconButton>
          <TooltipIconButton
            disabled={isLoading}
            tooltip={`Confirm: ${resolvedSecondaryTooltip.toLowerCase()}`}
            variant="secondary"
            onClick={() => {
              setTruncateConfirming(false);
              handleSubmitEditAndTruncate();
            }}
          >
            <Check />
          </TooltipIconButton>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <TooltipIconButton
          disabled={isLoading}
          tooltip="Cancel edit"
          variant="ghost"
          onClick={handleCancelEdit}
        >
          <XIcon />
        </TooltipIconButton>
        <TooltipIconButton
          disabled={isLoading}
          tooltip="Save edit"
          variant="secondary"
          onClick={handleSubmitEdit}
        >
          <SendHorizontal />
        </TooltipIconButton>
        <TooltipIconButton
          disabled={isLoading}
          tooltip={resolvedSecondaryTooltip}
          variant="ghost"
          onClick={() => {
            if (editSecondaryRequiresConfirm) {
              setTruncateConfirming(true);
            } else {
              handleSubmitEditAndTruncate();
            }
          }}
        >
          {resolvedSecondaryIcon}
        </TooltipIconButton>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Delete confirmation
  // ------------------------------------------------------------------
  if (deleteConfirming) {
    return (
      <div className="flex items-center gap-2">
        <TooltipIconButton
          disabled={isLoading}
          tooltip="Cancel delete"
          variant="ghost"
          onClick={() => setDeleteConfirming(false)}
        >
          <XIcon />
        </TooltipIconButton>
        <TooltipIconButton
          disabled={isLoading}
          tooltip="Confirm delete"
          variant="ghost"
          className="text-red-500 hover:text-red-600"
          onClick={() => {
            setDeleteConfirming(false);
            handleDelete();
          }}
        >
          <Check />
        </TooltipIconButton>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Idle state
  // ------------------------------------------------------------------
  return (
    <div className="flex items-center gap-2">
      <ContentCopyable
        content={content}
        disabled={isLoading}
      />
      {!!handleRegenerate && (
        <TooltipIconButton
          disabled={isLoading}
          tooltip="Regenerate response"
          variant="ghost"
          onClick={handleRegenerate}
        >
          <RefreshCcw />
        </TooltipIconButton>
      )}
      <TooltipIconButton
        disabled={isLoading}
        tooltip="Edit"
        variant="ghost"
        onClick={() => setIsEditing(true)}
      >
        <Pencil />
      </TooltipIconButton>
      <TooltipIconButton
        disabled={isLoading}
        tooltip="Delete message"
        variant="ghost"
        onClick={() => setDeleteConfirming(true)}
      >
        <Trash2 />
      </TooltipIconButton>
    </div>
  );
}
