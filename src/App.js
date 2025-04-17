import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { supabase } from "./supabase";

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

  useEffect(() => {
    loadReportList();
    loadUserList();
  }, []);

  const loadReportList = async () => {
    const { data, error } = await supabase
      .from("files")
      .select("id, created_at")
      .order("created_at", { ascending: false });
    if (!error) {
      setReportList(data);
    }
  };

  const loadUserList = async () => {
    const { data, error } = await supabase.from("users").select("username");
    if (!error) {
      setUserList(data.map((u) => u.username));
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || selectedUsers.length === 0) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = evt.target.result;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const rows = jsonData.slice(1);

      const { data: fileInsert, error: fileErr } = await supabase
        .from("files")
        .insert([{ uploaded_by: currentUser }])
        .select()
        .single();

      if (fileErr || !fileInsert) {
        console.error("File upload error:", fileErr);
        return;
      }

      const file_id = fileInsert.id;
      setFileId(file_id);

      const chunkSize = Math.ceil(rows.length / selectedUsers.length);
      const assignedEntries = rows.map((row, index) => {
        const userIndex = Math.floor(index / chunkSize);
        return {
          file_id,
          sku: row[0],
          on_hand: parseInt(row[1]),
          description: row[3] || "",
          assigned_to: selectedUsers[userIndex] || selectedUsers[selectedUsers.length - 1],
        };
      });

      const { error: insertErr } = await supabase.from("entries").insert(assignedEntries);
      if (insertErr) {
        console.error("Entries insert error:", insertErr);
        return;
      }

      loadEntries(file_id);
    };
    reader.readAsBinaryString(file);
  };

  const loadEntries = async (id) => {
    const filter = userRole === "admin" ? { file_id: id } : { file_id: id, assigned_to: currentUser };
    const { data, error } = await supabase.from("entries").select("*").match(filter);

    if (error) {
      console.error("Error loading entries:", error);
      return;
    }

    setEntries(data);
    setFileId(id);
  };

  const handleInputChange = async (entryId, value, index) => {
    const newEntries = [...entries];
    const entry = newEntries.find((e) => e.id === entryId);
    entry.count = value === "" ? null : parseInt(value);
    entry.entered_by = currentUser;
    setEntries(newEntries);

    await supabase
      .from("entries")
      .update({ count: entry.count, entered_by: currentUser })
      .eq("id", entryId);
  };

  const getInputClass = (count, onHand) => {
    if (count === undefined || count === null || count === "") return "border-gray-300";
    const diff = Math.abs(count - onHand);
    if (diff === 0) return "border-green-500";
    if (diff <= 10) return "border-yellow-400";
    if (diff <= 20) return "border-orange-400";
    return "border-red-500";
  };

  const handleGenerateMismatchReport = () => {
    const mismatched = entries.filter(
      (e) => e.count !== undefined && e.count !== null && e.count !== e.on_hand
    );
    const csvRows = ["SKU,On Hand,Count,Difference,User"];
    mismatched.forEach((e) => {
      const diff = e.count - e.on_hand;
      csvRows.push(`${e.sku},${e.on_hand},${e.count},${diff},${e.assigned_to}`);
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
    const doc = new jsPDF();
    const missing = entries.filter((e) => e.count === null || e.count === undefined);
    const rows = missing.map((e, i) => [e.sku, "__________"]);

    doc.setFontSize(14);
    doc.text("Items Missing Physical Count", 14, 16);
    doc.autoTable({
      head: [["SKU", "Count"]],
      body: rows,
      startY: 20,
      theme: "grid",
      styles: { fontSize: 10, halign: "left", valign: "middle", cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 90 } },
      tableWidth: "auto",
    });
    doc.save(`Missing_Counts_${Date.now()}.pdf`);
  };

  const handlePrintMyRows = () => {
    const myEntries = entries.filter((e) => e.assigned_to === currentUser);
    const half = Math.ceil(myEntries.length / 2);
    const left = myEntries.slice(0, half);
    const right = myEntries.slice(half);
    const lines = [];
    for (let i = 0; i < half; i++) {
      const leftText = left[i] ? `${left[i].sku}`.padEnd(20) + "_____________" : "";
      const rightText = right[i] ? `${right[i].sku}`.padEnd(20) + "_____________" : "";
      lines.push(`${leftText.padEnd(50)}${rightText}`);
    }
    const printWindow = window.open("", "_blank");
    printWindow.document.write("<pre style='font-family: monospace;'>" + lines.join("\n") + "</pre>");
    printWindow.print();
    printWindow.close();
  };

  const focusNextEditableInput = (startIndex) => {
    for (let i = startIndex + 1; i < entries.length; i++) {
      if (entries[i]?.assigned_to === currentUser) {
        const next = inputRefs.current[i];
        if (next) {
          next.focus();
          break;
        }
      }
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex justify-between">
        <div className="text-gray-700 text-sm">Logged in as: {currentUser} ({userRole})</div>
        <Button onClick={() => supabase.auth.signOut()}>Logout</Button>
      </div>

      <div>
        <label className="block mb-1 font-semibold">Select Report:</label>
        <select
          className="border rounded p-2"
          onChange={(e) => loadEntries(e.target.value)}
          defaultValue=""
        >
          <option value="" disabled>
            -- Select a Report --
          </option>
          {reportList.map((r) => (
            <option key={r.id} value={r.id}>
              {new Date(r.created_at).toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      {entries.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full border mt-4">
              <thead>
                <tr>
                  <th className="border px-2 py-1">SKU</th>
                  {userRole === "admin" && <th className="border px-2 py-1">On Hand</th>}
                  <th className="border px-2 py-1">Count</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={entry.id}>
                    <td className="border px-2 py-1 font-semibold">{entry.sku}</td>
                    {userRole === "admin" && <td className="border px-2 py-1">{entry.on_hand}</td>}
                    <td className="border px-2 py-1">
                      {entry.assigned_to === currentUser ? (
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
                          className={getInputClass(entry.count, entry.on_hand)}
                        />
                      ) : (
                        entry.count ?? "NA"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-sm text-gray-600 mt-4">
            <strong>Legend:</strong> <span className="text-green-600">Green = Exact</span>,
            <span className="text-yellow-600"> Yellow = Small diff</span>,
            <span className="text-orange-600"> Orange = Med diff</span>,
            <span className="text-red-600"> Red = Large diff</span>
          </div>
        </>
      )}

      {userRole === "admin" && entries.length > 0 && (
        <div className="flex gap-2">
          <Button onClick={handleGenerateMismatchReport}>Generate Report</Button>
          <Button onClick={handleDownloadMissingCounts}>Download Missing Counts PDF</Button>
        </div>
      )}

      {userRole === "user" && entries.length > 0 && (
        <div className="flex gap-2">
          <Button onClick={handleDownloadMissingCounts}>Show Missing Counts</Button>
          <Button onClick={handlePrintMyRows}>Print My Rows</Button>
        </div>
      )}
    </div>
  );
}
