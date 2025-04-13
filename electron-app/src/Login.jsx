"use client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Cookies from "js-cookie";

//TODO: add an option to go to the register page
//TODO: button to see password

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleClick = async () => {
    if (!email || !password) {
      setError("Please fill all the fields");
      return;
    }

    const data = JSON.stringify({
      email,
      password,
    });

    setEmail("");
    setPassword("");

    setLoading(true);
    try {
      const response = await fetch(
        `https://telesync-backend-production.up.railway.app/auth/login`,
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
        setError(result.message || "Login failed. Please try again.");
        setLoading(false);
        return;
      }

      const accessToken = result.access_token;
      const refreshToken = result.refresh_token;

      if (accessToken) Cookies.set("access_token", accessToken);
      if (refreshToken) Cookies.set("refresh_token", refreshToken);

      setSuccess(true);
      setLoading(false);

      navigate("/");
    } catch (err) {
      console.log(err);
      setLoading(false);
      setError("Something went wrong during login. Please try again later");
    }
  };
  return (
    <div className="flex items-center justify-center min-h-screen bg-sky-600">
      <div className="bg-white bg-opacity-30 backdrop-blur-xl border border-white border-opacity-40 p-8 rounded-3xl shadow-2xl w-96 items-center justify-center flex flex-col">
        <h1 className="text-3xl text-gray-600 mb-6 mt-4">LOGIN</h1>

        {error && <div className="text-red-600 text-sm mb-4">{error}</div>}
        {success && (
          <div className="text-green-600 text-sm mb-4">
            Registration Successful!
          </div>
        )}
        <input
          className="mb-4 p-2 text-gray-600 bg-transparent w-full border-b border-gray-300 focus:outline-none placeholder:text-gray-600"
          placeholder="Enter email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="mb-4 p-2 text-gray-600 w-full bg-transparent border-b border-gray-300 focus:outline-none placeholder:text-gray-600"
          placeholder="Enter password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="py-3 px-10 m-2 w-full rounded-full bg-sky-800 text-white hover:bg-sky-900 transition duration-300 ease-in-out"
          onClick={handleClick}
          disabled={loading}
        >
          Login
        </button>
        <a href="/register">Register</a>
      </div>
    </div>
  );
}
