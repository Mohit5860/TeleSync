import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Cookies from "js-cookie";

function Room() {
  const [host, setHost] = useState(null);
  const [user, setUser] = useState(null);
  const [joinRequests, setJoinRequests] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [remoteVideos, setRemoteVideos] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sharingScreen, setSharingScreen] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [localStrem, setLocalStream] = useState(null);

  const messageContainerRef = useRef(null);
  const peersRef = useRef({});
  const localVideoRef = useRef(null);
  const wsRef = useRef(null);

  const { code } = useParams();
  const access_token = Cookies.get("access_token");

  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop =
        messageContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const socket = new WebSocket("ws://127.0.0.1:3000/ws");
    wsRef.current = socket;

    socket.onopen = () => {
      console.log("Connected to ws server");
      socket.send(
        JSON.stringify({ type: "join-room", data: { access_token, code } })
      );
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("Message received: ", data);

      switch (data.message_type) {
        case "host-joined":
          console.log("Host joined:", data.username);
          setHost({
            username: data.username,
            id: data.user_id,
            screen: true,
            video: false,
          });
          setUser({ username: data.username, id: data.user_id });
          handleHost();
          break;

        case "join-request":
          console.log("Join request from:", data.username);
          setJoinRequests((prev) => [
            ...prev,
            { username: data.username, id: data.user_id },
          ]);
          break;

        case "new-participant":
          console.log("New participant:", data.username);
          setParticipants((prev) => [
            ...prev,
            { username: data.username, id: data.user_id, video: true },
          ]);
          break;

        case "participant-joined":
          console.log("Participant joined:", data.username);
          setUser({ username: data.username, id: data.user_id });
          setHost({ username: data.host_username, id: data.host_id, screen: true, video: false });
          setParticipants(() => [
            { username: data.username, id: data.user_id, video: true },
            ...data.participants,
          ]);
          handleUser(data.host_id, data.user_id, data.participants);
          break;

        case "offer":
          handleScreenShareOffer(data.item, data.from, data.user_id);
          console.log("offer");
          break;

        case "answer":
          handleScreenShareAnswer(data.item, data.from);
          console.log("answer");
          break;

        case "ice-candidate":
          if (peersRef.current[data.from]) {
            peersRef.current[data.from].addIceCandidate(
              new RTCIceCandidate(data.item)
            );
          }
          console.log("ice-candidate");
          break;

        case "mouse-move":
          window.electronAPI.sendMouseMove({ x: data.x, y: data.y });
          break;

        case "message":
          setMessages((prev) => [
            ...prev,
            {
              text: data.message,
              username: data.username,
              id: data.id,
            },
          ]);
          break;

        case "video-started":
          if (data.host) {
            setHost((prev) => ({...prev, video: true, screen: false}));
          } else {
            setParticipants((prev) => {
              return prev.map((participant) => {
                if (participant.id.$oid === data.user_id.$oid) {
                  return { ...participant, video: true };
                }
                return participant;
              });
            });
          }
          break;

        case "video-stopped":
          if (data.host) {
            setHost((prev) => ({...prev, video: false}));
          } else {
            setParticipants((prev) => {
              return prev.map((participant) => {
                if (participant.id.$oid === data.user_id.$oid) {
                  return { ...participant, video: false };
                }
                return participant;
              });
            });
          }
          break;

        case "screen-sharing-started":
          setHost((prev) => ({...prev, screen:true, video: false}));
          break;

        case "screen-sharing-stopped":
          setHost((prev) => ({...prev, screen: false}));
          break;

        default:
          console.warn("Unknown message type:", data.message_type);
      }
    };

    socket.onclose = () => console.log("WebSocket disconnected");
    socket.onerror = (error) => console.error("WebSocket error:", error);

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [code, access_token]);

  const sendMessage = (type, messageData) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data: messageData }));
    } else {
      console.warn("WebSocket is not connected");
    }
  };

  const handleHost = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micOn,
        video: videoOn,
      });

      localVideoRef.current = stream;
      setLocalStream(stream);
    } catch (err) {
      console.error("Error while getting host media: ".err);
    }
  };

  const acceptJoinRequest = (request) => {
    sendMessage("request-accepted", {
      username: request.username,
      user_id: request.id,
      participants,
      code,
      host_username: host.username,
      host_id: host.id,
    });
    setParticipants((prev) => [
      ...prev,
      { username: request.username, id: request.id, video: true },
    ]);
    setJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
  };

  const rejectJoinRequest = (request) => {
    sendMessage("reject-join", { user_id: request.id });
    setJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
  };

  const handleUser = async (hostId, userId, participants) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoOn,
        audio: micOn,
      });

      localVideoRef.current = stream;
      setPeerConnection(hostId, userId);

      participants.forEach((participant) => {
        if (participant.id.$oid !== userId) {
          setPeerConnection(participant.id, userId);
        }
      });

      const offer = await peersRef.current[hostId].createOffer();
      await peersRef.current[hostId].setLocalDescription(offer);
      sendMessage("offer", {
        item: offer,
        user_id: userId,
        to: hostId,
      });

      for (let participant of participants) {
        const offer = await peersRef.current[participant.id].createOffer();
        await peersRef.current[participant.id].setLocalDescription(offer);
        sendMessage("offer", {
          item: offer,
          user_id: userId,
          to: participant.id,
        });
      }
    } catch (err) {
      console.error("Error while forming webrtc connection:", err);
    }
  };

  const toggleScreenShare = () => {
    if (sharingScreen) {
      stopScreenSharing();
    } else {
      startScreenSharing();
    }
  };

  async function getScreenSources() {
    try {
      const sources = await window.electronAPI.getSources(["window", "screen"]);
      console.log("Screen sources:", sources);
      return sources;
    } catch (error) {
      console.error("Error getting screen sources:", error);
    }
  }

  const startScreenSharing = async () => {
    try {
      const sources = await getScreenSources();

      let videoStream;

      if (sources && sources.length > 0) {
        videoStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: sources[0].id,
            },
          },
        });
      }

      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: micOn,
        video: false,
      });

      const stream = new MediaStream();

      videoStream.getVideoTracks().forEach((track) => stream.addTrack(track));
      audioStream.getAudioTracks().forEach((track) => stream.addTrack(track));

      if (localVideoRef.current) {
        const videoTrack = localVideoRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
        }
      }

      localVideoRef.current = stream;
      setSharingScreen(true);
      setVideoOn(false);
      setLocalStream(stream);

      Object.values(peersRef.current).forEach((peerConnection) => {
        peerConnection.getSenders().forEach((sender) => {
          if (sender.track.kind === "video") {
            if (stream.getVideoTracks().length > 0) {
              sender.replaceTrack(stream.getVideoTracks()[0]);
            }
          } else if (sender.track.kind === "audio") {
            if (stream.getAudioTracks().length > 0) {
              sender.replaceTrack(stream.getAudioTracks()[0]);
            }
          }
        });
      });

      sendMessage("screen-sharing-started", {
        user_id: user.id,
        code,
        host: host.id.$oid === user.id.$oid,
      });
    } catch (err) {
      console.error("Error stating screen share:", err);
    }
  };

  const stopScreenSharing = async () => {
    try {
      if (localVideoRef.current) {
        const tracks = localVideoRef.current.getVideoTracks();
        tracks.forEach((track) => track.stop());
      }
      setSharingScreen(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoOn,
        audio: micOn,
      });

      localVideoRef.current = stream;
      setLocalStream(stream);

      Object.values(peersRef.current).forEach((peerConnection) => {
        peerConnection.getSenders().forEach((sender) => {
          if (sender.track.kind === "video") {
            if (stream.getVideoTracks().length > 0) {
              sender.replaceTrack(stream.getVideoTracks()[0]);
            }
          } else if (sender.track.kind === "audio") {
            if (stream.getAudioTracks().length > 0) {
              sender.replaceTrack(stream.getAudioTracks()[0]);
            }
          }
        });
      });

      sendMessage("screen-sharing-stopped", {
        user_id: user.id,
        code,
        host: host.id.$oid === user.id.$oid,
      });
    } catch (err) {
      console.error("Error stoping screen share:", err);
    }
  };

  const toggleMic = async () => {
    try {
      if (micOn) {
        const tracks = localVideoRef.current.getAudioTracks();
        tracks.forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoOn,
        audio: !micOn,
      });

      setMicOn((prev) => !prev);

      localVideoRef.current = stream;
      setLocalStream(stream);

      Object.values(peersRef.current).forEach((peerConnection) => {
        peerConnection.getSenders().forEach((sender) => {
          if (sender.track.kind === "video") {
            if (stream.getVideoTracks().length > 0) {
              sender.replaceTrack(stream.getVideoTracks()[0]);
            }
          } else if (sender.track.kind === "audio") {
            if (stream.getAudioTracks().length > 0) {
              sender.replaceTrack(stream.getAudioTracks()[0]);
            }
          }
        });
      });
    } catch (err) {
      console.error("Error in toggling mic:", err);
    }
  };

  const toggleVideo = async () => {
    try {
      if (videoOn) {
        const tracks = localVideoRef.current.getVideoTracks();
        tracks.forEach((track) => track.stop());
        sendMessage("video-stopped", {
          user_id: user.id,
          code,
          host: host.id.$oid === user.id.$oid,
        });
      } else {
        sendMessage("video-started", {
          user_id: user.id,
          code,
          host: host.id.$oid === user.id.$oid,
        });
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: !videoOn,
        audio: micOn,
      });

      localVideoRef.current = stream;
      setLocalStream(stream);

      setSharingScreen(false);
      setVideoOn((prev) => !prev);

      Object.values(peersRef.current).forEach((peerConnection) => {
        peerConnection.getSenders().forEach((sender) => {
          if (sender.track.kind === "video") {
            if (stream.getVideoTracks().length > 0) {
              sender.replaceTrack(stream.getVideoTracks()[0]);
            }
          } else if (sender.track.kind === "audio") {
            if (stream.getAudioTracks().length > 0) {
              sender.replaceTrack(stream.getAudioTracks()[0]);
            }
          }
        });
      });
    } catch (err) {
      console.error("Error in toggling video:", err);
    }
  };

  const setPeerConnection = (participantId, id = user.id) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessage("ice-candidate", {
          item: event.candidate,
          user_id: id,
          to: participantId,
        });
      }
    };

    peerConnection.ontrack = (event) => {
      console.log("Received remote track:", event);
      const [remoteStream] = event.streams;
      addRemoteVideo(participantId, remoteStream);
    };

    peerConnection.onremovetrack = (event) => {
      removeRemoteVideo(participantId);
    };

    peersRef.current[participantId] = peerConnection;

    if (localVideoRef.current) {
      localVideoRef.current.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localVideoRef.current);
      });
    }
  };

  const addRemoteVideo = (id, remoteStream) => {
    setRemoteVideos((prevVideos) => {
      // Prevent duplicate entries
      if (prevVideos.some((video) => video.id.$oid === id.$oid)) {
        return prevVideos;
      }
      return [...prevVideos, { id, stream: remoteStream }];
    });
  };

  const removeRemoteVideo = (id) => {
    setRemoteVideos((prevVideos) => {
      const updatedVideos = prevVideos.filter(
        (video) => video.id.$oid === id.$oid
      );

      const videoToRemove = prevVideos.find(
        (video) => video.id.$oid === id.$oid
      );
      if (videoToRemove) {
        videoToRemove.stream.getTracks().forEach((track) => track.stop());
      }

      return updatedVideos;
    });
  };

  const handleScreenShareOffer = async (offer, senderId, userId) => {
    setPeerConnection(senderId, userId);
    await peersRef.current[senderId].setRemoteDescription(
      new RTCSessionDescription(offer)
    );

    const answer = await peersRef.current[senderId].createAnswer();
    await peersRef.current[senderId].setLocalDescription(answer);
    sendMessage("answer", { item: answer, user_id: userId, to: senderId });
  };

  const handleScreenShareAnswer = async (answer, senderId) => {
    await peersRef.current[senderId].setRemoteDescription(
      new RTCSessionDescription(answer)
    );
  };

  const handleMouseMove = (e, id) => {
    const rect = e.target.getBoundingClientRect();

    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top) / rect.height;

    x = x * window.innerWidth;
    y = y * window.innerHeight;

    sendMessage("mouse-move", { x, y, to: id });
  };

  const handleSendMessage = () => {
    if (input.trim()) {
      sendMessage("message", {
        message: input.trim(),
        username: user.username,
        id: user.id,
        code,
      });
      setInput("");
    }
  };

  return user ? (
    <div className="bg-primary-bg h-screen w-screen overflow-hidden">
      {/* */}
      <div className="flex justify-between">
        <h1 className="font-semibold text-3xl p-3 text-secondary-text">
          TeleSync
        </h1>
        <div className="p-3 flex text-secondary-text">
          <h1 className="text-xl p-2">
            Room Code: {code} user: {user.username} host: {host.username}
          </h1>
        </div>
      </div>

      <div className="h-full flex">
        {/* Participants */}
        <div className="w-1/6 p-4 bg-secondary-bg border rounded-lg shadow-lg h-[91%]">
          <h1 className="text-secondary-text text-2xl font-bold mb-4 text-center">
            PARTICIPANTS
          </h1>
          <div>
            {joinRequests.map((request) => (
              <div key={request.id}>
                <h1 className="text-secondary-text">{request.username}</h1>
                <button onClick={() => acceptJoinRequest(request)}>
                  Approve
                </button>
                <button onClick={() => rejectJoinRequest(request)}>
                  Reject
                </button>
              </div>
            ))}
          </div>

          {participants.length > 0 && (
            <div>
              {participants.map((participant) => (
                <h3
                  key={participant.id}
                  className="font-medium text-secondary-text"
                >
                  {participant.username}
                </h3>
              ))}
            </div>
          )}
        </div>

        {/* Video Compartment */}
        <div className="w-2/3 h-full">
          <div className="overflow-y-auto h-5/6 hide-scrollbar mx-1">
            <div className="h-2/3 mb-1">
              <div className="border bg-secondary-bg text-secondary-text flex justify-center items-center mx-2 h-full rounded-lg">
                {(sharingScreen || videoOn) && user.id.$oid === host.id.$oid ? (
                  <video
                    ref={(videoRef) => {
                      if (videoRef) {
                        videoRef.srcObject = localVideoRef.current;
                      }
                    }}
                    autoPlay
                    playsInline
                    className="w-full h-auto rounded-lg"
                  />
                ) : (
                  (() => {
                    console.log(remoteVideos);
                    const remote = remoteVideos.find(
                      (r) => r.id.$oid === host.id.$oid
                    );
                    if (remote && (host.video || host.screen)) {
                      if (host.screen) {
                        return (
                          <video
                            autoPlay
                            playsInline
                            ref={(videoRef) => {
                              if (videoRef) {
                                videoRef.srcObject = remote.stream;
                              }
                            }}
                            className="w-full h-auto rounded-lg"
                            onMouseMove={(e) => handleMouseMove(e, host.id)}
                          />
                        );
                      }
                      return (
                        <video
                          autoPlay
                          playsInline
                          ref={(videoRef) => {
                            if (videoRef) {
                              videoRef.srcObject = remote.stream;
                            }
                          }}
                          className="w-full h-auto rounded-lg"
                        />
                      );
                    }
                    return <h1>{host.username}</h1>;
                  })()
                )}
              </div>
            </div>
            <div className="flex flex-wrap h-1/3">
              {participants.map((participant) => (
                <div
                  className="w-1/3 my-2 h-full border bg-secondary-bg text-secondary-text flex justify-center items-center mx-2 rounded-lg"
                  key={participant.id}
                >
                  {(sharingScreen || videoOn) &&
                  user.id.$oid !== host.id.$oid ? (
                    <video
                      ref={(videoRef) => {
                        if (videoRef && localVideoRef.current) {
                          videoRef.srcObject = localVideoRef.current;
                        }
                      }}
                      autoPlay
                      playsInline
                      className="w-full h-auto rounded-lg"
                    />
                  ) : (
                    (() => {
                      const remote = remoteVideos.find(
                        (r) => r.id.$oid === participant.id.$oid
                      );

                      if (
                        remote &&
                        remote.stream.getVideoTracks().length &&
                        participant.video
                      ) {
                        return (
                          <video
                            autoPlay
                            playsInline
                            ref={(videoRef) => {
                              if (videoRef) {
                                videoRef.srcObject = remote.stream;
                              }
                            }}
                            className="w-full h-auto rounded-lg"
                          />
                        );
                      }
                      return <h1>{participant.username}</h1>;
                    })()
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center items-center space-x-4 pt-3 rounded-lg">
            <button
              className={`p-2 rounded-full  border border-input-border text-secondary-text`}
              onClick={toggleMic}
            >
              {micOn ? "Mic On" : "Mic Off"}
            </button>
            <button
              className={`p-2 rounded-full  border border-input-border text-secondary-text`}
              onClick={toggleVideo}
            >
              {videoOn ? "Video On" : "Video Off"}
            </button>
            <button
              className={`p-2 rounded-full  border border-input-border text-secondary-text`}
              onClick={toggleScreenShare}
            >
              {sharingScreen ? "Stop Screen Share" : "Screen Share"}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="w-1/6  rounded-lg">
          <h1 className="p-2 text-center font-bold text-secondary-text text-2xl bg-secondary-bg rounded-t-lg">
            {" "}
            MESSAGES{" "}
          </h1>
          <div className="flex flex-col h-[85%]">
            <div
              ref={messageContainerRef}
              className="flex-grow p-2 overflow-y-auto mb-2 bg-secondary-bg rounded-b-lg"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="bg-message-bg p-2 m-2 rounded-lg"
                >
                  <h3 className="text-secondary-text text-lg font-semibold">
                    {message.username}
                  </h3>
                  <p className="text-message-text">{message.text}</p>
                </div>
              ))}
            </div>
            <div className="flex">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="py-2 px-2 rounded-l-lg bg-secondary-bg text-input-text border border-input-border placeholder-input-placeholder focus:border-input-focus-border focus:text-input-focus-text focus:outline-none"
                placeholder="Type a message..."
              />
              <button
                onClick={handleSendMessage}
                className="px-2 bg-secondary-bg border border-input-border text-message-text rounded-r-lg"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : (
    <h1>waiting</h1>
  );
}

export default Room;

// import { useEffect, useRef, useState } from "react";
// import { useParams } from "react-router-dom";
// import Cookies from "js-cookie";

// function Room() {
//   const [host, setHost] = useState(null);
//   const [user, setUser] = useState(null);
//   const [joinRequests, setJoinRequests] = useState([]);
//   const [participants, setParticipants] = useState([]);
//   const [sharingScreen, setSharingScreen] = useState(false);
//   const [remoteVideos, setRemoteVideos] = useState([]);
//   const [messages, setMessages] = useState([]);
//   const [input, setInput] = useState("");

//   const messageContainerRef = useRef(null);
//   const peersRef = useRef({});
//   const localVideoRef = useRef(null);
//   const wsRef = useRef(null);

//   const { code } = useParams();
//   const access_token = Cookies.get("access_token");

//   useEffect(() => {
//     if (messageContainerRef.current) {
//       messageContainerRef.current.scrollTop =
//         messageContainerRef.current.scrollHeight;
//     }
//   }, [messages]);

//   useEffect(() => {
//     const socket = new WebSocket("ws://127.0.0.1:3000/ws");
//     wsRef.current = socket;

//     socket.onopen = () => {
//       console.log("Connected to ws server");
//       socket.send(
//         JSON.stringify({ type: "join-room", data: { access_token, code } })
//       );
//     };

//     socket.onmessage = async (event) => {
//       const data = JSON.parse(event.data);
//       console.log("Message received: ", data);

//       switch (data.message_type) {
//         case "host-joined":
//           console.log("Host joined:", data.username);
//           setHost({ username: data.username, id: data.user_id });
//           setUser({ username: data.username, id: data.user_id });
//           break;

//         case "join-request":
//           console.log("Join request from:", data.username);
//           setJoinRequests((prev) => [
//             ...prev,
//             { username: data.username, id: data.user_id },
//           ]);
//           break;

//         case "new-participant":
//           console.log("New participant:", data.username);
//           setParticipants((prev) => [
//             ...prev,
//             { username: data.username, id: data.user_id },
//           ]);
//           break;

//         case "participant-joined":
//           console.log("Participant joined:", data.username);
//           setUser({ username: data.username, id: data.user_id });
//           setHost({ username: data.host_username, id: data.host_id });
//           setParticipants(() => [
//             { username: data.username, id: data.user_id },
//             ...data.participants,
//           ]);
//           break;

//         case "screen-share-start":
//           if (screenVideoRef.current) {
//             screenVideoRef.current.srcObject = new MediaStream(data.stream);
//           }
//           break;

//         case "screen-share-stop":
//           if (screenVideoRef.current) {
//             screenVideoRef.current.srcObject = null;
//           }
//           break;

//         case "offer":
//           handleScreenShareOffer(data.item, data.from, data.user_id);
//           break;

//         case "answer":
//           handleScreenShareAnswer(data.item, data.from);
//           break;

//         case "ice-candidate":
//           if (peersRef.current[data.from]) {
//             peersRef.current[data.from].addIceCandidate(
//               new RTCIceCandidate(data.item)
//             );
//           }
//           break;

//         case "mouse-move":
//           window.electronAPI.sendMouseMove({ x: data.x, y: data.y });
//           break;

//         case "message":
//           setMessages((prev) => [
//             ...prev,
//             {
//               text: data.message,
//               username: data.username,
//               id: data.id,
//             },
//           ]);
//           break;

//         default:
//           console.warn("Unknown message type:", data.message_type);
//       }
//     };

//     socket.onclose = () => console.log("WebSocket disconnected");
//     socket.onerror = (error) => console.error("WebSocket error:", error);

//     return () => {
//       if (wsRef.current) {
//         wsRef.current.close();
//         wsRef.current = null;
//       }
//     };
//   }, [code, access_token]);

//   const sendMessage = (type, messageData) => {
//     if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
//       wsRef.current.send(JSON.stringify({ type, data: messageData }));
//     } else {
//       console.warn("WebSocket is not connected");
//     }
//   };

//   const acceptJoinRequest = (request) => {
//     sendMessage("request-accepted", {
//       username: request.username,
//       user_id: request.id,
//       participants,
//       code,
//       host_username: host.username,
//       host_id: host.id,
//     });
//     setParticipants((prev) => [
//       ...prev,
//       { username: request.username, id: request.id },
//     ]);
//     setJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
//   };

//   const rejectJoinRequest = (request) => {
//     sendMessage("reject-join", { user_id: request.id });
//     setJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
//   };

//   async function getScreenSources() {
//     try {
//       const sources = await window.electronAPI.getSources(["window", "screen"]);
//       console.log("Screen sources:", sources);
//       // Use the sources to populate a selection UI, for instance.
//       return sources;
//     } catch (error) {
//       console.error("Error getting screen sources:", error);
//     }
//   }

//   const handleScreenShare = async () => {
//     try {
//       const sources = await getScreenSources();

//       let stream;

//       if (sources && sources.length > 0) {
//         stream = await navigator.mediaDevices.getUserMedia({
//           audio: false,
//           video: {
//             mandatory: {
//               chromeMediaSource: "desktop",
//               chromeMediaSourceId: sources[0].id,
//             },
//           },
//         });
//       }

//       localVideoRef.current = stream;
//       setSharingScreen(true);

//       participants.forEach((participant) => {
//         setPeerConnection(participant.id);
//       });

//       for (let participant of participants) {
//         const offer = await peersRef.current[participant.id].createOffer();
//         await peersRef.current[participant.id].setLocalDescription(offer);
//         sendMessage("offer", {
//           item: offer,
//           user_id: user.id,
//           to: participant.id,
//         });
//       }
//     } catch (err) {
//       console.error("Error stating screen share:", err);
//     }
//   };

//   const setPeerConnection = (participantId, id = user.id) => {
//     if (peersRef.current[participantId]) return;
//     const peerConnection = new RTCPeerConnection({
//       iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
//     });

//     peerConnection.onicecandidate = (event) => {
//       if (event.candidate) {
//         sendMessage("ice-candidate", {
//           item: event.candidate,
//           user_id: id,
//           to: participantId,
//         });
//       }
//     };

//     peerConnection.ontrack = (event) => {
//       const [remoteStream] = event.streams;
//       addRemoteVideo(participantId, remoteStream);
//     };

//     peersRef.current[participantId] = peerConnection;

//     if (localVideoRef.current) {
//       localVideoRef.current.getTracks().forEach((track) => {
//         peerConnection.addTrack(track, localVideoRef.current);
//       });
//     }
//   };

//   const addRemoteVideo = (id, remoteStream) => {
//     setRemoteVideos((prevVideos) => {
//       // Prevent duplicate entries
//       if (prevVideos.some((video) => video.id === id)) {
//         return prevVideos;
//       }
//       return [...prevVideos, { id, stream: remoteStream }];
//     });
//   };

//   const handleScreenShareOffer = async (offer, senderId, userId) => {
//     setPeerConnection(senderId, userId);
//     await peersRef.current[senderId].setRemoteDescription(
//       new RTCSessionDescription(offer)
//     );

//     const answer = await peersRef.current[senderId].createAnswer();
//     await peersRef.current[senderId].setLocalDescription(answer);
//     sendMessage("answer", { item: answer, user_id: userId, to: senderId });
//   };

//   const handleScreenShareAnswer = async (answer, senderId) => {
//     await peersRef.current[senderId].setRemoteDescription(
//       new RTCSessionDescription(answer)
//     );
//   };

//   const handleMouseMove = (e, id) => {
//     const rect = e.target.getBoundingClientRect();

//     const x = (e.clientX - rect.left) / rect.width;
//     const y = (e.clientY - rect.top) / rect.height;

//     sendMessage("mouse-move", { x, y, to: id });
//   };

//   const handleSendMessage = () => {
//     if (input.trim()) {
//       sendMessage("message", {
//         message: input.trim(),
//         username: user.username,
//         id: user.id,
//         code,
//       });
//       setInput(""); // Clear input after sending
//     }
//   };

//   return user ? (
//     <div className="bg-primary-bg h-screen w-screen overflow-hidden">
//       {/* */}
//       <div className="flex justify-between">
//         <h1 className="font-semibold text-3xl p-3 text-secondary-text">
//           TeleSync
//         </h1>
//         <div className="p-3 flex text-secondary-text">
//           <h1 className="text-xl p-2">
//             Room Code: {code} user: {user.username} host: {host.username}
//           </h1>
//         </div>
//       </div>

//       <div className="h-full flex">
//         {/* Participants */}
//         <div className="w-1/6 p-4 bg-secondary-bg border rounded-lg shadow-lg h-[91%]">
//           <h1 className="text-secondary-text text-2xl font-bold mb-4 text-center">
//             PARTICIPANTS
//           </h1>
//           <div>
//             {joinRequests.map((request) => (
//               <div key={request.id}>
//                 <h1 className="text-secondary-text">{request.username}</h1>
//                 <button onClick={() => acceptJoinRequest(request)}>
//                   Approve
//                 </button>
//                 <button onClick={() => rejectJoinRequest(request)}>
//                   Reject
//                 </button>
//               </div>
//             ))}
//           </div>

//           {participants.length > 0 && (
//             <div>
//               {participants.map((participant) => (
//                 <h3
//                   key={participant.id}
//                   className="font-medium text-secondary-text"
//                 >
//                   {participant.username}
//                 </h3>
//               ))}
//             </div>
//           )}
//         </div>

//         {/* Video Compartment */}
//         <div className="w-2/3 h-full">
//           <div className="overflow-y-auto h-5/6 hide-scrollbar mx-1">
//             <div className="h-2/3 mb-1">
//               <div className="border bg-secondary-bg text-secondary-text flex justify-center items-center mx-2 h-full rounded-lg">
//                 {sharingScreen ? (
//                   <video
//                     ref={(videoRef) => {
//                       if (videoRef && localVideoRef.current) {
//                         videoRef.srcObject = localVideoRef.current;
//                       }
//                     }}
//                     autoPlay
//                     playsInline
//                     className="w-full h-auto rounded-lg"
//                   />
//                 ) : (
//                   (() => {
//                     const remote = remoteVideos.find(
//                       (r) => r.id.toString() === host.id.toString()
//                     );

//                     if (remote) {
//                       return (
//                         <video
//                           autoPlay
//                           playsInline
//                           ref={(videoRef) => {
//                             if (videoRef) {
//                               videoRef.srcObject = remote.stream;
//                             }
//                           }}
//                           className="w-full h-auto rounded-lg"
//                           onMouseMove={(e) => handleMouseMove(e, host.id)}
//                         />
//                       );
//                     }
//                     return <h1>{host.username}</h1>;
//                   })()
//                 )}
//               </div>
//             </div>
//             <div className="flex flex-wrap h-1/3">
//               {participants.map((participant) => (
//                 <div
//                   className="w-1/3 my-2 h-full border bg-secondary-bg text-secondary-text flex justify-center items-center mx-2 rounded-lg"
//                   key={participant.id}
//                 >
//                   <h1>{participant.username}</h1>
//                 </div>
//               ))}
//             </div>
//           </div>

//           <div className="flex justify-center items-center space-x-4 pt-3 rounded-lg">
//             <button
//               className={`p-2 rounded-full  border border-input-border text-secondary-text`}
//               onClick={handleScreenShare}
//             >
//               {sharingScreen ? "Stop Screen Share" : "Screen Share"}
//             </button>
//           </div>
//         </div>

//         {/* Messages */}
//         <div className="w-1/6  rounded-lg">
//           <h1 className="p-2 text-center font-bold text-secondary-text text-2xl bg-secondary-bg rounded-t-lg">
//             {" "}
//             MESSAGES{" "}
//           </h1>
//           <div className="flex flex-col h-[85%]">
//             <div
//               ref={messageContainerRef}
//               className="flex-grow p-2 overflow-y-auto mb-2 bg-secondary-bg rounded-b-lg"
//             >
//               {messages.map((message) => (
//                 <div
//                   key={message.id}
//                   className="bg-message-bg p-2 m-2 rounded-lg"
//                 >
//                   <h3 className="text-secondary-text text-lg font-semibold">
//                     {message.username}
//                   </h3>
//                   <p className="text-message-text">{message.text}</p>
//                 </div>
//               ))}
//             </div>
//             <div className="flex">
//               <input
//                 type="text"
//                 value={input}
//                 onChange={(e) => setInput(e.target.value)}
//                 className="py-2 px-2 rounded-l-lg bg-secondary-bg text-input-text border border-input-border placeholder-input-placeholder focus:border-input-focus-border focus:text-input-focus-text focus:outline-none"
//                 placeholder="Type a message..."
//               />
//               <button
//                 onClick={handleSendMessage}
//                 className="px-2 bg-secondary-bg border border-input-border text-message-text rounded-r-lg"
//               >
//                 Send
//               </button>
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   ) : (
//     <h1>waiting</h1>
//   );
// }

// export default Room;
