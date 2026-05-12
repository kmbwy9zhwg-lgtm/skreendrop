import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ChatMessage = {
  id: string;
  from: string;
  name: string;
  text: string;
  ts: number;
  self?: boolean;
};

type Props = {
  roomId: string;
  selfId: string;
  selfName: string;
  open: boolean;
  onClose: () => void;
  onUnread?: (n: number) => void;
};

export default function StreamChat({
  roomId,
  selfId,
  selfName,
  open,
  onClose,
  onUnread,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number | null>(null);
  const unreadRef = useRef(0);

  useEffect(() => {
    const ch = supabase.channel(`chat:${roomId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = ch;

    ch.on("broadcast", { event: "msg" }, ({ payload }) => {
      const m = payload as ChatMessage;
      setMessages((prev) => [...prev, m]);
    });

    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload.from === selfId) return;
      setTypingUser(payload.name as string);
      window.clearTimeout(typingTimerRef.current ?? undefined);
      typingTimerRef.current = window.setTimeout(
        () => setTypingUser(null),
        1500
      );
    });

    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, selfId]);

  useEffect(() => {
    if (open) {
      unreadRef.current = 0;
      onUnread?.(0);
    } else if (messages.length) {
      unreadRef.current += 1;
      onUnread?.(unreadRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      from: selfId,
      name: selfName,
      text: t.slice(0, 500),
      ts: Date.now(),
    };
    channelRef.current?.send({ type: "broadcast", event: "msg", payload: msg });
    setMessages((prev) => [...prev, { ...msg, self: true }]);
    setText("");
  };

  const onChange = (v: string) => {
    setText(v);
    channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { from: selfId, name: selfName },
    });
  };

  return (
    <aside
      className={`${
        open ? "translate-x-0" : "translate-x-full"
      } fixed lg:static top-0 right-0 z-40 h-full lg:h-auto lg:translate-x-0 w-full sm:w-80 lg:w-80 bg-neutral-950 lg:bg-neutral-900 border-l border-neutral-800 flex flex-col transition-transform duration-200 ${
        open ? "" : "lg:hidden"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div className="text-sm font-medium">Live chat</div>
        <button
          onClick={onClose}
          className="lg:hidden text-neutral-400 hover:text-white text-sm"
          aria-label="Close chat"
        >
          ✕
        </button>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-neutral-500 text-center mt-4">
            No messages yet. Say hi 👋
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm break-words ${
                m.self
                  ? "ml-auto bg-white text-black"
                  : "bg-neutral-800 text-neutral-100"
              }`}
            >
              {!m.self && (
                <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-0.5">
                  {m.name}
                </div>
              )}
              <div>{m.text}</div>
            </div>
          ))
        )}
      </div>
      <div className="px-3 h-5 text-xs text-neutral-500">
        {typingUser ? `${typingUser} is typing…` : ""}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="p-3 border-t border-neutral-800 flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Message…"
          maxLength={500}
          className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          className="px-3 rounded-lg bg-white text-black text-sm font-medium hover:bg-neutral-200"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
