import { Send } from "lucide-react";
import { Button, FormField, Textarea } from "./AdminPrimitives";
import { EmptyState } from "./WorkspaceComponents";

// Presentation only: callers own thread loading, ordering, read state and sending.
export function ConversationThread({ title, subtitle, messages = [] }) {
  return (
    <section className="ew-conversation" aria-label="Conversation">
      <header className="ew-conversation-heading">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <div
        className="ew-message-log"
        role="log"
        aria-label="Conversation history"
        aria-live="polite"
        tabIndex={0}
      >
        {messages.length === 0 ? (
          <EmptyState
            title="No messages yet"
            description="Start the conversation by sending a message."
          />
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={`ew-message ${message.own ? "ew-message-own" : ""}`}
            >
              <div className="ew-message-meta">
                <strong>{message.sender}</strong>
                <time dateTime={message.createdAt}>{message.when}</time>
              </div>
              <p>{message.body}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
export function MessageComposer({
  value,
  onChange,
  onSend,
  disabled,
  sending,
  maxLength = 2000,
}) {
  return (
    <div className="ew-message-composer">
      <FormField
        label="Message"
        help={`${value.trim().length}/${maxLength} characters`}
      >
        <Textarea
          rows={4}
          placeholder="Type your message..."
          value={value}
          onChange={onChange}
          maxLength={maxLength}
        />
      </FormField>
      <div className="flex justify-end">
        <Button type="button" onClick={onSend} disabled={disabled}>
          <Send size={16} aria-hidden="true" />
          {sending ? "Sending..." : "Send message"}
        </Button>
      </div>
    </div>
  );
}
