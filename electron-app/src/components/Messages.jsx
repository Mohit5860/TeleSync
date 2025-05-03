import { useEffect, useRef, useState } from "react";

function Messages({ messages, handleSendMessage }) {
  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop =
        messageContainerRef.current.scrollHeight;
    }
  }, [messages]);
  return (
    <>
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
            <div key={message.id} className="bg-message-bg p-2 m-2 rounded-lg">
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
            className="py-2 w-full px-1 rounded-l-lg bg-secondary-bg text-input-text border border-input-border placeholder-input-placeholder focus:border-input-focus-border focus:text-input-focus-text focus:outline-none"
            placeholder="Type a message..."
          />
          <button
            onClick={handleSendMessage}
            className=" px-1 bg-secondary-bg border border-input-border text-message-text rounded-r-lg"
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}

export default Messages;
