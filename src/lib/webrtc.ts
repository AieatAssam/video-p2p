/**
 * WebRTC peer-to-peer file sharing module.
 * Uses manual SDP signaling (copy-paste offer/answer strings between peers).
 */

import type { ConnectionState, TransferProgress, MediaFile } from '../types';

const CHUNK_SIZE = 16 * 1024; // 16KB
const STUN_SERVER: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

/**
 * Manages a WebRTC peer connection for P2P file transfer with manual SDP signaling.
 */
export class WebRTCShare {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private state: ConnectionState = 'idle';
  private progress: TransferProgress = {
    bytes: 0,
    total: 0,
    speed: 0,
    eta: 0,
    state: 'idle',
  };

  // Receive buffer
  private receivedChunks: ArrayBuffer[] = [];
  private receivedFileInfo: { name: string; size: number; type: string } | null = null;
  private receivedBytes = 0;
  private transferStartTime = 0;

  constructor() {
    // Create a peer connection up front so cleanup/addIceCandidate always have
    // something to work with even if the connection was never initiated.
    this.pc = new RTCPeerConnection(STUN_SERVER);
    this.state = 'idle';
  }

  /** Get the current connection state. */
  getState(): ConnectionState {
    return this.state;
  }

  /** Check if the peer connection is established and ready. */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /** Get the current transfer progress. */
  getTransferProgress(): TransferProgress {
    return { ...this.progress };
  }

  /**
   * Create an SDP offer to initiate a connection.
   * State: idle -> creating-offer -> waiting-answer
   * @returns The SDP offer string to send to the remote peer.
   */
  async createOffer(): Promise<string> {
    this.state = 'creating-offer';
    this.pc = new RTCPeerConnection(STUN_SERVER);
    this.attachPeerListeners();

    this.dataChannel = this.pc.createDataChannel('filetransfer');
    this.attachDataChannelListeners();

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    this.state = 'waiting-answer';
    return offer.sdp ?? '';
  }

  /**
   * Accept a received SDP offer, create and return an answer.
   * State: idle -> connecting
   * @param sdp - The SDP offer string received from the remote peer.
   * @returns The SDP answer string to send back.
   */
  async receiveOffer(sdp: string): Promise<string> {
    this.pc = new RTCPeerConnection(STUN_SERVER);
    this.attachPeerListeners();

    this.pc.ondatachannel = (event: RTCDataChannelEvent) => {
      this.dataChannel = event.channel;
      this.attachDataChannelListeners();
    };

    const offer = new RTCSessionDescription({ type: 'offer', sdp });
    await this.pc.setRemoteDescription(offer);

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.state = 'connecting';
    return answer.sdp ?? '';
  }

  /**
   * Accept a received SDP answer to complete the handshake.
   * State: waiting-answer -> connecting
   * @param sdp - The SDP answer string received from the remote peer.
   */
  async acceptAnswer(sdp: string): Promise<void> {
    const answer = new RTCSessionDescription({ type: 'answer', sdp });
    await this.pc!.setRemoteDescription(answer);
    this.state = 'connecting';
  }

  /**
   * Add a remote ICE candidate manually (copy-paste signaling model).
   * @param candidate - The ICE candidate string received from the remote peer.
   */
  addIceCandidate(candidate: string): void {
    if (!this.pc) return;
    this.pc.addIceCandidate(new RTCIceCandidate({ candidate }));
  }

  /**
   * Send a file over the established peer connection.
   * Sends a JSON header followed by binary chunks.
   * @param file - The file to send.
   * @throws Error if not connected.
   */
  async sendFile(file: MediaFile): Promise<void> {
    if (this.state !== 'connected') {
      throw new Error('not connected');
    }

    this.state = 'receiving';
    this.progress = {
      bytes: 0,
      total: file.size,
      speed: 0,
      eta: 0,
      state: 'receiving',
    };
    this.transferStartTime = Date.now();

    // Send file header as JSON
    const header = JSON.stringify({
      type: 'file-header',
      name: file.name,
      size: file.size,
      mimeType: file.type,
    });
    this.dataChannel!.send(header);

    // Send file data in 16KB chunks
    const data = new Uint8Array(file.data);
    let offset = 0;

    while (offset < data.length) {
      const end = Math.min(offset + CHUNK_SIZE, data.length);
      const chunk = data.slice(offset, end);
      this.dataChannel!.send(chunk.buffer as ArrayBuffer);
      offset = end;

      this.progress.bytes = offset;
      const elapsed = (Date.now() - this.transferStartTime) / 1000;
      this.progress.speed = elapsed > 0 ? Math.round(offset / elapsed) : 0;
      this.progress.eta =
        this.progress.speed > 0
          ? Math.round((file.size - offset) / this.progress.speed)
          : 0;
    }

    this.state = 'complete';
    this.progress.state = 'complete';
    this.progress.bytes = file.size;
  }

