import React, { useState } from "react";

function UploadScreen({ users = [], onSubmit }) {
  const [file, setFile] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);

  const handleUserToggle = (id) => {
    setSelectedUsers((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => setSelectedUsers(users.map((u) => u.id));
  const handleClearAll = () => setSelectedUsers([]);

  const handleSubmit = () => {
    if (!file) {
      alert("Please select a file first.");
      return;
    }
    if (selectedUsers.length === 0) {
      alert("Please select at least one user.");
      return;
    }
    onSubmit(file, selectedUsers);
  };

  return (
    <div className="max-w-4xl mx-auto w-full">
      <div className="bg-white shadow-sm border rounded-2xl p-6">
        <h2 className="text-xl font-semibold mb-1">Upload Inventory File</h2>
        <p className="text-gray-500 mb-4">Step 1: Choose a file. Step 2: Select users. Step 3: Submit.</p>

        {/* File input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">File</label>
          <div className="border-2 border-dashed rounded-xl p-4 hover:bg-gray-50 transition">
          <input
  type="file"
  accept=".csv,.xls,.xlsx,.xml,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/xml"
  onChange={(e) => setFile(e.target.files[0])}
  className="block w-full text-sm text-gray-700"
/>

            {file && (
              <div className="text-xs text-gray-600 mt-2">
                Selected: <span className="font-medium">{file.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Users */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">Assign Users</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="border rounded-xl p-3 max-h-60 overflow-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {users.map((user) => (
              <label key={user.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(user.id)}
                  onChange={() => handleUserToggle(user.id)}
                />
                <span>{user.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSubmit}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

export default UploadScreen;
