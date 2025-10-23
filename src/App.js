import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";
import UploadScreen from "./UploadScreen";
import { generateMissingCountsPDF } from "./pdfUtils";

const Input = React.forwardRef((props, ref) => (
  <input
    {...props}
    ref={ref}
    className={`px-2 py-1 rounded border ${props.className || "border-gray-300"}`}
  />
));

const Button = (props) => (
  <button
    {...props}
    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
  />
);

export default function InventoryApp({ session }) {
  const { username, role } = session;
  const [userRole] = useState(role);
  const [currentUser] = useState(username);
  const [entries, setEntries] = useState([]);
  const [fileId, setFileId] = useState(null);
  const [reportList, setReportList] = useState([]);
  const [userList, setUserList] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const inputRefs = useRef([]);

  const isAdmin = userRole === "admin";

  useEffect(() => {
    loadReportList();
    loadUserList();
  }, []);

  const loadReportList = async () => {
    const { data, error } = await supabase
      .from("files")
      .select("id, created_at")
      .order("created_at", { ascending: false });
    if (!error) setReportList(data || []);
  };

  const loadUserList = async () => {
    const { data, error } = await supabase.from("users").select("username");
    if (!error) setUserList((data || []).map((u) => u.username));
  };

  const toIntOrNull = (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (s === "") return null;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? null : n;
  };

  const handleUploadSubmit = async (file, activeUsers) => {
    if (!file || activeUsers.length === 0) {
      alert("Please select file and users.");
      return;
    }
    setSelectedUsers(activeUsers);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const u8 = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(u8, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const rows = jsonData.slice(1);
      const filteredRows = rows.filter((row) => {
        const hasSku = row[0] && String(row[0]).trim() !== "";
        const hasOnHand = row[1] !== undefined && row[1] !== null && String(row[1]).trim() !== "";
        return hasSku && hasOnHand;
      });

      if (filteredRows.length === 0) {
        alert("No valid rows found in file.");
        return;
      }

      const { data: fileInsert, error: fileErr } = await supabase
        .from("files")
        .insert([{ uploaded_by: currentUser }])
        .select()
        .single();

      if (fileErr || !fileInsert) {
        alert("File upload error: " + (fileErr?.message || "unknown error"));
        return;
      }

      const newFileId = fileInsert.id;
      setFileId(newFileId);

      const chunkSize = Math.ceil(filteredRows.length / activeUsers.length);
      const assignedEntries = filteredRows.map((row, index) => {
        const userIndex = Math.floor(index / chunkSize);
        return {
          file_id: newFileId,
          upload_index: index,
          sku: String(row[0] ?? ""),
          on_hand: toIntOrNull(row[1]),
          count: toIntOrNull(row[2]),
          description: row[3] ? String(row[3]) : "",
          assigned_to: activeUsers[userIndex] || activeUsers[activeUsers.length - 1],
        };
      });

      const { error: insertErr } = await supabase.from("entries").insert(assignedEntries);
      if (insertErr) {
        alert("Upload failed: " + insertErr.message);
        return;
      }

      loadEntries(newFileId);

      // ✅ Confirmation popup
      alert("Upload successful!");
    };

    reader.readAsArrayBuffer(file);
  };

  const loadEntries = async (id) => {
    const allData = [];
    const chunkSize = 1000;
    let from = 0;
    let to = chunkSize - 1;
    let keepGoing = true;

    while (keepGoing) {
      let query = supabase
        .from("entries")
        .select("id, file_id, upload_index, sku, on_hand, description, count", { count: "exact" })
        .order("upload_index", { ascending: true })
        .range(from, to);

      if (isAdmin) {
        query = query.eq("file_id", id);
      } else {
        query = query.eq("file_id", id).eq("assigned_to", currentUser);
      }

      const { data, error } = await query;
      if (error) break;

      if (data && data.length > 0) {
        allData.push(...data);
      }

      if (!data || data.length < chunkSize) {
        keepGoing = false;
      } else {
        from += chunkSize;
        to += chunkSize;
      }
    }

    setEntries(allData);
    setFileId(id);
  };

  const handleInputChange = async (entryId, value, index) => {
    const newEntries = [...entries];
    const entry = newEntries.find((e) => e.id === entryId);
    entry.count = value === "" ? null : parseInt(value, 10);
    entry.entered_by = currentUser;
    setEntries(newEntries);

    await supabase.from("entries").update({ count: entry.count, entered_by: currentUser }).eq("id", entryId);
  };

  const getInputClass = (count, onHand) => {
    if (count === undefined || count === null || count === "") return "border-gray-300";
    const oh = onHand ?? 0;
    const diff = Math.abs(count - oh);
    if (diff === 0) return "border-green-500";
    if (diff <= 10) return "border-yellow-400";
    if (diff <= 20) return "border-orange-400";
    return "border-red-500";
  };

  const handleGenerateMismatchReport = () => {
    const mismatched = entries.filter((e) => e.count !== undefined && e.count !== null && e.count !== e.on_hand);
    const csvRows = ["SKU,On Hand,Count,Difference"];
    mismatched.forEach((e) => {
      const diff = (e.count ?? 0) - (e.on_hand ?? 0);
      csvRows.push(`${e.sku},${e.on_hand ?? ""},${e.count ?? ""},${diff}`);
    });
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Mismatch_Report_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMissingCounts = () => {
    const missing = entries.filter((e) => e.count === null || e.count === undefined);
    generateMissingCountsPDF(missing, currentUser);
  };
  

  const focusNextEditableInput = (startIndex) => {
    for (let i = startIndex + 1; i < entries.length; i++) {
      const next = inputRefs.current[i];
      if (next) {
        next.focus();
        break;
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload(); // ✅ force return to login screen
  };

  return (
    <div className="p-6 w-full space-y-4">
      <div className="flex justify-between">
        <div className="text-gray-700 text-sm">Logged in as: {currentUser} ({userRole})</div>
        <Button onClick={handleLogout}>Logout</Button>
      </div>

      {isAdmin && <UploadScreen users={userList.map((u) => ({ id: u, name: u }))} onSubmit={handleUploadSubmit} />}

      <div className="max-w-md mx-auto w-full">
        <label className="block mb-1 font-semibold text-gray-800">Select Report:</label>
        <select className="border rounded p-2 w-full" onChange={(e) => loadEntries(e.target.value)} defaultValue="">
          <option value="" disabled>-- Select a Report --</option>
          {reportList.map((r) => (
            <option key={r.id} value={r.id}>
              {new Date(r.created_at).toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      {entries.length > 0 ? (
        <>
          <div className="overflow-x-auto w-full max-w-full">
            <table className="w-full table-auto border border-gray-300 text-sm text-center whitespace-nowrap">
              <thead className="bg-gray-100">
                {isAdmin ? (
                  <tr>
                    <th className="border px-4 py-2 text-center">SKU</th>
                    <th className="border px-4 py-2 text-center">On Hand</th>
                    <th className="border px-4 py-2">Count</th>
                    <th className="border px-4 py-2 text-left">Description</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="border px-4 py-2 text-center">SKU</th>
                    <th className="border px-4 py-2">Count</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {entries.map((entry, index) =>
                  isAdmin ? (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="border px-4 py-2 font-semibold text-center">{entry.sku}</td>
                      <td className="border px-4 py-2 text-center">{entry.on_hand ?? 0}</td>
                      <td className="border px-4 py-2">
                        <Input
                          ref={(el) => (inputRefs.current[index] = el)}
                          type="number"
                          value={entry.count ?? ""}
                          onChange={(e) => handleInputChange(entry.id, e.target.value, index)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              focusNextEditableInput(index);
                            }
                          }}
                          className={`${getInputClass(entry.count, entry.on_hand)} w-full text-center`}
                        />
                      </td>
                      <td className="border px-4 py-2 text-left">{entry.description ?? ""}</td>
                    </tr>
                  ) : (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="border px-4 py-2 font-semibold text-center">{entry.sku}</td>
                      <td className="border px-4 py-2">
                        <Input
                          ref={(el) => (inputRefs.current[index] = el)}
                          type="number"
                          value={entry.count ?? ""}
                          onChange={(e) => handleInputChange(entry.id, e.target.value, index)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              focusNextEditableInput(index);
                            }
                          }}
                          className={`${getInputClass(entry.count, entry.on_hand)} w-full text-center`}
                        />
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mt-4">
            {!isAdmin && <Button onClick={handleDownloadMissingCounts}>Counts Needed</Button>}
            {isAdmin && (
              <>
                <Button onClick={handleDownloadMissingCounts}>Counts Needed</Button>
                <Button onClick={handleGenerateMismatchReport}>Mismatch Report</Button>
              </>
            )}
          </div>
        </>
      ) : (
        <p className="text-gray-500">No report selected or no entries available yet.</p>
      )}
    </div>
  );
}
