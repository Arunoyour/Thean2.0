import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { getDeliveryChat, getDeliveryToken, sendDeliveryChat } from "../lib/api.js";

export function ChatPage() {
  const { deliveryOrderId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    loadMessages();
  }, [deliveryOrderId]);

  // WebSocket for real-time chat
  useEffect(() => {
    const token = getDeliveryToken();
    if (!token) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host.replace("5176", "8000")}/api/v1/ws/delivery?token=${encodeURIComponent(token)}`,
    );
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "chat_message" && msg.delivery_order_id === deliveryOrderId) {
        setMessages((prev) => {
          const exists = prev.some((m) => m.message_id === msg.message_id);
          return exists ? prev : [...prev, msg];
        });
      }
    };
    return () => socket.close();
  }, [deliveryOrderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMessages() {
    try {
      const msgs = await getDeliveryChat(deliveryOrderId);
      setMessages(msgs);
    } catch (e) { setError(e.message); }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setIsSending(true);
    try {
      const msg = await sendDeliveryChat(deliveryOrderId, text.trim());
      setMessages((prev) => {
        const exists = prev.some((m) => m.message_id === msg.message_id);
        return exists ? prev : [...prev, msg];
      });
      setText("");
    } catch (err) { setError(err.message); } finally { setIsSending(false); }
  }

  return (
    <div className="dl-page dl-chat-page">
      <header className="dl-inner-header">
        <button type="button" className="dl-back-btn" onClick={() => navigate(-1)}><ArrowLeft size={20} /></button>
        <h1>Customer Chat</h1>
      </header>

      {error ? <div className="dl-error">{error}</div> : null}

      <div className="dl-chat-messages">
        {messages.length === 0 ? (
          <div className="dl-chat-empty">No messages yet. Start a conversation!</div>
        ) : null}
        {messages.map((msg) => (
          <div
            key={msg.message_id}
            className={`dl-chat-bubble ${msg.sender_type === "delivery" ? "dl-bubble-me" : "dl-bubble-them"}`}
          >
            <p>{msg.message_text}</p>
            <time>{new Date(msg.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="dl-chat-input" onSubmit={handleSend}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          disabled={isSending}
        />
        <button type="submit" disabled={isSending || !text.trim()} className="dl-send-btn">
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}
