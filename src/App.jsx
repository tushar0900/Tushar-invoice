import { Routes, Route } from "react-router-dom";
import Customer from "./customerform";
import Invoice from "./invoice";

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Customer />} />
        <Route path="/invoice" element={<Invoice />} />
      </Routes>
    </>
  );
}

export default App;
