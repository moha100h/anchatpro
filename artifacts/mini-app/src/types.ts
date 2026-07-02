export type CallType     = "voice" | "video";
export type GenderFilter = "male" | "female" | "random";

export interface Config {
  callEnabled:         boolean;
  videoEnabled:        boolean;
  costs: {
    voiceRandom: number;
    voiceGender: number;
    videoRandom: number;
    videoGender: number;
  };
  minBalance:          number;
  maxDurationMinutes:  number;
  turnConfig: {
    host:       string;
    port:       number;
    username:   string;
    credential: string;
  };
}

export interface IceServer {
  urls:        string | string[];
  username?:   string;
  credential?: string;
}

export type Screen = "home" | "queue" | "call" | "ended";

export type WsInMessage =
  | { type: "auth_ok" }
  | { type: "error";         code: string; required?: number; balance?: number }
  | { type: "queued";        position: number }
  | { type: "left_queue" }
  | { type: "matched";       roomToken: string; callType: CallType; iceServers: IceServer[]; coinsDeducted: number; balance: number; isReceiver?: boolean }
  | { type: "partner_ready" }
  | { type: "partner_left" }
  | { type: "call_ended" }
  | { type: "force_end";     reason: string }
  | { type: "offer";         sdp: string }
  | { type: "answer";        sdp: string }
  | { type: "ice_candidate"; candidate: RTCIceCandidateInit }
  | { type: "heartbeat_ack" };
