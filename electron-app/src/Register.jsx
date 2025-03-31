"use client";
import { useState } from "react";

//TODO: add link to login
//TODO: button to see the password
//TODO: emprove styling

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rePassword, setRePassword] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleClick = async () => {
    // checking for empty fields
    if (!username || !email || !password || !rePassword) {
      setError("Please fill all the fields");
      return;
    }

    // checking if the password match with the re-entered password
    if (rePassword !== password) {
      setError("Password do not match");
      return;
    }

    // setting previous error messages to null
    setError(null);

    // preparing data for sending
    const data = JSON.stringify({
      username,
      email,
      password,
    });

    // clearing all fields
    setUsername("");
    setEmail("");
    setPassword("");
    setRePassword("");

    try {
      // making a fetch request
      const response = await fetch(`http://127.0.0.1:3000/auth/register`, {
        method: "post",
        body: data,
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.message || "Registration failed. Please try again.");
        return;
      }

      setSuccess(true);
      console.log("Registration successful:", result.message);
    } catch (err) {
      console.log(err);
      setError(
        "Something went wrong during registeration please try again later"
      );
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
      <div className="flex flex-col items-center bg-white p-10 rounded-3xl shadow-2xl w-96">
        <h1 className="text-3xl font-semibold text-gray-800 mb-6">Register</h1>

        {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
        {success && (
          <div className="text-green-600 text-sm mb-4">
            Registration Successful!
          </div>
        )}

        <input
          className="mb-4 px-4 py-2 text-black w-full border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="Enter username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="mb-4 px-4 py-2 text-black w-full border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="Enter email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="mb-4 px-4 py-2 text-black w-full border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="Enter password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className="mb-6 px-4 py-2 text-black w-full border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="Confirm password"
          type="password"
          value={rePassword}
          onChange={(e) => setRePassword(e.target.value)}
        />
        <button
          className="w-full py-2 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition duration-300 ease-in-out"
          onClick={handleClick}
        >
          Register
        </button>
        <a href="/login">Login</a>
      </div>
    </div>
  );
}
