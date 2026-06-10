import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import { runtimeConfig } from '../config.js';
import {
  failTelephonyMediaStream,
  finalizeTelephonyMediaStream,
  noteTelephonyMediaFrame,
  startTelephonyMediaStream,
} from './service.js';

interface TelephonyStreamState {
  voiceSessionId?: string;
  streamSid?: string;
  providerCallId?: string;
  payloads: string[];
  receivedFrames: number;
}

function acceptKey(key: string) {
  return createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
}

function sendFrame(socket: any, text: string) {
  const payload = Buffer.from(text);
  const length = payload.length;
  let header: Buffer;

  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  socket.write(Buffer.concat([header, payload]));
}

function sendJson(socket: any, data: unknown) {
  if (!socket.destroyed) sendFrame(socket, JSON.stringify(data));
}

function closeSocket(socket: any, code = 1000) {
  const closeFrame = Buffer.alloc(4);
  closeFrame[0] = 0x88;
  closeFrame[1] = 2;
  closeFrame.writeUInt16BE(code, 2);
  socket.write(closeFrame);
  socket.end();
}

function parseFrames(buffer: Buffer, onText: (text: string) => void, onClose: () => void) {
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break;
      const bigLength = buffer.readBigUInt64BE(offset + 2);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('WebSocket frame too large');
      length = Number(bigLength);
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (offset + frameLength > buffer.length) break;

    let payload = buffer.subarray(offset + headerLength + maskLength, offset + frameLength);
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }

    if (opcode === 0x8) onClose();
    if (opcode === 0x1) onText(payload.toString('utf8'));
    offset += frameLength;
  }

  return buffer.subarray(offset);
}

function voiceSessionIdFromRequest(req: IncomingMessage) {
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  return url.searchParams.get('voiceSessionId') || undefined;
}

async function handleTelephonyEvent(socket: any, state: TelephonyStreamState, raw: string) {
  const message = JSON.parse(raw) as Record<string, any>;
  const event = String(message.event || '');

  if (event === 'connected') {
    sendJson(socket, { event: 'connected', service: 'elora-agent-runtime' });
    return;
  }

  if (event === 'start') {
    state.streamSid = message.streamSid || message.start?.streamSid || state.streamSid;
    state.providerCallId = message.start?.callSid || message.start?.call_sid || state.providerCallId;
    state.voiceSessionId =
      message.start?.customParameters?.voiceSessionId ||
      message.start?.custom_parameters?.voiceSessionId ||
      message.start?.customParameters?.voice_session_id ||
      state.voiceSessionId;

    if (!state.voiceSessionId) throw new Error('voiceSessionId is required before media frames can be accepted');
    await startTelephonyMediaStream({
      voiceSessionId: state.voiceSessionId,
      streamSid: state.streamSid,
      providerCallId: state.providerCallId,
    });
    sendJson(socket, { event: 'start_ack', voiceSessionId: state.voiceSessionId, streamSid: state.streamSid });
    return;
  }

  if (event === 'media') {
    if (!state.voiceSessionId) throw new Error('media received before voiceSessionId was established');
    const payload = String(message.media?.payload || '');
    if (!payload) return;
    state.payloads.push(payload);
    state.receivedFrames += 1;
    if (state.receivedFrames % 50 === 0) {
      const mediaStream = await noteTelephonyMediaFrame({
        voiceSessionId: state.voiceSessionId,
        payload,
        sequenceNumber: message.sequenceNumber || message.sequence_number,
      });
      sendJson(socket, { event: 'media_ack', receivedFrames: mediaStream.receivedFrames, receivedBytes: mediaStream.receivedBytes });
    }
    return;
  }

  if (event === 'stop') {
    if (!state.voiceSessionId) throw new Error('stop received before voiceSessionId was established');
    const result = await finalizeTelephonyMediaStream({
      voiceSessionId: state.voiceSessionId,
      payloads: state.payloads,
      streamSid: state.streamSid || message.streamSid || message.stop?.streamSid,
    });
    sendJson(socket, { event: 'completed', result });
    closeSocket(socket);
    return;
  }

  sendJson(socket, { event: 'ignored', type: event || 'unknown' });
}

export function attachTelephonyMediaStream(server: Server) {
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== runtimeConfig.telephonyStreamPath) return;

    const key = req.headers['sec-websocket-key'];
    if (!key || Array.isArray(key)) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey(key)}`,
        '',
        '',
      ].join('\r\n'),
    );

    if (head.length) socket.unshift(head);

    const state: TelephonyStreamState = {
      voiceSessionId: voiceSessionIdFromRequest(req),
      payloads: [],
      receivedFrames: 0,
    };
    let frameBuffer: Buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      try {
        frameBuffer = parseFrames(
          Buffer.concat([frameBuffer, chunk as Buffer]),
          (text) => {
            void handleTelephonyEvent(socket, state, text).catch(async (error) => {
              sendJson(socket, { event: 'error', message: error instanceof Error ? error.message : 'Unknown telephony stream error' });
              if (state.voiceSessionId) {
                await failTelephonyMediaStream({ voiceSessionId: state.voiceSessionId, error: error instanceof Error ? error.message : 'Unknown telephony stream error' });
              }
              closeSocket(socket, 1011);
            });
          },
          () => closeSocket(socket),
        );
      } catch (error) {
        sendJson(socket, { event: 'error', message: error instanceof Error ? error.message : 'Unknown WebSocket parse error' });
        closeSocket(socket, 1002);
      }
    });
  });
}
