import {
  io,
  type Socket,
} from "socket.io-client";

export interface MessagingReadyPayload {
  accountId: string;
  sessionId: string;
  connectedAt: string;
}

export interface MessagingSocketErrorPayload {
  message: string;
}

export interface MessagingPongPayload {
  serverTime: string;
}

interface ServerToClientEvents {
  "messaging:ready": (payload: MessagingReadyPayload) => void;
  "messaging:error": (payload: MessagingSocketErrorPayload) => void;
  "messaging:pong": (payload: MessagingPongPayload) => void;
}

interface ClientToServerEvents {
  "messaging:ping": () => void;
}

export type MessagingSocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  "http://localhost:4000";

export function createMessagingSocket(
  accessToken: string,
): MessagingSocket {
  return io(`${SOCKET_URL}/messaging`, {
    autoConnect: false,
    auth: {
      accessToken,
    },
    transports: ["websocket", "polling"],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
}
