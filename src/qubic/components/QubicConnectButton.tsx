'use client';

import React from "react";
import { Button } from "@heroui/react";
import { useQubicConnect } from "../context/QubicConnectContext";
import ConnectModal from "./ConnectModal";

interface QubicConnectButtonProps {
  className?: string;
  variant?: "flat" | "solid" | "bordered" | "light" | "ghost" | "shadow";
}

const QubicConnectButton: React.FC<QubicConnectButtonProps> = ({ 
  className = "", 
  variant = "flat" 
}) => {
  const { connected, wallet, showConnectModal, toggleConnectModal } = useQubicConnect();

  function truncateQubicAddress(address: string): string {
    if (!address || address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  }

  return (
    <>
      <Button 
        color={connected ? "success" : "danger"} 
        variant={variant}
        className={`border ${connected ? "border-success-500" : "border-red-500"} text-white font-bold italic relative overflow-hidden ${className}`}
        onPress={() => toggleConnectModal()}
        style={{
          textShadow: connected ? 'none' : '0 0 10px rgba(255,0,0,0.5), 0 0 5px rgba(0,0,255,0.5)',
          letterSpacing: '0.05em'
        }}
      >
        <span className="relative z-10">
          {connected && wallet?.publicKey 
            ? truncateQubicAddress(wallet.publicKey) 
            : "CONNECT"}
        </span>
        {!connected && (
          <span 
            className="absolute inset-0 z-0 opacity-50"
            style={{
              textShadow: '2px 2px 0px rgba(255,0,0,0.8), -2px -2px 0px rgba(0,0,255,0.8)',
              filter: 'blur(1px)'
            }}
          >
            CONNECT
          </span>
        )}
      </Button>
      <ConnectModal open={showConnectModal} onClose={() => toggleConnectModal()} darkMode={true} />
    </>
  );
};

export default QubicConnectButton;

