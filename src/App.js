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
    console.clear();
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
      console.log("Parsed rows:", rows);
      if (rows.length === 0) {
        alert("No rows found in file.");
        return;
      }

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
        console.log("Assigning row:", row);
        const userIndex = Math.floor(index / chunkSize);
        return {
        file_id,
        upload_index: index, // store the order of the spreadsheet
        sku: row[0],
          on_hand: parseInt(row[1]),
          description: row[3] || "",
          assigned_to: selectedUsers[userIndex] || selectedUsers[selectedUsers.length - 1],
        };
      });

      const { error: insertErr } = await supabase.from("entries").insert(assignedEntries);
      console.log("Inserting entries:", assignedEntries);
      if (insertErr) {
        console.error("Entries insert error:", insertErr);
        alert("Upload failed: " + insertErr.message);
        return;
      }

      loadEntries(file_id);
    };
    reader.readAsBinaryString(file);
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
        .select("*", { count: "exact" })
        .order("upload_index", { ascending: true })
        .range(from, to);

      if (userRole === "admin") {
        query = query.eq("file_id", id);
      } else {
        query = query.eq("file_id", id).eq("assigned_to", currentUser);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error loading entries:", error);
        break;
      }

      if (data.length > 0) {
        allData.push(...data);
      }

      if (data.length < chunkSize) {
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
    const printWindow = window.open("", "_blank", "width=800,height=600");
    const content = `
      <html>
        <head><title>My Assigned Rows</title></head>
        <body>
          <h2>Assigned SKUs for ${currentUser}</h2>
          <table border="1" cellspacing="0" cellpadding="6">
            <thead><tr><th>SKU</th><th>Physical Count</th></tr></thead>
            <tbody>
              ${myEntries.map(e => `
                <tr>
                  <td>${e.sku}</td>
                  <td>_____________</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
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
    <div className="p-6 w-full space-y-4">
      <div className="flex justify-between">
        <div className="text-gray-700 text-sm">Logged in as: {currentUser} ({userRole})</div>
        <Button onClick={() => supabase.auth.signOut()}>Logout</Button>
      </div>

      {userRole === "admin" && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Upload Inventory File</h2>
          <input type="file" onChange={handleUpload} className="mb-2" />
          <div className="mb-4">
            <label className="block mb-1">Select Active Users:</label>
            <select
              multiple
              value={selectedUsers}
              onChange={(e) =>
                setSelectedUsers(Array.from(e.target.selectedOptions, (opt) => opt.value))
              }
              className="border rounded p-2 w-full"
            >
              {userList.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

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

      {entries.length > 0 ? (
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
                    {entry.assigned_to === currentUser || userRole === "admin" ? (
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
      ) : (
        <p className="text-gray-500">No report selected or no entries available yet.</p>
      )}
    </div>
  );
}
