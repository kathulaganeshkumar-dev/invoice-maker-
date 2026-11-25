// src/server/events.ts - Real-Time Server-Sent Events Broadcaster for Multi-PC LAN & Tailscale
import { EventEmitter } from 'events';

export const serverEvents = new EventEmitter();
export const NOTIFY_DATA_CHANGE = 'notify_data_change';

export interface DataChangeEvent {
  entity: string;
  action: string;
  timestamp: number;
  data?: any;
}

export function broadcastDataChange(entity: string, action = 'update', data?: any) {
  const event: DataChangeEvent = {
    entity,
    action,
    timestamp: Date.now(),
    data,
  };
  serverEvents.emit(NOTIFY_DATA_CHANGE, event);
}
