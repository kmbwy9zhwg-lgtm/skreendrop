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
  kind?: "text" | "image" | "audio" | "file";
  url?: string;
  mimeType?: string;
  replyTo?: string; // ID of message being replied to
  replyText?: string; // Preview text of replied message
  replyName?: string; // Name of person who sent the replied message
  taggedUsers?: string[]; // Array of user names that were tagged
  tagColor?: "red" | "yellow" | "green" | "blue";
};

type Props = {
  roomId: string;
  selfId: string;
  selfName: string;
  open: boolean;
  onClose: () => void;
  onUnread?: (n: number) => void;
  canTag?: boolean;
  participants?: string[];
};

export default function StreamChat({
  roomId,
  selfId,
  selfName,
  open,
  onClose,
  onUnread,
  canTag = false,
  participants = [],
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [tagColor, setTagColor] = useState<"none" | "red" | "yellow" | "green" | "blue">("none");
  const [filterTag, setFilterTag] = useState<"all" | "red" | "yellow" | "green" | "blue">("all");
  const [notification, setNotification] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [selectedTagMessageId, setSelectedTagMessageId] = useState<string | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const filteredMessages =
    filterTag === "all"
      ? messages
      : messages.filter((m) => m.tagColor === filterTag);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const unreadRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const tagColorClasses: Record<Exclude<ChatMessage["tagColor"], undefined>, string> = {
    red: "bg-red-500/15 text-red-300 border border-red-500/30",
    yellow: "bg-yellow-400/15 text-yellow-300 border border-yellow-400/30",
    green: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    blue: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
  };

  useEffect(() => {
    const ch = supabase.channel(`chat:${roomId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = ch;

    ch.on("broadcast", { event: "msg" }, ({ payload }) => {
      const m = payload as ChatMessage;
      setMessages((prev) => [...prev, m]);

      // Check if user was tagged
      if (m.taggedUsers && m.taggedUsers.some(tag => tag.toLowerCase() === selfName.toLowerCase())) {
        setNotification(`You were tagged by ${m.name}`);
        setTimeout(() => setNotification(null), 3000);
      }
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

    ch.on("broadcast", { event: "tag-message" }, ({ payload }) => {
      const { messageId, tagColor: color } = payload as {
        messageId: string;
        tagColor: "red" | "yellow" | "green" | "blue";
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, tagColor: color } : m))
      );
      setPinnedMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, tagColor: color } : m))
      );
    });

    ch.on("broadcast", { event: "pin" }, ({ payload }) => {
      const message = payload as ChatMessage;
      setPinnedMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [message, ...prev];
      });
    });

    ch.on("broadcast", { event: "unpin" }, ({ payload }) => {
      const message = payload as ChatMessage;
      setPinnedMessages((prev) => prev.filter((m) => m.id !== message.id));
    });

    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, selfId, selfName]);

  const scrollToMessage = (id: string) => {
    const el = messageRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(id);
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMessageId(null);
    }, 2200);
  };

  useEffect(() => {
    if (!open || messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    const lastEl = lastMessage ? messageRefs.current[lastMessage.id] : null;
    if (lastEl) {
      lastEl.scrollIntoView({ behavior: "smooth", block: "end" });
    } else if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

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

  const send = () => {
    const t = text.trim();
    if (!t) return;

    // Parse tagged users (@username)
    const taggedUsers: string[] = [];
    const mentionRegex = /@(\w+)/g;
    let match;
    while ((match = mentionRegex.exec(t)) !== null) {
      taggedUsers.push(match[1]);
    }

    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      from: selfId,
      name: selfName,
      text: t.slice(0, 500),
      ts: Date.now(),
      replyTo: replyTo?.id,
      replyText: replyTo?.text,
      replyName: replyTo?.name,
      taggedUsers: taggedUsers.length > 0 ? taggedUsers : undefined,
      tagColor: canTag && tagColor !== "none" ? tagColor : undefined,
    };
    channelRef.current?.send({ type: "broadcast", event: "msg", payload: msg });
    setMessages((prev) => [...prev, { ...msg, self: true }]);
    setText("");
    setReplyTo(null);
    setTagColor("none");
  };

  const applyTagToMessage = (
    messageId: string,
    color: "red" | "yellow" | "green" | "blue"
  ) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "tag-message",
      payload: { messageId, tagColor: color },
    });
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, tagColor: color } : m))
    );
    setSelectedTagMessageId(null);
  };

  const togglePin = (message: ChatMessage) => {
    const isAlreadyPinned = pinnedMessages.some((m) => m.id === message.id);
    
    if (isAlreadyPinned) {
      channelRef.current?.send({
        type: "broadcast",
        event: "unpin",
        payload: message,
      });
      setPinnedMessages((prev) => prev.filter((m) => m.id !== message.id));
      return;
    }

    const userPins = pinnedMessages.filter((m) => m.from === message.from);
    if (userPins.length >= 2) {
      setNotification(`${message.name} already has 2 pinned messages`);
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    if (pinnedMessages.length >= 4) {
      setNotification("Maximum 4 pinned messages reached");
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    channelRef.current?.send({
      type: "broadcast",
      event: "pin",
      payload: message,
    });
    setPinnedMessages((prev) => [message, ...prev]);
  };

  const sendFile = async (file: File) => {
    let kind: "text" | "image" | "audio" | "file" = "file";
    if (file.type.startsWith("image/")) {
      kind = "image";
    } else if (file.type.startsWith("audio/")) {
      kind = "audio";
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      from: selfId,
      name: selfName,
      text: file.name,
      ts: Date.now(),
      kind,
      url: dataUrl,
      mimeType: file.type,
      replyTo: replyTo?.id,
      replyText: replyTo?.text,
      replyName: replyTo?.name,
      tagColor: canTag && tagColor !== "none" ? tagColor : undefined,
    };
    channelRef.current?.send({ type: "broadcast", event: "msg", payload: msg });
    setMessages((prev) => [...prev, { ...msg, self: true }]);
    fileInputRef.current && (fileInputRef.current.value = "");
    setReplyTo(null);
    setTagColor("none");
  };

  const onChange = (v: string) => {
    setText(v);
    channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { from: selfId, name: selfName },
    });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        sendAudioMessage(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudioMessage = async (audioBlob: Blob) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });

    const msg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      from: selfId,
      name: selfName,
      text: "Voice message",
      ts: Date.now(),
      kind: "audio",
      url: dataUrl,
      mimeType: audioBlob.type,
      replyTo: replyTo?.id,
      replyText: replyTo?.text,
      replyName: replyTo?.name,
      tagColor: canTag && tagColor !== "none" ? tagColor : undefined,
    };
    channelRef.current?.send({ type: "broadcast", event: "msg", payload: msg });
    setMessages((prev) => [...prev, { ...msg, self: true }]);
    setReplyTo(null);
    setTagColor("none");
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`${
          open ? "translate-x-0" : "translate-x-full"
        } fixed top-0 right-0 z-40 h-full w-full sm:w-80 bg-neutral-950 border-l border-neutral-800 flex flex-col transition-transform duration-200 overflow-hidden`}
      >
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 flex-shrink-0">
        <div className="text-sm font-medium">Live chat</div>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-white text-sm font-semibold px-2 py-1 rounded-lg hover:bg-neutral-800 transition"
          aria-label="Close chat"
        >
          ✕ Collapse
        </button>
      </div>
      {notification && (
        <div className="mx-3 mt-3 px-3 py-2 bg-blue-500 text-white text-sm rounded-lg animate-pulse flex-shrink-0">
          {notification}
        </div>
      )}
      <div className="px-3 py-2 border-b border-neutral-800 flex-shrink-0">
        <div className="flex flex-wrap gap-2 text-xs text-neutral-400">
          <span>Filter:</span>
          {(["all", "red", "yellow", "green", "blue"] as const).map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setFilterTag(color)}
              className={`rounded-full px-2 py-1 transition ${
                filterTag === color
                  ? "bg-white text-black"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              {color === "all" ? "All" : color}
            </button>
          ))}
        </div>
      </div>
      {pinnedMessages.length > 0 && (
        <div className="px-3 py-3 border-b border-neutral-800 space-y-2 flex-shrink-0 overflow-y-auto max-h-32">
          <div className="text-xs uppercase tracking-wide text-neutral-400">
            Pinned
          </div>
          {pinnedMessages.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => scrollToMessage(m.id)}
              className="w-full text-left rounded-2xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
            >
              <div className="font-semibold text-neutral-100">{m.name}</div>
              <div className="truncate text-neutral-400">{m.text}</div>
            </button>
          ))}
        </div>
      )}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 overscroll-behavior-contain">
        {filteredMessages.length === 0 ? (
          <p className="text-xs text-neutral-500 text-center mt-4">
            No messages yet. Say hi 👋
          </p>
        ) : (
          filteredMessages.map((m) => (
            <div
              key={m.id}
              ref={(el) => {
                messageRefs.current[m.id] = el;
              }}
              onClick={(e) => {
                if (!canTag) return;
                const target = e.target as HTMLElement;
                if (target.closest("button")) return;
                setSelectedTagMessageId(m.id);
              }}
              className={`group max-w-[85%] rounded-2xl px-3 py-1.5 text-sm break-words border ${
                m.self
                  ? "ml-auto bg-white text-black border-white/10"
                  : "bg-neutral-800 text-neutral-100 border-neutral-800"
              } ${
                highlightedMessageId === m.id ? "ring-2 ring-amber-400 bg-amber-400/10" : ""
              } ${
                selectedTagMessageId === m.id ? "ring-2 ring-sky-400 bg-sky-500/10" : ""
              } ${canTag ? "cursor-pointer" : ""}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                    {m.name}
                  </div>
                  {m.tagColor && (
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${tagColorClasses[m.tagColor as "red" | "yellow" | "green" | "blue"]}`}>
                      {m.tagColor}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setReplyTo(m)}
                    className="text-[10px] text-neutral-400 hover:text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Reply"
                  >
                    ↩️
                  </button>
                  <button
                    onClick={() => togglePin(m)}
                    className="text-[10px] text-neutral-400 hover:text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={pinnedMessages.some((p) => p.id === m.id) ? "Unpin" : "Pin"}
                  >
                    {pinnedMessages.some((p) => p.id === m.id) ? "📌" : "📍"}
                  </button>
                </div>
              </div>
              {m.replyTo && m.replyText && (
                <div
                  onClick={() => m.replyTo && scrollToMessage(m.replyTo)}
                  className={`mb-2 p-2 rounded text-xs cursor-pointer ${
                    m.self ? "bg-black/20" : "bg-neutral-700 hover:bg-neutral-600"
                  }`}
                >
                  <div className="text-neutral-400">Replying to {m.replyName}:</div>
                  <div className="truncate">{m.replyText}</div>
                </div>
              )}
              <div className={m.taggedUsers ? "font-semibold" : ""}>{m.text}</div>
              {m.kind === "image" && m.url && (
                <img
                  src={m.url}
                  alt={m.text}
                  className="mt-2 max-h-48 w-full rounded-xl object-contain"
                />
              )}
              {m.kind === "audio" && m.url && (
                <audio
                  controls
                  src={m.url}
                  className="mt-2 w-full"
                />
              )}
              {m.kind === "file" && m.url && (
                <a
                  href={m.url}
                  download={m.text}
                  className="mt-2 block px-3 py-2 bg-blue-600 text-white text-xs rounded-lg text-center hover:bg-blue-700 truncate"
                  title={m.text}
                >
                  📥 Download: {m.text}
                </a>
              )}
            </div>
          ))
        )}
      </div>
      <div className="px-3 h-5 text-xs text-neutral-500 flex-shrink-0">
        {typingUser ? `${typingUser} is typing…` : ""}
      </div>
      {participants.length > 0 && (
        <div className="px-3 py-2 bg-neutral-900 border-t border-neutral-700 text-xs text-neutral-300 flex-shrink-0 overflow-y-auto max-h-20">
          <div className="mb-1 text-neutral-400">Tag people:</div>
          <div className="flex flex-wrap gap-2">
            {Array.from(new Set(participants)).map((participant) => (
              <button
                key={participant}
                type="button"
                onClick={() => {
                  const mention = `@${participant}`;
                  if (text.includes(mention)) return;
                  setText((current) => `${current}${current.endsWith(" ") || current === "" ? "" : " "}${mention} `);
                }}
                className="rounded-full border border-neutral-700 px-2 py-1 text-[11px] text-neutral-200 hover:border-white hover:text-white"
              >
                {participant}
              </button>
            ))}
          </div>
        </div>
      )}
      {canTag && selectedTagMessageId && (
        <div className="px-3 py-2 bg-neutral-900 border-t border-neutral-700 flex-shrink-0">
          <div className="mb-2 text-xs text-neutral-400">Tag selected message:</div>
          <div className="flex gap-1">
            {(["red", "yellow", "green", "blue"] as const).map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => applyTagToMessage(selectedTagMessageId, color)}
                className={`h-8 w-8 rounded-full border ${
                  color === "red"
                    ? "bg-red-500"
                    : color === "yellow"
                    ? "bg-yellow-400"
                    : color === "green"
                    ? "bg-emerald-500"
                    : "bg-sky-500"
                } ${selectedTagMessageId ? "border-white" : "border-neutral-700"}`}
                aria-label={`Tag ${color}`}
              />
            ))}
            <button
              type="button"
              onClick={() => setSelectedTagMessageId(null)}
              className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-100 hover:bg-neutral-800"
            >
              Clear
            </button>
          </div>
        </div>
      )}
      {replyTo && (
        <div className="px-3 py-2 bg-neutral-800 border-t border-neutral-700 flex-shrink-0">
          <div className="flex items-center justify-between text-xs">
            <div>
              <span className="text-neutral-400">Replying to </span>
              <span className="text-neutral-200">{replyTo.name}</span>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="text-neutral-400 hover:text-neutral-200"
            >
              ✕
            </button>
          </div>
          <div className="text-neutral-300 truncate mt-1">{replyTo.text}</div>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="p-3 border-t border-neutral-800 flex flex-col gap-2 flex-shrink-0"
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                sendFile(file);
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 hover:bg-neutral-700"
          >
            📎
          </button>
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            className={`px-3 rounded-lg text-sm ${
              isRecording
                ? "bg-red-500 text-white animate-pulse"
                : "bg-neutral-800 border border-neutral-700 text-neutral-100 hover:bg-neutral-700"
            }`}
            title={isRecording ? "Stop recording" : "Record voice message"}
          >
            🎤
          </button>
          <button
            type="button"
            onClick={async () => {
              const video = document.querySelector("video");
              if (video && video.videoWidth && video.videoHeight) {
                const canvas = document.createElement("canvas");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(async (blob) => {
                  if (!blob) return;
                  const fileName = `screenshot-${Date.now()}.png`;
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = fileName;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);

                  if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
                    try {
                      await navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob }),
                      ]);
                    } catch (error) {
                      console.warn("Clipboard image copy failed", error);
                    }
                  }
                });
              }
            }}
            className="px-3 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 hover:bg-neutral-700"
            title="Save screenshot and copy to clipboard"
          >
            📸
          </button>
          {canTag && replyTo && (
            <div className="flex items-center gap-1">
              {["red", "yellow", "green", "blue"].map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setTagColor(color as "red" | "yellow" | "green" | "blue")}
                  className={`h-8 w-8 rounded-full border ${
                    tagColor === color
                      ? "border-white"
                      : "border-neutral-700"
                  } ${
                    color === "red"
                      ? "bg-red-500"
                      : color === "yellow"
                      ? "bg-yellow-400"
                      : color === "green"
                      ? "bg-emerald-500"
                      : "bg-sky-500"
                  }`}
                  aria-label={`Tag ${color}`}
                />
              ))}
              <button
                type="button"
                onClick={() => setTagColor("none")}
                className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-100 hover:bg-neutral-800"
              >
                Clear tag
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Message… (use @name to tag)"
            maxLength={500}
            className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          <button
            type="submit"
            className="px-3 rounded-lg bg-white text-black text-sm font-medium hover:bg-neutral-200"
          >
            Send
          </button>
        </div>
      </form>
    </aside>
    </>
  );
}
