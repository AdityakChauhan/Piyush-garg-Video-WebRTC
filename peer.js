import { io } from 'socket.io-client';

class PeerService {
    constructor() {
        if (!this.peer) {
            this.peer = new RTCPeerConnection({
                iceServers: [
                    {
                        urls: [
                            "stun:stun1.l.google.com:19302",
                            "stun:stun2.l.google.com:19302",
                        ],
                    },
                ],
            });
        }
    }

    async getAnswer(offer) {
        if(this.peer) {
            await this.peer.setRemoteDescription(new RTCSessionDescription(offer));
            const ans = await this.peer.createAnswer();
            await this.peer.setLocalDescription(new RTCSessionDescription(ans));
            return ans;
        }
    }

    async setLocalDescription(ans) {
        if(this.peer) {
            await this.peer.setRemoteDescription(new RTCSessionDescription(ans));
        }
    }

    async getOffer() {
        if(this.peer) {
            const offer = await this.peer.createOffer();
            await this.peer.setLocalDescription(new RTCSessionDescription(offer));
            return offer;
        }
    }

    // Add new methods for stream handling
    async addStream(stream) {
        if (!this.peer) return;
        
        // Remove any existing tracks
        const senders = this.peer.getSenders();
        senders.forEach((sender) => {
            this.peer.removeTrack(sender);
        });

        // Add new tracks
        stream.getTracks().forEach((track) => {
            this.peer.addTrack(track, stream);
        });
    }
}

export default new PeerService();