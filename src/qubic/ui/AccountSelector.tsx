'use client';

import React from "react";

interface Option {
  label: string;
  value: string;
}

interface AccountSelectorProps {
  label?: string;
  options: Option[];
  selected: number | string;
  setSelected: (value: number | string) => void;
}

const AccountSelector: React.FC<AccountSelectorProps> = ({ label, options, selected, setSelected }) => {
  return (
    <div className="mt-2">
      {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map((option, index) => (
          <option key={index} value={index}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default AccountSelector;

