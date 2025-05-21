import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { useNavigate } from "react-router-dom";

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [code, setCode] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    const access_token = Cookies.get("access_token");
    if (access_token) setLoggedIn(true);
  }, []);

  const handleCreateRoom = async () => {
    const accessToken = Cookies.get("access_token");
    if (accessToken) {
      const data = JSON.stringify({
        access_token: accessToken,
      });

      try {
        const response = await fetch(
          `https://telesync-backend.onrender.com/room/create`,
          //`http://127.0.0.1:3000/room/create`,
          {
            method: "post",
            body: data,
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
          }
        );

        const result = await response.json();

        if (!result.success) {
          console.log("request failed");
          return;
        }

        console.log(result.code);
        console.log(`/room/${result.code}`);

        navigate(`/room/${result.code}`);
      } catch (err) {
        console.log(err);
      }
    }
  };

  const handleLogout = () => {
    Cookies.remove("access_token");
    Cookies.remove("refresh_token");
    navigate("/login");
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex justify-between px-8 py-4">
        <h1 className="text-3xl font-medium text-gray-600">TeleSync</h1>
        {loggedIn ? (
          <button
            className="px-6 py-2 text-lg font-medium text-gray-600 hover:text-indigo-800 transition duration-300 ease-in-out"
            onClick={handleLogout}
          >
            Logout
          </button>
        ) : (
          <a
            className="px-6 py-2 text-lg font-medium text-gray-600 hover:text-indigo-800 transition duration-300 ease-in-out"
            href="/login"
          >
            Login
          </a>
        )}
      </div>

      <div className="flex flex-col justify-center h-full px-4 items-center">
        <h2 className="text-4xl font-semibold text-gray-600 mb-6">
          Welcome to TeleSync
        </h2>
        <p className="text-lg text-gray-6003 mb-8 max-w-lg text-center">
          Create or join rooms to share your screen with others. It's simple and
          easy!
        </p>

        <div className="flex flex-wrap2 gap-4">
          <button
            className="px-5 py-3  bg-sky-600 text-white rounded-full shadow-lg hover:bg-sky-700 transition duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-sky-500"
            onClick={handleCreateRoom}
          >
            Create Room
          </button>

          <input
            className="px-5 py-3 w-52 border border-gray-500 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500"
            type="text"
            placeholder="Enter code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
            }}
          />
          <a
            href={
              code.trim() !== "" ? (loggedIn ? `/room/${code}` : "/login") : "#"
            }
            className={`py-3 ${
              code.trim() === ""
                ? "opacity-50 cursor-not-allowed"
                : "text-sky-600"
            }`}
          >
            Join
          </a>
        </div>
      </div>

      <footer className="py-4 text-center text-gray-600 mt-auto">
        <p>&copy; 2025 ScreenSync | All rights reserved</p>
      </footer>
    </div>
  );
}

export default App;
