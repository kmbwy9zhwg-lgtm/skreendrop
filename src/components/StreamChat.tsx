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
  const [isRecording, setIsRecording] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const unreadRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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

    // Parse tagged users (@username)
    const taggedUsers = [];
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
    };
    channelRef.current?.send({ type: "broadcast", event: "msg", payload: msg });
    setMessages((prev) => [...prev, { ...msg, self: true }]);
    setText("");
    setReplyTo(null);
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
    };
    channelRef.current?.send({ type: "broadcast", event: "msg", payload: msg });
    setMessages((prev) => [...prev, { ...msg, self: true }]);
    fileInputRef.current && (fileInputRef.current.value = "");
    setReplyTo(null);
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
    };
    channelRef.current?.send({ type: "broadcast", event: "msg", payload: msg });
    setMessages((prev) => [...prev, { ...msg, self: true }]);
    setReplyTo(null);
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
      {notification && (
        <div className="mx-3 mt-3 px-3 py-2 bg-blue-500 text-white text-sm rounded-lg animate-pulse">
          {notification}
        </div>
      )}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-xs text-neutral-500 text-center mt-4">
            No messages yet. Say hi 👋
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`group max-w-[85%] rounded-2xl px-3 py-1.5 text-sm break-words ${
                m.self
                  ? "ml-auto bg-white text-black"
                  : "bg-neutral-800 text-neutral-100"
              }`}
            >
              {!m.self && (
                <div className="flex items-center justify-between mb-0.5">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                    {m.name}
                  </div>
                  <button
                    onClick={() => setReplyTo(m)}
                    className="text-[10px] text-neutral-400 hover:text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Reply"
                  >
                    ↩️
                  </button>
                </div>
              )}
              {m.replyTo && m.replyText && (
                <div className={`mb-2 p-2 rounded text-xs ${
                  m.self ? "bg-black/20" : "bg-neutral-700"
                }`}>
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
      <div className="px-3 h-5 text-xs text-neutral-500">
        {typingUser ? `${typingUser} is typing…` : ""}
      </div>
      {replyTo && (
        <div className="px-3 py-2 bg-neutral-800 border-t border-neutral-700">
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
        className="p-3 border-t border-neutral-800 flex gap-2"
      >
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
        <input
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Message… (use @name to tag)"
          maxLength={500}
          className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          type="button"
          onClick={() => {
            // Screenshot functionality for viewers
            const video = document.querySelector('video');
            if (video) {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(video, 0, 0);
              canvas.toBlob((blob) => {
                if (blob) {
                  const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
                  sendFile(file);
                }
              });
            }
          }}
          className="px-3 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 hover:bg-neutral-700"
          title="Take screenshot"
        >
          📸
        </button>
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
