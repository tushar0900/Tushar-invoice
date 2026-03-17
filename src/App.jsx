import { Routes, Route, Navigate } from "react-router-dom";
import Signup from "./signup";
import Login from "./login";
import Invoice from "./invoice";

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/invoice" element={<Invoice />} />
      </Routes>
    </>
  );
}

export default App;