  /**
   * Clean up the peer connection and reset state.
   * Safe to call multiple times.
   */
  cleanup(): void {
    if (this.state === 'idle' && !this.pc) return;

    if (this.dataChannel) {
      this.dataChannel.onopen = null;
      this.dataChannel.onmessage = null;
      this.dataChannel.onclose = null;
      this.dataChannel.onerror = null;
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.pc) {
      this.pc.ondatachannel = null;
      this.pc.removeEventListener('icecandidate', this.handleIceCandidate);
      this.pc.removeEventListener('connectionstatechange', this.handleConnectionStateChange);
      this.pc.close();
      this.pc = null;
    }

    this.state = 'idle';
    this.progress = {
      bytes: 0,
      total: 0,
      speed: 0,
      eta: 0,
      state: 'idle',
    };
    this.receivedChunks = [];
    this.receivedFileInfo = null;
    this.receivedBytes = 0;
    this.transferStartTime = 0;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private attachPeerListeners(): void {
    if (!this.pc) return;
    this.pc.addEventListener('icecandidate', this.handleIceCandidate);
    this.pc.addEventListener('connectionstatechange', this.handleConnectionStateChange);
  }

  private attachDataChannelListeners(): void {
    if (!this.dataChannel) return;
    this.dataChannel.binaryType = 'arraybuffer';
    this.dataChannel.onopen = () => {
      this.state = 'connected';
      this.progress.state = 'connected';
    };
    this.dataChannel.onmessage = (event: MessageEvent) => {
      this.onDataChannelMessage(event);
    };
  }

  private handleIceCandidate = (event: RTCPeerConnectionIceEvent): void => {
    // In the manual-copy signaling model, ICE candidates are exchanged via
    // addIceCandidate() rather than automatically. No-op here.
  };

  private handleConnectionStateChange = (): void => {
    if (!this.pc) return;
    const connState = this.pc.connectionState;
    if (connState === 'connected') {
      this.state = 'connected';
      this.progress.state = 'connected';
    } else if (connState === 'disconnected' || connState === 'failed') {
      this.state = 'idle';
      this.progress.state = 'idle';
    }
  };

  private onDataChannelMessage(event: MessageEvent): void {
    if (typeof event.data === 'string') {
      // JSON message — expect file header
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'file-header') {
          this.receivedFileInfo = {
            name: msg.name,
            size: msg.size,
            type: msg.type,
          };
          this.receivedChunks = [];
          this.receivedBytes = 0;
          this.state = 'receiving';
          this.progress = {
            bytes: 0,
            total: msg.size,
            speed: 0,
            eta: 0,
            state: 'receiving',
          };
          this.transferStartTime = Date.now();
        }
      } catch {
        // Not valid JSON — ignore
      }
    } else if (event.data instanceof ArrayBuffer) {
      // Binary chunk
      this.receivedChunks.push(event.data);
      this.receivedBytes += event.data.byteLength;

      this.progress.bytes = this.receivedBytes;
      const elapsed = (Date.now() - this.transferStartTime) / 1000;
      this.progress.speed = elapsed > 0 ? Math.round(this.receivedBytes / elapsed) : 0;
      this.progress.eta =
        this.progress.speed > 0
          ? Math.round((this.progress.total - this.receivedBytes) / this.progress.speed)
          : 0;

      // Check if transfer is complete
      if (this.receivedFileInfo && this.receivedBytes >= this.receivedFileInfo.size) {
        this.state = 'complete';
        this.progress.state = 'complete';
      }
    }
  }
}
