import React, { useCallback, useEffect, useState } from 'react';
import { useSocket } from '../context/SocketProvider';
import peer from '../service/peer';

const RoomPage = () => {
    const socket = useSocket();
    const [remoteSocketId, setRemoteSocketId] = useState(null);
    const [myStream, setMyStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);
    const [isSharing, setIsSharing] = useState(false);

    // Initialize media stream
    const initializeStream = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: true, 
                video: true 
            });
            setMyStream(stream);
            return stream;
        } catch (err) {
            setError("Failed to access camera and microphone. Please ensure permissions are granted.");
            console.error("Media Device Error:", err);
            return null;
        }
    };

    // Handle user joining the room
    const handleUserJoined = useCallback(({ email, id }) => {
        console.log(`Email ${email} joined room`);
        setRemoteSocketId(id);
        setIsConnected(true);
    }, []);

    // Handle incoming calls
    const handleIncomingCall = useCallback(async ({ from, offer }) => {
        try {
            setRemoteSocketId(from);
            const stream = await initializeStream();
            if (!stream) return;
            
            await peer.addStream(stream);
            console.log(`Incoming Call from`, from, offer);
            const ans = await peer.getAnswer(offer);
            socket.emit('call:accepted', { to: from, ans });
        } catch (err) {
            console.error("Error handling incoming call:", err);
            setError("Failed to handle incoming call");
        }
    }, [socket]);

    // Handle call acceptance
    const handleCallAccepted = useCallback(async ({ from, ans }) => {
        try {
            await peer.setLocalDescription(ans);
            console.log(`Call Accepted by`, from);
        } catch (err) {
            console.error("Error in call acceptance:", err);
            setError("Failed to establish connection. Please try again.");
        }
    }, []);

    // Send streams to peer
    const sendStreams = useCallback(async () => {
        try {
            setIsSharing(true);
            if (!myStream) {
                const stream = await initializeStream();
                if (!stream) return;
            }
            
            await peer.addStream(myStream);
            // Trigger renegotiation
            const offer = await peer.getOffer();
            socket.emit('peer:nego:needed', { offer, to: remoteSocketId });
            
        } catch (err) {
            console.error("Error sending streams:", err);
            setError("Failed to share video stream");
            setIsSharing(false);
        }
    }, [myStream, remoteSocketId, socket]);

    // Handle negotiation needed
    const handleNegoNeeded = useCallback(async () => {
        try {
            const offer = await peer.getOffer();
            socket.emit('peer:nego:needed', { offer, to: remoteSocketId });
        } catch (err) {
            console.error("Negotiation error:", err);
            setError("Connection negotiation failed. Please try again.");
        }
    }, [remoteSocketId, socket]);

    // Handle incoming negotiation
    const handleNegoInc = useCallback(async ({ from, offer }) => {
        try {
            const ans = await peer.getAnswer(offer);
            socket.emit('peer:nego:done', { to: from, ans });
        } catch (err) {
            console.error("Error handling negotiation:", err);
            setError("Failed to negotiate connection");
        }
    }, [socket]);

    // Setup socket listeners
    useEffect(() => {
        if (!socket) return;

        socket.on('user:joined', handleUserJoined);
        socket.on('incoming:call', handleIncomingCall);
        socket.on('call:accepted', handleCallAccepted);
        socket.on('peer:nego:needed', handleNegoInc);
        socket.on('peer:nego:final', async ({ ans }) => {
            try {
                await peer.setLocalDescription(ans);
            } catch (err) {
                console.error("Error setting final description:", err);
            }
        });

        return () => {
            socket.off('user:joined', handleUserJoined);
            socket.off('incoming:call', handleIncomingCall);
            socket.off('call:accepted', handleCallAccepted);
            socket.off('peer:nego:needed', handleNegoInc);
            socket.off('peer:nego:final');
        };
    }, [socket, handleUserJoined, handleIncomingCall, handleCallAccepted, handleNegoInc]);

    // Handle ICE candidates
    useEffect(() => {
        if (!socket || !peer.peer) return;

        const handleIceCandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    to: remoteSocketId,
                    candidate: event.candidate,
                });
            }
        };

        peer.peer.addEventListener('icecandidate', handleIceCandidate);
        
        socket.on('ice-candidate', ({ candidate }) => {
            if (candidate) {
                peer.peer.addIceCandidate(new RTCIceCandidate(candidate))
                    .catch(err => console.error("Error adding ICE candidate:", err));
            }
        });

        return () => {
            peer.peer.removeEventListener('icecandidate', handleIceCandidate);
            socket.off('ice-candidate');
        };
    }, [socket, remoteSocketId]);

    // Handle remote stream
    useEffect(() => {
        if (!peer.peer) return;

        const handleTrack = (ev) => {
            const remoteStream = ev.streams[0];
            setRemoteStream(remoteStream);
        };

        peer.peer.addEventListener('track', handleTrack);
        return () => {
            peer.peer.removeEventListener('track', handleTrack);
        };
    }, []);

    // Handle call initiation
    const handleCallUser = useCallback(async () => {
        try {
            const stream = await initializeStream();
            if (!stream) return;
            
            await peer.addStream(stream);
            const offer = await peer.getOffer();
            socket.emit("user:call", { to: remoteSocketId, offer });
        } catch (err) {
            console.error("Error initiating call:", err);
            setError("Failed to start call. Please try again.");
        }
    }, [socket, remoteSocketId]);

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Video Chat Room</h1>
            
            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {error}
                </div>
            )}

            <div className="mb-4">
                <h4 className="text-lg">
                    Status: {isConnected ? 'Connected' : 'Waiting for others to join...'}
                </h4>
            </div>

            <div className="space-x-4 mb-6">
                {remoteSocketId && !myStream && (
                    <button 
                        onClick={handleCallUser}
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        disabled={isSharing}
                    >
                        Start Call
                    </button>
                )}
                {myStream && (
                    <button 
                        onClick={sendStreams}
                        className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                        disabled={isSharing}
                    >
                        {isSharing ? 'Sharing...' : 'Share Video'}
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {myStream && (
                    <div>
                        <h2 className="text-xl mb-2">My Video</h2>
                        <video 
                            className="w-full rounded-lg"
                            autoPlay 
                            playsInline
                            muted 
                            ref={video => {
                                if (video) video.srcObject = myStream;
                            }} 
                        />
                    </div>
                )}
                
                {remoteStream && (
                    <div>
                        <h2 className="text-xl mb-2">Remote Video</h2>
                        <video 
                            className="w-full rounded-lg"
                            autoPlay 
                            playsInline
                            ref={video => {
                                if (video) video.srcObject = remoteStream;
                            }} 
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default RoomPage;