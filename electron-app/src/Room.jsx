import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Cookies from "js-cookie";
import Messages from "./components/Messages";

function Room() {
  const [host, setHost] = useState(null);
  const [user, setUser] = useState(null);
  const [joinRequests, setJoinRequests] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [remoteVideos, setRemoteVideos] = useState([]);
  const [messages, setMessages] = useState([]);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [videoOn, setVideoOn] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [messageOpen, setMessageOpen] = useState(true);
  const [allowedAccess, setAllowedAccess] = useState(null);
  const [showPopUp, setShowPopUp] = useState(null);
  const [popUpData, setPopUpData] = useState({});

  const peersRef = useRef({});
  const localVideoRef = useRef(null);
  const wsRef = useRef(null);

  const { code } = useParams();
  const access_token = Cookies.get("access_token");

  const navigate = useNavigate();

  useEffect(() => {
    const socket = new WebSocket(
      "wss://telesync-backend-production.up.railway.app/ws"
      //"ws://127.0.0.1:3000/ws"
    );
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
            screen: false,
            video: false,
          });
          setUser({ username: data.username, id: data.user_id });
          //handleHost();
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
            { username: data.username, id: data.user_id, video: false },
          ]);
          handleUser(data.user_id, data.participant);
          break;

        case "participant-joined":
          console.log("Participant joined:", data.username);
          setUser({ username: data.username, id: data.user_id });
          setHost(data.host);
          setParticipants(() => [
            { username: data.username, id: data.user_id, video: false },
            ...data.participants,
          ]);
          break;

        case "host-left":
          setHost({
            id: data.host,
            username: data.username,
            video: false,
            screen: false,
          });
          setParticipants((prev) =>
            prev.filter((participant) => participant.id.$oid !== data.host.$oid)
          );
          if (peersRef.current) {
            delete peersRef.current[data.host.$oid];
          }
          break;

        case "participant-left":
          setParticipants((prev) =>
            prev.filter((participant) => participant.id.$oid !== data.user.$oid)
          );
          if (peersRef.current) {
            delete peersRef.current[data.user.$oid];
          }
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
          if (peersRef.current[data.from.$oid]) {
            peersRef.current[data.from.$oid].addIceCandidate(
              new RTCIceCandidate(data.item)
            );
          }
          console.log("ice-candidate");
          break;

        case "mouse-move":
          window.electronAPI.sendMouseMove({ x: data.x, y: data.y });
          break;

        case "key-press":
          window.electronAPI.sendKey({ key: data.key });
          break;

        case "mouse-click":
          window.electronAPI.sendMouseClick();
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
            setHost((prev) => ({ ...prev, video: true, screen: false }));
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
            setHost((prev) => ({ ...prev, video: false }));
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
          setHost((prev) => ({ ...prev, screen: true, video: false }));
          break;

        case "screen-sharing-stopped":
          setHost((prev) => ({ ...prev, screen: false }));
          break;

        case "request-access":
          setShowPopUp(true);
          setPopUpData({ username: data.username, userId: data.user_id });
          break;

        case "allowed-access":
          alert(`Access allowed to ${data.username}`);
          setAllowedAccess(data.user_id);
          break;

        case "rejected-access":
          alert(`Access rejected`);
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
      host,
    });
    setJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
  };

  const rejectJoinRequest = (request) => {
    sendMessage("reject-join", { user_id: request.id });
    setJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
  };

  const handleUser = async (userId, id) => {
    try {
      setPeerConnection(userId, id);

      const offer = await peersRef.current[userId.$oid].createOffer();
      await peersRef.current[userId.$oid].setLocalDescription(offer);
      sendMessage("offer", {
        item: offer,
        user_id: id,
        to: userId,
      });
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

      const stream = new MediaStream();

      if (micOn) {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: micOn,
          video: false,
        });

        audioStream.getAudioTracks().forEach((track) => stream.addTrack(track));
      }

      videoStream.getVideoTracks().forEach((track) => stream.addTrack(track));

      if (localVideoRef.current) {
        const videoTrack = localVideoRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
        }

        localVideoRef.current = stream;

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
      } else {
        localVideoRef.current = stream;
        participants.forEach((participant) => {
          if (participant.id.$oid !== user.id.$oid) {
            setPeerConnection(participant.id, user.id);
          }
        });

        for (let participant of participants) {
          const offer = await peersRef.current[
            participant.id.$oid
          ].createOffer();
          await peersRef.current[participant.id.$oid].setLocalDescription(
            offer
          );
          sendMessage("offer", {
            item: offer,
            user_id: user.id,
            to: participant.id,
          });
        }
      }

      setSharingScreen(true);
      setVideoOn(false);
      setLocalStream(stream);

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

      if (micOn || videoOn) {
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
      } else {
        localVideoRef.current = null;
        setLocalStream(null);
      }

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
      if (videoOn) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoOn,
          audio: !micOn,
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
      } else {
        localVideoRef.current = null;
        setLocalStream(null);
      }

      setMicOn((prev) => !prev);
    } catch (err) {
      console.error("Error in toggling mic:", err);
    }
  };

  const toggleVideo = async () => {
    if (videoOn) {
      stopVideo();
    } else {
      startVideo();
    }
  };

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micOn,
        video: true,
      });

      if (localVideoRef.current) {
        const videoTrack = localVideoRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
        }

        localVideoRef.current = stream;

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
      } else {
        localVideoRef.current = stream;

        if (user.id.$oid !== host.id.$oid) {
          setPeerConnection(host.id, user.id);

          const offer = await peersRef.current[host.id.$oid].createOffer();
          await peersRef.current[host.id.$oid].setLocalDescription(offer);
          sendMessage("offer", {
            item: offer,
            user_id: user.id,
            to: host.id,
          });
        }

        participants.forEach((participant) => {
          if (participant.id.$oid !== user.id.$oid) {
            setPeerConnection(participant.id, user.id);
          }
        });

        for (let participant of participants) {
          if (participant.id.$oid !== user.id.$oid) {
            const offer = await peersRef.current[
              participant.id.$oid
            ].createOffer();
            await peersRef.current[participant.id.$oid].setLocalDescription(
              offer
            );
            sendMessage("offer", {
              item: offer,
              user_id: user.id,
              to: participant.id,
            });
          }
        }
      }

      setSharingScreen(false);
      setVideoOn(true);
      setLocalStream(stream);

      sendMessage("video-started", {
        user_id: user.id,
        code,
        host: host.id.$oid === user.id.$oid,
      });
    } catch (err) {
      console.error("Error while sarting video: ", err);
    }
  };

  const stopVideo = async () => {
    try {
      if (localVideoRef.current) {
        const tracks = localVideoRef.current.getVideoTracks();
        tracks.forEach((track) => track.stop());
      }
      setVideoOn(false);

      if (micOn) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
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
      } else {
        localVideoRef.current = null;
        setLocalStream(null);
      }

      sendMessage("video-stopped", {
        user_id: user.id,
        code,
        host: host.id.$oid === user.id.$oid,
      });
    } catch (err) {
      console.error("Error stoping screen share:", err);
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

    peersRef.current[participantId.$oid] = peerConnection;

    if (localVideoRef.current) {
      localVideoRef.current.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localVideoRef.current);
      });
    }
  };

  const addRemoteVideo = (id, remoteStream) => {
    setRemoteVideos((prevVideos) => {
      // Prevent duplicate entries
      prevVideos = prevVideos.filter((video) => video.id.$oid !== id.$oid);
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
    await peersRef.current[senderId.$oid].setRemoteDescription(
      new RTCSessionDescription(offer)
    );

    const answer = await peersRef.current[senderId.$oid].createAnswer();
    await peersRef.current[senderId.$oid].setLocalDescription(answer);
    sendMessage("answer", { item: answer, user_id: userId, to: senderId });
  };

  const handleScreenShareAnswer = async (answer, senderId) => {
    await peersRef.current[senderId.$oid].setRemoteDescription(
      new RTCSessionDescription(answer)
    );
  };

  const handleMouseMove = (e, id) => {
    const rect = e.target.getBoundingClientRect();

    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top) / rect.height;
    sendMessage("mouse-move", { x, y, to: id });
  };

  const handleKeyPress = (e, id) => {
    if (e.code === "Space") {
      e.preventDefault();
    }
    console.log(e.key);
    sendMessage("key-press", { key: e.key, to: id });
  };

  const handleClick = (e, id) => {
    sendMessage("mouse-click", { to: id });
  };

  const toggleMessages = () => {
    setMessageOpen((prev) => !prev);
  };

  const handleLeaveRoom = () => {
    sendMessage("leave-room", { code, user_id: user.id });
    wsRef.current.close();
    wsRef.current = null;
    peersRef;
    navigate("/");
  };

  const handleAccess = () => {
    if (allowedAccess) {
      if (allowedAccess.$oid === user.id.$oid) setAllowedAccess(null);
      else alert("Someone is already accessing the host screen");
      return;
    }
    sendMessage("request-access", {
      to: host.id,
      from: user.id,
      username: user.username,
    });
  };

  const handleAllow = () => {
    sendMessage("allowed-access", {
      user_id: popUpData.userId,
      username: popUpData.username,
      code,
    });
    setAllowedAccess(popUpData.userId);
    setShowPopUp(false);
  };

  const handleReject = () => {
    sendMessage("rejected-access", {
      user_id: popUpData.userId,
      username: popUpData.username,
      code,
    });
    setShowPopUp(false);
  };

  return user ? (
    <div className="bg-primary-bg text-primary-text h-screen w-screen overflow-hidden">
      {showPopUp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-secondary-bg rounded-lg shadow-lg p-8 max-w-sm w-full">
            <h2 className="text-lg font-semibold mb-4 text-primary-text">
              Allow Access
            </h2>
            <p className="text-primary-text mb-6">
              Do you want to allow access of screen to {popUpData.username}?
            </p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={handleReject}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 hover:cursor-pointer"
              >
                Reject
              </button>
              <button
                onClick={handleAllow}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 hover:cursor-pointer"
              >
                Allow
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-between items-center p-4">
        <h1 className="font-semibold text-3xl">TeleSync</h1>
        <h2 className="text-xl">Room Code : {code}</h2>
      </div>
      <div className="h-full flex">
        <div className="h-full flex-5 ml-4 mr-2 my-2">
          <div className="h-[84%] hide-scrollbar overflow-y-auto">
            <div
              className={`${
                allowedAccess?.$oid === user.id.$oid
                  ? "bg-secondary-bg text-center flex items-center justify-center text-2xl font-medium h-full"
                  : "bg-secondary-bg text-center flex items-center justify-center text-2xl font-medium h-2/3"
              }`}
            >
              {(sharingScreen || videoOn) && user.id.$oid === host.id.$oid ? (
                <video
                  ref={(videoRef) => {
                    if (videoRef) {
                      videoRef.srcObject = localVideoRef.current;
                    }
                  }}
                  autoPlay
                  playsInline
                  className="w-full h-full"
                />
              ) : (
                (() => {
                  console.log(remoteVideos);
                  const remote = remoteVideos.find(
                    (r) => r.id.$oid === host.id.$oid
                  );
                  if (remote && (host.video || host.screen)) {
                    if (
                      host.screen &&
                      allowedAccess &&
                      allowedAccess.$oid === user.id.$oid
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
                          className={`${
                            allowedAccess?.$oid === user.id.$oid
                              ? "w-full h-full object-fill"
                              : "w-full h-full"
                          }`}
                          tabIndex={0}
                          onMouseMove={(e) => handleMouseMove(e, host.id)}
                          onKeyDown={(e) => handleKeyPress(e, host.id)}
                          onClick={(e) => handleClick(e, host.id)}
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
                        className="w-full h-full"
                      />
                    );
                  }
                  return <h1>{host.username}</h1>;
                })()
              )}
            </div>

            <div className="flex flex-wrap h-auto">
              {participants.map((participant) => (
                <div
                  className="w-[32.73%] h-68 mt-2 bg-secondary-bg flex justify-center items-center mr-2"
                  key={participant.id.$oid}
                >
                  {(sharingScreen || videoOn) &&
                  user.id.$oid !== host.id.$oid &&
                  user.id.$oid === participant.id.$oid ? (
                    <video
                      ref={(videoRef) => {
                        if (videoRef && localVideoRef.current) {
                          videoRef.srcObject = localVideoRef.current;
                        }
                      }}
                      autoPlay
                      playsInline
                      className="w-full h-full"
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
                            className="w-full h-full"
                          />
                        );
                      }
                      return (
                        <h1 className="text-xl font-medium">
                          {participant.username}
                        </h1>
                      );
                    })()
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center items-center space-x-4 pt-3 rounded-lg">
            {/* <button
              className={`p-2 rounded-full  border border-input-border text-secondary-text`}
              onClick={toggleMic}
            >
              {micOn ? "Mic On" : "Mic Off"}
            </button> */}
            <button
              className={`p-2 rounded-full  border border-input-border text-secondary-text`}
              onClick={toggleVideo}
            >
              {videoOn ? "Video On" : "Video Off"}
            </button>
            {host.id.$oid === user.id.$oid && (
              <button
                className={`p-2 rounded-full  border border-input-border text-secondary-text`}
                onClick={toggleScreenShare}
              >
                {sharingScreen ? "Stop Screen Share" : "Screen Share"}
              </button>
            )}

            {host.id.$oid !== user.id.$oid && host.screen && (
              <button
                className={`p-2 rounded-full  border border-input-border text-secondary-text`}
                onClick={handleAccess}
              >
                {allowedAccess?.$oid === user.id.$oid
                  ? "Accessing"
                  : "Ask access"}
              </button>
            )}
            <button
              className={`p-2 rounded-full  border border-input-border text-secondary-text`}
              onClick={toggleMessages}
            >
              {messageOpen ? "Participants" : "Messages"}
            </button>
            <button
              className={`p-2 rounded-full  border border-input-border text-secondary-text`}
              onClick={handleLeaveRoom}
            >
              Leave
            </button>
          </div>
        </div>
        {!messageOpen ? (
          <div className="flex-1 bg-secondary-bg m-2 h-[90%] p-4">
            <h1 className="text-2xl font-semibold text-center pb-4">
              Particiapants
            </h1>
            <div>
              {" "}
              {joinRequests.map((request) => (
                <div
                  key={request.id.$oid}
                  className="flex items-center justify-between mb-2"
                >
                  <h1 className="text-xl font-medium1">{request.username}</h1>
                  <div>
                    <button
                      className="bg-primary-bg p-2 mx-2 rounded-full  border border-input-border"
                      onClick={() => acceptJoinRequest(request)}
                    >
                      Approve
                    </button>
                    <button
                      className=" bg-primary-bg p-2 mx-2 rounded-full  border border-input-border"
                      onClick={() => rejectJoinRequest(request)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center">
              <h3 className="font-medium text-xl">{host.username}</h3>
              <h3 className="font-medium text-l text-red-300">host</h3>
            </div>
            {participants.length > 0 && (
              <div>
                {participants.map((participant) => (
                  <h3 key={participant.id.$oid} className="font-medium text-xl">
                    {participant.username}
                  </h3>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex-1 m-2">
            <Messages
              messages={messages}
              sendMessage={sendMessage}
              user={user}
              code={code}
            />
          </div>
        )}
      </div>
    </div>
  ) : (
    //   <div className="bg-primary-bg h-screen w-screen overflow-hidden">
    //     {showPopUp && (
    //       <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
    //         <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full">
    //           <h2 className="text-lg font-semibold mb-4 text-gray-800">
    //             Allow Access
    //           </h2>
    //           <p className="text-gray-600 mb-6">
    //             Do you want to allow access of screen to {popUpData.username}?
    //           </p>
    //           <div className="flex justify-end space-x-4">
    //             <button
    //               onClick={handleReject}
    //               className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
    //             >
    //               Reject
    //             </button>
    //             <button
    //               onClick={handleAllow}
    //               className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
    //             >
    //               Allow
    //             </button>
    //           </div>
    //         </div>
    //       </div>
    //     )}

    //     {/* */}
    //     <div className="flex justify-between">
    //       <h1 className="font-semibold text-3xl p-3 text-secondary-text">
    //         TeleSync
    //       </h1>
    //       <div className="p-3 flex text-secondary-text">
    //         <h1 className="text-xl p-2">
    //           Room Code: {code} user: {user.username} host: {host.username}
    //         </h1>
    //       </div>
    //     </div>

    //     <div className="h-full flex">
    //       {/* Participants */}
    //       <div className=" hidden flex-1 px-10 py-4 bg-secondary-bg border rounded-lg shadow-lg h-[91%] lg:block">
    //         <h1 className="text-secondary-text text-2xl font-bold mb-4 text-center">
    //           PARTICIPANTS
    //         </h1>
    //         <div>
    //           {joinRequests.map((request) => (
    //             <div
    //               key={request.id.$oid}
    //               className="flex items-center justify-between mb-2"
    //             >
    //               <h1 className="text-secondary-text text-xl font-medium1">
    //                 {request.username}
    //               </h1>
    //               <div>
    //                 <button
    //                   className="text-secondary-text bg-primary-bg p-2 mx-2 rounded-full  border border-input-border"
    //                   onClick={() => acceptJoinRequest(request)}
    //                 >
    //                   Approve
    //                 </button>
    //                 <button
    //                   className="text-secondary-text bg-primary-bg p-2 mx-2 rounded-full  border border-input-border"
    //                   onClick={() => rejectJoinRequest(request)}
    //                 >
    //                   Reject
    //                 </button>
    //               </div>
    //             </div>
    //           ))}
    //         </div>

    //         <div className="flex justify-between items-center">
    //           <h3 className="font-medium text-secondary-text text-xl">
    //             {host.username}
    //           </h3>
    //           <h3 className="font-medium text-l text-red-300">host</h3>
    //         </div>
    //         {participants.length > 0 && (
    //           <div>
    //             {participants.map((participant) => (
    //               <h3
    //                 key={participant.id.$oid}
    //                 className="font-medium text-secondary-text text-xl"
    //               >
    //                 {participant.username}
    //               </h3>
    //             ))}
    //           </div>
    //         )}
    //       </div>
    //       {/* Video Compartment */}
    //       <div
    //         className={
    //           allowedAccess?.$oid === user.id.$oid ? "w-full" : "flex-3 h-full"
    //         }
    //       >
    //         <div className="overflow-y-auto h-5/6 hide-scrollbar mx-1">
    //           <div
    //             className={
    //               allowedAccess?.$oid === user.id.$oid
    //                 ? "h-full mb-1"
    //                 : "h-2/3 mb-1"
    //             }
    //           >
    //             <div
    //               className={`border bg-secondary-bg text-secondary-text flex justify-center items-center mx-2 ${
    //                 allowedAccess?.$oid === user.id.$oid ? "h-full" : "h-full"
    //               } rounded-none`}
    //             >
    //               {(sharingScreen || videoOn) && user.id.$oid === host.id.$oid ? (
    //                 <video
    //                   ref={(videoRef) => {
    //                     if (videoRef) {
    //                       videoRef.srcObject = localVideoRef.current;
    //                     }
    //                   }}
    //                   autoPlay
    //                   playsInline
    //                   className="w-full h-auto rounded-lg"
    //                 />
    //               ) : (
    //                 (() => {
    //                   console.log(remoteVideos);
    //                   const remote = remoteVideos.find(
    //                     (r) => r.id.$oid === host.id.$oid
    //                   );
    //                   if (remote && (host.video || host.screen)) {
    //                     if (
    //                       host.screen &&
    //                       allowedAccess &&
    //                       allowedAccess.$oid === user.id.$oid
    //                     ) {
    //                       return (
    //                         <video
    //                           autoPlay
    //                           playsInline
    //                           ref={(videoRef) => {
    //                             if (videoRef) {
    //                               videoRef.srcObject = remote.stream;
    //                             }
    //                           }}
    //                           className={`${
    //                             allowedAccess?.$oid === user.id.$oid
    //                               ? "w-full h-full object-fill"
    //                               : "w-full h-auto"
    //                           }`}
    //                           tabIndex={0}
    //                           onMouseMove={(e) => handleMouseMove(e, host.id)}
    //                           onKeyDown={(e) => handleKeyPress(e, host.id)}
    //                           onClick={(e) => handleClick(e, host.id)}
    //                         />
    //                       );
    //                     }
    //                     return (
    //                       <video
    //                         autoPlay
    //                         playsInline
    //                         ref={(videoRef) => {
    //                           if (videoRef) {
    //                             videoRef.srcObject = remote.stream;
    //                           }
    //                         }}
    //                         className="w-full h-auto rounded-lg"
    //                       />
    //                     );
    //                   }
    //                   return <h1>{host.username}</h1>;
    //                 })()
    //               )}
    //             </div>
    //           </div>
    //           <div className="flex flex-wrap h-1/3">
    //             {participants.map((participant) => (
    //               <div
    //                 className="w-1/3 my-2 h-full border bg-secondary-bg text-secondary-text flex justify-center items-center mx-2 rounded-lg"
    //                 key={participant.id.$oid}
    //               >
    //                 {(sharingScreen || videoOn) &&
    //                 user.id.$oid !== host.id.$oid &&
    //                 user.id.$oid === participant.id.$oid ? (
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
    //                       (r) => r.id.$oid === participant.id.$oid
    //                     );

    //                     if (
    //                       remote &&
    //                       remote.stream.getVideoTracks().length &&
    //                       participant.video
    //                     ) {
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
    //                         />
    //                       );
    //                     }
    //                     return <h1>{participant.username}</h1>;
    //                   })()
    //                 )}
    //               </div>
    //             ))}
    //           </div>
    //         </div>

    //         <div className="flex justify-center items-center space-x-4 pt-3 rounded-lg">
    //           {/* <button
    //             className={`p-2 rounded-full  border border-input-border text-secondary-text`}
    //             onClick={toggleMic}
    //           >
    //             {micOn ? "Mic On" : "Mic Off"}
    //           </button> */}
    //           <button
    //             className={`p-2 rounded-full  border border-input-border text-secondary-text`}
    //             onClick={toggleVideo}
    //           >
    //             {videoOn ? "Video On" : "Video Off"}
    //           </button>
    //           {host.id.$oid === user.id.$oid && (
    //             <button
    //               className={`p-2 rounded-full  border border-input-border text-secondary-text`}
    //               onClick={toggleScreenShare}
    //             >
    //               {sharingScreen ? "Stop Screen Share" : "Screen Share"}
    //             </button>
    //           )}

    //           {host.id.$oid !== user.id.$oid && host.screen && (
    //             <button
    //               className={`p-2 rounded-full  border border-input-border text-secondary-text`}
    //               onClick={handleAccess}
    //             >
    //               {allowedAccess?.$oid === user.id.$oid
    //                 ? "Accessing"
    //                 : "Ask access"}
    //             </button>
    //           )}
    //           <button
    //             className={`p-2 rounded-full  border border-input-border text-secondary-text lg:hidden`}
    //             onClick={toggleMessages}
    //           >
    //             {messageOpen ? "Participants" : "Messages"}
    //           </button>
    //           <button
    //             className={`p-2 rounded-full  border border-input-border text-secondary-text`}
    //             onClick={handleLeaveRoom}
    //           >
    //             Leave
    //           </button>
    //         </div>
    //       </div>

    //       <div className="lg:hidden flex-1 h-full">
    //         {!messageOpen ? (
    //           <div className="p-4 bg-secondary-bg border rounded-lg shadow-lg h-[91%]">
    //             <h1 className="text-secondary-text text-2xl font-bold mb-4 text-center">
    //               PARTICIPANTS
    //             </h1>
    //             <div>
    //               {joinRequests.map((request) => (
    //                 <div key={request.id.$oid}>
    //                   <h1 className="text-secondary-text">{request.username}</h1>
    //                   <button
    //                     className="text-secondary-text"
    //                     onClick={() => acceptJoinRequest(request)}
    //                   >
    //                     Approve
    //                   </button>
    //                   <button
    //                     className="text-secondary-text"
    //                     onClick={() => rejectJoinRequest(request)}
    //                   >
    //                     Reject
    //                   </button>
    //                 </div>
    //               ))}
    //             </div>

    //             {participants.length > 0 && (
    //               <div>
    //                 {participants.map((participant) => (
    //                   <h3
    //                     key={participant.id.$oid}
    //                     className="font-medium text-secondary-text"
    //                   >
    //                     {participant.username}
    //                   </h3>
    //                 ))}
    //               </div>
    //             )}
    //           </div>
    //         ) : (
    //           <div className="rounded-lg h-full">
    //             <Messages
    //               messages={messages}
    //               sendMessage={sendMessage}
    //               user={user}
    //               code={code}
    //             />
    //           </div>
    //         )}
    //       </div>

    //       <div className="rounded-lg flex-1 hidden lg:block">
    //         <Messages
    //           messages={messages}
    //           sendMessage={sendMessage}
    //           user={user}
    //           code={code}
    //         />
    //       </div>
    //     </div>
    //   </div>
    <h1>waiting</h1>
  );
}

export default Room;
